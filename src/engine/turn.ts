import { cropDef } from "./catalog.js";
import { applyCurse } from "./curse.js";
import { isLegal } from "./legal.js";
import { refillMarket } from "./setup.js";
import type { Rng } from "./rng.js";
import {
  acquireCost,
  cloneState,
  IllegalActionError,
  type Action,
  type GameState,
} from "./types.js";
import { nextUnownedIndex, ownedCount } from "./legal.js";

export function applyTurn(state: GameState, action: Action, rng: Rng): GameState {
  if (state.phase !== "turn" || state.actingSeat === null) {
    throw new IllegalActionError("not a player turn");
  }
  if (!isLegal(state, action)) {
    throw new IllegalActionError("illegal action");
  }

  const s = cloneState(state);
  const seat = s.actingSeat!;
  const player = s.players[seat]!;

  if (action.type === "curse") return applyCurse(state, action);

  if (action.type === "plant") {
    const card = s.crop.market[action.marketIndex];
    if (!card) throw new IllegalActionError("no such market card");
    const def = cropDef(card.cropId);

    let plotIndex: number;
    let cost: number;
    if (action.target === "newLand") {
      const idx = nextUnownedIndex(player);
      if (idx === null) throw new IllegalActionError("no unowned plot");
      plotIndex = idx;
      cost = acquireCost(ownedCount(player)) + def.cost;
    } else {
      plotIndex = action.target.plotIndex;
      cost = def.cost;
    }

    player.coins -= cost;
    const plot = player.plots[plotIndex]!;
    if (plot.cropCard) s.crop.discard.push(plot.cropCard);
    plot.red = 0;
    plot.owned = true;
    plot.cropCard = card;
    plot.white = def.wait;
    plot.green = 0;
    s.crop.market.splice(action.marketIndex, 1);
    refillMarket(s, rng);
  }

  return s;
}

export function advanceTurnPointer(state: GameState): GameState {
  const s = cloneState(state);
  if (s.turnIndex < s.turnOrder.length - 1) {
    s.turnIndex += 1;
    s.actingSeat = s.turnOrder[s.turnIndex]!;
    return s;
  }
  s.actingSeat = null;
  s.phase = "income";
  return s;
}
