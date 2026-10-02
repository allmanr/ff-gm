import { LEAGUE_ID, loadOwnerConfig, paths, type OwnerConfig } from "./config.ts";
import { buildLeagueContext, type Failure, type LeagueContext } from "./context.ts";
import { loadPlayerDb, type PlayerDb } from "./players.ts";
import { loadValueBook, type ValueBook } from "./values.ts";
import { loadHistory, type HistorySeason } from "./history-data.ts";
import { loadSchedule, type Game } from "./schedule.ts";
import { loadStatBook, type StatBook } from "./stats.ts";
import type { SleeperClient } from "./sleeper/client.ts";
import type { Draft, League, Matchup, NflState, PickRef, Roster, Transaction, Trending, User } from "./sleeper/schemas.ts";

/** Thrown when league validation fails. No football output may be produced past this point. */
export class ContextError extends Error {
  readonly failures: Failure[];
  constructor(failures: Failure[]) {
    super(`League context failed validation:\n${failures.map((f) => `  - [${f.code}] ${f.message}`).join("\n")}`);
    this.name = "ContextError";
    this.failures = failures;
  }
}

export class OwnerUnsetError extends Error {
  constructor() {
    super("No verified owner roster. Create private/owner.json (see README) before using franchise commands.");
    this.name = "OwnerUnsetError";
  }
}

const PLAYER_DATA_WARN_MS = 36 * 60 * 60 * 1000;

export type LeagueData = {
  ctx: LeagueContext;
  league: League;
  users: User[];
  rosters: Roster[];
  drafts: Draft[];
  nflState: NflState;
};

export type SessionDeps = {
  client: SleeperClient;
  leagueId?: string;
  owner?: OwnerConfig | null;
  cacheDir?: string;
  now?: () => Date;
  refreshPlayers?: boolean;
  /** Fetch used for FantasyCalc market values (tests inject a fake). */
  valuesFetch?: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  /** Fetch used for the nflverse schedule (tests inject a fake). */
  scheduleFetch?: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  /** Fetch used for nflverse player stats and rosters (tests inject a fake). */
  statsFetch?: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
};

export type Session = ReturnType<typeof createSession>;

export function createSession(deps: SessionDeps) {
  const leagueId = deps.leagueId ?? LEAGUE_ID;
  const now = deps.now ?? (() => new Date());
  const memo = new Map<string, Promise<unknown>>();
  const notices: string[] = [];
  const once = <T>(key: string, load: () => Promise<T>): Promise<T> => {
    if (!memo.has(key)) memo.set(key, load());
    return memo.get(key) as Promise<T>;
  };

  /** The gate: fetch live league data and refuse to return it unless every check passes. */
  const data = () =>
    once("league", async (): Promise<LeagueData> => {
      const fetchedAt = now();
      const [league, users, rosters, drafts, nflState] = await Promise.all([
        deps.client.league(leagueId),
        deps.client.users(leagueId),
        deps.client.rosters(leagueId),
        deps.client.drafts(leagueId),
        deps.client.nflState(),
      ]);
      const owner = deps.owner === undefined ? loadOwnerConfig() : deps.owner;
      // Once a season is over (or the NFL has moved on), look for the renewed league so frozen
      // rosters are never served as current. Requires the Owner's user ID.
      let successor: { leagueId: string; season: string } | null = null;
      if (owner && (league.status === "complete" || league.season !== nflState.season)) {
        const next = String(Number(league.season) + 1);
        const found = (await deps.client.userLeagues(owner.ownerUserId, next)).find((l) => l.previous_league_id === leagueId);
        if (found) successor = { leagueId: found.league_id, season: found.season };
      }
      const { context, failures } = buildLeagueContext({
        successor,
        expectedLeagueId: leagueId,
        league,
        users,
        rosters,
        drafts,
        nflState,
        owner,
        fetchedAt,
      });
      if (failures.length > 0) throw new ContextError(failures);
      return { ctx: context, league, users, rosters, drafts, nflState };
    });

  const players = () =>
    once("players", async (): Promise<PlayerDb> => {
      await data();
      const { players: db, ageMs } = await loadPlayerDb({
        cacheDir: deps.cacheDir ?? paths.cacheDir,
        fetchPlayers: () => deps.client.players(),
        refresh: deps.refreshPlayers ?? false,
      });
      if (ageMs > PLAYER_DATA_WARN_MS) {
        notices.push(
          `Sleeper player data (teams, injuries, depth charts) is ${Math.round(ageMs / 3_600_000)} hours old; the refresh failed.`,
        );
      }
      return db;
    });

  return {
    data,
    /** Warnings to show with any output: context warnings plus stale-data notices. */
    async notices(): Promise<string[]> {
      const settled = memo.get("league");
      const ctxWarnings = settled ? await settled.then((d) => (d as LeagueData).ctx.warnings, () => []) : [];
      return [...ctxWarnings, ...notices];
    },
    async ownerRosterId(): Promise<number> {
      const { ctx } = await data();
      if (ctx.owner.status !== "verified") throw new OwnerUnsetError();
      return ctx.owner.rosterId;
    },
    players,
    /** FantasyCalc market values for this league's format. Supplementary: callers decide how to degrade. */
    values: () =>
      once("values", async (): Promise<ValueBook> => {
        const { ctx } = await data();
        return loadValueBook({
          ctx,
          cacheDir: deps.cacheDir ?? paths.cacheDir,
          ...(deps.valuesFetch ? { fetch: deps.valuesFetch } : {}),
        });
      }),
    /** NFL schedule and closing lines for the league's season (nflverse). */
    schedule: () =>
      once("schedule", async (): Promise<{ games: Game[]; stale: boolean }> => {
        const { ctx } = await data();
        return loadSchedule({
          season: ctx.season,
          cacheDir: deps.cacheDir ?? paths.cacheDir,
          ...(deps.scheduleFetch ? { fetch: deps.scheduleFetch } : {}),
        });
      }),
    /** Weekly player stats scored under this league's rules (nflverse; supplementary). */
    stats: () =>
      once("stats", async (): Promise<StatBook> => {
        const [{ ctx }, db] = await Promise.all([data(), players()]);
        return loadStatBook({
          ctx,
          db,
          cacheDir: deps.cacheDir ?? paths.cacheDir,
          ...(deps.statsFetch ? { fetch: deps.statsFetch } : {}),
        });
      }),
    /** Completed trades from earlier seasons (previous_league_id chain); cached once complete. */
    history: () =>
      once("history", async (): Promise<HistorySeason[]> => {
        const { ctx } = await data();
        return loadHistory(deps.client, ctx.previousLeagueId, deps.cacheDir ?? paths.cacheDir);
      }),
    matchups: (week: number) =>
      once(`matchups:${week}`, async (): Promise<Matchup[]> => {
        await data();
        return deps.client.matchups(leagueId, week);
      }),
    transactions: (week: number) =>
      once(`transactions:${week}`, async (): Promise<Transaction[]> => {
        await data();
        return deps.client.transactions(leagueId, week);
      }),
    tradedPicks: () =>
      once("traded", async (): Promise<PickRef[]> => {
        await data();
        return deps.client.tradedPicks(leagueId);
      }),
    trending: (type: "add" | "drop", hours: number) =>
      once(`trending:${type}:${hours}`, async (): Promise<Trending> => {
        await data();
        return deps.client.trending(type, hours, 100); // Sleeper caps this at 100
      }),
    /** Weeks with matchup data so far: through the league's current week (`leg`), capped at 18. */
    async playedWeeks(): Promise<number[]> {
      const { ctx, league } = await data();
      const scored = league.settings.last_scored_leg ?? 0;
      const inSeason = ctx.nfl.seasonType === "regular" || ctx.nfl.seasonType === "post";
      const current = inSeason ? (league.settings.leg ?? ctx.nfl.week) : scored;
      return range(1, Math.min(Math.max(current, scored), 18));
    },
  };
}

function range(from: number, to: number): number[] {
  return to < from ? [] : Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
