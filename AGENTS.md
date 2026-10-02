# AGENTS.md — Fantasy Football GM (engineering)

Engineering instructions for coding agents working in this repository. The football GM itself runs from `private/` with its own charter (`gm/CHARTER.md`); these rules are for building the tools it uses.

Always read `docs/PROJECT_STATE.md` and `docs/DECISIONS.md`. Read `docs/IMPLEMENTATION_PLAN.md` before starting a new phase.

## Mission

A fantasy-football front office for Sleeper league `1314802188052090880`. The human is the Owner; the top-level football agent is the GM. V1 is deliberately small: a validated Sleeper CLI (`ff`) plus one GM agent that uses it. Build the next thing only when its absence is felt.

## Absolute correctness rule

No football recommendation may be generated without a validated league context. Expected invariants, verified against live Sleeper on every run:

- dynasty (`settings.type = 2`);
- Superflex (`SUPER_FLEX` in `roster_positions`);
- full PPR (`scoring_settings.rec = 1`);
- TE reception bonus (`scoring_settings.bonus_rec_te > 0`).

Enforcement is mechanical, not a prompt: every `ff` data command validates the league first and exits non-zero on failure, and `scripts/gm` refuses to start the GM if `ff context` fails. Never replace an exact Sleeper setting with a generic fantasy assumption. Changing an expected invariant requires an explicit Owner decision recorded in `docs/DECISIONS.md`, never a code "fix" to make validation pass.

## Sleeper facts that bite

- IDs are strings. The league ID exceeds JavaScript's safe-integer range; never coerce IDs to numbers. (`roster_id` is a small integer and is fine.)
- The TE reception bonus applies by the player's primary position and stacks with `rec`; it does not depend on the lineup slot.
- An unrecognized scoring key is surfaced as unresolved; any calculation that depends on it must refuse rather than treat it as zero.
- `traded_picks` lists only traded picks. Ownership = every roster's own picks for each season/round, overridden by traded entries (`roster_id` = original team, `owner_id` = current team).
- `matchups[].players_points` are points under this league's exact scoring — prefer them over recomputing actuals.
- League IDs are per season; history lives behind `previous_league_id`.
- The documented API is read-only. The GM advises; the Owner acts in Sleeper.
- `/players/nfl` is ~5 MB; fetch at most once per day (cached under `.local/cache/`).
- Use only the documented HTTP API at docs.sleeper.com. No undocumented endpoints or WebSockets.

## Private data — the repository is public

- `private/` is gitignored and is its own private git repository. It holds the Owner identity (`private/owner.json`), the generated constitution, GM notes, strategy, manager profiles, reports, and recommendation history.
- Never copy Owner identity, strategy, or GM output into committed files, test fixtures, commit messages, issues, or PR text.
- Committed fixtures are anonymized (`scripts/record-fixtures.ts`). Code must run its tests without `private/`.

## Engineering rules

- TypeScript strict, Node 24 (native type stripping; no build step). Zod for every Sleeper payload. Vitest for tests.
- Deterministic code for fetching, diffing, math, and validation; the LLM handles judgment and communication.
- Tests must not hit the network. Add a test for every bug fixed.
- Keep it boring: no server, database, queue, or framework until a concrete need is recorded in `docs/PROJECT_STATE.md`.
- Commit on a feature branch with coherent messages. `npm run check` (typecheck + lint + tests) must pass before commit.

## Deferred, not rejected

The autonomous Software Dev/SRE agent (D-008), AI Guru, Rookie Scout, hosted deployment, and scheduled jobs are deferred until V1 is in regular use. When the SRE agent is built, D-008's policy applies: low-risk repairs may auto-merge after automated gates pass; protected actions (secrets, permissions, billing, destructive data changes, disabling correctness gates, major architecture changes, budget increases) escalate to the Owner.

## Research data

Prefer permitted structured sources for projections, values, and injuries; use web research for qualitative context. Do not scrape KeepTradeCut (its FAQ forbids it).

## Project memory

- `docs/PROJECT_STATE.md` — current state (Done / Open / Closed). Update in place.
- `docs/DECISIONS.md` — durable decisions. Supersede, don't delete.
- `docs/meetings/` + `docs/MEETING_NOTES.md` — dated history; read only when a task depends on past rationale. Canonical state lives in the two files above.
