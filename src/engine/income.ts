import { cropDef } from "./catalog.js";
import { curseHits, revealPendingCurses } from "./curse.js";
import { effectiveEvents, eventSumFor } from "./events.js";
import { cloneState, CURSE_DELTA, type GameState, type HarvestDetail, type Plot, type RoundSnapshot } from "./types.js";

export function harvestIncome(base: number, floor: number, others: number, eventSum: number): number {
  return Math.max(floor, base - others + eventSum);
}

export function applyHarvest(state: GameState): GameState {
  const s = cloneState(state);
  const harvesting: { seat: number; plotIndex: number; cropId: string }[] = [];
  for (const player of s.players) {
    for (const plot of player.plots) {
      if (plot.owned && plot.white === 0 && plot.green > 0 && plot.cropCard) {
        harvesting.push({ seat: player.seat, plotIndex: plot.index, cropId: plot.cropCard.cropId });
      }
    }
  }

  const details: HarvestDetail[] = [];
  const payouts = s.players.map(() => 0);
  const liveEvents = effectiveEvents(s);
  for (const h of harvesting) {
    const player = s.players[h.seat]!;
    const def = cropDef(h.cropId);
    const others = harvesting.filter((x) => x.cropId === h.cropId).length - 1;
    const events = liveEvents
      .filter((e) => e.cropId === h.cropId)
      .map((e) => ({ cropId: e.cropId, delta: e.delta }));
    for (const c of curseHits(s, h.cropId)) {
      events.push({ cropId: c.cropId, delta: CURSE_DELTA });
    }
    const eventSum = eventSumFor(s, h.cropId);
    const raw = def.baseIncome - others + eventSum;
    const gain = harvestIncome(def.baseIncome, def.floor, others, eventSum);
    player.coins += gain;
    payouts[h.seat] = (payouts[h.seat] ?? 0) + gain;
    details.push({
      seat: h.seat,
      plotIndex: h.plotIndex,
      cropId: h.cropId,
      base: def.baseIncome,
      others,
      eventSum,
      events,
      raw,
      floor: def.floor,
      gain,
    });
  }
  s.lastPayouts = payouts;
  s.lastHarvest = details;
  revealPendingCurses(s);
  recordRoundSnapshot(s);
  return s;
}

function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0);
}

function recordRoundSnapshot(s: GameState): void {
  const n = s.players.length;
  const planted = zeros(n);
  const passed = zeros(n);
  const spent = zeros(n);
  for (const log of s.roundActions) {
    if (log.kind === "plant") {
      planted[log.seat] = (planted[log.seat] ?? 0) + 1;
      spent[log.seat] = (spent[log.seat] ?? 0) + (log.cost ?? 0);
    } else {
      passed[log.seat] = (passed[log.seat] ?? 0) + 1;
    }
  }
  const crowding = zeros(n);
  const eventSum = zeros(n);
  for (const d of s.lastHarvest) {
    crowding[d.seat] = (crowding[d.seat] ?? 0) + d.others;
    eventSum[d.seat] = (eventSum[d.seat] ?? 0) + d.eventSum;
  }
  const snap: RoundSnapshot = {
    round: s.round,
    coins: s.players.map((p) => p.coins),
    harvesting: s.players.map(
      (p) => p.plots.filter((plot) => plot.owned && plot.white === 0 && plot.green > 0 && plot.cropCard).length,
    ),
    owned: s.players.map((p) => p.plots.filter((plot) => plot.owned).length),
    planted,
    passed,
    spent,
    harvested: [...s.lastPayouts],
    crowding,
    eventSum,
  };
  const last = s.roundLog.at(-1);
  if (last?.round === s.round) s.roundLog[s.roundLog.length - 1] = snap;
  else s.roundLog.push(snap);
}

function tickPlots(s: GameState): void {
  const snapshots: { seat: number; plot: Plot }[] = [];
  for (const player of s.players) {
    for (const plot of player.plots) {
      snapshots.push({ seat: player.seat, plot: { ...plot, cropCard: plot.cropCard } });
    }
  }
  for (const snap of snapshots) {
    const player = s.players[snap.seat]!;
    const plot = player.plots[snap.plot.index]!;
    const start = snap.plot;
    if (!start.owned) continue;
    if (start.white > 0) {
      plot.white = start.white - 1;
      if (plot.white === 0 && plot.cropCard) {
        plot.green = cropDef(plot.cropCard.cropId).harvest;
      }
    } else if (start.green > 0) {
      plot.green = start.green - 1;
      if (plot.green === 0 && plot.cropCard) {
        plot.red = cropDef(plot.cropCard.cropId).cooldown;
      }
    } else if (start.red > 0) {
      plot.red = start.red - 1;
    }
  }
}

export function concludeRound(state: GameState): GameState {
  const s = cloneState(state);
  tickPlots(s);
  if (s.round >= s.lastRound) {
    s.phase = "gameOver";
    s.actingSeat = null;
    const best = Math.max(...s.players.map((p) => p.coins));
    s.winnerSeats = s.players.filter((p) => p.coins === best).map((p) => p.seat);
    return s;
  }
  s.round += 1;
  s.turnIndex = 0;
  s.actingSeat = s.turnOrder[0]!;
  s.phase = "turn";
  s.roundActions = [];
  return s;
}

export function applyIncome(state: GameState): GameState {
  return concludeRound(applyHarvest(state));
}
