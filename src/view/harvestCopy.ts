export function formatHarvestFigure(d: {
  base: number;
  others: number;
  eventSum: number;
  raw: number;
  floor: number;
  gain: number;
}): string {
  let expr = String(d.base);
  if (d.eventSum !== 0) expr += d.eventSum > 0 ? `+${d.eventSum}` : `${d.eventSum}`;
  if (d.others !== 0) expr += `-${d.others}`;
  if (d.raw < d.floor) return `+${d.gain} (${expr} < ${d.floor})`;
  return `+${d.gain} (${expr} = ${d.raw})`;
}
