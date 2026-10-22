import {personalities,personalityForSeat} from './strategy.js';

/** Stable character identity, independent of seat, turn order and match length. */
export const characters=[
 {id:'grower',name:'ハンス',gender:'male'},
 {id:'weather',name:'お春',gender:'female'},
 {id:'planner',name:'田吾作',gender:'male'},
 {id:'steady',name:'みのり',gender:'female'},
] as const;
export function personalityForCharacter(id:string){
 const p=personalities.find(p=>p.id===id);
 if(!p)throw new Error('キャラクターが不正です');
 return p;
}
export {personalityForSeat};
export const seasonMultipliers=[1,2,5,10] as const;
export function seasonOptions(players:number){return [
 {value:'1',label:'1シーズン',seasons:1},
 ...seasonMultipliers.map(n=>({value:`x${n}`,label:n===1?`人数と同じ（${players}シーズン）`:`人数と同じ ×${n}（${players*n}シーズン）`,seasons:players*n})),
];}
