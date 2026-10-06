import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { PlayersSchema, type Player } from "./sleeper/schemas.ts";
import { safeWrite } from "./private-files.ts";

export const PLAYER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PlayerDb = Map<string, Player>;

type CacheOptions = {
  cacheDir: string;
  fetchPlayers: () => Promise<Record<string, Player>>;
  now?: () => number;
  /** Compatibility option: refresh requests still honor the daily download limit. */
  refresh?: boolean;
};

/** Kernel lock releases when the holder crashes; the lock file must never be unlinked. */
async function playerRefreshLock(file: string): Promise<() => Promise<void>> {
  return new Promise((resolve, reject) => {
    const child = spawn("flock", ["--exclusive", "--timeout", "60", "--conflict-exit-code", "75", file,
      process.execPath, "-e", 'process.stdout.write("locked\\n"); process.stdin.resume(); process.stdin.on("end", () => process.exit(0));'],
    { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (data) => { stderr += String(data); });
    child.stdin.on("error", () => { /* A crashed lock holder closes the pipe. */ });
    child.on("error", (error) => reject(new Error(`Sleeper player refresh requires util-linux flock: ${error.message}`)));
    child.on("close", (status) => reject(new Error(`Sleeper player refresh lock unavailable (${status}): ${stderr.trim()}`)));
    child.stdout.once("data", () => resolve(() => new Promise<void>((released) => {
      if (child.exitCode !== null || child.signalCode !== null) { released(); return; }
      child.once("close", () => released());
      child.stdin.end();
    })));
  });
}

/**
 * Sleeper asks that /players/nfl (~5 MB) be fetched at most once per day. The cache file is
 * replaced only after the new payload validates, so a failed download keeps the old data.
 */
export async function loadPlayerDb(opts: CacheOptions): Promise<{ players: PlayerDb; ageMs: number; refreshed: boolean }> {
  const now = opts.now ?? Date.now;
  const file = join(opts.cacheDir, "players-nfl.json");
  const attemptFile = `${file}.attempt`;
  const lockFile = `${file}.lock`;
  const ageOf = (path: string) => {
    try { return now() - statSync(path).mtimeMs; }
    catch { return Number.POSITIVE_INFINITY; }
  };
  const readCache = () => {
    try {
      const cached = PlayersSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
      return cached.success ? new Map(Object.entries(cached.data)) : null;
    } catch { return null; }
  };
  const cachedResult = () => {
    const players = readCache();
    return players ? { players, ageMs: ageOf(file), refreshed: false } : null;
  };
  const existing = cachedResult();
  if (existing && existing.ageMs < PLAYER_CACHE_MAX_AGE_MS) return existing;

  mkdirSync(opts.cacheDir, { recursive: true });
  // Serialize refreshes across processes and within one process. Kernel locks automatically
  // release on crashes, avoiding unsafe stale-directory reclamation. Never fetch without one.
  let release: () => Promise<void>;
  try { release = await playerRefreshLock(lockFile); }
  catch (error) {
    const fallback = cachedResult();
    if (fallback) return fallback;
    throw error;
  }
  try {
    // Recheck after acquiring: another process may have refreshed while we were waiting.
    const cached = cachedResult();
    if (cached && cached.ageMs < PLAYER_CACHE_MAX_AGE_MS) return cached;
    if (ageOf(attemptFile) < PLAYER_CACHE_MAX_AGE_MS) {
      if (cached) return cached;
      throw new Error("Sleeper players were already requested within 24 hours; no usable cache");
    }
    safeWrite(attemptFile, `${new Date(now()).toISOString()}\n`);
    try {
      const fresh = PlayersSchema.parse(await opts.fetchPlayers());
      const tmp = `${file}.${process.pid}.tmp`;
      safeWrite(tmp, JSON.stringify(fresh));
      renameSync(tmp, file);
      return { players: new Map(Object.entries(fresh)), ageMs: 0, refreshed: true };
    } catch (error) {
      const fallback = cachedResult();
      if (fallback) return fallback;
      throw error;
    }
  } finally {
    await release();
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
