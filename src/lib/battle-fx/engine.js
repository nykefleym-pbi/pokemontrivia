// The battle's pixel effects (Figma rows 3b, 3c, 3.4, 3.7), drawn by the same pixelfx scene code that renders the
// Figma keyframes and the preview page (trivia-battle-figma-plugin/dev/scene). Vendored copies:
//   pixelfx/   github.com/patch-gg/pixelfx (MIT, see pixelfx/LICENSE and NOTICE.md): core + the effects we play
//   scene/     the plugin's attacks.js (one move per type), props.js (the Poké Ball), the two custom effects
// Coordinates are art px: the 390 x 464 pt stage at 2 pt per px (195 x 232). The sprites stay DOM <img>s; this
// draws the effects on two canvases (behind and in front of them) and moves the sprites with the attack's pose.
import * as core from "./pixelfx/core/index.js";
import { ATTACKS, SPECIAL, POISON, createAttack } from "./scene/attacks.js";
import { drawBall } from "./scene/props.js";

const W = 195, H = 232;
const mods = {
  ...import.meta.glob("./pixelfx/fx/*/*.js", { eager: true }),
  ...import.meta.glob("./scene/fx-*.js", { eager: true }),
};
const FX = {};
for (const [p, m] of Object.entries(mods)) {
  const fx = p.match(/pixelfx\/fx\/(\w+\/[\w-]+)\.js$/), cu = p.match(/scene\/fx-([\w-]+)\.js$/);
  if (fx && !fx[1].endsWith("_lib")) FX[fx[1]] = m;
  else if (cu) FX["custom/" + cu[1]] = m;
}

// The app's StatusKind -> the effect wrapped round the Pokémon (dev/scene/status.js).
const TOXIC = ["#0e0414", "#24082e", "#3e0c52", "#5e1078", "#8a1aa6", "#b23ccc", "#e07cf0", "#ffd0ff"];
const STATUS = {
  poisoned: ["status/poisoned", { palette: POISON }],
  "badly-poisoned": ["status/poisoned", { palette: TOXIC, seed: 7 }],
  burn: ["status/burning", {}],
  paralysis: ["lightning/electrified", { palette: "volt" }],
  sleep: ["status/sleep", {}],
  freeze: ["ice/freeze", {}],
  confused: ["status/confused", {}],
};
// 3.4: 3, 5, 7 and 10 in a row hit harder: a freeze on contact, more shake, a second impact.
const FREEZE = [0, 0.06, 0.08, 0.1, 0.12];

/** pixelfx's actor (a body mask + pixels, feet at 0,0) from a trimmed sprite at k art px per sprite px. */
function actorOf(img, trim, k) {
  const c = document.createElement("canvas");
  c.width = trim.w; c.height = trim.h;
  const g = c.getContext("2d");
  g.drawImage(img, -trim.x, -trim.y);
  const src = g.getImageData(0, 0, trim.w, trim.h).data;
  const w = Math.max(1, Math.round(trim.w * k)), h = Math.max(1, Math.round(trim.h * k));
  const data = new Uint8Array(w * h), pixels = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (Math.min(trim.h - 1, Math.floor(y / k)) * trim.w + Math.min(trim.w - 1, Math.floor(x / k))) * 4;
    if (src[s + 3] < 128) continue;
    data[y * w + x] = 1;
    pixels[y * w + x] = (src[s] | (src[s + 1] << 8) | (src[s + 2] << 16) | (255 << 24)) >>> 0;
  }
  return { mask: { w, h, data }, pixels, x: -Math.floor(w / 2), y: -h, w, h, k: 2, head: [0, -h], chest: [0, -Math.round(h * 0.5)] };
}

function sideOf(s, side) {
  const bw = s.trim.w * s.k, bh = s.trim.h * s.k, feet = [s.cx, s.feet], chest = [s.cx, s.feet - bh * 0.5];
  const launch = side === "enemy" ? [chest[0] - bw * 0.3, chest[1] - bh * 0.05] : [chest[0] + bw * 0.28, chest[1] - bh * 0.22];
  return { feet, chest, launch, actor: actorOf(s.img, s.trim, s.k) };
}

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const CATCH_LEN = 3.9;
/** Reduced motion: the ball is shut and the sparkles show at this time (s); GOTCHA! follows. */
export const CATCH_CLICK_REDUCED = 0.7;

export function createBattleFx(back, front, els, opts = {}) {
  const reduced = !!opts.reduced;
  const fb = core.createFrame(W, H), ff = core.createFrame(W, H);
  const bctx = back.getContext("2d"), fctx = front.getContext("2d");
  const bimg = bctx.createImageData(W, H), fimg = fctx.createImageData(W, H);
  const sides = {}, statuses = { enemy: new Map(), player: new Map() };
  let attack = null, extra = [], hold = 0, raf = 0, last = 0, catching = null, alive = true;

  const setPose = (el, x, y, flash) => {
    if (!el) return;
    el.style.translate = x || y ? `${x * 2}px ${y * 2}px` : "";
    el.style.filter = flash >= 0.5 ? "brightness(0) invert(1)" : "";
  };

  function tick(now) {
    raf = 0;
    if (!alive) return;
    let dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (hold > 0) { hold -= dt; dt = 0; } // hit-stop: everything waits
    if (attack) {
      const before = attack.a.t;
      attack.a.update(dt);
      if (before < attack.a.hit && attack.a.t >= attack.a.hit) {
        hold = attack.freeze;
        if (attack.power >= 2) extra.push(core.createFx(FX["impacts/crit-hit"], { x: attack.target.chest[0], y: attack.target.chest[1] }));
      }
    }
    for (const fx of extra) fx.update(dt);
    extra = extra.filter((fx) => !fx.done());
    for (const m of Object.values(statuses)) for (const fx of m.values()) fx.update(dt);
    if (catching) catching.update(dt);

    core.clearFrame(fb); core.clearFrame(ff);
    for (const m of Object.values(statuses)) for (const fx of m.values()) { fx.draw(fb, "back"); fx.draw(ff, "front"); }
    if (attack) { attack.a.draw(fb, "back"); attack.a.draw(ff, "front"); }
    for (const fx of extra) fx.draw(ff);
    if (catching) catching.draw(ff);

    // the sprites follow the attack: lunge, knock-back, white flash, screen shake
    if (attack) {
      const p = attack.a.pose(), atk = attack.who === "player" ? els.player : els.enemy, tgt = attack.who === "player" ? els.enemy : els.player;
      const k = reduced ? 0 : 1 + attack.power * 0.5;
      setPose(atk, p.attacker[0], p.attacker[1], 0);
      setPose(tgt, p.target[0], p.target[1], reduced ? 0 : p.flash);
      if (els.stage) els.stage.style.translate = p.shake[0] * k ? `${Math.round(p.shake[0] * k) * 2}px 0` : "";
      if (attack.a.done() || attack.a.t > 3) { // 3 s cap: a looping layer must never hold the field
        setPose(els.enemy, 0, 0, 0); setPose(els.player, 0, 0, 0);
        if (els.stage) els.stage.style.translate = "";
        const done = attack.resolve; attack = null; done();
      }
    }
    core.composite(fb, bimg.data, null); bctx.putImageData(bimg, 0, 0);
    core.composite(ff, fimg.data, null); fctx.putImageData(fimg, 0, 0);
    if (catching && catching.done()) { const done = catching.resolve; catching = null; done(); }
    if (attack || extra.length || catching || statuses.enemy.size || statuses.player.size || hold > 0) raf = requestAnimationFrame(tick);
  }
  const run = () => { if (!raf && alive) { last = performance.now(); raf = requestAnimationFrame(tick); } };

  return {
    /** A sprite as the DOM shows it: its image, visible box, art px per sprite px, centre x and feet y (art px). */
    setSprite(side, s) { sides[side] = sideOf(s, side); },
    has(side) { return !!sides[side]; },
    /** One attack (a type's move, or 'vine-whip'). power 0..4 = the 3/5/7/10-in-a-row tier. */
    attack(type, who, power = 0) {
      const tgtSide = who === "player" ? "enemy" : "player";
      if (!sides.enemy || !sides.player || !(ATTACKS[type] || SPECIAL[type])) return Promise.resolve();
      if (attack) attack.resolve();
      return new Promise((resolve) => {
        const a = createAttack(core, FX, type, who === "player" ? { attacker: sides.player, target: sides.enemy } : { attacker: sides.enemy, target: sides.player });
        attack = { a, who, power: clamp(power, 0, 4), freeze: reduced ? 0 : FREEZE[clamp(power, 0, 4)], target: sides[tgtSide], resolve };
        run();
      });
    },
    /** The statuses wrapped round a side's Pokémon (looping until removed). */
    setStatuses(side, kinds) {
      const m = statuses[side], S = sides[side];
      if (!S) return;
      for (const [k, fx] of m) if (!kinds.includes(k)) { fx.stop(); m.delete(k); extra.push(fx); }
      for (const k of kinds) {
        const st = STATUS[k];
        if (!st || m.has(k)) continue;
        const o = { ...st[1] };
        if (typeof o.palette === "string") o.palette = core.PAL[o.palette];
        m.set(k, core.createFx(FX[st[0]], { ...o, x: S.feet[0], y: S.feet[1], actor: S.actor }));
      }
      run();
    },
    /**
     * 3.7: the ball is thrown, opens, pulls the opponent in, wobbles three times and clicks (dev/scene/sequences.js).
     * onEnemy(tintK, alpha) fades the DOM sprite into the ball.
     */
    catchPokemon(onEnemy) {
      const E = sides.enemy;
      if (!E) return Promise.resolve();
      const start = [-6, 250], hover = [E.chest[0] - 4, E.chest[1] - 22], floor = [E.feet[0], E.feet[1] - 7];
      const wob = (tt) => { for (const w0 of [1.75, 2.3, 2.85]) { const k = (tt - w0) / 0.32; if (k >= 0 && k <= 1) return Math.sin(k * Math.PI * 2) * 0.55 * (1 - k * 0.3); } return 0; };
      // Reduced motion (Figma 3.7, calm): no throw, beam or wobble. The shut ball sits where the
      // Pokémon stood, the Pokémon fades into it, then the three sparkles.
      const R = reduced;
      const ball = R ? (tt) => ({ x: floor[0], y: floor[1], ang: 0, open: 0, glow: tt >= CATCH_CLICK_REDUCED ? 1 : 0 }) : (tt) => {
        if (tt < 0.6) { const k = tt / 0.6; return { x: start[0] + (hover[0] - start[0]) * k, y: start[1] + (hover[1] - start[1]) * k - Math.sin(k * Math.PI) * 70, ang: tt * 16, open: 0 }; }
        if (tt < 1.15) return { x: hover[0], y: hover[1] + Math.sin(tt * 12) * 0.6, ang: 0, open: tt < 1.0 ? smooth(0.6, 0.72, tt) : 1 - smooth(1.0, 1.15, tt) };
        if (tt < 1.5) { const k = smooth(1.15, 1.5, tt), bounce = tt > 1.4 ? Math.sin(((tt - 1.4) / 0.1) * Math.PI) * 3 : 0; return { x: hover[0], y: hover[1] + (floor[1] - hover[1]) * k * k - bounce, ang: 0, open: 0 }; }
        return { x: floor[0], y: floor[1], ang: wob(tt), open: 0, glow: tt >= 3.0 ? 1 : wob(tt) ? 0.6 : 0 };
      };
      let t = 0, flash = null, stars = null;
      return new Promise((resolve) => {
        catching = {
          resolve,
          update(dt) {
            t += dt;
            if (!R && !flash && t >= 0.62) flash = core.createFx(FX["impacts/hit-spark"], { x: hover[0], y: hover[1] + 4, palette: core.PAL.holy });
            if (!R && !stars && t >= 3.0) stars = core.createFx(FX["pickups/collect-burst"], { x: floor[0], y: floor[1] + 4 });
            if (flash) flash.update(dt);
            if (stars) stars.update(dt);
            if (R) onEnemy?.(0, 1 - smooth(0.1, 0.6, t));
            else onEnemy?.(smooth(0.62, 0.8, t) * 0.85, t < 1.02 ? 1 - smooth(0.78, 1.02, t) : 0);
          },
          draw(f) {
            // a red beam pulls the Pokémon into the ball while it is open
            if (!R && t > 0.62 && t < 1.05) for (let i = 0; i < 6; i++) { const a = -0.6 + i * 0.24; for (let s = 0; s < 18; s++) if ((s + i + Math.floor(t * 30)) % 3 === 0) put(f, hover[0] + Math.sin(a) * s * 1.2, hover[1] + 6 + s * 1.6, 0xff7878ff); }
            const b = ball(t), img = drawBall(b.ang, b.open, b.glow || 0), ox = Math.round(b.x - 8), oy = Math.round(b.y - 11);
            for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const c = img.px[y * img.w + x]; if (c >>> 24 >= 128) put(f, ox + x, oy + y, ((c & 0xffffff) | 0xff000000) >>> 0); }
            if (flash && !flash.done()) flash.draw(f);
            if (stars && !stars.done()) stars.draw(f);
            // Figma 3.7: three sparkles round the shut ball
            if (t >= (R ? CATCH_CLICK_REDUCED : 3.1)) for (const [dx, dy, r] of [[-20, -11, 4], [18, -13, 5], [6, -28, 3]]) sparkle(f, floor[0] + dx, floor[1] + dy, r);
          },
          done: () => t >= (R ? CATCH_CLICK_REDUCED + 0.8 : CATCH_LEN),
        };
        run();
      });
    },
    destroy() {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      attack?.resolve(); catching?.resolve();
      setPose(els.enemy, 0, 0, 0); setPose(els.player, 0, 0, 0);
      if (els.stage) els.stage.style.translate = "";
    },
  };
}

/** A four-point pixel sparkle (white core, pale gold arms) of arm length r. */
function sparkle(f, x, y, r) {
  put(f, x, y, 0xffffffff);
  for (let i = 1; i <= r; i++) { const c = i === r ? 0xff9ee6ff : 0xffd8f6ff; put(f, x + i, y, c); put(f, x - i, y, c); put(f, x, y + i, c); put(f, x, y - i, c); }
}

// 0xAABBGGRR as pixelfx stores colour; 0xff7878ff above is opaque rgb(255,120,120)
function put(f, x, y, c) {
  const X = Math.round(x), Y = Math.round(y);
  if (X >= 0 && Y >= 0 && X < f.w && Y < f.h) f.color[Y * f.w + X] = c;
}
