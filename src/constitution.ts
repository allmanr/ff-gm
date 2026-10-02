import { receptionValue, type LeagueContext } from "./context.ts";
import { table } from "./format.ts";

const WAIVER_TYPES: Record<number, string> = { 0: "rolling", 1: "reverse standings", 2: "FAAB bidding" };

/** Non-offense scoring categories and the roster positions that make them count. */
const SLOT_CATEGORIES = [
  { category: "kicker", label: "kicker", positions: ["K"] },
  { category: "team_defense", label: "team defense", positions: ["DEF"] },
  { category: "idp", label: "IDP", positions: ["DL", "LB", "DB"] },
] as const;

/** Deterministic league rules summary. Every number comes from the validated context. */
export function renderConstitution(ctx: LeagueContext): string {
  const sc = (key: string) => ctx.scoring.find((x) => x.key === key)?.value;
  const nonZero = (cats: string[]) => ctx.scoring.filter((x) => cats.includes(x.category) && x.value !== 0);
  const slotted = SLOT_CATEGORIES.filter((c) => c.positions.some((p) => ctx.roster.startablePositions.includes(p)));
  const unslotted = SLOT_CATEGORIES.filter((c) => !slotted.includes(c));
  const countedCategories = ["offense", "special_teams", ...slotted.map((c) => c.category)];
  const out: string[] = [];

  out.push(`# League Constitution — ${ctx.leagueName} (${ctx.season})`);
  out.push("");
  out.push(
    `Generated ${ctx.fetchedAt} from Sleeper's documented API (league, users, rosters, drafts, NFL state). ` +
      `League ID ${ctx.leagueId}. Source hash ${ctx.sourceHash.slice(0, 12)}. NFL ${ctx.nfl.season} week ${ctx.nfl.week} (${ctx.nfl.seasonType}). ` +
      `Validation: **PASS**.`,
  );
  out.push("");

  out.push("## Format invariants");
  out.push("");
  out.push(
    table(
      ["Invariant", "Sleeper field", "Value", "Status"],
      [
        ["Dynasty", "settings.type", String(ctx.format.leagueTypeCode), ctx.format.dynasty ? "verified" : "FAIL"],
        ["Superflex", "roster_positions SUPER_FLEX", `${ctx.format.superflexSlots} slot(s)`, "verified"],
        ["Full PPR", "scoring_settings.rec", String(ctx.format.receptionPoints), "verified"],
        ["TE reception bonus", "scoring_settings.bonus_rec_te", `+${ctx.format.teReceptionBonus}`, "verified"],
      ],
    ),
  );
  out.push("");

  out.push("## Lineup and roster");
  out.push("");
  out.push(
    `Starters (${ctx.roster.starterSlots.length}): ` +
      ctx.roster.starterSlots.map((s) => (s.eligible.length > 1 ? `${s.slot} (${s.eligible.join("/")})` : s.slot)).join(", "),
  );
  out.push(`Bench: ${ctx.roster.benchSlots} · IR: ${ctx.roster.reserveSlots} · Taxi: ${ctx.roster.taxiSlots}`);
  out.push(
    `Startable positions: ${ctx.roster.startablePositions.join(", ")}` +
      (unslotted.length ? ` (no ${unslotted.map((c) => c.label).join(", ")} slots)` : ""),
  );
  out.push(
    `Roster size: ${ctx.roster.starterSlots.length + ctx.roster.benchSlots} active spots plus ${ctx.roster.reserveSlots} IR.`,
  );
  out.push("");

  out.push(`## Scoring that matters (${countedCategories.map((c) => c.replace("_", " ")).join(", ")})`);
  out.push("");
  out.push(table(["Key", "Points", "Meaning"], nonZero(countedCategories).map((x) => [x.key, x.value, x.meaning])));
  out.push("");
  out.push("What it means:");
  for (const pos of ["RB", "WR", "TE"]) {
    out.push(`- ${pos} reception = ${receptionValue(ctx, pos)} pts (bonus follows the player's primary position, not the lineup slot)`);
  }
  const perYd = (k: string) => {
    const v = sc(k);
    return v ? `${Math.round(1 / v)} yds = 1 pt` : "no yardage points";
  };
  out.push(`- Passing: ${sc("pass_td") ?? 0} per TD, ${perYd("pass_yd")}, ${sc("pass_int") ?? 0} per INT`);
  out.push(`- Rushing: ${sc("rush_td") ?? 0} per TD, ${perYd("rush_yd")}`);
  out.push(`- Receiving: ${sc("rec_td") ?? 0} per TD, ${perYd("rec_yd")}`);
  out.push(`- Fumble lost: ${sc("fum_lost") ?? 0}`);
  const bonuses = ctx.scoring.filter(
    (x) => x.category === "offense" && x.value !== 0 && (x.key.startsWith("bonus_") || /_fd$|_40p|_50p/.test(x.key)),
  );
  const extra = bonuses.filter((x) => !/^bonus_rec_(rb|wr|te)$/.test(x.key));
  out.push(
    extra.length === 0
      ? "- No yardage-threshold, big-play, or first-down bonuses."
      : `- Other bonuses: ${extra.map((x) => `${x.key} ${x.value}`).join(", ")}`,
  );
  if (ctx.unresolvedScoringKeys.length > 0) {
    out.push(`- **Unresolved scoring keys (block exact scoring): ${ctx.unresolvedScoringKeys.join(", ")}**`);
  }
  const ignored = nonZero(unslotted.map((c) => c.category));
  if (ignored.length > 0) {
    out.push(`- Set but irrelevant (no roster slot uses them): ${ignored.map((x) => `${x.key} ${x.value}`).join(", ")}`);
  }
  out.push("");

  out.push("## Transactions");
  out.push("");
  const wt = ctx.waivers.typeCode;
  out.push(
    `- Waivers: ${wt === null ? "unknown" : `${WAIVER_TYPES[wt] ?? "unknown"} (waiver_type ${wt})`}` +
      (ctx.waivers.faabBudget ? `, FAAB budget $${ctx.waivers.faabBudget}` : ""),
  );
  out.push(
    `- Trades: ${ctx.trades.disabled ? "DISABLED" : "allowed"}; trade_deadline setting week ${ctx.trades.deadlineWeek ?? "none"}; ` +
      `future pick trading ${ctx.trades.pickTrading ? "on" : "off"}`,
  );
  out.push(`- Rookie draft: ${ctx.draft.rounds ?? "?"} rounds; drafts: ${ctx.draft.drafts.map((d) => `${d.season} ${d.type} (${d.status})`).join(", ") || "none"}`);
  out.push("");

  out.push("## Season structure");
  out.push("");
  out.push(`- Playoffs: ${ctx.playoffs.teams ?? "?"} teams starting week ${ctx.playoffs.startWeek ?? "?"}`);
  const divs = Object.entries(ctx.divisions);
  if (divs.length > 0) out.push(`- Divisions: ${divs.map(([n, name]) => `${n} = ${name}`).join(", ")}`);
  if (ctx.previousLeagueId) out.push(`- Previous season's league: ${ctx.previousLeagueId}`);
  out.push("");

  out.push("## Teams");
  out.push("");
  out.push(
    table(
      ["Roster", "Manager", "Team", "Division"],
      ctx.teams.map((t) => [
        `${t.rosterId}${t.isOwner ? " ★" : ""}`,
        t.managerName,
        t.teamName ?? "",
        t.division ? (ctx.divisions[t.division] ?? String(t.division)) : "",
      ]),
    ),
  );
  out.push("");
  out.push(
    ctx.owner.status === "verified"
      ? `Owner (★): roster ${ctx.owner.rosterId}, ${ctx.owner.managerName}, verified against roster ownership.`
      : "Owner: **not configured** — franchise-specific analysis is blocked.",
  );
  out.push("");

  out.push("## Interpretation notes");
  out.push("");
  out.push("- `settings.type = 2` means dynasty and `waiver_type` codes follow Sleeper's app convention; neither is in Sleeper's API docs.");
  out.push("- The TE bonus stacks with `rec` per Sleeper's support article on reception bonuses.");
  out.push("- Settings below are preserved but not interpreted by this tool. Do not infer their meaning without verification:");
  out.push("");
  out.push(
    "  " +
      Object.entries(ctx.uninterpretedSettings)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", "),
  );
  if (ctx.warnings.length > 0) {
    out.push("");
    out.push("## Warnings");
    out.push("");
    for (const w of ctx.warnings) out.push(`- ${w}`);
  }
  out.push("");
  return out.join("\n");
}
