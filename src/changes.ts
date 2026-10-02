import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { describeTransaction, type Options } from "./commands.ts";
import { paths } from "./config.ts";
import { derivePickOwnership, rosterPlayerIds } from "./domain.ts";
import { header, shortTeam } from "./format.ts";
import { playerLabel } from "./players.ts";
import type { Session } from "./session.ts";

const SnapshotSchema = z.object({
  version: z.literal(1),
  takenAt: z.string(),
  leagueId: z.string(),
  season: z.string(),
  week: z.number().int(),
  rosters: z.record(
    z.string(),
    z.object({
      players: z.array(z.string()),
      reserve: z.array(z.string()),
      record: z.string(),
      faabUsed: z.number(),
    }),
  ),
  picks: z.record(z.string(), z.number().int()),
  injuries: z.record(z.string(), z.string()),
  transactionIds: z.array(z.string()),
});
type Snapshot = z.infer<typeof SnapshotSchema>;

async function takeSnapshot(session: Session): Promise<Snapshot> {
  const { ctx, rosters, drafts } = await session.data();
  const [db, traded] = await Promise.all([session.players(), session.tradedPicks()]);
  const week = Math.max(1, ctx.nfl.week);
  const weeks = week > 1 ? [week - 1, week] : [week];
  const txs = (await Promise.all(weeks.map((w) => session.transactions(w)))).flat();
  const { picks } = derivePickOwnership({
    leagueSeason: ctx.season,
    rounds: ctx.draft.rounds ?? 0,
    rosters,
    tradedPicks: traded,
    drafts,
  });
  const injuries: Record<string, string> = {};
  for (const r of rosters) {
    for (const id of rosterPlayerIds(r)) injuries[id] = db.get(id)?.injury_status ?? "";
  }
  return {
    version: 1,
    takenAt: ctx.fetchedAt,
    leagueId: ctx.leagueId,
    season: ctx.season,
    week,
    rosters: Object.fromEntries(
      rosters.map((r) => [
        String(r.roster_id),
        {
          players: [...r.players].sort(),
          reserve: [...r.reserve].sort(),
          record: `${r.settings.wins}-${r.settings.losses}${r.settings.ties ? `-${r.settings.ties}` : ""}`,
          faabUsed: r.settings.waiver_budget_used ?? 0,
        },
      ]),
    ),
    picks: Object.fromEntries(picks.map((p) => [`${p.season}:${p.round}:${p.originalRosterId}`, p.ownerRosterId])),
    injuries,
    transactionIds: txs.filter((t) => t.status === "complete").map((t) => t.transaction_id).sort(),
  };
}

/** Deterministic League Watcher: what changed since the last snapshot. */
export async function changesCommand(session: Session, opts: Options, snapshotDir = join(paths.privateDir, "snapshots")) {
  const { ctx } = await session.data();
  const db = await session.players();
  const file = join(snapshotDir, "latest.json");
  const current = await takeSnapshot(session);
  const save = () => {
    if (opts.write === false) return;
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(`${file}.tmp`, `${JSON.stringify(current)}\n`);
    renameSync(`${file}.tmp`, file);
  };

  const parsed = existsSync(file) ? SnapshotSchema.safeParse(JSON.parse(readFileSync(file, "utf8"))) : null;
  const prev = parsed?.success ? parsed.data : null;
  if (!prev || prev.leagueId !== current.leagueId || prev.season !== current.season) {
    save();
    return `${header(ctx, "League changes")}\n\nNo comparable earlier snapshot; baseline saved. Run again later to see what changed.`;
  }

  const lines: string[] = [];
  const team = (rid: string | number) => shortTeam(ctx, Number(rid));

  // New completed transactions in the weeks the previous snapshot could not have seen in full.
  const seen = new Set(prev.transactionIds);
  const weeks: number[] = [];
  for (let w = Math.max(1, prev.week - 1); w <= current.week; w++) weeks.push(w);
  const txs = (await Promise.all(weeks.map((w) => session.transactions(w))))
    .flat()
    .filter((t) => t.status === "complete" && !seen.has(t.transaction_id))
    .sort((a, b) => (a.status_updated ?? a.created) - (b.status_updated ?? b.created));
  if (txs.length) {
    lines.push("## New transactions", "", ...txs.map((t) => `- ${describeTransaction(ctx, db, t)}`), "");
  }

  // Roster differences catch commissioner moves and anything outside the transaction window.
  const rosterLines: string[] = [];
  for (const [rid, now] of Object.entries(current.rosters)) {
    const before = prev.rosters[rid];
    if (!before) continue;
    const added = now.players.filter((p) => !before.players.includes(p));
    const dropped = before.players.filter((p) => !now.players.includes(p));
    const toIr = now.reserve.filter((p) => !before.reserve.includes(p) && before.players.includes(p));
    const fromIr = before.reserve.filter((p) => !now.reserve.includes(p) && now.players.includes(p));
    const parts = [
      ...added.map((p) => `+${playerLabel(db, p)}`),
      ...dropped.map((p) => `−${playerLabel(db, p)}`),
      ...toIr.map((p) => `${playerLabel(db, p)} → IR`),
      ...fromIr.map((p) => `${playerLabel(db, p)} ← IR`),
    ];
    if (before.record !== now.record) parts.push(`record ${before.record} → ${now.record}`);
    if (before.faabUsed !== now.faabUsed) parts.push(`FAAB used $${before.faabUsed} → $${now.faabUsed}`);
    if (parts.length) rosterLines.push(`- ${team(rid)}: ${parts.join(", ")}`);
  }
  if (rosterLines.length) lines.push("## Roster changes", "", ...rosterLines, "");

  const pickLines = Object.entries(current.picks)
    .filter(([k, owner]) => prev.picks[k] !== undefined && prev.picks[k] !== owner)
    .map(([k, owner]) => {
      const [season, round, orig] = k.split(":");
      return `- ${season} R${round} (orig. ${team(orig!)}): ${team(prev.picks[k]!)} → ${team(owner)}`;
    });
  if (pickLines.length) lines.push("## Pick ownership changes", "", ...pickLines, "");

  const ownerRoster = ctx.owner.status === "verified" ? current.rosters[String(ctx.owner.rosterId)] : undefined;
  const ownerIds = new Set(ownerRoster?.players ?? []);
  const injuryLines = Object.entries(current.injuries)
    .filter(([id, status]) => id in prev.injuries && prev.injuries[id] !== status)
    .sort(([a], [b]) => Number(ownerIds.has(b)) - Number(ownerIds.has(a)))
    .map(([id, status]) => `- ${ownerIds.has(id) ? "★ " : ""}${playerLabel(db, id)}: ${prev.injuries[id] || "healthy"} → ${status || "healthy"}`);
  if (injuryLines.length) {
    lines.push("## Injury status changes (rostered players; Sleeper player data, refreshed daily)", "", ...injuryLines, "");
  }

  save();
  const since = `Since ${prev.takenAt} (week ${prev.week}).`;
  return [header(ctx, "League changes"), "", since, "", ...(lines.length ? lines : ["No changes."])].join("\n").trimEnd();
}
