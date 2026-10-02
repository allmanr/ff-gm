import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PlayersSchema, type Player } from "./sleeper/schemas.ts";

export const PLAYER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PlayerDb = Map<string, Player>;

type CacheOptions = {
  cacheDir: string;
  fetchPlayers: () => Promise<Record<string, Player>>;
  now?: () => number;
  /** Download even if the cache is fresh. */
  refresh?: boolean;
};

/**
 * Sleeper asks that /players/nfl (~5 MB) be fetched at most once per day. The cache file is
 * replaced only after the new payload validates, so a failed download keeps the old data.
 */
export async function loadPlayerDb(opts: CacheOptions): Promise<{ players: PlayerDb; ageMs: number; refreshed: boolean }> {
  const now = opts.now ?? Date.now;
  const file = join(opts.cacheDir, "players-nfl.json");
  let ageMs = Number.POSITIVE_INFINITY;
  try {
    ageMs = now() - statSync(file).mtimeMs;
  } catch {
    // no cache yet
  }

  const readCache = () => {
    try {
      const cached = PlayersSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
      return cached.success ? new Map(Object.entries(cached.data)) : null;
    } catch {
      return null; // unreadable or corrupt: treat as a cache miss
    }
  };

  if (!opts.refresh && ageMs < PLAYER_CACHE_MAX_AGE_MS) {
    const cached = readCache();
    if (cached) return { players: cached, ageMs, refreshed: false };
  }

  try {
    const fresh = await opts.fetchPlayers();
    mkdirSync(opts.cacheDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(fresh));
    renameSync(tmp, file);
    return { players: new Map(Object.entries(fresh)), ageMs: 0, refreshed: true };
  } catch (err) {
    // Fall back to a stale cache rather than failing; callers report the age.
    const cached = Number.isFinite(ageMs) ? readCache() : null;
    if (cached) return { players: cached, ageMs, refreshed: false };
    throw err;
  }
}

export function playerName(db: PlayerDb, id: string): string {
  const p = db.get(id);
  if (!p) return `#${id}`;
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || `#${id}`;
}

export function playerLabel(db: PlayerDb, id: string): string {
  const p = db.get(id);
  if (!p) return `#${id} (unknown id)`;
  const team = p.team ?? "FA";
  const inj = p.injury_status ? ` [${p.injury_status}]` : "";
  return `${playerName(db, id)} ${p.position ?? "?"}-${team}${inj}`;
}
