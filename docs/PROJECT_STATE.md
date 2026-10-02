# Project State

**Last updated:** 2026-10-02 · **Branch:** `claude/lean-v1` ([PR #2](https://github.com/allmanr/ff-gm/pull/2))

## Mission

A fantasy-football front office for Sleeper league `1314802188052090880`: win games and championships while compounding long-term dynasty value. The human is the **Owner**; the top-level AI is the **GM**. The Owner makes final decisions and executes moves in Sleeper (the API is read-only).

Expected invariants, verified live on every run: dynasty, Superflex, full PPR, TE reception bonus.

## Current architecture (V1, D-015)

- `bin/ff` — TypeScript CLI (Node 24 via `bin/node24`, no build step) over Sleeper's documented API. Every command validates the league and roster ownership first and fails closed (exit 1). 18 commands: context, standings, rosters, roster, picks, free-agents, trending, transactions, waivers, matchups, bench, schedule, player, values, trade, changes, history, help.
- `scripts/gm` — runs `ff context`, writes `private/AGENTS.md` (charter + constitution), and starts Codex in `private/` with web search and sandboxed network. Default `gpt-6-sol`/high (D-010). `scripts/gm ask "…"` and `scripts/gm brief <war-room|recap|lineup|daily>` save answers to `private/reports/`.
- `private/` — gitignored; its own private GitHub repo `allmanr/ff-gm-private` (D-016).
- External data (D-018): FantasyCalc market values; nflverse schedule, lines, weekly stats, and Sleeper-ID crosswalk. Supplementary: commands degrade with a note if unavailable.
- No server, database, hosting, scheduler, or specialist subagents (D-017).

## Verification status

- `npm run check`: typecheck, lint, 98 offline tests on anonymized fixtures, privacy leak check. CI runs the same without secrets.
- Live, 2026-10-02: every command against the league; exact scoring engine matches Sleeper's `players_points` 749/749 (`npm run verify-scoring`); lineup optimizer matches Sleeper's max PF for every roster checked.
- Two independent code reviews (19 findings). All "fix" verdicts fixed with regression tests that fail when the fix is reverted.

## Done

- Docs reconciled to lean V1 (D-015–D-017); Owner identity verified and stored privately.
- `ff` CLI with fail-closed gate; GM charter, launcher, and briefs; anonymized fixtures; CI; leak check.
- GM acceptance run (Sol/high, ~189k tokens, 38 web searches) answered lineup, waiver, and trade questions from the Owner's actual roster.
- Review fixes: null-matchup pairing, renewed-league fail-closed, stale-data notices, offseason (week-1) transactions, multi-position players (`fantasy_positions`), FantasyCalc one-request-per-hour on failures, and others.
- Private data repo created and first push made.

## Open (impact → verdict)

- **Private backup push** — automatic push after GM sessions was blocked by the session permission policy. Run `git -C private push` after sessions. Data-loss risk only if this machine fails → Owner habit.
- **Scheduled briefs + notifications** — needs a channel choice and a cron job on the Owner's machine (runs only while it is awake). → Owner decides.
- **Plus usage** — one deep GM run used ~189k tokens. Use `FF_GM_EFFORT=medium` for routine questions; watch Codex limits in heavy weeks.
- **Projections** — scoring is exact for past games; there is still no forward projection feed. Options: derive from nflverse stats or FantasyPros API ($8.99/mo). → defer until the GM's web research proves insufficient.
- **Optional review findings (low impact, not fixed):** truncated `ff changes` snapshot crashes instead of re-baselining; commissioner pick moves in a newly added season are not listed as pick changes; `ff schedule` warns only on byes, not empty/no-team starters; a manager who changes between owner and co-owner splits into two `ff history` rows; picks FantasyCalc does not price count as 0 without a note in `ff values`.
- **FantasyCalc `te+`** — bonus size undocumented; mapped from the league's +0.5 and labeled → accept.

## Closed — don't reopen without new evidence

- Agents API runtime, Vercel/Postgres deployment, and owner-bootstrap UI for V1: replaced by D-015.
- Public vs. private repository: stays public; private data in `private/` (D-016).
- Plan-in-one-model, implement-in-another for V1: rejected as handoff overhead.
- Waiver timing: observed from transactions (`ff waivers`) — main run Wednesday ~11:00 AM CT, daily runs ~11:01 AM CT.
- Data sources (D-018): KeepTradeCut and RotoWire off-limits; Dynasty Daddy avoided (built on KTC scraping); DynastyProcess values not used (derived from scraped FantasyPros data).
- Branch history: squashed by the Owner before pushing; no strategy text in the public history.
- `ff changes` in the recap brief consumed the snapshot; the recap now uses `ff transactions` for the week.
