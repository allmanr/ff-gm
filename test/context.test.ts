import { describe, expect, it } from "vitest";
import { LEAGUE_ID } from "../src/config.ts";
import { buildLeagueContext, receptionValue, type ContextInput } from "../src/context.ts";
import { renderConstitution } from "../src/constitution.ts";
import { ContextError, OwnerUnsetError } from "../src/session.ts";
import { LeagueSchema, RostersSchema } from "../src/sleeper/schemas.ts";
import { fixture, fixtureOwner, fixtureSession, FIXTURE_OWNER_ROSTER, mutated } from "./helpers.ts";

type LeagueJson = {
  league_id: string;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: Record<string, number>;
};

function input(overrides: Partial<ContextInput> = {}): ContextInput {
  return {
    expectedLeagueId: LEAGUE_ID,
    league: LeagueSchema.parse(fixture("league")),
    users: fixture("users"),
    rosters: RostersSchema.parse(fixture("rosters")),
    drafts: fixture("drafts"),
    nflState: fixture("nfl_state"),
    owner: fixtureOwner(),
    fetchedAt: new Date("2026-10-02T12:00:00Z"),
    ...overrides,
  };
}

const withLeague = (fn: (l: LeagueJson) => void) => LeagueSchema.parse(mutated<LeagueJson>("league", fn));
const codes = (i: ContextInput) => buildLeagueContext(i).failures.map((f) => f.code);

describe("league invariants", () => {
  it("passes for the recorded league", () => {
    const { context, failures } = buildLeagueContext(input());
    expect(failures).toEqual([]);
    expect(context.format).toMatchObject({ dynasty: true, superflexSlots: 1, receptionPoints: 1, teReceptionBonus: 0.5 });
    expect(context.owner).toMatchObject({ status: "verified", rosterId: FIXTURE_OWNER_ROSTER });
  });

  it.each([
    ["redraft", (l: LeagueJson) => (l.settings.type = 0), "NOT_DYNASTY"],
    ["keeper", (l: LeagueJson) => (l.settings.type = 1), "NOT_DYNASTY"],
    ["1QB", (l: LeagueJson) => (l.roster_positions = l.roster_positions.map((p) => (p === "SUPER_FLEX" ? "FLEX" : p))), "NOT_SUPERFLEX"],
    ["half PPR", (l: LeagueJson) => (l.scoring_settings.rec = 0.5), "NOT_FULL_PPR"],
    ["no rec key", (l: LeagueJson) => delete l.scoring_settings.rec, "NOT_FULL_PPR"],
    ["no TE bonus", (l: LeagueJson) => delete l.scoring_settings.bonus_rec_te, "NO_TE_BONUS"],
    ["zero TE bonus", (l: LeagueJson) => (l.scoring_settings.bonus_rec_te = 0), "NO_TE_BONUS"],
    ["unknown slot", (l: LeagueJson) => l.roster_positions.push("MYSTERY"), "UNKNOWN_ROSTER_SLOT"],
    ["other league", (l: LeagueJson) => (l.league_id = "1"), "LEAGUE_ID_MISMATCH"],
  ])("fails closed for %s", (_name, mutate, code) => {
    expect(codes(input({ league: withLeague(mutate) }))).toContain(code);
  });

  it("fails when rosters are missing or a player is on two rosters", () => {
    const rosters = RostersSchema.parse(fixture("rosters"));
    expect(codes(input({ rosters: rosters.slice(1) }))).toContain("ROSTER_COUNT_MISMATCH");
    const dup = RostersSchema.parse(fixture("rosters"));
    dup[1]!.players.push(dup[0]!.players[0]!);
    expect(codes(input({ rosters: dup }))).toContain("DUPLICATE_ROSTERED_PLAYER");
  });

  it("fails on last season's league during the regular season, warns in the offseason", () => {
    const old = withLeague((l) => ((l as unknown as { season: string }).season = "2025"));
    expect(codes(input({ league: old }))).toContain("SEASON_MISMATCH");
    const off = { ...fixture<Record<string, unknown>>("nfl_state"), season_type: "off" } as ContextInput["nflState"];
    const r = buildLeagueContext(input({ league: old, nflState: off }));
    expect(r.failures).toEqual([]);
    expect(r.context.warnings.join()).toMatch(/successor league/);
  });

  it("rejects an owner config that no longer matches roster ownership", () => {
    const wrongRoster = { ...fixtureOwner(), ownerRosterId: FIXTURE_OWNER_ROSTER + 1 };
    expect(codes(input({ owner: wrongRoster }))).toContain("OWNER_ROSTER_MISMATCH");
    const wrongLeague = { ...fixtureOwner(), leagueId: "123" };
    expect(codes(input({ owner: wrongLeague }))).toContain("OWNER_LEAGUE_MISMATCH");
  });

  it("allows league-wide data without an owner but records why franchise work is blocked", () => {
    const { context, failures } = buildLeagueContext(input({ owner: null }));
    expect(failures).toEqual([]);
    expect(context.owner.status).toBe("unset");
    expect(context.warnings.join()).toMatch(/owner roster is not configured/);
  });

  it("surfaces unrecognized non-zero scoring keys instead of treating them as zero", () => {
    const l = withLeague((x) => {
      x.scoring_settings.mystery_bonus = 3;
      x.scoring_settings.mystery_zero = 0;
    });
    const { context, failures } = buildLeagueContext(input({ league: l }));
    expect(failures).toEqual([]);
    expect(context.unresolvedScoringKeys).toEqual(["mystery_bonus"]);
    expect(renderConstitution(context)).toMatch(/Unresolved scoring keys \(block exact scoring\): mystery_bonus/);
  });
});

describe("TE bonus follows primary position", () => {
  it("values receptions by position: TE 1.5, RB/WR 1.0", () => {
    const { context } = buildLeagueContext(input());
    expect(receptionValue(context, "TE")).toBe(1.5);
    expect(receptionValue(context, "RB")).toBe(1);
    expect(receptionValue(context, "WR")).toBe(1);
    expect(receptionValue(context, "QB")).toBe(1);
  });

  it("stacks position bonuses with rec when they exist", () => {
    const l = withLeague((x) => (x.scoring_settings.bonus_rec_rb = 0.25));
    const { context } = buildLeagueContext(input({ league: l }));
    expect(receptionValue(context, "RB")).toBe(1.25);
  });
});

describe("IDs stay strings", () => {
  it("keeps the 19-digit league ID exactly", () => {
    const l = LeagueSchema.parse(fixture("league"));
    expect(l.league_id).toBe("1314802188052090880");
    expect(Number(l.league_id) > Number.MAX_SAFE_INTEGER).toBe(true);
  });

  it("rejects a numeric league ID rather than coercing it", () => {
    const raw = { ...fixture<Record<string, unknown>>("league"), league_id: 1314802188052090880 };
    expect(LeagueSchema.safeParse(raw).success).toBe(false);
  });
});

describe("the gate", () => {
  it("returns validated data for the recorded league", async () => {
    const { session } = fixtureSession();
    const { ctx } = await session.data();
    expect(ctx.leagueId).toBe(LEAGUE_ID);
  });

  it("refuses all downstream data when validation fails, without fetching it", async () => {
    const bad = mutated<LeagueJson>("league", (l) => (l.scoring_settings.rec = 0.5));
    const { session, calls } = fixtureSession({ overrides: { league: bad } });
    await expect(session.data()).rejects.toBeInstanceOf(ContextError);
    await expect(session.players()).rejects.toBeInstanceOf(ContextError);
    await expect(session.matchups(3)).rejects.toBeInstanceOf(ContextError);
    await expect(session.transactions(3)).rejects.toBeInstanceOf(ContextError);
    await expect(session.tradedPicks()).rejects.toBeInstanceOf(ContextError);
    expect(calls.some((c) => /players|matchups|transactions|traded_picks|trending/.test(c))).toBe(false);
  });

  it("fails closed on empty and malformed payloads", async () => {
    for (const league of [{}, null, [], { ...fixture<object>("league"), roster_positions: "QB" }]) {
      const { session } = fixtureSession({ overrides: { league } });
      await expect(session.data()).rejects.toThrow();
    }
    const { session } = fixtureSession({ overrides: { rosters: [] } });
    await expect(session.data()).rejects.toBeInstanceOf(ContextError);
  });

  it("blocks franchise commands when no owner is configured", async () => {
    const { session } = fixtureSession({ owner: null });
    await expect(session.ownerRosterId()).rejects.toBeInstanceOf(OwnerUnsetError);
  });
});
