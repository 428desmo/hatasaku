import {describe,test,expect} from 'vitest';
import {characters,personalityForCharacter,seasonOptions} from './characters.js';
import {Match} from './match.js';
import {avatar} from './art.js';
const settings={mode:'advanced' as const,players:5,seasons:5,seed:'characters'};
describe('named CPU identities',()=>{
 test('four distinct identities map one-to-one to fixed personalities and portraits',()=>{
  expect(characters.map(c=>c.name)).toEqual(['ハンス','お春','田吾作','みのり']);
  expect(new Set(characters.map(c=>c.id)).size).toBe(4);expect(characters.filter(c=>c.gender==='female')).toHaveLength(2);
  for(const c of characters)expect(personalityForCharacter(c.id).id).toBe(c.id);
  expect(new Set(characters.map(c=>avatar(1,c.id))).size).toBe(4);
 });
 test('members are unique and seeded; subsets and seat order vary across matches',()=>{
  const pairs=new Set<string>();
  for(let i=0;i<100;i++){
   const m=new Match({...settings,players:3,seed:`members-${i}`});
   expect(new Set(m.seats.slice(1).map(p=>p.name)).size).toBe(2);
   pairs.add(m.seats.slice(1).map(p=>p.name).sort().join(':'));
   expect(new Match({...settings,players:3,seed:`members-${i}`}).seats).toEqual(m.seats);
   for(let seat=1;seat<3;seat++){const c=characters.find(c=>c.name===m.seats[seat]!.name)!;expect(m.cpuPersonality(seat).id).toBe(c.id);}
  }
  expect(pairs.size).toBe(6);
 });
 test('old v3 saves keep CPU names, fixed-seat profiles and the original random stream',()=>{
  const m=new Match(settings,'0.20',false);m.start();m.act({type:'pass'});
  expect(m.save().version).toBe(3);const restored=Match.restore(m.save());
  expect(restored.namedCharacters).toBe(false);expect(restored.seats).toEqual(m.seats);expect(restored.state).toEqual(m.state);
  expect(restored.seats[1]!.name).toBe('CPU 1');expect(restored.cpuPersonality(1).id).toBe('grower');
 });
 test('character selection does not change the crop or event draws',()=>{
  const old=new Match(settings,'0.20',false),now=new Match(settings);
  expect(now.state.crop).toEqual(old.state.crop);expect(now.state.event).toEqual(old.state.event);expect(now.firstSeat).toBe(old.firstSeat);
 });
});
describe('extended season choices',()=>{
 test('choices track player count while retaining their multiplier',()=>{
  expect(seasonOptions(3).map(o=>o.seasons)).toEqual([1,3,6,15,30]);expect(seasonOptions(5).map(o=>o.seasons)).toEqual([1,5,10,25,50]);
  expect(seasonOptions(4).find(o=>o.value==='x5')!.seasons).toBe(20);
  expect(()=>new Match({...settings,seasons:51})).toThrow();
 });
 test('a 50-season match completes and restores beyond the former 5000-command limit',()=>{
  const m=new Match({...settings,seasons:50});const members=structuredClone(m.seats);
  for(let season=0;season<50;season++){
   expect(m.seats).toEqual(members);expect(m.state.players.map(p=>p.name)).toEqual(members.map(p=>p.name));m.start();
   while(m.screen==='play'||m.screen==='harvest'){if(m.screen==='play')m.act({type:'pass'});else{m.finishHarvest();m.next();}}
   m.next();m.next();
  }
  expect(m.screen).toBe('trail');expect(m.save().commands.length).toBeGreaterThan(5000);
  const restored=Match.restore(m.save());expect(restored.state).toEqual(m.state);expect(restored.scores).toEqual(m.scores);expect(restored.seats).toEqual(m.seats);expect(restored.screen).toBe('trail');
 },20000);
});
