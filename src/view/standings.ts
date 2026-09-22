export type HonorKind = "season" | "match" | null;

export function topSeats(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const best = Math.max(...scores);
  return scores.flatMap((n, seat) => (n === best ? [seat] : []));
}

export function previousSeasonTotals(
  scoreSheet: number[][],
  season: number,
  playerCount: number,
): number[] {
  const prior = scoreSheet.slice(0, Math.max(0, season - 1));
  return Array.from({ length: playerCount }, (_, seat) =>
    prior.reduce((sum, row) => sum + (row[seat] ?? 0), 0),
  );
}

export function previousSeasonLeaders(
  scoreSheet: number[][],
  season: number,
  playerCount: number,
): number[] {
  if (season < 2 || playerCount <= 0) return [];
  const prior = scoreSheet.slice(0, season - 1);
  if (prior.length === 0) return [];
  return topSeats(previousSeasonTotals(scoreSheet, season, playerCount));
}

export function previousSeasonTrailers(
  scoreSheet: number[][],
  season: number,
  playerCount: number,
): number[] {
  if (season < 2 || playerCount <= 0) return [];
  const prior = scoreSheet.slice(0, season - 1);
  if (prior.length === 0) return [];
  const totals = previousSeasonTotals(scoreSheet, season, playerCount);
  const worst = Math.min(...totals);
  return totals.flatMap((n, seat) => (n === worst ? [seat] : []));
}
