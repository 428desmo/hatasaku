import {describe,it,expect} from 'vitest';
import {fixture,execute,harvest,rules,profiles,evaluator,refreshExpected,getPublicView,createRng,choose,concludeRound,applyEventUpdate,type Memory} from './model.js';
import {cropDef} from '../../src/engine/catalog.js';
const crops=['v19_radish','v19_potato','v19_okra','v19_melon'];
function ready(){const s=fixture('test',4,crops);const p=s.players[0]!.plots[0]!;p.owned=true;p.cropCard=s.crop.deck.find(c=>c.cropId==='v19_okra')!;s.crop.deck=s.crop.deck.filter(c=>c.instanceId!==p.cropCard!.instanceId);p.white=0;p.green=4;s.players[0]!.coins=30;return s;}
describe('isolated rule experiment',()=>{
 it('standalone clearing consumes a turn, keeps land and same-crop cooldown, without refund',()=>{const s=ready(),next=execute(s,{type:'withdraw',plotIndex:0},rules[1]!,createRng('a'),new Map());expect(next.actingSeat).toBe(1);expect(next.players[0]!.coins).toBe(30);expect(next.players[0]!.plots[0]).toMatchObject({owned:true,white:0,green:0,red:3});expect(s.players[0]!.plots[0]!.green).toBe(4);});
 it('atomic replacement pays both fees once and consumes one turn',()=>{const s=ready();const i=s.crop.market.findIndex(c=>c.cropId!=='v19_okra');const id=s.crop.market[i]!.cropId;const n=execute(s,{type:'replace',plotIndex:0,marketIndex:i},rules.find(r=>r.id==='replace1')!,createRng('b'),new Map());expect(n.actingSeat).toBe(1);expect(n.players[0]!.coins).toBe(30-cropDef(id).cost-1);expect(n.players[0]!.plots[0]).toMatchObject({white:cropDef(id).wait,green:0,red:0});expect(n.crop.discard.some(c=>c.cropId==='v19_okra')).toBe(true);});
 it('paid refresh draws before discarding and leaves ordinary action available',()=>{const s=ready(),ids=s.crop.market.map(c=>c.instanceId);const n=execute(s,{type:'refresh'},rules.find(r=>r.id==='refresh2')!,createRng('c'),new Map());expect(n.actingSeat).toBe(0);expect(n.players[0]!.coins).toBe(28);expect(n.crop.market).toHaveLength(3);expect(n.crop.market.every(c=>!ids.includes(c.instanceId))).toBe(true);expect(n.crop.discard.filter(c=>ids.includes(c.instanceId))).toHaveLength(3);});
 it('refresh cannot repeat in the same turn, and an unknown deck permutation does not change the decision',()=>{const s=ready(),cfg=rules.find(r=>r.id==='combo0')!;const before=choose(getPublicView(s,0),cfg,profiles[0]!,new Map(),true);expect(before.action.type).not.toBe('refresh');s.crop.deck.reverse();s.event.deck.reverse();expect(choose(getPublicView(s,0),cfg,profiles[0]!,new Map(),true)).toEqual(before);});
 it('hypergeometric expectation obeys constant payoff and maximum bounds',()=>{const v=getPublicView(ready(),0);expect(refreshExpected(v,[5,5,5,5])).toBeCloseTo(5,10);const result=refreshExpected(v,[0,2,5,10]);expect(result).toBeGreaterThanOrEqual(0);expect(result).toBeLessThanOrEqual(10);});
 it('baseline research path exactly matches production harvest and turn progression',async()=>{const {applyAction}=await import('../../src/engine/index.js');let s=ready(),control=structuredClone(s);const a=createRng('same'),b=createRng('same');for(let i=0;i<4;i++){control=applyAction(control,{type:'pass'},a);s=execute(s,{type:'pass'},rules[0]!,b,new Map());if(s.phase==='income'){s=harvest(s,rules[0]!,new Map());s=concludeRound(s);s=applyEventUpdate(s,b);}}expect(s).toEqual(control);});
 it('all experimental paths conserve the forty unique cards and cannot spend negative coins',()=>{
  for(const cfg of rules){
   let s=fixture('conservation',5,crops,true);const rng=createRng('cards'),memory:Memory=new Map();let refreshed=false;
   while(s.phase!=='gameOver'){
    const a=choose(getPublicView(s,s.actingSeat!),cfg,profiles[0]!,memory,refreshed).action;
    s=execute(s,a,cfg,rng,memory);
    if(a.type==='refresh'&&cfg.refresh==='free')refreshed=true;else refreshed=false;
    if(s.phase==='income'){s=harvest(s,cfg,memory);s=concludeRound(s);if(s.phase!=='gameOver')s=applyEventUpdate(s,rng);}
    const cards=[...s.crop.deck,...s.crop.discard,...s.crop.market,...s.players.flatMap(p=>p.plots.flatMap(p=>p.cropCard?[p.cropCard]:[]))];
    expect(cards).toHaveLength(40);expect(new Set(cards.map(c=>c.instanceId)).size).toBe(40);expect(s.players.every(p=>p.coins>=0)).toBe(true);
   }
  }
 });

});
