import { joinPlayerNames } from "./seasonIntro.js";

export type HonorAnnounce = {
  kind: "season" | "match";
  /** e.g. "今シーズンが終了しました。" */
  lead: string;
  /** e.g. "Aliceが今シーズン1位です。おめでとうございます！" */
  award: string;
};

export function buildHonorAnnounce(input: {
  kind: "season" | "match";
  winnerNames: string[];
}): HonorAnnounce | null {
  const names = joinPlayerNames(input.winnerNames);
  if (!names) return null;
  if (input.kind === "season") {
    return {
      kind: "season",
      lead: "今シーズンが終了しました。",
      award: `${names}が今シーズン1位です。おめでとうございます！`,
    };
  }
  return {
    kind: "match",
    lead: "マッチが終了しました。",
    award: `${names}が総合優勝です。おめでとうございます！`,
  };
}

export function formatHonorAnnounceText(announce: HonorAnnounce): string {
  return `${announce.lead}\n${announce.award}`;
}
