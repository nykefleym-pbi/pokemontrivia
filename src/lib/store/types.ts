// State shape for the game store. Type-only module: slices and the store
// both import from here, so neither needs to import the other.
import type { ItemId, EggProgressMode, PokeEgg, StatusKind, PvpStat } from "../game-data";
import type { PokeEntry } from "../pokemon-data";
import type { AbilityId } from "../abilities";
import type { LevelUpRewards } from "../level-rewards";
import type { WhosThatRound } from "../whos-that";

export interface PlayerStats {
  battles: number;
  wins: number;
  losses: number;
  correct: number;
  answered: number;
  bestStreak: number;
  totalAnswerTime: number;
}

/**
 * A status condition active on a combatant. Lifted out of `battle-screen.tsx`'s
 * local component state so Solo and Nearby-Battle PvP share one representation.
 * The `curesRemaining` countdown is the model that already worked for solo
 * confused/poisoned — statuses clear when it reaches 0.
 */
export interface ActiveStatus {
  kind: StatusKind;
  curesRemaining: number;
  appliedAt: number;
}

export type StatusTarget = "self" | "opponent";

/** Nearby-Battle PvP stat stages (self + mirrored opponent), −3..+3 each. */
export interface PvpStatStages {
  attack: number;
  defense: number;
  speed: number;
  crit: number;
}


export interface BattleLogItem {
  setsCompleted: number;
}

export interface BattleLogEntry {
  opponent: string;
  won: boolean;
  xpGained: number;
  bestStreak: number;
  timestamp: number;
  /** Which mode this came from, for Poké Egg hatch-progress tracking. Missing
   * on legacy entries (all of which came from regular/weekly/daily battle). */
  mode?: EggProgressMode;
}

export type DailyMark = "correct" | "wrong" | "timeout";

export interface DailyResult {
  date: string;
  correct: number;
  total: number;
  timeMs: number;
  pattern: DailyMark[];
}

export interface PokedexEntry {
  pokemonId: number;
  firstSeenAt: number;
  shinyUnlocked: boolean;
  defeatCount: number;
}

export interface WeeklyLeagueState {
  weekStartTs: number;
  gymLeaderId: string;
  status: "not_started" | "in_progress" | "won" | "lost";
  attemptStartedAt: number | null;
  questionsAnswered: number;
}

export interface WeeklyLeagueAttempt {
  weekStartTs: number;
  gymLeaderId: string;
  won: boolean;
}

/** Battle Arena lifetime stats + the current GO-style set-of-5 win-reward
 * tracker (5 battles per set, slot i unlocks at the (i+1)th win). */
export interface ArenaStats {
  nearbyBattles: number;
  trainingBattles: number;
  wins: number;
  battles: number;
  currentWinStreak: number;
  longestWinStreak: number;
  /** Berries picked up from Nearby Battle wins, cap 3, newest first. */
  lastBerries: ItemId[];
  set: {
    battles: number;
    wins: number;
    claimed: [boolean, boolean, boolean, boolean, boolean];
  };
}

export interface GameState {
  // profile
  hasOnboarded: boolean;
  isGuest: boolean;
  trainerName: string;
  trainerSprite: string;
  friendCode: string | null;
  lastEngagePromptDate: string | null;
  engageDismissCount: number;
  engageDismissDate: string | null;
  engageShownThisSession: boolean;
  nameReconciled: boolean;
  needsNameReclaim: boolean;

  /**
   * How far the "turn on notifications" ask has got with this player.
   * `asked` is terminal — either they said yes, or they said no twice.
   */
  pushPromptState: "unasked" | "soft-declined" | "asked";
  /** YYYY-MM-DD of the last ask, so the second one waits for another day. */
  pushPromptLastDate: string | null;

  dailyGiftLastClaim: string | null;
  dailyGiftStreak: number;
  /** YYYY-MM-DD the one-per-week forgiven miss was last spent. */
  dailyGiftFreezeUsedDate: string | null;
  /** YYYY-MM-DD of the last day the discounted featured shop item was bought
   * (the featured deal is limited to one purchase per day). */
  featuredDealLastPurchase: string | null;
  guaranteedShinyPending: boolean;
  pokeEggs: PokeEgg[];
  megaTrophies: { eventId: string; name: string; pokeId: number; claimedAt: string }[];
  claimedMegaRewards: string[];
  pokemon: PokeEntry | null;
  /** Rolled ability id (one of the partner's primary-type trio); null = legacy default. */
  abilityId: AbilityId | null;
  /** Highest WHATS_NEW.version the user has dismissed. */
  lastSeenWhatsNew: number;
  markWhatsNewSeen: (version: number) => void;

  /** Optimistic-concurrency version last confirmed written to save-sync (0 =
   * never pushed). Used as `baseVersion` on the next push; see store-sync.ts. */
  serverSaveVersion: number;
  setServerSaveVersion: (v: number) => void;

  // progression
  level: number;
  peakLevel: number;
  xp: number;
  coins: number;
  stats: PlayerStats;
  inventory: Record<ItemId, number>;
  itemCooldowns: Partial<Record<ItemId, number>>; // sets-remaining cooldown

  // battle ephemeral state
  inBattle: boolean;
  battleScreenActive: boolean;
  setsThisBattle: number;
  usedThisBattle: Partial<Record<ItemId, boolean>>;
  xAttackActive: boolean;
  scopeRevealedThisBattle: boolean;
  amuletCoinActive: boolean;
  expCharmActive: boolean;
  luckyPunchActive: boolean;
  starPieceActive: boolean;
  choiceSpecsActive: boolean;
  /** True once ANY item (auto or manual) has been used this battle — tracked
   * specifically so Choice Specs can enforce "must be the only item used". */
  anyItemUsedThisBattle: boolean;
  /** Total items activated this battle (manual + auto-triggered combined),
   * capped at MAX_ITEMS_PER_BATTLE so items can't be spammed/stacked. */
  itemsUsedThisBattleCount: number;
  bonusTimeThisBattle: number;

  // ── Shared status system (Solo + Nearby-Battle PvP) — ephemeral ──────────
  /** Status conditions on the local player. Ephemeral; never persisted. */
  battleStatuses: ActiveStatus[];
  /** Status conditions on the live opponent (Nearby Battle only). Ephemeral. */
  opponentStatuses: ActiveStatus[];

  // ── Nearby-Battle PvP stat stages (self + opponent) — ephemeral ──────────
  myStages: PvpStatStages;
  oppStages: PvpStatStages;

  // ── Persisted PvP flags ──────────────────────────────────────────────────
  /** Has the one-time starter Lum Berry been granted (first Nearby Battle entry)? */
  starterPvpBerryGranted: boolean;
  /** Has the player ever entered Nearby Battle (gates the starter-berry grant)? */
  hasEnteredNearbyBattle: boolean;
  luckyEggExpiresAt: number;
  bigNuggetExpiresAt: number;
  /**
   * Rewards from a level-up not yet celebrated on the dedicated Level Up
   * screen. Deliberately transient (not persisted, not reset by a battle
   * remount/rematch — see mergePendingLevelUp) so leveling up mid-rematch
   * chain doesn't lose the celebration; it's shown once the player returns
   * to the battle hub. The underlying coins/items/egg are already granted
   * the instant the level-up happens — this only tracks what to display.
   */
  pendingLevelUp: LevelUpRewards | null;
  mergePendingLevelUp: (rewards: LevelUpRewards) => void;
  clearPendingLevelUp: () => void;
  luckyEggUsedWeek: number;
  focusBandUsedWeek: number;
  assaultVestUsedWeek: number;
  kingsRockUsedWeek: number;
  leftoversUsedWeek: number;
  metronomeUsedWeek: number;
  autoItems: Partial<Record<ItemId, boolean>>;
  whosThatHourKey: number;
  whosThatActiveRound: WhosThatRound | null;
  whosThatRoundHourKey: number | null;

  // question history (per-device)
  seenQuestionHashes: string[];
  seenQuestions: string[];
  seenCuratedIds: string[];

  // achievements / progression flags
  flags: string[];

  // daily challenge
  dailyResult: DailyResult | null;

  // battle log (cap 20)
  battleLog: BattleLogEntry[];

  // Battle Arena stats + set-of-5 win rewards
  arenaStats: ArenaStats;

  // pokédex
  pokedex: Record<number, PokedexEntry>;
  defeatedEliteRegions: string[];
  defeatedElites: string[];

  // ability codex (Phase 2)
  abilityCodex: string[];

  // Phase 3: per-partner Training Points
  trainingPoints: Record<number, number>;

  // Phase 4: Weekly League
  weeklyLeague: WeeklyLeagueState | null;
  gymBadges: string[];
  weeklyLeagueHistory: WeeklyLeagueAttempt[];

  // preferences
  darkMode: boolean;
  reducedMotion: boolean;

  // actions
  setOnboarded: (
    name: string,
    pokemon: PokeEntry,
    trainerSprite: string,
    abilityId?: AbilityId,
  ) => void;
  setFriendCode: (code: string) => void;
  setLastEngagePromptDate: (date: string) => void;
  recordEngageDismiss: () => void;
  recordPushPrompt: (outcome: "soft-declined" | "asked") => void;
  setNameReconciled: (v: boolean) => void;
  setNeedsNameReclaim: (v: boolean) => void;
  setEngageShownThisSession: (v: boolean) => void;
  setWhosThatRound: (round: WhosThatRound, hourKey: number) => void;
  clearWhosThatRound: () => void;

  claimDailyGift: () => {
    itemId: ItemId;
    qty: number;
    day: number;
    shiny: boolean;
    /** The streak survived a missed day because the weekly freeze absorbed it. */
    usedFreeze: boolean;
    /** Welcome-back coins granted alongside the gift; 0 for a regular claim. */
    comebackCoins: number;
  } | null;
  consumeGuaranteedShiny: () => void;
  grantPokeEgg: (n?: number) => void;
  claimMegaChampion: (eventId: string, name: string, pokeId: number) => boolean;
  /** Hatches a specific egg (must be at/above its required progress). Returns
   * false if the egg doesn't exist or isn't ready yet. */
  hatchPokeEgg: (eggId: string) => boolean;
  markMegaRewardClaimed: (eventId: string) => void;
  startGuestSession: () => void;

  reset: () => void;
  setName: (name: string) => void;
  setPokemon: (p: PokeEntry) => void;
  setTrainerSprite: (id: string) => void;
  markQuestionsSeen: (texts: string[]) => void;
  markCuratedSeen: (ids: string[]) => void;

  buyItem: (id: ItemId, cost: number) => boolean;
  /** Record that today's discounted featured shop item was purchased (caps it
   * at one purchase per day). */
  markFeaturedDealPurchased: () => void;
  useItem: (id: ItemId) => boolean;
  tryAutoFocusBand: () => boolean;
  tryAutoQuickClaw: () => boolean;
  tryAutoAssaultVest: () => boolean;
  tryAutoRevive: () => boolean;
  tryAutoOranBerry: () => boolean;
  tryAutoSilkScarf: () => boolean;
  tryAutoKingsRock: () => boolean;
  tryAutoLeftovers: () => boolean;
  tryAutoMetronome: () => boolean;
  toggleAutoItem: (id: ItemId) => void;
  grantItem: (id: ItemId, qty?: number) => void;
  consumeWhosThat: () => void;

  startBattle: () => void;
  endBattle: (won: boolean, xpGained: number) => void;
  abortBattle: () => void;
  setBattleScreenActive: (v: boolean) => void;
  recordAnswer: (correct: boolean, timeMs: number, streak: number) => void;
  completeSet: () => void;
  consumeXAttack: () => void;
  consumeScope: () => void;

  // ── Shared status actions ────────────────────────────────────────────────
  /** Apply/refresh a status. Enforces the global stacking rule: one major
   * status at a time (a new major replaces an old one); Confusion is the sole
   * volatile and coexists with any major. */
  applyBattleStatus: (status: ActiveStatus, target?: StatusTarget) => void;
  /** Tick one cure off a status. Returns true if this tick cleared it. */
  tickBattleStatusCure: (kind: StatusKind, target?: StatusTarget) => boolean;
  clearBattleStatus: (kind: StatusKind, target?: StatusTarget) => void;
  clearAllBattleStatuses: (target?: StatusTarget) => void;

  // ── Nearby-Battle PvP stat-stage actions ─────────────────────────────────
  /** Adjust a stat stage (clamped to −3..+3). `who` = whose stats to change. */
  bumpPvpStage: (who: StatusTarget, stat: PvpStat, delta: number) => void;
  resetPvpStages: () => void;
  /** Marks Nearby Battle as entered. Returns true the first time (so the caller
   * can grant the one-time starter Lum Berry). */
  markNearbyBattleEntered: () => boolean;
  addXp: (amount: number) => void;
  addCoins: (n: number) => void;
  raiseFlag: (name: string) => void;
  recordDaily: (r: DailyResult) => void;
  pushBattleLog: (e: BattleLogEntry) => void;
  /** Records one Arena battle's outcome into `arenaStats` (mode counters, win
   * streak, berries, set-of-5 progress) — auto-granting any unclaimed but
   * unlocked set rewards before rolling over to a fresh set. */
  recordArenaBattle: (args: { won: boolean; isBot: boolean; berries: ItemId[] }) => void;
  /** Claims the Arena set-of-5 reward at `slot` (0-4). Returns the grant
   * descriptor for toasting, or null if the slot isn't unlocked/already
   * claimed/out of range. */
  claimArenaReward: (slot: number) => { text: string } | null;
  recordPokedexCapture: (pokemonId: number, isShiny: boolean) => void;
  markEliteDefeated: (memberId: string, region: string, regionDone: boolean) => void;
  registerAbilityTriggered: (abilityId: string) => void;

  // Phase 3 actions
  addTrainingPoints: (pokemonId: number, amount: number) => void;
  spendTrainingPoints: (pokemonId: number, amount: number) => boolean;
  getPartnerTp: (pokemonId: number) => number;
  evolvePartner: (toPokemon: PokeEntry) => boolean;

  // Phase 4: Weekly League actions
  initWeeklyLeague: () => void;
  startWeeklyLeagueAttempt: () => void;
  recordWeeklyLeagueResult: (won: boolean) => void;

  // preferences actions
  setDarkMode: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
}
