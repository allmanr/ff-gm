import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { historyCommand } from "../src/history.ts";
import { createSession } from "../src/session.ts";
import { createSleeperClient } from "../src/sleeper/client.ts";
import { fixture, fixtureFetch, fixtureOwner } from "./helpers.ts";

const PREVIOUS = "1195864273843142656";

function historySession(cacheDir: string) {
  const base = fixtureFetch();
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    if (url.endsWith(`/league/${PREVIOUS}`)) {
      return Response.json({ ...fixture<object>("league"), league_id: PREVIOUS, season: "2025", status: "complete", previous_league_id: null });
    }
    return base.fetch(url);
  };
  const session = createSession({ client: createSleeperClient({ fetch, retries: 0 }), owner: fixtureOwner(), cacheDir });
  return { session, calls };
}

describe("ff history", () => {
  it("follows previous_league_id, tallies managers, and caches completed seasons", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "ff-history-"));
    const first = historySession(cacheDir);
    const out = await historyCommand(first.session, undefined, {});
    expect(out).toMatch(/Trade history \(2026, 2025\)/);
    expect(out).toMatch(/## 2025: \d+ trades?/);
    expect(out).toMatch(/Manager\s+Trades\s+Picks in\/out/);
    expect(readdirSync(cacheDir)).toContain(`history-${PREVIOUS}.json`);

    const second = historySession(cacheDir);
    await historyCommand(second.session, undefined, {});
    expect(second.calls.filter((c) => c.includes(`/league/${PREVIOUS}/transactions`))).toHaveLength(0);
  });

  it("filters to one manager", async () => {
    const { session } = historySession(mkdtempSync(join(tmpdir(), "ff-history-")));
    const out = await historyCommand(session, "manager02", {});
    const rows = out.split("\n").filter((l) => /^manager\d\d/.test(l));
    expect(rows.every((l) => l.startsWith("manager02"))).toBe(true);
  });
});
