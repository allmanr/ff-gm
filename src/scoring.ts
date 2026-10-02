import type { LeagueContext } from "./context.ts";
import { POSITION_RECEPTION_BONUS } from "./scoring-keys.ts";

/** One player's stat line for a game, using nflverse stats_player column names. */
export type StatLine = Record<string, number>;

/** Sleeper scoring key → value from an nflverse stat line. Position bonuses are handled separately. */
const STAT_FOR_KEY: Record<string, (s: StatLine) => number> = {
  pass_yd: (s) => s.passing_yards ?? 0,
  pass_td: (s) => s.passing_tds ?? 0,
  pass_int: (s) => s.passing_interceptions ?? 0,
  pass_2pt: (s) => s.passing_2pt_conversions ?? 0,
  pass_att: (s) => s.attempts ?? 0,
  pass_cmp: (s) => s.completions ?? 0,
  pass_inc: (s) => (s.attempts ?? 0) - (s.completions ?? 0),
  pass_sack: (s) => s.sacks_suffered ?? 0,
  pass_fd: (s) => s.passing_first_downs ?? 0,
  rush_yd: (s) => s.rushing_yards ?? 0,
  rush_td: (s) => s.rushing_tds ?? 0,
  rush_2pt: (s) => s.rushing_2pt_conversions ?? 0,
  rush_att: (s) => s.carries ?? 0,
  rush_fd: (s) => s.rushing_first_downs ?? 0,
  rec: (s) => s.receptions ?? 0,
  rec_yd: (s) => s.receiving_yards ?? 0,
  rec_td: (s) => s.receiving_tds ?? 0,
  rec_2pt: (s) => s.receiving_2pt_conversions ?? 0,
  rec_tgt: (s) => s.targets ?? 0,
  rec_fd: (s) => s.receiving_first_downs ?? 0,
  fum: (s) => s.fumbles_total ?? 0,
  // Includes fumbles lost on returns, which the rushing/receiving/sack columns omit.
  fum_lost: (s) => s.fumbles_lost_total ?? 0,
  fum_rec_td: (s) => s.fumble_recovery_tds ?? 0,
  st_td: (s) => s.special_teams_tds ?? 0,
};

export const STAT_COLUMNS = [
  "passing_yards", "passing_tds", "passing_interceptions", "passing_2pt_conversions", "attempts", "completions",
  "sacks_suffered", "passing_first_downs", "rushing_yards", "rushing_tds", "rushing_2pt_conversions", "carries",
  "rushing_first_downs", "receptions", "receiving_yards", "receiving_tds", "receiving_2pt_conversions", "targets",
  "receiving_first_downs", "fumbles_total", "fumbles_lost_total", "fumble_recovery_tds", "special_teams_tds",
] as const;

/**
 * Non-zero scoring keys for offensive players that the stat source cannot supply. Kicker, team
 * defense, and IDP keys are excluded when the league has no such slots.
 */
export function unsupportedScoringKeys(ctx: LeagueContext): string[] {
  const positions = ctx.roster.startablePositions;
  return ctx.scoring
    .filter((x) => x.value !== 0 && (
      x.category === "offense" || x.category === "special_teams" || x.category === "unresolved" ||
      (x.category === "kicker" && positions.includes("K")) ||
      (x.category === "team_defense" && positions.includes("DEF")) ||
      (x.category === "idp" && positions.some((p) => ["DL", "LB", "DB"].includes(p)))
    ))
    .map((x) => x.key)
    .filter((k) => !(k in STAT_FOR_KEY) && !Object.values(POSITION_RECEPTION_BONUS).includes(k));
}

export function requireSupportedScoring(ctx: LeagueContext): void {
  const unsupported = unsupportedScoringKeys(ctx);
  if (unsupported.length) {
    throw new Error(`stat source cannot supply scoring keys (${unsupported.join(", ")}); cannot score stats exactly`);
  }
}

/**
 * Fantasy points for a stat line under this league's exact scoring. Reception bonuses follow the
 * player's primary (Sleeper) position, never the lineup slot. Refuses incomplete source coverage.
 */
export function scoreStatLine(ctx: LeagueContext, position: string, s: StatLine): number {
  requireSupportedScoring(ctx);
  let total = 0;
  for (const { key, value } of ctx.scoring) {
    if (value === 0) continue;
    const stat = STAT_FOR_KEY[key];
    if (stat) total += value * stat(s);
  }
  const bonusKey = POSITION_RECEPTION_BONUS[position];
  const bonus = bonusKey ? (ctx.scoring.find((x) => x.key === bonusKey)?.value ?? 0) : 0;
  total += bonus * (s.receptions ?? 0);
  return Math.round(total * 100) / 100;
}
