import { cropName, cropShortName, formatDelta } from "../engine/catalog.js";
import { CURSE_DELTA, eventEffectEnd, type PublicEvent, type PublicView } from "../engine/types.js";

export type EventChip = {
  cropName: string;
  shortName: string;
  cropId: string;
  delta: number;
  text: string;
  span: string;
  role: "harvest" | "preview";
  lingering: boolean;
  from: number;
  to: number;
  kind?: "event" | "curse" | "curse-hidden";
  bySeat?: number;
};

export type BoardEvents = {
  harvestEvents: EventChip[];
  previewEvents: EventChip[];
  curseEvents: EventChip[];
  harvestLine: string;
  previewLine: string;
};

function startedRound(e: PublicEvent, fallback: number): number {
  return e.activatedRound ?? fallback;
}

function body(e: { cropId: string; delta: number }): string {
  return `${cropName(e.cropId)} ${formatDelta(e.delta)}`;
}

function windowOf(from: number, lastRound: number): { from: number; to: number; span: string } {
  const rawTo = eventEffectEnd(from);
  return clipEventWindow(from, rawTo, lastRound);
}

export function clipEventWindow(from: number, rawTo: number, lastRound: number): {
  from: number;
  to: number;
  span: string;
} {
  const to = Math.min(rawTo, lastRound);
  const span = from >= to ? `R${from}` : `R${from}-${to}`;
  return { from, to, span };
}

function spanPhrase(from: number, to: number): string {
  return from >= to ? `R${from}` : `R${from}〜R${to}`;
}

export function describeBoardEvents(view: PublicView): BoardEvents {
  const R = view.round;
  const last = view.lastRound;
  const n = view.eventActive.length;
  const harvestEvents: EventChip[] = [];

  view.eventActive.forEach((e, i) => {
    const from = startedRound(e, R - (n - i));
    if (from > last) return;
    const { to, span } = windowOf(from, last);
    harvestEvents.push({
      cropName: cropName(e.cropId),
      shortName: cropShortName(e.cropId),
      cropId: e.cropId,
      delta: e.delta,
      text: `${body(e)}（継続・${spanPhrase(from, to)}）`,
      span,
      role: "harvest",
      lingering: true,
      from,
      to,
    });
  });

  const left = view.eventRow[0];
  if (left) {
    const from = startedRound(left, R);
    if (from <= last) {
      const { to, span } = windowOf(from, last);
      harvestEvents.push({
        cropName: cropName(left.cropId),
        shortName: cropShortName(left.cropId),
        cropId: left.cropId,
        delta: left.delta,
        text: `${body(left)}（${spanPhrase(from, to)}）`,
        span,
        role: "harvest",
        lingering: false,
        from,
        to,
      });
    }
  }

  const previewEvents: EventChip[] = view.eventRow.slice(1).flatMap((e, i) => {
    const from = R + i + 1;
    if (from > last) return [];
    const { to, span } = windowOf(from, last);
    return [
      {
        cropName: cropName(e.cropId),
        shortName: cropShortName(e.cropId),
        cropId: e.cropId,
        delta: e.delta,
        text: `R${from} ${body(e)}（${spanPhrase(from, to)}）`,
        span,
        role: "preview" as const,
        lingering: false,
        from,
        to,
      },
    ];
  });

  const harvestLine = `R${R} 収穫イベント: ${harvestEvents.map((e) => e.text).join("　") || "なし"}`;
  const previewLine = `予告（各2ラウンド有効）: ${previewEvents.map((e) => e.text).join("　") || "なし"}`;
  const curseEvents: EventChip[] = (view.curses ?? [])
    .filter((c) => c.to >= R && c.from <= last)
    .map((c) => {
      const live = c.from <= R;
      const { to, span } = clipEventWindow(c.from, c.to, last);
      return {
        cropName: cropName(c.cropId),
        shortName: cropShortName(c.cropId),
        cropId: c.cropId,
        delta: CURSE_DELTA,
        text: `${cropName(c.cropId)} ${formatDelta(CURSE_DELTA)}（呪い・${spanPhrase(c.from, to)}）`,
        span,
        role: live ? ("harvest" as const) : ("preview" as const),
        lingering: false,
        from: c.from,
        to,
        kind: "curse" as const,
        bySeat: c.bySeat,
      };
    });
  for (const hidden of view.hiddenCurses ?? []) {
    curseEvents.push({
      cropName: "伏せ",
      shortName: "伏せ",
      cropId: "",
      delta: 0,
      text: "呪い（伏せ）",
      span: "伏せ",
      role: "preview",
      lingering: false,
      from: R,
      to: R,
      kind: "curse-hidden",
      bySeat: hidden.bySeat,
    });
  }
  return { harvestEvents, previewEvents, curseEvents, harvestLine, previewLine };
}
