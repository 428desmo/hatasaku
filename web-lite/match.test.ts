import { describe, expect, test } from 'vitest';
import { Match } from './match.js';
import {currentCropList,cropDef,cropBlurb,cropShortName} from '../src/engine/catalog.js';
import {vegetable} from './art.js';
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
  for (const mode of ['advanced'] as const) for (const players of [3,4,5]) {
    test(`${mode}, ${players} seats: entire multi-season match`, () => {
      const m = new Match({mode,players,seasons:players,seed:`${mode}-${players}`});
      const first = m.state.startSeat;
      for (let season = 1; season <= players; season++) {
        expect(m.screen).toBe('intro');
        expect(m.state.startSeat).toBe((first + season - 1) % players);
        expect(m.state.players.every(p => p.coins === 8)).toBe(true);
        expect(m.state.players[0]!.plots).toHaveLength(6);
        expect(m.state.crop.market).toHaveLength(players === 5 ? 4 : 3);
        expect(m.state.curseReadySeats).toEqual(previousSeasonTrailers(m.scores, season, players));
        const order = [...m.state.turnOrder];
        playSeason(m);
        expect(m.state.turnOrder).toEqual(order);
        expect(m.scores).toHaveLength(season);
        expect(m.state.seasonActions).toHaveLength(players * 18);
        expect(m.state.players.every(p => p.coins >= 0)).toBe(true);
        expect(m.screen).toBe('actions'); m.next(); expect(m.screen).toBe('mix'); m.next();
      }
      expect(m.screen).toBe('trail'); m.next(); expect(m.screen).toBe('result');
      expect(m.totals).toEqual(m.seats.map((_, seat) => m.scores.reduce((n,row) => n + row[seat]!,0)));
    });
  }
  test('hidden curse reveals once at harvest, without consuming the turn', () => {
    const m = new Match({mode:'advanced',players:3,seasons:3,seed:'curse'});
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
    const m = new Match({mode:'advanced',players:3,seasons:1,seed:'guard'});
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

describe('local resume', () => {
  test('replays a mid-harvest save without double-paying', () => {
    const m = new Match({mode:'advanced',players:3,seasons:3,seed:'save'}); m.start();
    while (m.screen === 'play') m.act(chooseById('irr', getPublicView(m.state,m.state.actingSeat!),m.cpuRng));
    const before = Match.restore(JSON.parse(JSON.stringify(m.save())));
    expect(before.state).toEqual(m.state); expect(before.screen).toBe('harvest');
    before.finishHarvest(); m.finishHarvest();
    const after = Match.restore(before.save());
    expect(after.state).toEqual(m.state); expect(after.harvested).toBe(true);
    expect(() => after.finishHarvest()).toThrow();
    after.next(); m.next(); expect(after.state).toEqual(m.state);
  });
  test('restores between seasons with the same future random stream', () => {
    const m = new Match({mode:'advanced',players:3,seasons:3,seed:'save-seasons'});
    playSeason(m); m.next(); m.next();
    const restored = Match.restore(m.save());
    expect(restored.state).toEqual(m.state);
    playSeason(m); playSeason(restored);
    expect(restored.state).toEqual(m.state); expect(restored.scores).toEqual(m.scores);
  });
  test('does not start or resume the retired ten-round format', () => {
    const old={mode:'basic',players:4,seasons:1,seed:'legacy'};
    expect(() => new Match(old as never)).toThrow();
    expect(() => Match.restore({version:1,settings:old,commands:[]})).toThrow();
  });
  test('rejects incompatible and corrupted saves', () => {
    expect(() => Match.restore({version:9})).toThrow();
    expect(() => Match.restore({version:1,settings:{mode:'advanced',players:3,seasons:1,seed:'bad'},commands:[{kind:'next'}]})).toThrow();
  });
});

describe('current crop edition',()=>{
  test('new seasons draw four distinct current crops and retain their parameter bundles',()=>{
    const ids=new Set(currentCropList.map(c=>c.id));
    expect(ids.size).toBe(12);
    expect(new Set(currentCropList.map(c=>[c.cost,c.wait,c.harvest,c.baseIncome,c.floor,c.cooldown].join(':'))).size).toBe(12);
    for(let seed=0;seed<30;seed++){
      const m=new Match({mode:'advanced',players:5,seasons:1,seed:`new-pool-${seed}`});
      expect(m.state.specVersion).toBe('0.20');
      expect(new Set(m.state.cropIdsInGame).size).toBe(4);
      expect(m.state.cropIdsInGame.every(id=>ids.has(id))).toBe(true);
      expect(m.save().version).toBe(3);
    }
    for(const c of currentCropList){
      expect(cropDef(c.id)).toEqual(c);
      expect(cropShortName(c.id).length).toBeLessThanOrEqual(3);
      expect(cropBlurb(c.id)).toBe(c.description);
      expect(vegetable(c.id)).toContain('<path');
      if(c.art!=='radish') expect(vegetable(c.id)).not.toBe(vegetable('unknown'));
    }
  });
  test('legacy eighteen-round saves keep their original crops, scores and future draws',()=>{
    const m=new Match({mode:'advanced',players:3,seasons:3,seed:'legacy-catalog'},'0.18');
    expect(m.save().version).toBe(1);
    playSeason(m);m.next();m.next();
    const restored=Match.restore(m.save());
    expect(restored.catalogVersion).toBe('0.18');
    expect(restored.state).toEqual(m.state);
    playSeason(m);playSeason(restored);
    expect(restored.state).toEqual(m.state);
    expect(restored.scores).toEqual(m.scores);
  });
});
