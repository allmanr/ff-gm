# Decision Register

This file contains compact, durable project decisions. It is intended to be cheap default context for agents.

Historical discussion belongs in `docs/meetings/`. Technical detail may live in ADRs/issues/PRs.

---

## D-001 — 2026-09-27 — ChatGPT is the primary Owner interface

**Decision:** Normal fantasy-football interaction should happen through the ChatGPT Project from phone, web, or desktop. Codex is the engineering interface, not the day-to-day Owner interface.

**Rationale:** The system must remain usable away from the local development machine.

**Status:** active

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

**Status:** active

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

**Decision:** Keep stable tools/instructions/LeagueContext ahead of more dynamic snapshot/task/query data and avoid needless dynamic values in reusable prefixes.

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

**Status:** active
