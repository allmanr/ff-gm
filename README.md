# Fantasy Football GM

A private fantasy-football front office with public source code. The Owner makes final decisions in Sleeper; a GM agent recommends lineups, waiver claims, and trades using validated league data.

## How it works

- **`ff`** — a TypeScript CLI over Sleeper's documented API. Every command first verifies the league's format (dynasty, Superflex, full PPR, TE reception bonus) and roster ownership, and refuses to print football data if anything fails.
- **`ff-gm`** — validates the league and starts a coordinating Codex GM in `private/`. The GM invokes real specialist agents, reconciles their evidence, and advises; you make every move in Sleeper. Trusted prompts supply instructions; the generated League Constitution stays in a separate data file.
- **`ff-dev`** — separately launches Software Dev/SRE in the engineering repository for diagnosis, fixes and tests. The GM cannot delegate engineering privileges to football staff.
- **`private/`** — gitignored and kept in its own private repository: Owner identity, constitution, GM notes, reports.

## Setup

Requires GNU/Linux, Node 24+ (`nvm install 24`; `ff` finds an nvm-installed Node 24 even if your default is older), and util-linux `flock` for the shared player-cache lock. The GM requires a Codex CLI with native custom-agent support, signed in to ChatGPT. Interactive session capture was tested with 0.163.0.

```bash
npm ci
npm run check            # typecheck, lint, offline tests
```

Put the commands on your `PATH` (add this to `~/.zshrc` or `~/.bashrc` to keep it):

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
| Tue, after Monday Night Football | `ff-gm brief recap` | Result and deciding slots, points left on the bench, standings, league moves, and recommendation closures |
| Tue | `ff-gm brief war-room` | Current validated week's lineup plan, waiver claims with FAAB bids and drops, rechecked trade ideas and worthwhile new offers with walk-away prices |
| Wed ~11:00 AM CT | — | Main waiver run (daily runs ~11:01 AM CT; `ff waivers` shows observed times) |
| Before Thursday and Sunday kickoffs | `ff-gm brief lineup` | Keep or swap for each slot, with injury and inactive checks |
| Any day | `ff-gm brief daily` | Under 15 lines of what changed, or "Nothing actionable today" |
| Anytime | `ff-gm ask "Should I trade A for B?"` | One-off question |
| Anytime | `ff-gm` | Interactive session |

Answers from `ask`, `brief` and direct specialist calls are saved to unique files in `private/reports/`, named `<UTC timestamp>-<id>[-<brief or specialist>].md` (e.g. `…-recap.md`, `…-lineup.md`), with adjacent `.events.jsonl` execution logs. Failed runs retain events and exit nonzero; an empty final report is a failure. When an interactive `ff-gm` session ends, the GM resumes it once to save a handoff (material actions, recommendations, open follow-ups) as `…-session.md`; a failed or interrupted session, or a failed summary, is saved as `# INCOMPLETE GM session` instead. `ls private/reports/*-recap.md` shows which weeks the routine ran. Brief prompts live in `gm/briefs/`.

Direct agent runs (`ff-gm ask`, `brief`, `specialist`, and `ff-dev ask`) and interactive GM handoffs show startup status, the live event-log path, and progress every 15 seconds on stderr. Each update shows elapsed time and time since the last event, so a quiet agent is visible without claiming it is making progress. The final report alone goes to stdout. Ctrl+C cancels the agent and keeps its event log. Interactive sessions use Codex's own progress display.

The war-room brief plans for the current NFL season and week from validated league context and names that week at the start. Later-week lookahead is labeled separately. To ask about a different week, use `ff-gm ask` and specify it.

After an answer finishes, Ctrl+C exits the interactive session and starts the handoff turn. A session with no recorded conversation prints a notice instead of saving a summary. Session discovery depends on Codex's local rollout layout.

The GM keeps material recommendations in `private/notes/recommendations.md`, with active items above closed history. Weekly recaps record explicit statuses and assess decision quality separately from Sleeper results; unverifiable actions remain `ACTION_UNKNOWN` until the Owner clarifies them.

The GM defaults to `gpt-6-sol` with high reasoning; one deep run can use ~190k tokens. Set `FF_GM_MODEL` / `FF_GM_EFFORT` to change it, e.g. `FF_GM_EFFORT=medium ff-gm ask "…"` for routine questions.

## Specialist staff

The GM consults the relevant specialists for substantive questions and waits for their results. Up to three specialist threads run at once. Simple factual lookups stay with the GM.

| Native agent | Responsibility |
|---|---|
| `research_boy` | Current injuries, usage, depth charts and dated primary evidence |
| `dynasty_knower` | Superflex dynasty trades, roster construction and contention windows |
| `league_watcher` | League changes, opposing needs and manager tendencies |
| `rookie_scout` | Prospects, rookies and observed versus projected draft evidence |
| `ai_guru` | Advice/evidence audits, agent behavior and workflow evaluation |

```bash
ff-gm staff
ff-gm ask "Have Research Boy and Dynasty Knower evaluate this trade idea."
ff-gm specialist rookie_scout "Assess the rookie evidence for this prospect."
ff-gm specialist ai_guru "Audit the latest report for stale premises."
ff-dev ask "Reproduce this CLI failure, fix it, and run the checks."
ff-dev                    # interactive engineering session
```

Role prompts live in `gm/agents/`; `gm/STAFF.md` supplies shared specialist rules. The launcher generates native TOML definitions under `private/.codex/agents/` and explicitly registers them on the Codex command line, including in a workspace Codex hasn't trusted yet. It refuses unexpected agent definitions in that directory. See [native agent configuration](https://learn.chatgpt.com/docs/agent-configuration/subagents).

Each football specialist validates context, queries `ff`, and saves evidence under `private/notes/staff/<role>/`. The GM alone reconciles canonical notes and advances the league-change baseline. Specialists are Sol/high; the GM environment overrides do not change their models. Delegation uses additional subscription tokens.

Football sessions use the shared `.local/cache/` player cache and can write the private workspace and tool cache; the sandbox protects engineering source and `.codex` configuration. Software Dev/SRE is a separate primary session with repository writes and approval requests for actions beyond that sandbox. Its reports stay under `private/reports/engineering/`; `FF_DEV_MODEL` / `FF_DEV_EFFORT` override Sol/high. It can repair failed context validation without producing football advice. Commits, pushes, deployments, destructive actions and protected changes still need explicit Owner authorization. Launchers accept the documented commands, not arbitrary Codex flags.

Successful one-shot GM runs and interactive exits print private backup status. Run `ff backup` to inspect it separately. The check reads local Git state and compares commits with the last-known upstream ref; it does not contact the remote or verify remote availability. When backup is needed, it prints a manual command. Back up GM notes after sessions: `git -C private add -A && git -C private commit -m notes && git -C private push`.

## `ff` commands

| Question | Command |
|---|---|
| My roster: weekly league points, byes, market value, FAAB left, picks | `ff roster` (or `ff roster <team>`) |
| This week's games, kickoffs (CT), Vegas implied totals, my players' games | `ff schedule` (`--week N`) |
| Live or past matchup, slot by slot | `ff matchups` (`--week N`) |
| Points I left on the bench (hindsight) | `ff bench --week N` (`--league` for every team) |
| Standings | `ff standings` |
| Every team at a glance: QBs, positional counts, age, future 1sts, non-QB SUPER_FLEX starts, active/IR fullness | `ff rosters` |
| Free agents | `ff free-agents --pos TE --limit 20` (`--all` drops the relevance filter) |
| Who's being added across Sleeper | `ff trending` (`--type drop`, `--hours 48`) |
| Waiver run times, FAAB left per team, past winning bids | `ff waivers` |
| This week's moves | `ff transactions` (`--week N`; `--all` includes failed claims) |
| What changed since I last looked | `ff changes` (advances the baseline; `--no-write` just peeks) |
| One player | `ff player "Name"` |
| Dynasty market values | `ff values` (`--league` for every team) |
| Is this trade fair on market value, and what does it do to both rosters and lineups? | `ff trade "Player A, 2027 R2 (own)" "Player B" --with <manager>` |
| Future pick ownership | `ff picks` |
| A manager's trade history and tendencies | `ff history <manager>` |
| Private repository backup status | `ff backup` |

`ff help` lists every option. Exit codes: 0 ok · 1 league validation failed (no football output) · 2 usage · 3 Sleeper/network error · 4 other error. `--refresh-players` honors the same 24-hour cache as normal commands; with no usable cache it retries a download that failed earlier that day.

## Current limitations

Tracked with impact and verdict under Open in [Project state](docs/PROJECT_STATE.md).

- **PPG and last-3 numbers are nflverse stats scored with the league's settings.** nflverse has no special-teams split, so `st_fum_rec` comes from opponent fumble recoveries and `st_ff` counts as 0 (D-022, disclosed in the stats label). Any other rule the source cannot supply makes scoring refuse. Sleeper's own weekly points (`ff roster`, `matchups`, `bench`, `player`) are exact.
- **No projections.** Start/sit advice comes from the GM's web research and implied team totals.
- **`ff trade` checks market value, ownership, drops and lineup change.** It refuses assets on the wrong side, free agents, and ambiguous picks. For both teams it shows active/IR counts, required drops, and the best lineup before and after from season averages of Sleeper's recorded points (not a projection). It does not judge roster fit.
- **Market values** refresh at most once an hour (FantasyCalc's terms). Player downloads are coordinated across parallel agents and attempted at most once per 24 hours, including failures (`--refresh-players` can retry when no cache exists); a failed refresh uses a valid stale cache when available.
- **No scheduling.** Briefs run when you run them.

## Data sources

[D-018](docs/DECISIONS.md): Sleeper's documented API (league facts), FantasyCalc.com (dynasty market values; non-commercial, attributed, at most one request per hour), and nflverse (schedule, lines, weekly stats; CC-BY-4.0). RotoWire and KeepTradeCut are off-limits by their terms.

## Development

`npm run check` (typecheck, lint, tests, leak check), `npm run verify-scoring` (live: engine vs Sleeper's points), `npm run record-fixtures` (re-record anonymized fixtures). All run through `bin/node24`, so an older default Node is fine if Node 24 is installed via nvm.

## Docs

- [Project state](docs/PROJECT_STATE.md) · [Plan](docs/IMPLEMENTATION_PLAN.md) · [Decisions](docs/DECISIONS.md) · [Engineering instructions](AGENTS.md)
- [Target architecture](docs/IMPLEMENTATION_SPEC.md) (later phases) · [Meeting index](docs/MEETING_NOTES.md)

Do not commit credentials, Owner identity, strategy, or GM output. Save session exports and transcripts under `private/session-exports/`. Keep GM notes, reports, and recommendation history under `private/`. Never save these artifacts in the public source tree, even temporarily. Test fixtures are anonymized by `npm run record-fixtures`.

`npm run check-leaks` rejects known private artifact paths and recognizable session exports without needing private league context, including files forced into the Git index. When `private/context.json` is available, it also scans index blobs and tracked working files for private league identifiers. These checks do not detect arbitrary strategy text saved under an unrelated filename. Review the public diff before committing.
