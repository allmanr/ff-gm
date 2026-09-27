# AGENTS.md — Fantasy Football GM

Read `docs/IMPLEMENTATION_SPEC.md` before making architectural changes.

## Mission

Build and maintain an always-on fantasy-football front office for Sleeper league `1314802188052090880`.

The human is the Owner. The top-level football agent is the GM.

## Absolute correctness rule

No football recommendation may be generated without a current validated `LeagueContext`.

Expected league invariants:
- dynasty;
- Superflex;
- full PPR;
- TE-bonus / TE-premium scoring.

These expectations must be verified against Sleeper. Never replace exact Sleeper settings with generic fantasy assumptions.

If context is stale, missing, contradictory, or incomplete: refresh and validate. If validation fails, fail closed.

## Engineering rules

- Prefer deterministic code for polling, diffing, math, validation, scheduling, and scoring.
- Use LLMs for judgment, research synthesis, debugging, planning, and communication.
- TypeScript strict mode.
- Runtime validation for external API payloads.
- Idempotent ingestion and jobs.
- UTC in storage; user-facing scheduling defaults to America/Chicago.
- Never commit secrets.
- Add tests for every bug fixed.
- Preserve useful history instead of overwriting it.
- Keep model routing configuration-driven.
- Keep data and business logic provider-neutral.
- Do not build a large UI before core football functionality works.

## Production safety

Software Dev is intended to resolve routine operational failures autonomously.

It may:
- branch;
- patch;
- test;
- push;
- preview-deploy;
- auto-merge low-risk repairs after all required gates pass;
- redeploy;
- rollback to a known-good deployment when appropriate;
- rerun failed idempotent jobs.

It may not autonomously:
- expose/rotate secrets;
- broaden permissions;
- alter billing/domains;
- remove repository protections;
- destructively migrate/delete production data;
- disable core correctness gates;
- make major architecture changes;
- substantially increase budgets.

For a production regression, prefer rollback to last-known-good first, then repair forward.

Do not add a blanket human-approval requirement for ordinary low-risk repair merges. This is a private fantasy-football system with limited blast radius; the point of the SRE agent is to eliminate routine manual babysitting.

## Implementation model

For the initial Milestones 0–1 handoff, use **GPT-6 Astra with xhigh reasoning** in Codex.

For later routine implementation, default to **GPT-6 Sol / high**. Escalate hard debugging, architecture, security, or repeated failures to **GPT-6 Astra / xhigh or max**.

Do not choose a cheaper model for critical architecture/debugging merely to reduce tokens.

## Initial scope

Implement Milestone 0 and Milestone 1 before building the full staff.

Do not overbuild.

Use `docs/IMPLEMENTATION_PLAN.md` for the initial handoff and acceptance sequence. Milestones 0–1 need no model API calls; their small durable Postgres foundation is in scope. Build only the active milestone's tables/tools, not the entire target layout.

## Current account and exposure constraints

- Public source repository; private service. Keep strategy, operational records, and personal data out of public fixtures/docs.
- Owner currently has ChatGPT Plus and Vercel Hobby. No additional recurring spend is approved.
- Production Agents API calls require separate API billing. Do not treat a subscription session as an API credential.
- Private routes must enforce server-side authentication; previews use isolated data and credentials.
- Budget/scheduler configuration must be settled before enabling recurring production work.

## Implementation workflow

Use one accountable implementation chat per coherent milestone. Continue that chat for related fixes; start a fresh one at a milestone boundary with a short repository handoff. Do not load the whole spec or meeting archive repeatedly for localized tasks.

Choose routine implementation details autonomously within the approved design. Record material choices and unresolved blockers. A blocker in deployment/authentication should not stop independent local implementation and tests. Never report an unrun live/deployment check as passed.

Use `codex/` branches and coherent commits. Keep dependency lockfiles, sanitized fixtures, and reproducible CI. Do not give routine work a mandatory extra model-review pass; use focused Astra review for correctness boundaries, security, architecture, or repeated failures.


## Agent-runtime state

Use OpenAI Agents API as the preferred managed runtime, but never make provider-owned session state the sole system of record.

Mission-critical knowledge must be persisted in Postgres and/or versioned repository configuration. Any agent session must be disposable and reconstructable.

## Research data

Prefer permitted structured APIs for projections, rankings, injury/news data, and market inputs when available. Use LLM web research for qualitative context and synthesis.

Do not scrape KeepTradeCut; its published FAQ states that it currently has no public API/data export and forbids scraping its player values.

## Sleeper transport

Use Sleeper's documented public HTTP API in V1. Do not depend on undocumented/reverse-engineered WebSocket endpoints. Keep ingestion transport abstract so supported streaming can be added later.

## Prompt caching

Keep reusable instructions/tools/context stable at the front of model input. Avoid dynamic timestamps/IDs in reusable prefixes. Measure cache-hit rates.

## Project memory and meeting records

Use the repository's documentation hierarchy intentionally.

Always read:
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`

Do **not** automatically load the full meeting archive into every task.

When a task depends on a prior discussion, disagreement, rationale, preference, or unresolved question:
1. search `docs/MEETING_NOTES.md` for the relevant date/topic;
2. open only the linked meeting note(s) that are relevant;
3. if a meeting decision changed canonical project behavior, prefer the current entry in `docs/DECISIONS.md` and `docs/PROJECT_STATE.md`.

After a material planning/review meeting:
- add or update a dated file under `docs/meetings/`;
- append a short index entry to `docs/MEETING_NOTES.md`;
- update `docs/DECISIONS.md` only for durable decisions;
- update `docs/PROJECT_STATE.md` only when current state/architecture/priorities changed.

Meeting notes are historical evidence, not automatically canonical current instructions.
