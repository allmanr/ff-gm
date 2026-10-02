import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { LeagueContext } from "./context.ts";

/**
 * FantasyCalc dynasty market values (https://fantasycalc.com/api-docs).
 * Terms: only documented endpoints; refresh at most once per hour; non-commercial use; show a
 * visible "FantasyCalc.com" attribution next to the data. These are market prices, not projections.
 */
export const FANTASYCALC_ATTRIBUTION = "Market values: FantasyCalc.com (https://fantasycalc.com)";
const BASE = "https://api.fantasycalc.com";
const MIN_REFRESH_MS = 60 * 60 * 1000; // FantasyCalc: refresh at most once per hour
const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const ValueSchema = z.looseObject({
  player: z.looseObject({
    name: z.string(),
    sleeperId: z.string().nullable().optional(),
    position: z.string(),
    maybeAge: z.number().nullable().optional(),
    maybeTeam: z.string().nullable().optional(),
  }),
  value: z.number(),
  overallRank: z.number(),
  positionRank: z.number(),
  trend30Day: z.number().nullable().optional(),
  maybeTier: z.number().nullable().optional(),
});
const ValuesSchema = z.array(ValueSchema).min(1);
export type MarketValue = z.infer<typeof ValueSchema>;

export type ValueFormat = { isDynasty: boolean; numQbs: "1" | "2"; numTeams: number; ppr: number; tep: "none" | "te+" | "te++" };

/** Derive FantasyCalc's format parameters from the validated league; refuse formats it cannot represent. */
export function valueFormat(ctx: LeagueContext): { format: ValueFormat; notes: string[] } {
  const numTeams = ctx.teams.length;
  if (![8, 10, 12, 14].includes(numTeams)) throw new Error(`FantasyCalc has no ${numTeams}-team values`);
  const ppr = ctx.format.receptionPoints ?? 0;
  if (![0, 0.5, 1].includes(ppr)) throw new Error(`FantasyCalc has no values for ${ppr} PPR`);
  const te = ctx.format.teReceptionBonus ?? 0;
  const tep = te <= 0 ? "none" : te <= 0.5 ? "te+" : "te++";
  const notes = te > 0 ? [`TE premium mapped to FantasyCalc "${tep}" (its bonus size is undocumented; league bonus is +${te})`] : [];
  return {
    format: { isDynasty: ctx.format.dynasty, numQbs: ctx.format.superflexSlots > 0 ? "2" : "1", numTeams, ppr, tep },
    notes,
  };
}

export type ValueBook = {
  byPlayer: Map<string, MarketValue>;
  /** Generic pick values keyed like "2027 1st". */
  picks: Map<string, number>;
  fetchedAtMs: number;
  stale: boolean;
  label: string;
};

type LoadOptions = {
  ctx: LeagueContext;
  cacheDir: string;
  fetch?: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  now?: () => number;
  maxAgeMs?: number;
};

export async function loadValueBook(opts: LoadOptions): Promise<ValueBook> {
  const now = opts.now ?? Date.now;
  const { format, notes } = valueFormat(opts.ctx);
  const query = new URLSearchParams({
    isDynasty: String(format.isDynasty),
    numQbs: format.numQbs,
    numTeams: String(format.numTeams),
    ppr: String(format.ppr),
    tep: format.tep,
  });
  const file = join(opts.cacheDir, `fantasycalc-values-${query.toString().replace(/[^a-z0-9=]+/gi, "_")}.json`);
  let ageMs = Number.POSITIVE_INFINITY;
  try {
    ageMs = now() - statSync(file).mtimeMs;
  } catch {
    // no cache yet
  }
  const readCache = () => ValuesSchema.parse(JSON.parse(readFileSync(file, "utf8")));

  let rows: MarketValue[] | undefined;
  let stale = false;
  if (ageMs < Math.max(MIN_REFRESH_MS, opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS)) {
    try {
      rows = readCache();
    } catch {
      rows = undefined;
    }
  }
  if (!rows) {
    try {
      const doFetch = opts.fetch ?? ((url, init) => fetch(url, init));
      const res = await doFetch(`${BASE}/values/current?${query}`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`FantasyCalc HTTP ${res.status}`);
      rows = ValuesSchema.parse(await res.json());
      mkdirSync(opts.cacheDir, { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify(rows));
      renameSync(`${file}.tmp`, file);
      ageMs = 0;
    } catch (err) {
      if (!Number.isFinite(ageMs)) throw err;
      rows = readCache();
      stale = true;
    }
  }

  const byPlayer = new Map<string, MarketValue>();
  const picks = new Map<string, number>();
  for (const r of rows) {
    if (r.player.position === "PICK") {
      // Generic picks are named like "2027 1st"; early/mid/late variants are ignored for consistency.
      if (/^\d{4} \d(st|nd|rd|th)$/.test(r.player.name)) picks.set(r.player.name, r.value);
    } else if (r.player.sleeperId) {
      byPlayer.set(r.player.sleeperId, r);
    }
  }
  const fetchedAtMs = now() - ageMs;
  const label =
    `${FANTASYCALC_ATTRIBUTION} — dynasty, ${format.numQbs === "2" ? "Superflex/2QB" : "1QB"}, ${format.numTeams} teams, ` +
    `PPR ${format.ppr}, TE ${format.tep}; as of ${new Date(fetchedAtMs).toISOString()}${stale ? " (STALE: refresh failed)" : ""}.` +
    (notes.length ? ` ${notes.join(" ")}` : "");
  return { byPlayer, picks, fetchedAtMs, stale, label };
}

export function pickKey(season: string, round: number): string {
  const suffix = round === 1 ? "st" : round === 2 ? "nd" : round === 3 ? "rd" : "th";
  return `${season} ${round}${suffix}`;
}
