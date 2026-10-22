import {Match} from '../../web-lite/match.js';
import {choosePersonality,personalities} from '../../web-lite/strategy.js';
import {getPublicView} from '../../src/engine/index.js';
import {cropDef,cropShortName} from '../../src/engine/catalog.js';
import {acquireCost} from '../../src/engine/types.js';
import {visibleEventWindows} from '../../src/view/outlook.js';
import {vegetable,icon} from '../../web-lite/art.js';

/** Real, seeded game state drawn as vectors: no enlarged screenshot pixels. */
export function playfield(){
 const m=new Match({mode:'advanced',players:4,seasons:4,seed:'hatasaku-cover-vector-628'});m.start();
 let steps=0;
 while(!(m.state.round===7&&m.humanTurn)){
  if(++steps>500)throw Error('Demo game did not reach the target turn');
  if(m.screen==='play')m.act(m.humanTurn?choosePersonality(getPublicView(m.state,0),personalities[2]!):m.cpuAction());
  else if(m.screen==='harvest'){m.finishHarvest();m.next();}else throw Error('Demo ended unexpectedly');
 }
 const v=m.view,palette=['#426e5d','#ba705a','#7687a8','#b08e4e'];
 const text=(x:number,y:number,s:string|number,size=9,fill='#49614b',weight=400,anchor='start')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${s}</text>`;
 const box=(x:number,y:number,w:number,h:number,fill:string,stroke='#c6ceae',dashed=false,rx=5)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"${dashed?' stroke-dasharray="3 3"':''}/>`;
 const veg=(id:string,x:number,y:number,w:number,h:number)=>vegetable(id).replace('<svg ',`<svg x="${x}" y="${y}" width="${w}" height="${h}" `);
 const glyph=(id:string,x:number,y:number,size:number)=>icon(id).replace('<svg ',`<svg x="${x}" y="${y}" width="${size}" height="${size}" color="#526a51" `);
 const rows=[1,2,3,0].map((seat,row)=>{
  const p=v.players[seat]!,y=77+row*41;
  const fields=p.plots.map(plot=>{
   const x=88+plot.index*48;
   if(!plot.owned)return box(x,y+3,44,32,'none','#cbd1b7',true)+text(x+22,y+18,'＋',15,'#a0ad89',400,'middle')+text(x+22,y+31,acquireCost(plot.index,v.mode)+'G',8,'#929d7e',400,'middle');
   if(!plot.cropId)return box(x,y+3,44,32,'#f3f2dc','#cbd1b7',true)+text(x+22,y+23,'空き',8,'#899778',400,'middle');
   const c=cropDef(plot.cropId),growing=plot.white>0||plot.green>0;
   return box(x,y+3,44,32,growing?'#fffbe9':'#eff0db','#c6ceae',!growing)+text(x+4,y+12,cropShortName(c.id),7,'#355b43',700)+(growing?veg(c.id,x+5,y+13,21,19)+text(x+41,y+24,`${c.baseIncome}/${c.floor}`,7,'#547348',700,'end'):'')+text(x+4,y+33,plot.white?'待 '+ '○'.repeat(plot.white):plot.green?'収 '+ '✦'.repeat(plot.green):plot.red?'休 '+ '▽'.repeat(plot.red):'空き',5,'#8a9874');
  }).join('');
  return box(10,y,370,38,seat===0?'#fffbea':'#e9edd8',seat===0?'#a4b17c':'#c5ceab')+`<path d="M12 ${y+4}v30" stroke="${palette[seat]}" stroke-width="3"/>`+text(16,y+13,`${v.turnOrder.indexOf(seat)+1} ${p.name}`,9,'#355542',700)+`<circle cx="22" cy="${y+27}" r="6" fill="#d0ae61"/><circle cx="22" cy="${y+27}" r="4.5" fill="none" stroke="#f3e4ad"/>`+text(22,y+30,'G',7,'#fff6d7',700,'middle')+text(32,y+33,p.coins,16,'#355542',700)+fields;
 }).join('');
 const windows=visibleEventWindows(v).filter(w=>!w.label.startsWith('呪い')&&w.from<=v.lastRound&&w.to>=v.round);
 const events=windows.map((w,i)=>{const width=(370-(windows.length-1)*5)/windows.length,x=10+i*(width+5),label=w.from>v.round?'次':w.from<v.round?'継続':'今';return box(x,265,width,50,'#f8f5dc','#c1c7a5')+`<path d="M${x+4} 265h${width-8}" stroke="${w.delta<0?'#b79b77':'#97a878'}" stroke-width="3"/>`+text(x+5,276,`${label} R${w.from}–${Math.min(w.to,v.lastRound)}`,6,'#788569')+veg(w.cropId,x+4,286,17,19)+text(x+24,301,cropShortName(w.cropId),7,'#547147',700)+text(x+width-5,306,`${w.delta>0?'+':'−'}${Math.abs(w.delta)}`,18,w.delta>0?'#5f8857':'#a77962',700,'end');}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" x="-80" y="-70" width="1755" height="3060" viewBox="0 0 390 680" font-family="Hiragino Kaku Gothic ProN,Yu Gothic,sans-serif"><rect width="390" height="680" fill="#eeefdc"/><rect width="390" height="48" fill="#f7f3e3"/><path d="M0 48h390" stroke="#d9dcc7"/>${text(11,31,'はたさく',19,'#3a5542',700)}${text(112,28,`SEASON ${v.season} / ${v.seasonCount}`,7,'#919c7d')}${text(174,29,`R${v.round}`,20,'#4c674b',700)}${text(205,29,'/ 18',8,'#94a184')}${glyph('sound',286,15,18)}${glyph('book',321,15,18)}${glyph('gear',355,15,18)}${text(11,66,'みんなの畑',9,'#7f8f6f',700)}${text(379,66,'番号は手番順・自分は最下段',6,'#9ea78b',400,'end')}${rows}${glyph('sun',11,246,13)}${text(28,256,'天候のカード',9,'#7f8f6f',700)}${text(111,256,'2ラウンド先まで',7,'#9aa486')}${events}</svg>`;
}
