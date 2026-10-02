# Implementation plan

**Updated:** 2026-10-02 · **Status:** Phases 1–3 built and verified (PR #2) · **Decisions:** [D-015](DECISIONS.md), [D-018](DECISIONS.md) · **Target architecture (later):** [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md)

Build the smallest thing that gives the Owner validated football advice this season. Add the next piece only when its absence is felt in real use.

## Phase 1 — `ff` CLI (done)

Every command validates the league and roster ownership before printing anything (exit 1 on failure). Run `bin/ff help` for options.

| Command | Output |
|---|---|
| `ff context` | Validate; write `private/LEAGUE_CONSTITUTION.md` and `private/context.json` |
| `ff standings`, `ff rosters` | Records and divisions; every team's QB depth, positional counts, ages, 1sts |
| `ff roster [team]` | Slots, byes, weekly league points, market value, FAAB left, future picks |
| `ff picks [team]` | Future pick ownership (defaults plus traded picks) |
| `ff free-agents [--pos] [--sort ppg]` | Unrostered startable players with value, depth, trends, and league-scored PPG |
| `ff trending`, `ff transactions`, `ff waivers` | Market heat; league moves; observed waiver run times, FAAB left, winning bids |
| `ff matchups`, `ff bench`, `ff schedule` | Scores and head-to-head; hindsight best lineup; games, byes, kickoffs, implied totals |
| `ff player <name\|id>` | Detail, ownership, league points, scored stat lines for any player |
| `ff values [team\|--league]`, `ff trade "<give>" "<get>"` | FantasyCalc market values; trade market check |
| `ff changes`, `ff history [manager]` | League Watcher diff since last run; trades across seasons with tendencies |

## Phase 2 — GM v0 (done)

- `gm/CHARTER.md`: role, ground rules (facts only from `ff`, fail closed, off-limits sources), tools, decision lenses, recurring work, memory files, output style.
- `scripts/gm`: validates, assembles `private/AGENTS.md`, starts Codex in `private/`. `ask "…"` for one turn; `brief <name>` for the routines in `gm/briefs/`.

## Phase 3 — added after real gaps (done)

League Watcher (`ff changes`), league history, FantasyCalc values, NFL schedule and lines, observed waiver timing, nflverse scoring with source-coverage refusal (currently unavailable because `st_ff` and `st_fum_rec` are missing; the earlier 749/749 comparison assumed those keys were zero), lineup optimizer (matches Sleeper max PF).

## Next — only when real use shows the need

1. Owner uses the GM weekly (`scripts/gm brief war-room` on Tuesdays, `lineup` before kickoffs). Note what it gets wrong in `private/notes/`.
2. Scheduled briefs with a notification channel, once the Owner picks one.
3. Forward projections, if the GM's research proves insufficient (PROJECT_STATE lists the options).
4. Optional review findings listed in PROJECT_STATE.
5. Phone surface, hosting, and the SRE agent (D-017) — not before the above.

## Working rules

- Any coding agent may build this; keep one agent per branch at a time. `npm run check` before every commit.
- `private/` and anything identifying the Owner, league-mates, or strategy never enter the public repository (D-016; `npm run check-leaks` catches names and IDs, not strategy).
- New external data needs a D-018-style terms check first.
- Record new durable choices in DECISIONS and current status in PROJECT_STATE.
