import { cropDef } from "./catalog.js";
import { applyEventUpdate, effectiveEvents, eventSumFor } from "./events.js";
import { applyHarvest, applyIncome, concludeRound, harvestIncome } from "./income.js";
import { listLegalActions, nextUnownedIndex, ownedCount } from "./legal.js";
import { createRng, type Rng } from "./rng.js";
import { createGame, sweepMarketIfAllPassed } from "./setup.js";
import { advanceTurnPointer, applyTurn } from "./turn.js";
import {
  acquireCost,
  cloneState,
  IllegalActionError,
  parseMode,
  type Action,
  type ActionLog,
  type GameState,
  type EventCard,
  type PublicEvent,
  type PublicView,
  type StartConfig,
} from "./types.js";

export {
  applyEventUpdate,
  applyHarvest,
  applyIncome,
  concludeRound,
  createGame,
  createRng,
  effectiveEvents,
  eventSumFor,
  harvestIncome,
  IllegalActionError,
  listLegalActions,
  parseMode,
};

export { refillMarket, sweepMarketIfAllPassed } from "./setup.js";

function publicEvent(e: EventCard, activatedRound: number | undefined): PublicEvent {
  if (activatedRound === undefined) {
    return { instanceId: e.instanceId, cropId: e.cropId, delta: e.delta };
  }
  return { instanceId: e.instanceId, cropId: e.cropId, delta: e.delta, activatedRound };
}

function describeAction(state: GameState, action: Action): ActionLog {
  const seat = state.actingSeat!;
  if (action.type === "pass") return { seat, kind: "pass" };
  const card = state.crop.market[action.marketIndex];
  const cropId = card?.cropId;
  if (action.target === "newLand") {
    const player = state.players[seat]!;
    const cost = cropId ? acquireCost(ownedCount(player)) + cropDef(cropId).cost : 0;
    return {
      seat,
      kind: "plant",
      ...(cropId !== undefined ? { cropId } : {}),
      plotIndex: nextUnownedIndex(player) ?? 0,
      newLand: true,
      cost,
    };
  }
  return {
    seat,
    kind: "plant",
    ...(cropId !== undefined ? { cropId } : {}),
    plotIndex: action.target.plotIndex,
    newLand: false,
    cost: cropId ? cropDef(cropId).cost : 0,
  };
}

export function applyPlayerAction(state: GameState, action: Action, rng: Rng): GameState {
  if (state.phase === "gameOver") throw new IllegalActionError("game is over");
  const log = describeAction(state, action);
  let s = applyTurn(state, action, rng);
  s.roundActions = [...s.roundActions, log];
  s.seasonActions = [...s.seasonActions, log];
  s = advanceTurnPointer(s);
  if (s.phase === "income") s = sweepMarketIfAllPassed(s, rng);
  return s;
}

export function applyAction(state: GameState, action: Action, rng: Rng): GameState {
  let s = applyPlayerAction(state, action, rng);
  if (s.phase !== "income") return s;
  s = applyIncome(s);
  if (s.phase === "gameOver") return s;
  s = applyEventUpdate(s, rng);
  s.phase = "turn";
  return s;
}

export function getPublicView(
  state: GameState,
  viewerSeat: number | "spectator",
): PublicView {
  const view: PublicView = {
    mode: state.mode,
    season: state.season,
    seasonCount: state.seasonCount,
    startSeat: state.startSeat,
    round: state.round,
    lastRound: state.lastRound,
    phase: state.phase,
    actingSeat: state.actingSeat,
    turnOrder: [...state.turnOrder],
    players: state.players.map((p) => ({
      seat: p.seat,
      kind: p.kind,
      name: p.name,
      coins: p.coins,
      plots: p.plots.map((plot) => ({
        index: plot.index,
        owned: plot.owned,
        cropId: plot.cropCard?.cropId ?? null,
        white: plot.white,
        green: plot.green,
        red: plot.red,
      })),
    })),
    market: state.crop.market.map((c) => ({ instanceId: c.instanceId, cropId: c.cropId })),
    cropDeckCount: state.crop.deck.length,
    cropDiscard: state.crop.discard.map((c) => ({ instanceId: c.instanceId, cropId: c.cropId })),
    eventRow: state.event.row.map((e) => publicEvent(e, state.activatedRound[e.instanceId])),
    eventActive: state.event.active.map((e) => publicEvent(e, state.activatedRound[e.instanceId])),
    eventDeckCount: state.event.deck.length,
    eventDiscard: state.event.discard.map((e) => ({
      instanceId: e.instanceId,
      cropId: e.cropId,
      delta: e.delta,
    })),
    drawnEventCount: state.event.drawnCount,
    cropIdsInGame: [...state.cropIdsInGame],
  };
  if (viewerSeat !== "spectator" && viewerSeat === state.actingSeat) {
    view.legalActions = listLegalActions(state);
  }
  return view;
}

export function startGame(config: StartConfig): { state: GameState; rng: Rng } {
  const rng = createRng(config.seed);
  return { state: createGame(config, rng), rng };
}

export function copyState(state: GameState): GameState {
  return cloneState(state);
}
