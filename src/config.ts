import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const LEAGUE_ID = "1314802188052090880";

/** Positions this league can start; derived from roster slots at runtime, listed here for K/DEF/IDP exclusion. */
export const FLEX_ELIGIBILITY: Record<string, readonly string[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  IDP_FLEX: ["DL", "LB", "DB"],
  DL: ["DL"],
  LB: ["LB"],
  DB: ["DB"],
};

export const NON_STARTER_SLOTS = new Set(["BN", "IR", "TAXI"]);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const paths = {
  repoRoot,
  privateDir: resolve(process.env.FF_PRIVATE_DIR || join(repoRoot, "private")),
  cacheDir: resolve(process.env.FF_CACHE_DIR || join(repoRoot, ".local", "cache")),
};

export const OwnerConfigSchema = z.object({
  leagueId: z.string(),
  sleeperUsername: z.string(),
  ownerUserId: z.string(),
  ownerRosterId: z.number().int().positive(),
});
export type OwnerConfig = z.infer<typeof OwnerConfigSchema>;

/** Returns null when no owner is configured; throws when the file exists but is malformed. */
export function loadOwnerConfig(privateDir = paths.privateDir): OwnerConfig | null {
  const file = join(privateDir, "owner.json");
  if (!existsSync(file)) return null;
  const parsed = OwnerConfigSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new Error(`${file} is malformed: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  return parsed.data;
}
