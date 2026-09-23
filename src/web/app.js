(() => {
  const app = document.getElementById("app");
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(proto + "//" + location.host);

  const LEARN_KEY = "hatasaku-learn";
  let youSeat = null;
  let youName = "";
  let msg = null;
  let tab = "play";
  let selectedMarket = null;
  let peek = null;
  let cropPeek = null;
  let harvestStep = -1;
  let harvestKey = "";
  let harvestPhase = "idle";
  let harvestTimers = [];
  let cursePick = false;
  let learn = localStorage.getItem(LEARN_KEY) === "1";
  let errText = "";

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function pips(n, ch) {
    return n > 0 ? ch.repeat(n) : "";
  }

  function pipLine(label, n, ch, none) {
    if (!n) return none ? `${label} ${none}` : "";
    return `${label} ${pips(n, ch)} ${n}`;
  }

  function send(payload) {
    ws.send(JSON.stringify(payload));
  }

  function sendAction(action) {
    selectedMarket = null;
    peek = null;
    cropPeek = null;
    cursePick = false;
    send({ type: "action", action });
  }

  function clearHarvestTimers() {
    harvestTimers.forEach((id) => clearTimeout(id));
    harvestTimers = [];
  }

  function queueHarvest(fn, ms) {
    harvestTimers.push(setTimeout(fn, ms));
  }

  function beginHarvestWalk() {
    const walk = harvestWalk();
    if (walk.length === 0) {
      harvestPhase = "empty";
      harvestStep = -1;
      render();
      return;
    }
    harvestPhase = "walk";
    harvestStep = 0;
    render();
    queueHarvest(stepHarvestWalk, 200);
  }

  function stepHarvestWalk() {
    const walk = harvestWalk();
    if (harvestStep >= walk.length - 1) {
      harvestPhase = "done";
      render();
      return;
    }
    harvestStep += 1;
    render();
    queueHarvest(stepHarvestWalk, 200);
  }

  function harvestWalk() {
    const harvest = msg.harvest || [];
    const order = msg.view?.turnOrder || [];
    return [...harvest].sort((a, b) => {
      const da = order.indexOf(a.seat) - order.indexOf(b.seat);
      if (da !== 0) return da;
      return a.plotIndex - b.plotIndex;
    });
  }

  function shownCoins() {
    const board = msg.board;
    const payouts = msg.lastPayouts || [];
    const map = new Map();
    for (const p of board.players) {
      const after = p.coins;
      const pay = payouts[p.seat] ?? 0;
      map.set(p.seat, msg.hold === "result" ? after - pay : after);
    }
    if (msg.hold === "result" && (harvestPhase === "walk" || harvestPhase === "done")) {
      const walk = harvestWalk();
      const shown = harvestPhase === "done" ? walk.length - 1 : harvestStep;
      for (let i = 0; i <= shown && i < walk.length; i++) {
        const h = walk[i];
        map.set(h.seat, (map.get(h.seat) ?? 0) + h.gain);
      }
    }
    return map;
  }

  function legalForMarket(index) {
    return (msg.actions || []).filter((a) => a.type === "plant" && a.marketIndex === index);
  }

  function plotAction(index, plotIndex) {
    return legalForMarket(index).find((a) => {
      if (a.target === "newLand") {
        const player = msg.board.players.find((p) => p.isYou);
        const next = player?.plots.find((pl) => !pl.owned);
        return next && next.index === plotIndex;
      }
      return a.target && a.target.plotIndex === plotIndex;
    });
  }

  function eventCards() {
    const events = [];
    const he = msg.board.harvestEvents || [];
    const pe = msg.board.previewEvents || [];
    he.filter((e) => e.lingering).forEach((e) => events.push({ zone: "継続", ...e, live: true }));
    he.filter((e) => !e.lingering).forEach((e) => events.push({ zone: "今", ...e, live: true }));
    pe.forEach((e, i) => events.push({ zone: i === 0 ? "次" : "次々", ...e, live: false }));
    const curses = msg.board.curseEvents || [];
    const R = msg.view.round;
    curses.forEach((e) => events.push({ zone: "呪い", ...e, live: e.from <= R }));
    return events;
  }

  function cpuShow() {
    return msg.cpuShow || null;
  }

  function displayName(p) {
    if (p.isYou) return "あなた";
    return p.name.replace("プレイヤー", "P");
  }

  function nameOfSeat(seat) {
    const p = msg.board?.players?.find((x) => x.seat === seat);
    return p ? displayName(p) : `席${seat}`;
  }

  function onMarket(index) {
    const card = msg.board.market[index];
    if (!card || !card.enabled) return;
    cropPeek = null;
    cursePick = false;
    if (selectedMarket === index) {
      selectedMarket = null;
      return render();
    }
    selectedMarket = index;
    peek = null;
    render();
  }

  function ackHarvestNext() {
    if (msg.hold !== "result" || msg.acked) return;
    send({ type: "next" });
  }

  function onPlot(seat, plotIndex) {
    if (msg.hold === "result") {
      ackHarvestNext();
      return;
    }
    if (msg.hold === "season" || msg.hold === "intro" || msg.hold === "mix" || msg.hold === "trail" || msg.hold === "honor") return;
    cropPeek = null;
    if (selectedMarket != null && msg.board.players.find((p) => p.seat === seat)?.isYou) {
      const action = plotAction(selectedMarket, plotIndex);
      if (action) {
        const { label: _l, ...payload } = action;
        sendAction(payload);
        return;
      }
    }
    if (selectedMarket != null) return;
    const player = msg.board.players.find((p) => p.seat === seat);
    const plot = player?.plots[plotIndex];
    if (!plot || plot.kind === "unowned") {
      peek = null;
      render();
      return;
    }
    peek = peek && peek.seat === seat && peek.index === plotIndex ? null : { seat, index: plotIndex };
    render();
  }

  function onPass() {
    if (selectedMarket != null || cursePick) {
      selectedMarket = null;
      cursePick = false;
      render();
      return;
    }
    sendAction({ type: "pass" });
  }

  function onClick(el) {
    const act = el.getAttribute("data-act");
    if (act === "tab-play") { tab = "play"; render(); }
    if (act === "tab-record") { tab = "record"; render(); }
    if (act === "learn") {
      learn = !learn;
      localStorage.setItem(LEARN_KEY, learn ? "1" : "0");
      render();
    }
    if (act === "pass") onPass();
    if (act === "next") send({ type: "next" });
    if (act === "curse") {
      if (selectedMarket != null) selectedMarket = null;
      cursePick = !cursePick;
      cropPeek = null;
      peek = null;
      render();
      return;
    }
    if (act === "curse-crop") {
      const cropId = el.getAttribute("data-id");
      if (cropId) sendAction({ type: "curse", cropId });
      return;
    }
    if (act === "market") onMarket(Number(el.getAttribute("data-i")));
    if (act === "plot") onPlot(Number(el.getAttribute("data-seat")), Number(el.getAttribute("data-i")));
    if (act === "crop") {
      const i = Number(el.getAttribute("data-i"));
      cropPeek = cropPeek === i ? null : i;
      peek = null;
      render();
    }
    if (act === "close-peek") { peek = null; render(); }
    if (act === "close-crop") { cropPeek = null; render(); }
  }

  app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || !app.contains(el)) return;
    onClick(el);
  });

  function chrome(board, view) {
    const title = board
      ? `S${view.season}/${view.seasonCount}  R${view.round}/${view.lastRound}`
      : "ロビー";
    const sub = youName ? `${youName}（席${youSeat}）` : "";
    return `<header class="chrome">
      <div>
        <h1>${esc(title)}</h1>
        <div class="sub">${esc(sub)}${board ? "　" + esc(board.phaseLine) : ""}</div>
      </div>
      <div class="tools">
        <button type="button" data-act="learn" ${learn ? 'aria-current="true"' : ""}>${learn ? "学習ON" : "学習OFF"}</button>
      </div>
      <nav class="tabs">
        <button type="button" data-act="tab-play" ${tab === "play" ? 'aria-current="true"' : ""}>手番</button>
        <button type="button" data-act="tab-record" ${tab === "record" ? 'aria-current="true"' : ""}>記録</button>
      </nav>
    </header>
    <div class="err">${esc(errText)}</div>`;
  }

  function eventHtml() {
    const cards = eventCards();
    const inner = cards.map((e) => {
      const hidden = e.kind === "curse-hidden";
      const sign = hidden ? "" : e.delta > 0 ? "plus" : e.delta < 0 ? "minus" : "";
      const d = hidden ? "？" : e.delta > 0 ? `+${e.delta}` : `${e.delta}`;
      const who = e.bySeat != null ? nameOfSeat(e.bySeat) : "";
      const fullName = hidden ? (who || "伏せ") : e.cropName;
      const shortName = hidden ? (who || "伏せ") : (e.shortName || e.cropName);
      return `<article class="event${e.live ? "" : " preview"}${e.zone === "呪い" ? " curse" : ""}${hidden ? " hidden" : ""}">
        <div class="zone">${esc(e.zone)} ${esc(e.span || `R${e.from}-${e.to}`)}</div>
        <div class="name name-full">${esc(fullName)}</div>
        <div class="name name-short">${esc(shortName)}</div>
        <div class="delta ${sign}">${d}</div>
      </article>`;
    }).join("");
    const deck = msg.view.eventDeckCount;
    return `<div class="events">${inner}<div class="deck"><span class="lab">山</span><span class="n">${deck}</span></div></div>`;
  }

  function miniHtml(player, plot, coins, plantable, harvestHit) {
    const sel = plantable || harvestHit || (peek && peek.seat === player.seat && peek.index === plot.index);
    const cpu = cpuShow();
    const dim = (selectedMarket != null && !plantable)
      || (cpu && cpu.plotIndex != null && !(cpu.seat === player.seat && cpu.plotIndex === plot.index));
    const cls = [
      "mini",
      !plot.owned || plot.kind === "cooldown" || plot.kind === "ready" ? "dash" : "",
      sel ? "sel" : "",
      dim ? "dim" : "",
    ].filter(Boolean).join(" ");
    let body = "";
    if (!plot.owned) {
      const owned = player.plots.filter((p) => p.owned).length;
      const next = player.plots.find((p) => !p.owned);
      const cost = landCosts()[owned] ?? "";
      const label = next && next.index === plot.index ? `次 ${cost}G` : "—";
      body = `<div class="nm">${label}</div>`;
    } else if (plot.kind === "ready") {
      body = `<div class="nm">${esc(plot.shortName)}</div><div class="inc">${plot.base}/${plot.floor}</div><div class="pip">空</div>`;
    } else if (plot.kind === "wait") {
      body = `<div class="nm">${esc(plot.shortName)}</div><div class="inc">${plot.base}/${plot.floor}</div>
        <div class="pip">待 ${pips(plot.white, "○")}</div>`;
    } else if (plot.kind === "harvest") {
      body = `<div class="nm">${esc(plot.shortName)}</div><div class="inc">${plot.base}/${plot.floor}</div>
        <div class="pip">収 ${pips(plot.green, "★")}</div>`;
    } else if (plot.kind === "cooldown") {
      body = `<div class="nm">${esc(plot.shortName)}</div>
        <div class="pip">休 ${pips(plot.red, "▼")}</div>`;
    }
    let overlay = "";
    if (peek && peek.seat === player.seat && peek.index === plot.index) {
      overlay = `<div class="overlay" data-act="close-peek">
        <b>${esc(plot.cropName || plot.title)}</b>
        ${plot.spec ? `<div>${esc(plot.spec)}</div>` : ""}
        <div>${esc(plot.status)}</div>
      </div>`;
    }
    if (harvestHit) {
      const tone = harvestHit.tone || "";
      overlay = `<div class="figure ${esc(tone)}">${esc(harvestHit.figure || String(harvestHit.gain))}</div>`;
    }
    return `<button type="button" class="${cls}" data-act="plot" data-seat="${player.seat}" data-i="${plot.index}">${body}${overlay}</button>`;
  }

  function lastSeasonScores() {
    const sheet = msg.scoreSheet || [];
    const last = sheet[sheet.length - 1] || [];
    const map = new Map();
    for (const p of msg.board.players) {
      map.set(p.seat, last[p.seat] ?? p.coins);
    }
    return map;
  }

  function matchTotals() {
    const sheet = msg.scoreSheet || [];
    const map = new Map();
    for (const p of msg.board.players) {
      map.set(p.seat, sheet.reduce((n, row) => n + (row[p.seat] ?? 0), 0));
    }
    return map;
  }

  function whoCard(player, coins, opts = {}) {
    const you = player.isYou ? " you" : "";
    const honor = (msg.honorSeats || []).includes(player.seat) ? " honor" : "";
    const recap = !!opts.recapMarks;
    const cpu = cpuShow();
    const actingNow = cpu ? cpu.seat === player.seat : player.isActing;
    const acting = actingNow ? " acting" : "";
    const crown = !recap && (msg.crownSeats || []).includes(player.seat)
      ? `<span class="crown" title="これまでの獲得コイン首位">👑</span>`
      : "";
    const curse = player.curseReady
      ? `<span class="curse-mark" title="呪いの権利">👿</span>`
      : "";
    const g = coins.get(player.seat) ?? player.coins;
    const total = opts.totals ? opts.totals.get(player.seat) : undefined;
    const isBest = opts.bestSeason != null && g === opts.bestSeason;
    const peace = recap && isBest && opts.bestSeason !== opts.worstSeason
      ? `<span class="peace-mark" title="今シーズン最多">✌️</span>`
      : "";
    const shock = recap && opts.worstSeason != null && g === opts.worstSeason && opts.bestSeason !== opts.worstSeason
      ? `<span class="shock-mark" title="今シーズン最少">😱</span>`
      : "";
    let gHtml = `${g}G`;
    if (total != null) {
      gHtml = `<span class="season-g${isBest ? " best" : ""}">${g}G</span><span class="g-arrow"> → </span><span class="total-g">${total}G</span>`;
    }
    return `<div class="who${you}${acting}${honor}"><div class="id">${esc(displayName(player))}${player.isYou ? "*" : ""}${crown}${peace}${shock}${curse}</div><div class="g">${gHtml}</div></div>`;
  }

  function endWhoCard(player, recapMarks = true) {
    const season = lastSeasonScores();
    const totals = matchTotals();
    const scores = [...season.values()];
    const bestSeason = scores.length ? Math.max(...scores) : null;
    const worstSeason = scores.length ? Math.min(...scores) : null;
    return whoCard(player, season, { totals, bestSeason, worstSeason, recapMarks });
  }

  function seatsHtml() {
    const coins = shownCoins();
    return `<aside class="seats">${msg.board.players.map((p) => whoCard(p, coins)).join("")}</aside>`;
  }

  function landCosts() {
    return msg.view?.mode === "advanced" ? [0, 1, 2, 4, 8, 16] : [0, 1, 2, 4, 8];
  }

  function farmsHtml() {
    const coins = shownCoins();
    const walk = msg.hold === "result" && (harvestPhase === "walk" || harvestPhase === "done")
      ? harvestWalk()
      : [];
    const shown = harvestPhase === "done" ? walk.length - 1 : harvestStep;
    return `<div class="farms">${msg.board.players.map((p) => {
      return `<div class="farm" style="--plots:${p.plots.length}">
        ${whoCard(p, coins)}
        ${p.plots.map((plot) => {
          const cpu = cpuShow();
          const plantable = (selectedMarket != null && p.isYou && !!plotAction(selectedMarket, plot.index))
            || !!(cpu && cpu.seat === p.seat && cpu.plotIndex === plot.index);
          const harvestHit = walk.find((h, i) => i <= shown && h.seat === p.seat && h.plotIndex === plot.index) || null;
          return miniHtml(p, plot, coins, plantable, harvestHit);
        }).join("")}
      </div>`;
    }).join("")}</div>`;
  }

  function marketHtml() {
    const cards = msg.board.market || [];
    const isTurn = msg.view.actingSeat === youSeat && !msg.hold;
    const cpu = cpuShow();
    const items = cards.map((c, i) => {
      const dim = !c.enabled && !(cpu && cpu.marketIndex === i);
      const sel = selectedMarket === i || (cpu && cpu.marketIndex === i);
      const wait = pipLine("待", c.wait, "○", "なし");
      const harv = pipLine("収", c.harvest, "★");
      const cool = c.cooldown ? pipLine("休", c.cooldown, "△") : "休 なし";
      let assist = "";
      if (learn && sel && isTurn) {
        const lines = [c.harvestOutlook, ...(c.eventLines || [])].filter(Boolean);
        assist = `<div class="overlay"><b>学習</b>${lines.map((ln) => `<div>${esc(ln)}</div>`).join("")}</div>`;
      }
      return `<button type="button" class="market-card${dim ? " dim" : ""}${sel ? " sel" : ""}" data-act="market" data-i="${i}" ${!isTurn || dim ? "disabled" : ""}>
        <div class="head"><b>${esc(c.cropName)}</b><span class="cost">${c.cost}G</span></div>
        <div class="stat">${esc(wait)}</div>
        <div class="stat">${esc(harv)}</div>
        <div class="stat">${esc(cool)}</div>
        <div class="stat">基本${c.base}　最低${c.floor}</div>
        ${dim ? `<div class="type">所持不足または不可</div>` : ""}
        ${assist}
      </button>`;
    }).join("");
    const passLabel = selectedMarket != null || cursePick ? "キャンセル" : "パス";
    const pass = isTurn
      ? `<button type="button" class="pass" data-act="pass">${passLabel}</button>`
      : `<button type="button" class="pass" disabled>待ち</button>`;
    const canCurse = isTurn && (msg.actions || []).some((a) => a.type === "curse");
    const curseBtn = canCurse
      ? `<button type="button" class="curse-btn${cursePick ? " sel" : ""}" data-act="curse">${cursePick ? "作物を選ぶ" : "呪い"}</button>`
      : "";
    return `<div class="market">${items}${pass}${curseBtn}</div>`;
  }

  function honorLine() {
    const seats = msg.honorSeats || [];
    if (!seats.length || !msg.board) return "";
    const names = seats.map((seat) => {
      const p = msg.board.players.find((x) => x.seat === seat);
      return p ? displayName(p) : `席${seat}`;
    }).join("、");
    if (msg.honorKind === "match") return `<p class="honor-line">総合優勝　${esc(names)}</p>`;
    if (msg.honorKind === "season") return `<p class="honor-line">今シーズン 1位　${esc(names)}</p>`;
    return "";
  }

  function actionPackRanges(lastRound) {
    const out = [];
    for (let from = 1; from <= lastRound; from += 3) {
      out.push({ from, to: Math.min(from + 2, lastRound) });
    }
    return out;
  }

  function shortActionLabel(label) {
    return label.length > 3 ? label.slice(0, 3) : label;
  }

  function seasonEndHtml() {
    const rows = msg.seasonLog || [];
    const last = msg.view.lastRound || Math.max(0, ...rows.map((r) => r.cells.length));
    const ranges = actionPackRanges(last);
    const head = `<div class="end-ph"></div>${ranges.map((r) => {
      const label = r.from === r.to ? `R${r.from}` : `R${r.from}-${r.to}`;
      return `<div class="act-pack-h">${label}</div>`;
    }).join("")}`;
    const body = rows.map((row) => {
      const p = msg.board.players.find((x) => x.seat === row.seat);
      const who = p ? endWhoCard(p) : `<div class="who"><div class="id">席${row.seat}</div></div>`;
      const packs = ranges.map((r, pi) => {
        const cells = row.cells.slice(r.from - 1, r.to);
        const nodes = cells.map((v, ni) => {
          const round = r.from + ni;
          const pass = v === "パス" ? " is-pass" : "";
          return `<div class="act-node${pass}"><span class="rn">${round}</span>${esc(shortActionLabel(v))}</div>`;
        }).join("");
        return `<div class="act-pack count-${cells.length}" style="--i:${pi}">${nodes}</div>`;
      }).join("");
      return `${who}${packs}`;
    }).join("");
    const next = `<button type="button" class="next" data-act="next" ${msg.acked ? "disabled" : ""}>${msg.acked ? "確認済み" : "次へ"}</button>`;
    return `<div class="end-log">
      ${honorLine()}
      <div class="end-scroll">
        <div class="end-grid" style="--packs:${ranges.length}">${head}${body}</div>
      </div>
      ${next}
    </div>`;
  }

  const MIX_COLORS = ["#c45c26", "#2e6b3a", "#1e4f86", "#6b3d8a"];

  function cropOrder() {
    return (msg.board.cropsInGame || []).map((c) => c.shortName || c.name);
  }

  function mixColor(label, order) {
    if (label === "パス") return "#c8c8c8";
    const i = order.indexOf(label);
    return MIX_COLORS[i >= 0 ? i % MIX_COLORS.length : 0];
  }

  function mixShares(cells, order) {
    const counts = new Map();
    for (const c of cells) counts.set(c, (counts.get(c) || 0) + 1);
    const out = [];
    for (const label of order) {
      const n = counts.get(label);
      if (n) out.push({ label, count: n, pass: false });
    }
    for (const [label, n] of counts) {
      if (label === "パス" || order.includes(label)) continue;
      out.push({ label, count: n, pass: false });
    }
    if (counts.get("パス")) out.push({ label: "パス", count: counts.get("パス"), pass: true });
    return out;
  }

  function mixHtml() {
    const rows = msg.seasonLog || [];
    const order = cropOrder();
    const total = Math.max(1, msg.view.lastRound || 0);
    const body = rows.map((row, ri) => {
      const p = msg.board.players.find((x) => x.seat === row.seat);
      const who = p ? endWhoCard(p) : `<div class="who"><div class="id">席${row.seat}</div></div>`;
      const shares = mixShares(row.cells, order);
      const segs = shares.map((s) => {
        const pct = (s.count / total) * 100;
        const text = pct >= 8 ? `${esc(shortActionLabel(s.label))} ${s.count}` : "";
        return `<div class="mix-seg${s.pass ? " pass" : ""}" style="width:${pct}%;background:${mixColor(s.label, order)}" title="${esc(s.label)} ${s.count}">${text}</div>`;
      }).join("");
      return `<div class="mix-row" style="--i:${ri}">${who}<div class="mix-bar">${segs}</div></div>`;
    }).join("");
    const legendItems = [...order.map((label, i) => ({ label, color: MIX_COLORS[i % MIX_COLORS.length] })), { label: "パス", color: "#c8c8c8" }];
    const legend = legendItems.map((item) =>
      `<span class="mix-key"><i class="mix-swatch" style="background:${item.color}"></i>${esc(shortActionLabel(item.label))}</span>`
    ).join("");
    const next = `<button type="button" class="next" data-act="next" ${msg.acked ? "disabled" : ""}>${msg.acked ? "確認済み" : "次へ"}</button>`;
    return `<div class="end-log">
      ${honorLine()}
      <p class="mix-head">今シーズンの手</p>
      <div class="mix-list">${body}</div>
      <div class="mix-legend">${legend}</div>
      ${next}
    </div>`;
  }

  const TRAIL_COLORS = ["#c45c26", "#2e6b3a", "#1e4f86", "#6b3d8a", "#b45309"];

  function trailHtml() {
    const layout = msg.trail;
    const n = msg.view.seasonCount || (msg.scoreSheet || []).length;
    const next = `<button type="button" class="next" data-act="next" ${msg.acked ? "disabled" : ""}>${msg.acked ? "確認済み" : "次へ"}</button>`;
    if (!layout || !layout.series) {
      return `<div class="end-log trail-pane">
        <p class="trail-kicker">${n}シーズン完了</p>
        <p class="trail-head">ゲーム終了</p>
        ${next}
      </div>`;
    }
    const winners = new Set(msg.matchWinnerSeats || []);
    const lines = layout.series.map((s) => {
      const color = TRAIL_COLORS[s.seat % TRAIL_COLORS.length];
      const thick = winners.has(s.seat);
      const pts = (s.points || []).map((pt) => `${pt.x},${pt.y}`).join(" ");
      const line = (s.points || []).length > 1
        ? `<polyline fill="none" stroke="${color}" stroke-width="${thick ? 2.8 : 1.6}" stroke-linejoin="round" stroke-linecap="round" points="${pts}" />`
        : "";
      const dots = (s.points || []).map((pt) =>
        `<circle cx="${pt.x}" cy="${pt.y}" r="${thick ? 4 : 3}" fill="${color}" />` +
        `<text class="trail-val" x="${pt.x}" y="${pt.y - 8}" text-anchor="middle">${pt.total}</text>`
      ).join("");
      return `${line}${dots}`;
    }).join("");
    const xLabels = (layout.xLabels || []).map((l) =>
      `<text class="trail-x" x="${l.x}" y="${l.y}" text-anchor="middle">${esc(l.label)}</text>`
    ).join("");
    const legend = layout.series.map((s) => {
      const p = msg.board.players.find((x) => x.seat === s.seat);
      const color = TRAIL_COLORS[s.seat % TRAIL_COLORS.length];
      return `<span class="mix-key"><i class="mix-swatch" style="background:${color}"></i>${esc(p ? displayName(p) : `席${s.seat}`)}</span>`;
    }).join("");
    return `<div class="end-log trail-pane">
      <p class="trail-kicker">${n}シーズン完了</p>
      <p class="trail-head">ゲーム終了</p>
      <svg class="trail-svg" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="各シーズン終了時点の総合点">${lines}${xLabels}</svg>
      <div class="mix-legend">${legend}</div>
      ${next}
    </div>`;
  }

  function honorHtml() {
    const board = msg.board;
    const totals = matchTotals();
    const ranked = board.players.slice().sort((a, b) => (totals.get(b.seat) ?? 0) - (totals.get(a.seat) ?? 0));
    const cards = ranked.map((p) => endWhoCard(p, false)).join("");
    const again = msg.acked
      ? `<button type="button" class="next" disabled>確認済み（${msg.ackGot}/${msg.ackNeed}）</button>`
      : `<button type="button" class="next" data-act="next">${msg.ackNeed > 1 ? `もう一度（${msg.ackGot}/${msg.ackNeed}）` : "もう一度"}</button>`;
    return `<div class="end-log honor-pane">
      ${honorLine()}
      <div class="honor-seats">${cards}</div>
      ${again}
    </div>`;
  }

  function harvestOverlay() {
    if (msg.hold !== "result") return "";
    const empty = harvestPhase === "empty";
    const waitNext = harvestPhase === "done" || harvestPhase === "empty";
    const walking = harvestPhase === "walk" || harvestPhase === "banner";
    const title = empty ? "収穫なし" : "収穫タイム";
    const sub = empty ? "<p>今ラウンドは誰も収穫しませんでした。</p>" : "";
    const next = waitNext
      ? (msg.acked
        ? `<div class="muted harvest-next">確認済み（${msg.ackGot}/${msg.ackNeed}）</div>`
        : `<button type="button" class="next harvest-next" data-act="next">次へ</button>`)
      : "";
    const cls = [
      "harvest-overlay",
      waitNext ? "is-wait" : "",
      walking ? "is-walk" : "",
    ].filter(Boolean).join(" ");
    return `<div class="${cls}" data-act="next">
      <div class="harvest-dialog-box">
        <p class="title">${title}</p>
        ${sub}
      </div>
      ${next}
    </div>`;
  }

  function cropStats(c) {
    return {
      wait: pipLine("待", c.wait, "○", "なし"),
      harv: pipLine("収", c.harvest, "★"),
      cool: c.cooldown ? pipLine("休", c.cooldown, "△") : "休 なし",
    };
  }

  function cropFullInner(c) {
    const s = cropStats(c);
    return `<div class="head"><b>${esc(c.name)}</b><span class="cost">${c.cost}G</span></div>
      <div class="stat">${esc(s.wait)}</div>
      <div class="stat">${esc(s.harv)}</div>
      <div class="stat">${esc(s.cool)}</div>
      <div class="stat">基本${c.base}　最低${c.floor}</div>
      <div class="type">${esc(c.typeLabel)}</div>
      <p class="blurb">${esc(c.blurb)}</p>`;
  }

  function seasonCropsHtml() {
    const crops = msg.board.cropsInGame || [];
    if (!crops.length) return "";
    const curseIds = new Set((msg.actions || []).filter((a) => a.type === "curse").map((a) => a.cropId));
    return `<div class="season-crops">${crops.map((c, i) => {
      const open = cropPeek === i;
      const taken = cursePick && !curseIds.has(c.id);
      const cpuCurse = cpuShow() && cpuShow().cropId === c.id;
      const overlay = open && !cursePick
        ? `<div class="overlay crop-full ${i < 2 ? "left" : "right"}" data-act="close-crop">${cropFullInner(c)}</div>`
        : "";
      const act = cursePick ? (taken ? "noop" : "curse-crop") : "crop";
      return `<button type="button" class="crop-mini${open || cpuCurse || (cursePick && !taken) ? " sel" : ""}${cursePick && !taken ? " curse-pick" : ""}${taken ? " dim" : ""}" data-act="${act}" data-i="${i}" data-id="${esc(c.id)}">
        <div class="head"><b>${esc(c.name)}</b><span class="cost">${c.cost}G</span></div>
        <div class="stat">${c.wait ? `待 ${pips(c.wait, "○")}` : "待 なし"}</div>
        <div class="stat">${taken ? "今シーズン対象済" : `収 ${pips(c.harvest, "★")} ${c.base}/${c.floor}`}</div>
        ${overlay}
      </button>`;
    }).join("")}</div>`;
  }

  function introPane() {
    const crops = msg.board.cropsInGame || [];
    const cards = crops.map((c) => `<article class="market-card intro-card">${cropFullInner(c)}</article>`).join("");
    const start = msg.acked
      ? `<button type="button" class="next" disabled>確認済み（${msg.ackGot}/${msg.ackNeed}）</button>`
      : `<button type="button" class="next" data-act="next">開始</button>`;
    const ready = (msg.view.curseReadySeats || []).map((seat) => {
      const p = msg.board.players.find((x) => x.seat === seat);
      return p ? displayName(p) : `席${seat}`;
    });
    const curseNote = ready.length
      ? `<p class="intro-curse">呪いの権利　${esc(ready.join("、"))}</p>`
      : "";
    return `<div class="intro">
      <p class="intro-head">今シーズンの作物</p>
      <div class="intro-cards">${cards}</div>
      ${curseNote}
      ${start}
    </div>`;
  }

  function playHtml() {
    const board = msg.board;
    const view = msg.view;
    if (!board || view.phase === "lobby") {
      return `<div class="lobby">${esc(view.message || "接続待ち…")}</div>`;
    }
    if (msg.hold === "intro") {
      return `<div class="layout is-intro">
        ${seatsHtml()}
        ${introPane()}
      </div>`;
    }
    if (msg.hold === "season") {
      return `<div class="layout is-end">${seasonEndHtml()}</div>`;
    }
    if (msg.hold === "mix") {
      return `<div class="layout is-end">${mixHtml()}</div>`;
    }
    if (msg.hold === "trail") {
      return `<div class="layout is-end">${trailHtml()}</div>`;
    }
    if (msg.hold === "honor" || msg.over) {
      return `<div class="layout is-end">${honorHtml()}</div>`;
    }
    const right = msg.hold === "result" ? "" : `${marketHtml()}`;
    return `<div class="layout">
      ${harvestOverlay()}
      <section>${farmsHtml()}</section>
      <section class="hand">
        ${eventHtml()}
        ${seasonCropsHtml()}
        <div class="legend">待○　収★　休▼　基本/最低</div>
        ${right}
      </section>
    </div>`;
  }

  function recordHtml() {
    const view = msg.view;
    const board = msg.board;
    const sheet = msg.scoreSheet || [];
    const names = (board?.players || []).slice().sort((a, b) => a.seat - b.seat);
    let table = "<p class=\"muted\">得点はシーズン終了後</p>";
    if (sheet.length && names.length) {
      const head = ["", ...sheet.map((_, i) => `S${i + 1}`), "合計"].map((h) => `<th>${h}</th>`).join("");
      const rows = names.map((p) => {
        const cells = sheet.map((row) => `<td>${row[p.seat] ?? ""}</td>`).join("");
        const sum = sheet.reduce((n, row) => n + (row[p.seat] ?? 0), 0);
        const honored = (msg.honorSeats || []).includes(p.seat);
        const crown = (msg.crownSeats || []).includes(p.seat) || honored ? " 👑" : "";
        return `<tr${honored ? ' class="honor"' : ""}><td>${esc(p.name)}${crown}</td>${cells}<td>${sheet.length ? sum : ""}</td></tr>`;
      }).join("");
      table = `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    const crops = (board?.cropsInGame || []).map((c) => `<li>${esc(c.name)} ${esc(c.spec)}</li>`).join("");
    const discard = (board?.cropDiscardNames || []).join("、") || "なし";
    return `<section class="record">
      <h2>記録</h2>
      ${table}
      <p>作物山 ${view.cropDeckCount}（裏）　捨て ${esc(discard)}</p>
      <p>イベント山 ${view.eventDeckCount}（裏）　捨て ${(view.eventDiscard || []).length}　引いた数 ${view.drawnEventCount}</p>
      <h2>今ゲームの作物</h2>
      <ul>${crops}</ul>
      <p class="muted"><a href="/text">テキストUI</a></p>
    </section>`;
  }

  function render() {
    try {
      if (!msg) {
        app.innerHTML = `<p class="boot">接続中…</p>`;
        return;
      }
      const view = msg.view;
      const board = msg.board;
      const key = `${view.round}-${view.season}-${(msg.harvest || []).length}-${msg.hold}`;
      if (key !== harvestKey) {
        harvestKey = key;
        clearHarvestTimers();
        harvestStep = -1;
        harvestPhase = "idle";
        if (msg.hold === "result") {
          if (harvestWalk().length === 0) harvestPhase = "empty";
          else {
            harvestPhase = "banner";
            queueHarvest(beginHarvestWalk, 1000);
          }
        }
      }
      if (view.actingSeat !== youSeat) {
        selectedMarket = null;
        cursePick = false;
      }
      if (!(msg.actions || []).some((a) => a.type === "curse")) cursePick = false;
      app.innerHTML = chrome(board, view) + (tab === "record" ? recordHtml() : playHtml());
    } catch (e) {
      console.error(e);
      errText = e instanceof Error ? e.message : String(e);
      app.innerHTML = `<p class="boot">描画エラー: ${esc(errText)}</p>`;
    }
  }

  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === "assigned") {
      youSeat = data.seat;
      youName = data.name;
      return;
    }
    if (data.type === "error") {
      errText = data.message;
      render();
      return;
    }
    if (data.type === "view") {
      errText = "";
      msg = data;
      if (data.view?.actingSeat === youSeat) {
        /* keep selection only if the same market still exists */
        if (selectedMarket != null && !data.board?.market?.[selectedMarket]) selectedMarket = null;
      } else {
        selectedMarket = null;
      }
      render();
    }
  };
  ws.onclose = () => {
    errText = "切断しました";
    render();
  };
})();
