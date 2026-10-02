import type { Options } from "./commands.ts";
import { standingsOrder } from "./domain.ts";
import { header, shortTeam, table } from "./format.ts";
import { playerLabel } from "./players.ts";
import type { Session } from "./session.ts";
import type { Transaction } from "./sleeper/schemas.ts";

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function runSlot(ms: number): { key: string; minute: number } {
  const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { key: `${p.weekday} ${p.hour} ${p.dayPeriod}`, minute: Number(p.minute) };
}

/** When waivers actually process (observed), FAAB left per team, and this league's winning bids. */
export async function waiversCommand(session: Session, opts: Options): Promise<string> {
  const { ctx, rosters } = await session.data();
  const weeks = await session.playedWeeks();
  const [db, ...byWeek] = await Promise.all([session.players(), ...weeks.map((w) => session.transactions(w))]);
  const claims: Transaction[] = byWeek.flat().filter((t) => t.type === "waiver" && t.status_updated);

  // Processing times: Sleeper does not document this league's waiver schedule encoding, so report what happened.
  const runs = new Map<string, { n: number; min: number; max: number; last: number }>();
  for (const t of claims) {
    const { key, minute } = runSlot(t.status_updated!);
    const r = runs.get(key) ?? { n: 0, min: 59, max: 0, last: 0 };
    runs.set(key, { n: r.n + 1, min: Math.min(r.min, minute), max: Math.max(r.max, minute), last: Math.max(r.last, t.status_updated!) });
  }
  const runRows = [...runs.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([key, r]) => {
      const [day, hour, period] = key.split(" ");
      const mm = (m: number) => `${hour}:${String(m).padStart(2, "0")}`;
      const time = r.min === r.max ? mm(r.min) : `${mm(r.min)}–${mm(r.max)}`;
      return [day!, `${time} ${period} CT`, r.n, new Date(r.last).toISOString().slice(0, 10)];
    });

  const budget = ctx.waivers.faabBudget;
  const won = claims.filter((t) => t.status === "complete");
  const lost = claims.filter((t) => t.status === "failed");
  const faabRows = standingsOrder(rosters)
    .map((r) => ({
      r,
      left: budget === null ? null : budget - (r.settings.waiver_budget_used ?? 0),
      wins: won.filter((t) => t.roster_ids[0] === r.roster_id).length,
      losses: lost.filter((t) => t.roster_ids[0] === r.roster_id).length,
    }))
    .sort((a, b) => (b.left ?? 0) - (a.left ?? 0))
    .map(({ r, left, wins, losses }) => [
      shortTeam(ctx, r.roster_id),
      left === null ? "n/a" : `$${left}`,
      r.settings.waiver_position ?? "",
      wins,
      losses,
    ]);

  const bids = won
    .map((t) => ({ t, bid: t.settings?.waiver_bid ?? 0 }))
    .sort((a, b) => b.bid - a.bid)
    .slice(0, opts.limit ?? 12)
    .map(({ t, bid }) => [
      `$${bid}`,
      Object.keys(t.adds).map((id) => playerLabel(db, id)).join(", "),
      t.roster_ids[0] === undefined ? "" : shortTeam(ctx, t.roster_ids[0]),
      `W${t.leg}`,
    ]);
  const paid = won.map((t) => t.settings?.waiver_bid ?? 0).sort((a, b) => a - b);
  const median = paid.length ? paid[Math.floor(paid.length / 2)]! : null;

  return [
    header(ctx, "Waivers"),
    "",
    "## Observed processing times (this season)",
    "",
    runRows.length ? table(["Day", "Time", "Claims", "Last seen"], runRows) : "(no waiver claims yet)",
    "",
    "## FAAB",
    "",
    table(["Team", "FAAB left", "Waiver pos.", "Claims won", "Claims failed"], faabRows),
    "",
    `## Highest winning bids (${won.length} won claims; median $${median ?? "-"})`,
    "",
    bids.length ? table(["Bid", "Player", "Team", "Week"], bids) : "(none)",
    "",
    "Times are when Sleeper processed claims, observed from transactions. Failed claims include outbid and roster-limit failures.",
  ].join("\n");
}
