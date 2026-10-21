import type { HarvestDetail } from '../src/engine/types.js';
export type HarvestWave = {seat: number; details: HarvestDetail[]; total: number};
/** Bounded by player count, never by the number of farms. */
export function harvestWaves(details: HarvestDetail[], turnOrder: number[]): HarvestWave[] {
  return turnOrder.flatMap(seat => {
    const hits = details.filter(d => d.seat === seat);
    return hits.length ? [{seat, details:hits, total:hits.reduce((n,d) => n+d.gain,0)}] : [];
  });
}
export const harvestTiming = {opening:220, wave:90, settle:400, empty:180} as const;
export function harvestBudget(playersWithIncome: number): number {
  return playersWithIncome === 0 ? harvestTiming.empty : harvestTiming.opening + Math.min(5, Math.max(0, playersWithIncome)) * harvestTiming.wave + harvestTiming.settle;
}

/** Interruptible waits: skip finishes the current sequence, cancel abandons it. */
export class Motion {
  private generation = 0;
  private wake: (() => void) | null = null;
  fast = false;
  begin() { this.cancel(); this.fast = false; return this.generation; }
  cancel() { this.generation++; this.wake?.(); this.wake = null; }
  skip() { this.fast = true; this.wake?.(); }
  valid(token: number) { return token === this.generation; }
  async wait(ms: number, token: number, skippable = true) {
    if (!this.valid(token)) throw new Interrupted();
    if ((!this.fast || !skippable) && ms > 0) await new Promise<void>(resolve => {
      const timer = setTimeout(done, ms);
      const self = this;
      function done() { clearTimeout(timer); self.wake = null; resolve(); }
      this.wake = done;
    });
    if (!this.valid(token)) throw new Interrupted();
  }
}
export class Interrupted extends Error {}

/** Lost harvest count is a time warning, independent of affordability or learning mode. */
export function harvestWarning(round:number,lastRound:number,wait:number,harvest:number) {
  const available=Math.max(0,Math.min(harvest,lastRound-(round+wait)+1));
  const lost=harvest-available;
  if(!lost)return null;
  return {available,lost,mark:available===0?'❌':`🔺−${lost}`,label:available===0?'今から植えてもシーズン内に収穫できません':`今から植えると${harvest}回のうち${available}回だけ収穫できます（${lost}回分は間に合いません）`};
}
