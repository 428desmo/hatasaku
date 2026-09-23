import { describe, expect, it } from "vitest";
import {
  buildSeasonIntroAnnounce,
  formatSeasonIntroText,
  joinPlayerNames,
} from "./seasonIntro.js";

describe("joinPlayerNames", () => {
  it("joins in Japanese", () => {
    expect(joinPlayerNames(["A"])).toBe("A");
    expect(joinPlayerNames(["A", "B"])).toBe("AとB");
    expect(joinPlayerNames(["A", "B", "C"])).toBe("A、BとC");
  });
});

describe("buildSeasonIntroAnnounce", () => {
  it("announces the four crops", () => {
    const a = buildSeasonIntroAnnounce({
      cropIds: ["radish", "komatsuna", "potato", "corn"],
      playerNames: ["Alice", "Bob", "CPU1"],
      curseReadySeats: [],
      multiSeason: false,
    });
    expect(a.cropLead).toContain("4種類");
    expect(a.cropNames).toEqual(["ラディッシュ", "コマツナ", "ジャガイモ", "トウモロコシ"]);
    expect(a.curse).toBeNull();
  });

  it("adds curse copy only for multi-season holders", () => {
    const none = buildSeasonIntroAnnounce({
      cropIds: ["radish", "komatsuna", "potato", "corn"],
      playerNames: ["Alice", "Bob", "Carol"],
      curseReadySeats: [2],
      multiSeason: false,
    });
    expect(none.curse).toBeNull();

    const yes = buildSeasonIntroAnnounce({
      cropIds: ["radish", "komatsuna", "potato", "corn"],
      playerNames: ["Alice", "Bob", "Carol"],
      curseReadySeats: [2],
      multiSeason: true,
    });
    expect(yes.curse?.recipientsLead).toBe("Carolが「呪い」の権利を得ました。");
    expect(yes.curse?.encouragement).toContain("頑張って");
    expect(yes.curse?.whatIs).toContain("作物から1種類");

    const text = formatSeasonIntroText(yes);
    expect(text).toContain("Carolが「呪い」の権利を得ました。");
    expect(text).toContain("・ラディッシュ");
  });
});
