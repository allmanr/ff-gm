/**
 * Exact lineup optimization: assign players to starter slots to maximize total points, respecting
 * each slot's eligible positions and using each player at most once. Uses the Hungarian algorithm,
 * so it is correct for any flex structure (not only nested ones where greedy happens to work).
 */
export type Candidate = { id: string; position: string; points: number };
export type Slot = { slot: string; eligible: readonly string[] };
export type Assignment = { slot: string; id: string | null; points: number };

/** Minimum-cost assignment for an n×m cost matrix (n ≤ m). Returns column index per row. */
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const m = cost[0]?.length ?? 0;
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0); // p[j] = row assigned to column j (1-based)
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(INF);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }
  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]! > 0) result[p[j]! - 1] = j - 1;
  return result;
}

export function optimalLineup(slots: Slot[], candidates: Candidate[]): { lineup: Assignment[]; total: number } {
  // Columns: every candidate plus one "empty" column per slot (worth 0) so a slot can stay unfilled.
  const BIG = 1e6; // forbids ineligible pairings
  const cols = [...candidates.map((c) => ({ kind: "player" as const, c })), ...slots.map(() => ({ kind: "empty" as const }))];
  const cost = slots.map((s) =>
    cols.map((col) => {
      if (col.kind === "empty") return 0;
      return s.eligible.includes(col.c.position) ? -col.c.points : BIG;
    }),
  );
  const pick = slots.length ? hungarian(cost) : [];
  const lineup = slots.map((s, i) => {
    const col = cols[pick[i]!];
    if (!col || col.kind === "empty" || !s.eligible.includes(col.c.position)) return { slot: s.slot, id: null, points: 0 };
    return { slot: s.slot, id: col.c.id, points: col.c.points };
  });
  return { lineup, total: lineup.reduce((a, x) => a + x.points, 0) };
}
