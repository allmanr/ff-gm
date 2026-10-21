import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, statSync, writeSync } from "node:fs";
import { constants, homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { prepareStaff, seedNote, specialistInstructions, staff, tomlString } from "./staff.ts";
import { assertPrivatePath, safeDirectory, safeWrite } from "./private-files.ts";
import { checkBackupStatus, formatBackupSummary } from "./backup.ts";
import { startAgentProgress } from "./agent-progress.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineering = process.argv[2] === "dev";
const argv = process.argv.slice(3);
const briefs = ["war-room", "recap", "lineup", "daily"];
const usage = engineering ? 'Usage: ff-dev [ask "task"]' : 'Usage: ff-gm [ask "question" | brief <war-room|recap|lineup|daily> | specialist <research_boy|dynasty_knower|league_watcher|rookie_scout|ai_guru> "task" | staff]';
const within = (parent: string, child: string) => { const rel = relative(parent, child); return rel === "" || (!rel.startsWith("../") && rel !== ".." && !isAbsolute(rel)); };

async function main(): Promise<number> {
  if (argv[0] === "--help" || argv[0] === "help") { console.log(usage); return 0; }
  if (!engineering && argv[0] === "staff" && argv.length === 1) {
    for (const role of staff) console.log(`${role.name}: ${role.description}`);
    console.log("software_dev: separate engineering session via ff-dev");
    return 0;
  }
  let prompt: string | undefined;
  let label = "";
  let role: typeof staff[number] | undefined;
  if (argv.length === 0) { /* Interactive. */ }
  else if (argv[0] === "ask" && argv.slice(1).join(" ").trim()) prompt = argv.slice(1).join(" ");
  else if (!engineering && argv[0] === "brief" && argv.length === 2 && briefs.includes(argv[1]!)) {
    prompt = readFileSync(join(repo, "gm/briefs", `${argv[1]}.md`), "utf8");
    label = `-${argv[1]}`;
  } else if (!engineering && argv[0] === "specialist" && argv.length === 3 && argv[2]?.trim()) {
    role = staff.find((entry) => entry.name === argv[1]);
    if (!role) { console.error(usage); return 2; }
    prompt = argv[2]; label = `-${role.name}`;
  } else { console.error(usage); return 2; }

  const requestedPrivate = resolve(process.env.FF_PRIVATE_DIR || join(repo, "private"));
  mkdirSync(requestedPrivate, { recursive: true });
  const privateDir = realpathSync(requestedPrivate);
  if (within(privateDir, repo) || (within(repo, privateDir) && !within(join(repo, "private"), privateDir))) {
    throw new Error("FF_PRIVATE_DIR must be private/ or outside the engineering repository, and cannot contain it.");
  }
  // This granted cache root must not become source access through a symlink.
  safeDirectory(join(repo, ".local"));
  safeDirectory(join(repo, ".local/cache"));
  const env = { ...process.env, FF_PRIVATE_DIR: privateDir, FF_CACHE_DIR: join(repo, ".local/cache"), FF_REPO_DIR: repo, PATH: `${join(repo, "bin")}:${process.env.PATH || ""}` };
  if (!engineering) {
    for (const file of ["LEAGUE_CONSTITUTION.md", "context.json"]) assertPrivatePath(join(privateDir, file), false);
    console.error("Validating league context...");
    const validation = spawnSync("ff", ["context"], { env, stdio: ["ignore", "ignore", "inherit"] });
    if (validation.status !== 0 || validation.error) {
      console.error("GM not started: league validation failed (details above)."); return 1;
    }
  }
  for (const path of ["notes", "reports"]) safeDirectory(join(privateDir, path));
  if (!existsSync(join(privateDir, ".git"))) {
    const git = spawnSync("git", ["-C", privateDir, "init", "-q"], { stdio: "inherit" });
    if (git.status !== 0 || git.error) throw new Error("Could not initialize the private repository.");
  }
  const overrides: string[] = [];
  if (engineering) {
    overrides.push("agents.enabled=false", `developer_instructions=${tomlString(readFileSync(join(repo, "gm/agents/software_dev.md"), "utf8"))}`);
    safeDirectory(join(privateDir, "reports/engineering"));
  } else {
    seedNote(privateDir, "strategy.md", "# Franchise strategy\n\nDirection (contend / retool / rebuild): _not yet set — ask the Owner._\n\n## Owner preferences and mandates\n");
    seedNote(privateDir, "managers.md", "# Manager notes\n\nKeep dated observations separate from inferred tendencies.\n");
    seedNote(
      privateDir,
      "recommendations.md",
      [
        "# Recommendation log",
        "",
        "Track recommendations with explicit states: `OPEN`, `ACTED`, `DECLINED`, `SUPERSEDED`, `ACTION_UNKNOWN`.",
        "Keep active items easy to scan in the Active / Open section at the top. When closed, move or record them under Closed history with separate decision quality and observed outcome.",
        "",
        "## Active / Open",
        "",
        "- (No open recommendations)",
        "",
        "## Closed history",
        "",
        "<!-- Format: Date · Type · Recommendation · Status · Decision quality (soundness at time) · Observed outcome (Sleeper points/results) -->",
        "",
      ].join("\n"),
    );
    safeWrite(join(privateDir, "AGENTS.md"), `<!-- Generated by ff-gm from gm/CHARTER.md. -->\n\n${readFileSync(join(repo, "gm/CHARTER.md"), "utf8")}`);
    overrides.push(...prepareStaff(repo, privateDir));
    if (role) overrides.push("agents.enabled=false", `developer_instructions=${tomlString(specialistInstructions(repo, role.name))}`);
  }
  const common = [
    "--strict-config", "-C", engineering ? repo : privateDir,
    "-m", engineering ? (process.env.FF_DEV_MODEL || "gpt-6-sol") : (process.env.FF_GM_MODEL || "gpt-6-sol"),
    "-c", `model_reasoning_effort=${tomlString((engineering ? process.env.FF_DEV_EFFORT : process.env.FF_GM_EFFORT) || "high")}`,
    "-c", 'web_search="live"', "-s", "workspace-write",
    "-c", `approval_policy=${tomlString(engineering ? "on-request" : "never")}`,
    "-c", "sandbox_workspace_write.network_access=true", "--add-dir", join(repo, ".local"),
    ...overrides.flatMap((value) => ["-c", value]),
  ];
  if (engineering) common.push("--add-dir", privateDir);
  const backupNotice = () => { if (!engineering) console.error(`\n${formatBackupSummary(checkBackupStatus(privateDir))}`); };
  const outputDir = join(privateDir, engineering ? "reports/engineering" : "reports");
  const stamp = (suffix: string) => `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}${suffix}`;
  /** Runs `codex <head> --json -o <report> -- <prompt>`; the report is saved only if the agent succeeds with a non-empty answer. */
  const exec = async (head: string[], text: string, suffix: string) => {
    const name = stamp(suffix);
    const out = join(outputDir, `${name}.md`);
    const events = join(outputDir, `${name}.events.jsonl`);
    const fd = openSync(events, "wx", 0o600);
    const description = suffix === "-session" ? "GM session handoff" : engineering ? "Software Dev" : role ? role.name : suffix ? `GM ${suffix.slice(1)} brief` : "GM answer";
    const progress = startAgentProgress(description, events);
    let code = 1;
    try {
      const child = spawn("codex", [...head, "--json", "-o", out, "--", text], { env, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.on("data", (chunk: Buffer) => { writeSync(fd, chunk); progress.activity(); });
      const stderr = createInterface({ input: child.stderr });
      stderr.on("line", (line) => {
        // Codex probes /dev/null as non-terminal stdin, then immediately gets EOF.
        if (line !== "Reading additional input from stdin...") console.error(line);
      });
      const interrupt = () => { child.kill("SIGINT"); };
      const terminate = () => { child.kill("SIGTERM"); };
      process.on("SIGINT", interrupt);
      process.on("SIGTERM", terminate);
      try {
        code = await new Promise<number>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", (status, signal) => resolve(status ?? (signal ? 128 + constants.signals[signal] : 1)));
        });
      } finally {
        process.off("SIGINT", interrupt);
        process.off("SIGTERM", terminate);
        stderr.close();
      }
    } finally {
      closeSync(fd);
      progress.stop(code === 0 && existsSync(out) && !!readFileSync(out, "utf8").trim() ? "completed" : "failed");
    }
    if (code !== 0) { console.error(`Agent failed; events: ${events}`); return { code, out }; }
    if (!existsSync(out) || !readFileSync(out, "utf8").trim()) {
      console.error(`Agent returned no final report; events: ${events}`); return { code: 1, out };
    }
    console.log(readFileSync(out, "utf8").trimEnd());
    console.error(`Saved: ${out}\nEvents: ${events}`);
    return { code: 0, out };
  };
  const incomplete = (out: string, why: string) => {
    safeWrite(out, `# INCOMPLETE GM session\n\n${why} at ${new Date().toISOString()}; no summary was saved.\n`);
    console.error(`Marked incomplete: ${out}`);
  };

  if (prompt === undefined) {
    console.error(`Starting interactive ${engineering ? "Software Dev" : "GM"} session...`);
    const start = Date.now() - 2000; // File mtimes use a coarse kernel clock and can trail Date.now().
    const result = spawnSync("codex", common, { env, stdio: "inherit" });
    if (result.error) throw result.error;
    if (engineering) return result.status ?? 1;
    let code = result.status ?? 1;
    const session = code === 0 ? interactiveSession(start, privateDir) : undefined;
    if (code !== 0) incomplete(join(outputDir, `${stamp("-session")}.md`), `Codex exited with ${result.status ?? result.signal}`);
    else if (!session) console.error("No GM session was recorded; no summary saved.");
    else {
      const summary = await exec(["exec", ...common, "resume", session], SESSION_SUMMARY, "-session");
      if (summary.code !== 0) { incomplete(summary.out, "Session summary failed"); code = summary.code; }
    }
    backupNotice();
    return code;
  }
  const { code } = await exec(["exec", ...common], prompt, label);
  if (code === 0) backupNotice();
  return code;
}

const SESSION_SUMMARY = "The Owner has ended this interactive session. Write a short dated handoff: material actions taken, every material recommendation made (confirm each is recorded in notes/recommendations.md), notes changed, and open follow-ups. Do not start new analysis or web searches. If nothing material happened, say so in one line.";

/** Newest top-level terminal Codex session in `cwd` written since `since` (exec runs, IDE panels and subagent threads excluded). */
// ponytail: reads Codex's rollout layout ($CODEX_HOME/sessions/**/rollout-*.jsonl, line 1 = session_meta); switch to a Codex flag if one appears.
function interactiveSession(since: number, cwd: string): string | undefined {
  const root = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions");
  if (!existsSync(root)) return undefined;
  let newest: { id: string; mtime: number } | undefined;
  for (const name of readdirSync(root, { recursive: true, encoding: "utf8" })) {
    const file = join(root, name);
    if (!name.endsWith(".jsonl")) continue;
    let mtime, meta;
    try {
      mtime = statSync(file).mtimeMs;
      if (mtime < since || (newest && mtime <= newest.mtime)) continue;
      meta = JSON.parse(readFileSync(file, "utf8").split("\n", 1)[0]!).payload;
    } catch { continue; }
    // Terminal UI sessions: originator "codex-tui" with a string source ("cli", or "vscode" in a VS Code terminal); subagent threads have object sources.
    if (meta?.cwd === cwd && meta.originator === "codex-tui" && typeof meta.source === "string" && typeof meta.id === "string") newest = { id: meta.id, mtime };
  }
  return newest?.id;
}
try { process.exitCode = await main(); }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
