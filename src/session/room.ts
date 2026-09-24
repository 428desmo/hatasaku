import { randomBytes } from "node:crypto";
import { parseMode, type Mode } from "../engine/types.js";
import { Table, CPU_STEP_MS, type UiHold } from "./table.js";

export const JOIN_WINDOW_MS = 10 * 60 * 1000;
export const DEFAULT_TURN_MS = 60_000;
export const LOBBY_DISCONNECT_GRACE_MS = 60_000;
/** Playing matches are discarded after this age (from start). */
export const MATCH_MAX_MS = 24 * 60 * 60 * 1000;

export type RoomSettings = {
  mode: Mode;
  playerCount: number;
  seasonCount: number;
  turnMs: number;
};

export type LobbyMember = {
  deviceId: string;
  seatToken: string;
  displayName: string;
  joinedAt: number;
  connected: boolean;
  disconnectAt: number | null;
  /** Assigned when the match starts (0..humanCount-1). */
  seat: number | null;
  /**
   * Quit mid-own-turn: keep seat, but this turn is CPU-proxied; rejoiner watches only
   * until the acting seat changes.
   */
  forceProxy: boolean;
};

export type LobbySnapshot = {
  code: string;
  phase: "lobby" | "playing" | "ended";
  paused: boolean;
  joinOpen: boolean;
  joinRemainingMs: number;
  settings: RoomSettings;
  leaderDeviceId: string;
  members: {
    deviceId: string;
    displayName: string;
    connected: boolean;
    isLeader: boolean;
    isYou: boolean;
  }[];
  youAreLeader: boolean;
  seatToken: string | null;
  seat: number | null;
  role: "player" | "observer" | "none";
};

function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeJoinCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    let code = "";
    const buf = randomBytes(6);
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[buf[i]! % CODE_ALPHABET.length];
    if (!existing.has(code)) return code;
  }
  throw new Error("could not allocate join code");
}

export function defaultSettings(): RoomSettings {
  return {
    mode: "basic",
    playerCount: 3,
    seasonCount: 3,
    turnMs: DEFAULT_TURN_MS,
  };
}

export function normalizeSettings(partial: Partial<RoomSettings> & { mode?: string }): RoomSettings {
  const base = defaultSettings();
  const mode = partial.mode !== undefined ? parseMode(String(partial.mode)) : base.mode;
  let playerCount = partial.playerCount ?? base.playerCount;
  if (!Number.isFinite(playerCount)) playerCount = base.playerCount;
  playerCount = Math.max(3, Math.min(5, Math.floor(playerCount)));
  let seasonCount = partial.seasonCount ?? playerCount;
  if (!Number.isFinite(seasonCount) || seasonCount < 1) seasonCount = playerCount;
  seasonCount = Math.floor(seasonCount);
  let turnMs = partial.turnMs ?? base.turnMs;
  if (!Number.isFinite(turnMs) || turnMs < 10_000) turnMs = base.turnMs;
  return { mode, playerCount, seasonCount, turnMs };
}

export class Room {
  readonly code: string;
  readonly createdAt: number;
  readonly joinUntil: number;
  settings: RoomSettings;
  phase: "lobby" | "playing" | "ended" = "lobby";
  /** True when every human seat is away; match timers/CPU freeze until someone returns. */
  paused = false;
  startedAt: number | null = null;
  members: LobbyMember[] = [];
  /** Devices watching a started match without a seat. */
  observers = new Set<string>();
  table: Table | null = null;
  private seed: string;

  constructor(code: string, settings?: Partial<RoomSettings>, seed?: string) {
    this.code = code;
    this.createdAt = Date.now();
    this.joinUntil = this.createdAt + JOIN_WINDOW_MS;
    this.settings = normalizeSettings(settings ?? {});
    this.seed = seed ?? `online-${code}-${this.createdAt}`;
  }

  get joinOpen(): boolean {
    return this.phase === "lobby" && Date.now() < this.joinUntil;
  }

  get joinRemainingMs(): number {
    if (this.phase !== "lobby") return 0;
    return Math.max(0, this.joinUntil - Date.now());
  }

  get leaderDeviceId(): string | null {
    const present = this.presentMembers();
    if (present.length === 0) return null;
    return present.sort((a, b) => a.joinedAt - b.joinedAt)[0]!.deviceId;
  }

  presentMembers(): LobbyMember[] {
    return this.members.filter((m) => m.connected || m.seat !== null);
  }

  seatedMembers(): LobbyMember[] {
    return this.members.filter((m) => m.seat !== null);
  }

  connectedSeatedHumans(): LobbyMember[] {
    return this.members.filter((m) => m.seat !== null && m.connected);
  }

  lobbyHumans(): LobbyMember[] {
    return this.members.filter((m) => {
      if (m.seat !== null) return true;
      if (!m.connected && m.disconnectAt != null && Date.now() - m.disconnectAt > LOBBY_DISCONNECT_GRACE_MS) {
        return false;
      }
      return m.connected || (m.disconnectAt != null && Date.now() - m.disconnectAt <= LOBBY_DISCONNECT_GRACE_MS);
    });
  }

  pruneLobbyAbandoned(): void {
    if (this.phase !== "lobby") return;
    this.members = this.members.filter((m) => {
      if (m.connected) return true;
      if (m.disconnectAt == null) return true;
      return Date.now() - m.disconnectAt <= LOBBY_DISCONNECT_GRACE_MS;
    });
  }

  findByDevice(deviceId: string): LobbyMember | undefined {
    return this.members.find((m) => m.deviceId === deviceId);
  }

  findBySeatToken(seatToken: string): LobbyMember | undefined {
    return this.members.find((m) => m.seatToken === seatToken);
  }

  clearForceProxyIfTurnMoved(): void {
    if (!this.table?.state) return;
    const acting = this.table.state.actingSeat;
    for (const m of this.members) {
      if (!m.forceProxy || m.seat === null || m.seat === acting) continue;
      // Quitters who stay away keep forceProxy so later turns proxy immediately.
      // Only rejoined players (watching a mid-turn proxy) clear when the turn moves.
      if (!m.connected) continue;
      m.forceProxy = false;
      this.table.setHumanConnected(m.seat, true);
    }
  }

  join(deviceId: string, displayName: string): LobbyMember {
    this.pruneLobbyAbandoned();
    const existing = this.findByDevice(deviceId);
    if (existing) {
      existing.connected = true;
      existing.disconnectAt = null;
      if (displayName.trim()) existing.displayName = displayName.trim().slice(0, 16);
      if (this.table && existing.seat !== null) {
        const midOwnTurn =
          this.table.state?.phase === "turn" && this.table.state.actingSeat === existing.seat;
        // Rejoining after quit: resume control unless this seat's turn is mid-proxy.
        if (existing.forceProxy && !midOwnTurn) existing.forceProxy = false;
        this.table.setHumanConnected(existing.seat, !existing.forceProxy);
      }
      this.observers.delete(deviceId);
      this.tryResume();
      return existing;
    }
    if (this.phase !== "lobby") throw new Error("match already started");
    if (!this.joinOpen) throw new Error("join window closed");
    if (this.lobbyHumans().length >= this.settings.playerCount) throw new Error("table is full");
    const member: LobbyMember = {
      deviceId,
      seatToken: randomToken(),
      displayName: (displayName.trim() || "プレイヤー").slice(0, 16),
      joinedAt: Date.now(),
      connected: true,
      disconnectAt: null,
      seat: null,
      forceProxy: false,
    };
    this.members.push(member);
    return member;
  }

  /** Watch a started match without taking a seat. */
  observe(deviceId: string): void {
    if (this.phase !== "playing" || !this.table) throw new Error("no match to observe");
    const existing = this.findByDevice(deviceId);
    if (existing?.seat != null) throw new Error("already a player; rejoin instead");
    this.observers.add(deviceId);
  }

  removeObserver(deviceId: string): void {
    this.observers.delete(deviceId);
  }

  markDisconnected(deviceId: string): void {
    this.observers.delete(deviceId);
    const m = this.findByDevice(deviceId);
    if (!m) return;
    m.connected = false;
    m.disconnectAt = Date.now();
    if (this.table && m.seat !== null) this.table.setHumanConnected(m.seat, false);
    this.maybePause();
  }

  markConnected(deviceId: string): LobbyMember | null {
    const m = this.findByDevice(deviceId);
    if (!m) return null;
    m.connected = true;
    m.disconnectAt = null;
    this.observers.delete(deviceId);
    if (this.table && m.seat !== null) {
      if (m.forceProxy) this.table.setHumanConnected(m.seat, false);
      else this.table.setHumanConnected(m.seat, true);
    }
    this.tryResume();
    return m;
  }

  /**
   * Explicit quit: keep the seat, mark for immediate CPU proxy (not turn-timer wait),
   * and pause the match if this was the last connected human.
   */
  quitMatch(deviceId: string): void {
    if (this.phase !== "playing") {
      this.leaveLobby(deviceId);
      return;
    }
    const m = this.findByDevice(deviceId);
    if (!m || m.seat === null) {
      this.removeObserver(deviceId);
      return;
    }
    m.forceProxy = true;
    this.markDisconnected(deviceId);
  }

  /** True when this seat quit intentionally and should be CPU-proxied without waiting. */
  wantsImmediateProxy(seat: number): boolean {
    const m = this.members.find((x) => x.seat === seat);
    return !!m?.forceProxy;
  }

  leaveLobby(deviceId: string): void {
    this.observers.delete(deviceId);
    if (this.phase !== "lobby") {
      this.markDisconnected(deviceId);
      return;
    }
    this.members = this.members.filter((m) => m.deviceId !== deviceId);
  }

  maybePause(): void {
    if (this.phase !== "playing") return;
    if (this.connectedSeatedHumans().length === 0) this.paused = true;
  }

  tryResume(): void {
    if (this.phase !== "playing" || !this.paused) return;
    if (this.connectedSeatedHumans().length > 0) this.paused = false;
  }

  updateSettings(deviceId: string, partial: Partial<RoomSettings> & { mode?: string }): RoomSettings {
    if (this.phase !== "lobby") throw new Error("match already started");
    if (deviceId !== this.leaderDeviceId) throw new Error("not lobby leader");
    const humans = this.lobbyHumans().length;
    const next = normalizeSettings({ ...this.settings, ...partial });
    if (next.playerCount < humans) {
      throw new Error(`playerCount must be >= ${humans} (current humans)`);
    }
    this.settings = next;
    return this.settings;
  }

  start(deviceId: string): Table {
    if (this.phase !== "lobby") throw new Error("already started");
    if (deviceId !== this.leaderDeviceId) throw new Error("not lobby leader");
    this.pruneLobbyAbandoned();
    const humans = this.lobbyHumans().sort((a, b) => a.joinedAt - b.joinedAt);
    if (humans.length < 1) throw new Error("need at least one human");
    if (humans.length > this.settings.playerCount) throw new Error("too many humans");
    const humanCount = humans.length;
    const cpuCount = this.settings.playerCount - humanCount;
    const table = new Table({
      mode: this.settings.mode,
      humanCount,
      cpuCount,
      cpuStrategyId: "irr",
      seed: this.seed,
      seasonCount: this.settings.seasonCount,
      paceCpu: true,
      humanNames: humans.map((h) => h.displayName),
    });
    for (let i = 0; i < humans.length; i++) {
      const seat = table.assignHuman();
      if (seat === null) throw new Error("failed to assign seat");
      humans[i]!.seat = seat;
      humans[i]!.connected = true;
      humans[i]!.disconnectAt = null;
      humans[i]!.forceProxy = false;
    }
    this.members = humans;
    this.observers.clear();
    this.table = table;
    this.phase = "playing";
    this.paused = false;
    this.startedAt = Date.now();
    return table;
  }

  cancel(deviceId: string): void {
    if (this.phase !== "lobby") throw new Error("match already started");
    if (deviceId !== this.leaderDeviceId) throw new Error("not lobby leader");
    this.phase = "ended";
    this.members = [];
    this.observers.clear();
  }

  snapshot(forDeviceId: string): LobbySnapshot {
    this.pruneLobbyAbandoned();
    const leader = this.leaderDeviceId;
    const you = this.findByDevice(forDeviceId);
    const isObserver = this.observers.has(forDeviceId);
    let role: LobbySnapshot["role"] = "none";
    if (you?.seat != null) role = "player";
    else if (isObserver) role = "observer";
    else if (you) role = "player";
    return {
      code: this.code,
      phase: this.phase,
      paused: this.paused,
      joinOpen: this.joinOpen,
      joinRemainingMs: this.joinRemainingMs,
      settings: { ...this.settings },
      leaderDeviceId: leader ?? "",
      members: this.lobbyHumans()
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((m) => ({
          deviceId: m.deviceId,
          displayName: m.displayName,
          connected: m.connected,
          isLeader: m.deviceId === leader,
          isYou: m.deviceId === forDeviceId,
        })),
      youAreLeader: forDeviceId === leader,
      seatToken: you?.seatToken ?? null,
      seat: you?.seat ?? null,
      role,
    };
  }

  /** Turn timer when 2+ human seats exist and the match is not paused. */
  turnTimerApplies(): boolean {
    return this.phase === "playing" && !this.paused && this.seatedMembers().length >= 2;
  }

  shouldProxySeat(seat: number): boolean {
    const m = this.members.find((x) => x.seat === seat);
    if (!m) return false;
    return !m.connected || m.forceProxy;
  }

  isExpiredMatch(now = Date.now()): boolean {
    return this.phase === "playing" && this.startedAt != null && now - this.startedAt > MATCH_MAX_MS;
  }
}

export class RoomHub {
  private rooms = new Map<string, Room>();

  create(settings?: Partial<RoomSettings>, seed?: string): Room {
    const code = makeJoinCode(new Set(this.rooms.keys()));
    const room = new Room(code, settings, seed);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  delete(code: string): void {
    this.rooms.delete(code.toUpperCase());
  }

  /** Drop ended / abandoned lobby / expired playing rooms. */
  gc(now = Date.now()): string[] {
    const removed: string[] = [];
    for (const [code, room] of this.rooms) {
      if (room.phase === "ended" || room.isExpiredMatch(now)) {
        room.phase = "ended";
        room.table = null;
        this.rooms.delete(code);
        removed.push(code);
      } else if (room.phase === "lobby") {
        room.pruneLobbyAbandoned();
        if (room.members.length === 0 && now > room.joinUntil) {
          this.rooms.delete(code);
          removed.push(code);
        }
      }
    }
    return removed;
  }
}

export { CPU_STEP_MS };
export type { UiHold };
