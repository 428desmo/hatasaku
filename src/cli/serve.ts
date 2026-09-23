import http from "node:http";
import os from "node:os";
import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { Table, CPU_STEP_MS } from "../session/table.js";
import { IllegalActionError, parseMode, type Action } from "../engine/types.js";

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

const humans = Number(arg("humans", "1"));
const cpus = Number(arg("cpus", "2"));
const mode = parseMode(arg("mode", "basic"));
const seed = arg("seed", `s${Date.now()}`);
const port = Number(arg("port", "8080"));
const seasonsRaw = arg("seasons", "");

const table = new Table({
  mode,
  humanCount: humans,
  cpuCount: cpus,
  cpuStrategyId: arg("cpu", "irr"),
  seed,
  paceCpu: humans > 0,
  ...(seasonsRaw ? { seasonCount: Number(seasonsRaw) } : {}),
});

const seats = new Map<WebSocket, number>();

function sendView(ws: WebSocket, seat: number): void {
  const packed = table.viewFor(seat);
  ws.send(
    JSON.stringify({
      type: "view",
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
      actions: packed.hold ? [] : packed.actions.map((a) => ({ ...a.action, label: a.label })),
      hold: packed.hold,
      acked: packed.acked,
      ackNeed: packed.ackNeed,
      ackGot: packed.ackGot,
      phase: packed.view.phase,
      over: table.matchOver,
    }),
  );
}

function broadcast(): void {
  for (const [ws, seat] of seats) {
    if (ws.readyState === ws.OPEN) sendView(ws, seat);
  }
}

let cpuTimer: ReturnType<typeof setTimeout> | null = null;

function clearCpuTimer(): void {
  if (cpuTimer !== null) {
    clearTimeout(cpuTimer);
    cpuTimer = null;
  }
}

function scheduleCpu(): void {
  clearCpuTimer();
  cpuTimer = setTimeout(() => {
    cpuTimer = null;
    const again = table.cpuTick();
    broadcast();
    if (again) scheduleCpu();
  }, CPU_STEP_MS);
}

function kickCpu(): void {
  if (!table.config.paceCpu) return;
  const again = table.cpuTick();
  broadcast();
  if (again) scheduleCpu();
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
  if (path === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  const seat = table.assignHuman();
  if (seat === null) {
    ws.send(JSON.stringify({ type: "error", message: "人間席が埋まっています" }));
    ws.close();
    return;
  }
  seats.set(ws, seat);
  ws.send(JSON.stringify({ type: "assigned", seat, name: `プレイヤー${seat + 1}` }));
  sendView(ws, seat);
  broadcast();

  ws.on("message", (raw) => {
    let msg: { type?: string; action?: Action };
    try {
      msg = JSON.parse(String(raw)) as { type?: string; action?: Action };
    } catch {
      return;
    }
    const s = seats.get(ws);
    if (s === undefined) return;
    try {
      if (msg.type === "next") {
        table.nextFromSeat(s);
        broadcast();
        kickCpu();
        return;
      }
      if (msg.type !== "action" || !msg.action) return;
      table.applyFromSeat(s, msg.action);
      broadcast();
      kickCpu();
    } catch (err) {
      const message = err instanceof IllegalActionError ? err.message : "error";
      ws.send(JSON.stringify({ type: "error", message }));
    }
  });

  ws.on("close", () => {
    const s = seats.get(ws);
    if (s !== undefined) table.releaseHuman(s);
    seats.delete(ws);
    broadcast();
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
  console.log(`畑作  http://${ip}:${port}  (humans=${humans} cpus=${cpus} mode=${mode} seasons=${table.seasonCount} seed=${seed})`);
  console.log(`テキストUI  http://${ip}:${port}/text`);
});
