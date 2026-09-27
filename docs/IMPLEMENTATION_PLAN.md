# Implementation plan and Codex handoff

**Updated:** 2026-09-27
**Active scope:** Milestones 0–1 of [the spec](IMPLEMENTATION_SPEC.md). Stop after Milestone 1.
**Budget boundary:** no model API calls or paid service upgrades in this phase.

## Sequence

### 1. Repository and local foundation

- Read `AGENTS.md`, `PROJECT_STATE.md`, `DECISIONS.md`, the spec, and this plan once at kickoff.
- Inspect the worktree and preserve existing changes. Use a `codex/` branch and coherent commits.
- Use one TypeScript/Next.js application with a small domain/service layer, Zod, Drizzle/Postgres, and Vitest. Pin a supported runtime/package manager and commit the lockfile. No monorepo or bespoke agent framework.
- Add strict typechecking, lint, tests, build, `.env.example`, and scoped environment validation. Add CI using a disposable Postgres service and sanitized recorded Sleeper fixtures. Ordinary tests must not depend on Sleeper being online.
- Add minimal public liveness and protected readiness/ops. Authenticate private routes and test denial first. Document the one-owner access mechanism; avoid a full multi-user identity product.

### 2. Durable context foundation

- Create only the migrations required for owner selection, immutable rule versions, validation observations, player cache, candidate sync batches, and current validated league/users/rosters.
- Implement the documented HTTP transport, timeouts, bounded retries, string IDs, runtime schemas, and daily player-cache guard across processes.
- Fetch league settings, users, rosters, current matchups, weekly transactions, drafts/picks/traded picks, and NFL state as specified. Record endpoint coverage, fetch times, unresolved semantics, and partial failures.
- Build normalized rules with a stable semantic fingerprint, separate raw hashes and validation observations, and the task-data freshness policy in spec section 11.2.
- Promote only complete validated batches. Preserve stale last-good data for diagnostics. Do not build the full historical event/profile/research system yet.

### 3. Correctness and Owner bootstrap

- Verify dynasty, Superflex, PPR, and the exact TE bonus using current Sleeper data. Preserve all other rules, including ones not yet interpreted.
- Implement a shared guard before model invocation and publication. Test it using a fake analytical callback/model spy; there is no production football model in this milestone.
- Implement protected one-time owner/roster selection; support an explicit co-owner choice and persist it. Do not guess. Constitution generation can complete before selection, while franchise analysis remains blocked.
- Render the constitution deterministically, with provenance, exact settings, validation time, and unresolved fields. Store operational copies privately; commit only an intentionally sanitized rules-only artifact if useful.

### 4. Validation and preview

Run the configured typecheck, lint, unit/integration tests, and production build. Required test scenarios are in spec section 34; include a real database restart/new-client persistence check, partial/concurrent refresh failures, TTL boundaries, invariant mismatches, and output invalidation after relevant state changes.

Deploy to a Vercel preview with isolated test/preview credentials and data. Verify public health, unauthenticated private-route denial, authenticated context, durable owner selection, and the generated constitution. Keep live smoke checks separate from deterministic CI. Do not put production secrets into public PR workflows or logs.

If authentication or free resource provisioning requires the Owner, finish independent code/tests first and bundle the exact remaining setup steps. Do not claim deployment success without a deployed verification result. Do not purchase a plan to finish the milestone.

### 5. Handoff and stop

Update `PROJECT_STATE.md` with what actually exists, tests run, deployment status, and remaining blockers. Add durable decisions only when needed. Give the Owner:

- implementation summary and branch/commit/PR;
- verification results, distinguishing passed, failed, and not run;
- generated League Constitution and any mismatch/unknown rule;
- owner-selection state and instructions if still unset;
- preview URL and authentication/setup actions, with no secret values;
- the next bounded milestone, without implementing it.

The Owner/GM inspects the real constitution before further expansion. This is a product validation checkpoint already present in the original plan, not approval for every routine engineering choice.

## Model and chat workflow

Keep Astra / xhigh for this one-time foundation pass under the existing policy; do not use max by default. Use Sol / high for subsequent routine implementation, escalating security/correctness/architecture and repeated failures to Astra. If Plus limits make the first pass impractical, Sol / high implementation with a focused Astra review is a reasonable alternative, but is not a proven zero-quality-loss substitution. Record any chosen change in the model policy.

Use one implementation chat for this coherent phase. No standing review committee, autonomous fleet, or required subagent fan-out. Parallel work is useful only for independent, well-bounded tasks when authorized and supported; the lead remains accountable for integration and verification. Do not force the Owner to relay messages between agents.

`AGENTS.md` documents behavior; it does not select the actual model or grant permissions. Choose the available model in Codex and report any mismatch. The local project is the engineering workspace. The existing ChatGPT Project remains the intended Owner interface, but its connection to the deployed backend is a later explicit integration task.

## Copy-ready kickoff prompt

```text
Read AGENTS.md, docs/PROJECT_STATE.md, docs/DECISIONS.md,
docs/IMPLEMENTATION_SPEC.md, and docs/IMPLEMENTATION_PLAN.md completely.

Implement Milestones 0 and 1 only, following the implementation plan.
Stop after Milestone 1. The league is 1314802188052090880.

Verify the exact Sleeper rules and implement fail-closed context gates.
Do not guess the Owner's roster. Include the small durable Postgres
foundation required by Milestone 1, protected private routes, and an
isolated preview environment. Generate the constitution deterministically.
Do not build production agents, paid research, or later milestones.
No model API calls or paid plan upgrades are authorized in this phase.

Work autonomously on routine choices within the spec. Use current official
documentation for platform-specific details. Run typecheck, lint, tests,
production build, and the required preview smoke checks. Keep coherent Git
commits on a codex/ branch and prepare a reviewable PR.

If credentials, authentication, Owner identity, or a protected action
blocks work, complete independent work and then bundle the exact needed
actions. Never expose secrets or claim unrun checks passed.

At completion update project state and report the implementation,
verification/deployment results, generated constitution, discrepancies,
assumptions, owner-selection status, and remaining actions. Stop there.
```

## Gates before later milestones

- **M2:** expand history and durable jobs; settle polling frequency against free database/hosting quotas.
- **M3:** approve an explicit API budget before unattended model repairs; provision the independent monitor, trusted merge gates, and scoped credentials. Prove a synthetic repair end to end.
- **M4:** prove the private ChatGPT integration on phone/web and runtime account access; ship the minimum ledger and budget admission checks with the GM.
- **M5–6:** enable recommendation types only when their research/projection/scoring prerequisites pass. Do not fabricate missing market values or projection inputs.
- **M7–8:** expand outcome evaluation and scheduled delivery, then test notification retries, freshness at delivery, deadlines, and timezone transitions.

Open budget/interface alternatives are discussed in the [review record](meetings/2026-09-27-codex-spec-review.md). They do not require redesigning or postponing Milestones 0–1.
