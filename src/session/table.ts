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
import { renderRoundResultHtml, renderRoundResultText } from "../view/summary.js";
import { renderText } from "../view/text.js";

export type TableConfig = {
  mode: Mode;
  humanCount: number;
  cpuCount: number;
  cpuStrategyId: string;
  seed: string;
  seasonCount?: number;
};

export type UiHold = "result" | "season" | null;

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

  constructor(config: TableConfig) {
    const total = config.humanCount + config.cpuCount;
    if (total < 3 || total > 5) throw new Error("N+M must be 3-5");
    this.config = config;
    this.seasonCount = config.seasonCount ?? total;
    this.rng = createRng(config.seed);
    this.cpuRng = createRng(`${config.seed}-cpu`);
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
    return this.state?.phase === "gameOver" && this.seasonIndex >= this.seasonCount && this.hold === null;
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

  start(): void {
    const n = this.config.humanCount + this.config.cpuCount;
    this.seats = [
      ...Array.from({ length: this.config.humanCount }, (_, i) => ({
        kind: "human" as SeatKind,
        name: `プレイヤー${i + 1}`,
      })),
      ...Array.from({ length: this.config.cpuCount }, (_, i) => ({
        kind: "cpu" as SeatKind,
        name: `CPU${i + 1}`,
        cpuStrategyId: this.config.cpuStrategyId,
      })),
    ];
    this.rng = createRng(this.config.seed);
    this.hold = null;
    this.acks.clear();
    this.seasonCount = this.config.seasonCount ?? n;
    this.seasonIndex = 1;
    this.startSeat = this.rng.nextInt(n);
    this.scoreSheet = [];
    this.matchWinnerSeats = [];
    this.state = this.createSeasonState();
    this.flushCpus();
  }

  applyFromSeat(seat: number, action: Action): void {
    if (!this.state) throw new Error("not started");
    if (this.hold) throw new IllegalActionError("summary waiting");
    if (this.state.phase === "gameOver") throw new IllegalActionError("game over");
    if (this.state.actingSeat !== seat) throw new IllegalActionError("not your turn");
    this.state = applyPlayerAction(this.state, action, this.rng);
    this.flushCpus();
  }

  nextFromSeat(seat: number): void {
    if (!this.state || !this.hold) return;
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
    crops: typeof cropList;
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
          message: waiting,
        },
      };
    }
    const view = getPublicView(this.state, this.hold ? "spectator" : seat);
    if (this.hold === "result") view.message = "内容を確認して［次へ］を押してください。";
    if (this.hold === "season") view.message = "シーズンが終わりました。確認して［次へ］で次のシーズンに進みます。";
    const you = seat === "spectator" ? null : seat;
    const board = toPresentation(view, you);
    const names = this.state.players.map((p) => p.name);
    const seasonDone = this.state.phase === "gameOver";
    const matchDone = this.matchOver;
    const showSeasonSummary = this.hold === "season" || matchDone;
    const sheet = showSeasonSummary ? this.scoreSheet : [];
    const winners = matchDone ? this.matchWinnerSeats : this.state.winnerSeats;
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
    const textBody = finalBoard || this.hold === "season" ? `最終盤面\n${renderText(board)}` : renderText(board);
    return {
      text: summaryText ? `${summaryText}\n\n${textBody}` : textBody,
      html: renderHtml(board, summaryHtml, { finalBoard: finalBoard || this.hold === "season" }),
      view,
      board,
      harvest: this.state.lastHarvest,
      lastPayouts: this.state.lastPayouts,
      scoreSheet: this.scoreSheet,
      matchWinnerSeats: this.matchWinnerSeats,
      crops: cropList,
      hold: this.hold,
      acked,
      ackNeed,
      ackGot,
      actions: this.hold ? [] : board.actions,
    };
  }

  private createSeasonState(): GameState {
    const n = this.seats.length;
    return createGame(
      {
        mode: this.config.mode,
        seed: this.config.seed,
        seats: this.seats,
        startSeat: this.startSeat,
        evenStartCoins: this.seasonCount % n === 0,
        season: this.seasonIndex,
        seasonCount: this.seasonCount,
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

  private advanceHold(): void {
    if (!this.state || !this.hold) return;
    if (this.hold === "season") {
      this.beginNextSeason();
      this.hold = null;
      this.flushCpus();
      return;
    }
    this.state = concludeRound(this.state);
    if (this.state.phase !== "gameOver") {
      this.state = applyEventUpdate(this.state, this.rng);
      this.state.phase = "turn";
      this.hold = null;
      this.flushCpus();
      return;
    }
    this.recordSeason();
    this.hold = this.seasonIndex < this.seasonCount ? "season" : null;
    if (!this.hold) this.flushCpus();
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
        this.state = applyHarvest(this.state);
        this.hold = "result";
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
