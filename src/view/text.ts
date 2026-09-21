import type { BoardPresentation } from "./presentation.js";
import type { PlotStatus } from "./status.js";

function formatPlot(plot: PlotStatus): string[] {
  const head = `  農地${plot.index + 1}  ${plot.title}`;
  const status = `         ${plot.status}`;
  const spec = plot.spec ? [`         ${plot.spec}`] : [];
  const events = plot.eventLines.map((line) => `         ${line}`);
  return [head, status, ...spec, ...events];
}

export function renderText(board: BoardPresentation): string {
  const lines: string[] = [];
  lines.push(board.title);
  lines.push(board.phaseLine);
  if (board.message) lines.push(board.message);
  lines.push("");
  lines.push("今ゲームの作物:");
  for (const c of board.cropsInGame) lines.push(`  ${c.name}  ${c.spec}`);
  lines.push("");
  lines.push(board.harvestEventLine);
  lines.push(board.previewEventLine);
  lines.push("");
  lines.push("場札:");
  if (board.market.length === 0) lines.push("  （欠け）");
  for (const m of board.market) {
    lines.push(`  [${m.index + 1}] ${m.cropName}`);
    lines.push(`      ${m.spec}`);
    lines.push(`      ${m.harvestOutlook}`);
    for (const line of m.eventLines) lines.push(`      ${line}`);
  }
  lines.push(
    `山札 作物${board.cropDeckCount} / イベント${board.eventDeckCount}   捨て札: ${
      board.cropDiscardNames.join("、") || "なし"
    }`,
  );
  lines.push("");
  for (const p of board.players) {
    const who = p.isYou ? `${p.name}（あなた）` : p.name;
    const mark = p.isActing ? " ◀手番" : "";
    lines.push(`席${p.seat} ${who}  ${p.coins}G${mark}`);
    for (const plot of p.plots) lines.push(...formatPlot(plot));
    lines.push("");
  }
  if (board.actions.length === 0) {
    lines.push("手: （待ち）");
  } else {
    lines.push("手:");
    for (const a of board.actions) lines.push(`  [${a.key}] ${a.label}`);
  }
  return lines.join("\n");
}
