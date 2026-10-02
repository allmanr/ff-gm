# Lean V1 review

**Date:** 2026-10-02
**Participants:** Owner; Claude Code
**Scope:** Review of the Revision 5 spec, the uncommitted Codex-runtime spec, and the implementation plan before any code existed.

## Findings

- No code existed; the docs totaled about 3,800 lines. The live league was at NFL week 4 (trade deadline setting week 14, playoffs week 15).
- The uncommitted runtime spec (Codex on the ChatGPT subscription, local runner) contradicted AGENTS.md, PROJECT_STATE, D-001, and D-004, and the implementation plan cited spec sections that no longer existed.
- The plan placed the autonomous repair milestone (M3) before the first GM (M4), so no football value would arrive this season.
- Revision 5 applied distributed-systems machinery to a one-user tool: semantic rule fingerprints with validation observations and 5-minute/60-second TTLs, staged sync batches with atomic promotion, Postgres in M1 to persist an owner selection, leases/outbox, atomic budget reservation, and trusted auto-merge gates. Fetching and validating live data at the start of each GM session satisfies the same correctness goal.
- Revision 5 also contained genuinely useful Sleeper facts (string IDs, TE bonus by primary position, unknown scoring keys block calculations, traded picks are not a full inventory, per-season league IDs, read-only API). These moved into AGENTS.md.

## Decisions

- D-015: V1 is the `ff` CLI plus one Codex GM; supersedes D-001, D-004, D-012, and partly D-010.
- D-016: keep the repository public; private data lives in gitignored `private/`, itself a private Git repository.
- D-017: defer SRE, AI Guru, Rookie Scout, hosting, and scheduled jobs.
- The Owner supplied their Sleeper username; it was matched against the live league and stored in `private/owner.json`, replacing the planned owner-bootstrap feature.

## Rejected

- Planning in one model and implementing in another for a codebase this small: the plan would cost nearly as much as the build and lose context in the handoff.
- A team of specialist subagents for V1: on a subscription, every subagent call draws from the same usage limit.

## Outcome (same day)

- Built and verified V1 in one session ([PR #2](https://github.com/allmanr/ff-gm/pull/2)): the `ff` CLI (18 commands), GM charter, launcher, and briefs, plus anonymized fixtures, CI, and a privacy leak check.
- Verification against ground truth: the exact scoring engine reproduces Sleeper's `players_points` 749/749; the lineup optimizer reproduces Sleeper's max PF; the GM acceptance run answered lineup, waiver, and trade questions from the actual roster.
- Two independent subagent code reviews found 19 issues; every "fix" verdict was fixed with a regression test that fails when the fix is reverted. Five low-impact optional findings remain in PROJECT_STATE.
- Data-source research and primary-source checks produced D-018 (FantasyCalc and nflverse permitted; RotoWire and KeepTradeCut off-limits). The first GM run cited RotoWire; the citation was replaced and the charter now forbids it.
- Process lessons: a public repository needs an automated leak check (one real manager name and one GM trade idea nearly reached public docs; the Owner squashed history before pushing). Automatic pushing of private data was blocked by the session's permission policy and is left to the Owner.
