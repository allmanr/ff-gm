import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contextCommand } from "../src/commands.ts";
import { paths } from "../src/config.ts";
import { safeWrite } from "../src/private-files.ts";
import { fixtureSession } from "./helpers.ts";

const originalPrivate = paths.privateDir;
const temporary: string[] = [];
afterEach(() => {
  paths.privateDir = originalPrivate;
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "ff-private-writes-"));
  temporary.push(dir);
  paths.privateDir = dir;
  return dir;
}

describe("private validation output", () => {
  it.each(["LEAGUE_CONSTITUTION.md", "context.json"])("refuses %s symlinks without overwriting the target or promoting partial output", async (name) => {
    const dir = setup();
    const target = join(dir, "trusted-charter.md");
    writeFileSync(target, "Trusted original");
    symlinkSync(target, join(dir, name));
    await expect(contextCommand(fixtureSession().session, {})).rejects.toThrow("symlink");
    expect(readFileSync(target, "utf8")).toBe("Trusted original");
    const other = name === "context.json" ? "LEAGUE_CONSTITUTION.md" : "context.json";
    expect(existsSync(join(dir, other))).toBe(false);
  });
  it("refuses dangling symlinks as well as existing targets", () => {
    const dir = setup();
    const target = join(dir, "missing.md");
    symlinkSync(target, join(dir, "linked.md"));
    expect(() => safeWrite(join(dir, "linked.md"), "external data")).toThrow("symlink");
    expect(existsSync(target)).toBe(false);
  });
  it("writes only validated fixture context and supports read-only rendering", async () => {
    const dir = setup();
    const session = fixtureSession().session;
    await contextCommand(session, { write: false });
    expect(existsSync(join(dir, "context.json"))).toBe(false);
    const rendered = await contextCommand(session, {});
    expect(readFileSync(join(dir, "LEAGUE_CONSTITUTION.md"), "utf8")).toBe(rendered);
    expect(JSON.parse(readFileSync(join(dir, "context.json"), "utf8"))).toMatchObject({ sourceHash: (await session.data()).ctx.sourceHash });
  });
});
