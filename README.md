# Fantasy Football GM

A private fantasy-football front office with public source code. The Owner makes final decisions in Sleeper; a GM agent recommends lineups, waiver claims, and trades using validated league data.

## How it works

- **`ff`** — a TypeScript CLI over Sleeper's documented API. Every command first verifies the league's format (dynasty, Superflex, full PPR, TE reception bonus) and roster ownership, and refuses to print football data if anything fails.
- **`ff-gm`** — validates the league and starts Codex in `private/` with web search. The GM runs `ff` itself, researches news, and advises; you make every move in Sleeper. The trusted charter supplies instructions; the generated League Constitution stays in a separate data file.
- **`private/`** — gitignored and kept in its own private repository: Owner identity, constitution, GM notes, reports.

## Setup

Requires Node 24+ (`nvm install 24`; `ff` finds an nvm-installed Node 24 even if your default is older) and, for the GM, the Codex CLI signed in to ChatGPT.

```bash
npm ci
npm run check            # typecheck, lint, offline tests
```

Put both commands on your `PATH` (add this to `~/.zshrc` or `~/.bashrc` to keep it):

```bash
export PATH="$HOME/ff-gm/bin:$PATH"     # wherever you cloned the repo
```

Create `private/owner.json` with your league and Sleeper roster (look up your `user_id` and `roster_id` from the league's users and rosters endpoints):

```json
{ "leagueId": "1314802188052090880", "sleeperUsername": "…", "ownerUserId": "…", "ownerRosterId": 0 }
```

Then check it:

```bash
ff context               # must say "Validation: PASS"; writes private/LEAGUE_CONSTITUTION.md
ff-gm                    # first session: tell the GM your direction (contend / retool / rebuild)
```

Every brief reads `private/notes/strategy.md`, so set the direction before relying on them.

## Weekly use

| When | Run | You get |
|---|---|---|
| Tue, after Monday Night Football | `ff-gm brief recap` | Result and deciding slots, points left on the bench, standings, league moves (logged to manager notes) |
| Tue | `ff-gm brief war-room` | Next week's lineup plan, waiver claims with FAAB bids and drops, up to two trade ideas with opening offer and walk-away price |
| Wed ~11:00 AM CT | — | Main waiver run (daily runs ~11:01 AM CT; `ff waivers` shows observed times) |
| Before Thursday and Sunday kickoffs | `ff-gm brief lineup` | Keep or swap for each slot, with injury and inactive checks |
| Any day | `ff-gm brief daily` | Under 15 lines of what changed, or "Nothing actionable today" |
| Anytime | `ff-gm ask "Should I trade A for B?"` | One-off question |
| Anytime | `ff-gm` | Interactive session |

Answers from `ask` and `brief` are saved to `private/reports/<timestamp>[-brief].md`. Brief prompts live in `gm/briefs/`.

The GM defaults to `gpt-6-sol` with high reasoning; one deep run can use ~190k tokens. Set `FF_GM_MODEL` / `FF_GM_EFFORT` to change it, e.g. `FF_GM_EFFORT=medium ff-gm ask "…"` for routine questions.

Back up GM notes after sessions: `git -C private add -A && git -C private commit -m notes && git -C private push`.

## `ff` commands

| Question | Command |
|---|---|
| My roster: weekly league points, byes, market value, FAAB left, picks | `ff roster` (or `ff roster <team>`) |
| This week's games, kickoffs (CT), Vegas implied totals, my players' games | `ff schedule` (`--week N`) |
| Live or past matchup, slot by slot | `ff matchups` (`--week N`) |
| Points I left on the bench (hindsight) | `ff bench --week N` (`--league` for every team) |
| Standings | `ff standings` |
| Every team at a glance: QBs, positional counts, age, future 1sts | `ff rosters` |
| Free agents | `ff free-agents --pos TE --limit 20` (`--all` drops the relevance filter) |
| Who's being added across Sleeper | `ff trending` (`--type drop`, `--hours 48`) |
| Waiver run times, FAAB left per team, past winning bids | `ff waivers` |
| This week's moves | `ff transactions` (`--week N`; `--all` includes failed claims) |
| What changed since I last looked | `ff changes` (advances the baseline; `--no-write` just peeks) |
| One player | `ff player "Name"` |
| Dynasty market values | `ff values` (`--league` for every team) |
| Is this trade fair on market value? | `ff trade "Player A, 2027 R2" "Player B"` |
| Future pick ownership | `ff picks` |
| A manager's trade history and tendencies | `ff history <manager>` |

`ff help` lists every option. Exit codes: 0 ok · 1 league validation failed (no football output) · 2 usage · 3 Sleeper/network error · 4 other error. `--refresh-players` honors the same 24-hour cache as normal commands.

## Current limitations

Tracked with impact and verdict under Open in [Project state](docs/PROJECT_STATE.md).

- **No PPG or last-3 numbers.** nflverse scoring refuses any active rule the source cannot supply, and this league enables `st_ff` and `st_fum_rec`. The `ff free-agents` PPG/L3 columns are blank, `--sort ppg` falls back to market value, and `npm run verify-scoring` exits nonzero. Sleeper's own weekly points (`ff roster`, `matchups`, `bench`, `player`) are exact.
- **No projections.** Start/sit advice comes from the GM's web research and implied team totals.
- **`ff trade` checks market value only.** It does not check roster fit or that each asset is on the side you named; read the "On roster" column.
- **Market values** refresh at most once an hour (FantasyCalc's terms).
- **No scheduling.** Briefs run when you run them.

## Data sources

[D-018](docs/DECISIONS.md): Sleeper's documented API (league facts), FantasyCalc.com (dynasty market values; non-commercial, attributed, at most one request per hour), and nflverse (schedule, lines, weekly stats; CC-BY-4.0). RotoWire and KeepTradeCut are off-limits by their terms.

## Development

`npm run check` (typecheck, lint, tests, leak check), `npm run verify-scoring` (live: engine vs Sleeper's points), `npm run record-fixtures` (re-record anonymized fixtures). All run through `bin/node24`, so an older default Node is fine if Node 24 is installed via nvm.

## Docs

- [Project state](docs/PROJECT_STATE.md) · [Plan](docs/IMPLEMENTATION_PLAN.md) · [Decisions](docs/DECISIONS.md) · [Engineering instructions](AGENTS.md)
- [Target architecture](docs/IMPLEMENTATION_SPEC.md) (later phases) · [Meeting index](docs/MEETING_NOTES.md)

Do not commit credentials, Owner identity, strategy, or GM output. Test fixtures are anonymized by `npm run record-fixtures`.
