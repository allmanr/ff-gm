import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backupCommand, checkBackupStatus, formatBackupSummary, MANUAL_BACKUP_COMMAND } from "../src/backup.ts";
import { fixtureSession } from "./helpers.ts";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ff-backup-"));
  temporary.push(dir);
  return dir;
}

const git = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });

function commit(dir: string, file: string, message = file): void {
  writeFileSync(join(dir, file), `# ${file}\n`);
  git(dir, "add", file);
  git(dir, "-c", "user.email=gm@example.com", "-c", "user.name=GM", "commit", "-q", "-m", message);
}

/** A repository with one commit; `tracked` pushes it to a local bare remote and sets the upstream. */
function repo(tracked: boolean): string {
  const dir = tempDir();
  execFileSync("git", ["init", "-q", dir]);
  commit(dir, "seed.md");
  if (tracked) {
    const bare = tempDir();
    execFileSync("git", ["init", "--bare", "-q", bare]);
    git(dir, "remote", "add", "origin", bare);
    git(dir, "push", "-q", "-u", "origin", "HEAD");
  }
  return dir;
}

describe("checkBackupStatus", () => {
  it("is unavailable for a missing directory or one that is not a repository root", () => {
    expect(checkBackupStatus(join(tempDir(), "missing")).state).toBe("unavailable");
    expect(checkBackupStatus(tempDir()).state).toBe("unavailable");
    // Regression: a plain directory nested in another checkout must not report the parent's status.
    const nested = join(repo(false), "private");
    mkdirSync(nested);
    const status = checkBackupStatus(nested);
    expect(status.state).toBe("unavailable");
    expect(status.summary).toContain("not a Git repository");
  });

  it("is unavailable without a remote tracking branch, even if a remote exists", () => {
    const dir = repo(false);
    git(dir, "remote", "add", "origin", "https://invalid.example.test/repo.git");
    const status = checkBackupStatus(dir);
    expect(status).toMatchObject({ state: "unavailable", ahead: null, backupCommand: MANUAL_BACKUP_COMMAND });
    expect(status.summary).toBe("Private backup unavailable: no remote tracking branch, working tree clean");
  });

  it("reports clean / synced with no backup command", () => {
    const status = checkBackupStatus(repo(true));
    expect(status).toMatchObject({ state: "clean_synced", uncommitted: 0, ahead: 0 });
    expect(status.backupCommand).toBeUndefined();
    expect(formatBackupSummary(status)).toBe("Private backup: clean / synced.");
  });

  it("reports dirty with counts only, never file names or contents", () => {
    const dir = repo(true);
    git(dir, "config", "status.showUntrackedFiles", "no"); // must not hide new notes
    writeFileSync(join(dir, "secret_strategy_mandate.md"), "Confidential Owner mandate");
    writeFileSync(join(dir, "seed.md"), "changed\n");
    const status = checkBackupStatus(dir);
    expect(status).toMatchObject({ state: "dirty", uncommitted: 2, ahead: 0 });
    const out = formatBackupSummary(status);
    expect(out).toBe(`Private backup: 2 uncommitted changes.\nManual backup command:\n  ${MANUAL_BACKUP_COMMAND}`);
  });

  it("reports ahead for unpushed commits, without commit messages", () => {
    const dir = repo(true);
    commit(dir, "a.md", "secret message");
    commit(dir, "b.md");
    const status = checkBackupStatus(dir);
    expect(status).toMatchObject({ state: "ahead", uncommitted: 0, ahead: 2, backupCommand: MANUAL_BACKUP_COMMAND });
    expect(status.summary).toBe("Private backup: 2 unpushed commits, working tree clean");
  });

  it("reports both counts when dirty and ahead", () => {
    const dir = repo(true);
    commit(dir, "a.md");
    writeFileSync(join(dir, "b.md"), "x");
    const status = checkBackupStatus(dir);
    expect(status).toMatchObject({ state: "dirty", uncommitted: 1, ahead: 1 });
    expect(status.summary).toBe("Private backup: 1 unpushed commit, 1 uncommitted change");
  });
});

describe("ff backup", () => {
  it("validates the league and renders the status", async () => {
    const output = await backupCommand(fixtureSession().session, repo(true));
    expect(output).toContain("Private repository backup status");
    expect(output).toContain("Private backup: clean / synced.");
  });
});
