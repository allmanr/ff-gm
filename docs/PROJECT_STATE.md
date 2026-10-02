# Project State

**Last updated:** 2026-10-02

## Mission

A fantasy-football front office for Sleeper league `1314802188052090880`: win games and championships while compounding long-term dynasty value. The human is the **Owner**; the top-level AI is the **GM**. The Owner makes final decisions and executes moves in Sleeper (the API is read-only).

Expected invariants, verified live on every run: dynasty, Superflex, full PPR, TE reception bonus.

## Current architecture (V1, D-015)

- `bin/ff` — TypeScript CLI (Node 24, no build step) over Sleeper's documented API. Every command validates the league and roster ownership first and fails closed (exit 1).
- `scripts/gm` — runs `ff context`, writes `private/AGENTS.md` (charter + constitution), and starts Codex in `private/` with web search and sandboxed network. Default model `gpt-6-sol`/high (D-010); `scripts/gm ask "…"` saves answers to `private/reports/`.
- `private/` — gitignored; its own private GitHub repo `allmanr/ff-gm-private` (D-016).
- Market values: FantasyCalc `/values/current` (documented endpoint, ≥1 h cache, attribution shown, non-commercial).
- No server, database, hosting, scheduler, or specialist subagents (D-017).

## Done

- 2026-10-02: Docs reconciled (D-015–D-017). Owner identity verified and stored privately.
- 2026-10-02: `ff` commands — context, standings, rosters, roster, picks, free-agents, trending, transactions, waivers, matchups, bench, schedule, player, values, trade, changes, history. Offline tests on anonymized fixtures; CI (typecheck, lint, tests); local privacy leak check. Verified live against the league; the lineup optimizer reproduces Sleeper's max-PF.
- 2026-10-02: GM v0 acceptance run (Sol/high, ~189k tokens, 38 web searches): answered lineup, waiver, and trade questions from the Owner's actual roster. Report and recommendation log in `private/`.
- 2026-10-02: Independent code review: 10 findings fixed with regression tests (null-matchup pairing, renewed-league fail-closed, stale-data notices, and others).
- 2026-10-02: Private data repo created and first push made.

## Open (impact → verdict)

- **Automatic backup push after GM sessions** — blocked by the session's permission policy; `private/` is only pushed when the Owner runs `git -C private push`. Low risk of loss short term → Owner decides.
- **Projections** — no free licensed stat-level projection feed. Options: build from nflverse stats (CC-BY-4.0) or FantasyPros API at $8.99/mo. Needed only for an exact-scoring projection engine → defer until the GM's web research proves insufficient.
- **FantasyCalc `te+`** — bonus size undocumented; mapped from the league's +0.5 and labeled. Minor → accept.
- **Scheduled Tuesday war room + notifications** — needs a channel choice and a cron job on the Owner's machine (only runs while it is awake). → Owner decides.
- **Plus usage** — one deep GM run used ~189k tokens. Watch Codex limits during heavy weeks; use `FF_GM_EFFORT=medium` for routine questions.

## Closed — don't reopen without new evidence

- Agents API runtime, Vercel/Postgres deployment, and owner-bootstrap UI for V1: replaced by D-015.
- Public vs. private repository: stays public; private data in `private/` (D-016).
- Plan-in-one-model, implement-in-another for V1: rejected as handoff overhead.
- Waiver timing: observed from transactions (`ff waivers`) — main run Wednesday ~11:00 AM CT, daily runs ~11:01 AM CT.
- Data sources: KeepTradeCut and RotoWire are off-limits (scraping ban; RotoWire's 2026-09-19 terms prohibit AI use). Dynasty Daddy avoided (built on KTC scraping). DynastyProcess values are derived from scraped FantasyPros data — not used.
