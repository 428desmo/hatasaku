export type Mode = "basic" | "advanced";
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

export type CropCard = { instanceId: string; cropId: CropId };
export type EventCard = { instanceId: string; cropId: CropId; delta: number };

export type Plot = {
  index: number;
  owned: boolean;
  cropCard: CropCard | null;
  white: number;
  green: number;
  red: number;
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

export type SeatConfig = {
  kind: SeatKind;
  name: string;
  cpuStrategyId?: string;
};

export type StartConfig = {
  mode: Mode;
  seed: string;
  seats: SeatConfig[];
  startSeat?: number;
  evenStartCoins?: boolean;
  season?: number;
  seasonCount?: number;
  forcedCrops?: CropId[];
  forcedEventDeck?: { cropId: CropId; delta: number }[];
};

export type Player = {
  seat: number;
  kind: SeatKind;
  name: string;
  coins: number;
  plots: Plot[];
  cpuStrategyId?: string;
};

export type ActionLog = {
  seat: number;
  kind: "pass" | "plant";
  cropId?: CropId;
  plotIndex?: number;
  newLand?: boolean;
  cost?: number;
};

export type HarvestDetail = {
  seat: number;
  plotIndex: number;
  cropId: CropId;
  base: number;
  others: number;
  eventSum: number;
  events: { cropId: CropId; delta: number }[];
  raw: number;
  floor: number;
  gain: number;
};

export type GameState = {
  specVersion: "0.6";
  mode: Mode;
  seed: string;
  season: number;
  seasonCount: number;
  startSeat: number;
  round: number;
  lastRound: number;
  phase: Phase;
  actingSeat: number | null;
  turnIndex: number;
  turnOrder: number[];
  players: Player[];
  cropIdsInGame: CropId[];
  crop: {
    deck: CropCard[];
    discard: CropCard[];
    market: CropCard[];
    nextId: number;
  };
  event: {
    deck: EventCard[];
    discard: EventCard[];
    row: EventCard[];
    active: EventCard[];
    excluded: EventCard[];
    drawnCount: number;
    nextId: number;
  };
  activatedRound: Record<string, number>;
  winnerSeats: number[];
  lastPayouts: number[];
  roundActions: ActionLog[];
  lastHarvest: HarvestDetail[];
  startCoins: number[];
  roundLog: RoundSnapshot[];
};

export type RoundSnapshot = {
  round: number;
  coins: number[];
  harvesting: number[];
  owned: number[];
  planted: number[];
  passed: number[];
  spent: number[];
  harvested: number[];
  crowding: number[];
  eventSum: number[];
};

export type PublicEvent = {
  instanceId: string;
  cropId: CropId;
  delta: number;
  activatedRound?: number;
};

export type PublicView = {
  mode: Mode;
  season: number;
  seasonCount: number;
  startSeat: number;
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
  eventRow: PublicEvent[];
  eventActive: PublicEvent[];
  eventDeckCount: number;
  eventDiscard: PublicEvent[];
  drawnEventCount: number;
  cropIdsInGame: CropId[];
  legalActions?: Action[];
  message?: string | null;
};

export const LAND_ACQUIRE_COST = [0, 1, 2, 3, 4] as const;
export const EVENT_ROW_MAX = 3;
export const EVENT_DURATION = 2;
export const PLOT_COUNT = 5;
export const EVENT_DELTAS = [4, 2, -2, -4] as const;

export function eventEffectEnd(started: number): number {
  return started + EVENT_DURATION - 1;
}

export function eventHasExpired(started: number, round: number): boolean {
  return eventEffectEnd(started) < round;
}

export function marketSize(playerCount: number): number {
  return playerCount === 5 ? 4 : 3;
}

export function parseMode(raw: string): Mode {
  if (raw === "advanced" || raw === "full") return "advanced";
  return "basic";
}

export function lastRound(mode: Mode): number {
  return mode === "basic" ? 10 : 18;
}

export function eventDrawCap(mode: Mode): number {
  return mode === "basic" ? 10 : 18;
}

export function clockwiseOrder(startSeat: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => (startSeat + i) % n);
}

export function dealStartCoins(playerCount: number, even: boolean): number[] {
  if (even) return Array.from({ length: playerCount }, () => 8);
  return startingCoins(playerCount);
}

export function startingCoins(playerCount: number): number[] {
  if (playerCount === 3) return [8, 9, 9];
  if (playerCount === 4) return [8, 9, 9, 9];
  if (playerCount === 5) return [8, 8, 9, 9, 9];
  throw new Error(`unsupported playerCount: ${playerCount}`);
}

export function acquireCost(ownedCount: number): number {
  const cost = LAND_ACQUIRE_COST[ownedCount];
  if (cost === undefined) throw new Error(`cannot acquire land ${ownedCount + 1}`);
  return cost;
}

export function plotKindFromTokens(owned: boolean, white: number, green: number): PlotKind {
  if (!owned) return "unowned";
  if (white > 0) return "waiting";
  if (green > 0) return "harvesting";
  return "empty";
}

export function plotKind(plot: PlotView | Plot): PlotKind {
  const cropId = "cropId" in plot ? plot.cropId : plot.cropCard?.cropId ?? null;
  const owned = plot.owned;
  void cropId;
  return plotKindFromTokens(owned, plot.white, plot.green);
}

export function emptyPlots(): Plot[] {
  return Array.from({ length: PLOT_COUNT }, (_, index) => ({
    index,
    owned: false,
    cropCard: null,
    white: 0,
    green: 0,
    red: 0,
  }));
}

export function cloneState<T>(value: T): T {
  return structuredClone(value);
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}
