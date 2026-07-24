// Zod schemas for the content registries. Run by content.test.ts (and later
// by the docs generator) so a malformed definition file fails CI instead of
// failing a player mid-battle.
import { z } from "zod";

export const StatusKindSchema = z.enum([
  "confused",
  "poisoned",
  "badly-poisoned",
  "burn",
  "paralysis",
  "sleep",
  "freeze",
]);

export const StatusDefSchema = z.object({
  id: StatusKindSchema,
  emoji: z.string().min(1),
  label: z.string().min(1),
  major: z.boolean(),
  defaultCures: z.number().int().min(1),
  describe: z.function().returns(z.string()),
});

export const PokeTypeSchema = z.enum([
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
]);

export const RolledAbilityDefSchema = z.object({
  id: z.string().regex(/^[a-z]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  type: PokeTypeSchema,
  description: z.string().min(1),
  slot: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});

// Deliberately shallow, same reasoning as SignatureDefSchema: a TypeAbilityPvp
// entry is executable behavior (damage tweaks, timing predicates), not data —
// its own correctness is covered by pvp-type-abilities.test.ts. This just
// checks the wrapper shape (id present, note is a non-empty string, at least
// one behavior field so an empty `{}` entry can't sneak through unnoticed).
export const TypeAbilityDefSchema = z
  .object({
    id: z.string().min(1),
    pvp: z
      .object({ note: z.string().min(1) })
      .passthrough(),
  })
  .superRefine(({ pvp }, ctx) => {
    const behaviorKeys = [
      "damage",
      "selfDmg",
      "battleStart",
      "postAnswerFires",
      "keepsStreakOnWrong",
      "revealsWrongAt",
      "clampsLethalSelfDmg",
      "inert",
    ];
    if (!behaviorKeys.some((k) => k in pvp)) {
      ctx.addIssue({ code: "custom", message: "no behavior field set — this ability does nothing in PvP" });
    }
  });

export const ItemCategorySchema = z.enum(["HEALING", "BATTLE", "UTILITY", "PREMIUM", "BERRY"]);

export const PvpStatSchema = z.enum(["attack", "defense", "speed", "crit"]);

export const BerryEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cureStatus"), status: z.union([StatusKindSchema, z.literal("any")]) }),
  z.object({ type: z.literal("immunity"), questions: z.number().int().positive() }),
  z.object({
    type: z.literal("statStage"),
    stat: PvpStatSchema,
    delta: z.number().int(),
    questions: z.number().int().positive(),
  }),
  z.object({ type: z.literal("randomStatStage"), delta: z.number().int(), questions: z.number().int().positive() }),
  z.object({ type: z.literal("inflictStatus"), status: StatusKindSchema, questions: z.number().int().positive() }),
]);

// Deliberately shallow: SignatureEngineSpec's own invariants are already
// covered by signature-abilities.test.ts, liveness.ts, and the balance-sim
// byte-identical gate. Re-deriving that recursive shape here would be a
// second, driftable copy of the same rules — exactly the kind of untyped
// duplication CLAUDE.md warns against for this system.
export const SignatureDefSchema = z.object({
  id: z.string().min(1),
  pokemonId: z.number().int().positive(),
  species: z.string().min(1),
  engine: z.object({ trigger: z.object({ type: z.string().min(1) }).passthrough() }).passthrough(),
  describe: z.function().returns(z.string()),
});

export const ItemDefSchema = z
  .object({
    id: z.string().regex(/^[a-z]+$/),
    category: ItemCategorySchema,
    name: z.string().min(1),
    // Empty is allowed: an item may opt out of an emoji glyph entirely and rely
    // solely on its sprite (iconUrl). ItemIcon renders the sprite and only falls
    // back to the emoji if the image fails, so a blank emoji simply means "no
    // fallback / no text glyph in toasts."
    emoji: z.string(),
    iconUrl: z.string().url(),
    desc: z.string().min(1),
    cost: z.number().int().min(0),
    premium: z.boolean().optional(),
    isBerry: z.boolean().optional(),
    pvpOnly: z.boolean().optional(),
    berry: z.object({ target: z.enum(["self", "opponent"]), effect: BerryEffectSchema }).optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.category === "BERRY") {
      if (!item.isBerry) ctx.addIssue({ code: "custom", message: "BERRY items must set isBerry" });
      if (!item.berry) ctx.addIssue({ code: "custom", message: "BERRY items must declare a berry effect" });
    }
    if (item.berry && !item.isBerry) {
      ctx.addIssue({ code: "custom", message: "berry effect on a non-berry item" });
    }
  });
