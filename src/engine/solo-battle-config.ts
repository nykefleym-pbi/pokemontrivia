// Resolves the RAW facts a solo battle is stored with (solo_battles.cfg) into
// the derived BattleConfig applyAnswer actually needs (superEff/disadvantaged/
// immune/playerMaxHp/enemyMaxHp). This split matters for server authority:
// cfg stores only things a client can't usefully lie about in a way that
// matters — never pre-computed matchup booleans, which a malicious client
// could otherwise just set favorably. The server (and, isomorphically, the
// client for its own optimistic preview) derives the real values from raw
// facts via the same pure functions, every time.
//
// Matchup math takes `playerTypes`/`enemyTypes` directly rather than looking
// species up by id in the full roster (isSuperEffective et al. only ever
// read `.types`) — this is deliberate, not just an optimization: it keeps
// this module (and anything that bundles it, like the battle-solo Edge
// Function) from needing the ~1000-entry generated Pokédex just to resolve
// two type arrays. `playerPokemonId`/`enemyPokemonId` stay in cfg for
// identification/display; they aren't used for matchup math. Like
// abilityId/level/trainingPoints, the reported types are accepted from the
// authenticated caller and not cross-checked against a roster lookup in this
// pass — same trust tier as the rest of solo battle's player-identifying
// facts (see battle-solo/index.ts's module doc).
import { isPlayerDisadvantaged, isPlayerImmune, isSuperEffective } from "../lib/type-chart";
import type { PokeType } from "../lib/pokemon-data.generated";
import { enemyHpForLevel } from "../lib/level-curve";
import type { AbilityId } from "../lib/abilities";
import type { Trivia } from "../lib/trivia-core";
import type { BattleConfig, BattleItemConfig } from "./turn";

export type SoloBattleMode = "battle" | "elite" | "weekly";

/** The frozen, raw configuration a solo battle is started and replayed with.
 *  `questions[i].correct` is the one place the server holds the answer key —
 *  see 02-architecture.md P3 / the "embed the question set at start" call.
 *
 *  `items` carries the same trust tier as ability/level/types: claimed by
 *  the authenticated client from its own inventory/weekly-cooldown state at
 *  battle start, not independently verified against a server-tracked
 *  inventory (which doesn't exist — items are a client-authoritative economy
 *  concern, orthogonal to why solo battles are server-authoritative for
 *  battle MATH). See engine/turn.ts's module doc for what each flag does. */
export interface SoloBattleCfg {
  questions: Trivia[];
  playerPokemonId: number;
  playerTypes: PokeType[];
  abilityId: AbilityId | null;
  level: number;
  mode: SoloBattleMode;
  enemyPokemonId: number;
  enemyTypes: PokeType[];
  trainingPoints: number;
  items: BattleItemConfig;
}

export interface ResolvedBattleSetup {
  config: BattleConfig;
  /** Starting enemyHp — reduced from `config.enemyMaxHp` by Intimidate's
   *  onBattleStart effect (battle-screen.tsx sets `enemyHp` to 90% of max on
   *  mount; `enemyMaxHp` itself, used elsewhere for the Overgrow check and
   *  the HP bar, is untouched). */
  startingEnemyHp: number;
  /** How many of MAX_ITEMS_PER_BATTLE's shared budget the whole-battle
   *  auto-triggers (Assault Vest/King's Rock/Leftovers/Metronome) already
   *  spent before the battle's first action — popcount of `cfg.items`'s 4
   *  `*Active` flags. The client already enforced the cap when deciding
   *  which of those to activate (see battle-screen.tsx's mirroring effect);
   *  this is just carrying that decision's cost into the engine's shared
   *  counter so later triggers (Silk Scarf, Revive, Focus Band, Oran Berry,
   *  manual items) see the correct remaining budget. */
  startingItemsUsedCount: number;
}

/** Pure, deterministic: same `cfg` always resolves to the same setup. */
export function resolveBattleSetup(cfg: SoloBattleCfg): ResolvedBattleSetup {
  const player = { types: cfg.playerTypes };
  const enemy = { types: cfg.enemyTypes };

  const isElite = cfg.mode === "elite";
  const isWeekly = cfg.mode === "weekly";
  const playerMaxHp = cfg.abilityId === "adaptable" ? 105 : 100;
  const enemyMaxHp = isElite ? 200 : isWeekly ? 250 : enemyHpForLevel(cfg.level);
  const startingEnemyHp = cfg.abilityId === "intimidate" ? Math.floor(enemyMaxHp * 0.9) : enemyMaxHp;

  const config: BattleConfig = {
    abilityId: cfg.abilityId,
    level: cfg.level,
    isElite,
    isWeekly,
    playerMaxHp,
    enemyMaxHp,
    superEff: isSuperEffective(player, enemy),
    disadvantaged: isPlayerDisadvantaged(player, enemy),
    immune: isPlayerImmune(player, enemy),
    playerTypes: cfg.playerTypes,
    enemyTypes: cfg.enemyTypes,
    trainingPoints: cfg.trainingPoints,
    bonusTime: cfg.abilityId === "sand-veil" ? 2 : 0,
    isNormalType: cfg.playerTypes.includes("normal"),
    items: cfg.items,
  };

  const startingItemsUsedCount = [
    cfg.items.assaultVestActive,
    cfg.items.kingsRockActive,
    cfg.items.leftoversActive,
    cfg.items.metronomeActive,
  ].filter(Boolean).length;

  return { config, startingEnemyHp, startingItemsUsedCount };
}

const ITEM_CONFIG_BOOL_FIELDS = [
  "assaultVestActive",
  "kingsRockActive",
  "leftoversActive",
  "metronomeActive",
  "silkScarfAvailable",
  "focusBandAvailable",
  "reviveAvailable",
  "oranBerryAvailable",
] as const;

function isValidItemConfig(items: unknown): items is BattleItemConfig {
  if (!items || typeof items !== "object") return false;
  const i = items as Record<string, unknown>;
  return ITEM_CONFIG_BOOL_FIELDS.every((key) => typeof i[key] === "boolean");
}

/** Shared shape validator for a client-submitted `SoloBattleCfg` — used by
 *  both battle-solo (validating `start`'s cfg and a fetched row's cfg) and
 *  save-sync (validating a queued offline battle's cfg before replaying it),
 *  so the two Edge Functions never drift on what counts as well-formed. */
export function isValidSoloBattleCfg(cfg: unknown): cfg is SoloBattleCfg {
  if (!cfg || typeof cfg !== "object") return false;
  const c = cfg as Record<string, unknown>;
  return (
    Array.isArray(c.questions) &&
    c.questions.length > 0 &&
    c.questions.every((q) => {
      if (!q || typeof q !== "object") return false;
      const qq = q as Record<string, unknown>;
      return (
        typeof qq.question === "string" &&
        Array.isArray(qq.options) &&
        typeof qq.correct === "number" &&
        typeof qq.explanation === "string" &&
        typeof qq.category === "string"
      );
    }) &&
    typeof c.playerPokemonId === "number" &&
    Array.isArray(c.playerTypes) &&
    c.playerTypes.length > 0 &&
    c.playerTypes.every((t) => typeof t === "string") &&
    (c.abilityId === null || typeof c.abilityId === "string") &&
    typeof c.level === "number" &&
    (c.mode === "battle" || c.mode === "elite" || c.mode === "weekly") &&
    typeof c.enemyPokemonId === "number" &&
    Array.isArray(c.enemyTypes) &&
    c.enemyTypes.length > 0 &&
    c.enemyTypes.every((t) => typeof t === "string") &&
    typeof c.trainingPoints === "number" &&
    isValidItemConfig(c.items)
  );
}
