# Fantasy Football GM

A private fantasy-football front office with public source code. The Owner makes final football decisions; the service maintains validated Sleeper data and, in later milestones, supplies recommendations.

## Current status

Specification and implementation plan only. The first build covers repository/CI/deployment foundations and exact, persistent league-context validation. No production agent or deployed application is implemented yet.

- [Project state](docs/PROJECT_STATE.md)
- [Implementation specification](docs/IMPLEMENTATION_SPEC.md)
- [Implementation plan and kickoff prompt](docs/IMPLEMENTATION_PLAN.md)
- [Durable decisions](docs/DECISIONS.md)
- [Meeting index](docs/MEETING_NOTES.md)
- [Engineering instructions](AGENTS.md)

Current plans are ChatGPT Plus and Vercel Hobby. Milestones 0–1 require no model API calls. Additional production API spending and frequent scheduling remain explicit later decisions.

Do not commit credentials, private strategy, production data, or operational traces. Service access must be authenticated even though this repository is public.
