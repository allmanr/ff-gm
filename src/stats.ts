import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LeagueContext } from "./context.ts";
import type { PlayerDb } from "./players.ts";
import { parseCsv } from "./schedule.ts";
import { scoreStatLine, STAT_COLUMNS, unsupportedScoringKeys, type StatLine } from "./scoring.ts";
import { isStartable } from "./positions.ts";

/** nflverse weekly player stats and season rosters (CC-BY-4.0). Rosters map gsis_id → sleeper_id. */
export const STATS_ATTRIBUTION = "Player stats: nflverse (CC-BY-4.0, https://github.com/nflverse/nflverse-data)";
const BASE = "https://github.com/nflverse/nflverse-data/releases/download";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

async function cachedText(url: string, file: string, fetchImpl: Fetch, now: number): Promise<{ text: string; stale: boolean }> {
  let ageMs = Number.POSITIVE_INFINITY;
  try {
    ageMs = now - statSync(file).mtimeMs;
  } catch {
    // no cache yet
  }
  if (ageMs < MAX_AGE_MS) return { text: readFileSync(file, "utf8"), stale: false };
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`nflverse HTTP ${res.status} for ${url}`);
    const text = await res.text();
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(`${file}.tmp`, text);
    renameSync(`${file}.tmp`, file);
    return { text, stale: false };
  } catch (err) {
    if (!Number.isFinite(ageMs)) throw err;
    return { text: readFileSync(file, "utf8"), stale: true };
  }
}

function rowsOf(csv: string): Record<string, string>[] {
  const [head, ...rows] = parseCsv(csv);
  if (!head) return [];
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]!])));
}

export type WeekScore = { week: number; points: number; team: string; opponent: string; line: StatLine };
export type StatBook = {
  /** Sleeper player ID → regular-season weeks played, scored under league rules. */
  byPlayer: Map<string, WeekScore[]>;
  weeks: number[];
  unmatched: number;
  unsupported: string[];
  stale: boolean;
  label: string;
};

export function buildStatBook(args: {
  ctx: LeagueContext;
  db: PlayerDb;
  statsCsv: string;
  rostersCsv: string;
  stale?: boolean;
}): StatBook {
  // Unrecognized scoring keys make league-scored points unknowable: refuse rather than assume 0.
  if (args.ctx.unresolvedScoringKeys.length > 0) {
    throw new Error(`league has unrecognized scoring keys (${args.ctx.unresolvedScoringKeys.join(", ")}); cannot score stats exactly`);
  }
  const toSleeper = new Map<string, string>();
  for (const r of rowsOf(args.rostersCsv)) {
    if (r.gsis_id && r.gsis_id !== "NA" && r.sleeper_id && r.sleeper_id !== "NA") toSleeper.set(r.gsis_id, r.sleeper_id);
  }
  const byPlayer = new Map<string, WeekScore[]>();
  const weeks = new Set<number>();
  let unmatched = 0;
  for (const r of rowsOf(args.statsCsv)) {
    if (r.season !== args.ctx.season || r.season_type !== "REG") continue;
    const sleeperId = toSleeper.get(r.player_id ?? "");
    const player = sleeperId ? args.db.get(sleeperId) : undefined;
    // Reception bonuses follow the primary position; eligibility uses every fantasy position.
    const position = player?.position ?? undefined;
    if (!sleeperId || !position || !isStartable(player, args.ctx.roster.startablePositions)) {
      if (["QB", "RB", "WR", "TE"].includes(r.position ?? "")) unmatched++;
      continue;
    }
    const line: StatLine = {};
    for (const c of STAT_COLUMNS) {
      const v = Number(r[c]);
      if (r[c] !== "" && r[c] !== "NA" && !Number.isNaN(v)) line[c] = v;
    }
    const week = Number(r.week);
    weeks.add(week);
    const list = byPlayer.get(sleeperId) ?? [];
    list.push({ week, points: scoreStatLine(args.ctx, position, line), team: r.team ?? "", opponent: r.opponent_team ?? "", line });
    byPlayer.set(sleeperId, list);
  }
  for (const list of byPlayer.values()) list.sort((a, b) => a.week - b.week);
  const unsupported = unsupportedScoringKeys(args.ctx);
  const stale = args.stale ?? false;
  const label =
    `${STATS_ATTRIBUTION}; scored with this league's settings` +
    (unsupported.length ? ` (not in source, assumed 0: ${unsupported.join(", ")})` : "") +
    (unmatched ? `; ${unmatched} QB/RB/WR/TE stat lines had no Sleeper ID match` : "") +
    (stale ? " (STALE: refresh failed)" : "") +
    ".";
  return { byPlayer, weeks: [...weeks].sort((a, b) => a - b), unmatched, unsupported, stale, label };
}

export async function loadStatBook(opts: { ctx: LeagueContext; db: PlayerDb; cacheDir: string; fetch?: Fetch; now?: number }) {
  const fetchImpl = opts.fetch ?? ((url, init) => fetch(url, init));
  const now = opts.now ?? Date.now();
  const season = opts.ctx.season;
  const [stats, rosters] = await Promise.all([
    cachedText(`${BASE}/stats_player/stats_player_week_${season}.csv`, join(opts.cacheDir, `nflverse-stats-week-${season}.csv`), fetchImpl, now),
    cachedText(`${BASE}/rosters/roster_${season}.csv`, join(opts.cacheDir, `nflverse-roster-${season}.csv`), fetchImpl, now),
  ]);
  return buildStatBook({ ctx: opts.ctx, db: opts.db, statsCsv: stats.text, rostersCsv: rosters.text, stale: stats.stale || rosters.stale });
}

/** Average points per game over the most recent `last` games played (all games when omitted). */
export function ppg(scores: WeekScore[] | undefined, last?: number): number | null {
  if (!scores?.length) return null;
  const xs = last ? scores.slice(-last) : scores;
  return xs.reduce((a, s) => a + s.points, 0) / xs.length;
}
