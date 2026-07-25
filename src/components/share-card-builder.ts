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

export type ShareData = BattleShareData | EvolutionShareData | TrainerCardShareData;

const CARD_SIZE = 1080;
const SYSTEM_FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export async function buildShareCard(data: ShareData): Promise<string> {
  if (data.type === "evolution") {
    return buildEvolutionCard(data);
  }
  if (data.type === "trainer-card") {
    return buildTrainerCard(data);
  }
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
  const rg = ctx.createRadialGradient(W * 0.74, headerH * 0.6, 20, W * 0.74, headerH * 0.6, 320);
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
  drawTrackedText(
    ctx,
    data.type === "daily-perfect" ? "★ PERFECT" : "★ VICTORY",
    W - 60,
    78,
    2,
    "right",
  );

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
  ctx.fillText(
    data.type === "daily-perfect"
      ? "Perfect Daily Quest!"
      : `defeated ${truncate(data.opponentName, 18)}`,
    60,
    y,
  );

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
      val: data.avgTimeMs && data.avgTimeMs > 0 ? `${(data.avgTimeMs / 1000).toFixed(1)}s` : "—s",
      label: "AVG TIME",
      color: "#23252f",
    },
    { val: `+${data.xpEarned ?? 0}`, label: "XP", color: "#e23b2e" },
    { val: `${data.topStreak}`, label: "STREAK", color: "#23252f" },
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
  drawTrackedText(ctx, "◓ POKEMONTRIVIABATTLE.VERCEL.APP", 60, y, 1.5);

  ctx.textAlign = "right";
  ctx.fillStyle = "#e23b2e";
  ctx.font = `800 24px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "BEAT MY SCORE ›", W - 60, y, 1.5, "right");

  ctx.restore();
  return canvas.toDataURL("image/png");
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

async function buildEvolutionCard(data: EvolutionShareData): Promise<string> {
  const W = CARD_SIZE;
  const H = CARD_SIZE;
  const headerH = 400;
  const DARK = "#23252f";
  const GREEN = "#3f9d5a";
  const PURPLE = "#6f5bd6";
  const GRAYLBL = "#7d7f8a";

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.save();
  roundRectPath(ctx, 0, 0, W, H, 56);
  ctx.clip();

  const hg = ctx.createLinearGradient(0, 0, W, headerH);
  hg.addColorStop(0, "#7e62d8");
  hg.addColorStop(1, "#4a3a9e");
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, headerH);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, headerH, W, H - headerH);

  const ag = ctx.createRadialGradient(124, 196, 10, 124, 196, 150);
  ag.addColorStop(0, "rgba(255,255,255,0.16)");
  ag.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = ag;
  ctx.fillRect(0, 40, 360, 360);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 27px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "POKÉMON TRIVIA BATTLE", 60, 76, 2);
  ctx.textAlign = "right";
  ctx.fillStyle = "#f2d64e";
  ctx.font = `800 27px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "✦ EVOLVED", W - 60, 76, 2, "right");

  const aD = 128;
  const aCX = 124;
  const aCY = 196;
  await drawCircleImage(ctx, data.trainerSpriteUrl, aCX, aCY, aD);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 54px ${SYSTEM_FONT}`;
  ctx.fillText(truncate(data.trainerName, 12), aCX + aD / 2 + 26, 188);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = `700 23px ${SYSTEM_FONT}`;
  drawTrackedText(
    ctx,
    `LV ${data.level} · ${data.rank.toUpperCase()}`,
    aCX + aD / 2 + 26,
    226,
    1.5,
  );

  const toSize = 290;
  const toX = 640;
  const toY = 150;
  const toCX = toX + toSize / 2;
  const toCY = toY + toSize / 2;
  const tg = ctx.createRadialGradient(toCX, toCY - 10, 30, toCX, toCY - 10, toSize * 0.6);
  tg.addColorStop(0, "rgba(245,214,78,0.45)");
  tg.addColorStop(1, "rgba(245,214,78,0)");
  ctx.fillStyle = tg;
  ctx.fillRect(toCX - toSize, toCY - toSize, toSize * 2, toSize * 2);

  ctx.globalAlpha = 0.82;
  await drawPokemonSprite(ctx, data.fromPokemonId, false, 300, 235, 150);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#f2d64e";
  ctx.font = `800 64px ${SYSTEM_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("→", 508, 332);

  await drawPokemonSprite(ctx, data.toPokemonId, data.toShiny, toX, toY, toSize);

  ctx.textAlign = "center";
  ctx.fillStyle = DARK;
  ctx.font = `800 50px ${SYSTEM_FONT}`;
  ctx.fillText(
    `${truncate(data.fromName, 12)} evolved into ${truncate(data.toName, 12)}!`,
    W / 2,
    540,
  );
  ctx.fillStyle = "#6f7280";
  ctx.font = `500 27px ${SYSTEM_FONT}`;
  ctx.fillText(formatDate(data.dateISO), W / 2, 584);

  ctx.textAlign = "left";
  ctx.fillStyle = GRAYLBL;
  ctx.font = `700 22px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "CAREER STATS", 60, 640, 1.5);
  const hchars = [..."CAREER STATS"];
  const headW =
    hchars.map((c) => ctx.measureText(c).width).reduce((a, b) => a + b, 0) +
    1.5 * (hchars.length - 1);
  ctx.strokeStyle = "#e6e8ec";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60 + headW + 24, 633);
  ctx.lineTo(W - 60, 633);
  ctx.stroke();

  const winRate = data.statBattles > 0 ? Math.round((data.statWins / data.statBattles) * 100) : 0;
  const accuracy =
    data.statAnswered > 0 ? Math.round((data.statCorrect / data.statAnswered) * 100) : 0;
  const avgTime =
    data.statAnswered > 0
      ? `${(data.statTotalAnswerTime / data.statAnswered / 1000).toFixed(1)}s`
      : "—s";
  const chips = [
    { v: `${data.statBattles}`, l: "BATTLES", c: DARK },
    { v: `${data.statWins}`, l: "WINS", c: GREEN },
    { v: `${data.statLosses}`, l: "LOSSES", c: DARK },
    { v: `${winRate}%`, l: "WIN RATE", c: GREEN },
    { v: `${data.statBestStreak}`, l: "BEST STREAK", c: DARK },
    { v: `${accuracy}%`, l: "ACCURACY", c: PURPLE },
    { v: avgTime, l: "AVG TIME", c: DARK },
    { v: `${data.statAnswered}`, l: "QUESTIONS", c: DARK },
    { v: `${data.statCorrect}`, l: "CORRECT", c: DARK },
  ];
  const gx0 = 60;
  const gap = 18;
  const cw = (W - 120 - gap * 2) / 3;
  const ch = 98;
  const rgap = 12;
  const gy0 = 664;
  chips.forEach((chip, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = gx0 + col * (cw + gap);
    const cy = gy0 + row * (ch + rgap);
    ctx.fillStyle = "#f1f2f5";
    roundRectPath(ctx, cx, cy, cw, ch, 18);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = chip.c;
    ctx.font = `800 40px ${SYSTEM_FONT}`;
    ctx.fillText(chip.v, cx + cw / 2, cy + 56);
    ctx.fillStyle = GRAYLBL;
    ctx.font = `700 18px ${SYSTEM_FONT}`;
    drawTrackedText(ctx, chip.l, cx + cw / 2, cy + 82, 1.2, "center");
  });

  const gridBottom = gy0 + 3 * ch + 2 * rgap;
  ctx.strokeStyle = "#cfd2da";
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 10]);
  ctx.beginPath();
  ctx.moveTo(60, gridBottom + 30);
  ctx.lineTo(W - 60, gridBottom + 30);
  ctx.stroke();
  ctx.setLineDash([]);

  const fy = gridBottom + 72;
  ctx.textAlign = "left";
  ctx.fillStyle = "#6f7280";
  ctx.font = `700 22px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "◓ POKEMONTRIVIABATTLE.VERCEL.APP", 60, fy, 1.5);
  ctx.textAlign = "right";
  ctx.fillStyle = PURPLE;
  ctx.font = `800 22px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "CATCH UP ›", W - 60, fy, 1.5, "right");

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
