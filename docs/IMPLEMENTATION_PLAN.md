# Implementation plan

**Updated:** 2026-10-02 · **Status:** Phases 1–2 done; Phase 3 items 1–3 done (values, changes, history) · **Decision:** [D-015](DECISIONS.md) · **Target architecture (later):** [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md)

Build the smallest thing that gives the Owner validated football advice this season. Add the next piece only when its absence is felt in real use.

## Phase 1 — `ff` CLI (validated league data)

Commands, each of which validates the league before printing anything:

| Command | Output |
|---|---|
| `ff context` | Fetch league/users/rosters, verify the four invariants, write `private/LEAGUE_CONSTITUTION.md` and `private/context.json`; exit 1 on failure |
| `ff standings` | Records, points for/against, divisions |
| `ff rosters` | Every team: manager, record, positional counts, QB depth (Superflex scarcity), age |
| `ff roster [me\|roster_id\|username]` | Players with slot, position, team, age, injury, weekly and season points |
| `ff free-agents [--pos]` | Unrostered QB/RB/WR/TE ranked by Sleeper's search rank, with trend and injury |
| `ff trending [--type add\|drop]` | Sleeper trending players with league availability |
| `ff transactions [--week]` | Trades (players, picks, FAAB), waivers with bids, adds/drops |
| `ff picks [team]` | Future pick ownership derived from defaults plus traded picks |
| `ff matchups [--week]` | Scores and the Owner's matchup |
| `ff player <name\|id>` | Player detail, rostering team, weekly points |

**Done:** `npm run check` passes on anonymized fixtures (no network), and every command runs against the live league.

## Phase 2 — GM v0

- `gm/CHARTER.md`: GM role, decision checklist (market vs. football vs. roster value, Superflex QB scarcity, TE bonus, picks, FAAB), reporting style, and the rule that every claim about this league comes from `ff`.
- `scripts/gm`: runs `ff context` (fails closed), assembles `private/AGENTS.md` from the charter plus the constitution, then starts Codex in `private/` with web search and network access for `ff`. `scripts/gm ask "question"` runs one non-interactive turn and saves the answer under `private/reports/`.

**Done:** the GM answers "who do I start this week and what waiver claims should I make?" from the Owner's actual roster and scoring.

## Phase 3 — when it's missed (in rough order)

1. ~~`ff changes`~~ — done: deterministic League Watcher with snapshots in `private/snapshots/`.
2. ~~League history~~ — done: `ff history` across `previous_league_id` seasons with per-manager tendencies.
3. ~~Dynasty market values~~ — done: FantasyCalc via `ff values` / `ff trade`. Still open: a projection source and an exact-scoring engine with TE-bonus tests (see PROJECT_STATE).
4. A scheduled Tuesday war-room run (`codex exec` from cron) with a push notification — needs the Owner's channel choice.
5. A phone surface, hosting, and the SRE agent (D-017).

## Working rules

- Any coding agent may build this; keep one agent per branch at a time.
- `private/` never enters the public repository (D-016).
- Record new durable choices in DECISIONS and current status in PROJECT_STATE.
