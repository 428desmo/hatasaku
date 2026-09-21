import { describe, expect, it } from "vitest";
import { Table } from "./table.js";

describe("table seats", () => {
  it("auto-assigns distinct human seats then starts with CPUs", () => {
    const table = new Table({
      mode: "tutorial",
      humanCount: 2,
      cpuCount: 1,
      cpuStrategyId: "random",
      seed: "seat-test",
    });
    expect(table.state).toBeNull();
    expect(table.assignHuman()).toBe(0);
    expect(table.state).toBeNull();
    expect(table.assignHuman()).toBe(1);
    expect(table.state).not.toBeNull();
    expect(table.assignHuman()).toBeNull();
    expect(table.state?.players.map((p) => p.kind)).toEqual(["human", "human", "cpu"]);
  });

  it("pauses once for a combined turn-and-harvest summary", () => {
    const table = new Table({
      mode: "tutorial",
      humanCount: 1,
      cpuCount: 2,
      cpuStrategyId: "random",
      seed: "hold-test",
    });
    const seat = table.assignHuman();
    expect(seat).toBe(0);
    expect(table.state).not.toBeNull();
    while (table.state && table.hold === null && table.state.phase === "turn") {
      const actor = table.state.actingSeat;
      if (actor !== 0) break;
      table.applyFromSeat(0, { type: "pass" });
    }
    expect(table.hold).toBe("result");
    expect(table.state?.phase).toBe("income");
    expect(table.state?.roundActions.length).toBe(3);
    expect(table.state?.lastPayouts).toHaveLength(3);
    const view = table.viewFor(0);
    expect(view.text).toContain("の結果");
    expect(view.text).toContain("手番");
    expect(view.text).toContain("収穫");
    expect(view.text).toContain("所持コイン");
    expect(view.html).toContain("の結果");
    expect(view.html).toContain("手番");
    expect(view.html).toContain("収穫");
    expect(view.html).toContain("所持コイン");
    expect(view.actions).toEqual([]);
    table.nextFromSeat(0);
    expect(table.hold).toBeNull();
    expect(table.state?.round).toBe(2);
  });

  it("shows a game summary after the last round", () => {
    const table = new Table({
      mode: "tutorial",
      humanCount: 0,
      cpuCount: 3,
      cpuStrategyId: "irr",
      seed: "end-summary",
    });
    expect(table.state?.phase).toBe("gameOver");
    expect(table.state?.roundLog).toHaveLength(10);
    const view = table.viewFor("spectator");
    expect(view.text).toContain("終了");
    expect(view.text).toMatch(/勝者|共同勝者/);
    expect(view.text).toContain("所持コイン");
    expect(view.text).toContain("収穫中の農地");
    expect(view.text).toContain("このゲーム");
    expect(view.text).toContain("取得農地");
    expect(view.text).toContain("最終盤面");
    expect(view.html).toContain("<table>");
    expect(view.html).toContain("最終盤面");
  });
});
