import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Trivia } from "@/lib/trivia-core";
import { playSfx } from "@/lib/audio";
import { useGameStore, type ActiveStatus, type PvpStatStages } from "@/lib/store";
import { ITEMS, STATUS_META, type ItemId, type StatusKind, type PvpStat } from "@/lib/game-data";
import { MAX_ITEMS_PER_BATTLE } from "@/lib/store/slices/itemsSlice";
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
  type LivePvpMatch,
} from "@/lib/pvp-live";
import {
  signatureAbilityFor,
  signatureMoveName,
  evaluateHitModifiers,
  evaluatePostAnswer,
  evaluateBattleStart,
  hasServerManualEffect,
  manualUsesPerBattle,
  type SignatureContext,
} from "@/lib/signature-abilities";
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

function statBarLabel(stat: PvpStat): string {
  return { attack: "ATK", defense: "DEF", speed: "SPD", crit: "CRIT" }[stat];
}

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const color = pct > 50 ? "bg-hp-good" : pct > 20 ? "bg-hp-warn" : "bg-hp-low";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-poke-dark/15">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
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

function BattlerPanel({
  name,
  hp,
  stages,
  statuses,
  align,
}: {
  name: string;
  hp: number;
  stages: PvpStatStages;
  statuses: ActiveStatus[];
  align: "left" | "right";
}) {
  return (
    <div
      className={`w-full rounded-2xl bg-card px-3 py-2 shadow-card ${align === "right" ? "text-right" : "text-left"}`}
    >
      <div className="truncate text-sm font-bold text-foreground">{name}</div>
      <div className="mt-1 flex items-center gap-2">
        <HpBar hp={hp} maxHp={PVP_MAX_HP} />
        <span className="text-[11px] font-bold tabular-nums text-foreground">
          {Math.max(0, Math.round(hp))}
        </span>
      </div>
      <div
        className={`mt-1 flex flex-wrap gap-1 ${align === "right" ? "justify-end" : "justify-start"}`}
      >
        <StatChips stages={stages} />
        <StatusChips statuses={statuses} />
      </div>
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
  const partnerId = useGameStore((s) => s.pokemon?.id ?? null);
  const pokedexCount = useGameStore((s) => Object.keys(s.pokedex).length);
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
  // Manual "charge and fire" signature abilities: a generic charge indicator +
  // Fire button (reusing the bag's visual language) for Legendary/Mythical
  // partners whose signature move is player-fired and decomposes to a
  // server-catalog effect (Aeroblast, Roar of Time, Ruination burst, etc.). The
  // server enforces the per-battle use cap; this local counter only drives the
  // button's enabled/label state.
  const [manualFiresUsed, setManualFiresUsed] = useState(0);
  const [manualFiring, setManualFiring] = useState(false);
  const manualCap = manualUsesPerBattle(ability);
  const manualFireable = !!ability && hasServerManualEffect(ability) && manualCap > 0;

  const finishedRef = useRef(false);
  const itemsUsedRef = useRef(amIHost ? match.hostItemsUsed : match.guestItemsUsed);
  const questionStartRef = useRef(0);

  // Signature-ability bookkeeping (drives the pure evaluators in
  // signature-abilities.ts). Kept in refs so they survive re-renders without
  // re-triggering effects.
  const prevCorrectRef = useRef(false);
  const prevElapsedRef = useRef(Number.MAX_SAFE_INTEGER);
  const correctCountRef = useRef(0);
  const answeredCategoriesRef = useRef<Set<string>>(new Set());
  const battleStartFiredRef = useRef(false);

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

  // Keep local HP/items mirrors in sync with the authoritative row (updates
  // arrive via the parent route's postgres_changes subscription on `match`).
  useEffect(() => {
    setMyHp(amIHost ? match.hostHp : match.guestHp);
    setOppHp(amIHost ? match.guestHp : match.hostHp);
    itemsUsedRef.current = amIHost ? match.hostItemsUsed : match.guestItemsUsed;
  }, [match, amIHost]);

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
        const sigCtx = buildSigContext(idxAtAnswer, true, nextStreak, elapsedMs, totalMs, category);
        const mods = evaluateHitModifiers(ability, sigCtx);
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
    if (!frozen && ability && ability.wiring === "post_answer") {
      const totalMs = personalTimerMs;
      const category = questions[idxAtAnswer]?.category ?? "";
      const sigCtx = buildSigContext(idxAtAnswer, correct, correct ? streak + 1 : 0, elapsedMs, totalMs, category);
      const postEffects = evaluatePostAnswer(ability, sigCtx);
      if (postEffects.length > 0) {
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

  return (
    <div className="flex h-full w-full flex-col bg-poke-cream px-5 pb-8 pt-6">
      <div className="mb-3 grid grid-cols-2 gap-3">
        <BattlerPanel name="You" hp={myHp} stages={myStages} statuses={myStatuses} align="left" />
        <BattlerPanel
          name={opponentName}
          hp={oppHp}
          stages={oppStages}
          statuses={oppStatuses}
          align="right"
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="font-pixel-xs text-foreground/60">
          Question {displayedIndex + 1} / {PVP_QUESTIONS}
        </div>
        <div className="flex items-center gap-2">
          <TimerRing timer={Math.ceil(msLeft / 1000)} maxTime={Math.ceil(personalTimerMs / 1000)} />
          {manualFireable && (
            <button
              onClick={() => void handleFireSignature()}
              disabled={manualFiring || manualFiresUsed >= manualCap || frozen}
              title={signatureMoveName(partnerId) ?? "Signature move"}
              className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-card disabled:opacity-40"
            >
              ⚡ {signatureMoveName(partnerId)}
              <span className="tabular-nums opacity-80">
                {Math.max(0, manualCap - manualFiresUsed)}/{manualCap}
              </span>
            </button>
          )}
          <button
            onClick={() => setBagOpen(true)}
            className="rounded-full bg-card px-3 py-1.5 text-sm font-bold shadow-card"
          >
            🎒 {itemsUsedRef.current}/{MAX_ITEMS_PER_BATTLE}
          </button>
        </div>
      </div>

      {frozen ? (
        <div className="mb-6 flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl bg-card p-5 text-center shadow-card">
          <div className="text-4xl">❄️</div>
          <div className="font-display text-lg text-foreground">Frozen solid!</div>
          <div className="text-xs text-foreground/60">This question is skipped.</div>
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-3xl bg-card p-5 shadow-card">
            <div className="font-pixel-xs mb-2 text-foreground/50">{q.category}</div>
            <div className="font-display text-lg leading-snug text-foreground">{q.question}</div>
          </div>
          {stillSleepLocked ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <div className="text-4xl">😴</div>
              <div className="text-xs text-foreground/60">Waking up…</div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3">
              {q.options.map((opt, i) => {
                const isCorrectOpt = i === q.correct;
                const isSelected = selected === i;
                const showState = selected !== null;
                return (
                  <button
                    key={i}
                    disabled={selected !== null}
                    onClick={() => handleAnswer(i)}
                    className={`rounded-2xl border-2 px-4 py-3 text-left font-display text-base transition-colors ${
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
          )}
        </>
      )}

      {selected !== null && (
        <div className="mt-3 text-center font-pixel-xs text-foreground/50">
          Locked in — next question soon
        </div>
      )}

      {bagOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setBagOpen(false)}
        >
          <div
            className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-center font-display-md text-foreground">Your Bag</div>
            <div className="mb-3 text-center text-xs font-semibold text-muted-foreground">
              {itemsUsedRef.current}/{MAX_ITEMS_PER_BATTLE} items used this battle
            </div>
            {bagItems.length === 0 ? (
              <div className="py-6 text-center text-sm text-foreground/60">
                No usable items or berries yet. Play more Nearby Battles to earn berries!
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {bagItems.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => void handleUseItem(it.id)}
                    disabled={itemsUsedRef.current >= MAX_ITEMS_PER_BATTLE}
                    className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-2.5 text-left disabled:opacity-40"
                  >
                    <div>
                      <div className="font-display text-sm text-foreground">
                        {it.emoji} {it.name}
                      </div>
                      <div className="text-xs text-foreground/60">{it.desc}</div>
                    </div>
                    <div className="text-xs font-bold text-foreground/50">×{inventory[it.id] ?? 0}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Re-exported so callers that only need the status kind type don't have to
 * reach into game-data directly. */
export type { StatusKind };
