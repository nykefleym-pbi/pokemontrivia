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
import type { BattleConfig } from "./turn";

export type SoloBattleMode = "battle" | "elite" | "weekly";

/** The frozen, raw configuration a solo battle is started and replayed with.
 *  `questions[i].correct` is the one place the server holds the answer key —
 *  see 02-architecture.md P3 / the "embed the question set at start" call. */
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
}

export interface ResolvedBattleSetup {
  config: BattleConfig;
  /** Starting enemyHp — reduced from `config.enemyMaxHp` by Intimidate's
   *  onBattleStart effect (battle-screen.tsx sets `enemyHp` to 90% of max on
   *  mount; `enemyMaxHp` itself, used elsewhere for the Overgrow check and
   *  the HP bar, is untouched). */
  startingEnemyHp: number;
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
    trainingPoints: cfg.trainingPoints,
    bonusTime: cfg.abilityId === "sand-veil" ? 2 : 0,
  };

  return { config, startingEnemyHp };
}
