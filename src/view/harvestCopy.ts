export type HarvestTone = "up" | "down" | "floor" | "flat";

export type HarvestFigure = {
  text: string;
  tone: HarvestTone;
};

export function formatHarvestFigure(d: {
  base: number;
  others: number;
  eventSum: number;
  raw: number;
  floor: number;
  gain: number;
}): HarvestFigure {
  if (d.raw < d.floor) return { text: `${d.gain}😞`, tone: "floor" };
  const delta = d.gain - d.base;
  if (delta > 0) return { text: `${d.gain} ${"△".repeat(delta)}`, tone: "up" };
  if (delta < 0) return { text: `${d.gain}${"▼".repeat(-delta)}`, tone: "down" };
  return { text: `${d.gain}`, tone: "flat" };
}
