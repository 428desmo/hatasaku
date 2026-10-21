import {harvestWarning} from './experience.js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { harvestBudget, harvestWaves, Interrupted, Motion } from './experience.js';
import type { HarvestDetail } from '../src/engine/types.js';
const detail = (seat: number, plotIndex: number, gain = 5): HarvestDetail => ({ seat,plotIndex,gain,cropId:'radish',base:7,others:0,eventSum:0,events:[],raw:7,floor:3 });
describe('bounded, interruptible presentation', () => {
  afterEach(() => vi.useRealTimers());
  test('thirty farms need at most five waves; coin totals stay exact', () => {
    const details = Array.from({length:30},(_,i) => detail(Math.floor(i/6),i%6));
    const waves = harvestWaves(details,[2,3,4,0,1]);
    expect(waves.map(w => w.seat)).toEqual([2,3,4,0,1]);
    expect(waves.reduce((n,w) => n+w.total,0)).toBe(150);
    expect(waves.flatMap(w => w.details)).toHaveLength(30);
    expect(harvestBudget(waves.length)).toBeLessThan(1200);
    expect(harvestWaves([], [0,1,2])).toEqual([]);
    expect(harvestBudget(0)).toBeLessThan(200);
  });
  test('skip resolves the current wait and all remaining waits', async () => {
    vi.useFakeTimers(); const motion = new Motion(); const token = motion.begin();
    const pending = motion.wait(10000,token); motion.skip(); await pending;
    await motion.wait(10000,token); expect(vi.getTimerCount()).toBe(0);
  });
  test('skip cannot bypass a pause or background gate', async () => {
    vi.useFakeTimers(); const motion = new Motion(); const token = motion.begin();
    motion.skip(); let resumed = false;
    const pending = motion.wait(120,token,false).then(() => {resumed=true;});
    await vi.advanceTimersByTimeAsync(100); expect(resumed).toBe(false);
    await vi.advanceTimersByTimeAsync(20); await pending; expect(resumed).toBe(true);
  });
  test('cancel interrupts old work without consuming a new sequence', async () => {
    vi.useFakeTimers(); const motion = new Motion(); const old = motion.begin();
    const pending = motion.wait(10000,old).catch(e => e);
    const next = motion.begin(); expect(await pending).toBeInstanceOf(Interrupted);
    expect(motion.valid(next)).toBe(true); expect(motion.fast).toBe(false);
    const future = motion.wait(20,next); await vi.advanceTimersByTimeAsync(20); await future;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('market harvest warning',()=>{
 test('counts harvests including the last round and omits a full-harvest warning',()=>{
  expect(harvestWarning(15,18,1,3)).toBeNull();
  expect(harvestWarning(16,18,1,3)).toMatchObject({available:2,lost:1,mark:'🔺−1'});
  expect(harvestWarning(17,18,1,3)).toMatchObject({available:1,lost:2,mark:'🔺−2'});
  expect(harvestWarning(18,18,1,3)).toMatchObject({available:0,lost:3,mark:'❌'});
  expect(harvestWarning(14,18,4,1)).toBeNull();
  expect(harvestWarning(15,18,4,1)).toMatchObject({available:0});
 });
});
