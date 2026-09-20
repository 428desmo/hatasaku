import { cropDef, cropName, formatDelta } from "../engine/catalog.js";
import {
  acquireCost,
  plotKind,
  type Action,
  type PublicView,
} from "../engine/types.js";

export type EventChip = {
  cropName: string;
  delta: number;
  current: boolean;
};

export type MarketChip = {
  index: number;
  cropName: string;
  cost: number;
  enabled: boolean;
};

export type PlotChip = {
  index: number;
  kind: "unowned" | "waiting" | "harvesting" | "empty";
  cropName: string | null;
  previousName: string | null;
  white: number;
  green: number;
  red: number;
};

export type PlayerRow = {
  seat: number;
  name: string;
  kind: "human" | "cpu";
  coins: number;
  isYou: boolean;
  isActing: boolean;
  plots: PlotChip[];
};

export type ActionChip = {
  action: Action;
  label: string;
  key: string;
};

export type BoardPresentation = {
  title: string;
  phaseLine: string;
  eventRow: EventChip[];
  eventActive: EventChip[];
  market: MarketChip[];
  cropDeckCount: number;
  eventDeckCount: number;
  cropDiscardNames: string[];
  cropsInGame: string[];
  players: PlayerRow[];
  actions: ActionChip[];
  message: string | null;
};

function modeLabel(mode: PublicView["mode"]): string {
  return mode === "tutorial" ? "チュートリアル" : "本格";
}

function phaseLine(view: PublicView, youSeat: number | null): string {
  if (view.phase === "gameOver") return "終了";
  if (view.phase === "income") return "収入処理中";
  if (view.phase === "eventUpdate") return "イベント更新中";
  if (view.phase === "lobby") return "ロビー";
  if (view.actingSeat === null) return "手番待ち";
  const you = view.actingSeat === youSeat ? "（あなた）" : "";
  const name = view.players.find((p) => p.seat === view.actingSeat)?.name ?? "";
  return `手番: 席${view.actingSeat} ${name}${you}`;
}

function plotChip(plot: PublicView["players"][0]["plots"][0]): PlotChip {
  const kind = plotKind(plot);
  const name = plot.cropId ? cropName(plot.cropId) : null;
  return {
    index: plot.index,
    kind,
    cropName: kind === "waiting" || kind === "harvesting" ? name : null,
    previousName: kind === "empty" ? name : null,
    white: plot.white,
    green: plot.green,
    red: plot.red,
  };
}

function actionEnabled(view: PublicView, action: Action): boolean {
  return (view.legalActions ?? []).some((a) => actionsEqual(a, action));
}

function actionsEqual(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "pass" || b.type === "pass") return true;
  if (a.type !== "plant" || b.type !== "plant") return false;
  if (a.marketIndex !== b.marketIndex) return false;
  if (a.target === "newLand" || b.target === "newLand") return a.target === b.target;
  return a.target.plotIndex === b.target.plotIndex;
}

function ownedCount(view: PublicView, seat: number): number {
  return view.players.find((p) => p.seat === seat)?.plots.filter((p) => p.owned).length ?? 0;
}

function actionLabel(view: PublicView, action: Action, youSeat: number | null): string {
  if (action.type === "pass") return "パス";
  const card = view.market[action.marketIndex];
  const name = card ? cropName(card.cropId) : "?";
  const grow = card ? cropDef(card.cropId).cost : 0;
  if (action.target === "newLand") {
    const acq = youSeat === null ? 0 : acquireCost(ownedCount(view, youSeat));
    return `場札${action.marketIndex + 1} ${name} を 新しい農地へ (取得${acq}+栽培${grow}=${acq + grow}G)`;
  }
  return `場札${action.marketIndex + 1} ${name} を 農地${action.target.plotIndex + 1}へ (${grow}G)`;
}

function actionKey(action: Action, index: number): string {
  if (action.type === "pass") return "P";
  if (action.target === "newLand") return "N" + String(action.marketIndex + 1);
  return String(index);
}

export function toPresentation(view: PublicView, youSeat: number | null): BoardPresentation {
  const actions = (view.legalActions ?? []).map((action, i) => ({
    action,
    label: actionLabel(view, action, youSeat),
    key: actionKey(action, i),
  }));

  return {
    title: `畑作  ${modeLabel(view.mode)}  ラウンド ${view.round}/${view.lastRound}`,
    phaseLine: phaseLine(view, youSeat),
    eventRow: view.eventRow.map((e, i) => ({
      cropName: cropName(e.cropId),
      delta: e.delta,
      current: i === 0,
    })),
    eventActive: view.eventActive.map((e) => ({
      cropName: cropName(e.cropId),
      delta: e.delta,
      current: false,
    })),
    market: view.market.map((c, i) => ({
      index: i,
      cropName: cropName(c.cropId),
      cost: cropDef(c.cropId).cost,
      enabled: actionEnabled(view, { type: "plant", marketIndex: i, target: "newLand" }) ||
        (view.legalActions ?? []).some(
          (a) => a.type === "plant" && a.marketIndex === i,
        ),
    })),
    cropDeckCount: view.cropDeckCount,
    eventDeckCount: view.eventDeckCount,
    cropDiscardNames: view.cropDiscard.map((c) => cropName(c.cropId)),
    cropsInGame: view.cropIdsInGame.map(cropName),
    players: view.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      kind: p.kind,
      coins: p.coins,
      isYou: p.seat === youSeat,
      isActing: p.seat === view.actingSeat,
      plots: p.plots.map(plotChip),
    })),
    actions,
    message: view.message ?? null,
  };
}
