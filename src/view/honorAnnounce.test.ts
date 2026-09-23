import { describe, expect, it } from "vitest";
import { buildHonorAnnounce, formatHonorAnnounceText } from "./honorAnnounce.js";

describe("buildHonorAnnounce", () => {
  it("announces season winners", () => {
    const a = buildHonorAnnounce({ kind: "season", winnerNames: ["Alice"] });
    expect(a?.lead).toContain("今シーズンが終了");
    expect(a?.award).toBe("Aliceが今シーズン1位です。おめでとうございます！");
  });

  it("announces match co-winners", () => {
    const a = buildHonorAnnounce({ kind: "match", winnerNames: ["Alice", "Bob"] });
    expect(a?.lead).toContain("マッチが終了");
    expect(a?.award).toBe("AliceとBobが総合優勝です。おめでとうございます！");
    expect(formatHonorAnnounceText(a!)).toContain("総合優勝");
  });

  it("returns null without winners", () => {
    expect(buildHonorAnnounce({ kind: "season", winnerNames: [] })).toBeNull();
  });
});
