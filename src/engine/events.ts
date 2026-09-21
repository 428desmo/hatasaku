import { shuffle, type Rng } from "./rng.js";
import { cloneState, eventDrawCap, eventHasExpired, type EventCard, type GameState } from "./types.js";

export function effectiveEvents(state: GameState): EventCard[] {
  const out: EventCard[] = [];
  const left = state.event.row[0];
  if (left) out.push(left);
  out.push(...state.event.active);
  return out;
}

export function eventSumFor(state: GameState, cropId: string): number {
  return effectiveEvents(state)
    .filter((e) => e.cropId === cropId)
    .reduce((s, e) => s + e.delta, 0);
}

export function applyEventUpdate(state: GameState, rng: Rng): GameState {
  const s = cloneState(state);
  const round = s.round;

  s.event.active = s.event.active.filter((card) => {
    const started = s.activatedRound[card.instanceId];
    if (started !== undefined && eventHasExpired(started, round)) {
      s.event.discard.push(card);
      delete s.activatedRound[card.instanceId];
      return false;
    }
    return true;
  });

  const previousLeft = s.event.row.shift();
  if (previousLeft) s.event.active.push(previousLeft);

  const cap = eventDrawCap(s.mode);
  if (s.mode === "full" && s.event.deck.length === 0 && s.event.drawnCount < cap) {
    s.event.deck = shuffle(s.event.discard, rng);
    s.event.discard = [];
  }

  if (s.event.deck.length > 0 && s.event.drawnCount < cap) {
    const drawn = s.event.deck.shift();
    if (drawn) {
      s.event.row.push(drawn);
      s.event.drawnCount += 1;
    }
  }

  const left = s.event.row[0];
  if (left && s.activatedRound[left.instanceId] === undefined) {
    s.activatedRound[left.instanceId] = round;
  }

  return s;
}
