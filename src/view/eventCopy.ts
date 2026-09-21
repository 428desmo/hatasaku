import { cropName, formatDelta } from "../engine/catalog.js";
import { eventEffectEnd, type PublicEvent, type PublicView } from "../engine/types.js";

export type EventChip = {
  cropName: string;
  cropId: string;
  delta: number;
  text: string;
  role: "harvest" | "preview";
  lingering: boolean;
  from: number;
  to: number;
};

export type BoardEvents = {
  harvestEvents: EventChip[];
  previewEvents: EventChip[];
  harvestLine: string;
  previewLine: string;
};

function startedRound(e: PublicEvent, fallback: number): number {
  return e.activatedRound ?? fallback;
}

function body(e: { cropId: string; delta: number }): string {
  return `${cropName(e.cropId)} ${formatDelta(e.delta)}`;
}

function windowOf(from: number): { from: number; to: number } {
  return { from, to: eventEffectEnd(from) };
}

export function describeBoardEvents(view: PublicView): BoardEvents {
  const R = view.round;
  const n = view.eventActive.length;
  const harvestEvents: EventChip[] = [];

  view.eventActive.forEach((e, i) => {
    const from = startedRound(e, R - (n - i));
    const { to } = windowOf(from);
    harvestEvents.push({
      cropName: cropName(e.cropId),
      cropId: e.cropId,
      delta: e.delta,
      text: `${body(e)}（継続・R${from}〜R${to}）`,
      role: "harvest",
      lingering: true,
      from,
      to,
    });
  });

  const left = view.eventRow[0];
  if (left) {
    const from = startedRound(left, R);
    const { to } = windowOf(from);
    harvestEvents.push({
      cropName: cropName(left.cropId),
      cropId: left.cropId,
      delta: left.delta,
      text: `${body(left)}（R${from}〜R${to}）`,
      role: "harvest",
      lingering: false,
      from,
      to,
    });
  }

  const previewEvents: EventChip[] = view.eventRow.slice(1).map((e, i) => {
    const from = R + i + 1;
    const { to } = windowOf(from);
    return {
      cropName: cropName(e.cropId),
      cropId: e.cropId,
      delta: e.delta,
      text: `R${from} ${body(e)}（R${from}〜R${to}）`,
      role: "preview" as const,
      lingering: false,
      from,
      to,
    };
  });

  const harvestLine = `R${R} 収穫イベント: ${harvestEvents.map((e) => e.text).join("　") || "なし"}`;
  const previewLine = `予告（各2ラウンド有効）: ${previewEvents.map((e) => e.text).join("　") || "なし"}`;
  return { harvestEvents, previewEvents, harvestLine, previewLine };
}
