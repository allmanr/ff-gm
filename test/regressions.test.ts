/** Regression tests for bugs found in review (2026-10-02). */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { describeTransaction, freeAgentsCommand, matchupsCommand, playerCommand } from "../src/commands.ts";
import { renderConstitution } from "../src/constitution.ts";
import { rulesHash } from "../src/context.ts";
import { loadPlayerDb } from "../src/players.ts";
import { ContextError } from "../src/session.ts";
import { LeagueSchema, TransactionSchema } from "../src/sleeper/schemas.ts";
import { fixture, fixtureSession, FIXTURE_OWNER_ROSTER, mutated } from "./helpers.ts";

type MatchupJson = { roster_id: number; matchup_id: number | null };
type LeagueJson = { status: string; roster_positions: string[]; settings: Record<string, number>; scoring_settings: Record<string, number> };

describe("review regressions", () => {
  it("does not pair the Owner with another team when both have no matchup", async () => {
    const matchups = mutated<MatchupJson[]>("matchups_3", (ms) => {
      const mine = ms.find((m) => m.roster_id === FIXTURE_OWNER_ROSTER)!;
      const mineId = mine.matchup_id;
      for (const m of ms) if (m.matchup_id === mineId) m.matchup_id = null;
      ms.find((m) => m.matchup_id !== null)!.matchup_id = null; // a third team without a game
    });
    const { session } = fixtureSession({ overrides: { matchups_3: matchups } });
    const out = await matchupsCommand(session, { week: 3 });
    expect(out).toMatch(/Your matchup: none this week/);
    expect(out).not.toMatch(/## Your matchup: \d/);
  });

  it("fails closed once the league has been renewed", async () => {
    const league = mutated<LeagueJson>("league", (l) => (l.status = "complete"));
    const renewed = [{ league_id: "999", previous_league_id: fixture<{ league_id: string }>("league").league_id, season: "2027", name: "x" }];
    const { session } = fixtureSession({ overrides: { league, user_leagues: renewed } });
    const err = await session.data().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContextError);
    expect((err as ContextError).failures.map((f) => f.code)).toContain("LEAGUE_RENEWED");
  });

  it("passes a completed league that has not been renewed yet", async () => {
    const league = mutated<LeagueJson>("league", (l) => (l.status = "complete"));
    const { session, calls } = fixtureSession({ overrides: { league } });
    await expect(session.data()).resolves.toBeDefined();
    expect(calls.some((c) => c.startsWith("/user/"))).toBe(true);
  });

  it("surfaces context warnings and stale player data as notices", async () => {
    const { session } = fixtureSession({ owner: null });
    await session.data();
    expect((await session.notices()).join()).toMatch(/owner roster is not configured/);
  });

  it("treats a corrupt fresh player cache as a miss", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "ff-players-"));
    writeFileSync(join(cacheDir, "players-nfl.json"), "{not json");
    const fetchPlayers = vi.fn(async () => fixture<Record<string, never>>("players"));
    const r = await loadPlayerDb({ cacheDir, fetchPlayers });
    expect(r.refreshed).toBe(true);
  });

  it("marks in-progress weeks and untracked trending in ff player", async () => {
    const { session } = fixtureSession();
    const { rosters } = await session.data();
    const out = await playerCommand(session, rosters[0]!.players[0]!);
    expect(out).toMatch(/W4\*/);
    expect(out).toMatch(/Adds in last 24h across Sleeper: (\d+|not in the top 100)/);
    expect(out).not.toMatch(/Adds in last 24h across Sleeper: 0$/m);
  });

  it("derives slot text from the roster instead of assuming no K/DEF", async () => {
    const league = mutated<LeagueJson>("league", (l) => {
      l.roster_positions = ["K", ...l.roster_positions];
      l.scoring_settings.fgm_50p = 5;
    });
    const { session } = fixtureSession({ overrides: { league } });
    const md = renderConstitution((await session.data()).ctx);
    expect(md).not.toMatch(/no kicker/);
    expect(md).toMatch(/Startable positions: .*K/);
    expect(md).toMatch(/fgm_50p\s+5/);
    expect(md).not.toMatch(/irrelevant.*fgm_50p/);
  });

  it("lists players released in a trade", async () => {
    const { session } = fixtureSession();
    const { ctx } = await session.data();
    const db = await session.players();
    const [a, b, c] = [...db.keys()];
    const trade = TransactionSchema.parse({
      transaction_id: "1",
      type: "trade",
      status: "complete",
      leg: 3,
      created: 0,
      roster_ids: [1, 2],
      adds: { [a!]: 2, [b!]: 1 },
      drops: { [a!]: 1, [b!]: 2, [c!]: 2 },
      draft_picks: [],
      waiver_budget: [],
    });
    expect(describeTransaction(ctx, db, trade)).toMatch(/manager02 gets .*; drops /);
  });

  it("keeps the rules hash stable across chat and progress fields", () => {
    const base = LeagueSchema.parse(fixture("league"));
    const chatty = LeagueSchema.parse({ ...fixture<object>("league"), last_message_id: "123", last_read_id: "9" });
    const later = LeagueSchema.parse(mutated<LeagueJson>("league", (l) => (l.settings.leg = 9)));
    const ruleChange = LeagueSchema.parse(mutated<LeagueJson>("league", (l) => (l.scoring_settings.pass_td = 6)));
    expect(rulesHash(chatty)).toBe(rulesHash(base));
    expect(rulesHash(later)).toBe(rulesHash(base));
    expect(rulesHash(ruleChange)).not.toBe(rulesHash(base));
  });

  it("states the free-agent filter and keeps young stashes", async () => {
    const { session } = fixtureSession();
    const out = await freeAgentsCommand(session, { limit: 200 });
    expect(out).toMatch(/Filter: on an NFL team/);
  });
});
