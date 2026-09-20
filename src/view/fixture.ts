import type { PublicView } from "../engine/types.js";

/** 設計書 §5 の見た目を固定するための盤面。エンジン未実装でも描画を試せる。 */
export const samplePublicView: PublicView = {
  mode: "tutorial",
  round: 3,
  lastRound: 10,
  phase: "turn",
  actingSeat: 0,
  turnOrder: [0, 1, 2],
  players: [
    {
      seat: 0,
      kind: "human",
      name: "プレイヤー1",
      coins: 7,
      plots: [
        { index: 0, owned: true, cropId: "potato", white: 2, green: 0, red: 0 },
        { index: 1, owned: true, cropId: "radish", white: 0, green: 0, red: 3 },
        { index: 2, owned: false, cropId: null, white: 0, green: 0, red: 0 },
        { index: 3, owned: false, cropId: null, white: 0, green: 0, red: 0 },
        { index: 4, owned: false, cropId: null, white: 0, green: 0, red: 0 },
      ],
    },
    {
      seat: 1,
      kind: "cpu",
      name: "CPU1",
      coins: 9,
      plots: [
        { index: 0, owned: true, cropId: "onion", white: 0, green: 3, red: 0 },
        { index: 1, owned: false, cropId: null, white: 0, green: 0, red: 0 },
        { index: 2, owned: false, cropId: null, white: 0, green: 0, red: 0 },
        { index: 3, owned: false, cropId: null, white: 0, green: 0, red: 0 },
        { index: 4, owned: false, cropId: null, white: 0, green: 0, red: 0 },
      ],
    },
    {
      seat: 2,
      kind: "cpu",
      name: "CPU2",
      coins: 8,
      plots: [
        { index: 0, owned: false, cropId: null, white: 0, green: 0, red: 0 },
        { index: 1, owned: false, cropId: null, white: 0, green: 0, red: 0 },
        { index: 2, owned: false, cropId: null, white: 0, green: 0, red: 0 },
        { index: 3, owned: false, cropId: null, white: 0, green: 0, red: 0 },
        { index: 4, owned: false, cropId: null, white: 0, green: 0, red: 0 },
      ],
    },
  ],
  market: [
    { instanceId: "m1", cropId: "radish" },
    { instanceId: "m2", cropId: "onion" },
    { instanceId: "m3", cropId: "pumpkin" },
  ],
  cropDeckCount: 12,
  cropDiscard: [{ instanceId: "d1", cropId: "radish" }],
  eventRow: [
    { instanceId: "e1", cropId: "corn", delta: 4 },
    { instanceId: "e2", cropId: "potato", delta: -2 },
    { instanceId: "e3", cropId: "onion", delta: 2 },
    { instanceId: "e4", cropId: "pumpkin", delta: -4 },
  ],
  eventActive: [{ instanceId: "e0", cropId: "potato", delta: 2 }],
  eventDeckCount: 5,
  eventDiscard: [],
  drawnEventCount: 5,
  cropIdsInGame: ["potato", "corn", "onion", "pumpkin"],
  legalActions: [
    { type: "pass" },
    { type: "plant", marketIndex: 1, target: "newLand" },
    { type: "plant", marketIndex: 0, target: { plotIndex: 1 } },
  ],
};
