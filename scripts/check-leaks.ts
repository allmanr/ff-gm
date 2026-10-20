/**
 * Rejects private artifact paths in the index and visible untracked files, including in CI.
 * With private context, also scans indexed blobs and tracked working files for league identifiers.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../src/config.ts";

const artifactRules: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
  { pattern: /^(?:private|\.local|notes|reports|snapshots|session-exports)(?:\/|$)/, reason: "private artifact directory" },
  { pattern: /^(?:owner\.json|context\.json|LEAGUE_CONSTITUTION\.md)$/, reason: "generated private file" },
  { pattern: /(?:^|\/)codex-session-[^/]*\.(?:md|txt|json|jsonl|html)$/, reason: "session export" },
  { pattern: /(?:^|\/)[^/]*\.events\.jsonl$/, reason: "execution log" },
];
const git = (...args: string[]) => execFileSync("git", args, { cwd: paths.repoRoot, encoding: "utf8" });
// NUL delimiters preserve filenames containing tabs/newlines. Read blobs by object ID so staged
// contents are checked even if the working copy was sanitized, removed, or renamed afterward.
const entries = git("ls-files", "--stage", "-z").split("\0").filter(Boolean).map((entry) => {
  const tab = entry.indexOf("\t");
  const [, oid] = entry.slice(0, tab).split(" ");
  return { file: entry.slice(tab + 1), oid: oid! };
});
const files = new Set(entries.map((entry) => entry.file));
const untracked = git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);

const hits: string[] = [];
for (const group of [{ source: "index", files }, { source: "untracked", files: untracked }]) {
  for (const file of group.files) {
    const rule = artifactRules.find(({ pattern }) => pattern.test(file));
    if (rule) hits.push(`${rule.reason} (${group.source}): private artifacts are not allowed in the public repository`);
  }
}
if (hits.length > 0) {
  console.error(`check-leaks: ${hits.length} problem(s)\n${hits.join("\n")}`);
  process.exit(1);
}

const contextFile = join(paths.privateDir, "context.json");
if (!existsSync(contextFile)) {
  console.log(`check-leaks: artifact path checks passed (${files.size} indexed, ${untracked.length} visible untracked); identifier scan unavailable (no private context)`);
  process.exit(0);
}

type Ctx = {
  leagueName: string;
  divisions: Record<string, string>;
  teams: { managerName: string; teamName: string | null; ownerUserId: string | null; coOwnerUserIds: string[] }[];
};
const ctx = JSON.parse(readFileSync(contextFile, "utf8")) as Ctx;
const secrets = new Set<string>([ctx.leagueName, ...Object.values(ctx.divisions)]);
for (const t of ctx.teams) {
  secrets.add(t.managerName);
  if (t.teamName) secrets.add(t.teamName);
  if (t.ownerUserId) secrets.add(t.ownerUserId);
  for (const id of t.coOwnerUserIds) secrets.add(id);
}
const needles = [...secrets].filter((s) => s.length >= 5);
const location = (file: string, source: string) => `${needles.some((n) => file.includes(n)) ? "[redacted path]" : file} (${source})`;
const scan = (text: string, location: string) => {
  for (const n of needles) if (text.includes(n)) hits.push(`${location}: contains a private league identifier (${n.length} chars)`);
};
for (const { file, oid } of entries) scan(git("cat-file", "blob", oid), location(file, "index"));
for (const f of files) {
  const file = join(paths.repoRoot, f);
  if (!existsSync(file)) continue;
  scan(readFileSync(file, "utf8"), location(f, "working tree"));
}
if (hits.length > 0) {
  console.error(`check-leaks: ${hits.length} problem(s)\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`check-leaks: artifact path checks passed; ${files.size} files clean of private league identifiers`);
