# Project State

**Last updated:** 2026-09-27

## Mission

Build an always-on fantasy-football front office for Sleeper league `1314802188052090880`.

The human user is the **Owner**. The top-level AI is the **GM**. The goal is to win fantasy football games and championships while preserving and compounding long-term dynasty franchise value.

## League invariants expected by the Owner

These must be verified from Sleeper and represented exactly in `LeagueContext`:

- dynasty;
- Superflex;
- full-point PPR;
- TE bonus / TE-premium scoring.

No actionable football recommendation may bypass validated `LeagueContext`.

## Current architecture

- Owner interface: ChatGPT Project on phone/web/desktop.
- Engineering: Codex CLI / Codex cloud / GitHub.
- Production: Vercel + managed Postgres.
- Agent runtime: OpenAI Agents API preferred.
- Durable business state: Postgres + versioned repository configuration, not provider-owned agent-session state.
- League source of truth: Sleeper documented public HTTP API.
- Research: structured-data-first where permitted; web research for qualitative context and synthesis.
- UI: ChatGPT is primary; only a minimal `/ops` web surface initially.

## Staff design

Core:
- GM
- Research Boy
- League Watcher
- Superflex Dynasty Knower
- Quant
- Rules/Data Auditor
- Software Dev / SRE

Later / periodic:
- AI Guru
- College / Rookie Scout

## Model policy

- GPT-6 Sol is the default production model for consequential but routine GM/specialist judgment.
- GPT-6 Astra is the escalation model for the hardest franchise decisions, architecture, difficult debugging, and monthly AI-system review.
- GPT-6 Luna is reserved for tightly bounded low-stakes filtering/extraction with checks.
- Initial Codex implementation uses GPT-6 Astra / xhigh.
- Deterministic software handles polling, diffing, validation, arithmetic, scoring, scheduling, and simulations where practical.
- Model routing remains configuration-driven and should be periodically reevaluated.

## SRE policy

Software Dev may autonomously fix and auto-merge ordinary low-risk incident repairs after automated tests/evals, preview deployment, and smoke gates pass.

It must escalate protected actions such as secrets/permissions, billing/domains, destructive data migrations, disabling correctness gates, major architecture changes, or substantial budget increases.

## Current implementation scope

Codex should implement **Milestone 0 and Milestone 1 only** first.

These establish:
- repository/CI/deployment foundation;
- Sleeper ingestion;
- exact LeagueContext;
- fail-closed rule validation;
- owner roster selection;
- generated League Constitution.

The Owner/GM will inspect the actual league constitution before later infrastructure is expanded.

## Documentation/memory policy

Agents read `PROJECT_STATE.md` and `DECISIONS.md` by default.

Historical meeting notes are retrieved only when relevant. They are not default prompt context.

See `MEETING_NOTES.md` and `docs/meetings/`.
