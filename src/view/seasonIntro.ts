import { cropName } from "../engine/catalog.js";
import type { CropId } from "../engine/types.js";

export type SeasonIntroCurseAnnounce = {
  /** e.g. "AliceとBobが「呪い」の権利を得ました。" */
  recipientsLead: string;
  encouragement: string;
  whatIs: string;
};

export type SeasonIntroAnnounce = {
  cropLead: string;
  cropNames: string[];
  /** Only when someone holds a curse right (multi-season, season 2+). */
  curse: SeasonIntroCurseAnnounce | null;
};

/** Japanese name list: A / AとB / A、BとC */
export function joinPlayerNames(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0]!;
  if (clean.length === 2) return `${clean[0]}と${clean[1]}`;
  return `${clean.slice(0, -1).join("、")}と${clean[clean.length - 1]}`;
}

export const CURSE_WHAT_IS =
  "呪いとは、自分の手番の最初に、今シーズンの作物から1種類を宣言できる権利です。宣言した作物の収入はしばらくのあいだ下がり（植えている人すべてに効きます）、宣言してもその手番では続けて植えるかパスできます。1シーズンに1回だけ使えます。";

export function buildSeasonIntroAnnounce(input: {
  cropIds: CropId[];
  playerNames: string[];
  curseReadySeats: number[];
  multiSeason: boolean;
}): SeasonIntroAnnounce {
  const cropNames = input.cropIds.map((id) => cropName(id));
  const seats = input.curseReadySeats.filter((s) => s >= 0 && s < input.playerNames.length);
  const curse =
    input.multiSeason && seats.length > 0
      ? {
          recipientsLead: `${joinPlayerNames(seats.map((s) => input.playerNames[s] ?? `席${s}`))}が「呪い」の権利を得ました。`,
          encouragement: "使えそうなら「呪い」を使って頑張ってください。",
          whatIs: CURSE_WHAT_IS,
        }
      : null;
  return {
    cropLead: "今シーズンで使用する作物は次の4種類です。",
    cropNames,
    curse,
  };
}

export function formatSeasonIntroText(announce: SeasonIntroAnnounce): string {
  const lines = [announce.cropLead, announce.cropNames.map((n) => `・${n}`).join("\n")];
  if (announce.curse) {
    lines.push(
      "",
      announce.curse.recipientsLead,
      announce.curse.encouragement,
      announce.curse.whatIs,
    );
  }
  return lines.join("\n");
}
