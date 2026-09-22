import { describe, expect, it } from "vitest";
import { formatHarvestFigure } from "./harvestCopy.js";

describe("formatHarvestFigure", () => {
  it("shows the raw sum when it beats the floor", () => {
    expect(
      formatHarvestFigure({ base: 8, others: 1, eventSum: 2, raw: 9, floor: 3, gain: 9 }),
    ).toBe("+9 (8+2-1 = 9)");
  });

  it("shows the floor when the raw sum undershoots", () => {
    expect(
      formatHarvestFigure({ base: 8, others: 3, eventSum: -4, raw: 1, floor: 3, gain: 3 }),
    ).toBe("+3 (8-4-3 < 3)");
  });
});
