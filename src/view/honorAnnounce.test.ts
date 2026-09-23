import { describe, expect, it } from "vitest";
import { buildHonorAnnounce, formatHonorAnnounceText } from "./honorAnnounce.js";

describe("buildHonorAnnounce", () => {
  it("announces season winners with score", () => {
    const a = buildHonorAnnounce({ kind: "season", winnerNames: ["Alice"], winnerScore: 82 });
    expect(a?.lead).toContain("今シーズンが終了");
    expect(a?.award).toBe("Aliceが今シーズン1位です（82G）。おめでとうございます！");
  });

  it("splits match trail from ceremony", () => {
    const trail = buildHonorAnnounce({ kind: "match-trail", winnerNames: ["Alice"] });
    expect(trail?.lead).toContain("推移");
    expect(trail?.award).toBeNull();
    expect(formatHonorAnnounceText(trail!)).not.toContain("総合優勝");

    const match = buildHonorAnnounce({
      kind: "match",
      winnerNames: ["Alice", "Bob"],
      winnerScore: 200,
    });
    expect(match?.award).toBe("AliceとBobが総合優勝です（200G）。おめでとうございます！");
  });

  it("returns null without winners for season/match", () => {
    expect(buildHonorAnnounce({ kind: "season", winnerNames: [] })).toBeNull();
  });
});
