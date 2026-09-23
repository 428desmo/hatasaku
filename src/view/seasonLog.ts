import { cropShortName } from "../engine/catalog.js";
import type { GameState } from "../engine/types.js";

export type SeasonActionRow = {
  seat: number;
  cells: string[];
};

export type ActionPackRange = {
  from: number;
  to: number;
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

export function actionPackRanges(lastRound: number): ActionPackRange[] {
  const out: ActionPackRange[] = [];
  for (let from = 1; from <= lastRound; from += 3) {
    out.push({ from, to: Math.min(from + 2, lastRound) });
  }
  return out;
}

export function shortActionLabel(label: string): string {
  return label.length > 3 ? label.slice(0, 3) : label;
}

export function packRangeLabel(range: ActionPackRange): string {
  return range.from === range.to ? `R${range.from}` : `R${range.from}-${range.to}`;
}

export type MixShare = {
  label: string;
  count: number;
  pass: boolean;
};

export function mixShares(cells: string[], cropOrder: string[]): MixShare[] {
  const counts = new Map<string, number>();
  for (const c of cells) counts.set(c, (counts.get(c) ?? 0) + 1);
  const out: MixShare[] = [];
  for (const label of cropOrder) {
    const n = counts.get(label);
    if (n) out.push({ label, count: n, pass: false });
  }
  for (const [label, n] of counts) {
    if (label === "パス" || cropOrder.includes(label)) continue;
    out.push({ label, count: n, pass: false });
  }
  const pass = counts.get("パス");
  if (pass) out.push({ label: "パス", count: pass, pass: true });
  return out;
}
