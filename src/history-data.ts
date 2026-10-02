import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { SleeperClient } from "./sleeper/client.ts";
import { RostersSchema, TransactionsSchema, UsersSchema } from "./sleeper/schemas.ts";

const MAX_WEEKS = 18;
const MAX_SEASONS = 10;

const SeasonSchema = z.object({
  leagueId: z.string(),
  season: z.string(),
  status: z.string(),
  users: UsersSchema,
  rosters: RostersSchema,
  trades: TransactionsSchema,
});
export type HistorySeason = z.infer<typeof SeasonSchema>;

/**
 * Trades from earlier seasons, following previous_league_id. Completed seasons never change,
 * so each is fetched once and cached.
 */
export async function loadHistory(client: SleeperClient, firstPreviousId: string | null, cacheDir: string): Promise<HistorySeason[]> {
  const out: HistorySeason[] = [];
  let id = firstPreviousId;
  while (id && out.length < MAX_SEASONS) {
    const file = join(cacheDir, `history-${id}.json`);
    let season: HistorySeason | null = null;
    if (existsSync(file)) {
      const cached = SeasonSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
      if (cached.success) season = cached.data;
    }
    const league = await client.league(id);
    if (!season) {
      const leagueId = id;
      const weeks = Array.from({ length: MAX_WEEKS }, (_, i) => i + 1);
      const [users, rosters, ...byWeek] = await Promise.all([
        client.users(leagueId),
        client.rosters(leagueId),
        ...weeks.map((w) => client.transactions(leagueId, w)),
      ]);
      const trades = byWeek.flat().filter((t) => t.type === "trade" && t.status === "complete");
      season = { leagueId, season: league.season, status: league.status, users, rosters, trades };
      if (league.status === "complete") {
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(`${file}.tmp`, JSON.stringify(season));
        renameSync(`${file}.tmp`, file);
      }
    }
    out.push(season);
    id = league.previous_league_id ?? null;
  }
  return out;
}
