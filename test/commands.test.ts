import { describe, expect, it } from "vitest";
import {
  describeTransaction,
  freeAgentsCommand,
  matchupsCommand,
  picksCommand,
  playerCommand,
  rosterCommand,
  rostersCommand,
  standingsCommand,
  transactionsCommand,
  trendingCommand,
  UsageError,
} from "../src/commands.ts";
import { renderConstitution } from "../src/constitution.ts";
import { TransactionsSchema } from "../src/sleeper/schemas.ts";
import { fixture, fixtureSession, FIXTURE_OWNER_ROSTER } from "./helpers.ts";

describe("commands on recorded data", () => {
  it("renders a constitution with exact rules and the TE bonus explained", async () => {
    const { session } = fixtureSession();
    const md = renderConstitution((await session.data()).ctx);
    expect(md).toMatch(/Superflex\s+roster_positions SUPER_FLEX\s+1 slot\(s\)\s+verified/);
    expect(md).toMatch(/TE reception = 1\.5 pts/);
    expect(md).toMatch(/WR reception = 1 pts/);
    expect(md).toMatch(/Passing: 4 per TD, 25 yds = 1 pt, -2 per INT/);
    expect(md).toMatch(/FAAB budget \$100/);
    expect(md).toMatch(/daily_waivers_days=5461/); // preserved, not interpreted
    expect(md).toContain(`${FIXTURE_OWNER_ROSTER} ★`);
  });

  it("lists standings for every team", async () => {
    const { session } = fixtureSession();
    const out = await standingsCommand(session);
    expect(out.split("\n").filter((l) => /^\d+\s/.test(l))).toHaveLength(12);
  });

  it("shows the owner's roster with starters in slot order and league points", async () => {
    const { session } = fixtureSession();
    const out = await rosterCommand(session, "me");
    const rosters = fixture<{ roster_id: number; starters: string[] }[]>("rosters");
    const db = await session.players();
    const firstStarter = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!.starters[0]!;
    const slotLines = out.split("\n").filter((l) => /^(QB|SUPER_FLEX)\s/.test(l));
    expect(slotLines[0]).toContain(db.get(firstStarter)!.full_name!);
    expect(out).toMatch(/W3\s/);
    expect(out).toMatch(/Future picks \(2027/);
  });

  it("refuses ambiguous or unknown team names", async () => {
    const { session } = fixtureSession();
    await expect(rosterCommand(session, "manager")).rejects.toBeInstanceOf(UsageError);
    await expect(rosterCommand(session, "nobody-here")).rejects.toBeInstanceOf(UsageError);
    await expect(rosterCommand(session, "manager05")).resolves.toMatch(/Roster —/);
  });

  it("summarizes all rosters and picks", async () => {
    const { session } = fixtureSession();
    expect(await rostersCommand(session)).toMatch(/1sts 27\/28/);
    const picks = await picksCommand(session, undefined);
    const totals = picks
      .split("\n")
      .filter((l) => /^manager\d\d/.test(l))
      .map((l) => Number(l.trim().split(/\s+/).at(-1)));
    expect(totals.reduce((a, b) => a + b, 0)).toBe(12 * 4 * 2);
  });

  it("lists only unrostered, current, startable free agents", async () => {
    const { session } = fixtureSession();
    const { rosters } = await session.data();
    const rostered = new Set(rosters.flatMap((r) => r.players));
    const out = await freeAgentsCommand(session, { limit: 50 });
    const ids = out
      .split("\n")
      .map((l) => l.trim().split(/\s+/).at(-1)!)
      .filter((x) => /^\d+$/.test(x));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(rostered.has(id)).toBe(false);
    await expect(freeAgentsCommand(session, { pos: ["K"] })).rejects.toBeInstanceOf(UsageError);
  });

  it("marks trending players as available or rostered", async () => {
    const { session } = fixtureSession();
    expect(await trendingCommand(session, {})).toMatch(/AVAILABLE|manager\d\d/);
  });

  it("describes trades with players, picks, and FAAB", async () => {
    const { session } = fixtureSession();
    const { ctx } = await session.data();
    const db = await session.players();
    const txs = TransactionsSchema.parse(fixture("transactions_3"));
    const trade = txs.find((t) => t.type === "trade" && t.waiver_budget.length > 0 && t.draft_picks.length > 0);
    expect(trade).toBeDefined();
    const text = describeTransaction(ctx, db, trade!);
    expect(text).toMatch(/TRADE/);
    expect(text).toMatch(/R\d pick/);
    expect(text).toMatch(/\$\d+ FAAB/);
    const out = await transactionsCommand(session, { week: 3 });
    expect(out).toMatch(/WAIVER/);
    expect(out).toMatch(/failed\/pending transactions hidden/);
  });

  it("shows week 3 matchups with the owner's head-to-head", async () => {
    const { session } = fixtureSession();
    const out = await matchupsCommand(session, { week: 3 });
    expect(out.split("\n").filter((l) => l.includes(" vs "))).toHaveLength(6);
    expect(out).toMatch(/## Your matchup/);
  });

  it("finds a player by name and reports league ownership", async () => {
    const { session } = fixtureSession();
    const db = await session.players();
    const { rosters } = await session.data();
    const id = rosters[0]!.players[0]!;
    const out = await playerCommand(session, id);
    expect(out).toContain(db.get(id)!.full_name!);
    expect(out).toMatch(/In this league: .*manager01/);
    await expect(playerCommand(session, undefined)).rejects.toBeInstanceOf(UsageError);
  });
});

describe("ff waivers", () => {
  it("reports observed processing times, FAAB left, and winning bids", async () => {
    const { waiversCommand } = await import("../src/waivers.ts");
    const { session } = fixtureSession();
    const out = await waiversCommand(session, {});
    expect(out).toMatch(/## Observed processing times/);
    expect(out).toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}:\d{2}(–\d{1,2}:\d{2})? (AM|PM) CT/);
    expect(out.split("\n").filter((l) => /^manager\d\d★?\s+\$\d+/.test(l))).toHaveLength(12);
    expect(out).toMatch(/Highest winning bids \(\d+ won claims; median \$\d+\)/);
  });
});
