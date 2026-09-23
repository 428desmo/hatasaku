import { describe, expect, it } from "vitest";
import { getPublicView } from "../engine/index.js";
import { passAllUntil, startForced } from "../engine/testkit.js";
import { clipEventWindow, describeBoardEvents } from "./eventCopy.js";

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
    expect(lines.harvestEvents[0]?.span).toBe("R1-2");
    expect(lines.harvestEvents[0]?.shortName).toBe("ラディ");
    expect(lines.harvestEvents[1]?.span).toBe("R2-3");
    expect(lines.previewEvents[0]?.span).toBe("R3-4");
    expect(lines.previewEvents[1]?.span).toBe("R4-5");
  });

  it("clips event spans that would run past the last round", () => {
    expect(clipEventWindow(18, 19, 18)).toEqual({ from: 18, to: 18, span: "R18" });
    expect(clipEventWindow(17, 18, 18)).toEqual({ from: 17, to: 18, span: "R17-18" });
    const { state } = startForced({
      mode: "advanced",
      crops: ["radish", "corn", "komatsuna", "asparagus"],
    });
    const left = state.event.row[0];
    state.round = 18;
    if (left) state.activatedRound[left.instanceId] = 18;
    const lines = describeBoardEvents(getPublicView(state, "spectator"));
    const now = lines.harvestEvents.find((e) => !e.lingering);
    expect(now?.span).toBe("R18");
    expect(now?.to).toBe(18);
    expect(lines.previewEvents.every((e) => e.from <= 18)).toBe(true);
  });
});
