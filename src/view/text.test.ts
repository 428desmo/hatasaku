import { describe, expect, it } from "vitest";
import { getPublicView } from "../engine/index.js";
import { startForced } from "../engine/testkit.js";
import { toPresentation } from "./presentation.js";
import { describePlot } from "./status.js";
import {
  formatHarvestLine,
  formatPlayerHarvestTotal,
  renderActionSummaryText,
  renderRoundResultText,
} from "./summary.js";
import { renderText } from "./text.js";
import { cropSpec } from "../engine/catalog.js";

describe("status copy", () => {
  it("uses cooldown wording instead of 赤n", () => {
    const st = describePlot({
      index: 1,
      owned: true,
      cropId: "potato",
      white: 0,
      green: 0,
      red: 3,
    });
    expect(st.status).toBe("クールダウン、あと3ラウンド");
    expect(st.kind).toBe("cooldown");
    expect(st.spec).toContain("栽培2G");
  });

  it("uses wait and harvest wording instead of 白/緑", () => {
    expect(
      describePlot({
        index: 0,
        owned: true,
        cropId: "potato",
        white: 2,
        green: 0,
        red: 0,
      }).status,
    ).toBe("待機中 — 収穫まであと2ラウンド");
    expect(
      describePlot({
        index: 0,
        owned: true,
        cropId: "potato",
        white: 0,
        green: 1,
        red: 0,
      }).status,
    ).toBe("収穫中 — あと1ラウンド収入がある");
  });

  it("prints crop specs on the board", () => {
    const { state } = startForced({
      mode: "basic",
      crops: ["potato", "corn", "onion", "pumpkin"],
    });
    const you = state.actingSeat!;
    const text = renderText(toPresentation(getPublicView(state, you), you));
    expect(text).toContain("今ゲームの作物");
    expect(text).toContain(cropSpec("potato").slice(0, 8));
    expect(text).toContain("場札:");
    expect(text).toContain("今から植えると");
    expect(text).toContain("イベント見込み");
    expect(text).toContain("収穫イベント");
    expect(text).toContain("予告");
    expect(text).not.toContain("発動中");
    expect(text).not.toContain("白");
    expect(text).not.toMatch(/赤\d/);
  });

  it("lists players in turn order, not seat number", () => {
    const { state } = startForced({
      mode: "basic",
      crops: ["potato", "corn", "onion", "pumpkin"],
    });
    state.turnOrder = [1, 2, 0];
    state.actingSeat = 1;
    state.turnIndex = 0;
    const board = toPresentation(getPublicView(state, 1), 1);
    expect(board.players.map((p) => p.seat)).toEqual([1, 2, 0]);
    expect(board.players[0]?.isActing).toBe(true);
  });
});

describe("summaries", () => {
  it("formats a harvest line with event", () => {
    const { state } = startForced({
      mode: "basic",
      crops: ["corn", "onion", "potato", "pumpkin"],
    });
    const line = formatHarvestLine(state, {
      seat: 0,
      plotIndex: 0,
      cropId: "corn",
      base: 10,
      others: 3,
      eventSum: -4,
      events: [{ cropId: "corn", delta: -4 }],
      raw: 3,
      floor: 4,
      gain: 4,
    });
    expect(line).toContain("トウモロコシ");
    expect(line).toContain("イベント-4");
    expect(line).toContain("最低保証");
    expect(line).toContain("→ +3G");
    expect(line).toContain("最低保証で +4G");
  });

  it("prints player totals with spend and harvest", () => {
    expect(formatPlayerHarvestTotal("プレイヤー1", 67, 11)).toBe("プレイヤー1  67G（+11G）");
    expect(formatPlayerHarvestTotal("CPU1", 2, 0, 3)).toBe("CPU1  2G（-3G、+0G）");
    expect(formatPlayerHarvestTotal("CPU2", 8, 6, 3)).toBe("CPU2  8G（-3G、+6G）");
  });

  it("lists recorded actions", () => {
    const { state } = startForced({
      mode: "basic",
      crops: ["radish", "onion", "corn", "potato"],
    });
    state.roundActions = [
      { seat: 0, kind: "plant", cropId: "radish", plotIndex: 0, newLand: true, cost: 1 },
      { seat: 1, kind: "pass" },
    ];
    const text = renderActionSummaryText(state);
    expect(text).toContain("ラディッシュを新しい農地1に植えた（-1G）");
    expect(text).toContain("パス");
  });

  it("combines turn, harvest, and coins into one round result", () => {
    const { state } = startForced({
      mode: "basic",
      crops: ["radish", "onion", "corn", "potato"],
    });
    state.round = 6;
    state.turnOrder = [1, 2, 0];
    state.players[0]!.name = "プレイヤー1";
    state.players[1]!.name = "CPU1";
    state.players[2]!.name = "CPU2";
    state.roundActions = [
      { seat: 1, kind: "plant", cropId: "komatsuna", plotIndex: 2, newLand: true, cost: 3 },
      { seat: 2, kind: "plant", cropId: "sweetpotato", plotIndex: 2, newLand: true, cost: 5 },
      { seat: 0, kind: "plant", cropId: "pumpkin", plotIndex: 0, newLand: false, cost: 3 },
    ];
    state.lastHarvest = [
      {
        seat: 0,
        plotIndex: 1,
        cropId: "pumpkin",
        base: 11,
        others: 1,
        eventSum: 0,
        events: [],
        raw: 10,
        floor: 4,
        gain: 10,
      },
    ];
    state.lastPayouts = [10, 21, 22];
    state.players[0]!.coins = 30;
    state.players[1]!.coins = 29;
    state.players[2]!.coins = 34;
    const text = renderRoundResultText(state);
    expect(text).toContain("ラウンド6 の結果");
    expect(text).toContain("手番");
    expect(text.indexOf("手番")).toBeLessThan(text.indexOf("収穫"));
    expect(text.indexOf("収穫")).toBeLessThan(text.indexOf("所持コイン"));
    expect(text).toContain("CPU1: コマツナを新しい農地3に植えた（-3G）");
    expect(text).toContain("プレイヤー1 農地2 カボチャ");
    expect(text).toContain("→ +10G");
    const p1 = text.indexOf("CPU1  29G（-3G、+21G）");
    const p2 = text.indexOf("CPU2  34G（-5G、+22G）");
    const human = text.indexOf("プレイヤー1  30G（-3G、+10G）");
    expect(p1).toBeGreaterThan(-1);
    expect(p2).toBeGreaterThan(p1);
    expect(human).toBeGreaterThan(p2);
  });

  it("shows spend only for the planter on the coin line", () => {
    const { state } = startForced({
      mode: "basic",
      crops: ["komatsuna", "onion", "corn", "potato"],
    });
    state.round = 3;
    state.turnOrder = [0, 1, 2];
    state.players[0]!.name = "プレイヤー1";
    state.players[1]!.name = "CPU1";
    state.players[2]!.name = "CPU2";
    state.roundActions = [
      { seat: 0, kind: "pass" },
      { seat: 1, kind: "pass" },
      { seat: 2, kind: "plant", cropId: "komatsuna", plotIndex: 2, newLand: true, cost: 3 },
    ];
    state.lastHarvest = [
      {
        seat: 2,
        plotIndex: 1,
        cropId: "komatsuna",
        base: 6,
        others: 0,
        eventSum: 0,
        events: [],
        raw: 6,
        floor: 3,
        gain: 6,
      },
    ];
    state.lastPayouts = [0, 0, 6];
    state.players[0]!.coins = 1;
    state.players[1]!.coins = 2;
    state.players[2]!.coins = 8;
    const text = renderRoundResultText(state);
    expect(text).toContain("CPU2: コマツナを新しい農地3に植えた（-3G）");
    expect(text).toContain("CPU2 農地2 コマツナ: 基本6G、イベント効果なし → +6G");
    expect(text).toContain("プレイヤー1  1G（+0G）");
    expect(text).toContain("CPU1  2G（+0G）");
    expect(text).toContain("CPU2  8G（-3G、+6G）");
  });
});
