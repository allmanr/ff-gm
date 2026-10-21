import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { header } from "./format.ts";
import type { Session } from "./session.ts";

export type BackupState = "clean_synced" | "dirty" | "ahead" | "unavailable";

export interface BackupStatus {
  state: BackupState;
  uncommitted: number;
  ahead: number | null;
  summary: string;
  backupCommand?: string;
}

export const MANUAL_BACKUP_COMMAND = 'git -C private add -A && git -C private commit -m "..." && git -C private push';

const defaultPrivateDir = () => resolve(process.env.FF_PRIVATE_DIR || join(dirname(fileURLToPath(import.meta.url)), "../private"));

const git = (dir: string, ...args: string[]): string | null => {
  const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout.trim() : null;
};

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * Read-only backup state of the private Git repository. Counts only: never file names, paths, or diffs.
 * No fetch, commit, push, or remote changes; "ahead" is measured against the last-known remote-tracking ref.
 */
export function checkBackupStatus(repoDir = defaultPrivateDir()): BackupStatus {
  const unavailable = (why: string, uncommitted = 0): BackupStatus => ({
    state: "unavailable",
    uncommitted,
    ahead: null,
    summary: `Private backup unavailable: ${why}`,
    backupCommand: MANUAL_BACKUP_COMMAND,
  });
  // The private directory sits inside the public checkout: require it to be its own repository root.
  const top = existsSync(repoDir) ? git(repoDir, "rev-parse", "--show-toplevel") : null;
  if (top === null || realpathSync(top) !== realpathSync(repoDir)) return unavailable("not a Git repository");
  const porcelain = git(repoDir, "status", "--porcelain");
  if (porcelain === null) return unavailable("git status failed");
  const uncommitted = porcelain ? porcelain.split("\n").length : 0;
  const ahead = git(repoDir, "rev-parse", "--abbrev-ref", "@{u}") === null ? null : Number(git(repoDir, "rev-list", "--count", "@{u}..HEAD") ?? NaN);
  if (ahead === null || Number.isNaN(ahead)) {
    return unavailable(`no remote tracking branch, ${uncommitted ? count(uncommitted, "uncommitted change") : "working tree clean"}`, uncommitted);
  }
  if (!uncommitted && !ahead) return { state: "clean_synced", uncommitted, ahead, summary: "Private backup: clean / synced" };
  const parts = [ahead ? count(ahead, "unpushed commit") : "", uncommitted ? count(uncommitted, "uncommitted change") : "working tree clean"];
  return {
    state: uncommitted ? "dirty" : "ahead",
    uncommitted,
    ahead,
    summary: `Private backup: ${parts.filter(Boolean).join(", ")}`,
    backupCommand: MANUAL_BACKUP_COMMAND,
  };
}

export function formatBackupSummary(status: BackupStatus): string {
  return status.backupCommand ? `${status.summary}.\nManual backup command:\n  ${status.backupCommand}` : `${status.summary}.`;
}

export async function backupCommand(session: Session, privateDir = defaultPrivateDir()): Promise<string> {
  const { ctx } = await session.data();
  return [header(ctx, "Private repository backup status"), "", formatBackupSummary(checkBackupStatus(privateDir))].join("\n");
}
