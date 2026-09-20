import cropsData from "../../data/crops.json" with { type: "json" };
import type { CropDef, CropId } from "./types.js";

export const cropList: CropDef[] = cropsData.crops as CropDef[];

const byId = new Map(cropList.map((c) => [c.id, c]));

export function cropDef(id: CropId): CropDef {
  const found = byId.get(id);
  if (!found) throw new Error(`unknown crop: ${id}`);
  return found;
}

export function cropName(id: CropId): string {
  return cropDef(id).name;
}

export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}
