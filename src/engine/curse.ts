import {
  CURSE_DELTA,
  CURSE_DURATION,
  cloneState,
  IllegalActionError,
  type Action,
  type CropId,
  type CurseEffect,
  type GameState,
} from "./types.js";

export function curseWindow(usedOnRound: number): { from: number; to: number } {
  const from = usedOnRound + 1;
  return { from, to: from + CURSE_DURATION - 1 };
}

export function curseIsLive(curse: CurseEffect, round: number): boolean {
  return round >= curse.from && round <= curse.to;
}

export function curseSumFor(state: GameState, cropId: string): number {
  return state.curses.filter((c) => c.cropId === cropId && curseIsLive(c, state.round)).length * CURSE_DELTA;
}

export function curseHits(state: GameState, cropId: string): CurseEffect[] {
  return state.curses.filter((c) => c.cropId === cropId && curseIsLive(c, state.round));
}

export function canUseCurse(state: GameState, seat: number): boolean {
  return state.phase === "turn" && state.actingSeat === seat && state.curseReadySeats.includes(seat);
}

export function applyCurse(state: GameState, action: Extract<Action, { type: "curse" }>): GameState {
  if (state.phase !== "turn" || state.actingSeat === null) {
    throw new IllegalActionError("not a player turn");
  }
  const seat = state.actingSeat;
  if (!state.curseReadySeats.includes(seat)) {
    throw new IllegalActionError("no curse right");
  }
  if (!state.cropIdsInGame.includes(action.cropId)) {
    throw new IllegalActionError("crop not in season");
  }
  const s = cloneState(state);
  s.curseReadySeats = s.curseReadySeats.filter((x) => x !== seat);
  const { from, to } = curseWindow(s.round);
  s.curses = [...s.curses, { cropId: action.cropId, from, to, bySeat: seat }];
  return s;
}

export function curseActions(state: GameState): Action[] {
  if (state.actingSeat === null || !canUseCurse(state, state.actingSeat)) return [];
  return state.cropIdsInGame.map((cropId: CropId) => ({ type: "curse" as const, cropId }));
}
