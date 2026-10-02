import { mkdtempSync, utimesSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSession } from "../src/session.ts";
import { createSleeperClient } from "../src/sleeper/client.ts";
import { tradeCommand, valuesCommand } from "../src/value-commands.ts";
import { FANTASYCALC_ATTRIBUTION, loadValueBook, valueFormat } from "../src/values.ts";
import { UsageError } from "../src/commands.ts";
import { fixture, fixtureFetch, fixtureOwner, fixtureSession, FIXTURE_OWNER_ROSTER } from "./helpers.ts";

type RosterJson = { roster_id: number; players: string[]; reserve: string[] | null };

/** Synthetic market values (not FantasyCalc data): 1000 + roster_id*10 + index for every rostered player. */
function syntheticValues() {
  const players = fixture<Record<string, { full_name?: string; position?: string }>>("players");
  const rows: unknown[] = [];
  for (const r of fixture<RosterJson[]>("rosters")) {
    r.players.forEach((id, i) => {
      rows.push({
        player: { name: players[id]?.full_name ?? id, sleeperId: id, position: players[id]?.position ?? "WR" },
        value: 1000 + r.roster_id * 10 + i,
        overallRank: 1,
        positionRank: 1,
      });
    });
  }
  for (const season of ["2027", "2028"]) {
    ["1st", "2nd", "3rd", "4th"].forEach((rd, i) =>
      rows.push({ player: { name: `${season} ${rd}`, sleeperId: `FP_${season}_${i}`, position: "PICK" }, value: 400 - i * 100, overallRank: 1, positionRank: 1 }),
    );
    rows.push({ player: { name: `${season} 1st (Early)`, sleeperId: `FP_${season}_e`, position: "PICK" }, value: 9999, overallRank: 1, positionRank: 1 });
  }
  return rows;
}

function valuesSession(valuesFetch = vi.fn(async (_url: string) => Response.json(syntheticValues()))) {
  const { fetch } = fixtureFetch();
  const cacheDir = mkdtempSync(join(tmpdir(), "ff-values-"));
  const session = createSession({
    client: createSleeperClient({ fetch, retries: 0 }),
    owner: fixtureOwner(),
    cacheDir,
    valuesFetch,
  });
  return { session, valuesFetch, cacheDir };
}

describe("FantasyCalc format", () => {
  it("derives parameters from the validated league, not constants", async () => {
    const { session } = fixtureSession();
    const { ctx } = await session.data();
    expect(valueFormat(ctx).format).toEqual({ isDynasty: true, numQbs: "2", numTeams: 12, ppr: 1, tep: "te+" });
    expect(() => valueFormat({ ...ctx, format: { ...ctx.format, receptionPoints: 0.75 } })).toThrow(/0.75 PPR/);
    expect(() => valueFormat({ ...ctx, teams: ctx.teams.slice(0, 9) })).toThrow(/9-team/);
  });

  it("requests the documented endpoint with the league's format", async () => {
    const { session, valuesFetch } = valuesSession();
    await session.values();
    const url = valuesFetch.mock.calls[0]![0];
    expect(url).toBe("https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=1&tep=te%2B");
  });
});

describe("value cache", () => {
  it("never refetches within an hour, even when asked for fresher data", async () => {
    const { session } = fixtureSession();
    const { ctx } = await session.data();
    const cacheDir = mkdtempSync(join(tmpdir(), "ff-values-"));
    const fetch = vi.fn(async () => Response.json(syntheticValues()));
    await loadValueBook({ ctx, cacheDir, fetch });
    await loadValueBook({ ctx, cacheDir, fetch, maxAgeMs: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes after the max age and falls back to a stale cache when the refresh fails", async () => {
    const { session } = fixtureSession();
    const { ctx } = await session.data();
    const cacheDir = mkdtempSync(join(tmpdir(), "ff-values-"));
    await loadValueBook({ ctx, cacheDir, fetch: async () => Response.json(syntheticValues()) });
    const file = join(cacheDir, readdirSync(cacheDir).find((f) => f.endsWith(".json"))!);
    const old = (Date.now() - 7 * 3600_000) / 1000;
    utimesSync(file, old, old); // simulate seven hours passing since the last fetch
    utimesSync(`${file}.attempt`, old, old);
    const failing = vi.fn(async () => new Response("down", { status: 503 }));
    const book = await loadValueBook({ ctx, cacheDir, fetch: failing });
    expect(failing).toHaveBeenCalledTimes(1);
    expect(book.stale).toBe(true);
    expect(book.label).toMatch(/STALE/);
  });

  it("rejects malformed payloads instead of caching them", async () => {
    const { session } = fixtureSession();
    const { ctx } = await session.data();
    const cacheDir = mkdtempSync(join(tmpdir(), "ff-values-"));
    await expect(loadValueBook({ ctx, cacheDir, fetch: async () => Response.json([{ nope: 1 }]) })).rejects.toThrow();
    expect(readdirSync(cacheDir).filter((f) => f.endsWith(".json"))).toEqual([]);
  });

  it("does not retry a failed refresh within the hour (FantasyCalc's limit)", async () => {
    const { session } = fixtureSession();
    const { ctx } = await session.data();
    const cacheDir = mkdtempSync(join(tmpdir(), "ff-values-"));
    await loadValueBook({ ctx, cacheDir, fetch: async () => Response.json(syntheticValues()) });
    const file = join(cacheDir, readdirSync(cacheDir).find((f) => f.endsWith(".json"))!);
    const old = (Date.now() - 7 * 3600_000) / 1000;
    utimesSync(file, old, old);
    utimesSync(`${file}.attempt`, old, old);
    const failing = vi.fn(async () => new Response("busy", { status: 429 }));
    expect((await loadValueBook({ ctx, cacheDir, fetch: failing })).stale).toBe(true);
    expect((await loadValueBook({ ctx, cacheDir, fetch: failing })).stale).toBe(true);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("with no cache, fails without refetching until the hour has passed", async () => {
    const { session } = fixtureSession();
    const { ctx } = await session.data();
    const cacheDir = mkdtempSync(join(tmpdir(), "ff-values-"));
    const failing = vi.fn(async () => new Response("down", { status: 503 }));
    await expect(loadValueBook({ ctx, cacheDir, fetch: failing })).rejects.toThrow(/503/);
    await expect(loadValueBook({ ctx, cacheDir, fetch: failing })).rejects.toThrow(/one request per hour/);
    expect(failing).toHaveBeenCalledTimes(1);
  });
});

describe("value commands", () => {
  it("values a roster with attribution and counts IR players once", async () => {
    const { session } = valuesSession();
    const { rosters } = await session.data();
    const mine = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!;
    // Sleeper lists IR players in both `players` and `reserve`.
    mine.reserve = [mine.players[0]!];
    const out = await valuesCommand(session, "me", {});
    const expected = mine.players.reduce((sum, _id, i) => sum + 1000 + FIXTURE_OWNER_ROSTER * 10 + i, 0);
    const playersTotal = Number(out.match(/Totals: players (\d+)/)![1]);
    // Only QB/RB/WR/TE count toward position totals; every fixture roster player is one of those.
    expect(playersTotal).toBe(expected);
    expect(out).toContain(FANTASYCALC_ATTRIBUTION);
    expect(out).toMatch(/2027 R1\s+400/); // generic pick value, not the "(Early)" variant
  });

  it("ranks every team by market value", async () => {
    const { session } = valuesSession();
    const out = await valuesCommand(session, undefined, { league: true });
    expect(out.split("\n").filter((l) => /^\d+\s+manager/.test(l))).toHaveLength(12);
    expect(out).toContain(FANTASYCALC_ATTRIBUTION);
  });

  it("checks a trade's market value, including picks", async () => {
    const { session } = valuesSession();
    const { rosters } = await session.data();
    const db = await session.players();
    const give = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!.players[0]!;
    const get = rosters.find((r) => r.roster_id === 7)!.players[1]!;
    const out = await tradeCommand(session, `${give}, 2027 R2`, `${get}`);
    const giveValue = 1000 + FIXTURE_OWNER_ROSTER * 10 + 0 + 300;
    const getValue = 1000 + 70 + 1;
    expect(out).toContain(`We give (${giveValue})`);
    expect(out).toContain(`We get (${getValue})`);
    expect(out).toContain(`Net market value for us: ${getValue - giveValue >= 0 ? "+" : ""}${getValue - giveValue}`);
    expect(out).toContain(db.get(get)!.full_name!);
    expect(out).toContain(FANTASYCALC_ATTRIBUTION);
  });

  it("never reads a 5-digit Sleeper ID as a draft pick", async () => {
    const { session } = valuesSession();
    const { rosters } = await session.data();
    const fiveDigit = rosters.flatMap((r) => r.players).find((id) => /^\d{5}$/.test(id))!;
    const out = await tradeCommand(session, fiveDigit, "2028 1st");
    expect(out).not.toMatch(/\d{4} \d(st|nd|rd|th) pick\s+no value/);
    expect(out).toMatch(/2028 1st pick\s+400/);
  });

  it("refuses ambiguous names and missing sides", async () => {
    const { session } = valuesSession();
    await expect(tradeCommand(session, "a", "b")).rejects.toBeInstanceOf(UsageError);
    await expect(tradeCommand(session, undefined, "x")).rejects.toBeInstanceOf(UsageError);
  });

  it("reports unavailable values instead of failing league commands", async () => {
    const { session } = valuesSession(vi.fn(async () => new Response("down", { status: 503 })));
    await expect(valuesCommand(session, "me", {})).rejects.toThrow(/Market values unavailable/);
  });
});
