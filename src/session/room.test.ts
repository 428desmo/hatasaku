import { describe, expect, it } from "vitest";
import {
  Room,
  RoomHub,
  JOIN_WINDOW_MS,
  MATCH_MAX_MS,
  normalizeSettings,
} from "./room.js";

describe("online room lobby", () => {
  it("makes the first joiner the leader and hands off when they leave", () => {
    const room = new Room("TEST01", { playerCount: 4, seasonCount: 4 });
    room.join("dev-a", "Alice");
    room.join("dev-b", "Bob");
    expect(room.leaderDeviceId).toBe("dev-a");
    room.leaveLobby("dev-a");
    expect(room.leaderDeviceId).toBe("dev-b");
  });

  it("lets the leader change settings and rejects shrinking below humans", () => {
    const room = new Room("TEST02", { playerCount: 5 });
    room.join("dev-a", "A");
    room.join("dev-b", "B");
    room.join("dev-c", "C");
    room.join("dev-d", "D");
    room.updateSettings("dev-a", { mode: "advanced", playerCount: 5, seasonCount: 2 });
    expect(room.settings.mode).toBe("advanced");
    expect(room.settings.playerCount).toBe(5);
    expect(() => room.updateSettings("dev-b", { playerCount: 5 })).toThrow(/leader/);
    expect(() => room.updateSettings("dev-a", { playerCount: 3 })).toThrow(/playerCount/);
  });

  it("fills remaining seats with CPUs on start", () => {
    const room = new Room("TEST03", { playerCount: 5, seasonCount: 1, mode: "basic" }, "room-seed");
    room.join("dev-a", "A");
    room.join("dev-b", "B");
    const table = room.start("dev-a");
    expect(room.phase).toBe("playing");
    expect(table.config.humanCount).toBe(2);
    expect(table.config.cpuCount).toBe(3);
    expect(table.state).not.toBeNull();
    expect(room.members.map((m) => m.seat).sort()).toEqual([0, 1]);
    expect(room.startedAt).not.toBeNull();
  });

  it("closes join after the window", () => {
    const room = new Room("TEST04", { playerCount: 3 });
    room.join("dev-a", "A");
    Object.defineProperty(room, "joinUntil", { value: Date.now() - 1 });
    expect(room.joinOpen).toBe(false);
    expect(() => room.join("dev-b", "B")).toThrow(/join window/);
  });

  it("normalizes player count to 3-5", () => {
    expect(normalizeSettings({ playerCount: 99 }).playerCount).toBe(5);
    expect(normalizeSettings({ playerCount: 1 }).playerCount).toBe(3);
  });

  it("creates unique rooms in the hub", () => {
    const hub = new RoomHub();
    const a = hub.create({ playerCount: 3 });
    const b = hub.create({ playerCount: 4 });
    expect(a.code).not.toBe(b.code);
    expect(hub.get(a.code)).toBe(a);
  });
});

describe("quit, pause, observe, expiry", () => {
  it("pauses when the last seated human quits and resumes on rejoin", () => {
    const room = new Room("QUIT1", { playerCount: 3, seasonCount: 1 }, "q1");
    room.join("dev-a", "A");
    room.join("dev-b", "B");
    room.start("dev-a");
    expect(room.paused).toBe(false);
    room.quitMatch("dev-a");
    expect(room.paused).toBe(false);
    expect(room.connectedSeatedHumans()).toHaveLength(1);
    room.quitMatch("dev-b");
    expect(room.paused).toBe(true);
    expect(room.turnTimerApplies()).toBe(false);
    room.join("dev-a", "A");
    expect(room.paused).toBe(false);
    expect(room.connectedSeatedHumans()).toHaveLength(1);
  });

  it("marks forceProxy on any quit so CPU can proxy immediately", () => {
    const room = new Room("QUIT2", { playerCount: 3, seasonCount: 1 }, "q2");
    room.join("dev-a", "A");
    room.join("dev-b", "B");
    room.start("dev-a");
    const human = room.members[0]!;
    room.quitMatch("dev-a");
    expect(human.forceProxy).toBe(true);
    expect(room.wantsImmediateProxy(human.seat!)).toBe(true);
    expect(room.shouldProxySeat(human.seat!)).toBe(true);
  });

  it("keeps forceProxy after quit even when it is not that seat's turn", () => {
    const room = new Room("QUIT3", { playerCount: 3, seasonCount: 1 }, "q3");
    room.join("dev-a", "A");
    room.join("dev-b", "B");
    room.start("dev-a");
    const a = room.members[0]!;
    const b = room.members[1]!;
    room.table!.state!.phase = "turn";
    room.table!.state!.actingSeat = b.seat!;
    room.quitMatch("dev-a");
    room.clearForceProxyIfTurnMoved();
    expect(a.forceProxy).toBe(true);
    expect(room.wantsImmediateProxy(a.seat!)).toBe(true);
  });

  it("clears forceProxy on rejoin unless mid own turn", () => {
    const room = new Room("QUIT4", { playerCount: 3, seasonCount: 1 }, "q4");
    room.join("dev-a", "A");
    room.join("dev-b", "B");
    room.start("dev-a");
    const a = room.members[0]!;
    room.table!.state!.phase = "turn";
    room.table!.state!.actingSeat = a.seat!;
    room.quitMatch("dev-a");
    room.join("dev-a", "A");
    expect(a.connected).toBe(true);
    expect(a.forceProxy).toBe(true);
    room.table!.state!.actingSeat = room.members[1]!.seat!;
    room.clearForceProxyIfTurnMoved();
    expect(a.forceProxy).toBe(false);
  });

  it("lets outsiders observe a started match", () => {
    const room = new Room("OBS1", { playerCount: 3, seasonCount: 1 }, "o1");
    room.join("dev-a", "A");
    room.start("dev-a");
    room.observe("dev-watch");
    expect(room.observers.has("dev-watch")).toBe(true);
    expect(room.snapshot("dev-watch").role).toBe("observer");
    expect(() => room.join("dev-new", "X")).toThrow(/started/);
  });

  it("GCs playing rooms older than 24h", () => {
    const hub = new RoomHub();
    const room = hub.create({ playerCount: 3, seasonCount: 1 }, "old");
    room.join("dev-a", "A");
    room.start("dev-a");
    room.startedAt = Date.now() - MATCH_MAX_MS - 1;
    const removed = hub.gc();
    expect(removed).toContain(room.code);
    expect(hub.get(room.code)).toBeUndefined();
  });
});

describe("join window constant", () => {
  it("is ten minutes", () => {
    expect(JOIN_WINDOW_MS).toBe(600_000);
  });
});
