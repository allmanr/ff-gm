# Implementation plan

**Updated:** 2026-10-20 · **Status:** Phases 1–4 built; recommendation closure, backup status and interactive reports merged in [PR #15](https://github.com/allmanr/ff-gm/pull/15) · **Decisions:** [D-015](DECISIONS.md), [D-018](DECISIONS.md), [D-019](DECISIONS.md) · **Target architecture (later):** [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md)

Build the smallest thing that gives the Owner validated football advice this season. Add the next piece only when its absence is felt in real use.

## Phase 1 — `ff` CLI (done)

Every command validates the league and roster ownership before printing anything (exit 1 on failure). Run `ff help` for options.

| Command | Output |
|---|---|
| `ff context` | Validate; write `private/LEAGUE_CONSTITUTION.md` and `private/context.json` |
| `ff standings`, `ff rosters` | Records and divisions; every team's QB depth, positional counts, ages, 1sts |
| `ff roster [team]` | Slots, byes, weekly league points, market value, FAAB left, future picks |
| `ff picks [team]` | Future pick ownership (defaults plus traded picks) |
| `ff free-agents [--pos] [--sort ppg]` | Unrostered startable players with value, depth and trends; league-scored PPG requires complete source coverage |
| `ff trending`, `ff transactions`, `ff waivers` | Market heat; league moves; observed waiver run times, FAAB left, winning bids |
| `ff matchups`, `ff bench`, `ff schedule` | Scores and head-to-head; hindsight best lineup; games, byes, kickoffs, implied totals |
| `ff player <name\|id>` | Detail, ownership, league points, scored stat lines for any player |
| `ff values [team\|--league]`, `ff trade "<give>" "<get>"` | FantasyCalc market values; trade market check |
| `ff changes`, `ff history [manager]`, `ff backup` | League Watcher diff since last run; trades across seasons; private repo backup status |

## Phase 2 — GM v0 (done)

- `gm/CHARTER.md`: role, ground rules (facts only from `ff`, fail closed, off-limits sources), tools, decision lenses, recurring work, memory files, output style.
- `bin/ff-gm`: validates, assembles `private/AGENTS.md`, starts Codex in `private/`. `ask "…"` for one turn; `brief <name>` for the routines in `gm/briefs/`.
- Material recommendations use explicit lifecycle states, with active items above closed history and decision quality separate from observed outcomes. Interactive sessions save a short handoff on exit; successful one-shot runs and interactive exits print private backup status. The live question → Ctrl+C → report and backup-notice flow passed before PR #15 merged.

## Phase 3 — added after real gaps (done)

League Watcher (`ff changes`), league history, FantasyCalc values, NFL schedule and lines, observed waiver timing, nflverse scoring with source-coverage refusal (currently unavailable because `st_ff` and `st_fum_rec` are missing; the earlier 749/749 comparison assumed those keys were zero), lineup optimizer (matches Sleeper max PF).

## Phase 4 — specialist staff (done, D-019)

- Real native Codex roles: Research Boy, Superflex Dynasty Knower, League Watcher, Rookie Scout and AI Guru. The GM delegates bounded assignments, waits, reads evidence, resolves disagreements and owns canonical notes.
- Trusted role prompts and a registry generate private native TOML configuration. Maximum three simultaneous staff threads; no recursive staff delegation. Direct calls use `ff-gm specialist <role> "task"`.
- Separate Software Dev/SRE primary session through `ff-dev`, with engineering writes and no football advice while diagnosing validation failures. It is not registered as a GM subagent.
- Private evidence directories per specialist; unique final reports and execution logs. Strict launcher arguments, symlink-safe validation/configuration writes and shared daily player-download coordination protect parallel operation.
- Verification: offline launcher/permission/privacy/cache regressions, a live all-five-role delegation acceptance run, a separate live SRE run, and an OS sandbox probe. Private acceptance evidence stays under `private/evaluations/`.

## Next engineering work

See the engineering queue in [PROJECT_STATE.md](PROJECT_STATE.md#engineering-queue). PR #15 is merged and issues #7, #9, #10 and #11 are closed. No open GitHub issues remain. Use the documented limitations and Owner direction to select future work.

## Deferred product work

The Owner continues manual weekly use with `ff-gm brief war-room` and `ff-gm brief lineup`. Keep football findings in `private/notes/`.

Scheduled briefs still need a notification-channel decision and evidence of recurring use. Projections remain deferred until research proves insufficient. Phone access and hosting remain deferred under D-017. The existing scoring-source gap stays open without weakening scoring refusal or adding an unapproved source.

## Working rules

- Any coding agent may build this; keep one agent per branch at a time. `npm run check` before every commit.
- `private/` and anything identifying the Owner, league-mates, or strategy never enter the public repository (D-016; `npm run check-leaks` catches names and IDs, not strategy).
- New external data needs a D-018-style terms check first.
- Record new durable choices in DECISIONS and current status in PROJECT_STATE.
