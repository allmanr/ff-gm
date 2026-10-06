import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPlayerDb, PLAYER_CACHE_MAX_AGE_MS } from "../src/players.ts";
import { fixture } from "./helpers.ts";
import { createSleeperClient } from "../src/sleeper/client.ts";

const temporary: string[] = [];
const players = fixture<Record<string, never>>("players");
const setup = () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "ff-player-concurrency-"));
  temporary.push(cacheDir);
  return { cacheDir, file: join(cacheDir, "players-nfl.json") };
};
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("parallel player refresh", () => {
  it.each(["http", "network"])("makes one players HTTP attempt when a %s failure occurs", async (failure) => {
    const fetch = vi.fn(async () => {
      if (failure === "network") throw new Error("Network unavailable");
      return new Response("Unavailable", { status: 503 });
    });
    const sleep = vi.fn(async () => undefined);
    await expect(createSleeperClient({ fetch, sleep }).players()).rejects.toThrow("failed after 1 attempts");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("shares a successful cold refresh between simultaneous loads in one process", async () => {
    const { cacheDir } = setup();
    const fetchPlayers = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return players;
    });
    const results = await Promise.all([loadPlayerDb({ cacheDir, fetchPlayers }), loadPlayerDb({ cacheDir, fetchPlayers })]);
    expect(fetchPlayers).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.players.size)).toEqual([Object.keys(players).length, Object.keys(players).length]);
    expect(results.filter((result) => result.refreshed)).toHaveLength(1);
  });

  it.each([false, true])("allows only one daily refresh across two actual processes (failure=%s)", async (failure) => {
    const { cacheDir, file } = setup();
    if (failure) {
      writeFileSync(file, JSON.stringify(players));
      const old = (Date.now() - 2 * PLAYER_CACHE_MAX_AGE_MS) / 1000;
      utimesSync(file, old, old);
    }
    writeFileSync(join(cacheDir, "input.json"), JSON.stringify(players));
    const moduleUrl = pathToFileURL(join(import.meta.dirname, "../src/players.ts")).href;
    const worker = (id: number) => {
      const code = `
        import fs from "node:fs";
        import { setTimeout } from "node:timers/promises";
        import { loadPlayerDb } from ${JSON.stringify(moduleUrl)};
        const cacheDir = ${JSON.stringify(cacheDir)};
        const players = JSON.parse(fs.readFileSync(cacheDir + "/input.json", "utf8"));
        fs.writeFileSync(cacheDir + "/ready-${id}", "ready");
        while (!fs.existsSync(cacheDir + "/go")) await setTimeout(10);
        const result = await loadPlayerDb({ cacheDir, fetchPlayers: async () => {
          fs.appendFileSync(cacheDir + "/requests", "request\\n");
          await setTimeout(150);
          ${failure ? 'throw new Error("offline");' : 'return players;'}
        }});
        console.log(JSON.stringify({ size: result.players.size, refreshed: result.refreshed }));
      `;
      const child = spawn(process.execPath, ["--input-type=module", "--eval", code], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      const done = new Promise<{ size: number; refreshed: boolean }>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (status) => status === 0 ? resolve(JSON.parse(stdout) as { size: number; refreshed: boolean }) : reject(new Error(stderr)));
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
      const results = await Promise.all(workers.map((worker) => worker.done));
      expect(results.every((result) => result.size === Object.keys(players).length)).toBe(true);
      expect(readFileSync(join(cacheDir, "requests"), "utf8").trim().split("\n")).toHaveLength(1);
      const retry = vi.fn(async () => players);
      await loadPlayerDb({ cacheDir, fetchPlayers: retry });
      expect(retry).not.toHaveBeenCalled();
      expect(existsSync(`${file}.lock`)).toBe(true);
    } finally {
      workers.forEach((worker) => worker.child.kill());
      await Promise.allSettled(workers.map((worker) => worker.done));
    }
  });

  it("does not retry a failed cold refresh during the next day", async () => {
    const { cacheDir } = setup();
    await expect(loadPlayerDb({ cacheDir, fetchPlayers: async () => { throw new Error("offline"); } })).rejects.toThrow("offline");
    const retry = vi.fn(async () => players);
    await expect(loadPlayerDb({ cacheDir, fetchPlayers: retry })).rejects.toThrow("already requested within 24 hours");
    expect(retry).not.toHaveBeenCalled();
  });

  it("automatically releases a crashed process lock and retains its request reservation", async () => {
    const { cacheDir, file } = setup();
    const moduleUrl = pathToFileURL(join(import.meta.dirname, "../src/players.ts")).href;
    const code = `
      import fs from "node:fs";
      import { loadPlayerDb } from ${JSON.stringify(moduleUrl)};
      await loadPlayerDb({ cacheDir: ${JSON.stringify(cacheDir)}, fetchPlayers: async () => {
        fs.writeFileSync(${JSON.stringify(join(cacheDir, "request-started"))}, "started");
        return new Promise(() => {});
      }});
    `;
    const child = spawn(process.execPath, ["--input-type=module", "--eval", code], { stdio: "ignore" });
    const stopped = new Promise<void>((resolve, reject) => { child.on("error", reject); child.on("close", () => resolve()); });
    try {
      await vi.waitFor(() => expect(existsSync(join(cacheDir, "request-started"))).toBe(true), { timeout: 3000 });
      child.kill("SIGKILL");
      await stopped;
      const retry = vi.fn(async () => players);
      await expect(loadPlayerDb({ cacheDir, fetchPlayers: retry })).rejects.toThrow("already requested within 24 hours");
      expect(retry).not.toHaveBeenCalled();
      expect(existsSync(`${file}.lock`)).toBe(true);
    } finally { child.kill("SIGKILL"); await stopped; }
  });

  it.each([false, true])("never fetches without flock and uses valid stale data when available (cache=%s)", async (withCache) => {
    const { cacheDir, file } = setup();
    if (withCache) {
      writeFileSync(file, JSON.stringify(players));
      const old = (Date.now() - 2 * PLAYER_CACHE_MAX_AGE_MS) / 1000;
      utimesSync(file, old, old);
    }
    const previousPath = process.env.PATH;
    const fetchPlayers = vi.fn(async () => players);
    process.env.PATH = "";
    try {
      if (withCache) {
        const result = await loadPlayerDb({ cacheDir, fetchPlayers });
        expect(result.refreshed).toBe(false);
        expect(result.ageMs).toBeGreaterThan(PLAYER_CACHE_MAX_AGE_MS);
      } else {
        await expect(loadPlayerDb({ cacheDir, fetchPlayers })).rejects.toThrow("requires util-linux flock");
      }
      expect(fetchPlayers).not.toHaveBeenCalled();
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });

  it("refuses to promote invalid downloaded data and preserves a valid stale cache", async () => {
    const { cacheDir, file } = setup();
    writeFileSync(file, JSON.stringify(players));
    const old = (Date.now() - 2 * PLAYER_CACHE_MAX_AGE_MS) / 1000;
    utimesSync(file, old, old);
    const result = await loadPlayerDb({ cacheDir, fetchPlayers: async () => ({ "1": { player_id: 1 } }) as never });
    expect(result.refreshed).toBe(false);
    expect(result.players.size).toBe(Object.keys(players).length);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(players);
  });

  it("refreshes again after the daily attempt expires", async () => {
    const { cacheDir, file } = setup();
    const fetchPlayers = vi.fn(async () => players);
    await loadPlayerDb({ cacheDir, fetchPlayers });
    const old = (Date.now() - 2 * PLAYER_CACHE_MAX_AGE_MS) / 1000;
    utimesSync(file, old, old);
    utimesSync(`${file}.attempt`, old, old);
    expect((await loadPlayerDb({ cacheDir, fetchPlayers })).refreshed).toBe(true);
    expect(fetchPlayers).toHaveBeenCalledTimes(2);
  });
});
