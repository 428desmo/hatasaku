import http from "node:http";
import os from "node:os";
import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { chooseById } from "../cpu/index.js";
import { getPublicView } from "../engine/index.js";
import { IllegalActionError, type Action } from "../engine/types.js";
import { CPU_STEP_MS, RoomHub, type Room, type RoomSettings } from "../session/room.js";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../../src/web");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const port = Number(arg("port", "8080"));
const hub = new RoomHub();

type Client = {
  ws: WebSocket;
  deviceId: string | null;
  roomCode: string | null;
  role: "player" | "observer" | null;
};

const clients = new Map<WebSocket, Client>();
const cpuTimers = new Map<string, ReturnType<typeof setTimeout>>();
const deadlines = new Map<string, { at: number; kind: "turn" | "hold"; timer: ReturnType<typeof setTimeout> }>();

type InMsg = {
  type?: string;
  deviceId?: string;
  displayName?: string;
  code?: string;
  seatToken?: string;
  settings?: Partial<RoomSettings> & { mode?: string };
  action?: Action;
};

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function packView(room: Room, seat: number, forDeviceId: string) {
  room.clearForceProxyIfTurnMoved();
  const table = room.table!;
  const packed = table.viewFor(seat);
  const member = room.members.find((m) => m.seat === seat)!;
  const forceProxy = member.forceProxy && table.state?.actingSeat === seat;
  const actions =
    packed.hold || forceProxy || room.paused
      ? []
      : packed.actions.map((a) => ({ ...a.action, label: a.label }));
  return {
    type: "view" as const,
    mode: "online" as const,
    role: "player" as const,
    room: room.snapshot(forDeviceId),
    seat,
    html: packed.html,
    text: packed.text,
    view: packed.view,
    board: packed.board,
    harvest: packed.harvest,
    lastPayouts: packed.lastPayouts,
    scoreSheet: packed.scoreSheet,
    matchWinnerSeats: packed.matchWinnerSeats,
    crownSeats: packed.crownSeats,
    honorSeats: packed.honorSeats,
    honorKind: packed.honorKind,
    seasonLog: packed.seasonLog,
    crops: packed.crops,
    trail: packed.trail,
    cpuShow: packed.cpuShow,
    seasonIntro: packed.seasonIntro,
    honorAnnounce: packed.honorAnnounce,
    finalRoundTip: packed.finalRoundTip,
    proxyNote: packed.proxyNote,
    actions,
    hold: packed.hold,
    acked: packed.acked,
    ackNeed: packed.ackNeed,
    ackGot: packed.ackGot,
    phase: packed.view.phase,
    over: table.matchOver,
    paused: room.paused,
    turnDeadline: room.paused ? null : (deadlines.get(room.code)?.at ?? null),
  };
}

function packObserve(room: Room, deviceId: string) {
  room.clearForceProxyIfTurnMoved();
  const table = room.table!;
  const packed = table.viewFor("spectator");
  return {
    type: "view" as const,
    mode: "online" as const,
    role: "observer" as const,
    room: room.snapshot(deviceId),
    seat: null,
    html: packed.html,
    text: packed.text,
    view: packed.view,
    board: packed.board,
    harvest: packed.harvest,
    lastPayouts: packed.lastPayouts,
    scoreSheet: packed.scoreSheet,
    matchWinnerSeats: packed.matchWinnerSeats,
    crownSeats: packed.crownSeats,
    honorSeats: packed.honorSeats,
    honorKind: packed.honorKind,
    seasonLog: packed.seasonLog,
    crops: packed.crops,
    trail: packed.trail,
    cpuShow: packed.cpuShow,
    seasonIntro: packed.seasonIntro,
    honorAnnounce: packed.honorAnnounce,
    finalRoundTip: packed.finalRoundTip,
    proxyNote: null,
    actions: [],
    hold: packed.hold,
    acked: false,
    ackNeed: packed.ackNeed,
    ackGot: packed.ackGot,
    phase: packed.view.phase,
    over: table.matchOver,
    paused: room.paused,
    turnDeadline: room.paused ? null : (deadlines.get(room.code)?.at ?? null),
  };
}

function stopRoomTimers(code: string): void {
  clearCpuTimer(code);
  clearDeadline(code);
}

function broadcastRoom(room: Room): void {
  room.clearForceProxyIfTurnMoved();
  for (const [ws, client] of clients) {
    if (client.roomCode !== room.code || !client.deviceId) continue;
    if (client.role === "observer" || room.observers.has(client.deviceId)) {
      if (room.phase === "playing" && room.table) send(ws, packObserve(room, client.deviceId));
      else send(ws, { type: "lobby", room: room.snapshot(client.deviceId) });
      continue;
    }
    const member = room.findByDevice(client.deviceId);
    if (!member || room.phase !== "playing" || member.seat === null || !room.table) {
      send(ws, { type: "lobby", room: room.snapshot(client.deviceId) });
      continue;
    }
    send(ws, packView(room, member.seat, client.deviceId));
  }
}

function clearCpuTimer(code: string): void {
  const t = cpuTimers.get(code);
  if (t != null) clearTimeout(t);
  cpuTimers.delete(code);
}

function clearDeadline(code: string): void {
  const d = deadlines.get(code);
  if (d) clearTimeout(d.timer);
  deadlines.delete(code);
}

function gcHub(): void {
  const removed = hub.gc();
  for (const code of removed) {
    stopRoomTimers(code);
    for (const c of clients.values()) {
      if (c.roomCode === code) {
        c.roomCode = null;
        c.role = null;
        if (c.deviceId) send(c.ws, { type: "hello-ok", deviceId: c.deviceId, reason: "room-expired" });
      }
    }
  }
}

function proxyHumanTurn(room: Room): void {
  if (room.paused) return;
  const table = room.table;
  if (!table?.state || table.hold) return;
  if (table.state.phase !== "turn" || table.state.actingSeat === null) return;
  const seat = table.state.actingSeat;
  const actor = table.state.players[seat];
  if (!actor || actor.kind !== "human") return;
  table.markTurnProxy(seat);
  const view = getPublicView(table.state, seat);
  const action = chooseById(table.config.cpuStrategyId, view, table.getCpuRng());
  try {
    table.applyFromSeat(seat, action);
  } catch {
    try {
      table.applyFromSeat(seat, { type: "pass" });
    } catch {
      /* ignore */
    }
  }
  table.markTurnProxy(seat);
  room.clearForceProxyIfTurnMoved();
  broadcastRoom(room);
  kickCpu(room);
}

function proxyHold(room: Room): void {
  if (room.paused) return;
  const table = room.table;
  if (!table?.hold) return;
  const pending: number[] = [];
  for (const m of room.members) {
    if (m.seat === null) continue;
    if (!table.acks.has(m.seat)) pending.push(m.seat);
  }
  for (const seat of pending) table.nextFromSeat(seat);
  table.markHoldProxy(pending);
  broadcastRoom(room);
  kickCpu(room);
}

function armDeadline(room: Room): void {
  clearDeadline(room.code);
  if (room.paused || !room.turnTimerApplies() || !room.table) return;
  const table = room.table;
  if (table.cpuShow) return;
  if (table.hold) {
    const at = Date.now() + room.settings.turnMs;
    const timer = setTimeout(() => {
      deadlines.delete(room.code);
      proxyHold(room);
    }, room.settings.turnMs);
    deadlines.set(room.code, { at, kind: "hold", timer });
    broadcastRoom(room);
    return;
  }
  if (table.state?.phase !== "turn" || table.state.actingSeat === null) return;
  const actor = table.state.players[table.state.actingSeat];
  if (!actor || actor.kind !== "human") return;
  const seat = table.state.actingSeat;
  // Away / quit-mid-turn seats: proxy on the same timer as everyone else.
  const at = Date.now() + room.settings.turnMs;
  const timer = setTimeout(() => {
    deadlines.delete(room.code);
    proxyHumanTurn(room);
  }, room.settings.turnMs);
  deadlines.set(room.code, { at, kind: "turn", timer });
  if (room.shouldProxySeat(seat)) {
    /* still show deadline so observers/remaining players see the countdown */
  }
  broadcastRoom(room);
}

function scheduleCpu(room: Room): void {
  if (room.paused || !room.table?.config.paceCpu) return;
  clearCpuTimer(room.code);
  cpuTimers.set(
    room.code,
    setTimeout(() => {
      cpuTimers.delete(room.code);
      if (!room.table || room.paused) return;
      const again = room.table.cpuTick();
      broadcastRoom(room);
      if (again) scheduleCpu(room);
      else armDeadline(room);
    }, CPU_STEP_MS),
  );
}

function kickCpu(room: Room): void {
  if (room.paused) {
    stopRoomTimers(room.code);
    broadcastRoom(room);
    return;
  }
  if (!room.table?.config.paceCpu) {
    armDeadline(room);
    return;
  }
  const again = room.table.cpuTick();
  broadcastRoom(room);
  if (again) scheduleCpu(room);
  else armDeadline(room);
}

function sendFile(res: http.ServerResponse, filePath: string): void {
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const type = MIME[extname(filePath)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(readFileSync(filePath));
}

const server = http.createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/" || path === "/index.html") {
    sendFile(res, join(webRoot, "online.html"));
    return;
  }
  if (path === "/lan" || path === "/lan.html") {
    sendFile(res, join(webRoot, "index.html"));
    return;
  }
  if (path === "/text" || path === "/text.html") {
    sendFile(res, join(webRoot, "text.html"));
    return;
  }
  if (path === "/app.css") {
    sendFile(res, join(webRoot, "app.css"));
    return;
  }
  if (path === "/app.js") {
    sendFile(res, join(webRoot, "app.js"));
    return;
  }
  if (path === "/online.js") {
    sendFile(res, join(webRoot, "online.js"));
    return;
  }
  if (path === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

function requireDevice(msg: InMsg): string {
  const id = msg.deviceId?.trim();
  if (!id || id.length < 8) throw new Error("deviceId required");
  return id.slice(0, 64);
}

function enterPlayingAsPlayer(ws: WebSocket, client: Client, room: Room, deviceId: string): void {
  const member = room.findByDevice(deviceId);
  if (!member || member.seat === null || !room.table) throw new Error("no seat");
  client.roomCode = room.code;
  client.role = "player";
  room.markConnected(deviceId);
  send(ws, packView(room, member.seat, deviceId));
  broadcastRoom(room);
  kickCpu(room);
}

function handleMessage(ws: WebSocket, msg: InMsg): void {
  const client = clients.get(ws);
  if (!client) return;
  gcHub();

  if (msg.type === "hello") {
    const deviceId = requireDevice(msg);
    client.deviceId = deviceId;
    const code = msg.code?.trim().toUpperCase();
    const seatToken = msg.seatToken?.trim();
    if (code && seatToken) {
      const room = hub.get(code);
      if (room) {
        const member = room.findBySeatToken(seatToken);
        if (member && member.deviceId === deviceId) {
          if (room.phase === "playing" && member.seat !== null && room.table) {
            enterPlayingAsPlayer(ws, client, room, deviceId);
            return;
          }
          client.roomCode = room.code;
          client.role = "player";
          room.markConnected(deviceId);
          send(ws, { type: "lobby", room: room.snapshot(deviceId) });
          return;
        }
      }
    }
    send(ws, { type: "hello-ok", deviceId });
    return;
  }

  if (msg.type === "create") {
    const deviceId = requireDevice(msg);
    client.deviceId = deviceId;
    const room = hub.create(msg.settings);
    const member = room.join(deviceId, msg.displayName ?? "プレイヤー");
    client.roomCode = room.code;
    client.role = "player";
    send(ws, { type: "created", seatToken: member.seatToken, room: room.snapshot(deviceId) });
    return;
  }

  if (msg.type === "join") {
    const deviceId = requireDevice(msg);
    client.deviceId = deviceId;
    const code = msg.code?.trim().toUpperCase();
    if (!code) throw new Error("code required");
    const room = hub.get(code);
    if (!room) throw new Error("room not found");

    const existing = room.findByDevice(deviceId);
    if (room.phase === "playing" && existing?.seat != null && room.table) {
      enterPlayingAsPlayer(ws, client, room, deviceId);
      send(ws, { type: "rejoined", seatToken: existing.seatToken, room: room.snapshot(deviceId) });
      return;
    }

    if (room.phase === "playing") {
      room.observe(deviceId);
      client.roomCode = room.code;
      client.role = "observer";
      send(ws, { type: "observing", room: room.snapshot(deviceId) });
      send(ws, packObserve(room, deviceId));
      return;
    }

    const member = room.join(deviceId, msg.displayName ?? "プレイヤー");
    client.roomCode = room.code;
    client.role = "player";
    broadcastRoom(room);
    send(ws, { type: "joined", seatToken: member.seatToken, room: room.snapshot(deviceId) });
    return;
  }

  const deviceId = client.deviceId ?? requireDevice(msg);
  client.deviceId = deviceId;
  const room = client.roomCode ? hub.get(client.roomCode) : undefined;

  if (msg.type === "lobby-settings") {
    if (!room) throw new Error("not in a room");
    room.updateSettings(deviceId, msg.settings ?? {});
    broadcastRoom(room);
    return;
  }

  if (msg.type === "start") {
    if (!room) throw new Error("not in a room");
    room.start(deviceId);
    broadcastRoom(room);
    kickCpu(room);
    return;
  }

  if (msg.type === "cancel") {
    if (!room) throw new Error("not in a room");
    const code = room.code;
    room.cancel(deviceId);
    broadcastRoom(room);
    stopRoomTimers(code);
    hub.delete(code);
    for (const c of clients.values()) {
      if (c.roomCode === code) {
        c.roomCode = null;
        c.role = null;
      }
    }
    send(ws, { type: "hello-ok", deviceId });
    return;
  }

  if (msg.type === "leave") {
    if (!room) return;
    room.leaveLobby(deviceId);
    broadcastRoom(room);
    client.roomCode = null;
    client.role = null;
    send(ws, { type: "hello-ok", deviceId });
    return;
  }

  if (msg.type === "quit") {
    if (!room) {
      send(ws, { type: "hello-ok", deviceId });
      return;
    }
    const code = room.code;
    room.quitMatch(deviceId);
    client.roomCode = null;
    client.role = null;
    if (room.paused) stopRoomTimers(code);
    broadcastRoom(room);
    if (!room.paused) kickCpu(room);
    send(ws, { type: "hello-ok", deviceId, reason: "quit" });
    return;
  }

  if (!room?.table) throw new Error("match not started");
  if (client.role === "observer" || room.observers.has(deviceId)) {
    throw new Error("observers cannot act");
  }
  if (room.paused) throw new Error("match paused (no humans connected)");
  const member = room.findByDevice(deviceId);
  if (!member || member.seat === null) throw new Error("no seat");
  if (member.forceProxy && room.table.state?.actingSeat === member.seat) {
    throw new Error("this turn is CPU-proxied; wait for your next turn");
  }

  if (msg.type === "next") {
    clearDeadline(room.code);
    room.table.nextFromSeat(member.seat);
    room.clearForceProxyIfTurnMoved();
    broadcastRoom(room);
    kickCpu(room);
    return;
  }
  if (msg.type === "action" && msg.action) {
    clearDeadline(room.code);
    room.table.applyFromSeat(member.seat, msg.action);
    room.clearForceProxyIfTurnMoved();
    broadcastRoom(room);
    kickCpu(room);
    return;
  }
}

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  clients.set(ws, { ws, deviceId: null, roomCode: null, role: null });
  send(ws, { type: "welcome", mode: "online" });

  ws.on("message", (raw) => {
    let msg: InMsg;
    try {
      msg = JSON.parse(String(raw)) as InMsg;
    } catch {
      return;
    }
    try {
      handleMessage(ws, msg);
    } catch (err) {
      const message =
        err instanceof IllegalActionError
          ? err.message
          : err instanceof Error
            ? err.message
            : "error";
      send(ws, { type: "error", message });
    }
  });

  ws.on("close", () => {
    const client = clients.get(ws);
    clients.delete(ws);
    if (!client?.deviceId || !client.roomCode) return;
    const room = hub.get(client.roomCode);
    if (!room) return;
    if (client.role === "observer") {
      room.removeObserver(client.deviceId);
      return;
    }
    room.markDisconnected(client.deviceId);
    if (room.paused) stopRoomTimers(room.code);
    broadcastRoom(room);
    if (!room.paused) kickCpu(room);
  });
});

function lanAddress(): string {
  const ifs = os.networkInterfaces();
  for (const addrs of Object.values(ifs)) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return "127.0.0.1";
}

server.listen(port, () => {
  const ip = lanAddress();
  console.log(`畑作オンライン  http://${ip}:${port}`);
  console.log(`LAN単卓（旧）  http://${ip}:${port}/lan`);
  console.log(`ngrok 例: ngrok http ${port}`);
});

setInterval(() => gcHub(), 60_000).unref();
