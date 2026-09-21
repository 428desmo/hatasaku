import cropsData from "../../data/crops.json" with { type: "json" };
import type { CropDef, CropId } from "./types.js";

export const cropList: CropDef[] = cropsData.crops as CropDef[];
export const EVENT_DELTAS_DATA: number[] = cropsData.eventDeltas;

const byId = new Map(cropList.map((c) => [c.id, c]));

export function cropDef(id: CropId): CropDef {
  const found = byId.get(id);
  if (!found) throw new Error(`unknown crop: ${id}`);
  return found;
}

export function cropName(id: CropId): string {
  return cropDef(id).name;
}

export function cropSpec(id: CropId): string {
  const d = cropDef(id);
  const cd = d.cooldown === 0 ? "連作障害なし" : `連作クールダウン${d.cooldown}ラウンド`;
  return `栽培${d.cost}G / 待機${d.wait}ラウンド / 収穫${d.harvest}ラウンド / 収入${d.baseIncome}G（最低${d.floor}G） / ${cd}`;
}

export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}
