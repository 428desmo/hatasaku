import { joinPlayerNames } from "./seasonIntro.js";

export type HonorAnnounce = {
  kind: "season" | "match" | "match-trail";
  /** e.g. "今シーズンが終了しました。" */
  lead: string;
  /** Award line, or null on match-trail (ceremony comes later). */
  award: string | null;
};

export function buildHonorAnnounce(input: {
  kind: "season" | "match" | "match-trail";
  winnerNames: string[];
  /** Season coins or match total for the winners (same value when tied). */
  winnerScore?: number | null;
}): HonorAnnounce | null {
  if (input.kind === "match-trail") {
    return {
      kind: "match-trail",
      lead: "マッチが終了しました。総合点の推移を見てください。",
      award: null,
    };
  }
  const names = joinPlayerNames(input.winnerNames);
  if (!names) return null;
  const score =
    input.winnerScore != null && Number.isFinite(input.winnerScore)
      ? `（${Math.round(input.winnerScore)}G）`
      : "";
  if (input.kind === "season") {
    return {
      kind: "season",
      lead: "今シーズンが終了しました。",
      award: `${names}が今シーズン1位です${score}。おめでとうございます！`,
    };
  }
  return {
    kind: "match",
    lead: "マッチが終了しました。",
    award: `${names}が総合優勝です${score}。おめでとうございます！`,
  };
}

export function formatHonorAnnounceText(announce: HonorAnnounce): string {
  return announce.award ? `${announce.lead}\n${announce.award}` : announce.lead;
}

export const FINAL_ROUND_TIP =
  "最終ラウンドです。新しく植えても間に合わないことが多いです。";

export const PROXY_TURN_NOTE = "時間切れのためCPUが代行しました。";
export const PROXY_HOLD_NOTE = "時間切れのため確認を進めました。";
