import {writeFileSync} from 'node:fs';
import {cropsForMode} from '../src/engine/catalog.js';
import {createGame,createRng,applyAction,getPublicView} from '../src/engine/index.js';
import {chooseById} from '../src/cpu/index.js';
const pool=cropsForMode('advanced');
const combos:string[][]=[];
for(let a=0;a<pool.length;a++)for(let b=a+1;b<pool.length;b++)for(let c=b+1;c<pool.length;c++)for(let d=c+1;d<pool.length;d++)combos.push([a,b,c,d].map(i=>pool[i]!.id));
const runs:any[]=[];
for(const [index,crops] of combos.entries())for(const policy of ['irr','irr_noise25','random']){
 const seed=`review-v018-${index}-${policy}`,rng=createRng(seed),cpu=createRng(seed+'-cpu');
 let s=createGame({mode:'advanced',seed,seats:Array.from({length:4},(_,i)=>({kind:'cpu' as const,name:`CPU ${i}`,cpuStrategyId:policy})),forcedCrops:crops,startSeat:0,evenStartCoins:true},rng);
 let steps=0;while(s.phase!=='gameOver'){
  if(++steps>500)throw Error('loop');
  const view=getPublicView(s,s.actingSeat!);s=applyAction(s,chooseById(policy,view,cpu),rng);
 }
 const counts=Object.fromEntries(crops.map(id=>[id,s.seasonActions.filter(a=>a.cropId===id).length]));
 runs.push({crops,policy,counts,pass:s.seasonActions.filter(a=>a.kind==='pass').length,scores:s.players.map(p=>p.coins)});
}
const summary=pool.map(c=>{
 const included=runs.filter(r=>r.crops.includes(c.id));
 const byPolicy=Object.fromEntries(['irr','irr_noise25','random'].map(policy=>{const rs=included.filter(r=>r.policy===policy);const n=rs.reduce((s,r)=>s+r.counts[c.id],0);const planted=rs.reduce((s,r)=>s+Object.values(r.counts).reduce((a:any,b:any)=>a+b,0),0);return [policy,{seasons:rs.length,plantings:n,share:n/planted,zeroSeasons:rs.filter(r=>r.counts[c.id]===0).length}]}));
 return {...c,netPerPlant:c.harvest*c.baseIncome-c.cost,occupiedRounds:c.wait+c.harvest,netPerOccupiedRound:(c.harvest*c.baseIncome-c.cost)/(c.wait+c.harvest),sameCropCycle:c.wait+c.harvest+c.cooldown,byPolicy};
});
const distributions=Object.fromEntries(['irr','irr_noise25','random'].map(policy=>{const rs=runs.filter(r=>r.policy===policy);const means=rs.map(r=>r.scores.reduce((a:number,b:number)=>a+b,0)/4).sort((a,b)=>a-b);return [policy,{seasons:rs.length,minMean:means[0],maxMean:means.at(-1),averageMean:means.reduce((a,b)=>a+b,0)/means.length,passRate:rs.reduce((s,r)=>s+r.pass,0)/(rs.length*72)}]}));
const diversity={combinations:combos.length,noWait1:combos.filter(cs=>cs.every(id=>pool.find(c=>c.id===id)!.wait>1)).length,noHarvest1:combos.filter(cs=>cs.every(id=>pool.find(c=>c.id===id)!.harvest>1)).length,noCooldown0:combos.filter(cs=>cs.every(id=>pool.find(c=>c.id===id)!.cooldown>0)).length,oneWaitValue:combos.filter(cs=>new Set(cs.map(id=>pool.find(c=>c.id===id)!.wait)).size===1).length};
writeFileSync('analysis/crop-review-v0.18.json',JSON.stringify({date:'2026-10-21',method:'210 combinations × 3 homogeneous CPU policies × 1 seed; 4 players; 18 rounds; one season; no curses; 8G each',diversity,distributions,crops:summary,runs},null,2)+'\n');
console.log(JSON.stringify({diversity,distributions,crops:summary.map(c=>({id:c.id,net:c.netPerOccupiedRound,byPolicy:c.byPolicy}))},null,2));
