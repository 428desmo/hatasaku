import {describe,test,expect} from 'vitest';
import {Match} from './match.js';
import {applyPlayerAction,createRng,getPublicView,listLegalActions} from '../src/engine/index.js';
import {cropDef} from '../src/engine/catalog.js';
import {strategy,personalities,choosePersonality,type Personality} from './strategy.js';
const settings={mode:'advanced' as const,players:4,seasons:4,seed:'new-actions'};
function fixture(){const m=new Match(settings);m.start();return m;}
function inventory(m:Match){return [...m.state.crop.deck,...m.state.crop.discard,...m.state.crop.market,...m.state.players.flatMap(p=>p.plots.flatMap(x=>x.cropCard?[x.cropCard]:[]))].map(c=>c.instanceId).sort();}
describe('v0.20 rule actions',()=>{
 test('exchange charges exactly 2G, retains turn, excludes removed instances and allows only once',()=>{
  const m=fixture(),seat=m.state.actingSeat!,coins=m.state.players[seat]!.coins,before=inventory(m),old=m.state.crop.market.map(c=>c.instanceId);
  m.act({type:'refresh'});
  expect(m.state.actingSeat).toBe(seat);expect(m.state.players[seat]!.coins).toBe(coins-2);
  expect(m.state.crop.market.every(c=>!old.includes(c.instanceId))).toBe(true);expect(inventory(m)).toEqual(before);
  expect(m.state.seasonActions).toHaveLength(0);expect(()=>m.act({type:'refresh'})).toThrow();
  m.state.curseReadySeats=[seat];m.act({type:'curse',cropId:m.state.cropIdsInGame[0]!});expect(()=>m.act({type:'refresh'})).toThrow();
  m.act({type:'pass'});expect(m.state.refreshedThisTurn).toBe(false);expect(listLegalActions(m.state).some(a=>a.type==='refresh')).toBe(true);
 });
 test('all-pass sweep still occurs after a paid exchange',()=>{
  const m=fixture();m.act({type:'refresh'});const old=m.state.crop.market.map(c=>c.instanceId);
  while(m.screen==='play')m.act({type:'pass'});
  expect(m.state.crop.discard.filter(c=>old.includes(c.instanceId))).toHaveLength(old.length);
 });
 test('replacement loses the old crop, retains owned land and charges only the new crop cost',()=>{
  const m=fixture(),p=m.state.players[m.state.actingSeat!]!,first=m.state.crop.deck.findIndex(c=>c.cropId!==m.state.crop.market[0]!.cropId),old=m.state.crop.deck.splice(first,1)[0]!;
  p.plots[0]={index:0,owned:true,cropCard:old,white:0,green:2,red:0};const before=inventory(m),coins=p.coins,id=m.state.crop.market[0]!.cropId,seat=p.seat;
  m.act({type:'replace',marketIndex:0,plotIndex:0});const plot=m.state.players[seat]!.plots[0]!;
  expect(plot).toMatchObject({owned:true,white:cropDef(id).wait,green:0,red:0,cropCard:{cropId:id}});
  expect(m.state.crop.discard.some(c=>c.instanceId===old.instanceId)||m.state.crop.deck.some(c=>c.instanceId===old.instanceId)).toBe(true);
  expect(m.state.players[seat]!.coins).toBe(coins-cropDef(id).cost);expect(m.state.actingSeat).not.toBe(seat);expect(m.state.seasonActions).toHaveLength(1);expect(inventory(m)).toEqual(before);
 });
 test('illegal replacement and insufficient funds leave state and random stream intact',()=>{
  const m=fixture(),p=m.state.players[m.state.actingSeat!]!;p.coins=1;const before=JSON.stringify(m.state);
  expect(()=>m.act({type:'refresh'})).toThrow();expect(()=>m.act({type:'replace',marketIndex:0,plotIndex:0})).toThrow();expect(JSON.stringify(m.state)).toBe(before);
 });
 test('same-species replanting is not a way to reset an active crop',()=>{
  const m=fixture(),p=m.state.players[m.state.actingSeat!]!,index=m.state.crop.deck.findIndex(c=>c.cropId===m.state.crop.market[0]!.cropId),card=m.state.crop.deck.splice(index,1)[0]!;
  p.plots[0]={index:0,owned:true,cropCard:card,white:1,green:0,red:0};
  expect(()=>m.act({type:'replace',marketIndex:0,plotIndex:0})).toThrow();
 });
 test('v2 saves retain old legality, CPU decisions and future streams',()=>{
  const m=new Match(settings,'0.19');m.start();while(m.state.round<3){if(m.screen==='play')m.act(m.state.actingSeat===0?{type:'pass'}:m.cpuAction());else{m.finishHarvest();m.next();}}
  const restored=Match.restore(m.save());expect(restored.save().version).toBe(2);expect(restored.state).toEqual(m.state);expect(restored.cpuAction()).toEqual(m.cpuAction());expect(listLegalActions(restored.state).some(a=>a.type==='refresh'||a.type==='replace')).toBe(false);
 });
 test('v4 saves restore exactly after refresh and continue through seasons',()=>{
  const m=fixture();m.act({type:'refresh'});const restored=Match.restore(m.save());expect(restored.state).toEqual(m.state);expect(restored.save().version).toBe(4);
  let steps=0;while(m.screen==='play'||m.screen==='harvest'){
   expect(++steps).toBeLessThan(400);if(m.screen==='play'){const a=m.state.actingSeat===0?{type:'pass' as const}:m.cpuAction();expect(a).toEqual(restored.state.actingSeat===0?{type:'pass'}:restored.cpuAction());m.act(a);restored.act(a);}else{m.finishHarvest();restored.finishHarvest();m.next();restored.next();}expect(restored.state).toEqual(m.state);
  }
 });
});
describe('public-information CPU cognition',()=>{
 test('rough weather sees one salient event without timing; exact weather checks every harvest',()=>{
  const m=fixture(),v=getPublicView(m.state,m.state.actingSeat!),id=v.market[0]!.cropId;
  v.round=1;v.lastRound=18;v.eventActive=[];v.eventRow=[{instanceId:'known',cropId:id,delta:4,activatedRound:15}];v.curses=[];
  const base={...personalities[2]!,competition:'ignore' as const,curse:'ignore' as const};const a={type:'plant' as const,marketIndex:0,target:'newLand' as const};
  expect(strategy(v,{...base,weather:'rough'}).score(a)).toBeGreaterThan(strategy(v,{...base,weather:'exact'}).score(a));
  expect(strategy(v,{...base,weather:'ignore'}).score(a)).toBe(strategy(v,{...base,weather:'exact'}).score(a));
 });
 test('rough competition counts a crop whose harvest is too late to overlap',()=>{
  const m=fixture(),v=getPublicView(m.state,m.state.actingSeat!),id=v.market[0]!.cropId;v.round=1;v.lastRound=18;v.eventRow=[];v.eventActive=[];
  v.players[(v.actingSeat!+1)%4]!.plots[0]={index:0,owned:true,cropId:id,white:17,green:0,red:0};
  const base={...personalities[2]!,weather:'ignore' as const,curse:'ignore' as const};const a={type:'plant' as const,marketIndex:0,target:'newLand' as const};
  expect(strategy(v,{...base,competition:'rough'}).score(a)).toBeLessThan(strategy(v,{...base,competition:'exact'}).score(a));
 });
 test('hidden target and deck order cannot change a public-information decision',()=>{
  const m=fixture(),s=m.state;s.curseReadySeats=[s.actingSeat!];m.act({type:'curse',cropId:s.cropIdsInGame[0]!});m.act({type:'pass'});
  const seat=m.state.actingSeat!,view=getPublicView(m.state,seat),a=choosePersonality(view,personalities[2]!);
  m.state.crop.deck.reverse();m.state.event.deck.reverse();m.state.curses[0]!.cropId=s.cropIdsInGame[1]!;
  expect(getPublicView(m.state,seat)).toEqual(view);expect(choosePersonality(getPublicView(m.state,seat),personalities[2]!)).toEqual(a);
 });
 test('independent cognitive axes can be mixed without changing the stated preferences',()=>{
  const m=fixture(),v=getPublicView(m.state,m.state.actingSeat!);
  for(const weather of ['ignore','rough','exact'] as const)for(const competition of ['ignore','rough','exact'] as const)for(const curse of ['ignore','predict'] as const){const p:Personality={...personalities[2]!,weather,competition,curse};expect(v.legalActions).toContainEqual(choosePersonality(v,p));}
 });
});
