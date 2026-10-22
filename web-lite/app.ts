import {seasonOptions} from './characters.js';
import { Match, type Settings, type SavedMatch } from './match.js';
import { cropDef, cropName, cropShortName, cropBlurb } from '../src/engine/catalog.js';
import { acquireCost, type Action, type HarvestDetail } from '../src/engine/types.js';
import { previousSeasonLeaders, topSeats, bottomSeats } from '../src/view/standings.js';
import { harvestRoundsIfPlanted, visibleEventWindows } from '../src/view/outlook.js';
import { trailLayout } from '../src/view/trailChart.js';
import { vegetable, countryside, avatar as drawAvatar, icon, cropColors } from './art.js';
import { FarmAudio } from './audio.js';
import { harvestWarning, harvestTiming, harvestWaves, Interrupted, Motion } from './experience.js';

type Preferences = {music:boolean; effects:boolean; learning:boolean; auto:boolean; pace:number};
type Receipt = {season:number; round:number; details:HarvestDetail[]; totals:number[]};
const app = document.querySelector<HTMLElement>('#app')!;
const dialog = document.querySelector<HTMLDialogElement>('#detail')!;
const modalBody = document.querySelector<HTMLElement>('#detail-body')!;
const fx = document.querySelector<HTMLElement>('#effects')!;
const sound = new FarmAudio();
const motion = new Motion();
const SAVE = 'hatasaku-garden-match-v1';
const PREF = 'hatasaku-garden-prefs-v1';
const palette = ['#426e5d', '#ba705a', '#7687a8', '#b08e4e', '#967691'];
let settings: Settings = {mode:'advanced', players:4, seasons:4, seed:''};
let prefs: Preferences = {music:true, effects:true, learning:true, auto:true, pace:1};
let saved: SavedMatch | null = null;
let match: Match | null = null;
let selected: number | null = null;
let pendingReplacement: Extract<Action,{type:'replace'}> | null = null;
let busy = false;
let paused = false;
let holdHarvest = false;
let actor: number | null = null;
let cpuMarket: number | null = null;
let cpuPlot: number | null = null;
let figures: HarvestDetail[] = [];
let lastReceipt: Receipt | null = null;
let cue = '';
let error = '';
let hasSave = true;
let storageNotice = true;
let layout = '';
let dialogKind = '';
let announcedTurn = '';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]!);
const color = (id: string) => cropColors[id] ?? '#789561';
const accent = (id: string) => `style="--crop:${color(id)}"`;
const btn = (label: string, cmd: string, cls = '', disabled = false) => `<button class="${cls}" data-cmd="${cmd}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const tool = (label: string, cmd: string, glyph: string, pressed?: boolean) => `<button class="tool" data-cmd="${cmd}" aria-label="${label}" title="${label}" ${pressed === undefined ? '' : `aria-pressed="${pressed}"`}>${icon(glyph)}</button>`;
const name = (id: string) => `<span class="full-name">${esc(cropName(id))}</span><span class="short-name">${esc(cropShortName(id))}</span>`;
const roundSpan = (from: number, to: number) => `R${from}${Math.min(to,match!.state.lastRound)>from ? `–${Math.min(to,match!.state.lastRound)}` : ''}`;
function avatar(seat:number){return drawAvatar(seat,match?.namedCharacters?match.seats[seat]?.cpuStrategyId:undefined);}
const coins = (amount: number) => `<span class="coin-symbol">G</span><b>${amount}</b>`;

try {
  const raw = JSON.parse(localStorage.getItem(PREF) || 'null') as Partial<Preferences> | null;
  if (raw) prefs = {music:raw.music !== false,effects:raw.effects !== false,learning:raw.learning !== false,auto:raw.auto !== false,pace:[.55,1,1.5].includes(raw.pace ?? 0) ? raw.pace! : 1};
  const value = JSON.parse(localStorage.getItem(SAVE) || 'null');
  if (value) { const restored = Match.restore(value); if (restored.screen !== 'result') saved = value; }
} catch { /* An unavailable or obsolete save never prevents a new game. */ }
sound.music = prefs.music; sound.effects = prefs.effects;
function savePreferences() {
  sound.setMusic(prefs.music); sound.effects = prefs.effects;
  try { localStorage.setItem(PREF,JSON.stringify(prefs)); } catch { /* Private browsing is supported. */ }
}
function checkpoint() {
  if (!match) return;
  try { localStorage.setItem(SAVE,JSON.stringify(match.save())); hasSave = true; }
  catch { hasSave = false; }
}
function clearSave() { saved = null; try { localStorage.removeItem(SAVE); } catch { /* Optional storage. */ } }
function put(element: Element | null, html: string) {
  if (!(element instanceof HTMLElement) || element.dataset.markup === html) return;
  element.innerHTML = html; element.dataset.markup = html;
}
function byId(id: string) { return document.getElementById(id); }
function modal(kind: string, html: string) {
  dialogKind = kind; put(modalBody,html);
  if (!dialog.open) dialog.showModal();
}
function closeModal() { dialog.close(); dialogKind = ''; pendingReplacement=null; }

function cropCard(id: string, context: 'market'|'intro'|'detail' = 'market') {
  const d = cropDef(id);
  const warning=context==='market'&&match?harvestWarning(match.state.round,match.state.lastRound,d.wait,d.harvest):null;
  return `<article class="crop-card ${context}" ${accent(id)}>
    <div class="card-head"><h3>${esc(d.name)}</h3><span class="price" title="栽培コスト">${d.cost}<small>G</small></span></div>
    <div class="card-picture">${warning?`<span class="harvest-warning ${warning.available?'partial':'missed'}" title="${esc(warning.label)}" aria-label="${esc(warning.label)}">${warning.mark}</span>`:''}<span class="picture-halo"></span>${vegetable(id)}<span class="card-serial">HATASAKU / ${d.cost.toString().padStart(2,'0')}</span></div>
    <dl class="crop-spec"><div><dt>待機</dt><dd>${d.wait}<small>R</small><span class="pips">${'○'.repeat(d.wait)}</span></dd></div><div><dt>収穫</dt><dd>${d.harvest}<small>R</small><span class="pips stars">${'✦'.repeat(d.harvest)}</span></dd></div><div class="income-spec"><dt>収入 <small>基本 / 最低</small></dt><dd>${d.baseIncome}<small> / ${d.floor}G</small></dd></div><div><dt>連作の休み</dt><dd>${d.cooldown}<small>R</small></dd></div></dl>
    ${context === 'intro' ? `<p class="crop-note">${esc(cropBlurb(id))}</p>` : ''}
  </article>`;
}
function detail(id: string) {
  modal('crop', `<div class="detail-layout">${cropCard(id,'detail')}<div class="detail-copy"><div class="eyebrow">FIELD NOTES</div><h2>${esc(cropName(id))}</h2><p>${esc(cropBlurb(id))}</p><p>基本収入から、同じ作物を収穫中の「ほかの農地」の数を引き、イベントの増減を加算します。最低保証を下回ることはありません。</p><small>違う作物なら、連作の休み中も植えられます。</small>${btn('畑に戻る','close','primary')}</div></div>`);
}
function landing() {
  return `<main class="landing">${countryside()}
    <section class="hero"><div class="eyebrow">A LITTLE FIELD. A GOOD HARVEST.</div><h1>はたさく<span>HATASAKU</span></h1><p class="hero-tag">一手、ひと畑。</p><p class="hero-copy">なにを植えるか。いつ実るか。<br>天候を読み、小さな畑で競い合うカードゲーム。</p><div class="hero-produce">${vegetable('radish')}${vegetable('corn')}${vegetable('sweetpotato')}</div><div class="hero-foot">1 PLAYER + CPU <span>縦でも横でも、あなたの畑へ。</span></div></section>
    <section class="setup-paper"><div class="paper-heading"><span class="eyebrow">LET'S GROW</span>${tool(prefs.music?'BGMをオフ':'BGMをオン','music',prefs.music?'sound':'mute',prefs.music)}</div><h2>${saved ? 'おかえりなさい。' : '今日の畑を、はじめよう。'}</h2>
    ${saved ? `<button class="resume" data-cmd="resume">${icon('play')}<span>つづきから<small>同じ端末に対局を保存しています</small></span>${icon('arrow')}</button>` : ''}
    <form id="settings"><div class="game-format">18ラウンド · 農地は最大6枚</div><label>プレイヤー<select name="players">${[3,4,5].map(n=>`<option value="${n}" ${settings.players===n?'selected':''}>あなた ＋ CPU ${n-1}人</option>`).join('')}</select></label><label>シーズン<select name="seasons">${seasonOptions(settings.players).map(o=>`<option value="${o.value}" ${settings.seasons===o.seasons?'selected':''}>${o.label}</option>`).join('')}</select></label><div class="setup-options"><label><input name="learning" type="checkbox" ${prefs.learning?'checked':''}>学習ヒント</label><label><input name="effects" type="checkbox" ${prefs.effects?'checked':''}>効果音</label></div><button class="primary start-game" type="submit">${saved ? '新しい畑をはじめる' : '畑をはじめる'} ${icon('arrow')}</button></form>
    <p class="setup-fine">作物 → 農地の2タップで植え付け。<br>対局は自動保存。音はいつでも切り替えられます。</p></section>
  </main>`;
}
function topbar() {
  const m = match!; const s = m.state;
  return `<div class="wordmark">${icon('leaf')}<b>はたさく</b><span>HATASAKU</span></div><div class="season-clock"><span>SEASON <b>${s.season}</b><small> / ${s.seasonCount}</small></span><div class="round-track">${Array.from({length:s.lastRound},(_,r)=>`<i class="${r<s.round?'past':''} ${r===s.round-1?'current':''}"></i>`).join('')}</div><strong>R${s.round}<small> / ${s.lastRound}</small></strong></div><nav class="tools"><button class="tool skip-control" data-cmd="skip" aria-label="演出を省略" title="演出を省略" ${busy?'':'disabled'}>${icon('fast')}</button>${tool(prefs.music?'BGMをオフ':'BGMをオン','music',prefs.music?'sound':'mute',prefs.music)}${tool('遊び方','help','book')}${tool('設定・一時停止','settings','gear')}</nav>`;
}
function intro() {
  const m = match!; const v = m.view;
  return `<main class="season-intro"><div class="intro-heading"><div><span class="eyebrow">A NEW SEASON · ${v.season.toString().padStart(2,'0')}</span><h1>今季の、四つの実り。</h1></div><p>この4種類の作物が登場します。<br>待ち時間と収入を見比べて、作戦を。</p></div><div class="intro-cards">${v.cropIdsInGame.map(id=>cropCard(id,'intro')).join('')}</div><footer class="intro-footer"><div class="seat-order">${v.turnOrder.map((seat,i)=>`<div style="--seat:${palette[seat]}">${avatar(seat)}<span><small>${i+1}番手</small><b>${esc(v.players[seat]!.name)} ${v.curseReadySeats.includes(seat)?'👿':''}</b></span><strong>${v.players[seat]!.coins}<small>G</small></strong></div>`).join('')}</div>${btn(`シーズンをはじめる ${icon('arrow')}`,'start','primary')}</footer>${v.curseReadySeats.length ? `<div class="curse-announcement">👿 ${v.curseReadySeats.map(s=>esc(v.players[s]!.name)).join('・')} に呪いの権利。手番の行動前に1回、次Rから最大4Rの収入を−6Gにできます。</div>` : ''}</main>`;
}
function targetFor(seat:number,index:number): Extract<Action,{type:'plant'|'replace'}> | undefined {
  if (selected===null || seat!==0 || !match!.humanTurn || busy) return;
  const next = match!.view.players[0]!.plots.find(p=>!p.owned)?.index;
  return match!.view.legalActions?.find((a): a is Extract<Action,{type:'plant'|'replace'}> => (a.type==='plant'||a.type==='replace') && a.marketIndex===selected && (a.type==='replace'?a.plotIndex===index:a.target==='newLand'?next===index:a.target.plotIndex===index));
}
function farm(seat: number, order: number) {
  const m = match!; const v = m.view; const p = v.players[seat]!;
  const active = (actor ?? v.actingSeat)===seat && m.screen==='play';
  const crowns = previousSeasonLeaders(m.scores,v.season,v.players.length);
  const gain = figures.filter(f=>f.seat===seat).reduce((n,f)=>n+f.gain,0);
  const purse = p.coins+(m.screen==='harvest'&&!m.harvested?gain:0);
  return `<div class="farmer ${active?'active':''} ${seat===0?'you':''} ${gain?'paid':''}" style="--seat:${palette[seat]}"><div class="farmer-profile">${avatar(seat)}<div><h2>${seat&&m.catalogVersion==='0.20'?`<button class="cpu-profile" data-profile="${seat}" aria-label="${esc(p.name)}の考え方">${order+1} ${esc(p.name)}</button>`:`<small>${order+1}</small>${esc(p.name)}`}</h2><div class="purse" data-purse="${seat}">${coins(purse)}</div></div><span class="honors">${crowns.includes(seat)?'👑':''}${v.curseReadySeats.includes(seat)?'👿':''}</span></div><div class="plots" style="--plots:${p.plots.length}">${p.plots.map(plot=>{
    const target = targetFor(seat,plot.index); const d = plot.cropId?cropDef(plot.cropId):null;
    const growing = plot.white>0||plot.green>0;
    const figure = figures.find(f=>f.seat===seat&&f.plotIndex===plot.index);
    let content: string;
    if (!plot.owned) content=`<span class="new-land">＋</span><span class="land-cost">${acquireCost(plot.index,v.mode)}G</span>`;
    else if (!d) content='<span class="empty-soil">空き地</span>';
    else content=`<b class="plot-name">${esc(cropShortName(d.id))}</b>${vegetable(d.id,'mini-veg')}<span class="mini-income">${growing?`${d.baseIncome}<small>/${d.floor}</small>`:''}</span><span class="plot-phase ${plot.green?'ripe':''}">${plot.white?`待 ${'○'.repeat(plot.white)}`:plot.green?`収 ${'✦'.repeat(plot.green)}`:plot.red?`休 ${'▽'.repeat(plot.red)}`:'空き'}</span>`;
    const state = !growing?'resting':plot.green?'harvesting':'growing';
    return `<button class="plot ${state} ${target?`eligible ${target.type==='replace'?'replacement-target':''}`:''} ${selected!==null&&!target?'dim':''} ${active&&cpuPlot===plot.index?'cpu-focus':''} ${figure?'just-harvested':''}" data-plot="${seat}:${plot.index}" ${d?accent(d.id):''} aria-label="${esc(p.name)} 農地${plot.index+1}${d?' '+esc(d.name):''}${target?target.type==='replace'?' に植え替える':' に植える':''}">${content}${target?`<span class="plant-here">${icon('leaf')}${target.type==='replace'?'植え替え':'植える'}</span>`:''}${figure?`<span class="harvest-gain">+${figure.gain}</span>`:''}</button>`;
  }).join('')}</div></div>`;
}
function sky() {
  const v = match!.view;
  const windows = visibleEventWindows(v).filter(w=>!w.label.startsWith('呪い')&&w.from<=v.lastRound&&w.to>=v.round);
  const currentCurses=v.curses.filter(c=>c.to>=v.round);
  const count=v.hiddenCurseCount+currentCurses.length;
  const pending=v.hiddenCurseCount+currentCurses.filter(c=>!c.revealed).length;
  const curseNames=[...new Set([...v.hiddenCurses.map(c=>c.bySeat),...currentCurses.map(c=>c.bySeat)])].map(s=>v.players[s]!.name).join('・');
  return `<div class="section-title"><span>${icon('sun')} 天候のカード</span><span class="event-help">2ラウンド先まで</span>${count?`<button class="curse-stack" data-cmd="events" aria-label="${pending?'伏せた呪い':'呪い'}${count}枚の詳細 ${esc(curseNames)}">👿 ${pending?'伏せ ':''}${count}<small>${esc(curseNames)}</small></button>`:''}<button class="event-deck" data-cmd="events" aria-label="イベントの詳細">山 <b>${v.eventDeckCount}</b></button></div><div class="weather-cards">${windows.map(w=>`<button class="weather-card ${w.from>v.round?'forecast':w.from<v.round?'lingering':'now'} ${w.delta<0?'bad':''}" ${accent(w.cropId)} data-cmd="events"><span class="weather-label">${w.from>v.round?(w.from===v.round+1?'次':'次々'):w.from<v.round?'継続':'今'} <small>${roundSpan(w.from,w.to)}</small></span><span class="weather-crop">${vegetable(w.cropId)}<b>${name(w.cropId)}</b></span><strong>${w.delta>0?'+':'−'}${Math.abs(w.delta)}</strong></button>`).join('')}</div>`;
}
function market() {
  const m = match!; const v = m.view;
  return `<div class="market-heading"><span class="section-title">${icon('leaf')} 種を選ぶ</span>${m.catalogVersion==='0.20'?`<button class="refresh-market" data-cmd="refresh" title="自分の手番に1回、2Gで全場札を交換。交換後も植え付け・パスできます" ${!m.humanTurn||busy||!v.legalActions?.some(a=>a.type==='refresh')?'disabled':''}>${v.refreshedThisTurn?'交換済み':'交換 2G'}</button>`:''}<button class="season-reference" data-cmd="crops" aria-label="今シーズンの4作物">${v.cropIdsInGame.map(id=>vegetable(id)).join('')}<span>今季の作物</span></button></div><div class="market-cards" style="--cards:${v.market.length}">${v.market.map((c,i)=>{
    const legal = v.legalActions?.some(a=>(a.type==='plant'||a.type==='replace')&&a.marketIndex===i);
    return `<button class="market-choice ${selected===i?'selected':''} ${cpuMarket===i?'cpu-focus':''} ${m.humanTurn&&!legal?'unaffordable':''}" data-market="${i}" ${!m.humanTurn||busy||!legal?'disabled':''} aria-label="${esc(cropName(c.cropId))}を選ぶ${(()=>{const d=cropDef(c.cropId),w=harvestWarning(v.round,v.lastRound,d.wait,d.harvest);return w?`：${esc(w.label)}`:'';})()}" aria-pressed="${selected===i}">${cropCard(c.cropId)}<span class="choose-label">${selected===i?'農地を選んでください':m.humanTurn&&!legal?'植え付け不可':`${icon('leaf')} この種を植える`}</span></button>`;
  }).join('')}</div>`;
}
function learningHint() {
  if (!prefs.learning||selected===null) return '';
  const v = match!.view; const d = cropDef(v.market[selected]!.cropId);
  const rounds = harvestRoundsIfPlanted(v.round,v.lastRound,d.wait,d.harvest);
  const windows = visibleEventWindows(v).filter(w=>w.cropId===d.id&&rounds.some(r=>w.from<=r&&r<=w.to));
  return `<div class="learning-hint"><span>${icon('book')} ${rounds.length?`${roundSpan(rounds[0]!,rounds.at(-1)!)}に${rounds.length}回収穫`:'今季の収穫には間に合いません'}</span><small>${windows.length?windows.map(w=>`${roundSpan(w.from,w.to)} ${w.delta>0?'+':''}${w.delta}G`).join(' · '):'既知のイベント影響なし'} · 競合や今後の天候で変動</small></div>`;
}
function status() {
  const m = match!;
  if (paused) return `<div class="status-message">${icon('pause')}<span><b>ひと休み中</b><small>畑はこのまま待っています</small></span></div>${btn(`再開 ${icon('play')}`,'pause','primary')}`;
  if (m.screen==='harvest') {
    const total = m.previewHarvest().reduce((n,d)=>n+d.gain,0);
    return `<div class="status-message harvest-status">${icon('coin')}<span><b>${total?'実りの時間':'まだ、育ちざかり。'}</b><small>${total?`全員で +${total}G · ${m.harvested?'集計完了':'収穫中'}`:'このラウンドの収穫はありません'}</small></span></div><div class="harvest-totals">${m.view.players.map(p=>`<span style="--seat:${palette[p.seat]}">${esc(p.name)} <b>+${figures.filter(f=>f.seat===p.seat).reduce((n,f)=>n+f.gain,0)}</b></span>`).join('')}</div><div class="footer-actions">${busy?btn(holdHarvest?'ここで止まります':`${icon('pause')} 結果を見る`,'hold','subtle',holdHarvest):btn(`次のラウンドへ ${icon('arrow')}`,'next','primary')}${busy?'':btn('内訳','receipt','subtle')}</div>`;
  }
  const p = m.view.players[actor??m.view.actingSeat??0]!;
  const your = m.humanTurn&&!busy;
  return `<div class="status-message">${avatar(p.seat)}<span><b>${your?selected===null?'あなたの一手です':'どの畑に植えますか？':`${esc(p.name)}の一手`}</b><small>${esc(cue||(your?'種を選ぶ → 光る農地をタップ':'畑の様子を見ています'))}</small></span></div>${selected!==null?learningHint():lastReceipt?`<button class="last-receipt" data-cmd="receipt">${icon('coin')} 前Rの収穫 <b>+${lastReceipt.totals[0]}G</b></button>`:'<span class="footer-motto">育てる楽しさ、先を読む面白さ。</span>'}<div class="footer-actions">${your?`${selected!==null?btn('やめる','cancel','subtle'):''}${m.view.legalActions?.some(a=>a.type==='curse')?btn('👿 呪い','curse','subtle'):''}${btn(`パス ${icon('arrow')}`,'pass','pass-button')}`:`${tool('一時停止','pause','pause')}`}</div>`;
}
function boardShell() {
  return `<main class="game-table"><section class="farm-panel" aria-label="全プレイヤーの農場"><div class="section-title"><span>みんなの畑</span><span>番号は手番順・自分は最下段</span></div><div id="farm-rows"></div></section><section class="right-panel"><section id="sky" class="sky" aria-label="天候イベント"></section><section id="market" class="market" aria-label="場札"></section></section></main><footer id="status" class="action-bar" aria-live="polite"></footer><div id="pause-veil"></div>`;
}
function seasonScores() {
  const m = match!; const row = m.scores.at(-1)!; const best = topSeats(row); const worst = bottomSeats(row);
  return m.seats.map((p,i)=>`<div class="score-ticket ${best.includes(i)?'best':''}" style="--seat:${palette[i]}">${avatar(i)}<div><b>${esc(p.name)} ${best.includes(i)?'✌️':worst.includes(i)?'😱':''}</b><span><strong>${row[i]}<small>G</small></strong><small>→ 累計 ${m.totals[i]}G</small></span></div></div>`).join('');
}
function recap() {
  const m=match!;const s=m.state;
  const content = m.screen==='actions'
    ? `<div class="recap-label"><h2>みんな、どう育てた？</h2><p>それぞれの一手を、ひと並びに。</p></div><div class="action-log"><table><thead><tr><th></th>${Array.from({length:s.lastRound},(_,r)=>`<th>${r+1}</th>`).join('')}</tr></thead><tbody>${m.seats.map((p,seat)=>`<tr><th>${esc(p.name)}</th>${s.seasonActions.filter(a=>a.seat===seat).map((a,r)=>`<td style="--delay:${r*45}ms;--crop:${a.cropId?color(a.cropId):'#a5aa95'}" title="${a.cropId?esc(cropName(a.cropId)):'パス'}">${a.cropId?vegetable(a.cropId):'<span class="pass-mark">—</span>'}<span>${a.cropId?esc(cropShortName(a.cropId)):'パス'}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : `<div class="recap-label"><h2>一人ひとりの、畑の個性。</h2><p>作物とパスの比率を見比べよう。</p></div><div class="mix-legend">${s.cropIdsInGame.map(id=>`<span ${accent(id)}><i></i>${esc(cropName(id))}</span>`).join('')}<span><i></i>パス</span></div><div class="mix-list">${m.seats.map((p,seat)=>{const actions=s.seasonActions.filter(a=>a.seat===seat);return `<div class="mix-player"><b>${esc(p.name)}</b><div class="mix-bar">${[...s.cropIdsInGame,'pass'].map(id=>{const n=actions.filter(a=>id==='pass'?a.kind==='pass':a.cropId===id).length;return n?`<span style="flex:${n};--crop:${id==='pass'?'#b2b5a3':color(id)}" title="${id==='pass'?'パス':esc(cropName(id))} ${n}回">${n>=2&&id!=='pass'?vegetable(id):''}<b>${n}</b></span>`:'';}).join('')}</div></div>`;}).join('')}</div>`;
  return `<main class="recap"><div class="recap-header"><div><span class="eyebrow">SEASON ${s.season} COMPLETE</span><h1>おつかれさま、いい実り。</h1></div>${btn(`${m.screen==='actions'?'作戦を見比べる':'次へ'} ${icon('arrow')}`,'next','primary')}</div><div class="score-tickets">${seasonScores()}</div><div class="recap-content">${content}</div></main>`;
}
function trail() {
  const m=match!;const compact=window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches;const chartWidth=m.scores.length>10?m.scores.length*48+46:compact?340:760;const chart=trailLayout(m.scores,chartWidth,230);
  return `<main class="recap trail-page"><div class="recap-header"><div><span class="eyebrow">ALL SEASONS COMPLETE</span><h1>${m.scores.length}シーズン完了。ゲーム終了。</h1></div>${btn(`表彰式へ ${icon('arrow')}`,'next','primary')}</div><div class="trail-body"><div class="trail-legend">${m.seats.map((p,i)=>`<span style="--seat:${palette[i]}">${avatar(i)}<b>${esc(p.name)}</b><strong>${m.totals[i]}G</strong></span>`).join('')}<p>各時点での相対的な位置。<br>点の数字は実際の累計得点です。</p></div><div class="trail-scroll"><svg class="trail-chart" style="${m.scores.length>10?`min-width:${chartWidth}px`:''}" viewBox="0 0 ${chartWidth} 230" role="img" aria-label="シーズンごとの累積得点の偏差値による推移">${chart.series.map(series=>`<g stroke="${palette[series.seat]}" fill="${palette[series.seat]}"><polyline stroke-width="2.5" fill="none" points="${series.points.map(p=>`${p.x},${p.y}`).join(' ')}"/>${series.points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4"/><text x="${p.x}" y="${p.y-10}" text-anchor="middle" font-size="11" stroke="none">${p.total}</text>`).join('')}</g>`).join('')}${chart.xLabels.map(l=>`<text x="${l.x}" y="${l.y}" font-size="11" fill="#7d8a73" text-anchor="middle">${l.label}</text>`).join('')}</svg></div></div></main>`;
}
function result() {
  const m=match!;const winners=topSeats(m.totals);
  return `<main class="result-page">${countryside()}<div class="winner-scene"><div class="eyebrow">THE HARVEST CHAMPION</div><div class="laurel">${icon('trophy')}</div><div class="winner-avatars">${winners.map(s=>avatar(s)).join('')}</div><h1>${winners.map(s=>esc(m.seats[s]!.name)).join(' ＆ ')}</h1><p>総合優勝、おめでとう！</p></div><section class="result-paper"><h2>今回の実り</h2>${m.seats.map((p,i)=>({p,i})).sort((a,b)=>m.totals[b.i]!-m.totals[a.i]!).map(({p,i})=>`<div class="ranking"><span>${1+m.totals.filter(t=>t>m.totals[i]!).length}</span>${avatar(i)}<b>${esc(p.name)}</b><strong>${m.totals[i]}<small>G</small></strong></div>`).join('')}${btn(`もうひと畑、同じ設定で ${icon('arrow')}`,'replay','primary')}${btn('設定を変えて遊ぶ','new','subtle')}</section></main>`;
}
function render() {
  const board = match && (match.screen==='play'||match.screen==='harvest');
  const key = !match?'landing':board?'board':match.screen;
  document.body.dataset.screen=key;
  document.body.classList.toggle('has-selection',selected!==null);
  if (layout!==key) {
    app.innerHTML = !match?landing():`<header id="topbar" class="topbar"></header><div id="stage" class="stage">${board?boardShell():''}</div><div id="error" class="error" role="alert"></div>`;
    layout=key;
  }
  if (!match) { put(app,landing()); return; }
  put(byId('topbar'),topbar());
  if (board) {
    const rows=byId('farm-rows')!;
    const order=match.view.turnOrder;
    const self=order.indexOf(0);
    const displayOrder=[...order.slice(self+1),...order.slice(0,self+1)];
    for (const [i,seat] of displayOrder.entries()) {
      let node=rows.children[i] as HTMLElement|undefined;
      if (!node) {node=document.createElement('div');rows.append(node);}
      put(node,farm(seat,match.view.turnOrder.indexOf(seat)));
    }
    put(byId('sky'),sky()); put(byId('market'),market()); put(byId('status'),status());
    put(byId('pause-veil'),paused?`<div class="pause-curtain"><span>${icon('pause')}ひと休み中</span>${btn('畑に戻る','pause','primary')}</div>`:'');
  } else put(byId('stage'),match.screen==='intro'?intro():['actions','mix'].includes(match.screen)?recap():match.screen==='trail'?trail():result());
  put(byId('error'),error?`${esc(error)} ${btn('閉じる','dismiss','subtle')}`:!hasSave&&storageNotice?`このブラウザでは自動保存できません。このページを開いたまま遊んでください。 ${btn('閉じる','dismiss-storage','subtle')}`:'');
}

function fly(source:Element|null,target:Element|null,kind:'plant'|'coin') {
  if (reduced.matches || !source || !target || document.hidden) return;
  const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();
  for (let i=0;i<(kind==='coin'?3:1);i++) {
    const particle=document.createElement('span');particle.className=`flight ${kind}`;
    particle.innerHTML=kind==='coin'?'G':icon('leaf');
    particle.style.cssText=`left:${a.left+a.width/2}px;top:${a.top+a.height/2}px;--dx:${b.left+b.width/2-a.left-a.width/2}px;--dy:${b.top+b.height/2-a.top-a.height/2}px;--delay:${i*55}ms`;
    fx.append(particle);setTimeout(()=>particle.remove(),850);
  }
}
function receiptModal() {
  if (!lastReceipt) { modal('receipt','<h2>収穫はこれから。</h2><p>最初の収穫が終わると、ここに内訳が残ります。</p>');return; }
  const r=lastReceipt;const m=match!;
  modal('receipt',`<div class="modal-heading"><span class="eyebrow">HARVEST RECEIPT</span><h2>S${r.season} / R${r.round} の実り</h2><p>基本 ＋ 天候 − 競合。最低保証つき。</p></div><div class="receipt-grid">${m.seats.map((p,seat)=>`<section><h3>${avatar(seat)}${esc(p.name)}<strong>+${r.totals[seat]}G</strong></h3>${r.details.filter(d=>d.seat===seat).map(d=>`<div class="receipt-line">${vegetable(d.cropId)}<span><b>${esc(cropName(d.cropId))} <small>農地${d.plotIndex+1}</small></b><small>${d.base}${d.eventSum>=0?'+':''}${d.eventSum}−${d.others}${d.raw<d.floor?` ＜ 最低${d.floor}`:` = ${d.raw}`}</small></span><strong>+${d.gain}</strong></div>`).join('')||'<p class="muted">今回は収穫なし</p>'}</section>`).join('')}</div>${btn('畑に戻る','close','primary')}`);
}
function eventsModal() {
  const v=match!.view;const ws=visibleEventWindows(v).filter(w=>!w.label.startsWith('呪い')&&w.from<=v.lastRound&&w.to>=v.round);
  modal('events',`<div class="modal-heading"><span class="eyebrow">WEATHER & CURSES</span><h2>これからの天候</h2><p>通常のカードは2R、呪いは次Rから最大4R続きます。</p></div><div class="event-detail-grid">${ws.map(w=>`<div class="event-detail" ${accent(w.cropId)}>${vegetable(w.cropId)}<b>${esc(cropName(w.cropId))}<small>${w.label.startsWith('呪い')?'👿 呪い':w.from>v.round?'予報':'発動中'} · ${roundSpan(w.from,w.to)}</small></b><strong>${w.delta>0?'+':''}${w.delta}G</strong></div>`).join('')}${v.curses.filter(c=>c.to>=v.round).map(c=>`<div class="event-detail curse-detail" ${accent(c.cropId)}>${vegetable(c.cropId)}<b>${esc(cropName(c.cropId))}<small>👿 ${esc(v.players[c.bySeat]!.name)} · ${c.revealed?'公開中':'伏せ（自分だけ確認）'} · ${c.from>v.lastRound?'今季の発動なし':roundSpan(c.from,c.to)}</small></b><strong>−6G</strong></div>`).join('')}${v.hiddenCurses.map(c=>`<div class="event-detail hidden"><span>👿</span><b>伏せた呪い<small>${esc(v.players[c.bySeat]!.name)} が使用 · 対象は収穫後に公開</small></b><strong>？</strong></div>`).join('')}</div>`);
}
function settingsModal() {
  modal('settings',`<div class="modal-heading"><span class="eyebrow">MAKE YOURSELF AT HOME</span><h2>ひと休みと、設定。</h2></div><div class="preferences"><label>BGM<button class="switch ${prefs.music?'on':''}" data-cmd="music" aria-pressed="${prefs.music}">${prefs.music?'ON':'OFF'}</button></label><label>効果音<button class="switch ${prefs.effects?'on':''}" data-cmd="effects" aria-pressed="${prefs.effects}">${prefs.effects?'ON':'OFF'}</button></label><label>学習ヒント<button class="switch ${prefs.learning?'on':''}" data-cmd="learning" aria-pressed="${prefs.learning}">${prefs.learning?'ON':'OFF'}</button></label><label>収穫後に自動で進む<button class="switch ${prefs.auto?'on':''}" data-cmd="auto" aria-pressed="${prefs.auto}">${prefs.auto?'ON':'OFF'}</button></label><label>演出のテンポ<select id="pace"><option value="1.5" ${prefs.pace===1.5?'selected':''}>ゆったり</option><option value="1" ${prefs.pace===1?'selected':''}>ふつう</option><option value="0.55" ${prefs.pace===.55?'selected':''}>快速</option></select></label></div><div class="modal-actions">${btn('畑に戻る','close','primary')}${btn('対局を閉じてタイトルへ','title','subtle')}</div><p class="muted">対局はこの端末に自動保存されます。別の端末とは共有されません。</p>`);
}
function help() {
  modal('help',`<div class="modal-heading"><span class="eyebrow">HOW TO GROW</span><h2>一手は、たった2タップ。</h2></div><div class="help-grid"><section><span>01</span><h3>種を選ぶ。</h3><p>場札をタップ。栽培費と、実るまでの時間を見比べよう。</p></section><section><span>02</span><h3>畑に植える。</h3><p>光る農地をタップして確定。新しい農地には取得費も必要。</p></section><section><span>03</span><h3>実りを待つ。</h3><p>○は待機、✦は収穫、▽は連作の休み。同じ作物の収穫が重なると、農地ごとの収入が下がる。</p></section></div>${match?.catalogVersion==='0.20'?'<p><b>途中で植え替え</b>：別の作物を選んで栽培中の畑をタップ。撤収は無料、新しい栽培費だけを払います。古い作物の残り収穫は失います。<br><b>場札交換</b>：自分の手番に1回、2Gで全交換。その後も通常の一手を行えます。同じ種類が出ることもあります。CPU名をタップすると考え方を確認できます。</p>':''}<p>天候は2ラウンド先まで公開。同じシーズン中は手番順が変わりません。コインはシーズンごとにリセットし、シーズン終了時の所持コインの合計で勝負します。</p><p class="muted">収穫は自動集計。「結果を見る」で止めたり、コインのボタンから内訳を見返せます。</p>${btn('畑に戻る','close','primary')}`);
}
function curseModal() {
  const m=match!;
  modal('curse',`<div class="modal-heading"><span class="eyebrow">A LITTLE MISCHIEF</span><h2>どの作物に、呪いをかける？</h2><p>対象の収入を次Rから最大4R、−6G。最低保証は残ります。権利は1回、手番は消費しません。</p></div><div class="curse-choices">${m.view.legalActions?.filter(a=>a.type==='curse').map(a=>a.type==='curse'?`<button data-curse="${a.cropId}" ${accent(a.cropId)}>${vegetable(a.cropId)}<b>${esc(cropName(a.cropId))}</b><small>この作物に伏せる</small></button>`:'').join('')}</div>${m.state.curses.length?`<p class="muted">使用済みで選べない作物：${m.state.curses.map(c=>esc(cropName(c.cropId))).join('・')}</p>`:''}`);
}
async function drive() {
  const m=match!; const token=motion.begin(); busy=true;
  const wait = async (ms:number) => {
    await motion.wait(reduced.matches?Math.min(ms,35):ms*prefs.pace,token);
    while (document.hidden||dialog.open||paused) await motion.wait(120,token,false);
  };
  try {
    while (m===match) {
      if (m.screen==='play'&&!m.humanTurn) {
        actor=m.state.actingSeat;cue='次の一手を選んでいます';render();await wait(95);
        const action=m.cpuAction();const seat=actor!;
        if (action.type==='plant'||action.type==='replace') {
          cpuMarket=action.marketIndex;cue=`${cropName(m.view.market[action.marketIndex]!.cropId)}を選びました`;sound.play('select');render();await wait(100);
          cpuPlot=action.type==='replace'?action.plotIndex:action.target==='newLand'?m.view.players[seat]!.plots.find(p=>!p.owned)!.index:action.target.plotIndex;
          cue='この畑に植えます';render();await wait(105);
          const source=document.querySelector(`[data-market="${action.marketIndex}"]`);const target=document.querySelector(`[data-plot="${seat}:${cpuPlot}"]`);
          fly(source,target,'plant');
        }
        const planting=action.type==='plant'||action.type==='replace';
        m.act(action);checkpoint();cpuMarket=null;
        sound.play(planting?'plant':action.type==='curse'?'curse':'pass');
        cue=planting?'種を植え、コインを支払いました':action.type==='curse'?'呪いを伏せました。続けて通常の一手':action.type==='refresh'?'2Gで場札を交換。続けて種を選びます':'今回はパス';
        render();await wait(planting?100:85);actor=cpuPlot=null;
        continue;
      }
      if (m.screen==='harvest') {
        actor=cpuMarket=cpuPlot=null;cue='';holdHarvest=holdHarvest||!prefs.auto;
        if (!m.harvested) {
          figures=[];const details=m.previewHarvest();
          lastReceipt={season:m.state.season,round:m.state.round,details,totals:m.seats.map((_,seat)=>details.filter(d=>d.seat===seat).reduce((n,d)=>n+d.gain,0))};
          const waves=harvestWaves(details,m.view.turnOrder);render();
          if (waves.length) {
            await wait(harvestTiming.opening);
            for (const wave of waves) {
              figures.push(...wave.details);sound.play('coin');render();
              for (const d of wave.details) fly(document.querySelector(`[data-plot="${d.seat}:${d.plotIndex}"]`),document.querySelector(`[data-purse="${d.seat}"]`),'coin');
              await wait(harvestTiming.wave);
            }
            m.finishHarvest();checkpoint();render();await wait(harvestTiming.settle);
          } else {m.finishHarvest();checkpoint();render();await wait(harvestTiming.empty);}
        } else {
          figures=m.state.lastHarvest;
          if (!lastReceipt) lastReceipt={season:m.state.season,round:m.state.round,details:figures,totals:[...m.state.lastPayouts]};
          render();await wait(120);
        }
        if (holdHarvest||!prefs.auto) break;
        m.next();checkpoint();figures=[];holdHarvest=false;render();
        if ((m.screen as string)==='actions') {sound.play('win');break;}
        continue;
      }
      break;
    }
  } catch (e) {
    if (!(e instanceof Interrupted)) {error=e instanceof Error?e.message:'進行を再開できませんでした';console.error(e);}
  } finally {
    if (motion.valid(token)) {
      busy=false;actor=cpuMarket=cpuPlot=null;cue='';render();
      if (m.humanTurn) {const id=`${m.state.season}-${m.state.round}-${m.state.turnIndex}`;if (announcedTurn!==id) {announcedTurn=id;sound.play('turn');}}
    }
  }
}
function beginMatch(resume=false) {
  motion.cancel();busy=paused=holdHarvest=false;selected=actor=cpuMarket=cpuPlot=null;figures=[];lastReceipt=null;error='';announcedTurn='';fx.replaceChildren();
  if (resume&&saved) {match=Match.restore(saved);settings={...match.settings};}
  else {settings={...settings,seed:crypto.randomUUID()};match=new Match(settings);}
  if (resume&&match.screen==='play'&&match.state.round>1) lastReceipt={season:match.state.season,round:match.state.round-1,details:match.state.lastHarvest,totals:[...match.state.lastPayouts]};
  checkpoint();sound.start();sound.play('start');render();
  if (match.screen==='play'||match.screen==='harvest') void drive();
}
async function next() {
  if (!match||busy) return;
  closeModal();holdHarvest=false;figures=[];selected=null;match.next();if (match.screen==='intro') lastReceipt=null;checkpoint();render();
  if (match.screen==='play') await drive();
  else if (match.screen==='result') {clearSave();sound.play('win');}
}
function readForm(form:HTMLFormElement) {
  const data=new FormData(form);const players=Number(data.get('players'));
  settings={mode:'advanced',players,seasons:seasonOptions(players).find(o=>o.value===data.get('seasons'))?.seasons??players,seed:''};
  prefs.learning=data.has('learning');prefs.effects=data.has('effects');
}
app.addEventListener('submit',e=>{
  if (!(e.target instanceof HTMLFormElement)||e.target.id!=='settings') return;
  e.preventDefault();readForm(e.target);
  if (saved&&!window.confirm('保存した対局を置き換えて、新しい畑をはじめますか？')) return;
  savePreferences();void sound.unlock();beginMatch();
});
app.addEventListener('change',e=>{
  const form=(e.target as HTMLElement).closest<HTMLFormElement>('#settings');
  if (form) {readForm(form);savePreferences(); for(const option of seasonOptions(settings.players)){const el=form.querySelector(`option[value="${option.value}"]`);if(el)el.textContent=option.label;}}
});
dialog.addEventListener('change',e=>{
  if (e.target instanceof HTMLSelectElement&&e.target.id==='pace') {prefs.pace=Number(e.target.value);savePreferences();}
});
async function click(e:MouseEvent) {
  if (!(e.target instanceof Element)) return;
  const el=e.target.closest<HTMLButtonElement>('button');if (!el||el.disabled) return;
  const cmd=el.dataset.cmd;
  if (cmd==='close') {closeModal();return;}
  if (['music','effects','learning','auto'].includes(cmd??'')) {
    void sound.unlock();const key=cmd as 'music'|'effects'|'learning'|'auto';prefs[key]=!prefs[key];savePreferences();
    if (dialogKind==='settings') {settingsModal();dialog.querySelector<HTMLButtonElement>(`[data-cmd="${key}"]`)?.focus();}render();return;
  }
  if (cmd==='resume') {void sound.unlock();beginMatch(true);return;}
  if (cmd==='help') {help();return;}
  if (cmd==='settings') {settingsModal();return;}
  if (cmd==='events') {eventsModal();return;}
  if (cmd==='receipt') {receiptModal();return;}
  if (cmd==='crops') {modal('crops',`<div class="modal-heading"><span class="eyebrow">THIS SEASON'S SEEDS</span><h2>今季の4種類</h2></div><div class="crop-library">${match!.view.cropIdsInGame.map(id=>cropCard(id,'intro')).join('')}</div>`);return;}
  if (cmd==='pause') {paused=!paused;render();return;}
  if (cmd==='skip') {motion.skip();return;}
  if (cmd==='hold') {holdHarvest=true;render();return;}
  if (cmd==='dismiss') {error='';render();return;}
  if (cmd==='dismiss-storage') {storageNotice=false;render();return;}
  if (cmd==='title'||cmd==='new') {
    checkpoint();motion.cancel();sound.stop();closeModal();busy=false;match=null;layout='';
    try {const value=JSON.parse(localStorage.getItem(SAVE)||'null');saved=value&&Match.restore(value).screen!=='result'?value:null;} catch {saved=null;}
    render();return;
  }
  if (match&&el.dataset.profile) {const seat=Number(el.dataset.profile),p=match.cpuPersonality(seat);modal('cpu',`<div class="modal-heading"><h2>${esc(match.seats[seat]!.name)} · ${esc(p.label)}</h2></div><p>${esc(p.description)}</p><p class="muted">未公開の天候や山札の順番、相手が伏せた呪いの対象は知りません。${p.curse==='predict'?'呪いの予測は外れることもあります。':''}</p>${btn('畑に戻る','close','primary')}`);return;}
  if (match&&busy&&el.dataset.plot) {const [seat,index]=el.dataset.plot.split(':').map(Number); const id=match.view.players[seat!]!.plots[index!]!.cropId; if (id) detail(id); return;}
  if (!match||busy||paused) return;
  void sound.unlock();
  try {
    if (el.dataset.market!==undefined) {
      selected=Number(el.dataset.market);sound.play('select');render();const target=document.querySelector<HTMLButtonElement>('.plot.eligible');target?.focus({preventScroll:true});
      if (window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches) target?.closest('.farmer')?.scrollIntoView({block:'nearest',behavior:'instant'});
      return;
    }

    if (el.dataset.plot) {
      const [seat,index]=el.dataset.plot.split(':').map(Number);const action=targetFor(seat!,index!);
      if (action) {
        if(action.type==='replace'){pendingReplacement=action;const old=match.view.players[0]!.plots[action.plotIndex]!;const id=match.view.market[action.marketIndex]!.cropId;modal('replacement',`<div class="modal-heading"><h2>この畑を植え替える？</h2></div><p><b>${esc(cropName(old.cropId!))}</b> → <b>${esc(cropName(id))}</b></p><p>${old.white?`待機中（あと${old.white}R）`:`収穫期（残り${old.green}回）`}の作物を撤収します。残りの収穫と支払った栽培費は戻りません。</p><p>撤収費は無料。新しい栽培費 <b>${cropDef(id).cost}G</b>を払い、この手番の一手として植えます。</p><div class="modal-actions">${btn('植え替える','replace-confirm','primary')}${btn('やめる','close','subtle')}</div>`);return;}
        const source=document.querySelector(`[data-market="${selected}"]`);fly(source,el,'plant');
        match.act(action);checkpoint();selected=null;sound.play('plant');await drive();
      } else if (selected===null) {const id=match.view.players[seat!]!.plots[index!]!.cropId;if (id) detail(id);}
      return;
    }
    if (el.dataset.curse&&match.humanTurn) {match.act({type:'curse',cropId:el.dataset.curse});checkpoint();selected=null;sound.play('curse');closeModal();render();return;}
    switch (cmd) {
      case 'replace-confirm':if(match.humanTurn&&pendingReplacement&&dialogKind==='replacement'){const action=pendingReplacement;pendingReplacement=null;closeModal();match.act(action);checkpoint();selected=null;sound.play('plant');await drive();}break;
      case 'refresh':if(match.humanTurn){match.act({type:'refresh'});checkpoint();selected=null;sound.play('select');render();}break;
      case 'start':match.start();checkpoint();sound.play('start');await drive();break;
      case 'pass':if (match.humanTurn) {match.act({type:'pass'});checkpoint();selected=null;sound.play('pass');await drive();}break;
      case 'cancel':selected=null;render();break;
      case 'curse':if (match.humanTurn) curseModal();break;
      case 'next':await next();break;
      case 'replay':beginMatch();break;
    }
  } catch (e) {error=e instanceof Error?e.message:'操作を続けられませんでした';render();}
}
app.addEventListener('click',click);dialog.addEventListener('click',click);
dialog.addEventListener('click',e=>{if (e.target===dialog) closeModal();});
dialog.addEventListener('close',()=>{dialogKind='';});
document.addEventListener('visibilitychange',()=>{void sound.visibility(document.hidden);if (document.hidden) checkpoint();});
window.addEventListener('pagehide',checkpoint);
document.addEventListener('keydown',e=>{
  if (e.code==='Space'&&busy&&!dialog.open&&!(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)) {e.preventDefault();motion.skip();}
  if (e.key==='Escape'&&selected!==null&&!dialog.open) {selected=null;render();}
});
render();

// Only the score chart needs new coordinates when the device turns.
window.matchMedia('(max-width: 700px) and (orientation: portrait)').addEventListener('change',()=>{if(match?.screen==='trail') render();});
