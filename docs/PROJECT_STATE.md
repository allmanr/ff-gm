# Project State

**Last updated:** 2026-10-20 · **Base:** `main` at 2bd34c6 (PR #14). Unmerged, stacked: `feat/issue-7-10-recap-closure-backup-status` (#7, #10) → `feat/issue-9-interactive-session-reports` (#9, #11).

## Mission

A fantasy-football front office for Sleeper league `1314802188052090880`: win games and championships while compounding long-term dynasty value. The human is the **Owner**; the top-level AI is the **GM**. The Owner makes final decisions and executes moves in Sleeper (the API is read-only).

Expected invariants, verified live on every run: dynasty, Superflex, full PPR, TE reception bonus.

## Current architecture (local front office, D-015 / D-019)

- `bin/ff` — TypeScript CLI (Node 24 via `bin/node24`, no build step) over Sleeper's documented API. Every command validates the league and roster ownership first and fails closed (exit 1). 19 commands: context, standings, rosters, roster, picks, free-agents, trending, transactions, waivers, matchups, bench, schedule, player, values, trade, changes, history, backup, help.
- `bin/ff-gm` — validates context, writes trusted charter/native specialist configuration, and starts the coordinating Codex GM in `private/`. Five native roles: Research Boy, Superflex Dynasty Knower, League Watcher, Rookie Scout and AI Guru; at most three simultaneous staff threads. Sol/high (D-010); validated constitution remains separate untrusted data. `ask`, `brief`, and direct `specialist <role> "…"` calls save unique reports and JSONL events privately; interactive sessions end with a saved `-session.md` handoff. Specialists save evidence under `private/notes/staff/<role>/`; the GM owns canonical notes and the change baseline.
- `bin/ff-dev` — separate Software Dev/SRE primary session rooted in the engineering repository. It can repair failed validation without giving football advice; no engineering role is registered with the GM. Engineering reports stay private. Protected and external actions still require explicit Owner authorization.
- `private/` — gitignored; its own private GitHub repo `allmanr/ff-gm-private` (D-016).
- External data (D-018): FantasyCalc market values; nflverse schedule, lines, weekly stats, and Sleeper-ID crosswalk. Supplementary: commands degrade with a note if unavailable.
- No server, database, hosting or scheduler (D-017). Specialist deferral is superseded by the Owner's explicit D-019 decision.

## Verification status

Current gate (2026-10-20, branch `feat/issue-9-interactive-session-reports`): `npm run check` passes typecheck, lint, 234 offline tests across 15 files, and leak checks over 95 files. Live: `ff backup` reported clean / synced. Throwaway Codex 0.163.0 probes confirmed: `codex exec <options> resume <id> --json -o <file>` keeps the prior context; rollout `payload.id` is that id; a terminal session records `source: "cli"`, `originator: "codex-tui"`; a turnless session writes no rollout; quitting with Ctrl+C exits 0. Mutation checks confirm each session-selection filter is tested. Not run live: a full `ff-gm` session with summary, or a GM recap applying the closure rules.

Standing live facts (still true until re-checked):
- `npm run verify-scoring` refuses because nflverse cannot supply `st_ff` and `st_fum_rec` (since 2026-10-02). The earlier 749/749 match assumed those were zero and does not prove coverage. Sleeper's recorded matchup points remain the actuals.
- Specialist wiring (D-019) was verified live once; evidence is in `private/evaluations/specialist-acceptance/`. This shows wiring and bounded behavior, not advice quality.
- One bounded GM acceptance run (2026-10-05) is in `private/evaluations/`. It is not a consistency benchmark.

Earlier per-PR gates (#2, #5, #12, #14) are recorded in their PRs and in `git log`; they are not repeated here.

## Done

- [Issue #9, interactive session reports](https://github.com/allmanr/ff-gm/issues/9): when an interactive `ff-gm` session ends, the launcher finds that top-level Codex session (same private cwd, not exec or subagent) and resumes it once with `exec resume` to save `private/reports/<stamp>-session.md` covering actions, recommendations and follow-ups. Failed or interrupted sessions and failed summaries are saved as `# INCOMPLETE GM session`. README documents report names and the weekly commands. Session discovery reads Codex's rollout layout (marked `ponytail:` in `src/gm-launcher.ts`).
- [Issue #11, status refresh](https://github.com/allmanr/ff-gm/issues/11): header, verification and queue now describe current state; dated per-PR gates were trimmed.
- [Issue #10, private backup status visibility](https://github.com/allmanr/ff-gm/issues/10): implemented safe, read-only backup status inspection via `ff backup` and surfaced at the conclusion of routine GM runs in `src/gm-launcher.ts`. Checks clean/synced, dirty, ahead, and remote-unavailable states without making network calls or altering git remotes; provides the exact manual backup command when unbacked-up; strictly protects privacy by never printing file names, paths, or diffs.

- [Issue #7, recommendation closure](https://github.com/allmanr/ff-gm/issues/7): established structured `notes/recommendations.md` lifecycle with explicit statuses (`OPEN`, `ACTED`, `DECLINED`, `SUPERSEDED`, `ACTION_UNKNOWN`), `## Active / Open` section at the top for immediate scanning, and `## Closed history`. Strict separation between decision quality (soundness based on facts available at recommendation time) and observed outcome (Sleeper points, results, and variance). Updated `gm/CHARTER.md` (lifecycle, memory, output style examples for lineup, waiver, and trade closures), `src/gm-launcher.ts` seed template, and `gm/briefs/recap.md` step 5 to check Sleeper transactions and matchups and ask the Owner one concise question when an action cannot be verified.

- [Issue #8, trade ownership and advice preflight](https://github.com/allmanr/ff-gm/issues/8): `ff trade` enforces ownership of "we give" assets, validates that "we get" assets are held by the counterparty (free agents are rejected), resolves draft picks to unambiguous owned picks with original team tracking, and takes the counterparty from `--with <team>` or the get-side players, refusing to guess. Merged in [PR #14](https://github.com/allmanr/ff-gm/pull/14). Added the recommendation preflight and reviewed trade example to `gm/CHARTER.md` and `gm/briefs/war-room.md`, separating market prices, recorded actual points, and forward estimates while comparing against bench replacements and counterparty decline incentives.

- [Issue #6, private session export guard](https://github.com/allmanr/ff-gm/issues/6): merged in [PR #12](https://github.com/allmanr/ff-gm/pull/12). Artifact-path checks run without private context, and existing identifier and staged-blob checks remain. The README documents private export storage and the limit on detecting arbitrarily renamed strategy text. The plan advances to issue #8; ticket closed on merge.

- Specialist staff (D-019): trusted versioned role prompts/registry, native delegation, direct specialist calls, independent private evidence records, separate engineering entrypoint, and private execution logs. Launcher rejects arbitrary Codex flags, traversing brief names, unsafe private roots, symlinked generated files and unexpected football-workspace agent definitions.
- Parallel-operation fixes: shared player-download coordination with OS `flock`, bounded waits, crash release and daily attempt reservation (failed attempts included); no HTTP retry of the large player endpoint. Context writes refuse symlinks before any output is promoted, and the launcher checks those paths before validation can overwrite trusted instructions.

- Docs reconciled to lean V1 (D-015–D-017); Owner identity verified and stored privately.
- `ff` CLI with fail-closed gate; GM charter, launcher, and briefs; anonymized fixtures; CI; leak check.
- GM acceptance run (Sol/high, ~189k tokens, 38 web searches) answered lineup, waiver, and trade questions from the Owner's actual roster.
- Review fixes: null-matchup pairing, renewed-league fail-closed, stale-data notices, offseason (week-1) transactions, multi-position players (`fantasy_positions`), FantasyCalc one-request-per-hour on failures, and others.
- PR #2 fixes: Sleeper names stay out of GM instruction files; leak checks scan staged blobs even after working-copy sanitization/removal; FantasyCalc attempt reservations use an atomic cross-process lock and recheck the hourly limit before fetching. Two-process tests cover both successful and failed refreshes.
- Final PR #2 fixes: unsupported scoring fails at both direct scoring and stat-book boundaries (including K/DEF/IDP when startable); unavailable PPG sorting is labeled; manual refresh honors the daily cache; trades require a verified Owner; waiver medians average both middle bids. The scoring verifier also fails when no scores are comparable.
- Private data repo created and first push made.
- 2026-10-05: `ff schedule --week N` uses that week's saved Sleeper lineup (was the current week's, giving false bye warnings). GM charter now requires re-verifying a prior recommendation's premises and showing the weekly points gain before recommending a move. `ff free-agents` lists free-agent backups to injured starters (from Sleeper depth charts); the war-room brief re-checks open trade ideas instead of requiring two new ones.
- 2026-10-05 review fixes: saved schedule rows now use the matchup's player snapshot and starters, preserving players subsequently dropped or moved to IR; today's active roster is the fallback when no saved lineup exists. The charter permits recommendations with an explicitly unavailable points comparison and separately sourced production estimates; missing points never imply zero gain. Regression coverage checks both roster changes and that the launcher supplies these evidence rules.

## Open (impact → verdict)

### Engineering queue

No open implementation tickets once the two stacked branches merge. The next work comes from the limitations below or from Owner direction. Before merging #9, run one real `ff-gm` session and confirm it saves a `-session.md` summary → fix if it does not.

### Existing limitations and deferred work

- **nflverse scoring coverage** — no PPG/last-3 rankings while `st_ff` and `st_fum_rec` are unavailable: the `ff free-agents` PPG/L3 columns are blank, `--sort ppg` falls back to market value, `ff player` shows no scored stat lines, and `npm run verify-scoring` exits nonzero. The safe refusal is fixed; expanding source coverage is deferred. Use Sleeper recorded matchup points meanwhile. Free-agent evaluation is the main user-facing gap → fix when a permitted source covers both keys.
- **Private backup push** — `ff backup` and the end-of-run notice show unbacked-up state (Issue #10). Automatic push after GM sessions remains blocked by session permission policy (D-008/D-016). Run the displayed manual backup command `git -C private add -A && git -C private commit -m "..." && git -C private push` as needed. Data-loss risk only if this machine fails → Owner habit.
- **Scheduled briefs + notifications** — needs a channel choice and a cron job on the Owner's machine (runs only while it is awake). → Owner decides.
- **Plus usage** — one deep GM run used ~189k tokens. Use `FF_GM_EFFORT=medium` for routine questions; watch Codex limits in heavy weeks.
- **Projections** — Sleeper supplies exact recorded matchup points; there is still no forward projection feed. Options: derive from nflverse stats or FantasyPros API ($8.99/mo). → defer until the GM's web research proves insufficient.
- **Optional review findings (low impact, not fixed):** truncated `ff changes` snapshot crashes instead of re-baselining; commissioner pick moves in a newly added season are not listed as pick changes; `ff schedule` warns only on byes, not empty/no-team starters; a manager who changes between owner and co-owner splits into two `ff history` rows; picks FantasyCalc does not price count as 0 without a note in `ff values`.
- **Bench verdict edge cases** — ties and commissioner-adjusted totals can be described incorrectly in hindsight text; does not change the lineup optimizer or Sleeper actuals → optional, deferred.
- **FantasyCalc `te+`** — bonus size undocumented; mapped from the league's +0.5 and labeled → accept.

## Closed — don't reopen without new evidence

- **Specialist deferral** → superseded by explicit Owner direction, implemented under D-019. Do not use the old V1 sequencing decision to defer staff again.
- **Parallel player downloads and validation-output symlinks** → fixed for specialist operation; offline regressions cover real processes, crash release and protection of trusted targets.

- **Saved lineup completeness and unavailable point comparisons** → fixed. Historical rows no longer disappear after roster changes, and the charter no longer requires nonexistent scoring evidence. Regression checks fail without the fixes.
- Agents API runtime, Vercel/Postgres deployment, and owner-bootstrap UI for V1: replaced by D-015.
- Public vs. private repository: stays public; private data in `private/` (D-016).
- Plan-in-one-model, implement-in-another for V1: rejected as handoff overhead.
- Waiver timing: observed from transactions (`ff waivers`) — main run Wednesday ~11:00 AM CT, daily runs ~11:01 AM CT.
- Data sources (D-018): KeepTradeCut and RotoWire off-limits; Dynasty Daddy avoided (built on KTC scraping); DynastyProcess values not used (derived from scraped FantasyPros data).
- Branch history: squashed by the Owner before pushing; no strategy text in the public history.
- `ff changes` in the recap brief consumed the snapshot; the recap now uses `ff transactions` for the week.

### Final PR #2 comment dispositions

- **Scoring, daily refresh, Owner gate, and median threads** → fixed with regression tests. The earlier unknown-key-only scoring fix was incomplete and is superseded by refusal for every unsupported active key.
- **Instruction contamination, staged leaks, FantasyCalc concurrency, and CLI exit 4** → closed; retained fixes checked against the current implementation and regression suite.
- **Complexity: archive/delete the target spec** → skip. It is explicitly marked as later architecture and linked from the plan/README; moving it adds link churn without changing the V1 build list.
- **Complexity: memoize pick derivation, merge optional-source helpers, extract W-L formatting** → optional; skip for this correctness pass. Repeated short calls currently agree, and no behavior defect was demonstrated.
- **Complexity: merge schedule and stats caches** → skip as proposed. The schedule cache validates before promotion and refetches invalid cached content; the suggested text helper does not preserve those behaviors.
- **Complexity: parse every numeric CSV column instead of `STAT_COLUMNS`** → optional; skip. Explicit stat columns keep metadata out of score lines; coverage refusal fixes the demonstrated scoring defect.
- **Complexity: merge three injected fetchers; remove client URL/timeout options, error path, stat-book weeks/stale, value timestamp, league status, and display week** → optional; skip. These small interfaces have no demonstrated runtime cost or correctness problem. Separate fetchers are now used to keep command tests offline.
- **Complexity: replace Hungarian lineup solver** → skip, as the review itself recommends. Exact assignment preserves correctness for overlapping flex eligibility.
