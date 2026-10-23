import type { LeagueContext } from "./context.ts";
import { rosterCounts } from "./domain.ts";
import { optimalLineup, type Assignment } from "./lineup.ts";
import { eligiblePositions } from "./positions.ts";
import type { PlayerDb } from "./players.ts";
import type { Roster } from "./sleeper/schemas.ts";

export type TradeImpact = {
  rosterId: number;
  active: { before: number; after: number; limit: number };
  ir: { after: number; limit: number };
  drops: number;
  lineup: { before: Assignment[]; after: Assignment[]; beforeTotal: number; afterTotal: number };
  /** Active players after the trade with no recorded points this season: left out, not scored as 0. */
  unscored: string[];
};

/**
 * Roster counts and best lineup for one team before and after a trade. Received players count as
 * active (Sleeper's placement of a traded IR player is unverified). IR and taxi players, including
 * received players who are on IR now, are left out of lineups.
 */
export function tradeImpact(args: {
  ctx: LeagueContext;
  db: PlayerDb;
  roster: Roster;
  sent: string[];
  received: string[];
  /** Every player on any league IR. */
  injured: ReadonlySet<string>;
  avg: (id: string) => number | null;
}): TradeImpact {
  const { ctx, db, roster: r, injured, avg } = args;
  const sent = new Set(args.sent);
  const before = rosterCounts(r);
  const keep = (ids: string[]) => ids.filter((id) => !sent.has(id));
  const after = rosterCounts({ players: [...keep(r.players), ...args.received], reserve: keep(r.reserve), taxi: keep(r.taxi) });
  const limit = ctx.roster.starterSlots.length + ctx.roster.benchSlots;

  const beforeIds = [...new Set(r.players)].filter((id) => !r.reserve.includes(id) && !r.taxi.includes(id));
  const afterIds = [...keep(beforeIds), ...args.received];
  const best = (ids: string[]) =>
    optimalLineup(
      ctx.roster.starterSlots,
      ids.flatMap((id) => {
        const points = avg(id);
        return injured.has(id) || points === null ? [] : [{ id, positions: eligiblePositions(db.get(id)), points }];
      }),
    );
  const b = best(beforeIds);
  const a = best(afterIds);
  return {
    rosterId: r.roster_id,
    active: { before: before.active, after: after.active, limit },
    ir: { after: after.ir, limit: ctx.roster.reserveSlots },
    drops: Math.max(0, after.active - limit),
    lineup: { before: b.lineup, after: a.lineup, beforeTotal: b.total, afterTotal: a.total },
    unscored: afterIds.filter((id) => !injured.has(id) && avg(id) === null),
  };
}
