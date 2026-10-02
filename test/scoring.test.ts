import { describe, expect, it } from "vitest";
import { scoreStatLine, unsupportedScoringKeys } from "../src/scoring.ts";
import { buildStatBook, ppg } from "../src/stats.ts";
import { fixtureSession, mutated } from "./helpers.ts";

type LeagueJson = { scoring_settings: Record<string, number> };

async function ctxWith(mutate?: (l: LeagueJson) => void) {
  const { session } = fixtureSession(mutate ? { overrides: { league: mutated<LeagueJson>("league", mutate) } } : {});
  return (await session.data()).ctx;
}

describe("exact scoring engine", () => {
  const catches = { receptions: 7, targets: 8, receiving_yards: 105, receiving_tds: 1 };

  it("applies the TE reception bonus by primary position", async () => {
    const ctx = await ctxWith();
    expect(scoreStatLine(ctx, "TE", catches)).toBe(7 * 1.5 + 10.5 + 6); // 27
    expect(scoreStatLine(ctx, "WR", catches)).toBe(7 * 1 + 10.5 + 6); // 23.5
    expect(scoreStatLine(ctx, "RB", catches)).toBe(23.5);
  });

  it("scores passing, rushing, two-point plays, and every lost fumble", async () => {
    const ctx = await ctxWith();
    const qb = {
      passing_yards: 300,
      passing_tds: 2,
      passing_interceptions: 1,
      passing_2pt_conversions: 1,
      carries: 5,
      rushing_yards: 30,
      rushing_tds: 1,
      fumbles_lost_total: 2,
    };
    // 12 + 8 - 2 + 2 + 3 + 6 - 4
    expect(scoreStatLine(ctx, "QB", qb)).toBe(25);
  });

  it("follows the league's settings rather than defaults", async () => {
    const ctx = await ctxWith((l) => {
      l.scoring_settings.pass_td = 6;
      l.scoring_settings.bonus_rec_rb = 0.25;
      l.scoring_settings.rec_fd = 0.5;
    });
    expect(scoreStatLine(ctx, "QB", { passing_tds: 1 })).toBe(6);
    expect(scoreStatLine(ctx, "RB", { receptions: 4, receiving_first_downs: 2 })).toBe(4 + 1 + 1);
  });

  it("reports non-zero keys the stat source cannot supply", async () => {
    const ctx = await ctxWith((l) => (l.scoring_settings.bonus_rec_yd_100 = 3));
    expect(unsupportedScoringKeys(ctx)).toEqual(expect.arrayContaining(["bonus_rec_yd_100", "st_ff", "st_fum_rec"]));
    expect(unsupportedScoringKeys(ctx)).not.toContain("bonus_rec_te");
    expect(unsupportedScoringKeys(ctx)).not.toContain("fgm_50p");
  });
});

describe("stat book", () => {
  const ROSTERS = "season,team,position,full_name,gsis_id,sleeper_id\n2026,NYJ,TE,A,00-1,S1\n2026,BUF,WR,B,00-2,NA\n";
  const STATS = [
    "player_id,player_display_name,position,season,week,season_type,team,opponent_team,receptions,targets,receiving_yards,receiving_tds",
    "00-1,A,TE,2026,1,REG,NYJ,TEN,3,3,21,0",
    "00-1,A,TE,2026,2,REG,NYJ,GB,7,8,105,1",
    "00-1,A,TE,2025,2,REG,NYJ,GB,9,9,90,1",
    "00-1,A,TE,2026,19,POST,NYJ,GB,9,9,90,1",
    "00-2,B,WR,2026,1,REG,BUF,HOU,1,2,34,1",
  ].join("\n");

  it("maps nflverse IDs to Sleeper IDs and scores regular-season weeks of the league's season", async () => {
    const { session } = fixtureSession();
    const { ctx } = await session.data();
    const db = new Map([["S1", { player_id: "S1", position: "TE" }]]);
    const book = buildStatBook({ ctx, db, statsCsv: STATS, rostersCsv: ROSTERS });
    const games = book.byPlayer.get("S1")!;
    expect(games.map((g) => [g.week, g.points])).toEqual([
      [1, 3 * 1.5 + 2.1],
      [2, 27],
    ]);
    expect(book.unmatched).toBe(1); // the WR has no Sleeper ID
    expect(ppg(games)).toBeCloseTo((6.6 + 27) / 2, 5);
    expect(ppg(games, 1)).toBe(27);
    expect(book.label).toMatch(/nflverse \(CC-BY-4.0/);
  });
});
