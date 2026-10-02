import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadPlayerDb, PLAYER_CACHE_MAX_AGE_MS } from "../src/players.ts";
import { createSleeperClient, SleeperError } from "../src/sleeper/client.ts";
import { fixture } from "./helpers.ts";

const noSleep = async () => {};

describe("Sleeper client", () => {
  it("retries transient errors, then succeeds", async () => {
    const responses = [new Response("busy", { status: 503 }), new Response("slow", { status: 429 }), Response.json(fixture("nfl_state"))];
    const fetch = vi.fn(async () => responses.shift()!);
    const client = createSleeperClient({ fetch, sleep: noSleep });
    await expect(client.nflState()).resolves.toMatchObject({ week: 4 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("gives up after bounded retries", async () => {
    const fetch = vi.fn(async () => new Response("down", { status: 500 }));
    const client = createSleeperClient({ fetch, sleep: noSleep, retries: 2 });
    await expect(client.nflState()).rejects.toBeInstanceOf(SleeperError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry client errors", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 404 }));
    const client = createSleeperClient({ fetch, sleep: noSleep });
    await expect(client.league("1")).rejects.toThrow(/HTTP 404/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a response with an unexpected shape", async () => {
    const client = createSleeperClient({ fetch: async () => Response.json({ week: "four" }), sleep: noSleep });
    await expect(client.nflState()).rejects.toThrow(/unexpected response shape/);
  });
});

describe("player cache", () => {
  const players = fixture<Record<string, never>>("players");
  const setup = () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "ff-players-"));
    const file = join(cacheDir, "players-nfl.json");
    return { cacheDir, file };
  };

  it("downloads when there is no cache, then serves the cache for a day", async () => {
    const { cacheDir } = setup();
    const fetchPlayers = vi.fn(async () => players);
    const first = await loadPlayerDb({ cacheDir, fetchPlayers });
    const second = await loadPlayerDb({ cacheDir, fetchPlayers });
    expect(first.refreshed).toBe(true);
    expect(second.refreshed).toBe(false);
    expect(second.players.size).toBe(Object.keys(players).length);
    expect(fetchPlayers).toHaveBeenCalledTimes(1);
  });

  it("refreshes a cache older than 24 hours", async () => {
    const { cacheDir, file } = setup();
    writeFileSync(file, JSON.stringify(players));
    const old = (Date.now() - PLAYER_CACHE_MAX_AGE_MS - 60_000) / 1000;
    utimesSync(file, old, old);
    const fetchPlayers = vi.fn(async () => players);
    expect((await loadPlayerDb({ cacheDir, fetchPlayers })).refreshed).toBe(true);
  });

  it("keeps a stale cache when the download fails", async () => {
    const { cacheDir, file } = setup();
    writeFileSync(file, JSON.stringify(players));
    const old = (Date.now() - 2 * PLAYER_CACHE_MAX_AGE_MS) / 1000;
    utimesSync(file, old, old);
    const r = await loadPlayerDb({ cacheDir, fetchPlayers: async () => Promise.reject(new Error("offline")) });
    expect(r.refreshed).toBe(false);
    expect(r.ageMs).toBeGreaterThan(PLAYER_CACHE_MAX_AGE_MS);
    expect(r.players.size).toBeGreaterThan(0);
  });

  it("replaces a corrupt cache instead of using it", async () => {
    const { cacheDir, file } = setup();
    writeFileSync(file, JSON.stringify({ "1": { player_id: 1 } }));
    const fetchPlayers = vi.fn(async () => players);
    expect((await loadPlayerDb({ cacheDir, fetchPlayers })).refreshed).toBe(true);
  });

  it("fails when there is no cache and the download fails", async () => {
    const { cacheDir } = setup();
    await expect(loadPlayerDb({ cacheDir, fetchPlayers: async () => Promise.reject(new Error("offline")) })).rejects.toThrow(
      "offline",
    );
  });
});
