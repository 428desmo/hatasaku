import { Match, type Settings } from './match.js';
import { cropDef, cropName, cropShortName, cropBlurb } from '../src/engine/catalog.js';
import { acquireCost, type Action, type HarvestDetail } from '../src/engine/types.js';
import { previousSeasonLeaders, topSeats, bottomSeats } from '../src/view/standings.js';
import { harvestRoundsIfPlanted, visibleEventWindows } from '../src/view/outlook.js';
import { formatHarvestFigure } from '../src/view/harvestCopy.js';
import { trailLayout } from '../src/view/trailChart.js';

const app = document.querySelector<HTMLElement>('#app')!;
const dialog = document.querySelector<HTMLDialogElement>('#detail')!;
const colors = ['#27705a', '#c16a3c', '#6577b8', '#ae698d', '#a3842d'];
let match: Match | null = null;
let settings: Settings = { mode: 'basic', players: 4, seasons: 4, seed: '' };
let selected: number | null = null;
let busy = false;
let epoch = 0;
let learning = true;
let cue = '';
let cpuMarket: number | null = null;
let cpuPlot: number | null = null;
let displayingSeat: number | null = null;
let figures: HarvestDetail[] = [];
let error = '';
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const button = (label: string, cmd: string, cls = '', disabled = false) => `<button class="${cls}" data-cmd="${cmd}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const name = (id: string) => `<span class="long-name">${esc(cropName(id))}</span><span class="short-name">${esc(cropShortName(id))}</span>`;
const span = (from: number, to: number) => `R${from}${Math.min(to, match!.state.lastRound) > from ? `–${Math.min(to, match!.state.lastRound)}` : ''}`;
const cropIndex = (id: string) => Math.max(0, match?.state.cropIdsInGame.indexOf(id) ?? 0);
const accent = (id: string) => `style="--crop:${['#6d8c5d', '#b88b4e', '#b46b61', '#8877a6'][cropIndex(id)]}"`;

function card(id: string, extra = '') {
  const d = cropDef(id);
  return `<article class="crop-card" ${accent(id)}><div class="card-cap">VEGETABLE <span>栽培 ${d.cost} G</span></div><h3>${esc(d.name)}</h3><div class="crop-mark" aria-hidden="true">✿</div><dl><div><dt>待機</dt><dd>${d.wait} ラウンド</dd></div><div><dt>収穫</dt><dd>${d.harvest} ラウンド</dd></div><div><dt>基本 / 最低</dt><dd>${d.baseIncome} / ${d.floor} G</dd></div><div><dt>連作の休み</dt><dd>${d.cooldown} ラウンド</dd></div></dl>${extra}</article>`;
}
function showDetail(id: string) {
  document.querySelector('#detail-body')!.innerHTML = card(id, `<p>${esc(cropBlurb(id))}</p>`);
  dialog.showModal();
}
function setup() {
  app.innerHTML = `<main class="setup"><div class="eyebrow">ONE PLAYER + CPU · WEB LITE</div><h1>はたさく<span class="sprout">✳</span></h1><p class="lead">なにを植えるか。いつ実るか。<br>小さな畑で、先を読む。</p><form id="settings"><label>遊び方<select name="mode"><option value="basic" ${settings.mode === 'basic' ? 'selected' : ''}>基本 · 10ラウンド</option><option value="advanced" ${settings.mode === 'advanced' ? 'selected' : ''}>上級 · 18ラウンド</option></select></label><label>プレイヤー<select name="players">${[3,4,5].map(n => `<option ${n === settings.players ? 'selected' : ''} value="${n}">あなた ＋ CPU ${n - 1}人</option>`).join('')}</select></label><label>マッチ<select name="seasons"><option value="standard" ${settings.seasons !== 1 ? 'selected' : ''}>人数と同じシーズン数</option><option value="1" ${settings.seasons === 1 ? 'selected' : ''}>1シーズンだけ</option></select></label><label class="check"><input name="learning" type="checkbox" ${learning ? 'checked' : ''}> 学習ヒントを表示する</label><button class="primary wide" type="submit">畑をはじめる →</button></form><p class="fine">作物を選んでから、植えたい農地をタップ。<br>この版は1台で遊ぶ1人用です。ページを閉じると終了します。</p></main>`;
}
function header() {
  const s = match!.state;
  return `<header><a href="./" aria-label="はたさくのスタート画面">はたさく<span>WEB LITE</span></a><div>S${s.season} / ${s.seasonCount}<strong>R${s.round}<small> / ${s.lastRound}</small></strong></div>${button('設定', 'settings', 'quiet')}</header>`;
}
function intro() {
  const m = match!; const v = m.view;
  return `<main class="intro"><div class="eyebrow">SEASON ${v.season} / ${v.seasonCount}</div><h1>今シーズンの畑</h1><p>今シーズンで使用する作物は次の4種類です。</p><div class="intro-crops">${v.cropIdsInGame.map(id => `<div>${card(id)}<p class="blurb">${esc(cropBlurb(id))}</p></div>`).join('')}</div><div class="order">${v.turnOrder.map((seat, i) => `<span><small>${i + 1}番</small> ${esc(v.players[seat]!.name)} <b>${v.players[seat]!.coins}G</b></span>`).join('')}</div>${v.curseReadySeats.length ? `<aside>👿 ${v.curseReadySeats.map(s => esc(v.players[s]!.name)).join('・')} が呪いの権利を獲得。手番の行動前に1回、作物を選びます。収穫後に公開し、次ラウンドから4ラウンドの収入を−6Gにします（シーズン内のみ）。</aside>` : ''}${button('Start · シーズン開始 →', 'start', 'primary wide')}</main>`;
}
function targetFor(seat: number, plotIndex: number): Extract<Action, { type: 'plant' }> | undefined {
  if (selected === null || seat !== 0 || !match!.humanTurn) return;
  const p = match!.view.players[0]!;
  const next = p.plots.find(p => !p.owned)?.index;
  return match!.view.legalActions?.find((a): a is Extract<Action, { type: 'plant' }> => a.type === 'plant' && a.marketIndex === selected && (a.target === 'newLand' ? next === plotIndex : a.target.plotIndex === plotIndex));
}
function farms() {
  const m = match!; const v = m.view;
  const crowns = previousSeasonLeaders(m.scores, v.season, v.players.length);
  return `<section class="farms" aria-label="全プレイヤーの農場">${v.turnOrder.map((seat, i) => {
    const p = v.players[seat]!;
    const active = (displayingSeat ?? v.actingSeat) === seat && (m.screen === 'play' || displayingSeat !== null);
    const coins = p.coins + (m.screen === 'harvest' && !m.harvested ? figures.filter(f => f.seat === seat).reduce((n, f) => n + f.gain, 0) : 0);
    return `<article class="player ${active ? 'active' : ''}" style="--player:${colors[seat]}"><div class="player-top"><h2><small>${i + 1}</small> ${esc(p.name)} ${crowns.includes(seat) ? '👑' : ''}${v.curseReadySeats.includes(seat) ? '👿' : ''}</h2><strong>${coins}<small> G</small></strong></div><div class="plots" style="--plots:${p.plots.length}">${p.plots.map(plot => {
      const target = targetFor(seat, plot.index);
      const dim = selected !== null && !target;
      const growing = plot.white > 0 || plot.green > 0;
      const fig = figures.find(f => f.seat === seat && f.plotIndex === plot.index);
      let text = '';
      if (!plot.owned) text = `<span class="empty">＋</span><small>農地 ${acquireCost(plot.index, v.mode)}G</small>`;
      else if (!plot.cropId) text = '<span class="empty">空</span>';
      else text = `<b>${name(plot.cropId)}</b>${growing ? `<span>${cropDef(plot.cropId).baseIncome}/${cropDef(plot.cropId).floor}</span>` : ''}<small>${plot.white > 0 ? `待 ${'○'.repeat(plot.white)}` : plot.green > 0 ? `収 ${'★'.repeat(plot.green)}` : plot.red > 0 ? `休 ${'▽'.repeat(plot.red)}` : '空'}</small>`;
      return `<button class="plot ${growing ? '' : 'dashed'} ${target ? 'eligible' : ''} ${dim ? 'dim' : ''} ${active && cpuPlot === plot.index ? 'cpu-focus' : ''}" data-plot="${seat}:${plot.index}" ${plot.cropId ? accent(plot.cropId) : ''} aria-label="${esc(p.name)} 農地${plot.index + 1}${plot.cropId ? ' ' + esc(cropName(plot.cropId)) : ''}${target ? ' に植える' : ''}">${text}${fig ? `<span class="gain" title="基本${fig.base}、イベント${fig.eventSum}、競合−${fig.others}、最低${fig.floor}">${formatHarvestFigure(fig).text}</span>` : ''}</button>`;
    }).join('')}</div></article>`;
  }).join('')}</section>`;
}
function events() {
  const v = match!.view;
  const windows = visibleEventWindows(v).filter(w => w.from <= v.lastRound && w.to >= v.round);
  const hasCurse = v.hiddenCurseCount > 0 || v.curses.some(c => c.to >= v.round);
  return `<section class="events ${hasCurse ? 'with-curse' : ''}" aria-label="イベント"><div class="section-label">EVENTS <span>先の天候を読む</span></div><div class="event-row">${windows.map(w => `<article class="event ${w.from > v.round ? 'future' : ''} ${w.delta < 0 ? 'negative' : ''}" ${accent(w.cropId)}><small>${w.label.startsWith('呪い') ? '呪い' : w.from > v.round ? '次' : w.from < v.round ? '継続' : '今'} ${span(w.from, w.to)}</small><b>${name(w.cropId)}</b><strong>${w.delta > 0 ? '+' : '−'}${Math.abs(w.delta)}</strong></article>`).join('')}${v.hiddenCurses.map(c => `<article class="event hidden"><small>呪い · 伏せ</small><b>？</b><small>${esc(v.players[c.bySeat]!.name)}</small></article>`).join('')}<div class="deck"><span>山</span><b>${v.eventDeckCount}</b></div></div></section>`;
}
function reference() {
  return `<section class="references" aria-label="今シーズンの作物">${match!.view.cropIdsInGame.map(id => { const d = cropDef(id); return `<button data-detail="${id}" ${accent(id)}><b>${esc(d.name)}</b><small>待 ${'○'.repeat(d.wait)}</small><small>収 ${'★'.repeat(d.harvest)} ${d.baseIncome}/${d.floor}</small></button>`; }).join('')}</section>`;
}
function hint() {
  if (!learning || selected === null) return '';
  const m = match!; const v = m.view; const d = cropDef(v.market[selected]!.cropId);
  const rounds = harvestRoundsIfPlanted(v.round, v.lastRound, d.wait, d.harvest);
  const windows = visibleEventWindows(v).filter(w => w.cropId === d.id && rounds.some(r => r >= w.from && r <= w.to));
  return `<aside class="hint">${rounds.length ? `収穫予定 ${span(rounds[0]!, rounds.at(-1)!)} · ${rounds.length}回 / 本来${d.harvest}回。` : '今植えても今シーズンの収穫には間に合いません。'} ${windows.map(w => `${span(w.from,w.to)} ${w.delta > 0 ? '+' : ''}${w.delta}G`).join(' / ')}<small>公開済みのイベントのみ。競合作物や将来のイベントにより収入は変わります。</small></aside>`;
}
function market() {
  const m = match!; const v = m.view;
  return `<section class="market"><div class="section-label">MARKET <span>作物 → 農地の順にタップ</span></div><div class="market-cards">${v.market.map((c, i) => {
    const legal = v.legalActions?.some(a => a.type === 'plant' && a.marketIndex === i);
    const disabled = !m.humanTurn || busy || !legal;
    return `<button class="market-card ${selected === i ? 'selected' : ''} ${cpuMarket === i ? 'cpu-focus' : ''}" data-market="${i}" ${disabled ? 'disabled' : ''} aria-label="${esc(cropName(c.cropId))}を選ぶ">${card(c.cropId)}${m.humanTurn && !legal ? '<span class="unavailable">コイン不足 / 植え付け先なし</span>' : ''}</button>`;
  }).join('')}</div>${hint()}</section>`;
}
function controls() {
  const m = match!;
  if (m.screen === 'harvest') return `<section class="harvest-controls"><button data-cmd="next" class="harvest-title" ${busy ? 'disabled' : ''}>収穫タイム${!m.previewHarvest().length ? '<small>収穫なし</small>' : ''}</button>${button(busy ? '収穫を集計しています…' : '次へ →', 'next', 'primary wide', busy)}</section>`;
  const actor = m.view.players[displayingSeat ?? m.view.actingSeat ?? 0]!;
  return `<section class="turn-controls"><div role="status" aria-live="polite"><strong>${esc(actor.name)}の手番</strong><span>${esc(cue || (m.humanTurn ? selected !== null ? '光っている農地を選んでください' : '場札を選ぶか、パスできます' : '考えています…'))}</span></div><div class="action-buttons">${selected !== null ? button('選択をやめる', 'cancel', '', busy) : ''}${m.humanTurn && m.view.legalActions?.some(a => a.type === 'curse') ? button('👿 呪いを使う', 'curse', '', busy) : ''}${button('パス', 'pass', 'pass', busy || !m.humanTurn)}</div></section>`;
}
function board() {
  return `<main class="board"><div class="farm-side">${farms()}</div><div class="table-side">${events()}${reference()}${controls()}${market()}</div></main>`;
}
function scoreRows() {
  const m = match!; const scores = m.scores.at(-1)!; const best = topSeats(scores); const worst = bottomSeats(scores);
  return m.seats.map((p, i) => `<div class="score-row"><b style="color:${colors[i]}">${esc(p.name)} ${best.includes(i) ? '✌️' : worst.includes(i) ? '😱' : ''}</b><span class="${best.includes(i) ? 'winner-score' : ''}">${scores[i]}G <small>→ 総合 ${m.totals[i]}G</small></span></div>`).join('');
}
function recap() {
  const m = match!; const s = m.state;
  let content = '';
  if (m.screen === 'actions') {
    content = `<h2>ラウンドごとの一手</h2><div class="action-log"><table><thead><tr><th>プレイヤー</th>${Array.from({length:s.lastRound}, (_, i) => `<th>R${i+1}</th>`).join('')}</tr></thead><tbody>${m.seats.map((p, seat) => `<tr><th>${esc(p.name)}</th>${Array.from({length:s.lastRound}, (_, r) => { const a = s.seasonActions.filter(a => a.seat === seat)[r]; return `<td style="--delay:${r * 100}ms" ${a?.cropId ? accent(a.cropId) : ''}>${a?.cropId ? esc(cropShortName(a.cropId)) : 'パス'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  } else {
    content = `<h2>選んだ作物の比率</h2><div class="mix-legend">${s.cropIdsInGame.map(id => `<span ${accent(id)}><i></i>${esc(cropName(id))}</span>`).join('')}<span>□ パス</span></div>${m.seats.map((p, seat) => {
      const actions = s.seasonActions.filter(a => a.seat === seat);
      return `<div class="mix-player"><b>${esc(p.name)}</b><div class="mix-bar">${[...s.cropIdsInGame, 'pass'].map(id => {
        const count = actions.filter(a => id === 'pass' ? a.kind === 'pass' : a.cropId === id).length;
        return count ? `<span style="flex:${count};--crop:${id === 'pass' ? '#c7c7bc' : ['#6d8c5d','#b88b4e','#b46b61','#8877a6'][cropIndex(id)]}" title="${id === 'pass' ? 'パス' : esc(cropName(id))}: ${count}回">${count}</span>` : '';
      }).join('')}</div></div>`;
    }).join('')}`;
  }
  return `<main class="recap"><div class="eyebrow">SEASON ${s.season} COMPLETE</div><h1>シーズン ${s.season} 完了</h1><div class="scores">${scoreRows()}</div>${content}${button('次へ →', 'next', 'primary wide')}</main>`;
}
function trail() {
  const m = match!; const layout = trailLayout(m.scores, 680, 300);
  return `<main class="recap"><div class="eyebrow">MATCH COMPLETE</div><h1>${m.scores.length}シーズン完了</h1><p>ゲーム終了。総合得点の歩みを振り返ろう。</p><svg class="trail" viewBox="0 0 680 300" role="img" aria-label="各シーズン終了時の累積得点を、その時点のプレイヤー間で標準化した推移">${layout.series.map(series => `<g stroke="${colors[series.seat]}" fill="${colors[series.seat]}"><polyline fill="none" stroke-width="2" points="${series.points.map(p => `${p.x},${p.y}`).join(' ')}"/>${series.points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4"/><text x="${p.x}" y="${p.y - 10}" text-anchor="middle" stroke="none" font-size="12">${p.total}</text>`).join('')}</g>`).join('')}${layout.xLabels.map(l => `<text x="${l.x}" y="${l.y}" text-anchor="middle" fill="#70766c" font-size="12">${l.label}</text>`).join('')}</svg><div class="order">${m.seats.map((p, i) => `<span style="color:${colors[i]}">● ${esc(p.name)} ${m.totals[i]}G</span>`).join('')}</div><p class="fine">高さは各シーズン終了時点での相対的な位置。数字は実際の累積得点です。</p>${button('総合順位へ →', 'next', 'primary wide')}</main>`;
}
function result() {
  const m = match!; const winners = topSeats(m.totals);
  return `<main class="recap result"><div class="eyebrow">THANK YOU FOR PLAYING</div><h1>👑 ${winners.map(i => esc(m.seats[i]!.name)).join(' ＆ ')}</h1><p>総合優勝</p><div class="scores">${m.seats.map((p, i) => ({p,i})).sort((a,b) => m.totals[b.i]! - m.totals[a.i]!).map(({p,i}) => `<div class="score-row"><b>${1 + m.totals.filter(t => t > m.totals[i]!).length}位 ${esc(p.name)}</b><strong>${m.totals[i]}G</strong></div>`).join('')}</div>${button('同じ設定でもう一度 →', 'replay', 'primary wide')}${button('設定を変える', 'new', 'wide quiet')}</main>`;
}
function render() {
  if (!match) { setup(); return; }
  // Keep the app shell and modal alive; replace only changed screen sections.
  if (!app.firstElementChild?.hasAttribute('data-section')) app.replaceChildren();
  const parts = [header(), match.screen === 'intro' ? intro() : ['play','harvest'].includes(match.screen) ? board() : ['actions','mix'].includes(match.screen) ? recap() : match.screen === 'trail' ? trail() : result(), error ? `<p role="alert" class="error">${esc(error)}</p>` : ''];
  for (let i = 0; i < parts.length; i++) {
    let section = app.children[i] as HTMLElement | undefined;
    if (!section) { section = document.createElement('div'); section.dataset.section = String(i); app.append(section); }
    if (section.dataset.html !== parts[i]) { section.innerHTML = parts[i]!; section.dataset.html = parts[i]!; }
  }
}
const pause = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));
class Cancelled extends Error {}
async function drive() {
  const m = match!; const run = epoch;
  busy = true; render();
  const wait = async (ms: number) => { await pause(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? Math.min(ms, 50) : ms); if (epoch !== run) throw new Cancelled(); };
  try {
    while (m.screen === 'play' && !m.humanTurn) {
      displayingSeat = m.state.actingSeat; cue = '手番が移りました'; render(); await wait(200);
      const action = m.cpuAction();
      const seat = m.state.actingSeat!;
      if (action.type === 'plant') {
        cpuMarket = action.marketIndex; cue = '場札を選んでいます'; render(); await wait(200);
        cpuPlot = action.target === 'newLand' ? m.view.players[seat]!.plots.find(p => !p.owned)!.index : action.target.plotIndex;
        cue = '植え付け先を選んでいます'; render(); await wait(200);
      } else { cue = action.type === 'curse' ? '呪いを伏せています' : 'パス'; render(); await wait(200); }
      m.act(action); cpuMarket = null;
      cue = action.type === 'plant' ? 'コインを支払いました' : action.type === 'curse' ? '続けて通常の行動を選びます' : 'パスしました'; render(); await wait(200); displayingSeat = null; cpuPlot = null;
    }
    if (m.screen === 'harvest') {
      cue = ''; figures = []; render(); await wait(1000);
      for (const detail of m.previewHarvest()) { figures.push(detail); render(); await wait(200); }
      m.finishHarvest();
    }
  } catch (e) { if (!(e instanceof Cancelled)) { error = e instanceof Error ? e.message : '進行に失敗しました'; console.error(e); } }
  finally { if (run === epoch) { busy = false; cue = ''; displayingSeat = null; render(); } }
}
function launch() {
  epoch++; busy = false; displayingSeat = null; selected = cpuMarket = cpuPlot = null; figures = []; error = ''; cue = '';
  settings = { ...settings, seed: crypto.randomUUID() };
  match = new Match(settings); render(); window.scrollTo(0, 0);
}
function chooseCurse() {
  document.querySelector('#detail-body')!.innerHTML = `<h2>呪いを伏せる</h2><p>対象を選ぶと権利を使います。手番は消費しません。収穫後に公開され、次ラウンドから最大4ラウンド、対象の収入が−6Gになります。</p>${match!.state.curses.length ? `<p>使用済みの対象：${match!.state.curses.map(c => esc(cropName(c.cropId))).join('・')}（選択できません）</p>` : ''}${match!.view.legalActions?.filter(a => a.type === 'curse').map(a => a.type === 'curse' ? `<button class="wide" data-curse="${a.cropId}">${esc(cropName(a.cropId))}</button>` : '').join('')}`;
  dialog.showModal();
}
app.addEventListener('submit', e => {
  if (!(e.target instanceof HTMLFormElement) || e.target.id !== 'settings') return;
  e.preventDefault(); const data = new FormData(e.target); const players = Number(data.get('players'));
  settings = { mode: data.get('mode') === 'advanced' ? 'advanced' : 'basic', players, seasons: data.get('seasons') === '1' ? 1 : players, seed: '' };
  learning = data.has('learning'); launch();
});
async function click(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!el || el.hasAttribute('disabled')) return;
  if (el.hasAttribute('data-close')) { dialog.close(); return; }
  if (el.dataset.detail) { showDetail(el.dataset.detail); return; }
  if (el.dataset.cmd === 'settings') {
    document.querySelector('#detail-body')!.innerHTML = `<h2>ゲーム設定</h2><p>${settings.mode === 'basic' ? '基本' : '上級'} / ${settings.players}人 / ${settings.seasons}シーズン</p><p>学習ヒント：${learning ? 'ON' : 'OFF'}</p>${button('学習ヒントを切り替える', 'learning', 'wide')}${button('対局を終了して設定に戻る', 'quit', 'wide quiet')}<p class="fine">シード：${esc(settings.seed)}</p>`; dialog.showModal(); return;
  }
  if (el.dataset.cmd === 'learning') { learning = !learning; dialog.close(); render(); return; }
  if (el.dataset.cmd === 'quit') { if (!window.confirm('進行中の対局を終了しますか？')) return; epoch++; busy = false; match = null; dialog.close(); render(); return; }
  if (!match || busy) return;
  try {
    if (el.dataset.market !== undefined) { selected = Number(el.dataset.market); render(); document.querySelector('.plot.eligible')?.scrollIntoView({block:'center',behavior:'smooth'}); return; }
    if (el.dataset.plot) {
      const [seat, plotIndex] = el.dataset.plot.split(':').map(Number);
      const action = targetFor(seat!, plotIndex!);
      if (action) { match.act(action); selected = null; await drive(); }
      else if (selected === null) { const id = match.view.players[seat!]!.plots[plotIndex!]!.cropId; if (id) showDetail(id); }
      return;
    }
    if (el.dataset.curse) { if (!match.humanTurn) return; match.act({type:'curse',cropId:el.dataset.curse}); dialog.close(); selected = null; render(); return; }
    switch (el.dataset.cmd) {
      case 'start': match.start(); window.scrollTo(0,0); await drive(); break;
      case 'pass': if (!match.humanTurn) return; match.act({type:'pass'}); selected = null; await drive(); break;
      case 'cancel': selected = null; render(); break;
      case 'curse': if (match.humanTurn) chooseCurse(); break;
      case 'next': match.next(); figures = []; selected = null; render(); window.scrollTo(0,0); if (match.screen === 'play') await drive(); break;
      case 'replay': launch(); break;
      case 'new': epoch++; match = null; render(); break;
    }
  } catch (e) { error = e instanceof Error ? e.message : '操作に失敗しました'; render(); }
}
app.addEventListener('click', click);
dialog.addEventListener('click', click);
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
render();
