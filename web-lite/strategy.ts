import {cropDef} from '../src/engine/catalog.js';
import {acquireCost, type Action, type PublicView, type PlotView} from '../src/engine/types.js';
import {harvestRoundsForPlot,visibleEventWindows} from '../src/view/outlook.js';

export type Reading='ignore'|'rough'|'exact';
export type Personality={id:string;label:string;weather:Reading;competition:Reading;curse:'ignore'|'known'|'predict';discount:number;rent:number;risk:number;description:string};
/** Attention and preferences are independent. No private state or future draws enter this API. */
export const personalities:Personality[]=[
 {id:'grower',label:'実り重視',weather:'ignore',competition:'rough',curse:'ignore',discount:.98,rent:.65,risk:0,description:'作物の収入を重視。混み具合は見るが、天候と呪いは読み込まない。'},
 {id:'weather',label:'天気に敏感',weather:'rough',competition:'rough',curse:'ignore',discount:.95,rent:.9,risk:.1,description:'目立つ天候一枚に注目しがち。収穫時期との照合や競合の重なりには大ざっぱ。'},
 {id:'planner',label:'先読み派',weather:'exact',competition:'exact',curse:'predict',discount:.96,rent:.9,risk:0,description:'公開天候と収穫時期、競合を照合。呪いは公開盤面から確率的に警戒する。'},
 {id:'steady',label:'堅実派',weather:'exact',competition:'rough',curse:'predict',discount:.94,rent:1.05,risk:.25,description:'天候は正確に確認。競合は畑の数で判断し、最低保証と回収の速さを好む。'},
];
export function personalityForSeat(seat:number){return personalities[(seat-1+personalities.length)%personalities.length]!;}
const combinations=(n:number,k:number)=>{if(k<0||k>n)return 0;let v=1;for(let i=1;i<=k;i++)v=v*(n-i+1)/i;return v;};

export function strategy(view:PublicView,profile:Personality){
 const seat=view.actingSeat!,me=view.players[seat]!,now=view.round,end=view.lastRound;
 const weather=visibleEventWindows({...view,curses:[]});
 const schedules=view.players.flatMap(p=>p.plots.filter(x=>x.cropId).map(plot=>({seat:p.seat,index:plot.index,id:plot.cropId!,rs:harvestRoundsForPlot(plot,now,end),active:plot.white>0||plot.green>0})));
 // Estimate targets from PUBLIC exposure. A hidden target is never read, even for another CPU.
 const used=new Set(view.curses.map(c=>c.cropId));
 const threats=[...view.hiddenCurses.map(c=>({seat:c.bySeat,weight:1})),...view.curseReadySeats.filter(s=>s!==seat).map(s=>({seat:s,weight:.25}))];
 const guesses=threats.map(t=>{
  const weights=view.cropIdsInGame.map(id=>used.has(id)?0:Math.max(0,schedules.reduce((sum,p)=>sum+p.rs.filter(r=>r>=now+1&&r<=now+4).length*(p.id===id?(p.seat===t.seat?-2:1):0),0)));
  const total=weights.reduce((a,b)=>a+b,0);
  return {weight:t.weight,probabilities:weights.map(w=>total?w/total:0)};
 });
 function gross(id:string,rs:number[],exclude?:number){
  const c=cropDef(id);let result=0;
  const salient=weather.filter(w=>w.cropId===id).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.from-b.from)[0];
  for(const r of rs){
   const others=profile.competition==='ignore'?0:schedules.filter(p=>p.id===id&&!(p.seat===seat&&p.index===exclude)&&(profile.competition==='exact'?p.rs.includes(r):p.active)).length;
   const ev=profile.weather==='ignore'?0:profile.weather==='rough'?(salient?.delta??0):weather.filter(w=>w.cropId===id&&w.from<=r&&w.to>=r).reduce((n,w)=>n+w.delta,0);
   const known=profile.curse==='ignore'?0:view.curses.filter(c=>c.cropId===id&&c.from<=r&&c.to>=r).length*-6;
   const raw=c.baseIncome-others+ev+known;
   let gain=Math.max(c.floor,raw);
   if(profile.curse==='predict'&&r>=now+1&&r<=now+4){
    // Marginal expected loss, bounded by the floor; probabilities are heuristics, not foreknowledge.
    const probability=Math.min(1,guesses.reduce((n,g)=>n+g.weight*(g.probabilities[view.cropIdsInGame.indexOf(id)]??0),0));
    gain-=probability*(gain-Math.max(c.floor,raw-6));
   }
   result+=(gain-profile.risk*Math.max(0,gain-c.floor))*profile.discount**(r-now);
  }
  return result;
 }
 function oldValue(p:PlotView){const rs=harvestRoundsForPlot(p,now,end);return gross(p.cropId!,rs,p.index)-profile.rent*(rs.length?rs.at(-1)!-now+1:end-now+1);}
 function plant(id:string,target:number|'newLand',coins=me.coins){
  const c=cropDef(id),land=target==='newLand'?acquireCost(me.plots.filter(p=>p.owned).length,view.mode):0;
  if(coins<c.cost+land)return -Infinity;
  const rs=Array.from({length:c.harvest},(_,i)=>now+c.wait+i).filter(r=>r<=end);if(!rs.length)return -Infinity;
  const residual=target==='newLand'?Math.min(land,Math.max(0,end-(now+c.wait+c.harvest-1))*.6):0;
  return gross(id,rs,target==='newLand'?undefined:target)-c.cost-land-profile.rent*Math.min(c.wait+c.harvest,end-now+1)+residual;
 }
 function score(a:Action){
  if(a.type==='pass')return 0;
  if(a.type==='plant')return plant(view.market[a.marketIndex]!.cropId,a.target==='newLand'?'newLand':a.target.plotIndex);
  if(a.type==='replace')return plant(view.market[a.marketIndex]!.cropId,a.plotIndex)-oldValue(me.plots[a.plotIndex]!);
  return -Infinity;
 }
 function hypothetical(id:string,coins:number){let best=0;
  for(const p of me.plots){
   if(!p.owned){best=Math.max(best,plant(id,'newLand',coins));break;}
   if(!p.white&&!p.green){if(p.cropId!==id||!p.red)best=Math.max(best,plant(id,p.index,coins));}
   else if(p.cropId!==id)best=Math.max(best,plant(id,p.index,coins)-oldValue(p));
  }return best;
 }
 return {score,hypothetical};
}

export function choosePersonality(view:PublicView,profile:Personality):Action{
 const legal=view.legalActions??[];
 // Curse use accounts for actual capped damage, not simply counting cards; self-harm is penalized.
 let curse:Action|undefined,damage=0;
 for(const a of legal)if(a.type==='curse'){
  const c=cropDef(a.cropId);let value=0;
  for(const p of view.players)for(const plot of p.plots)if(plot.cropId===a.cropId)for(const r of harvestRoundsForPlot(plot,view.round,view.lastRound))if(r>view.round&&r<=view.round+4){
   const windows=visibleEventWindows(view).filter(w=>w.cropId===a.cropId&&w.from<=r&&w.to>=r);
   const other=view.players.flatMap(q=>q.plots).filter(x=>x.cropId===a.cropId&&x!==plot&&harvestRoundsForPlot(x,view.round,view.lastRound).includes(r)).length;
   const raw=c.baseIncome-other+windows.reduce((n,w)=>n+w.delta,0);
   value+=(Math.max(c.floor,raw)-Math.max(c.floor,raw-6))*(p.seat===view.actingSeat?-2:1);
  }
  if(value>damage){damage=value;curse=a;}
 }
 if(curse)return curse;
 const ev=strategy(view,profile);let best=0,action:Action={type:'pass'};
 for(const a of legal){const score=ev.score(a);if(score>best+1e-8){best=score;action=a;}}
 if(legal.some(a=>a.type==='refresh')){
  const coins=view.players[view.actingSeat!]!.coins-2;
  // The visible discard determines the exact remaining deck composition; only its order is unknown.
  const counts=view.cropIdsInGame.map(id=>10-view.players.reduce((n,p)=>n+p.plots.filter(x=>x.cropId===id).length,0)-view.market.filter(c=>c.cropId===id).length-view.cropDiscard.filter(c=>c.cropId===id).length);
  const k=view.market.length,total=counts.reduce((a,b)=>a+b,0);
  const values=view.cropIdsInGame.map(id=>ev.hypothetical(id,coins));
  // If the deck empties mid-deal, ALL remaining deck cards are drawn first; only the
  // missing cards are random samples of the old discard. Do not pool those distributions.
  const initial=total<k?Math.max(0,...values.filter((_,i)=>counts[i]!>0)):0;
  const draw=total<k?k-total:k;
  const sampleCounts=total<k?view.cropIdsInGame.map(id=>view.cropDiscard.filter(c=>c.cropId===id).length):counts;
  const denom=combinations(sampleCounts.reduce((a,b)=>a+b,0),draw);let expected=0;
  function visit(i:number,left:number,ways:number,value:number){if(i===sampleCounts.length){if(!left&&denom)expected+=ways/denom*value;return;}for(let take=0;take<=Math.min(left,sampleCounts[i]!);take++)visit(i+1,left-take,ways*combinations(sampleCounts[i]!,take),take?Math.max(value,values[i]!):value);}
  visit(0,draw,1,initial);
  if(expected-2>best+.5)return {type:'refresh'};
 }
 return action;
}
