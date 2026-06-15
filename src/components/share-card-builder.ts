import { findPokemon } from "@/lib/pokemon-data";

export interface ShareData {
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
}

const CARD_SIZE = 1080;
const SYSTEM_FONT =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO_FONT =
  "ui-monospace, SFMono-Regular, 'Cascadia Mono', Menlo, monospace";

export async function buildShareCard(data: ShareData): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext("2d")!;

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CARD_SIZE);
  if (data.type === "elite") {
    bgGrad.addColorStop(0, "#7c3aed");
    bgGrad.addColorStop(1, "#1e1b4b");
  } else if (data.type === "weekly") {
    bgGrad.addColorStop(0, "#fbbf24");
    bgGrad.addColorStop(1, "#b45309");
  } else if (data.type === "battle") {
    bgGrad.addColorStop(0, "#ef4444");
    bgGrad.addColorStop(1, "#7f1d1d");
  } else {
    bgGrad.addColorStop(0, "#3b82f6");
    bgGrad.addColorStop(1, "#1e3a8a");
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 72px ${SYSTEM_FONT}`;
  ctx.textAlign = "center";
  const title =
    data.type === "elite"
      ? "ELITE FOUR DEFEATED"
      : data.type === "weekly"
        ? "GYM LEADER DEFEATED"
        : data.type === "battle"
          ? "★ VICTORY ★"
          : "DAILY CHALLENGE PERFECT";
  ctx.fillText(title, CARD_SIZE / 2, 120);

  ctx.font = `40px ${SYSTEM_FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(data.badgeName ?? data.dateISO, CARD_SIZE / 2, 180);

  // Player side (left)
  await drawTrainer(ctx, data.trainerSpriteUrl, data.trainerName, 80, 280, "left");
  if (!isNaN(data.partnerPokemonId)) {
    await drawPokemon(
      ctx,
      data.partnerPokemonId,
      data.partnerName,
      data.partnerShiny,
      80,
      480,
      "left",
    );
  }

  // VS
  ctx.fillStyle = "#fbbf24";
  ctx.font = `bold 96px ${MONO_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("VS", CARD_SIZE / 2, 600);

  // Opponent side (right)
  if (data.opponentSpriteUrl) {
    await drawTrainer(ctx, data.opponentSpriteUrl, data.opponentName, CARD_SIZE - 80, 280, "right");
  }
  if (data.signaturePokemonId !== null) {
    const sigName = findPokemon(data.signaturePokemonId)?.name ?? "Pokémon";
    await drawPokemon(ctx, data.signaturePokemonId, sigName, false, CARD_SIZE - 80, 480, "right");
  } else if (data.type === "daily-perfect") {
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = `200px ${SYSTEM_FONT}`;
    ctx.fillText("🎯", CARD_SIZE * 0.75, 470);
  }

  // Stats footer
  const statsY = 820;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, statsY, CARD_SIZE, 180);

  const stats = [
    { label: "Final HP", value: `${data.finalPlayerHp}/${data.maxPlayerHp}` },
    { label: "Top Streak", value: `${data.topStreak}×` },
    { label: "Top Damage", value: `${data.topDamage}` },
  ];
  stats.forEach((stat, i) => {
    const cx = (CARD_SIZE / 3) * i + CARD_SIZE / 6;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `28px ${SYSTEM_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(stat.label, cx, statsY + 60);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 64px ${MONO_FONT}`;
    ctx.fillText(stat.value, cx, statsY + 130);
  });

  // Watermark
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = `28px ${SYSTEM_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("Pokémon Trivia Battle", CARD_SIZE / 2, CARD_SIZE - 30);

  return canvas.toDataURL("image/png");
}

async function drawTrainer(
  ctx: CanvasRenderingContext2D,
  url: string,
  name: string,
  x: number,
  y: number,
  align: "left" | "right",
) {
  try {
    const img = await loadImage(url);
    const size = 140;
    const drawX = align === "left" ? x : x - size;
    ctx.drawImage(img, drawX, y, size, size);
  } catch {
    /* skip */
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 32px system-ui, sans-serif`;
  ctx.textAlign = align === "left" ? "left" : "right";
  ctx.fillText(name, x, y + 140 + 30);
}

async function drawPokemon(
  ctx: CanvasRenderingContext2D,
  id: number,
  name: string,
  shiny: boolean,
  x: number,
  y: number,
  align: "left" | "right",
) {
  const variant = shiny ? "shiny/" : "";
  const url = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${variant}${id}.png`;
  try {
    const img = await loadImage(url);
    const size = 160;
    const drawX = align === "left" ? x : x - size;
    ctx.drawImage(img, drawX, y, size, size);
  } catch {
    /* skip */
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 28px system-ui, sans-serif`;
  ctx.textAlign = align === "left" ? "left" : "right";
  ctx.fillText(name, x, y + 160 + 25);
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
