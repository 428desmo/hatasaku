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

export function curseUsedOnRound(curse: CurseEffect): number {
  return curse.from - 1;
}

export function curseIsLive(curse: CurseEffect, round: number): boolean {
  return round >= curse.from && round <= curse.to;
}

export function curseTakenCropIds(state: GameState): CropId[] {
  return state.curses.map((c) => c.cropId);
}

export function curseSumFor(state: GameState, cropId: string): number {
  return state.curses.filter((c) => c.cropId === cropId && curseIsLive(c, state.round)).length * CURSE_DELTA;
}

export function curseHits(state: GameState, cropId: string): CurseEffect[] {
  return state.curses.filter((c) => c.cropId === cropId && curseIsLive(c, state.round));
}

export function remainingCurseCrops(state: GameState): CropId[] {
  const taken = new Set(curseTakenCropIds(state));
  return state.cropIdsInGame.filter((id) => !taken.has(id));
}

export function canUseCurse(state: GameState, seat: number): boolean {
  return (
    state.phase === "turn" &&
    state.actingSeat === seat &&
    state.curseReadySeats.includes(seat) &&
    remainingCurseCrops(state).length > 0
  );
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
  if (curseTakenCropIds(state).includes(action.cropId)) {
    throw new IllegalActionError("crop already cursed this season");
  }
  const s = cloneState(state);
  s.curseReadySeats = s.curseReadySeats.filter((x) => x !== seat);
  const { from, to } = curseWindow(s.round);
  s.curses = [...s.curses, { cropId: action.cropId, from, to, bySeat: seat, revealed: false }];
  return s;
}

export function curseActions(state: GameState): Action[] {
  if (state.actingSeat === null || !canUseCurse(state, state.actingSeat)) return [];
  return remainingCurseCrops(state).map((cropId: CropId) => ({ type: "curse" as const, cropId }));
}

export function revealPendingCurses(state: GameState): void {
  for (const curse of state.curses) {
    if (curseUsedOnRound(curse) === state.round) curse.revealed = true;
  }
}

export function visibleCurses(state: GameState, viewerSeat: number | "spectator"): CurseEffect[] {
  const ownIdx =
    viewerSeat === "spectator" ? -1 : state.curses.findIndex((c) => c.bySeat === viewerSeat);
  return state.curses.filter((c, i) => {
    if (c.revealed || curseIsLive(c, state.round) || c.from <= state.round) return true;
    if (viewerSeat !== "spectator" && c.bySeat === viewerSeat) return true;
    if (ownIdx >= 0 && i <= ownIdx) return true;
    return false;
  });
}

export function hiddenCurseCount(state: GameState, viewerSeat: number | "spectator"): number {
  return state.curses.length - visibleCurses(state, viewerSeat).length;
}
