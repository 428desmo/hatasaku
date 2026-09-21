import { applyAction, createGame, createRng, listLegalActions } from "./index.js";
import { cloneState, type Action, type CropId, type GameState, type SeatConfig } from "./types.js";
import type { Rng } from "./rng.js";

export const threeCpus: SeatConfig[] = [
  { kind: "cpu", name: "A", cpuStrategyId: "random" },
  { kind: "cpu", name: "B", cpuStrategyId: "random" },
  { kind: "cpu", name: "C", cpuStrategyId: "random" },
];

export function passAllUntil(
  state: GameState,
  rng: Rng,
  pred: (s: GameState) => boolean,
): GameState {
  let s = state;
  for (let i = 0; i < 800; i++) {
    if (pred(s) || s.phase === "gameOver") return s;
    s = applyAction(s, { type: "pass" }, rng);
  }
  throw new Error("passAllUntil: too many steps");
}

export function replaceMarket(state: GameState, cropIds: CropId[]): GameState {
  const s = cloneState(state);
  s.crop.market = cropIds.map((cropId, i) => ({
    instanceId: `testm${s.crop.nextId++}-${i}`,
    cropId,
  }));
  return s;
}

export function plant(state: GameState, rng: Rng, action: Action): GameState {
  if (!listLegalActions(state).some((a) => JSON.stringify(a) === JSON.stringify(action))) {
    throw new Error(`not legal: ${JSON.stringify(action)} / ${JSON.stringify(listLegalActions(state))}`);
  }
  return applyAction(state, action, rng);
}

export function startForced(opts: {
  mode: "tutorial" | "full";
  seed?: string;
  seats?: SeatConfig[];
  crops: CropId[];
  events?: { cropId: CropId; delta: number }[];
}): { state: GameState; rng: Rng } {
  const rng = createRng(opts.seed ?? "test");
  const config = {
    mode: opts.mode,
    seed: opts.seed ?? "test",
    seats: opts.seats ?? threeCpus,
    forcedCrops: opts.crops,
    ...(opts.events ? { forcedEventDeck: opts.events } : {}),
  };
  return { state: createGame(config, rng), rng };
}

export function onionEvents(count = 16): { cropId: CropId; delta: number }[] {
  const deltas = [4, 2, -2, -4];
  return Array.from({ length: count }, (_, i) => ({
    cropId: "onion" as CropId,
    delta: deltas[i % 4]!,
  }));
}
