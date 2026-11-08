// Motor de som 100% sintetizado (Web Audio API) — sem arquivos de áudio.
const STORE_KEY = 'pulso:sound';

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.enabled = this.readPref();
    this.track = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.listeners = new Set();
  }

  readPref() {
    try {
      return localStorage.getItem(STORE_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    fn(this.enabled);
  }

  /** Precisa ser chamado num gesto do usuário (clique/toque). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.8 : 0;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.32;
      this.musicGain.connect(this.master);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.pending !== undefined) {
      const p = this.pending;
      this.pending = undefined;
      this.music(p);
    }
  }

  toggle(force) {
    this.enabled = typeof force === 'boolean' ? force : !this.enabled;
    try {
      localStorage.setItem(STORE_KEY, this.enabled ? 'on' : 'off');
    } catch {}
    this.unlock();
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 0.8 : 0, this.ctx.currentTime, 0.05);
    this.listeners.forEach((fn) => fn(this.enabled));
    return this.enabled;
  }

  get ready() {
    return this.ctx && this.enabled;
  }

  // ---------- primitivas ----------
  tone(freq, { at = 0, dur = 0.15, type = 'sine', vol = 0.3, attack = 0.005, slide = 0, dest } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ at = 0, dur = 0.08, vol = 0.2, freq = 6000, q = 0.8, type = 'highpass', dest } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ---------- efeitos ----------
  play(name) {
    if (!this.ready) return;
    const fx = this.fx[name];
    if (fx) fx.call(this);
  }

  fx = {
    tap() {
      this.tone(660, { dur: 0.08, type: 'triangle', vol: 0.2 });
    },
    join() {
      this.tone(523, { dur: 0.1, type: 'triangle', vol: 0.22 });
      this.tone(784, { at: 0.07, dur: 0.16, type: 'triangle', vol: 0.22 });
    },
    leave() {
      this.tone(392, { dur: 0.16, type: 'triangle', vol: 0.18, slide: -120 });
    },
    tick() {
      this.tone(1200, { dur: 0.04, type: 'square', vol: 0.06 });
    },
    urgent() {
      this.tone(880, { dur: 0.07, type: 'square', vol: 0.1 });
      this.tone(880, { at: 0.12, dur: 0.07, type: 'square', vol: 0.08 });
    },
    count() {
      this.tone(440, { dur: 0.25, type: 'triangle', vol: 0.3 });
      this.noise({ dur: 0.1, vol: 0.1, freq: 2000 });
    },
    go() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, { at: i * 0.05, dur: 0.35, type: 'sawtooth', vol: 0.12 }));
    },
    whoosh() {
      this.noise({ dur: 0.45, vol: 0.18, freq: 900, type: 'bandpass', q: 0.6 });
      this.tone(220, { dur: 0.4, type: 'sine', vol: 0.15, slide: 500 });
    },
    submit() {
      this.tone(587, { dur: 0.09, type: 'triangle', vol: 0.25 });
      this.tone(880, { at: 0.06, dur: 0.14, type: 'triangle', vol: 0.22 });
    },
    correct() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, { at: i * 0.08, dur: 0.3, type: 'triangle', vol: 0.25 }));
      this.tone(1568, { at: 0.36, dur: 0.5, type: 'sine', vol: 0.12 });
    },
    wrong() {
      this.tone(311, { dur: 0.22, type: 'sawtooth', vol: 0.12, slide: -60 });
      this.tone(233, { at: 0.2, dur: 0.4, type: 'sawtooth', vol: 0.12, slide: -60 });
    },
    timeup() {
      this.tone(196, { dur: 0.9, type: 'sine', vol: 0.35 });
      this.tone(392, { dur: 0.7, type: 'triangle', vol: 0.12 });
      this.noise({ dur: 0.6, vol: 0.12, freq: 3000 });
    },
    reveal() {
      [392, 523, 659].forEach((f, i) => this.tone(f, { at: i * 0.06, dur: 0.5, type: 'triangle', vol: 0.2 }));
    },
    drumroll() {
      for (let i = 0; i < 34; i++) this.noise({ at: i * 0.055, dur: 0.06, vol: 0.05 + i * 0.006, freq: 1800, type: 'bandpass', q: 0.9 });
    },
    cymbal() {
      this.noise({ dur: 1.6, vol: 0.35, freq: 5000 });
      this.tone(98, { dur: 0.5, type: 'sine', vol: 0.5, slide: -40 });
    },
    fanfare() {
      const seq = [
        [523, 0, 0.18],
        [523, 0.18, 0.12],
        [523, 0.3, 0.12],
        [698, 0.42, 0.5],
        [784, 0.95, 0.18],
        [698, 1.13, 0.18],
        [784, 1.31, 0.18],
        [1047, 1.5, 0.9],
      ];
      for (const [f, at, dur] of seq) {
        this.tone(f, { at, dur, type: 'sawtooth', vol: 0.1 });
        this.tone(f / 2, { at, dur, type: 'triangle', vol: 0.12 });
      }
      this.fx.cymbal.call(this);
    },
  };

  // ---------- música (sequenciador) ----------
  music(name) {
    if (!this.ctx) {
      this.pending = name; // toca assim que o áudio for liberado
      return;
    }
    if (this.track === name) return;
    this.stopMusic();
    if (!name) return;
    this.track = name;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  stopMusic() {
    clearInterval(this.timer);
    this.timer = null;
    this.track = null;
  }

  schedule() {
    if (!this.ctx) return;
    const pat = PATTERNS[this.track];
    if (!pat) return;
    const stepDur = 60 / pat.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      if (this.enabled) pat.play(this, this.step, this.nextTime - this.ctx.currentTime, stepDur);
      this.step += 1;
      this.nextTime += stepDur;
    }
  }
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// Progressão Lá menor · Fá · Dó · Sol
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];

const PATTERNS = {
  lobby: {
    bpm: 104,
    play(s, step, at, sd) {
      const bar = Math.floor(step / 16) % 4;
      const chord = CHORDS[bar];
      const pos = step % 16;
      const dest = s.musicGain;
      if (pos % 4 === 0) s.tone(NOTE(chord[0] - 12), { at, dur: sd * 3, type: 'triangle', vol: 0.32, dest });
      if (pos % 2 === 0) {
        const n = chord[(pos / 2) % 3] + (pos >= 8 ? 12 : 0);
        s.tone(NOTE(n + 12), { at, dur: sd * 1.6, type: 'sine', vol: 0.14, dest });
      }
      if (pos === 4 || pos === 12) s.noise({ at, dur: 0.05, vol: 0.06, freq: 7000, dest });
      if (pos % 4 === 2) s.noise({ at, dur: 0.025, vol: 0.03, freq: 9000, dest });
    },
  },
  question: {
    bpm: 128,
    play(s, step, at, sd) {
      const bar = Math.floor(step / 16) % 2;
      const pos = step % 16;
      const dest = s.musicGain;
      const root = bar === 0 ? 45 : 43;
      if (pos % 2 === 0) s.tone(NOTE(root - 12 + (pos % 8 === 6 ? 7 : 0)), { at, dur: sd * 0.9, type: 'sawtooth', vol: 0.12, dest });
      s.noise({ at, dur: 0.02, vol: pos % 4 === 0 ? 0.05 : 0.02, freq: 8000, dest });
      if (pos % 4 === 0) s.tone(70, { at, dur: 0.12, type: 'sine', vol: 0.45, slide: -30, dest });
      if (pos === 3 || pos === 11) s.tone(NOTE(root + 24 + 3), { at, dur: sd * 0.8, type: 'square', vol: 0.03, dest });
    },
  },
};

export const sound = new SoundEngine();

/** Liga um botão de som (ícone volume) ao motor. */
export function bindSoundButton(btn, refreshIcons) {
  sound.onChange((on) => {
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Desligar som' : 'Ligar som');
    btn.title = on ? 'Som ligado' : 'Som desligado';
    btn.innerHTML = `<i data-lucide="${on ? 'volume-2' : 'volume-x'}"></i>`;
    refreshIcons?.();
  });
  btn.addEventListener('click', () => {
    const on = sound.toggle();
    if (on) sound.play('tap');
  });
  const unlockOnce = () => sound.unlock();
  window.addEventListener('pointerdown', unlockOnce, { once: true });
  window.addEventListener('keydown', unlockOnce, { once: true });
}
