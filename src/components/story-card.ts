import QRCode from "qrcode";
import { UI_ICON } from "@/lib/app-icons";
import { glossSvg } from "@/components/na/gloss-data";
import { rewardIconSvg } from "@/components/na/reward-icon";
import { lineIconSvg } from "@/components/na/icon";
import { levelBadgeSvg } from "@/components/na/celebration";

/**
 * Figma row 9 "Bold poster": a 9:16 story card for every win (plugin storyCard).
 * Laid out on the design's 360 x 640 grid and drawn at 3x, so the PNG is a
 * 1080 x 1920 story. Instagram and TikTok cover about the top 270 px and the
 * bottom 312 px of a story with their own bars, so everything that must be read
 * sits between SAFE_TOP and H - SAFE_BOTTOM, stacked from the bottom up.
 * The PNG is square-cornered (a story is full-bleed); the preview rounds it.
 */
export const STORY_W = 360;
export const STORY_H = 640;
const SCALE = 3;
const SAFE_BOTTOM = 104;
const SHARE_URL = "https://pokemontriviabattle.vercel.app";

export type StatKind = "right" | "time" | "xp" | "coin" | "rank" | "streak" | "badge" | "level" | "item" | "stage" | "heart";
export interface StoryStat {
  value: string;
  label: string;
  kind: StatKind;
  /** The item's own art, for kind "item". */
  iconUrl?: string;
}
export interface StorySpec {
  bg: [string, string];
  /** Dark ink for the line under the headline (on the yellow card). */
  inkDark?: boolean;
  confetti: string[];
  headline: string;
  line: string;
  stats: StoryStat[];
  cta?: string;
  trainerName: string;
  trainerArt: string;
  level: number;
  hero: (g: CanvasRenderingContext2D) => Promise<void>;
}

/** A stat tile's colour band and icon, by kind (plugin STAT_KIND). */
const STAT_KIND: Record<StatKind, [string, () => string]> = {
  right: ["#2EE59D", () => rewardIconSvg("Accuracy")],
  time: ["#5B8CFF", () => rewardIconSvg("Time")],
  xp: ["#9B7BFF", () => rewardIconSvg("XP")],
  coin: ["#FFC83D", () => rewardIconSvg("Coin")],
  rank: ["#FFC83D", () => rewardIconSvg("Trophy")],
  streak: ["#FF8A1F", () => rewardIconSvg("Streak")],
  badge: ["#5B8CFF", () => glossSvg("shield") as string],
  level: ["#FFC83D", () => glossSvg("star") as string],
  item: ["#FF3B4E", () => ""],
  stage: ["#2EE59D", () => glossSvg("dex") as string],
  heart: ["#FF3B4E", () => glossSvg("heart") as string],
};

// ------------------------------------------------------------------ loading
const IMG_CACHE = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = IMG_CACHE.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    p.catch(() => IMG_CACHE.delete(url));
    IMG_CACHE.set(url, p);
  }
  return p;
}

/** An SVG string as an image, rasterised at `px` so it stays sharp at 3x. */
function svgImage(svg: string, px: number) {
  const sized = svg.replace(/<svg([^>]*?)\swidth="[^"]*"\sheight="[^"]*"/, `<svg$1 width="${px}" height="${px}"`);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`);
}

async function drawSvg(g: CanvasRenderingContext2D, svg: string, x: number, y: number, size: number) {
  try {
    g.drawImage(await svgImage(svg, size * SCALE), x, y, size, size);
  } catch {
    /* an icon that will not decode is left out rather than failing the card */
  }
}

type Sprite = { img: HTMLImageElement; x: number; y: number; w: number; h: number };
/** A pixel sprite trimmed to its visible pixels (as FieldSprite stands it on its pad). */
async function sprite(id: number, shiny = false): Promise<Sprite | null> {
  const path = `${shiny ? "shiny/" : ""}${id}.png`;
  for (const base of ["https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/", "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/"]) {
    try {
      const img = await loadImage(base + path);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const cg = c.getContext("2d")!;
      cg.drawImage(img, 0, 0);
      const d = cg.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++)
          if (d[(y * c.width + x) * 4 + 3] > 8) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
      return x1 < 0 ? null : { img, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    } catch {
      /* next source */
    }
  }
  return null;
}

function drawSprite(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, k: number) {
  g.imageSmoothingEnabled = false;
  g.drawImage(s.img, s.x, s.y, s.w, s.h, x, y, s.w * k, s.h * k);
  g.imageSmoothingEnabled = true;
}

/** A soft shadow and a sprite standing on it, centred in the 360 x 160 hero, feet at 158 (plugin stand). */
export async function standSprite(g: CanvasRenderingContext2D, id: number, shiny: boolean, kMax: number) {
  const s = await sprite(id, shiny);
  if (!s) return;
  // a bigger Pokémon is drawn smaller so it stays inside the hero, as the design's art is
  const k = Math.min(kMax, 150 / s.h, 300 / s.w);
  const ew = Math.round(s.w * k * 0.85);
  g.fillStyle = "rgba(13,10,51,0.22)";
  g.beginPath();
  g.ellipse(180, 158, ew / 2, 10, 0, 0, Math.PI * 2);
  g.fill();
  drawSprite(g, s, Math.round((360 - s.w * k) / 2), Math.round(158 - s.h * k), k);
}

// ------------------------------------------------------------------ drawing
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function font(g: CanvasRenderingContext2D, css: string, spacing = 0) {
  g.font = css;
  if ("letterSpacing" in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
}

const LABEL = `600 12px Outfit, sans-serif`;
const LABEL_TRACK = 0.48;

/** Pixel sparkles in a staggered grid (plugin PATTERN). */
function drawPattern(g: CanvasRenderingContext2D) {
  g.fillStyle = "rgba(255,255,255,0.16)";
  for (let y = 18, row = 0; y < STORY_H; y += 36, row++)
    for (let x = row % 2 ? 40 : 20; x < STORY_W; x += 40) {
      g.fillRect(x - 4, y - 1, 8, 2);
      g.fillRect(x - 1, y - 4, 2, 8);
    }
}

/** Square pixel confetti on a ring around the hero (plugin CONFETTI), seeded so every card matches. */
function drawConfetti(g: CanvasRenderingContext2D, top: number, colors: string[], seed = 7) {
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280), r / 233280);
  const w = STORY_W, h = 156;
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, d = 104 + rnd() * 56;
    const x = Math.round(w / 2 + Math.cos(a) * d), y = Math.round(h / 2 + Math.sin(a) * d * 0.72);
    const k = rnd() < 0.6 ? 6 : 9;
    if (x < 10 || x > w - 10 || y < 4 || y > h - 4) continue;
    g.fillStyle = colors[i % colors.length];
    g.fillRect(x - k / 2, top + y - k / 2, k, k);
  }
}

/** The result screens' Reward tile (colour band, label, icon, number), recoloured per stat. */
async function drawTile(g: CanvasRenderingContext2D, s: StoryStat, x: number, y: number, w: number) {
  const [col, icon] = STAT_KIND[s.kind];
  g.fillStyle = col;
  rr(g, x, y, w, 110, 16);
  g.fill();
  g.fillStyle = "#0B1026";
  font(g, LABEL, LABEL_TRACK);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(s.label, x + w / 2, y + 15, w - 8);
  g.fillStyle = "#141A3F";
  rr(g, x + 2, y + 28, w - 4, 80, 14);
  g.fill();
  if (s.kind === "item" && s.iconUrl) {
    try {
      const im = await loadImage(s.iconUrl);
      g.imageSmoothingEnabled = false;
      g.drawImage(im, x + w / 2 - 15, y + 38, 30, 30);
      g.imageSmoothingEnabled = true;
    } catch {
      /* skip */
    }
  } else if (icon()) await drawSvg(g, icon(), x + w / 2 - 15, y + 38, 30);
  g.fillStyle = col;
  font(g, `400 22px "Lilita One", sans-serif`);
  g.fillText(s.value, x + w / 2, y + 85);
}

async function drawQr(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  try {
    const url = await QRCode.toDataURL(SHARE_URL, { width: size * SCALE, margin: 1, color: { dark: "#0B1026ff", light: "#FFFFFFff" } });
    g.drawImage(await loadImage(url), x, y, size, size);
  } catch {
    /* the card is still worth sharing without its QR */
  }
}

/** Wait for the kit fonts, so the canvas does not fall back to a system face. */
async function fontsReady() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    ['400 38px "Lilita One"', "700 17px Outfit", "600 15px Outfit", "500 13px Outfit", "600 12px Outfit"].map((f) => document.fonts.load(f).catch(() => [])),
  );
}

export async function renderStory(spec: StorySpec): Promise<string> {
  await fontsReady();
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W * SCALE;
  canvas.height = STORY_H * SCALE;
  const g = canvas.getContext("2d")!;
  g.scale(SCALE, SCALE);

  const bg = g.createLinearGradient(0, 0, 0, STORY_H);
  bg.addColorStop(0, spec.bg[0]);
  bg.addColorStop(1, spec.bg[1]);
  g.fillStyle = bg;
  g.fillRect(0, 0, STORY_W, STORY_H);
  drawPattern(g);

  // Stack from the bottom safe line up, so a longer line pushes the picture up instead of overlapping the numbers.
  const ftH = 54, ftY = STORY_H - SAFE_BOTTOM - ftH;
  const stY = ftY - 10 - 110;
  font(g, `700 17px Outfit, sans-serif`);
  const lines = wrap(g, spec.line, 296);
  const lnY = stY - 8 - lines.length * 22;
  const hlY = lnY - 44;
  const whoY = hlY - 4 - 28;
  const heroY = whoY - 2 - 160;

  for (const [d, op] of [[252, 0.16], [186, 0.2]] as const) {
    g.fillStyle = `rgba(255,255,255,${op})`;
    g.beginPath();
    g.arc(180, heroY + 82, d / 2, 0, Math.PI * 2);
    g.fill();
  }
  drawConfetti(g, heroY, spec.confetti);
  try {
    g.drawImage(await loadImage(UI_ICON.appLogo), (STORY_W - 96) / 2, 24, 96, 48);
  } catch {
    /* skip */
  }
  g.save();
  g.translate(0, heroY);
  await spec.hero(g);
  g.restore();

  // the trainer: avatar and "NAME · LEVEL N" in a white pill
  const who = `${spec.trainerName.toUpperCase()} · LEVEL ${spec.level}`;
  font(g, LABEL, LABEL_TRACK);
  const tw = Math.min(g.measureText(who).width, 220);
  const pw = 2 + 24 + 6 + tw + 12, px = Math.round((STORY_W - pw) / 2);
  g.fillStyle = "#F4F6FF";
  rr(g, px, whoY, pw, 28, 14);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(px + 14, whoY + 14, 12, 0, Math.PI * 2);
  g.fillStyle = "#252F6B";
  g.fill();
  g.clip();
  try {
    const a = await loadImage(spec.trainerArt);
    g.drawImage(a, px + 2, whoY + 2, 24, 24);
  } catch {
    /* skip */
  }
  g.restore();
  g.fillStyle = "#0B1026";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(who, px + 32, whoY + 14.5, tw);

  // the headline: white Lilita One with a dark outline, like a sticker, readable on every colour
  let hs = 38;
  font(g, `400 ${hs}px "Lilita One", sans-serif`);
  const hw = g.measureText(spec.headline).width;
  if (hw > 316) {
    hs = Math.floor((38 * 316) / hw);
    font(g, `400 ${hs}px "Lilita One", sans-serif`);
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 10;
  g.strokeStyle = "#070A1A";
  g.shadowColor = "rgba(10,15,38,0.45)";
  g.shadowOffsetY = 4;
  g.strokeText(spec.headline, 180, hlY + 23);
  g.shadowColor = "transparent";
  g.fillStyle = "#F4F6FF";
  g.fillText(spec.headline, 180, hlY + 23);

  font(g, `700 17px Outfit, sans-serif`);
  g.fillStyle = spec.inkDark ? "#0B1026" : "#F4F6FF";
  lines.forEach((l, i) => g.fillText(l, 180, lnY + 11 + i * 22));

  const tileW = spec.stats.length === 2 ? 140 : 100;
  const rowW = spec.stats.length * tileW + (spec.stats.length - 1) * 8;
  for (const [i, s] of spec.stats.entries()) await drawTile(g, s, Math.round((STORY_W - rowW) / 2) + i * (tileW + 8), stY, tileW);

  // the footer: the QR to the game, a dare and the address
  g.fillStyle = "rgba(7,10,26,0.88)";
  rr(g, 32, ftY, 296, ftH, 16);
  g.fill();
  await drawQr(g, 38, ftY + 6, 42);
  g.textAlign = "left";
  g.fillStyle = "#F4F6FF";
  font(g, `600 15px Outfit, sans-serif`);
  g.fillText(spec.cta ?? "Think you can beat me?", 90, ftY + 17, 230);
  g.fillStyle = "#B7BEE8";
  font(g, `500 13px Outfit, sans-serif`);
  g.fillText("pokemontriviabattle.vercel.app", 90, ftY + 37, 230);

  return canvas.toDataURL("image/png");
}

function wrap(g: CanvasRenderingContext2D, text: string, w: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && g.measureText(next).width > w) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out.slice(0, 2);
}

// ------------------------------------------------------------------ heroes
/** The Daily Quest's Poké Ball, right (NaDailyMarks "right"). */
const BALL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="13.5" fill="#F4F6FF"/><path d="M2.5 16a13.5 13.5 0 0 1 27 0z" fill="#FF3B4E"/><path d="M2.5 16h27" stroke="#0B1026" stroke-width="3"/><circle cx="16" cy="16" r="13.5" stroke="#0B1026" stroke-width="3" fill="none"/><circle cx="16" cy="16" r="4.5" fill="#FFFFFF" stroke="#0B1026" stroke-width="3"/><path d="M8 9.5a9 9 0 0 1 5-3.5" stroke="#FFFFFF" stroke-opacity=".75" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>';

/** Rotom over the ten Poké Balls in two rows of five, stacked from the hero's floor up. */
export async function dailyHero(g: CanvasRenderingContext2D, rotomId: number) {
  const b = 32 * 0.85, rowW = 5 * b + 4 * 4 * 0.85;
  let y = 158;
  for (let r = 0; r < 2; r++) {
    y -= b;
    for (let i = 0; i < 5; i++) await drawSvg(g, BALL, Math.round((360 - rowW) / 2) + i * (b + 3.4), Math.round(y), b);
    y -= 4;
  }
  const s = await sprite(rotomId);
  if (s) drawSprite(g, s, Math.round((360 - s.w * 1.5) / 2), Math.round(y - s.h * 1.5), 1.5);
}

/** The trainer with the new level's badge overlapping it, the pair centred. */
export async function levelHero(g: CanvasRenderingContext2D, trainerArt: string, level: number) {
  const lap = 46, x0 = Math.round((360 - (150 + 96 - lap)) / 2);
  try {
    const t = await loadImage(trainerArt);
    g.imageSmoothingEnabled = false;
    const k = Math.min(150 / t.naturalWidth, 150 / t.naturalHeight);
    g.drawImage(t, x0 + (150 - t.naturalWidth * k) / 2, 8 + (150 - t.naturalHeight * k), t.naturalWidth * k, t.naturalHeight * k);
    g.imageSmoothingEnabled = true;
  } catch {
    /* skip */
  }
  const bx = x0 + 150 - lap, by = 58, bs = 96;
  g.save();
  g.shadowColor = "rgba(255,255,255,0.55)";
  g.shadowBlur = bs * 0.07;
  await drawSvg(g, `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${levelBadgeSvg(level, "s")}</svg>`, bx, by, bs);
  g.restore();
  const fs = Math.round(bs * (level === 3 ? 0.26 : 0.38));
  font(g, `400 ${fs}px "Lilita One", sans-serif`);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = (bs / 60) * 4;
  g.lineJoin = "round";
  g.strokeStyle = "#d98000";
  g.strokeText(String(level), bx + bs / 2, by + bs / 2 + 2.2 * (bs / 100));
  g.fillStyle = "#FFFFFF";
  g.fillText(String(level), bx + bs / 2, by + bs / 2 + 2.2 * (bs / 100));
}

/** The old form small and grey behind, the new one big and centred in front, gold sparkles. */
export async function evolutionHero(g: CanvasRenderingContext2D, fromId: number, toId: number, shiny: boolean) {
  const pre = await sprite(fromId);
  if (pre) {
    g.save();
    g.globalAlpha = 0.55;
    g.filter = "grayscale(1) brightness(0.8)";
    drawSprite(g, pre, 44, Math.round(158 - pre.h * 1.6 - 44), 1.6);
    g.restore();
  }
  await standSprite(g, toId, shiny, 3.2);
  for (const [x, y, s] of [[66, 6, 22], [276, 10, 26], [292, 100, 18]]) await drawSvg(g, lineIconSvg("sparkle", "#FFC83D"), x, y, s);
}

/** A gym badge, the app's own art, 150 square. */
export async function badgeHero(g: CanvasRenderingContext2D, url: string) {
  try {
    const im = await loadImage(url);
    const k = Math.min(150 / im.naturalWidth, 150 / im.naturalHeight);
    g.drawImage(im, 105 + (150 - im.naturalWidth * k) / 2, 6 + (150 - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
  } catch {
    /* skip */
  }
}
