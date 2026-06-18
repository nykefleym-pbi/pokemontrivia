import { findPokemon } from "@/lib/pokemon-data";

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

export type ShareData = BattleShareData | EvolutionShareData;

const CARD_SIZE = 1080;
const SYSTEM_FONT =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export async function buildShareCard(data: ShareData): Promise<string> {
  const W = CARD_SIZE;
  const H = CARD_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Clip whole canvas as a rounded card
  ctx.save();
  roundRectPath(ctx, 0, 0, W, H, 56);
  ctx.clip();

  // ----- TOP: red gradient header -----
  const headerH = Math.round(H * 0.42); // ~454
  const grad = ctx.createLinearGradient(0, 0, W, headerH);
  grad.addColorStop(0, "#e23b2e");
  grad.addColorStop(1, "#b5341f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, headerH);

  // faint radial glow behind partner sprite (right side)
  const rg = ctx.createRadialGradient(
    W * 0.74,
    headerH * 0.6,
    20,
    W * 0.74,
    headerH * 0.6,
    320,
  );
  rg.addColorStop(0, "rgba(255,255,255,0.14)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, headerH);

  // Top labels
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 28px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "POKÉMON TRIVIA BATTLE", 60, 78, 2);

  ctx.textAlign = "right";
  ctx.fillStyle = "#f2d64e";
  ctx.font = `800 28px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "★ VICTORY", W - 60, 78, 2, "right");

  // Trainer avatar (circular)
  const avatarD = 150;
  const avatarCX = 60 + avatarD / 2;
  const avatarCY = 230;
  await drawCircleImage(ctx, data.trainerSpriteUrl, avatarCX, avatarCY, avatarD);

  // Trainer name + level/rank
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 60px ${SYSTEM_FONT}`;
  ctx.fillText(truncate(data.trainerName, 14), avatarCX + avatarD / 2 + 30, 220);

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `700 28px ${SYSTEM_FONT}`;
  drawTrackedText(
    ctx,
    `LV ${data.level ?? 1} · ${(data.rank ?? "Trainer").toUpperCase()}`,
    avatarCX + avatarD / 2 + 30,
    266,
    1.5,
  );

  // Partner sprite (large, lower-right of header)
  const spriteSize = 300;
  await drawPokemonSprite(
    ctx,
    data.partnerPokemonId,
    data.partnerShiny,
    W - spriteSize - 30,
    headerH - spriteSize + 30,
    spriteSize,
  );

  // ----- BOTTOM: white body -----
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, headerH, W, H - headerH);

  let y = headerH + 90;
  ctx.textAlign = "left";
  ctx.fillStyle = "#23252f";
  ctx.font = `800 52px ${SYSTEM_FONT}`;
  ctx.fillText(`defeated ${truncate(data.opponentName, 18)}`, 60, y);

  y += 46;
  ctx.fillStyle = "#6f7280";
  ctx.font = `500 28px ${SYSTEM_FONT}`;
  const ctxLabel =
    data.type === "weekly"
      ? `${data.badgeName ? data.badgeName.replace(" Badge", "") + " circuit" : "Gym circuit"}`
      : data.type === "elite"
        ? "Elite Four"
        : data.type === "daily-perfect"
          ? "Daily challenge"
          : "Trainer battle";
  ctx.fillText(`${ctxLabel} · ${formatDate(data.dateISO)}`, 60, y);

  // Stat chips
  y += 50;
  const chipGap = 20;
  const chipW = (W - 120 - chipGap * 3) / 4;
  const chipH = 140;
  const chips = [
    {
      val: `${data.correctCount ?? 0}/${data.totalQuestions ?? 0}`,
      label: "CORRECT",
      color: "#3f9d5a",
    },
    {
      val:
        data.avgTimeMs && data.avgTimeMs > 0
          ? `${(data.avgTimeMs / 1000).toFixed(1)}s`
          : "—s",
      label: "AVG TIME",
      color: "#23252f",
    },
    { val: `+${data.xpEarned ?? 0}`, label: "XP", color: "#e23b2e" },
    { val: `${data.topStreak}🔥`, label: "STREAK", color: "#23252f" },
  ];
  chips.forEach((chip, i) => {
    const cx = 60 + i * (chipW + chipGap);
    ctx.fillStyle = "#f1f2f5";
    roundRectPath(ctx, cx, y, chipW, chipH, 18);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = chip.color;
    ctx.font = `800 42px ${SYSTEM_FONT}`;
    ctx.fillText(chip.val, cx + chipW / 2, y + 68);

    ctx.fillStyle = "#7d7f8a";
    ctx.font = `700 20px ${SYSTEM_FONT}`;
    drawTrackedText(ctx, chip.label, cx + chipW / 2, y + 108, 1.5, "center");
  });

  // Footer
  y += chipH + 50;
  ctx.strokeStyle = "#e6e8ec";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, y);
  ctx.lineTo(W - 60, y);
  ctx.stroke();

  y += 50;
  ctx.textAlign = "left";
  ctx.fillStyle = "#6f7280";
  ctx.font = `700 24px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "◓ PLAY.POKETRIVIA.APP", 60, y, 1.5);

  ctx.textAlign = "right";
  ctx.fillStyle = "#e23b2e";
  ctx.font = `800 24px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "BEAT MY SCORE ›", W - 60, y, 1.5, "right");

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
  const url = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${variant}${id}.png`;
  try {
    const img = await loadImage(url);
    ctx.drawImage(img, x, y, size, size);
    return;
  } catch {
    /* fall through */
  }
  try {
    const fallback = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${variant}${id}.png`;
    const img = await loadImage(fallback);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, y, size, size);
    ctx.imageSmoothingEnabled = true;
  } catch {
    /* skip */
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

function formatDate(iso: string): string {
  try {
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
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
  const total =
    widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
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
