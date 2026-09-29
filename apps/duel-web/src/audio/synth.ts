// Every sound in the game is synthesized with the Web Audio API: no audio
// files to ship, license or load. Recipes take any (Offline)AudioContext
// and a destination, so they can also be rendered offline and measured.

export type SfxName =
  | "tap"
  | "deploy"
  | "set"
  | "policy"
  | "stance"
  | "attack"
  | "hit"
  | "fall"
  | "scandal"
  | "damage"
  | "votes"
  | "turn"
  | "draw"
  | "return"
  | "win"
  | "lose"
  | "blocked";

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  glideTo?: number;
  filter?: number;
  detune?: number;
}

function tone(ctx: BaseAudioContext, out: AudioNode, freq: number, start: number, dur: number, options: ToneOptions = {}): void {
  const { type = "sine", gain = 0.1, attack = 0.005, glideTo, filter, detune = 0 } = options;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
  osc.detune.value = detune;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let node: AudioNode = osc;
  if (filter !== undefined) {
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = filter;
    osc.connect(lowpass);
    node = lowpass;
  }
  node.connect(env);
  env.connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // A fixed pseudo-random sequence: the same noise every time.
    let seed = 12345;
    for (let i = 0; i < data.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

interface NoiseOptions {
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  sweepTo?: number;
  q?: number;
}

function noise(ctx: BaseAudioContext, out: AudioNode, start: number, dur: number, options: NoiseOptions = {}): void {
  const { gain = 0.1, filter = "lowpass", freq = 1000, sweepTo, q = 1 } = options;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const shape = ctx.createBiquadFilter();
  shape.type = filter;
  shape.Q.value = q;
  shape.frequency.setValueAtTime(freq, start);
  if (sweepTo !== undefined) shape.frequency.exponentialRampToValueAtTime(sweepTo, start + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  source.connect(shape);
  shape.connect(env);
  env.connect(out);
  source.start(start);
  source.stop(start + dur + 0.05);
}

const midi = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** Plays one sound effect at time `t`. */
export function playRecipe(ctx: BaseAudioContext, out: AudioNode, name: SfxName, t: number): void {
  switch (name) {
    case "tap":
      tone(ctx, out, 720, t, 0.06, { type: "triangle", gain: 0.12, glideTo: 520 });
      return;
    case "deploy":
      tone(ctx, out, 150, t, 0.16, { gain: 0.45, glideTo: 70 });
      noise(ctx, out, t, 0.09, { gain: 0.12, freq: 900 });
      return;
    case "set":
      noise(ctx, out, t, 0.2, { gain: 0.4, filter: "bandpass", freq: 2200, sweepTo: 700, q: 0.8 });
      return;
    case "policy":
      [0, 4, 7, 12].forEach((step, i) => tone(ctx, out, midi(76 + step), t + i * 0.055, 0.3, { gain: 0.07 }));
      tone(ctx, out, midi(64), t, 0.45, { type: "triangle", gain: 0.05 });
      return;
    case "stance":
      noise(ctx, out, t, 0.14, { gain: 0.3, filter: "bandpass", freq: 900, sweepTo: 1800, q: 1.2 });
      tone(ctx, out, 300, t, 0.12, { type: "triangle", gain: 0.08, glideTo: 450 });
      return;
    case "attack":
      noise(ctx, out, t, 0.24, { gain: 0.6, filter: "bandpass", freq: 350, sweepTo: 2600, q: 1.5 });
      return;
    case "hit":
      tone(ctx, out, 120, t, 0.3, { gain: 0.6, glideTo: 42 });
      noise(ctx, out, t, 0.14, { gain: 0.3, freq: 1800, sweepTo: 300 });
      return;
    case "fall":
      tone(ctx, out, 620, t, 0.5, { type: "triangle", gain: 0.1, glideTo: 140 });
      noise(ctx, out, t, 0.45, { gain: 0.12, freq: 3000, sweepTo: 250 });
      return;
    case "scandal":
      // A diminished stab, then a thump.
      for (const note of [58, 61, 64, 70]) {
        tone(ctx, out, midi(note), t, 0.7, { type: "sawtooth", gain: 0.045, filter: 1800, attack: 0.01 });
      }
      tone(ctx, out, 90, t, 0.35, { gain: 0.45, glideTo: 40 });
      return;
    case "damage":
      tone(ctx, out, 95, t, 0.22, { type: "square", gain: 0.06, glideTo: 60, filter: 500 });
      tone(ctx, out, 70, t, 0.25, { gain: 0.3, glideTo: 50 });
      return;
    case "votes":
      tone(ctx, out, midi(83), t, 0.12, { gain: 0.08 });
      tone(ctx, out, midi(88), t + 0.07, 0.22, { gain: 0.08 });
      return;
    case "turn":
      tone(ctx, out, midi(79), t, 0.45, { gain: 0.1 });
      tone(ctx, out, midi(84), t + 0.13, 0.6, { gain: 0.1 });
      tone(ctx, out, midi(72), t + 0.13, 0.6, { type: "triangle", gain: 0.04 });
      return;
    case "draw":
      noise(ctx, out, t, 0.11, { gain: 0.25, filter: "bandpass", freq: 3200, sweepTo: 1600, q: 0.9 });
      return;
    case "return":
      tone(ctx, out, 380, t, 0.28, { type: "triangle", gain: 0.09, glideTo: 900 });
      tone(ctx, out, midi(84), t + 0.2, 0.25, { gain: 0.05 });
      return;
    case "win":
      [72, 76, 79, 84].forEach((note, i) => {
        const last = i === 3;
        tone(ctx, out, midi(note), t + i * 0.13, last ? 1.1 : 0.3, { type: "triangle", gain: 0.12 });
        tone(ctx, out, midi(note), t + i * 0.13, last ? 1.1 : 0.3, { type: "sawtooth", gain: 0.025, filter: 2500 });
      });
      tone(ctx, out, midi(48), t + 0.39, 1.1, { type: "triangle", gain: 0.1 });
      return;
    case "lose":
      [67, 64, 60].forEach((note, i) => tone(ctx, out, midi(note), t + i * 0.3, 0.4, { type: "triangle", gain: 0.1 }));
      tone(ctx, out, midi(48), t + 0.9, 1.2, { type: "triangle", gain: 0.1 });
      tone(ctx, out, midi(51), t + 0.9, 1.2, { type: "triangle", gain: 0.06 });
      return;
    case "blocked":
      tone(ctx, out, 220, t, 0.09, { type: "triangle", gain: 0.09 });
      tone(ctx, out, 185, t + 0.09, 0.12, { type: "triangle", gain: 0.09 });
      return;
  }
}

export const ALL_SFX: SfxName[] = [
  "tap", "deploy", "set", "policy", "stance", "attack", "hit", "fall", "scandal",
  "damage", "votes", "turn", "draw", "return", "win", "lose", "blocked",
];

// --- Music -------------------------------------------------------------------
//
// Two procedurally-generated beds (no audio files to ship): a bright,
// bouncy "campaign rally" for the menu/lobby, and a tenser, driving
// "showdown" once an actual duel is on screen. Same synthesis toolkit for
// both -- different chords, rhythm and tempo are what make them read as
// distinct, not different instruments.

export type MusicTheme = "menu" | "duel";

// Menu: a punchy chord stab on every bar, an oom-pah bass alternating root
// and fifth, and a bubbly arpeggio skipping through the chord. Two bars
// per chord, C - G - Am - F, 132 bpm (a ~14.5-second loop).
const MENU_BPM = 132;
const MENU_STEP_SECONDS = 60 / MENU_BPM / 2;
const MENU_CHORDS = [
  [48, 52, 55], // C major
  [43, 47, 50], // G major
  [45, 48, 52], // A minor
  [41, 45, 48], // F major
];
const MENU_STEPS_PER_CHORD = 16; // two bars of eighths
// Which chord tone (0/1/2) or the root an octave up (3) the arpeggio plays
// on each eighth (-1: rest).
const MENU_ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 2, 1, 3];

function playMenuStep(ctx: BaseAudioContext, out: AudioNode, step: number, t: number): void {
  const chordIndex = Math.floor(step / MENU_STEPS_PER_CHORD) % MENU_CHORDS.length;
  const chord = MENU_CHORDS[chordIndex];
  const inChord = step % MENU_STEPS_PER_CHORD;

  // A short, bright stab on the chord change -- an accent, not a wash.
  if (inChord === 0) {
    for (const detune of [-6, 6]) {
      for (const note of chord) {
        tone(ctx, out, midi(note + 12), t, MENU_STEP_SECONDS * 3, { type: "sawtooth", gain: 0.045, attack: 0.01, filter: 1800, detune });
      }
    }
  }
  // A bouncy oom-pah bass: root on the downbeat, the fifth on the upbeat,
  // every quarter note.
  if (inChord % 2 === 0) {
    const onUpbeat = Math.floor(inChord / 2) % 2 === 1;
    const bassNote = (onUpbeat ? chord[2] : chord[0]) - 12;
    tone(ctx, out, midi(bassNote), t, MENU_STEP_SECONDS * 1.7, { type: "triangle", gain: 0.17, attack: 0.008, filter: 550 });
  }
  // A bubbly arpeggio skipping up and down through the chord, an octave
  // above the stab -- the part that actually makes it feel "fun."
  const arp = MENU_ARP[inChord];
  if (arp >= 0) {
    const note = (arp === 3 ? chord[0] + 12 : chord[arp]) + 24;
    tone(ctx, out, midi(note), t, 0.22, { type: "square", gain: 0.028, attack: 0.004, filter: 3000 });
  }
}

// Duel: a minor-key "showdown" -- i - VI - III - V (Am - F - C - E, the E
// major a dominant that keeps pulling back to Am), faster at 150 bpm, with
// a driving pulsed bass, a tight noise shaker on every eighth, a low tom
// thump on the backbeat, and a sparse, clipped motif instead of a
// continuously bubbling arpeggio -- reads as tenser and more urgent than
// the menu bed rather than just louder or faster.
const DUEL_BPM = 150;
const DUEL_STEP_SECONDS = 60 / DUEL_BPM / 2;
const DUEL_CHORDS = [
  [45, 48, 52], // A minor
  [41, 45, 48], // F major
  [48, 52, 55], // C major
  [40, 44, 47], // E major (dominant -- the pull back to A minor)
];
const DUEL_STEPS_PER_CHORD = 16;
// Sparser and more clipped than the menu's arpeggio -- a motif that
// punches through rather than filling every eighth.
const DUEL_ARP = [0, -1, 2, -1, 0, -1, 3, -1, 2, -1, 0, -1, 1, -1, 0, -1];

function playDuelStep(ctx: BaseAudioContext, out: AudioNode, step: number, t: number): void {
  const chordIndex = Math.floor(step / DUEL_STEPS_PER_CHORD) % DUEL_CHORDS.length;
  const chord = DUEL_CHORDS[chordIndex];
  const inChord = step % DUEL_STEPS_PER_CHORD;

  // A hard downbeat hit on the chord change -- tighter-filtered sawtooth
  // than the menu's stab, for a punchier "showdown" accent.
  if (inChord === 0) {
    for (const detune of [-4, 4]) {
      for (const note of chord) {
        tone(ctx, out, midi(note), t, DUEL_STEP_SECONDS * 2, { type: "sawtooth", gain: 0.06, attack: 0.004, filter: 900, detune });
      }
    }
  }
  // A driving pulsed bass -- root, root, fifth, root every bar -- more
  // urgency than the menu's alternating oom-pah.
  if (inChord % 2 === 0) {
    const beat = Math.floor(inChord / 2) % 4;
    const bassNote = (beat === 2 ? chord[2] : chord[0]) - 12;
    tone(ctx, out, midi(bassNote), t, DUEL_STEP_SECONDS * 1.3, { type: "square", gain: 0.16, attack: 0.004, filter: 700 });
  }
  // A tight noise shaker on every eighth for drive, plus a low tom thump
  // on the backbeat -- percussion the menu theme doesn't have.
  noise(ctx, out, t, 0.045, { gain: 0.05, filter: "highpass", freq: 6000 });
  if (inChord % 4 === 2) {
    tone(ctx, out, midi(chord[0] - 24), t, 0.12, { type: "sine", gain: 0.12, attack: 0.002, filter: 220 });
  }
  // A sparse, clipped motif -- punches through instead of bubbling
  // continuously like the menu's arpeggio.
  const arp = DUEL_ARP[inChord];
  if (arp >= 0) {
    const note = (arp === 3 ? chord[0] + 12 : chord[arp]) + 24;
    tone(ctx, out, midi(note), t, 0.14, { type: "square", gain: 0.032, attack: 0.003, filter: 2600 });
  }
}

/** Schedules music step `step` (an eighth note, in the given theme) at time `t`. */
export function playMusicStep(ctx: BaseAudioContext, out: AudioNode, theme: MusicTheme, step: number, t: number): void {
  if (theme === "duel") playDuelStep(ctx, out, step, t);
  else playMenuStep(ctx, out, step, t);
}

/** How long one music step lasts, in seconds, for the given theme. */
export function musicStepSeconds(theme: MusicTheme): number {
  return theme === "duel" ? DUEL_STEP_SECONDS : MENU_STEP_SECONDS;
}

// --- The crowd (the results screen) ---------------------------------------------
//
// "cheer": a burst of applause, a roar and a few "woo!" voices sweeping up.
// "groan": a disappointed "awww" sliding down, and a few polite claps.
// The applause is written sample by sample into a buffer (hundreds of
// claps, each a short burst of band-passed noise), so it costs one node.

export type CrowdMood = "cheer" | "groan";

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const applause = new WeakMap<BaseAudioContext, Map<CrowdMood, AudioBuffer>>();

/** Claps per second over time, for each mood. */
function clapRate(mood: CrowdMood, t: number): number {
  if (mood === "cheer") {
    if (t < 0.35) return 110 * (t / 0.35);
    if (t < 2.6) return 110;
    return Math.max(0, 110 * (1 - (t - 2.6) / 2.2));
  }
  // A few polite claps after the groan.
  if (t < 0.9 || t > 2.6) return 0;
  return 7;
}

function applauseBuffer(ctx: BaseAudioContext, mood: CrowdMood): AudioBuffer {
  let cache = applause.get(ctx);
  if (!cache) {
    cache = new Map();
    applause.set(ctx, cache);
  }
  const found = cache.get(mood);
  if (found) return found;

  const seconds = mood === "cheer" ? 5 : 3;
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(2, Math.floor(seconds * rate), rate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const random = mulberry(mood === "cheer" ? 7 : 11);
  const step = 0.005; // place claps in 5 ms slots

  for (let t = 0; t < seconds; t += step) {
    let expected = clapRate(mood, t) * step;
    while (expected > 0) {
      if (random() < Math.min(1, expected)) {
        const start = Math.floor((t + random() * step) * rate);
        // One clap: a short noise burst through a resonant band-pass.
        const centre = 700 + random() * 2000;
        const w = (2 * Math.PI * centre) / rate;
        const alpha = Math.sin(w) / (2 * 1.4);
        const a0 = 1 + alpha;
        const b0 = alpha / a0;
        const b2 = -alpha / a0;
        const a1 = (-2 * Math.cos(w)) / a0;
        const a2 = (1 - alpha) / a0;
        const length = Math.floor((0.018 + random() * 0.02) * rate);
        const gain = 0.25 + random() * 0.75;
        const pan = random();
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < length && start + i < left.length; i += 1) {
          const x = (random() * 2 - 1) * Math.exp(-i / (length / 4)) * gain;
          const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
          x2 = x1;
          x1 = x;
          y2 = y1;
          y1 = y;
          left[start + i] += y * (1 - pan * 0.6);
          right[start + i] += y * (0.4 + pan * 0.6);
        }
      }
      expected -= 1;
    }
  }

  // Normalize, so the level is set by the gain node.
  let peak = 0;
  for (let i = 0; i < left.length; i += 1) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  if (peak > 0) {
    for (let i = 0; i < left.length; i += 1) {
      left[i] /= peak;
      right[i] /= peak;
    }
  }
  cache.set(mood, buffer);
  return buffer;
}

// One crowd voice: a buzzy tone through two vowel formants, gliding in
// pitch and sliding between vowels ("ooo" -> "aah" for a cheer, back
// down for a groan).
function voice(ctx: BaseAudioContext, out: AudioNode, t: number, from: number, to: number, dur: number, gain: number, vowelUp: boolean): void {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur * 0.85);
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 5 + Math.random() * 2;
  const depth = ctx.createGain();
  depth.gain.value = from * 0.02;
  wobble.connect(depth);
  depth.connect(osc.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.12);
  env.gain.setValueAtTime(gain, t + dur * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  env.connect(out);

  // "oo" formants ~ 350/800 Hz, "ah" ~ 750/1200 Hz.
  const [f1a, f2a, f1b, f2b] = vowelUp ? [350, 800, 760, 1220] : [760, 1220, 380, 820];
  for (const [a, b, level] of [
    [f1a, f1b, 1],
    [f2a, f2b, 0.5],
  ]) {
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.Q.value = 6;
    formant.frequency.setValueAtTime(a, t);
    formant.frequency.linearRampToValueAtTime(b, t + dur * 0.5);
    const mix = ctx.createGain();
    mix.gain.value = level;
    osc.connect(formant);
    formant.connect(mix);
    mix.connect(env);
  }
  osc.start(t);
  wobble.start(t);
  osc.stop(t + dur + 0.05);
  wobble.stop(t + dur + 0.05);
}

/** Builds the applause ahead of time (it takes a moment on a phone). */
export function prepareCrowd(ctx: BaseAudioContext): void {
  applauseBuffer(ctx, "cheer");
  applauseBuffer(ctx, "groan");
}

/** The crowd reacting to the result, starting at time `t`. Lasts up to 5 s. */
export function playCrowd(ctx: BaseAudioContext, out: AudioNode, mood: CrowdMood, t: number): void {
  const random = mulberry(mood === "cheer" ? 3 : 5);

  // The roar (or the murmur): band-passed noise swelling and fading.
  const roar = ctx.createBufferSource();
  roar.buffer = noiseBuffer(ctx);
  roar.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = mood === "cheer" ? 900 : 450;
  band.Q.value = 0.7;
  const roarGain = ctx.createGain();
  const peak = mood === "cheer" ? 0.13 : 0.09;
  const length = mood === "cheer" ? 4.6 : 2.4;
  roarGain.gain.setValueAtTime(0.0001, t);
  roarGain.gain.exponentialRampToValueAtTime(peak, t + 0.4);
  roarGain.gain.setValueAtTime(peak, t + length * 0.45);
  roarGain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  roar.connect(band);
  band.connect(roarGain);
  roarGain.connect(out);
  roar.start(t);
  roar.stop(t + length + 0.1);

  // The voices.
  const voices = mood === "cheer" ? 9 : 7;
  for (let i = 0; i < voices; i += 1) {
    const base = 180 + random() * 260;
    const start = t + random() * (mood === "cheer" ? 1.2 : 0.3);
    if (mood === "cheer") {
      voice(ctx, out, start, base, base * (1.5 + random() * 0.4), 0.7 + random() * 0.6, 0.032, true);
    } else {
      voice(ctx, out, start, base * 1.25, base * 0.72, 1.3 + random() * 0.4, 0.045, false);
    }
  }

  // The applause.
  const claps = ctx.createBufferSource();
  claps.buffer = applauseBuffer(ctx, mood);
  const clapGain = ctx.createGain();
  clapGain.gain.value = mood === "cheer" ? 0.3 : 0.22;
  claps.connect(clapGain);
  clapGain.connect(out);
  claps.start(t + (mood === "cheer" ? 0.1 : 0));
}
