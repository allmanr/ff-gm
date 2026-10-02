import { describeTransaction, UsageError, type Options } from "./commands.ts";
import type { LeagueContext, Team } from "./context.ts";
import { header, table } from "./format.ts";
import type { Session } from "./session.ts";
import type { HistorySeason } from "./history-data.ts";
import type { Transaction } from "./sleeper/schemas.ts";

/** A context whose team names are those of a past season (managers and team names change). */
function seasonContext(ctx: LeagueContext, s: { users: HistorySeason["users"]; rosters: HistorySeason["rosters"] }): LeagueContext {
  const users = new Map(s.users.map((u) => [u.user_id, u]));
  const teams: Team[] = s.rosters.map((r) => {
    const u = r.owner_id ? users.get(r.owner_id) : undefined;
    return {
      rosterId: r.roster_id,
      ownerUserId: r.owner_id,
      coOwnerUserIds: r.co_owners,
      managerName: u?.display_name ?? "(orphaned)",
      teamName: u?.metadata?.team_name ?? null,
      division: null,
      isOwner: false,
    };
  });
  return { ...ctx, teams };
}

type Tally = { trades: number; picksIn: number; picksOut: number; faabIn: number; faabOut: number; partners: Map<string, number> };

function tallyTrades(ctx: LeagueContext, trades: Transaction[], byManager: Map<string, Tally>) {
  const name = (rid: number) => ctx.teams.find((t) => t.rosterId === rid);
  const key = (rid: number) => {
    const t = name(rid);
    return t?.ownerUserId ?? `roster ${rid}`;
  };
  for (const t of trades) {
    for (const rid of t.roster_ids) {
      const k = key(rid);
      const tally = byManager.get(k) ?? { trades: 0, picksIn: 0, picksOut: 0, faabIn: 0, faabOut: 0, partners: new Map() };
      tally.trades++;
      tally.picksIn += t.draft_picks.filter((p) => p.owner_id === rid).length;
      tally.picksOut += t.draft_picks.filter((p) => p.previous_owner_id === rid).length;
      tally.faabIn += t.waiver_budget.filter((w) => w.receiver === rid).reduce((a, w) => a + w.amount, 0);
      tally.faabOut += t.waiver_budget.filter((w) => w.sender === rid).reduce((a, w) => a + w.amount, 0);
      for (const other of t.roster_ids) {
        if (other !== rid) tally.partners.set(key(other), (tally.partners.get(key(other)) ?? 0) + 1);
      }
      byManager.set(k, tally);
    }
  }
}

export async function historyCommand(session: Session, who: string | undefined, opts: Options): Promise<string> {
  const { ctx } = await session.data();
  const [db, past] = await Promise.all([session.players(), session.history()]);
  const weeks = await session.transactionWeeks();
  const currentTrades = (await Promise.all(weeks.map((w) => session.transactions(w))))
    .flat()
    .filter((t) => t.type === "trade" && t.status === "complete");

  const seasons = [
    { label: `${ctx.season} (current)`, ctx, trades: currentTrades },
    ...past.map((s) => ({ label: s.season, ctx: seasonContext(ctx, s), trades: s.trades })),
  ];

  // Managers are identified by Sleeper user ID so tallies follow people, not roster slots.
  const byManager = new Map<string, Tally>();
  for (const s of seasons) tallyTrades(s.ctx, s.trades, byManager);
  const currentName = (userId: string) => ctx.teams.find((t) => t.ownerUserId === userId || t.coOwnerUserIds.includes(userId));
  const display = (userId: string) => {
    const t = currentName(userId);
    if (t) return `${t.managerName}${t.isOwner ? "★" : ""}`;
    for (const s of past) {
      const u = s.users.find((x) => x.user_id === userId);
      if (u) return `${u.display_name} (former)`;
    }
    return userId;
  };

  let focus: string | null = null;
  if (who) {
    const q = who.toLowerCase();
    const hits = [...byManager.keys()].filter((k) => display(k).toLowerCase().includes(q));
    if (hits.length !== 1) throw new UsageError(hits.length ? `"${who}" matches several managers` : `No manager matches "${who}"`);
    focus = hits[0]!;
  }

  const summary = [...byManager.entries()]
    .filter(([k]) => !focus || k === focus)
    .sort((a, b) => b[1].trades - a[1].trades)
    .map(([k, t]) => [
      display(k),
      t.trades,
      `${t.picksIn}/${t.picksOut}`,
      `$${t.faabIn}/$${t.faabOut}`,
      [...t.partners.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([p, n]) => `${display(p)}×${n}`)
        .join(", "),
    ]);

  const out = [
    header(ctx, `Trade history (${seasons.map((s) => s.label.slice(0, 4)).join(", ")})`),
    "",
    table(["Manager", "Trades", "Picks in/out", "FAAB in/out", "Top partners"], summary),
    "",
  ];
  const limit = opts.limit ?? (focus ? 100 : 15);
  for (const s of seasons) {
    const trades = s.trades
      .filter((t) => !focus || t.roster_ids.some((rid) => s.ctx.teams.find((x) => x.rosterId === rid)?.ownerUserId === focus))
      .sort((a, b) => (b.status_updated ?? b.created) - (a.status_updated ?? a.created));
    if (!trades.length) continue;
    out.push(`## ${s.label}: ${trades.length} trade${trades.length === 1 ? "" : "s"}${trades.length > limit ? ` (latest ${limit})` : ""}`, "");
    for (const t of trades.slice(0, limit)) out.push(`- ${describeTransaction(s.ctx, db, t)}`);
    out.push("");
  }
  out.push("Names in past seasons are that season's managers. Player labels show current team and status.");
  return out.join("\n");
}
