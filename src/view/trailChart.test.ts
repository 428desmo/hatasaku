import { describe, expect, it } from "vitest";
import {
  cumulativeTotals,
  deviationScores,
  pooledDeviationGrid,
  trailLayout,
} from "./trailChart.js";

describe("trail chart", () => {
  it("accumulates season totals", () => {
    expect(
      cumulativeTotals([
        [80, 70, 60],
        [20, 40, 90],
      ]),
    ).toEqual([
      [80, 70, 60],
      [100, 110, 150],
    ]);
  });

  it("maps a tied sample to 50", () => {
    expect(deviationScores([10, 10, 10])).toEqual([50, 50, 50]);
  });

  it("puts the pooled leader above 50", () => {
    const grid = pooledDeviationGrid([
      [80, 70, 60],
      [100, 110, 150],
    ]);
    expect(grid[1]![2]!).toBeGreaterThan(50);
    expect(grid[0]![2]!).toBeLessThan(50);
  });

  it("lays out one x per season", () => {
    const { series, seasons, xLabels } = trailLayout([
      [80, 70],
      [90, 90],
    ]);
    expect(seasons).toBe(2);
    expect(series).toHaveLength(2);
    expect(series[0]!.points).toHaveLength(2);
    expect(series[0]!.points[0]!.total).toBe(80);
    expect(series[0]!.points[1]!.total).toBe(170);
    expect(xLabels.map((x) => x.label)).toEqual(["S1", "S2"]);
  });
});
