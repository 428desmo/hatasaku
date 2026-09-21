import { describe, expect, it } from "vitest";
import { getPublicView } from "../engine/index.js";
import { startForced } from "../engine/testkit.js";
import { cropOutlook, harvestRoundsIfPlanted, plotIncomeOutlook } from "./outlook.js";
import { describePlot } from "./status.js";
import { formatPlayerHarvestTotal } from "./summary.js";

describe("harvestRoundsIfPlanted", () => {
  it("matches potato planted in round 3 of 10", () => {
    expect(harvestRoundsIfPlanted(3, 10, 2, 2)).toEqual([5, 6]);
  });

  it("reports a miss when first harvest is after the last round", () => {
    expect(harvestRoundsIfPlanted(7, 10, 4, 2)).toEqual([]);
  });

  it("clips watermelon planted in round 6 of 10", () => {
    expect(harvestRoundsIfPlanted(6, 10, 4, 2)).toEqual([10]);
  });
});

describe("cropOutlook", () => {
  it("says potato planted now in R3 harvests fully on R5-R6", () => {
    const { state } = startForced({
      mode: "tutorial",
      crops: ["potato", "corn", "onion", "pumpkin"],
    });
    state.round = 3;
    const look = cropOutlook(getPublicView(state, "spectator"), "potato");
    expect(look.harvestKind).toBe("full");
    expect(look.harvestOutlook).toContain("通常どおり2回");
    expect(look.harvestOutlook).toContain("ラウンド5〜6");
  });

  it("warns when watermelon cannot finish before game end", () => {
    const { state } = startForced({
      mode: "tutorial",
      crops: ["watermelon", "radish", "onion", "pumpkin"],
    });
    state.round = 7;
    const miss = cropOutlook(getPublicView(state, "spectator"), "watermelon");
    expect(miss.harvestKind).toBe("missed");
    expect(miss.harvestOutlook).toContain("間に合わない");
    expect(miss.harvestOutlook).toContain("初収穫はラウンド11");

    state.round = 6;
    const limited = cropOutlook(getPublicView(state, "spectator"), "watermelon");
    expect(limited.harvestKind).toBe("limited");
    expect(limited.harvestOutlook).toContain("1/2回");
    expect(limited.harvestOutlook).toContain("ラウンド10のみ");
    expect(limited.harvestOutlook).toContain("通常より1回少ない");
  });

  it("projects visible events onto future harvest rounds", () => {
    const { state } = startForced({
      mode: "tutorial",
      crops: ["potato", "onion", "corn", "pumpkin"],
      events: [
        { cropId: "potato", delta: 4 },
        { cropId: "potato", delta: 2 },
        { cropId: "onion", delta: -2 },
        { cropId: "onion", delta: -4 },
        { cropId: "corn", delta: 2 },
        { cropId: "corn", delta: -2 },
        { cropId: "pumpkin", delta: 4 },
        { cropId: "pumpkin", delta: -4 },
        { cropId: "potato", delta: -2 },
        { cropId: "onion", delta: 2 },
      ],
    });
    const look = cropOutlook(getPublicView(state, "spectator"), "potato");
    expect(look.harvestKind).toBe("full");
    expect(look.harvestOutlook).toContain("ラウンド3〜4");
    expect(look.eventTone).toBe("plus");
    const r3 = look.eventLines.find((l) => l.includes("ラウンド3"));
    const r4 = look.eventLines.find((l) => l.includes("ラウンド4"));
    expect(r3).toContain("ジャガイモ+2・R2〜R3");
    expect(r3).not.toContain("未公開");
    expect(r4).toContain("公開分なし");
    expect(r4).toContain("新規イベントは未公開");
  });
});

describe("planted plot outlook", () => {
  it("names the harvest round while waiting", () => {
    const { state } = startForced({
      mode: "tutorial",
      crops: ["sweetpotato", "radish", "onion", "corn"],
    });
    state.round = 2;
    const plot = state.players[0]!.plots[0]!;
    plot.owned = true;
    plot.cropCard = { instanceId: "sp", cropId: "sweetpotato" };
    plot.white = 3;
    plot.green = 0;
    plot.red = 0;
    const view = getPublicView(state, "spectator");
    const st = describePlot(view.players[0]!.plots[0]!, { view, seat: 0 });
    expect(st.status).toBe("待機中 — 収穫まであと3ラウンド（R5にて収穫）");
    expect(st.eventLines.some((l) => l.includes("ラウンド5"))).toBe(true);
  });

  it("includes event and same-crop competition", () => {
    const { state } = startForced({
      mode: "tutorial",
      crops: ["sweetpotato", "radish", "onion", "corn"],
      events: [
        { cropId: "onion", delta: 4 },
        { cropId: "onion", delta: 2 },
        { cropId: "sweetpotato", delta: -4 },
        { cropId: "radish", delta: 2 },
        { cropId: "radish", delta: -2 },
        { cropId: "corn", delta: 4 },
        { cropId: "corn", delta: -4 },
        { cropId: "onion", delta: -4 },
        { cropId: "sweetpotato", delta: 2 },
        { cropId: "onion", delta: -2 },
      ],
    });
    state.round = 2;
    for (const seat of [0, 1]) {
      const plot = state.players[seat]!.plots[0]!;
      plot.owned = true;
      plot.cropCard = { instanceId: `sp${seat}`, cropId: "sweetpotato" };
      plot.white = 3;
      plot.green = 0;
      plot.red = 0;
    }
    const view = getPublicView(state, "spectator");
    const line = plotIncomeOutlook(view, view.players[0]!.plots[0]!, 0).eventLines.find((l) =>
      l.includes("ラウンド5"),
    );
    expect(line).toContain("公開分-4（サツマイモ-4・R4〜R5）");
    expect(line).toContain("競合-1");
    expect(line).toContain("14G");
    expect(line).toContain("新規イベントは未公開");
  });

  it("treats a preview card's 2-round window as known, and later new events as unknown", () => {
    const { state } = startForced({
      mode: "tutorial",
      crops: ["pumpkin", "sweetpotato", "edamame", "komatsuna"],
      events: [
        { cropId: "edamame", delta: 4 },
        { cropId: "sweetpotato", delta: 4 },
        { cropId: "pumpkin", delta: 4 },
        { cropId: "komatsuna", delta: -2 },
        { cropId: "pumpkin", delta: -4 },
        { cropId: "edamame", delta: -2 },
        { cropId: "sweetpotato", delta: -2 },
        { cropId: "komatsuna", delta: 2 },
        { cropId: "edamame", delta: 2 },
        { cropId: "pumpkin", delta: 2 },
      ],
    });
    const look = cropOutlook(getPublicView(state, "spectator"), "pumpkin");
    expect(look.harvestOutlook).toContain("ラウンド5〜7");
    const r5 = look.eventLines.find((l) => l.includes("ラウンド5"));
    const r6 = look.eventLines.find((l) => l.includes("ラウンド6"));
    expect(r5).toContain("公開分なし");
    expect(r5).toContain("新規イベントは未公開");
    expect(r6).toContain("公開分なし");
    expect(r6).toContain("新規イベントは未公開");
  });
});

describe("formatPlayerHarvestTotal", () => {
  it("shows coins and the increment", () => {
    expect(formatPlayerHarvestTotal("プレイヤー1", 67, 11)).toBe("プレイヤー1  67G（+11G）");
    expect(formatPlayerHarvestTotal("CPU1", 9, 0)).toBe("CPU1  9G（+0G）");
    expect(formatPlayerHarvestTotal("CPU2", 8, 6, 3)).toBe("CPU2  8G（-3G、+6G）");
  });
});
