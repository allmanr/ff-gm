/**
 * Record anonymized Sleeper fixtures for tests. Manager names, user IDs, team names, avatars,
 * and league chat fields are replaced; roster contents (public NFL data) are kept.
 * Usage: npm run record-fixtures
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LEAGUE_ID, paths } from "../src/config.ts";
import { loadPlayerDb } from "../src/players.ts";
import { createSleeperClient } from "../src/sleeper/client.ts";

const out = join(paths.repoRoot, "test", "fixtures");
const client = createSleeperClient();

const [league, users, rosters, drafts, traded, state, tx1, tx3, m3, trending] = await Promise.all([
  client.league(LEAGUE_ID),
  client.users(LEAGUE_ID),
  client.rosters(LEAGUE_ID),
  client.drafts(LEAGUE_ID),
  client.tradedPicks(LEAGUE_ID),
  client.nflState(),
  client.transactions(LEAGUE_ID, 1),
  client.transactions(LEAGUE_ID, 3),
  client.matchups(LEAGUE_ID, 3),
  client.trending("add", 24, 25),
]);

// Stable pseudonyms in roster order, so fixtures do not reveal which roster is the Owner's.
const order = [...rosters].sort((a, b) => a.roster_id - b.roster_id);
const idMap = new Map<string, string>();
const secrets: string[] = [];
order.forEach((r, i) => {
  const n = String(i + 1).padStart(2, "0");
  for (const uid of [r.owner_id, ...r.co_owners]) if (uid && !idMap.has(uid)) idMap.set(uid, `9000000000000000${n}`);
});
for (const u of users) {
  if (!idMap.has(u.user_id)) idMap.set(u.user_id, `90000000000000${String(idMap.size + 1).padStart(4, "0")}`);
  secrets.push(u.user_id, u.display_name);
  if (u.metadata?.team_name) secrets.push(u.metadata.team_name);
}
const anon = (uid: string | null | undefined) => (uid ? (idMap.get(uid) ?? "9999999999999999999") : uid);
const label = (uid: string) => `manager${idMap.get(uid)!.slice(-2)}`;

const fx = {
  league: {
    league_id: league.league_id,
    previous_league_id: league.previous_league_id,
    name: "Fixture League",
    season: league.season,
    status: league.status,
    sport: league.sport,
    total_rosters: league.total_rosters,
    roster_positions: league.roster_positions,
    scoring_settings: league.scoring_settings,
    settings: league.settings,
    metadata: { division_1: "Division A", division_2: "Division B" },
  },
  users: users.map((u, i) => ({
    user_id: anon(u.user_id),
    display_name: label(u.user_id),
    metadata: i % 4 === 3 ? {} : { team_name: `Team ${label(u.user_id).slice(-2)}` },
  })),
  rosters: rosters.map((r) => ({
    ...r,
    owner_id: anon(r.owner_id),
    co_owners: r.co_owners.length ? r.co_owners.map(anon) : null,
    metadata: null,
  })),
  drafts: drafts.map((d) => ({ draft_id: d.draft_id, season: d.season, status: d.status, type: d.type, settings: d.settings })),
  traded_picks: traded,
  nfl_state: state,
  transactions_1: tx1.map((t) => ({ ...t, creator: anon(t.creator) })),
  transactions_3: tx3.map((t) => ({ ...t, creator: anon(t.creator) })),
  matchups_3: m3,
  trending_add: trending,
};

// Player subset: everything referenced, plus the top unrostered startable players and stale records.
const { players } = await loadPlayerDb({ cacheDir: paths.cacheDir, fetchPlayers: () => client.players() });
const keep = new Set<string>();
for (const r of rosters) for (const id of [...r.players, ...r.reserve, ...r.taxi]) keep.add(id);
for (const t of [...tx1, ...tx3]) for (const id of [...Object.keys(t.adds), ...Object.keys(t.drops)]) keep.add(id);
for (const t of trending) keep.add(t.player_id);
const startable = new Set(["QB", "RB", "WR", "TE"]);
[...players.values()]
  .filter((p) => !keep.has(p.player_id) && startable.has(p.position ?? "") && p.team)
  .sort((a, b) => (a.search_rank ?? 1e9) - (b.search_rank ?? 1e9))
  .slice(0, 80)
  .forEach((p) => keep.add(p.player_id));
const fields = [
  "player_id", "first_name", "last_name", "full_name", "position", "fantasy_positions", "team", "age",
  "years_exp", "status", "injury_status", "active", "search_rank", "depth_chart_order", "depth_chart_position",
] as const;
const playerSubset = Object.fromEntries(
  [...keep].filter((id) => players.has(id)).map((id) => {
    const p = players.get(id)!;
    return [id, Object.fromEntries(fields.map((f) => [f, p[f] ?? null]))];
  }),
);

mkdirSync(out, { recursive: true });
const files: Record<string, unknown> = { ...fx, players: playerSubset };
for (const [name, data] of Object.entries(files)) {
  const text = JSON.stringify(data, null, 1);
  const leaked = secrets.filter((s) => s.length >= 4 && text.includes(s));
  if (leaked.length > 0) throw new Error(`fixture ${name} still contains identifying values; not written`);
  writeFileSync(join(out, `${name}.json`), `${text}\n`);
}
console.log(`wrote ${Object.keys(files).length} fixtures to ${out} (${Object.keys(playerSubset).length} players)`);
