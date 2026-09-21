import { Table } from "../session/table.js";
import { renderGameSummaryText } from "../view/endSummary.js";
import { renderText } from "../view/text.js";
import { toPresentation } from "../view/presentation.js";
import { getPublicView } from "../engine/index.js";

const mode = process.argv.includes("--full") ? "full" : "tutorial";
const table = new Table({
  mode,
  humanCount: 0,
  cpuCount: 3,
  cpuStrategyId: "irr",
  seed: process.argv.find((a) => a.startsWith("--seed="))?.slice(7) ?? "eval",
});

const state = table.state;
if (!state) {
  console.error("did not start");
  process.exit(1);
}
console.log(renderGameSummaryText(state));
console.log("");
console.log("最終盤面");
console.log(renderText(toPresentation(getPublicView(state, "spectator"), null)));
console.log("");
console.log("coins", state.players.map((p) => `${p.name}:${p.coins}`).join("  "));
console.log("winners", state.winnerSeats.join(","));
console.log("phase", state.phase, "round", state.round);
