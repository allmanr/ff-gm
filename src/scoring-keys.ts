/**
 * Meanings of Sleeper scoring_settings keys. Sleeper does not document these in its API docs;
 * meanings follow Sleeper's scoring UI. Keys not listed and not matched by a K/DEF/IDP pattern
 * are reported as unresolved and must block any calculation that depends on them.
 */
export type ScoringCategory = "offense" | "special_teams" | "kicker" | "team_defense" | "idp";

const OFFENSE: Record<string, string> = {
  pass_yd: "per passing yard",
  pass_td: "passing TD",
  pass_int: "interception thrown",
  pass_2pt: "2-pt conversion pass",
  pass_att: "pass attempt",
  pass_cmp: "pass completion",
  pass_inc: "incomplete pass",
  pass_sack: "sacked",
  pass_fd: "passing first down",
  pass_int_td: "pick-six thrown",
  pass_cmp_40p: "40+ yd completion",
  pass_td_40p: "40+ yd passing TD bonus",
  pass_td_50p: "50+ yd passing TD bonus",
  bonus_pass_yd_300: "300-399 passing yards bonus",
  bonus_pass_yd_400: "400+ passing yards bonus",
  bonus_pass_cmp_25: "25+ completions bonus",
  bonus_fd_qb: "QB first-down bonus",
  rush_yd: "per rushing yard",
  rush_td: "rushing TD",
  rush_2pt: "2-pt conversion rush",
  rush_att: "rush attempt",
  rush_fd: "rushing first down",
  rush_40p: "40+ yd rush",
  rush_td_40p: "40+ yd rushing TD bonus",
  rush_td_50p: "50+ yd rushing TD bonus",
  bonus_rush_yd_100: "100-199 rushing yards bonus",
  bonus_rush_yd_200: "200+ rushing yards bonus",
  bonus_rush_att_20: "20+ carries bonus",
  bonus_rush_rec_yd_100: "100-199 combined rush+rec yards bonus",
  bonus_rush_rec_yd_200: "200+ combined rush+rec yards bonus",
  bonus_fd_rb: "RB first-down bonus",
  rec: "reception",
  rec_yd: "per receiving yard",
  rec_td: "receiving TD",
  rec_2pt: "2-pt conversion reception",
  rec_fd: "receiving first down",
  rec_tgt: "target",
  rec_40p: "40+ yd reception",
  rec_td_40p: "40+ yd receiving TD bonus",
  rec_td_50p: "50+ yd receiving TD bonus",
  rec_0_4: "0-4 yd reception",
  rec_5_9: "5-9 yd reception",
  rec_10_19: "10-19 yd reception",
  rec_20_29: "20-29 yd reception",
  rec_30_39: "30-39 yd reception",
  bonus_rec_yd_100: "100-199 receiving yards bonus",
  bonus_rec_yd_200: "200+ receiving yards bonus",
  bonus_rec_rb: "reception bonus for RBs (stacks with rec)",
  bonus_rec_wr: "reception bonus for WRs (stacks with rec)",
  bonus_rec_te: "reception bonus for TEs (stacks with rec)",
  bonus_fd_wr: "WR first-down bonus",
  bonus_fd_te: "TE first-down bonus",
  fum: "fumble",
  fum_lost: "fumble lost",
  fum_rec_td: "fumble recovery TD",
};

const SPECIAL_TEAMS: Record<string, string> = {
  st_td: "special teams TD (player)",
  st_ff: "special teams forced fumble (player)",
  st_fum_rec: "special teams fumble recovery (player)",
  kr_yd: "kick return yard",
  pr_yd: "punt return yard",
};

const TEAM_DEFENSE_EXACT = new Set(["sack", "int", "ff", "fum_rec", "safe", "blk_kick", "def_td", "def_2pt"]);

export function classifyScoringKey(key: string): { category: ScoringCategory; meaning: string } | null {
  if (key in OFFENSE) return { category: "offense", meaning: OFFENSE[key]! };
  if (key in SPECIAL_TEAMS) return { category: "special_teams", meaning: SPECIAL_TEAMS[key]! };
  if (/^(fgm|fgmiss|xpm|xpmiss)(_|$)/.test(key)) return { category: "kicker", meaning: "kicker" };
  if (TEAM_DEFENSE_EXACT.has(key) || /^(pts_allow|yds_allow|def_)/.test(key)) {
    return { category: "team_defense", meaning: "team defense" };
  }
  if (key.startsWith("idp_")) return { category: "idp", meaning: "individual defensive player" };
  return null;
}

/** Bonus keys that change a reception's value by the player's primary position. */
export const POSITION_RECEPTION_BONUS: Record<string, string> = {
  RB: "bonus_rec_rb",
  WR: "bonus_rec_wr",
  TE: "bonus_rec_te",
};
