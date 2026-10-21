import {writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {chooseIrr} from '../../src/cpu/index.js';
import {rules,profiles,fixture,choose,evaluator,execute,harvest,getPublicView,createRng,concludeRound,applyEventUpdate,currentCropList,type Rules,type Profile,type LabAction,type Memory} from './model.js';
const combos:string[][]=[];for(let a=0;a<12;a++)for(let b=a+1;b<12;b++)for(let c=b+1;c<12;c++)for(let d=c+1;d<12;d++)combos.push([a,b,c,d].map(i=>currentCropList[i]!.id));
export type Case={index:number;players:number;rep:number;crops:string[];seed:string;curse:boolean};
export const cases:Case[]=[];
for(let index=0;index<32;index++)for(const players of [3,4,5])for(let rep=0;rep<2;rep++)cases.push({index,players,rep,crops:combos[(index*113)%495]!,seed:`rule-lab-${index}-${players}-${rep}`,curse:rep===1});
const pilot=process.argv.includes('--pilot');const matrix=pilot?cases.slice(0,12):cases;
export function simulate(c:Case,cfg:Rules,profile:Profile,enabledSeat?:number){
 let s=fixture(c.seed,c.players,c.crops,c.curse);const cropRng=createRng(c.seed+'-crop'),eventRng=createRng(c.seed+'-event');const memory:Memory=new Map();
 let refreshed=false,steps=0,passes=0,plants=0,clears=0,refreshes=0,fees=0,oldGross=0,gainAtClear=0,ownerPicks=0,otherPicks=0,plantLosses=0;
 const byRound=Array.from({length:18},()=>({clear:0,refresh:0,pass:0,plant:0}));
 const refreshedCards=new Map<string,number>();const actionTrace:string[]=[];const planting=new Map<string,{cost:number;income:number}>();const eventTrace:string[]=[];
 const gains:number[]=[];
 while(s.phase!=='gameOver'){
  if(++steps>700)throw Error('stalled');
  const v=getPublicView(s,s.actingSeat!),seat=s.actingSeat!,row=byRound[s.round-1]!;
  // Existing public-information curse heuristic, identical in every variant.
  const curse=chooseIrr(v);if(curse.type==='curse'){s=execute(s,curse,cfg,cropRng,memory);continue;}
  const decision=choose(v,enabledSeat===undefined||enabledSeat===seat?cfg:rules[0]!,profile,memory,refreshed),a=decision.action;
  const actionKey=`${s.round}:${seat}:${a.type}:${'marketIndex'in a?v.market[a.marketIndex]?.cropId:''}:${'plotIndex'in a?a.plotIndex:''}`;actionTrace.push(actionKey);
  if(a.type==='refresh'){
   refreshes++;row.refresh++;fees+=cfg.refreshFee??0;
   for(const card of s.crop.market)refreshedCards.delete(card.instanceId);
   s=execute(s,a,cfg,cropRng,memory);for(const card of s.crop.market)refreshedCards.set(card.instanceId,seat);
   gains.push(decision.gain);if(cfg.refresh==='free'){refreshed=true;continue;}
  }else{
   if(a.type==='withdraw'||a.type==='replace'){
    clears++;row.clear++;fees+=cfg.clearFee??0;
    oldGross+=evaluator(v,cfg,profile,memory).oldValue(v.players[seat]!.plots[a.plotIndex]!).gross;
    gainAtClear+=decision.gain;
   }
   if(a.type==='plant'||a.type==='replace'){
    plants++;row.plant++;
    const card=s.crop.market[a.marketIndex]!;const owner=refreshedCards.get(card.instanceId);
    if(owner!==undefined){if(owner===seat)ownerPicks++;else otherPicks++;refreshedCards.delete(card.instanceId);}
    const plot=a.type==='replace'?a.plotIndex:a.target==='newLand'?s.players[seat]!.plots.find(p=>!p.owned)!.index:a.target.plotIndex;
    const key=`${seat}:${plot}`;const old=planting.get(key);if(old&&old.income<old.cost)plantLosses++;
    planting.set(key,{cost:currentCropList.find(x=>x.id===card.cropId)!.cost,income:0});
   }
   if(a.type==='pass'){passes++;row.pass++;}
   s=execute(s,a,cfg,cropRng,memory);
  }
  refreshed=false;
  if(s.phase==='income'){
   eventTrace.push(JSON.stringify(s.event.row.map(e=>[e.cropId,e.delta])));
   s=harvest(s,cfg,memory);for(const d of s.lastHarvest){const p=planting.get(`${d.seat}:${d.plotIndex}`);if(p)p.income+=d.gain;}
   s=concludeRound(s);if(s.phase!=='gameOver')s=applyEventUpdate(s,eventRng);
  }
 }
 for(const old of planting.values())if(old.income<old.cost)plantLosses++;
 return {enabledSeat,caseId:`${c.index}-${c.players}-${c.rep}`,index:c.index,players:c.players,rep:c.rep,curse:c.curse,crops:c.crops,variant:cfg.id,profile:profile.id,scores:s.players.map(p=>p.coins),passes,plants,clears,refreshes,fees,oldGross,gainAtClear,ownerPicks,otherPicks,plantLosses,byRound,actionTrace,eventTrace};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
const results:ReturnType<typeof simulate>[]=[];
for(const cfg of rules){
 const started=Date.now();for(const c of matrix)results.push(simulate(c,cfg,profiles[0]!));
 console.log(cfg.id,matrix.length,'games',((Date.now()-started)/1000).toFixed(1)+'s');
}
if(!pilot){for(const p of profiles.slice(1))for(const cfg of rules.filter(r=>['base','combo0','combo1'].includes(r.id))){for(const c of cases.filter(c=>c.rep===0).slice(0,36))results.push(simulate(c,cfg,p));console.log('sensitivity',p.id,cfg.id);}}
writeFileSync(`analysis/rule-lab/${pilot?'pilot':'results'}.json.gz`,gzipSync(JSON.stringify({date:'2026-10-21',method:'paired initial crop/event decks; split crop and event RNG; 32 crop sets × 3 player counts × 2 seeds/curse strata; research public-information heuristic, no omniscience',rules,profiles,cases:matrix,results},null,2)+'\n'));

}
