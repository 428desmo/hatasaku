import { describe, expect, it } from "vitest";
import { samplePublicView } from "./fixture.js";
import { toPresentation } from "./presentation.js";
import { renderText } from "./text.js";

describe("text renderer", () => {
  const text = renderText(toPresentation(samplePublicView, 0));

  it("shows mode, round, and whose turn", () => {
    expect(text).toContain("チュートリアル  ラウンド 3/10");
    expect(text).toContain("手番: 席0 プレイヤー1（あなた）");
  });

  it("marks the current event and keeps lookahead", () => {
    expect(text).toContain("〈トウモロコシ +4〉");
    expect(text).toContain("ジャガイモ -2");
    expect(text).toContain("発動中:");
    expect(text).toContain("ジャガイモ +2");
  });

  it("distinguishes waiting, empty-with-previous, and unowned plots", () => {
    expect(text).toContain("1:ジャガイモ 白2");
    expect(text).toContain("2:空き 前ラディッシュ 赤3");
    expect(text).toContain("3:未取得");
  });

  it("lists legal actions without inventing extra ones", () => {
    expect(text).toContain("[P] パス");
    expect(text).toContain("新しい農地へ");
    expect(text).toContain("農地2へ");
    expect(text).not.toContain("場札3");
  });
});
