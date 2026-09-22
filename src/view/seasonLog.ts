import { cropShortName } from "../engine/catalog.js";
import type { GameState } from "../engine/types.js";

export type SeasonActionRow = {
  seat: number;
  cells: string[];
};

export function seasonActionRows(state: GameState): SeasonActionRow[] {
  const order = state.turnOrder.length > 0 ? state.turnOrder : state.players.map((p) => p.seat);
  const cells = new Map<number, string[]>();
  for (const seat of order) cells.set(seat, []);
  for (const a of state.seasonActions) {
    const label = a.kind === "pass" ? "パス" : cropShortName(a.cropId ?? "");
    cells.get(a.seat)?.push(label);
  }
  return order.map((seat) => ({ seat, cells: cells.get(seat) ?? [] }));
}
