# Project State

**Last updated:** 2026-10-21 · **Base:** `main` at 438e8b3 ([PR #33](https://github.com/allmanr/ff-gm/pull/33), squash merged). Issues #23–#25 and #27 have open PRs awaiting Owner review (#29–#31); #26 is deferred (Closed).

## Mission

A fantasy-football front office for Sleeper league `1314802188052090880`: win games and championships while compounding long-term dynasty value. The human is the **Owner**; the top-level AI is the **GM**. The Owner makes final decisions and executes moves in Sleeper (the API is read-only).

Expected invariants, verified live on every run: dynasty, Superflex, full PPR, TE reception bonus.

## Current architecture (local front office, D-015 / D-019)

- `bin/ff` — TypeScript CLI (Node 24 via `bin/node24`, no build step) over Sleeper's documented API. Every command validates the league and roster ownership first and fails closed (exit 1). 19 commands: context, standings, rosters, roster, picks, free-agents, trending, transactions, waivers, matchups, bench, schedule, player, values, trade, changes, history, backup, help.
- `bin/ff-gm` — validates context, writes trusted charter/native specialist configuration, and starts the coordinating Codex GM in `private/`. Five native roles: Research Boy, Superflex Dynasty Knower, League Watcher, Rookie Scout and AI Guru; at most three simultaneous staff threads. Sol/high (D-010); validated constitution remains separate untrusted data. `ask`, `brief`, and direct `specialist <role> "…"` calls save unique reports and JSONL events privately; interactive sessions end with a saved `-session.md` handoff. Specialists save evidence under `private/notes/staff/<role>/`; the GM owns canonical notes and the change baseline.
- `bin/ff-dev` — separate Software Dev/SRE primary session rooted in the engineering repository. It can repair failed validation without giving football advice; no engineering role is registered with the GM. Engineering reports stay private. Protected and external actions still require explicit Owner authorization.
- `private/` — gitignored; its own private GitHub repo `allmanr/ff-gm-private` (D-016).
- External data (D-018, D-021): FantasyCalc market values; nflverse schedule, lines, weekly stats, and Sleeper-ID crosswalk; FantasyPros Superflex PPR weekly ECR, read by GM agents (not `ff`) for every lineup/waiver call. Supplementary: commands degrade with a note if unavailable.
- No server, database, hosting or scheduler (D-017). Specialist deferral is superseded by the Owner's explicit D-019 decision.

## Verification status

Merge gate (2026-10-21, PR #19): subagent review findings fixed; CI and a fresh local `npm run check` passed typecheck, lint, 248 offline tests across 16 files, and leak checks over 97 files. Live `npm run verify-scoring` matched Sleeper on 1,438/1,438 rostered player-weeks. The reviewed head was 1ff5d87, squash merged as aa80d62.

Interactive-session acceptance (PR #15) passed with Codex 0.163.0: launch `ff-gm`, ask a short non-football question, then quit with Ctrl+C. The launcher exited 0, saved a new nonempty `private/reports/*-session.md` handoff, and printed private backup status and the manual backup command. This verifies session capture and shutdown, not football advice quality. A live GM recap applying the recommendation closure rules has not been run.

Earlier throwaway probes confirmed that `codex exec <options> resume <id> --json -o <file>` keeps prior context, rollout `payload.id` is the resume id, and a turnless terminal session writes no rollout. Offline tests cover session selection, failed summaries, and backup states. Session discovery still depends on Codex's rollout layout.

Standing live facts (still true until re-checked):
- `npm run verify-scoring` (2026-10-21, weeks 1–6): 1,438/1,438 rostered player-weeks match Sleeper, with `st_ff`/`st_fum_rec` approximated per D-022. Sleeper's recorded matchup points remain the actuals.
- Specialist wiring (D-019) was verified live once; evidence is in `private/evaluations/specialist-acceptance/`. This shows wiring and bounded behavior, not advice quality.
- One bounded GM acceptance run (2026-10-05) is in `private/evaluations/`. It is not a consistency benchmark.

Earlier per-PR gates (#2, #5, #12, #14, #15) are recorded in their PRs and in `git log`; they are not repeated here.

## Done

- [PR #19](https://github.com/allmanr/ff-gm/pull/19), 2026-10-21: nflverse scoring restored (D-022). `st_fum_rec` reads opponent fumble recoveries for QB/RB/FB/WR/TE only (defenders eligible at WR recover fumbles on defense) and `st_ff` counts as 0, disclosed in the stats label. `ff free-agents` PPG/L3, `--sort ppg`, `ff player` stat lines and `npm run verify-scoring` work again.

- [PR #18](https://github.com/allmanr/ff-gm/pull/18), 2026-10-21: GM charter, lineup/war-room briefs and Research Boy require FantasyPros Superflex PPR weekly ECR (with a shell extraction command, since the ranks sit in embedded JSON) for every start/sit and waiver call (D-021). The launcher test checks that the charter carries the rule. A GM dry run of the lineup brief on 2026-10-21 ran the command and cited Superflex ECR for all nine slots, explaining its one call against ECR.

- [PR #20](https://github.com/allmanr/ff-gm/pull/20), 2026-10-21: `ff roster` Avg skips 0.0 weeks. Sleeper records 0 for rostered players on bye, IR or inactive, which understated per-game averages (e.g. a WR back from four IR weeks showed 1.9 instead of 5.7). Weekly columns and Total are unchanged.

- [PR #17](https://github.com/allmanr/ff-gm/pull/17): direct GM and engineering agent runs, plus interactive GM handoffs, show startup status, the private event-log path, and a 15-second heartbeat with elapsed time and event silence on stderr. Final reports remain on stdout. The war-room brief now targets the validated current NFL week; its previous explicit next-week instruction caused a one-week shift. Offline verification covers progress during a quiet child process, cancellation, report output, failures and interactive handoffs. Direct Codex children run in a separate process group; the launcher forwards SIGINT, SIGTERM, SIGHUP and SIGQUIT exactly once, including terminal closure. A new live football brief has not been run.

- [PR #15](https://github.com/allmanr/ff-gm/pull/15) squash merged after review, CI, local checks and live interactive acceptance. Issues #7, #9, #10 and #11 are closed.
- [Issue #9, interactive session reports](https://github.com/allmanr/ff-gm/issues/9): when an interactive `ff-gm` session ends, the launcher finds that top-level Codex session (same private cwd, not exec or subagent) and resumes it once with `exec resume` to save `private/reports/<stamp>-session.md` covering actions, recommendations and follow-ups. Failed or interrupted sessions and failed summaries are saved as `# INCOMPLETE GM session`. README documents report names and the weekly commands. Session discovery reads Codex's rollout layout (marked `ponytail:` in `src/gm-launcher.ts`).
- [Issue #11, status refresh](https://github.com/allmanr/ff-gm/issues/11): header, verification and queue now describe current state; dated per-PR gates were trimmed.
- [Issue #10, private backup status visibility](https://github.com/allmanr/ff-gm/issues/10): implemented read-only backup status inspection via `ff backup` and at the conclusion of GM runs in `src/gm-launcher.ts`. Reports clean/synced, dirty, ahead, or unavailable repository/tracking state from local Git data. It never contacts the remote or prints private file names or diffs. When backup is needed, it prints the manual command.

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

From the 2026-10-21 dynasty-strategy research pass. All open PRs pass `npm run check` offline. None was run against live Sleeper/FantasyCalc or a live GM session in the cloud run that built them. The PRs merge cleanly in any order (#29 and #30 both touch `src/value-commands.ts`; a local merge of the two was checked).

- [#23](https://github.com/allmanr/ff-gm/issues/23) → [PR #29](https://github.com/allmanr/ff-gm/pull/29), awaiting review. `ff values`/`ff trade` show FantasyCalc early–late ranges for next-draft picks and a net-value tier range. `ff values --league` notes unpriced picks counted as 0. Impact: high per pick trade; display-only. Unverified: live FantasyCalc tier-row names (if they differ, no range is shown).
- [#24](https://github.com/allmanr/ff-gm/issues/24) + [#27](https://github.com/allmanr/ff-gm/issues/27) → [PR #30](https://github.com/allmanr/ff-gm/pull/30), awaiting review. `ff trade` adds both teams' active/IR counts, required drops and best-lineup change from season averages (shared `seasonAverage` helper with `ff roster`). `ff rosters` adds `SF non-QB` and `Active/IR`. Impact: high; removes the manual legality/lineup arithmetic behind the most frequent advice corrections.
- [#25](https://github.com/allmanr/ff-gm/issues/25) → [PR #31](https://github.com/allmanr/ff-gm/pull/31), awaiting review. Briefs open with the validated target week; war-room/daily add deadline/playoff countdown; recap archives closures older than two weeks. Impact: medium; protects lineup calls and trims the recommendation log read each session. Still needed after merge, privately: one live `ff-gm brief daily`/`lineup` run, and the first recap creating the archive.

### Existing limitations and deferred work

- **Private backup push** — `ff backup` and the end-of-run notice show unbacked-up state (Issue #10). Automatic push after GM sessions remains blocked by session permission policy (D-008/D-016). Run the displayed manual backup command `git -C private add -A && git -C private commit -m "..." && git -C private push` as needed. Data-loss risk only if this machine fails → Owner habit.
- **Run cost and usage limit** — 2026-10-21 war-room briefs used ~2.8–3.1M input tokens each (96% cached) vs 0.57M on 2026-10-05; the Codex limit blocked a lineup brief and a specialist call on 2026-10-21. Print per-run token usage from the final `turn.completed` event ([#34](https://github.com/allmanr/ff-gm/issues/34), ahead of the #23 queue by Owner decision), then trim context (#25 archive first); target a routine lineup brief under 1M input tokens. S → fix. Use `FF_GM_EFFORT=medium` for routine questions meanwhile.
- **Recommendation closure never run** — the #7 lifecycle shipped, but no recap has graded a past call; entries before 2026-10-21 have no status. Run `ff-gm brief recap` after week 7 → fix (Owner run, no code).
- **League renewal untested** — when the 2027 league exists, every `ff` command fails closed asking for a manual `LEAGUE_ID` edit (`src/context.ts:168`); never exercised live. → optional: dry-run the edit once the successor league exists, before the rookie draft.
- **Docs overhead** — the `Base:` hash in this file forces a docs PR after every merge (#21, #22); `IMPLEMENTATION_PLAN.md` says no issues are open (several are); the `AGENTS.md` deferred paragraph still lists AI Guru and Rookie Scout (built under D-019). XS → fix.
- **Projections** — Sleeper supplies exact recorded matchup points; there is still no forward projection feed. FantasyPros Superflex ECR now covers weekly expert opinion (D-021). Options for real projections: derive from nflverse stats or FantasyPros API ($8.99/mo). → defer until ECR plus web research proves insufficient.
- **Optional review findings (low impact, not fixed):** truncated `ff changes` snapshot crashes instead of re-baselining; commissioner pick moves in a newly added season are not listed as pick changes; `ff schedule` warns only on byes, not empty/no-team starters; a manager who changes between owner and co-owner splits into two `ff history` rows; picks FantasyCalc does not price count as 0 without a note in `ff values` (note added by PR #29, pending merge).
- **Bench verdict edge cases** — ties and commissioner-adjusted totals can be described incorrectly in hindsight text; does not change the lineup optimizer or Sleeper actuals → optional, deferred.
- **FantasyCalc `te+`** — bonus size undocumented; mapped from the league's +0.5 and labeled → accept.

## Closed — don't reopen without new evidence

- **2026-10-21 retrospective deferrals** ([notes](meetings/2026-10-21-retrospective.md)) → autonomous SRE agent (D-008), scheduled briefs/notifications (would need a channel choice and a cron job on the Owner's machine) and hosting not felt in three weeks of use; stay deferred. Reopen only when an incident or missed routine shows a human run was not enough. The 2026-09-27 plan's supersession and the one direct-to-`main` docs commit (b18d4d0, before PR #13) are closed lessons.

- **[#26](https://github.com/allmanr/ff-gm/issues/26) next-draft slot projection (2026-10-21)** → deferred, not built now. The issue's own trigger isn't met yet: the #23 tier ranges have not shipped (PR #29), and the offseason pick market is months away. A mid-season projection carries ~8 weeks of variance and rests on an uninterpreted playoff-qualification assumption (`playoff_seed_type`, divisions). The fix is M-sized: new draft-detail and bracket endpoints, a fixture-recorder change, and a league-fact decision to record. Reopen when the GM is hand-projecting slots after #29 merges, or after the final regular-season week and before the offseason draft market (non-playoff slots 1–6 are then fixed by max PF; playoff slots 7–12 stay a range until the championship, and the draft-order rule still needs verifying as the issue describes), whichever comes first. Leave the issue open on GitHub as the tracker.

- **Dynasty research candidates not filed (2026-10-21)** → target-week header already fixed by PR #17 (the mis-targeted war-room report predates the merge; reopen only if a post-merge report mis-targets); market-phase line (opinion; the dynasty specialist owns timing); age-matrix code (`ff roster`/`ff values` show ages); rest-of-season bye matrix (`ff schedule --week N` covers it); franchise-direction memo (GM/Owner task, not engineering); FAAB calculator, memo length caps.

- **nflverse special-teams coverage gap** → closed by D-022 (approximation verified 1,438/1,438 against Sleeper). Reopen only if `verify-scoring` reports misses.

- **PR #15 live interactive merge gate** → passed with a real question, Ctrl+C, a saved session handoff and the final backup notice. Issues #7, #9, #10 and #11 are closed; do not recreate the old stacked-branch queue.
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
