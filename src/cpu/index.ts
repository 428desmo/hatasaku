import type { Action, PublicView } from "../engine/types.js";
import type { Rng } from "../engine/rng.js";
import { cropDef } from "../engine/catalog.js";
import { acquireCost } from "../engine/types.js";

export function chooseRandom(view: PublicView, rng: Rng): Action {
  const legal = view.legalActions ?? [{ type: "pass" as const }];
  return legal[rng.nextInt(legal.length)] ?? { type: "pass" };
}

export function chooseIrr(view: PublicView): Action {
  const legal = view.legalActions ?? [{ type: "pass" as const }];
  let best: Action = { type: "pass" };
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const action of legal) {
    const score = scoreAction(view, action);
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

function scoreAction(view: PublicView, action: Action): number {
  if (action.type === "pass") return 0;
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
