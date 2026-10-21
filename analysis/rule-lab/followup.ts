import {writeFileSync,readFileSync} from 'node:fs';
import {cases,simulate} from './run.js';
import {rules,profiles,type Rules} from './model.js';
import {choosePersonality,personalities,type Personality} from '../../web-lite/strategy.js';
import {getPublicView,applyPlayerAction,applyHarvest,concludeRound,applyEventUpdate,createRng} from '../../src/engine/index.js';
import {fixture} from './model.js';
const cfg=rules.find(r=>r.id==='combo0')!;
const alternatives:Rules[]=[cfg,
 {...cfg,id:'combo-floor-half',label:'植替・交換＋最低保証半分',floorFactor:.5},
 {...cfg,id:'combo-competition2',label:'植替・交換＋競合2倍',competition:2},
 {...cfg,id:'combo-soil',label:'植替・交換＋連作履歴保持',soil:true},
 {...cfg,id:'combo-refresh1',label:'無料植替＋交換1G',refreshFee:1},
 {...cfg,id:'combo-refresh3',label:'無料植替＋交換3G',refreshFee:3},
];
const extra=process.argv.includes('--cognition-only')?JSON.parse(readFileSync('analysis/rule-lab/followup.json','utf8')).extra as {rule:Rules;rows:{caseId:string;scores:number[];passes:number;clears:number;refreshes:number;fees:number}[]}[]:alternatives.map(rule=>{const rows=cases.map(c=>simulate(c,rule,profiles[0]!));console.log(rule.id,rows.length);return {rule,rows:rows.map(({caseId,scores,passes,clears,refreshes,fees})=>({caseId,scores,passes,clears,refreshes,fees}))};});
// Cognitive ablation: same risk/time preferences, one focal seat varies, three exact readers oppose it.
// All seats rotate as focal on identical fixtures. This is a strength benchmark, not a fun score.
const exact=personalities[2]!;
const levels:Personality[]=[
 {...exact,id:'crop-only',label:'作物だけ',weather:'ignore',competition:'ignore',curse:'ignore'},
 {...exact,id:'rough-weather',label:'天候だけ大まか',weather:'rough',competition:'ignore',curse:'ignore'},
 {...exact,id:'exact-weather',label:'天候だけ正確',weather:'exact',competition:'ignore',curse:'ignore'},
 {...exact,id:'rough-competition',label:'天候正確・競合大まか',weather:'exact',competition:'rough',curse:'ignore'},
 {...exact,id:'exact-competition',label:'天候・競合・公開呪いを正確',weather:'exact',competition:'exact',curse:'known'},
 exact,
];
const cognition=levels.map(profile=>{const rows=[];
 for(const c of cases.filter(c=>c.players===4).slice(0,24))for(let focal=0;focal<4;focal++){
  let s=fixture(c.seed,4,c.crops,c.curse);s.specVersion='0.20';const rng=createRng(c.seed+'-cognition');let steps=0,passes=0,replaces=0,refreshes=0,different=0,turns=0;
  while(s.phase!=='gameOver'){
   if(++steps>700)throw Error('stalled');const seat=s.actingSeat!,view=getPublicView(s,seat),a=choosePersonality(view,seat===focal?profile:exact);
   if(seat===focal){turns++;if(JSON.stringify(a)!==JSON.stringify(choosePersonality(view,exact)))different++;if(a.type==='pass')passes++;if(a.type==='replace')replaces++;if(a.type==='refresh')refreshes++;}
   s=applyPlayerAction(s,a,rng);if(s.phase==='income'){s=concludeRound(applyHarvest(s));if(s.phase!=='gameOver')s=applyEventUpdate(s,rng);}
  }
  const scores=s.players.map(p=>p.coins),best=Math.max(...scores),winners=scores.filter(n=>n===best).length;
  rows.push({caseId:`${c.index}-${c.rep}`,curse:c.curse,focal,scores,score:scores[focal]!,win:scores[focal]===best?1/winners:0,passes,replaces,refreshes,different,turns});
 }
 console.log('cognition',profile.id,rows.length);return {profile,rows};
});
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const summary={
 alternatives:extra.map(({rule,rows})=>({id:rule.id,label:rule.label,games:rows.length,meanScore:mean(rows.map(r=>mean(r.scores))),delta:mean(rows.map((r,i)=>mean(r.scores)-mean(extra[0]!.rows[i]!.scores))),passes:mean(rows.map(r=>r.passes/r.scores.length)),replaces:mean(rows.map(r=>r.clears/r.scores.length)),refreshes:mean(rows.map(r=>r.refreshes/r.scores.length))})),
 cognition:cognition.map(({profile,rows})=>({id:profile.id,label:profile.label,games:rows.length,score:mean(rows.map(r=>r.score)),win:mean(rows.map(r=>r.win)),replaces:mean(rows.map(r=>r.replaces)),refreshes:mean(rows.map(r=>r.refreshes)),disagreement:mean(rows.map(r=>r.different/r.turns))})),
};
writeFileSync('analysis/rule-lab/followup.json',JSON.stringify({method:'192 paired games per rule (32 crop sets × 3 player counts × 2 curse strata); cognitive ablation: 24 four-player fixtures × 4 focal seats per profile; equal time/risk preferences, exact-reader opponents; v0.20 CPU is a one-step public-information heuristic, not optimal play',extra,cognition,summary},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
