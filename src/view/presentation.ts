import { cropBlurb, cropDef, cropName, cropShortName, cropSpec, cropTypeLabel } from "../engine/catalog.js";
import { acquireCost, type Action, type PublicView } from "../engine/types.js";
import { describeBoardEvents, type EventChip } from "./eventCopy.js";
import { describeMarketCard, type EventTone, type HarvestKind } from "./outlook.js";
import { describePlot, type PlotStatus } from "./status.js";

export type { EventChip };
export type MarketChip = {
  index: number;
  cropId: string;
  cropName: string;
  shortName: string;
  cost: number;
  wait: number;
  harvest: number;
  cooldown: number;
  base: number;
  floor: number;
  typeLabel: string;
  spec: string;
  harvestOutlook: string;
  harvestKind: HarvestKind;
  eventLines: string[];
  eventTone: EventTone;
  enabled: boolean;
};
export type PlayerRow = {
  seat: number;
  name: string;
  kind: "human" | "cpu";
  coins: number;
  isYou: boolean;
  isActing: boolean;
  plots: PlotStatus[];
};
export type ActionChip = { action: Action; label: string; key: string };
export type BoardPresentation = {
  title: string;
  phaseLine: string;
  harvestEventLine: string;
  previewEventLine: string;
  harvestEvents: EventChip[];
  previewEvents: EventChip[];
  market: MarketChip[];
  cropDeckCount: number;
  eventDeckCount: number;
  cropDiscardNames: string[];
  cropsInGame: {
    id: string;
    name: string;
    spec: string;
    blurb: string;
    cost: number;
    wait: number;
    harvest: number;
    cooldown: number;
    base: number;
    floor: number;
    typeLabel: string;
  }[];
  players: PlayerRow[];
  actions: ActionChip[];
  message: string | null;
};

function modeLabel(mode: PublicView["mode"]): string {
  return mode === "basic" ? "基本" : "上級";
}

function phaseLine(view: PublicView, youSeat: number | null): string {
  if (view.phase === "gameOver") {
    return view.season >= view.seasonCount ? "マッチ終了" : "シーズン終了";
  }
  if (view.phase === "income") return "収入処理の前";
  if (view.phase === "eventUpdate") return "イベント更新中";
  if (view.phase === "lobby") return "ロビー";
  if (view.actingSeat === null) return "手番待ち";
  const you = view.actingSeat === youSeat ? "（あなた）" : "";
  const name = view.players.find((p) => p.seat === view.actingSeat)?.name ?? "";
  return `手番: 席${view.actingSeat} ${name}${you}`;
}

function ownedCount(view: PublicView, seat: number): number {
  return view.players.find((p) => p.seat === seat)?.plots.filter((p) => p.owned).length ?? 0;
}

function orderedPlayers(view: PublicView): PublicView["players"] {
  const bySeat = new Map(view.players.map((p) => [p.seat, p]));
  const order = view.turnOrder.length > 0 ? view.turnOrder : view.players.map((p) => p.seat);
  return order.flatMap((seat) => {
    const player = bySeat.get(seat);
    return player ? [player] : [];
  });
}

function actionLabel(view: PublicView, action: Action, youSeat: number | null): string {
  if (action.type === "pass") return "パス";
  const card = view.market[action.marketIndex];
  const name = card ? cropName(card.cropId) : "?";
  const grow = card ? cropDef(card.cropId).cost : 0;
  if (action.target === "newLand") {
    const acq = youSeat === null ? 0 : acquireCost(ownedCount(view, youSeat));
    return `${name}を新しい農地へ（取得${acq}G+栽培${grow}G=${acq + grow}G）`;
  }
  return `${name}を農地${action.target.plotIndex + 1}へ（${grow}G）`;
}

function actionKey(action: Action, index: number): string {
  if (action.type === "pass") return "P";
  if (action.target === "newLand") return `N${action.marketIndex + 1}`;
  return String(index);
}

export function toPresentation(view: PublicView, youSeat: number | null): BoardPresentation {
  const actions = (view.legalActions ?? []).map((action, i) => ({
    action,
    label: actionLabel(view, action, youSeat),
    key: actionKey(action, i),
  }));
  const events = describeBoardEvents(view);
  return {
    title: `畑作  ${modeLabel(view.mode)}  シーズン ${view.season}/${view.seasonCount}  ラウンド ${view.round}/${view.lastRound}`,
    phaseLine: phaseLine(view, youSeat),
    harvestEventLine: events.harvestLine,
    previewEventLine: events.previewLine,
    harvestEvents: events.harvestEvents,
    previewEvents: events.previewEvents,
    market: view.market.map((c, i) => {
      const def = cropDef(c.cropId);
      const m = describeMarketCard(view, c.cropId, i);
      return {
        index: i,
        cropId: c.cropId,
        cropName: m.name,
        shortName: cropShortName(c.cropId),
        cost: def.cost,
        wait: def.wait,
        harvest: def.harvest,
        cooldown: def.cooldown,
        base: def.baseIncome,
        floor: def.floor,
        typeLabel: cropTypeLabel(c.cropId),
        spec: m.spec,
        harvestOutlook: m.harvestOutlook,
        harvestKind: m.harvestKind,
        eventLines: m.eventLines,
        eventTone: m.eventTone,
        enabled: (view.legalActions ?? []).some((a) => a.type === "plant" && a.marketIndex === i),
      };
    }),
    cropDeckCount: view.cropDeckCount,
    eventDeckCount: view.eventDeckCount,
    cropDiscardNames: view.cropDiscard.map((c) => cropName(c.cropId)),
    cropsInGame: view.cropIdsInGame.map((id) => {
      const def = cropDef(id);
      return {
        id,
        name: cropName(id),
        spec: cropSpec(id),
        blurb: cropBlurb(id),
        cost: def.cost,
        wait: def.wait,
        harvest: def.harvest,
        cooldown: def.cooldown,
        base: def.baseIncome,
        floor: def.floor,
        typeLabel: cropTypeLabel(id),
      };
    }),
    players: orderedPlayers(view).map((p) => ({
      seat: p.seat,
      name: p.name,
      kind: p.kind,
      coins: p.coins,
      isYou: p.seat === youSeat,
      isActing: p.seat === view.actingSeat,
      plots: p.plots.map((plot) => describePlot(plot, { view, seat: p.seat })),
    })),
    actions,
    message: view.message ?? null,
  };
}
