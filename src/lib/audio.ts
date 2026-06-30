// Audio engine: richer in-code WebAudio SFX, looping BGM (mp3), Pokémon cries,
// and a pokéball-open effect. All synth SFX are generated at runtime (no audio
// files, copyright-safe). BGM uses bundled mp3s under /song.
//
// Settings model (localStorage):
//   - master mute ("muted")  -> legacy switch, silences everything
//   - music on/off ("music") -> background tracks
//   - sfx on/off   ("sfx")   -> sound effects + cries
// Volumes are fixed-tuned per sound; a global musicVolume keeps BGM under SFX.

const MUTE_KEY = "muted";
const MUSIC_KEY = "music";
const SFX_KEY = "sfx";

function lsGet(key: string, dflt: boolean): boolean {
  if (typeof window === "undefined") return dflt;
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? dflt : v === "1";
  } catch {
    return dflt;
  }
}
function lsSet(key: string, v: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

// Master mute (legacy). When muted, nothing plays.
export function isMuted(): boolean {
  return lsGet(MUTE_KEY, false);
}
export function setMuted(v: boolean) {
  lsSet(MUTE_KEY, v);
  if (v) stopBgm();
  else resumeBgm();
}
// Music + SFX channels (default on).
export function isMusicOn(): boolean {
  return !isMuted() && lsGet(MUSIC_KEY, true);
}
export function setMusicOn(v: boolean) {
  lsSet(MUSIC_KEY, v);
  if (v) resumeBgm();
  else stopBgm();
}
export function isSfxOn(): boolean {
  return !isMuted() && lsGet(SFX_KEY, true);
}
export function setSfxOn(v: boolean) {
  lsSet(SFX_KEY, v);
}

// ---------------------------------------------------------------------------
// WebAudio context (lazy; respects autoplay policy)
// ---------------------------------------------------------------------------
let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  try {
    const C =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    return ctx;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Synth primitives
// ---------------------------------------------------------------------------
interface ToneOpts {
  freq: number;
  type?: OscillatorType;
  dur: number;
  vol?: number;
  delay?: number; // seconds from now
  slideTo?: number; // glide target freq
  attack?: number; // attack time
}
function tone(ac: AudioContext, o: ToneOpts) {
  const t0 = ac.currentTime + (o.delay ?? 0);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const vol = o.vol ?? 0.18;
  const atk = o.attack ?? 0.005;
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t0 + o.dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + atk);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}
interface NoiseOpts {
  dur: number;
  vol?: number;
  delay?: number;
  type?: BiquadFilterType;
  freq?: number; // filter cutoff
}
function noise(ac: AudioContext, o: NoiseOpts) {
  const t0 = ac.currentTime + (o.delay ?? 0);
  const len = Math.max(1, Math.floor(ac.sampleRate * o.dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = o.type ?? "bandpass";
  filter.frequency.value = o.freq ?? 1200;
  const gain = ac.createGain();
  const vol = o.vol ?? 0.15;
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}
// A short melodic sequence: notes are [freqHz, startSec, durSec].
function seq(ac: AudioContext, notes: [number, number, number][], type: OscillatorType, vol = 0.18) {
  for (const [f, s, d] of notes) tone(ac, { freq: f, type, dur: d, delay: s, vol });
}

// Note helpers (equal temperament from A4=440)
const N = (semitonesFromA4: number) => 440 * Math.pow(2, semitonesFromA4 / 12);

// ---------------------------------------------------------------------------
// SFX library
// ---------------------------------------------------------------------------
export type SfxKind =
  | "tap"
  | "correct"
  | "wrong"
  | "victory"
  | "defeat"
  | "cheer"
  | "disappointed"
  | "level"
  | "reward"
  | "xp"
  | "claim_reward"
  | "damage"
  | "confused"
  | "poisoned"
  | "streak"
  | "timer_tick"
  | "timer_warning"
  | "elite_intro"
  | "evolution_glow"
  | "evolution_complete"
  | "pokeball_open"
  | "purchase"
  | "equip"
  | "error"
  | "bag_open"
  | "item_use"
  | "shiny"
  | "panel_open"
  | "panel_close"
  | "darkness"
  | "warning"
  | "friend_ping"
  | "whos_that";

const BUILDERS: Record<SfxKind, (ac: AudioContext) => void> = {
  tap: (ac) => tone(ac, { freq: 660, type: "sine", dur: 0.05, vol: 0.08, attack: 0.001 }),
  correct: (ac) =>
    seq(ac, [
      [N(4), 0, 0.1],
      [N(9), 0.08, 0.16],
    ], "sine", 0.16), // E5 -> A5 chime
  wrong: (ac) => {
    tone(ac, { freq: 200, type: "square", dur: 0.22, vol: 0.16, slideTo: 120 });
    noise(ac, { dur: 0.12, vol: 0.06, freq: 800 });
  },
  victory: (ac) =>
    seq(ac, [
      [N(0), 0, 0.14],
      [N(4), 0.12, 0.14],
      [N(7), 0.24, 0.14],
      [N(12), 0.36, 0.34],
    ], "triangle", 0.2), // A C# E A fanfare
  defeat: (ac) =>
    seq(ac, [
      [N(0), 0, 0.18],
      [N(-3), 0.16, 0.18],
      [N(-6), 0.32, 0.36],
    ], "sawtooth", 0.16), // descending
  cheer: (ac) => {
    noise(ac, { dur: 0.5, vol: 0.05, type: "highpass", freq: 2000 });
    seq(ac, [
      [N(12), 0, 0.1],
      [N(16), 0.1, 0.1],
      [N(19), 0.2, 0.2],
    ], "sine", 0.1);
  },
  disappointed: (ac) =>
    tone(ac, { freq: N(-2), type: "sine", dur: 0.5, vol: 0.14, slideTo: N(-9) }), // "aww" downward
  level: (ac) =>
    seq(ac, [
      [N(7), 0, 0.1],
      [N(11), 0.09, 0.1],
      [N(14), 0.18, 0.1],
      [N(19), 0.27, 0.3],
    ], "triangle", 0.2),
  reward: (ac) =>
    seq(ac, [
      [N(12), 0, 0.08],
      [N(16), 0.07, 0.08],
      [N(21), 0.14, 0.18],
    ], "sine", 0.16),
  xp: (ac) => tone(ac, { freq: N(7), type: "sine", dur: 0.12, vol: 0.1, slideTo: N(14) }),
  claim_reward: (ac) =>
    seq(ac, [
      [N(9), 0, 0.1],
      [N(14), 0.1, 0.1],
      [N(17), 0.2, 0.1],
      [N(21), 0.3, 0.3],
    ], "triangle", 0.2),
  damage: (ac) => {
    noise(ac, { dur: 0.18, vol: 0.18, type: "lowpass", freq: 700 });
    tone(ac, { freq: 140, type: "square", dur: 0.12, vol: 0.12, slideTo: 70 });
  },
  confused: (ac) =>
    seq(ac, [
      [520, 0, 0.12],
      [430, 0.1, 0.12],
      [520, 0.2, 0.12],
      [430, 0.3, 0.12],
    ], "sine", 0.12), // wobble
  poisoned: (ac) => {
    tone(ac, { freq: 300, type: "sawtooth", dur: 0.3, vol: 0.1, slideTo: 240 });
    noise(ac, { dur: 0.3, vol: 0.05, type: "bandpass", freq: 500 });
  },
  streak: (ac) =>
    seq(ac, [
      [N(12), 0, 0.07],
      [N(16), 0.06, 0.07],
      [N(19), 0.12, 0.07],
      [N(24), 0.18, 0.16],
    ], "square", 0.12),
  timer_tick: (ac) => tone(ac, { freq: 1000, type: "sine", dur: 0.04, vol: 0.07, attack: 0.001 }),
  timer_warning: (ac) => tone(ac, { freq: 1320, type: "square", dur: 0.12, vol: 0.14 }),
  elite_intro: (ac) =>
    seq(ac, [
      [N(-12), 0, 0.2],
      [N(-5), 0.18, 0.2],
      [N(-1), 0.36, 0.2],
      [N(0), 0.54, 0.5],
    ], "sawtooth", 0.2),
  evolution_glow: (ac) => tone(ac, { freq: 440, type: "sine", dur: 0.22, vol: 0.16, slideTo: 660 }),
  evolution_complete: (ac) =>
    seq(ac, [
      [N(0), 0, 0.16],
      [N(7), 0.14, 0.16],
      [N(12), 0.28, 0.16],
      [N(16), 0.42, 0.5],
    ], "sine", 0.2),
  pokeball_open: (ac) => {
    // click + airy "whoosh" + sparkle
    tone(ac, { freq: 900, type: "square", dur: 0.04, vol: 0.12, attack: 0.001 });
    noise(ac, { dur: 0.22, vol: 0.12, type: "highpass", freq: 1500, delay: 0.03 });
    tone(ac, { freq: 1200, type: "sine", dur: 0.2, vol: 0.1, delay: 0.05, slideTo: 2200 });
  },
  purchase: (ac) =>
    seq(ac, [
      [N(12), 0, 0.08],
      [N(19), 0.07, 0.16],
    ], "sine", 0.16), // coin "cha-ching"
  equip: (ac) => tone(ac, { freq: N(9), type: "triangle", dur: 0.12, vol: 0.14, slideTo: N(14) }),
  error: (ac) => tone(ac, { freq: 200, type: "square", dur: 0.18, vol: 0.14, slideTo: 150 }),
  bag_open: (ac) => noise(ac, { dur: 0.18, vol: 0.12, type: "lowpass", freq: 1200 }),
  item_use: (ac) => tone(ac, { freq: N(2), type: "sine", dur: 0.16, vol: 0.14, slideTo: N(9) }),
  shiny: (ac) =>
    seq(ac, [
      [N(24), 0, 0.06],
      [N(28), 0.05, 0.06],
      [N(31), 0.1, 0.06],
      [N(36), 0.15, 0.2],
    ], "sine", 0.12), // high sparkle
  panel_open: (ac) => tone(ac, { freq: 500, type: "sine", dur: 0.14, vol: 0.12, slideTo: 900 }),
  panel_close: (ac) => tone(ac, { freq: 700, type: "sine", dur: 0.12, vol: 0.1, slideTo: 400 }),
  darkness: (ac) => tone(ac, { freq: 320, type: "sine", dur: 0.5, vol: 0.14, slideTo: 90 }),
  warning: (ac) => {
    tone(ac, { freq: 440, type: "square", dur: 0.16, vol: 0.16 });
    tone(ac, { freq: 440, type: "square", dur: 0.16, vol: 0.16, delay: 0.22 });
  },
  friend_ping: (ac) =>
    seq(ac, [
      [N(16), 0, 0.1],
      [N(21), 0.1, 0.18],
    ], "sine", 0.16),
  whos_that: (ac) =>
    seq(ac, [
      [N(-5), 0, 0.18],
      [N(-1), 0.16, 0.18],
      [N(2), 0.32, 0.3],
    ], "sawtooth", 0.18), // dramatic sting (voice clip can replace later)
};

export function playSfx(kind: SfxKind) {
  if (!isSfxOn()) return;
  try {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === "suspended") void ac.resume();
    BUILDERS[kind]?.(ac);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Pokémon cries + pokéball reveal
// ---------------------------------------------------------------------------
const cryCache = new Map<number, HTMLAudioElement>();
export function playCry(id: number) {
  if (!isSfxOn()) return;
  if (typeof window === "undefined") return;
  try {
    let a = cryCache.get(id);
    if (!a) {
      a = new Audio(
        `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`,
      );
      a.volume = 0.4;
      cryCache.set(id, a);
    }
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Pokéball-open SFX, then the Pokémon's cry shortly after. */
export function revealPokemon(id: number, delayMs = 320) {
  playSfx("pokeball_open");
  if (typeof window === "undefined") return;
  window.setTimeout(() => playCry(id), delayMs);
}

// ---------------------------------------------------------------------------
// BGM manager (looping mp3 per context, crossfade)
// ---------------------------------------------------------------------------
export type BgmContext =
  | "splash"
  | "home"
  | "battle_regular"
  | "battle_elite"
  | "weekly_league"
  | "elite_intro"
  | "whos_that"
  | "mega"
  | "leaderboard"
  | "share";

const SONG = "/song/";
// Tracks present in /public/song.
const INSTRUMENTAL = `${SONG}Pokemon Trivia Battle (Instrumental Version).mp3`;
const REGULAR = `${SONG}Regular Battle.mp3`;
const ELITE = `${SONG}Elite Four.mp3`;
const MEGA = `${SONG}Mega Raid.mp3`;
// Contexts whose dedicated track isn't uploaded yet fall back to an existing
// one so the screen isn't silent. Replace the fallbacks (marked TODO) once the
// real files are added to /public/song. See AUDIO_ASSETS below.
const BGM_TRACKS: Record<BgmContext, string> = {
  splash: INSTRUMENTAL, // TODO: dedicated energetic "Pokemon Trivia Battle.mp3" (current file is an empty stub)
  home: INSTRUMENTAL,
  battle_regular: REGULAR,
  battle_elite: ELITE,
  weekly_league: REGULAR, // TODO: "Weekly League.mp3"
  elite_intro: ELITE,
  whos_that: INSTRUMENTAL, // TODO: "Whos That Pokemon.mp3"
  mega: MEGA,
  leaderboard: INSTRUMENTAL, // TODO: "Leaderboard.mp3"
  share: INSTRUMENTAL,
};
// Per-Mega override: event id -> track file (epic theme changes every Mega).
const MEGA_TRACKS: Record<string, string> = {
  // "mega-charizard-x-2026-06-23": `${SONG}Mega Charizard X.mp3`,
};

const MUSIC_VOLUME = 0.35;
let current: { ctxName: string; el: HTMLAudioElement } | null = null;
let unlocked = false;

function fade(el: HTMLAudioElement, to: number, ms: number, onDone?: () => void) {
  const steps = 16;
  const from = el.volume;
  let i = 0;
  const tick = () => {
    i++;
    const v = from + (to - from) * (i / steps);
    try {
      el.volume = Math.max(0, Math.min(1, v));
    } catch {
      /* ignore */
    }
    if (i < steps) window.setTimeout(tick, ms / steps);
    else onDone?.();
  };
  tick();
}

/** Switch background music to the track for `context` (no-op if already playing it). */
export function playBgm(context: BgmContext, opts?: { megaEventId?: string }) {
  if (typeof window === "undefined") return;
  const src =
    context === "mega" && opts?.megaEventId && MEGA_TRACKS[opts.megaEventId]
      ? MEGA_TRACKS[opts.megaEventId]
      : BGM_TRACKS[context];
  const key = `${context}:${src}`;
  if (current?.ctxName === key) {
    if (!isMusicOn()) stopBgm();
    return;
  }
  // fade out the old track
  if (current) {
    const old = current.el;
    fade(old, 0, 350, () => {
      old.pause();
    });
  }
  const el = new Audio(encodeURI(src));
  el.loop = true;
  el.volume = 0;
  el.preload = "auto";
  current = { ctxName: key, el };
  if (isMusicOn()) {
    void el
      .play()
      .then(() => {
        unlocked = true;
        fade(el, MUSIC_VOLUME, 600);
      })
      .catch(() => {
        // autoplay blocked — will start on first user gesture via unlock()
      });
  }
}

export function stopBgm() {
  if (current) fade(current.el, 0, 250, () => current?.el.pause());
}
export function resumeBgm() {
  if (current && isMusicOn()) {
    void current.el.play().then(() => fade(current!.el, MUSIC_VOLUME, 400)).catch(() => {});
  }
}

/** Call once on the first user gesture to satisfy autoplay policy. */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const ac = getCtx();
  if (ac && ac.state === "suspended") void ac.resume();
  if (current && isMusicOn()) {
    void current.el.play().then(() => fade(current!.el, MUSIC_VOLUME, 500)).catch(() => {});
  }
}

/**
 * AUDIO_ASSETS — tracks in /public/song.
 * Present & wired:
 *   - "Pokemon Trivia Battle (Instrumental Version).mp3"  (home/shop/dex/profile, share, + splash/whos-that/leaderboard fallback)
 *   - "Regular Battle.mp3"  (regular battle, + weekly fallback)
 *   - "Elite Four.mp3"      (Elite Four, + elite-intro fallback)
 *   - "Mega Raid.mp3"       (Mega Raid; per-event overrides via MEGA_TRACKS)
 * Still to add (currently using the fallbacks noted in BGM_TRACKS):
 *   - "Pokemon Trivia Battle.mp3"  — splash/onboarding (the committed file is a 2-byte stub)
 *   - "Weekly League.mp3"
 *   - "Whos That Pokemon.mp3"
 *   - "Leaderboard.mp3"
 *   - "Elite Four Intro.mp3" (optional)
 * When added, point the matching BGM_TRACKS entry back at the new file.
 * Missing files just fall back / stay quiet (handled gracefully).
 */
