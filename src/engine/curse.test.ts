import { describe, expect, it } from "vitest";
import { chooseIrr } from "../cpu/index.js";
import {
  applyAction,
  applyHarvest,
  applyIncome,
  applyPlayerAction,
  createGame,
  createRng,
  getPublicView,
  harvestIncome,
  IllegalActionError,
  listLegalActions,
} from "./index.js";
import {
  onionEvents,
  passAllUntil,
  plant,
  replaceMarket,
  startForced,
  threeCpus,
} from "./testkit.js";
import { CURSE_DELTA, CURSE_DURATION } from "./types.js";

const crops = ["potato", "corn", "onion", "pumpkin"] as const;

describe("curse event", () => {
  it("is not offered in season 1", () => {
    const { state } = startForced({ mode: "basic", crops: [...crops] });
    expect(state.specVersion).toBe("0.16");
    expect(state.curseReadySeats).toEqual([]);
    expect(listLegalActions(state).every((a) => a.type !== "curse")).toBe(true);
  });

  it("does not consume the turn and lasts the next four rounds", () => {
    let { state, rng } = startForced({
      mode: "basic",
      crops: [...crops],
      curseSeats: [0],
      events: onionEvents(16),
    });
    expect(state.actingSeat).toBe(0);
    expect(listLegalActions(state)).toEqual(
      expect.arrayContaining(crops.map((cropId) => ({ type: "curse", cropId }))),
    );
    const before = { seat: state.actingSeat, round: state.round, actions: state.roundActions.length };
    state = applyPlayerAction(state, { type: "curse", cropId: "potato" }, rng);
    expect(state.actingSeat).toBe(before.seat);
    expect(state.round).toBe(before.round);
    expect(state.roundActions).toHaveLength(before.actions);
    expect(state.curseReadySeats).toEqual([]);
    expect(state.curses).toEqual([{ cropId: "potato", from: 2, to: 5, bySeat: 0, revealed: false }]);
    expect(listLegalActions(state).some((a) => a.type === "curse")).toBe(false);
    expect(() => applyPlayerAction(state, { type: "curse", cropId: "corn" }, rng)).toThrow(IllegalActionError);

    state = replaceMarket(state, ["potato", "onion", "radish"]);
    state = plant(state, rng, { type: "plant", marketIndex: 0, target: "newLand" });
    state = passAllUntil(state, rng, (s) => s.round === 4 && s.phase === "turn" && s.turnIndex === 0);
    const harvest = state.roundLog.find((r) => r.round === 3);
    expect(harvest?.eventSum[0]).toBe(CURSE_DELTA);
    expect(harvest?.harvested[0]).toBe(harvestIncome(9, 4, 0, CURSE_DELTA));
    expect(CURSE_DURATION).toBe(4);
  });

  it("hides the target until harvest and blocks the same crop for the rest of the season", () => {
    let { state, rng } = startForced({
      mode: "basic",
      crops: [...crops],
      curseSeats: [0, 1],
      events: onionEvents(16),
    });
    state = applyPlayerAction(state, { type: "curse", cropId: "potato" }, rng);
    const self = getPublicView(state, 0);
    expect(self.curses).toEqual([{ cropId: "potato", from: 2, to: 5, bySeat: 0, revealed: false }]);
    expect(self.hiddenCurseCount).toBe(0);
    const other = getPublicView(state, 1);
    expect(other.curses).toEqual([]);
    expect(other.hiddenCurseCount).toBe(1);

    state = replaceMarket(state, ["potato", "onion", "radish"]);
    state = plant(state, rng, { type: "plant", marketIndex: 0, target: "newLand" });
    expect(state.actingSeat).toBe(1);
    expect(listLegalActions(state).some((a) => a.type === "curse" && a.cropId === "potato")).toBe(false);
    expect(listLegalActions(state)).toEqual(
      expect.arrayContaining(["corn", "onion", "pumpkin"].map((cropId) => ({ type: "curse", cropId }))),
    );
    expect(() => applyPlayerAction(state, { type: "curse", cropId: "potato" }, rng)).toThrow(IllegalActionError);
    const second = getPublicView(state, 1);
    expect(second.curses).toEqual([]);
    expect(second.hiddenCurseCount).toBe(1);

    state = applyPlayerAction(state, { type: "curse", cropId: "corn" }, rng);
    const afterSecond = getPublicView(state, 1);
    expect(afterSecond.curses.map((c) => c.cropId).sort()).toEqual(["corn", "potato"]);
    expect(afterSecond.hiddenCurseCount).toBe(0);
    expect(getPublicView(state, 2).curses).toEqual([]);
    expect(getPublicView(state, 2).hiddenCurseCount).toBe(2);

    state = applyPlayerAction(state, { type: "pass" }, rng);
    state = applyPlayerAction(state, { type: "pass" }, rng);
    expect(state.phase).toBe("income");
    state = applyHarvest(state);
    expect(state.curses.every((c) => c.revealed)).toBe(true);
    const revealed = getPublicView(state, 2);
    expect(revealed.curses.map((c) => c.cropId).sort()).toEqual(["corn", "potato"]);
    expect(revealed.hiddenCurseCount).toBe(0);
  });

  it("does not allow the same crop to be cursed again later in the season", () => {
    let { state, rng } = startForced({
      mode: "basic",
      crops: [...crops],
      curseSeats: [0, 1],
      events: onionEvents(16),
    });
    state = applyPlayerAction(state, { type: "curse", cropId: "potato" }, rng);
    state = replaceMarket(state, ["potato", "onion", "radish"]);
    state = plant(state, rng, { type: "plant", marketIndex: 0, target: "newLand" });
    state = applyAction(state, { type: "pass" }, rng);
    state = passAllUntil(state, rng, (s) => s.round === 2 && s.phase === "turn" && s.actingSeat === 1);
    expect(state.actingSeat).toBe(1);
    expect(state.curses[0]?.revealed).toBe(true);
    expect(listLegalActions(state).some((a) => a.type === "curse" && a.cropId === "potato")).toBe(false);
    expect(() => applyPlayerAction(state, { type: "curse", cropId: "potato" }, rng)).toThrow(IllegalActionError);
    state = applyPlayerAction(state, { type: "curse", cropId: "corn" }, rng);
    expect(state.curses.map((c) => c.cropId)).toEqual(["potato", "corn"]);
  });

  it("keeps the unused right when every crop is already taken this season", () => {
    const seats = [
      { kind: "cpu" as const, name: "A", cpuStrategyId: "random" },
      { kind: "cpu" as const, name: "B", cpuStrategyId: "random" },
      { kind: "cpu" as const, name: "C", cpuStrategyId: "random" },
      { kind: "cpu" as const, name: "D", cpuStrategyId: "random" },
      { kind: "cpu" as const, name: "E", cpuStrategyId: "random" },
    ];
    let { state, rng } = startForced({
      mode: "basic",
      seats,
      crops: [...crops],
      curseSeats: [0, 1, 2, 3, 4],
      events: onionEvents(16),
    });
    for (const cropId of crops) {
      state = applyPlayerAction(state, { type: "curse", cropId }, rng);
      state = applyPlayerAction(state, { type: "pass" }, rng);
    }
    expect(state.actingSeat).toBe(4);
    expect(state.curseReadySeats).toEqual([4]);
    expect(listLegalActions(state).some((a) => a.type === "curse")).toBe(false);
    state = applyPlayerAction(state, { type: "pass" }, rng);
    expect(state.phase).toBe("income");
    expect(state.curseReadySeats).toEqual([4]);
    state = applyIncome(state);
    expect(state.round).toBe(2);
    state = passAllUntil(state, rng, (s) => s.actingSeat === 4);
    expect(state.curseReadySeats).toEqual([4]);
    expect(listLegalActions(state).some((a) => a.type === "curse")).toBe(false);
  });

  it("still counts as all-pass for a market sweep", () => {
    let { state, rng } = startForced({
      mode: "basic",
      crops: [...crops],
      curseSeats: [0],
    });
    const before = state.crop.market.map((c) => c.instanceId);
    state = applyPlayerAction(state, { type: "curse", cropId: "potato" }, rng);
    state = applyPlayerAction(state, { type: "pass" }, rng);
    state = applyPlayerAction(state, { type: "pass" }, rng);
    state = applyPlayerAction(state, { type: "pass" }, rng);
    expect(state.phase).toBe("income");
    expect(state.crop.market.map((c) => c.instanceId)).not.toEqual(before);
  });

  it("lets irr curse a crop others will harvest", () => {
    const rng = createRng("curse-cpu");
    const state = createGame(
      {
        mode: "basic",
        seed: "curse-cpu",
        seats: threeCpus,
        startSeat: 0,
        curseSeats: [0],
        forcedCrops: [...crops],
      },
      rng,
    );
    state.players[1]!.plots[0] = {
      index: 0,
      owned: true,
      cropCard: { instanceId: "p1", cropId: "potato" },
      white: 0,
      green: 3,
      red: 0,
    };
    const view = getPublicView(state, 0);
    expect(chooseIrr(view)).toEqual({ type: "curse", cropId: "potato" });
  });
});
