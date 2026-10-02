import { UsageError, resolveRoster, type Options } from "./commands.ts";
import { rosterPoints, standingsOrder } from "./domain.ts";
import { header, pts, shortTeam, table, teamLabel } from "./format.ts";
import { optimalLineup } from "./lineup.ts";
import { playerLabel } from "./players.ts";
import type { Session } from "./session.ts";
import type { Matchup } from "./sleeper/schemas.ts";
import { eligiblePositions } from "./positions.ts";

/**
 * Hindsight lineup review: actual starters vs. the best legal lineup from the same roster that
 * week, using this league's scored points. Players on IR score 0, so including them is harmless.
 */
export async function benchCommand(session: Session, who: string | undefined, opts: Options): Promise<string> {
  const { ctx, league, rosters } = await session.data();
  const lastScored = league.settings.last_scored_leg ?? 0;

  if (opts.league) {
    const rows = standingsOrder(rosters).map((r) => {
      const p = rosterPoints(r);
      return [
        shortTeam(ctx, r.roster_id),
        `${r.settings.wins}-${r.settings.losses}`,
        pts(p.pf),
        pts(p.maxPf),
        p.maxPf ? `${((p.pf / p.maxPf) * 100).toFixed(1)}%` : "-",
        p.maxPf === null ? "-" : pts(p.maxPf - p.pf),
      ];
    });
    return [
      header(ctx, "Lineup efficiency, season to date"),
      "",
      table(["Team", "W-L", "PF", "Max PF", "Efficiency", "Left on bench"], rows),
      "",
      "Max PF is Sleeper's best-possible-lineup total. Low efficiency marks managers who misjudge start/sit.",
    ].join("\n");
  }

  const week = opts.week ?? lastScored;
  if (week < 1) throw new UsageError("No scored weeks yet.");
  const r = await resolveRoster(session, who);
  const [db, ms] = await Promise.all([session.players(), session.matchups(week)]);
  const mine = ms.find((m) => m.roster_id === r.roster_id);
  if (!mine) throw new UsageError(`No week ${week} matchup data for ${shortTeam(ctx, r.roster_id)}.`);
  const opp: Matchup | undefined =
    mine.matchup_id != null ? ms.find((m) => m.matchup_id === mine.matchup_id && m.roster_id !== mine.roster_id) : undefined;

  const candidates = mine.players
    .map((id) => ({ id, positions: eligiblePositions(db.get(id)), points: mine.players_points[id] ?? 0 }))
    .filter((c) => c.positions.length > 0);
  const best = optimalLineup(ctx.roster.starterSlots, candidates);
  const actualTotal = mine.starters_points.reduce((a, b) => a + b, 0);
  const rows = ctx.roster.starterSlots.map((s, i) => {
    const started = mine.starters[i];
    const b = best.lineup[i]!;
    return [
      s.slot,
      started && started !== "0" ? playerLabel(db, started) : "(empty)",
      pts(mine.starters_points[i]),
      b.id ? playerLabel(db, b.id) : "(empty)",
      pts(b.points),
    ];
  });
  const lost = best.total - actualTotal;
  const oppScore = opp ? (opp.custom_points ?? opp.points ?? 0) : null;
  const verdict =
    oppScore === null
      ? ""
      : actualTotal >= oppScore
        ? `Won ${pts(actualTotal)}–${pts(oppScore)}.`
        : best.total > oppScore
          ? `Lost ${pts(actualTotal)}–${pts(oppScore)}; the best lineup (${pts(best.total)}) would have won.`
          : `Lost ${pts(actualTotal)}–${pts(oppScore)}; even the best lineup (${pts(best.total)}) would have lost.`;

  return [
    header(ctx, `Lineup review, week ${week} — ${teamLabel(ctx, r.roster_id)}${week > lastScored ? " (in progress)" : ""}`),
    "",
    table(["Slot", "Started", "Pts", "Best possible", "Pts"], rows),
    "",
    `Actual ${pts(actualTotal)} · best possible ${pts(best.total)} · left on bench ${pts(lost)}. ${verdict}`.trim(),
    "Hindsight only: the best lineup uses final points, which were not knowable at kickoff. Slot order of the best lineup is arbitrary within flex-eligible slots.",
  ].join("\n");
}
