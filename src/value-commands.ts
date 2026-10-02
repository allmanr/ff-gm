import { optionalValues, resolveRoster, UsageError, type Options } from "./commands.ts";
import { derivePickOwnership, rosterPlayerIds, standingsOrder } from "./domain.ts";
import { header, shortTeam, table, teamLabel } from "./format.ts";
import { playerName, type PlayerDb } from "./players.ts";
import type { LeagueData, Session } from "./session.ts";
import type { Roster } from "./sleeper/schemas.ts";
import { pickKey, type ValueBook } from "./values.ts";
import { fantasyPosition, isStartable } from "./positions.ts";

async function requireValues(session: Session): Promise<ValueBook> {
  const { book, note } = await optionalValues(session);
  if (!book) throw new UsageError(note);
  return book;
}

async function ownedPicks(session: Session, data: LeagueData) {
  return derivePickOwnership({
    leagueSeason: data.ctx.season,
    rounds: data.ctx.draft.rounds ?? 0,
    rosters: data.rosters,
    tradedPicks: await session.tradedPicks(),
    drafts: data.drafts,
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

type TradeAsset = { label: string; value: number | null; holder: string };

function parseAssets(spec: string): string[] {
  return spec
    .split(/[,+]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function tradeCommand(session: Session, give: string | undefined, get: string | undefined) {
  if (!give || !get) {
    throw new UsageError('Usage: ff trade "<assets we give>" "<assets we get>"  e.g. ff trade "Player A, 2027 R2" "Player B"');
  }
  const ownerRosterId = await session.ownerRosterId();
  const data = await session.data();
  const { ctx, rosters } = data;
  const [db, book, { picks }] = await Promise.all([session.players(), requireValues(session), ownedPicks(session, data)]);
  const holderOf = new Map<string, number>();
  for (const r of rosters) for (const id of rosterPlayerIds(r)) holderOf.set(id, r.roster_id);

  const resolve = (spec: string): TradeAsset => {
    // Picks need an explicit round marker ("2027 R2", "2027 2nd", "2027 round 2") so a 5-digit
    // Sleeper player ID is never read as a pick.
    const pick = db.has(spec) ? null : spec.match(/^(20\d{2})\s*(?:(?:R|round\s*)(\d)|(\d)(?:st|nd|rd|th))$/i);
    if (pick) {
      const [, season, roundA, roundB] = pick;
      const key = pickKey(season!, Number(roundA ?? roundB));
      return { label: `${key} pick`, value: book.picks.get(key) ?? null, holder: "" };
    }
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
      label: `${playerName(db, best)} ${fantasyPosition(db.get(best), ctx.roster.startablePositions) ?? ""}-${db.get(best)?.team ?? "FA"}`,
      value: book.byPlayer.get(best)?.value ?? null,
      holder: h === undefined ? "free agent" : shortTeam(ctx, h),
    };
  };

  const giveAssets = parseAssets(give).map(resolve);
  const getAssets = parseAssets(get).map(resolve);
  const sum = (xs: TradeAsset[]) => xs.reduce((a, x) => a + (x.value ?? 0), 0);
  const side = (title: string, xs: TradeAsset[]) => [
    `${title} (${sum(xs)})`,
    table(["Asset", "Value", "On roster"], xs.map((x) => [x.label, x.value ?? "no value", x.holder])),
  ];
  const diff = sum(getAssets) - sum(giveAssets);
  const missing = [...giveAssets, ...getAssets].filter((x) => x.value === null).map((x) => x.label);
  const ownerPicks = picks.filter((p) => p.ownerRosterId === ownerRosterId);

  return [
    header(ctx, "Trade check (market value only)"),
    "",
    ...side("We give", giveAssets),
    "",
    ...side("We get", getAssets),
    "",
    `Net market value for us: ${diff >= 0 ? "+" : ""}${diff} (${sum(giveAssets) ? ((diff / sum(giveAssets)) * 100).toFixed(0) : "n/a"}% of what we give).`,
    missing.length ? `No market value for: ${missing.join(", ")} — the sum understates those assets.` : null,
    "Caveats: market prices only. Consolidating several pieces into one star usually costs a premium; judge roster fit,",
    "lineup impact in this Superflex/TE-premium format, and required drops separately.",
    ownerPicks.length ? `Our picks: ${ownerPicks.map((p) => `${p.season} R${p.round}`).join(", ")}` : null,
    book.label,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
