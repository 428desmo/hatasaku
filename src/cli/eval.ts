import { Table } from "../session/table.js";
import { renderGameSummaryText, renderScoreSheetText } from "../view/endSummary.js";
import { renderText } from "../view/text.js";
import { toPresentation } from "../view/presentation.js";
import { getPublicView, parseMode } from "../engine/index.js";

const mode = parseMode(
  process.argv.includes("--advanced") || process.argv.includes("--full") ? "advanced" : "basic",
);
const seasonsArg = process.argv.find((a) => a.startsWith("--seasons="));
const table = new Table({
  mode,
  humanCount: 0,
  cpuCount: 3,
  cpuStrategyId: "irr",
  seed: process.argv.find((a) => a.startsWith("--seed="))?.slice(7) ?? "eval",
  ...(seasonsArg ? { seasonCount: Number(seasonsArg.slice(10)) } : {}),
});

const state = table.state;
if (!state) {
  console.error("did not start");
  process.exit(1);
}
console.log(renderGameSummaryText(state));
if (table.scoreSheet.length > 0) {
  console.log("");
  console.log(
    renderScoreSheetText(
      state.players.map((p) => p.name),
      table.scoreSheet,
      table.matchWinnerSeats,
      true,
    ),
  );
}
console.log("");
console.log("最終盤面");
console.log(renderText(toPresentation(getPublicView(state, "spectator"), null)));
console.log("");
console.log("coins", state.players.map((p) => `${p.name}:${p.coins}`).join("  "));
console.log("season winners", state.winnerSeats.join(","));
console.log("match winners", table.matchWinnerSeats.join(","));
console.log("phase", state.phase, "round", state.round, "season", table.seasonIndex, "/", table.seasonCount);
