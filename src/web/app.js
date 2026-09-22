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
  let harvestStep = -1;
  let harvestKey = "";
  let harvestPhase = "idle";
  let harvestTimers = [];
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
    return events;
  }

  function displayName(p) {
    if (p.isYou) return "あなた";
    return p.name.replace("プレイヤー", "P");
  }

  function onMarket(index) {
    const card = msg.board.market[index];
    if (!card || !card.enabled) return;
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
    if (msg.hold === "season" || msg.hold === "intro") return;
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
    if (selectedMarket != null) {
      selectedMarket = null;
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
    if (act === "market") onMarket(Number(el.getAttribute("data-i")));
    if (act === "plot") onPlot(Number(el.getAttribute("data-seat")), Number(el.getAttribute("data-i")));
    if (act === "close-peek") { peek = null; render(); }
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
      const sign = e.delta > 0 ? "plus" : e.delta < 0 ? "minus" : "";
      const d = e.delta > 0 ? `+${e.delta}` : `${e.delta}`;
      return `<article class="event${e.live ? "" : " preview"}">
        <div class="zone">${esc(e.zone)}</div>
        <div class="name">${esc(e.cropName)}</div>
        <div class="delta ${sign}">${d}</div>
        <div class="span">${esc(e.span || `R${e.from}-${e.to}`)}</div>
      </article>`;
    }).join("");
    return `<div class="events">${inner}<div class="deck">山${msg.view.eventDeckCount}</div></div>`;
  }

  function miniHtml(player, plot, coins, plantable, harvestHit) {
    const sel = plantable || harvestHit || (peek && peek.seat === player.seat && peek.index === plot.index);
    const dim = selectedMarket != null && !plantable;
    const cls = [
      "mini",
      !plot.owned || plot.kind === "cooldown" ? "dash" : "",
      sel ? "sel" : "",
      dim ? "dim" : "",
    ].filter(Boolean).join(" ");
    let body = "";
    if (!plot.owned) {
      const owned = player.plots.filter((p) => p.owned).length;
      const next = player.plots.find((p) => !p.owned);
      const cost = [0, 1, 2, 3, 4][owned] ?? "";
      const label = next && next.index === plot.index ? `次 ${cost}G` : "—";
      body = `<div class="nm">${label}</div>`;
    } else if (plot.kind === "ready") {
      body = `<div class="nm">${esc(plot.shortName)}</div><div class="inc">${plot.base}/${plot.floor}</div><div class="pip">空</div>`;
    } else if (plot.kind === "wait") {
      body = `<div class="nm">${esc(plot.shortName)}</div><div class="inc">${plot.base}/${plot.floor}</div>
        <div class="pip">待 ${pips(plot.white, "○")} ${plot.white}</div>
        <div class="pip future">収 ${pips(plot.harvest, "☆")}</div>
        ${plot.cooldown ? `<div class="pip future">休 ${pips(plot.cooldown, "▽")}</div>` : ""}`;
    } else if (plot.kind === "harvest") {
      body = `<div class="nm">${esc(plot.shortName)}</div><div class="inc">${plot.base}/${plot.floor}</div>
        <div class="pip">収 ${pips(plot.green, "★")} ${plot.green}</div>
        ${plot.cooldown ? `<div class="pip future">休 ${pips(plot.cooldown, "▽")}</div>` : ""}`;
    } else if (plot.kind === "cooldown") {
      body = `<div class="nm">${esc(plot.shortName)}</div>
        <div class="pip">休 ${pips(plot.red, "▼")} ${plot.red}</div>`;
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

  function farmsHtml() {
    const coins = shownCoins();
    const walk = msg.hold === "result" && (harvestPhase === "walk" || harvestPhase === "done")
      ? harvestWalk()
      : [];
    const shown = harvestPhase === "done" ? walk.length - 1 : harvestStep;
    return `<div class="farms">${msg.board.players.map((p) => {
      const acting = p.isActing ? " acting" : "";
      const you = p.isYou ? " you" : "";
      const g = coins.get(p.seat) ?? p.coins;
      return `<div class="farm">
        <div class="who${you}${acting}"><div class="id">${esc(displayName(p))}${p.isYou ? "*" : ""}</div><div class="g">${g}G${p.isActing ? " 手番" : ""}</div></div>
        ${p.plots.map((plot) => {
          const plantable = selectedMarket != null && p.isYou && !!plotAction(selectedMarket, plot.index);
          const harvestHit = walk.find((h, i) => i <= shown && h.seat === p.seat && h.plotIndex === plot.index) || null;
          return miniHtml(p, plot, coins, plantable, harvestHit);
        }).join("")}
      </div>`;
    }).join("")}</div>`;
  }

  function marketHtml() {
    const cards = msg.board.market || [];
    const isTurn = msg.view.actingSeat === youSeat && !msg.hold;
    const items = cards.map((c, i) => {
      const dim = !c.enabled;
      const sel = selectedMarket === i;
      const wait = pipLine("待", c.wait, "○", "なし");
      const harv = pipLine("収", c.harvest, "★");
      const cool = c.cooldown ? pipLine("休", c.cooldown, "△") : "休 なし";
      let assist = "";
      if (learn && sel && isTurn) {
        const lines = [c.harvestOutlook, ...(c.eventLines || [])].filter(Boolean);
        assist = `<div class="overlay"><b>学習</b>${lines.map((ln) => `<div>${esc(ln)}</div>`).join("")}</div>`;
      }
      return `<button type="button" class="market-card${dim ? " dim" : ""}${sel ? " sel" : ""}" data-act="market" data-i="${i}" ${dim ? "disabled" : ""}>
        <div class="head"><b>${esc(c.cropName)}</b><span class="cost">${c.cost}G</span></div>
        <div class="stat">${esc(wait)}</div>
        <div class="stat">${esc(harv)}</div>
        <div class="stat">${esc(cool)}</div>
        <div class="stat">基本${c.base}　最低${c.floor}</div>
        <div class="type">${esc(c.typeLabel)}${dim ? "　所持不足または不可" : ""}</div>
        ${assist}
      </button>`;
    }).join("");
    const passLabel = selectedMarket != null ? "キャンセル" : "パス";
    const pass = isTurn
      ? `<button type="button" class="pass" data-act="pass">${passLabel}</button>`
      : `<button type="button" class="pass" disabled>待ち</button>`;
    return `<div class="market">${items}${pass}</div>`;
  }

  function harvestPane() {
    if (harvestPhase !== "done" && harvestPhase !== "empty") return "";
    if (msg.acked) {
      return `<div class="harvest-bar"><div class="muted">確認済み（${msg.ackGot}/${msg.ackNeed}）</div></div>`;
    }
    return `<div class="harvest-bar">
      <button type="button" class="next" data-act="next">次へ</button>
    </div>`;
  }

  function introPane() {
    const crops = msg.board.cropsInGame || [];
    const cards = crops.map((c) => {
      const wait = pipLine("待", c.wait, "○", "なし");
      const harv = pipLine("収", c.harvest, "★");
      const cool = c.cooldown ? pipLine("休", c.cooldown, "△") : "休 なし";
      return `<article class="market-card intro-card">
        <div class="head"><b>${esc(c.name)}</b><span class="cost">${c.cost}G</span></div>
        <div class="stat">${esc(wait)}</div>
        <div class="stat">${esc(harv)}</div>
        <div class="stat">${esc(cool)}</div>
        <div class="stat">基本${c.base}　最低${c.floor}</div>
        <div class="type">${esc(c.typeLabel)}</div>
        <p class="blurb">${esc(c.blurb)}</p>
      </article>`;
    }).join("");
    const start = msg.acked
      ? `<button type="button" class="next" disabled>確認済み（${msg.ackGot}/${msg.ackNeed}）</button>`
      : `<button type="button" class="next" data-act="next">開始</button>`;
    return `<div class="intro">
      <p class="intro-head">今シーズンの作物</p>
      <div class="intro-cards">${cards}</div>
      ${start}
    </div>`;
  }

  function playHtml() {
    const board = msg.board;
    const view = msg.view;
    if (!board || view.phase === "lobby") {
      return `<div class="lobby">${esc(view.message || "接続待ち…")}</div>`;
    }
    const waiting = !msg.hold && view.actingSeat !== youSeat && view.phase === "turn";
    const actor = board.players.find((p) => p.isActing);
    const banner = msg.hold === "result" && harvestPhase === "banner"
      ? `<div class="harvest-banner" data-act="next">収穫タイム</div>`
      : msg.hold === "result" && harvestPhase === "empty"
        ? `<div class="harvest-dialog" data-act="next" role="dialog" aria-label="収穫なし">
            <div class="harvest-dialog-box">
              <p class="title">収穫なし</p>
              <p>今ラウンドは誰も収穫しませんでした。</p>
            </div>
          </div>`
        : "";
    const right = msg.hold === "intro"
      ? introPane()
      : msg.hold === "result"
        ? harvestPane()
        : msg.hold === "season" || msg.over
          ? `<div class="harvest-bar">${esc(view.message || "")}<button type="button" class="next" data-act="next" ${msg.acked ? "disabled" : ""}>${msg.acked ? "確認済み" : "次へ"}</button></div>`
          : waiting
            ? `<div class="waitbox">${esc(actor ? actor.name + " の手番…" : "待ち")}</div>`
            : `${marketHtml()}`;
    return `<div class="layout">
      ${banner}
      <section>${farmsHtml()}</section>
      <section class="hand">
        ${eventHtml()}
        <div class="legend">待○　収★　休▼　灰☆▽はこれから　基本/最低</div>
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
        const win = (msg.matchWinnerSeats || []).includes(p.seat) ? " ★" : "";
        return `<tr><td>${esc(p.name)}${win}</td>${cells}<td>${sheet.length ? sum : ""}</td></tr>`;
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
          harvestPhase = "banner";
          queueHarvest(beginHarvestWalk, 1000);
        }
      }
      if (view.actingSeat !== youSeat) selectedMarket = null;
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
