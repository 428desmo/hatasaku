import { describe, expect, it } from "vitest";
import { getPublicView } from "../engine/index.js";
import { passAllUntil, startForced } from "../engine/testkit.js";
import { describeBoardEvents } from "./eventCopy.js";

describe("describeBoardEvents", () => {
  it("treats the leftmost card as this round's harvest event", () => {
    const { state } = startForced({
      mode: "basic",
      crops: ["radish", "corn", "komatsuna", "onion"],
      events: [
        { cropId: "radish", delta: 4 },
        { cropId: "corn", delta: -4 },
        { cropId: "corn", delta: 2 },
        { cropId: "komatsuna", delta: -2 },
        { cropId: "onion", delta: 4 },
        { cropId: "onion", delta: -4 },
        { cropId: "radish", delta: 2 },
        { cropId: "radish", delta: -2 },
        { cropId: "corn", delta: 4 },
        { cropId: "komatsuna", delta: 2 },
      ],
    });
    const lines = describeBoardEvents(getPublicView(state, "spectator"));
    expect(lines.harvestLine).toBe("R1 収穫イベント: ラディッシュ +4（R1〜R2）");
    expect(lines.previewLine).toBe(
      "予告（各2ラウンド有効）: R2 トウモロコシ -4（R2〜R3）　R3 トウモロコシ +2（R3〜R4）",
    );
  });

  it("moves the previous left card to lingering on round 2", () => {
    let { state, rng } = startForced({
      mode: "basic",
      crops: ["radish", "corn", "komatsuna", "onion"],
      events: [
        { cropId: "radish", delta: 4 },
        { cropId: "corn", delta: -4 },
        { cropId: "corn", delta: 2 },
        { cropId: "komatsuna", delta: -2 },
        { cropId: "onion", delta: 4 },
        { cropId: "onion", delta: -4 },
        { cropId: "radish", delta: 2 },
        { cropId: "radish", delta: -2 },
        { cropId: "corn", delta: 4 },
        { cropId: "komatsuna", delta: 2 },
      ],
    });
    state = passAllUntil(state, rng, (s) => s.round === 2 && s.turnIndex === 0);
    const lines = describeBoardEvents(getPublicView(state, "spectator"));
    expect(lines.harvestLine).toContain("R2 収穫イベント:");
    expect(lines.harvestLine).toContain("ラディッシュ +4（継続・R1〜R2）");
    expect(lines.harvestLine).toContain("トウモロコシ -4（R2〜R3）");
    expect(lines.previewLine).toContain("R3 トウモロコシ +2（R3〜R4）");
    expect(lines.previewLine).toContain("R4 コマツナ -2（R4〜R5）");
    expect(lines.previewLine).not.toContain("R5 ネギ");
  });
});
