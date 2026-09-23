import {
  applyEventUpdate,
  applyHarvest,
  applyPlayerAction,
  concludeRound,
  createGame,
  createRng,
  getPublicView,
  IllegalActionError,
} from "../engine/index.js";
import type { Rng } from "../engine/rng.js";
import {
  lastRound,
  type Action,
  type GameState,
  type HarvestDetail,
  type Mode,
  type SeatConfig,
  type SeatKind,
} from "../engine/types.js";
import { chooseById } from "../cpu/index.js";
import { cropList } from "../engine/catalog.js";
import { renderHtml } from "../view/html.js";
import { toPresentation, type ActionChip, type BoardPresentation } from "../view/presentation.js";
import {
  renderGameSummaryHtml,
  renderGameSummaryText,
  renderScoreSheetHtml,
  renderScoreSheetText,
} from "../view/endSummary.js";
import { formatHarvestFigure } from "../view/harvestCopy.js";
import { previousSeasonLeaders, previousSeasonTrailers, type HonorKind } from "../view/standings.js";
import { trailLayout } from "../view/trailChart.js";
import { seasonActionRows, type SeasonActionRow } from "../view/seasonLog.js";
import {
  buildSeasonIntroAnnounce,
  formatSeasonIntroText,
  type SeasonIntroAnnounce,
} from "../view/seasonIntro.js";
import {
  buildHonorAnnounce,
  formatHonorAnnounceText,
  FINAL_ROUND_TIP,
  PROXY_HOLD_NOTE,
  PROXY_TURN_NOTE,
  type HonorAnnounce,
} from "../view/honorAnnounce.js";
import { renderRoundResultHtml, renderRoundResultText } from "../view/summary.js";
import { renderText } from "../view/text.js";

export type TableConfig = {
  mode: Mode;
  humanCount: number;
  cpuCount: number;
  cpuStrategyId: string;
  seed: string;
  seasonCount?: number;
  paceCpu?: boolean;
  /** Optional labels for human seats 0..humanCount-1 (online lobby names). */
  humanNames?: string[];
};

export type CpuShow = {
  seat: number;
  stage: "turn" | "market" | "plot" | "coins" | "curse";
  marketIndex: number | null;
  plotIndex: number | null;
  cropId: string | null;
};

export const CPU_STEP_MS = 200;

export type UiHold = "intro" | "result" | "season" | "mix" | "trail" | "honor" | null;

type HumanSlot = { seat: number; connected: boolean };

export class Table {
  readonly config: TableConfig;
  state: GameState | null = null;
  rng: Rng;
  hold: UiHold = null;
  readonly acks = new Set<number>();
  readonly humanSeats: HumanSlot[];
  seasonCount: number;
  seasonIndex = 1;
  startSeat = 0;
  scoreSheet: number[][] = [];
  matchWinnerSeats: number[] = [];
  private cpuRng: Rng;
  private seats: SeatConfig[] = [];
  private matchSeed: string;
  private rematchCount = 0;
  private pendingCpu: Action | null = null;
  private cpuStage: CpuShow["stage"] | null = null;
  private cpuActorSeat: number | null = null;
  /** After the first curse-rights intro of a match, later seasons use short copy. */
  private curseDetailShown = false;
  private proxyNotes = new Map<number, string>();

  /** Used by the online host to proxy timed-out human turns. */
  getCpuRng(): Rng {
    return this.cpuRng;
  }

  /** Note that this seat's turn was CPU-proxied due to the turn timer. */
  markTurnProxy(seat: number): void {
    this.proxyNotes.set(seat, PROXY_TURN_NOTE);
  }

  /** Note that hold acknowledgements were advanced due to the turn timer. */
  markHoldProxy(seats: number[]): void {
    for (const seat of seats) this.proxyNotes.set(seat, PROXY_HOLD_NOTE);
  }

  private clearProxyNote(seat: number): void {
    this.proxyNotes.delete(seat);
  }

  constructor(config: TableConfig) {
    const total = config.humanCount + config.cpuCount;
    if (total < 3 || total > 5) throw new Error("N+M must be 3-5");
    this.config = config;
    this.seasonCount = config.seasonCount ?? total;
    this.matchSeed = config.seed;
    this.rng = createRng(this.matchSeed);
    this.cpuRng = createRng(`${this.matchSeed}-cpu`);
    this.humanSeats = Array.from({ length: config.humanCount }, (_, i) => ({
      seat: i,
      connected: false,
    }));
    if (config.humanCount === 0) this.start();
  }

  get connectedHumans(): number {
    return this.humanSeats.filter((h) => h.connected).length;
  }

  get matchOver(): boolean {
    return (
      this.state?.phase === "gameOver" &&
      this.seasonIndex >= this.seasonCount &&
      (this.hold === "honor" || this.hold === null)
    );
  }

  assignHuman(): number | null {
    const slot = this.humanSeats.find((h) => !h.connected);
    if (!slot) return null;
    slot.connected = true;
    if (!this.state && this.connectedHumans === this.config.humanCount) this.start();
    return slot.seat;
  }

  releaseHuman(seat: number): void {
    const slot = this.humanSeats.find((h) => h.seat === seat);
    if (slot) slot.connected = false;
    this.acks.delete(seat);
  }

  setHumanConnected(seat: number, connected: boolean): void {
    const slot = this.humanSeats.find((h) => h.seat === seat);
    if (!slot) return;
    slot.connected = connected;
    if (!connected) this.acks.delete(seat);
  }

  start(): void {
    const n = this.config.humanCount + this.config.cpuCount;
    this.seats = [
      ...Array.from({ length: this.config.humanCount }, (_, i) => ({
        kind: "human" as SeatKind,
        name: (this.config.humanNames?.[i]?.trim() || `プレイヤー${i + 1}`).slice(0, 16),
      })),
      ...Array.from({ length: this.config.cpuCount }, (_, i) => ({
        kind: "cpu" as SeatKind,
        name: `CPU${i + 1}`,
        cpuStrategyId: this.config.cpuStrategyId,
      })),
    ];
    this.rng = createRng(this.matchSeed);
    this.cpuRng = createRng(`${this.matchSeed}-cpu`);
    this.hold = null;
    this.acks.clear();
    this.seasonCount = this.config.seasonCount ?? n;
    this.seasonIndex = 1;
    this.startSeat = this.rng.nextInt(n);
    this.scoreSheet = [];
    this.matchWinnerSeats = [];
    this.curseDetailShown = false;
    this.proxyNotes.clear();
    this.clearCpuShow();
    this.state = this.createSeasonState();
    this.pauseForIntro();
  }

  applyFromSeat(seat: number, action: Action): void {
    if (!this.state) throw new Error("not started");
    this.clearProxyNote(seat);
    if (this.hold) throw new IllegalActionError("summary waiting");
    if (this.state.phase === "gameOver") throw new IllegalActionError("game over");
    if (this.state.actingSeat !== seat) throw new IllegalActionError("not your turn");
    this.state = applyPlayerAction(this.state, action, this.rng);
    if (this.config.paceCpu) {
      this.finishIncomeIfDue();
      return;
    }
    this.flushCpus();
  }

  nextFromSeat(seat: number): void {
    if (!this.state || !this.hold) return;
    this.clearProxyNote(seat);
    if (!this.humanSeats.some((h) => h.seat === seat && h.connected)) return;
    this.acks.add(seat);
    const need = Math.max(1, this.connectedHumans);
    if (this.acks.size < need) return;
    this.acks.clear();
    this.advanceHold();
  }

  viewFor(seat: number | "spectator"): {
    text: string;
    html: string;
    view: ReturnType<typeof getPublicView>;
    board: BoardPresentation | null;
    harvest: HarvestDetail[];
    lastPayouts: number[];
    scoreSheet: number[][];
    matchWinnerSeats: number[];
    crownSeats: number[];
    honorSeats: number[];
    honorKind: HonorKind;
    seasonLog: SeasonActionRow[];
    crops: typeof cropList;
    trail: ReturnType<typeof trailLayout> | null;
    cpuShow: CpuShow | null;
    seasonIntro: SeasonIntroAnnounce | null;
    honorAnnounce: HonorAnnounce | null;
    finalRoundTip: string | null;
    proxyNote: string | null;
    hold: UiHold;
    acked: boolean;
    ackNeed: number;
    ackGot: number;
    actions: ActionChip[];
  } {
    const ackNeed = Math.max(this.config.humanCount === 0 ? 0 : 1, this.connectedHumans);
    const ackGot = this.acks.size;
    const acked = seat !== "spectator" && this.acks.has(seat);
    if (!this.state) {
      const waiting = `ロビー  人間 ${this.connectedHumans}/${this.config.humanCount}  CPU ${this.config.cpuCount}\n接続待ち…`;
      return {
        text: waiting,
        html: `<p>${waiting.replaceAll("\n", "<br>")}</p>`,
        hold: null,
        acked: false,
        ackNeed,
        ackGot,
        actions: [],
        board: null,
        harvest: [],
        lastPayouts: [],
        scoreSheet: this.scoreSheet,
        matchWinnerSeats: this.matchWinnerSeats,
        crownSeats: [],
        honorSeats: [],
        honorKind: null,
        seasonLog: [],
        trail: null,
        cpuShow: null,
        seasonIntro: null,
        honorAnnounce: null,
        finalRoundTip: null,
        proxyNote: null,
        crops: cropList,
        view: {
          mode: this.config.mode,
          season: 0,
          seasonCount: this.seasonCount,
          startSeat: 0,
          round: 0,
          lastRound: lastRound(this.config.mode),
          phase: "lobby",
          actingSeat: null,
          turnOrder: [],
          players: [],
          market: [],
          cropDeckCount: 0,
          cropDiscard: [],
          eventRow: [],
          eventActive: [],
          eventDeckCount: 0,
          eventDiscard: [],
          drawnEventCount: 0,
          cropIdsInGame: [],
          curseReadySeats: [],
          curses: [],
          hiddenCurses: [],
          hiddenCurseCount: 0,
          message: waiting,
        },
      };
    }
    const view = getPublicView(this.state, this.hold ? "spectator" : seat);
    const seasonIntro =
      this.hold === "intro"
        ? buildSeasonIntroAnnounce({
            cropIds: this.state.cropIdsInGame,
            playerNames: this.state.players.map((p) => p.name),
            curseReadySeats: this.state.curseReadySeats,
            multiSeason: this.seasonCount > 1,
            curseDetail: this.curseDetailShown ? "short" : "full",
          })
        : null;
    const standing = this.standings();
    const honorAnnounce = (() => {
      if (this.hold === "season" || this.hold === "mix") {
        const winners = standing.honorSeats;
        const row = this.scoreSheet[this.seasonIndex - 1];
        const score = winners.length && row ? row[winners[0]!] : null;
        return buildHonorAnnounce({
          kind: "season",
          winnerNames: winners.map((s) => this.state!.players[s]?.name ?? `席${s}`),
          winnerScore: score,
        });
      }
      if (this.hold === "trail") {
        return buildHonorAnnounce({
          kind: "match-trail",
          winnerNames: this.matchWinnerSeats.map((s) => this.state!.players[s]?.name ?? `席${s}`),
        });
      }
      if (this.hold === "honor" || this.matchOver) {
        const n = this.state.players.length;
        const totals = Array.from({ length: n }, (_, s) =>
          this.scoreSheet.reduce((sum, row) => sum + (row[s] ?? 0), 0),
        );
        const winners = this.matchWinnerSeats;
        const score = winners.length ? totals[winners[0]!] : null;
        return buildHonorAnnounce({
          kind: "match",
          winnerNames: winners.map((s) => this.state!.players[s]?.name ?? `席${s}`),
          winnerScore: score,
        });
      }
      return null;
    })();
    const last = lastRound(this.config.mode);
    const onFinalRound =
      !this.hold &&
      this.state.phase !== "gameOver" &&
      this.state.phase !== "lobby" &&
      this.state.round === last;
    const finalRoundTip = onFinalRound ? FINAL_ROUND_TIP : null;
    const proxyNote = seat === "spectator" ? null : (this.proxyNotes.get(seat) ?? null);
    if (this.hold === "result") view.message = "内容を確認して［次へ］を押してください。";
    if (this.hold === "season" || this.hold === "mix") {
      view.message = honorAnnounce
        ? `${formatHonorAnnounceText(honorAnnounce)}\n\n確認したら［次へ］。`
        : "シーズンが終わりました。行動を見て［次へ］。";
    }
    if (this.hold === "trail") {
      view.message = honorAnnounce
        ? `${formatHonorAnnounceText(honorAnnounce)}\n\n［次へ］で表彰へ。`
        : "総合点の推移を見て［次へ］。";
    }
    if (this.hold === "honor") {
      view.message = honorAnnounce
        ? `${formatHonorAnnounceText(honorAnnounce)}\n\n［もう一度］で同じ設定の新しいマッチを始めます。`
        : "［もう一度］で同じ設定の新しいマッチを始めます。";
    }
    if (!this.hold && this.matchOver && honorAnnounce) {
      view.message = formatHonorAnnounceText(honorAnnounce);
    }
    if (this.hold === "intro" && seasonIntro) {
      view.message = `${formatSeasonIntroText(seasonIntro)}\n\n確認したら［開始］。`;
    }
    const you = seat === "spectator" ? null : seat;
    const board = toPresentation(view, you);
    const names = this.state.players.map((p) => p.name);
    const seasonDone = this.state.phase === "gameOver";
    const matchDone = this.matchOver;
    const recap =
      this.hold === "season" || this.hold === "mix" || this.hold === "trail" || this.hold === "honor";
    const showSeasonSummary = recap || matchDone;
    const sheet = showSeasonSummary ? this.scoreSheet : [];
    const winners = matchDone || this.hold === "honor" ? this.matchWinnerSeats : this.state.winnerSeats;
    const scoreText = sheet.length > 0 ? `\n\n${renderScoreSheetText(names, sheet, winners, matchDone)}` : "";
    const scoreHtml = sheet.length > 0 ? renderScoreSheetHtml(names, sheet, winners, matchDone) : "";
    const summaryHtml =
      this.hold === "result"
        ? renderRoundResultHtml(this.state)
        : showSeasonSummary
          ? `${renderGameSummaryHtml(this.state)}${scoreHtml}`
          : "";
    const summaryText =
      this.hold === "result"
        ? renderRoundResultText(this.state)
        : showSeasonSummary
          ? `${renderGameSummaryText(this.state)}${scoreText}`
          : "";
    const finalBoard = seasonDone && !this.hold;
    const textBody = finalBoard || recap ? `最終盤面\n${renderText(board)}` : renderText(board);
    return {
      text: summaryText ? `${summaryText}\n\n${textBody}` : textBody,
      html: renderHtml(board, summaryHtml, { finalBoard: finalBoard || recap }),
      view,
      board,
      harvest: this.state.lastHarvest.map((d) => {
        const fig = formatHarvestFigure(d);
        return { ...d, figure: fig.text, tone: fig.tone };
      }),
      lastPayouts: this.state.lastPayouts,
      scoreSheet: this.scoreSheet,
      matchWinnerSeats: this.matchWinnerSeats,
      ...standing,
      seasonLog: seasonActionRows(this.state),
      crops: cropList,
      trail: this.hold === "trail" ? trailLayout(this.scoreSheet) : null,
      cpuShow: this.cpuShow,
      seasonIntro,
      honorAnnounce,
      finalRoundTip,
      proxyNote,
      hold: this.hold,
      acked,
      ackNeed,
      ackGot,
      actions: this.hold ? [] : board.actions,
    };
  }

  private standings(): { crownSeats: number[]; honorSeats: number[]; honorKind: HonorKind } {
    if (!this.state) return { crownSeats: [], honorSeats: [], honorKind: null };
    const n = this.state.players.length;
    if (this.hold === "honor" || this.matchOver) {
      return { crownSeats: [], honorSeats: [...this.matchWinnerSeats], honorKind: "match" };
    }
    if (this.hold === "trail") {
      return { crownSeats: [], honorSeats: [], honorKind: null };
    }
    const recap = this.hold === "season" || this.hold === "mix";
    return {
      crownSeats: previousSeasonLeaders(this.scoreSheet, this.state.season, n),
      honorSeats: recap ? [...this.state.winnerSeats] : [],
      honorKind: recap ? "season" : null,
    };
  }

  private createSeasonState(): GameState {
    const n = this.seats.length;
    return createGame(
      {
        mode: this.config.mode,
        seed: this.matchSeed,
        seats: this.seats,
        startSeat: this.startSeat,
        evenStartCoins: this.seasonCount % n === 0,
        season: this.seasonIndex,
        seasonCount: this.seasonCount,
        curseSeats: previousSeasonTrailers(this.scoreSheet, this.seasonIndex, n),
      },
      this.rng,
    );
  }

  private recordSeason(): void {
    if (!this.state) return;
    if (this.scoreSheet.length >= this.seasonIndex) return;
    this.scoreSheet.push(this.state.players.map((p) => p.coins));
    if (this.seasonIndex >= this.seasonCount) {
      const n = this.state.players.length;
      const totals = Array.from({ length: n }, (_, seat) =>
        this.scoreSheet.reduce((sum, row) => sum + (row[seat] ?? 0), 0),
      );
      const best = Math.max(...totals);
      this.matchWinnerSeats = totals.flatMap((c, seat) => (c === best ? [seat] : []));
    }
  }

  private beginNextSeason(): void {
    const n = this.seats.length;
    this.seasonIndex += 1;
    this.startSeat = (this.startSeat + 1) % n;
    this.state = this.createSeasonState();
  }

  private pauseForIntro(): void {
    if (this.config.humanCount === 0) {
      this.hold = null;
      this.flushCpus();
      return;
    }
    this.hold = "intro";
  }

  private advanceHold(): void {
    if (!this.state || !this.hold) return;
    if (this.hold === "intro") {
      if (this.seasonCount > 1 && (this.state?.curseReadySeats.length ?? 0) > 0) {
        this.curseDetailShown = true;
      }
      this.hold = null;
      if (!this.config.paceCpu) this.flushCpus();
      return;
    }
    if (this.hold === "season") {
      this.hold = "mix";
      return;
    }
    if (this.hold === "mix") {
      if (this.seasonIndex < this.seasonCount) {
        this.beginNextSeason();
        this.pauseForIntro();
        return;
      }
      this.hold = "trail";
      return;
    }
    if (this.hold === "trail") {
      this.hold = "honor";
      return;
    }
    if (this.hold === "honor") {
      this.rematch();
      return;
    }
    this.state = concludeRound(this.state);
    if (this.state.phase !== "gameOver") {
      this.state = applyEventUpdate(this.state, this.rng);
      this.state.phase = "turn";
      this.hold = null;
      if (!this.config.paceCpu) this.flushCpus();
      return;
    }
    this.recordSeason();
    this.hold = "season";
  }

  get cpuShow(): CpuShow | null {
    if (this.cpuStage == null || this.cpuActorSeat == null) return null;
    const action = this.pendingCpu;
    const plant = action?.type === "plant" ? action : null;
    const showMarket = this.cpuStage === "market" || this.cpuStage === "plot";
    const showPlot = this.cpuStage === "plot";
    return {
      seat: this.cpuActorSeat,
      stage: this.cpuStage,
      marketIndex: plant && showMarket ? plant.marketIndex : null,
      plotIndex: plant && showPlot ? this.plotIndexFor(this.cpuActorSeat, plant) : null,
      cropId: action?.type === "curse" && this.cpuStage === "curse" ? action.cropId : null,
    };
  }

  cpuTick(): boolean {
    if (!this.config.paceCpu) {
      this.flushCpus();
      return false;
    }
    if (!this.state || this.hold) {
      this.clearCpuShow();
      return false;
    }
    if (this.state.phase === "gameOver") {
      this.clearCpuShow();
      this.recordSeason();
      if (this.seasonIndex < this.seasonCount) {
        this.beginNextSeason();
        this.pauseForIntro();
      }
      return false;
    }
    if (this.state.phase === "income") {
      this.finishIncomeIfDue();
      return false;
    }
    if (this.state.phase !== "turn" || this.state.actingSeat === null) {
      this.clearCpuShow();
      return false;
    }
    const actor = this.state.players[this.state.actingSeat];
    if (!actor || actor.kind !== "cpu") {
      this.clearCpuShow();
      return false;
    }
    if (this.cpuStage === "coins") {
      this.clearCpuShow();
      return this.cpuTick();
    }
    if (!this.pendingCpu) {
      this.armCpu();
      return true;
    }
    const action = this.pendingCpu;
    if (action.type === "plant") {
      if (this.cpuStage === "turn") {
        this.cpuStage = "market";
        return true;
      }
      if (this.cpuStage === "market") {
        this.cpuStage = "plot";
        return true;
      }
      if (this.cpuStage === "plot") {
        this.commitCpu();
        this.cpuStage = "coins";
        return true;
      }
    } else if (action.type === "curse") {
      if (this.cpuStage === "turn") {
        this.cpuStage = "curse";
        return true;
      }
      this.commitCpu();
      return this.cpuTick();
    } else {
      this.commitCpu();
      return this.cpuTick();
    }
    this.clearCpuShow();
    return false;
  }

  private armCpu(): void {
    if (!this.state || this.state.actingSeat === null) return;
    const actor = this.state.players[this.state.actingSeat];
    if (!actor || actor.kind !== "cpu") return;
    const view = getPublicView(this.state, actor.seat);
    this.pendingCpu = chooseById(actor.cpuStrategyId, view, this.cpuRng);
    this.cpuActorSeat = actor.seat;
    this.cpuStage = "turn";
  }

  private commitCpu(): void {
    if (!this.state || !this.pendingCpu) return;
    try {
      this.state = applyPlayerAction(this.state, this.pendingCpu, this.rng);
    } catch {
      this.state = applyPlayerAction(this.state, { type: "pass" }, this.rng);
    }
    this.pendingCpu = null;
  }

  private plotIndexFor(seat: number, action: Extract<Action, { type: "plant" }>): number {
    if (action.target !== "newLand") return action.target.plotIndex;
    const next = this.state?.players[seat]?.plots.find((plot) => !plot.owned);
    return next?.index ?? 0;
  }

  private clearCpuShow(): void {
    this.pendingCpu = null;
    this.cpuStage = null;
    this.cpuActorSeat = null;
  }

  private finishIncomeIfDue(): void {
    if (!this.state || this.hold) return;
    if (this.state.phase !== "income") return;
    this.clearCpuShow();
    this.state = applyHarvest(this.state);
    this.hold = "result";
  }

  private rematch(): void {
    this.rematchCount += 1;
    this.matchSeed = `${this.config.seed}-r${this.rematchCount}`;
    this.start();
  }

  private flushCpus(): void {
    if (!this.state) return;
    for (let i = 0; i < 8000; i++) {
      if (this.hold) return;
      if (this.state.phase === "gameOver") {
        this.recordSeason();
        if (this.seasonIndex < this.seasonCount) {
          this.beginNextSeason();
          continue;
        }
        return;
      }
      if (this.state.phase === "income") {
        if (this.config.humanCount === 0) {
          this.state = applyHarvest(this.state);
          this.state = concludeRound(this.state);
          if (this.state.phase !== "gameOver") {
            this.state = applyEventUpdate(this.state, this.rng);
            this.state.phase = "turn";
          }
          continue;
        }
        this.finishIncomeIfDue();
        return;
      }
      if (this.state.phase !== "turn" || this.state.actingSeat === null) return;
      const actor = this.state.players[this.state.actingSeat];
      if (!actor || actor.kind !== "cpu") return;
      const view = getPublicView(this.state, actor.seat);
      const action = chooseById(actor.cpuStrategyId, view, this.cpuRng);
      try {
        this.state = applyPlayerAction(this.state, action, this.rng);
      } catch {
        this.state = applyPlayerAction(this.state, { type: "pass" }, this.rng);
      }
    }
  }
}
