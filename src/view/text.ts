import { formatDelta } from "../engine/catalog.js";
import type { BoardPresentation, PlotChip } from "./presentation.js";

function formatPlot(plot: PlotChip): string {
  const n = plot.index + 1;
  if (plot.kind === "unowned") return `${n}:未取得`;
  if (plot.kind === "waiting") return `${n}:${plot.cropName} 白${plot.white}`;
  if (plot.kind === "harvesting") return `${n}:${plot.cropName} 緑${plot.green}`;
  const prev = plot.previousName ?? "?";
  const red = plot.red > 0 ? ` 赤${plot.red}` : "";
  return `${n}:空き 前${prev}${red}`;
}

function formatEvent(chip: { cropName: string; delta: number; current: boolean }): string {
  const body = `${chip.cropName} ${formatDelta(chip.delta)}`;
  return chip.current ? `〈${body}〉` : body;
}

export function renderText(board: BoardPresentation): string {
  const lines: string[] = [];
  lines.push(board.title);
  lines.push(board.phaseLine);
  if (board.message) lines.push(board.message);
  lines.push("");
  const row = board.eventRow.map(formatEvent).join("  ") || "（なし）";
  lines.push(`イベント列: ${row}`);
  const active = board.eventActive.map(formatEvent).join("  ") || "（なし）";
  lines.push(`発動中:     ${active}`);
  lines.push(`4作物: ${board.cropsInGame.join(" ")}`);
  const market =
    board.market.map((m) => `[${m.index + 1}]${m.cropName} ${m.cost}G`).join("   ") ||
    "（欠け）";
  lines.push(`場札:  ${market}`);
  const discard = board.cropDiscardNames.join("、") || "なし";
  lines.push(
    `山札: 作物${board.cropDeckCount}  イベント${board.eventDeckCount}     捨て札: ${discard}`,
  );
  lines.push("");
  for (const p of board.players) {
    const you = p.isYou ? "あなた" : p.kind === "cpu" ? "CPU" : p.name;
    const mark = p.isActing ? " *" : "  ";
    lines.push(`席${p.seat} ${you}${mark} ${p.coins}G`);
    lines.push(`  ${p.plots.map(formatPlot).join("    ")}`);
  }
  lines.push("");
  if (board.actions.length === 0) {
    lines.push("手: （待ち）");
  } else {
    lines.push("手:");
    for (const a of board.actions) {
      lines.push(`  [${a.key}] ${a.label}`);
    }
  }
  return lines.join("\n");
}
