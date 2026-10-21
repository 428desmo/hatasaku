import {cropDef,currentCropList} from '../../src/engine/catalog.js';
import {createGame,createRng,applyPlayerAction,applyHarvest,concludeRound,applyEventUpdate,getPublicView,refillMarket,sweepMarketIfAllPassed} from '../../src/engine/index.js';
import {advanceTurnPointer} from '../../src/engine/turn.js';
import {cloneState,acquireCost,type Action,type GameState,type PublicView,type PlotView} from '../../src/engine/types.js';
import {harvestRoundsForPlot,visibleEventWindows} from '../../src/view/outlook.js';
import type {Rng} from '../../src/engine/rng.js';

export type Rules={id:string;label:string;clear?:'turn'|'replace';clearFee?:number;refresh?:'turn'|'free';refreshFee?:number;floorFactor?:number;competition?:number;soil?:boolean};
export const rules:Rules[]=[
 {id:'base',label:'現行'},
 {id:'clear-turn',label:'撤収で1手番',clear:'turn',clearFee:0},
 {id:'replace0',label:'撤収＋植付／無料',clear:'replace',clearFee:0},
 {id:'replace1',label:'撤収＋植付／1G',clear:'replace',clearFee:1},
 {id:'replace2',label:'撤収＋植付／2G',clear:'replace',clearFee:2},
 {id:'refresh-turn1',label:'全場札交換／1G＋1手番',refresh:'turn',refreshFee:1},
 {id:'refresh1',label:'全場札交換／1G・行動前',refresh:'free',refreshFee:1},
 {id:'refresh2',label:'全場札交換／2G・行動前',refresh:'free',refreshFee:2},
 {id:'refresh3',label:'全場札交換／3G・行動前',refresh:'free',refreshFee:3},
 {id:'combo0',label:'無料植替＋2G交換',clear:'replace',clearFee:0,refresh:'free',refreshFee:2},
 {id:'combo1',label:'1G植替＋2G交換',clear:'replace',clearFee:1,refresh:'free',refreshFee:2},
 {id:'floor-half',label:'最低保証半分',floorFactor:.5},
 {id:'competition2',label:'競合減額2倍',competition:2},
 {id:'soil',label:'他作物を挟んでも連作休み保持',soil:true},
];
export type Profile={id:string;discount:number;rent:number;risk:number};
export const profiles:Profile[]=[
 {id:'balanced',discount:.96,rent:.9,risk:0},
 {id:'fast',discount:.87,rent:1.2,risk:0},
 {id:'safe',discount:.96,rent:.9,risk:.3},
 {id:'patient',discount:.995,rent:.5,risk:0},
];
export type LabAction=Action|{type:'withdraw';plotIndex:number}|{type:'replace';plotIndex:number;marketIndex:number}|{type:'refresh'};
export type Memory=Map<string,number>;
const soilKey=(seat:number,plot:number,crop:string)=>`${seat}:${plot}:${crop}`;
export function soilBlocked(memory:Memory,seat:number,plot:number,crop:string,round:number){return (memory.get(soilKey(seat,plot,crop))??0)>round;}
function noteSoil(s:GameState,memory:Memory,seat:number,plot:number){const id=s.players[seat]!.plots[plot]!.cropCard?.cropId;if(id)memory.set(soilKey(seat,plot,id),s.round+1+cropDef(id).cooldown);}

/** Research adapters compare alternatives independently of production edition gating. */
export function execute(s:GameState,a:LabAction,cfg:Rules,rng:Rng,memory:Memory):GameState{
 const seat=s.actingSeat!;
 if(a.type==='pass'||a.type==='plant'||a.type==='curse')return applyPlayerAction(s,a,rng);
 let next=cloneState(s);const p=next.players[seat]!;
 if(a.type==='refresh'){
  const fee=cfg.refreshFee??0;if(!cfg.refresh||p.coins<fee)throw Error('illegal refresh');
  p.coins-=fee;
  const removed=next.crop.market;next.crop.market=[];
  // Refill before discarding: a paid exchange cannot immediately return the same instances.
  refillMarket(next,rng);next.crop.discard.push(...removed);
  if(cfg.refresh==='free')return next;
 }else{
  if(!cfg.clear||a.type==='withdraw'&&cfg.clear!=='turn'||p.coins<(cfg.clearFee??0))throw Error('illegal clear');
  const plot=p.plots[a.plotIndex];if(!plot?.cropCard||!(plot.white>0||plot.green>0))throw Error('not growing');
  if(a.type==='replace'){
   if(cfg.clear!=='replace')throw Error('replace not enabled');
   const newId=next.crop.market[a.marketIndex]?.cropId;
   if(!newId||newId===plot.cropCard.cropId||p.coins<(cfg.clearFee??0)+cropDef(newId).cost||cfg.soil&&soilBlocked(memory,seat,a.plotIndex,newId,s.round))throw Error('illegal replacement');
  }
  noteSoil(s,memory,seat,a.plotIndex);
  p.coins-=cfg.clearFee??0;plot.white=plot.green=0;plot.red=cropDef(plot.cropCard.cropId).cooldown;
  if(a.type==='withdraw'&&plot.red>0)plot.red++; // First cooldown tick is the round after withdrawal.
  if(a.type==='replace')return applyPlayerAction(next,{type:'plant',marketIndex:a.marketIndex,target:{plotIndex:a.plotIndex}},rng);
 }
 // Keep the real research action kind, so clearing/exchange is not counted as passing.
 // These research log kinds are outside the normal plant/pass summaries; round-log counters are not used in this lab.
 const log={seat,kind:a.type,cost:a.type==='refresh'?cfg.refreshFee??0:cfg.clearFee??0};
 next.roundActions.push(log as never);next.seasonActions.push(log as never);
 next=advanceTurnPointer(next);if(next.phase==='income')next=sweepMarketIfAllPassed(next,rng);
 return next;
}
export function harvest(s:GameState,cfg:Rules,memory:Memory):GameState{
 const n=applyHarvest(s);const deltas=n.players.map(()=>0);
 for(const d of n.lastHarvest){const gain=Math.max(Math.floor(d.floor*(cfg.floorFactor??1)),d.base-d.others*(cfg.competition??1)+d.eventSum);deltas[d.seat]!+=gain-d.gain;d.gain=gain;}
 n.players.forEach((p,i)=>{p.coins+=deltas[i]!;n.lastPayouts[i]!+=deltas[i]!;});
 for(const p of s.players)for(const plot of p.plots)if(plot.white===0&&plot.green===1)noteSoil(s,memory,p.seat,plot.index);
 return n;
}
export function legal(view:PublicView,cfg:Rules,memory:Memory):LabAction[]{
 const seat=view.actingSeat!;const me=view.players[seat]!;
 const out:LabAction[]=(view.legalActions??[]).filter(a=>a.type!=='plant'||a.target==='newLand'||!cfg.soil||!soilBlocked(memory,seat,a.target.plotIndex,view.market[a.marketIndex]!.cropId,view.round));
 if(cfg.clear)for(const p of me.plots)if(p.cropId&&(p.white>0||p.green>0)){
  if(cfg.clear==='turn'&&me.coins>=(cfg.clearFee??0))out.push({type:'withdraw',plotIndex:p.index});
  if(cfg.clear==='replace')view.market.forEach((card,marketIndex)=>{
   if(card.cropId!==p.cropId&&me.coins>=cropDef(card.cropId).cost+(cfg.clearFee??0)&&(!cfg.soil||!soilBlocked(memory,seat,p.index,card.cropId,view.round)))out.push({type:'replace',plotIndex:p.index,marketIndex});
  });
 }
 return out;
}
export function evaluator(view:PublicView,cfg:Rules,profile:Profile,memory:Memory){
 const now=view.round,end=view.lastRound,seat=view.actingSeat!,me=view.players[seat]!;
 const windows=visibleEventWindows(view); // No deck/discard ordering or hidden curses are inspected.
 const schedules=view.players.flatMap(p=>p.plots.filter(x=>x.cropId).map(plot=>({seat:p.seat,index:plot.index,id:plot.cropId!,rs:harvestRoundsForPlot(plot,now,end)})));
 function value(id:string,rs:number[],exclude?:number){
  const c=cropDef(id);let result=0;
  for(const r of rs){
   const others=schedules.filter(p=>p.id===id&&p.rs.includes(r)&&!(p.seat===seat&&p.index===exclude)).length;
   const ev=windows.filter(w=>w.cropId===id&&w.from<=r&&w.to>=r).reduce((n,w)=>n+w.delta,0);
   const floor=Math.floor(c.floor*(cfg.floorFactor??1));const gain=Math.max(floor,c.baseIncome-others*(cfg.competition??1)+ev);
   result+=(gain-profile.risk*Math.max(0,gain-floor))*profile.discount**(r-now);
  }
  return result;
 }
 function oldValue(plot:PlotView){
  const rs=harvestRoundsForPlot(plot,now,end);const occupied=rs.length?rs.at(-1)!-now+1:end-now+1;
  return {gross:value(plot.cropId!,rs,plot.index),utility:value(plot.cropId!,rs,plot.index)-profile.rent*occupied};
 }
 function plant(id:string,target:number|'newLand',extra=0,coins=me.coins){
  const c=cropDef(id);const isNew=target==='newLand';const land=isNew?acquireCost(me.plots.filter(p=>p.owned).length,view.mode):0;
  if(coins<land+c.cost+extra)return -Infinity;
  const rs=Array.from({length:c.harvest},(_,i)=>now+c.wait+i).filter(r=>r<=end);if(!rs.length)return -Infinity;
  const occupied=Math.min(c.wait+c.harvest,end-now+1);
  const landResidual=isNew?Math.min(land,Math.max(0,end-(now+c.wait+c.harvest-1))*.6):0;
  return value(id,rs,isNew?undefined:target)-c.cost-land-extra-profile.rent*occupied+landResidual;
 }
 function score(a:LabAction){
  if(a.type==='pass')return 0;
  if(a.type==='plant')return plant(view.market[a.marketIndex]!.cropId,a.target==='newLand'?'newLand':a.target.plotIndex);
  if(a.type==='withdraw')return -oldValue(me.plots[a.plotIndex]!).utility-(cfg.clearFee??0)-profile.rent;
  if(a.type==='replace')return plant(view.market[a.marketIndex]!.cropId,a.plotIndex,cfg.clearFee??0)-oldValue(me.plots[a.plotIndex]!).utility;
  return -Infinity;
 }
 function hypothetical(id:string,coins:number){
  let best=0;const c=cropDef(id);
  for(const p of me.plots){
   if(!p.owned){best=Math.max(best,plant(id,'newLand',0,coins));break;}
  }
  for(const p of me.plots){
   if(!p.owned)continue;
   if(cfg.soil&&soilBlocked(memory,seat,p.index,id,now))continue;
   if(!p.white&&!p.green){if(p.cropId===id&&p.red)continue;best=Math.max(best,plant(id,p.index,0,coins));}
   else if(cfg.clear==='replace'&&p.cropId!==id&&coins>=c.cost+(cfg.clearFee??0))best=Math.max(best,plant(id,p.index,cfg.clearFee??0,coins)-oldValue(p).utility);
  }
  return best;
 }
 return {score,oldValue,plant,hypothetical};
}
const chooseN=(n:number,k:number)=>{if(k>n||k<0)return 0;let v=1;for(let i=1;i<=k;i++)v=v*(n-i+1)/i;return v;};
/** Exact multivariate hypergeometric EV over public remaining card counts, not hidden deck order. */
export function refreshExpected(view:PublicView,values:number[]):number{
 const ids=view.cropIdsInGame;const counts=ids.map(id=>10-view.players.reduce((n,p)=>n+p.plots.filter(x=>x.cropId===id).length,0)-view.market.filter(c=>c.cropId===id).length);
 const k=view.market.length,n=counts.reduce((a,b)=>a+b,0),denom=chooseN(n,k);if(!denom)return 0;let ev=0;
 function visit(i:number,left:number,ways:number,best:number){
  if(i===ids.length){if(!left)ev+=ways/denom*best;return;}
  for(let take=0;take<=Math.min(left,counts[i]!);take++)visit(i+1,left-take,ways*chooseN(counts[i]!,take),take?Math.max(best,values[i]!):best);
 }
 visit(0,k,1,0);return ev;
}
export function choose(view:PublicView,cfg:Rules,profile:Profile,memory:Memory,refreshed:boolean):{action:LabAction;gain:number}{
 const ev=evaluator(view,cfg,profile,memory);let action:LabAction={type:'pass'},best=0;
 for(const a of legal(view,cfg,memory)){const score=ev.score(a);if(score>best+1e-8){best=score;action=a;}}
 const fee=cfg.refreshFee??0;
 if(cfg.refresh&&!refreshed&&view.players[view.actingSeat!]!.coins>=fee){
  const coins=view.players[view.actingSeat!]!.coins-fee;
  const values=view.cropIdsInGame.map(id=>ev.hypothetical(id,coins));
  // A full-turn refresh exposes the new market to others first; use a declared 50% retention heuristic.
  const expected=refreshExpected(view,values)*(cfg.refresh==='turn'?.5:1)-fee;
  if(expected>best+.5)return {action:{type:'refresh'},gain:expected-best};
 }
 return {action,gain:best};
}
export function fixture(seed:string,players:number,crops:string[],curse=false){
 return createGame({mode:'advanced',seed,seats:Array.from({length:players},(_,i)=>({kind:'cpu',name:`P${i}`})),forcedCrops:crops,startSeat:0,evenStartCoins:true,season:curse?2:1,...(curse?{curseSeats:[players-1]}:{})},createRng(seed+'-setup'));
}
export {getPublicView,createRng,concludeRound,applyEventUpdate,currentCropList};
