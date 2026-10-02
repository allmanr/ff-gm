import { createHash } from "node:crypto";
import { FLEX_ELIGIBILITY, NON_STARTER_SLOTS, type OwnerConfig } from "./config.ts";
import { classifyScoringKey, POSITION_RECEPTION_BONUS, type ScoringCategory } from "./scoring-keys.ts";
import type { Draft, League, NflState, Roster, User } from "./sleeper/schemas.ts";

export type FailureCode =
  | "LEAGUE_ID_MISMATCH"
  | "NOT_DYNASTY"
  | "NOT_SUPERFLEX"
  | "NOT_FULL_PPR"
  | "NO_TE_BONUS"
  | "UNKNOWN_ROSTER_SLOT"
  | "ROSTER_COUNT_MISMATCH"
  | "DUPLICATE_ROSTERED_PLAYER"
  | "SEASON_MISMATCH"
  | "OWNER_LEAGUE_MISMATCH"
  | "OWNER_ROSTER_MISMATCH"
  | "LEAGUE_RENEWED";

export type Failure = { code: FailureCode; message: string };

export type Team = {
  rosterId: number;
  ownerUserId: string | null;
  coOwnerUserIds: string[];
  managerName: string;
  teamName: string | null;
  division: number | null;
  isOwner: boolean;
};

export type ScoringEntry = { key: string; value: number; category: ScoringCategory | "unresolved"; meaning: string };

export type OwnerStatus =
  | { status: "verified"; userId: string; rosterId: number; managerName: string; teamName: string | null }
  | { status: "unset" };

export type LeagueContext = {
  leagueId: string;
  leagueName: string;
  season: string;
  leagueStatus: string;
  previousLeagueId: string | null;
  fetchedAt: string;
  nfl: { season: string; week: number; seasonType: string };
  /** sha256 of the rule-bearing league fields; changes only when a league rule changes. */
  sourceHash: string;
  format: {
    dynasty: boolean;
    leagueTypeCode: number;
    superflexSlots: number;
    receptionPoints: number | null;
    teReceptionBonus: number | null;
  };
  roster: {
    positions: string[];
    starterSlots: { slot: string; eligible: readonly string[] }[];
    benchSlots: number;
    reserveSlots: number;
    taxiSlots: number;
    startablePositions: string[];
  };
  scoring: ScoringEntry[];
  unresolvedScoringKeys: string[];
  waivers: { typeCode: number | null; faabBudget: number | null };
  trades: { deadlineWeek: number | null; pickTrading: boolean; disabled: boolean };
  playoffs: { teams: number | null; startWeek: number | null };
  draft: { rounds: number | null; drafts: { season: string; status: string; type: string }[] };
  divisions: Record<number, string>;
  teams: Team[];
  owner: OwnerStatus;
  warnings: string[];
  /** League settings kept verbatim but not interpreted by this tool. */
  uninterpretedSettings: Record<string, unknown>;
};

export type ContextInput = {
  expectedLeagueId: string;
  league: League;
  users: User[];
  rosters: Roster[];
  drafts: Draft[];
  nflState: NflState;
  owner: OwnerConfig | null;
  fetchedAt: Date;
  /** A next-season league whose previous_league_id is this league, if one was found. */
  successor?: { leagueId: string; season: string } | null;
};

const INTERPRETED_SETTINGS = new Set([
  "type",
  "num_teams",
  "playoff_teams",
  "playoff_week_start",
  "trade_deadline",
  "waiver_type",
  "waiver_budget",
  "draft_rounds",
  "reserve_slots",
  "taxi_slots",
  "pick_trading",
  "disable_trades",
  "divisions",
  "last_scored_leg",
  "leg",
]);

export function buildLeagueContext(input: ContextInput): { context: LeagueContext; failures: Failure[] } {
  const { league, users, rosters, owner } = input;
  const s = league.settings;
  const failures: Failure[] = [];
  const warnings: string[] = [];
  const fail = (code: FailureCode, message: string) => failures.push({ code, message });

  if (league.league_id !== input.expectedLeagueId) {
    fail("LEAGUE_ID_MISMATCH", `Sleeper returned league ${league.league_id}, expected ${input.expectedLeagueId}`);
  }

  // Format invariants. settings.type: 0 redraft, 1 keeper, 2 dynasty (Sleeper convention).
  const dynasty = s.type === 2;
  if (!dynasty) fail("NOT_DYNASTY", `settings.type is ${s.type}; expected 2 (dynasty)`);

  const superflexSlots = league.roster_positions.filter((p) => p === "SUPER_FLEX").length;
  if (superflexSlots === 0) fail("NOT_SUPERFLEX", "roster_positions has no SUPER_FLEX slot");

  const receptionPoints = league.scoring_settings.rec ?? null;
  if (receptionPoints !== 1) fail("NOT_FULL_PPR", `scoring_settings.rec is ${receptionPoints ?? "absent"}; expected 1`);

  const teReceptionBonus = league.scoring_settings.bonus_rec_te ?? null;
  if (teReceptionBonus === null || teReceptionBonus <= 0) {
    fail("NO_TE_BONUS", `scoring_settings.bonus_rec_te is ${teReceptionBonus ?? "absent"}; expected > 0`);
  }

  // Roster slots must all be interpretable, or lineup reasoning is unsafe.
  const starterSlots: LeagueContext["roster"]["starterSlots"] = [];
  for (const slot of league.roster_positions) {
    if (NON_STARTER_SLOTS.has(slot)) continue;
    const eligible = FLEX_ELIGIBILITY[slot];
    if (!eligible) {
      fail("UNKNOWN_ROSTER_SLOT", `roster slot ${slot} is not understood by this tool`);
      continue;
    }
    starterSlots.push({ slot, eligible });
  }
  const startablePositions = [...new Set(starterSlots.flatMap((x) => x.eligible))];

  if (rosters.length !== league.total_rosters) {
    fail("ROSTER_COUNT_MISMATCH", `got ${rosters.length} rosters; league has ${league.total_rosters}`);
  }
  const seen = new Map<string, number>();
  for (const r of rosters) {
    for (const p of r.players) {
      const other = seen.get(p);
      if (other !== undefined && other !== r.roster_id) {
        fail("DUPLICATE_ROSTERED_PLAYER", `player ${p} is on rosters ${other} and ${r.roster_id}`);
      }
      seen.set(p, r.roster_id);
    }
  }

  const nfl = { season: input.nflState.season, week: input.nflState.week, seasonType: input.nflState.season_type };
  if (league.season !== nfl.season) {
    const msg = `league season ${league.season} differs from NFL season ${nfl.season}; check for a successor league`;
    if (nfl.seasonType === "regular" || nfl.seasonType === "post") fail("SEASON_MISMATCH", msg);
    else warnings.push(msg);
  }

  if (input.successor) {
    fail(
      "LEAGUE_RENEWED",
      `league was renewed for ${input.successor.season} as ${input.successor.leagueId}; this league's rosters are frozen. ` +
        "Update LEAGUE_ID in src/config.ts and leagueId in private/owner.json.",
    );
  }

  // Scoring keys: classify everything; unresolved non-zero keys block dependent calculations.
  const scoring: ScoringEntry[] = Object.entries(league.scoring_settings)
    .map(([key, value]) => {
      const c = classifyScoringKey(key);
      return c
        ? { key, value, category: c.category, meaning: c.meaning }
        : { key, value, category: "unresolved" as const, meaning: "not recognized" };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  const unresolvedScoringKeys = scoring.filter((x) => x.category === "unresolved" && x.value !== 0).map((x) => x.key);
  if (unresolvedScoringKeys.length > 0) {
    warnings.push(`unrecognized non-zero scoring keys: ${unresolvedScoringKeys.join(", ")}`);
  }

  // Teams and ownership.
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const metadata = league.metadata ?? {};
  const divisions: Record<number, string> = {};
  for (let d = 1; d <= (s.divisions ?? 0); d++) {
    const name = metadata[`division_${d}`];
    divisions[d] = typeof name === "string" ? name : `Division ${d}`;
  }

  let ownerStatus: OwnerStatus = { status: "unset" };
  if (!owner) {
    warnings.push("owner roster is not configured (private/owner.json); franchise-specific commands are blocked");
  } else if (owner.leagueId !== league.league_id) {
    fail("OWNER_LEAGUE_MISMATCH", `owner config is for league ${owner.leagueId}, not ${league.league_id}`);
  } else {
    const r = rosters.find((x) => x.roster_id === owner.ownerRosterId);
    const holds = r && (r.owner_id === owner.ownerUserId || r.co_owners.includes(owner.ownerUserId));
    if (!r || !holds) {
      fail(
        "OWNER_ROSTER_MISMATCH",
        `configured owner ${owner.ownerUserId} does not hold roster ${owner.ownerRosterId}; ownership may have changed`,
      );
    } else {
      const u = usersById.get(owner.ownerUserId);
      ownerStatus = {
        status: "verified",
        userId: owner.ownerUserId,
        rosterId: r.roster_id,
        managerName: u?.display_name ?? owner.sleeperUsername,
        teamName: u?.metadata?.team_name ?? null,
      };
    }
  }

  const teams: Team[] = rosters
    .map((r) => {
      const u = r.owner_id ? usersById.get(r.owner_id) : undefined;
      if (r.owner_id && !u) warnings.push(`roster ${r.roster_id} owner ${r.owner_id} is not among league users`);
      return {
        rosterId: r.roster_id,
        ownerUserId: r.owner_id,
        coOwnerUserIds: r.co_owners,
        managerName: u?.display_name ?? (r.owner_id ? `user ${r.owner_id}` : "(orphaned)"),
        teamName: u?.metadata?.team_name ?? null,
        division: r.settings.division ?? null,
        isOwner: ownerStatus.status === "verified" && ownerStatus.rosterId === r.roster_id,
      };
    })
    .sort((a, b) => a.rosterId - b.rosterId);

  const uninterpretedSettings = Object.fromEntries(
    Object.entries(s).filter(([k]) => !INTERPRETED_SETTINGS.has(k)),
  );

  const context: LeagueContext = {
    leagueId: league.league_id,
    leagueName: league.name,
    season: league.season,
    leagueStatus: league.status,
    previousLeagueId: league.previous_league_id ?? null,
    fetchedAt: input.fetchedAt.toISOString(),
    nfl,
    sourceHash: rulesHash(league),
    format: { dynasty, leagueTypeCode: s.type, superflexSlots, receptionPoints, teReceptionBonus },
    roster: {
      positions: league.roster_positions,
      starterSlots,
      benchSlots: league.roster_positions.filter((p) => p === "BN").length,
      reserveSlots: s.reserve_slots ?? 0,
      taxiSlots: s.taxi_slots ?? 0,
      startablePositions,
    },
    scoring,
    unresolvedScoringKeys,
    waivers: { typeCode: s.waiver_type ?? null, faabBudget: s.waiver_budget ?? null },
    trades: {
      deadlineWeek: s.trade_deadline ?? null,
      pickTrading: s.pick_trading === 1,
      disabled: s.disable_trades === 1,
    },
    playoffs: { teams: s.playoff_teams ?? null, startWeek: s.playoff_week_start ?? null },
    draft: {
      rounds: s.draft_rounds ?? null,
      drafts: input.drafts.map((d) => ({ season: d.season, status: d.status, type: d.type })),
    },
    divisions,
    teams,
    owner: ownerStatus,
    warnings,
    uninterpretedSettings,
  };
  return { context, failures };
}

/**
 * Hash of the fields that define league rules. Chat and progress fields (last_message_id, leg,
 * last_scored_leg, ...) are excluded so the hash identifies a rule set, not a fetch.
 */
export function rulesHash(league: League): string {
  const { leg, last_scored_leg, last_report, daily_waivers_last_ran, ...rules } = league.settings;
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]))
        : v;
  const payload = {
    league_id: league.league_id,
    season: league.season,
    total_rosters: league.total_rosters,
    roster_positions: league.roster_positions,
    scoring_settings: league.scoring_settings,
    settings: rules,
  };
  return createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
}

/** Points per reception for a player's primary position, including any position bonus. */
export function receptionValue(ctx: LeagueContext, position: string): number {
  const base = ctx.scoring.find((x) => x.key === "rec")?.value ?? 0;
  const bonusKey = POSITION_RECEPTION_BONUS[position];
  const bonus = bonusKey ? (ctx.scoring.find((x) => x.key === bonusKey)?.value ?? 0) : 0;
  return base + bonus;
}
