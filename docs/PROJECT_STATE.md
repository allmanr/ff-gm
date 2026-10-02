# Project State

**Last updated:** 2026-10-02 · **Branch:** `claude/lean-v1` ([PR #2](https://github.com/allmanr/ff-gm/pull/2))

## Mission

A fantasy-football front office for Sleeper league `1314802188052090880`: win games and championships while compounding long-term dynasty value. The human is the **Owner**; the top-level AI is the **GM**. The Owner makes final decisions and executes moves in Sleeper (the API is read-only).

Expected invariants, verified live on every run: dynasty, Superflex, full PPR, TE reception bonus.

## Current architecture (V1, D-015)

- `bin/ff` — TypeScript CLI (Node 24 via `bin/node24`, no build step) over Sleeper's documented API. Every command validates the league and roster ownership first and fails closed (exit 1). 18 commands: context, standings, rosters, roster, picks, free-agents, trending, transactions, waivers, matchups, bench, schedule, player, values, trade, changes, history, help.
- `scripts/gm` — runs `ff context`, writes the trusted charter to `private/AGENTS.md`, and starts Codex in `private/` with web search and sandboxed network. The validated constitution remains a separate data file; the charter treats external text as untrusted data. Default `gpt-6-sol`/high (D-010). `scripts/gm ask "…"` and `scripts/gm brief <war-room|recap|lineup|daily>` save answers to `private/reports/`.
- `private/` — gitignored; its own private GitHub repo `allmanr/ff-gm-private` (D-016).
- External data (D-018): FantasyCalc market values; nflverse schedule, lines, weekly stats, and Sleeper-ID crosswalk. Supplementary: commands degrade with a note if unavailable.
- No server, database, hosting, scheduler, or specialist subagents (D-017).

## Verification status

- Final PR #2 pass: `npm run check` passes typecheck, lint, 124 tests, and the privacy scan of Git index blobs and working files. Tests inject supplementary fetchers; a global fetch guard fails any accidental network attempt, even if a command catches the error.
- Regression tests reproduced manual player-cache bypass, unset-Owner trade checks, even-sample waiver medians, and partial scoring before their fixes. Existing launcher, staged-leak, and two-process FantasyCalc regressions still pass. Launcher tests check instruction/data separation; model obedience was not tested.
- Live, 2026-10-02: `npm run verify-scoring` now refuses with `st_ff, st_fum_rec`, which nflverse cannot supply. The previous 749/749 comparison assumed those keys were zero and did **not** establish full scoring coverage. Exact nflverse PPG is unavailable until the source covers every active scoring rule; Sleeper's actual matchup points remain usable.
- Earlier live command and lineup-optimizer checks remain historical evidence; the final pass does not claim a fresh all-command live run.

## Done

- Docs reconciled to lean V1 (D-015–D-017); Owner identity verified and stored privately.
- `ff` CLI with fail-closed gate; GM charter, launcher, and briefs; anonymized fixtures; CI; leak check.
- GM acceptance run (Sol/high, ~189k tokens, 38 web searches) answered lineup, waiver, and trade questions from the Owner's actual roster.
- Review fixes: null-matchup pairing, renewed-league fail-closed, stale-data notices, offseason (week-1) transactions, multi-position players (`fantasy_positions`), FantasyCalc one-request-per-hour on failures, and others.
- PR #2 fixes: Sleeper names stay out of GM instruction files; leak checks scan staged blobs even after working-copy sanitization/removal; FantasyCalc attempt reservations use an atomic cross-process lock and recheck the hourly limit before fetching. Two-process tests cover both successful and failed refreshes.
- Final PR #2 fixes: unsupported scoring fails at both direct scoring and stat-book boundaries (including K/DEF/IDP when startable); unavailable PPG sorting is labeled; manual refresh honors the daily cache; trades require a verified Owner; waiver medians average both middle bids. The scoring verifier also fails when no scores are comparable.
- Private data repo created and first push made.

## Open (impact → verdict)

- **nflverse scoring coverage** — no PPG/last-3 rankings while `st_ff` and `st_fum_rec` are unavailable. The safe refusal is fixed; expanding source coverage is deferred. Use Sleeper recorded matchup points meanwhile.

- **Private backup push** — automatic push after GM sessions was blocked by the session permission policy. Run `git -C private push` after sessions. Data-loss risk only if this machine fails → Owner habit.
- **Scheduled briefs + notifications** — needs a channel choice and a cron job on the Owner's machine (runs only while it is awake). → Owner decides.
- **Plus usage** — one deep GM run used ~189k tokens. Use `FF_GM_EFFORT=medium` for routine questions; watch Codex limits in heavy weeks.
- **Projections** — Sleeper supplies exact recorded matchup points; there is still no forward projection feed. Options: derive from nflverse stats or FantasyPros API ($8.99/mo). → defer until the GM's web research proves insufficient.
- **Optional review findings (low impact, not fixed):** truncated `ff changes` snapshot crashes instead of re-baselining; commissioner pick moves in a newly added season are not listed as pick changes; `ff schedule` warns only on byes, not empty/no-team starters; a manager who changes between owner and co-owner splits into two `ff history` rows; picks FantasyCalc does not price count as 0 without a note in `ff values`.
- **Bench verdict edge cases** — ties and commissioner-adjusted totals can be described incorrectly in hindsight text; does not change the lineup optimizer or Sleeper actuals → optional, deferred.
- **FantasyCalc `te+`** — bonus size undocumented; mapped from the league's +0.5 and labeled → accept.

## Closed — don't reopen without new evidence

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
