import {currentCropList} from '../src/engine/catalog.js';
import {shuffle} from '../src/engine/rng.js';
import { applyEventUpdate, applyHarvest, applyPlayerAction, concludeRound, createGame, createRng, getPublicView, listLegalActions } from '../src/engine/index.js';
import { actionsEqual } from '../src/engine/legal.js';
import { chooseById } from '../src/cpu/index.js';
import { previousSeasonTrailers } from '../src/view/standings.js';
import type { Action, GameState, SeatConfig } from '../src/engine/types.js';

export type Settings = { mode: 'advanced'; players: number; seasons: number; seed: string };
export type MatchCommand = {kind:'start'|'harvest'|'next'} | {kind:'act'; action:Action};
export type SavedMatch = {version:1|2; settings:Settings; commands:MatchCommand[]};
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
  private commands: MatchCommand[] = [];
  harvested = false;

  constructor(readonly settings: Settings, readonly catalogVersion:'0.18'|'0.19'='0.19') {
    if (settings.mode !== 'advanced') throw new Error('現行版は18ラウンド制のみです');
    if (typeof settings.seed !== 'string' || settings.seed.length > 100 || ![3, 4, 5].includes(settings.players) || !Number.isInteger(settings.seasons) || settings.seasons < 1 || settings.seasons > 10) throw new Error('人数・シーズン数が不正です');
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
    const state=createGame({ ...this.settings, seats: this.seats, season, seasonCount: this.settings.seasons,
      ...(this.catalogVersion==='0.19'?{forcedCrops:shuffle(currentCropList.map(c=>c.id),this.rng).slice(0,4)}:{}),
      startSeat: (this.firstSeat + season - 1) % this.seats.length,
      evenStartCoins: this.settings.seasons % this.seats.length === 0,
      curseSeats: previousSeasonTrailers(this.scores, season, this.seats.length) }, this.rng);
    if(this.catalogVersion==='0.19') state.specVersion='0.19';
    return state;
  }

  save(): SavedMatch { return {version:this.catalogVersion==='0.19'?2:1, settings:{...this.settings}, commands:structuredClone(this.commands)}; }

  static restore(value: unknown): Match {
    const saved = value as SavedMatch;
    if (!saved || ![1,2].includes(saved.version) || !Array.isArray(saved.commands) || saved.commands.length > 5000) throw new Error('保存形式が不正です');
    const match = new Match(saved.settings,saved.version===1?'0.18':'0.19');
    for (const command of saved.commands) {
      if (command.kind === 'start') match.start();
      else if (command.kind === 'act') {
        if (match.state.actingSeat !== 0) match.cpuAction();
        match.act(command.action);
      } else if (command.kind === 'harvest') match.finishHarvest();
      else if (command.kind === 'next') match.next();
      else throw new Error('保存コマンドが不正です');
    }
    return match;
  }

  get view() { return getPublicView(this.state, 0); }
  get totals() { return this.seats.map((_, seat) => this.scores.reduce((sum, row) => sum + row[seat]!, 0)); }
  get humanTurn() { return this.screen === 'play' && this.state.actingSeat === 0; }

  start() {
    if (this.screen !== 'intro') throw new Error('開始できません');
    this.screen = 'play';
    this.commands.push({kind:'start'});
  }

  act(action: Action) {
    if (this.screen !== 'play' || !listLegalActions(this.state).some(a => actionsEqual(a, action))) throw new Error('今はその操作を行えません');
    this.state = applyPlayerAction(this.state, action, this.rng);
    if (this.state.phase === 'income') this.screen = 'harvest';
    this.commands.push({kind:'act', action:structuredClone(action)});
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
    this.commands.push({kind:'harvest'});
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
    this.commands.push({kind:'next'});
  }
}
