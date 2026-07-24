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
const MUSIC_VOL_KEY = "musicVol"; // 0..100
const SFX_VOL_KEY = "sfxVol"; // 0..100

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
function lsGetNum(key: string, dflt: number): number {
  if (typeof window === "undefined") return dflt;
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return dflt;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : dflt;
  } catch {
    return dflt;
  }
}
function lsSetNum(key: string, v: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(Math.max(0, Math.min(100, Math.round(v)))));
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
  // Turning music off silences only NON-battle music; battle tracks keep
  // playing (they're gated by musicAllowed(isBattle), not this toggle).
  else if (!currentIsBattle) stopBgm();
}
export function isSfxOn(): boolean {
  return !isMuted() && lsGet(SFX_KEY, true);
}
export function setSfxOn(v: boolean) {
  lsSet(SFX_KEY, v);
}

// Per-channel volume, 0..100 (%). Defaults preserve the previous tuning:
// music sits under SFX. Changes apply live.
export function getMusicVolume(): number {
  return lsGetNum(MUSIC_VOL_KEY, 35);
}
export function setMusicVolume(pct: number) {
  lsSetNum(MUSIC_VOL_KEY, pct);
  applyMusicVolume();
}
export function getSfxVolume(): number {
  return lsGetNum(SFX_VOL_KEY, 100);
}
export function setSfxVolume(pct: number) {
  lsSetNum(SFX_VOL_KEY, pct);
  applySfxVolume();
}
function musicVol(): number {
  return getMusicVolume() / 100;
}
function sfxVol(): number {
  return getSfxVolume() / 100;
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

// Master gain for all synth SFX — scaled by the SFX volume setting.
let sfxGain: GainNode | null = null;
function sfxOut(ac: AudioContext): AudioNode {
  if (!sfxGain || sfxGain.context !== ac) {
    sfxGain = ac.createGain();
    sfxGain.gain.value = sfxVol();
    sfxGain.connect(ac.destination);
  }
  return sfxGain;
}
function applySfxVolume() {
  if (sfxGain) sfxGain.gain.value = sfxVol();
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
  osc.connect(gain).connect(sfxOut(ac));
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
  src.connect(filter).connect(gain).connect(sfxOut(ac));
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
    // A cached element that already failed to load (network hiccup, a
    // transient CDN error, ...) never recovers on its own — reusing it would
    // turn every "retry" into a replay of the exact same broken element, so
    // evict and rebuild from scratch whenever the cached one is in an error
    // state.
    let a = cryCache.get(id);
    if (a?.error) {
      cryCache.delete(id);
      a = undefined;
    }
    if (!a) {
      a = new Audio(
        `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`,
      );
      a.addEventListener("error", () => cryCache.delete(id));
      cryCache.set(id, a);
    }
    a.volume = 0.4 * sfxVol();
    a.currentTime = 0;
    const el = a;
    void el.play().catch(() => {
      // A rejected play() (autoplay policy, a stalled/aborted load, ...) also
      // shouldn't poison future attempts — let the next call start clean.
      if (cryCache.get(id) === el) cryCache.delete(id);
    });
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

// "Who's that Pokémon?!" voice shout (a short recorded clip, not synth).
let whosThatClip: HTMLAudioElement | null = null;
export function playWhosThatShout() {
  if (!isSfxOn() || typeof window === "undefined") return;
  try {
    if (!whosThatClip) {
      whosThatClip = new Audio(encodeURI(`${SONG}Whos that Pokemon.mp3`));
    }
    whosThatClip.volume = 0.7 * sfxVol();
    whosThatClip.currentTime = 0;
    void whosThatClip.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// BGM manager — each context loops one small, bundled mp3 under /song. These
// clips are the per-section slices of the original soundtrack, so playback is
// reliable on mobile (no seeking into one large stream). Battle results and
// the evolution/potion cues have their own clips too. Who's-That plays no
// music (only the voice shout).
// ---------------------------------------------------------------------------
export type BgmContext =
  | "splash"
  | "home" // battle hub (level-based)
  | "dex"
  | "shop"
  | "profile"
  | "battle_regular"
  | "daily"
  | "battle_elite"
  | "elite_intro" // Elite Four takeover screen (loops the intro)
  | "arena" // Battle Arena hub tab — borrows the Elite intro clip as hub music
  | "weekly_league"
  | "mega"
  | "whos_that"
  | "leaderboard";

const SONG = "/song/";

// Bundled clip filenames (under public/song).
const CLIP = {
  splash: "Splash Onboarding.mp3",
  dex: "Dex Tab.mp3",
  shop: "Shop Tab.mp3",
  profile: "Profile Tab.mp3",
  daily: "Daily Quest BGM.mp3",
  dailyWin: "Daily Quest Win.mp3",
  regular: "Regular Battle BGM.mp3",
  regularWin: "Regular Battle Win.mp3",
  weekly: "Weekly League BGM.mp3",
  weeklyWin: "Weekly League Win.mp3",
  eliteIntro: "Elite Four Intro.mp3",
  elite: "Elite Four BGM.mp3",
  eliteWin: "Elite Four Win.mp3",
  lose: "Lose All Modes.mp3",
  evolution: "Evolution.mp3",
  item: "Potion, Small Potion and Max Potion.mp3",
  leaderboard: "Mega Leaderboard.mp3",
  // No dedicated mega-raid battle clip was provided — reuse the Elite Four
  // theme for the mega raid encounter. Drop in a "Mega Raid BGM.mp3" and point
  // `mega` at it to give mega its own track.
  mega: "Elite Four BGM.mp3",
} as const;

// Battle-hub music by level band (rotates past level 20).
const HOME_BANDS: readonly string[] = [
  "Battle Tab Lv 1 to 3.mp3",
  "Battle Tab Lv 4 to 6.mp3",
  "Battle Tab Lv 7 to 9.mp3",
  "Battle Tab Lv 10 to 12.mp3",
  "Battle Tab Lv 13 to 15.mp3",
  "Battle Tab Lv 16 to 20.mp3",
];
function homeBand(level: number): string {
  const lv = Math.max(1, level);
  if (lv <= 20) return HOME_BANDS[Math.min(HOME_BANDS.length - 1, Math.floor((lv - 1) / 3))];
  return HOME_BANDS[Math.floor((lv - 21) / 3) % HOME_BANDS.length];
}

let unlocked = false;

// The active looping track (what resumeBgm restarts), a transient one-shot
// that ducks it (evolution), and a layered overlay that plays on top without
// stopping the loop (potion cue). The Elite intro is a one-shot that hands off
// to the elite loop when it ends.
let musicEl: HTMLAudioElement | null = null;
let musicKey = ""; // dedupe key for the active loop
let currentIsBattle = false; // is the active loop battle music?
let oneShotEl: HTMLAudioElement | null = null;
let overlayEl: HTMLAudioElement | null = null;

// Whether music may play right now for a track of the given kind. Battle music
// ignores the Music toggle (only the master mute silences it); non-battle
// music also respects the Music toggle.
function musicAllowed(isBattle: boolean): boolean {
  if (isMuted()) return false;
  if (isBattle) return true;
  return lsGet(MUSIC_KEY, true);
}

function makeEl(file: string, loop: boolean): HTMLAudioElement {
  const el = new Audio(encodeURI(SONG + file));
  el.loop = loop;
  el.preload = "auto";
  el.volume = musicVol();
  return el;
}

// Apply the current music volume to every live BGM element.
function applyMusicVolume() {
  const v = musicVol();
  if (musicEl) musicEl.volume = v;
  if (oneShotEl) oneShotEl.volume = v;
  if (overlayEl) overlayEl.volume = v;
}

function fadeIn(el: HTMLAudioElement) {
  const target = musicVol();
  el.volume = 0;
  const steps = 12;
  let i = 0;
  const step = () => {
    i++;
    try {
      el.volume = Math.min(target, (target * i) / steps);
    } catch {
      /* ignore */
    }
    if (i < steps) window.setTimeout(step, 30);
  };
  step();
}

function tryPlay(el: HTMLAudioElement, isBattle: boolean, fade = true) {
  if (!musicAllowed(isBattle)) return;
  void el
    .play()
    .then(() => {
      unlocked = true;
      if (fade) fadeIn(el);
    })
    .catch(() => {
      // Autoplay blocked — unlockAudio() retries on the first user gesture.
    });
}

function stopOneShot() {
  if (oneShotEl) {
    oneShotEl.pause();
    oneShotEl = null;
  }
}

// Loop `file` as the active BGM (deduped by `key`).
function loopTrack(file: string, key: string, isBattle: boolean) {
  currentIsBattle = isBattle;
  if (musicKey === key && musicEl && !oneShotEl) {
    if (musicAllowed(isBattle) && musicEl.paused) tryPlay(musicEl, isBattle, false);
    return;
  }
  stopOneShot();
  if (musicEl) {
    musicEl.pause();
    musicEl = null;
  }
  musicKey = key;
  const el = makeEl(file, true);
  musicEl = el;
  tryPlay(el, isBattle);
}

/** Loop the bundled clip for `context`. */
export function playBgm(context: BgmContext, opts?: { level?: number }) {
  if (typeof window === "undefined") return;

  if (context === "whos_that") {
    // No background music here — only the voice shout.
    stopOneShot();
    if (musicEl) musicEl.pause();
    musicEl = null;
    musicKey = "";
    currentIsBattle = false;
    return;
  }

  switch (context) {
    case "home":
      return loopTrack(homeBand(opts?.level ?? 1), `home:${homeBand(opts?.level ?? 1)}`, false);
    case "splash":
      return loopTrack(CLIP.splash, "splash", false);
    case "dex":
      return loopTrack(CLIP.dex, "dex", false);
    case "shop":
      return loopTrack(CLIP.shop, "shop", false);
    case "profile":
      return loopTrack(CLIP.profile, "profile", false);
    case "leaderboard":
      return loopTrack(CLIP.leaderboard, "leaderboard", false);
    case "elite_intro":
      return loopTrack(CLIP.eliteIntro, "elite_intro", true);
    case "arena":
      // The Battle Arena is a hub tab, not a battle: it borrows the Elite Four
      // intro clip for its "face off" energy but plays as NON-battle music, so
      // the Settings "Music" toggle silences it like every other hub tab.
      return loopTrack(CLIP.eliteIntro, "arena", false);
    case "battle_elite":
      // Intro already played on the takeover screen — go straight to the BGM.
      return loopTrack(CLIP.elite, "elite", true);
    case "battle_regular":
      return loopTrack(CLIP.regular, "regular", true);
    case "daily":
      return loopTrack(CLIP.daily, "daily", true);
    case "weekly_league":
      return loopTrack(CLIP.weekly, "weekly", true);
    case "mega":
      return loopTrack(CLIP.mega, "mega", true);
    default:
      return loopTrack(CLIP.splash, "splash", false);
  }
}

/** Battle result music: looped win clip (per mode) or the shared lose clip. */
export function playBattleResult(mode: "daily" | "regular" | "weekly" | "elite", won: boolean) {
  const winClip =
    mode === "daily"
      ? CLIP.dailyWin
      : mode === "regular"
        ? CLIP.regularWin
        : mode === "weekly"
          ? CLIP.weeklyWin
          : CLIP.eliteWin;
  const file = won ? winClip : CLIP.lose;
  // Battle results are part of the battle — count as battle music.
  loopTrack(file, `result:${mode}:${won}`, true);
}

/** Evolution musical cue (plays once, ducking the loop, then resumes it). */
export function playEvolutionCue() {
  const resumeKey = musicKey;
  const resumeBattle = currentIsBattle;
  stopOneShot();
  if (musicEl) musicEl.pause();
  const el = makeEl(CLIP.evolution, false);
  oneShotEl = el;
  const resume = () => {
    if (oneShotEl === el) oneShotEl = null;
    // Resume the loop only if nothing else took over meanwhile.
    if (musicKey === resumeKey && musicEl) tryPlay(musicEl, resumeBattle, false);
  };
  el.addEventListener("ended", resume, { once: true });
  el.addEventListener("error", resume, { once: true });
  tryPlay(el, true, false);
}

/** Potion / item cue — layered over the current music (does not stop it). */
export function playItemCue() {
  if (typeof window === "undefined" || isMuted()) return;
  if (overlayEl) overlayEl.pause();
  const el = makeEl(CLIP.item, false);
  overlayEl = el;
  el.addEventListener(
    "ended",
    () => {
      if (overlayEl === el) overlayEl = null;
    },
    { once: true },
  );
  void el
    .play()
    .then(() => {
      unlocked = true;
    })
    .catch(() => {});
}

export function stopBgm() {
  if (musicEl) musicEl.pause();
  if (oneShotEl) oneShotEl.pause();
  if (overlayEl) overlayEl.pause();
}
export function resumeBgm() {
  if (oneShotEl) tryPlay(oneShotEl, true, false);
  else if (musicEl) tryPlay(musicEl, currentIsBattle, false);
}

/** Call once on the first user gesture to satisfy autoplay policy. */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const ac = getCtx();
  if (ac && ac.state === "suspended") void ac.resume();
  resumeBgm();
}
