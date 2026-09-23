import { describe, expect, it } from "vitest";
import { Room, RoomHub, JOIN_WINDOW_MS, normalizeSettings } from "./room.js";

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

describe("join window constant", () => {
  it("is ten minutes", () => {
    expect(JOIN_WINDOW_MS).toBe(600_000);
  });
});
