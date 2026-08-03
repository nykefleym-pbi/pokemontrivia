import QRCode from "qrcode";
import { findPokemon } from "@/lib/pokemon-data";
import { REWARD_ICON, RESULT_ICON, STAT_ICON, STREAK_ICON } from "@/lib/app-icons";
import { PLATFORM_SURFACE, SPRITE_FOOT_PAD } from "@/lib/result-art";

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

/**
 * Where the card's QR points, and what the link pill under it reads.
 *
 * One constant for both so the picture and the text can never disagree — a card
 * whose printed URL is not what the QR encodes is worse than no QR at all,
 * because the reader trusts the one they cannot verify.
 */
const SHARE_URL = "https://pokemontriviabattle.vercel.app";
const SHARE_URL_LABEL = "POKEMONTRIVIABATTLE.VERCEL.APP";

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

  ctx.save();
  roundRectPath(ctx, 0, 0, W, H, 56);
  ctx.clip();

  // ----- The red card, edge to edge -----
  // Red fills the WHOLE card, not just a header band, and the cream panel is
  // inset within it. That inset is the design: the red showing down both sides
  // and along the bottom is the card's border, so there is one frame rather
  // than a red block sitting on top of a separate cream block.
  const bodyInset = 30;
  const bodyX = bodyInset;
  const bodyW = W - bodyInset * 2;
  const tileGap = 18;

  const headerH = 470;
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#e8402f");
  grad.addColorStop(1, "#c0301f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Faint Pokéball watermarks, as in the reference. Outlines rather than solid
  // discs: at 8% on red a filled ball is a pale blotch, a ring reads as texture.
  drawPokeballOutline(ctx, 140, 300, 160, "rgba(255,255,255,0.09)");
  drawPokeballOutline(ctx, 430, 140, 78, "rgba(255,255,255,0.06)");

  // Partner geometry. The platform has to clear TWO things: the cream body,
  // whose rounded top edge starts at `headerH - 40`, and the outcome banner
  // that straddles that seam — so it sits well above both rather than at the
  // header's own bottom edge, where it was being sliced in half.
  const spriteCX = W * 0.71;
  const spriteSize = 285;
  const platformY = headerH - 140;

  // The burst behind the partner — drawn BEFORE the sprite so the rays sit
  // behind the creature rather than across it, and centred on the creature's
  // mass rather than the header's, or it reads as a second light source.
  drawSunburst(ctx, spriteCX, platformY - spriteSize * 0.42, 300);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  drawPokeballGlyph(ctx, 74, 68, 15);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 30px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, "POKÉMON TRIVIA BATTLE", 100, 79, 1.5);

  // The outcome ribbon, top-right. Same pennant the Shop pins on a discounted
  // item (`RibbonTag`, routes/shop.tsx): a horizontal strip that runs off the
  // right edge with its left end notched to a point. The app has exactly one
  // ribbon shape and this is it — a second one invented for the share card
  // would read as a different product.
  drawRibbon(ctx, data.type === "daily-perfect" ? "PERFECT" : "VICTORY", W, 54);

  // Trainer avatar, ringed in white as the reference has it.
  const avatarD = 156;
  const avatarCX = 76 + avatarD / 2;
  const avatarCY = 250;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCX, avatarCY, avatarD / 2 + 7, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  await drawCircleImage(ctx, data.trainerSpriteUrl, avatarCX, avatarCY, avatarD);

  // Name, then the rank title under it. No level badge — owner ruling.
  //
  // The name is fitted to the gap between the avatar and the partner rather
  // than truncated at a character count: names are proportional, so a fixed
  // cutoff either clips "MMMMMMMMMMMMM" into the sprite or ellipsises "iiiii"
  // that had room to spare.
  const textX = avatarCX + avatarD / 2 + 34;
  const nameMaxW = spriteCX - spriteSize / 2 - 16 - textX;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  let nameSize = 62;
  ctx.font = `800 ${nameSize}px ${SYSTEM_FONT}`;
  while (nameSize > 38 && ctx.measureText(data.trainerName).width > nameMaxW) {
    nameSize -= 2;
    ctx.font = `800 ${nameSize}px ${SYSTEM_FONT}`;
  }
  let name = data.trainerName;
  while (name.length > 1 && ctx.measureText(name).width > nameMaxW) {
    name = truncate(name, name.length - 1);
  }
  ctx.fillText(name, textX, avatarCY - 6);

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `800 30px ${SYSTEM_FONT}`;
  drawTrackedText(ctx, (data.rank ?? "Trainer").toUpperCase(), textX, avatarCY + 44, 1.5);

  // Partner on the result screen's own platform art. `platformY` is where the
  // FEET go, so both the platform square and the sprite square are positioned
  // from it through their measured padding rather than by eye — see
  // PLATFORM_SURFACE and SPRITE_FOOT_PAD.
  const platformW = 330;
  await drawArt(
    ctx,
    RESULT_ICON.platformWin,
    spriteCX - platformW / 2,
    platformY - platformW * PLATFORM_SURFACE.win,
    platformW,
  );
  await drawPokemonSprite(
    ctx,
    data.partnerPokemonId,
    data.partnerShiny,
    spriteCX - spriteSize / 2,
    platformY - spriteSize * (1 - SPRITE_FOOT_PAD),
    spriteSize,
  );

  // Celebration around the partner, drawn LAST of the header so it lands on
  // top of the creature rather than behind it.
  drawCelebration(ctx, spriteCX, platformY - spriteSize * 0.42, spriteSize);

  // ----- The cream panel, inset inside the red -----
  const bodyY = headerH - 40;
  ctx.fillStyle = "#fbf7ec";
  roundRectPath(ctx, bodyX, bodyY, bodyW, H - bodyY - bodyInset, 44);
  ctx.fill();

  // The outcome banner straddles the seam, as in the reference.
  {
    const label =
      data.type === "daily-perfect"
        ? "PERFECT DAILY!"
        : `DEFEATED ${truncate(data.opponentName, 16).toUpperCase()}!`;
    ctx.font = `800 38px ${SYSTEM_FONT}`;
    const pillW = Math.min(W - 160, ctx.measureText(label).width + 200);
    const pillH = 76;
    const pillX = (W - pillW) / 2;
    const pillY = headerH - 74;
    ctx.fillStyle = "#1c2333";
    roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    drawTrackedText(ctx, label, W / 2, pillY + 51, 1, "center");
    drawSparkle(ctx, pillX + 46, pillY + pillH / 2, 15, "#f2d64e");
    drawSparkle(ctx, pillX + pillW - 46, pillY + pillH / 2, 15, "#f2d64e");
  }

  // ----- Stat tiles -----
  // All four glyphs are the app's own art. Three of them the player already
  // knows from elsewhere — the Arena reward strip and Home's streak pill — so
  // drawing lookalikes for the other two would have made the same four stats
  // read as two different sets.
  let y = headerH + 52;
  const tileW = (bodyW - tileGap * 3) / 4;
  const tileH = 196;
  const tiles: { val: string; label: string; color: string; art: string }[] = [
    {
      val: `${data.correctCount ?? 0}/${data.totalQuestions ?? 0}`,
      label: "CORRECT",
      color: "#3f9d5a",
      art: STAT_ICON.correct,
    },
    {
      val: data.avgTimeMs && data.avgTimeMs > 0 ? `${(data.avgTimeMs / 1000).toFixed(1)}s` : "—",
      label: "AVG TIME",
      color: "#2f6fd0",
      art: STAT_ICON.avgTime,
    },
    { val: `+${data.xpEarned ?? 0}`, label: "XP EARNED", color: "#e23b2e", art: REWARD_ICON.xp },
    { val: `${data.topStreak}`, label: "STREAK", color: "#e8811f", art: STREAK_ICON },
  ];
  for (const [i, t] of tiles.entries()) {
    const x = bodyX + i * (tileW + tileGap);
    ctx.fillStyle = "#f1f0ea";
    roundRectPath(ctx, x, y, tileW, tileH, 22);
    ctx.fill();

    const iconSize = 52;
    await drawArt(ctx, t.art, x + tileW / 2 - iconSize / 2, y + 15, iconSize);

    ctx.textAlign = "center";
    ctx.fillStyle = t.color;
    ctx.font = `800 46px ${SYSTEM_FONT}`;
    ctx.fillText(t.val, x + tileW / 2, y + 134);

    ctx.fillStyle = "#7d7f8a";
    ctx.font = `700 21px ${SYSTEM_FONT}`;
    drawTrackedText(ctx, t.label, x + tileW / 2, y + 170, 1.2, "center");
  }

  // ----- Invite panel: QR, then the two lines of copy -----
  // This is where the reference puts its "achievement unlocked" strip; the
  // owner replaced that block with the QR, so this panel is the only thing
  // between the stats and the bottom edge — sized to land its own bottom edge
  // one `pad` above the card's, rather than leaving the dead cream band the
  // reference fills with a daily-challenge footer we do not have.
  y += tileH + 30;
  // The panel's own bottom edge lands one tile-gap above the cream panel's, so
  // the cream shows as an even margin on all four sides of the stack.
  const panelH = H - bodyInset - tileGap - y;
  const panelX = bodyX + tileGap;
  const panelW = bodyW - tileGap * 2;
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, panelX, y, panelW, panelH, 26);
  ctx.fill();
  ctx.strokeStyle = "#e7e3d6";
  ctx.lineWidth = 2;
  roundRectPath(ctx, panelX, y, panelW, panelH, 26);
  ctx.stroke();

  const qrSize = Math.min(190, panelH - 44);
  const qrX = panelX + 30;
  const qrY = y + (panelH - qrSize) / 2;
  await drawQrCode(ctx, SHARE_URL, qrX, qrY, qrSize);

  const copyX = qrX + qrSize + 36;
  ctx.textAlign = "left";
  ctx.fillStyle = "#1c2333";
  ctx.font = `800 44px ${SYSTEM_FONT}`;
  ctx.fillText("Catch 'em all with me", copyX, y + panelH / 2 - 14);

  // The link as a dark pill, the way the reference draws it. The width has to
  // include the tracking `drawTrackedText` adds, or the last characters render
  // past the pill's right edge — which is exactly what "…VERCEL.APP" did.
  const linkH = 62;
  const linkY = y + panelH / 2 + 12;
  ctx.font = `800 24px ${SYSTEM_FONT}`;
  const linkTracking = 1;
  const linkW =
    ctx.measureText(SHARE_URL_LABEL).width + linkTracking * (SHARE_URL_LABEL.length - 1) + 60;
  ctx.fillStyle = "#1c2333";
  roundRectPath(ctx, copyX, linkY, linkW, linkH, linkH / 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  drawTrackedText(ctx, SHARE_URL_LABEL, copyX + 26, linkY + 39, 1);

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

/**
 * A Pokéball drawn as concentric strokes — the header watermark.
 *
 * Stroked, not filled: at the 6–9% alpha the reference uses, a solid disc on
 * red reads as a pale smudge, while the ring keeps its silhouette.
 */
function drawPokeballOutline(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, r * 0.055);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Radiating wedges behind the partner sprite. */
function drawSunburst(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  const rays = 16;
  const half = Math.PI / rays / 2.2;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - half) * r, cy + Math.sin(a - half) * r);
    ctx.lineTo(cx + Math.cos(a + half) * r, cy + Math.sin(a + half) * r);
    ctx.closePath();
    ctx.fill();
  }
  // Soft core so the rays emerge from light rather than from a point.
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.75);
  g.addColorStop(0, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The little solid Pokéball beside the wordmark. */
function drawPokeballGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = "#ff5a4a";
  ctx.fill();
  ctx.strokeStyle = "#1c2333";
  ctx.lineWidth = Math.max(1.5, r * 0.13);
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * The app's one ribbon shape, drawn on canvas.
 *
 * This is the geometry of `RibbonTag` in routes/shop.tsx — the tag pinned to a
 * discounted item — transcribed from its `clip-path`: a horizontal strip that
 * runs off the RIGHT edge with its left end notched to a point at mid-height.
 * The share card gets the same silhouette rather than a corner banner of its
 * own, so the two read as the same product. Keep them in step if either moves.
 *
 * The fill is gold rather than the shop's purple or brand red: this ribbon sits
 * on the red header, where both of those sink into the background. The shape is
 * what carries the recognition; the colour has to earn its contrast locally.
 */
function drawRibbon(ctx: CanvasRenderingContext2D, label: string, W: number, top: number) {
  const h = 68;
  const notch = 22;
  ctx.save();
  ctx.font = `800 34px ${SYSTEM_FONT}`;
  const tracking = 3;
  const textW = ctx.measureText(label).width + tracking * (label.length - 1);
  const left = W - (textW + 76);

  const g = ctx.createLinearGradient(left, top, W, top + h);
  g.addColorStop(0, "#f7dd6a");
  g.addColorStop(1, "#e8a93c");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(left + notch, top);
  ctx.lineTo(W, top);
  ctx.lineTo(W, top + h);
  ctx.lineTo(left + notch, top + h);
  ctx.lineTo(left, top + h / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#7a4c0c";
  ctx.textAlign = "left";
  drawTrackedText(ctx, label, left + notch + 26, top + h / 2 + 12, tracking);
  ctx.restore();
}

/**
 * Draws one of the app's own .webp assets into a square box.
 *
 * Filenames under public/ contain spaces, so the path is encoded here — the
 * same reason components go through `<AppIcon>` rather than a raw `src`. A
 * failed load is skipped silently: a share card missing its platform is still
 * a share card, and there is no second chance to render one.
 */
async function drawArt(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number,
  y: number,
  size: number,
) {
  try {
    const img = await loadImage(encodeURI(src));
    ctx.drawImage(img, x, y, size, size);
  } catch {
    /* skip */
  }
}

/** Four-point sparkle — the glints either side of the outcome banner. */
function drawSparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
) {
  const waist = size * 0.22;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.quadraticCurveTo(cx + waist, cy - waist, cx + size, cy);
  ctx.quadraticCurveTo(cx + waist, cy + waist, cx, cy + size);
  ctx.quadraticCurveTo(cx - waist, cy + waist, cx - size, cy);
  ctx.quadraticCurveTo(cx - waist, cy - waist, cx, cy - size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Sparkles and confetti ringing the partner.
 *
 * Positions are a fixed table, not `Math.random()`: a share card is generated
 * fresh every time it is opened, so a random scatter would make the same
 * battle produce a visibly different picture on each open — and there is no
 * seed on this path to make it reproducible. Hand-placed also lets the ring
 * stay clear of the creature's face and of the outcome banner below.
 *
 * Each entry is in units of `size`, measured from the centre.
 */
const CELEBRATION: {
  dx: number;
  dy: number;
  /** Sparkle radius, or confetti length, as a fraction of `size`. */
  s: number;
  color: string;
  /** Confetti carry a rotation; sparkles do not. */
  rot?: number;
}[] = [
  { dx: -0.52, dy: -0.34, s: 0.062, color: "#f7dd6a" },
  // Kept below the outcome ribbon's underside: at dy -0.42 this sparkle landed
  // on the "I" of VICTORY.
  { dx: 0.5, dy: -0.05, s: 0.05, color: "#ffffff" },
  { dx: 0.58, dy: 0.06, s: 0.042, color: "#f7dd6a" },
  { dx: -0.58, dy: 0.12, s: 0.036, color: "#ffffff" },
  { dx: 0.16, dy: -0.56, s: 0.045, color: "#f7dd6a" },
  { dx: -0.28, dy: -0.56, s: 0.03, color: "#ffffff" },
  { dx: -0.66, dy: -0.06, s: 0.052, color: "#7fd4f5", rot: -0.5 },
  { dx: 0.68, dy: -0.24, s: 0.052, color: "#ffffff", rot: 0.8 },
  { dx: 0.42, dy: 0.32, s: 0.048, color: "#f7dd6a", rot: 0.3 },
  { dx: -0.44, dy: 0.34, s: 0.048, color: "#7ee0a0", rot: -1.1 },
  { dx: 0.02, dy: -0.66, s: 0.044, color: "#7fd4f5", rot: 0.6 },
  { dx: -0.16, dy: 0.44, s: 0.042, color: "#ffffff", rot: 1.2 },
  { dx: 0.3, dy: -0.66, s: 0.04, color: "#7ee0a0", rot: -0.4 },
  // Left of the wordmark's tail rather than just past it, where it read as a
  // stray mark after "BATTLE" instead of as confetti.
  { dx: -0.72, dy: -0.18, s: 0.04, color: "#ffffff", rot: 0.9 },
];

function drawCelebration(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
) {
  for (const p of CELEBRATION) {
    const x = cx + p.dx * size;
    const y = cy + p.dy * size;
    if (p.rot === undefined) {
      drawSparkle(ctx, x, y, p.s * size, p.color);
      continue;
    }
    // Confetti: a small rounded rectangle on its own axis.
    const len = p.s * size;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    roundRectPath(ctx, -len / 2, -len / 4, len, len / 2, len / 6);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * The invite QR. Rendered by the same `qrcode` package the Battle Code block
 * uses, at 3× the on-card size so the modules stay crisp when the 1080px card
 * is scaled down by whatever app it lands in.
 *
 * A failure here leaves a light placeholder rather than throwing: the card is
 * still worth sharing without its QR, and `buildShareCard` has no other
 * recovery path — it returns the finished PNG or nothing.
 */
async function drawQrCode(
  ctx: CanvasRenderingContext2D,
  url: string,
  x: number,
  y: number,
  size: number,
) {
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: size * 3,
      margin: 1,
      color: { dark: "#1c2333ff", light: "#ffffffff" },
    });
    const img = await loadImage(dataUrl);
    ctx.drawImage(img, x, y, size, size);
  } catch {
    ctx.save();
    ctx.fillStyle = "#f1f0ea";
    roundRectPath(ctx, x, y, size, size, 12);
    ctx.fill();
    ctx.restore();
  }
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
