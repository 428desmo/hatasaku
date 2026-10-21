import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FarmAudio } from './audio.js';
let voices: ReturnType<typeof node>[];
function node() {
  return {connect:vi.fn(),disconnect:vi.fn(),gain:{value:1,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()},frequency:{value:0},threshold:{value:0},ratio:{value:0},type:'sine',start:vi.fn(),stop:vi.fn(),onended:null as null|(()=>void)};
}
class Context {
  currentTime=0;state='suspended';destination={};
  async resume(){this.state='running';}
  async suspend(){this.state='suspended';}
  createGain(){return node();}
  createDynamicsCompressor(){return node();}
  createOscillator(){const voice=node();voices.push(voice);return voice;}
}
describe('original browser audio',()=>{
  beforeEach(()=>{voices=[];vi.useFakeTimers();vi.stubGlobal('AudioContext',Context);vi.stubGlobal('document',{hidden:false});});
  afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
  test('starts after a gesture, never stacks music schedulers, and suspends in the background',async()=>{
    const audio=new FarmAudio();audio.start();expect(vi.getTimerCount()).toBe(0);
    await audio.unlock();expect(vi.getTimerCount()).toBe(1);expect(voices.length).toBeGreaterThan(0);
    await audio.unlock();audio.start();expect(vi.getTimerCount()).toBe(1);
    audio.setMusic(false);expect(vi.getTimerCount()).toBe(0);
    audio.setMusic(true);expect(vi.getTimerCount()).toBe(1);
    await audio.visibility(true);expect(vi.getTimerCount()).toBe(0);
    await audio.visibility(false);expect(vi.getTimerCount()).toBe(1);
    audio.stop();expect(vi.getTimerCount()).toBe(0);
  });
  test('effects have independent mute and disconnect completed voices',async()=>{
    const audio=new FarmAudio();audio.setMusic(false);await audio.unlock();
    audio.effects=false;audio.play('plant');expect(voices).toHaveLength(0);
    audio.effects=true;audio.play('plant');expect(voices).toHaveLength(3);
    for(const voice of voices){expect(voice.stop).toHaveBeenCalledOnce();voice.onended?.();expect(voice.disconnect).toHaveBeenCalledOnce();}
    audio.stop();
  });
  test('unavailable audio never blocks play',async()=>{
    vi.stubGlobal('AudioContext',class{constructor(){throw new Error('unsupported');}});
    const audio=new FarmAudio();await expect(audio.unlock()).resolves.toBeUndefined();
    expect(()=>{audio.start();audio.play('coin');audio.stop();}).not.toThrow();
  });
});
