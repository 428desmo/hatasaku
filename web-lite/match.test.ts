import { describe, expect, test } from 'vitest';
import { Match } from './match.js';
import { applyHarvest, getPublicView } from '../src/engine/index.js';
import { chooseById } from '../src/cpu/index.js';
import { previousSeasonTrailers } from '../src/view/standings.js';

function playSeason(m: Match) {
  m.start();
  let count = 0;
  while (m.screen === 'play' || m.screen === 'harvest') {
    if (++count > 500) throw new Error('progress stalled');
    if (m.screen === 'play') {
      const actor = m.state.actingSeat!;
      const action = actor === 0 ? chooseById('irr', getPublicView(m.state, 0), m.cpuRng) : m.cpuAction();
      m.act(action);
    } else {
      const stateBefore = JSON.stringify(m.state);
      const expected = applyHarvest(m.state);
      expect(m.previewHarvest()).toEqual(expected.lastHarvest);
      expect(JSON.stringify(m.state)).toBe(stateBefore);
      expect(() => m.next()).toThrow('収穫中');
      m.finishHarvest();
      expect(m.state).toEqual(expected);
      const once = JSON.stringify(m.state);
      expect(() => m.finishHarvest()).toThrow('処理済み');
      expect(JSON.stringify(m.state)).toBe(once);
      m.next();
    }
  }
}
describe('standalone single-player match', () => {
  for (const mode of ['basic','advanced'] as const) for (const players of [3,4,5]) {
    test(`${mode}, ${players} seats: entire multi-season match`, () => {
      const m = new Match({mode,players,seasons:players,seed:`${mode}-${players}`});
      const first = m.state.startSeat;
      for (let season = 1; season <= players; season++) {
        expect(m.screen).toBe('intro');
        expect(m.state.startSeat).toBe((first + season - 1) % players);
        expect(m.state.players.every(p => p.coins === 8)).toBe(true);
        expect(m.state.players[0]!.plots).toHaveLength(mode === 'basic' ? 5 : 6);
        expect(m.state.crop.market).toHaveLength(players === 5 ? 4 : 3);
        expect(m.state.curseReadySeats).toEqual(previousSeasonTrailers(m.scores, season, players));
        const order = [...m.state.turnOrder];
        playSeason(m);
        expect(m.state.turnOrder).toEqual(order);
        expect(m.scores).toHaveLength(season);
        expect(m.state.seasonActions).toHaveLength(players * (mode === 'basic' ? 10 : 18));
        expect(m.state.players.every(p => p.coins >= 0)).toBe(true);
        expect(m.screen).toBe('actions'); m.next(); expect(m.screen).toBe('mix'); m.next();
      }
      expect(m.screen).toBe('trail'); m.next(); expect(m.screen).toBe('result');
      expect(m.totals).toEqual(m.seats.map((_, seat) => m.scores.reduce((n,row) => n + row[seat]!,0)));
    });
  }
  test('hidden curse reveals once at harvest, without consuming the turn', () => {
    const m = new Match({mode:'basic',players:3,seasons:3,seed:'curse'});
    m.start(); m.state.curseReadySeats = [m.state.actingSeat!];
    const seat = m.state.actingSeat!; const cropId = m.state.cropIdsInGame[0]!;
    m.act({type:'curse',cropId});
    expect(m.state.actingSeat).toBe(seat);
    expect(m.state.seasonActions).toHaveLength(0);
    const other = seat === 0 ? 1 : 0;
    expect(getPublicView(m.state,other).hiddenCurses).toEqual([{bySeat:seat}]);
    while (m.screen === 'play') m.act({type:'pass'});
    const before = m.state.curses[0]!; expect(before.revealed).toBe(false);
    m.previewHarvest(); expect(m.state.curses[0]!.revealed).toBe(false);
    m.finishHarvest(); expect(m.state.curses[0]!.revealed).toBe(true);
    expect(getPublicView(m.state,other).hiddenCurses).toEqual([]);
    expect(m.state.curses[0]).toMatchObject({from:2,to:5});
  });
  test('cannot act during intro or harvest; illegal action does not change state', () => {
    const m = new Match({mode:'basic',players:3,seasons:1,seed:'guard'});
    expect(() => m.act({type:'pass'})).toThrow(); m.start();
    const before = JSON.stringify(m.state);
    expect(() => m.act({type:'plant',marketIndex:99,target:'newLand'})).toThrow();
    expect(JSON.stringify(m.state)).toBe(before);
    while (m.screen === 'play') m.act({type:'pass'});
    expect(() => m.act({type:'pass'})).toThrow();
  });
  test('seed reproduces the whole match', () => {
    const settings = {mode:'advanced' as const,players:5,seasons:1,seed:'repeat'};
    const a = new Match(settings); const b = new Match(settings);
    playSeason(a); playSeason(b); expect(a.state).toEqual(b.state);
  });
});
