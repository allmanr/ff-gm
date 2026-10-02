/**
 * Fails if any tracked or staged file contains an identifying value from private/: manager and
 * team names, Sleeper user IDs, the league name, or division names. Runs as part of `npm run check`;
 * a no-op where private/ does not exist (CI).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../src/config.ts";

const contextFile = join(paths.privateDir, "context.json");
if (!existsSync(contextFile)) {
  console.log("check-leaks: no private/context.json; skipped");
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

const git = (...args: string[]) => execFileSync("git", args, { cwd: paths.repoRoot, encoding: "utf8" });
// NUL delimiters preserve filenames containing tabs/newlines. Read blobs by object ID so staged
// contents are checked even if the working copy was sanitized, removed, or renamed afterward.
const entries = git("ls-files", "--stage", "-z").split("\0").filter(Boolean).map((entry) => {
  const tab = entry.indexOf("\t");
  const [, oid] = entry.slice(0, tab).split(" ");
  return { file: entry.slice(tab + 1), oid: oid! };
});
const files = new Set(entries.map((entry) => entry.file));

const hits: string[] = [];
const scan = (text: string, location: string) => {
  for (const n of needles) if (text.includes(n)) hits.push(`${location}: contains a private league identifier (${n.length} chars)`);
};
for (const { file, oid } of entries) scan(git("cat-file", "blob", oid), `${file} (index)`);
for (const f of files) {
  const file = join(paths.repoRoot, f);
  if (!existsSync(file)) continue;
  scan(readFileSync(file, "utf8"), `${f} (working tree)`);
}
if (hits.length > 0) {
  console.error(`check-leaks: ${hits.length} problem(s)\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`check-leaks: ${files.size} files clean`);
