import { cropList, EVENT_DELTAS_DATA } from "./catalog.js";
import { shuffle, type Rng } from "./rng.js";
import {
  emptyPlots,
  eventDrawCap,
  lastRound,
  marketSize,
  startingCoins,
  EVENT_ROW_MAX,
  type CropCard,
  type CropId,
  type EventCard,
  type GameState,
  type StartConfig,
} from "./types.js";

export function createGame(config: StartConfig, rng: Rng): GameState {
  const n = config.seats.length;
  if (n < 3 || n > 5) throw new Error("player count must be 3-5");

  const crops = config.forcedCrops ?? pickCrops(rng);
  if (crops.length !== 4) throw new Error("must use 4 crops");

  let cropNext = 0;
  const cropCards: CropCard[] = [];
  for (const cropId of crops) {
    for (let i = 0; i < 10; i++) {
      cropCards.push({ instanceId: `c${cropNext++}`, cropId });
    }
  }
  const cropDeck = shuffle(cropCards, rng);
  const size = marketSize(n);
  const market = cropDeck.splice(0, size);

  let eventNext = 0;
  const makeEvent = (cropId: CropId, delta: number): EventCard => ({
    instanceId: `e${eventNext++}`,
    cropId,
    delta,
  });

  let allEvents: EventCard[];
  if (config.forcedEventDeck) {
    allEvents = config.forcedEventDeck.map((e) => makeEvent(e.cropId, e.delta));
  } else {
    allEvents = [];
    for (const cropId of crops) {
      for (const delta of EVENT_DELTAS_DATA) {
        allEvents.push(makeEvent(cropId, delta));
      }
    }
    allEvents = shuffle(allEvents, rng);
  }

  const cap = eventDrawCap(config.mode);
  const eventDeck = allEvents.slice(0, cap);
  const excluded = allEvents.slice(cap);
  const row = eventDeck.splice(0, EVENT_ROW_MAX);
  const activatedRound: Record<string, number> = {};
  const first = row[0];
  if (first) activatedRound[first.instanceId] = 1;

  const turnOrder = shuffle(
    config.seats.map((_, i) => i),
    rng,
  );
  const coins = startingCoins(n);
  const players = config.seats.map((seat, i) => ({
    seat: i,
    kind: seat.kind,
    name: seat.name,
    coins: 0,
    plots: emptyPlots(),
    ...(seat.cpuStrategyId !== undefined ? { cpuStrategyId: seat.cpuStrategyId } : {}),
  }));
  for (let i = 0; i < turnOrder.length; i++) {
    const seat = turnOrder[i]!;
    players[seat]!.coins = coins[i]!;
  }

  return {
    specVersion: "0.4",
    mode: config.mode,
    seed: config.seed,
    round: 1,
    lastRound: lastRound(config.mode),
    phase: "turn",
    actingSeat: turnOrder[0]!,
    turnIndex: 0,
    turnOrder,
    players,
    cropIdsInGame: crops,
    crop: { deck: cropDeck, discard: [], market, nextId: cropNext },
    event: {
      deck: eventDeck,
      discard: [],
      row,
      active: [],
      excluded,
      drawnCount: row.length,
      nextId: eventNext,
    },
    activatedRound,
    winnerSeats: [],
    lastPayouts: players.map(() => 0),
    roundActions: [],
    lastHarvest: [],
    startCoins: players.map((p) => p.coins),
    roundLog: [],
  };
}

function pickCrops(rng: Rng): CropId[] {
  return shuffle(cropList.map((c) => c.id), rng).slice(0, 4);
}

export function refillMarket(state: GameState, rng: Rng): void {
  const size = marketSize(state.players.length);
  while (state.crop.market.length < size) {
    if (state.crop.deck.length === 0 && state.crop.discard.length > 0) {
      state.crop.deck = shuffle(state.crop.discard, rng);
      state.crop.discard = [];
    }
    const next = state.crop.deck.shift();
    if (!next) break;
    state.crop.market.push(next);
  }
}
