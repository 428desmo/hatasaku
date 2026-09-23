import { describe, expect, it } from "vitest";
import { cropDef, cropShortName, cropList, cropsForMode } from "./catalog.js";
import { createGame, createRng } from "./index.js";
import { acquireCost, plotCount } from "./types.js";
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

  it("keeps vertical short names to 3 characters", () => {
    expect(cropShortName("komatsuna")).toBe("コマツ");
    expect(cropShortName("edamame")).toBe("エダマ");
    expect(cropShortName("corn")).toBe("トウモ");
    expect(cropShortName("pumpkin")).toBe("カボチ");
    expect(cropShortName("pepper")).toBe("ピーマ");
    expect(cropShortName("asparagus")).toBe("アスパ");
    expect(cropShortName("onion")).toBe("ネギ");
    for (const c of cropList) expect(cropShortName(c.id).length).toBeLessThanOrEqual(3);
  });

  it("draws a season's four crops only from that mode's pool", () => {
    for (const mode of ["basic", "advanced"] as const) {
      const allowed = new Set(cropsForMode(mode).map((c) => c.id));
      for (let i = 0; i < 40; i++) {
        const seed = `pool-${mode}-${i}`;
        const s = createGame({ mode, seed, seats: threeCpus }, createRng(seed));
        expect(s.specVersion).toBe("0.16");
        expect(s.cropIdsInGame).toHaveLength(4);
        for (const id of s.cropIdsInGame) expect(allowed.has(id)).toBe(true);
      }
    }
  });

  it("gives basic 5 plots and advanced 6, with power-of-two land costs", () => {
    expect(plotCount("basic")).toBe(5);
    expect(plotCount("advanced")).toBe(6);
    expect([0, 1, 2, 3, 4].map((n) => acquireCost(n, "basic"))).toEqual([0, 1, 2, 4, 8]);
    expect([0, 1, 2, 3, 4, 5].map((n) => acquireCost(n, "advanced"))).toEqual([0, 1, 2, 4, 8, 16]);
    expect(() => acquireCost(5, "basic")).toThrow(/cannot acquire/);
    const basic = createGame({ mode: "basic", seed: "land-b", seats: threeCpus }, createRng("land-b"));
    const adv = createGame({ mode: "advanced", seed: "land-a", seats: threeCpus }, createRng("land-a"));
    expect(basic.players[0]!.plots).toHaveLength(5);
    expect(adv.players[0]!.plots).toHaveLength(6);
  });
});
