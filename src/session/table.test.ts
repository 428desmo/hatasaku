import { describe, expect, it } from "vitest";
import { Table } from "./table.js";

describe("table seats", () => {
  it("auto-assigns distinct human seats then starts with CPUs", () => {
    const table = new Table({
      mode: "basic",
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
      mode: "basic",
      humanCount: 1,
      cpuCount: 2,
      cpuStrategyId: "random",
      seed: "hold-test",
    });
    const seat = table.assignHuman();
    expect(seat).toBe(0);
    expect(table.hold).toBe("intro");
    table.nextFromSeat(0);
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
      mode: "basic",
      humanCount: 0,
      cpuCount: 3,
      cpuStrategyId: "irr",
      seed: "end-summary",
      seasonCount: 1,
    });
    expect(table.state?.phase).toBe("gameOver");
    expect(table.state?.roundLog).toHaveLength(10);
    const view = table.viewFor("spectator");
    expect(view.text).toContain("終了");
    expect(view.text).toMatch(/勝者|共同勝者/);
    expect(view.text).toContain("所持コイン");
    expect(view.text).toContain("収穫中の農地");
    expect(view.text).toContain("このシーズン");
    expect(view.text).toContain("取得農地");
    expect(view.text).toContain("最終盤面");
    expect(view.html).toContain("<table>");
    expect(view.html).toContain("最終盤面");
    expect(view.seasonLog).toHaveLength(3);
    for (const row of view.seasonLog) expect(row.cells).toHaveLength(10);
  });

  it("plays a match of player-count seasons with rotating start seats", () => {
    const table = new Table({
      mode: "basic",
      humanCount: 0,
      cpuCount: 3,
      cpuStrategyId: "random",
      seed: "match-rotate",
    });
    expect(table.seasonCount).toBe(3);
    expect(table.scoreSheet).toHaveLength(3);
    expect(table.matchOver).toBe(true);
    expect(table.state?.phase).toBe("gameOver");
    expect(table.matchWinnerSeats.length).toBeGreaterThan(0);
    expect(table.state?.startCoins).toEqual([8, 8, 8]);
    const view = table.viewFor("spectator");
    expect(view.honorKind).toBe("match");
    expect(view.honorSeats).toEqual(table.matchWinnerSeats);
    expect(view.crownSeats).toEqual([]);
    expect(view.text).toContain("得点表");
    expect(view.text).toContain("S1");
    expect(view.text).toContain("合計");
    expect(view.text).toMatch(/マッチ勝者|マッチ共同勝者/);
  });

  it("shows mix then honor after the last human season", () => {
    const table = new Table({
      mode: "basic",
      humanCount: 1,
      cpuCount: 2,
      cpuStrategyId: "irr",
      seed: "end-mix",
      seasonCount: 1,
    });
    expect(table.assignHuman()).toBe(0);
    for (let i = 0; i < 4000; i++) {
      if (table.hold === "intro" || table.hold === "result") {
        table.nextFromSeat(0);
        continue;
      }
      if (table.hold === "season") {
        table.nextFromSeat(0);
        expect(table.hold).toBe("mix");
        expect(table.matchOver).toBe(false);
        table.nextFromSeat(0);
        expect(table.hold).toBe("trail");
        expect(table.matchOver).toBe(false);
        const trail = table.viewFor(0);
        expect(trail.trail?.seasons).toBe(1);
        expect(trail.trail?.series).toHaveLength(3);
        expect(trail.honorKind).toBeNull();
        table.nextFromSeat(0);
        expect(table.hold).toBe("honor");
        expect(table.matchOver).toBe(true);
        expect(table.viewFor(0).honorKind).toBe("match");
        return;
      }
      if (table.state?.actingSeat === 0) table.applyFromSeat(0, { type: "pass" });
    }
    throw new Error("did not reach mix");
  });

  it("starts the same settings again after every human presses rematch", () => {
    const table = new Table({
      mode: "basic",
      humanCount: 2,
      cpuCount: 1,
      cpuStrategyId: "irr",
      seed: "rematch-ack",
      seasonCount: 1,
    });
    expect(table.assignHuman()).toBe(0);
    expect(table.assignHuman()).toBe(1);
    for (let i = 0; i < 8000; i++) {
      if (table.hold === "honor") break;
      if (table.hold) {
        table.nextFromSeat(0);
        table.nextFromSeat(1);
        continue;
      }
      const actor = table.state?.actingSeat;
      if (actor === 0 || actor === 1) table.applyFromSeat(actor, { type: "pass" });
      else throw new Error(`stuck acting=${actor} hold=${table.hold}`);
    }
    expect(table.hold).toBe("honor");
    expect(table.matchOver).toBe(true);
    const mode = table.config.mode;
    const seasons = table.seasonCount;
    table.nextFromSeat(0);
    expect(table.hold).toBe("honor");
    expect(table.viewFor(0).acked).toBe(true);
    expect(table.viewFor(1).acked).toBe(false);
    expect(table.matchOver).toBe(true);
    table.nextFromSeat(1);
    expect(table.hold).toBe("intro");
    expect(table.matchOver).toBe(false);
    expect(table.seasonIndex).toBe(1);
    expect(table.scoreSheet).toEqual([]);
    expect(table.state?.mode).toBe(mode);
    expect(table.state?.seasonCount).toBe(seasons);
    expect(table.state?.round).toBe(1);
    expect(table.state?.seed).toBe("rematch-ack-r1");
    expect(table.humanSeats.every((h) => h.connected)).toBe(true);
  });

  it("keeps turn order within a season and shifts start by one next season", () => {
    const table = new Table({
      mode: "basic",
      humanCount: 1,
      cpuCount: 2,
      cpuStrategyId: "random",
      seed: "order-fixed",
      seasonCount: 2,
    });
    expect(table.assignHuman()).toBe(0);
    const start1 = table.state!.startSeat;
    const n = 3;
    const order1 = [...table.state!.turnOrder];
    expect(order1).toEqual([(start1) % n, (start1 + 1) % n, (start1 + 2) % n]);

    for (let i = 0; i < 4000; i++) {
      if (!table.state) throw new Error("missing state");
      if (table.hold === "intro") {
        table.nextFromSeat(0);
        continue;
      }
      if (table.hold === "result") {
        expect(table.state.turnOrder).toEqual(order1);
        expect(table.state.startSeat).toBe(start1);
        table.nextFromSeat(0);
        continue;
      }
      if (table.hold === "season") {
        expect(table.state.startSeat).toBe(start1);
        const seasonView = table.viewFor(0);
        expect(seasonView.honorKind).toBe("season");
        expect(seasonView.honorSeats).toEqual(table.state.winnerSeats);
        expect(seasonView.crownSeats).toEqual([]);
        expect(seasonView.seasonLog).toHaveLength(3);
        for (const row of seasonView.seasonLog) expect(row.cells).toHaveLength(10);
        table.nextFromSeat(0);
        expect(table.hold).toBe("mix");
        const mixView = table.viewFor(0);
        expect(mixView.honorKind).toBe("season");
        expect(mixView.seasonLog).toHaveLength(3);
        table.nextFromSeat(0);
        expect(table.state!.startSeat).toBe((start1 + 1) % n);
        expect(table.state!.turnOrder).toEqual([(start1 + 1) % n, (start1 + 2) % n, start1]);
        expect(table.state!.round).toBe(1);
        const intro = table.viewFor(0);
        expect(table.hold).toBe("intro");
        expect(intro.honorKind).toBeNull();
        expect(intro.crownSeats.length).toBeGreaterThan(0);
        const best = Math.max(...table.scoreSheet[0]!);
        expect(intro.crownSeats).toEqual(
          table.scoreSheet[0]!.flatMap((c, seat) => (c === best ? [seat] : [])),
        );
        const scores = table.scoreSheet[0]!;
        const worst = Math.min(...scores);
        expect(table.state!.curseReadySeats).toEqual(
          worst === best ? [] : scores.flatMap((c, seat) => (c === worst ? [seat] : [])),
        );
        expect(intro.view.curseReadySeats).toEqual(table.state!.curseReadySeats);
        expect(intro.seasonIntro?.cropLead).toContain("4種類");
        expect(intro.seasonIntro?.cropNames).toHaveLength(4);
        if (table.state!.curseReadySeats.length > 0) {
          expect(intro.seasonIntro?.curse?.recipientsLead).toContain("呪い");
          expect(intro.seasonIntro?.curse?.whatIs).toContain("1種類");
          expect(intro.view.message).toContain("呪い");
        } else {
          expect(intro.seasonIntro?.curse).toBeNull();
        }
        return;
      }
      if (table.state.actingSeat === 0) table.applyFromSeat(0, { type: "pass" });
    }
    throw new Error("did not reach season 2");
  });

  it("paces a cpu plant through turn, market, plot, then coins", () => {
    const table = new Table({
      mode: "basic",
      humanCount: 1,
      cpuCount: 2,
      cpuStrategyId: "irr",
      seed: "cpu-pace-plant",
      seasonCount: 1,
      paceCpu: true,
    });
    expect(table.assignHuman()).toBe(0);
    table.nextFromSeat(0);
    let saw = false;
    for (let i = 0; i < 120; i++) {
      if (table.hold === "result") break;
      const actor = table.state?.actingSeat;
      if (actor === 0 && !table.cpuShow) {
        table.applyFromSeat(0, { type: "pass" });
        continue;
      }
      const again = table.cpuTick();
      if (table.cpuShow?.stage === "market") {
        expect(table.cpuShow.marketIndex).toEqual(expect.any(Number));
        expect(table.cpuTick()).toBe(true);
        expect(table.cpuShow?.stage).toBe("plot");
        expect(table.cpuShow?.plotIndex).toEqual(expect.any(Number));
        const seat = table.cpuShow!.seat;
        const before = table.state!.players[seat]!.coins;
        expect(table.cpuTick()).toBe(true);
        expect(table.cpuShow?.stage).toBe("coins");
        expect(table.state!.players[seat]!.coins).toBeLessThan(before);
        saw = true;
        break;
      }
      if (!again && table.state?.actingSeat === 0) table.applyFromSeat(0, { type: "pass" });
    }
    expect(saw).toBe(true);
  });

  it("opens harvest as soon as the last paced human action ends the round", () => {
    const table = new Table({
      mode: "basic",
      humanCount: 1,
      cpuCount: 2,
      cpuStrategyId: "random",
      seed: "pace-income-hang",
      seasonCount: 1,
      paceCpu: true,
    });
    expect(table.assignHuman()).toBe(0);
    table.nextFromSeat(0);
    for (let i = 0; i < 250; i++) {
      if (table.hold === "result") break;
      const actor = table.state?.actingSeat;
      if (actor === 0 && !table.cpuShow) {
        table.applyFromSeat(0, { type: "pass" });
        if (table.state?.phase === "income") expect(table.hold).toBe("result");
        continue;
      }
      const again = table.cpuTick();
      if (!again && table.state?.phase === "income") expect(table.hold).toBe("result");
      if (!again && table.state?.actingSeat === 0) table.applyFromSeat(0, { type: "pass" });
    }
    expect(table.hold).toBe("result");
    expect(table.state?.phase).toBe("income");
    expect(table.viewFor(0).view.message).toContain("次へ");
  });
});
