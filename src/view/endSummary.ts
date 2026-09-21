import { formatDelta } from "../engine/catalog.js";
import type { GameState, Player } from "../engine/types.js";

export type GameSummaryPlayer = {
  seat: number;
  name: string;
  winner: boolean;
  coins: number[];
  harvesting: number[];
  owned: number[];
  planted: number;
  passed: number;
  spent: number;
  harvested: number;
  crowding: number;
  eventSum: number;
  leftover: number;
};

export type GameSummary = {
  lastRound: number;
  winnerNames: string[];
  startCoins: number[];
  players: GameSummaryPlayer[];
};

function leftoverPlots(player: Player): number {
  return player.plots.filter((plot) => plot.owned && plot.white > 0 && plot.cropCard).length;
}

function orderSeats(state: GameState): number[] {
  return [...state.players]
    .sort((a, b) => {
      const d = b.coins - a.coins;
      if (d !== 0) return d;
      return a.seat - b.seat;
    })
    .map((p) => p.seat);
}

export function buildGameSummary(state: GameState): GameSummary {
  const winners = new Set(state.winnerSeats);
  const log = state.roundLog;
  const players = orderSeats(state).map((seat) => {
    const p = state.players[seat]!;
    return {
      seat,
      name: p.name,
      winner: winners.has(seat),
      coins: log.map((row) => row.coins[seat] ?? 0),
      harvesting: log.map((row) => row.harvesting[seat] ?? 0),
      owned: log.map((row) => row.owned[seat] ?? 0),
      planted: log.reduce((n, row) => n + (row.planted[seat] ?? 0), 0),
      passed: log.reduce((n, row) => n + (row.passed[seat] ?? 0), 0),
      spent: log.reduce((n, row) => n + (row.spent[seat] ?? 0), 0),
      harvested: log.reduce((n, row) => n + (row.harvested[seat] ?? 0), 0),
      crowding: log.reduce((n, row) => n + (row.crowding[seat] ?? 0), 0),
      eventSum: log.reduce((n, row) => n + (row.eventSum[seat] ?? 0), 0),
      leftover: leftoverPlots(p),
    };
  });
  return {
    lastRound: state.lastRound,
    winnerNames: players.filter((p) => p.winner).map((p) => p.name),
    startCoins: players.map((p) => state.startCoins[p.seat] ?? 0),
    players,
  };
}

function winnerLine(summary: GameSummary): string {
  const names = summary.winnerNames.join("、");
  if (summary.winnerNames.length > 1) return `共同勝者: ${names}`;
  return `勝者: ${names || "なし"}`;
}

function signedMoney(n: number): string {
  return n === 0 ? "+0" : formatDelta(n);
}

function colWidth(header: string, values: string[]): number {
  return Math.max(header.length, ...values.map((v) => v.length), 3);
}

function pad(s: string, w: number, align: "left" | "right"): string {
  return align === "left" ? s.padEnd(w) : s.padStart(w);
}

function renderTable(headers: string[], rows: string[][], leftCols = 1): string {
  const widths = headers.map((h, i) => colWidth(h, rows.map((row) => row[i] ?? "")));
  const line = (cells: string[]) =>
    cells.map((c, i) => pad(c, widths[i]!, i < leftCols ? "left" : "right")).join("  ");
  return [line(headers), ...rows.map(line)].join("\n");
}

function roundHeaders(lastRound: number, extra: string[] = []): string[] {
  return extra.concat(Array.from({ length: lastRound }, (_, i) => `R${i + 1}`));
}

export function renderGameSummaryText(state: GameState): string {
  const summary = buildGameSummary(state);
  const coinHeaders = ["", ...roundHeaders(summary.lastRound, ["開始"])];
  const coinRows = summary.players.map((p, i) => [
    p.name,
    String(summary.startCoins[i] ?? 0),
    ...p.coins.map(String),
  ]);
  const harvestHeaders = ["", ...roundHeaders(summary.lastRound)];
  const harvestRows = summary.players.map((p) => [p.name, ...p.harvesting.map(String)]);
  const ownedRows = summary.players.map((p) => [p.name, ...p.owned.map(String)]);
  const totalHeaders = ["", "植え", "パス", "支出", "収穫", "同種減額", "イベント", "未回収"];
  const totalRows = summary.players.map((p) => [
    p.name,
    String(p.planted),
    String(p.passed),
    p.spent === 0 ? "0" : formatDelta(-p.spent),
    signedMoney(p.harvested),
    p.crowding === 0 ? "0" : formatDelta(-p.crowding),
    signedMoney(p.eventSum),
    String(p.leftover),
  ]);
  return [
    "終了",
    winnerLine(summary),
    "",
    "所持コイン",
    renderTable(coinHeaders, coinRows),
    "",
    "収穫中の農地",
    renderTable(harvestHeaders, harvestRows),
    "",
    "このゲーム",
    renderTable(totalHeaders, totalRows),
    "",
    "取得農地",
    renderTable(harvestHeaders, ownedRows),
  ].join("\n");
}

function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function htmlTable(headers: string[], rows: string[][], rowMarks: boolean[] = []): string {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map((row, i) => {
      const cls = rowMarks[i] ? ' class="winner"' : "";
      const cells = row.map((c) => `<td>${esc(c)}</td>`).join("");
      return `<tr${cls}>${cells}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderGameSummaryHtml(state: GameState): string {
  const summary = buildGameSummary(state);
  const marks = summary.players.map((p) => p.winner);
  const coinHeaders = ["", ...roundHeaders(summary.lastRound, ["開始"])];
  const coinRows = summary.players.map((p, i) => [
    p.name,
    String(summary.startCoins[i] ?? 0),
    ...p.coins.map(String),
  ]);
  const roundHeadersOnly = ["", ...roundHeaders(summary.lastRound)];
  const harvestRows = summary.players.map((p) => [p.name, ...p.harvesting.map(String)]);
  const ownedRows = summary.players.map((p) => [p.name, ...p.owned.map(String)]);
  const totalHeaders = ["", "植え", "パス", "支出", "収穫", "同種減額", "イベント", "未回収"];
  const totalRows = summary.players.map((p) => [
    p.name,
    String(p.planted),
    String(p.passed),
    p.spent === 0 ? "0" : formatDelta(-p.spent),
    signedMoney(p.harvested),
    p.crowding === 0 ? "0" : formatDelta(-p.crowding),
    signedMoney(p.eventSum),
    String(p.leftover),
  ]);
  return `<h2>終了</h2>
    <p class="winner-line">${esc(winnerLine(summary))}</p>
    <h3>所持コイン</h3>
    ${htmlTable(coinHeaders, coinRows, marks)}
    <h3>収穫中の農地</h3>
    ${htmlTable(roundHeadersOnly, harvestRows, marks)}
    <h3>このゲーム</h3>
    ${htmlTable(totalHeaders, totalRows, marks)}
    <h3>取得農地</h3>
    ${htmlTable(roundHeadersOnly, ownedRows, marks)}`;
}
