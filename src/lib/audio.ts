// Lightweight audio module: WebAudio SFX + remote Pokémon cries.
// AudioContext is created lazily on first call so we never violate autoplay rules.

const MUTE_KEY = "muted";

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(v: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  try {
    const C =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    return ctx;
  } catch {
    return null;
  }
}

export type SfxKind = "correct" | "wrong" | "victory" | "defeat" | "level" | "elite_intro";

const SFX: Record<SfxKind, { freq: number; type: OscillatorType; dur: number; vol: number }> = {
  correct: { freq: 880, type: "sine", dur: 0.15, vol: 0.18 },
  wrong: { freq: 180, type: "square", dur: 0.25, vol: 0.18 },
  victory: { freq: 660, type: "sine", dur: 0.4, vol: 0.22 },
  defeat: { freq: 120, type: "sawtooth", dur: 0.5, vol: 0.18 },
  level: { freq: 520, type: "triangle", dur: 0.3, vol: 0.2 },
  elite_intro: { freq: 220, type: "triangle", dur: 0.6, vol: 0.25 },
};

export function playSfx(kind: SfxKind) {
  if (isMuted()) return;
  try {
    const ac = getCtx();
    if (!ac) return;
    const cfg = SFX[kind];
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = cfg.type;
    osc.frequency.setValueAtTime(cfg.freq, ac.currentTime);
    gain.gain.setValueAtTime(cfg.vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + cfg.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + cfg.dur);
  } catch {
    /* ignore */
  }
}

const cryCache = new Map<number, HTMLAudioElement>();

export function playCry(id: number) {
  if (isMuted()) return;
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
