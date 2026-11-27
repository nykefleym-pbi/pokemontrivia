import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NaBattleField,
  FieldSprite,
  NaHpCard,
  NaCombo,
  NaDamage,
  NaQuestionPanel,
  NaFeedbackBanner,
  MOVE_BY_TYPE,
  FxCanvas,
  NaIntroTrainer,
  NaIntroText,
  NaCatchPanel,
  NaCoachBubble,
  type AnswerState,
  type Trim,
} from "@/components/na/battle";
import { NaWordmark } from "@/components/na/celebration";
import type { BattleFx } from "@/lib/battle-fx/engine";
import { GENERATIONS } from "@/lib/dex-rewards";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { NaIcon } from "@/components/na/icon";
import { useGameStore, getItemDef } from "@/lib/store";
import { MAX_ITEMS_PER_BATTLE } from "@/lib/store/slices/itemsSlice";
import {
  pickRandomEnemy,
  type EnemyTrainer,
  enemyHpForLevel,
  baseDamageForLevel,
  streakMultiplier,
  streakLabel,
  getTpMultiplier,
  lifetimeTp,
  xpProgressInLevel,
  rankForLevel,
} from "@/lib/game-data";
import { battleReward } from "@/lib/rewards";
import { rollLevelUpRewards } from "@/lib/level-rewards";

import {
  isSuperEffective,
  findPokemon,
  isPlayerDisadvantaged,
  isPlayerImmune,
  canEvolve,
  type PokeEntry,
  type PokeType,
} from "@/lib/pokemon-data";
import { typeMatchup, type EffectivenessBand } from "@/lib/type-chart";
import { getAbility as getAbilityFn, rollAbilityId, type Ability } from "@/lib/abilities";
import {
  PokemonSprite,
  StatusEffectOverlay,
  ItemBagSheet,
} from "@/components/game-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ItemId } from "@/lib/game-data";
import { ACHIEVEMENTS, unlockedAchievements } from "@/lib/achievements";
import { playSfx, revealPokemon, playBattleResult, playItemCue } from "@/lib/audio";
import { answerHaptic } from "@/lib/haptics";
import { type EliteMember, regionCompleted } from "@/lib/elite-four";
import type { GymLeader } from "@/lib/gym-leaders";
import { routeOpponent } from "@/lib/route";
import { SHINY_CHANCE } from "@/lib/game-data";
import { ShareCardDialog } from "@/components/share-card-dialog";
import type { ShareData } from "@/components/share-card-builder";
import { trainerSpriteUrl, trainerArtFor } from "@/lib/game-data";
import type { MissedAnswer, Trivia } from "@/lib/trivia-core";
import { shuffleAllTriviaOptions } from "@/lib/trivia-core";
import { useForfeitGuard } from "@/lib/use-forfeit-guard";
export type { Trivia };
import { DailyScreen } from "@/components/daily-screen";
import { ResultScreen } from "@/components/result-screen";
import { startSoloBattle, submitBattleAction } from "@/services/client/battle-solo";
import type { SoloBattleCfg } from "@/engine";
import { track } from "@/lib/analytics";

const QUESTIONS_PER_SET = 5;
const TIMER_BASE = 20;

type Phase = "intro" | "question" | "feedback" | "result";

interface Props {
  questions: Trivia[];
  onExit: () => void;
  onRematch?: () => void;
  mode?: "battle" | "daily" | "elite" | "weekly";
  eliteMember?: EliteMember;
  gymLeader?: GymLeader | null;
  /** A battle on the Home route: the opponent comes from the route, and a win beats its stop. */
  route?: boolean;
}

export function BattleScreen({
  questions: rawQuestions,
  onExit,
  onRematch,
  mode = "battle",
  eliteMember,
  gymLeader,
  route,
}: Props) {
  // Randomize option order once per battle so repeat questions can't be
  // answered from memorized answer positions.
  const questions = useMemo(() => shuffleAllTriviaOptions(rawQuestions), [rawQuestions]);
  if (mode === "daily") {
    return <DailyScreen questions={questions} onExit={onExit} />;
  }
  if (mode === "elite" && eliteMember) {
    return (
      <BattleMode
        questions={questions}
        onExit={onExit}
        onRematch={onRematch}
        eliteMember={eliteMember}
      />
    );
  }
  if (mode === "weekly" && gymLeader) {
    return (
      <BattleMode
        questions={questions}
        onExit={onExit}
        onRematch={onRematch}
        gymLeader={gymLeader}
      />
    );
  }
  return <BattleMode questions={questions} onExit={onExit} onRematch={onRematch} route={route} />;
}

function BattleMode({
  questions,
  onExit,
  onRematch,
  eliteMember,
  gymLeader,
  route,
}: Pick<Props, "questions" | "onExit" | "onRematch" | "route"> & {
  eliteMember?: EliteMember;
  gymLeader?: GymLeader;
}) {
  const player = useGameStore((s) => s.pokemon)!;
  const level = useGameStore((s) => s.level);
  const trainerName = useGameStore((s) => s.trainerName);

  const startBattle = useGameStore((s) => s.startBattle);
  const endBattle = useGameStore((s) => s.endBattle);
  const abortBattle = useGameStore((s) => s.abortBattle);
  const setBattleScreenActive = useGameStore((s) => s.setBattleScreenActive);
  useEffect(() => {
    setBattleScreenActive(true);
    return () => setBattleScreenActive(false);
  }, [setBattleScreenActive]);
  const recordAnswer = useGameStore((s) => s.recordAnswer);
  const completeSet = useGameStore((s) => s.completeSet);
  const consumeXAttack = useGameStore((s) => s.consumeXAttack);
  const applyItem = useGameStore((s) => s.useItem);
  const xAttackActive = useGameStore((s) => s.xAttackActive);
  const scopeRevealedThisBattle = useGameStore((s) => s.scopeRevealedThisBattle);
  const consumeScope = useGameStore((s) => s.consumeScope);
  const bonusTime = useGameStore((s) => s.bonusTimeThisBattle);
  const inventory = useGameStore((s) => s.inventory);
  const usedThisBattle = useGameStore((s) => s.usedThisBattle);
  const choiceSpecsActive = useGameStore((s) => s.choiceSpecsActive);
  const anyItemUsedThisBattle = useGameStore((s) => s.anyItemUsedThisBattle);
  const itemsUsedThisBattleCount = useGameStore((s) => s.itemsUsedThisBattleCount);
  const itemCapReached = itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE;
  const tryAutoFocusBand = useGameStore((s) => s.tryAutoFocusBand);
  const tryAutoQuickClaw = useGameStore((s) => s.tryAutoQuickClaw);
  const tryAutoAssaultVest = useGameStore((s) => s.tryAutoAssaultVest);
  const tryAutoRevive = useGameStore((s) => s.tryAutoRevive);
  const tryAutoOranBerry = useGameStore((s) => s.tryAutoOranBerry);
  const tryAutoSilkScarf = useGameStore((s) => s.tryAutoSilkScarf);
  const tryAutoKingsRock = useGameStore((s) => s.tryAutoKingsRock);
  const tryAutoLeftovers = useGameStore((s) => s.tryAutoLeftovers);
  const tryAutoMetronome = useGameStore((s) => s.tryAutoMetronome);
  const raiseFlag = useGameStore((s) => s.raiseFlag);
  const pushBattleLog = useGameStore((s) => s.pushBattleLog);
  const recordPokedexCapture = useGameStore((s) => s.recordPokedexCapture);
  const recordPokedexSeen = useGameStore((s) => s.recordPokedexSeen);
  const markEliteDefeated = useGameStore((s) => s.markEliteDefeated);
  const defeatedElites = useGameStore((s) => s.defeatedElites);

  const isElite = !!eliteMember;
  const isWeekly = !!gymLeader;
  const recordWeeklyLeagueResult = useGameStore((s) => s.recordWeeklyLeagueResult);

  // Shared status system (lifted from local component state into the store so
  // Solo and Nearby-Battle PvP share one representation).
  const statuses = useGameStore((s) => s.battleStatuses);
  const applyBattleStatus = useGameStore((s) => s.applyBattleStatus);
  const tickBattleStatusCure = useGameStore((s) => s.tickBattleStatusCure);
  const clearAllBattleStatuses = useGameStore((s) => s.clearAllBattleStatuses);

  // The route stop this battle is for (null: an extra battle, or not a route battle).
  const routeStopRef = useRef<number | null>(null);
  const [enemy] = useState<EnemyTrainer>(() => {
    if (route && !gymLeader && !eliteMember) {
      const o = routeOpponent(useGameStore.getState().route, SHINY_CHANCE);
      routeStopRef.current = o.stop;
      return useGameStore.getState().guaranteedShinyPending ? { ...o.enemy, isShiny: true } : o.enemy;
    }
    if (gymLeader) {
      const poke: PokeEntry = findPokemon(gymLeader.signaturePokemonId) ?? {
        id: gymLeader.signaturePokemonId,
        slug: gymLeader.name.toLowerCase(),
        name: gymLeader.name,
        types: [gymLeader.type],
        evolvesFromId: null,
        evolvesToIds: [],
        evolutionStage: 1,
        isFullyEvolved: true,
      };
      return {
        name: gymLeader.name,
        title: `Gym Leader · ${gymLeader.region}`,
        pokemon: poke,
        isShiny: false,
      };
    }
    if (eliteMember) {
      const poke: PokeEntry = findPokemon(eliteMember.signaturePokemonId) ?? {
        id: eliteMember.signaturePokemonId,
        slug: eliteMember.signaturePokemonName.toLowerCase(),
        name: eliteMember.signaturePokemonName,
        types: [eliteMember.type],
        evolvesFromId: null,
        evolvesToIds: [],
        evolutionStage: 1,
        isFullyEvolved: true,
      };
      return {
        name: eliteMember.name,
        title: `${eliteMember.title} · ${eliteMember.region}`,
        pokemon: poke,
        isShiny: false,
      };
    }
    const base = pickRandomEnemy();
    return useGameStore.getState().guaranteedShinyPending ? { ...base, isShiny: true } : base;
  });
  const enemyMaxHp = isWeekly ? 250 : isElite ? 200 : enemyHpForLevel(level);
  const abilityId = useGameStore((s) => s.abilityId);
  const playerAbility = useMemo(
    () => getAbilityFn(player.types, abilityId),
    [player.types, abilityId],
  );
  const playerMaxHp = playerAbility.id === "adaptable" ? 105 : 100;
  // Cosmetic-only: the enemy trainer's Pokémon gets a random type ability too
  // (matches the partner's chip in the UI) but never affects damage math —
  // Solo has no "enemy acts" turn for an ability to hook into.
  const enemyAbility = useMemo(
    () => getAbilityFn(enemy.pokemon.types, rollAbilityId(enemy.pokemon.types)),
    [enemy.pokemon.types],
  );
  const [playerHp, setPlayerHp] = useState(playerMaxHp);
  // Meeting a Pokémon registers it as SEEN; beating it upgrades that to CAUGHT
  // further down. Without this the Pokédex's seen state would have no writer
  // and the status would be dead UI. Seen never overwrites caught, so a rematch
  // against something you already own changes nothing.
  useEffect(() => {
    recordPokedexSeen(enemy.pokemon.id);
  }, [enemy.pokemon.id, recordPokedexSeen]);

  const [enemyHp, setEnemyHp] = useState(enemyMaxHp);
  const [phase, setPhase] = useState<Phase>("intro");
  const [trivia, setTrivia] = useState<Trivia | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [revealedWrong, setRevealedWrong] = useState<number | null>(null);
  const [revealedWrong2, setRevealedWrong2] = useState<number | null>(null);
  const [revealedCorrect, setRevealedCorrect] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [introBanner, setIntroBanner] = useState<string | null>(null);
  // 3.1: the trainer stands alone first ("trainer"), then the platforms and both Pokémon come in
  // ("enter"). The Elite Four keeps its own intro (row 11).
  const [introStage, setIntroStage] = useState<"trainer" | "enter" | null>(isElite ? null : "trainer");
  const enteredRef = useRef(false);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introName = isWeekly && gymLeader ? `Gym Leader ${gymLeader.name}` : enemy.name;
  const introArt = isWeekly && gymLeader ? trainerSpriteUrl(gymLeader.trainerSpriteId) : trainerArtFor(enemy.name);
  const [shakeWho, setShakeWho] = useState<"player" | "enemy" | null>(null);
  const [floatDmg, setFloatDmg] = useState<{
    who: "player" | "enemy";
    n: number;
    super: boolean;
    speedy: boolean;
    /** Per-question type matchup, for the compact effectiveness pill. */
    band?: EffectivenessBand;
    attackType?: string;
    mult?: number;
  } | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  // The last hit on the opponent, for the "Correct!" banner (3.3).
  const lastHitRef = useRef<{ n: number; type: string } | null>(null);
  // The question panel's height, so the field can shrink on short phones (3.2).
  const [panelH, setPanelH] = useState(380);
  const panelObserver = useRef<ResizeObserver | null>(null);
  const panelRefCb = useCallback((el: HTMLDivElement | null) => {
    panelObserver.current?.disconnect();
    if (!el || typeof ResizeObserver === "undefined") return;
    panelObserver.current = new ResizeObserver(() => setPanelH(el.offsetHeight));
    panelObserver.current.observe(el);
    setPanelH(el.offsetHeight);
  }, []);

  // ---- Pixel effects (Figma 3b, 3c, 3.4, 3.7): the plugin's pixelfx scene, loaded on demand. The
  // sprites stay <img>s; the engine draws on two canvases and moves them with each attack's pose.
  const fxRef = useRef<BattleFx | null>(null);
  const fxBack = useRef<HTMLCanvasElement>(null);
  const fxFront = useRef<HTMLCanvasElement>(null);
  const fxEls = useRef<{ enemy?: HTMLElement | null; player?: HTMLElement | null; stage?: HTMLElement | null }>({}).current;
  const fxSprites = useRef<Partial<Record<"enemy" | "player", { img: HTMLImageElement; trim: Trim }>>>({}).current;
  const [fxReady, setFxReady] = useState(false);
  // where FieldSprite puts them, in art px (half a point): opponent at 2 pt, partner at 3 pt
  const fxPlace = { enemy: { k: 1, cx: 143, feet: 107.5 }, player: { k: 1.5, cx: 52, feet: 210 } } as const;
  const fxSprite = (side: "enemy" | "player", img: HTMLImageElement, trim: Trim) => {
    fxSprites[side] = { img, trim };
    fxRef.current?.setSprite(side, { img, trim, ...fxPlace[side] });
    if (side === "player") fxRef.current?.setStatuses("player", statuses.map((s) => s.kind));
  };
  useEffect(() => {
    if (typeof navigator === "undefined" || /jsdom/i.test(navigator.userAgent)) return; // tests: no canvas
    let live = true;
    import("@/lib/battle-fx/engine")
      .then(({ createBattleFx }) => {
        if (!live || !fxBack.current || !fxFront.current) return;
        // Settings > Reduce motion or the OS setting: no shake, flash or freeze (3.6)
        const reduced = useGameStore.getState().reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
        const fx = createBattleFx(fxBack.current, fxFront.current, fxEls, { reduced });
        for (const side of ["enemy", "player"] as const) {
          const s = fxSprites[side];
          if (s) fx.setSprite(side, { ...s, ...fxPlace[side] });
        }
        fxRef.current = fx;
        setFxReady(true);
      })
      .catch(() => {});
    return () => {
      live = false;
      fxRef.current?.destroy();
      fxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Every hit plays its type's move (3b): yours on a right answer, the opponent's on a miss. 3, 5, 7
  // and 10 in a row hit harder (3.4); the knockout blow always gets the freeze (3.6).
  useEffect(() => {
    const fx = fxRef.current;
    if (!fx || !floatDmg?.attackType) return;
    if (floatDmg.who === "enemy") {
      const tier = streak >= 10 ? 4 : streak >= 7 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1 : 0;
      void fx.attack(floatDmg.attackType, "player", enemyHp <= 0 ? Math.max(tier, 2) : tier);
    } else void fx.attack(floatDmg.attackType, "enemy");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatDmg]);
  // Statuses wrap your partner (3c).
  useEffect(() => {
    fxRef.current?.setStatuses("player", statuses.map((s) => s.kind));
  }, [statuses, fxReady]);
  const [confirmExit, setConfirmExit] = useState(false);
  // Browser/Android back mid-battle asks to forfeit instead of silently
  // leaving (feedback 2286b6fc). Reuses the existing Leave-battle dialog.
  useForfeitGuard(phase !== "result", () => setConfirmExit(true));
  const [resultWon, setResultWon] = useState<boolean | null>(null);
  const [xpEarned, setXpEarned] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [streakBanner, setStreakBanner] = useState<string | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState(0);
  const questionStart = useRef<number>(0);
  // For the victory screen's Time tile and catch card (Figma 4.1 / 1.5).
  const battleStartRef = useRef<number | null>(null);
  const durationMsRef = useRef(0);
  const caughtRef = useRef<{ id: number; name: string; isNew: boolean; shiny: boolean } | null>(null);
  // 3.7: after a win the ball is thrown on the field ("throw"), GOTCHA! shows ("caught"), and a tap
  // moves on to the victory screen ("done"). Only where the effects run (never in tests).
  const [catchStage, setCatchStage] = useState<"none" | "throw" | "caught" | "done">("none");
  useEffect(() => {
    const fx = fxRef.current;
    if (phase !== "result" || !resultWon || !caughtRef.current || !fx || catchStage !== "none") return;
    // 3.6 holds "Tirtouga fainted!" a moment longer, then the ball is thrown
    setTimeout(() => {
      setCatchStage("throw");
      // the fainted Pokémon turns red and is pulled into the ball
      void fx.catchPokemon((tintK, alpha) => {
        const el = fxEls.enemy;
        if (!el) return;
        el.style.opacity = String(alpha);
        el.style.filter = tintK > 0.4 ? "sepia(1) saturate(8) hue-rotate(-50deg)" : "";
      });
      setTimeout(() => setCatchStage("caught"), 3100); // "3.1 s · Click! Caught"
    }, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, resultWon, fxReady]);
  const startedRef = useRef(false);
  const battleEndedRef = useRef(false);
  // server-first-refactor P3 — set once startSoloBattle resolves; every
  // action fired at this battle-solo record afterward is fire-and-forget
  // (see the mirroring effect below for why: gameplay stays fully
  // client-driven/instant, this is a best-effort replayable mirror only).
  const soloBattleIdRef = useRef<string | null>(null);
  const maxStreakRef = useRef(0);
  const lastStreakLabelRef = useRef<string | null>(null);
  const correctCountRef = useRef(0);
  const topDmgRef = useRef(0);
  const totalElapsedMsRef = useRef(0);
  const answeredCountRef = useRef(0);
  const [tpEarned, setTpEarned] = useState(0);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const trainerSpriteId = useGameStore((s) => s.trainerSprite);

  const superEff = isSuperEffective(player, enemy.pokemon);
  const disadvantaged = useMemo(
    () => isPlayerDisadvantaged(player, enemy.pokemon),
    [player, enemy.pokemon],
  );
  const immune = useMemo(() => isPlayerImmune(player, enemy.pokemon), [player, enemy.pokemon]);
  const assaultVestActiveRef = useRef(false);
  const kingsRockActiveRef = useRef(false);
  const leftoversActiveRef = useRef(false);
  const metronomeActiveRef = useRef(false);

  // Phase 2: ability + status state. `statuses` now lives in the store
  // (`battleStatuses`); solo only ever applies "confused" / "poisoned".
  type StatusKind = "confused" | "poisoned";
  const wrongStreakRef = useRef(0);
  const missedRef = useRef<MissedAnswer[]>([]);
  const newTrophiesRef = useRef<Array<{ name: string }>>([]);
  const speedBonusTotalRef = useRef(0);

  const poisonTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAbilityToastRef = useRef<number>(0);
  const abilityStateRef = useRef({
    sturdyUsed: false,
    iceFirstWrongConsumed: false,
    hydrationUsed: false,
    cursedBodyPending: null as { hpBefore: number; appliedAt: number } | null,
    triggered: new Set<string>(),
    // set 2/3 ability state
    torrentUsed: false,
    sandForceUsed: 0,
    moxieBonus: 0,
    hadWrong: false,
    lastWasWrong: false,
    venom: 0,
  });
  const [timer, setTimer] = useState(20);
  // HP when the ability last pulsed, so the chip can say what it did ("+2 HP", 3.3)
  const [abilityPulse, setAbilityPulse] = useState<number | null>(null);

  function triggerAbilityToast(ability: Ability) {
    const already = abilityStateRef.current.triggered.has(ability.id);
    const now = Date.now();
    const recentlyShown = now - lastAbilityToastRef.current < 1500;
    // Figma 3.3: the toast explains the ability once per battle; after that its chip pulses.
    if (!already && !recentlyShown) {
      toast.info(`${ability.name} activated!`, {
        description: ability.description,
        duration: 2200,
      });
      lastAbilityToastRef.current = now;
    } else if (already) {
      setAbilityPulse(playerHp);
      setTimeout(() => setAbilityPulse(null), 1200);
    }
    if (!already) {
      abilityStateRef.current.triggered.add(ability.id);
      useGameStore.getState().registerAbilityTriggered(ability.id);
    }
  }

  function stopPoisonTick() {
    if (poisonTimerRef.current) {
      clearInterval(poisonTimerRef.current);
      poisonTimerRef.current = null;
    }
  }

  function startPoisonTick() {
    stopPoisonTick();
    if (playerAbility.id === "magic-guard") {
      triggerAbilityToast(playerAbility);
      return;
    }
    poisonTimerRef.current = setInterval(() => {
      setPlayerHp((hp) => {
        const tick = Math.max(1, Math.floor(playerMaxHp * 0.02));
        const next = Math.max(0, hp - tick);
        setFloatDmg({ who: "player", n: tick, super: false, speedy: false });
        setTimeout(() => setFloatDmg(null), 800);
        if (next <= 0) {
          stopPoisonTick();
          setTimeout(() => finish(false), 800);
        }
        return next;
      });
    }, 2000);
  }

  function applyStatus(kind: StatusKind) {
    if (
      kind === "confused" &&
      playerAbility.id === "hydration" &&
      !abilityStateRef.current.hydrationUsed
    ) {
      abilityStateRef.current.hydrationUsed = true;
      triggerAbilityToast(playerAbility);
      return;
    }
    playSfx(kind === "confused" ? "confused" : "poisoned");
    const cureNeeds = {
      confused: playerAbility.id === "toxic" ? 1 : 2,
      poisoned: 3,
    } as const;
    applyBattleStatus({ kind, curesRemaining: cureNeeds[kind], appliedAt: Date.now() });
    if (kind === "confused") {
      toast.warning("🌀 Confused! Some correct answers may miss.");
    } else {
      toast.error("☠️ Poisoned! Losing HP over time.");
      startPoisonTick();
    }
  }

  function tickStatusCure(kind: StatusKind) {
    const willClear = tickBattleStatusCure(kind);
    if (willClear) {
      if (kind === "confused") toast.success("Snapped out of confusion!");
      if (kind === "poisoned") {
        toast.success("Recovered from poison!");
        stopPoisonTick();
      }
    }
  }

  // Tutorial state — only in regular battles, never Elite
  const flags = useGameStore((s) => s.flags);
  const tutorialActive = useMemo(
    () => !flags.includes("tutorial_done") && !eliteMember,
    [flags, eliteMember],
  );
  // 1.3 / 1.4: Professor Oak's inline hints in the first battle (no pop-up, nothing pauses): one at
  // the answers on Q1, one at your HP bar the first time it drops. The battle's end marks it done.
  const [oakHint, setOakHint] = useState<"answers" | "hp" | null>(null);
  const hpHintShownRef = useRef(false);

  // start once
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startBattle();
    if (!(isElite && eliteMember)) {
      // 3.1: the trainer alone for a moment (tap to skip), then the field fills in.
      // 10.1: a gym leader waits for the tap (one challenge a week, so the player starts it).
      if (!isWeekly) introTimerRef.current = setTimeout(enterField, 1200);
      return;
    }
    playSfx("elite_intro");
    setIntroBanner(`${eliteMember.title} ${eliteMember.name}: "${eliteMember.quote}"`);
    setTimeout(() => revealPokemon(enemy.pokemon.id), 900);
    setTimeout(() => setIntroBanner(`${eliteMember.name} sent out ${enemy.pokemon.name}!`), 2200);
    shinyCue();
    setTimeout(() => {
      setIntroBanner(`Go, ${player.name}!${superEff ? " Type advantage!" : ""}`);
      revealPokemon(player.id);
    }, 3600);
    setTimeout(() => setIntroBanner(null), 4900);
    setTimeout(() => loadQuestion(0), 4900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shinyCue() {
    if (!enemy.isShiny) return;
    playSfx("shiny");
    toast.success(`A SHINY ${enemy.pokemon.name} appeared!`, { duration: 3000 });
  }

  /** 3.1 -> the battle: platforms rise, both Pokémon come out, then the first question (by 2.9 s). */
  function enterField() {
    if (enteredRef.current) return;
    enteredRef.current = true;
    if (introTimerRef.current) clearTimeout(introTimerRef.current);
    setIntroStage("enter");
    setIntroBanner(`${enemy.name} sent out ${enemy.pokemon.name}!`);
    revealPokemon(enemy.pokemon.id);
    shinyCue();
    setTimeout(() => {
      setIntroBanner(`Go, ${player.name}!${superEff ? " Type advantage!" : ""}`);
      revealPokemon(player.id);
    }, 700);
    setTimeout(() => {
      setIntroBanner(null);
      setIntroStage(null);
      loadQuestion(0);
    }, 1700);
  }

  function loadQuestion(idx: number) {
    setChosen(null);
    setRevealedWrong(null);
    setRevealedWrong2(null);
    setRevealedCorrect(null);
    // Stealth Rock: 3 chip damage to the enemy at the start of every round.
    if (playerAbility.id === "stealth-rock" && idx > 0 && idx % QUESTIONS_PER_SET === 0) {
      const chippedHp = Math.max(0, enemyHp - 3);
      setEnemyHp(chippedHp);
      triggerAbilityToast(playerAbility);
      if (chippedHp <= 0) {
        setTimeout(() => finish(true), 600);
        return;
      }
    }
    const data = questions[idx];
    if (!data) {
      // Out of questions — decide based on remaining HP.
      // Player wins only if enemy HP is 0; otherwise the enemy outlasted them.
      const won = enemyHp <= 0;
      setTimeout(() => finish(won), 600);
      return;
    }
    setTrivia(data);
    setPhase("question");
    setTimer(TIMER_BASE + bonusTime);
    questionStart.current = Date.now();
    if (battleStartRef.current === null) battleStartRef.current = questionStart.current;
    // scope reveal
    if (scopeRevealedThisBattle) {
      const wrongs = [0, 1, 2, 3].filter((i) => i !== data.correct);
      setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
      consumeScope();
    }
  }

  // Assault Vest: auto-activate at battle start when the foe is super-effective against the partner
  useEffect(() => {
    if (disadvantaged && tryAutoAssaultVest()) {
      assaultVestActiveRef.current = true;
      toast.success("Assault Vest — damage halved this battle!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // King's Rock / Leftovers / Metronome: auto-activate at battle start (whole-battle effect, once per week)
  useEffect(() => {
    if (tryAutoKingsRock()) {
      kingsRockActiveRef.current = true;
      toast.success("King's Rock — chance to shrug off wrong answers this battle!");
    }
    if (tryAutoLeftovers()) {
      leftoversActiveRef.current = true;
      toast.success("Leftovers — healing after every correct answer this battle!");
    }
    if (tryAutoMetronome()) {
      metronomeActiveRef.current = true;
      toast.success("Metronome — streak multiplier locked at max this battle!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // server-first-refactor P3 — mirror this battle into battle-solo
  // (fire-and-forget; see soloBattleIdRef's declaration for why). Runs after
  // the auto-trigger effects above so their refs are already populated.
  // `silkScarfAvailable`/`focusBandAvailable`/`reviveAvailable`/
  // `oranBerryAvailable` mirror `tryAuto*`'s own preconditions (inventory,
  // per-item auto-toggle, Choice Specs exclusivity) without consuming
  // anything — those items' own in-battle trigger conditions (first correct
  // answer, HP thresholds) are what the engine itself decides, same as the
  // client. NOT enforced here: the client's global MAX_ITEMS_PER_BATTLE cap
  // across all items — a known, narrow gap, not silently assumed away.
  useEffect(() => {
    const store = useGameStore.getState();
    const canAutoItem = (id: ItemId) =>
      !store.choiceSpecsActive && (store.inventory[id] ?? 0) > 0 && store.autoItems[id] !== false;
    const cfg: SoloBattleCfg = {
      questions,
      playerPokemonId: player.id,
      playerTypes: player.types,
      abilityId: playerAbility.id,
      level,
      mode: isElite ? "elite" : isWeekly ? "weekly" : "battle",
      enemyPokemonId: enemy.pokemon.id,
      enemyTypes: enemy.pokemon.types,
      // LIFETIME TP (balance + spent), not the balance — the damage multiplier
      // reads lifetime earnings so evolving, which spends the balance, doesn't
      // knock the partner back to x1.00 (owner ruling 2026-08-17). The cfg
      // field keeps its name because it is persisted on solo_battles rows and
      // in-flight battles must still validate; what changed is the number the
      // client puts in it, and the server applies whatever it is given.
      trainingPoints: lifetimeTp(store.trainingPoints, store.trainingPointsSpent, player.id),
      items: {
        assaultVestActive: assaultVestActiveRef.current,
        kingsRockActive: kingsRockActiveRef.current,
        leftoversActive: leftoversActiveRef.current,
        metronomeActive: metronomeActiveRef.current,
        silkScarfAvailable: canAutoItem("silkscarf"),
        focusBandAvailable: canAutoItem("focusband"),
        reviveAvailable: canAutoItem("revive"),
        oranBerryAvailable: canAutoItem("oranberry"),
      },
    };
    startSoloBattle(cfg)
      .then(({ battleId }) => {
        soloBattleIdRef.current = battleId;
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // timer
  useEffect(() => {
    if (phase !== "question") return;
    if (confirmExit) return;
    if (timer <= 0) {
      handleAnswer(-1);
      return;
    }
    if (timer <= 5) playSfx(timer === 5 ? "timer_warning" : "timer_tick");
    const t = setTimeout(() => setTimer((x) => x - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timer, confirmExit]);

  // Quick Claw: auto-reset the timer to 20s when it drops below 5s (once per battle)
  useEffect(() => {
    if (phase === "question" && timer > 0 && timer < 5) {
      if (tryAutoQuickClaw()) {
        setTimer(20);
        toast.success("Quick Claw — timer reset to 20s!");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer, phase]);

  // Oak's hints (1.3 / 1.4)
  useEffect(() => {
    if (!tutorialActive) return;
    if (phase === "question") setOakHint(questionIdx === 0 ? "answers" : null);
    else if (oakHint === "answers") setOakHint(null);
    if (phase === "result") raiseFlag("tutorial_done");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionIdx, tutorialActive]);
  useEffect(() => {
    if (!tutorialActive || hpHintShownRef.current || playerHp >= playerMaxHp || phase === "intro") return;
    hpHintShownRef.current = true;
    setOakHint("hp");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerHp]);

  // Phase 2: ability onBattleStart effects (run once)
  useEffect(() => {
    // Fresh start: clear any status left in the store from a prior battle/remount
    // (preserves the old local-useState([]) semantics on rematch).
    clearAllBattleStatuses();
    if (playerAbility.id === "intimidate") {
      setEnemyHp(Math.floor(enemyMaxHp * 0.9));
    }
    if (playerAbility.id === "sand-veil") {
      useGameStore.setState((s) => ({ bonusTimeThisBattle: s.bonusTimeThisBattle + 2 }));
    }
    return () => {
      stopPoisonTick();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause/resume poison tick when battle is paused
  useEffect(() => {
    const paused = confirmExit || phase === "result";
    const poisoned = statuses.some((s) => s.kind === "poisoned");
    if (paused && poisonTimerRef.current) {
      stopPoisonTick();
    } else if (!paused && poisoned && !poisonTimerRef.current) {
      startPoisonTick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmExit, statuses, phase]);

  // Foresight: every 5th question reveal a wrong option
  useEffect(() => {
    if (phase !== "question" || !trivia) return;
    if (playerAbility.id !== "foresight") return;
    if ((questionIdx + 1) % 5 !== 0) return;
    const wrongs = trivia.options.map((_, i) => i).filter((i) => i !== trivia.correct);
    setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
    triggerAbilityToast(playerAbility);
  }, [phase, questionIdx, trivia, playerAbility]);

  // Compound Eyes: reveal a wrong option on first/last of each set
  useEffect(() => {
    if (phase !== "question" || !trivia) return;
    if (playerAbility.id !== "compound-eyes") return;
    const pos = questionIdx % QUESTIONS_PER_SET;
    if (pos !== 0 && pos !== QUESTIONS_PER_SET - 1) return;
    const wrongs = trivia.options.map((_, i) => i).filter((i) => i !== trivia.correct);
    setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
    triggerAbilityToast(playerAbility);
  }, [phase, questionIdx, trivia, playerAbility]);

  function handleAnswer(idx: number) {
    if (phase !== "question" || !trivia) return;
    answerHaptic(idx === trivia.correct);
    setChosen(idx);
    const correct = idx === trivia.correct;
    const elapsed = Date.now() - questionStart.current;
    setLastElapsedMs(elapsed);
    totalElapsedMsRef.current += elapsed;
    answeredCountRef.current += 1;

    // server-first-refactor P3 — fire-and-forget mirror (see soloBattleIdRef).
    if (soloBattleIdRef.current) {
      submitBattleAction(soloBattleIdRef.current, {
        type: "submit_answer",
        questionIdx,
        choiceIdx: idx,
        elapsedMs: elapsed,
      }).catch(() => {});
    }

    let newStreak = streak;
    if (correct) {
      correctCountRef.current += 1;
      wrongStreakRef.current = 0;

      // Confused miss: 25% chance to do nothing
      const isConfused = statuses.some((s) => s.kind === "confused");
      if (isConfused && Math.random() < 0.25) {
        toast.warning(`🌀 ${player.name} is confused — its attack missed!`);
        setShakeWho("player");
        setTimeout(() => setShakeWho(null), 500);
        tickStatusCure("confused");
        setStreak(0);
        lastStreakLabelRef.current = null;
        recordAnswer(true, elapsed, streak);
        playSfx("wrong");
        setPhase("feedback");
        setTimeout(nextQuestion, 1500);
        return;
      }

      newStreak += 1;
      if (newStreak > maxStreakRef.current) maxStreakRef.current = newStreak;

      // streak multiplier on the rank-scaled base damage. Bosses (elite /
      // weekly) keep the flat base — their HP-per-question budgets are already
      // balanced; scaling here would trivialize them at high rank.
      let baseDmg = isElite || isWeekly ? 10 : baseDamageForLevel(level);
      if (playerAbility.id === "dragon-dance") baseDmg += Math.floor(questionIdx / 5);
      let dmg = Math.round(
        baseDmg * (metronomeActiveRef.current ? 3.0 : streakMultiplier(newStreak)),
      );
      // TP damage boost, off LIFETIME TP so it survives evolving — must match
      // what went into the battle cfg above, or the optimistic client preview
      // and the server's replay disagree on damage.
      const tpState = useGameStore.getState();
      const tpNow = lifetimeTp(tpState.trainingPoints, tpState.trainingPointsSpent, player.id);
      const tpMult = getTpMultiplier(tpNow);
      if (tpMult > 1.0) dmg = Math.round(dmg * tpMult);
      // time bonus
      const elapsedSec = elapsed / 1000;
      const totalTime = TIMER_BASE + bonusTime;
      const speedRatio = Math.max(0, (totalTime - elapsedSec) / totalTime);
      let speedBonus = Math.round(5 * speedRatio);
      if (playerAbility.id === "aerilate") {
        speedBonus = Math.round(speedBonus * 1.5);
        if (speedBonus > 0) triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "swift-swim") speedBonus = Math.max(3, speedBonus);
      speedBonusTotalRef.current += speedBonus;
      dmg += speedBonus;

      // Per-question type effectiveness AFTER the streak/speed multiplier. Must
      // stay byte-identical to engine/turn.ts's `typeMatchup` fold (same inputs,
      // same Math.max(1, round)) or the engine-verification parity test fails.
      const matchup = typeMatchup(player.types, enemy.pokemon.types, questionIdx);
      if (matchup.multiplier !== 1) dmg = Math.max(1, Math.round(dmg * matchup.multiplier));
      if (xAttackActive) {
        dmg += 20;
        consumeXAttack();
      }
      // Silk Scarf: first correct answer this battle deals bonus damage (more for a Normal-type partner)
      if (tryAutoSilkScarf()) {
        dmg = Math.round(dmg * (player.types.includes("normal") ? 1.75 : 1.5));
        toast.success("Silk Scarf — bonus damage!");
      }
      // Tailwind: +20% dmg on first 3 questions
      if (playerAbility.id === "tailwind" && questionIdx < 3) {
        dmg = Math.round(dmg * 1.2);
        triggerAbilityToast(playerAbility);
      }
      // Guts: +15% dmg if below 50% HP
      if (playerAbility.id === "guts" && playerHp < playerMaxHp / 2) {
        dmg = Math.round(dmg * 1.15);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "flash-fire") dmg = Math.round(dmg * 1.08);
      if (playerAbility.id === "no-guard") dmg = Math.round(dmg * 1.18);
      if (playerAbility.id === "blaze" && playerHp < playerMaxHp * 0.4) {
        dmg = Math.round(dmg * 1.2);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "overgrow" && enemyHp > enemyMaxHp / 2) dmg = Math.round(dmg * 1.12);
      if (playerAbility.id === "bulldoze" && disadvantaged) {
        dmg = Math.round(dmg * 1.25);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "acrobatics" && playerHp === playerMaxHp)
        dmg = Math.round(dmg * 1.3);
      if (playerAbility.id === "berserk" && abilityStateRef.current.hadWrong)
        dmg = Math.round(dmg * 1.12);
      if (playerAbility.id === "hex" && statuses.length > 0) {
        dmg = Math.round(dmg * 1.3);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "dark-aura" && (isElite || isWeekly)) dmg = Math.round(dmg * 1.1);
      if (playerAbility.id === "even-tempo" && !superEff && !disadvantaged && !immune) dmg += 2;
      if (playerAbility.id === "charge") dmg += 2;
      if (playerAbility.id === "swarm" && newStreak >= 3) dmg += 3;
      if (playerAbility.id === "moonblast" && newStreak >= 3) dmg += 4;
      if (playerAbility.id === "volt-absorb" && elapsedSec <= 5) {
        dmg += 3;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "counter" && abilityStateRef.current.lastWasWrong) {
        dmg += 4;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "moxie") {
        dmg += abilityStateRef.current.moxieBonus;
        if (newStreak > 0 && newStreak % 3 === 0) {
          abilityStateRef.current.moxieBonus += 1;
          triggerAbilityToast(playerAbility);
        }
      }
      // Poison Touch: venom from the previous correct answer lands now.
      dmg += abilityStateRef.current.venom;
      abilityStateRef.current.venom = 0;
      abilityStateRef.current.lastWasWrong = false;

      const newEnemyHp = Math.max(0, enemyHp - dmg);
      if (dmg > topDmgRef.current) topDmgRef.current = dmg;
      setEnemyHp(newEnemyHp);
      setShakeWho("enemy");
      setFloatDmg({
        who: "enemy",
        n: dmg,
        super: matchup.band === "super",
        speedy: speedBonus >= 3,
        band: matchup.band,
        attackType: matchup.attackType,
        mult: matchup.multiplier,
      });
      setStreak(newStreak);
      recordAnswer(true, elapsed, newStreak);
      playSfx("correct");
      setTimeout(() => playSfx("damage"), 120);

      // Leftovers: heal 5 HP after every correct answer, for the whole battle
      if (leftoversActiveRef.current) {
        setPlayerHp((hp) => Math.min(playerMaxHp, hp + 5));
      }

      // Leech Seed: heal 2
      if (playerAbility.id === "leech-seed") {
        setPlayerHp((hp) => Math.min(playerMaxHp, hp + 2));
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "poison-touch") abilityStateRef.current.venom = 2;
      if (playerAbility.id === "ice-body" && correctCountRef.current % 4 === 0) {
        setPlayerHp((hp) => Math.min(playerMaxHp, hp + 6));
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "pixie-dust" && newStreak > 0 && newStreak % 3 === 0) {
        setPlayerHp((hp) => Math.min(playerMaxHp, hp + 5));
        triggerAbilityToast(playerAbility);
      }
      // Cursed Body: restore HP if pending within 5s
      if (playerAbility.id === "cursed-body" && abilityStateRef.current.cursedBodyPending) {
        const { hpBefore, appliedAt } = abilityStateRef.current.cursedBodyPending;
        if (Date.now() - appliedAt <= 5000) {
          setPlayerHp(hpBefore);
          triggerAbilityToast(playerAbility);
        }
        abilityStateRef.current.cursedBodyPending = null;
      }
      // Status cure ticks
      tickStatusCure("confused");
      tickStatusCure("poisoned");

      const lbl = streakLabel(newStreak);
      if (lbl && lbl !== lastStreakLabelRef.current) {
        lastStreakLabelRef.current = lbl;
        setStreakBanner(lbl);
        playSfx("streak");
        setTimeout(() => setStreakBanner(null), 1500);
      }

      setTimeout(() => setShakeWho(null), 500);
      setTimeout(() => setFloatDmg(null), 1000);

      if (newEnemyHp <= 0) {
        setTimeout(() => finish(true), 1400);
        setPhase("feedback");
        return;
      }
    } else {
      wrongStreakRef.current += 1;
      missedRef.current.push({
        question: trivia.question,
        correctAnswer: trivia.options[trivia.correct],
        explanation: trivia.explanation,
        correctIndex: trivia.correct,
        // 4.3 shows the answer you chose; a timeout or a confused miss of the right one has none.
        ...(idx >= 0 && idx !== trivia.correct ? { chosenAnswer: trivia.options[idx], chosenIndex: idx } : {}),
      });
      // Matchup-aware wrong-answer damage

      let wrongDmg = 10;
      // Byte-identical to engine/turn.ts's wrong-answer fold: the enemy's type
      // rolls into the player (roles swapped from the offensive hit above), so
      // a miss is scaled by the real matchup instead of the old flat 5/10/15.
      const wrongMatchup = typeMatchup(enemy.pokemon.types, player.types, questionIdx);
      if (wrongMatchup.multiplier !== 1) wrongDmg = Math.max(1, Math.round(wrongDmg * wrongMatchup.multiplier));
      if (playerAbility.id === "no-guard") wrongDmg += 2;
      if (assaultVestActiveRef.current) wrongDmg = Math.floor(wrongDmg / 2);
      // King's Rock: 50% chance to negate HP loss on any wrong answer, for the whole battle
      if (kingsRockActiveRef.current && Math.random() < 0.5) wrongDmg = 0;

      // Ability modifiers (in spec order)
      if (playerAbility.id === "multiscale" && playerHp === playerMaxHp) {
        wrongDmg = Math.floor(wrongDmg / 2);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "filter" && disadvantaged) {
        wrongDmg = Math.floor(wrongDmg * 0.75);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "slush-rush" && disadvantaged) {
        wrongDmg = Math.max(0, wrongDmg - 5);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "iron-barbs") {
        wrongDmg = Math.max(0, wrongDmg - 3);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "solid-rock" && wrongDmg > 12) {
        wrongDmg = 12;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "static" && Math.random() < 0.2) {
        wrongDmg = Math.floor(wrongDmg / 2);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "snow-cloak" && !abilityStateRef.current.iceFirstWrongConsumed) {
        wrongDmg = 0;
        abilityStateRef.current.iceFirstWrongConsumed = true;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "flame-body" && Math.random() < 0.15) {
        wrongDmg = 0;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "cute-charm" && Math.random() < 0.15) {
        wrongDmg = 0;
        triggerAbilityToast(playerAbility);
      }

      // Cursed Body: track HP before damage for potential heal-back
      if (playerAbility.id === "cursed-body") {
        abilityStateRef.current.cursedBodyPending = {
          hpBefore: playerHp,
          appliedAt: Date.now(),
        };
      }

      let newPlayerHp = Math.max(0, playerHp - wrongDmg);
      // Sturdy: revive at 1
      if (
        playerAbility.id === "sturdy" &&
        newPlayerHp <= 0 &&
        !abilityStateRef.current.sturdyUsed
      ) {
        newPlayerHp = 1;
        abilityStateRef.current.sturdyUsed = true;
        triggerAbilityToast(playerAbility);
      }

      // Revive: survive a knockout at 25% HP (once per battle, consumes an item)
      if (newPlayerHp <= 0 && tryAutoRevive()) {
        newPlayerHp = Math.round(playerMaxHp * 0.25);
        toast.success("Revive — survived at 25% HP!");
      }

      // Focus Band: auto-heal to 50% when HP is 10 or below (once per week)
      if (newPlayerHp <= 10 && tryAutoFocusBand()) {
        newPlayerHp = Math.round(playerMaxHp * 0.5);
        toast.success("Focus Band — restored to 50% HP!");
      }

      // Torrent: first drop below 30% HP heals 10 (once per battle)
      if (
        playerAbility.id === "torrent" &&
        !abilityStateRef.current.torrentUsed &&
        newPlayerHp > 0 &&
        newPlayerHp < playerMaxHp * 0.3
      ) {
        abilityStateRef.current.torrentUsed = true;
        newPlayerHp = Math.min(playerMaxHp, newPlayerHp + 10);
        triggerAbilityToast(playerAbility);
      }

      // Oran Berry: auto-heal 15 HP the instant HP first drops below 30% (once per battle)
      if (newPlayerHp > 0 && newPlayerHp < playerMaxHp * 0.3 && tryAutoOranBerry()) {
        newPlayerHp = Math.min(playerMaxHp, newPlayerHp + 15);
        toast.success("Oran Berry — healed 15 HP!");
      }

      setPlayerHp(newPlayerHp);
      setShakeWho("player");
      setFloatDmg({
        who: "player",
        n: wrongDmg,
        super: wrongMatchup.band === "super",
        speedy: false,
        band: wrongMatchup.band,
        attackType: wrongMatchup.attackType,
        mult: wrongMatchup.multiplier,
      });
      // Sand Force: the first two wrong answers keep the streak alive.
      const keepStreak =
        playerAbility.id === "sand-force" && abilityStateRef.current.sandForceUsed < 2;
      if (keepStreak) {
        abilityStateRef.current.sandForceUsed += 1;
        triggerAbilityToast(playerAbility);
      } else {
        setStreak(0);
        lastStreakLabelRef.current = null;
      }
      abilityStateRef.current.hadWrong = true;
      abilityStateRef.current.lastWasWrong = true;
      recordAnswer(false, elapsed, streak);
      playSfx("wrong");
      setTimeout(() => setShakeWho(null), 500);
      setTimeout(() => setFloatDmg(null), 1000);

      // Chip damage to the enemy (Corrosion / Shadow Tag / landed venom)
      let chip = abilityStateRef.current.venom;
      abilityStateRef.current.venom = 0;
      if (playerAbility.id === "corrosion") {
        chip += 2;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "shadow-tag" && wrongDmg > 0) {
        chip += 2;
        triggerAbilityToast(playerAbility);
      }
      if (chip > 0 && newPlayerHp > 0) {
        const chippedHp = Math.max(0, enemyHp - chip);
        setEnemyHp(chippedHp);
        if (chippedHp <= 0) {
          setTimeout(() => finish(true), 1400);
          setPhase("feedback");
          return;
        }
      }

      // Status thresholds (Amnesia delays both by one wrong answer)
      const confuseAt = playerAbility.id === "amnesia" ? 3 : 2;
      const poisonAt = playerAbility.id === "amnesia" ? 6 : 5;
      if (
        wrongStreakRef.current === confuseAt &&
        !statuses.some((s) => s.kind === "confused") &&
        playerAbility.id !== "shield-dust"
      ) {
        applyStatus("confused");
      }
      if (
        wrongStreakRef.current === poisonAt &&
        !statuses.some((s) => s.kind === "poisoned") &&
        playerAbility.id !== "toxic"
      ) {
        applyStatus("poisoned");
      }

      if (newPlayerHp <= 0) {
        setTimeout(() => finish(false), 1400);
        setPhase("feedback");
        return;
      }
    }

    setPhase("feedback");
    setTimeout(nextQuestion, 1800);
  }

  function nextQuestion() {
    // A battle can end (finish()) from a path other than the click that
    // scheduled this timeout — e.g. the poison-tick interval detecting a
    // KO independently. Without this guard, this stale callback fires after
    // finish() already ran, calls loadQuestion(), and sets phase back to
    // "question" — reviving an ended battle into a state no further click
    // can recover from (battleEndedRef then blocks any real finish() call).
    if (battleEndedRef.current) return;
    const next = questionIdx + 1;
    setQuestionIdx(next);
    if (next % QUESTIONS_PER_SET === 0) {
      completeSet();
    }
    loadQuestion(next);
  }

  function finish(won: boolean) {
    if (battleEndedRef.current) return;
    battleEndedRef.current = true;
    // Clear Phase 2 battle-scoped state
    stopPoisonTick();
    clearAllBattleStatuses();
    wrongStreakRef.current = 0;
    abilityStateRef.current.cursedBodyPending = null;

    const reward = battleReward({
      mode: isElite ? "elite" : isWeekly ? "weekly" : "regular",
      won,
      level,
      maxStreak: maxStreakRef.current,
    });
    let xpAward = reward.xp;
    let coinAward = reward.coins;
    let tpAward = reward.tp;

    // Exp. Charm / Amulet Coin / Lucky Punch / Star Piece / Choice Specs:
    // applied here before endBattle() resets these battle-ephemeral flags.
    const itemState = useGameStore.getState();
    if (itemState.expCharmActive) xpAward = Math.round(xpAward * 1.25);
    if (itemState.amuletCoinActive) coinAward *= 2;
    if (itemState.luckyPunchActive) {
      if (Math.random() < 0.5) {
        xpAward *= 2;
        coinAward *= 2;
        toast.success("Lucky Punch — doubled!");
      } else {
        xpAward = 0;
        coinAward = 0;
        toast.error("Lucky Punch — nothing this time!");
      }
    }
    if (itemState.starPieceActive && won) {
      xpAward = Math.round(xpAward * 1.5);
      coinAward = Math.round(coinAward * 1.5);
      toast.success("Star Piece — win rewards boosted!");
    }
    if (itemState.choiceSpecsActive) {
      xpAward *= 2;
      coinAward *= 2;
      tpAward *= 2;
      toast.success("Choice Specs — rewards doubled!");
    }
    // Big Nugget: while active, a fully evolved partner's TP rewards convert
    // straight to coins instead (a fully evolved Pokémon has no more use for TP).
    if (Date.now() < itemState.bigNuggetExpiresAt && !canEvolve(player) && tpAward > 0) {
      coinAward += tpAward;
      tpAward = 0;
      toast.success("Big Nugget — TP converted to coins!");
    }

    const adjustedCoins = playerAbility.id === "pickup" ? Math.round(coinAward * 1.25) : coinAward;
    setXpEarned(xpAward);
    setCoinsEarned(adjustedCoins);
    setTpEarned(tpAward);
    setResultWon(won);
    durationMsRef.current = battleStartRef.current ? Date.now() - battleStartRef.current : 0;
    if (tpAward > 0) useGameStore.getState().addTrainingPoints(player.id, tpAward);
    if (adjustedCoins > 0) useGameStore.getState().addCoins(adjustedCoins);

    // comeback flag — won at low HP
    if (won && playerHp <= 10) {
      raiseFlag("comeback");
    }

    // Pokédex capture on win
    if (won) {
      caughtRef.current = {
        id: enemy.pokemon.id,
        name: enemy.pokemon.name,
        isNew: !useGameStore.getState().pokedex[enemy.pokemon.id]?.caught,
        shiny: enemy.isShiny,
      };
      recordPokedexCapture(enemy.pokemon.id, enemy.isShiny);
      if (!isWeekly && !isElite) useGameStore.getState().consumeGuaranteedShiny();
      if (routeStopRef.current !== null) useGameStore.getState().recordRouteStopWin();
    }

    // Elite Four bookkeeping + premium item rewards
    if (won && isElite && eliteMember) {
      const nextDefeated = defeatedElites.includes(eliteMember.id)
        ? defeatedElites
        : [...defeatedElites, eliteMember.id];
      const regionDone = regionCompleted(eliteMember.region, nextDefeated);
      markEliteDefeated(eliteMember.id, eliteMember.region, regionDone);
      // Grant premium items by directly mutating inventory through buyItem? simplest: emit toast + use store action.
      const inv = useGameStore.getState().inventory;
      useGameStore.setState({
        inventory: {
          ...inv,
          candy: (inv.candy ?? 0) + 1,
          luckyegg: (inv.luckyegg ?? 0) + 1,
        },
      });
      // Both glyphs dropped, not just Lucky Egg's: one item keeping an emoji
      // while the other lost it reads as a bug in a single composed line.
      toast.success("Rare Candy +1 · Lucky Egg +1", { duration: 4000 });
      if (regionDone) {
        toast.success(`${eliteMember.region} Elite Four cleared!`, { duration: 4500 });
      }
    }

    // Weekly League: record result + prep share card
    let shareSet = false;
    if (isWeekly && gymLeader) {
      recordWeeklyLeagueResult(won);
      if (won) {
        setShareData({
          type: "weekly",
          trainerName,
          trainerSpriteUrl: trainerSpriteUrl(trainerSpriteId),
          partnerName: player.name,
          partnerPokemonId: player.id,
          partnerShiny: false,
          opponentName: gymLeader.name,
          opponentTitle: `Gym Leader · ${gymLeader.region}`,
          opponentSpriteUrl: trainerSpriteUrl(gymLeader.trainerSpriteId),
          signaturePokemonId: gymLeader.signaturePokemonId,
          finalPlayerHp: playerHp,
          maxPlayerHp: playerMaxHp,
          topStreak: maxStreakRef.current,
          topDamage: topDmgRef.current,
          dateISO: new Date().toISOString().slice(0, 10),
          badgeName: gymLeader.badge,
          correctCount: correctCountRef.current,
          totalQuestions: answeredCountRef.current,
          xpEarned: xpAward,
          avgTimeMs: answeredCountRef.current
            ? totalElapsedMsRef.current / answeredCountRef.current
            : undefined,
          level,
          rank: rankForLevel(level),
        });
        shareSet = true;
      }
    }

    // Ensure every victory has a share card (regular + elite fallback)
    if (won && !shareSet) {
      setShareData({
        type: isElite ? "elite" : "battle",
        trainerName,
        trainerSpriteUrl: trainerSpriteUrl(trainerSpriteId),
        partnerName: player.name,
        partnerPokemonId: player.id,
        partnerShiny: false,
        opponentName: enemy.name,
        opponentTitle: isElite ? "Elite Four" : "Trainer",
        opponentSpriteUrl: null,
        signaturePokemonId: enemy.pokemon.id,
        finalPlayerHp: playerHp,
        maxPlayerHp: playerMaxHp,
        topStreak: maxStreakRef.current,
        topDamage: topDmgRef.current,
        correctCount: correctCountRef.current,
        totalQuestions: answeredCountRef.current,
        xpEarned: xpAward,
        avgTimeMs: answeredCountRef.current
          ? totalElapsedMsRef.current / answeredCountRef.current
          : undefined,
        level,
        rank: rankForLevel(level),
        dateISO: new Date().toISOString().slice(0, 10),
      });
    }

    // snapshot achievements before/after
    const before = new Set(unlockedAchievements(useGameStore.getState()));
    const prevLevel = useGameStore.getState().level;
    endBattle(won, xpAward);
    const newLevel = useGameStore.getState().level;
    if (newLevel > prevLevel) {
      // Level-up rewards trigger on ANY level gained, win or lose — a small
      // XP gain from a loss can still cross a level threshold. The reward
      // grant happens immediately; the celebration screen is deferred until
      // the player returns to the battle hub (see LevelUpScreen / battle.tsx)
      // so it never interrupts a Rematch chain.
      const rewards = rollLevelUpRewards(prevLevel, newLevel);
      if (rewards) {
        useGameStore.getState().mergePendingLevelUp(rewards);
        if (rewards.coins > 0) useGameStore.getState().addCoins(rewards.coins);
        for (const it of rewards.items) useGameStore.getState().grantItem(it.id, it.qty);
        if (rewards.eggs > 0) useGameStore.getState().grantPokeEgg(rewards.eggs);
      }
    }
    pushBattleLog({
      opponent: `${enemy.name} (${enemy.pokemon.name})`,
      won,
      xpGained: xpAward,
      bestStreak: maxStreakRef.current,
      timestamp: Date.now(),
      mode: isElite ? "elite" : isWeekly ? "weekly" : "battle",
    });
    // Read the count back out rather than tracking one here: endBattle() above
    // is what increments it, so `1` is unambiguously this player's first.
    const battlesSoFar = useGameStore.getState().stats.battles;
    const battleMode = isElite ? "elite" : isWeekly ? "weekly" : "battle";
    track("battle_complete", { mode: battleMode, won, battles: battlesSoFar });
    if (battlesSoFar === 1) track("first_battle_complete", { mode: battleMode, won });
    const after = unlockedAchievements(useGameStore.getState());
    const unlocked: Array<{ name: string }> = [];
    for (const id of after) {
      if (!before.has(id)) {
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (a) {
          unlocked.push({ name: a.name });
          // The trophy is earned here but paid out in Profile > Trophies, so
          // the toast has to say where the reward is waiting.
          toast.success(a.name, {
            description: `${a.desc} Claim your reward in Profile.`,
            duration: 4000,
          });
        }
      }
    }
    newTrophiesRef.current = unlocked;

    playSfx(won ? "victory" : "defeat");
    playBattleResult(isElite ? "elite" : isWeekly ? "weekly" : "regular", won);
    if (won) {
      setTimeout(() => playSfx("cheer"), 450);
      setTimeout(() => playSfx("reward"), 950);
      if (xpAward > 0) setTimeout(() => playSfx("xp"), 1150);
      if (newTrophiesRef.current.length) setTimeout(() => playSfx("claim_reward"), 1500);
      // No "Victory! +N XP" toast: the victory screen's tiles say it (Figma 4.1,
      // one pop-up at a time).
    } else {
      setTimeout(() => playSfx("disappointed"), 450);
      toast.error(`Defeat — +${xpAward} XP`, { duration: 2500 });
    }
    setPhase("result");
  }

  function tryUseItem(id: ItemId) {
    const def = getItemDef(id);
    if (id === "escape" && (isWeekly || isElite)) {
      toast.error("Escape Rope can't be used in the Weekly League or Elite Four.");
      return;
    }
    if (itemCapReached) {
      toast.error(`Already used ${MAX_ITEMS_PER_BATTLE} items this battle — that's the max.`);
      return;
    }
    const ok = applyItem(id);
    if (!ok) {
      toast.error(`Cannot use ${def.name} right now.`);
      return;
    }
    toast.success(`Used ${def.name}!`);
    // server-first-refactor P3 — fire-and-forget mirror (see soloBattleIdRef).
    // escape maps to forfeit below instead, not a use_item action.
    if (soloBattleIdRef.current && id !== "escape") {
      submitBattleAction(soloBattleIdRef.current, { type: "use_item", itemId: id }).catch(() => {});
    }
    const healMult = playerAbility.id === "synthesis" ? 1.5 : 1;
    if (id === "potion") {
      setPlayerHp((hp) => Math.min(playerMaxHp, hp + Math.round(30 * healMult)));
      playItemCue();
    }
    if (id === "superpotion") {
      setPlayerHp((hp) => Math.min(playerMaxHp, hp + Math.round(60 * healMult)));
      playItemCue();
    }
    if (id === "maxpotion") {
      setPlayerHp(playerMaxHp);
      playItemCue();
    }
    if (id === "scope" && trivia) {
      const wrongs = [0, 1, 2, 3].filter((w) => w !== trivia.correct);
      setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
    }
    if (id === "zoomlens" && trivia) {
      const wrongs = [0, 1, 2, 3]
        .filter((w) => w !== trivia.correct)
        .sort(() => Math.random() - 0.5);
      setRevealedWrong(wrongs[0]);
      setRevealedWrong2(wrongs[1]);
    }
    if (id === "xaccuracy" && trivia) {
      setRevealedCorrect(trivia.correct);
    }
    if (id === "escape") {
      setBagOpen(false);
      if (soloBattleIdRef.current) {
        submitBattleAction(soloBattleIdRef.current, { type: "forfeit" }).catch(() => {});
      }
      abortBattle();
      setTimeout(() => onExit(), 300);
    }
    if (id === "repel") {
      setBagOpen(false);
      nextQuestion();
      return;
    }
    setBagOpen(false);
  }

  const catching = phase === "result" && !!resultWon && !!caughtRef.current && fxReady && catchStage !== "done";
  if (phase === "result" && !catching) {
    const stateNow = useGameStore.getState();
    const prog = xpProgressInLevel(stateNow.xp);
    const pct = Math.min(100, (prog.current / Math.max(1, prog.need)) * 100);
    return (
      <>
        {/* Test-observability hook only — not read by any production code. */}
        <div
          data-testid="battle-result"
          data-won={String(resultWon)}
          data-xp={xpEarned}
          data-tp={tpEarned}
          data-coins={coinsEarned}
          data-speed-bonus={speedBonusTotalRef.current}
          data-streak={maxStreakRef.current}
          hidden
        />
        <ResultScreen
          won={resultWon!}
          opponentName={enemy.name}
          correctCount={correctCountRef.current}
          // Questions the player actually FACED, not the size of the pool a
          // battle draws from. A battle ends when someone's HP runs out, which
          // is usually well before question 20, so "4/20 correct" read as a
          // much worse round than it was. `answeredCountRef` counts timeouts
          // too — handleAnswer(-1) is the timeout path — which is right: an
          // unanswered question was still put in front of them.
          totalQuestions={answeredCountRef.current}
          xpEarned={xpEarned}
          tpEarned={tpEarned}
          coinsEarned={coinsEarned}
          speedBonus={speedBonusTotalRef.current}
          partnerName={player.name}
          partnerId={player.id}
          streak={maxStreakRef.current}
          streakKept={maxStreakRef.current > 0}
          currentLevel={prog.level}
          xpIntoLevel={prog.current}
          xpForThisLevel={prog.need}
          levelProgressPct={pct}
          newTrophies={newTrophiesRef.current}
          // Only the Weekly League grants one, and only on a win — see
          // recordWeeklyLeagueResult, which is what actually adds it to
          // gymBadges. This just tells the player it happened.
          badgeEarned={
            isWeekly && resultWon && gymLeader
              ? { name: gymLeader.badge, iconUrl: gymLeader.badgeIconUrl, leader: gymLeader.name }
              : undefined
          }
          missed={missedRef.current}
          durationMs={durationMsRef.current}
          caught={caughtRef.current ?? undefined}
          onRebattle={() => onExit()}
          onBackHome={() => onExit()}
          onRematch={onRematch}
          // Weekly League is one attempt a week — there is no next battle to
          // start, and the button was only ever leaving the screen.
          hideRematch={isWeekly}
          canShare={!!shareData}
          onShare={() => setShareOpen(true)}
        />
        {shareData && (
          <ShareCardDialog open={shareOpen} onClose={() => setShareOpen(false)} data={shareData} />
        )}
      </>
    );
  }

  // ---- Figma 3.2 / 3.3 / 3.5: the battlefield, the HP cards, the combo and the question panel.
  const hour = new Date().getHours();
  const fieldMode = isWeekly ? "gym" : isElite ? "elite" : hour >= 18 || hour < 6 ? "evening" : "morning";
  const trainerLine = isWeekly && gymLeader ? `Gym Leader ${gymLeader.name}` : isElite && eliteMember ? `Elite Four ${eliteMember.name}` : enemy.name;
  if (floatDmg?.who === "enemy") lastHitRef.current = { n: floatDmg.n, type: floatDmg.attackType ?? player.types[0] };
  const dmgCaption = (d: NonNullable<typeof floatDmg>): { caption: string | null; tone: "gold" | "brand" | "glass" } =>
    d.band === "super"
      ? { caption: `Super effective${d.mult ? ` ×${d.mult}` : ""}`, tone: "gold" }
      : d.band === "resisted"
        ? { caption: "Not very effective", tone: "glass" }
        : d.band === "immune"
          ? { caption: "No effect", tone: "glass" }
          : d.speedy
            ? { caption: "Fast hit", tone: "brand" }
            : { caption: null, tone: "gold" };
  const answerStates: AnswerState[] = trivia
    ? trivia.options.map((_, i) => {
        if (phase === "feedback" || phase === "result") {
          if (i === trivia.correct) return chosen === trivia.correct ? "correct" : "reveal";
          return chosen === i ? "wrong" : "dimmed";
        }
        if (revealedWrong === i || revealedWrong2 === i) return "struck";
        if (phase === "question" && revealedCorrect === i) return "reveal";
        return "default";
      })
    : [];
  const ok = !!trivia && chosen === trivia.correct;
  const hit = lastHitRef.current;
  const feedbackSub = ok
    ? [hit ? `${MOVE_BY_TYPE[hit.type] ?? "Tackle"} · ${hit.n} damage` : null, streak >= 2 ? `${streak} in a row` : null].filter(Boolean).join(" · ") || "Nice one!"
    : trivia
      ? `It's ${trivia.options[trivia.correct]}.`
      : "";

  const trainerStage = introStage === "trainer";
  // 3.6: a short freeze, then the fainted Pokémon drops and fades (to where the catch picks it up).
  const enemyKo = enemyHp <= 0 && phase !== "intro";
  const playerKo = playerHp <= 0 && phase !== "intro";
  const koMove = { y: 14, opacity: 0.45, transition: { delay: 0.55, duration: 0.45 } };
  const throwing = catchStage === "throw" || catchStage === "caught";
  const narration =
    introBanner ?? (throwing ? null : enemyKo ? `${enemy.pokemon.name} fainted!` : playerKo ? `${player.name} fainted!` : null);
  const region = caughtRef.current ? GENERATIONS.find((g) => caughtRef.current!.id >= g.from && caughtRef.current!.id <= g.to) : null;
  const regionCaught = region
    ? Object.entries(useGameStore.getState().pokedex).filter(([id, e]) => +id >= region.from && +id <= region.to && e?.caught).length
    : 0;

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-night-deep">
      <NaBattleField
        mode={fieldMode}
        panelHeight={throwing || trainerStage ? 340 : panelH}
        padsIn={!trainerStage}
        night={trainerStage || throwing}
        stageRef={(el) => {
          fxEls.stage = el;
        }}
      >
        {trainerStage && <NaIntroTrainer art={introArt} leaving={false} gym={isWeekly} />}
        <FxCanvas ref={fxBack} />
        {!trainerStage && (
          <>
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={enemyKo ? koMove : { opacity: 1, transition: { duration: 0.12 } }}
            >
              <FieldSprite
                id={enemy.pokemon.id}
                shiny={enemy.isShiny}
                k={2}
                cx={286}
                feetY={215}
                spriteRef={(el) => {
                  fxEls.enemy = el;
                }}
                onReady={(img, trim) => fxSprite("enemy", img, trim)}
                className={`${shakeWho === "enemy" && !fxReady ? "animate-shake" : ""} ${enemy.isShiny ? "shiny-glow" : ""}`}
              >
                {enemy.isShiny && <NaIcon name="sparkle" size={16} className="pointer-events-none absolute -right-2 -top-2 z-20 animate-pulse text-yellow-300 drop-shadow" />}
              </FieldSprite>
            </motion.div>
            <motion.div
              className="absolute inset-0"
              initial={{ x: -160 }}
              animate={playerKo ? { ...koMove, x: 0 } : { x: 0, transition: { duration: 0.35, ease: "easeOut" } }}
            >
              <FieldSprite
                id={player.id}
                back
                k={3}
                cx={104}
                feetY={420}
                spriteRef={(el) => {
                  fxEls.player = el;
                }}
                onReady={(img, trim) => fxSprite("player", img, trim)}
                className={`${shakeWho === "player" && !fxReady ? "animate-shake" : ""} ${streak >= 5 && !throwing ? "mega-glow" : ""}`}
              >
                {!fxReady && <StatusEffectOverlay statuses={statuses} />}
              </FieldSprite>
            </motion.div>
          </>
        )}
        <FxCanvas ref={fxFront} />
        {!trainerStage && !throwing && (
        <>
        <NaHpCard
          side="enemy"
          trainer={trainerLine}
          name={enemy.pokemon.name}
          hp={enemyHp}
          maxHp={enemyMaxHp}
          types={enemy.pokemon.types}
          abilityName={enemyAbility.name}
          abilityDescription={enemyAbility.description}
          testId="enemy"
          style={{ left: 12, top: 56 }}
        />
        {streak >= 2 && (
          <NaCombo count={streak} multiplier={metronomeActiveRef.current ? 3 : streakMultiplier(streak)} style={{ left: 12, top: 206 }} />
        )}
        <NaHpCard
          side="player"
          name={player.name}
          hp={playerHp}
          maxHp={playerMaxHp}
          types={player.types}
          abilityName={playerAbility.name}
          abilityDescription={playerAbility.description}
          danger={disadvantaged && !immune}
          pulse={abilityPulse == null ? null : playerHp > abilityPulse ? `+${playerHp - abilityPulse} HP` : ""}
          testId="player"
          style={{ left: 178, top: 262 }}
        />
        {floatDmg && (
          <NaDamage
            key={`${floatDmg.who}-${floatDmg.n}-${questionIdx}`}
            value={`-${floatDmg.n}`}
            {...dmgCaption(floatDmg)}
            // 1.4 / 3.5: yours sits on your card's top edge, right-aligned 6 pt in from the card's edge
            style={floatDmg.who === "enemy" ? { left: 120, top: 34 } : { right: 18, bottom: 504 - 266 }}
          />
        )}
        </>
        )}
        {/* Narration (Figma "Narration", 16 / 392): "Picnicker Janine sent out Tirtouga!", "Tirtouga fainted!" */}
        <AnimatePresence>
          {narration && (
            <motion.div
              key={narration}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { delay: introBanner ? 0 : 0.7 } }}
              exit={{ y: -10, opacity: 0 }}
              className="pointer-events-none absolute left-4 top-[392px] z-30 flex w-[358px] items-center gap-2.5 rounded-[14px] border border-white/[0.12] bg-night-deep/75 px-3.5 py-2.5 backdrop-blur-xl"
            >
              <NaIcon name="play" size={14} className="shrink-0 text-reward-gold" />
              <span className="na-body-strong text-foreground">{narration}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </NaBattleField>

      {/* 3.5: a wrong answer flashes the screen edge red */}
      {floatDmg?.who === "player" && floatDmg.attackType && (
        <motion.div
          key={`edge-${questionIdx}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 rounded-[44px] border-8 border-danger"
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0, transition: { duration: 0.6, delay: 0.35 } }}
        />
      )}
      {trainerStage && (
        <button type="button" aria-label={isWeekly ? "Tap to start" : "Skip"} className="absolute inset-0 z-40" onClick={enterField}>
          <NaIntroText
            name={introName}
            round={1}
            rounds={Math.max(1, Math.ceil(questions.length / QUESTIONS_PER_SET))}
            leaving={false}
            gym={isWeekly && gymLeader ? { quote: gymLeader.quote, badge: gymLeader.badge, badgeUrl: gymLeader.badgeIconUrl } : undefined}
          />
        </button>
      )}
      {catching && catchStage === "caught" && caughtRef.current && (
        <motion.div className="absolute inset-0 z-40" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <NaCatchPanel
            name={caughtRef.current.name}
            isNew={caughtRef.current.isNew}
            region={region?.region ?? ""}
            caught={regionCaught}
            total={region ? region.to - region.from + 1 : 0}
            onContinue={() => setCatchStage("done")}
            wordmark={<NaWordmark kind="caught">GOTCHA!</NaWordmark>}
          />
        </motion.div>
      )}

      {phase !== "intro" && !throwing && trivia && (
        <NaQuestionPanel
          panelRef={panelRefCb}
          seconds={timer}
          maxSeconds={TIMER_BASE + bonusTime}
          category={trivia.category}
          progress={`Q${questionIdx + 1}`}
          question={trivia.question}
          options={trivia.options}
          states={answerStates}
          disabled={(i) => phase !== "question" || answerStates[i] === "struck"}
          onAnswer={handleAnswer}
          bag={
            <ItemBagSheet
              variant="icon"
              bagOpen={bagOpen}
              onBagOpenChange={setBagOpen}
              inventory={inventory}
              usedThisBattle={usedThisBattle}
              itemsUsedThisBattleCount={itemsUsedThisBattleCount}
              maxItemsPerBattle={MAX_ITEMS_PER_BATTLE}
              itemCapReached={itemCapReached}
              choiceSpecsActive={choiceSpecsActive}
              anyItemUsedThisBattle={anyItemUsedThisBattle}
              escapeDisabled={isWeekly || isElite}
              onUseItem={tryUseItem}
            />
          }
          banner={phase === "feedback" ? <NaFeedbackBanner ok={ok} title={ok ? "Correct!" : "Not quite"} sub={feedbackSub} /> : null}
        />
      )}

      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave battle?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress in this battle will be lost. You'll keep XP and trophies you've already
              earned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (soloBattleIdRef.current) {
                  submitBattleAction(soloBattleIdRef.current, { type: "forfeit" }).catch(() => {});
                }
                abortBattle();
                onExit();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {oakHint === "answers" && phase === "question" && (
        <NaCoachBubble
          pointer="down"
          width={290}
          text="Choose the correct answer to attack! Answer quickly to deal more damage!"
          style={{ left: 10, bottom: panelH - 22 }}
        />
      )}
      {oakHint === "hp" && phase !== "result" && (
        <NaCoachBubble pointer="up" text="Wrong answers cost you HP. Keep an eye on your bar." style={{ left: 71, top: 382 }} />
      )}
    </div>
  );
}
