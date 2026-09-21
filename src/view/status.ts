import { cropDef, cropName, cropShortName, cropSpec } from "../engine/catalog.js";
import { plotKind, type PlotView, type PublicView } from "../engine/types.js";
import { formatHarvestWhen, harvestRoundsForPlot, plotIncomeOutlook, type EventTone } from "./outlook.js";

export type StatusKind = "unowned" | "wait" | "harvest" | "cooldown" | "ready";

export type PlotStatus = {
  index: number;
  kind: StatusKind;
  owned: boolean;
  cropId: string | null;
  shortName: string;
  cropName: string | null;
  white: number;
  green: number;
  red: number;
  wait: number;
  harvest: number;
  cooldown: number;
  base: number | null;
  floor: number | null;
  title: string;
  status: string;
  spec: string | null;
  eventLines: string[];
  eventTone: EventTone;
};

export type PlotContext = { view: PublicView; seat: number };

export function describePlot(plot: PlotView, ctx?: PlotContext): PlotStatus {
  const index = plot.index;
  const look = ctx ? plotIncomeOutlook(ctx.view, plot, ctx.seat) : { eventLines: [] as string[], eventTone: "none" as const };
  const eventLines = look.eventLines;
  const eventTone = look.eventTone;
  const rounds = ctx ? harvestRoundsForPlot(plot, ctx.view.round, ctx.view.lastRound) : [];
  const when = ctx ? formatHarvestWhen(rounds) : "";
  const def = plot.cropId ? cropDef(plot.cropId) : null;
  const printed = {
    owned: plot.owned,
    cropId: plot.cropId,
    shortName: plot.cropId ? cropShortName(plot.cropId) : "—",
    cropName: plot.cropId ? cropName(plot.cropId) : null,
    white: plot.white,
    green: plot.green,
    red: plot.red,
    wait: def?.wait ?? 0,
    harvest: def?.harvest ?? 0,
    cooldown: def?.cooldown ?? 0,
    base: def?.baseIncome ?? null,
    floor: def?.floor ?? null,
  };

  if (!plot.owned) {
    return {
      index,
      kind: "unowned",
      ...printed,
      shortName: "—",
      title: "未取得",
      status: "まだ開墾していない",
      spec: null,
      eventLines: [],
      eventTone: "none",
    };
  }
  const name = plot.cropId ? cropName(plot.cropId) : "作物";
  const spec = plot.cropId ? cropSpec(plot.cropId) : null;
  const kind = plotKind(plot);
  if (kind === "waiting") {
    const status = when
      ? `待機中 — 収穫まであと${plot.white}ラウンド（${when}）`
      : `待機中 — 収穫まであと${plot.white}ラウンド`;
    return { index, kind: "wait", ...printed, title: name, status, spec, eventLines, eventTone };
  }
  if (kind === "harvesting") {
    const status = when
      ? `収穫中 — あと${plot.green}ラウンド収入がある（${when}）`
      : `収穫中 — あと${plot.green}ラウンド収入がある`;
    return { index, kind: "harvest", ...printed, title: name, status, spec, eventLines, eventTone };
  }
  if (plot.red > 0) {
    return {
      index,
      kind: "cooldown",
      ...printed,
      title: `空き（前作${name}）`,
      status: `クールダウン、あと${plot.red}ラウンド`,
      spec,
      eventLines: [],
      eventTone: "none",
    };
  }
  return {
    index,
    kind: "ready",
    ...printed,
    title: `空き（前作${name}）`,
    status: "どの作物でも植えられる",
    spec,
    eventLines: [],
    eventTone: "none",
  };
}
