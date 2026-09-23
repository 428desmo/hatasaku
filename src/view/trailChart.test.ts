import { describe, expect, it } from "vitest";
import {
  cumulativeTotals,
  deviationScores,
  seasonDeviationGrid,
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

  it("scores each season on its own so a later total is not automatically higher", () => {
    const grid = seasonDeviationGrid([
      [100, 50, 50, 50],
      [110, 140, 140, 140],
    ]);
    expect(grid[0]![0]!).toBeGreaterThan(50);
    expect(grid[0]![1]!).toBeLessThan(50);
    expect(grid[1]![0]!).toBeLessThan(50);
    expect(grid[1]![1]!).toBeGreaterThan(50);
    for (const row of grid) {
      const mean = row.reduce((sum, x) => sum + x, 0) / row.length;
      expect(mean).toBeCloseTo(50);
    }
    const { series } = trailLayout([
      [100, 50, 50, 50],
      [10, 90, 90, 90],
    ]);
    expect(series[0]!.points[0]!.t).toBeGreaterThan(50);
    expect(series[0]!.points[1]!.t).toBeLessThan(50);
    expect(series[0]!.points[1]!.y).toBeGreaterThan(series[0]!.points[0]!.y);
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
