import { describe, expect, it } from "vitest";
import {
  applyAction,
  applyIncome,
  createGame,
  createRng,
  effectiveEvents,
  harvestIncome,
  listLegalActions,
} from "./index.js";
import {
  onionEvents,
  passAllUntil,
  plant,
  replaceMarket,
  startForced,
} from "./testkit.js";
import { cloneState, type GameState } from "./types.js";

function plot(s: GameState, seat: number, i = 0) {
  return s.players[seat]!.plots[i]!;
}

function coinsByTurnOrder(s: GameState): number[] {
  return s.turnOrder.map((seat) => s.players[seat]!.coins);
}

describe("accept 1 potato lifecycle", () => {
  it("harvests R5-R6, other crop from R7, potato from R11", () => {
    let { state: s, rng } = startForced({
      mode: "advanced",
      crops: ["potato", "corn", "onion", "pumpkin"],
      events: onionEvents(16),
    });
    const planter = s.turnOrder[0]!;
    s = passAllUntil(s, rng, (x) => x.round === 3 && x.actingSeat === planter);
    s = replaceMarket(s, ["potato", "onion", "radish"]);
    const before = s.players[planter]!.coins;
    s = plant(s, rng, { type: "plant", marketIndex: 0, target: "newLand" });
    expect(s.players[planter]!.coins).toBe(before - 2);
    expect(plot(s, planter).white).toBe(2);

    s = passAllUntil(s, rng, (x) => x.round === 5 && x.turnIndex === 0);
    expect(s.lastPayouts[planter]).toBe(0);
    expect(plot(s, planter).green).toBe(2);
    const c4 = s.players[planter]!.coins;

    s = passAllUntil(s, rng, (x) => x.round === 6 && x.turnIndex === 0);
    expect(s.players[planter]!.coins).toBe(c4 + 9);
    expect(plot(s, planter).green).toBe(1);

    s = passAllUntil(s, rng, (x) => x.round === 7 && x.turnIndex === 0);
    expect(s.players[planter]!.coins).toBe(c4 + 18);
    expect(plot(s, planter).green).toBe(0);
    expect(plot(s, planter).red).toBe(4);
    expect(plot(s, planter).owned).toBe(true);

    s = replaceMarket(s, ["onion", "potato", "corn"]);
    s = passAllUntil(s, rng, (x) => x.actingSeat === planter && x.round === 7);
    const legal7 = listLegalActions(s);
    expect(legal7.some((a) => a.type === "plant" && a.target !== "newLand" && a.target.plotIndex === 0 && a.marketIndex === 0)).toBe(true);
    expect(
      legal7.some(
        (a) =>
          a.type === "plant" &&
          a.target !== "newLand" &&
          a.target.plotIndex === 0 &&
          a.marketIndex === 1,
      ),
    ).toBe(false);

    s = passAllUntil(s, rng, (x) => x.round === 11 && x.actingSeat === planter);
    s = replaceMarket(s, ["potato", "onion", "corn"]);
    expect(plot(s, planter).red).toBe(0);
    expect(listLegalActions(s)).toContainEqual({
      type: "plant",
      marketIndex: 0,
      target: { plotIndex: 0 },
    });
  });
});

describe("accept 2 pumpkin last harvest R8", () => {
  it("other crop from R9, pumpkin from R13", () => {
    let { state: s, rng } = startForced({
      mode: "advanced",
      crops: ["pumpkin", "corn", "onion", "potato"],
      events: onionEvents(16),
    });
    const planter = s.turnOrder[0]!;
    s = passAllUntil(s, rng, (x) => x.round === 1 && x.actingSeat === planter);
    const p = plot(s, planter);
    p.owned = true;
    p.cropCard = { instanceId: "pk", cropId: "pumpkin" };
    p.white = 0;
    p.green = 1;
    p.red = 0;
    s = passAllUntil(s, rng, (x) => x.round === 2 && x.turnIndex === 0);
    expect(s.round).toBe(2);
    expect(plot(s, planter).green).toBe(0);
    expect(plot(s, planter).red).toBe(4);

    s.round = 8;
    plot(s, planter).red = 4;
    plot(s, planter).green = 0;
    plot(s, planter).white = 0;
    s = applyIncome(s);
    expect(s.round).toBe(9);
    expect(plot(s, planter).red).toBe(3);

    let t = cloneState(s);
    t.round = 9;
    t.phase = "turn";
    t.actingSeat = planter;
    t.turnIndex = t.turnOrder.indexOf(planter);
    t = replaceMarket(t, ["onion", "pumpkin", "corn"]);
    const legal9 = listLegalActions(t);
    expect(legal9.some((a) => a.type === "plant" && a.target !== "newLand" && a.target.plotIndex === 0 && a.marketIndex === 0)).toBe(true);
    expect(legal9.some((a) => a.type === "plant" && a.target !== "newLand" && a.target.plotIndex === 0 && a.marketIndex === 1)).toBe(false);

    t = cloneState(s);
    t.round = 13;
    t.phase = "turn";
    t.actingSeat = planter;
    t.turnIndex = t.turnOrder.indexOf(planter);
    plot(t, planter).red = 0;
    t = replaceMarket(t, ["pumpkin", "onion", "corn"]);
    const legal13 = listLegalActions(t);
    expect(
      legal13.some(
        (a) =>
          a.type === "plant" &&
          a.target !== "newLand" &&
          a.target.plotIndex === 0 &&
          a.marketIndex === 0,
      ),
    ).toBe(true);
  });
});

describe("accept 3 income formula", () => {
  it("corn 10 floor 4, others 2", () => {
    expect(harvestIncome(10, 4, 2, 0)).toBe(8);
    expect(harvestIncome(10, 4, 2, 2)).toBe(10);
    expect(harvestIncome(10, 4, 2, -4)).toBe(4);
  });
});

describe("accept 4 event row", () => {
  it("A then A+B then B+C then C+D", () => {
    const events = ["corn", "potato", "onion", "pumpkin", "radish", "edamame", "tomato", "watermelon"].flatMap(
      (cropId) => [4, 2, -2, -4].map((delta) => ({ cropId, delta })),
    );
    let { state: s, rng } = startForced({
      mode: "advanced",
      crops: ["corn", "potato", "onion", "pumpkin"],
      events,
    });
    const ids = () => ({
      row: s.event.row.map((e) => e.instanceId),
      active: s.event.active.map((e) => e.instanceId),
      valid: effectiveEvents(s).map((e) => e.instanceId),
    });
    const a = s.event.row[0]!.instanceId;
    const b = s.event.row[1]!.instanceId;
    const c = s.event.row[2]!.instanceId;
    expect(s.event.row.length).toBe(3);
    expect(ids().valid).toEqual([a]);

    s = passAllUntil(s, rng, (x) => x.round === 2 && x.turnIndex === 0);
    const d = s.event.row[2]!.instanceId;
    expect(ids().row[0]).toBe(b);
    expect(ids().active).toEqual([a]);
    expect(ids().valid).toEqual([b, a]);

    s = passAllUntil(s, rng, (x) => x.round === 3 && x.turnIndex === 0);
    expect(ids().row[0]).toBe(c);
    expect(ids().active).toEqual([b]);
    expect(ids().valid).toEqual([c, b]);
    expect(s.event.discard.some((x) => x.instanceId === a)).toBe(true);

    s = passAllUntil(s, rng, (x) => x.round === 4 && x.turnIndex === 0);
    expect(ids().row[0]).toBe(d);
    expect(ids().active).toEqual([c]);
    expect(ids().valid).toEqual([d, c]);
    expect(s.event.discard.some((x) => x.instanceId === b)).toBe(true);
  });
});

describe("accept 5 row length", () => {
  it("basic shortens R9-10", () => {
    let { state: s, rng } = startForced({
      mode: "basic",
      crops: ["corn", "potato", "onion", "pumpkin"],
      events: onionEvents(16),
    });
    s = passAllUntil(s, rng, (x) => x.round === 8 && x.turnIndex === 0);
    expect(s.event.row.length).toBe(3);
    s = passAllUntil(s, rng, (x) => x.round === 9 && x.turnIndex === 0);
    expect(s.event.row.length).toBe(2);
    s = passAllUntil(s, rng, (x) => x.round === 10 && x.turnIndex === 0);
    expect(s.event.row.length).toBe(1);
  });

  it("advanced shortens R17-18", () => {
    let { state: s, rng } = startForced({
      mode: "advanced",
      crops: ["corn", "potato", "onion", "pumpkin"],
      events: onionEvents(16),
    });
    s = passAllUntil(s, rng, (x) => x.round === 16 && x.turnIndex === 0);
    expect(s.event.row.length).toBe(3);
    expect(s.event.drawnCount).toBe(18);
    s = passAllUntil(s, rng, (x) => x.round === 17 && x.turnIndex === 0);
    expect(s.event.row.length).toBe(2);
    s = passAllUntil(s, rng, (x) => x.round === 18 && x.turnIndex === 0);
    expect(s.event.row.length).toBe(1);
    expect(s.event.drawnCount).toBe(18);
  });

  it("advanced reshuffles expired events at R15 and caps at 18", () => {
    let { state: s, rng } = startForced({
      mode: "advanced",
      crops: ["corn", "potato", "onion", "pumpkin"],
      events: onionEvents(16),
    });
    s = passAllUntil(s, rng, (x) => x.round === 14 && x.turnIndex === 0);
    expect(s.event.drawnCount).toBe(16);
    expect(s.event.deck.length).toBe(0);
    s = passAllUntil(s, rng, (x) => x.round === 15 && x.turnIndex === 0);
    expect(s.event.drawnCount).toBe(17);
    s = passAllUntil(s, rng, (x) => x.round === 16 && x.turnIndex === 0);
    expect(s.event.drawnCount).toBe(18);
    s = passAllUntil(s, rng, (x) => x.phase === "gameOver");
    expect(s.event.drawnCount).toBe(18);
    expect(s.lastRound).toBe(18);
  });
});

describe("accept 6 starting coins", () => {
  it("matches seat-order tables along turnOrder", () => {
    for (const [n, expected] of [
      [3, [8, 9, 9]],
      [4, [8, 9, 9, 9]],
      [5, [8, 8, 9, 9, 9]],
    ] as const) {
      const seats = Array.from({ length: n }, (_, i) => ({
        kind: "cpu" as const,
        name: `P${i}`,
      }));
      const rng = createRng(`coins-${n}`);
      const s = createGame({ mode: "basic", seed: `coins-${n}`, seats }, rng);
      expect(coinsByTurnOrder(s)).toEqual([...expected]);
    }
  });

  it("deals 8 to everyone when evenStartCoins is set", () => {
    const seats = Array.from({ length: 4 }, (_, i) => ({ kind: "cpu" as const, name: `P${i}` }));
    const rng = createRng("even-coins");
    const s = createGame(
      { mode: "basic", seed: "even-coins", seats, startSeat: 2, evenStartCoins: true },
      rng,
    );
    expect(s.players.map((p) => p.coins)).toEqual([8, 8, 8, 8]);
    expect(s.turnOrder).toEqual([2, 3, 0, 1]);
  });
});

describe("accept 7 turn order", () => {
  it("uses clockwise order from the start seat in round 1", () => {
    const seats = Array.from({ length: 4 }, (_, i) => ({ kind: "cpu" as const, name: `P${i}` }));
    const rng = createRng("clock");
    const s = createGame({ mode: "basic", seed: "clock", seats, startSeat: 1 }, rng);
    expect(s.turnOrder).toEqual([1, 2, 3, 0]);
    expect(s.actingSeat).toBe(1);
  });

  it("keeps clockwise order for the whole season", () => {
    let { state: s, rng } = startForced({
      mode: "basic",
      crops: ["potato", "corn", "onion", "pumpkin"],
      events: onionEvents(16),
    });
    const order1 = [...s.turnOrder];
    const last = order1[order1.length - 1]!;
    s = passAllUntil(s, rng, (x) => x.round === 1 && x.actingSeat === last);
    s = replaceMarket(s, ["radish", "onion", "corn"]);
    s = plant(s, rng, { type: "plant", marketIndex: 0, target: "newLand" });
    s = passAllUntil(s, rng, (x) => x.round === 2 && x.turnIndex === 0);
    expect(s.turnOrder).toEqual(order1);
    expect(s.actingSeat).toBe(order1[0]);
  });
});

describe("accept 8-12 legal plants", () => {
  it("allows pass even when planting is possible", () => {
    const { state: s } = startForced({
      mode: "basic",
      crops: ["radish", "onion", "corn", "potato"],
    });
    const legal = listLegalActions(s);
    expect(legal.some((a) => a.type === "pass")).toBe(true);
    expect(legal.some((a) => a.type === "plant")).toBe(true);
  });

  it("empty with red: other crop ok, same crop blocked; newLand still ok", () => {
    let { state: s } = startForced({
      mode: "basic",
      crops: ["potato", "onion", "corn", "radish"],
    });
    const seat = s.actingSeat!;
    const p0 = plot(s, seat, 0);
    p0.owned = true;
    p0.cropCard = { instanceId: "x", cropId: "potato" };
    p0.white = 0;
    p0.green = 0;
    p0.red = 2;
    s = replaceMarket(s, ["onion", "potato", "corn"]);
    const legal = listLegalActions(s);
    expect(legal.some((a) => a.type === "plant" && a.target !== "newLand" && a.target.plotIndex === 0 && a.marketIndex === 0)).toBe(true);
    expect(legal.some((a) => a.type === "plant" && a.target !== "newLand" && a.target.plotIndex === 0 && a.marketIndex === 1)).toBe(false);
    expect(legal.some((a) => a.type === "plant" && a.target === "newLand")).toBe(true);
  });

  it("replacing a crop discards previous and clears red", () => {
    let { state: s, rng } = startForced({
      mode: "basic",
      crops: ["radish", "onion", "corn", "potato"],
      events: onionEvents(16),
    });
    const seat = s.actingSeat!;
    s = replaceMarket(s, ["radish", "onion", "corn"]);
    s = plant(s, rng, { type: "plant", marketIndex: 0, target: "newLand" });
    s = passAllUntil(s, rng, (x) => x.round === 3 && x.actingSeat === seat);
    expect(plot(s, seat).white).toBe(0);
    expect(plot(s, seat).green).toBe(0);
    s = replaceMarket(s, ["onion", "corn", "potato"]);
    const last = s.turnIndex === s.turnOrder.length - 1;
    s = plant(s, rng, { type: "plant", marketIndex: 0, target: { plotIndex: 0 } });
    expect(s.crop.discard.some((c) => c.cropId === "radish")).toBe(true);
    expect(plot(s, seat).cropCard?.cropId).toBe("onion");
    expect(plot(s, seat).red).toBe(0);
    expect(plot(s, seat).white).toBe(last ? 1 : 2);
  });
});

describe("accept 11 self competition", () => {
  it("two own harvesting plots count as 1 other each", () => {
    let { state: s } = startForced({
      mode: "basic",
      crops: ["corn", "onion", "potato", "pumpkin"],
      events: onionEvents(16),
    });
    const seat = 0;
    for (const i of [0, 1]) {
      const p = plot(s, seat, i);
      p.owned = true;
      p.cropCard = { instanceId: `c${i}`, cropId: "corn" };
      p.white = 0;
      p.green = 1;
      p.red = 0;
    }
    s.event.row = [];
    s.event.active = [];
    s = applyIncome(s);
    expect(s.lastPayouts[seat]).toBe(18);
  });
});

describe("accept 13-14 decks", () => {
  it("advanced drawnCount caps at 18", () => {
    let { state: s, rng } = startForced({
      mode: "advanced",
      crops: ["corn", "potato", "onion", "pumpkin"],
      events: onionEvents(16),
    });
    s = passAllUntil(s, rng, (x) => x.phase === "gameOver");
    expect(s.event.drawnCount).toBe(18);
  });

  it("market shrinks when crop piles are empty", () => {
    let { state: s, rng } = startForced({
      mode: "basic",
      crops: ["radish", "onion", "corn", "potato"],
    });
    s.crop.deck = [];
    s.crop.discard = [];
    s.crop.market = [{ instanceId: "only", cropId: "radish" }];
    const before = s.crop.market.length;
    s = applyAction(s, { type: "plant", marketIndex: 0, target: "newLand" }, rng);
    expect(before).toBe(1);
    expect(s.crop.market.length).toBe(0);
  });
});
