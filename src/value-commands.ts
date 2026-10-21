import { optionalValues, resolveRoster, seasonPoints, UsageError, type Options } from "./commands.ts";
import { derivePickOwnership, rosterPlayerIds, seasonAverage, standingsOrder, type PickOwnership } from "./domain.ts";
import { header, pts, shortTeam, table, teamLabel } from "./format.ts";
import { tradeImpact, type TradeImpact } from "./trade-impact.ts";
import { playerName, type PlayerDb } from "./players.ts";
import type { LeagueData, Session } from "./session.ts";
import type { Roster } from "./sleeper/schemas.ts";
import { pickKey, type ValueBook } from "./values.ts";
import { fantasyPosition, isStartable } from "./positions.ts";
import type { LeagueContext } from "./context.ts";

async function requireValues(session: Session): Promise<ValueBook> {
  const { book, note } = await optionalValues(session);
  if (!book) throw new UsageError(note);
  return book;
}

async function ownedPicks(session: Session, data: LeagueData, throughSeason?: string) {
  return derivePickOwnership({
    leagueSeason: data.ctx.season,
    rounds: data.ctx.draft.rounds ?? 0,
    rosters: data.rosters,
    tradedPicks: await session.tradedPicks(),
    drafts: data.drafts,
    throughSeason,
  });
}

function rosterValue(r: Roster, db: PlayerDb, book: ValueBook, startable: readonly string[]) {
  const byPos: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  let unvalued = 0;
  for (const id of rosterPlayerIds(r)) {
    const mv = book.byPlayer.get(id);
    const v = mv?.value;
    // FantasyCalc's position reflects fantasy usage (e.g. Travis Hunter: WR, not DB).
    const pos = mv?.player.position ?? fantasyPosition(db.get(id), startable) ?? "";
    if (v === undefined) unvalued++;
    else if (pos in byPos) byPos[pos]! += v;
  }
  return { byPos, players: Object.values(byPos).reduce((a, b) => a + b, 0), unvalued };
}

export async function valuesCommand(session: Session, who: string | undefined, opts: Options) {
  const data = await session.data();
  const { ctx, rosters } = data;
  const [db, book, { picks }] = await Promise.all([session.players(), requireValues(session), ownedPicks(session, data)]);
  const pickValue = (rosterId: number) =>
    picks.filter((p) => p.ownerRosterId === rosterId).reduce((sum, p) => sum + (book.picks.get(pickKey(p.season, p.round)) ?? 0), 0);

  if (opts.league) {
    const rows = standingsOrder(rosters)
      .map((r) => ({ r, v: rosterValue(r, db, book, ctx.roster.startablePositions), pk: pickValue(r.roster_id) }))
      .sort((a, b) => b.v.players + b.pk - (a.v.players + a.pk))
      .map(({ r, v, pk }, i) => [
        i + 1,
        shortTeam(ctx, r.roster_id),
        `${r.settings.wins}-${r.settings.losses}`,
        v.byPos.QB!,
        v.byPos.RB!,
        v.byPos.WR!,
        v.byPos.TE!,
        pk,
        v.players + pk,
      ]);
    return [
      header(ctx, "Dynasty market value by team"),
      "",
      table(["#", "Team", "W-L", "QB", "RB", "WR", "TE", "Picks", "Total"], rows),
      "",
      "Sums of market prices. Useful for spotting surpluses and needs, not a measure of lineup strength.",
      "Picks use generic round values for each season (no early/mid/late adjustment).",
      book.label,
    ].join("\n");
  }

  const r = await resolveRoster(session, who);
  const ids = rosterPlayerIds(r);
  const rows = ids
    .map((id) => ({ id, p: db.get(id), v: book.byPlayer.get(id) }))
    .sort((a, b) => (b.v?.value ?? 0) - (a.v?.value ?? 0))
    .slice(0, opts.limit ?? ids.length)
    .map(({ id, p, v }) => [
      playerName(db, id),
      v?.player.position ?? fantasyPosition(p, ctx.roster.startablePositions) ?? p?.position ?? "?",
      p?.team ?? "FA",
      p?.age ?? "",
      v?.value ?? "-",
      v ? `${v.player.position}${v.positionRank}` : "",
      v?.trend30Day ?? "",
    ]);
  const mine = picks.filter((p) => p.ownerRosterId === r.roster_id);
  const pickRows = mine.map((p) => [
    `${p.season} R${p.round}${p.originalRosterId === r.roster_id ? "" : ` (via ${shortTeam(ctx, p.originalRosterId)})`}`,
    book.picks.get(pickKey(p.season, p.round)) ?? "-",
  ]);
  const total = rosterValue(r, db, book, ctx.roster.startablePositions);
  return [
    header(ctx, `Market values — ${teamLabel(ctx, r.roster_id)}`),
    "",
    table(["Player", "Pos", "NFL", "Age", "Value", "Pos rank", "30d trend"], rows),
    "",
    table(["Pick", "Value"], pickRows),
    "",
    `Totals: players ${total.players} (QB ${total.byPos.QB}, RB ${total.byPos.RB}, WR ${total.byPos.WR}, TE ${total.byPos.TE}), ` +
      `picks ${pickValue(r.roster_id)}; ${total.unvalued} players have no market value.`,
    book.label,
  ].join("\n");
}

type TradeAsset = { label: string; value: number | null; holder: string; playerId?: string };

type ParsedPickSpec = {
  season: string;
  round: number;
  origSpec?: string | undefined;
};

function parsePickSpec(spec: string, db: PlayerDb): ParsedPickSpec | null {
  if (db.has(spec)) return null;
  const s = spec.trim();
  // Suffix: e.g. "2027 R1 (via Blake)", "2027 R2 (own)", "2027 1st", "2028 round 2 pick"
  const suffixMatch = s.match(
    /^(20\d{2})\s*(?:(?:R|round\s*)(\d+)|(\d+)(?:st|nd|rd|th))(?:\s*pick)?(?:\s*\(?(?:via|orig\.?|from)?\s*([^()]+?)\)?)?(?:\s*pick)?$/i,
  );
  if (suffixMatch) {
    const season = suffixMatch[1]!;
    const round = Number(suffixMatch[2] ?? suffixMatch[3]);
    let orig = suffixMatch[4]?.trim();
    if (orig) orig = orig.replace(/^(?:via|orig\.?|from)\s+/i, "").trim();
    return { season, round, origSpec: orig };
  }
  // Prefix: e.g. "Blake 2027 1st", "Team 2027 R1 pick"
  const prefixMatch = s.match(
    /^(.+?)\s+(20\d{2})\s*(?:(?:R|round\s*)(\d+)|(\d+)(?:st|nd|rd|th))(?:\s*pick)?$/i,
  );
  if (prefixMatch) {
    const orig = prefixMatch[1]!.trim();
    const season = prefixMatch[2]!;
    const round = Number(prefixMatch[3] ?? prefixMatch[4]);
    return { season, round, origSpec: orig };
  }
  return null;
}

async function resolvePickAsset(
  session: Session,
  spec: string,
  parsed: ParsedPickSpec,
  holderRosterId: number,
  isOwner: boolean,
  ctx: LeagueContext,
  allPicks: PickOwnership[],
  book: ValueBook,
): Promise<TradeAsset> {
  const holderLabel = isOwner ? "we" : shortTeam(ctx, holderRosterId);
  const candidatePicks = allPicks.filter(
    (p) => p.ownerRosterId === holderRosterId && p.season === parsed.season && p.round === parsed.round,
  );

  const formatPick = (p: PickOwnership) => {
    const orig = p.originalRosterId === p.ownerRosterId ? " (own)" : ` (via ${shortTeam(ctx, p.originalRosterId)})`;
    return `${p.season} R${p.round}${orig}`;
  };

  if (candidatePicks.length === 0) {
    const anyOwned = allPicks.filter((p) => p.ownerRosterId === holderRosterId);
    const inSeason = anyOwned.filter((p) => p.season === parsed.season);
    const note = inSeason.length > 0 ? ` (${inSeason.map(formatPick).join(", ")})` : "";
    throw new UsageError(
      `${isOwner ? "We do not own" : `${holderLabel} does not own`} any ${parsed.season} round ${parsed.round} pick${note}.`,
    );
  }

  let matched: PickOwnership | undefined;
  if (parsed.origSpec) {
    const expectedOrigId =
      parsed.origSpec.toLowerCase() === "own" ? holderRosterId : (await resolveRoster(session, parsed.origSpec)).roster_id;
    matched = candidatePicks.find((p) => p.originalRosterId === expectedOrigId);
    if (!matched) {
      throw new UsageError(
        `${isOwner ? "We do not own" : `${holderLabel} does not own`} a ${parsed.season} R${parsed.round} pick via ${shortTeam(ctx, expectedOrigId)}. ` +
          `${isOwner ? "We own" : `${holderLabel} owns`}: ${candidatePicks.map(formatPick).join(", ")}.`,
      );
    }
  } else {
    if (candidatePicks.length > 1) {
      throw new UsageError(
        `"${spec}" is ambiguous: ${isOwner ? "we own" : `${holderLabel} owns`} multiple ${parsed.season} R${parsed.round} picks (${candidatePicks.map(formatPick).join(", ")}). ` +
          `Specify the original team (e.g. "${parsed.season} R${parsed.round} (own)" or "${parsed.season} R${parsed.round} (via <team>)").`,
      );
    }
    matched = candidatePicks[0]!;
  }

  const key = pickKey(matched.season, matched.round);
  const origSuffix = matched.originalRosterId === matched.ownerRosterId ? " (own)" : ` (via ${shortTeam(ctx, matched.originalRosterId)})`;
  return {
    label: `${key} pick${origSuffix}`,
    value: book.picks.get(key) ?? null,
    holder: shortTeam(ctx, matched.ownerRosterId),
  };
}

function resolvePlayerAsset(
  spec: string,
  db: PlayerDb,
  ctx: LeagueContext,
  book: ValueBook,
  holderOf: Map<string, number>,
): { id: string; label: string; value: number | null; holderId?: number | undefined } {
  const q = spec.toLowerCase();
  const startable = [...db.keys()].filter((id) => isStartable(db.get(id), ctx.roster.startablePositions));
  const exact = db.has(spec) ? [spec] : startable.filter((id) => playerName(db, id).toLowerCase() === q);
  const matches = exact.length > 0 ? exact : startable.filter((id) => playerName(db, id).toLowerCase().includes(q));
  // Prefer players rostered in this league, then higher market value.
  const rank = (id: string) => [Number(holderOf.has(id)), book.byPlayer.get(id)?.value ?? 0] as const;
  matches.sort((a, b) => rank(b)[0] - rank(a)[0] || rank(b)[1] - rank(a)[1]);
  const best = matches[0];
  if (!best) throw new UsageError(`No player or pick matches "${spec}"`);
  const runnerUp = matches[1];
  if (exact.length !== 1 && runnerUp !== undefined && holderOf.has(runnerUp) === holderOf.has(best)) {
    throw new UsageError(`"${spec}" is ambiguous: ${matches.slice(0, 5).map((id) => `${playerName(db, id)} (${id})`).join(", ")}`);
  }
  const h = holderOf.get(best);
  return {
    id: best,
    label: `${playerName(db, best)} ${fantasyPosition(db.get(best), ctx.roster.startablePositions) ?? ""}-${db.get(best)?.team ?? "FA"}`,
    value: book.byPlayer.get(best)?.value ?? null,
    holderId: h,
  };
}

function parseAssets(spec: string): string[] {
  return spec
    .split(/[,+]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function tradeCommand(
  session: Session,
  give: string | undefined,
  get: string | undefined,
  counterparty?: string,
) {
  if (!give || !get) {
    throw new UsageError(
      'Usage: ff trade "<assets we give>" "<assets we get>" [--with <counterparty>]  e.g. ff trade "Player A, 2027 R2 (own)" "Player B"',
    );
  }
  const ownerRosterId = await session.ownerRosterId();
  const data = await session.data();
  const { ctx, rosters } = data;
  const [db, book, known] = await Promise.all([session.players(), requireValues(session), ownedPicks(session, data)]);
  const holderOf = new Map<string, number>();
  for (const r of rosters) for (const id of rosterPlayerIds(r)) holderOf.set(id, r.roster_id);

  // Only another roster can send us a player: free agents are waiver claims, not trade assets.
  const gettableHolder = (player: { label: string; holderId?: number | undefined }): number => {
    if (player.holderId === ownerRosterId) throw new UsageError(`Cannot get ${player.label}: already on our roster.`);
    if (player.holderId === undefined) {
      throw new UsageError(`Cannot get ${player.label}: free agent, not a trade asset. Claim free agents on waivers.`);
    }
    return player.holderId;
  };

  const rawGiveSpecs = parseAssets(give);
  const rawGetSpecs = parseAssets(get);
  const lastKnown = Number(known.seasons.at(-1));
  const pickSeasons = [...rawGiveSpecs, ...rawGetSpecs].flatMap((spec) => parsePickSpec(spec, db)?.season ?? []);
  const beyond = [...new Set(pickSeasons)].filter((s) => Number(s) > lastKnown).sort();
  const { picks } = beyond.length ? await ownedPicks(session, data, beyond.at(-1)) : known;

  // 1. Determine counterparty
  let targetRoster: Roster | undefined;
  if (counterparty) {
    targetRoster = await resolveRoster(session, counterparty);
    if (targetRoster.roster_id === ownerRosterId) {
      throw new UsageError("Trade counterparty cannot be our own roster.");
    }
  } else {
    // Infer counterparty from "we get" assets if possible
    const oppHolders = new Set<number>();
    for (const spec of rawGetSpecs) {
      const pick = parsePickSpec(spec, db);
      if (!pick) {
        const player = resolvePlayerAsset(spec, db, ctx, book, holderOf);
        oppHolders.add(gettableHolder(player));
      }
    }
    if (oppHolders.size > 1) {
      throw new UsageError(
        `Assets in "we get" belong to multiple teams: ${[...oppHolders].map((id) => shortTeam(ctx, id)).join(", ")}. A trade can only be with one counterparty.`,
      );
    }
    if (oppHolders.size === 1) {
      const oppRosterId = [...oppHolders][0]!;
      targetRoster = rosters.find((r) => r.roster_id === oppRosterId);
    }
  }

  if (!targetRoster) {
    throw new UsageError(
      'Cannot determine trade counterparty. Specify the counterparty with --with <team> (e.g. ff trade --with "Team" "<give>" "<get>").',
    );
  }

  // 2. Resolve "we give" assets
  const giveAssets: TradeAsset[] = await Promise.all(rawGiveSpecs.map(async (spec) => {
    const pick = parsePickSpec(spec, db);
    if (pick) {
      return resolvePickAsset(session, spec, pick, ownerRosterId, true, ctx, picks, book);
    }
    const player = resolvePlayerAsset(spec, db, ctx, book, holderOf);
    if (player.holderId !== ownerRosterId) {
      const where = player.holderId === undefined ? "free agent" : `held by ${shortTeam(ctx, player.holderId)}`;
      throw new UsageError(`Cannot give ${player.label}: not on our roster (${where}).`);
    }
    return {
      playerId: player.id,
      label: player.label,
      value: player.value,
      holder: shortTeam(ctx, ownerRosterId),
    };
  }));

  // 3. Resolve "we get" assets
  const getAssets: TradeAsset[] = await Promise.all(rawGetSpecs.map(async (spec) => {
    const pick = parsePickSpec(spec, db);
    if (pick) {
      return resolvePickAsset(session, spec, pick, targetRoster.roster_id, false, ctx, picks, book);
    }
    const player = resolvePlayerAsset(spec, db, ctx, book, holderOf);
    const holderId = gettableHolder(player);
    if (holderId !== targetRoster.roster_id) {
      throw new UsageError(
        `Cannot get ${player.label}: held by ${shortTeam(ctx, holderId)}, not ${shortTeam(ctx, targetRoster.roster_id)}.`,
      );
    }
    return {
      playerId: player.id,
      label: player.label,
      value: player.value,
      holder: shortTeam(ctx, targetRoster.roster_id),
    };
  }));

  const sum = (xs: TradeAsset[]) => xs.reduce((a, x) => a + (x.value ?? 0), 0);
  const side = (title: string, xs: TradeAsset[]) => [
    `${title} (${sum(xs)})`,
    table(["Asset", "Value", "On roster"], xs.map((x) => [x.label, x.value ?? "no value", x.holder])),
  ];
  const diff = sum(getAssets) - sum(giveAssets);
  const missing = [...giveAssets, ...getAssets].filter((x) => x.value === null).map((x) => x.label);
  const ownerPicks = picks.filter((p) => p.ownerRosterId === ownerRosterId);
  const impact = await impactSection(session, db, ownerRosterId, targetRoster, giveAssets, getAssets);

  return [
    header(ctx, `Trade check: with ${teamLabel(ctx, targetRoster.roster_id)} (market value only)`),
    "",
    ...side("We give", giveAssets),
    "",
    ...side("We get", getAssets),
    "",
    `Net market value for us: ${diff >= 0 ? "+" : ""}${diff} (${sum(giveAssets) ? ((diff / sum(giveAssets)) * 100).toFixed(0) : "n/a"}% of what we give).`,
    missing.length ? `No market value for: ${missing.join(", ")} — the sum understates those assets.` : null,
    beyond.length
      ? `${beyond.join(", ")} picks: no pick in that season has been traded, so each team holds its own. Sleeper does not publish the tradeable horizon; confirm in the app.`
      : null,
    "Caveats: market prices only. Consolidating several pieces into one star usually costs a premium; judge roster fit",
    "in this Superflex/TE-premium format separately. Drops and lineup change are below.",
    ownerPicks.length
      ? `Our picks: ${ownerPicks
          .map((p) => `${p.season} R${p.round}${p.originalRosterId === p.ownerRosterId ? "" : ` (via ${shortTeam(ctx, p.originalRosterId)})`}`)
          .join(", ")}`
      : null,
    book.label,
    "",
    ...impact,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** Both teams' roster counts and best lineups before and after the trade, from Sleeper data only. */
async function impactSection(
  session: Session,
  db: PlayerDb,
  ownerRosterId: number,
  target: Roster,
  give: TradeAsset[],
  get: TradeAsset[],
): Promise<string[]> {
  const { ctx, league, rosters } = await session.data();
  const { weeks, points } = await seasonPoints(session);
  const lastScored = league.settings.last_scored_leg ?? 0;
  const avg = (id: string) => seasonAverage(points.get(id), weeks, lastScored).avg;
  const injured = new Set(rosters.flatMap((r) => r.reserve));
  const ids = (xs: TradeAsset[]) => xs.flatMap((x) => x.playerId ?? []);
  const ours = rosters.find((r) => r.roster_id === ownerRosterId)!;
  const sides = [
    tradeImpact({ ctx, db, roster: ours, sent: ids(give), received: ids(get), injured, avg }),
    tradeImpact({ ctx, db, roster: target, sent: ids(get), received: ids(give), injured, avg }),
  ];
  const name = (s: TradeImpact) => (s.rosterId === ownerRosterId ? "us" : shortTeam(ctx, s.rosterId));
  const signed = (n: number) => `${n >= 0 ? "+" : ""}${pts(n)}`;
  const changes = (s: TradeImpact) => {
    const started = (xs: typeof s.lineup.before) => new Map(xs.flatMap((x) => (x.id ? [[x.id, x] as const] : [])));
    const before = started(s.lineup.before);
    const after = started(s.lineup.after);
    const fmt = (x: { slot: string; id: string | null; points: number }) => `${playerName(db, x.id!)} (${x.slot} ${pts(x.points)})`;
    const out = [...before.values()].filter((x) => !after.has(x.id!)).map(fmt);
    const into = [...after.values()].filter((x) => !before.has(x.id!)).map(fmt);
    return `${name(s)}: ${out.length || into.length ? `out ${out.join(", ") || "none"}; in ${into.join(", ") || "none"}` : "no change"}`;
  };
  const unscored = sides.flatMap((s) => (s.unscored.length ? [`${name(s)}: ${s.unscored.map((id) => playerName(db, id)).join(", ")}`] : []));
  return [
    "Roster and lineup impact (Sleeper data; separate from market value)",
    table(
      ["Team", "Active", "IR", "Drops needed", "Best lineup", "After", "Change"],
      sides.map((s) => [
        name(s),
        `${s.active.before}→${s.active.after}/${s.active.limit}`,
        `${s.ir.after}/${s.ir.limit}`,
        s.drops,
        pts(s.lineup.beforeTotal),
        pts(s.lineup.afterTotal),
        signed(s.lineup.afterTotal - s.lineup.beforeTotal),
      ]),
    ),
    `Starter changes — ${sides.map(changes).join(" · ")}`,
    unscored.length ? `Unscored (no recorded points this season; left out, not counted as 0): ${unscored.join(" · ")}` : null,
    "Lineups use historical league-scored averages (Sleeper players_points, 0.0 weeks skipped), not a projection, before any drops.",
    "Received players count as active: Sleeper's placement of a traded IR player is unverified. IR and taxi players are left out of lineups.",
  ].filter((l): l is string => l !== null);
}
