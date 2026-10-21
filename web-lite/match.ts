import { applyEventUpdate, applyHarvest, applyPlayerAction, concludeRound, createGame, createRng, getPublicView, listLegalActions } from '../src/engine/index.js';
import { actionsEqual } from '../src/engine/legal.js';
import { chooseById } from '../src/cpu/index.js';
import { previousSeasonTrailers } from '../src/view/standings.js';
import type { Action, GameState, Mode, SeatConfig } from '../src/engine/types.js';

export type Settings = { mode: Mode; players: number; seasons: number; seed: string };
export type Screen = 'intro' | 'play' | 'harvest' | 'actions' | 'mix' | 'trail' | 'result';

/** Rules advance only here. Animation never owns or changes game state. */
export class Match {
  readonly rng;
  readonly cpuRng;
  readonly seats: SeatConfig[];
  readonly firstSeat: number;
  state: GameState;
  screen: Screen = 'intro';
  scores: number[][] = [];
  harvested = false;

  constructor(readonly settings: Settings) {
    if (![3, 4, 5].includes(settings.players) || !Number.isInteger(settings.seasons) || settings.seasons < 1 || settings.seasons > 10) throw new Error('人数・シーズン数が不正です');
    this.rng = createRng(settings.seed);
    this.cpuRng = createRng(`${settings.seed}-cpu`);
    this.firstSeat = this.rng.nextInt(settings.players);
    this.seats = Array.from({ length: settings.players }, (_, i) => i === 0
      ? { kind: 'human', name: 'あなた' }
      : { kind: 'cpu', name: `CPU ${i}`, cpuStrategyId: 'irr' });
    this.state = this.createSeason();
  }

  private createSeason(): GameState {
    const season = this.scores.length + 1;
    return createGame({ ...this.settings, seats: this.seats, season, seasonCount: this.settings.seasons,
      startSeat: (this.firstSeat + season - 1) % this.seats.length,
      evenStartCoins: this.settings.seasons % this.seats.length === 0,
      curseSeats: previousSeasonTrailers(this.scores, season, this.seats.length) }, this.rng);
  }

  get view() { return getPublicView(this.state, 0); }
  get totals() { return this.seats.map((_, seat) => this.scores.reduce((sum, row) => sum + row[seat]!, 0)); }
  get humanTurn() { return this.screen === 'play' && this.state.actingSeat === 0; }

  start() {
    if (this.screen !== 'intro') throw new Error('開始できません');
    this.screen = 'play';
  }

  act(action: Action) {
    if (this.screen !== 'play' || !listLegalActions(this.state).some(a => actionsEqual(a, action))) throw new Error('今はその操作を行えません');
    this.state = applyPlayerAction(this.state, action, this.rng);
    if (this.state.phase === 'income') this.screen = 'harvest';
  }

  cpuAction(): Action {
    if (this.screen !== 'play' || this.state.actingSeat === null || this.state.actingSeat === 0) throw new Error('CPUの手番ではありません');
    return chooseById('irr', getPublicView(this.state, this.state.actingSeat), this.cpuRng);
  }

  previewHarvest() { return applyHarvest(this.state).lastHarvest; }

  finishHarvest() {
    if (this.screen !== 'harvest' || this.harvested) throw new Error('収穫は処理済みです');
    this.state = applyHarvest(this.state);
    this.harvested = true;
  }

  next() {
    if (this.screen === 'harvest') {
      if (!this.harvested) throw new Error('収穫中です');
      this.state = concludeRound(this.state);
      this.harvested = false;
      if (this.state.phase === 'gameOver') {
        this.scores.push(this.state.players.map(p => p.coins));
        this.screen = 'actions';
      } else {
        this.state = applyEventUpdate(this.state, this.rng);
        this.screen = 'play';
      }
    } else if (this.screen === 'actions') this.screen = 'mix';
    else if (this.screen === 'mix') {
      if (this.scores.length === this.settings.seasons) this.screen = 'trail';
      else { this.state = this.createSeason(); this.screen = 'intro'; }
    } else if (this.screen === 'trail') this.screen = 'result';
    else throw new Error('次へ進めません');
  }
}
