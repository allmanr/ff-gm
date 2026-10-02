# Decision Register

This file contains compact, durable project decisions. It is intended to be cheap default context for agents.

Historical discussion belongs in `docs/meetings/`. Technical detail may live in ADRs/issues/PRs.

---

## D-001 — 2026-09-27 — ChatGPT is the primary Owner interface

**Decision:** Normal fantasy-football interaction should happen through the ChatGPT Project from phone, web, or desktop. Codex is the engineering interface, not the day-to-day Owner interface.

**Rationale:** The system must remain usable away from the local development machine.

**Status:** superseded by D-015 — the GM runs in Codex for V1; a ChatGPT/phone surface is a later option

---

## D-002 — 2026-09-27 — Mission-critical state lives outside model memory

**Decision:** League state, project configuration, recommendation history, incidents, manager profiles, and durable agent findings must live in Postgres and/or versioned repository files.

**Rationale:** Model memory and provider-owned session history are not reliable enough to be the sole system of record.

**Status:** active

---

## D-003 — 2026-09-27 — LeagueContext is a fail-closed prerequisite

**Decision:** No actionable football recommendation may be produced without a current validated `LeagueContext`.

**Rationale:** Forgetting Superflex, dynasty, full-PPR, TE bonuses, roster slots, or other league-specific rules is an unacceptable category error.

**Status:** active

---

## D-004 — 2026-09-27 — OpenAI Agents API is the preferred runtime, but does not own durable truth

**Decision:** Use OpenAI's managed agent runtime rather than building a custom orchestrator in V1, while keeping application state reconstructable from our own storage.

**Rationale:** Capture managed orchestration/recovery benefits without making the system dependent on opaque provider session history.

**Status:** superseded by D-015 — Codex on the Owner's ChatGPT subscription is the V1 runtime; the durable-state principle continues under D-002

---

## D-005 — 2026-09-27 — Structured-data-first research

**Decision:** Use reliable permitted structured APIs for quantitative projections/rankings/news inputs when available; use web research for qualitative context, expert arguments, breaking interpretation, and synthesis.

**Rationale:** Avoid unnecessary LLM extraction cost and hallucination.

**Status:** active

---

## D-006 — 2026-09-27 — Do not depend on undocumented Sleeper WebSockets in V1

**Decision:** Use Sleeper's documented HTTP API with context-sensitive polling/reconciliation behind a transport adapter.

**Rationale:** The system does not require play-by-play latency, and undocumented/reverse-engineered sockets are a brittle production dependency.

**Status:** active

---

## D-007 — 2026-09-27 — Optimize prompts for reusable-prefix caching

**Decision:** Keep stable tools/instructions/semantic league rules ahead of dynamic validation timestamps, snapshots, and task/query data. Enforce freshness in application code; never retain old validation evidence for a cache hit.

**Rationale:** Reduce repeated input cost without distorting the architecture.

**Status:** active

---

## D-008 — 2026-09-27 — Software Dev may auto-merge low-risk repairs

**Decision:** After automated tests/evals, preview deployment, and smoke gates pass, Software Dev may autonomously merge and deploy ordinary low-risk incident repairs and rerun failed workflows.

**Rationale:** This is a private fantasy-football system with limited blast radius. A mandatory human merge step defeats much of the value of an autonomous SRE agent.

**Protected actions:** secrets/permissions, billing/domains, destructive data changes, disabling correctness gates, major architecture changes, substantial budget increases.

**Status:** active

---

## D-009 — 2026-09-27 — Use layered project memory rather than endless context

**Decision:** Maintain a compact rolling `PROJECT_STATE.md`, a durable `DECISIONS.md`, and a dated meeting-note archive. Agents read the compact layers by default and retrieve historical notes only when relevant.

**Rationale:** Preserve human-like institutional memory while bounding prompt/context growth.

**Status:** active

---

## D-010 — 2026-09-27 — Use GPT-6 family for new implementation and production routing

**Decision:** Use GPT-6 Astra as the escalation/maximum-capability model and GPT-6 Sol as the normal production reasoning model. Use GPT-6 Luna only for narrow, checked low-stakes work. Initial Codex implementation uses GPT-6 Astra / xhigh.

**Rationale:** GPT-6 is the current OpenAI model family for new complex reasoning and Codex work. Astra maximizes capability; Sol provides a better cost/capability balance for repeated production workloads.

**Status:** active for GM routing — `scripts/gm` defaults to GPT-6 Sol / high (override with `FF_GM_MODEL`/`FF_GM_EFFORT`; use Astra for major franchise decisions). The initial-implementation clause is superseded by D-015: V1 was built in Claude Code.

---

## D-011 — 2026-09-27 — Public source, private service; spending remains explicit

**Decision:** Keep this repository public and authenticate the deployed service. The Owner currently uses ChatGPT Plus and Vercel Hobby; no additional recurring spend is approved. Milestones 0–1 require no model API calls. API-backed automation needs a separate budget decision before activation.

**Rationale:** The Owner confirmed this exposure model and had expected subscription/free plans to cover operation. Preserve the useful deterministic foundation while resolving later costs honestly.

**Status:** active
**Source:** [Codex review](meetings/2026-09-27-codex-spec-review.md)

---

## D-012 — 2026-09-27 — Ship prerequisites with the features that need them

**Decision:** Milestone 1 includes minimal Postgres persistence for context, owner selection, sync inputs, and the player cache. Milestone 2 expands history/jobs. Milestone 4 includes the minimum recommendation ledger; Milestone 7 expands outcomes/evaluation. Keep the initial stop after Milestone 1.

**Rationale:** Durable owner selection cannot wait until after it ships; auditable recommendations cannot precede their ledger.

**Status:** superseded by D-015 — V1 has no database; add storage when history is needed

---

## D-013 — 2026-09-27 — Enforce correctness and repair authority outside prompts

**Decision:** Application code validates task inputs before analytical calls and before publication. Trusted policy checks the exact tested repair commit; repair credentials cannot bypass or weaken those gates. Validate raw upstream responses before promoting them to authoritative state.

**Rationale:** Instructions alone cannot enforce freshness, concurrency, persistence, or merge permissions. Preserve autonomous low-risk repairs under D-008.

**Status:** active — implementation of D-003/D-008

---

## D-014 — 2026-09-27 — Avoid unnecessary agents and model passes

**Decision:** Staff titles describe responsibilities. Use deterministic services and one GM first; consult specialists only for distinct needed work. Use code for routine notices and release detection, Sol for routine monthly synthesis, and Astra for substantive migration evaluation. Cheaper semantic tasks require evidence/recall checks, not just schema validation.

**Rationale:** Remove repeated work before trading model quality for lower token prices. Keep D-010's initial Astra implementation and Sol production defaults.

**Status:** active — cost/workflow refinement from this review

---

## D-015 — 2026-10-02 — Lean V1: `ff` CLI plus one Codex GM

**Decision:** V1 is a TypeScript CLI (`ff`) that fetches and validates Sleeper data, plus a single GM agent run in Codex CLI on the Owner's ChatGPT subscription via `scripts/gm`. No server, database, deployment, job queue, or specialist subagents in V1. Staff roles (Research, League Watcher, Dynasty, Quant, Auditor) are sections of the GM charter or deterministic `ff` commands, not separate agents.

**Rationale:** On 2026-10-02 the season was at week 4 with no code. The prior plan gated the first GM behind deployment, persistence, and an autonomous repair milestone. A working GM this season is worth more than infrastructure the Owner has not yet needed.

**Supersedes:** D-001, D-004, D-012, and D-010's initial-implementation clause.

**Status:** active
**Source:** [Lean V1 review](meetings/2026-10-02-lean-v1-review.md)

---

## D-016 — 2026-10-02 — Public code, private data in `private/`

**Decision:** The code repository stays public. Owner identity, strategy, GM notes, manager profiles, reports, and recommendation history live in the gitignored `private/` folder, which is its own private Git repository for history and backup. Committed fixtures are anonymized.

**Rationale:** League-mates could read a public repository. A nested private repository keeps the code shareable while giving private data versioning and an off-machine copy.

**Status:** active

---

## D-017 — 2026-10-02 — Defer SRE, AI Guru, Rookie Scout, and hosting

**Decision:** Defer the autonomous Software Dev/SRE agent, AI Guru, Rookie Scout, hosted deployment, and scheduled jobs until V1 is in regular use. D-008's autonomy policy applies when the SRE agent is eventually built. Rookie scouting becomes an offseason GM mode first.

**Rationale:** With no hosted service there is little to monitor or repair; the Owner opens a coding agent when a tool breaks. Each deferred component adds operating cost before it adds football value.

**Status:** active

---

## D-018 — 2026-10-02 — Permitted external data sources

**Decision:** Besides Sleeper's documented API, V1 uses only sources whose terms permit this use, each attributed next to its data:

- **FantasyCalc** `GET /values/current` for dynasty market values — documented endpoint only, at most one request per hour (failed attempts count), non-commercial, "FantasyCalc.com" attribution.
- **nflverse** release files (CC-BY-4.0) for the NFL schedule and closing lines, weekly player stats, and the roster file that maps nflverse player IDs to Sleeper IDs.

Off-limits: KeepTradeCut (scraping forbidden), RotoWire (terms effective 2026-09-19 prohibit use with AI tools, including storing its data), Dynasty Daddy (built on KTC scraping), DynastyProcess values (derived from scraped FantasyPros data). The GM charter repeats the off-limits list.

**Rationale:** The project is public and run by AI agents; using data against its terms is a real risk. Verified from the providers' own docs and terms on 2026-10-02.

**Status:** active
