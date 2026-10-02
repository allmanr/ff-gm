# Meeting Notes — Front Office Planning

**Date:** 2026-09-27  
**Participants:** Owner; GM  
**Purpose:** Define the fantasy-football front office, architecture, staffing, implementation approach, and operating model before handing implementation to Codex.

## Owner goals

The Owner wants an AI front office that behaves like a competent fantasy-football organization rather than a generic chatbot.

Key expectations:

- The GM is the Owner's primary point of contact.
- The GM should make strong recommendations, not merely present options.
- The GM should push back when it believes the Owner is proposing a materially worse move, while recognizing that the Owner has final authority.
- Recommendations must always account for the exact league: dynasty, Superflex, full PPR, TE-bonus scoring, and all actual roster/scoring settings.
- The system should proactively identify strong actionable ideas without flooding the Owner with speculative trade spam.
- The system should produce concise regular reports plus urgent alerts when warranted.
- The system should continuously improve both football strategy and its own agent/infrastructure design.
- Normal use must work from the Owner's phone; local Codex CLI should remain useful for engineering but cannot be the only interface.

## Staff design

Agreed staff:

### GM
Final football judgment and ownership communication.

### Research Boy
High-volume NFL/fantasy research, breaking news, expert analysis, analytics, projections, and market context. Supplies evidence to the GM rather than directly deciding strategy.

### League Watcher
Maintains complete knowledge of this league: rosters, transactions, picks, manager behavior, needs, tendencies, and trade opportunities.

### Superflex Dynasty Knower
Long-horizon strategy specialist focused on Superflex scarcity, future picks, roster optionality, age curves, rebuild/contend timing, and market arbitrage.

### Quant
Deterministic scoring, projection translation, replacement value, simulations, trade math, and other numerical support.

### Rules / Data Auditor
Mechanical guardrail preventing recommendations based on stale or incorrect league settings.

### Software Dev / SRE
Keeps the system operational. Detects failures, diagnoses, patches, tests, deploys, and reruns failed workflows. Low-risk repairs may auto-merge after automated gates pass.

### AI Guru
Low-frequency role monitoring meaningful advances in OpenAI/agent tooling and recommending tested improvements.

### College / Rookie Scout
Seasonal specialist around rookie/prospect evaluation and rookie-draft strategy.

## League correctness

The Owner emphasized that failure to account for Superflex, dynasty, full PPR, TE bonuses, roster settings, draft mechanics, or other league-specific rules is a basic unacceptable failure.

Decision:
- create canonical versioned `LeagueContext`;
- fetch exact values from Sleeper;
- make football workflows fail closed if context is missing/stale/invalid;
- do not trust model memory alone.

## Architecture

Agreed broad system:

- ChatGPT Project = primary Owner/GM interface.
- GitHub = durable code/config/documentation.
- Codex = engineering implementation environment.
- Vercel = deployment/runtime.
- Managed Postgres = mutable operational state/history.
- OpenAI Agents API = preferred managed agent runtime.
- Sleeper official HTTP API = league data source of truth.

Important portability refinement:
- provider-owned agent session state is useful but not canonical;
- any agent session should be disposable/reconstructable from our DB and repository state.

## Research/data strategy

Initial proposal emphasized web research.

External review correctly identified that quantitative sources should be structured when available.

Decision:
- structured-data-first for permitted projections/rankings/injury/news/market feeds;
- LLM web research for qualitative context, expert arguments, emerging strategy, beat reporting, and synthesis;
- do not scrape KeepTradeCut against its published policy;
- evaluate official providers such as FantasyPros based on account/license fit.

## Sleeper event transport

An external review suggested Sleeper WebSockets.

Decision:
- reject this for V1;
- official Sleeper developer docs expose HTTP API and the use case does not need play-by-play latency;
- use context-sensitive polling/reconciliation;
- hide transport behind an adapter so supported streaming can be added later.

## Prompt caching

External review correctly raised prefix caching.

Decision:
- keep stable instructions/tools and `LeagueContext` in stable reusable prefixes;
- keep more dynamic snapshots/tasks later;
- avoid needless timestamps/request IDs in reusable prefixes;
- measure cache effectiveness.

## SRE autonomy

An external review suggested requiring human approval for every initial SRE merge.

Owner rejected the extra ceremony.

Decision:
- low-risk generated repairs may auto-merge after tests/evals, preview deploy, smoke test, and risk checks pass;
- the Owner accepts the limited possibility that the agent can break this private service;
- protected actions still require escalation.

The goal is to avoid having the Owner manually open Codex every time a routine deployment/job breaks.

## Model strategy

General philosophy:
- don't create false economy by putting unreliable cheap models on tasks where mistakes cause repeated work;
- use deterministic code rather than models where possible;
- after rechecking the current OpenAI lineup, use GPT-6 Sol as the normal production reasoning model;
- use GPT-6 Astra for the hardest decisions, architecture, debugging, and the initial implementation handoff;
- use GPT-6 Luna only for narrow checked tasks.

Initial Codex implementation should use GPT-6 Astra with xhigh reasoning, escalating to max only when genuinely needed.

## Reporting/operations

Desired operating behavior:

- asynchronous alert when the GM has a genuinely strong actionable idea;
- concise daily report during season (after games on game days; around 8 PM CT on non-game days);
- post-MNF weekly recap;
- Tuesday evening War Room focused on waivers/moves/trades for the coming week;
- avoid activity for activity's sake.

## Recommendation evaluation

Decision:
- keep a durable recommendation ledger;
- distinguish process quality from realized result;
- evaluate sources/models/agents over time;
- use outcome data to improve the system.

## Project memory

Owner wants agents to retain useful memory of past meetings without endlessly growing every prompt.

Decision:
- `PROJECT_STATE.md`: compact rolling current state;
- `DECISIONS.md`: durable canonical decision register;
- `MEETING_NOTES.md`: index;
- dated files under `docs/meetings/`: human-readable meeting minutes;
- agents load project state + decisions by default;
- retrieve historical meeting notes only when relevant.

## Immediate next action

Hand the Codex starter package to the implementation agent.

Codex should implement Milestone 0 and Milestone 1 only before expanding the system.

After the real Sleeper League Constitution is generated, the Owner and GM should inspect it before advancing deeper into the agent system.
