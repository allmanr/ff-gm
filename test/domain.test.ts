import { describe, expect, it } from "vitest";
import { derivePickOwnership, rosterPoints, standingsOrder, weeklyPlayerPoints } from "../src/domain.ts";
import { MatchupsSchema, RostersSchema, TradedPicksSchema, type PickRef } from "../src/sleeper/schemas.ts";
import { fixture } from "./helpers.ts";

const rosters = RostersSchema.parse(fixture("rosters"));
const drafts = fixture<{ draft_id: string; season: string; status: string; type: string }[]>("drafts");

describe("future pick ownership", () => {
  it("gives every roster its own picks, then applies trades", () => {
    const traded: PickRef[] = [
      { season: "2027", round: 1, roster_id: 2, owner_id: 5, previous_owner_id: 2 },
      { season: "2028", round: 3, roster_id: 5, owner_id: 2, previous_owner_id: 5 },
    ];
    const { seasons, picks } = derivePickOwnership({ leagueSeason: "2026", rounds: 4, rosters, tradedPicks: traded, drafts });
    expect(seasons).toEqual(["2027", "2028"]);
    expect(picks).toHaveLength(12 * 4 * 2);
    const owner = (s: string, r: number, orig: number) =>
      picks.find((p) => p.season === s && p.round === r && p.originalRosterId === orig)?.ownerRosterId;
    expect(owner("2027", 1, 2)).toBe(5);
    expect(owner("2028", 3, 5)).toBe(2);
    expect(owner("2027", 2, 2)).toBe(2);
  });

  it("ignores already-drafted seasons and keeps the total constant", () => {
    const traded = TradedPicksSchema.parse(fixture("traded_picks"));
    expect(traded.some((p) => p.season === "2026")).toBe(true);
    const { seasons, picks } = derivePickOwnership({ leagueSeason: "2026", rounds: 4, rosters, tradedPicks: traded, drafts });
    expect(seasons[0]).toBe("2027");
    expect(picks).toHaveLength(12 * 4 * seasons.length);
  });

  it("includes the current season when its rookie draft has not happened", () => {
    const pending = drafts.map((d) => ({ ...d, status: "pre_draft" }));
    const { seasons } = derivePickOwnership({ leagueSeason: "2026", rounds: 4, rosters, tradedPicks: [], drafts: pending });
    expect(seasons).toEqual(["2026"]);
  });

  it("treats a pick traded back to its original team as owned by that team", () => {
    const back: PickRef[] = [{ season: "2027", round: 2, roster_id: 4, owner_id: 4, previous_owner_id: 7 }];
    const { picks } = derivePickOwnership({ leagueSeason: "2026", rounds: 4, rosters, tradedPicks: back, drafts });
    expect(picks.find((p) => p.season === "2027" && p.round === 2 && p.originalRosterId === 4)?.ownerRosterId).toBe(4);
  });
});

describe("points", () => {
  it("reads league-scored player points and starter flags from matchups", () => {
    const m = MatchupsSchema.parse(fixture("matchups_3"));
    const points = weeklyPlayerPoints([{ week: 3, matchups: m }]);
    const first = m[0]!;
    const starter = first.starters.find((s) => s !== "0")!;
    expect(points.get(starter)?.get(3)).toEqual({
      points: first.players_points[starter],
      rosterId: first.roster_id,
      started: true,
    });
  });

  it("combines whole and decimal points fields", () => {
    const r = rosters[0]!;
    const { pf } = rosterPoints(r);
    expect(pf).toBeCloseTo((r.settings.fpts ?? 0) + (r.settings.fpts_decimal ?? 0) / 100, 5);
  });

  it("orders standings by wins then points for", () => {
    const order = standingsOrder(rosters);
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1]!.settings;
      const b = order[i]!.settings;
      expect(a.wins + a.ties / 2).toBeGreaterThanOrEqual(b.wins + b.ties / 2);
    }
  });
});
