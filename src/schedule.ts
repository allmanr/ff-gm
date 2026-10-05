import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Options } from "./commands.ts";
import { header, table } from "./format.ts";
import { playerName } from "./players.ts";
import type { Session } from "./session.ts";
import { fantasyPosition, isStartable } from "./positions.ts";

/** nflverse schedules release (CC-BY-4.0): kickoffs, results, closing spreads and totals. */
export const SCHEDULE_URL = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";
export const SCHEDULE_ATTRIBUTION =
  "Schedule and betting lines: nflverse (CC-BY-4.0, https://github.com/nflverse/nflverse-data)";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** nflverse uses "LA" for the Rams; Sleeper uses "LAR". */
const TO_SLEEPER: Record<string, string> = { LA: "LAR" };
const team = (t: string) => TO_SLEEPER[t] ?? t;

const num = z.string().transform((s, ctx) => {
  if (s === "" || s === "NA") return null;
  const n = Number(s);
  if (Number.isNaN(n)) {
    ctx.addIssue({ code: "custom", message: `not a number: ${s}` });
    return z.NEVER;
  }
  return n;
});

const GameRowSchema = z.object({
  game_id: z.string(),
  season: z.string(),
  game_type: z.string(),
  week: z.coerce.number().int(),
  gameday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekday: z.string(),
  gametime: z.string().regex(/^\d{2}:\d{2}$/),
  away_team: z.string(),
  home_team: z.string(),
  away_score: num,
  home_score: num,
  spread_line: num,
  total_line: num,
});
export type Game = Omit<z.infer<typeof GameRowSchema>, "away_team" | "home_team"> & { away: string; home: string };

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseGames(csv: string, season: string): Game[] {
  const [head, ...rows] = parseCsv(csv);
  if (!head?.includes("game_id") || !head.includes("spread_line")) throw new Error("schedule file has unexpected columns");
  const games: Game[] = [];
  for (const r of rows) {
    if (r.length !== head.length) continue;
    const raw = Object.fromEntries(head.map((h, i) => [h, r[i]!]));
    if (raw.season !== season) continue;
    const g = GameRowSchema.parse(raw);
    const { away_team, home_team, ...rest } = g;
    games.push({ ...rest, away: team(away_team), home: team(home_team) });
  }
  if (games.length === 0) throw new Error(`schedule has no games for ${season}`);
  return games;
}

export async function loadSchedule(opts: {
  season: string;
  cacheDir: string;
  fetch?: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  now?: () => number;
}): Promise<{ games: Game[]; stale: boolean }> {
  const now = opts.now ?? Date.now;
  const file = join(opts.cacheDir, "nflverse-games.csv");
  let ageMs = Number.POSITIVE_INFINITY;
  try {
    ageMs = now() - statSync(file).mtimeMs;
  } catch {
    // no cache yet
  }
  if (ageMs < MAX_AGE_MS) {
    try {
      return { games: parseGames(readFileSync(file, "utf8"), opts.season), stale: false };
    } catch {
      // fall through to refetch
    }
  }
  try {
    const doFetch = opts.fetch ?? ((url, init) => fetch(url, init));
    const res = await doFetch(SCHEDULE_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`nflverse schedule HTTP ${res.status}`);
    const text = await res.text();
    const games = parseGames(text, opts.season);
    mkdirSync(opts.cacheDir, { recursive: true });
    writeFileSync(`${file}.tmp`, text);
    renameSync(`${file}.tmp`, file);
    return { games, stale: false };
  } catch (err) {
    if (!Number.isFinite(ageMs)) throw err;
    return { games: parseGames(readFileSync(file, "utf8"), opts.season), stale: true };
  }
}

/** Regular-season bye week(s) per team: weeks 1..last scheduled week with no game. */
export function byeWeeks(games: Game[]): Map<string, number[]> {
  const reg = games.filter((g) => g.game_type === "REG");
  const lastWeek = Math.max(0, ...reg.map((g) => g.week));
  const playing = new Map<string, Set<number>>();
  for (const g of reg) {
    for (const t of [g.away, g.home]) {
      const weeks = playing.get(t) ?? new Set<number>();
      weeks.add(g.week);
      playing.set(t, weeks);
    }
  }
  const byes = new Map<string, number[]>();
  for (const [t, weeks] of playing) {
    byes.set(
      t,
      Array.from({ length: lastWeek }, (_, i) => i + 1).filter((w) => !weeks.has(w)),
    );
  }
  return byes;
}

/** nflverse kickoff times are US Eastern; Central is always one hour earlier (both observe DST together). */
export function kickoffCt(g: Game): string {
  const [h, m] = g.gametime.split(":").map(Number) as [number, number];
  const hour = (h + 23) % 24;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${g.weekday.slice(0, 3)} ${((hour + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix} CT`;
}

/** Implied points from the closing line. nflverse spread_line > 0 means the home team is favored. */
export function impliedTotals(g: Game): { away: number; home: number } | null {
  if (g.spread_line === null || g.total_line === null) return null;
  return { home: (g.total_line + g.spread_line) / 2, away: (g.total_line - g.spread_line) / 2 };
}

export async function scheduleCommand(session: Session, opts: Options): Promise<string> {
  const { ctx, rosters } = await session.data();
  const week = opts.week ?? Math.max(1, ctx.nfl.week);
  const [{ games: all, stale }, db] = await Promise.all([session.schedule(), session.players()]);
  const gameType = week > 18 ? "POST" : "REG";
  const games = all
    .filter((g) => g.week === week && (gameType === "REG" ? g.game_type === "REG" : g.game_type !== "REG"))
    .sort((a, b) => `${a.gameday} ${a.gametime}`.localeCompare(`${b.gameday} ${b.gametime}`));
  const teams = new Set(all.filter((g) => g.game_type === "REG").flatMap((g) => [g.away, g.home]));
  const playing = new Set(games.flatMap((g) => [g.away, g.home]));
  const byes = [...teams].filter((t) => !playing.has(t)).sort();

  const rows = games.map((g) => {
    const imp = impliedTotals(g);
    const fav =
      g.spread_line === null ? "" : g.spread_line === 0 ? "PK" : g.spread_line > 0 ? `${g.home} -${g.spread_line}` : `${g.away} -${-g.spread_line}`;
    const final = g.away_score !== null && g.home_score !== null ? `${g.away} ${g.away_score}–${g.home_score} ${g.home}` : "";
    return [
      `${g.gameday.slice(5)} ${kickoffCt(g)}`,
      `${g.away} @ ${g.home}`,
      fav,
      g.total_line ?? "",
      imp ? `${imp.away.toFixed(1)} / ${imp.home.toFixed(1)}` : "",
      final,
    ];
  });

  const out = [
    header(ctx, `NFL week ${week} schedule`),
    "",
    table(["Kickoff", "Game", "Favorite", "Total", "Implied (away/home)", "Final"], rows),
    "",
    `Byes: ${byes.length ? byes.join(", ") : "none"}`,
  ];

  if (ctx.owner.status === "verified") {
    const ownerRosterId = ctx.owner.rosterId;
    const r = rosters.find((x) => x.roster_id === ownerRosterId)!;
    // Sleeper keeps a lineup per week; the roster only holds the current week's.
    const matchup = (await session.matchups(week)).find((m) => m.roster_id === ownerRosterId);
    const savedLineup = matchup && matchup.starters.length > 0 ? matchup : undefined;
    const starters = new Set(savedLineup ? savedLineup.starters : r.starters);
    const playerIds = savedLineup
      ? [...new Set([...savedLineup.players, ...savedLineup.starters])]
      : r.players.filter((id) => !r.reserve.includes(id));
    const gameFor = (t: string) => games.find((g) => g.away === t || g.home === t);
    const mine = playerIds
      .map((id) => ({ id, p: db.get(id) }))
      .filter(({ p }) => isStartable(p, ctx.roster.startablePositions))
      .map(({ id, p }) => {
        const nflTeam = p!.team ?? "";
        const g = nflTeam ? gameFor(nflTeam) : undefined;
        const imp = g ? impliedTotals(g) : null;
        const home = g?.home === nflTeam;
        return {
          starter: starters.has(id),
          row: [
            starters.has(id) ? "start" : "bench",
            playerName(db, id),
            `${fantasyPosition(p, ctx.roster.startablePositions)}-${nflTeam || "FA"}`,
            p!.injury_status ?? "",
            !nflTeam ? "no team" : !g ? "BYE" : `${home ? "vs" : "@"} ${home ? g.away : g.home}`,
            g ? kickoffCt(g) : "",
            imp ? (home ? imp.home : imp.away).toFixed(1) : "",
          ],
        };
      })
      .sort((a, b) => Number(b.starter) - Number(a.starter));
    const startersOnBye = mine.filter((m) => m.starter && m.row[4] === "BYE").map((m) => m.row[1]);
    out.push(
      "",
      `## Your players, week ${week}`,
      "",
      table(["Lineup", "Player", "Pos", "Inj", "Game", "Kickoff", "Team implied pts"], mine.map((m) => m.row)),
    );
    if (startersOnBye.length) out.push("", `**Starters on bye: ${startersOnBye.join(", ")}** — replace before kickoff.`);
  }
  out.push("", `Lineup column reflects Sleeper's week ${week} lineup (current starters if Sleeper has none for that week).`, `${SCHEDULE_ATTRIBUTION}${stale ? " (STALE: refresh failed)" : ""}.`);
  return out.join("\n");
}
