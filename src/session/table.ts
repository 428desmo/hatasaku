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
import type { Action, GameState, Mode, SeatKind } from "../engine/types.js";
import { chooseById } from "../cpu/index.js";
import { renderHtml } from "../view/html.js";
import { toPresentation, type ActionChip } from "../view/presentation.js";
import { renderGameSummaryHtml, renderGameSummaryText } from "../view/endSummary.js";
import { renderRoundResultHtml, renderRoundResultText } from "../view/summary.js";
import { renderText } from "../view/text.js";

export type TableConfig = {
  mode: Mode;
  humanCount: number;
  cpuCount: number;
  cpuStrategyId: string;
  seed: string;
};

export type UiHold = "result" | null;

type HumanSlot = { seat: number; connected: boolean };

export class Table {
  readonly config: TableConfig;
  state: GameState | null = null;
  rng: Rng;
  hold: UiHold = null;
  readonly acks = new Set<number>();
  readonly humanSeats: HumanSlot[];
  private cpuRng: Rng;

  constructor(config: TableConfig) {
    const total = config.humanCount + config.cpuCount;
    if (total < 3 || total > 5) throw new Error("N+M must be 3-5");
    this.config = config;
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
    const seats = [
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
    this.state = createGame(
      { mode: this.config.mode, seed: this.config.seed, seats },
      this.rng,
    );
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
        view: {
          mode: this.config.mode,
          round: 0,
          lastRound: this.config.mode === "tutorial" ? 10 : 20,
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
    const you = seat === "spectator" ? null : seat;
    const board = toPresentation(view, you);
    const over = this.state.phase === "gameOver" && !this.hold;
    const summaryHtml = this.hold === "result"
      ? renderRoundResultHtml(this.state)
      : over
        ? renderGameSummaryHtml(this.state)
        : "";
    const summaryText = this.hold === "result"
      ? renderRoundResultText(this.state)
      : over
        ? renderGameSummaryText(this.state)
        : "";
    const textBody = over ? `最終盤面\n${renderText(board)}` : renderText(board);
    return {
      text: summaryText ? `${summaryText}\n\n${textBody}` : textBody,
      html: renderHtml(board, summaryHtml, { finalBoard: over }),
      view,
      hold: this.hold,
      acked,
      ackNeed,
      ackGot,
      actions: this.hold ? [] : board.actions,
    };
  }

  private advanceHold(): void {
    if (!this.state || !this.hold) return;
    this.state = concludeRound(this.state);
    if (this.state.phase !== "gameOver") {
      this.state = applyEventUpdate(this.state, this.rng);
      this.state.phase = "turn";
    }
    this.hold = null;
    this.flushCpus();
  }

  private flushCpus(): void {
    if (!this.state) return;
    for (let i = 0; i < 2000; i++) {
      if (this.hold) return;
      if (this.state.phase === "gameOver") return;
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
