import type { DuelEvent, DuelistId } from "@duel-for-the-world/duel-engine";
import { onSettingsChange, settings } from "./settings";
import { musicStepSeconds, playCrowd, playMusicStep, playRecipe, prepareCrowd } from "./synth";
import type { CrowdMood, MusicTheme, SfxName } from "./synth";

// Sound effects, music and vibration, all following the player's settings.
//
// Browsers (and Android's WebView) only allow audio to start inside a tap --
// and on a touch screen only when the finger is LIFTED (pointerup /
// touchend), not when it goes down. So every kind of tap tries to start
// the audio, until it is actually running.

type Logged = DuelEvent & { seq: number };

let ctx: AudioContext | null = null;
let output: AudioNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicTimer: number | null = null;
let musicStep = 0;
let musicAt = 0;
// Which bed plays next -- the menu/lobby's "campaign rally", or the
// tenser "showdown" once a duel is actually on screen. Set by app.ts on
// every render (see setMusicTheme below); cheap to call every time since
// it's a no-op unless the screen actually changed.
let currentTheme: MusicTheme = "menu";

function build(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  // A gentle limiter so stacked sounds never clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 8;
  limiter.connect(ctx.destination);
  output = limiter;
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 2;
  sfxBus.connect(limiter);
  return ctx;
}

// --- Music ----------------------------------------------------------------------

const LOOKAHEAD = 0.6;

function scheduleMusic(): void {
  if (!ctx || !musicBus) return;
  while (musicAt < ctx.currentTime + LOOKAHEAD) {
    playMusicStep(ctx, musicBus, currentTheme, musicStep, musicAt);
    musicStep += 1;
    musicAt += musicStepSeconds(currentTheme);
  }
}

function startMusic(): void {
  if (!ctx || !output || musicTimer !== null) return;
  // A fresh bus each time (stopMusic fades out and drops the old one).
  musicBus = ctx.createGain();
  musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
  musicBus.gain.exponentialRampToValueAtTime(0.45, ctx.currentTime + 2);
  musicBus.connect(output);
  musicStep = 0;
  musicAt = ctx.currentTime + 0.1;
  scheduleMusic();
  musicTimer = window.setInterval(scheduleMusic, 200);
}

function stopMusic(): void {
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
  if (ctx && musicBus) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    const old = musicBus;
    window.setTimeout(() => old.disconnect(), 600);
    musicBus = null;
  }
}

/**
 * Which theme plays next. Called on every render (cheap: a no-op unless
 * the screen actually changed since the last call) -- switches by
 * crossfading through the existing stop/start fade envelopes rather than
 * cutting hard mid-bar, so a screen change doesn't chop the music.
 */
export function setMusicTheme(theme: MusicTheme): void {
  if (theme === currentTheme) return;
  currentTheme = theme;
  if (musicTimer === null) return; // not playing (yet) -- the next startMusic() just picks up the new theme
  stopMusic();
  window.setTimeout(() => {
    if (settings().music && ctx?.state === "running") startMusic();
  }, 450);
}

// --- Setup ----------------------------------------------------------------------

/**
 * Call once at startup: builds the audio on the first touch, plays a soft
 * tap on every button, pauses everything while the app is in the background
 * and follows the settings.
 */
const UNLOCK_EVENTS = ["pointerdown", "pointerup", "touchend", "mousedown", "click", "keydown"] as const;
// Paused by us (app in the background), as opposed to never started.
let pausedInBackground = false;

function onRunning(): void {
  if (!ctx || ctx.state !== "running") return;
  for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
  if (settings().music) startMusic();
  // The results screen's applause, built while nothing much is happening.
  const audio = ctx;
  window.setTimeout(() => prepareCrowd(audio), 3000);
}

function unlock(): void {
  const audio = build();
  if (!audio) return;
  if (audio.state === "running") {
    onRunning();
    return;
  }
  // Some WebViews only really start once something plays inside the tap:
  // a one-sample silent buffer.
  try {
    const silence = audio.createBufferSource();
    silence.buffer = audio.createBuffer(1, 1, audio.sampleRate);
    silence.connect(audio.destination);
    silence.start();
  } catch {
    // ignore
  }
  audio.resume().then(onRunning, () => undefined);
}

/** For Settings: whether sound can play right now. */
export function audioStatus(): "running" | "waiting" | "unsupported" {
  const supported = typeof window !== "undefined" && (window.AudioContext !== undefined || "webkitAudioContext" in window);
  if (!supported) return "unsupported";
  return ctx?.state === "running" ? "running" : "waiting";
}

/**
 * Call once at startup: starts the audio on the first tap, plays a soft
 * tap on every button, pauses everything while the app is in the background
 * and follows the settings.
 */
export function installSound(): void {
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true);

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      if (target?.closest?.("button")) playSfx("tap");
    },
    true,
  );

  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) {
      if (ctx.state === "running") {
        pausedInBackground = true;
        void ctx.suspend();
      }
    } else if (pausedInBackground) {
      pausedInBackground = false;
      void ctx.resume();
    }
  });

  onSettingsChange((next) => {
    if (!ctx || ctx.state !== "running") return;
    if (next.music) startMusic();
    else stopMusic();
  });
}

// --- Effects --------------------------------------------------------------------

export function playSfx(name: SfxName, delay = 0): void {
  if (!settings().sound || !ctx || !sfxBus || ctx.state !== "running") return;
  playRecipe(ctx, sfxBus, name, ctx.currentTime + 0.01 + delay);
}

/**
 * The crowd on the results screen: cheering and applause, or a
 * disappointed "awww". The music dips while they react.
 */
export function playCrowdReaction(mood: CrowdMood): void {
  if (!settings().sound || !ctx || !sfxBus || ctx.state !== "running") return;
  const now = ctx.currentTime;
  playCrowd(ctx, sfxBus, mood, now + 0.02);
  if (musicBus) {
    const level = 0.45;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), now);
    musicBus.gain.linearRampToValueAtTime(level * 0.25, now + 0.3);
    musicBus.gain.setValueAtTime(level * 0.25, now + 3.8);
    musicBus.gain.linearRampToValueAtTime(level, now + 5.5);
  }
}

/** A buzz, if the device can and the player wants it. */
export function vibrate(pattern: number | number[]): void {
  if (!settings().vibration) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

/**
 * The sounds (and buzzes) for what just happened in the duel, a few at
 * most, slightly staggered so they read as a sequence.
 */
export function playDuelEvents(events: readonly Logged[], you: DuelistId): void {
  const queue: SfxName[] = [];
  let buzz: number | number[] | null = null;
  const add = (name: SfxName) => {
    if (!queue.includes(name)) queue.push(name);
  };

  for (const event of events) {
    switch (event.kind) {
      case "turn-started":
        if (event.duelistId === you) {
          add("turn");
          buzz ??= 25;
        }
        break;
      case "cards-drawn":
        if (event.duelistId === you) add("draw");
        break;
      case "actor-deployed":
        add("deploy");
        break;
      case "card-set":
        add("set");
        break;
      case "policy-activated":
        add("policy");
        break;
      case "stance-changed":
        add("stance");
        break;
      case "attack-declared":
        add("attack");
        break;
      case "battle":
        add("hit");
        break;
      case "scandal-triggered":
        add("scandal");
        buzz = [40, 50, 90];
        break;
      case "sent-to-embassy":
        add("fall");
        break;
      case "mandate-changed":
        if (event.duelistId === you && event.amount < 0) {
          add("damage");
          if (buzz === null || buzz === 25) buzz = 70;
        }
        break;
      case "votes-gained":
        add("votes");
        break;
      case "returned-to-hand":
      case "returned-to-field":
        add("return");
        break;
      case "duel-won":
        add(event.duelistId === you ? "win" : "lose");
        buzz = event.duelistId === you ? [60, 60, 60, 60, 160] : 220;
        break;
      default:
        break;
    }
  }

  queue.slice(0, 4).forEach((name, index) => playSfx(name, index * 0.13));
  if (buzz !== null) vibrate(buzz);
}

/** A move that isn't allowed (or the tutorial holding you back). */
export function playBlocked(): void {
  playSfx("blocked");
  vibrate(30);
}
