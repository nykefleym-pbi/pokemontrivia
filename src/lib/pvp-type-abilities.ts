import type { AbilityId } from "./abilities";
import { getAbility } from "./abilities";
import type { PokeType } from "./pokemon-data";

/**
 * Nearby Battle (live PvP) wiring for the non-legendary TYPE abilities
 * (`abilities.ts`). Legendary/Mythical partners use their Signature ability
 * (`signature-abilities.ts`) instead — the two are mutually exclusive in PvP, so
 * this module is only consulted when the partner has no signature.
 *
 * Trust model mirrors the signature system:
 *  - Pure damage / self-damage number tweaks are computed CLIENT-side and folded
 *    into the per-answer `dmg`/`selfDmg` that `submit_pvp_live_answer` already
 *    clamps to [0,60] — so a tampered client can never exceed the same ceiling a
 *    legit correct answer can.
 *  - Anything that mutates the authoritative row (HP heals, stat stages, statuses,
 *    cures) goes through the server catalog `pvp_type_ability_effects` via
 *    `apply_pvp_type_ability_effect`: this module only names WHICH ability + phase
 *    and decides the client-side TIMING; the server owns every magnitude.
 *
 * Several Solo abilities have no faithful analog in the HP-endurance PvP model
 * (no type-matchup damage, no super-effective hits, no economy, shared wall-clock
 * timer). Those are mapped to the closest conservative combat effect, or marked
 * `inert` (announced "in play" but with no mechanical effect). Every
 * reinterpretation is called out inline so the mapping stays reviewable.
 */

export interface TypeAbilityCtx {
  correct: boolean;
  /** Self HP as a 0..1 fraction of the 120 pool, BEFORE this answer resolves. */
  selfHpPct: number;
  /** Opponent HP as a 0..1 fraction, BEFORE this answer resolves. */
  oppHpPct: number;
  /** Streak AFTER this answer (0 on a wrong answer). */
  streakAfter: number;
  answerElapsedMs: number;
  personalTimerMs: number;
  /** 0-based question index being answered. */
  questionIndex: number;
  /** Was the immediately-previous answer correct? */
  prevCorrect: boolean;
  /** Has the player answered anything wrong yet this battle (before this one)? */
  hadWrong: boolean;
  /** Running count of correct answers INCLUDING this one (when correct). */
  correctCount: number;
  /** Moxie's accumulated permanent bonus (caller-tracked). */
  moxieStacks: number;
  /** Does the player currently carry a Confused/Poisoned status? (for Hex) */
  hasNegativeStatus: boolean;
  /** Confused specifically (for Hydration / Shield Dust). */
  hasConfused: boolean;
  /** Poisoned specifically (for Toxic's cleanse). */
  hasPoisoned: boolean;
  rng?: () => number;
}

/** Client-side damage bonus folded into a CORRECT answer's computed damage. */
export interface TypeAbilityDamageMod {
  /** Flat damage added after the percentage multiplier. */
  flat: number;
  /** Multiplier applied to the base computed damage (0 = none, 0.2 = +20%). */
  pct: number;
  /** Whether the (possibly conditional) bonus actually applied this hit. */
  active: boolean;
}

/** Client-side modifier folded into a WRONG answer's self-damage chip. */
export interface TypeAbilitySelfDmgMod {
  /** Reduction multiplier (0.5 = halve). Applied before `flat`. */
  pct: number;
  /** Flat delta added to self-damage (negative reduces, positive increases). */
  flat: number;
  /** Force self-damage to 0 this hit. */
  zero: boolean;
  active: boolean;
}

export interface TypeAbilityPvp {
  /** Correct-answer damage tweak (client, server-clamped). */
  damage?: (ctx: TypeAbilityCtx) => TypeAbilityDamageMod;
  /** Wrong-answer self-damage tweak (client, server-clamped). */
  selfDmg?: (ctx: TypeAbilityCtx) => TypeAbilitySelfDmgMod;
  /** Fires a one-time standing effect from the server catalog at battle start. */
  battleStart?: boolean;
  /** When true this answer, the caller invokes the server catalog `post_answer`
   *  effect for this ability (heal / stat / status / cure — magnitude in SQL). */
  postAnswerFires?: (ctx: TypeAbilityCtx) => boolean;
  /** Streak survives the Nth wrong answer (1-based) — Sand Force. */
  keepsStreakOnWrong?: (wrongCountThisBattle: number) => boolean;
  /** Client UI reveal aid (Foresight / Compound Eyes) — reveal a wrong option
   *  when this returns true for the question being entered. */
  revealsWrongAt?: (questionIndex: number) => boolean;
  /** Survive an otherwise-lethal self-hit at 1 HP, once per battle — Sturdy. */
  clampsLethalSelfDmg?: boolean;
  /** Announced "in play" but with no mechanical PvP effect. */
  inert?: boolean;
  /** Short plain-language effect line for the battle-start "in play" toast. */
  note: string;
  /** One-time "activated!" toast line for conditional abilities (optional). */
  fireNote?: string;
}

const NO_DMG: TypeAbilityDamageMod = { flat: 0, pct: 0, active: false };
const NO_SELF: TypeAbilitySelfDmgMod = { pct: 0, flat: 0, zero: false, active: false };

function dmg(pct: number, flat: number, active: boolean): TypeAbilityDamageMod {
  return active ? { pct, flat, active: true } : NO_DMG;
}

// Exported (as TYPE_ABILITY_TABLE) so src/content/abilities/type/ can generate
// thin per-ability wrapper files without duplicating this logic — see that
// folder's README-equivalent comment in type-def.ts.
export const TABLE: Record<AbilityId, TypeAbilityPvp> = {
  // ── normal ────────────────────────────────────────────────────────────────
  adaptable: {
    // Solo: starts with 105 HP. PvP HP is a fixed 120 pool, so instead grant a
    // small standing durability buff at battle start (self Defense +1).
    battleStart: true,
    note: "starts sturdier (+1 Defense)",
  },
  pickup: { inert: true, note: "earns more coins (no battle effect)" },
  "even-tempo": {
    // Solo: +2 damage on neutral matchups. No type matchup in PvP → +2 flat.
    damage: () => dmg(0, 2, true),
    note: "+2 damage on every correct answer",
  },

  // ── fire ────────────────────────────────────────────────────────────────
  "flame-body": {
    selfDmg: (c) =>
      (c.rng ?? Math.random)() < 0.15
        ? { pct: 0, flat: 0, zero: true, active: true }
        : NO_SELF,
    note: "15% chance to shrug off wrong-answer damage",
    fireNote: "Flame Body — no damage taken!",
  },
  blaze: {
    damage: (c) => dmg(0.2, 0, c.selfHpPct < 0.4),
    note: "+20% damage while below 40% HP",
    fireNote: "Blaze — fired up!",
  },
  "flash-fire": {
    damage: () => dmg(0.08, 0, true),
    note: "+8% damage on every correct answer",
  },

  // ── water ────────────────────────────────────────────────────────────────
  hydration: {
    // Cure a Confused status when it's on you (Solo cures the first one).
    postAnswerFires: (c) => c.hasConfused,
    note: "washes away Confusion",
    fireNote: "Hydration — status cleared!",
  },
  torrent: {
    // Heal 10 HP the first time you drop below 30% — caller one-shots the fire.
    postAnswerFires: (c) => c.selfHpPct < 0.3,
    note: "heals when you drop below 30% HP",
    fireNote: "Torrent — surged back!",
  },
  "swift-swim": {
    // Solo: raises the speed bonus floor. PvP: standing Speed +1 (more time).
    battleStart: true,
    note: "faster on the draw (+1 Speed)",
  },

  // ── electric ──────────────────────────────────────────────────────────────
  static: {
    selfDmg: (c) =>
      (c.rng ?? Math.random)() < 0.2
        ? { pct: 0.5, flat: 0, zero: false, active: true }
        : NO_SELF,
    note: "20% chance to halve wrong-answer damage",
    fireNote: "Static — damage halved!",
  },
  "volt-absorb": {
    damage: (c) => dmg(0, 3, c.answerElapsedMs <= 5000),
    note: "+3 damage when you answer within 5 seconds",
  },
  charge: {
    damage: () => dmg(0, 2, true),
    note: "+2 damage on every correct answer",
  },

  // ── grass ────────────────────────────────────────────────────────────────
  "leech-seed": {
    postAnswerFires: (c) => c.correct,
    note: "heals a little on every correct answer",
    fireNote: "Leech Seed — HP drained back!",
  },
  synthesis: { inert: true, note: "boosts potions (no direct battle effect)" },
  overgrow: {
    damage: (c) => dmg(0.12, 0, c.oppHpPct > 0.5),
    note: "+12% damage while the opponent is above half HP",
    fireNote: "Overgrow — surging!",
  },

  // ── ice ────────────────────────────────────────────────────────────────
  "snow-cloak": {
    // First wrong of the battle deals 0 — caller one-shots via the wrong counter.
    selfDmg: (c) => (c.hadWrong ? NO_SELF : { pct: 0, flat: 0, zero: true, active: true }),
    note: "your first wrong answer deals no damage",
    fireNote: "Snow Cloak — first slip shrugged off!",
  },
  "ice-body": {
    postAnswerFires: (c) => c.correct && c.correctCount > 0 && c.correctCount % 4 === 0,
    note: "heals every 4th correct answer",
    fireNote: "Ice Body — recovered HP!",
  },
  "slush-rush": {
    // Solo halves disadvantaged wrong damage; no matchup here → flat -5.
    selfDmg: () => ({ pct: 0, flat: -5, zero: false, active: true }),
    note: "wrong answers hurt 5 less",
  },

  // ── fighting ──────────────────────────────────────────────────────────────
  guts: {
    damage: (c) => dmg(0.15, 0, c.selfHpPct < 0.5),
    note: "+15% damage while below 50% HP",
    fireNote: "Guts — pushing through!",
  },
  "no-guard": {
    damage: () => dmg(0.18, 0, true),
    selfDmg: () => ({ pct: 0, flat: 2, zero: false, active: true }),
    note: "+18% damage, but wrong answers hurt 2 more",
  },
  counter: {
    damage: (c) => dmg(0, 4, !c.prevCorrect),
    note: "+4 damage right after a wrong answer",
    fireNote: "Counter — struck back!",
  },

  // ── poison ────────────────────────────────────────────────────────────────
  toxic: {
    // Solo: poison-immune + fast Confusion cure. PvP: cleanse Poison/Confusion
    // off yourself when present (keeps the defensive identity).
    postAnswerFires: (c) => c.hasPoisoned || c.hasConfused,
    note: "shrugs off Poison and Confusion",
    fireNote: "Toxic — toxins purged!",
  },
  corrosion: {
    // Wrong answers still chip the opponent for a little.
    postAnswerFires: (c) => !c.correct,
    note: "wrong answers still chip the opponent",
    fireNote: "Corrosion — it still bit!",
  },
  "poison-touch": {
    postAnswerFires: (c) => c.correct,
    note: "correct answers poison the opponent",
    fireNote: "Poison Touch — opponent poisoned!",
  },

  // ── ground ────────────────────────────────────────────────────────────────
  "sand-veil": {
    // Solo: +2s timer. PvP: standing Speed +1 (a longer personal window).
    battleStart: true,
    note: "more time to answer (+1 Speed)",
  },
  "sand-force": {
    keepsStreakOnWrong: (n) => n <= 2,
    note: "your first two wrong answers don't break your streak",
    fireNote: "Sand Force — streak held!",
  },
  bulldoze: {
    // Solo: +25% when disadvantaged. No matchup → underdog proxy (below half HP).
    damage: (c) => dmg(0.25, 0, c.selfHpPct < 0.5),
    note: "+25% damage while below half HP",
    fireNote: "Bulldoze — heavy hit!",
  },

  // ── flying ────────────────────────────────────────────────────────────────
  tailwind: {
    damage: (c) => dmg(0.2, 0, c.questionIndex < 3),
    note: "+20% damage on the first 3 questions",
    fireNote: "Tailwind — early burst!",
  },
  aerilate: {
    // Solo: bigger speed bonuses. PvP: standing Speed +1.
    battleStart: true,
    note: "rides the wind (+1 Speed)",
  },
  acrobatics: {
    damage: (c) => dmg(0.3, 0, c.selfHpPct >= 1),
    note: "+30% damage while at full HP",
    fireNote: "Acrobatics — nimble strike!",
  },

  // ── psychic ────────────────────────────────────────────────────────────────
  foresight: {
    revealsWrongAt: (i) => (i + 1) % 5 === 0,
    note: "reveals a wrong option every 5th question",
    fireNote: "Foresight — a wrong answer revealed!",
  },
  "magic-guard": {
    // Solo: statuses deal no HP damage. PvP statuses never tick HP → inert.
    inert: true,
    note: "immune to status HP damage (none in Nearby Battle)",
  },
  amnesia: {
    inert: true,
    note: "harder to Confuse/Poison (no direct battle effect)",
  },

  // ── bug ────────────────────────────────────────────────────────────────
  "compound-eyes": {
    revealsWrongAt: (i) => i % 5 === 0 || i % 5 === 4,
    note: "reveals a wrong option on the first & last of each set",
    fireNote: "Compound Eyes — a wrong answer revealed!",
  },
  "shield-dust": {
    // Immune to Confusion → clear it the moment it lands.
    postAnswerFires: (c) => c.hasConfused,
    note: "brushes off Confusion",
    fireNote: "Shield Dust — Confusion brushed off!",
  },
  swarm: {
    damage: (c) => dmg(0, 3, c.correct && c.streakAfter >= 3),
    note: "+3 damage while on a 3+ streak",
    fireNote: "Swarm — swarming!",
  },

  // ── rock ────────────────────────────────────────────────────────────────
  sturdy: {
    clampsLethalSelfDmg: true,
    note: "survives one otherwise-fatal hit at 1 HP",
    fireNote: "Sturdy — held on at 1 HP!",
  },
  "solid-rock": {
    // Caps INCOMING damage, which is dealt by the opponent's client — can't be
    // enforced on our side, so it's announced but inert in PvP.
    inert: true,
    note: "cushions big hits (limited in Nearby Battle)",
  },
  "stealth-rock": {
    postAnswerFires: (c) => c.questionIndex > 0 && c.questionIndex % 5 === 0,
    note: "chips the opponent at the start of each 5-question round",
    fireNote: "Stealth Rock — the opponent took chip damage!",
  },

  // ── ghost ────────────────────────────────────────────────────────────────
  "cursed-body": {
    // Heal back the wrong-answer chip if the NEXT answer is correct within 5s.
    postAnswerFires: (c) => c.correct && !c.prevCorrect && c.answerElapsedMs <= 5000,
    note: "recovers a wrong answer's damage with a fast follow-up",
    fireNote: "Cursed Body — damage undone!",
  },
  "shadow-tag": {
    postAnswerFires: (c) => !c.correct,
    note: "the opponent loses HP whenever you take damage",
    fireNote: "Shadow Tag — opponent dragged down!",
  },
  hex: {
    damage: (c) => dmg(0.3, 0, c.hasNegativeStatus),
    note: "+30% damage while you're Confused or Poisoned",
    fireNote: "Hex — cursed power!",
  },

  // ── dragon ────────────────────────────────────────────────────────────────
  multiscale: {
    selfDmg: (c) => (c.selfHpPct >= 1 ? { pct: 0.5, flat: 0, zero: false, active: true } : NO_SELF),
    note: "halves wrong-answer damage while at full HP",
    fireNote: "Multiscale — damage halved!",
  },
  berserk: {
    damage: (c) => dmg(0.12, 0, c.hadWrong),
    note: "+12% damage after your first wrong answer",
    fireNote: "Berserk — enraged!",
  },
  "dragon-dance": {
    damage: (c) => {
      const rounds = Math.floor(c.questionIndex / 5);
      return dmg(0, rounds, rounds > 0);
    },
    note: "damage grows each 5-question round",
    fireNote: "Dragon Dance — building power!",
  },

  // ── dark ────────────────────────────────────────────────────────────────
  intimidate: {
    // Solo: enemy starts at 90% HP. PvP: standing opponent Attack −1 (canonical).
    battleStart: true,
    note: "cows the opponent (−1 their Attack)",
  },
  moxie: {
    damage: (c) => dmg(0, c.moxieStacks, c.moxieStacks > 0),
    note: "+1 permanent damage each 3-streak (stacks)",
    fireNote: "Moxie — power rising!",
  },
  "dark-aura": {
    inert: true,
    note: "stronger in Elite Four / League (no Nearby Battle effect)",
  },

  // ── steel ────────────────────────────────────────────────────────────────
  filter: {
    // Solo: −25% super-effective wrong damage. No SE here → −25% wrong damage.
    selfDmg: () => ({ pct: 0.25, flat: 0, zero: false, active: true }),
    note: "wrong answers hurt 25% less",
  },
  "iron-barbs": {
    selfDmg: () => ({ pct: 0, flat: -3, zero: false, active: true }),
    note: "wrong answers hurt 3 less",
  },
  metalworks: { inert: true, note: "cheaper shop items (no battle effect)" },

  // ── fairy ────────────────────────────────────────────────────────────────
  "cute-charm": {
    selfDmg: (c) =>
      (c.rng ?? Math.random)() < 0.15
        ? { pct: 0, flat: 0, zero: true, active: true }
        : NO_SELF,
    note: "15% chance to shrug off wrong-answer damage",
    fireNote: "Cute Charm — no damage taken!",
  },
  "pixie-dust": {
    postAnswerFires: (c) => c.correct && c.streakAfter > 0 && c.streakAfter % 3 === 0,
    note: "heals each time you reach a 3-streak",
    fireNote: "Pixie Dust — healed!",
  },
  moonblast: {
    damage: (c) => dmg(0, 4, c.correct && c.streakAfter >= 3),
    note: "+4 damage while on a 3+ streak",
    fireNote: "Moonblast — empowered!",
  },
};

/** Resolve a partner's PvP type-ability wiring by its ability id. */
export function typeAbilityPvp(abilityId: AbilityId | null | undefined): TypeAbilityPvp | null {
  return (abilityId && TABLE[abilityId]) || null;
}

/**
 * Resolve the ability a non-legendary partner runs in Nearby Battle from its
 * types + stored roll. Returns the AbilityId so callers can name it, look it up
 * in this table, and pass it to the server RPC.
 */
export function resolvePvpTypeAbilityId(
  types: PokeType[] | undefined,
  storedId: AbilityId | null | undefined,
): AbilityId | null {
  if (!types || types.length === 0) return null;
  return getAbility(types, storedId).id;
}

/** Correct-answer client damage modifier for the ability (never trusted for magnitude). */
export function typeAbilityDamageMod(abilityId: AbilityId | null | undefined, ctx: TypeAbilityCtx): TypeAbilityDamageMod {
  const a = typeAbilityPvp(abilityId);
  if (!a?.damage || !ctx.correct) return NO_DMG;
  return a.damage(ctx);
}

/** Wrong-answer client self-damage modifier for the ability. */
export function typeAbilitySelfDmgMod(abilityId: AbilityId | null | undefined, ctx: TypeAbilityCtx): TypeAbilitySelfDmgMod {
  const a = typeAbilityPvp(abilityId);
  if (!a?.selfDmg || ctx.correct) return NO_SELF;
  return a.selfDmg(ctx);
}

/** Apply the client self-damage modifier to a base self-damage value. */
export function applySelfDmgMod(base: number, mod: TypeAbilitySelfDmgMod): number {
  if (!mod.active) return base;
  if (mod.zero) return 0;
  return Math.max(0, Math.round(base * (1 - mod.pct)) + mod.flat);
}

/** Apply the client damage modifier to a base computed damage value. */
export function applyDamageMod(base: number, mod: TypeAbilityDamageMod): number {
  if (!mod.active) return base;
  return Math.max(1, Math.round(base * (1 + mod.pct)) + mod.flat);
}

/** Does this ability have a one-time battle-start server catalog effect? */
export function typeAbilityHasBattleStart(abilityId: AbilityId | null | undefined): boolean {
  return !!typeAbilityPvp(abilityId)?.battleStart;
}

/** Should the server post_answer catalog effect fire for this answer? */
export function typeAbilityPostAnswerFires(abilityId: AbilityId | null | undefined, ctx: TypeAbilityCtx): boolean {
  const a = typeAbilityPvp(abilityId);
  return !!a?.postAnswerFires && a.postAnswerFires(ctx);
}
