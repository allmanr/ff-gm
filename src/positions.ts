import type { Player } from "./sleeper/schemas.ts";

/**
 * Sleeper's `position` is the primary position only; `fantasy_positions` lists every position a
 * player may fill (e.g. Travis Hunter: DB primary, eligible at WR; fullbacks: FB, eligible at RB).
 */
export function eligiblePositions(p: Player | undefined): string[] {
  if (!p) return [];
  return [...new Set([...(p.position ? [p.position] : []), ...(p.fantasy_positions ?? [])])];
}

/** The position a player counts as in this league: the primary if startable, else the first startable eligible one. */
export function fantasyPosition(p: Player | undefined, startable: readonly string[]): string | null {
  if (!p) return null;
  if (p.position && startable.includes(p.position)) return p.position;
  return eligiblePositions(p).find((x) => startable.includes(x)) ?? null;
}

export function isStartable(p: Player | undefined, startable: readonly string[]): boolean {
  return fantasyPosition(p, startable) !== null;
}
