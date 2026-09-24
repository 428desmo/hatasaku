(() => {
  const lobbyRoot = document.getElementById("lobby-root");
  const play = window.HatasakuPlay;
  if (!lobbyRoot || !play) {
    console.error("online boot failed");
    return;
  }

  const DEVICE_KEY = "hatasaku-device-id";
  const NAME_KEY = "hatasaku-display-name";
  const SEAT_KEY = "hatasaku-online-seat";

  const params = new URLSearchParams(location.search);
  const urlCode = (params.get("code") || "").trim().toUpperCase();

  let ws = null;
  let deviceId = loadDeviceId();
  let displayName = localStorage.getItem(NAME_KEY) || "";
  let screen = "boot"; // boot | home | lobby | play
  let room = null;
  let errText = "";
  let joinCodeInput = urlCode;
  let reconnectTimer = null;
  let joinTick = null;
  /** Local draft so 1s countdown / lobby broadcasts do not wipe in-progress edits. */
  let settingsDraft = null;

  function loadDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (id && id.length >= 8) return id.slice(0, 64);
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().replaceAll("-", "")
        : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  }

  function loadSeatCreds() {
    try {
      const raw = localStorage.getItem(SEAT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.code || !parsed?.seatToken) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveSeatCreds(code, seatToken) {
    if (!code || !seatToken) return;
    localStorage.setItem(SEAT_KEY, JSON.stringify({ code, seatToken }));
  }

  function clearSeatCreds() {
    localStorage.removeItem(SEAT_KEY);
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  play.setSend((payload) => send(payload));
  play.setQuitHandler?.(() => {
    send({ type: "quit", deviceId });
  });

  function showHome() {
    screen = "home";
    room = null;
    settingsDraft = null;
    play.hide();
    lobbyRoot.hidden = false;
    renderLobby();
  }

  function showLobby() {
    screen = room ? "lobby" : "home";
    play.hide();
    lobbyRoot.hidden = false;
    renderLobby();
  }

  function showPlay(viewMsg) {
    screen = "play";
    lobbyRoot.hidden = true;
    play.show();
    const you = room?.members?.find((m) => m.isYou);
    const name =
      viewMsg.role === "observer"
        ? "観戦"
        : you?.displayName || displayName || (viewMsg.seat != null ? `席${viewMsg.seat}` : "");
    play.setYou(viewMsg.seat, name);
    play.applyView(viewMsg);
  }

  function formatMs(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function shareUrl(code) {
    const u = new URL(location.href);
    u.searchParams.set("code", code);
    return u.toString();
  }

  function readSettingsDraftFromDom() {
    const mode = document.getElementById("ol-mode");
    if (!mode) return null;
    return {
      mode: mode.value,
      playerCount: document.getElementById("ol-players")?.value,
      seasonCount: document.getElementById("ol-seasons")?.value,
      turnSec: document.getElementById("ol-turn")?.value,
    };
  }

  function settingsInputFocused() {
    const id = document.activeElement?.id;
    return id === "ol-mode" || id === "ol-players" || id === "ol-seasons" || id === "ol-turn";
  }

  function rememberSettingsDraft() {
    const draft = readSettingsDraftFromDom();
    if (draft) settingsDraft = draft;
  }

  function clearJoinTick() {
    if (joinTick != null) {
      clearInterval(joinTick);
      joinTick = null;
    }
  }

  function updateJoinWindowLabel() {
    const el = document.getElementById("ol-join-window");
    const cpu = document.getElementById("ol-cpu-note");
    if (!room || room.phase !== "lobby") return false;
    const members = room.members || [];
    const empty = Math.max(0, room.settings.playerCount - members.length);
    if (el) {
      el.textContent = room.joinOpen
        ? `入場あと ${formatMs(room.joinRemainingMs)}で締切（その後は新規参加不可）`
        : "入場窓終了（再接続のみ）";
    }
    if (cpu) {
      cpu.textContent = `空き ${empty} → 開始時は CPU が入ります（人間 ${members.length} / ${room.settings.playerCount}）`;
    }
    return !!(el || cpu);
  }

  function armJoinTick() {
    clearJoinTick();
    if (!room || room.phase !== "lobby") return;
    joinTick = setInterval(() => {
      if (!room || room.phase !== "lobby") {
        clearJoinTick();
        return;
      }
      const rem = Math.max(0, (room.joinRemainingMs || 0) - 1000);
      room = { ...room, joinRemainingMs: rem, joinOpen: rem > 0 };
      if (screen !== "lobby") return;
      if (settingsInputFocused()) rememberSettingsDraft();
      if (!updateJoinWindowLabel()) renderLobby();
    }, 1000);
  }

  function settingsValues() {
    const s = room?.settings;
    const d = settingsDraft;
    return {
      mode: d?.mode ?? s?.mode ?? "basic",
      playerCount: Number(d?.playerCount ?? s?.playerCount ?? 3),
      seasonCount: Number(d?.seasonCount ?? s?.seasonCount ?? 3),
      turnSec: Number(d?.turnSec ?? Math.round((s?.turnMs ?? 60000) / 1000)),
    };
  }

  function renderLobby() {
    if (screen === "play") return;
    const focusId = settingsInputFocused() ? document.activeElement.id : null;
    if (settingsInputFocused()) rememberSettingsDraft();

    if (screen === "boot") {
      lobbyRoot.innerHTML = `<p class="boot">接続中…</p><div class="err">${esc(errText)}</div>`;
      return;
    }

    if (screen === "home" || !room) {
      lobbyRoot.innerHTML = `
        <section class="lobby">
          <h1 class="lobby-title">畑作オンライン</h1>
          <p class="lobby-lead">友人とコードで卓を共有します。ログインは不要です。</p>
          <div class="err">${esc(errText)}</div>
          <label class="lobby-field">表示名
            <input id="ol-name" type="text" maxlength="16" value="${esc(displayName)}" placeholder="プレイヤー" />
          </label>
          <div class="lobby-actions">
            <button type="button" class="lobby-btn primary" data-ol="create">卓を作る</button>
          </div>
          <div class="lobby-join">
            <label class="lobby-field">参加コード
              <input id="ol-code" type="text" maxlength="8" value="${esc(joinCodeInput)}" placeholder="ABCDEF" autocomplete="off" />
            </label>
            <button type="button" class="lobby-btn" data-ol="join">参加する</button>
          </div>
          <p class="lobby-note">開始済みの卓コードでも入れます（元プレイヤーは復帰、それ以外は観戦）。</p>
          <p class="lobby-note">LAN単卓は <a href="/lan">/lan</a></p>
        </section>`;
      return;
    }

    const s = room.settings;
    const sv = settingsValues();
    const members = room.members || [];
    const empty = Math.max(0, s.playerCount - members.length);
    const leaderOnly = room.youAreLeader
      ? ""
      : `<p class="lobby-note">設定の変更と開始はリーダーだけできます。</p>`;
    const settingsBlock = room.youAreLeader
      ? `
      <div class="lobby-settings">
        <label class="lobby-field">モード
          <select id="ol-mode">
            <option value="basic" ${sv.mode === "basic" ? "selected" : ""}>基本</option>
            <option value="advanced" ${sv.mode === "advanced" ? "selected" : ""}>上級</option>
          </select>
        </label>
        <label class="lobby-field">人数（人間＋CPU）
          <select id="ol-players">
            ${[3, 4, 5].map((n) => `<option value="${n}" ${sv.playerCount === n ? "selected" : ""}>${n}</option>`).join("")}
          </select>
        </label>
        <label class="lobby-field">シーズン数
          <input id="ol-seasons" type="number" min="1" max="12" value="${sv.seasonCount}" />
        </label>
        <label class="lobby-field">手番制限（秒）
          <input id="ol-turn" type="number" min="10" max="600" step="5" value="${sv.turnSec}" />
        </label>
        <button type="button" class="lobby-btn" data-ol="save-settings">設定を反映</button>
      </div>`
      : `
      <dl class="lobby-readonly">
        <div><dt>モード</dt><dd>${s.mode === "advanced" ? "上級" : "基本"}</dd></div>
        <div><dt>人数</dt><dd>${s.playerCount}（空き ${empty} → 開始時CPU）</dd></div>
        <div><dt>シーズン</dt><dd>${s.seasonCount}</dd></div>
        <div><dt>手番制限</dt><dd>${Math.round(s.turnMs / 1000)}秒（人間2人以上のとき）</dd></div>
      </dl>`;

    const memberList = members
      .map((m) => {
        const tags = [
          m.isYou ? "あなた" : null,
          m.isLeader ? "リーダー" : null,
          m.connected ? null : "切断中",
        ]
          .filter(Boolean)
          .join("・");
        return `<li><strong>${esc(m.displayName)}</strong>${tags ? ` <span class="lobby-tag">${esc(tags)}</span>` : ""}</li>`;
      })
      .join("");

    lobbyRoot.innerHTML = `
      <section class="lobby">
        <h1 class="lobby-title">ロビー</h1>
        <p class="lobby-code">コード <strong>${esc(room.code)}</strong></p>
        <p class="lobby-share"><input readonly value="${esc(shareUrl(room.code))}" id="ol-share" /><button type="button" data-ol="copy">コピー</button></p>
        <p class="lobby-window" id="ol-join-window">${
          room.joinOpen
            ? `入場あと ${esc(formatMs(room.joinRemainingMs))}で締切（その後は新規参加不可）`
            : "入場窓終了（再接続のみ）"
        }</p>
        <p class="lobby-cpu-note" id="ol-cpu-note">空き ${empty} → 開始時は CPU が入ります（人間 ${members.length} / ${s.playerCount}）</p>
        <div class="err">${esc(errText)}</div>
        <h2 class="lobby-h2">参加者</h2>
        <ul class="lobby-members">${memberList || "<li>（なし）</li>"}</ul>
        <h2 class="lobby-h2">設定</h2>
        ${settingsBlock}
        ${leaderOnly}
        <div class="lobby-actions">
          ${
            room.youAreLeader
              ? `<button type="button" class="lobby-btn primary" data-ol="start">開始（空きはCPU）</button>
                 <button type="button" class="lobby-btn danger" data-ol="cancel">卓をキャンセル</button>`
              : `<button type="button" class="lobby-btn" data-ol="leave">ロビーを出る</button>`
          }
        </div>
      </section>`;

    if (focusId) {
      const el = document.getElementById(focusId);
      if (el && typeof el.focus === "function") {
        el.focus();
        if (el.tagName === "INPUT" && el.type === "number") {
          const v = el.value;
          el.value = "";
          el.value = v;
        }
      }
    }
  }

  function rememberNameFromInput() {
    const el = document.getElementById("ol-name");
    if (el) {
      displayName = el.value.trim().slice(0, 16);
      if (displayName) localStorage.setItem(NAME_KEY, displayName);
    }
  }

  function onLobbyClick(e) {
    const el = e.target.closest("[data-ol]");
    if (!el || !lobbyRoot.contains(el)) return;
    const act = el.getAttribute("data-ol");
    errText = "";

    if (act === "create") {
      rememberNameFromInput();
      send({ type: "create", deviceId, displayName: displayName || "プレイヤー" });
      return;
    }
    if (act === "join") {
      rememberNameFromInput();
      const codeEl = document.getElementById("ol-code");
      const code = (codeEl?.value || joinCodeInput || "").trim().toUpperCase();
      joinCodeInput = code;
      if (!code) {
        errText = "参加コードを入力してください";
        renderLobby();
        return;
      }
      send({ type: "join", deviceId, displayName: displayName || "プレイヤー", code });
      return;
    }
    if (act === "copy") {
      const input = document.getElementById("ol-share");
      if (input) {
        input.select();
        navigator.clipboard?.writeText(input.value).catch(() => {});
      }
      return;
    }
    if (act === "save-settings") {
      rememberSettingsDraft();
      const mode = document.getElementById("ol-mode")?.value;
      const playerCount = Number(document.getElementById("ol-players")?.value);
      const seasonCount = Number(document.getElementById("ol-seasons")?.value);
      const turnSec = Number(document.getElementById("ol-turn")?.value);
      settingsDraft = null;
      send({
        type: "lobby-settings",
        deviceId,
        settings: {
          mode,
          playerCount,
          seasonCount,
          turnMs: Math.round(turnSec * 1000),
        },
      });
      return;
    }
    if (act === "start") {
      settingsDraft = null;
      send({ type: "start", deviceId });
      return;
    }
    if (act === "cancel") {
      clearSeatCreds();
      settingsDraft = null;
      send({ type: "cancel", deviceId });
      return;
    }
    if (act === "leave") {
      clearSeatCreds();
      settingsDraft = null;
      send({ type: "leave", deviceId });
      return;
    }
  }

  lobbyRoot.addEventListener("click", onLobbyClick);
  lobbyRoot.addEventListener("input", (e) => {
    if (e.target && ["ol-mode", "ol-players", "ol-seasons", "ol-turn"].includes(e.target.id)) {
      rememberSettingsDraft();
    }
  });
  lobbyRoot.addEventListener("change", (e) => {
    if (e.target && ["ol-mode", "ol-players", "ol-seasons", "ol-turn"].includes(e.target.id)) {
      rememberSettingsDraft();
    }
  });

  function applyRoom(next) {
    room = next;
    if (next?.seatToken && next.code) saveSeatCreds(next.code, next.seatToken);
    armJoinTick();
  }

  function onMessage(data) {
    if (data.type === "welcome") {
      const creds = loadSeatCreds();
      const hello = { type: "hello", deviceId };
      if (creds) {
        hello.code = creds.code;
        hello.seatToken = creds.seatToken;
      }
      send(hello);
      return;
    }
    if (data.type === "hello-ok") {
      clearJoinTick();
      settingsDraft = null;
      if (data.reason === "room-expired") {
        clearSeatCreds();
        errText = "卓の有効期限（24時間）が切れました。";
      }
      if (data.reason === "quit") {
        const creds = loadSeatCreds();
        if (creds?.code) joinCodeInput = creds.code;
        clearSeatCreds();
      }
      showHome();
      if (urlCode && !loadSeatCreds() && data.reason !== "quit") {
        joinCodeInput = urlCode;
        renderLobby();
      }
      return;
    }
    if (data.type === "created" || data.type === "joined" || data.type === "rejoined") {
      if (data.seatToken && data.room?.code) saveSeatCreds(data.room.code, data.seatToken);
      settingsDraft = null;
      applyRoom(data.room);
      if (data.type === "rejoined") return;
      showLobby();
      return;
    }
    if (data.type === "observing") {
      applyRoom(data.room);
      return;
    }
    if (data.type === "lobby") {
      applyRoom(data.room);
      if (data.room?.phase === "playing") return;
      if (data.room?.phase === "ended") {
        clearSeatCreds();
        room = null;
        clearJoinTick();
        settingsDraft = null;
        showHome();
        return;
      }
      if (settingsInputFocused()) rememberSettingsDraft();
      else settingsDraft = null;
      showLobby();
      return;
    }
    if (data.type === "view") {
      applyRoom(data.room);
      showPlay(data);
      return;
    }
    if (data.type === "error") {
      errText = data.message || "error";
      if (screen === "play") play.setError(errText);
      else renderLobby();
    }
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(proto + "//" + location.host);
    ws.onopen = () => {
      errText = "";
      screen = "boot";
      renderLobby();
    };
    ws.onmessage = (ev) => {
      let data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }
      onMessage(data);
    };
    ws.onclose = () => {
      clearJoinTick();
      if (screen === "play") play.setError("切断しました。再接続します…");
      else {
        errText = "切断しました。再接続します…";
        screen = "boot";
        renderLobby();
      }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 1200);
    };
  }

  connect();
})();
