import { join } from "node:path";
import { assertPrivatePath, safeDirectory, safeWrite } from "./private-files.ts";
import { paths } from "./config.ts";
import { renderConstitution } from "./constitution.ts";
import type { LeagueContext } from "./context.ts";
import { derivePickOwnership, rosterPlayerIds, rosterPoints, standingsOrder, weeklyPlayerPoints, type PickOwnership, type WeeklyPoints } from "./domain.ts";
import { ctTime, header, pts, shortTeam, table, teamLabel } from "./format.ts";
import { playerLabel, playerName, type PlayerDb } from "./players.ts";
import type { Session } from "./session.ts";
import type { ValueBook } from "./values.ts";
import { byeWeeks } from "./schedule.ts";
import { ppg, type StatBook } from "./stats.ts";
import type { Player, Roster, Transaction } from "./sleeper/schemas.ts";
import { eligiblePositions, fantasyPosition, isStartable } from "./positions.ts";

export type Options = {
  week?: number;
  pos?: string[];
  limit?: number;
  all?: boolean;
  type?: "add" | "drop";
  hours?: number;
  write?: boolean;
  league?: boolean;
  sort?: "value" | "ppg";
};

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** Scored stats are supplementary: if nflverse is unavailable, show "-" and say why. */
export async function optionalStats(session: Session): Promise<{ book: StatBook | null; note: string }> {
  try {
    const book = await session.stats();
    return { book, note: book.label };
  } catch (err) {
    return { book: null, note: `Player stats unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Market values are supplementary: if FantasyCalc is unavailable, show "-" and say why. */
export async function optionalValues(session: Session): Promise<{ book: ValueBook | null; note: string }> {
  try {
    const book = await session.values();
    return { book, note: book.label };
  } catch (err) {
    return { book: null, note: `Market values unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ---------- context ----------

export async function contextCommand(session: Session, opts: Options): Promise<string> {
  const { ctx } = await session.data();
  const md = renderConstitution(ctx);
  if (opts.write !== false) {
    safeDirectory(paths.privateDir);
    for (const file of ["LEAGUE_CONSTITUTION.md", "context.json"]) assertPrivatePath(join(paths.privateDir, file), false);
    safeWrite(join(paths.privateDir, "LEAGUE_CONSTITUTION.md"), md);
    safeWrite(join(paths.privateDir, "context.json"), `${JSON.stringify(ctx, null, 2)}\n`);
  }
  return md;
}

// ---------- standings ----------

export async function standingsCommand(session: Session): Promise<string> {
  const { ctx, rosters } = await session.data();
  const rows = standingsOrder(rosters).map((r, i) => {
    const p = rosterPoints(r);
    const s = r.settings;
    const div = s.division ? (ctx.divisions[s.division] ?? String(s.division)) : "";
    return [i + 1, teamLabel(ctx, r.roster_id), `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}`, pts(p.pf), pts(p.pa), pts(p.maxPf), div];
  });
  return [header(ctx, "Standings"), "", table(["#", "Team", "W-L", "PF", "PA", "Max PF", "Division"], rows)].join("\n");
}

// ---------- rosters ----------

export async function rostersCommand(session: Session): Promise<string> {
  const { ctx, rosters, drafts } = await session.data();
  const [db, traded] = await Promise.all([session.players(), session.tradedPicks()]);
  const { seasons, picks } = derivePickOwnership({
    leagueSeason: ctx.season,
    rounds: ctx.draft.rounds ?? 0,
    rosters,
    tradedPicks: traded,
    drafts,
  });
  const rows = standingsOrder(rosters).map((r) => {
    const byPos = (pos: string) => r.players.filter((id) => fantasyPosition(db.get(id), ctx.roster.startablePositions) === pos);
    const qbs = byPos("QB")
      .map((id) => `${db.get(id)?.last_name ?? id}${db.get(id)?.team ? "" : "(FA)"}`)
      .join(", ");
    const ages = r.players
      .map((id) => db.get(id))
      .filter((p) => isStartable(p, ctx.roster.startablePositions) && typeof p?.age === "number")
      .map((p) => p!.age!);
    const avgAge = ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : "-";
    const firsts = seasons.map((s) => picks.filter((p) => p.season === s && p.round === 1 && p.ownerRosterId === r.roster_id).length);
    const s = r.settings;
    return [
      shortTeam(ctx, r.roster_id),
      `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}`,
      pts(rosterPoints(r).pf),
      `${byPos("QB").length}: ${qbs}`,
      byPos("RB").length,
      byPos("WR").length,
      byPos("TE").length,
      avgAge,
      firsts.join("/"),
    ];
  });
  return [
    header(ctx, "All rosters"),
    "",
    table(["Team", "W-L", "PF", "QBs", "RB", "WR", "TE", "Avg age", `1sts ${seasons.map((s) => s.slice(2)).join("/")}`], rows),
    "",
    `Pick seasons ${seasons.join(", ")} come from traded-pick data; Sleeper does not publish the tradeable horizon.`,
  ].join("\n");
}

// ---------- roster ----------

export async function resolveRoster(session: Session, who: string | undefined): Promise<Roster> {
  const { ctx, rosters } = await session.data();
  let rosterId: number | undefined;
  if (!who || who === "me") {
    rosterId = await session.ownerRosterId();
  } else if (/^\d+$/.test(who) && Number(who) <= rosters.length) {
    rosterId = Number(who);
  } else {
    const q = who.toLowerCase();
    const hits = ctx.teams.filter(
      (t) => t.managerName.toLowerCase().includes(q) || (t.teamName ?? "").toLowerCase().includes(q),
    );
    if (hits.length !== 1) {
      throw new UsageError(
        hits.length === 0
          ? `No team matches "${who}". Teams: ${ctx.teams.map((t) => `${t.rosterId}=${t.managerName}`).join(", ")}`
          : `"${who}" matches several teams: ${hits.map((t) => `${t.rosterId}=${t.managerName}`).join(", ")}`,
      );
    }
    rosterId = hits[0]!.rosterId;
  }
  const r = rosters.find((x) => x.roster_id === rosterId);
  if (!r) throw new UsageError(`No roster ${rosterId}`);
  return r;
}

async function seasonPoints(session: Session): Promise<{ weeks: number[]; points: WeeklyPoints }> {
  const weeks = await session.playedWeeks();
  const all = await Promise.all(weeks.map(async (week) => ({ week, matchups: await session.matchups(week) })));
  return { weeks, points: weeklyPlayerPoints(all) };
}

export async function rosterCommand(session: Session, who: string | undefined): Promise<string> {
  const { ctx, rosters, drafts, league } = await session.data();
  const r = await resolveRoster(session, who);
  const [db, { weeks, points }, traded, values, byes] = await Promise.all([
    session.players(),
    seasonPoints(session),
    session.tradedPicks(),
    optionalValues(session),
    // Bye weeks are supplementary; without the schedule the column shows "-".
    session.schedule().then(
      (s) => byeWeeks(s.games),
      () => null,
    ),
  ]);
  const lastScored = league.settings.last_scored_leg ?? 0;

  const line = (slot: string, id: string) => {
    if (id === "0") return [slot, "(empty)", "", "", "", "", "", ...weeks.map(() => ""), "", "", ""];
    const p = db.get(id);
    const wk = points.get(id);
    const vals = weeks.map((w) => wk?.get(w)?.points);
    const scored = weeks.filter((w) => w <= lastScored).map((w) => wk?.get(w)?.points).filter((v): v is number => v !== undefined);
    const total = scored.reduce((a, b) => a + b, 0);
    return [
      slot,
      playerName(db, id),
      fantasyPosition(p, ctx.roster.startablePositions) ?? p?.position ?? "?",
      p?.team ?? "FA",
      p?.age ?? "",
      p?.injury_status ?? "",
      byes && p?.team ? (byes.get(p.team)?.join("/") ?? "?") : "-",
      ...vals.map((v) => pts(v)),
      scored.length ? pts(total) : "-",
      scored.length ? pts(total / scored.length) : "-",
      values.book?.byPlayer.get(id)?.value ?? "-",
    ];
  };

  const rows: (string | number)[][] = [];
  ctx.roster.starterSlots.forEach((s, i) => rows.push(line(s.slot, r.starters[i] ?? "0")));
  const placed = new Set([...r.starters, ...r.reserve, ...r.taxi]);
  const bench = r.players.filter((id) => !placed.has(id));
  const posOf = (id: string) => fantasyPosition(db.get(id), ctx.roster.startablePositions) ?? "";
  bench.sort((a, b) => posOf(a).localeCompare(posOf(b)));
  for (const id of bench) rows.push(line("BN", id));
  for (const id of r.reserve) rows.push(line("IR", id));
  for (const id of r.taxi) rows.push(line("TAXI", id));

  const weekHeaders = weeks.map((w) => (w > lastScored ? `W${w}*` : `W${w}`));
  const s = r.settings;
  const faabLeft = ctx.waivers.faabBudget === null ? null : ctx.waivers.faabBudget - (s.waiver_budget_used ?? 0);
  const { seasons, picks } = derivePickOwnership({
    leagueSeason: ctx.season,
    rounds: ctx.draft.rounds ?? 0,
    rosters,
    tradedPicks: traded,
    drafts,
  });
  const owned = picks.filter((p) => p.ownerRosterId === r.roster_id);

  return [
    header(ctx, `Roster — ${teamLabel(ctx, r.roster_id)}`),
    `Record ${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""} · PF ${pts(rosterPoints(r).pf)} · FAAB left ${faabLeft === null ? "n/a" : `$${faabLeft}`} · ${r.players.length} players`,
    "",
    table(["Slot", "Player", "Pos", "NFL", "Age", "Inj", "Bye", ...weekHeaders, "Total", "Avg", "Value"], rows),
    "",
    `Points are this league's scoring (Sleeper players_points), including bench weeks; "-" = not on a league roster that week.` +
      (weeks.some((w) => w > lastScored) ? " * = week in progress, excluded from totals." : ""),
    "",
    `Future picks (${seasons.join(", ")}): ${formatPicks(ctx, owned, r.roster_id)}`,
    "",
    values.note,
  ].join("\n");
}

function formatPicks(ctx: LeagueContext, owned: PickOwnership[], holder: number): string {
  if (owned.length === 0) return "none";
  return owned
    .map((p) => `${p.season} R${p.round}${p.originalRosterId === holder ? "" : ` (via ${shortTeam(ctx, p.originalRosterId)})`}`)
    .join(", ");
}

// ---------- picks ----------

export async function picksCommand(session: Session, who: string | undefined): Promise<string> {
  const { ctx, rosters, drafts } = await session.data();
  const traded = await session.tradedPicks();
  const { seasons, picks } = derivePickOwnership({
    leagueSeason: ctx.season,
    rounds: ctx.draft.rounds ?? 0,
    rosters,
    tradedPicks: traded,
    drafts,
  });
  const targets = who ? [await resolveRoster(session, who)] : standingsOrder(rosters);
  const rows = targets.map((r) => [
    shortTeam(ctx, r.roster_id),
    ...seasons.map((s) => {
      const mine = picks.filter((p) => p.season === s && p.ownerRosterId === r.roster_id);
      return mine
        .map((p) => (p.originalRosterId === r.roster_id ? `${p.round}` : `${p.round}(${shortTeam(ctx, p.originalRosterId)})`))
        .join(" ") || "—";
    }),
    picks.filter((p) => p.ownerRosterId === r.roster_id).length,
  ]);
  return [
    header(ctx, "Future draft picks"),
    "",
    table(["Team", ...seasons, "Total"], rows),
    "",
    `Rounds owned per season; (name) = acquired from that team. ${ctx.draft.rounds} rounds per draft. ` +
      `Seasons shown come from traded-pick data; Sleeper does not publish the tradeable horizon.`,
  ].join("\n");
}

// ---------- free agents / trending ----------

export async function freeAgentsCommand(session: Session, opts: Options): Promise<string> {
  const { ctx, rosters } = await session.data();
  const [db, adds24, adds72, values, stats] = await Promise.all([
    session.players(),
    session.trending("add", 24),
    session.trending("add", 72),
    optionalValues(session),
    optionalStats(session),
  ]);
  const marketValue = (id: string) => values.book?.byPlayer.get(id)?.value ?? 0;
  const seasonPpg = (id: string) => ppg(stats.book?.byPlayer.get(id)) ?? -1;
  const rostered = new Set(rosters.flatMap((r) => rosterPlayerIds(r)));
  const positions = opts.pos?.length ? opts.pos : ctx.roster.startablePositions;
  for (const p of positions) {
    if (!ctx.roster.startablePositions.includes(p)) throw new UsageError(`${p} cannot be started in this league`);
  }
  const count24 = new Map(adds24.map((t) => [t.player_id, t.count]));
  const count72 = new Map(adds72.map((t) => [t.player_id, t.count]));
  // Sleeper keeps stale records (e.g. retired players still "Active" on a team). Keep anyone with a
  // current depth-chart spot, recent adds, market value, or three or fewer years in the league
  // (dynasty stashes); --all shows everything.
  const current = (p: Player) =>
    p.active !== false &&
    Boolean(p.team) &&
    (p.depth_chart_order != null ||
      count72.has(p.player_id) ||
      marketValue(p.player_id) > 0 ||
      (p.years_exp != null && p.years_exp <= 3));
  const candidates = [...db.values()]
    .filter((p) => !rostered.has(p.player_id))
    .filter((p) => eligiblePositions(p).some((x) => positions.includes(x)))
    .filter((p) => opts.all || current(p))
    .sort((a, b) =>
      opts.sort === "ppg"
        ? seasonPpg(b.player_id) - seasonPpg(a.player_id) || marketValue(b.player_id) - marketValue(a.player_id)
        : marketValue(b.player_id) - marketValue(a.player_id) || (a.search_rank ?? 1e9) - (b.search_rank ?? 1e9),
    )
    .slice(0, opts.limit ?? 25);
  // A starter's injury makes his direct backup a waiver target; scan every free agent, not just the listed ones.
  const injuredStarter = new Map<string, Player>();
  for (const p of db.values()) {
    if (p.active !== false && p.team && p.depth_chart_order === 1 && p.injury_status) {
      injuredStarter.set(`${p.team}|${p.depth_chart_position}`, p);
    }
  }
  const backups = [...db.values()]
    .filter((p) => !rostered.has(p.player_id) && current(p) && p.depth_chart_order === 2)
    .filter((p) => eligiblePositions(p).some((x) => positions.includes(x)))
    .flatMap((p) => {
      const s = injuredStarter.get(`${p.team}|${p.depth_chart_position}`);
      return s ? [`- ${playerName(db, p.player_id)} ${p.position}-${p.team}: backup to ${playerName(db, s.player_id)} (${s.injury_status})`] : [];
    });
  const rows = candidates.map((p) => [
    playerName(db, p.player_id),
    fantasyPosition(p, ctx.roster.startablePositions) ?? p.position ?? "?",
    p.team ?? "FA",
    p.age ?? "",
    p.injury_status ?? "",
    p.depth_chart_position && p.depth_chart_order ? `${p.depth_chart_position}${p.depth_chart_order}` : "",
    count24.get(p.player_id) ?? "",
    count72.get(p.player_id) ?? "",
    marketValue(p.player_id) || "-",
    ...(() => {
      const games = stats.book?.byPlayer.get(p.player_id);
      return [games?.length ?? 0, pts(ppg(games)), pts(ppg(games, 3))];
    })(),
    p.player_id,
  ]);
  return [
    header(ctx, `Free agents (${positions.join("/")})`),
    "",
    table(["Player", "Pos", "NFL", "Age", "Inj", "Depth", "Adds 24h", "Adds 72h", "Value", "G", "PPG", "L3", "Sleeper ID"], rows),
    "",
    ...(backups.length
      ? ["## Free-agent backups to injured starters", "", ...backups, "", "From Sleeper's depth charts, which can be stale or incomplete; confirm with team news.", ""]
      : []),
    (opts.sort === "ppg" && !stats.book
      ? "PPG sorting unavailable; sorted by market value where available."
      : opts.sort === "ppg"
      ? "Sorted by points per game in this league's scoring."
      : "Sorted by market value, then Sleeper search rank (a popularity proxy, not a projection).") +
      " PPG/L3 = league-scored points per game, season / last 3 games. Adds are across all Sleeper leagues (top 100 only). " +
      "Recently dropped players may still be on waivers.",
    opts.all
      ? "Showing all unrostered players."
      : "Filter: on an NFL team and on a depth chart, trending, valued, or in years 0–3. Use --all for everyone.",
    values.note,
    stats.note,
  ].join("\n");
}

export async function trendingCommand(session: Session, opts: Options): Promise<string> {
  const { ctx, rosters } = await session.data();
  const type = opts.type ?? "add";
  const hours = opts.hours ?? 24;
  const [db, trend] = await Promise.all([session.players(), session.trending(type, hours)]);
  const holder = new Map<string, number>();
  for (const r of rosters) for (const id of rosterPlayerIds(r)) holder.set(id, r.roster_id);
  const rows = trend
    .filter((t) => isStartable(db.get(t.player_id), ctx.roster.startablePositions))
    .slice(0, opts.limit ?? 25)
    .map((t) => {
      const p = db.get(t.player_id);
      const h = holder.get(t.player_id);
      return [
        playerName(db, t.player_id),
        fantasyPosition(p, ctx.roster.startablePositions) ?? p?.position ?? "?",
        p?.team ?? "FA",
        p?.injury_status ?? "",
        t.count,
        h === undefined ? "AVAILABLE" : shortTeam(ctx, h),
      ];
    });
  return [
    header(ctx, `Trending ${type}s, last ${hours}h (all Sleeper leagues)`),
    "",
    table(["Player", "Pos", "NFL", "Inj", type === "add" ? "Adds" : "Drops", "In this league"], rows),
  ].join("\n");
}

// ---------- transactions ----------

function defaultWeek(ctx: LeagueContext): number {
  return Math.max(1, ctx.nfl.week);
}

export function describeTransaction(ctx: LeagueContext, db: PlayerDb, t: Transaction): string {
  const when = ctTime(t.status_updated ?? t.created);
  const status = t.status === "complete" ? "" : ` [${t.status.toUpperCase()}]`;
  if (t.type === "trade") {
    const sides = t.roster_ids.map((rid) => {
      const gets: string[] = [];
      for (const [pid, to] of Object.entries(t.adds)) if (to === rid) gets.push(playerLabel(db, pid));
      for (const p of t.draft_picks) {
        if (p.owner_id === rid) gets.push(`${p.season} R${p.round} pick${p.roster_id === rid ? " (own)" : ` (orig. ${shortTeam(ctx, p.roster_id)})`}`);
      }
      for (const w of t.waiver_budget) if (w.receiver === rid) gets.push(`$${w.amount} FAAB`);
      // Players released to make roster room appear in drops but in no one's adds.
      const released = Object.entries(t.drops)
        .filter(([pid, from]) => from === rid && !(pid in t.adds))
        .map(([pid]) => playerLabel(db, pid));
      const drops = released.length ? `; drops ${released.join(", ")}` : "";
      return `${shortTeam(ctx, rid)} gets ${gets.length ? gets.join(", ") : "nothing"}${drops}`;
    });
    return `${when} · TRADE${status} · ${sides.join(" | ")}`;
  }
  const rid = t.roster_ids[0];
  const who = rid === undefined ? "?" : shortTeam(ctx, rid);
  const added = Object.keys(t.adds).map((pid) => `+${playerLabel(db, pid)}`);
  const dropped = Object.keys(t.drops).map((pid) => `−${playerLabel(db, pid)}`);
  const bid = t.type === "waiver" && t.settings?.waiver_bid !== undefined ? ` ($${t.settings.waiver_bid})` : "";
  const label = t.type === "free_agent" ? "FREE AGENT" : t.type.toUpperCase();
  return `${when} · ${label}${status} · ${who}: ${[...added, ...dropped].join(", ")}${bid}`;
}

export async function transactionsCommand(session: Session, opts: Options): Promise<string> {
  const { ctx } = await session.data();
  const week = opts.week ?? defaultWeek(ctx);
  const [db, txs] = await Promise.all([session.players(), session.transactions(week)]);
  const shown = txs
    .filter((t) => opts.all || t.status === "complete")
    .sort((a, b) => (b.status_updated ?? b.created) - (a.status_updated ?? a.created))
    .slice(0, opts.limit ?? 100);
  const lines = shown.map((t) => `- ${describeTransaction(ctx, db, t)}`);
  const hidden = txs.length - txs.filter((t) => opts.all || t.status === "complete").length;
  return [
    header(ctx, `Transactions, week ${week}`),
    "",
    lines.length ? lines.join("\n") : "(none)",
    hidden > 0 ? `\n${hidden} failed/pending transactions hidden (use --all).` : "",
    week === 1 ? "Week 1 also holds offseason transactions." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------- matchups ----------

export async function matchupsCommand(session: Session, opts: Options): Promise<string> {
  const { ctx, league } = await session.data();
  const week = opts.week ?? defaultWeek(ctx);
  const [db, ms] = await Promise.all([session.players(), session.matchups(week)]);
  const inProgress = week > (league.settings.last_scored_leg ?? 0);
  const groups = new Map<number, typeof ms>();
  for (const m of ms) {
    if (m.matchup_id == null) continue;
    groups.set(m.matchup_id, [...(groups.get(m.matchup_id) ?? []), m]);
  }
  const score = (m: (typeof ms)[number]) => m.custom_points ?? m.points ?? 0;
  const lines = [...groups.values()].map((pair) =>
    pair.map((m) => `${teamLabel(ctx, m.roster_id)} ${pts(score(m))}`).join("  vs  "),
  );
  const out = [header(ctx, `Matchups, week ${week}${inProgress ? " (in progress)" : ""}`), "", ...lines.map((l) => `- ${l}`)];

  if (ctx.owner.status === "verified") {
    const ownerRosterId = ctx.owner.rosterId;
    const mine = ms.find((m) => m.roster_id === ownerRosterId);
    // matchup_id is null for teams without a game (bye, eliminated); never pair two nulls.
    const opp =
      mine && mine.matchup_id != null
        ? ms.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id)
        : undefined;
    if (mine && !opp) out.push("", "## Your matchup: none this week (bye or eliminated)");
    if (mine && opp) {
      const rows = ctx.roster.starterSlots.map((s, i) => {
        const a = mine.starters[i];
        const b = opp.starters[i];
        return [
          s.slot,
          a && a !== "0" ? playerLabel(db, a) : "(empty)",
          pts(mine.starters_points[i]),
          b && b !== "0" ? playerLabel(db, b) : "(empty)",
          pts(opp.starters_points[i]),
        ];
      });
      out.push("", `## Your matchup: ${pts(score(mine))} – ${pts(score(opp))}`, "");
      out.push(table(["Slot", shortTeam(ctx, mine.roster_id), "Pts", shortTeam(ctx, opp.roster_id), "Pts"], rows));
    }
  }
  return out.join("\n");
}

// ---------- player ----------

export async function playerCommand(session: Session, query: string | undefined): Promise<string> {
  if (!query) throw new UsageError("Usage: ff player <name or Sleeper ID>");
  const { ctx, rosters } = await session.data();
  const db = await session.players();
  const q = query.toLowerCase();
  let matches = db.has(query)
    ? [db.get(query)!]
    : [...db.values()].filter(
        (p) => isStartable(p, ctx.roster.startablePositions) && playerName(db, p.player_id).toLowerCase().includes(q),
      );
  if (matches.length > 1) {
    const exact = matches.filter((p) => playerName(db, p.player_id).toLowerCase() === q);
    if (exact.length > 0) matches = exact;
  }
  if (matches.length === 0) throw new UsageError(`No startable player matches "${query}"`);
  if (matches.length > 1) {
    matches.sort((a, b) => (a.search_rank ?? 1e9) - (b.search_rank ?? 1e9));
    return [
      `"${query}" matches ${matches.length} players; use a Sleeper ID:`,
      ...matches.slice(0, 15).map((p) => `- ${p.player_id}: ${playerLabel(db, p.player_id)}`),
    ].join("\n");
  }
  const p = matches[0]!;
  const id = p.player_id;
  const r = rosters.find((x) => x.players.includes(id) || x.reserve.includes(id) || x.taxi.includes(id));
  const slot = !r ? null : r.reserve.includes(id) ? "IR" : r.taxi.includes(id) ? "taxi" : r.starters.includes(id) ? "starter" : "bench";
  const [{ weeks, points }, adds, stats] = await Promise.all([
    seasonPoints(session),
    session.trending("add", 24),
    optionalStats(session),
  ]);
  const games = stats.book?.byPlayer.get(id) ?? [];
  const statLine = (g: (typeof games)[number]) => {
    const s = g.line;
    const parts = [
      s.attempts ? `${s.completions ?? 0}/${s.attempts} ${s.passing_yards ?? 0} py ${s.passing_tds ?? 0} td ${s.passing_interceptions ?? 0} int` : "",
      s.carries ? `${s.carries}-${s.rushing_yards ?? 0} ru ${s.rushing_tds ?? 0} td` : "",
      s.targets ? `${s.receptions ?? 0}/${s.targets} tgt ${s.receiving_yards ?? 0} rec yd ${s.receiving_tds ?? 0} td` : "",
    ].filter(Boolean);
    return `W${g.week} ${pts(g.points)} vs ${g.opponent}${parts.length ? ` (${parts.join("; ")})` : ""}`;
  };
  const wk = points.get(id);
  const lastScored = (await session.data()).league.settings.last_scored_leg ?? 0;
  const weekly = weeks
    .map((w) => {
      const e = wk?.get(w);
      const label = `W${w}${w > lastScored ? "*" : ""}`;
      return e ? `${label} ${pts(e.points)}${e.started ? "" : " (bench)"} [${shortTeam(ctx, e.rosterId)}]` : `${label} —`;
    })
    .join(", ");
  const trendingCount = adds.find((t) => t.player_id === id)?.count;
  return [
    header(ctx, `Player — ${playerName(db, id)}`),
    "",
    `- ${playerLabel(db, id)} · Sleeper ID ${id}`,
    `- Age ${p.age ?? "?"}, ${p.years_exp ?? "?"} yrs exp, status ${p.status ?? "?"}` +
      (p.depth_chart_position ? `, depth ${p.depth_chart_position}${p.depth_chart_order ?? ""}` : ""),
    `- In this league: ${r ? `${teamLabel(ctx, r.roster_id)} (${slot})` : "AVAILABLE (free agent or on waivers)"}`,
    `- Adds in last 24h across Sleeper: ${trendingCount ?? "not in the top 100"}`,
    `- League points by week: ${weekly || "none yet"}${weeks.some((w) => w > lastScored) ? " (* = in progress)" : ""}`,
    `- Scored stat lines (any team, this league's scoring): ${games.length ? `PPG ${pts(ppg(games))}` : "none"}`,
    ...games.map((g) => `  - ${statLine(g)}`),
    "",
    stats.note,
  ].join("\n");
}
