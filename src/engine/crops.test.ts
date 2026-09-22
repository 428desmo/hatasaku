import { describe, expect, it } from "vitest";
import { cropDef, cropsForMode } from "./catalog.js";
import { createGame, createRng } from "./index.js";
import { threeCpus } from "./testkit.js";

describe("v0.9 crop pools", () => {
  it("keeps 14 bundles and 10 crops per mode", () => {
    expect(cropsForMode("basic")).toHaveLength(10);
    expect(cropsForMode("advanced")).toHaveLength(10);
    const basic = cropsForMode("basic").map((c) => c.id);
    const advanced = cropsForMode("advanced").map((c) => c.id);
    expect(basic).toEqual(
      expect.arrayContaining(["onion", "pumpkin", "tomato", "watermelon", "radish"]),
    );
    expect(basic).not.toContain("asparagus");
    expect(advanced).toEqual(
      expect.arrayContaining(["asparagus", "burdock", "pepper", "melon", "radish"]),
    );
    expect(advanced).not.toContain("onion");
  });

  it("lowers only the advanced-only base incomes", () => {
    expect(cropDef("asparagus")).toMatchObject({ cost: 2, wait: 2, harvest: 4, baseIncome: 5, floor: 3, cooldown: 0 });
    expect(cropDef("burdock")).toMatchObject({ cost: 3, wait: 4, harvest: 3, baseIncome: 9, floor: 4, cooldown: 4 });
    expect(cropDef("pepper")).toMatchObject({ cost: 3, wait: 3, harvest: 4, baseIncome: 6, floor: 4, cooldown: 4 });
    expect(cropDef("melon")).toMatchObject({ cost: 4, wait: 4, harvest: 2, baseIncome: 12, floor: 5, cooldown: 4 });
    expect(cropDef("onion").baseIncome).toBe(8);
    expect(cropDef("pumpkin").baseIncome).toBe(11);
    expect(cropDef("tomato").baseIncome).toBe(9);
    expect(cropDef("watermelon").baseIncome).toBe(13);
  });

  it("draws a season's four crops only from that mode's pool", () => {
    for (const mode of ["basic", "advanced"] as const) {
      const allowed = new Set(cropsForMode(mode).map((c) => c.id));
      for (let i = 0; i < 40; i++) {
        const seed = `pool-${mode}-${i}`;
        const s = createGame({ mode, seed, seats: threeCpus }, createRng(seed));
        expect(s.specVersion).toBe("0.11");
        expect(s.cropIdsInGame).toHaveLength(4);
        for (const id of s.cropIdsInGame) expect(allowed.has(id)).toBe(true);
      }
    }
  });
});
