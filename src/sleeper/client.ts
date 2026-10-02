import type { z } from "zod";
import {
  DraftsSchema,
  LeagueSchema,
  MatchupsSchema,
  NflStateSchema,
  PlayersSchema,
  RostersSchema,
  TradedPicksSchema,
  TransactionsSchema,
  TrendingSchema,
  UserLeaguesSchema,
  UsersSchema,
} from "./schemas.ts";

export const SLEEPER_BASE_URL = "https://api.sleeper.app/v1";

export class SleeperError extends Error {
  readonly path: string;
  constructor(path: string, message: string, options?: ErrorOptions) {
    super(`Sleeper ${path}: ${message}`, options);
    this.name = "SleeperError";
    this.path = path;
  }
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export type SleeperClientOptions = {
  fetch?: FetchLike;
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
};

export function createSleeperClient(options: SleeperClientOptions = {}) {
  const doFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const baseUrl = options.baseUrl ?? SLEEPER_BASE_URL;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retries = options.retries ?? 2;
  const sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  async function getJson(path: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
      try {
        const res = await doFetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
        if (res.status === 429 || res.status >= 500) {
          lastError = new SleeperError(path, `HTTP ${res.status}`);
          continue;
        }
        if (!res.ok) throw new SleeperError(path, `HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        if (err instanceof SleeperError) throw err;
        lastError = err; // network error or timeout: retry
      }
    }
    throw new SleeperError(path, `failed after ${retries + 1} attempts`, { cause: lastError });
  }

  async function get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
    const body = await getJson(path);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new SleeperError(path, `unexpected response shape — ${issues}`);
    }
    return parsed.data;
  }

  return {
    league: (leagueId: string) => get(`/league/${leagueId}`, LeagueSchema),
    users: (leagueId: string) => get(`/league/${leagueId}/users`, UsersSchema),
    rosters: (leagueId: string) => get(`/league/${leagueId}/rosters`, RostersSchema),
    matchups: (leagueId: string, week: number) => get(`/league/${leagueId}/matchups/${week}`, MatchupsSchema),
    transactions: (leagueId: string, week: number) =>
      get(`/league/${leagueId}/transactions/${week}`, TransactionsSchema),
    tradedPicks: (leagueId: string) => get(`/league/${leagueId}/traded_picks`, TradedPicksSchema),
    drafts: (leagueId: string) => get(`/league/${leagueId}/drafts`, DraftsSchema),
    nflState: () => get(`/state/nfl`, NflStateSchema),
    userLeagues: (userId: string, season: string) => get(`/user/${userId}/leagues/nfl/${season}`, UserLeaguesSchema),
    players: () => get(`/players/nfl`, PlayersSchema),
    trending: (type: "add" | "drop", lookbackHours: number, limit: number) =>
      get(`/players/nfl/trending/${type}?lookback_hours=${lookbackHours}&limit=${limit}`, TrendingSchema),
  };
}

export type SleeperClient = ReturnType<typeof createSleeperClient>;
