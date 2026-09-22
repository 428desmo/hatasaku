import { describe, expect, it } from "vitest";
import { formatHarvestFigure } from "./harvestCopy.js";

describe("formatHarvestFigure", () => {
  it("marks a net bonus with up triangles", () => {
    expect(
      formatHarvestFigure({ base: 8, others: 1, eventSum: 2, raw: 9, floor: 3, gain: 9 }),
    ).toEqual({ text: "9 △", tone: "up" });
  });

  it("marks a net penalty with down triangles", () => {
    expect(
      formatHarvestFigure({ base: 11, others: 1, eventSum: -4, raw: 6, floor: 5, gain: 6 }),
    ).toEqual({ text: "6▼▼▼▼▼", tone: "down" });
  });

  it("marks the floor with a sad face", () => {
    expect(
      formatHarvestFigure({ base: 11, others: 3, eventSum: -4, raw: 4, floor: 5, gain: 5 }),
    ).toEqual({ text: "5😞", tone: "floor" });
  });
});
