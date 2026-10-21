# Project retrospective — 2026-10-21

**Scope:** 2026-09-27 (first planning) through `main` at a4d813f (PR #28), weeks 4–7 of the 2026 season. **Evidence:** git history and 15 merged PRs, issues #6–#27, `docs/` (state, decisions, plan, meetings), a fresh `npm run check`, CI history, live `ff` read-only runs, and the private GM ledger, reports and run logs. GM-performance findings (graded calls against Sleeper outcomes) are in the private repository, not here.

## Summary

V1 shipped and works. The fail-closed `ff` CLI and the GM have been in weekly use since week 4, the scoring engine matches Sleeper on 1,438/1,438 rostered player-weeks, and the check gate is green (249 tests, leak check clean, CI green on the last 10 merges). The weak points are operational, not code:

1. **The recommendation-closure loop has never run.** Issue #7 shipped the lifecycle, but no recap has graded a past call, so the project can't yet show whether the advice is good.
2. **Agent cost is up roughly 5x per run.** A war-room brief now consumes ~2.8–3.1M input tokens (96% cached), against 0.57M for the 2026-10-05 acceptance run. On 2026-10-21 the Codex usage limit blocked a lineup brief and a specialist call two days before a lineup lock.
3. **Private data is not backed up.** `private/` has 33 uncommitted changes (12 modified, 21 untracked files), including every 2026-10-21 report and note; the last private commit is 2026-10-20.
4. **The docs process creates its own work.** 6 of 19 commits on `main` are docs-only, and two PRs (#21, #22) exist only to bump the `Base:` hash in `PROJECT_STATE.md`.

Confidence: high on the facts above (each re-checked today); moderate on the cost diagnosis (event logs show per-run totals, not a breakdown by cause).

## Plan vs. shipped

| V1 goal (D-015, 2026-10-02) | Shipped | Verdict |
|---|---|---|
| `ff` CLI over Sleeper's documented API, fail-closed on the four invariants | 19 commands; every one validates league and ownership first | Met |
| One Codex GM using `ff` | GM plus five native specialists (D-019, Owner-directed 2026-10-05) and a separate `ff-dev` engineering session | Exceeded scope by Owner decision |
| No server, DB, hosting, scheduler | Still none (D-017) | Met |
| Public repo, private data (D-016) | `private/` nested repo; anonymized fixtures; leak check on staged blobs | Met; backup habit lagging |
| Exact league scoring | Engine matches Sleeper 1,438/1,438 (D-022 approximation for two special-teams keys) | Met |

Timeline: planning 2026-09-27 → V1 built and merged 2026-10-02 (the same day as the lean-V1 review) → first live GM use 2026-10-02 (week 4) → specialists merged 2026-10-19 → 11 PRs in the 36 hours of 2026-10-20/21.

## What worked

- **The lean-V1 reset (D-015).** The 2026-09-27 plan gated the first GM behind deployment, Postgres and an autonomous SRE milestone. Cutting to CLI + one agent produced a usable GM five days later, in time for week 4.
- **Fail-closed validation and the scoring verifier.** No invariant failure has reached advice. `npm run verify-scoring` turned a vague "nflverse can't cover special-teams keys" gap into a measured 1,437 → 1,438 decision (D-022).
- **Deterministic tools for arithmetic.** Ownership-checked `ff trade` (#14), the exact lineup optimizer and `ff bench` hindsight review give the GM numbers it no longer computes by hand.
- **Test discipline.** Every bug fix since PR #2 carries a regression test; 249 offline tests run in ~31 s. CI has not failed on `main`.
- **Data-source terms checks (D-018, D-021).** Each new source got a dated terms review before use; two popular sources were rejected on terms.

## What didn't

| Issue | Evidence | Impact | Verdict |
|---|---|---|---|
| Closure loop never exercised | No historical ledger entry before 2026-10-21 has a status; no recap run since PR #15 (PROJECT_STATE notes this) | No measure of advice quality after 3 weeks of use; repeated errors are caught only when the Owner notices | **Fix** — run the recap after week 7 |
| Same evidence omission corrected three times | GM lineup calls omitted current expert rankings and full bench comparison on 2026-10-07, 10-14 and 10-21; fixed by charter rule (D-021, PR #18) only after the third | Owner review time each week; avoidable weaker-lineup risk | **Fixed** (PR #18); verify on the next lineup brief |
| Data bugs fed GM inputs for weeks | Pre-#19, free-agent PPG was blank for every player (scoring refusal); pre-#20, `ff roster` Avg counted bye/IR zeros (a WR back from IR showed 1.9 instead of 5.7); pre-#17, war-room targeted the wrong week; pre-#4, saved-lineup schedule gave false bye warnings | GM worked around missing or skewed numbers in waiver and lineup comparisons during weeks 4–6 | **Fixed**; lesson below |
| Run cost and usage limit | Event logs: 0.57M input tokens (10-05) → 2.78M and 3.07M (10-21 war-room and brief); 43 shell commands, 4 staff calls and 3 web searches in one war-room brief; two runs failed on the usage limit | Advice blocked in a lock week; Owner fell back to running roles in another agent | **Fix** — measure, then trim context (see actions) |
| Private backup lagging | 33 uncommitted changes in `private/` (12 modified, 21 untracked); last commit 2026-10-20 | Loss of the week's notes only if this machine fails; low probability, cheap to fix | **Fix** — Owner habit / one command |
| Advice written outside the GM | Some 2026-10-19 ledger entries came from a general coding-agent session, not the chartered GM; one was superseded for a misread | Two advisors with different rules write to one ledger | **Optional** — label or route through `ff-gm` |
| Sept-27 planning largely discarded | 7 of 22 decisions superseded wholly (D-001, D-004, D-012) or partly (D-010, D-014, D-015, D-017) within 9 days; ~3,000 lines of spec archived or parked | Sunk planning time; no ongoing cost | **Closed** — lesson recorded |
| A docs commit went directly to `main` | b18d4d0 (2026-10-20) has no PR; PR #13 then made feature branches mandatory | None since | **Closed** |

Lesson from the data bugs: three of the four were noticed as wrong-looking output in use, not caught by tests; the fourth (#19) was a known, documented gap. A cheap guard is to have the GM state which `ff` numbers were blank or labeled approximate in each brief, which surfaces the next one sooner. Optional.

## Process

- **PR flow:** 15 merged PRs; median feature PR merged ~25 minutes after opening; PR #5 (specialists, +922/−150) stayed open 13 days. Squash-merge and feature-branch rules hold since #13.
- **Check gate:** `npm run check` green today (typecheck, lint, 249 tests in 16 files, leak check over 97 files). `verify-scoring` last run 2026-10-21 on weeks 1–6.
- **Docs overhead:** 6 docs-only commits out of 19 on `main` (b18d4d0, #13, #16, #21, #22, #28). The `Base:` hash line in `PROJECT_STATE.md` forces a follow-up PR after every merge. `IMPLEMENTATION_PLAN.md` still says "No open GitHub issues remain" (5 are open), and `AGENTS.md` "Deferred, not rejected" still lists AI Guru and Rookie Scout, which D-019 implemented.
- **Time vs. value:** the highest-value engineering hours were PR #2 (V1), #19 (free-agent scoring restored) and #20 (correct averages); each changed numbers the GM uses weekly. The specialist build (#5) is the largest single investment; its value is not yet measurable because the closure loop hasn't run.

## Risks nobody has checked yet

| Risk | Impact | Verdict |
|---|---|---|
| Weekly token budget vs. plan limit is unmeasured | Briefs can fail at lock time; no per-run usage shown to the Owner | **Fix** — print token usage at the end of each run |
| League renewal has never been exercised live | When the 2027 league is created (offseason, before the rookie draft), every `ff` command fails closed by design with a manual `LEAGUE_ID` edit message (`src/context.ts:168`). Correct, but untested end to end | **Optional** — dry-run the edit once the successor exists |
| FantasyPros ECR extraction depends on page markup | If the embedded JSON changes, the charter's `sed` returns nothing; the charter requires "ECR unavailable", so it degrades visibly | **Skip** — degrades safely |
| Failed one-shot agent runs leave only an events file | Usage-limit failures wrote `*.events.jsonl` with no report; stderr shows the path | **Skip** — visible enough |

## Overengineering to cut

- **`Base:` hash in `PROJECT_STATE.md`** → delete the hash; `git log` has it. Saves one PR per merge. **Fix.**
- **Ledger as a single growing file** (87 KB, ~36k tokens, read by GM and staff) → archive closed history at recap (issue #25 already covers this). **Fix via #25.**
- **`IMPLEMENTATION_SPEC.md` target architecture** → previously closed as skip; no new evidence. **Stays closed.**
- Specialist count (D-019) is an Owner decision, not reopened here. The cost finding above is about context size per run, not the number of roles.

## Deferred items — felt yet?

| Item | Felt? | Verdict |
|---|---|---|
| Autonomous SRE agent (D-008) | No. `ff-dev` covered every breakage; no incident waited on a human | Stay deferred |
| Scheduled jobs / notifications | Partly: the weekly recap is the one routine that hasn't happened, but that is a habit, not a scheduler need | Stay deferred; run recap manually |
| Hosting / phone access | No evidence of need | Stay deferred |
| Projection feed | Yes, mildly: lineup calls repeatedly rebuild TE-premium estimates from public projection pages by hand | Optional; revisit after #23–#25, no spend |
| Rookie Scout | Built; used once (2027 QB class). Its season is the offseason | Keep |

## Recommended next actions (ranked)

1. **Back up `private/` now** (Owner command, ~1 min): `git -C private add -A && git -C private commit -m "..." && git -C private push`. Removes the only data-loss exposure.
2. **Run the recap after week 7 finishes** (`ff-gm brief recap`, ~1 run): grade every open and historical recommendation with the five states. This turns 3 weeks of advice into evidence, including the private findings from this retro.
3. **Make run cost visible, then trim it** (S engineering): print input/cached/output tokens from the final `turn.completed` event at the end of every `ff-gm` run; with numbers in hand, do #25's archive step first. Target: a routine lineup brief under 1M input tokens.
4. **Ship #23 → #24 before the week-14 trade deadline** (S + M): pick pricing and trade legality/lineup delta directly support the trade decisions still open.
5. **Trim docs overhead** (XS): drop the `Base:` hash, fix the stale line in `IMPLEMENTATION_PLAN.md`, and update the `AGENTS.md` deferred paragraph to match D-019.

## Decision needed from the Owner

Approve pushing this retro branch as a PR, and decide whether action 3 (token usage printout) goes ahead of #23 in the queue. Recommendation: yes. It's under an hour of work and decides how many briefs fit in a week before the playoffs.
