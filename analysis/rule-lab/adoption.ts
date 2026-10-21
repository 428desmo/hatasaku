import {writeFileSync} from 'node:fs';
import {cases,simulate} from './run.js';
import {rules,profiles} from './model.js';
const out:any[]=[];
for(const c of cases.filter(c=>c.rep===0).slice(0,36)){
 const baseline=simulate(c,rules[0]!,profiles[0]!);
 for(const id of ['refresh2','combo0','combo1'])for(let seat=0;seat<c.players;seat++){
  const r=simulate(c,rules.find(r=>r.id===id)!,profiles[0]!,seat);
  const max=Math.max(...r.scores),beforeMax=Math.max(...baseline.scores);
  const relative=(a:number[])=>a[seat]!-a.filter((_,i)=>i!==seat).reduce((a,b)=>a+b,0)/(c.players-1);
  out.push({caseId:r.caseId,players:c.players,seat,variant:id,delta:r.scores[seat]!-baseline.scores[seat]!,relativeDelta:relative(r.scores)-relative(baseline.scores),winnerShare:r.scores[seat]===max?1/r.scores.filter(n=>n===max).length:0,baselineWinnerShare:baseline.scores[seat]===beforeMax?1/baseline.scores.filter(n=>n===beforeMax).length:0,clears:r.clears,refreshes:r.refreshes});
 }
}
writeFileSync('analysis/rule-lab/adoption.json',JSON.stringify({method:'36 no-curse fixtures; rotate sole adopter through all seats; all others choose ordinary baseline actions; everyone is legally allowed new actions; measures neglect of new actions, not balanced competitive win rate',rows:out},null,2)+'\n');
for(const id of ['refresh2','combo0','combo1']){
 const rows=out.filter(r=>r.variant===id),avg=(k:string)=>rows.reduce((s,r)=>s+r[k],0)/rows.length;
 console.log(id,rows.length,'self',avg('delta'),'relative',avg('relativeDelta'),'wins',avg('winnerShare'),'baseline',avg('baselineWinnerShare'));
}
