import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { byeWeeks, impliedTotals, kickoffCt, loadSchedule, parseCsv, parseGames, scheduleCommand, SCHEDULE_ATTRIBUTION } from "../src/schedule.ts";
import { createSession } from "../src/session.ts";
import { createSleeperClient } from "../src/sleeper/client.ts";
import { fixture, fixtureFetch, fixtureOwner, FIXTURE_OWNER_ROSTER } from "./helpers.ts";

const HEAD =
  "game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location,result,total,spread_line,total_line,stadium";
const row = (week: number, away: string, home: string, time = "13:00", spread = "3.5", total = "45.5", score = ["", ""]) =>
  `2026_${week}_${away}_${home},2026,REG,${week},2026-10-11,Sunday,${time},${away},${score[0]},${home},${score[1]},Home,,,${spread},${total},"Stadium, Inc."`;

describe("schedule parsing", () => {
  it("parses quoted fields and CRLF", () => {
    expect(parseCsv('a,"b, c","d ""q"""\r\n1,2,3\n')).toEqual([["a", "b, c", 'd "q"'], ["1", "2", "3"]]);
  });

  it("maps nflverse team codes to Sleeper's and keeps only the season", () => {
    const csv = [HEAD, row(5, "LA", "SEA"), row(5, "KC", "BUF").replace(/^2026_5_KC_BUF,2026/, "2025_5_KC_BUF,2025")].join("\n");
    const games = parseGames(csv, "2026");
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ away: "LAR", home: "SEA", spread_line: 3.5, total_line: 45.5, away_score: null });
  });

  it("rejects a file without the expected columns or games", () => {
    expect(() => parseGames("x,y\n1,2", "2026")).toThrow(/unexpected columns/);
    expect(() => parseGames(HEAD, "2026")).toThrow(/no games/);
  });

  it("converts Eastern kickoffs to Central and computes implied totals", () => {
    const [g] = parseGames([HEAD, row(5, "PHI", "JAX", "09:30", "-3", "44.5")].join("\n"), "2026");
    expect(kickoffCt(g!)).toBe("Sun 8:30 AM CT");
    expect(kickoffCt({ ...g!, gametime: "13:00" })).toBe("Sun 12:00 PM CT");
    expect(kickoffCt({ ...g!, gametime: "20:15" })).toBe("Sun 7:15 PM CT");
    // spread_line < 0: away team favored by 3.
    expect(impliedTotals(g!)).toEqual({ home: 20.75, away: 23.75 });
  });

  it("caches the file and falls back to it when a refresh fails", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "ff-sched-"));
    const csv = [HEAD, row(5, "LA", "SEA")].join("\n");
    const ok = vi.fn(async () => new Response(csv));
    await loadSchedule({ season: "2026", cacheDir, fetch: ok });
    await loadSchedule({ season: "2026", cacheDir, fetch: ok });
    expect(ok).toHaveBeenCalledTimes(1);
    const later = Date.now() + 7 * 3600_000;
    const r = await loadSchedule({ season: "2026", cacheDir, fetch: async () => new Response("down", { status: 503 }), now: () => later });
    expect(r.stale).toBe(true);
  });
});

describe("bye weeks", () => {
  it("finds weeks without a regular-season game, ignoring playoff games", () => {
    const csv = [
      HEAD,
      row(1, "KC", "BUF"),
      row(2, "BUF", "LA"),
      row(3, "KC", "LA"),
      row(3, "BUF", "NYJ"),
      row(19, "KC", "BUF").replace(",REG,19,", ",WC,19,"),
    ].join("\n");
    const byes = byeWeeks(parseGames(csv, "2026"));
    expect(byes.get("KC")).toEqual([2]);
    expect(byes.get("BUF")).toEqual([]);
    expect(byes.get("LAR")).toEqual([1]);
  });
});

describe("ff schedule", () => {
  it("lists byes and flags the owner's starters on bye", async () => {
    type RosterJson = { roster_id: number; starters: string[] };
    type PlayerJson = Record<string, { team: string | null; position: string | null }>;
    const players = fixture<PlayerJson>("players");
    const mine = fixture<RosterJson[]>("rosters").find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!;
    const starterTeam = players[mine.starters.find((id) => players[id]?.team)!]!.team!;
    const allTeams = [...new Set(Object.values(players).map((p) => p.team).filter((t): t is string => Boolean(t)))].filter(
      (t) => t !== starterTeam,
    );
    const lines = [HEAD];
    for (let i = 0; i + 1 < allTeams.length; i += 2) lines.push(row(5, allTeams[i]!, allTeams[i + 1]!));
    lines.push(row(6, starterTeam, allTeams[0]!)); // the starter's team plays in week 6, so it has a bye in week 5
    const { fetch } = fixtureFetch();
    const session = createSession({
      client: createSleeperClient({ fetch, retries: 0 }),
      owner: fixtureOwner(),
      cacheDir: mkdtempSync(join(tmpdir(), "ff-sched-")),
      scheduleFetch: async () => new Response(lines.join("\n")),
    });
    const out = await scheduleCommand(session, { week: 5 });
    expect(out).toMatch(new RegExp(`Byes: .*${starterTeam}`));
    expect(out).toMatch(/Starters on bye: /);
    expect(out).toContain(SCHEDULE_ATTRIBUTION);
  });

  it("uses the week's own Sleeper lineup, not the current week's roster starters", async () => {
    type RosterJson = { roster_id: number; starters: string[]; players: string[] };
    type PlayerJson = Record<string, { team: string | null; position: string | null }>;
    const players = fixture<PlayerJson>("players");
    const mine = fixture<RosterJson[]>("rosters").find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!;
    const starterTeam = players[mine.starters.find((id) => players[id]?.team)!]!.team!;
    const allTeams = [...new Set(Object.values(players).map((p) => p.team).filter((t): t is string => Boolean(t)))].filter(
      (t) => t !== starterTeam,
    );
    const playing = new Set(allTeams.slice(0, allTeams.length - (allTeams.length % 2)));
    const benchOnly = mine.players.filter((id) => !mine.starters.includes(id) && playing.has(players[id]?.team ?? ""));
    const lines = [HEAD];
    for (let i = 0; i + 1 < allTeams.length; i += 2) lines.push(row(5, allTeams[i]!, allTeams[i + 1]!));
    lines.push(row(6, starterTeam, allTeams[0]!));
    // Week 5 lineup already set to bench players, so no current starter on bye is in it.
    const { fetch } = fixtureFetch({ empty: [{ roster_id: FIXTURE_OWNER_ROSTER, matchup_id: 1, starters: benchOnly }] });
    const session = createSession({
      client: createSleeperClient({ fetch, retries: 0 }),
      owner: fixtureOwner(),
      cacheDir: mkdtempSync(join(tmpdir(), "ff-sched-")),
      scheduleFetch: async () => new Response(lines.join("\n")),
    });
    const out = await scheduleCommand(session, { week: 5 });
    expect(benchOnly.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/starters on bye: /i);
    expect(out).toMatch(/^start\s/m);
  });
});
