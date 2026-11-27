// One attack per type, built from pixelfx effects. Shared by the Node keyframe renderer and the live preview.
// No imports: callers pass pixelfx's core (createFx, PAL, ...) and a registry FX of effect modules by id.

const PINK = ['#2a0a22', '#5a1448', '#8e2274', '#c83a9e', '#f064c4', '#ff9edc', '#ffd6f2', '#ffffff'];
const DRAGON = ['#0a0a2a', '#1a1660', '#2e2a9c', '#4a48d8', '#5f8cff', '#7ad6ff', '#c8f6ff', '#ffffff'];
const LIME = ['#101a04', '#26400a', '#3e6a10', '#62961a', '#8cc42a', '#bce64a', '#ecff9a', '#ffffff'];
const WIND = ['#2a3240', '#46546a', '#6a7c96', '#94a6be', '#bccbe0', '#dfe8f4', '#ffffff'];
const FAIRY = ['#3a0a2a', '#7a1a58', '#c03a8c', '#f06cb8', '#ff9fd2', '#ffd0ea', '#fff4fb', '#ffffff'];
export const POISON = ['#14061c', '#2c0e3e', '#4a1666', '#6e2490', '#9438b8', '#b860d8', '#dc9cf0', '#f6dcff'];

/**
 * Each attack: travel (a beam aimed from attacker to target, or a projectile flown there), impact effects at the
 * target, an optional status that wraps the target's own sprite, and the beats: lunge, hit, shake.
 *   layer: { id, t: start (s), stop: when to let it end, at: 'launch'|'chest'|'feet'|'sky', aim: rotate towards
 *            the target, fly: [t0, t1] move from launch to the target's chest, arc: px of lift, actor: wrap target }
 */
export const ATTACKS = {
  normal: { move: 'Tackle', dash: true, hit: 0.3, shake: 2, layers: [
    { id: 'impacts/blunt-hit', t: 0.28, at: 'feet' }, { id: 'impacts/hit-spark', t: 0.28, at: 'chest', aim: true, opts: { palette: 'bone' } }] },
  fire: { move: 'Flamethrower', hit: 0.45, shake: 1, layers: [
    { id: 'fire/flamethrower', t: 0.05, stop: 0.85, at: 'launch', aim: true },
    { id: 'status/burning', t: 0.45, stop: 1.3, at: 'feet', actor: true }] },
  water: { move: 'Water Gun', hit: 0.4, shake: 1, layers: [
    { id: 'water/water-jet', t: 0.05, stop: 0.8, at: 'launch', aim: true },
    { id: 'water/splash', t: 0.38, at: 'feet' }] },
  electric: { move: 'Thunderbolt', hit: 0.55, shake: 3, layers: [
    { id: 'lightning/lightning-strike', t: -0.3, at: 'feet', stop: 1.2 },
    { id: 'lightning/electrified', t: 0.55, stop: 1.35, at: 'feet', actor: true }] },
  grass: { move: 'Razor Leaf', hit: 0.5, shake: 1, layers: [
    { id: 'projectiles/energy-disc', t: 0.04, fly: [0.04, 0.46], arc: 14, at: 'launch', opts: { palette: 'leaf', size: 9 } },
    { id: 'projectiles/energy-disc', t: 0.12, fly: [0.12, 0.52], arc: -10, at: 'launch', opts: { palette: 'leaf', size: 8, seed: 9 } },
    { id: 'projectiles/energy-disc', t: 0.2, fly: [0.2, 0.58], arc: 4, at: 'launch', opts: { palette: 'leaf', size: 7, seed: 13 } },
    { id: 'impacts/hit-spark', t: 0.5, at: 'chest', aim: true, opts: { palette: 'leaf' } }] },
  ice: { move: 'Icy Wind', hit: 0.5, shake: 1, layers: [
    { id: 'ice/frost-breath', t: 0.05, stop: 0.9, at: 'launch', aim: true },
    { id: 'status/frozen', t: 0.5, stop: 1.4, at: 'feet', actor: true }] },
  fighting: { move: 'Karate Chop', dash: true, hit: 0.3, shake: 3, layers: [
    { id: 'impacts/crit-hit', t: 0.28, at: 'chest', aim: true }] },
  poison: { move: 'Sludge Bomb', hit: 0.55, shake: 1, layers: [
    { id: 'projectiles/plasma-shot', t: 0.06, fly: [0.06, 0.55], arc: 26, at: 'launch', opts: { palette: POISON } },
    { id: 'nature/acid-splash', t: 0.53, at: 'feet', stop: 1.3, opts: { palette: POISON } },
    { id: 'status/poisoned', t: 0.6, stop: 1.4, at: 'feet', actor: true, opts: { palette: POISON } }] },
  ground: { move: 'Earth Power', hit: 0.6, shake: 4, layers: [
    { id: 'nature/earth-spike', t: -0.2, at: 'feet', stop: 1.2 }] },
  flying: { move: 'Gust', hit: 0.45, shake: 1, layers: [
    { id: 'nature/tornado', t: 0.1, stop: 1.0, at: 'feet', opts: { dust: WIND.slice(0, 7), leaves: WIND.slice(1, 6) } },
    { id: 'impacts/hit-spark', t: 0.45, at: 'chest', aim: true, opts: { palette: WIND } }] },
  psychic: { move: 'Psybeam', hit: 0.45, shake: 1, layers: [
    { id: 'custom/beam', t: 0.05, stop: 0.8, at: 'launch', aim: true, reach: true, opts: { palette: PINK } },
    { id: 'arcane/mana-burst', t: 0.42, at: 'chest', stop: 1.2, opts: { palette: PINK } },
    { id: 'status/confused', t: 0.6, stop: 1.4, at: 'feet', actor: true }] },
  bug: { move: 'X-Scissor', dash: true, hit: 0.3, shake: 2, layers: [
    { id: 'melee/double-slash', t: 0.22, at: 'feet', aim: false, actor: true, opts: { palette: LIME, sparks: LIME.slice(3) } },
    { id: 'impacts/hit-spark', t: 0.32, at: 'chest', aim: true, opts: { palette: LIME } }] },
  rock: { move: 'Rock Slide', hit: 0.34, shake: 4, layers: [
    { id: 'custom/rock-slide', t: 0.0, at: 'feet' },
    { id: 'impacts/heavy-landing', t: 0.48, at: 'feet', actor: true }] },
  ghost: { move: 'Shadow Ball', hit: 0.6, shake: 2, layers: [
    { id: 'shadow/void-orb', t: 0.05, fly: [0.05, 0.6], arc: 6, at: 'launch', stop: 0.62, center: [0, -62], upright: true },
    { id: 'shadow/dark-explosion', t: 0.58, at: 'feet', stop: 1.2 }] },
  dragon: { move: 'Dragon Breath', hit: 0.45, shake: 2, layers: [
    { id: 'fire/fire-breath', t: 0.05, stop: 0.85, at: 'launch', aim: true, opts: { palette: DRAGON } },
    { id: 'impacts/hit-spark', t: 0.45, at: 'chest', aim: true, opts: { palette: DRAGON } }] },
  dark: { move: 'Crunch', hit: 0.32, shake: 2, layers: [
    { id: 'melee/claw-swipe', t: 0.12, at: 'feet', actor: true, opts: { palette: 'shadow', sparks: ['#c8a0ff', '#8048b8', '#ffffff'] } },
    { id: 'melee/claw-swipe', t: 0.26, at: 'feet', actor: true, flip: true, opts: { palette: 'shadow', sparks: ['#c8a0ff', '#8048b8', '#ffffff'], seed: 3 } },
    { id: 'impacts/hit-spark', t: 0.32, at: 'chest', aim: true, opts: { palette: 'shadow' } }] },
  steel: { move: 'Flash Cannon', hit: 0.45, shake: 2, layers: [
    { id: 'custom/beam', t: 0.05, stop: 0.75, at: 'launch', aim: true, reach: true, opts: { palette: 'metal' } },
    { id: 'impacts/hit-spark', t: 0.45, at: 'chest', aim: true, opts: { palette: 'metal' } }] },
  fairy: { move: 'Dazzling Gleam', hit: 0.5, shake: 1, layers: [
    { id: 'arcane/star-fall', t: 0.0, at: 'feet', stop: 1.1, opts: { palette: FAIRY } },
    { id: 'holy/feather-burst', t: 0.5, at: 'chest', stop: 1.3, opts: { glow: '#ffd0ea' } }] },
};
export const TYPES = Object.keys(ATTACKS);
// Signature moves used on specific screens (not a type's showcase move).
export const SPECIAL = {
  'vine-whip': { move: 'Vine Whip', hit: 0.38, shake: 3, layers: [
    { id: 'melee/whip-crack', t: 0.08, at: 'feet', actor: true, flip: true, opts: { palette: 'leaf' } },
    { id: 'impacts/crit-hit', t: 0.36, at: 'chest', aim: true }] },
};
export const ATTACK_LEN = 1.6;

// a palette may be named after one of pixelfx's ramps ('leaf', 'stone', ...)
function resolve(core, o = {}) { const r = { ...o }; if (typeof r.palette === 'string') r.palette = core.PAL[r.palette]; return r; }

/**
 * A playable attack. scene = { attacker: side, target: side } where side = { feet, chest, launch, actor }
 * (art px). update(dt) advances; draw(frame) paints the effects; pose(t) gives sprite offsets and the target flash.
 */
export function createAttack(core, FX, type, scene) {
  const A = ATTACKS[type] || SPECIAL[type]; if (!A) throw new Error('unknown attack ' + type);
  const at = (s, k) => (k === 'feet' ? s.feet : k === 'chest' ? s.chest : s.launch);
  const from = scene.attacker.launch, to = scene.target.chest;
  const aimAngle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const live = A.layers.map((L) => ({ L, fx: null, started: false, stopped: false }));
  let t = 0;
  const posOf = (L, tt) => {
    if (L.fly) {
      const [t0, t1] = L.fly, k = Math.max(0, Math.min(1, (tt - t0) / (t1 - t0))), e = k;
      const x = from[0] + (to[0] - from[0]) * e, y = from[1] + (to[1] - from[1]) * e - Math.sin(Math.PI * e) * (L.arc || 0);
      return L.center ? [x - L.center[0], y - L.center[1]] : [x, y]; // fly the effect by its visual centre, not its origin
    }
    const side = L.at === 'launch' ? scene.attacker : scene.target;
    return at(side, L.at === 'launch' ? 'launch' : L.at);
  };
  const flyAngle = (L, tt) => {
    if (!L.fly) return L.aim ? aimAngle : 0;
    const a = posOf(L, tt - 0.02), b = posOf(L, tt + 0.02); return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  function start(rec) {
    const L = rec.L, mod = FX[L.id]; if (!mod) throw new Error('missing effect ' + L.id);
    const p = posOf(L, t), ang = L.aim || L.fly ? flyAngle(L, t) : 0;
    const left = Math.cos(ang) < 0, opts = { ...resolve(core, L.opts), x: p[0], y: p[1] };
    // facing: aimed effects rotate; a left-going one is flipped instead of turned upside down
    if ((L.aim || L.fly) && !L.upright) { opts.flip = left; opts.angle = left ? ang - Math.PI : ang; }
    if (L.flip) opts.flip = !opts.flip;
    if (L.actor) opts.actor = scene.target.actor;
    if (L.reach) opts.length = Math.hypot(to[0] - from[0], to[1] - from[1]); // a beam that ends on the target
    if (L.id.startsWith('custom/')) opts.core = core; // custom effects have no imports
    rec.fx = core.createFx(mod, opts); rec.started = true;
    if (rec.L.t < 0) rec.fx.update(-rec.L.t);
  }
  return {
    move: A.move, hit: A.hit,
    update(dt) {
      t += dt;
      for (const rec of live) {
        if (!rec.started && t >= Math.max(0, rec.L.t)) start(rec);
        if (!rec.fx) continue;
        rec.fx.update(dt);
        if (rec.L.fly) {
          const p = posOf(rec.L, t); rec.fx.options.x = p[0]; rec.fx.options.y = p[1];
          if (!rec.L.upright) { const ang = flyAngle(rec.L, t), left = Math.cos(ang) < 0; rec.fx.options.flip = left; rec.fx.options.angle = left ? ang - Math.PI : ang; }
        }
        // app change: a flown projectile (a looping disc or orb) ends where it lands instead of spinning on forever
        const stopAt = rec.L.stop ?? (rec.L.fly ? rec.L.fly[1] : null);
        if (stopAt != null && !rec.stopped && t >= stopAt) { rec.fx.stop(); rec.stopped = true; }
      }
    },
    draw(frame, layer) { for (const rec of live) if (rec.fx && !rec.fx.done()) rec.fx.draw(frame, layer); },
    /** Sprite offsets (art px) and the white flash on the target, at the current time. */
    pose() {
      const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      let a = 0; // attacker lunge: wind back, then strike forwards
      if (A.dash) { if (t < 0.12) a = -3 * (t / 0.12); else if (t < A.hit) a = -3 + 27 * Math.min(1, (t - 0.12) / (A.hit - 0.12)); else a = 24 * Math.max(0, 1 - (t - A.hit) / 0.25); }
      else { if (t < 0.1) a = -2 * (t / 0.1); else if (t < 0.22) a = -2 + 6 * ((t - 0.1) / 0.12); else a = 4 * Math.max(0, 1 - (t - 0.22) / 0.2); }
      const sinceHit = t - A.hit, kb = sinceHit >= 0 ? 5 * Math.max(0, 1 - sinceHit / 0.35) : 0;
      const flash = sinceHit >= 0 && sinceHit < 0.14 ? (Math.floor(sinceHit / 0.035) % 2 ? 0.2 : 1) : 0;
      const sh = sinceHit >= 0 && sinceHit < 0.3 ? A.shake * (1 - sinceHit / 0.3) * (Math.floor(sinceHit * 60) % 2 ? 1 : -1) : 0;
      return { attacker: [ux * a, uy * a], target: [ux * kb, uy * kb], flash, shake: [Math.round(sh), 0] };
    },
    get t() { return t; },
    done() { return t >= ATTACK_LEN && live.every((r) => !r.fx || r.fx.done()); },
  };
}

/** An actor (pixelfx's body format) from RGBA sprite bytes, at an art-px scale, feet at (0, 0). */
export function actorFrom(spr, k = 1, hexU32) {
  const w = Math.round(spr.w * k), h = Math.round(spr.h * k), data = new Uint8Array(w * h), pixels = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(spr.w - 1, Math.floor(x / k)), sy = Math.min(spr.h - 1, Math.floor(y / k)), s = (sy * spr.w + sx) * 4;
    if (spr.rgba[s + 3] < 128) continue;
    data[y * w + x] = 1; pixels[y * w + x] = (spr.rgba[s] | (spr.rgba[s + 1] << 8) | (spr.rgba[s + 2] << 16) | (255 << 24)) >>> 0;
  }
  return { mask: { w, h, data }, pixels, x: -Math.floor(w / 2), y: -h, w, h, k: 2, head: [0, -h], chest: [0, -Math.round(h * 0.5)] };
}
