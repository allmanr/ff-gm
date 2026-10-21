import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession } from "../src/session.ts";
import { createSleeperClient } from "../src/sleeper/client.ts";
import type { Roster } from "../src/sleeper/schemas.ts";
import { tradeImpact } from "../src/trade-impact.ts";
import { tradeCommand } from "../src/value-commands.ts";
import { FIXTURE_OWNER_ROSTER, fixtureFetch, fixtureOwner, fixtureSession } from "./helpers.ts";

describe("trade roster and lineup impact", () => {
  it("matches a hand-computed optimal lineup for both teams, skipping IR and unscored players", async () => {
    const { session } = fixtureSession();
    const { ctx, rosters } = await session.data();
    const db = await session.players();
    const byPos = (pos: string) => [...db.keys()].filter((id) => db.get(id)?.position === pos && db.get(id)?.fantasy_positions?.length === 1);
    const [q1, q2, q3, ir] = byPos("QB");
    const [r1, r2, r3] = byPos("RB");
    const [w1, w2, w3, w4, unscored] = byPos("WR");
    const [t1, t2] = byPos("TE");
    const avg: Record<string, number | null> = {
      [q1!]: 20, [q2!]: 15, [q3!]: 18, [ir!]: 30, [r1!]: 10, [r2!]: 9, [r3!]: 5,
      [w1!]: 12, [w2!]: 11, [w3!]: 4, [w4!]: 14, [unscored!]: null, [t1!]: 8, [t2!]: 7,
    };
    const roster = (id: number, players: string[], reserve: string[]): Roster => ({ ...rosters[0]!, roster_id: id, players, reserve, taxi: [] });
    const a = roster(1, [q1!, q2!, r1!, r2!, r3!, w1!, w2!, w3!, t1!, unscored!, ir!], [ir!]);
    const b = roster(2, [q3!, w4!, t2!], []);
    const common = { ctx, db, injured: new Set([ir!]), avg: (id: string) => avg[id] ?? null };

    // A gives its second QB for B's WR.
    const ia = tradeImpact({ ...common, roster: a, sent: [q2!], received: [w4!] });
    const ib = tradeImpact({ ...common, roster: b, sent: [w4!], received: [q2!] });

    // Before, A starts q2 at SUPER_FLEX: 20 + 10 + 9 + 12 + 11 + 8 + 5 + 4 (FLEX) + 15 (SF) = 94.
    // After, w4 and w1 start at WR, w2 and r3 at FLEX, w3 at SF: 20 + 10 + 9 + 14 + 12 + 8 + 11 + 5 + 4 = 93.
    expect(ia.lineup.beforeTotal).toBe(94);
    expect(ia.lineup.afterTotal).toBe(93);
    expect(ia.lineup.after.find((x) => x.slot === "SUPER_FLEX")?.id).toBe(w3);
    // B: 18 + 14 + 7 = 39 before; 18 + 7 + 15 (q2 at SF) = 40 after.
    expect(ib.lineup.beforeTotal).toBe(39);
    expect(ib.lineup.afterTotal).toBe(40);
    expect(ib.lineup.after.find((x) => x.slot === "SUPER_FLEX")?.id).toBe(q2);

    // The IR QB (30) never starts and counts against reserve slots; the unscored WR is listed, not scored as 0.
    expect([...ia.lineup.before, ...ia.lineup.after].some((x) => x.id === ir)).toBe(false);
    expect(ia.ir).toEqual({ after: 1, limit: ctx.roster.reserveSlots });
    expect(ia.active).toEqual({ before: 10, after: 10, limit: ctx.roster.starterSlots.length + ctx.roster.benchSlots });
    expect(ia.unscored).toEqual([unscored]);
  });

  it("reports one required drop for the side at the active limit in a 2-for-1", async () => {
    const { fetch } = fixtureFetch();
    const session = createSession({
      client: createSleeperClient({ fetch, retries: 0 }),
      owner: fixtureOwner(),
      cacheDir: mkdtempSync(join(tmpdir(), "ff-impact-")),
      valuesFetch: vi.fn(async () => Response.json([{ player: { name: "x", sleeperId: "x", position: "WR" }, value: 1, overallRank: 1, positionRank: 1 }])),
    });
    const { ctx, rosters } = await session.data();
    const limit = ctx.roster.starterSlots.length + ctx.roster.benchSlots;
    const active = (r: Roster) => r.players.filter((id) => !r.reserve.includes(id) && !r.taxi.includes(id));
    const mine = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!;
    const full = rosters.find((r) => r.roster_id !== FIXTURE_OWNER_ROSTER && active(r).length === limit)!;
    expect(active(mine).length).toBeLessThan(limit);
    const [g1, g2] = active(mine);
    const out = await tradeCommand(session, `${g1}, ${g2}`, active(full)[0]!);
    const row = (team: string) => out.split("\n").find((l) => l.startsWith(`${team} `))!.trim().split(/\s+/);
    const n = active(mine).length;
    expect(row("us").slice(1, 4)).toEqual([`${n}→${n - 1}/${limit}`, `${mine.reserve.length}/${ctx.roster.reserveSlots}`, "0"]);
    expect(row(ctx.teams.find((t) => t.rosterId === full.roster_id)!.managerName).slice(1, 4)).toEqual([
      `${limit}→${limit + 1}/${limit}`,
      `${full.reserve.length}/${ctx.roster.reserveSlots}`,
      "1",
    ]);
    expect(out).toContain("historical league-scored averages");
    expect(out).toContain("Sleeper's placement of a traded IR player is unverified");
    expect(out.indexOf("Net market value")).toBeLessThan(out.indexOf("Roster and lineup impact"));
  });
});
