export type Mode = "tutorial" | "full";
export type Phase = "lobby" | "eventUpdate" | "turn" | "income" | "gameOver";
export type SeatKind = "human" | "cpu";
export type CropType = "immediate" | "lump" | "long" | "mid";
export type PlotKind = "unowned" | "waiting" | "harvesting" | "empty";

export type CropId = string;

export type CropDef = {
  id: CropId;
  name: string;
  cost: number;
  wait: number;
  harvest: number;
  baseIncome: number;
  floor: number;
  cooldown: number;
  copies: number;
  type: CropType;
};

export type CropCard = {
  instanceId: string;
  cropId: CropId;
};

export type EventCard = {
  instanceId: string;
  cropId: CropId;
  delta: number;
};

export type PlotView = {
  index: number;
  owned: boolean;
  cropId: CropId | null;
  white: number;
  green: number;
  red: number;
};

export type Action =
  | { type: "pass" }
  | { type: "plant"; marketIndex: number; target: "newLand" | { plotIndex: number } };

export type PublicView = {
  mode: Mode;
  round: number;
  lastRound: number;
  phase: Phase;
  actingSeat: number | null;
  turnOrder: number[];
  players: {
    seat: number;
    kind: SeatKind;
    name: string;
    coins: number;
    plots: PlotView[];
  }[];
  market: { instanceId: string; cropId: CropId }[];
  cropDeckCount: number;
  cropDiscard: { instanceId: string; cropId: CropId }[];
  eventRow: { instanceId: string; cropId: CropId; delta: number }[];
  eventActive: { instanceId: string; cropId: CropId; delta: number }[];
  eventDeckCount: number;
  eventDiscard: { instanceId: string; cropId: CropId; delta: number }[];
  drawnEventCount: number;
  cropIdsInGame: CropId[];
  legalActions?: Action[];
  message?: string | null;
};

export const LAND_ACQUIRE_COST = [0, 1, 2, 3, 4] as const;
export const EVENT_ROW_MAX = 4;
export const PLOT_COUNT = 5;
export const EVENT_DELTAS = [4, 2, -2, -4] as const;

export function marketSize(playerCount: number): number {
  return playerCount === 5 ? 4 : 3;
}

export function lastRound(mode: Mode): number {
  return mode === "tutorial" ? 10 : 20;
}

export function eventDrawCap(mode: Mode): number {
  return mode === "tutorial" ? 10 : 20;
}

export function startingCoins(playerCount: number): number[] {
  if (playerCount === 3) return [8, 9, 9];
  if (playerCount === 4) return [8, 9, 9, 9];
  if (playerCount === 5) return [8, 8, 9, 9, 9];
  throw new Error(`unsupported playerCount: ${playerCount}`);
}

export function acquireCost(ownedCount: number): number {
  const cost = LAND_ACQUIRE_COST[ownedCount];
  if (cost === undefined) {
    throw new Error(`cannot acquire land ${ownedCount + 1}`);
  }
  return cost;
}

export function plotKind(plot: PlotView): PlotKind {
  if (!plot.owned) return "unowned";
  if (plot.white > 0) return "waiting";
  if (plot.green > 0) return "harvesting";
  return "empty";
}
