// StickBuddies — EARS. They listen to the sound your computer is playing and figure out if it's MUSIC.
//
// How: music has a steady BEAT (boom... boom... boom...). Talking and game sounds don't.
// They check 3 clues, and it only counts as music if ALL THREE are true:
//   - BEAT:   the sound "hits" repeat in a pattern
//   - STEADY: the speed of that pattern stays the same (talking wanders around)
//   - NO GAPS: music keeps going, talking has tiny silences between words
//   1. Many times a second they measure how much the sound suddenly got louder ("onsets" — drum hits,
//      notes starting).
//   2. Every half second they look at the last 8 seconds of onsets and check if they repeat at a steady
//      speed (that's called autocorrelation). A strong, steady repeat = a beat = music.
//   3. The speed of the repeat is the tempo (BPM), so they can dance ON the beat.
// Nothing is recorded or saved, and the sound never leaves your PC. They only measure it.
'use strict';

const ears = {
  ok: false, level: -100, bpm: 0, bps: 0, beatiness: 0, musicScore: 0, isMusic: false, bright: 0, t0: 0,
  steady: 0, gaps: 1, tempos: [], energy: [],
  async start() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      stream.getVideoTracks().forEach(t => t.stop()); // they only need to hear, not see
      const track = stream.getAudioTracks()[0];
      if (!track) { console.log('ears: no sound to listen to'); return; }
      const ac = new AudioContext();
      const src = ac.createMediaStreamSource(new MediaStream([track]));
      const an = ac.createAnalyser();
      an.fftSize = 2048; an.smoothingTimeConstant = 0;
      src.connect(an); // (not connected to the speakers, so nothing is played twice)
      Object.assign(this, { ac, an, freq: new Float32Array(an.frequencyBinCount), prev: new Float32Array(an.frequencyBinCount), wave: new Float32Array(an.fftSize), env: [] });
      this.ok = true;
      console.log('ears: listening to the computer sound');
      setInterval(() => this.sample(), 10);   // 100 times a second
      setInterval(() => this.think(), 500);   // twice a second
      setInterval(() => console.log(`ears: loudness ${Math.round(this.level)} dB · beat ${this.beatiness.toFixed(2)} · steady ${this.steady.toFixed(2)} · gaps ${this.gaps.toFixed(2)} · ${Math.round(this.bpm)} BPM · music: ${this.isMusic ? 'YES' : 'no'}`), 30000);
    } catch (e) { console.log('ears: could not listen - ' + e.message); }
  },
  // How much did the sound just "hit"? (sum of every frequency that got louder)
  sample() {
    const { an, freq, prev, wave } = this;
    an.getFloatFrequencyData(freq);
    let flux = 0, total = 0, high = 0;
    const top = Math.min(freq.length, 400);
    for (let i = 1; i < top; i++) {
      const m = Math.pow(10, Math.max(freq[i], -140) / 20);
      const d = m - prev[i];
      if (d > 0) flux += d;
      prev[i] = m; total += m; if (i > 120) high += m;
    }
    an.getFloatTimeDomainData(wave);
    let sq = 0; for (let i = 0; i < wave.length; i++) sq += wave[i] * wave[i];
    this.energy.push(sq / wave.length);
    if (this.energy.length > 400) this.energy.shift(); // last 4 seconds
    this.level = lerp(this.level, 10 * Math.log10(sq / wave.length + 1e-12), .1);
    if (total > 0) this.bright = lerp(this.bright, high / total, .02);
    this.env.push(flux);
    if (this.env.length > 800) this.env.shift();
  },
  // Is there a steady beat? How fast?
  think() {
    const env = this.env, n = env.length;
    if (n < 400) return;
    let mean = 0; for (const v of env) mean += v; mean /= n;
    const x = env.map(v => v - mean);
    const r = lag => { let s = 0; for (let i = lag; i < n; i++) s += x[i] * x[i - lag]; return s / (n - lag); };
    const r0 = r(0) || 1e-12;
    let bestLag = 0, best = -1;
    for (let lag = 32; lag <= 100; lag++) { // 60 to 190 beats per minute
      const sc = (r(lag) + .5 * r(Math.min(lag * 2, n - 1))) / r0;
      if (sc > best) { best = sc; bestLag = lag; }
    }
    this.beatiness = lerp(this.beatiness, Math.max(0, best), .4);
    // STEADY: does the tempo stay the same? (music does; talking wanders around)
    let t = 6000 / bestLag; while (t < 75) t *= 2; while (t >= 150) t /= 2;
    this.tempos.push(t); if (this.tempos.length > 12) this.tempos.shift();
    const mid = [...this.tempos].sort((a, b) => a - b)[this.tempos.length >> 1];
    this.steady = this.tempos.filter(v => Math.abs(v - mid) / mid < .06).length / this.tempos.length;
    // GAPS: how often does the sound drop to almost nothing? (the little silences between words)
    const avgE = this.energy.reduce((s, v) => s + v, 0) / (this.energy.length || 1);
    this.gaps = avgE > 0 ? this.energy.filter(v => v < avgE * .08).length / this.energy.length : 1;
    const loudEnough = this.level > -58;
    const heardBeat = loudEnough && this.beatiness > .15 && this.steady >= .5 && this.gaps < .12;
    // slow to decide, slow to give up: one quiet moment doesn't mean the song ended
    this.musicScore += ((heardBeat ? 1 : 0) - this.musicScore) * (heardBeat ? .12 : .04);
    if (this.level < -60) this.quietFor = (this.quietFor || 0) + .5; else this.quietFor = 0;
    const was = this.isMusic;
    if (this.musicScore > .5) this.isMusic = true;
    if (this.musicScore < .12 || this.quietFor > 3) this.isMusic = false;
    // SURE: a strong, steady, gap-free beat for a while. Needed before they dance to a plain video.
    const sureNow = this.isMusic && this.musicScore > .75 && this.steady >= .75 && this.gaps < .06;
    this.sureFor = sureNow ? (this.sureFor || 0) + .5 : 0;
    if (this.isMusic !== was) console.log(this.isMusic ? `ears: that's MUSIC! (${Math.round(6000 / bestLag)} BPM)` : 'ears: music stopped');
    if (!(loudEnough && this.beatiness > .15)) return;
    // tempo + where the beats land, so they can dance on the beat
    let bpm = 6000 / bestLag;
    while (bpm < 75) bpm *= 2;
    while (bpm > 170) bpm /= 2;
    this.bpm = this.bpm ? lerp(this.bpm, bpm, .3) : bpm;
    const lag = Math.round(6000 / this.bpm);
    let bestOff = 0, bestSum = -1;
    for (let o = 0; o < lag; o++) {
      let s = 0; for (let k = 0; k < 6; k++) { const i = n - 1 - o - k * lag; if (i >= 0) s += env[i]; }
      if (s > bestSum) { bestSum = s; bestOff = o; }
    }
    this.bps = this.bpm / 60;
    this.t0 = performance.now() / 1000 - bestOff / 100; // when the last beat happened
  },
  // Counts beats as time goes on (1, 2, 3, ...), lined up with the music.
  beat() { return this.bps ? (performance.now() / 1000 - this.t0) * this.bps : realNow * 2; },
  // What does the music FEEL like?
  mood() {
    if (!this.isMusic) return null;
    if (this.bpm >= 135 && this.level > -32) return 'epic';
    if (this.bpm < 92 || this.level < -42) return 'calm';
    if (this.bright > .32) return 'electronic';
    return this.bpm > 118 ? 'happy' : 'groove';
  },
};
