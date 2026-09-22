import { cropDef } from "./catalog.js";
import { curseActions } from "./curse.js";
import { acquireCost, type Action, type GameState, type Plot } from "./types.js";

export function ownedCount(player: GameState["players"][number]): number {
  return player.plots.filter((p) => p.owned).length;
}

export function nextUnownedIndex(player: GameState["players"][number]): number | null {
  const plot = player.plots.find((p) => !p.owned);
  return plot ? plot.index : null;
}

export function isEmpty(plot: Plot): boolean {
  return plot.owned && plot.white === 0 && plot.green === 0;
}

export function sameCropBlocked(plot: Plot, cropId: string): boolean {
  return plot.cropCard?.cropId === cropId && plot.red > 0;
}

export function listLegalActions(state: GameState): Action[] {
  if (state.phase !== "turn" || state.actingSeat === null) return [];
  const player = state.players[state.actingSeat];
  if (!player) return [];

  const actions: Action[] = [{ type: "pass" }, ...curseActions(state)];
  for (let marketIndex = 0; marketIndex < state.crop.market.length; marketIndex++) {
    const card = state.crop.market[marketIndex];
    if (!card) continue;
    const grow = cropDef(card.cropId).cost;

    const unowned = nextUnownedIndex(player);
    if (unowned !== null) {
      const cost = acquireCost(ownedCount(player)) + grow;
      if (player.coins >= cost) {
        actions.push({ type: "plant", marketIndex, target: "newLand" });
      }
    }

    for (const plot of player.plots) {
      if (!isEmpty(plot)) continue;
      if (sameCropBlocked(plot, card.cropId)) continue;
      if (player.coins >= grow) {
        actions.push({ type: "plant", marketIndex, target: { plotIndex: plot.index } });
      }
    }
  }
  return actions;
}

export function actionsEqual(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "pass" || b.type === "pass") return true;
  if (a.type === "curse" && b.type === "curse") return a.cropId === b.cropId;
  if (a.type !== "plant" || b.type !== "plant") return false;
  if (a.marketIndex !== b.marketIndex) return false;
  if (a.target === "newLand" || b.target === "newLand") return a.target === b.target;
  return a.target.plotIndex === b.target.plotIndex;
}

export function isLegal(state: GameState, action: Action): boolean {
  return listLegalActions(state).some((a) => actionsEqual(a, action));
}
