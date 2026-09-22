import { describe, expect, it } from "vitest";
import { cropShortName } from "../engine/catalog.js";
import { Table } from "../session/table.js";
import { plant, replaceMarket, startForced } from "../engine/testkit.js";
import { seasonActionRows } from "./seasonLog.js";

describe("season action log", () => {
  it("keeps plants and passes without plot indexes", () => {
    let { state: s, rng } = startForced({
      mode: "basic",
      crops: ["sweetpotato", "radish", "onion", "corn"],
    });
    const planter = s.turnOrder[0]!;
    s = replaceMarket(s, ["sweetpotato", "radish", "onion"]);
    s = plant(s, rng, { type: "plant", marketIndex: 0, target: "newLand" });
    expect(s.seasonActions).toHaveLength(1);
    expect(s.seasonActions[0]).toMatchObject({ seat: planter, kind: "plant", cropId: "sweetpotato" });
    const rows = seasonActionRows(s);
    expect(rows.find((r) => r.seat === planter)?.cells).toEqual([cropShortName("sweetpotato")]);
  });

  it("keeps a full season of one action per player per round", () => {
    const table = new Table({
      mode: "basic",
      humanCount: 0,
      cpuCount: 3,
      cpuStrategyId: "irr",
      seed: "act-table",
      seasonCount: 1,
    });
    const state = table.state!;
    expect(state.seasonActions).toHaveLength(30);
    const rows = seasonActionRows(state);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.cells).toHaveLength(10);
    expect(rows.some((r) => r.cells.includes("パス"))).toBe(true);
  });
});
