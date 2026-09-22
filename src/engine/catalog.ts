import cropsData from "../../data/crops.json" with { type: "json" };
import type { CropDef, CropId, CropType, Mode } from "./types.js";

export const cropList: CropDef[] = cropsData.crops as CropDef[];
export const EVENT_DELTAS_DATA: number[] = cropsData.eventDeltas;

const byId = new Map(cropList.map((c) => [c.id, c]));

export function cropsForMode(mode: Mode): CropDef[] {
  return cropList.filter((c) => c.pool === "common" || c.pool === mode);
}

export function cropDef(id: CropId): CropDef {
  const found = byId.get(id);
  if (!found) throw new Error(`unknown crop: ${id}`);
  return found;
}

export function cropName(id: CropId): string {
  return cropDef(id).name;
}

export const CROP_TYPE_LABEL: Record<CropType, string> = {
  immediate: "即時型",
  lump: "一括型",
  long: "長期型",
  mid: "中間型",
};

const CROP_SHORT: Record<string, string> = {
  radish: "ラディ",
  komatsuna: "コマツナ",
  potato: "ジャガ",
  corn: "トウモロ",
  onion: "ネギ",
  edamame: "エダマメ",
  sweetpotato: "サツマ",
  pumpkin: "カボチャ",
  tomato: "トマト",
  watermelon: "スイカ",
  asparagus: "アスパラ",
  burdock: "ゴボウ",
  pepper: "ピーマン",
  melon: "メロン",
};

export function cropTypeLabel(id: CropId): string {
  return CROP_TYPE_LABEL[cropDef(id).type];
}

export function cropBlurb(id: CropId): string {
  const d = cropDef(id);
  const cool = d.cooldown === 0 ? "連作障害なし" : `休${d.cooldown}`;
  if (d.type === "immediate") {
    return `即時型。待${d.wait}・収${d.harvest}と短く、すぐ現金になる。${cool}。`;
  }
  if (d.type === "mid") {
    return `中間型。待ちと収穫の長さが釣り合っている。${cool}。`;
  }
  if (d.type === "long") {
    return `長期型。収穫が長く続くが、実るまでも長い。${cool}。`;
  }
  return `一括型。収穫は短いが高収入。待ちが長い。${cool}。`;
}

export function cropShortName(id: CropId): string {
  return CROP_SHORT[id] ?? cropName(id);
}

export function cropSpec(id: CropId): string {
  const d = cropDef(id);
  const cd = d.cooldown === 0 ? "連作障害なし" : `連作クールダウン${d.cooldown}ラウンド`;
  return `栽培${d.cost}G / 待機${d.wait}ラウンド / 収穫${d.harvest}ラウンド / 収入${d.baseIncome}G（最低${d.floor}G） / ${cd}`;
}

export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}
