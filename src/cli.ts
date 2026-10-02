import { parseArgs } from "node:util";
import {
  contextCommand,
  freeAgentsCommand,
  matchupsCommand,
  picksCommand,
  playerCommand,
  rosterCommand,
  rostersCommand,
  standingsCommand,
  trendingCommand,
  transactionsCommand,
  UsageError,
  type Options,
} from "./commands.ts";
import { tradeCommand, valuesCommand } from "./value-commands.ts";
import { changesCommand } from "./changes.ts";
import { historyCommand } from "./history.ts";
import { scheduleCommand } from "./schedule.ts";
import { benchCommand } from "./bench.ts";
import { waiversCommand } from "./waivers.ts";
import { ContextError, createSession, OwnerUnsetError, type Session } from "./session.ts";
import { createSleeperClient, SleeperError } from "./sleeper/client.ts";

const HELP = `ff — validated Sleeper league data for the GM. Every command verifies the league first.

  ff context                     validate, print the League Constitution, save it to private/
  ff standings                   records, points for/against, divisions
  ff rosters                     every team: QBs, positional counts, age, future 1sts
  ff roster [me|ID|name]         one roster with weekly league points and picks (default: me)
  ff picks [team]                future pick ownership
  ff free-agents [--pos QB,TE] [--limit N] [--all] [--sort value|ppg]
  ff trending [--type add|drop] [--hours N] [--limit N]
  ff transactions [--week N] [--all]
  ff waivers                     observed waiver run times, FAAB left per team, winning bids
  ff matchups [--week N]
  ff bench [me|team] [--week N] [--league]  hindsight lineup review: actual vs best possible
  ff schedule [--week N]         NFL games, byes, kickoffs (CT), lines, and your players' games
  ff player <name|Sleeper ID>
  ff history [manager] [--limit N]  trades across all seasons with per-manager tendencies
  ff changes [--no-write]        what changed in the league since the last run (snapshot in private/)
  ff values [me|team] [--league]  dynasty market values (FantasyCalc) for a roster, or every team
  ff trade "<we give>" "<we get>"  market-value check, e.g. ff trade "Player A, 2027 R2" "Player B"

  --refresh-players  re-download Sleeper's player database (normally at most daily)

Exit codes: 0 ok · 1 league validation failed (no football output) · 2 usage · 3 Sleeper/network error · 4 other error`;

export const EXIT = { ok: 0, invalidContext: 1, usage: 2, upstream: 3, other: 4 } as const;

function parseOptions(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      week: { type: "string" },
      pos: { type: "string" },
      limit: { type: "string" },
      all: { type: "boolean" },
      type: { type: "string" },
      hours: { type: "string" },
      "no-write": { type: "boolean" },
      league: { type: "boolean" },
      sort: { type: "string" },
      "refresh-players": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const int = (name: string, v: string | undefined) => {
    if (v === undefined) return undefined;
    if (!/^\d+$/.test(v)) throw new UsageError(`--${name} must be a whole number`);
    return Number(v);
  };
  if (values.type !== undefined && values.type !== "add" && values.type !== "drop") {
    throw new UsageError("--type must be add or drop");
  }
  const opts: Options = {};
  const week = int("week", values.week);
  const limit = int("limit", values.limit);
  const hours = int("hours", values.hours);
  if (week !== undefined) opts.week = week;
  if (limit !== undefined) opts.limit = limit;
  if (hours !== undefined) opts.hours = hours;
  if (values.pos) opts.pos = values.pos.toUpperCase().split(",").map((p) => p.trim());
  if (values.all) opts.all = true;
  if (values.type) opts.type = values.type;
  if (values["no-write"]) opts.write = false;
  if (values.league) opts.league = true;
  if (values.sort !== undefined) {
    if (values.sort !== "value" && values.sort !== "ppg") throw new UsageError("--sort must be value or ppg");
    opts.sort = values.sort;
  }
  return { command: positionals[0], arg: positionals[1], arg2: positionals[2], opts, help: values.help, refreshPlayers: values["refresh-players"] };
}

export async function run(
  command: string | undefined,
  arg: string | undefined,
  arg2: string | undefined,
  opts: Options,
  session: Session,
) {
  switch (command) {
    case "context":
      return contextCommand(session, opts);
    case "standings":
      return standingsCommand(session);
    case "rosters":
      return rostersCommand(session);
    case "roster":
      return rosterCommand(session, arg);
    case "picks":
      return picksCommand(session, arg);
    case "free-agents":
    case "fa":
      return freeAgentsCommand(session, opts);
    case "trending":
      return trendingCommand(session, opts);
    case "transactions":
    case "tx":
      return transactionsCommand(session, opts);
    case "waivers":
      return waiversCommand(session, opts);
    case "bench":
      return benchCommand(session, arg, opts);
    case "schedule":
      return scheduleCommand(session, opts);
    case "matchups":
      return matchupsCommand(session, opts);
    case "player":
      return playerCommand(session, arg);
    case "history":
      return historyCommand(session, arg, opts);
    case "changes":
      return changesCommand(session, opts);
    case "values":
      return valuesCommand(session, arg, opts);
    case "trade":
      return tradeCommand(session, arg, arg2);
    default:
      throw new UsageError(command ? `Unknown command "${command}".\n\n${HELP}` : HELP);
  }
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseOptions(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return EXIT.usage;
  }
  if (parsed.help || !parsed.command || parsed.command === "help") {
    process.stdout.write(`${HELP}\n`);
    return EXIT.ok;
  }
  const session = createSession({ client: createSleeperClient(), refreshPlayers: parsed.refreshPlayers ?? false });
  try {
    const output = await run(parsed.command, parsed.arg, parsed.arg2, parsed.opts, session);
    const notices = await session.notices();
    process.stdout.write(`${output}\n${notices.map((n) => `\n⚠ ${n}`).join("")}${notices.length ? "\n" : ""}`);
    return EXIT.ok;
  } catch (err) {
    if (err instanceof ContextError) {
      process.stderr.write(`FAIL CLOSED — no football output.\n${err.message}\n`);
      return EXIT.invalidContext;
    }
    if (err instanceof OwnerUnsetError) {
      process.stderr.write(`${err.message}\n`);
      return EXIT.invalidContext;
    }
    if (err instanceof UsageError) {
      process.stderr.write(`${err.message}\n`);
      return EXIT.usage;
    }
    if (err instanceof SleeperError) {
      process.stderr.write(`${err.message}${err.cause ? ` (${String(err.cause)})` : ""}\n`);
      return EXIT.upstream;
    }
    // Anything else (nflverse outage, malformed private file, bug) must not exit 1, which means validation failed.
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    return EXIT.other;
  }
}

process.exitCode = await main();
