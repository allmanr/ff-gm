# Football Front Office — Codex Agent Runtime

> **Status (2026-10-02):** target architecture, not the V1 build list. V1 ([D-015](DECISIONS.md), [plan](IMPLEMENTATION_PLAN.md)) implements a subset: one GM in Codex launched by `scripts/gm`, `ff` CLI tools, and private data in `private/`. Staff roles live in the GM charter; the job queue, runner service, custom agent definitions, and Software Dev path are deferred (D-017). Add each piece when real use shows it is needed.

The football front office will run using **native Codex agents and subagents authenticated through the Owner’s ChatGPT subscription**, rather than through the OpenAI Agents API.

The overall architecture remains the same: our backend owns league state, history, deterministic calculations, research records, jobs, and notifications. Codex provides the reasoning layer: the GM and specialist staff.

## 1. Staff Architecture

The front office consists of a primary GM agent and a set of reusable specialist agents.

| Staff member | Codex implementation |
| --- | --- |
| **GM** | Primary Codex agent. Receives Owner requests and significant league events, decides which staff to consult, synthesizes their work, and makes final recommendations. |
| **Research Boy** | Custom Codex subagent responsible for external research using approved sources and documenting evidence. |
| **Superflex Dynasty Knower** | Custom specialist for dynasty value, roster construction, trade analysis, and long-term Superflex strategy. |
| **League Watcher** | Backend code detects league-state changes; a Codex specialist interprets meaningful changes, updates manager profiles, and identifies actionable implications. |
| **Quant** | Deterministic tools for projections, scoring, value calculations, simulations, and comparisons. Normally invoked by agents rather than implemented as an independent reasoning agent. |
| **Rules/Data Auditor** | Deterministic validation layer for league rules, roster state, scoring settings, and incoming data. An optional Codex specialist handles ambiguous interpretation. |
| **Software Dev / SRE** | Separately permissioned Codex agent responsible for application changes, incidents, debugging, deployment, and infrastructure maintenance. |
| **AI Guru** | Specialist for evaluating models, prompts, agent behavior, research workflows, and improvements to the front-office system itself. |
| **Rookie Scout** | Periodically invoked specialist focused on prospects, incoming rookie classes, college production, draft capital, and dynasty implications. |

The GM is the coordinating agent. Specialists should not independently act as competing decision-makers unless explicitly assigned that responsibility.

Codex agent definitions should be kept in the repository so their instructions, models, reasoning settings, and permissions are version-controlled.

Long-term organizational memory does **not** live primarily inside agent conversation history. Durable state belongs in the backend database and repository documentation.

## 2. Codex Agent Configuration

Repository-level configuration should define the front-office staff.

A likely structure is:

```text
.codex/
    agents/
        research-boy.toml
        dynasty-knower.toml
        league-watcher.toml
        rookie-scout.toml
        ai-guru.toml
        software-dev.toml

AGENTS.md
docs/
    architecture.md
    football-philosophy.md
    meeting-notes.md
    decision-log.md
```

`AGENTS.md` defines the general operating rules for Codex in the repository.

Each custom agent definition specifies its specialist role, relevant tools, model, reasoning level, constraints, and expected output format.

The GM should delegate to specialists when useful rather than attempting to simulate all staff perspectives itself.

## 3. Durable Memory

Agent memory is separated from operational state.

### Postgres stores structured state

Examples:

- leagues
- teams
- rosters
- players
- transactions
- historical snapshots
- scoring rules
- manager profiles
- recommendations
- research evidence
- jobs
- agent outputs
- notification history

### Repository documentation stores durable organizational knowledge

Examples:

- architecture decisions
- Owner preferences
- football philosophy
- staff responsibilities
- operating procedures
- meeting notes
- important historical decisions

The meeting log and decision log should be continuously maintained so agents can recover why previous decisions were made rather than merely seeing the resulting configuration.

## 4. Automated Operation

The front office should operate without requiring the Owner to manually start a Codex conversation for every event.

The local backend continuously handles deterministic work such as Sleeper polling and league-state maintenance.

When an event requires reasoning, it creates an agent job.

```text
Sleeper / other data sources
            ↓
      ingestion services
            ↓
         Postgres
            ↓
 meaningful change detector
            ↓
         job queue
            ↓
       Codex runner
            ↓
            GM
       ↙     ↓      ↘
 Research  Dynasty  Other staff
            ↓
      GM synthesis
            ↓
 validation / persistence
            ↓
 notification to Owner
```

A lightweight runner invokes Codex non-interactively using the Owner’s saved ChatGPT authentication.

Codex handles:

- reasoning
- tool use
- delegation
- subagent coordination
- synthesis

Our application handles:

- scheduling
- event detection
- job persistence
- retries
- validation
- durable state
- notifications
- observability

The runner is therefore orchestration glue, not a second agent framework.

## 5. Local Runner

The initial deployment should use a trusted Codex runner on the Owner’s computer.

The runner should:

- poll or receive queued agent jobs
- invoke Codex
- provide the appropriate repository and context
- collect structured output
- detect unsuccessful runs
- retry recoverable failures
- record run metadata
- update job status
- report failures
- maintain a heartbeat

The models continue running on OpenAI infrastructure. “Local runner” means that the Codex client process and our orchestration code execute locally.

The backend itself does not need to stop when Codex is unavailable.

If the machine is asleep, disconnected, or no longer authenticated, deterministic league ingestion continues and agent jobs remain queued until execution resumes.

## 6. Reliability

The runner should be treated like a small local service.

Required behavior:

- automatic startup after reboot
- restart after crashes
- persistent job queue
- idempotent job handling where practical
- detection of abandoned runs
- retry policy
- heartbeat reporting
- notification when the runner has been unavailable for an extended period

We do not need elaborate high-availability infrastructure for this personal system.

If an agent crashes or a deployment breaks, the system should preserve enough state for the Software Dev agent or Owner to diagnose and repair it.

## 7. Subscription Usage

Codex execution should use the Owner’s ChatGPT subscription authentication rather than application API billing.

Usage controls should therefore focus on conserving available Codex capacity rather than estimating API cost.

Controls should include:

- bounded delegation depth
- limits on parallel agents
- sensible reasoning levels by task
- cheaper/faster models for routine specialist work where appropriate
- deduplication of repetitive events
- aggregation of low-priority league changes
- priority classes for jobs
- graceful queueing when usage limits are reached

Example priority order:

```text
1. Direct Owner request
2. Urgent roster / transaction issue
3. Major league event
4. Trade or waiver analysis
5. League Watcher updates
6. Background research
7. Periodic scouting / profile enrichment
```

The system should assume subscription capacity is finite and degrade gracefully rather than repeatedly retrying when Codex usage is temporarily unavailable.

## 8. Owner Interface

The Owner should be able to interact directly with the GM through Codex.

This is the primary conversational interface for football work.

The GM should have access to tools that retrieve current backend state so it does not rely on stale conversational context.

Typical requests might include:

```text
What should we do about our RB depth?

Have the staff evaluate this trade.

What changed in the league today?

Ask Research Boy why the market is suddenly moving on this player.

Get the Dynasty Knower and Quant to evaluate these three trade packages.

What does the league think our weakest position is?
```

The GM gathers the necessary current context, delegates where useful, and returns the synthesized recommendation.

Other interfaces can be added later.

For example:

- ordinary ChatGPT
- web dashboard
- phone notifications
- Discord
- Slack
- email

Those interfaces should communicate with the backend rather than becoming separate sources of league state.

## 9. Event-Driven GM Work

The GM should not run for every trivial backend update.

Backend code determines whether an event crosses a threshold requiring interpretation.

Examples:

### Do not invoke the GM

- routine polling with no state change
- insignificant projection fluctuation
- duplicate transaction data
- straightforward database maintenance
- deterministic scoring calculations

### Invoke the GM or specialist staff

- meaningful waiver activity
- major player injury
- trade proposal
- unusual manager behavior
- important roster change
- significant market movement
- rookie news affecting dynasty value
- direct Owner request
- discrepancy requiring judgment
- potentially actionable trend

This keeps agent usage focused on tasks where reasoning adds value.

## 10. Deterministic Correctness Layer

Codex should never be the authoritative source for facts that can be validated programmatically.

The existing correctness architecture remains mandatory.

Before recommendations are accepted, the backend should validate relevant inputs such as:

- league scoring settings
- roster format
- Superflex configuration
- starting lineup requirements
- roster ownership
- player identifiers
- transaction history
- draft picks
- standings
- schedule
- waiver settings
- trade deadlines

The GM receives a validated `LeagueContext`.

Agents reason **from** authoritative state; they do not reconstruct authoritative state from memory.

Quantitative calculations should similarly be implemented as deterministic tools wherever practical.

## 11. Research Evidence

Research Boy should produce evidence records rather than merely prose.

A research result should preserve information such as:

```text
topic
source
URL
publication date
retrieval date
claim
supporting evidence
confidence
relevance
```

The GM can then reason over research while the system retains provenance.

Important recommendations should be reproducible later.

## 12. Manager Profiles

League Watcher should maintain evolving models of other managers.

Possible fields include:

- roster tendencies
- trade frequency
- positional preferences
- contender/rebuilder orientation
- willingness to trade picks
- preferred player archetypes
- historical trade partners
- negotiation behavior
- apparent valuation tendencies

Raw observations should remain separate from inferred conclusions.

For example:

```text
Observation:
Manager traded two future firsts for veteran WRs during the previous season.

Inference:
Manager appears willing to sacrifice future draft capital while contending.

Confidence:
Moderate.
```

The distinction between evidence and interpretation should remain explicit.

## 13. Software Dev / SRE Separation

The Software Dev agent has substantially more dangerous permissions than the football staff.

Its access should therefore remain separated.

Football staff may:

- query league data
- perform research
- invoke approved analytical tools
- create recommendations
- update football-domain records

Software Dev may additionally:

- edit source code
- modify configuration
- run tests
- restart services
- deploy
- inspect logs
- modify infrastructure

The GM should not automatically gain software-development privileges simply because it can delegate to football specialists.

A system incident should create a separate Software Dev job.

## 14. Self-Improvement

The system can propose improvements to itself, but agent-generated changes should remain auditable.

Examples:

- AI Guru identifies an inefficient research workflow.
- GM records recurring missing context.
- League Watcher exposes a useful new manager signal.
- Software Dev proposes a new backend capability.

These can generate implementation tasks for Software Dev.

Important architecture decisions should be recorded in the decision log.

Meeting notes and Owner feedback should also be incorporated into durable documentation so subsequent agents inherit the reasoning behind the system.

## 15. Codex Cloud

Cloud Codex execution can be evaluated as a later deployment option.

The initial architecture should **not depend on it**.

The local runner is sufficient for the first implementation and has several advantages:

- direct access to the repository
- straightforward local tooling
- simpler credentials
- known custom-agent configuration
- easier debugging
- predictable development environment

The runner abstraction should nevertheless avoid unnecessary coupling so execution could later move to hosted Codex environments if desired.

Possible future topology:

```text
                 ┌─ local Codex runner
job queue ───────┤
                 └─ Codex cloud runner
```

The backend should care primarily that a compatible worker claims and completes the job.

## 16. Initial Deployment

Version 1 should therefore consist of:

```text
Hosted or local backend
    ├─ Sleeper ingestion
    ├─ Postgres
    ├─ deterministic football tools
    ├─ event detection
    ├─ job queue
    ├─ research storage
    └─ notification service

Owner computer
    └─ Codex runner
         └─ GM
             ├─ Research Boy
             ├─ Superflex Dynasty Knower
             ├─ League Watcher
             ├─ Rookie Scout
             ├─ AI Guru
             └─ approved tools

Separate privileged path
    └─ Software Dev / SRE Codex agent
```

## 17. Design Principle

The system should not try to replace deterministic software with agents.

Use conventional software for:

- state
- correctness
- scheduling
- calculations
- persistence
- event detection
- authentication
- notifications

Use Codex agents for:

- judgment
- interpretation
- synthesis
- research
- strategic reasoning
- delegation
- explanation

That division gives us the football front-office model we want without building a custom agent framework.

**Codex is the staff runtime. The backend is the organization around it.**