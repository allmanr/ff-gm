import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createSession, OwnerUnsetError } from "../src/session.ts";
import { createSleeperClient } from "../src/sleeper/client.ts";
import { tradeCommand, valuesCommand } from "../src/value-commands.ts";
import { FANTASYCALC_ATTRIBUTION, loadValueBook, valueFormat } from "../src/values.ts";
import { UsageError } from "../src/commands.ts";
import { fixture, fixtureFetch, fixtureOwner, fixtureSession, FIXTURE_OWNER_ROSTER } from "./helpers.ts";

type RosterJson = { roster_id: number; players: string[]; reserve: string[] | null };

/** Synthetic market values (not FantasyCalc data): 1000 + roster_id*10 + index for every rostered player. */
function syntheticValues({ tiers = true, skip = [] as string[] } = {}) {
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
  // Generic picks for both seasons; Early/Mid/Late rows (generic +200 / +0 / -100) for the next draft only.
  const pick = (name: string, value: number) => {
    if (!skip.includes(name)) rows.push({ player: { name, sleeperId: `FP_${name}`, position: "PICK" }, value, overallRank: 1, positionRank: 1 });
  };
  for (const season of ["2027", "2028"]) {
    ["1st", "2nd", "3rd", "4th"].forEach((rd, i) => {
      const generic = 400 - i * 100;
      pick(`${season} ${rd}`, generic);
      if (tiers && season === "2027") {
        pick(`${season} ${rd} (Early)`, generic + 200);
        pick(`${season} ${rd} (Mid)`, generic);
        pick(`${season} ${rd} (Late)`, generic - 100);
      }
    });
  }
  return rows;
}

function valuesSession(valuesFetch = vi.fn(async (_url: string) => Response.json(syntheticValues())), overrides = {}) {
  const { fetch } = fixtureFetch(overrides);
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
  it("requires verified ownership before fetching values for a trade", async () => {
    const { session, calls } = fixtureSession({ owner: null });
    const values = vi.spyOn(session, "values");
    await expect(tradeCommand(session, "2027 R1", "2027 R2")).rejects.toBeInstanceOf(OwnerUnsetError);
    expect(values).not.toHaveBeenCalled();
    expect(calls).not.toContain("/players/nfl");
  });
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
  it.each([false, true])("reserves only one attempt across processes after cache expiry (failure=%s)", async (failure) => {
    const { ctx } = await fixtureSession().session.data();
    const cacheDir = mkdtempSync(join(tmpdir(), "ff-values-concurrent-"));
    try {
      await loadValueBook({ ctx, cacheDir, fetch: async () => Response.json(syntheticValues()) });
      const file = join(cacheDir, readdirSync(cacheDir).find((f) => f.endsWith(".json"))!);
      const old = (Date.now() - 7 * 3600_000) / 1000;
      utimesSync(file, old, old);
      utimesSync(`${file}.attempt`, old, old);
      writeFileSync(join(cacheDir, "input.json"), JSON.stringify({ ctx, rows: syntheticValues() }));
      const moduleUrl = pathToFileURL(join(import.meta.dirname, "../src/values.ts")).href;
      const worker = (id: number) => {
        const code = `
          import fs from "node:fs";
          import { syncBuiltinESMExports } from "node:module";
          import { setTimeout } from "node:timers/promises";
          const cacheDir = ${JSON.stringify(cacheDir)};
          const input = JSON.parse(fs.readFileSync(cacheDir + "/input.json", "utf8"));
          const write = fs.writeFileSync;
          // Widen the reported check/write race deterministically without any network calls.
          fs.writeFileSync = (file, ...args) => {
            if (String(file).endsWith(".attempt")) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
            return write(file, ...args);
          };
          syncBuiltinESMExports();
          const { loadValueBook } = await import(${JSON.stringify(moduleUrl)});
          fs.writeFileSync(cacheDir + "/ready-${id}", "ready");
          while (!fs.existsSync(cacheDir + "/go")) await setTimeout(10);
          const book = await loadValueBook({
            ctx: input.ctx, cacheDir,
            fetch: async () => {
              fs.appendFileSync(cacheDir + "/requests", "request\\n");
              return ${failure ? 'new Response("down", { status: 503 })' : 'Response.json(input.rows)'};
            }
          });
          console.log(JSON.stringify({ stale: book.stale, fetchedAtMs: book.fetchedAtMs }));
        `;
        const child = spawn(process.execPath, ["--input-type=module", "--eval", code], { stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr += String(chunk); });
        const done = new Promise<void>((resolve, reject) => {
          child.on("error", reject);
          child.on("close", (status) => status === 0 ? resolve() : reject(new Error(stderr)));
        });
        return { child, done };
      };
      const workers = [worker(1), worker(2)];
      try {
        await vi.waitFor(() => {
          expect(existsSync(join(cacheDir, "ready-1"))).toBe(true);
          expect(existsSync(join(cacheDir, "ready-2"))).toBe(true);
        }, { timeout: 3000 });
        writeFileSync(join(cacheDir, "go"), "go");
        await Promise.all(workers.map((w) => w.done));
        expect(readFileSync(join(cacheDir, "requests"), "utf8").trim().split("\n")).toHaveLength(1);
        const retry = vi.fn(async () => Response.json(syntheticValues()));
        await loadValueBook({ ctx, cacheDir, fetch: retry });
        expect(retry).not.toHaveBeenCalled();
        expect(existsSync(`${file}.attempt.lock`)).toBe(false);
      } finally {
        workers.forEach((w) => w.child.kill());
        await Promise.allSettled(workers.map((w) => w.done));
      }
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("does not fetch when another process holds the reservation lock and no cache exists", async () => {
    const { ctx } = await fixtureSession().session.data();
    const cacheDir = mkdtempSync(join(tmpdir(), "ff-values-"));
    const failing = vi.fn(async () => new Response("down", { status: 503 }));
    await expect(loadValueBook({ ctx, cacheDir, fetch: failing })).rejects.toThrow(/503/);
    const attempt = readdirSync(cacheDir).find((f) => f.endsWith(".attempt"))!;
    rmSync(join(cacheDir, attempt));
    mkdirSync(join(cacheDir, `${attempt}.lock`));
    const fetch = vi.fn(async () => Response.json(syntheticValues()));
    await expect(loadValueBook({ ctx, cacheDir, fetch })).rejects.toThrow(/reservation is locked/);
    expect(fetch).not.toHaveBeenCalled();
  });

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
    expect(out).toMatch(/2027 R1\s+400 \(600–300\)/); // generic headline, then the early–late range
    expect(out).toMatch(/2028 R1\s+400\s*$/m); // generic only: FantasyCalc has no 2028 tiers
    expect(out).toContain("FantasyCalc tier boundaries are undocumented");
  });

  it("shows no tier range when the payload has no tier rows", async () => {
    const { session } = valuesSession(vi.fn(async (_url: string) => Response.json(syntheticValues({ tiers: false }))));
    const out = await valuesCommand(session, "me", {});
    expect(out).toMatch(/2027 R1\s+400\s*$/m);
    expect(out).not.toContain("early–late");
    const { rosters } = await session.data();
    const give = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!.players[0]!;
    expect(await tradeCommand(session, `${give}, 2027 R2 (own)`, "2028 1st", "2")).not.toContain("tier range");
  });

  it("notes owned picks that FantasyCalc does not price", async () => {
    const { session } = valuesSession();
    expect(await valuesCommand(session, undefined, { league: true })).not.toContain("no FantasyCalc price");
    const missing = valuesSession(vi.fn(async (_url: string) => Response.json(syntheticValues({ skip: ["2028 4th"] }))));
    const out = await valuesCommand(missing.session, undefined, { league: true });
    expect(out).toMatch(/\d+ owned picks have no FantasyCalc price and count as 0 \(2028 4th\)/);
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
    const out = await tradeCommand(session, `${give}, 2027 R2 (own)`, `${get}`);
    const giveValue = 1000 + FIXTURE_OWNER_ROSTER * 10 + 0 + 300;
    const getValue = 1000 + 70 + 1;
    expect(out).toContain(`Trade check: with`);
    expect(out).toContain(`We give (${giveValue})`);
    expect(out).toContain(`We get (${getValue})`);
    expect(out).toContain(`Net market value for us: ${getValue - giveValue >= 0 ? "+" : ""}${getValue - giveValue}`);
    // 2027 2nd tiers are 500 (early) to 200 (late): best case we give the late tier, worst case the early.
    const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
    expect(out).toMatch(/2027 2nd pick \(own\)\s+300 \(500–200\)/);
    expect(out).toContain(`Pick tier range: net ${signed(getValue - (giveValue + 200))} to ${signed(getValue - (giveValue - 100))}`);
    expect(out).toContain(db.get(get)!.full_name!);
    expect(out).toContain(FANTASYCALC_ATTRIBUTION);
  });

  it("moves picks from the same draft slot through tiers together", async () => {
    const { session } = valuesSession();
    const { ctx } = await session.data();
    const ours = ctx.teams.find((t) => t.rosterId === FIXTURE_OWNER_ROSTER)!.managerName;
    // Roster 2 holds our 2027 R4: both picks below come from our draft slot, so they share a tier.
    // R3 tiers 400/200/100 and R4 tiers 300/100/0 net -100 at every tier, not -400 to +200.
    const out = await tradeCommand(session, "2027 R3 (own)", `2027 R4 (via ${ours})`, "2");
    expect(out).toContain("Net market value for us: -100");
    expect(out).toContain("Pick tier range: net -100 to -100");
  });

  it("never reads a 5-digit Sleeper ID as a draft pick", async () => {
    const { session } = valuesSession();
    const { rosters } = await session.data();
    const mine = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!;
    const fiveDigit = mine.players.find((id) => /^\d{5}$/.test(id))!;
    const out = await tradeCommand(session, fiveDigit, "2028 1st", "2");
    expect(out).not.toMatch(/\d{4} \d(st|nd|rd|th) pick\s+no value/);
    expect(out).toMatch(/2028 1st pick \(own\)\s+400/);
  });

  it("rejects ambiguous pick specifications with actionable errors", async () => {
    const { session } = valuesSession();
    const { rosters } = await session.data();
    const give = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!.players[0]!;
    const get = rosters.find((r) => r.roster_id === 7)!.players[1]!;
    await expect(tradeCommand(session, `${give}, 2027 R2`, `${get}`)).rejects.toThrow(
      /"2027 R2" is ambiguous: we own multiple 2027 R2 picks/,
    );
  });

  it("rejects wrong-side players in both give and get", async () => {
    const { session } = valuesSession();
    const { rosters } = await session.data();
    const mine = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!.players[0]!;
    const opp7 = rosters.find((r) => r.roster_id === 7)!.players[0]!;
    const opp8 = rosters.find((r) => r.roster_id === 8)!.players[0]!;

    // Cannot give a player held by another team
    await expect(tradeCommand(session, opp7, opp8)).rejects.toThrow(/not on our roster \(held by/);

    // Cannot get a player that is already on our roster
    await expect(tradeCommand(session, mine, mine, "7")).rejects.toThrow(/already on our roster/);

    // Cannot get a player held by a third team
    await expect(tradeCommand(session, mine, opp8, "7")).rejects.toThrow(/held by .*, not/);
  });

  it("rejects wrong-side picks in both give and get", async () => {
    const { session } = valuesSession();
    const { rosters } = await session.data();
    const mine = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!.players[0]!;
    const opp7 = rosters.find((r) => r.roster_id === 7)!.players[0]!;

    // We do not own a 2027 R1 pick via team 7
    await expect(tradeCommand(session, "2027 R1 (via 7)", opp7)).rejects.toThrow(
      /We do not own a 2027 R1 pick via/,
    );

    // Roster 2 traded away their 2027 R1 pick; they only own 2027 R1 via manager04
    await expect(tradeCommand(session, mine, "2027 R1 (own)", "2")).rejects.toThrow(
      /does not own a 2027 R1 pick via/,
    );
    // Roster 2 owns no 2026 R1 pick at all
    await expect(tradeCommand(session, mine, "2026 R1", "2")).rejects.toThrow(
      /does not own any 2026 round 1 pick/,
    );
  });

  it("requires counterparty when get contains only picks or is ambiguous", async () => {
    const { session } = valuesSession();
    const { rosters } = await session.data();
    const mine = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!.players[0]!;
    const opp7 = rosters.find((r) => r.roster_id === 7)!.players[0]!;
    const opp8 = rosters.find((r) => r.roster_id === 8)!.players[0]!;

    // Picks only without counterparty
    await expect(tradeCommand(session, mine, "2028 1st")).rejects.toThrow(
      /Cannot determine trade counterparty. Specify the counterparty with --with <team>/,
    );

    // Multiple opposing teams in get without counterparty
    await expect(tradeCommand(session, mine, `${opp7}, ${opp8}`)).rejects.toThrow(
      /Assets in "we get" belong to multiple teams/,
    );
  });

  it("resolves the counterparty and original teams by manager name", async () => {
    const { session } = valuesSession();
    const { ctx, rosters } = await session.data();
    const mine = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!.players[0]!;
    const name = (id: number) => ctx.teams.find((t) => t.rosterId === id)!.managerName;

    const out = await tradeCommand(session, mine, "2028 1st", name(2));
    expect(out).toContain("Trade check: with");
    expect(out).toMatch(/2028 1st pick \(own\)\s+400/);
    // Roster 2 holds roster 4's 2027 R1.
    expect(await tradeCommand(session, mine, `2027 R1 (via ${name(4)})`, "2")).toMatch(/2027 1st pick \(via /);
  });

  it("resolves picks in a season where no pick has been traded", async () => {
    const { session } = valuesSession(undefined, { traded_picks: [] });
    const { rosters } = await session.data();
    const mine = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!.players[0]!;
    const out = await tradeCommand(session, mine, "2028 R1 (own)", "2");
    expect(out).toMatch(/2028 1st pick \(own\)\s+400/);
    expect(out).toContain("2028 picks: no pick in that season has been traded");
  });

  it("rejects free agents on the get side", async () => {
    const { session } = valuesSession();
    const { rosters } = await session.data();
    const db = await session.players();
    const rostered = new Set(rosters.flatMap((r) => [...r.players, ...(r.reserve ?? []), ...(r.taxi ?? [])]));
    const mine = rosters.find((r) => r.roster_id === FIXTURE_OWNER_ROSTER)!.players[0]!;
    const freeAgent = [...db.keys()].find((id) => !rostered.has(id) && db.get(id)?.position === "WR")!;
    await expect(tradeCommand(session, mine, freeAgent, "7")).rejects.toThrow(/free agent, not a trade asset/);
    await expect(tradeCommand(session, mine, freeAgent)).rejects.toThrow(/free agent, not a trade asset/);
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
