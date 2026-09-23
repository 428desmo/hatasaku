export function cumulativeTotals(scoreSheet: number[][]): number[][] {
  if (scoreSheet.length === 0) return [];
  const n = scoreSheet[0]?.length ?? 0;
  const run = Array.from({ length: n }, () => 0);
  return scoreSheet.map((row) => {
    for (let i = 0; i < n; i++) run[i] = (run[i] ?? 0) + (row[i] ?? 0);
    return [...run];
  });
}

export function deviationScores(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const mean = values.reduce((sum, x) => sum + x, 0) / n;
  const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (sd < 1e-9) return values.map(() => 50);
  return values.map((x) => 50 + (10 * (x - mean)) / sd);
}

export function seasonDeviationGrid(cum: number[][]): number[][] {
  return cum.map((row) => deviationScores(row));
}

export type TrailPoint = { x: number; y: number; total: number; t: number };

export const TRAIL_VIEW = { width: 320, height: 180 };

export function trailLayout(
  scoreSheet: number[][],
  width = TRAIL_VIEW.width,
  height = TRAIL_VIEW.height,
): {
  series: { seat: number; points: TrailPoint[] }[];
  seasons: number;
  width: number;
  height: number;
  xLabels: { x: number; y: number; label: string }[];
} {
  const cum = cumulativeTotals(scoreSheet);
  const grid = seasonDeviationGrid(cum);
  const seasons = cum.length;
  const pad = { l: 18, r: 28, t: 24, b: 40 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const ts = grid.flat();
  const lo = (ts.length ? Math.min(...ts) : 50) - 4;
  const hi = (ts.length ? Math.max(...ts) : 50) + 4;
  const span = Math.max(1, hi - lo);
  const xAt = (s: number) => pad.l + (seasons <= 1 ? innerW / 2 : (s / Math.max(1, seasons - 1)) * innerW);
  const nSeats = cum[0]?.length ?? 0;
  const series = Array.from({ length: nSeats }, (_, seat) => ({
    seat,
    points: cum.map((row, s) => {
      const t = grid[s]?.[seat] ?? 50;
      return {
        x: xAt(s),
        y: pad.t + ((hi - t) / span) * innerH,
        total: row[seat] ?? 0,
        t,
      };
    }),
  }));
  const xLabels = Array.from({ length: seasons }, (_, s) => ({
    x: xAt(s),
    y: height - 6,
    label: `S${s + 1}`,
  }));
  return { series, seasons, width, height, xLabels };
}
