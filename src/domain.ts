import type { Draft, Matchup, PickRef, Roster } from "./sleeper/schemas.ts";

/** Every player on a roster once. Sleeper's `players` already includes IR and taxi players. */
export function rosterPlayerIds(r: Roster): string[] {
  return [...new Set([...r.players, ...r.reserve, ...r.taxi])];
}

export type PickOwnership = {
  season: string;
  round: number;
  originalRosterId: number;
  ownerRosterId: number;
};

/**
 * Sleeper's traded_picks lists only picks that have moved. Every roster starts with its own pick in
 * each round of each future season; traded entries override the current owner.
 * Seasons covered: the next undrafted season through the furthest season seen in traded picks.
 * Sleeper does not expose the tradeable horizon, so callers must label it.
 */
export function derivePickOwnership(args: {
  leagueSeason: string;
  rounds: number;
  rosters: Roster[];
  tradedPicks: PickRef[];
  drafts: Draft[];
}): { seasons: string[]; picks: PickOwnership[] } {
  const season = Number(args.leagueSeason);
  const currentDraftDone = args.drafts.some((d) => d.season === args.leagueSeason && d.status === "complete");
  const first = currentDraftDone ? season + 1 : season;
  const furthest = Math.max(first, ...args.tradedPicks.map((p) => Number(p.season)));
  const seasons: string[] = [];
  for (let y = first; y <= furthest; y++) seasons.push(String(y));

  const owner = new Map<string, number>();
  for (const p of args.tradedPicks) owner.set(`${p.season}:${p.round}:${p.roster_id}`, p.owner_id);

  const picks: PickOwnership[] = [];
  for (const s of seasons) {
    for (let round = 1; round <= args.rounds; round++) {
      for (const r of args.rosters) {
        picks.push({
          season: s,
          round,
          originalRosterId: r.roster_id,
          ownerRosterId: owner.get(`${s}:${round}:${r.roster_id}`) ?? r.roster_id,
        });
      }
    }
  }
  return { seasons, picks };
}

export type WeeklyPoints = Map<string, Map<number, { points: number; rosterId: number; started: boolean }>>;

/** Per-player weekly points under this league's scoring, from matchups[].players_points. */
export function weeklyPlayerPoints(weeks: { week: number; matchups: Matchup[] }[]): WeeklyPoints {
  const out: WeeklyPoints = new Map();
  for (const { week, matchups } of weeks) {
    for (const m of matchups) {
      const starters = new Set(m.starters);
      for (const [pid, pts] of Object.entries(m.players_points)) {
        let byWeek = out.get(pid);
        if (!byWeek) out.set(pid, (byWeek = new Map()));
        byWeek.set(week, { points: pts, rosterId: m.roster_id, started: starters.has(pid) });
      }
    }
  }
  return out;
}

export function rosterPoints(r: Roster): { pf: number; pa: number; maxPf: number | null } {
  const s = r.settings;
  const dec = (whole?: number, frac?: number) => (whole ?? 0) + (frac ?? 0) / 100;
  return {
    pf: dec(s.fpts, s.fpts_decimal),
    pa: dec(s.fpts_against, s.fpts_against_decimal),
    maxPf: s.ppts === undefined ? null : dec(s.ppts, s.ppts_decimal),
  };
}

export function standingsOrder(rosters: Roster[]): Roster[] {
  return [...rosters].sort((a, b) => {
    const wa = a.settings.wins + a.settings.ties / 2;
    const wb = b.settings.wins + b.settings.ties / 2;
    return wb - wa || rosterPoints(b).pf - rosterPoints(a).pf;
  });
}
