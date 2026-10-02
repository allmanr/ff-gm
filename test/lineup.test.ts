import { describe, expect, it } from "vitest";
import { optimalLineup, type Candidate, type Slot } from "../src/lineup.ts";

const slot = (s: string, eligible: string[]): Slot => ({ slot: s, eligible });
const SF_LEAGUE = [
  slot("QB", ["QB"]),
  slot("RB", ["RB"]),
  slot("RB", ["RB"]),
  slot("WR", ["WR"]),
  slot("WR", ["WR"]),
  slot("TE", ["TE"]),
  slot("FLEX", ["RB", "WR", "TE"]),
  slot("FLEX", ["RB", "WR", "TE"]),
  slot("SUPER_FLEX", ["QB", "RB", "WR", "TE"]),
];

/** Exhaustive search, for checking the optimizer on small cases. */
function bruteForce(slots: Slot[], cands: Candidate[]): number {
  let best = 0;
  const used = new Set<string>();
  const go = (i: number, sum: number) => {
    if (i === slots.length) {
      best = Math.max(best, sum);
      return;
    }
    go(i + 1, sum); // leave empty
    for (const c of cands) {
      if (used.has(c.id) || !slots[i]!.eligible.includes(c.position)) continue;
      used.add(c.id);
      go(i + 1, sum + c.points);
      used.delete(c.id);
    }
  };
  go(0, 0);
  return best;
}

describe("optimalLineup", () => {
  it("puts the second QB in SUPER_FLEX when he outscores the best flex option", () => {
    const cands: Candidate[] = [
      { id: "qb1", position: "QB", points: 25 },
      { id: "qb2", position: "QB", points: 18 },
      { id: "rb1", position: "RB", points: 20 },
      { id: "rb2", position: "RB", points: 15 },
      { id: "rb3", position: "RB", points: 12 },
      { id: "wr1", position: "WR", points: 22 },
      { id: "wr2", position: "WR", points: 14 },
      { id: "wr3", position: "WR", points: 10 },
      { id: "te1", position: "TE", points: 11 },
      { id: "te2", position: "TE", points: 9 },
    ];
    const { lineup, total } = optimalLineup(SF_LEAGUE, cands);
    expect(lineup.find((x) => x.slot === "SUPER_FLEX")!.id).toBe("qb2");
    expect(total).toBe(25 + 20 + 15 + 22 + 14 + 11 + 12 + 10 + 18);
  });

  it("is exact where greedy fails (overlapping, non-nested flex slots)", () => {
    // Filling REC_FLEX greedily takes the WR (10) and leaves only the RB (1) for WRRB_FLEX: 11.
    // The optimum puts the TE in REC_FLEX and the WR in WRRB_FLEX: 19.
    const slots = [slot("REC_FLEX", ["WR", "TE"]), slot("WRRB_FLEX", ["RB", "WR"])];
    const cands: Candidate[] = [
      { id: "wr", position: "WR", points: 10 },
      { id: "te", position: "TE", points: 9 },
      { id: "rb", position: "RB", points: 1 },
    ];
    const { total, lineup } = optimalLineup(slots, cands);
    expect(total).toBe(19); // TE in REC_FLEX, WR in WRRB_FLEX
    expect(lineup.map((x) => x.id)).toEqual(["te", "wr"]);
  });

  it("leaves a slot empty when nobody is eligible and never reuses a player", () => {
    const { lineup, total } = optimalLineup(SF_LEAGUE, [{ id: "qb", position: "QB", points: 20 }]);
    expect(total).toBe(20);
    expect(lineup.filter((x) => x.id === "qb")).toHaveLength(1);
    expect(lineup.filter((x) => x.id === null)).toHaveLength(8);
  });

  it("matches brute force on random rosters", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const positions = ["QB", "RB", "WR", "TE"];
    const slots = [slot("QB", ["QB"]), slot("RB", ["RB"]), slot("WR", ["WR"]), slot("FLEX", ["RB", "WR", "TE"]), slot("SF", positions)];
    for (let t = 0; t < 40; t++) {
      const cands = Array.from({ length: 7 }, (_, i) => ({
        id: `p${i}`,
        position: positions[Math.floor(rand() * 4)]!,
        points: Math.round(rand() * 300) / 10,
      }));
      expect(optimalLineup(slots, cands).total).toBeCloseTo(bruteForce(slots, cands), 6);
    }
  });
});

describe("ff bench", () => {
  it("never reports a best lineup below the actual one", async () => {
    const { fixtureSession } = await import("./helpers.ts");
    const { benchCommand } = await import("../src/bench.ts");
    const { session } = fixtureSession();
    for (const who of ["1", "5", "me"]) {
      const out = await benchCommand(session, who, { week: 3 });
      const [, actual, best] = out.match(/Actual ([\d.]+) · best possible ([\d.]+)/)!;
      expect(Number(best)).toBeGreaterThanOrEqual(Number(actual));
    }
    expect(await benchCommand(session, undefined, { league: true })).toMatch(/Efficiency/);
  });
});
