/**
 * Live check: score nflverse stat lines with this league's settings and compare with Sleeper's own
 * players_points for every rostered player-week this season. Run after nflverse or scoring changes.
 * Usage: npm run verify-scoring
 */
import { createSession } from "../src/session.ts";
import { createSleeperClient } from "../src/sleeper/client.ts";

const session = createSession({ client: createSleeperClient() });
const { league } = await session.data();
const book = await session.stats();
const last = league.settings.last_scored_leg ?? 0;
let match = 0;
const misses: string[] = [];
for (let week = 1; week <= last; week++) {
  const sleeper = new Map<string, number>();
  for (const m of await session.matchups(week)) for (const [id, p] of Object.entries(m.players_points)) sleeper.set(id, p);
  for (const [id, games] of book.byPlayer) {
    const g = games.find((x) => x.week === week);
    const official = sleeper.get(id);
    if (!g || official === undefined) continue;
    if (Math.abs(g.points - official) < 0.011) match++;
    else misses.push(`week ${week} player ${id}: engine ${g.points}, Sleeper ${official}`);
  }
}
console.log(`Scoring check, weeks 1-${last}: ${match} match, ${misses.length} differ.`);
for (const m of misses.slice(0, 20)) console.log(`  ${m}`);
if (match === 0 && misses.length === 0) console.error("No comparable scores; scoring has not been verified.");
process.exitCode = misses.length || match === 0 ? 1 : 0;
