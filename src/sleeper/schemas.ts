import { z } from "zod";

// Sleeper IDs are strings; the league ID exceeds Number.MAX_SAFE_INTEGER.
const id = z.string().min(1);
const nullableRecord = <T extends z.ZodType>(value: T) =>
  z.record(z.string(), value).nullable().optional().transform((v) => v ?? {});
const nullableArray = <T extends z.ZodType>(item: T) =>
  z.array(item).nullable().optional().transform((v) => v ?? []);

export const LeagueSchema = z.looseObject({
  league_id: id,
  previous_league_id: id.nullable().optional(),
  name: z.string(),
  season: z.string().regex(/^\d{4}$/),
  status: z.string(),
  sport: z.literal("nfl"),
  total_rosters: z.number().int().positive(),
  roster_positions: z.array(z.string()).min(1),
  scoring_settings: z.record(z.string(), z.number()),
  settings: z.looseObject({
    type: z.number().int(),
    num_teams: z.number().int().positive(),
    playoff_teams: z.number().int().optional(),
    playoff_week_start: z.number().int().optional(),
    trade_deadline: z.number().int().optional(),
    waiver_type: z.number().int().optional(),
    waiver_budget: z.number().optional(),
    draft_rounds: z.number().int().optional(),
    reserve_slots: z.number().int().optional(),
    taxi_slots: z.number().int().optional(),
    pick_trading: z.number().int().optional(),
    disable_trades: z.number().int().optional(),
    divisions: z.number().int().optional(),
    last_scored_leg: z.number().int().optional(),
    leg: z.number().int().optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type League = z.infer<typeof LeagueSchema>;

export const UserSchema = z.looseObject({
  user_id: id,
  display_name: z.string(),
  metadata: z
    .looseObject({ team_name: z.string().optional() })
    .nullable()
    .optional(),
});
export type User = z.infer<typeof UserSchema>;
export const UsersSchema = z.array(UserSchema);

export const RosterSchema = z.looseObject({
  roster_id: z.number().int().positive(),
  owner_id: id.nullable(),
  co_owners: nullableArray(id),
  players: nullableArray(id),
  starters: nullableArray(z.string()),
  reserve: nullableArray(id),
  taxi: nullableArray(id),
  settings: z.looseObject({
    wins: z.number().int(),
    losses: z.number().int(),
    ties: z.number().int(),
    fpts: z.number().optional(),
    fpts_decimal: z.number().optional(),
    fpts_against: z.number().optional(),
    fpts_against_decimal: z.number().optional(),
    ppts: z.number().optional(),
    ppts_decimal: z.number().optional(),
    division: z.number().int().optional(),
    waiver_budget_used: z.number().optional(),
    waiver_position: z.number().int().optional(),
  }),
});
export type Roster = z.infer<typeof RosterSchema>;
export const RostersSchema = z.array(RosterSchema);

export const NflStateSchema = z.looseObject({
  week: z.number().int(),
  season: z.string(),
  season_type: z.string(),
  display_week: z.number().int().optional(),
});
export type NflState = z.infer<typeof NflStateSchema>;

const PickRefSchema = z.looseObject({
  season: z.string().regex(/^\d{4}$/),
  round: z.number().int().positive(),
  roster_id: z.number().int(),
  owner_id: z.number().int(),
  previous_owner_id: z.number().int().nullable().optional(),
});
export type PickRef = z.infer<typeof PickRefSchema>;
export const TradedPicksSchema = z.array(PickRefSchema);

export const TransactionSchema = z.looseObject({
  transaction_id: id,
  type: z.string(),
  status: z.string(),
  leg: z.number().int(),
  created: z.number(),
  status_updated: z.number().nullable().optional(),
  roster_ids: nullableArray(z.number().int()),
  adds: nullableRecord(z.number().int()),
  drops: nullableRecord(z.number().int()),
  draft_picks: nullableArray(PickRefSchema),
  waiver_budget: nullableArray(
    z.looseObject({ sender: z.number().int(), receiver: z.number().int(), amount: z.number() }),
  ),
  settings: z.looseObject({ waiver_bid: z.number().optional() }).nullable().optional(),
  creator: id.nullable().optional(),
});
export type Transaction = z.infer<typeof TransactionSchema>;
export const TransactionsSchema = z.array(TransactionSchema);

export const MatchupSchema = z.looseObject({
  roster_id: z.number().int(),
  matchup_id: z.number().int().nullable().optional(),
  points: z.number().nullable().optional(),
  custom_points: z.number().nullable().optional(),
  players: nullableArray(z.string()),
  starters: nullableArray(z.string()),
  starters_points: nullableArray(z.number()),
  players_points: nullableRecord(z.number()),
});
export type Matchup = z.infer<typeof MatchupSchema>;
export const MatchupsSchema = z.array(MatchupSchema);

export const DraftSchema = z.looseObject({
  draft_id: id,
  season: z.string(),
  status: z.string(),
  type: z.string(),
  settings: z.looseObject({ rounds: z.number().int().optional() }).nullable().optional(),
});
export type Draft = z.infer<typeof DraftSchema>;
export const DraftsSchema = z.array(DraftSchema);

export const PlayerSchema = z.looseObject({
  player_id: id,
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  fantasy_positions: z.array(z.string()).nullable().optional(),
  team: z.string().nullable().optional(),
  age: z.number().nullable().optional(),
  years_exp: z.number().nullable().optional(),
  status: z.string().nullable().optional(),
  injury_status: z.string().nullable().optional(),
  active: z.boolean().nullable().optional(),
  search_rank: z.number().nullable().optional(),
  depth_chart_order: z.number().nullable().optional(),
  depth_chart_position: z.string().nullable().optional(),
});
export type Player = z.infer<typeof PlayerSchema>;
export const PlayersSchema = z.record(z.string(), PlayerSchema);

export const TrendingSchema = z.array(z.looseObject({ player_id: id, count: z.number() }));
export type Trending = z.infer<typeof TrendingSchema>;

/** Minimal shape of /user/<id>/leagues/nfl/<season>, used only to find a renewed league. */
export const UserLeaguesSchema = z.array(
  z.looseObject({ league_id: id, previous_league_id: id.nullable().optional(), season: z.string(), name: z.string() }),
);
