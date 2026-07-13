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

export const ItemDefSchema = z
  .object({
    id: z.string().regex(/^[a-z]+$/),
    category: ItemCategorySchema,
    name: z.string().min(1),
    emoji: z.string().min(1),
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
