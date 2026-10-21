/** Original, quiet pentatonic score and tactile effects synthesized locally. */
type Sound = 'select' | 'plant' | 'coin' | 'pass' | 'curse' | 'start' | 'win' | 'turn';
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
export class FarmAudio {
  music = true;
  effects = true;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private fxBus: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private next = 0;
  private step = 0;
  private running = false;

  async unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain(); this.master.gain.value = .55;
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -18; compressor.ratio.value = 5;
        this.master.connect(compressor); compressor.connect(this.context.destination);
        this.musicBus = this.context.createGain(); this.musicBus.gain.value = this.music ? .13 : 0;
        this.fxBus = this.context.createGain(); this.fxBus.gain.value = .25;
        this.musicBus.connect(this.master); this.fxBus.connect(this.master);
      }
      if (this.context.state === 'suspended') await this.context.resume();
      if (this.running && this.music) this.schedule();
    } catch { /* Silent play remains available when audio is unavailable. */ }
  }
  start() { this.running = true; this.schedule(); }
  stop() { this.running = false; this.clear(); }
  setMusic(on: boolean) {
    this.music = on;
    if (this.context && this.musicBus) this.musicBus.gain.setTargetAtTime(on ? .13 : 0, this.context.currentTime, .12);
    if (on && this.running) this.schedule(); else this.clear();
  }
  async visibility(hidden: boolean) {
    if (hidden) { this.clear(); await this.context?.suspend().catch(() => {}); }
    else { await this.unlock(); }
  }
  private clear() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  private note(note: number, at: number, duration: number, volume: number, bus: GainNode, type: OscillatorType = 'sine') {
    const ctx = this.context!;
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = type; osc.frequency.value = midi(note);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    osc.connect(gain); gain.connect(bus); osc.start(at); osc.stop(at + duration + .05);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  private schedule() {
    if (this.timer || !this.context || this.context.state !== 'running' || !this.music || !this.running || document.hidden) return;
    this.next = this.context.currentTime + .08;
    const tick = () => {
      const ctx = this.context!;
      while (this.next < ctx.currentTime + .22) {
        // Four two-bar voicings, a plucked marimba-like melody and warm bass.
        const chord = [[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,67]][Math.floor(this.step / 16) % 4]!;
        const phrase = [0,2,1,3,2,-1,1,-1,3,2,1,-1,0,1,2,-1];
        const index = phrase[this.step % 16]!;
        if (index >= 0) {
          const n = chord[index]! + 12;
          this.note(n, this.next, .75, .52, this.musicBus!);
          this.note(n + 12, this.next, .23, .055, this.musicBus!);
        }
        if (this.step % 4 === 0) this.note(chord[0]! - 24, this.next, 1.2, .64, this.musicBus!, 'triangle');
        if (this.step % 8 === 0) chord.slice(1).forEach((n,i) => this.note(n, this.next + i * .035, 1.7, .08, this.musicBus!));
        this.next += 60 / 88 / 2;
        this.step++;
      }
    };
    tick(); this.timer = setInterval(tick, 90);
  }
  play(sound: Sound) {
    if (!this.effects || !this.context || this.context.state !== 'running' || !this.fxBus) return;
    const at = this.context.currentTime + .005;
    const sounds: Record<Sound, number[]> = {select:[76], plant:[48,55,64], coin:[83,88], pass:[55], curse:[51,50,43], start:[60,64,67,72], win:[60,64,67,72,76,79,84], turn:[72]};
    sounds[sound].forEach((n,i) => this.note(n, at + i * (sound === 'win' ? .11 : .045), sound === 'win' ? .7 : .19, sound === 'turn' ? .12 : .36, this.fxBus!, sound === 'plant' || sound === 'pass' ? 'triangle' : 'sine'));
  }
}
