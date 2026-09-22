import { describe, expect, it } from "vitest";
import { previousSeasonLeaders, topSeats } from "./standings.js";

describe("standings", () => {
  it("marks every seat tied at the top", () => {
    expect(topSeats([12, 20, 20])).toEqual([1, 2]);
    expect(topSeats([])).toEqual([]);
  });

  it("has no crown before season 2", () => {
    expect(previousSeasonLeaders([[90, 80, 70]], 1, 3)).toEqual([]);
    expect(previousSeasonLeaders([], 1, 3)).toEqual([]);
  });

  it("crowns previous-season totals and ignores the current season row", () => {
    const sheet = [
      [80, 90, 70],
      [100, 40, 90],
    ];
    expect(previousSeasonLeaders(sheet, 2, 3)).toEqual([1]);
    expect(previousSeasonLeaders(sheet, 3, 3)).toEqual([0]);
  });
});
