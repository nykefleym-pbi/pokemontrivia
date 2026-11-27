import { findPokemon } from "@/lib/pokemon-data";
import { GYM_LEADERS } from "@/lib/gym-leaders";
import { gymTown } from "@/lib/route";
import { useGameStore } from "@/lib/store";
import { badgeHero, dailyHero, evolutionHero, levelHero, renderStory, standSprite, type StorySpec } from "@/components/story-card";

export interface BattleShareData {
  type: "elite" | "weekly" | "daily-perfect" | "battle";
  trainerName: string;
  trainerSpriteUrl: string;
  partnerName: string;
  partnerPokemonId: number;
  partnerShiny: boolean;
  opponentName: string;
  opponentTitle: string;
  opponentSpriteUrl: string | null;
  signaturePokemonId: number | null;
  finalPlayerHp: number;
  maxPlayerHp: number;
  topStreak: number;
  topDamage: number;
  dateISO: string;
  badgeName?: string;
  correctCount?: number;
  totalQuestions?: number;
  xpEarned?: number;
  avgTimeMs?: number;
  level?: number;
  rank?: string;
  /** Days in a row with a Daily Quest win, for the perfect-Daily story. */
  dayStreak?: number;
}

export interface LevelUpShareData {
  type: "level-up";
  trainerName: string;
  trainerSpriteUrl: string;
  level: number;
  coins: number;
  item?: { name: string; iconUrl: string; qty: number };
  dateISO: string;
}

export interface EvolutionShareData {
  type: "evolution";
  trainerName: string;
  trainerSpriteUrl: string;
  fromPokemonId: number;
  fromName: string;
  toPokemonId: number;
  toName: string;
  toShiny: boolean;
  level: number;
  rank: string;
  statBattles: number;
  statWins: number;
  statLosses: number;
  statBestStreak: number;
  statCorrect: number;
  statAnswered: number;
  statTotalAnswerTime: number;
  dateISO: string;
}

export interface TrainerCardShareData {
  type: "trainer-card";
  trainerName: string;
  trainerSpriteUrl: string;
  level: number;
  rank: string;
  friendCode: string;
  pokedexCount: number;
  wins: number;
  bestStreak: number;
  acePokemonId: number;
  aceShiny: boolean;
  dateISO: string;
}

export type ShareData = BattleShareData | EvolutionShareData | TrainerCardShareData | LevelUpShareData;

const CARD_SIZE = 1080;
const SYSTEM_FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";


export async function buildShareCard(data: ShareData): Promise<string> {
  if (data.type === "trainer-card") return buildTrainerCard(data);
  return renderStory(storySpec(data));
}

const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Which Figma row-9 story a share is, and what it says. */
export function storySpec(data: Exclude<ShareData, TrainerCardShareData>): StorySpec {
  const who = { trainerName: data.trainerName || "Trainer", trainerArt: data.trainerSpriteUrl };
  if (data.type === "evolution") {
    let stages = findPokemon(data.toPokemonId)?.evolutionStage ?? 2;
    const here = stages;
    for (let p = findPokemon(data.toPokemonId); p?.evolvesToIds[0]; p = findPokemon(p.evolvesToIds[0])) stages++;
    return {
      ...who,
      level: data.level,
      bg: ["#FF8AD0", "#DB3E98"],
      confetti: ["#FFFFFF", "#FFD23F", "#7CF0B0"],
      headline: "EVOLVED!",
      line: `${data.fromName} evolved into ${data.toName}`,
      // shortcut: battles with this partner are not counted, so this is every battle; count per partner when the log records it
      stats: [
        { value: `${here}/${stages}`, label: "STAGE", kind: "stage" },
        { value: String(data.statBattles), label: "BATTLES TOGETHER", kind: "heart" },
      ],
      hero: (g) => evolutionHero(g, data.fromPokemonId, data.toPokemonId, data.toShiny),
    };
  }
  if (data.type === "level-up") {
    const stats: StorySpec["stats"] = [{ value: String(data.level), label: "LEVEL", kind: "level" }];
    if (data.coins > 0) stats.push({ value: `+${data.coins}`, label: "COINS", kind: "coin" });
    if (data.item) stats.push({ value: `+${data.item.qty}`, label: data.item.name.toUpperCase(), kind: "item", iconUrl: data.item.iconUrl });
    return {
      ...who,
      level: data.level,
      bg: ["#FF5A6A", "#D11F48"],
      confetti: ["#FFFFFF", "#FFD23F", "#FFB3C0"],
      headline: "LEVEL UP!",
      line: `Reached level ${data.level}`,
      stats,
      hero: (g) => levelHero(g, data.trainerSpriteUrl, data.level),
    };
  }
  const right = { value: `${data.correctCount ?? 0}/${data.totalQuestions ?? 0}`, label: "RIGHT", kind: "right" as const };
  const time = { value: fmtTime((data.avgTimeMs ?? 0) * (data.totalQuestions ?? 0)), label: "TIME", kind: "time" as const };
  const xp = { value: `+${data.xpEarned ?? 0}`, label: "XP", kind: "xp" as const };
  const level = data.level ?? 1;
  if (data.type === "daily-perfect") {
    return {
      ...who,
      level,
      bg: ["#6CDB3A", "#2E9E1A"],
      confetti: ["#FFFFFF", "#FFD23F", "#FF3B4E"],
      headline: `${data.totalQuestions} OUT OF ${data.totalQuestions}!`,
      line: "Aced today's Daily Quest",
      stats: [right, time, { value: String(data.dayStreak ?? 1), label: "DAY STREAK", kind: "streak" }],
      cta: `Same ${data.totalQuestions} questions. Your turn?`,
      hero: (g) => dailyHero(g, data.signaturePokemonId ?? 479),
    };
  }
  const gym = data.type === "weekly" ? GYM_LEADERS.find((g) => g.badge === data.badgeName) : undefined;
  if (gym) {
    const owned = new Set(useGameStore.getState().gymBadges);
    const region = GYM_LEADERS.filter((g) => g.region === gym.region);
    return {
      ...who,
      level,
      bg: ["#4DA3FF", "#2459E0"],
      confetti: ["#FFFFFF", "#FFD23F", "#9FD0FF"],
      headline: "BADGE WON!",
      line: `Beat the ${gymTown(gym)}`,
      stats: [{ value: `${region.filter((g) => owned.has(g.id)).length}/${region.length}`, label: `${gym.region.toUpperCase()} BADGES`, kind: "badge" }, right, xp],
      hero: (g) => badgeHero(g, gym.badgeIconUrl),
    };
  }
  return {
    ...who,
    level,
    bg: ["#FFD23F", "#FF9F1C"],
    inkDark: true,
    confetti: ["#FFFFFF", "#FF3B4E", "#2B6BFF"],
    headline: "VICTORY!",
    line: `Beat ${data.opponentTitle === "Elite Four" ? "Elite Four " : ""}${data.opponentName}`,
    stats: [right, time, xp],
    hero: (g) => standSprite(g, data.partnerPokemonId, data.partnerShiny, 4),
  };
}

async function buildTrainerCard(data: TrainerCardShareData): Promise<string> {
  const W = CARD_SIZE;
  const H = CARD_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.save();
  roundRectPath(ctx, 0, 0, W, H, 56);
  ctx.clip();

  ctx.fillStyle = "#fbf3df";
  ctx.fillRect(0, 0, W, H);

  const headerH = Math.round(H * 0.46);
  const grad = ctx.createLinearGradient(0, 0, W, headerH);
  grad.addColorStop(0, "#e23b2e");
  grad.addColorStop(1, "#b5341f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, headerH);

  const rg = ctx.createRadialGradient(W * 0.74, headerH * 0.6, 20, W * 0.74, headerH * 0.6, 320);
  rg.addColorStop(0, "rgba(255,255,255,0.14)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, headerH);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 28px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "POKÉMON TRIVIA BATTLE", 60, 78, 2);
  ctx.fillStyle = "#f2d64e";
  ctx.font = `800 28px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "TRAINER CARD", W - 60, 78, 2, "right");

  if (!isNaN(data.acePokemonId) && data.acePokemonId > 0) {
    await drawPokemonSprite(ctx, data.acePokemonId, data.aceShiny, W - 350, headerH - 320, 300);
  }

  const avatarD = 150;
  const avatarCX = 60 + avatarD / 2;
  const avatarCY = 230;
  await drawCircleImage(ctx, data.trainerSpriteUrl, avatarCX, avatarCY, avatarD);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 60px ${SYSTEM_FONT}`;
  ctx.fillText(truncate(data.trainerName, 14), avatarCX + avatarD / 2 + 30, 220);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `700 28px ${SYSTEM_FONT}`;
  drawTrackedText(
    ctx,
    `LV ${data.level} · ${data.rank.toUpperCase()}`,
    avatarCX + avatarD / 2 + 30,
    266,
    1.5,
  );

  // Invite line below the avatar, before the stat tiles (link highlighted).
  {
    const inviteY = avatarCY + avatarD / 2 + 66;
    ctx.textAlign = "left";
    ctx.font = `700 30px ${SYSTEM_FONT}`;
    const lead = "Let's play at ";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(lead, 60, inviteY);
    const leadW = ctx.measureText(lead).width;
    ctx.fillStyle = "#f2d64e";
    ctx.font = `800 30px ${SYSTEM_FONT}`;
    ctx.fillText("pokemontriviabattle.vercel.app", 60 + leadW, inviteY);
  }

  const margin = 60;
  const gap = 30;
  const tileW = (W - margin * 2 - gap * 2) / 3;
  const tileY = headerH + 50;
  const tileH = 180;
  const tiles = [
    { label: "POKÉDEX", value: String(data.pokedexCount) },
    { label: "WINS", value: String(data.wins) },
    { label: "BEST STREAK", value: String(data.bestStreak) },
  ];
  tiles.forEach((t, i) => {
    const x = margin + i * (tileW + gap);
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, x, tileY, tileW, tileH, 28);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#1f2937";
    ctx.font = `800 64px ${SYSTEM_FONT}`;
    ctx.fillText(t.value, x + tileW / 2, tileY + 100);
    ctx.fillStyle = "#9ca3af";
    ctx.font = `700 22px ${SYSTEM_FONT}`;
    drawTrackedText(ctx, t.label, x + tileW / 2, tileY + 142, 1.5, "center");
  });

  const fcY = tileY + tileH + 44;
  const fcW = W - margin * 2;
  const fcH = 200;
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, margin, fcY, fcW, fcH, 28);
  ctx.fill();
  ctx.strokeStyle = "#e23b2e";
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 12]);
  roundRectPath(ctx, margin, fcY, fcW, fcH, 28);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = "center";
  ctx.fillStyle = "#9ca3af";
  ctx.font = `700 24px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "FRIEND CODE", W / 2, fcY + 66, 2, "center");
  ctx.fillStyle = "#e23b2e";
  ctx.font = `800 88px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, data.friendCode || "------", W / 2, fcY + 150, 10, "center");

  ctx.restore();
  return canvas.toDataURL("image/png");
}

// ---------- helpers ----------

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

async function drawCircleImage(
  ctx: CanvasRenderingContext2D,
  url: string,
  cx: number,
  cy: number,
  d: number,
) {
  const r = d / 2;
  // white ring
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fill();
  // background fill in case image fails
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  try {
    const img = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, d, d);
    ctx.restore();
  } catch {
    /* skip */
  }
  ctx.restore();
}

async function drawPokemonSprite(
  ctx: CanvasRenderingContext2D,
  id: number,
  shiny: boolean,
  x: number,
  y: number,
  size: number,
) {
  if (isNaN(id)) return;
  const variant = shiny ? "shiny/" : "";
  const artworkUrls = [
    `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/${variant}${id}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${variant}${id}.png`,
  ];
  for (const url of artworkUrls) {
    try {
      const img = await loadImage(url);
      ctx.drawImage(img, x, y, size, size);
      return;
    } catch {
      /* try next source */
    }
  }
  const spriteUrls = [
    `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${variant}${id}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${variant}${id}.png`,
  ];
  for (const fallback of spriteUrls) {
    try {
      const img = await loadImage(fallback);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, size, size);
      ctx.imageSmoothingEnabled = true;
      return;
    } catch {
      /* try next source */
    }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Manual letter-spacing (canvas has no native letter-spacing on older browsers)
function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: "left" | "right" | "center" = "left",
) {
  if (!text) return;
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let startX = x;
  if (align === "right") startX = x - total;
  else if (align === "center") startX = x - total / 2;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let cursor = startX;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cursor, y);
    cursor += widths[i] + tracking;
  }
  ctx.textAlign = prevAlign;
}

// Keep findPokemon import used (helps with consistent name lookups in future)
void findPokemon;
