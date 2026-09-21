import { describe, expect, it } from "vitest";
import { Table } from "../session/table.js";
import { passAllUntil, plant, replaceMarket, startForced } from "../engine/testkit.js";
import { buildGameSummary, renderGameSummaryText } from "./endSummary.js";

describe("game summary", () => {
  it("keeps start coins and a snapshot for every round", () => {
    let { state: s, rng } = startForced({
      mode: "basic",
      crops: ["radish", "onion", "corn", "potato"],
    });
    const start = s.players.map((p) => p.coins);
    expect(s.startCoins).toEqual(start);
    expect(s.roundLog).toEqual([]);
    s = passAllUntil(s, rng, (x) => x.phase === "gameOver");
    expect(s.roundLog).toHaveLength(10);
    expect(s.roundLog.map((row) => row.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.roundLog[9]!.coins).toEqual(s.players.map((p) => p.coins));
    expect(s.startCoins).toEqual(start);
    const text = renderGameSummaryText(s);
    expect(text).toContain("開始");
    expect(text).toContain("R10");
    expect(text).toContain("植え");
    expect(text).toContain("未回収");
    for (const p of s.players) {
      expect(text).toContain(`${p.name}`);
    }
  });

  it("counts harvesting and owned land after a plant", () => {
    let { state: s, rng } = startForced({
      mode: "basic",
      crops: ["radish", "onion", "corn", "potato"],
    });
    const planter = s.turnOrder[0]!;
    s = replaceMarket(s, ["radish", "onion", "corn"]);
    s = plant(s, rng, { type: "plant", marketIndex: 0, target: "newLand" });
    s = passAllUntil(s, rng, (x) => x.round === 2 && x.turnIndex === 0);
    const r1 = s.roundLog[0];
    expect(r1?.owned[planter]).toBe(1);
    expect(r1?.harvesting[planter]).toBe(0);
    expect(r1?.planted[planter]).toBe(1);
    s = passAllUntil(s, rng, (x) => x.round === 3 && x.turnIndex === 0);
    expect(s.roundLog[1]?.harvesting[planter]).toBe(1);
  });

  it("lists players by final coins and marks waiting plots as leftover", () => {
    const table = new Table({
      mode: "basic",
      humanCount: 0,
      cpuCount: 3,
      cpuStrategyId: "irr",
      seed: "end-summary-order",
      seasonCount: 1,
    });
    const state = table.state!;
    expect(state.phase).toBe("gameOver");
    const summary = buildGameSummary(state);
    const coins = summary.players.map((p) => p.coins.at(-1) ?? 0);
    expect(coins).toEqual([...coins].sort((a, b) => b - a));
    expect(summary.winnerNames.length).toBeGreaterThan(0);
    const winner = summary.players.find((p) => p.winner);
    expect(winner?.coins.at(-1)).toBe(Math.max(...coins));
    expect(summary.players.reduce((n, p) => n + p.planted + p.passed, 0)).toBe(30);
    const waiting = state.players[0]!;
    waiting.plots[0] = {
      index: 0,
      owned: true,
      cropCard: { instanceId: "left", cropId: "radish" },
      white: 2,
      green: 0,
      red: 0,
    };
    expect(buildGameSummary(state).players.find((p) => p.seat === 0)?.leftover).toBe(1);
  });
});
