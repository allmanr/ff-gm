import { closeSync, constants, lstatSync, mkdirSync, openSync, writeFileSync } from "node:fs";

/** Reject symlinks, including dangling links, before host-side private writes. */
export function assertPrivatePath(path: string, directory: boolean): void {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error(`Refusing non-${directory ? "directory" : "file"} or symlink: ${path}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
export function safeDirectory(path: string): void {
  assertPrivatePath(path, true);
  mkdirSync(path, { recursive: true });
}
export function safeWrite(path: string, content: string): void {
  assertPrivatePath(path, false);
  // O_NOFOLLOW also closes a check/open race on the final path component.
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, content); } finally { closeSync(fd); }
}
