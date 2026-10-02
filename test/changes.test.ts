import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changesCommand } from "../src/changes.ts";
import { fixture, fixtureSession, mutated } from "./helpers.ts";

type RosterJson = { roster_id: number; players: string[]; reserve: string[] | null; settings: { wins: number; losses: number } };

describe("ff changes", () => {
  it("saves a baseline, then reports roster, record, and injury changes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ff-snap-"));
    const first = await changesCommand(fixtureSession().session, {}, dir);
    expect(first).toMatch(/baseline saved/);

    const original = fixture<RosterJson[]>("rosters");
    const moved = original[0]!.players.find((p) => !(original[0]!.reserve ?? []).includes(p))!;
    const rosters = mutated<RosterJson[]>("rosters", (rs) => {
      rs[0]!.players = rs[0]!.players.filter((p) => p !== moved);
      rs[1]!.players.push(moved);
      rs[2]!.settings.wins += 1;
    });
    const injured = original[3]!.players[0]!;
    const players = mutated<Record<string, { injury_status: string | null }>>("players", (ps) => {
      ps[injured]!.injury_status = ps[injured]!.injury_status === "Out" ? "Questionable" : "Out";
    });
    const out = await changesCommand(fixtureSession({ overrides: { rosters, players } }).session, {}, dir);
    expect(out).toMatch(/## Roster changes/);
    expect(out).toMatch(new RegExp(`manager01: −`));
    expect(out).toMatch(new RegExp(`manager02: \\+`));
    expect(out).toMatch(/record \d+-\d+ → \d+-\d+/);
    expect(out).toMatch(/## Injury status changes/);
  });

  it("reports no changes when nothing moved, and respects --no-write", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ff-snap-"));
    await changesCommand(fixtureSession().session, {}, dir);
    expect(await changesCommand(fixtureSession().session, { write: false }, dir)).toMatch(/No changes\./);
  });
});
