import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Backpack } from "lucide-react";
import type { Trivia } from "@/lib/trivia-core";
import { playSfx } from "@/lib/audio";
import { useGameStore, type ActiveStatus, type PvpStatStages } from "@/lib/store";
import { PokemonSprite, TypeBadge, PokeballSpinner, ItemIcon } from "@/components/game-ui";
import { findPokemon, type PokeType } from "@/lib/pokemon-data";
import { ITEMS, STATUS_META, type ItemId, type StatusKind, type PvpStat } from "@/lib/game-data";
import { MAX_ITEMS_PER_BATTLE } from "@/lib/store/slices/itemsSlice";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CATEGORIES, CATEGORY_OF, BAG_SHORT_DESC } from "@/lib/item-categories";
import {
  computePvpDamage,
  timerMsForSpeedStage,
  PVP_BASE_TIMER_MS,
  PVP_MAX_HP,
  PVP_QUESTIONS,
} from "@/lib/pvp-combat";
import {
  submitPvpLiveAnswer,
  applyPvpLiveItem,
  applyPvpSignatureEffect,
  setLivePvpTransform,
  submitBotPvpMove,
  applyBotPvpSignatureEffect,
  applyBotPvpLiveItem,
  type LivePvpMatch,
} from "@/lib/pvp-live";
import {
  rollBotProfile,
  botAnswersCorrectly,
  botAnswerTimeMs,
  botShouldFireAbility,
  botShouldUseItem,
  type BotProfile,
} from "@/lib/pvp-bot";
import {
  signatureAbilityFor,
  signatureMoveName,
  evaluateHitModifiers,
  evaluatePostAnswer,
  evaluatePassiveDamageSideEffects,
  evaluateBattleStart,
  hasServerManualEffect,
  hasClientManualHit,
  manualHitModifiers,
  mergeHitModifiers,
  manualUsesPerBattle,
  resolveMewTransform,
  MEW_ID,
  NO_HIT_MODIFIERS,
  type SignatureContext,
} from "@/lib/signature-abilities";
import {
  nextWrathStacks,
  wrathDischarge,
  thunderclapFires,
  THUNDERCLAP_COOLDOWN,
} from "@/lib/signature-bespoke";
import { isWeatherStatSource, isMyWeatherActive } from "@/lib/pvp-weather";
import { TimerRing } from "@/components/battle-screen";

export interface LivePvpBattleResult {
  resolved: boolean;
  won: boolean | null;
  hp: number;
  oppHp: number;
}

interface Props {
  matchId: string;
  questions: Trivia[];
  startedAt: string;
  myId: string;
  hostId: string;
  match: LivePvpMatch;
  opponentName: string;
  onFinish: (result: LivePvpBattleResult) => void;
}

/** Non-battle items usable in Nearby Battle without a server round-trip
 * (pure client-side UI aids, exactly like Solo). */
const CLIENT_ONLY_ITEMS: ItemId[] = ["scope", "xaccuracy"];
/** Server-effect-backed items (see pvp_item_effects catalog): the healing
 * potion tier plus all berries. Everything else stays out of the Nearby
 * Battle bag in this pass — see the implementation report for scope notes. */
const SERVER_EFFECT_ITEMS: ItemId[] = ["potion", "superpotion", "maxpotion"];

/** Same grouped layout as Solo's bag/Shop, plus a Berries group since Nearby
 * Battle is the only mode that carries berries (deliberately excluded from
 * CATEGORIES so they never show up in Solo's bag/Shop). */
const PVP_BAG_GROUPS: Array<{ id: string; label: string }> = [
  ...CATEGORIES,
  { id: "BERRY", label: "Berries" },
];

function statBarLabel(stat: PvpStat): string {
  return { attack: "ATK", defense: "DEF", speed: "SPD", crit: "CRIT" }[stat];
}

function StatChips({ stages }: { stages: PvpStatStages }) {
  const entries = (Object.keys(stages) as PvpStat[])
    .map((k) => ({ stat: k, val: stages[k] }))
    .filter((e) => e.val !== 0);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map((e) => (
        <span
          key={e.stat}
          className={`rounded-full px-1.5 py-[1px] font-pixel-xs ${
            e.val > 0 ? "bg-hp-good/20 text-hp-good" : "bg-destructive/20 text-destructive"
          }`}
        >
          {statBarLabel(e.stat)} {e.val > 0 ? "▲" : "▼"}
          {Math.abs(e.val) > 1 ? Math.abs(e.val) : ""}
        </span>
      ))}
    </div>
  );
}

function StatusChips({ statuses }: { statuses: ActiveStatus[] }) {
  if (statuses.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {statuses.map((s) => (
        <span
          key={s.kind}
          className="rounded-full bg-purple-500/20 px-1.5 py-[1px] font-pixel-xs text-purple-700"
          title={STATUS_META[s.kind].label}
        >
          {STATUS_META[s.kind].emoji}
        </span>
      ))}
    </div>
  );
}

/** Solo-style CombatPanel adapted for Nearby Battle: same card frame, type
 * badges, and spring HP bar as `battle-screen.tsx`'s CombatPanel, but carrying
 * PvP's stat-stage and status chips instead of ability/immunity chips. */
function PvpCombatPanel({
  align,
  name,
  types,
  hp,
  stages,
  statuses,
}: {
  align: "left" | "right";
  name: string;
  types: PokeType[];
  hp: number;
  stages: PvpStatStages;
  statuses: ActiveStatus[];
}) {
  const pct = Math.max(0, Math.min(100, (hp / PVP_MAX_HP) * 100));
  const barColor = pct > 50 ? "bg-hp-good" : pct > 20 ? "bg-hp-warn" : "bg-hp-low";
  const alignCls = align === "right" ? "items-end text-right" : "items-start text-left";
  const justifyCls = align === "right" ? "justify-end" : "justify-start";
  const hasChips = (Object.values(stages) as number[]).some((v) => v !== 0) || statuses.length > 0;

  return (
    <div className="w-[clamp(8rem,38vw,10.5rem)] shrink-0 rounded-2xl bg-card px-3 py-2 backdrop-blur shadow-card">
      <div className={`flex flex-col ${alignCls}`}>
        <div className="w-full truncate text-sm font-bold leading-tight">{name}</div>
        {types.length > 0 && (
          <div className={`mt-1 flex w-full gap-1 ${justifyCls}`}>
            {types.map((t) => (
              <TypeBadge key={t} type={t} size="sm" />
            ))}
          </div>
        )}
        <div className="mt-1.5 flex w-full items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-poke-dark/15">
            <motion.div
              className={`h-full ${barColor}`}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 18 }}
            />
          </div>
          <span className="text-[11px] font-bold tabular-nums text-foreground">
            {Math.max(0, Math.round(hp))}
          </span>
        </div>
        {hasChips && (
          <div className={`mt-1 flex w-full flex-wrap gap-0.5 ${justifyCls}`}>
            <StatChips stages={stages} />
            <StatusChips statuses={statuses} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Sprite over a soft radial "shadow" ellipse, mirroring Solo's arena. Falls
 * back to a Poké Ball when the side's partner dex id is unknown (a non-signature
 * partner, or an opponent whose species the match row doesn't expose). */
function ArenaSprite({
  id,
  back,
  shake,
  floatN,
}: {
  id: number | null;
  back: boolean;
  shake: boolean;
  floatN: number | null;
}) {
  return (
    <div className="relative shrink-0">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-3 left-1/2 h-8 w-28 -translate-x-1/2 rounded-[50%]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, oklch(0.88 0.16 145) 0%, oklch(0.72 0.18 145) 55%, oklch(0.55 0.16 150) 100%)",
          boxShadow: "0 8px 14px -6px oklch(0.3 0.1 150 / 0.35), inset 0 1px 0 oklch(1 0 0 / 0.35)",
        }}
      />
      <motion.div
        className={`relative ${shake ? "animate-shake" : ""}`}
        initial={{ x: back ? -60 : 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
      >
        {id != null ? (
          <PokemonSprite
            id={id}
            back={back}
            alt={back ? "Your Pokémon" : "Opponent's Pokémon"}
            className="sprite relative z-10 h-32 w-32"
          />
        ) : (
          <div className="relative z-10 flex h-32 w-32 items-center justify-center">
            <PokeballSpinner size={72} />
          </div>
        )}
        {floatN != null && (
          <div className="animate-float-up pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2 font-pixel text-base text-destructive">
            -{floatN}
          </div>
        )}
      </motion.div>
    </div>
  );
}

/**
 * Turn-based HP-endurance battle for Nearby Battle. Both trainers answer the
 * same shared, wall-clock-synced question set (base 20s slot, same lockstep
 * anchor as the old independent-scoring runner). Speed stat stages
 * shorten/lengthen each player's OWN effective answer window (±10%/stage,
 * matching Attack/Defense) but never extend answering past the shared slot
 * boundary — Speed instead changes when *your* personal countdown reaches
 * zero, and feeds the speedRatio used for damage/crit. Correct answers deal
 * HP damage to the live opponent (same pvp-combat.ts formula run on both
 * clients); wrong answers cost flat self damage. Sudden-KO ends the match
 * early; otherwise it resolves via the server's HP → accuracy → avg-time
 * tiebreak after 20 questions.
 */
export function LivePvpBattleScreen({
  matchId,
  questions,
  startedAt,
  myId,
  hostId,
  match,
  opponentName,
  onFinish,
}: Props) {
  const amIHost = myId === hostId;
  const myStages = useGameStore((s) => s.myStages);
  const oppStages = useGameStore((s) => s.oppStages);
  const myStatuses = useGameStore((s) => s.battleStatuses);
  const oppStatuses = useGameStore((s) => s.opponentStatuses);
  const inventory = useGameStore((s) => s.inventory);
  const tickBattleStatusCure = useGameStore((s) => s.tickBattleStatusCure);

  // Legendary/Mythical partner signature ability (null for non-legendary
  // partners — they get nothing extra, exactly as before).
  const rawPartnerId = useGameStore((s) => s.pokemon?.id ?? null);
  const myPokemon = useGameStore((s) => s.pokemon);
  const pokedexCount = useGameStore((s) => Object.keys(s.pokedex).length);

  // Phase 2 — Mew's Transform (dex 151): at battle start, once the OPPONENT's
  // partner dex id is known (Phase 1 columns), Mew copies their ability and runs
  // it as its own for the whole battle. Resolved exactly once and locked in a
  // ref so it never re-rolls. For every non-Mew partner this is a no-op and
  // `effectivePartnerId === rawPartnerId`.
  const opponentPartnerId = amIHost ? match.guestPartnerId : match.hostPartnerId;
  // Phase 4 — my signature ability is suppressed while my current question index
  // is below the lift index the opponent's Heatran/Zygarde/Regieleki/Pecharunt
  // set on me. Server enforces this too; the client mirrors it to skip auto
  // evaluation, disable the Fire button, and show a distinct locked toast.
  const mySuppressedUntil = amIHost ? match.hostSuppressedUntil : match.guestSuppressedUntil;
  const suppressToastedForRef = useRef(-1);
  const weatherNegatedToastedRef = useRef(false);
  const transformResolvedRef = useRef(false);
  const [transformTargetId, setTransformTargetId] = useState<number | null>(null);

  // The dex id Mew actually runs as (itself until Transform resolves).
  const partnerId = rawPartnerId === MEW_ID && transformTargetId != null ? transformTargetId : rawPartnerId;
  const ability = useMemo(() => signatureAbilityFor(partnerId), [partnerId]);

  const startedAtMs = useRef(new Date(startedAt).getTime()).current;
  const [now, setNow] = useState(() => Date.now());
  const [displayedIndex, setDisplayedIndex] = useState(-1);
  const [selected, setSelected] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [myHp, setMyHp] = useState(amIHost ? match.hostHp : match.guestHp);
  const [oppHp, setOppHp] = useState(amIHost ? match.guestHp : match.hostHp);
  const [bagOpen, setBagOpen] = useState(false);
  const [frozen, setFrozen] = useState(false);
  // Purely-visual arena feedback (mirrors Solo): a shake + floating "-N" damage
  // number on whichever side's HP just dropped. Driven off HP deltas so every
  // path that lowers HP (own answer, opponent/bot row sync, ability, item)
  // triggers it without touching any game logic.
  const [shakeWho, setShakeWho] = useState<"player" | "opponent" | null>(null);
  const [floatDmg, setFloatDmg] = useState<{ who: "player" | "opponent"; n: number } | null>(null);
  const prevMyHpRef = useRef(myHp);
  const prevOppHpRef = useRef(oppHp);
  // Manual "charge and fire" signature abilities: a generic charge indicator +
  // Fire button (reusing the bag's visual language) for Legendary/Mythical
  // partners whose signature move is player-fired and decomposes to a
  // server-catalog effect (Aeroblast, Roar of Time, Ruination burst, etc.). The
  // server enforces the per-battle use cap; this local counter only drives the
  // button's enabled/label state.
  const [manualFiresUsed, setManualFiresUsed] = useState(0);
  const [manualFiring, setManualFiring] = useState(false);
  const manualCap = manualUsesPerBattle(ability);
  // A manual ability is fireable if it either routes a server-catalog effect
  // (Aeroblast, Mist Ball, …) OR arms a client-side one-hit damage modifier
  // (Psystrike, Dragon Ascent, Giratina's Shadow Force — no server round trip;
  // damage is client-computed and server-clamped like any passive_damage hit).
  const isClientHitManual = !!ability && hasClientManualHit(ability);
  const manualFireable =
    !!ability && manualCap > 0 && (hasServerManualEffect(ability) || isClientHitManual);
  // Client-armed one-hit modifiers waiting to be folded into the NEXT correct
  // answer (set when the player Fires a client-hit manual move; consumed on the
  // next correct answer). Kept in a ref so it survives re-renders.
  const armedHitRef = useRef<ReturnType<typeof manualHitModifiers> | null>(null);
  const [armedHit, setArmedHit] = useState(false);
  // Chien-Pao — Sword of Ruin (1002): after firing (-2 opp Def via the server
  // manual row), the next 2 correct answers also ignore the opponent's remaining
  // Defense stage. Tracked as a small client-side charge window (client-computed,
  // server-clamped damage, like the armed one-hit manual moves); not persisted
  // across a reconnect.
  const swordOfRuinChargesRef = useRef(0);

  const finishedRef = useRef(false);
  const itemsUsedRef = useRef(amIHost ? match.hostItemsUsed : match.guestItemsUsed);
  const questionStartRef = useRef(0);

  // Training-vs-Bot: the human is always the host and drives the bot (guest)
  // locally. The bot's skill profile is rolled once per match; its per-question
  // move + optional ability/item are submitted through the bot RPCs. The human's
  // own play path (above/below) is completely untouched.
  const botProfileRef = useRef<BotProfile | null>(null);
  const botStreakRef = useRef(0);
  const botLastIdxRef = useRef(-1);
  const botBattleStartRef = useRef(false);

  // Signature-ability bookkeeping (drives the pure evaluators in
  // signature-abilities.ts). Kept in refs so they survive re-renders without
  // re-triggering effects.
  const prevCorrectRef = useRef(false);
  const prevElapsedRef = useRef(Number.MAX_SAFE_INTEGER);
  const correctCountRef = useRef(0);
  const answeredCategoriesRef = useRef<Set<string>>(new Set());
  const battleStartFiredRef = useRef(false);
  // Phase 1 — Moltres's Fiery Wrath (dex 146): Wrath stacks (0..3) live in the
  // authoritative match row (`*_sig_state`, keyed by dex id) so they survive a
  // reconnect and are server-clamped. This ref mirrors them locally; it's
  // hydrated from the synced row on mount and kept in step with every write.
  const wrathStacksRef = useRef(0);
  const wrathHydratedRef = useRef(false);
  // Phase 2 — Raging Bolt's Thunderclap (dex 1021): reactive to the opponent
  // answering correctly, derived from their *_correct_live counter advancing.
  const oppCorrectPrevRef = useRef<number | null>(null);
  const thunderclapLastFiredRef = useRef(-THUNDERCLAP_COOLDOWN);
  // Ho-Oh (250) Rainbow Rebirth: one-time toast when the server revives us from
  // a would-be self-KO (server is authoritative; this is display-only).
  const rainbowRebirthToastedRef = useRef(false);

  // Fold a server ability-effect result (stat stages / statuses / HP) back into
  // local state. Shared by the generic post_answer path and the Phase 1/2
  // bespoke handlers (Moltres discharge, Raging Bolt reactive).
  function applyAbilityResult(res: Awaited<ReturnType<typeof applyPvpSignatureEffect>>): void {
    if (!res.ok || res.noop) return;
    if (res.hostStages) {
      useGameStore.setState({
        myStages: amIHost ? res.hostStages : res.guestStages!,
        oppStages: amIHost ? res.guestStages! : res.hostStages,
        battleStatuses: amIHost ? res.hostStatuses! : res.guestStatuses!,
        opponentStatuses: amIHost ? res.guestStatuses! : res.hostStatuses!,
      });
    }
    if (typeof res.hostHp === "number") {
      setMyHp(amIHost ? res.hostHp : res.guestHp!);
      setOppHp(amIHost ? res.guestHp! : res.hostHp);
    }
  }

  // Phase 2 — resolve Mew's Transform once the opponent's identity is known.
  useEffect(() => {
    if (rawPartnerId !== MEW_ID || transformResolvedRef.current) return;
    // Wait until we actually know the opponent's partner id (the guest registers
    // it on mount). A `null` that persists past the first battle question is a
    // settled non-legendary opponent, which resolveMewTransform reads as "no
    // ability → random roster ability".
    if (opponentPartnerId == null && displayedIndex < 0) return;
    transformResolvedRef.current = true;
    const target = resolveMewTransform(opponentPartnerId);
    // Persist the resolved target server-side (write-once) BEFORE flipping the
    // effective partner id, so the server has its authoritative copy of the one
    // ability Mew is allowed to invoke before any ability call fires (the server
    // rejects Mew's effects until the transform id is registered). Best-effort:
    // we flip the local id regardless so passive/damage-calc play never stalls
    // on a transient network error — the server stays the authority for effects.
    const finishTransform = () => {
      setTransformTargetId(target);
      const move = signatureMoveName(target);
      if (move) toast.success(`✨ Transform — Mew copies ${move}!`);
    };
    if (target != null) {
      void setLivePvpTransform(matchId, target).then(finishTransform, finishTransform);
    } else {
      finishTransform();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPartnerId, opponentPartnerId, displayedIndex]);

  // Apply the partner's battle-start standing buff exactly once (server guards
  // against a double-apply via host/guest_ability_started too).
  useEffect(() => {
    if (battleStartFiredRef.current || !ability || ability.wiring !== "battle_start") return;
    if (evaluateBattleStart(ability, pokedexCount).length === 0) return;
    battleStartFiredRef.current = true;
    void applyPvpSignatureEffect(matchId, 0, partnerId as number, "battle_start", pokedexCount).then(
      (res) => {
        if (res.ok && !res.noop) {
          const move = signatureMoveName(partnerId);
          if (move) toast.success(`✨ ${move} — ${partnerId ? "your partner powers up!" : ""}`.trim());
        }
      },
    );
  }, [ability, matchId, partnerId, pokedexCount]);

  // Phase 1 — hydrate Moltres's Wrath stacks from the authoritative row once,
  // as soon as the partner is known to be Moltres (dex 146; possibly via Mew's
  // Transform). Covers a mid-battle reconnect; a fresh battle reads 0.
  useEffect(() => {
    if (wrathHydratedRef.current || partnerId !== 146) return;
    wrathHydratedRef.current = true;
    const sig = amIHost ? match.hostSigState : match.guestSigState;
    wrathStacksRef.current = Math.max(0, Math.min(3, sig?.["146"] ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  // Phase 2 — Raging Bolt's Thunderclap: watch the opponent's live correct-answer
  // counter. When it advances (they answered correctly) and my per-4-question
  // cooldown allows, pre-empt: +1 my Attack / -1 their Attack via the same
  // server-validated RPC as every other ability (magnitude fixed server-side).
  const oppCorrectLive = amIHost ? match.guestCorrectLive : match.hostCorrectLive;
  useEffect(() => {
    const prev = oppCorrectPrevRef.current;
    oppCorrectPrevRef.current = oppCorrectLive;
    if (prev === null || partnerId !== 1021 || finishedRef.current) return;
    const myIdx = Math.max(0, displayedIndex);
    if (myIdx < mySuppressedUntil) return; // ability locked (Phase 4)
    if (!thunderclapFires(prev, oppCorrectLive, myIdx, thunderclapLastFiredRef.current)) return;
    thunderclapLastFiredRef.current = myIdx;
    void applyPvpSignatureEffect(matchId, myIdx, 1021, "post_answer").then((res) => {
      if (res.ok && !res.noop) {
        applyAbilityResult(res);
        const move = signatureMoveName(partnerId);
        if (move) toast.success(`✨ ${move} — you pre-empt the opponent!`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppCorrectLive]);

  // Keep local HP/items mirrors in sync with the authoritative row (updates
  // arrive via the parent route's postgres_changes subscription on `match`).
  useEffect(() => {
    setMyHp(amIHost ? match.hostHp : match.guestHp);
    setOppHp(amIHost ? match.guestHp : match.hostHp);
    itemsUsedRef.current = amIHost ? match.hostItemsUsed : match.guestItemsUsed;
  }, [match, amIHost]);

  useEffect(() => {
    const prev = prevMyHpRef.current;
    prevMyHpRef.current = myHp;
    if (myHp >= prev) return;
    setShakeWho("player");
    setFloatDmg({ who: "player", n: Math.round(prev - myHp) });
    const t1 = setTimeout(() => setShakeWho((w) => (w === "player" ? null : w)), 500);
    const t2 = setTimeout(() => setFloatDmg((d) => (d?.who === "player" ? null : d)), 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [myHp]);

  useEffect(() => {
    const prev = prevOppHpRef.current;
    prevOppHpRef.current = oppHp;
    if (oppHp >= prev) return;
    setShakeWho("opponent");
    setFloatDmg({ who: "opponent", n: Math.round(prev - oppHp) });
    const t1 = setTimeout(() => setShakeWho((w) => (w === "opponent" ? null : w)), 500);
    const t2 = setTimeout(() => setFloatDmg((d) => (d?.who === "opponent" ? null : d)), 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [oppHp]);

  // Ho-Oh (250) Rainbow Rebirth — opponent-inflicted revive toast. When the
  // OPPONENT's correct answer would have KO'd us but the server revived us, our
  // own *_revived flag flips true on the realtime-synced row (the server writes
  // no pvp_live_effects row for this path, so we read it off the match state).
  // The self-KO path already toasts from the submit response; the shared
  // rainbowRebirthToastedRef dedups so a given revive toasts at most once.
  const myRevived = amIHost ? match.hostRevived : match.guestRevived;
  useEffect(() => {
    if (partnerId !== 250 || !myRevived || rainbowRebirthToastedRef.current) return;
    rainbowRebirthToastedRef.current = true;
    toast.success("🌈 Ho-Oh's Rainbow Rebirth — you rise from the ashes!");
  }, [myRevived, partnerId]);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(iv);
  }, []);

  const QUESTION_SLOT_MS = PVP_BASE_TIMER_MS;
  const elapsed = now - startedAtMs;
  const idx = elapsed < 0 ? -1 : Math.floor(elapsed / QUESTION_SLOT_MS);

  const mySpeedTimerMs = useMemo(
    () => timerMsForSpeedStage(myStages.speed, PVP_BASE_TIMER_MS),
    [myStages.speed],
  );
  // Paralysis shortens the personal window a further 25%, mirroring solo's
  // "Speed cut" translation; never below 4s so a question is always answerable.
  const isParalyzed = myStatuses.some((s) => s.kind === "paralysis");
  const personalTimerMs = Math.max(
    4000,
    Math.min(QUESTION_SLOT_MS, isParalyzed ? Math.round(mySpeedTimerMs * 0.75) : mySpeedTimerMs),
  );
  const isAsleep = myStatuses.some((s) => s.kind === "sleep");
  const sleepLockMs = isAsleep ? personalTimerMs * 0.4 : 0;

  useEffect(() => {
    if (idx === displayedIndex || finishedRef.current) return;
    if (idx >= PVP_QUESTIONS || idx >= questions.length) {
      // Ran out of shared question slots without the server having already
      // resolved us (e.g. a near-simultaneous KO edge case) — the route will
      // pick up the resolution from the row update; just stop advancing.
      return;
    }
    setDisplayedIndex(idx);
    setSelected(null);
    setFrozen(false);
    questionStartRef.current = Date.now();

    // Freeze: skip this question outright, ~30% auto-thaw chance/question,
    // guaranteed thaw after 2 questions.
    const freezeStatus = myStatuses.find((s) => s.kind === "freeze");
    if (freezeStatus) {
      const thaws = freezeStatus.curesRemaining <= 1 || Math.random() < 0.3;
      setFrozen(true);
      if (thaws) tickBattleStatusCure("freeze");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  function buildSigContext(
    idxAtAnswer: number,
    correct: boolean,
    streakAfter: number,
    elapsedMs: number,
    totalMs: number,
    category: string,
  ): SignatureContext {
    return {
      questionIndex: idxAtAnswer,
      correct,
      prevCorrect: prevCorrectRef.current,
      streak: streakAfter,
      streakBefore: streak,
      correctCount: correctCountRef.current,
      answerElapsedMs: elapsedMs,
      prevAnswerElapsedMs: prevElapsedRef.current,
      personalTimerMs: totalMs,
      selfHpPct: myHp / PVP_MAX_HP,
      oppHpPct: oppHp / PVP_MAX_HP,
      newCategory: !answeredCategoriesRef.current.has(category),
      questionCategory: category,
      pokedexCount,
      oppDefenseStage: oppStages.defense,
    };
  }

  async function resolveQuestion(idxAtAnswer: number, correct: boolean, elapsedMs: number) {
    if (finishedRef.current) return;
    let dmg = 0;
    let selfDmg = 0;

    if (frozen) {
      // Freeze auto-forfeits the question: no damage either way, streak resets.
      setStreak(0);
    } else if (correct) {
      const isConfused = myStatuses.some((s) => s.kind === "confused");
      const missedFromConfusion = isConfused && Math.random() < 0.25;
      if (missedFromConfusion) {
        toast.warning("🌀 Confused — your attack missed!");
        tickBattleStatusCure("confused");
        setStreak(0);
      } else {
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        correctCountRef.current += 1;
        const totalMs = personalTimerMs;
        const speedRatio = Math.max(0, (totalMs - elapsedMs) / totalMs);
        const firstHalf = elapsedMs <= totalMs / 2;
        const burned = myStatuses.some((s) => s.kind === "burn");
        const category = questions[idxAtAnswer]?.category ?? "";

        // Fold the partner's passive_damage signature modifiers into THIS hit
        // (ignore-defense / bonus Attack / bonus Crit / double-strike). Damage
        // is client-computed and server-clamped, so this needs no round trip.
        const suppressed = idxAtAnswer < mySuppressedUntil;
        const sigCtx = buildSigContext(idxAtAnswer, true, nextStreak, elapsedMs, totalMs, category);
        // Phase 4: while suppressed, the partner's passive/armed signature
        // modifiers don't apply (the ability is locked).
        let mods = suppressed ? NO_HIT_MODIFIERS : evaluateHitModifiers(ability, sigCtx);
        // Fold in any armed client-side manual one-hit modifier (Psystrike /
        // Dragon Ascent / Shadow Force), then disarm — it applies to this one
        // correct answer only.
        if (!suppressed && armedHitRef.current) {
          mods = mergeHitModifiers(mods, armedHitRef.current);
          armedHitRef.current = null;
          setArmedHit(false);
        }
        // Chien-Pao — Sword of Ruin (1002): the 2-charge ignore-Defense window
        // armed when Sword of Ruin was manually fired. Consumes one charge per
        // correct hit while suppressed doesn't block it (the -2 Def already
        // landed via the server manual row; this window is a pure client-side
        // damage-calc fold, same trust model as the armed one-hit moves).
        if (swordOfRuinChargesRef.current > 0) {
          mods = mergeHitModifiers(mods, { ...NO_HIT_MODIFIERS, ignoreOppDefenseStage: true });
          swordOfRuinChargesRef.current -= 1;
        }
        // Phase 1 — Moltres's Fiery Wrath discharge: a correct answer consumes
        // all Wrath stacks for +1 Attack/stack on THIS hit, resets the stack
        // (server-persisted), and rolls a 30%/stack Sleep on the opponent
        // through the same server-validated catalog path as any other status.
        if (!suppressed && partnerId === 146 && wrathStacksRef.current > 0) {
          const discharge = wrathDischarge(wrathStacksRef.current);
          mods = mergeHitModifiers(mods, {
            ...NO_HIT_MODIFIERS,
            bonusAttackStage: discharge.bonusAttackStage,
          });
          wrathStacksRef.current = 0;
          void applyPvpSignatureEffect(matchId, idxAtAnswer, 146, "sig_state", 0);
          const move = signatureMoveName(146);
          if (move) toast.success(`✨ ${move} — Wrath unleashed!`);
          if (Math.random() < discharge.sleepChance) {
            void applyPvpSignatureEffect(matchId, idxAtAnswer, 146, "post_answer").then(
              applyAbilityResult,
            );
          }
        }
        // Fix #3 — passive_damage abilities that ALSO bundle a stat_stage/status
        // sub-effect (Raikou 243's +1 Speed, Deoxys 386 / Magearna 801's -1 Atk
        // recoil, Zekrom 643's 40% Burn, Melmetal 809's 30% Sleep): the damage
        // fold above only ever applies the damage_calc slice, so route the
        // bundled non-damage-calc slice through the SAME server-validated
        // post_answer RPC on this same hit (any chance roll already happened
        // inside evaluatePassiveDamageSideEffects).
        if (!suppressed) {
          const sideEffects = evaluatePassiveDamageSideEffects(ability, sigCtx);
          if (sideEffects.length > 0) {
            void applyPvpSignatureEffect(matchId, idxAtAnswer, partnerId as number, "post_answer").then(
              applyAbilityResult,
            );
          }
        }
        const baseAttack = mods.ignoreOwnNegativeStages
          ? Math.max(0, myStages.attack)
          : myStages.attack;
        const baseCrit = mods.ignoreOwnNegativeStages ? Math.max(0, myStages.crit) : myStages.crit;
        const { dmg: computed } = computePvpDamage({
          streak: nextStreak,
          speedRatio,
          attackStage: baseAttack + mods.bonusAttackStage,
          defenseStage: mods.ignoreOppDefenseStage ? 0 : oppStages.defense,
          critStage: baseCrit + mods.bonusCritStage,
          firstHalf,
          burned,
        });
        dmg = computed + (mods.secondHitFraction ? Math.round(computed * mods.secondHitFraction) : 0);
        answeredCategoriesRef.current.add(category);
        playSfx("correct");
      }
    } else {
      setStreak(0);
      selfDmg = 8; // flat wrong-answer chip, mirroring solo's flat-loss model
      playSfx("wrong");
      // Phase 1 — Moltres's Fiery Wrath builds a Wrath stack on each wrong
      // answer (capped at 3), unless the ability is currently suppressed. The
      // new count is persisted to the authoritative row (server-clamped).
      if (partnerId === 146 && idxAtAnswer >= mySuppressedUntil) {
        const next = nextWrathStacks(wrathStacksRef.current, false);
        if (next !== wrathStacksRef.current) {
          wrathStacksRef.current = next;
          void applyPvpSignatureEffect(matchId, idxAtAnswer, 146, "sig_state", next);
        }
      }
    }

    // Status cure ticks (mirrors solo: every answer ticks confusion/poison etc.)
    tickBattleStatusCure("poisoned");
    tickBattleStatusCure("badly-poisoned");
    tickBattleStatusCure("burn");
    tickBattleStatusCure("paralysis");
    tickBattleStatusCure("sleep");

    // Evaluate the partner's post_answer signature ability (stat bumps,
    // statuses, heals, drains, hampers — including any `chance` roll) and,
    // if it fires, apply it through the SAME server-validated RPC path as
    // berries: the client only names WHICH partner/phase fired, and the
    // server looks up the fixed magnitude from `pvp_signature_effects`.
    const suppressedNow = idxAtAnswer < mySuppressedUntil;
    if (!frozen && suppressedNow && ability && ability.wiring === "post_answer") {
      // Ability locked this question — show a distinct toast at most once per
      // suppression window, and consume no resource.
      if (suppressToastedForRef.current !== mySuppressedUntil) {
        suppressToastedForRef.current = mySuppressedUntil;
        const move = signatureMoveName(partnerId);
        toast.warning(`🔒 ${move ?? "Your signature move"} is suppressed!`);
      }
    } else if (!frozen && ability && ability.wiring === "post_answer") {
      const totalMs = personalTimerMs;
      const category = questions[idxAtAnswer]?.category ?? "";
      const sigCtx = buildSigContext(idxAtAnswer, correct, correct ? streak + 1 : 0, elapsedMs, totalMs, category);
      const postEffects = evaluatePostAnswer(ability, sigCtx);
      // Phase 5: if this partner is a weather stat source (Kyogre/Groudon) and
      // its weather isn't currently active (negated by an on-field Rayquaza, or
      // suppressed as the non-owner in a Kyogre-vs-Groudon match), don't fire —
      // the server would refuse the weather effect anyway. Show the Air Lock
      // note once when Rayquaza is what negated it.
      const weatherGatedOut =
        isWeatherStatSource(partnerId) &&
        !isMyWeatherActive(amIHost ? "host" : "guest", partnerId, {
          hostPartnerId: match.hostPartnerId,
          guestPartnerId: match.guestPartnerId,
          weatherOwner: match.weatherOwner,
        });
      if (postEffects.length > 0 && weatherGatedOut) {
        if (
          !weatherNegatedToastedRef.current &&
          (match.hostPartnerId === 384 || match.guestPartnerId === 384)
        ) {
          weatherNegatedToastedRef.current = true;
          toast.warning("🌪️ Air Lock — Rayquaza negates the weather!");
        }
      } else if (postEffects.length > 0) {
        void applyPvpSignatureEffect(matchId, idxAtAnswer, partnerId as number, "post_answer").then(
          (abilityRes) => {
            if (abilityRes.ok && !abilityRes.noop) {
              if (abilityRes.hostStages) {
                useGameStore.setState({
                  myStages: amIHost ? abilityRes.hostStages : abilityRes.guestStages,
                  oppStages: amIHost ? abilityRes.guestStages : abilityRes.hostStages,
                  battleStatuses: amIHost ? abilityRes.hostStatuses : abilityRes.guestStatuses,
                  opponentStatuses: amIHost ? abilityRes.guestStatuses : abilityRes.hostStatuses,
                });
              }
              if (typeof abilityRes.hostHp === "number") {
                setMyHp(amIHost ? abilityRes.hostHp : abilityRes.guestHp!);
                setOppHp(amIHost ? abilityRes.guestHp! : abilityRes.hostHp);
              }
              const move = signatureMoveName(partnerId);
              if (move) toast.success(`✨ ${move} activates!`);
            }
          },
        );
      }
      // Client-only hamper effects (option scramble / hide / highlight) have no
      // server magnitude to trust — they're purely cosmetic UI disruption on
      // the OPPONENT's own screen, so nothing to apply on this client.
    }

    prevCorrectRef.current = correct;
    prevElapsedRef.current = elapsedMs;

    const res = await submitPvpLiveAnswer(matchId, idxAtAnswer, correct, dmg, selfDmg, elapsedMs);
    if (res.ok) {
      const myNewHp = amIHost ? res.hostHp : res.guestHp;
      // Ho-Oh's Rainbow Rebirth: we took lethal self-damage this question yet the
      // authoritative server kept us alive (revived to 25% HP) — announce it once.
      if (
        partnerId === 250 &&
        !rainbowRebirthToastedRef.current &&
        selfDmg > 0 &&
        myHp - selfDmg <= 0 &&
        myNewHp > 0
      ) {
        rainbowRebirthToastedRef.current = true;
        toast.success("🌈 Ho-Oh's Rainbow Rebirth — you rise from the ashes!");
      }
      setMyHp(amIHost ? res.hostHp : res.guestHp);
      setOppHp(amIHost ? res.guestHp : res.hostHp);
      if (res.resolved && !finishedRef.current) {
        finishedRef.current = true;
        const myFinalHp = amIHost ? res.hostHp : res.guestHp;
        const oppFinalHp = amIHost ? res.guestHp : res.hostHp;
        const won = res.winnerId ? res.winnerId === myId : null;
        onFinish({ resolved: true, won, hp: myFinalHp, oppHp: oppFinalHp });
      }
    }
  }

  function handleAnswer(choiceIndex: number) {
    if (selected !== null || displayedIndex < 0 || frozen) return;
    const q = questions[displayedIndex];
    setSelected(choiceIndex);
    const elapsedMs = Date.now() - questionStartRef.current;
    void resolveQuestion(displayedIndex, choiceIndex === q.correct, elapsedMs);
  }

  // Auto-timeout: if the personal timer expires with nothing selected, count
  // as a wrong/missed answer.
  useEffect(() => {
    if (displayedIndex < 0 || selected !== null || finishedRef.current || frozen) return;
    const deadline = questionStartRef.current + personalTimerMs;
    if (Date.now() >= deadline) {
      setSelected(-1);
      void resolveQuestion(displayedIndex, false, personalTimerMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedIndex, selected, now, frozen]);

  // Bot driver — battle-start standing buff (once). No-op for a non-bot match
  // or a bot whose partner has no battle_start ability.
  useEffect(() => {
    if (!match.isBotMatch || botBattleStartRef.current) return;
    const botPartnerId = match.guestPartnerId;
    if (botPartnerId == null) return;
    botBattleStartRef.current = true;
    const botAbility = signatureAbilityFor(botPartnerId);
    if (!botAbility || botAbility.wiring !== "battle_start") return;
    if (evaluateBattleStart(botAbility, 0).length === 0) return;
    void applyBotPvpSignatureEffect(matchId, 0, botPartnerId, "battle_start");
  }, [match.isBotMatch, match.guestPartnerId, matchId]);

  // Bot driver — one move per question. The bot answers on its own delay, deals
  // client-computed / server-clamped damage (respecting its stat stages + Burn,
  // exactly like a human), and may fire its signature ability or heal. Its own
  // HP damage, ability debuffs, and item effects all land on the authoritative
  // row, so the human's defensive/debuff play still matters; the bot doesn't
  // model skipping its own turn for Freeze/Sleep/Paralysis (training simplification).
  useEffect(() => {
    if (!match.isBotMatch || displayedIndex < 0 || finishedRef.current) return;
    if (botLastIdxRef.current >= displayedIndex) return;
    botLastIdxRef.current = displayedIndex;
    if (!botProfileRef.current) botProfileRef.current = rollBotProfile();
    const p = botProfileRef.current;
    const botPartnerId = match.guestPartnerId;
    const botAbility = botPartnerId != null ? signatureAbilityFor(botPartnerId) : null;
    const idxAtAnswer = displayedIndex;
    const correct = botAnswersCorrectly(p);
    const timeMs = botAnswerTimeMs(p);
    const submitAt = Math.min(timeMs, Math.max(0, personalTimerMs - 250));
    const t = setTimeout(() => {
      if (finishedRef.current) return;
      let dmg = 0;
      if (correct) {
        const next = botStreakRef.current + 1;
        botStreakRef.current = next;
        const totalMs = timerMsForSpeedStage(oppStages.speed, PVP_BASE_TIMER_MS);
        const speedRatio = Math.max(0, (totalMs - timeMs) / totalMs);
        const firstHalf = timeMs <= totalMs / 2;
        const burned = oppStatuses.some((s) => s.kind === "burn");
        const { dmg: computed } = computePvpDamage({
          streak: next,
          speedRatio,
          attackStage: oppStages.attack,
          defenseStage: myStages.defense,
          critStage: oppStages.crit,
          firstHalf,
          burned,
        });
        dmg = computed;
      } else {
        botStreakRef.current = 0;
      }
      void submitBotPvpMove(matchId, idxAtAnswer, correct, dmg, timeMs).then((res) => {
        if (res.ok && res.resolved && !finishedRef.current) {
          finishedRef.current = true;
          const won = res.winnerId ? res.winnerId === myId : null;
          onFinish({ resolved: true, won, hp: res.hostHp, oppHp: res.guestHp });
        }
      });
      if (
        botPartnerId != null &&
        botAbility &&
        botAbility.wiring === "post_answer" &&
        botShouldFireAbility(p, { answeredCorrectly: correct, hasAbility: true })
      ) {
        void applyBotPvpSignatureEffect(matchId, idxAtAnswer, botPartnerId, "post_answer");
      }
      if (
        botShouldUseItem(p, {
          hpPct: oppHp / PVP_MAX_HP,
          itemsRemaining: MAX_ITEMS_PER_BATTLE - match.guestItemsUsed,
        })
      ) {
        void applyBotPvpLiveItem(matchId, idxAtAnswer, "superpotion");
      }
    }, submitAt);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedIndex, match.isBotMatch]);

  async function handleUseItem(itemId: ItemId) {
    if (itemsUsedRef.current >= MAX_ITEMS_PER_BATTLE) {
      toast.error(`Only ${MAX_ITEMS_PER_BATTLE} items per battle.`);
      return;
    }
    const def = ITEMS.find((i) => i.id === itemId);
    if (!def) return;

    if (CLIENT_ONLY_ITEMS.includes(itemId)) {
      // Pure client-side UI aid — no server round trip, mirrors Solo exactly.
      useGameStore.getState().useItem(itemId);
      toast.info(`✨ ${def.name} used!`);
      playSfx("item_use");
      setBagOpen(false);
      return;
    }

    const owned = useGameStore.getState().inventory[itemId] ?? 0;
    if (owned <= 0) return;
    playSfx("item_use");
    const res = await applyPvpLiveItem(matchId, Math.max(0, displayedIndex), itemId);
    if (!res.ok) {
      toast.error("Couldn't use that item — try again.");
      return;
    }
    // Consume locally too (client-side inventory isn't server-synced).
    useGameStore.setState((s) => ({
      inventory: { ...s.inventory, [itemId]: (s.inventory[itemId] ?? 0) - 1 },
    }));
    itemsUsedRef.current += 1;
    setMyHp(amIHost ? res.hostHp : res.guestHp);
    setOppHp(amIHost ? res.guestHp : res.hostHp);
    useGameStore.setState({
      myStages: amIHost ? res.hostStages : res.guestStages,
      oppStages: amIHost ? res.guestStages : res.hostStages,
      battleStatuses: amIHost ? res.hostStatuses : res.guestStatuses,
      opponentStatuses: amIHost ? res.guestStatuses : res.hostStatuses,
    });
    const opponentFacing = def.berry?.target === "opponent";
    toast.success(
      opponentFacing
        ? `${def.emoji} You used ${def.name} — Opponent affected!`
        : `${def.emoji} You used ${def.name}!`,
    );
    setBagOpen(false);
  }

  async function handleFireSignature() {
    if (!manualFireable || manualFiring || partnerId == null) return;
    if (manualFiresUsed >= manualCap || finishedRef.current) return;
    // Phase 4: a suppressed player can't fire — no charge is spent (the server
    // also refuses), and we surface a distinct locked toast.
    if (displayedIndex >= 0 && displayedIndex < mySuppressedUntil) {
      const move = signatureMoveName(partnerId);
      toast.warning(`🔒 ${move ?? "Your signature move"} is suppressed!`);
      return;
    }

    // Client-armed one-hit abilities (Psystrike / Dragon Ascent / Shadow Force):
    // no server round trip — arm the modifier onto the next correct answer. The
    // per-battle cap is purely local (the payoff is a client-computed,
    // server-clamped damage number, exactly like a passive_damage hit).
    if (isClientHitManual) {
      if (armedHitRef.current) return; // already armed and waiting
      armedHitRef.current = manualHitModifiers(ability);
      setArmedHit(true);
      setManualFiresUsed((n) => n + 1);
      playSfx("item_use");
      const move = signatureMoveName(partnerId);
      if (move) toast.success(`✨ ${move} — armed! Your next correct answer strikes hard.`);
      return;
    }

    setManualFiring(true);
    // Same server-validated path as berries: the client only names WHICH
    // partner fired; the server looks up the fixed magnitude by dex id and
    // enforces the per-battle cap (returns noop/'no_charges' if exceeded).
    const res = await applyPvpSignatureEffect(
      matchId,
      Math.max(0, displayedIndex),
      partnerId,
      "manual",
      pokedexCount,
    );
    setManualFiring(false);
    if (!res.ok) {
      toast.error("Couldn't fire that move — try again.");
      return;
    }
    if (res.noop) {
      // Server-enforced cap reached (or nothing to apply) — sync the local
      // counter so the button disables.
      setManualFiresUsed(manualCap);
      return;
    }
    setManualFiresUsed((n) => n + 1);
    if (res.hostStages) {
      useGameStore.setState({
        myStages: amIHost ? res.hostStages : res.guestStages!,
        oppStages: amIHost ? res.guestStages! : res.hostStages,
        battleStatuses: amIHost ? res.hostStatuses! : res.guestStatuses!,
        opponentStatuses: amIHost ? res.guestStatuses! : res.hostStatuses!,
      });
    }
    if (typeof res.hostHp === "number") {
      setMyHp(amIHost ? res.hostHp : res.guestHp!);
      setOppHp(amIHost ? res.guestHp! : res.hostHp);
    }
    // Chien-Pao — Sword of Ruin (1002): the -2 opp Def landed server-side above;
    // arm the follow-up 2-charge client-side ignore-Defense window for the next
    // 2 correct answers.
    if (partnerId === 1002) {
      swordOfRuinChargesRef.current = 2;
    }
    playSfx("item_use");
    const move = signatureMoveName(partnerId);
    if (move) toast.success(`✨ ${move} unleashed!`);
  }

  if (idx < 0) {
    const secsLeft = Math.max(0, Math.ceil(-elapsed / 1000));
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-poke-cream px-6 text-center">
        <div className="font-display-xl text-foreground">Get ready!</div>
        <div className="text-5xl font-extrabold text-primary">{secsLeft}</div>
        <div className="font-pixel-xs text-foreground/60">Battle starting…</div>
      </div>
    );
  }

  const q = questions[displayedIndex];
  if (!q) return null;

  const windowElapsed = now - questionStartRef.current;
  const msLeft = Math.max(0, personalTimerMs - windowElapsed);
  const stillSleepLocked = isAsleep && windowElapsed < sleepLockMs;
  const bagItems = ITEMS.filter((it) => {
    const owned = inventory[it.id] ?? 0;
    if (owned <= 0) return false;
    return it.isBerry || CLIENT_ONLY_ITEMS.includes(it.id) || SERVER_EFFECT_ITEMS.includes(it.id);
  });

  const mySpriteId = myPokemon?.id ?? partnerId ?? null;
  const myTypes: PokeType[] = myPokemon?.types ?? [];
  const oppEntry = opponentPartnerId != null ? findPokemon(opponentPartnerId) : undefined;
  const oppTypes: PokeType[] = oppEntry?.types ?? [];

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-poke-cream">
      {/* TOP BAR — question index, signature-fire, bag (timer floats above the card) */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-6">
        <div className="font-pixel-xs text-foreground/60">
          Question {displayedIndex + 1} / {PVP_QUESTIONS}
        </div>
        <div className="flex items-center gap-2">
          {manualFireable && (
            <button
              onClick={() => void handleFireSignature()}
              disabled={
                manualFiring ||
                manualFiresUsed >= manualCap ||
                frozen ||
                armedHit ||
                displayedIndex < mySuppressedUntil
              }
              title={signatureMoveName(partnerId) ?? "Signature move"}
              className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-card disabled:opacity-40"
            >
              {displayedIndex < mySuppressedUntil ? "🔒" : armedHit ? "✨" : "⚡"}{" "}
              {signatureMoveName(partnerId)}
              <span className="tabular-nums opacity-80">
                {displayedIndex < mySuppressedUntil
                  ? "locked"
                  : armedHit
                    ? "armed"
                    : `${Math.max(0, manualCap - manualFiresUsed)}/${manualCap}`}
              </span>
            </button>
          )}
          <button
            onClick={() => setBagOpen(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-card transition active:scale-95"
          >
            <Backpack className="h-5 w-5 text-muted-foreground" />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-primary px-1 font-pixel-xs text-[8px] text-primary-foreground">
              {itemsUsedRef.current}/{MAX_ITEMS_PER_BATTLE}
            </span>
          </button>
        </div>
      </div>

      {/* COMBAT ARENA — FRLG diagonal layout, mirroring Solo */}
      <div className="relative min-h-0 flex-1 px-[max(1.25rem,env(safe-area-inset-left))] py-2">
        {/* OPPONENT ZONE: panel top-left, sprite top-right */}
        <div className="flex items-start justify-between">
          <PvpCombatPanel
            align="left"
            name={opponentName}
            types={oppTypes}
            hp={oppHp}
            stages={oppStages}
            statuses={oppStatuses}
          />
          <div className="mt-2">
            <ArenaSprite
              id={opponentPartnerId}
              back={false}
              shake={shakeWho === "opponent"}
              floatN={floatDmg?.who === "opponent" ? floatDmg.n : null}
            />
          </div>
        </div>

        {/* PLAYER ZONE: sprite lower-left, panel mid-right */}
        <div className="-mt-2 flex items-end justify-between">
          <ArenaSprite
            id={mySpriteId}
            back
            shake={shakeWho === "player"}
            floatN={floatDmg?.who === "player" ? floatDmg.n : null}
          />
          <PvpCombatPanel
            align="right"
            name="You"
            types={myTypes}
            hp={myHp}
            stages={myStages}
            statuses={myStatuses}
          />
        </div>
      </div>

      {/* QUESTION CARD — thumb zone, pinned bottom, floating timer pill above */}
      <div className="relative shrink-0 rounded-t-[28px] bg-card px-[max(1rem,env(safe-area-inset-left))] pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-14 shadow-[0_-8px_30px_-12px_oklch(0.3_0.05_260/0.25)]">
        <div className="pointer-events-none absolute left-1/2 -top-6 z-10 flex -translate-x-1/2 flex-col items-center">
          <TimerRing timer={Math.ceil(msLeft / 1000)} maxTime={Math.ceil(personalTimerMs / 1000)} />
          {!frozen && <p className="mt-1.5 font-pixel-xs text-foreground/70">{q.category}</p>}
        </div>

        {frozen ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="text-4xl">❄️</div>
            <div className="font-display text-lg text-foreground">Frozen solid!</div>
            <div className="text-xs text-foreground/60">This question is skipped.</div>
          </div>
        ) : stillSleepLocked ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="text-4xl">😴</div>
            <div className="text-xs text-foreground/60">Waking up…</div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={displayedIndex}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
            >
              <p className="text-center font-display text-[clamp(0.95rem,4vw,1.125rem)] font-bold leading-snug text-foreground">
                {q.question}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2">
                {q.options.map((opt, i) => {
                  const isCorrectOpt = i === q.correct;
                  const isSelected = selected === i;
                  const showState = selected !== null;
                  return (
                    <button
                      key={i}
                      disabled={selected !== null}
                      onClick={() => handleAnswer(i)}
                      className={`min-h-[48px] rounded-2xl border-2 px-4 py-3 text-left font-display text-base transition active:scale-[0.98] ${
                        showState && isCorrectOpt
                          ? "border-hp-good bg-hp-good/15 text-hp-good"
                          : showState && isSelected && !isCorrectOpt
                            ? "border-destructive bg-destructive/10 text-destructive"
                            : "border-border bg-card text-foreground"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {selected !== null && (
                <div className="mt-3 text-center font-pixel-xs text-foreground/50">
                  Locked in — next question soon
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <Sheet open={bagOpen} onOpenChange={setBagOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-center font-display-lg text-foreground">
              Your Bag
            </SheetTitle>
            <div className="text-center text-xs font-semibold text-muted-foreground">
              {itemsUsedRef.current}/{MAX_ITEMS_PER_BATTLE} items used this battle
            </div>
          </SheetHeader>
          {(() => {
            const bagGroups = PVP_BAG_GROUPS.map((cat) => ({
              ...cat,
              items: bagItems.filter((it) => CATEGORY_OF[it.id] === cat.id),
            })).filter((g) => g.items.length > 0);
            return (
              <div className="my-4 max-h-[65vh] overflow-y-auto">
                {bagGroups.length === 0 ? (
                  <div className="rounded-3xl bg-poke-yellow/15 p-6 text-center">
                    <div className="mx-auto mb-2 text-4xl">🎒</div>
                    <div className="font-display-md text-foreground">Your bag is empty</div>
                    <p className="mt-1 text-xs text-foreground/60">
                      Play more Nearby Battles to earn berries!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 pb-2">
                    {bagGroups.map((group) => (
                      <div key={group.id}>
                        <div className="mb-2 font-pixel-xs uppercase tracking-wider text-foreground/45">
                          {group.label}
                        </div>
                        <div className="flex flex-col gap-2.5">
                          {group.items.map((it) => {
                            const owned = inventory[it.id] ?? 0;
                            const disabled = itemsUsedRef.current >= MAX_ITEMS_PER_BATTLE;
                            return (
                              <button
                                key={it.id}
                                onClick={() => void handleUseItem(it.id)}
                                disabled={disabled}
                                className="flex items-center gap-3.5 rounded-[20px] bg-card px-4 py-3 text-left shadow-card transition active:scale-[0.99] disabled:opacity-40"
                              >
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-primary/[0.08]">
                                  <ItemIcon item={it} className="h-9 w-9" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                    {it.name}
                                    <span className="font-pixel text-[9px] text-primary">
                                      ×{owned}
                                    </span>
                                  </div>
                                  <div className="text-[11px] leading-tight text-muted-foreground">
                                    {BAG_SHORT_DESC[it.id] ?? it.desc}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Re-exported so callers that only need the status kind type don't have to
 * reach into game-data directly. */
export type { StatusKind };
