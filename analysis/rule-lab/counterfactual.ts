import {writeFileSync} from 'node:fs';
import {chooseIrr} from '../../src/cpu/index.js';
import {cases} from './run.js';
import {fixture,choose,evaluator,execute,harvest,getPublicView,createRng,concludeRound,applyEventUpdate,rules,profiles,type LabAction,type Memory} from './model.js';
import type {GameState} from '../../src/engine/types.js';
const cfg=rules.find(r=>r.id==='clear-turn')!,profile=profiles[0]!;
function continuation(snapshot:GameState,seed:string,forced?:LabAction){
 let s=structuredClone(snapshot);const memory:Memory=new Map(),cropRng=createRng(seed+'-crop'),evRng=createRng(seed+'-event');let first=true;
 while(s.phase!=='gameOver'){
  const v=getPublicView(s,s.actingSeat!);const curse=chooseIrr(v);
  const a=first&&forced?forced:curse.type==='curse'?curse:choose(v,cfg,profile,memory,false).action;first=false;
  s=execute(s,a,cfg,cropRng,memory);
  if(s.phase==='income'){s=harvest(s,cfg,memory);s=concludeRound(s);if(s.phase!=='gameOver')s=applyEventUpdate(s,evRng);}
 }
 return s.players.map(p=>p.coins);
}
const comparisons:any[]=[];
for(const c of cases.filter(c=>c.rep===0).slice(0,36)){
 let s=fixture(c.seed,c.players,c.crops),cropRng=createRng(c.seed+'-crop'),evRng=createRng(c.seed+'-event');const memory:Memory=new Map();
 while(s.phase!=='gameOver'){
  const v=getPublicView(s,s.actingSeat!);
  if(v.actingSeat===0&&[5,9,13].includes(s.round)){
   const active=v.players[0]!.plots.filter(p=>p.cropId&&(p.white>0||p.green>0));
   if(active.length){
    const seed=c.seed+'-branch-'+s.round,control=continuation(s,seed),ev=evaluator(v,cfg,profile,memory);
    // Publicly choose the least valuable remaining crop; no future outcome chooses the target.
    const target=active.reduce((a,b)=>ev.oldValue(a).utility<ev.oldValue(b).utility?a:b);
    const result=continuation(s,seed,{type:'withdraw',plotIndex:target.index});
    comparisons.push({caseId:`${c.index}-${c.players}`,round:s.round,plot:target.index,crop:target.cropId,white:target.white,green:target.green,control,result,selfDelta:result[0]!-control[0]!,relativeDelta:result[0]!-control[0]!-(result.slice(1).reduce((a,b)=>a+b,0)-control.slice(1).reduce((a,b)=>a+b,0))/(c.players-1)});
   }
  }
  const a=choose(v,rules[0]!,profile,memory,false).action;s=execute(s,a,rules[0]!,cropRng,memory);
  if(s.phase==='income'){s=harvest(s,rules[0]!,memory);s=concludeRound(s);if(s.phase!=='gameOver')s=applyEventUpdate(s,evRng);}
 }
}
writeFileSync('analysis/rule-lab/counterfactual.json',JSON.stringify({method:'36 baseline fixtures; P0 at R5/R9/R13; public least-continuation-value target; forced one-turn withdrawal versus no forced action; same hidden future initial deck and seeded future RNG; retrospective diagnostic, not a clairvoyant policy',comparisons},null,2)+'\n');
console.log(JSON.stringify({cases:comparisons.length,better:comparisons.filter(c=>c.selfDelta>0).length,equal:comparisons.filter(c=>c.selfDelta===0).length,worse:comparisons.filter(c=>c.selfDelta<0).length,mean:comparisons.reduce((s,c)=>s+c.selfDelta,0)/comparisons.length}));
