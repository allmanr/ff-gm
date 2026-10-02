# Fantasy Football GM

A private fantasy-football front office with public source code. The Owner makes final decisions in Sleeper; a GM agent recommends lineups, waiver claims, and trades using validated league data.

## How it works

- **`ff`** — a TypeScript CLI over Sleeper's documented API. Every command first verifies the league's format (dynasty, Superflex, full PPR, TE reception bonus) and roster ownership, and refuses to print football data if anything fails.
- **`scripts/gm`** — validates the league, assembles the GM's instructions (`gm/CHARTER.md` plus the generated League Constitution) in `private/`, and starts a Codex session there with web search.
- **`private/`** — gitignored and kept in its own private repository: Owner identity, constitution, GM notes, reports.

## Setup

Requires Node 24+ (`nvm install 24`; `bin/ff` finds an nvm-installed Node 24 even if your default is older) and, for the GM, the Codex CLI signed in to ChatGPT.

```bash
npm ci
npm run check            # typecheck, lint, offline tests
```

Create `private/owner.json` with your league and Sleeper roster (look up your `user_id` and `roster_id` from the league's users and rosters endpoints):

```json
{ "leagueId": "1314802188052090880", "sleeperUsername": "…", "ownerUserId": "…", "ownerRosterId": 0 }
```

## Use

```bash
bin/ff help
bin/ff context           # validate and write private/LEAGUE_CONSTITUTION.md
bin/ff roster            # your roster: weekly league points, market value, FAAB left, picks
bin/ff schedule          # this week's games, byes, kickoffs (CT), Vegas implied totals, your players' games
bin/ff changes           # what changed in the league since the last run
bin/ff free-agents --pos TE
bin/ff values --league   # dynasty market value by team (FantasyCalc)
bin/ff trade "Player A, 2027 R2" "Player B"
bin/ff history <manager>

scripts/gm                                       # talk to the GM
scripts/gm ask "Who should I start this week?"   # one-shot; saved to private/reports/
scripts/gm brief war-room                        # Tuesday prep (also: recap, lineup, daily)
```

The GM defaults to `gpt-6-sol` with high reasoning; set `FF_GM_MODEL` / `FF_GM_EFFORT` to change it (e.g. `FF_GM_EFFORT=medium` for routine questions; one deep run can use ~190k tokens). Briefs live in `gm/briefs/`.

Data sources: Sleeper's documented API (league facts), FantasyCalc.com (dynasty market values; non-commercial, attributed), and nflverse (schedule and lines; CC-BY-4.0). RotoWire and KeepTradeCut are off-limits by their terms.

To back up GM notes: `git -C private add -A && git -C private commit -m notes && git -C private push`.

## Docs

- [Project state](docs/PROJECT_STATE.md) · [Plan](docs/IMPLEMENTATION_PLAN.md) · [Decisions](docs/DECISIONS.md) · [Engineering instructions](AGENTS.md)
- [Target architecture](docs/IMPLEMENTATION_SPEC.md) (later phases) · [Meeting index](docs/MEETING_NOTES.md)

Do not commit credentials, Owner identity, strategy, or GM output. Test fixtures are anonymized by `npm run record-fixtures`.
