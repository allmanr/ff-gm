import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEAGUE_ID, type OwnerConfig } from "../src/config.ts";
import { createSession } from "../src/session.ts";
import { createSleeperClient } from "../src/sleeper/client.ts";

const dir = join(import.meta.dirname, "fixtures");
export const fixture = <T = unknown>(name: string): T => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")) as T;

/** Fixture owner: roster 3. Deliberately not the real Owner's roster. */
export const FIXTURE_OWNER_ROSTER = 3;
export function fixtureOwner(): OwnerConfig {
  const rosters = fixture<{ roster_id: number; owner_id: string }[]>("rosters");
  const r = rosters.find((x) => x.roster_id === FIXTURE_OWNER_ROSTER)!;
  return { leagueId: LEAGUE_ID, sleeperUsername: "manager03", ownerUserId: r.owner_id, ownerRosterId: r.roster_id };
}

type Overrides = Partial<Record<string, unknown>>;

/** A fetch that serves fixtures by Sleeper path and records every path requested. */
export function fixtureFetch(overrides: Overrides = {}) {
  const calls: string[] = [];
  const routes: [RegExp, string][] = [
    [/^\/league\/\d+$/, "league"],
    [/^\/league\/\d+\/users$/, "users"],
    [/^\/league\/\d+\/rosters$/, "rosters"],
    [/^\/league\/\d+\/drafts$/, "drafts"],
    [/^\/league\/\d+\/traded_picks$/, "traded_picks"],
    [/^\/league\/\d+\/transactions\/1$/, "transactions_1"],
    [/^\/league\/\d+\/transactions\/3$/, "transactions_3"],
    [/^\/league\/\d+\/transactions\/\d+$/, "empty"],
    [/^\/league\/\d+\/matchups\/3$/, "matchups_3"],
    [/^\/league\/\d+\/matchups\/\d+$/, "empty"],
    [/^\/state\/nfl$/, "nfl_state"],
    [/^\/user\/\d+\/leagues\/nfl\/\d{4}$/, "user_leagues"],
    [/^\/players\/nfl$/, "players"],
    [/^\/players\/nfl\/trending\/(add|drop)/, "trending_add"],
  ];
  const fetch = async (url: string) => {
    const path = url.replace("https://api.sleeper.app/v1", "");
    calls.push(path);
    const route = routes.find(([re]) => re.test(path.split("?")[0]!));
    if (!route) return new Response("not found", { status: 404 });
    const name = route[1];
    const body = name in overrides ? overrides[name] : name === "empty" || name === "user_leagues" ? [] : fixture(name);
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { fetch, calls };
}

export function fixtureSession(opts: { overrides?: Overrides; owner?: OwnerConfig | null } = {}) {
  const { fetch, calls } = fixtureFetch(opts.overrides);
  const cacheDir = mkdtempSync(join(tmpdir(), "ff-cache-"));
  const session = createSession({
    client: createSleeperClient({ fetch, retries: 0 }),
    owner: opts.owner === undefined ? fixtureOwner() : opts.owner,
    cacheDir,
    now: () => new Date("2026-10-02T12:00:00Z"),
  });
  return { session, calls, cacheDir };
}

export function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data));
}

/** Deep-clone a fixture and apply a mutation. */
export function mutated<T>(name: string, fn: (x: T) => void): T {
  const x = fixture<T>(name);
  fn(x);
  return x;
}
