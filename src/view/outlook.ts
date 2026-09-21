import { cropDef, cropName, cropSpec, formatDelta } from "../engine/catalog.js";
import { harvestIncome } from "../engine/income.js";
import { eventEffectEnd, type PublicEvent, type PublicView } from "../engine/types.js";

export type HarvestKind = "full" | "limited" | "missed";
export type EventTone = "plus" | "minus" | "none" | "mixed";

export type CropOutlook = {
  harvestKind: HarvestKind;
  harvestOutlook: string;
  eventTone: EventTone;
  eventLines: string[];
};

type WindowedEvent = {
  cropId: string;
  delta: number;
  from: number;
  to: number;
  label: string;
};

export function harvestRoundsIfPlanted(
  round: number,
  lastRound: number,
  wait: number,
  harvest: number,
): number[] {
  const first = round + wait;
  if (first > lastRound) return [];
  const last = Math.min(lastRound, first + harvest - 1);
  const out: number[] = [];
  for (let r = first; r <= last; r++) out.push(r);
  return out;
}

export function formatRoundSpan(rounds: number[]): string {
  if (rounds.length === 0) return "";
  if (rounds.length === 1) return `ラウンド${rounds[0]}`;
  const last = rounds[rounds.length - 1]!;
  const contiguous = last === rounds[0]! + rounds.length - 1;
  if (contiguous) return `ラウンド${rounds[0]}〜${last}`;
  return `ラウンド${rounds.join("・")}`;
}

function eventLabel(from: number, kind: "linger" | "now" | "preview"): string {
  if (kind === "linger") return `継続R${from}`;
  return `R${from}`;
}

function startedRound(e: PublicEvent, fallback: number): number {
  return e.activatedRound ?? fallback;
}

export function visibleEventWindows(view: PublicView): WindowedEvent[] {
  const R = view.round;
  const out: WindowedEvent[] = [];
  const n = view.eventActive.length;
  view.eventActive.forEach((e, i) => {
    const started = startedRound(e, R - (n - i));
    out.push({
      cropId: e.cropId,
      delta: e.delta,
      from: started,
      to: eventEffectEnd(started),
      label: eventLabel(started, "linger"),
    });
  });
  view.eventRow.forEach((e, i) => {
    const started = i === 0 ? startedRound(e, R) : R + i;
    out.push({
      cropId: e.cropId,
      delta: e.delta,
      from: started,
      to: eventEffectEnd(started),
      label: eventLabel(started, i === 0 ? "now" : "preview"),
    });
  });
  return out;
}

function hitsAt(windows: WindowedEvent[], cropId: string, round: number): WindowedEvent[] {
  return windows.filter((w) => w.cropId === cropId && w.from <= round && round <= w.to);
}

function toneFromSums(sums: number[]): EventTone {
  const nonzero = sums.filter((s) => s !== 0);
  if (nonzero.length === 0) return "none";
  const plus = nonzero.some((s) => s > 0);
  const minus = nonzero.some((s) => s < 0);
  if (plus && minus) return "mixed";
  return plus ? "plus" : "minus";
}

function formatWindow(w: WindowedEvent): string {
  return `${w.label}${formatDelta(w.delta)}（R${w.from}〜R${w.to}）`;
}

export function harvestRoundsForPlot(
  plot: { owned: boolean; cropId: string | null; white: number; green: number },
  round: number,
  lastRound: number,
): number[] {
  if (!plot.owned || !plot.cropId) return [];
  if (plot.white > 0) {
    return harvestRoundsIfPlanted(round, lastRound, plot.white, cropDef(plot.cropId).harvest);
  }
  if (plot.green > 0) {
    const out: number[] = [];
    for (let i = 0; i < plot.green; i++) {
      const r = round + i;
      if (r <= lastRound) out.push(r);
    }
    return out;
  }
  return [];
}

export function formatHarvestWhen(rounds: number[]): string {
  if (rounds.length === 0) return "ゲーム終了までに収穫なし";
  if (rounds.length === 1) return `R${rounds[0]}にて収穫`;
  const last = rounds[rounds.length - 1]!;
  const contiguous = last === rounds[0]! + rounds.length - 1;
  if (contiguous) return `R${rounds[0]}〜R${last}にて収穫`;
  return `R${rounds.join("・")}にて収穫`;
}

type PlotRef = { seat: number; plotIndex: number; cropId: string; rounds: number[] };

export function harvestSchedules(view: PublicView): PlotRef[] {
  const out: PlotRef[] = [];
  for (const player of view.players) {
    for (const plot of player.plots) {
      if (!plot.cropId) continue;
      const rounds = harvestRoundsForPlot(plot, view.round, view.lastRound);
      if (rounds.length === 0) continue;
      out.push({ seat: player.seat, plotIndex: plot.index, cropId: plot.cropId, rounds });
    }
  }
  return out;
}

function othersHarvesting(
  schedules: PlotRef[],
  cropId: string,
  round: number,
  self?: { seat: number; plotIndex: number },
): number {
  return schedules.filter(
    (s) =>
      s.cropId === cropId &&
      s.rounds.includes(round) &&
      !(self && s.seat === self.seat && s.plotIndex === self.plotIndex),
  ).length;
}

export function lastKnownEventStart(view: PublicView): number {
  if (view.eventRow.length === 0) return view.round - 1;
  return view.round + view.eventRow.length - 1;
}

function hitLabel(h: WindowedEvent): string {
  return `${cropName(h.cropId)}${formatDelta(h.delta)}・R${h.from}〜R${h.to}`;
}

function formatIncomeForecast(
  hr: number,
  cropId: string,
  others: number,
  hits: WindowedEvent[],
  unknownNew: boolean,
): string {
  const def = cropDef(cropId);
  const eventSum = hits.reduce((s, w) => s + w.delta, 0);
  const gain = harvestIncome(def.baseIncome, def.floor, others, eventSum);
  const raw = def.baseIncome - others + eventSum;
  const ev =
    hits.length === 0
      ? "公開分なし"
      : `公開分${formatDelta(eventSum)}（${hits.map(hitLabel).join("、")}）`;
  const rival = others === 0 ? "競合なし" : `競合-${others}`;
  const income = gain !== raw ? `公開分${gain}G（最低保証）` : `公開分${gain}G`;
  const unknown = unknownNew ? " ※そのラウンドの新規イベントは未公開" : "";
  return `ラウンド${hr} ${ev} → ${rival} → ${income}${unknown}`;
}

function forecastsForRounds(
  view: PublicView,
  cropId: string,
  rounds: number[],
  self?: { seat: number; plotIndex: number },
): { lines: string[]; tone: EventTone } {
  const windows = visibleEventWindows(view).filter((w) => w.cropId === cropId);
  const schedules = harvestSchedules(view);
  const knownUntil = lastKnownEventStart(view);
  const sums: number[] = [];
  const lines = rounds.map((hr) => {
    const hits = hitsAt(windows, cropId, hr);
    sums.push(hits.reduce((s, w) => s + w.delta, 0));
    return formatIncomeForecast(
      hr,
      cropId,
      othersHarvesting(schedules, cropId, hr, self),
      hits,
      hr > knownUntil,
    );
  });
  return { lines, tone: toneFromSums(sums) };
}

export function cropOutlook(view: PublicView, cropId: string): CropOutlook {
  const def = cropDef(cropId);
  const rounds = harvestRoundsIfPlanted(view.round, view.lastRound, def.wait, def.harvest);
  const windows = visibleEventWindows(view).filter((w) => w.cropId === cropId);
  const first = view.round + def.wait;

  if (rounds.length === 0) {
    const harvestOutlook = `今から植えても、ゲーム終了（ラウンド${view.lastRound}）までに収穫が間に合わない（初収穫はラウンド${first}）`;
    const eventLines =
      windows.length === 0
        ? ["イベント見込み: この作物への公開イベントなし"]
        : [
            `イベント見込み: 公開分は収穫に届かない（${windows.map(formatWindow).join("、")}）`,
          ];
    return { harvestKind: "missed", harvestOutlook, eventTone: "none", eventLines };
  }

  const harvestKind: HarvestKind = rounds.length < def.harvest ? "limited" : "full";
  const span = formatRoundSpan(rounds);
  const when = harvestKind === "limited" && rounds.length === 1 ? `${span}のみ` : span;
  const harvestOutlook =
    harvestKind === "limited"
      ? `今から植えると、収穫は${rounds.length}/${def.harvest}回（${when}）。通常より${def.harvest - rounds.length}回少ない`
      : `今から植えると、収穫は通常どおり${def.harvest}回（${when}）`;

  const { lines, tone } = forecastsForRounds(view, cropId, rounds);
  return {
    harvestKind,
    harvestOutlook,
    eventTone: tone,
    eventLines: ["イベント見込み:", ...lines],
  };
}

export function plotIncomeOutlook(
  view: PublicView,
  plot: { index: number; owned: boolean; cropId: string | null; white: number; green: number },
  seat: number,
): { eventLines: string[]; eventTone: EventTone } {
  if (!plot.cropId) return { eventLines: [], eventTone: "none" };
  const rounds = harvestRoundsForPlot(plot, view.round, view.lastRound);
  if (rounds.length === 0) return { eventLines: [], eventTone: "none" };
  const { lines, tone } = forecastsForRounds(view, plot.cropId, rounds, {
    seat,
    plotIndex: plot.index,
  });
  return { eventLines: ["イベント見込み:", ...lines], eventTone: tone };
}

export function describeMarketCard(
  view: PublicView,
  cropId: string,
  index: number,
): {
  index: number;
  name: string;
  spec: string;
} & CropOutlook {
  const look = cropOutlook(view, cropId);
  return {
    index,
    name: cropName(cropId),
    spec: cropSpec(cropId),
    ...look,
  };
}
