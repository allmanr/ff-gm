# Codex specification and handoff review

**Date:** 2026-09-27
**Participants:** Owner and Codex
**Scope:** Review the complete Revision 4 spec, project state, decisions, relevant initial meeting, repository setup, current platform documentation, and the Owner's pasted ChatGPT handoff. Repair the flat directory layout and prepare the first implementation plan. No application implementation or production provisioning in this review.

## Owner goals and confirmed constraints

- Minimize personal coordination and operational babysitting while preserving output quality.
- Spend tokens efficiently; identify safe cheaper-model work without weakening critical reasoning.
- Public source repository, private service.
- ChatGPT Plus ($20/month) and Vercel Hobby. The Owner hoped all model work could use Plus, but is open to recommendations. No extra spending cap has been approved.
- Finish the spec/plan before handing off implementation; preserve the Milestone 0–1 first-build boundary.

## Overall assessment

Keep the architecture's core: deterministic ingestion/validation/math, exact league context, application-owned durable state, narrow agent tools, one GM contact, and autonomous low-risk repair. No wholesale rewrite or larger agent framework is justified.

Revision 5 repairs implementation gaps and makes later budget/interface dependencies explicit. The complete target staff, schema, and tool list remain a roadmap, not a first-build checklist. The initial planning note remains unchanged as historical evidence.

## Findings and fixes

| Finding in Revision 4 | Resolution |
|---|---|
| Files were flat, breaking the documented hierarchy | Move canonical docs into `docs/` and the dated meeting into `docs/meetings/`; keep `AGENTS.md` at root |
| Durable owner selection/player cache/context in M1, database only in M2 | Include minimal Postgres in M1; expand history in M2 |
| GM recommendations in M4, ledger only in M7 | Introduce the minimum ledger in M4 and defer outcome analytics to M7 |
| “Current validated context” lacked a precise enforcement boundary | Shared code gate before model calls and publication; typed errors, expiry checks, task-specific data requirements |
| Cached context included fetch timestamps | Separate semantic rule versions from current validation evidence and raw payload hashes |
| Raw live data outranked validated state without qualification | Validate before promotion; preserve stale last-good data for diagnostics |
| Ingestion omitted atomic promotion and coverage rules | Candidate batches, completeness manifests, bounded skew/retries, string IDs, correction history, explicit pick/season coverage |
| ChatGPT Project was assumed to be the front end without a working connection | Authenticated remote adapter and phone/web acceptance test; explicit fallback and account feasibility gate |
| Cron was described without durable work recovery | Jobs, leases, retries, transactional outbox, provider callbacks and reconciliation before unattended operation |
| Low-risk auto-merge relied on loosely defined gates | Trusted checks on the tested commit, scoped credentials, external monitor, bounded attempts, rollback compatibility |
| Private service had no early authentication acceptance test | Protected routes from M0, isolated previews, sanitized public fixtures, authorization independent of Sleeper identity |
| Broad role allocation could cause unnecessary model calls | Staff responsibilities do not imply persistent agents; code/templates for routine work; optional specialists |
| Existing plans were not tied to runtime feasibility | No-API M0–1; separate decision before billed runtime/scheduler activation |

## Live/repository evidence

At review time, the public Sleeper league endpoint returned season `2026`, `settings.type = 2`, a `SUPER_FLEX` slot, `scoring_settings.rec = 1`, and `bonus_rec_te = 0.5`. These support the four expected format invariants. This review did not build a production `LeagueContext`, select the Owner's roster, or generate football advice. Implementation must refetch and validate; this note is not current operational state.

Sleeper's positional reception bonus follows the player's primary position and stacks with base reception scoring. Add tests for TE in FLEX and multi-position players. The API is read-only, so V1 recommends actions and the Owner executes them. [Sleeper scoring](https://support.sleeper.com/en/articles/3652730-how-are-reception-bonuses-calculated), [API documentation](https://docs.sleeper.com/).

GitHub returned `visibility: public`, `allow_auto_merge: false`, no classic `main` protection, and no active branch rules/rulesets. That is acceptable for a newly created documentation repository, but not sufficient for the planned autonomous repair boundary. The review did not change these remote settings. Configure gates and scoped credentials before M3.

## ChatGPT handoff assessment

The pasted handoff is mostly sound: a local repository project, an explicit model choice, a bounded milestone, coherent commits, autonomous routine choices, and a final evidence report all fit the task. The repository already has the architecture discussion; the next agent should build from it.

Refinements:

- Choose the model available in the actual Codex picker. A sentence in `AGENTS.md` does not change the running model or provide account access. Avoid treating a particular desktop navigation path/version as a durable project requirement.
- Keep one implementation chat for M0–1; use a short repository handoff at a milestone boundary. Do not make the Owner manually manage a group of specialist coding chats.
- Read the full spec at first implementation/architecture changes; retrieve relevant sections for later small fixes.
- Complete independent local work when deployment credentials are blocked, then bundle setup actions. Never turn missing credentials into an invented successful deployment.
- Separate interactive subscription work from production API automation. A local Codex scheduled task requires the machine/app running and does not satisfy the no-local-PC requirement. Supported web scheduled tasks can use connected tools, but account/tool availability and quotas still need a real test. [Codex models](https://learn.chatgpt.com/docs/models), [scheduled tasks](https://learn.chatgpt.com/docs/automations).

The revised single kickoff prompt lives in [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md).

## Model policy and genuine savings

The earlier advice was cautious rather than wildly overpowered. Sol already handled most production judgment; Astra was mainly escalation. A one-time Astra/xhigh foundation pass is defensible because it sets the validation/security/data contracts. Sol/high plus a focused Astra review is a reasonable cheaper alternative if Plus limits become constraining, but we have not benchmarked it and cannot promise identical output quality.

The clearest savings preserve the task itself:

- Replace routine validation explanations/status updates with templates.
- Collect releases and detect unchanged state in code; only analyze substantive changes.
- Fetch shared evidence once and reuse versioned packets.
- Avoid specialist calls with no distinct contribution and repeated GM rewrites.
- Generate the constitution without an LLM. M0–1 therefore costs no production model tokens.

Good bounded candidates for Luna: source-linked entity extraction, categorization, and formatting already validated findings. Sol remains the default for research interpretation, football decisions, and repairs. Cheap relevance filters can miss important news while producing perfectly valid JSON; track recall and escalate ambiguity. Never silently discard urgent roster-player evidence based only on that filter.

Routine AI Guru digests now use code/Sol; material migration evaluation still uses Astra. Neither monthly cadence nor a job title by itself justifies the most expensive model.

### API price illustration

Official standard short-context token rates checked during review:

| Model | Input / million | Billed output / million | 10k input + 2k output |
|---|---:|---:|---:|
| Astra | $10 | $50 | $0.20 |
| Sol | $2 | $10 | $0.04 |
| Luna | $0.10 | $0.50 | $0.002 |

These are equal-token examples, not measured equal-quality costs or full agent-run quotes. Thirty single Sol calls at that size are $1.20; a multi-turn research/repair run may use many calls. Include reasoning output, tools/search, retries, cache writes/reads, and any sandbox charges in budgeting. [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).

Caching is useful for reused stable prefixes, but API cache writes also cost money and cache lifetimes are limited. Keep changing validation timestamps out of the reusable prefix and measure actual usage; never assume daily runs share a cache. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

## Existing plans and recommended spending path

The specified production Agents API uses API billing. Plus is not its payment source. Keep Plus for interactive ChatGPT/Codex work; do not move personal subscription credentials into the backend. [Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview), [quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart), [Codex pricing](https://learn.chatgpt.com/docs/pricing).

| Path | Benefit | Limitation |
|---|---|---|
| M0–1 on current plans | Useful durable league foundation, no model API bill | Not yet an autonomous GM |
| Plus-centered assisted mode | Use ChatGPT and supported scheduled work with backend tools | Must verify private mobile tools; shares subscription limits; does not yet prove full unattended repair/event orchestration or backend control of chat advice |
| Full backend with a small API cap | Preserves the planned autonomous architecture and application gates | Separate API billing; usage must be measured and bounded |

**Recommendation:** finish M0–1, then offer a $10/month API pilot with an application-enforced cap, before enabling model automation. This is a proposed experiment, not approved spending or a claim that $10 covers every V1 workload. Continue deterministic monitoring if the cap is reached. Defer paid research and Vercel upgrades until demonstrated need.

Vercel Hobby cron runs at most daily and failed invocations are not automatically retried. QStash is a candidate external scheduler with a documented free allocation of 1,000 attempts/day and 10 schedules. A five-minute dispatcher uses 288 initial attempts/day; retries/callbacks and hosting/database quotas still count. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [cron handling](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [QStash pricing](https://upstash.com/pricing/qstash), [schedules](https://upstash.com/docs/qstash/features/schedules).

Neon currently lists 100 CU-hours/month and 0.5 GB storage on Free, with a fixed five-minute inactivity timeout. Frequent database access can prevent sleep; the scheduler's free quota alone cannot establish a free overall system. Validate projected active compute, previews, storage growth, and backup/restore coverage before choosing a polling cadence. [Neon pricing](https://neon.com/pricing), [scale to zero](https://neon.com/docs/introduction/scale-to-zero).

OpenAI's plugin documentation supports mobile use of available plugins, but that does not prove distribution/authentication for this private custom integration on the Owner's account. Make the actual phone/web round trip a milestone acceptance test. [Plugins](https://learn.chatgpt.com/docs/plugins).

## Decisions and remaining choices

Recorded durable refinements in D-011 through D-014; clarified D-007. Kept the initial Astra policy, managed-runtime preference, autonomous low-risk repairs, and the M0–1 boundary.

Remaining choices before later automation: API budget versus assisted scope, permitted research source, notification channel, external scheduler/DB capacity, and private plugin access. None requires a full architectural conversation before starting the deterministic first build. No paid resource, model automation, remote protection setting, or football action was enabled by this review.
