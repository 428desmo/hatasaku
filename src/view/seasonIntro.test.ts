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

  it("adds short or full curse copy", () => {
    const none = buildSeasonIntroAnnounce({
      cropIds: ["radish", "komatsuna", "potato", "corn"],
      playerNames: ["Alice", "Bob", "Carol"],
      curseReadySeats: [2],
      multiSeason: false,
    });
    expect(none.curse).toBeNull();

    const full = buildSeasonIntroAnnounce({
      cropIds: ["radish", "komatsuna", "potato", "corn"],
      playerNames: ["Alice", "Bob", "Carol"],
      curseReadySeats: [2],
      multiSeason: true,
      curseDetail: "full",
    });
    expect(full.curse?.detail).toBe("full");
    expect(full.curse?.encouragement).toContain("［呪い］");
    expect(formatSeasonIntroText(full)).toContain("作物から1種類");

    const short = buildSeasonIntroAnnounce({
      cropIds: ["radish", "komatsuna", "potato", "corn"],
      playerNames: ["Alice", "Bob", "Carol"],
      curseReadySeats: [2],
      multiSeason: true,
      curseDetail: "short",
    });
    expect(short.curse?.detail).toBe("short");
    expect(formatSeasonIntroText(short)).not.toContain("作物から1種類");
    expect(formatSeasonIntroText(short)).toContain("［呪い］");
  });
});
