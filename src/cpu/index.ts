import type { Action, PublicView } from "../engine/types.js";
import { CURSE_DURATION } from "../engine/types.js";
import type { Rng } from "../engine/rng.js";
import { cropDef } from "../engine/catalog.js";
import { acquireCost } from "../engine/types.js";
import { harvestRoundsForPlot } from "../view/outlook.js";

export function chooseRandom(view: PublicView, rng: Rng): Action {
  const legal = view.legalActions ?? [{ type: "pass" as const }];
  return legal[rng.nextInt(legal.length)] ?? { type: "pass" };
}

export function chooseIrr(view: PublicView): Action {
  const legal = view.legalActions ?? [{ type: "pass" as const }];
  const curses = legal.filter((a): a is Extract<Action, { type: "curse" }> => a.type === "curse");
  let bestCurse: Action | null = null;
  let bestCurseScore = 0;
  for (const action of curses) {
    const score = curseScore(view, action.cropId);
    if (score > bestCurseScore) {
      bestCurseScore = score;
      bestCurse = action;
    }
  }
  if (bestCurse) return bestCurse;

  let best: Action = { type: "pass" };
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const action of legal) {
    if (action.type === "curse") continue;
    const score = scoreAction(view, action);
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

function curseHitsForSeat(view: PublicView, cropId: string, seat: number): number {
  const from = view.round + 1;
  const to = Math.min(view.lastRound, from + CURSE_DURATION - 1);
  const player = view.players.find((p) => p.seat === seat);
  if (!player || from > to) return 0;
  let n = 0;
  for (const plot of player.plots) {
    if (plot.cropId !== cropId) continue;
    for (const r of harvestRoundsForPlot(plot, view.round, view.lastRound)) {
      if (r >= from && r <= to) n += 1;
    }
  }
  return n;
}

function curseScore(view: PublicView, cropId: string): number {
  const self = view.actingSeat;
  let others = 0;
  let mine = 0;
  for (const player of view.players) {
    const hits = curseHitsForSeat(view, cropId, player.seat);
    if (player.seat === self) mine += hits;
    else others += hits;
  }
  return others - mine * 2;
}

function scoreAction(view: PublicView, action: Action): number {
  if (action.type === "pass") return 0;
  if (action.type !== "plant") return -999;
  const card = view.market[action.marketIndex];
  if (!card) return -999;
  const def = cropDef(card.cropId);
  const remaining = view.lastRound - view.round + 1;
  if (def.wait >= remaining) return -50;
  const harvestRounds = Math.min(def.harvest, remaining - def.wait);
  const player = view.players.find((p) => p.seat === view.actingSeat);
  const owned = player?.plots.filter((p) => p.owned).length ?? 0;
  const cost =
    action.target === "newLand" ? acquireCost(owned) + def.cost : def.cost;
  return harvestRounds * def.baseIncome - cost * 2;
}

export function chooseById(id: string | undefined, view: PublicView, rng: Rng): Action {
  if (id === "irr") return chooseIrr(view);
  if (id === "irr_noise25") {
    return rng.next() < 0.25 ? chooseRandom(view, rng) : chooseIrr(view);
  }
  return chooseRandom(view, rng);
}
