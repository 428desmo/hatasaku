import { cropName, formatDelta } from "../engine/catalog.js";
import type { ActionLog, GameState, HarvestDetail, Player } from "../engine/types.js";

function signedG(n: number): string {
  return `${n === 0 ? "+0" : formatDelta(n)}G`;
}

function playerName(state: GameState, seat: number): string {
  return state.players[seat]?.name ?? `席${seat}`;
}

function playersInTurnOrder(state: GameState): Player[] {
  const order = state.turnOrder.length > 0 ? state.turnOrder : state.players.map((p) => p.seat);
  return order.map((seat) => state.players[seat]).filter((p): p is Player => p !== undefined);
}

export function formatActionLog(state: GameState, log: ActionLog): string {
  const who = playerName(state, log.seat);
  if (log.kind === "pass") return `${who}: パス`;
  const crop = log.cropId ? cropName(log.cropId) : "作物";
  const land = log.newLand ? "新しい農地" : "空き農地";
  const n = (log.plotIndex ?? 0) + 1;
  const cost = log.cost ?? 0;
  return `${who}: ${crop}を${land}${n}に植えた（${signedG(-cost)}）`;
}

export function formatHarvestLine(state: GameState, d: HarvestDetail): string {
  const who = playerName(state, d.seat);
  const crop = cropName(d.cropId);
  const parts: string[] = [`基本${d.base}G`];
  if (d.others > 0) parts.push(`同種の他${d.others}農地 −${d.others}G`);
  if (d.eventSum !== 0) {
    const ev = d.events.map((e) => `${cropName(e.cropId)}${formatDelta(e.delta)}`).join("、");
    parts.push(`イベント${formatDelta(d.eventSum)}G（${ev}）`);
  } else {
    parts.push("イベント効果なし");
  }
  const calc = `${parts.join("、")} → ${signedG(d.raw)}`;
  const floor = d.gain !== d.raw ? ` → 最低保証で ${signedG(d.gain)}` : "";
  return `${who} 農地${d.plotIndex + 1} ${crop}: ${calc}${floor}`;
}

export function formatPlayerHarvestTotal(
  name: string,
  coins: number,
  gained: number,
  spent = 0,
): string {
  const harvest = signedG(gained);
  const change = spent > 0 ? `${signedG(-spent)}、${harvest}` : harvest;
  return `${name}  ${coins}G（${change}）`;
}

function actionItems(state: GameState): string[] {
  const logs = state.roundActions;
  if (logs.length === 0) return ["（記録なし）"];
  return logs.map((log) => formatActionLog(state, log));
}

function harvestItems(state: GameState): string[] {
  if (state.lastHarvest.length === 0) return ["今ラウンドの収穫はありません"];
  return state.lastHarvest.map((d) => formatHarvestLine(state, d));
}

function spentThisRound(state: GameState, seat: number): number {
  return state.roundActions
    .filter((log) => log.seat === seat && log.kind === "plant")
    .reduce((sum, log) => sum + (log.cost ?? 0), 0);
}

function coinItems(state: GameState): string[] {
  return playersInTurnOrder(state).map((p) => {
    const got = state.lastPayouts[p.seat] ?? 0;
    return formatPlayerHarvestTotal(p.name, p.coins, got, spentThisRound(state, p.seat));
  });
}

export function renderActionSummaryText(state: GameState): string {
  return [`手番`, ...actionItems(state).map((line) => `  ${line}`)].join("\n");
}

export function renderActionSummaryHtml(state: GameState): string {
  const items = actionItems(state)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  return `<h3>手番</h3><ul>${items}</ul>`;
}

export function renderHarvestSummaryText(state: GameState): string {
  return [
    `収穫`,
    ...harvestItems(state).map((line) => `  ${line}`),
    `所持コイン`,
    ...coinItems(state).map((line) => `  ${line}`),
  ].join("\n");
}

export function renderHarvestSummaryHtml(state: GameState): string {
  const harvest = harvestItems(state)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  const coins = coinItems(state)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  return `<h3>収穫</h3><ul>${harvest}</ul><h3>所持コイン</h3><ul>${coins}</ul>`;
}

export function renderRoundResultText(state: GameState): string {
  return [`ラウンド${state.round} の結果`, renderActionSummaryText(state), "", renderHarvestSummaryText(state)].join(
    "\n",
  );
}

export function renderRoundResultHtml(state: GameState): string {
  return `<h2>ラウンド${state.round} の結果</h2>${renderActionSummaryHtml(state)}${renderHarvestSummaryHtml(state)}`;
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
