import type { BoardPresentation } from "./presentation.js";
import type { PlotStatus, StatusKind } from "./status.js";

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const statusClass: Record<StatusKind, string> = {
  unowned: "st-unowned",
  wait: "st-wait",
  harvest: "st-harvest",
  cooldown: "st-cooldown",
  ready: "st-ready",
};

function marketHtml(m: BoardPresentation["market"][number]): string {
  const harvestClass =
    m.harvestKind === "missed" || m.harvestKind === "limited" ? "outlook-warn" : "outlook-ok";
  const eventClass =
    m.eventTone === "plus" ? "ev-plus" : m.eventTone === "minus" ? "ev-minus" : "outlook-event";
  const events = m.eventLines.map((line) => `<div class="${eventClass}">${esc(line)}</div>`).join("");
  return `<div class="market-card">
    <div>[${m.index + 1}] ${esc(m.cropName)}</div>
    <div class="spec">${esc(m.spec)}</div>
    <div class="${harvestClass}">${esc(m.harvestOutlook)}</div>
    ${events}
  </div>`;
}

function plotHtml(plot: PlotStatus): string {
  const spec = plot.spec ? `<div class="spec">${esc(plot.spec)}</div>` : "";
  const eventClass =
    plot.eventTone === "plus" ? "ev-plus" : plot.eventTone === "minus" ? "ev-minus" : "outlook-event";
  const events = plot.eventLines.map((line) => `<div class="${eventClass}">${esc(line)}</div>`).join("");
  return `<div class="plot">
    <div class="plot-title">農地${plot.index + 1}　${esc(plot.title)}</div>
    <div class="${statusClass[plot.kind]}">${esc(plot.status)}</div>
    ${spec}
    ${events}
  </div>`;
}

export function renderHtml(
  board: BoardPresentation,
  summaryHtml = "",
  opts: { finalBoard?: boolean } = {},
): string {
  const crops = board.cropsInGame
    .map((c) => `<li><strong>${esc(c.name)}</strong> ${esc(c.spec)}</li>`)
    .join("");
  const market =
    board.market.length === 0
      ? "<p>（欠け）</p>"
      : board.market.map(marketHtml).join("");
  const players = board.players
    .map((p) => {
      const who = p.isYou ? `${esc(p.name)}（あなた）` : esc(p.name);
      const mark = p.isActing ? '<span class="turn">手番</span>' : "";
      return `<section class="seat">
        <h3>席${p.seat} ${who}　${p.coins}G ${mark}</h3>
        ${p.plots.map(plotHtml).join("")}
      </section>`;
    })
    .join("");
  const summary = summaryHtml ? `<section class="summary">${summaryHtml}</section>` : "";
  const boardTitle = opts.finalBoard ? "<h2>最終盤面</h2>" : `<h2>${esc(board.title)}</h2>`;
  return `${summary}
    ${boardTitle}
    ${opts.finalBoard ? "" : `<p>${esc(board.phaseLine)}</p>`}
    ${board.message ? `<p>${esc(board.message)}</p>` : ""}
    <h3>今ゲームの作物</h3>
    <ul>${crops}</ul>
    <p class="event-harvest">${esc(board.harvestEventLine)}</p>
    <p class="event-preview">${esc(board.previewEventLine)}</p>
    <h3>場札</h3>
    ${market}
    <p class="muted">山札 作物${board.cropDeckCount} / イベント${board.eventDeckCount}　捨て札: ${
      esc(board.cropDiscardNames.join("、") || "なし")
    }</p>
    ${players}`;
}
