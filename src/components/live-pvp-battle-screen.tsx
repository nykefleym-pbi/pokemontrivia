import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Backpack, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Trivia, MissedAnswer } from "@/lib/trivia-core";
import { shuffleTriviaOptionsWithOrder } from "@/lib/trivia-core";
import { playSfx, playCry } from "@/lib/audio";
import { useGameStore, type ActiveStatus, type PvpStatStages } from "@/lib/store";
import {
  PokemonSprite,
  TypeBadge,
  PokeballSpinner,
  ItemIcon,
  StatusEffectOverlay,
} from "@/components/game-ui";
import { typeRowFontSize, COMBAT_PANEL_WIDTH } from "@/lib/type-row-fit";
import { findPokemon, type PokeType } from "@/lib/pokemon-data";
import { ITEMS, STATUS_META, type ItemId, type StatusKind, type PvpStat } from "@/lib/game-data";
import { MAX_ITEMS_PER_BATTLE } from "@/lib/store/slices/itemsSlice";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CATEGORIES, CATEGORY_OF, BAG_SHORT_DESC } from "@/lib/item-categories";
import {
  multiplierConditionHolds,
  phasePayoffIndex,
  timerMsForSpeedStage,
  PVP_BASE_TIMER_MS,
  PVP_MAX_HP,
  PVP_QUESTIONS,
} from "@/lib/pvp-combat";
import {
  resolvePvpLiveTurn,
  applyPvpLiveItem,
  applyPvpSignatureEffect,
  applyPvpTypeAbilityEffect,
  setLivePvpTransform,
  resolveBotPvpTurn,
  applyBotPvpSignatureEffect,
  applyBotPvpLiveItem,
  sigEngineTick,
  botSigEngineTick,
  sigEngineStatus,
  sigM4Fx,
  sigM4Window,
  type SigEngineTickSpec,
  type LivePvpMatch,
} from "@/lib/pvp-live";
import {
  stepBespokeFx,
  eliminatedChoiceIndices,
  EMPTY_BESPOKE_FX_STATE,
  type BespokeFxState,
} from "@/lib/signature-bespoke-fx";
import { getAbilityById, type AbilityId } from "@/lib/abilities";
import {
  resolvePvpTypeAbilityId,
  typeAbilityPvp,
  typeAbilityHasBattleStart,
  typeAbilityPostAnswerFires,
  typeAbilityPreventsConfusion,
  type TypeAbilityCtx,
} from "@/lib/pvp-type-abilities";
import {
  rollBotProfile,
  botShouldUseItem,
  type BotProfile,
} from "@/lib/pvp-bot";
import {
  signatureAbilityFor,
  signatureMoveName,
  describeSignatureEffect,
  describeSignatureFull,
  hasCappedPayload,
  cappedPayloadUses,
  resolveMewTransform,
  MEW_ID,
  type SignatureEngineSpec,
  type DisableSpec,
} from "@/lib/signature-abilities";
import {
  nextWrathStacks,
  thunderclapFires,
  THUNDERCLAP_COOLDOWN,
} from "@/lib/signature-bespoke";
import { isWeatherStatSource, isMyWeatherActive } from "@/lib/pvp-weather";
import { TimerRing } from "@/components/timer-ring";
import { AppIcon } from "@/components/app-icon";
import { LOCK_ICON } from "@/lib/app-icons";
import { useBattleFxCues } from "@/hooks/useBattleFxCues";
import type { BattleSide, BattleStatusKind } from "@/lib/training-battle-fx-types";

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
  /** Called as each of MY questions resolves wrong (real wrong or timeout/no-
   * answer), so the route can retain the missed list above the battle→result
   * unmount for the defeat review. Never fires for a correct/confusion-miss. */
  onMissed?: (m: MissedAnswer) => void;
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

/** Solo-style CombatPanel adapted for Nearby Battle: same card frame, type
 * badges, and spring HP bar as `battle-screen.tsx`'s CombatPanel, but carrying
 * PvP's stat-stage and status chips instead of ability/immunity chips. */
/** One ability chip+popover in a combat panel (a legendary shows two). */
type AbilityChip = { name: string; desc: string | null };

function PvpCombatPanel({
  align,
  name,
  types,
  hp,
  stages,
  abilities = [],
}: {
  align: "left" | "right";
  name: string;
  types: PokeType[];
  hp: number;
  stages: PvpStatStages;
  abilities?: AbilityChip[];
}) {
  const pct = Math.max(0, Math.min(100, (hp / PVP_MAX_HP) * 100));
  const barColor = pct > 50 ? "bg-hp-good" : pct > 20 ? "bg-hp-warn" : "bg-hp-low";
  const alignCls = align === "right" ? "items-end text-right" : "items-start text-left";
  const justifyCls = align === "right" ? "justify-end" : "justify-start";
  const hasChips = abilities.length > 0 || (Object.values(stages) as number[]).some((v) => v !== 0);

  return (
    <div
      style={{ width: COMBAT_PANEL_WIDTH }}
      className="shrink-0 rounded-2xl bg-card px-3 py-2 backdrop-blur shadow-card"
    >
      <div className={`flex flex-col ${alignCls}`}>
        <div className="w-full truncate text-sm font-bold leading-tight">{name}</div>
        {types.length > 0 && (
          <div className={`mt-1 flex w-full flex-nowrap gap-0.5 ${justifyCls}`}>
            {types.map((t) => (
              <TypeBadge
                key={t}
                type={t}
                size="sm"
                fontSize={typeRowFontSize(types, COMBAT_PANEL_WIDTH)}
              />
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
          <div className={`mt-1 flex w-full flex-wrap items-center gap-0.5 ${justifyCls}`}>
            {abilities.map((a, i) => (
              <Popover key={`${a.name}-${i}`}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex max-w-full items-center gap-0.5 rounded-xl bg-primary/10 px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-wide text-primary active:scale-95"
                  >
                    <span className="min-w-0 truncate text-left">{a.name}</span>
                    <Info className="mt-[1px] h-2.5 w-2.5 shrink-0 opacity-70" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align={align === "right" ? "end" : "start"} className="w-56 text-xs">
                  <div className="font-bold text-primary">{a.name}</div>
                  {a.desc && <p className="mt-1 leading-snug text-muted-foreground">{a.desc}</p>}
                </PopoverContent>
              </Popover>
            ))}
            <StatChips stages={stages} />
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
  statuses,
  confused,
}: {
  id: number | null;
  back: boolean;
  shake: boolean;
  floatN: number | null;
  statuses: Array<{ kind: StatusKind }>;
  confused?: boolean;
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
        <StatusEffectOverlay statuses={statuses} confused={confused} />
        {floatN != null && (
          <div className="animate-float-up pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2 font-pixel text-base text-destructive">
            -{floatN}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── signature-rework M1 engine helpers (Frontend-B, shard B) ────────────────
// Pure, component-independent glue for the server-authoritative per-answer
// signature engine (`sigEngineTick`/`botSigEngineTick`). See
// docs/handoffs/signature-rework/03-frontend-b.md.

/** Coerce the engine tick's `Record<string, number>` stage map into the store's
 *  `PvpStatStages` shape (any missing stat → 0). */
function toStages(rec: Record<string, number>): PvpStatStages {
  return {
    attack: rec.attack ?? 0,
    defense: rec.defense ?? 0,
    speed: rec.speed ?? 0,
    crit: rec.crit ?? 0,
  };
}

interface TickDisable {
  disableKind: string;
  disableN: number;
  disableNextQuestion: boolean;
  /** `disable_effect_after_questions(n)` — the row auto-disables + reverts n
   *  questions after it fired, regardless of correctness. Composes with
   *  `disableKind` server-side, so an `any_of` carrying BOTH a revert-after-N
   *  arm and a questions-elapsed arm keeps both (Moltres #146). 0 = never. */
  expireAfterQuestions: number;
}

const NO_TICK_DISABLE: TickDisable = {
  disableKind: "none",
  disableN: 0,
  disableNextQuestion: false,
  expireAfterQuestions: 0,
};

/** `any_of([...])` → the arms compose rather than compete: pick the highest-priority
 *  *incorrect-counting* arm for kind/n (only one can be tracked), and carry the
 *  orthogonal arms (`disable_next_question_after_effect`,
 *  `disable_effect_after_questions`) alongside it — the server tracks those on
 *  separate fields. This is what lets Moltres #146 both revert on 1 incorrect AND
 *  expire 3 questions after firing. */
function reduceAnyOfDisable(arms: DisableSpec[]): TickDisable {
  const disableNextQuestion = arms.some((a) => a.kind === "disable_next_question_after_effect");
  const expiryArm = arms.find((a) => a.kind === "disable_effect_after_questions");
  const expireAfterQuestions = expiryArm && "n" in expiryArm ? expiryArm.n : 0;
  const priority = [
    "revert_stat_after_incorrect",
    "disable_increase_after_incorrect",
    "disable_effect_after_incorrect",
    "once_per_battle",
  ] as const;
  for (const kind of priority) {
    const arm = arms.find((a) => a.kind === kind);
    if (arm) {
      return {
        disableKind: kind,
        disableN: "n" in arm ? arm.n : 0,
        disableNextQuestion,
        expireAfterQuestions,
      };
    }
  }
  return { ...NO_TICK_DISABLE, disableNextQuestion, expireAfterQuestions };
}

/** Reduce a row's `DisableSpec` to the disable kinds + orthogonal flags the RPC
 *  understands. Kinds the server still can't track collapse to `none` and stay on
 *  their existing bespoke path. */
function engineToTickDisable(disable: DisableSpec): TickDisable {
  switch (disable.kind) {
    case "revert_stat_after_incorrect":
    case "disable_increase_after_incorrect":
    case "disable_effect_after_incorrect":
      return { ...NO_TICK_DISABLE, disableKind: disable.kind, disableN: disable.n };
    case "once_per_battle":
      return { ...NO_TICK_DISABLE, disableKind: "once_per_battle" };
    case "disable_next_question_after_effect":
      return { ...NO_TICK_DISABLE, disableNextQuestion: true };
    case "disable_effect_after_questions":
      return { ...NO_TICK_DISABLE, expireAfterQuestions: disable.n };
    case "any_of":
      return reduceAnyOfDisable(disable.of);
    // Still not tick-tracked — left on the existing bespoke/heal path:
    case "disable_multiplier_after_incorrect": // multiplier-disable has no runtime counter yet
    case "disable_healing_after_questions": // healing-disable is the bespoke heal flow
    case "none":
    default:
      return NO_TICK_DISABLE;
  }
}

/** Build a `SigEngineTickSpec` from a row's `SignatureEngineSpec`. `statSpecs` and
 *  `incorrectStat` pass through as-is (the server applies/tracks them); `stackCap`
 *  is omitted — no per-row ramp-cap override exists on the spec, so it defaults
 *  to 3. `selfHp`/`oppHp` are supplied by the caller, which has the live HP. */
function engineToTickSpec(
  engine: SignatureEngineSpec,
  hp?: { selfHp: number; oppHp: number },
  opp?: { oppType: string[]; oppSpecies: number },
): SigEngineTickSpec {
  const disable = engineToTickDisable(engine.disable);
  // Uxie #480: the tick rolls + stores the predicted status when it sees a stat spec
  // carrying mode 'predicted_status', then echoes it back in the runtime. The catalog
  // row expresses the prediction as a BESPOKE fx (it changes no stat), so we bridge it
  // into the stat-spec channel here rather than polluting the catalog with a fake stat.
  const statSpecs: SigEngineTickSpec["statSpecs"] = [...(engine.stat ?? [])];
  if (engine.bespoke?.some((b) => b.fx === "predicted_status_reveal")) {
    statSpecs.push({ mode: "predicted_status" });
  }
  // A `multiplier` can also carry STAT specs that depend on the matchup:
  // `onSuccess` when its condition holds (Ogerpon #1017's +3 Crit only into
  // grass/water/fire/rock; Regice #378, whose "multiplier" is really just a
  // conditional +1 Attack), and `fallback` when it does not (Zygarde #718).
  // The tick cannot evaluate an opponent condition, so we resolve it here — the
  // client already supplies every other stat spec, and the server still clamps
  // the result to +/-3. Without this, those stat bumps reach nobody: the legacy
  // path used to deliver them, and M4 switches the legacy path off.
  if (engine.multiplier && opp) {
    const holds = multiplierConditionHolds(engine.multiplier.condition, opp);
    const conditional = holds ? engine.multiplier.onSuccess : engine.multiplier.fallback;
    if (conditional?.length) statSpecs.push(...conditional);
  }
  return {
    statSpecs,
    incorrectStatSpecs: engine.incorrectStat ?? [],
    disableKind: disable.disableKind,
    disableN: disable.disableN,
    disableNextQuestion: disable.disableNextQuestion,
    expireAfterQuestions: engine.expireAfterQuestions ?? disable.expireAfterQuestions,
    selfHp: hp?.selfHp ?? null,
    oppHp: hp?.oppHp ?? null,
  };
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
  questions: rawQuestions,
  startedAt,
  myId,
  hostId,
  match,
  opponentName,
  onFinish,
  onMissed,
}: Props) {
  // Shared question set, per-client option order. `orders[i][displayIndex]`
  // recovers the ORIGINAL (server-canonical) option index for question i's
  // displayed choice — needed so the server can independently verify
  // correctness against its own unshuffled `questions` column (server-first
  // PvP refactor) despite every client shuffling options independently.
  const shuffled = useMemo(
    () => rawQuestions.map((q) => shuffleTriviaOptionsWithOrder(q)),
    [rawQuestions],
  );
  const questions = useMemo(() => shuffled.map((s) => s.q), [shuffled]);
  const orders = useMemo(() => shuffled.map((s) => s.order), [shuffled]);
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

  // Every partner runs its TYPE ability (feedback 29fd5d73); a Legendary/Mythical
  // ALSO runs its signature (feedback #3 — the two used to be mutually exclusive
  // but now stack). `typeAbilityId` resolves unconditionally, and the signature
  // codepaths gate independently on `ability`, so both ability blocks fold into
  // the same dmg/selfDmg locals below. The opponent's id is read off the synced
  // row so we can announce/attribute it.
  const storeAbilityId = useGameStore((s) => s.abilityId);
  const typeAbilityId = useMemo<AbilityId | null>(
    () => resolvePvpTypeAbilityId(myPokemon?.types, storeAbilityId),
    [myPokemon, storeAbilityId],
  );
  const typeWiring = useMemo(() => typeAbilityPvp(typeAbilityId), [typeAbilityId]);
  const oppAbilityId = (amIHost ? match.guestAbilityId : match.hostAbilityId) as AbilityId | null;

  // Abilities shown in each combat panel's tappable info popover(s). A legendary
  // partner now surfaces BOTH its signature AND its type ability (feedback #3);
  // a non-legendary surfaces only its type ability. Signature description is the
  // PvP-specific note; type description falls back to the Solo ability text.
  const myAbilities = useMemo<AbilityChip[]>(() => {
    const chips: AbilityChip[] = [];
    if (ability) {
      const name = signatureMoveName(partnerId);
      if (name) chips.push({ name, desc: describeSignatureFull(partnerId) });
    }
    if (typeAbilityId) {
      const name = getAbilityById(typeAbilityId)?.name ?? null;
      if (name) {
        chips.push({ name, desc: typeWiring?.note ?? getAbilityById(typeAbilityId)?.description ?? null });
      }
    }
    return chips;
  }, [ability, partnerId, typeAbilityId, typeWiring]);
  const oppAbilities = useMemo<AbilityChip[]>(() => {
    const chips: AbilityChip[] = [];
    const oppSigMove = signatureMoveName(opponentPartnerId);
    if (oppSigMove) chips.push({ name: oppSigMove, desc: describeSignatureFull(opponentPartnerId) });
    if (oppAbilityId) {
      const name = getAbilityById(oppAbilityId)?.name ?? null;
      if (name) {
        chips.push({
          name,
          desc: typeAbilityPvp(oppAbilityId)?.note ?? getAbilityById(oppAbilityId)?.description ?? null,
        });
      }
    }
    return chips;
  }, [opponentPartnerId, oppAbilityId]);

  const startedAtMs = useRef(new Date(startedAt).getTime()).current;
  const [now, setNow] = useState(() => Date.now());
  const [displayedIndex, setDisplayedIndex] = useState(-1);
  // Mirror of displayedIndex read inside timers/effects that must see the latest
  // value without a stale closure (Fix 3: wall-clock ceiling and both-answered
  // early-advance converge on it so neither re-enters nor rewinds a question).
  const displayedIndexRef = useRef(-1);
  const [selected, setSelected] = useState<number | null>(null);
  // The value itself is no longer read anywhere (Phase 4 cutover moved the
  // streak-based damage math server-side) -- this now exists purely to drive
  // `setStreak`, which the rest of the file still calls.
  const [, setStreak] = useState(0);
  const [myHp, setMyHp] = useState(amIHost ? match.hostHp : match.guestHp);
  const [oppHp, setOppHp] = useState(amIHost ? match.guestHp : match.hostHp);
  const [bagOpen, setBagOpen] = useState(false);
  const [frozen, setFrozen] = useState(false);
  // Client-only battle aids (feedback b9d53ba1): X Accuracy highlights the
  // correct option, Scope dims a random wrong one — mirroring Solo's
  // revealedCorrect/revealedWrong. These were being consumed with no visible
  // effect in Nearby Battle. Reset each question in enterQuestion.
  const [revealedCorrect, setRevealedCorrect] = useState<number | null>(null);
  const [revealedWrong, setRevealedWrong] = useState<number | null>(null);
  // Purely-visual arena feedback (mirrors Solo): a shake + floating "-N" damage
  // number on whichever side's HP just dropped. Driven off HP deltas so every
  // path that lowers HP (own answer, opponent/bot row sync, ability, item)
  // triggers it without touching any game logic.
  const [shakeWho, setShakeWho] = useState<"player" | "opponent" | null>(null);
  const [floatDmg, setFloatDmg] = useState<{ who: "player" | "opponent"; n: number } | null>(null);
  const prevMyHpRef = useRef(myHp);
  const prevOppHpRef = useRef(oppHp);
  // Fix — battle intro (feedback 254db1d9): mirror Solo's send-out beat before
  // question 1 — Pokéball-throw SFX + the opponent partner's cry. The visible
  // "Battle start!" banner was removed (feedback 29fd5d73); the audio cues stay.
  // Refs keep each cue firing exactly once.
  const introThrowRef = useRef(false);
  const oppCryRef = useRef(false);
  // Type-ability (non-legendary) bookkeeping. All battle-scoped, so plain refs.
  const taBattleStartFiredRef = useRef(false);
  const taActivatedRef = useRef<Set<string>>(new Set()); // conditional fireNotes shown
  const hadWrongRef = useRef(false); // any wrong answer yet (Berserk / Snow Cloak)
  const torrentFiredRef = useRef(false); // Torrent's one-time sub-30% heal
  // `manual`-phase signature abilities. NOTE THE NAME LIES: nothing here is
  // player-fired any more. The Fire button was removed (owner ruling 2026-07-13);
  // a row's manual-phase effects are the payload its OWN engine trigger delivers,
  // auto-fired by `fireCappedPayload` and still capped at the uses it always had.
  // This counter only drives the uses-remaining chip.
  const [payloadUsed, setPayloadUsed] = useState(0);
  // Mirrors of the two above, for `fireCappedPayload` — it runs inside the engine
  // tick's async callback, where the state values it closed over are already stale.
  const payloadUsedRef = useRef(0);
  const payloadFiringRef = useRef(false);
  const payloadCap = cappedPayloadUses(ability);
  const hasPayload = !!ability && payloadCap > 0 && hasCappedPayload(ability);
  //
  // The client-armed one-hit modifier (`isClientHitManual` / `armedHitRef`) lived
  // here. Deleted 2026-07-13. It was gated on `!ability.engine`, and all 104 rows
  // have an engine, so it was always false — Psystrike / Dragon Ascent / Shadow
  // Force fire off their engine trigger now (owner ruling 2026-07-12). Nothing ever
  // armed the ref, so the fold that consumed it was dead too. Confirmed by
  // `scripts/balance-sim/liveness.ts`; deleting it left the sim byte-identical.
  // Chien-Pao — Sword of Ruin (1002): after firing (-2 opp Def via the server
  // manual row), the next 2 correct answers also ignore the opponent's remaining
  // Defense stage. Tracked as a small client-side charge window (client-computed,
  // server-clamped damage, like the armed one-hit manual moves); not persisted
  // across a reconnect.
  const swordOfRuinChargesRef = useRef(0);

  const finishedRef = useRef(false);
  const itemsUsedRef = useRef(amIHost ? match.hostItemsUsed : match.guestItemsUsed);
  // Fix 4 — per-item-TYPE cap of 1 use per battle (on top of the 3-items-total
  // cap). One battle == one screen mount, so a mount-scoped Set is sufficient.
  const usedItemIdsRef = useRef<Set<ItemId>>(new Set());
  const questionStartRef = useRef(0);

  // Training-vs-Bot: the human is always the host and drives the bot (guest)
  // locally. The bot's skill profile is rolled once per match; its per-question
  // move + optional ability/item are submitted through the bot RPCs. The human's
  // own play path (above/below) is completely untouched.
  const botProfileRef = useRef<BotProfile | null>(null);
  const botStreakRef = useRef(0);
  const botLastIdxRef = useRef(-1);

  // Single cue path (spec Stories 2-7): every player-visible combat cue funnels
  // through `emit`/`notify` (frozen contract) — one staggered one-by-one queue,
  // never ad-hoc simultaneous toast.* calls.
  const { emit, notify } = useBattleFxCues();

  // Confused-after-2-consecutive-wrong (#1) — client-authoritative for BOTH
  // sides. Held locally (never written to the synced status row, so realtime
  // row-sync can't clobber it — architecture §8) and merged into the displayed
  // statuses + the human confusion-miss roll. Each side has a consecutive-wrong
  // counter (reset on a correct answer) and a remaining-confused-ticks count
  // that only decrements on a confusion miss, mirroring the human model.
  const CONFUSE_AT = 2;
  const CONFUSE_TICKS = STATUS_META.confused.defaultCures; // 2, matching Solo
  const selfWrongStreakRef = useRef(0);
  const botWrongStreakRef = useRef(0);
  const selfConfusedTicksRef = useRef(0);
  const oppConfusedTicksRef = useRef(0);
  const [selfConfused, setSelfConfused] = useState(false);
  const [oppConfused, setOppConfused] = useState(false);
  // Mirror of `selected` for the wall-clock ceiling / timer effects that must
  // read the leaving slot's answer without a stale closure (no-answer fix #6).
  const selectedRef = useRef<number | null>(null);
  // Highest slot index already resolved, so the no-answer ceiling resolve and
  // the personal-timeout submit can never double-submit the same slot (#6).
  const lastResolvedIdxRef = useRef(-1);

  // Signature-ability bookkeeping (drives the pure evaluators in
  // signature-abilities.ts). Kept in refs so they survive re-renders without
  // re-triggering effects.
  const prevCorrectRef = useRef(false);
  const correctCountRef = useRef(0);
  const answeredCategoriesRef = useRef<Set<string>>(new Set());
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
  // signature-rework M1 engine (sigEngineTick) cue bookkeeping. Track my own
  // partner's disable + net-stat state across ticks so we can cue a
  // cooldown/lockout onset and a stat-revert exactly once each (never fabricated
  // — read straight off the tick's returned runtime). The error toast is
  // deduped to at most once per battle so a missing/unapplied RPC can't spam.
  const sigDisabledRef = useRef(false);
  const sigNetActiveRef = useRef(false);
  const sigTickErrorRef = useRef(false);
  // M3 bespoke scheduling (signature-bespoke-fx.ts): which question a delayed strike
  // lands on, how long Heatran's DoT window stays open, which question Azelf culls,
  // what Uxie foresaw. Per-side, because both a human and a bot can hold these rows.
  const bespokeFxRef = useRef<BespokeFxState>(EMPTY_BESPOKE_FX_STATE);
  const botBespokeFxRef = useRef<BespokeFxState>(EMPTY_BESPOKE_FX_STATE);
  // M5 — Cosmog #789: its halve-HP payoff hangs off the phase window, so it fires on
  // the payoff QUESTION rather than on the trigger, and `_pvp_apply_m4_fx` carries no
  // replay cursor of its own. This is the at-most-once guard. Keyed `side:dex`.
  const phasePayoffFiredRef = useRef<Set<string>>(new Set());
  // Azelf #482: the culled choice indices for the question currently on screen.
  // State (not a ref) because it must re-render the answer buttons.
  const [eliminatedChoices, setEliminatedChoices] = useState<number[]>([]);
  // M2 opponent-signature observer: the opponent's engine bumps `phaseIdx` to the
  // question number whenever THEIR signature fires. Watching that counter advance is
  // how a client-side row reacts to it (Celebi/Manaphy/Solgaleo/Lunala). Same
  // one-question reaction lag we already accept for Raging Bolt's Thunderclap.
  const oppSigPhaseIdxRef = useRef<number | null>(null);

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

  /**
   * M4 — fire the three server-owned channels a row may need when its trigger
   * fires. Each is a no-op unless the row's spec actually asks for it, and the
   * server no-ops again if it has no catalog row, so this is safe to call for
   * every engine row.
   *
   *  - engine_status: the row's `engine.status`. Before M4 nothing delivered these
   *    (statuses came from the legacy path) — 34 rows were silently inert.
   *  - m4_fx:         the instant KO + the Ruination halve. SERVER-rolled: a client
   *                   that could report its own KO would be an instant-win cheat.
   *  - m4_window:     shield / self-damage-zero / opponent-timer windows, written
   *                   into runtime for the OTHER side (or apply_pvp_live_answer_v2)
   *                   to read back.
   */
  function fireM4Channels(args: {
    engine: SignatureEngineSpec;
    dex: number;
    questionIndex: number;
    questionNo: number;
    triggerFired: boolean;
    disabled: boolean;
    side: "self" | "opponent";
    asBot: boolean;
  }): void {
    const { engine, dex, questionIndex, questionNo, triggerFired, disabled, side, asBot } = args;

    const runM4Fx = (): void => {
      void sigM4Fx(matchId, questionIndex, dex, asBot).then((res) => {
        if (!res.ok || res.noop) return;
        if (typeof res.hostHp === "number" && typeof res.guestHp === "number") {
          setMyHp(amIHost ? res.hostHp : res.guestHp);
          setOppHp(amIHost ? res.guestHp : res.hostHp);
        }
        if (res.instantKo) {
          const move = signatureMoveName(dex);
          notify(
            side === "self" ? "success" : "error",
            side === "self"
              ? `${move ?? "Signature"} — ONE-HIT KO!`
              : `${move ?? "Their signature"} knocked you out!`,
          );
        }
        emit({
          kind: "signature",
          side,
          partnerId: dex,
          hitsOpponent: true,
          questionIndex,
          dedupeKey: `${side}:m4fx:${questionIndex}:${dex}`,
        });
      });
    };

    // M5 — Cosmog #789. Its halve-HP is the PAYOFF of a phase window, so it lands on
    // the payoff question, and neither of the gates below can express that: its
    // trigger is `start_of_battle` (true only on q1) and its `once_per_battle` disable
    // is already spent by the time q4 comes round. Fire it off the question number
    // instead, before those gates — a fixed payoff index can only come up once, and
    // the ref keeps a re-render from halving twice.
    if (engine.phase?.payoffEffect && questionNo === phasePayoffIndex(engine.phase)) {
      const key = `${side}:${dex}`;
      if (!phasePayoffFiredRef.current.has(key)) {
        phasePayoffFiredRef.current.add(key);
        runM4Fx();
      }
    }

    if (!triggerFired || disabled) return;

    if (engine.status?.length) {
      void sigEngineStatus(matchId, questionIndex, dex, asBot).then((res) => {
        if (!res.ok || res.noop) return;
        useGameStore.setState({
          battleStatuses: (amIHost ? res.hostStatuses : res.guestStatuses) ?? [],
          opponentStatuses: (amIHost ? res.guestStatuses : res.hostStatuses) ?? [],
        });
        emit({
          kind: "signature",
          side,
          partnerId: dex,
          hitsOpponent: true,
          questionIndex,
          dedupeKey: `${side}:engine_status:${questionIndex}:${dex}`,
        });
      });
    }

    const wantsFx = engine.bespoke?.some((b) => b.fx === "instant_ko" || b.fx === "frac_hp_damage");
    if (wantsFx) runM4Fx();

    if (engine.shield || engine.nullifySelfDamage || engine.opponentTimer) {
      void sigM4Window(
        matchId,
        questionIndex,
        dex,
        {
          shieldQuestions: engine.shield?.questions,
          selfDmgZero: engine.nullifySelfDamage,
          oppTimerMs: engine.opponentTimer?.ms,
          oppTimerQuestions: engine.opponentTimer?.questions,
        },
        asBot,
      ).then((res) => {
        if (!res.ok || res.noop) return;
        const move = signatureMoveName(dex);
        if (engine.shield && side === "self") {
          notify("success", `${move ?? "Signature"} — no damage for ${engine.shield.questions} questions`);
        }
        if (engine.opponentTimer && side === "self") {
          notify("success", `${move ?? "Signature"} — their clock is down to ${engine.opponentTimer.ms / 1000}s`);
        }
      });
    }
  }

  // Fold a signature-engine tick result (both sides' stat stages) back into the
  // store. The tick returns ONLY stages + runtime (no statuses/HP), so unlike
  // applyAbilityResult this touches stages alone — the ATK/DEF/SPD/CRIT chips
  // then show the buff/debuff/revert live, consistent with the deliberate
  // no-stat-toast policy. Shared by the human and bot tick call sites.
  function foldSigTickStages(res: Awaited<ReturnType<typeof sigEngineTick>>): void {
    if (!res.ok || res.noop || !res.hostStages || !res.guestStages) return;
    useGameStore.setState({
      myStages: toStages(amIHost ? res.hostStages : res.guestStages),
      oppStages: toStages(amIHost ? res.guestStages : res.hostStages),
    });
  }

  // Human tick: fold the stages, then cue the two player-relevant transitions
  // read off my own partner's returned runtime — a cooldown/lockout onset and a
  // stat-revert (net contribution emptied). Deduped via refs so each fires once
  // per transition; nothing is announced that the tick didn't actually report.
  function applyHumanSigTick(res: Awaited<ReturnType<typeof sigEngineTick>>, dexId: number): void {
    foldSigTickStages(res);
    if (!res.ok || res.noop) return;
    const runtime = amIHost ? res.hostSigRuntime : res.guestSigRuntime;
    const entry = runtime?.[String(dexId)];
    if (!entry) return;
    const move = signatureMoveName(dexId);
    const wasDisabled = sigDisabledRef.current;
    sigDisabledRef.current = entry.disabled;
    const hasNet = Object.values(entry.netByStat).some((v) => v !== 0);
    const hadNet = sigNetActiveRef.current;
    sigNetActiveRef.current = hasNet;
    if (!move) return;
    if (!wasDisabled && entry.disabled) {
      notify("info", `${move} — signature on cooldown`);
    } else if (hadNet && !hasNet) {
      notify("info", `${move} — stat change wore off`);
    }
  }

  // Fold a server type-ability effect result (heal / stat / status / cure /
  // chip) back into local state — same shape as applyAbilityResult.
  function applyTypeAbilityResult(res: Awaited<ReturnType<typeof applyPvpTypeAbilityEffect>>): void {
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
    // A Confusion cure (Hydration, Toxic) clears the ENGINE's tick counter
    // server-side; the statuses payload can't express that, so the local badge
    // has to be dropped off this flag or it would linger with nothing behind it.
    if (res.confusionCured && selfConfusedTicksRef.current > 0) {
      selfConfusedTicksRef.current = 0;
      setSelfConfused(false);
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
      if (move) notify("success", `Mew copied ${move}!`);
    };
    if (target != null) {
      void setLivePvpTransform(matchId, target).then(finishTransform, finishTransform);
    } else {
      finishTransform();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawPartnerId, opponentPartnerId, displayedIndex]);

  // The partner's battle-start standing buff used to be applied here. Removed
  // 2026-07-13 (owner ruling): the effect was gated on `evaluateBattleStart(...)`
  // returning something, which it never did for an engine-owned row — and all 104
  // are engine-owned. The phase never fired, so this ran to completion and applied
  // nothing on every single match. An ability that buffs on entry now does it
  // through its own engine trigger (`start_of_battle`), which the tick handles.

  // Azelf #482 — resolve the culled options for the question now on screen. The
  // scheduler decided LAST question which question to cull and by how many; this
  // just draws it. Recomputed per question so the cull never leaks onto the next one.
  useEffect(() => {
    if (displayedIndex < 0) {
      setEliminatedChoices([]);
      return;
    }
    const q = questions[displayedIndex];
    if (!q) {
      setEliminatedChoices([]);
      return;
    }
    const culled = eliminatedChoiceIndices(
      bespokeFxRef.current,
      displayedIndex + 1,
      q.options.length,
      q.correct,
    );
    setEliminatedChoices(culled);
    if (culled.length > 0) {
      const move = signatureMoveName(partnerId);
      notify("success", `${move ?? "Future Sight"} cleared ${culled.length} wrong answer${culled.length === 1 ? "" : "s"}!`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedIndex]);

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
        if (move) notify("success", `${move} struck first!`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppCorrectLive]);

  // M2 — the `opponent_signature` observer (Celebi #251, Manaphy #490, Solgaleo #791,
  // Lunala #792). These rows fire in REACTION to the other side's signature, which the
  // client can't evaluate locally — so we watch the opponent's engine runtime on the
  // synced row. Their `phaseIdx` advancing to a new question number IS the fact that
  // their signature fired there. We then tick OUR engine with triggerFired = true and
  // let the server apply the payload; the client only observes, it never decides the
  // magnitude. Reaction lands a question late, exactly like Raging Bolt's Thunderclap.
  const oppSigRuntime = amIHost ? match.guestSigRuntime : match.hostSigRuntime;
  const oppPartnerForSig = opponentPartnerId;
  useEffect(() => {
    const engine = ability?.engine;
    if (partnerId == null || !engine || engine.trigger.type !== "opponent_signature") return;
    if (oppPartnerForSig == null || finishedRef.current) return;

    const theirPhaseIdx = oppSigRuntime?.[String(oppPartnerForSig)]?.phaseIdx ?? 0;
    const prev = oppSigPhaseIdxRef.current;
    oppSigPhaseIdxRef.current = theirPhaseIdx;
    // First observation only establishes the baseline — a mid-battle reconnect must
    // not replay every signature the opponent already fired.
    if (prev === null || theirPhaseIdx <= prev) return;

    const myIdx = Math.max(0, displayedIndex);
    if (myIdx < mySuppressedUntil) return; // my ability is locked
    const reactingDex = partnerId;

    void sigEngineTick(
      matchId,
      myIdx,
      reactingDex,
      true, // an observed opponent signature is the trigger; correctness is irrelevant
      true,
      engineToTickSpec(
        engine,
        { selfHp: myHp, oppHp },
        {
          oppType: oppPartnerForSig != null ? (findPokemon(oppPartnerForSig)?.types ?? []) : [],
          oppSpecies: oppPartnerForSig ?? -1,
        },
      ),
    ).then((tickRes) => {
      if (!tickRes.ok) return;
      applyHumanSigTick(tickRes, reactingDex);
      const runtime = (amIHost ? tickRes.hostSigRuntime : tickRes.guestSigRuntime)?.[
        String(reactingDex)
      ];
      if (runtime?.disabled) return; // row is on cooldown — observed, but it does not act
      const move = signatureMoveName(reactingDex);
      if (move) notify("success", `${move} answered their signature!`);

      const outcome = stepBespokeFx(engine.bespoke, bespokeFxRef.current, {
        questionNo: myIdx + 1,
        triggerFired: true,
        disabled: false,
        oppHpPct: oppHp / PVP_MAX_HP,
        predictedStatus: runtime?.predictedStatus ?? null,
      });
      bespokeFxRef.current = outcome.state;
      if (outcome.cue) notify("info", outcome.cue);
      if (outcome.fireBespoke) {
        void applyPvpSignatureEffect(matchId, myIdx, reactingDex, "bespoke").then((fxRes) => {
          if (fxRes.ok && !fxRes.noop) applyAbilityResult(fxRes);
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppSigRuntime, oppPartnerForSig]);

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

  // Stat-stage changes are no longer toasted (they flooded the feed and Regular
  // battle has no such toasts). The change is still visible: the ATK/DEF/SPD/CRIT
  // chips under each HP bar (StatChips) update live, and the ability toast that
  // caused it names the effect. Keeping this consistent with Solo.

  // Status-change feedback (#4 / Story 4): mirror the stat-stage diff above but
  // over the synced status lists — emit a cue on every gain/loss for either
  // side. This is the single catch-all regardless of which effect (item,
  // ability, weather) changed the row. `confused` is excluded: it is
  // client-authoritative (never on the synced row) and already cued directly in
  // applyConfused / tickConfusedOut, so this diff never double-announces it.
  const prevMyStatusesRef = useRef<ActiveStatus[] | null>(null);
  const prevOppStatusesRef = useRef<ActiveStatus[] | null>(null);
  useEffect(() => {
    const prevMine = prevMyStatusesRef.current;
    const prevOpp = prevOppStatusesRef.current;
    prevMyStatusesRef.current = myStatuses;
    prevOppStatusesRef.current = oppStatuses;
    if (prevMine === null || prevOpp === null) return; // skip initial mount
    const atIdx = Math.max(0, displayedIndexRef.current);
    const announce = (prev: ActiveStatus[], cur: ActiveStatus[], side: BattleSide) => {
      const prevKinds = new Set(prev.map((s) => s.kind));
      const curKinds = new Set(cur.map((s) => s.kind));
      for (const s of cur) {
        if (s.kind === "confused" || prevKinds.has(s.kind)) continue;
        emit({
          kind: "status-applied",
          side,
          status: s.kind as BattleStatusKind,
          questionIndex: atIdx,
          durationTicks: s.curesRemaining,
          dedupeKey: `${side}:status-applied:${atIdx}:${s.kind}`,
        });
      }
      for (const s of prev) {
        if (s.kind === "confused" || curKinds.has(s.kind)) continue;
        emit({
          kind: "status-expired",
          side,
          status: s.kind as BattleStatusKind,
          questionIndex: atIdx,
          dedupeKey: `${side}:status-expired:${atIdx}:${s.kind}`,
        });
      }
    };
    announce(prevMine, myStatuses, "self");
    announce(prevOpp, oppStatuses, "opponent");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myStatuses, oppStatuses]);

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
    notify("success", "Ho-Oh revived you!");
  }, [myRevived, partnerId, notify]);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(iv);
  }, []);

  // Battle intro (feedback f988a2b5) — the Pokéball-throw SFX must land WHEN the
  // "Get ready!" countdown ends and question 1 begins, NOT on raw mount.
  // Previously it fired on mount, during the countdown, so it was stepped on /
  // missed. Keyed to displayedIndex flipping to its first real question (>= 0,
  // set by enterQuestion the moment the shared wall-clock countdown reaches
  // question 1), mirroring Solo's send-out beat right before the first question.
  // Ref-guarded to fire exactly once. (The "Battle start!" banner was removed —
  // feedback 29fd5d73.)
  useEffect(() => {
    if (introThrowRef.current || displayedIndex < 0) return;
    introThrowRef.current = true;
    playSfx("pokeball_open");
  }, [displayedIndex]);

  // Opponent partner's cry — a beat after the throw, once BOTH the intro has
  // begun (countdown over, throw fired) and the opponent's species is known (the
  // guest registers its dex id on mount, which can land a beat after the
  // countdown). Mirrors Solo's revealPokemon ball-open → cry gap; ref-guarded to
  // fire once and never during the countdown. displayedIndex is in the deps so
  // this re-checks when the countdown ends (introThrowRef is a ref, not
  // reactive) even if the opponent id was already known.
  useEffect(() => {
    if (oppCryRef.current || !introThrowRef.current || opponentPartnerId == null) return;
    oppCryRef.current = true;
    const t = setTimeout(() => playCry(opponentPartnerId), 320);
    return () => clearTimeout(t);
  }, [opponentPartnerId, displayedIndex]);

  // Each side's ability (signature move or type ability) is no longer announced
  // with a start-of-battle toast — the tappable info popover on the combat panel
  // (chip) now surfaces the name + effect on demand, which keeps the opening
  // calm instead of firing several toasts before the first question.

  // Type-ability battle-start standing buff (Adaptable/Intimidate/Speed movers).
  // Server one-shots per side; fire once the first question has begun so the
  // ability id is registered on the row.
  useEffect(() => {
    if (taBattleStartFiredRef.current || !typeAbilityId || displayedIndex < 0) return;
    taBattleStartFiredRef.current = true;
    if (!typeAbilityHasBattleStart(typeAbilityId)) return;
    void applyPvpTypeAbilityEffect(matchId, 0, typeAbilityId, "battle_start").then((res) => {
      if (res.ok && !res.noop) {
        applyTypeAbilityResult(res);
        const a = getAbilityById(typeAbilityId);
        if (a) notify("success", `${a.name} activated!`, { description: typeWiring?.note });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeAbilityId, displayedIndex]);

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
  const basePersonalTimerMs = Math.max(
    4000,
    Math.min(QUESTION_SLOT_MS, isParalyzed ? Math.round(mySpeedTimerMs * 0.75) : mySpeedTimerMs),
  );
  // M4 — the Loyal Three (#1014/#1015/#1016) crush MY clock to 5s. The window lives
  // on THEIR sig_runtime (only the server writes it) and is read cross-side here,
  // because a timer can only be enforced on the screen it belongs to. It overrides
  // the Speed-stage timer rather than stacking with it, and the server has already
  // clamped the value — a tampered client cannot squeeze anyone below 3s.
  const oppTimerSqueezeMs = (() => {
    if (oppPartnerForSig == null) return null;
    const entry = oppSigRuntime?.[String(oppPartnerForSig)];
    if (!entry?.oppTimerMs || entry.disabled) return null;
    const questionNo = Math.max(0, displayedIndex) + 1;
    if ((entry.oppTimerThroughQ ?? -1) < questionNo) return null;
    return entry.oppTimerMs;
  })();
  const personalTimerMs = oppTimerSqueezeMs
    ? Math.min(basePersonalTimerMs, oppTimerSqueezeMs)
    : basePersonalTimerMs;
  const isAsleep = myStatuses.some((s) => s.kind === "sleep");
  const sleepLockMs = isAsleep ? personalTimerMs * 0.4 : 0;

  // Advance to a specific question index: re-anchor the personal timer, clear
  // the selection, and roll the Freeze skip. Shared by the wall-clock ceiling
  // and the both-answered early-advance so they converge on the same next
  // index (never double-entering or rewinding, gated by displayedIndexRef).
  function enterQuestion(nextIdx: number) {
    displayedIndexRef.current = nextIdx;
    setDisplayedIndex(nextIdx);
    setSelected(null);
    selectedRef.current = null;
    setFrozen(false);
    // Battle aids are per-question — clear last question's reveals.
    setRevealedCorrect(null);
    setRevealedWrong(null);
    // Type-ability reveal aids (Foresight every 5th Q, Compound Eyes on the
    // first & last of each set) — auto-reveal a wrong option for free.
    if (typeWiring?.revealsWrongAt?.(nextIdx)) {
      const qq = questions[nextIdx];
      if (qq) {
        const wrongs = qq.options.map((_, i) => i).filter((i) => i !== qq.correct);
        if (wrongs.length > 0) {
          setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
          const a = getAbilityById(typeAbilityId);
          if (a && typeWiring.fireNote) notify("info", typeWiring.fireNote);
        }
      }
    }
    questionStartRef.current = Date.now();

    // Freeze: skip this question outright, ~30% auto-thaw chance/question,
    // guaranteed thaw after 2 questions.
    const freezeStatus = myStatuses.find((s) => s.kind === "freeze");
    if (freezeStatus) {
      const thaws = freezeStatus.curesRemaining <= 1 || Math.random() < 0.3;
      setFrozen(true);
      if (thaws) tickBattleStatusCure("freeze");
    }
  }

  // Wall-clock ceiling: the shared per-question slot boundary. Only ever moves
  // forward — the both-answered path below may already have advanced us past
  // `idx`, so re-anchoring must never rewind or re-enter a question.
  useEffect(() => {
    if (finishedRef.current || idx <= displayedIndexRef.current) return;
    if (idx >= PVP_QUESTIONS || idx >= questions.length) {
      // Ran out of shared question slots without the server having already
      // resolved us (e.g. a near-simultaneous KO edge case) — the route will
      // pick up the resolution from the row update; just stop advancing.
      return;
    }
    // No-answer race fix (#6): if the slot we're leaving ran out with nothing
    // selected, resolve it as incorrect BEFORE advancing so it's actually
    // scored and feeds the consecutive-wrong → confused chain (#1). Guarded on
    // selectedRef + lastResolvedIdxRef so it never double-submits with the
    // personal-timeout effect. Frozen slots auto-forfeit (matching that effect)
    // and are skipped here.
    const leaving = displayedIndexRef.current;
    if (
      leaving >= 0 &&
      leaving > lastResolvedIdxRef.current &&
      selectedRef.current === null &&
      !frozen
    ) {
      selectedRef.current = -1;
      setSelected(-1);
      emit({
        kind: "answer-result",
        side: "self",
        questionIndex: leaving,
        correct: false,
        noAnswer: true,
        dedupeKey: `self:answer-result:${leaving}:no-answer`,
      });
      void resolveQuestion(leaving, false, personalTimerMs, null);
    }
    enterQuestion(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // Fix 3 — advance EARLY once BOTH sides have answered the current question,
  // instead of waiting out the full slot timer. Gated on the authoritative
  // per-side answered counters (host_answered_live / guest_answered_live) both
  // passing the current index: both clients observe the SAME row, so this keeps
  // a real 2-player match in lockstep (modulo realtime latency), and in Training
  // the bot's answer increments the guest counter through the same path. A short
  // delay lets the answer-feedback highlight land first; the wall-clock effect
  // above stays the hard ceiling so a stalling opponent can't hang the match.
  const bothAnsweredCount = Math.min(match.hostAnsweredLive, match.guestAnsweredLive);
  useEffect(() => {
    if (finishedRef.current || displayedIndex < 0) return;
    if (bothAnsweredCount <= displayedIndex) return; // both sides not done yet
    const nextIdx = displayedIndex + 1;
    if (nextIdx >= PVP_QUESTIONS || nextIdx >= questions.length) return;
    const t = setTimeout(() => {
      if (finishedRef.current || nextIdx <= displayedIndexRef.current) return;
      enterQuestion(nextIdx);
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothAnsweredCount, displayedIndex]);


  // Apply a client-authoritative `confused` to a side after 2 consecutive wrong
  // answers (#1). Idempotent while already confused. Never touches the synced
  // status row — the visual is merged in locally (selfConfused / oppConfused).
  function applyConfused(side: BattleSide, atIdx: number) {
    // Shield Dust blocks the chain outright, matching the authoritative
    // `confusedTicks` guard in engine/pvp-live-answer.ts. Both sides read the
    // same predicate so the badge can never disagree with the server.
    const sideAbilityId = side === "self" ? typeAbilityId : oppAbilityId;
    if (typeAbilityPreventsConfusion(sideAbilityId) && sideAbilityId) {
      if (!taActivatedRef.current.has(sideAbilityId)) {
        taActivatedRef.current.add(sideAbilityId);
        emit({
          kind: "type-ability",
          side,
          abilityId: sideAbilityId,
          hitsOpponent: false,
          questionIndex: atIdx,
          dedupeKey: `${side}:type-ability:${atIdx}:${sideAbilityId}`,
        });
      }
      return;
    }
    const ticksRef = side === "self" ? selfConfusedTicksRef : oppConfusedTicksRef;
    if (ticksRef.current > 0) return;
    ticksRef.current = CONFUSE_TICKS;
    if (side === "self") setSelfConfused(true);
    else setOppConfused(true);
    emit({
      kind: "status-applied",
      side,
      status: "confused",
      questionIndex: atIdx,
      durationTicks: CONFUSE_TICKS,
      dedupeKey: `${side}:status-applied:${atIdx}:confused`,
    });
  }

  // Consume one confused tick on a confusion miss; emit the expiry cue once it
  // ticks out. Mirrors the human's only-decrement-on-a-miss model.
  function tickConfusedOut(side: BattleSide, atIdx: number) {
    const ticksRef = side === "self" ? selfConfusedTicksRef : oppConfusedTicksRef;
    if (ticksRef.current <= 0) return;
    ticksRef.current -= 1;
    if (ticksRef.current > 0) return;
    if (side === "self") setSelfConfused(false);
    else setOppConfused(false);
    emit({
      kind: "status-expired",
      side,
      status: "confused",
      questionIndex: atIdx,
      dedupeKey: `${side}:status-expired:${atIdx}:confused`,
    });
  }

  async function resolveQuestion(
    idxAtAnswer: number,
    correct: boolean,
    elapsedMs: number,
    selectedOriginalIndex: number | null,
  ) {
    if (finishedRef.current) return;
    // No-double-submit guard (#6): each slot resolves exactly once. Protects the
    // no-answer ceiling resolve from racing the personal-timeout submit (indices
    // only advance, so this never blocks a legitimate later slot).
    if (idxAtAnswer <= lastResolvedIdxRef.current) return;
    lastResolvedIdxRef.current = idxAtAnswer;

    if (frozen) {
      // Freeze auto-forfeits the question: no damage either way, streak resets.
      // (Every call site already guards on `!frozen` before invoking this
      // function, so this is unreachable today — kept so a future caller
      // can't silently skip the reset if that ever changes.)
      setStreak(0);
      return;
    }

    // Ability-modified dmg/selfDmg, correctness (re-verified against the
    // server's own immutable `questions`), and the confusion-miss roll are
    // all computed server-side now (`resolvePvpAnswer`, Phase 4 cutover) —
    // this ONE round trip replaces both the local damage math that used to
    // live here AND the old `submit_pvp_live_answer` RPC call this function
    // used to make at the very end.
    const res = await resolvePvpLiveTurn(matchId, idxAtAnswer, selectedOriginalIndex, elapsedMs);
    if (!res.ok) return;
    const { result } = res;
    const landedHit = result.correct && !result.confusionMissed;

    setStreak(result.streak);

    if (result.correct) {
      // A landed correct answer breaks any building wrong-streak (#1). A
      // confusion miss below is still a `correct` answer, so it resets too —
      // no confused death-spiral.
      selfWrongStreakRef.current = 0;
      if (result.confusionMissed) {
        notify("warning", "🌀 Confused — your attack missed!");
        tickBattleStatusCure("confused");
        tickConfusedOut("self", idxAtAnswer);
      } else {
        answeredCategoriesRef.current.add(questions[idxAtAnswer]?.category ?? "");
        playSfx("correct");
      }
    } else {
      // Retain this miss for the defeat-screen review (feedback #1), mirroring
      // Solo's `missedRef` push (battle-screen.tsx:887-891). Every wrong path —
      // a real wrong answer, the no-answer ceiling resolve (#6), and the
      // personal-timeout — routes through this branch, and the
      // lastResolvedIdxRef guard above means each slot reaches here at most once,
      // so the route accumulates one entry per missed question with no dupes.
      // Lifted to route state (not `onFinish`) so it survives the opponent-
      // resolves-the-match unmount.
      const missedQ = questions[idxAtAnswer];
      if (missedQ) {
        onMissed?.({
          question: missedQ.question,
          correctAnswer: missedQ.options[missedQ.correct],
          explanation: missedQ.explanation,
        });
      }
      // Consecutive-wrong → confused (#1), mirroring Solo (battle-screen.tsx
      // :1035-1041). A genuine wrong answer builds the streak; at 2 the human
      // becomes confused. The no-answer ceiling resolve (#6) feeds this path too.
      selfWrongStreakRef.current += 1;
      if (selfWrongStreakRef.current === CONFUSE_AT) applyConfused("self", idxAtAnswer);
      playSfx("wrong");
      // Phase 1 — Moltres's Fiery Wrath builds a Wrath stack on each wrong
      // answer (capped at 3), unless the ability is currently suppressed. The
      // new count is persisted to the authoritative row (server-clamped).
      // L2 de-dup: skipped once Moltres carries an `engine` spec — the engine's
      // own ramp/expiry lifecycle replaces the legacy stack counter (see the
      // discharge site Phase 6 will remove — falsified dead per CLAUDE.md,
      // untouched here to keep this PR to the trust-boundary change only).
      if (partnerId === 146 && !ability?.engine && idxAtAnswer >= mySuppressedUntil) {
        const next = nextWrathStacks(wrathStacksRef.current, false);
        if (next !== wrathStacksRef.current) {
          wrathStacksRef.current = next;
          void applyPvpSignatureEffect(matchId, idxAtAnswer, 146, "sig_state", next);
        }
      }
    }

    // ── TYPE ability wiring (feedback 29fd5d73) ───────────────────────────────
    // The dmg/self-dmg mods themselves (Sturdy's clamp, Sand Force's streak
    // save, Moxie's bonus, …) are folded server-side now (`resolvePvpAnswer`,
    // Phase 4 cutover) — this block only drives the player-visible toast off
    // the server's activation flags, plus the SEPARATE server-catalog
    // post_answer effect (heals/stats/statuses/cures/chip), which
    // `resolvePvpAnswer` deliberately does not cover (see
    // engine/pvp-live-answer.ts's module header).
    if (typeAbilityId && typeWiring) {
      // Both representations count. PvP confusion normally lives in the
      // engine's tick counter (mirrored locally by selfConfusedTicksRef) and
      // never reaches the status row, so a cure keyed on the row alone would
      // never fire against the common case — the Shield Dust bug, which
      // Hydration and Toxic shared.
      const hasConfused =
        myStatuses.some((s) => s.kind === "confused") || selfConfusedTicksRef.current > 0;
      const hasPoisoned = myStatuses.some(
        (s) => s.kind === "poisoned" || s.kind === "badly-poisoned",
      );
      const taCtx: TypeAbilityCtx = {
        correct: landedHit,
        selfHpPct: myHp / PVP_MAX_HP,
        oppHpPct: oppHp / PVP_MAX_HP,
        streakAfter: result.streak,
        answerElapsedMs: elapsedMs,
        personalTimerMs,
        questionIndex: idxAtAnswer,
        prevCorrect: prevCorrectRef.current,
        hadWrong: hadWrongRef.current,
        correctCount: result.correctCount,
        moxieStacks: 0, // only the (now server-side) damage mod ever read this
        hasNegativeStatus: hasConfused || hasPoisoned,
        hasConfused,
        hasPoisoned,
      };

      // Fire-note helper: announce a conditional type ability's activation once
      // per battle, via the single cue path (wording resolved by the hook from
      // the ability id — never duplicated here).
      const toastFireOnce = () => {
        if (typeWiring.fireNote && !taActivatedRef.current.has(typeAbilityId)) {
          taActivatedRef.current.add(typeAbilityId);
          emit({
            kind: "type-ability",
            side: "self",
            abilityId: typeAbilityId,
            hitsOpponent: false,
            questionIndex: idxAtAnswer,
            dedupeKey: `self:type-ability:${idxAtAnswer}:${typeAbilityId}`,
          });
        }
      };

      // Covers the damage mod, the self-dmg mod, and Sand Force's streak-save —
      // the server (`toastNotices` in pvp-live-resolve-turn) recomputes the same
      // pure activation predicates this block used to call directly.
      if (result.typeAbilityModFired) toastFireOnce();
      // Sturdy's save always announces (not gated once-per-battle, matching the
      // original inline `notify` here rather than `toastFireOnce`).
      if (result.sturdyFired && typeWiring.fireNote) {
        notify("success", typeWiring.fireNote);
      }

      // Server catalog post_answer effect (heal / stat / status / cure / chip).
      // Torrent's sub-30% heal is one-time; every other predicate is self-gating.
      if (typeAbilityPostAnswerFires(typeAbilityId, taCtx)) {
        const torrentBlocked = typeAbilityId === "torrent" && torrentFiredRef.current;
        if (!torrentBlocked) {
          if (typeAbilityId === "torrent") torrentFiredRef.current = true;
          void applyPvpTypeAbilityEffect(matchId, idxAtAnswer, typeAbilityId, "post_answer").then(
            (taRes) => {
              if (taRes.ok && !taRes.noop) {
                applyTypeAbilityResult(taRes);
                toastFireOnce();
              }
            },
          );
        }
      }

      if (!result.correct) hadWrongRef.current = true;
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
    if (suppressedNow && ability && ability.wiring === "post_answer") {
      // Ability locked this question — show a distinct toast at most once per
      // suppression window, and consume no resource.
      if (suppressToastedForRef.current !== mySuppressedUntil) {
        suppressToastedForRef.current = mySuppressedUntil;
        const move = signatureMoveName(partnerId);
        notify("warning", `${move ?? "Signature move"} suppressed!`);
      }
    }

    // signature-rework M1 — run the server-authoritative signature engine once
    // per human answer, UNCONDITIONALLY (never gated by a "should fire" check;
    // the engine itself decides no-op). It owns the ramp/decay/revert/disable
    // lifecycle so stat buffs EXPIRE instead of compounding. Only rows carrying
    // an `engine` spec have anything to tick; the DUAL-FIRE type-ability blocks
    // above and the bespoke post_answer path are untouched (R1). `triggerFired`
    // comes straight from the server now — it's the exact same formula this
    // block used to recompute locally (same trigger/streak/questionIndex/
    // selfAfflicted/HP-pct inputs), just no longer duplicated client-side.
    const tickEngine = ability?.engine;
    if (partnerId != null && tickEngine) {
      const answeredDex = partnerId;
      void sigEngineTick(
        matchId,
        idxAtAnswer,
        answeredDex,
        result.correct,
        result.triggerFired,
        engineToTickSpec(
          tickEngine,
          { selfHp: myHp, oppHp },
          {
            oppType:
              opponentPartnerId != null ? (findPokemon(opponentPartnerId)?.types ?? []) : [],
            oppSpecies: opponentPartnerId ?? -1,
          },
        ),
      ).then((tickRes) => {
        if (!tickRes.ok) {
          if (!sigTickErrorRef.current) {
            sigTickErrorRef.current = true;
            toast.error("Signature engine unavailable — stat effects may not update.");
          }
          return;
        }
        applyHumanSigTick(tickRes, answeredDex);
        // M3 — bespoke scheduling runs AFTER the tick so `disabled` and the rolled
        // `predictedStatus` come from authoritative runtime rather than a local guess.
        const runtime = (amIHost ? tickRes.hostSigRuntime : tickRes.guestSigRuntime)?.[
          String(answeredDex)
        ];
        const outcome = stepBespokeFx(tickEngine.bespoke, bespokeFxRef.current, {
          questionNo: idxAtAnswer + 1,
          triggerFired: result.triggerFired,
          disabled: runtime?.disabled ?? false,
          oppHpPct: oppHp / PVP_MAX_HP,
          predictedStatus: runtime?.predictedStatus ?? null,
        });
        bespokeFxRef.current = outcome.state;
        if (outcome.cue) notify("info", outcome.cue);
        if (outcome.fireBespoke) {
          void applyPvpSignatureEffect(matchId, idxAtAnswer, answeredDex, "bespoke").then(
            (fxRes) => {
              if (!fxRes.ok || fxRes.noop) return;
              applyAbilityResult(fxRes);
              emit({
                kind: "signature",
                side: "self",
                partnerId: answeredDex,
                hitsOpponent: true,
                questionIndex: idxAtAnswer,
                dedupeKey: `self:bespoke:${idxAtAnswer}:${answeredDex}`,
              });
            },
          );
        }
        // M4 — the three server-owned channels, fired only on a live trigger.
        fireM4Channels({
          engine: tickEngine,
          dex: answeredDex,
          questionIndex: idxAtAnswer,
          questionNo: idxAtAnswer + 1,
          triggerFired: result.triggerFired,
          disabled: runtime?.disabled ?? false,
          side: "self",
          asBot: false,
        });
        // Signature moves are automatic (owner ruling 2026-07-13): the row's
        // manual-phase effects fire on its own trigger now, not on a button tap.
        if (result.triggerFired && !(runtime?.disabled ?? false)) {
          void fireCappedPayload(idxAtAnswer);
        }
      });
    }

    prevCorrectRef.current = result.correct;
    correctCountRef.current = result.correctCount;

    const myNewHp = amIHost ? result.hostHp : result.guestHp;
    // Ho-Oh's Rainbow Rebirth: we took lethal self-damage this question yet the
    // authoritative server kept us alive (revived to 25% HP) — announce it once.
    if (
      partnerId === 250 &&
      !rainbowRebirthToastedRef.current &&
      result.selfDmg > 0 &&
      myHp - result.selfDmg <= 0 &&
      myNewHp > 0
    ) {
      rainbowRebirthToastedRef.current = true;
      notify("success", "Ho-Oh revived you!");
    }
    setMyHp(amIHost ? result.hostHp : result.guestHp);
    setOppHp(amIHost ? result.guestHp : result.hostHp);
    if (result.resolved && !finishedRef.current) {
      finishedRef.current = true;
      const myFinalHp = amIHost ? result.hostHp : result.guestHp;
      const oppFinalHp = amIHost ? result.guestHp : result.hostHp;
      const won = result.winnerId ? result.winnerId === myId : null;
      onFinish({ resolved: true, won, hp: myFinalHp, oppHp: oppFinalHp });
    }
  }

  function handleAnswer(choiceIndex: number) {
    if (selected !== null || displayedIndex < 0 || frozen) return;
    const q = questions[displayedIndex];
    // Haptics parity with Regular battle: a short buzz on a correct answer, a
    // triple-buzz on a wrong one (no-op where the Vibration API is unavailable).
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(choiceIndex === q.correct ? 30 : [50, 30, 50]);
      } catch {
        /* ignore */
      }
    }
    setSelected(choiceIndex);
    selectedRef.current = choiceIndex;
    const elapsedMs = Date.now() - questionStartRef.current;
    const selectedOriginalIndex = orders[displayedIndex]?.[choiceIndex] ?? null;
    void resolveQuestion(displayedIndex, choiceIndex === q.correct, elapsedMs, selectedOriginalIndex);
  }

  // Auto-timeout: if the personal timer expires with nothing selected, count
  // as a wrong/missed answer.
  useEffect(() => {
    if (displayedIndex < 0 || selected !== null || finishedRef.current || frozen) return;
    const deadline = questionStartRef.current + personalTimerMs;
    if (Date.now() >= deadline) {
      setSelected(-1);
      selectedRef.current = -1;
      void resolveQuestion(displayedIndex, false, personalTimerMs, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedIndex, selected, now, frozen]);

  // The bot's battle-start standing buff was applied here. Removed 2026-07-13 for
  // the same reason as the human one above — it could never fire, so the bot was
  // already playing without it. Deleting it changes no behaviour.

  // Bot driver — one move per question. The bot's correctness/timing/dmg are
  // rolled and computed entirely server-side now (`resolvePvpAnswer` via the
  // Edge Function's op:"bot_turn", Phase 5 cutover) from the match's own
  // persisted `guest_bot_profile` — this client never supplies an outcome.
  // The call fires as soon as it's the bot's turn; the RETURNED `timeMs`
  // paces the local reveal (toasts/HP/animations) so the pacing still looks
  // like the bot "thought" for that long, without the client needing to guess
  // the delay up front. Its own HP damage, ability debuffs, and item effects
  // all land on the authoritative row, so the human's defensive/debuff play
  // still matters; the bot doesn't model skipping its own turn for
  // Freeze/Sleep/Paralysis (training simplification).
  useEffect(() => {
    if (!match.isBotMatch || displayedIndex < 0 || finishedRef.current) return;
    if (botLastIdxRef.current >= displayedIndex) return;
    botLastIdxRef.current = displayedIndex;
    if (!botProfileRef.current) botProfileRef.current = rollBotProfile();
    const p = botProfileRef.current;
    const botPartnerId = match.guestPartnerId;
    const botAbility = botPartnerId != null ? signatureAbilityFor(botPartnerId) : null;
    const idxAtAnswer = displayedIndex;
    let cancelled = false;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;

    void resolveBotPvpTurn(matchId, idxAtAnswer).then((res) => {
      if (cancelled || finishedRef.current || !res.ok) return;
      const { result } = res;
      const revealDelay = Math.min(result.timeMs, Math.max(0, personalTimerMs - 250));
      revealTimer = setTimeout(() => {
        if (finishedRef.current) return;

        // Bot confusion (#1 mirror): the server already rolled whether this
        // otherwise-correct answer missed from confusion; this only drives
        // the local badge/cue, same helper the human's own confusion uses.
        if (result.correct && result.confusionMissed) {
          tickConfusedOut("opponent", idxAtAnswer);
        }
        // Consecutive-wrong → confused for the bot (#1). A genuine wrong answer
        // builds the streak; a correct answer (even a confusion miss) resets it.
        if (result.correct) {
          botStreakRef.current = result.streak;
          botWrongStreakRef.current = 0;
        } else {
          botStreakRef.current = 0;
          botWrongStreakRef.current += 1;
          if (botWrongStreakRef.current === CONFUSE_AT) applyConfused("opponent", idxAtAnswer);
        }

        if (result.resolved && !finishedRef.current) {
          finishedRef.current = true;
          const won = result.winnerId ? result.winnerId === myId : null;
          onFinish({ resolved: true, won, hp: result.hostHp, oppHp: result.guestHp });
        } else {
          setMyHp(result.hostHp);
          setOppHp(result.guestHp);
        }

        // signature-rework M1 — run the engine tick for the bot's (guest) answer
        // once per question, UNCONDITIONALLY (NOT gated by botShouldFireAbility —
        // that gate stays for the bespoke fire below). Rows with an `engine` spec
        // only. `triggerFired` comes straight from the server now — the same
        // formula this block used to recompute locally.
        const botTickEngine = botAbility?.engine;
        if (botPartnerId != null && botTickEngine) {
          void botSigEngineTick(
            matchId,
            idxAtAnswer,
            botPartnerId,
            result.correct,
            result.triggerFired,
            // The bot IS the opponent from this (host) client's view, so its own HP
            // is `oppHp` and the HP it faces is ours.
            // The bot's "opponent" is US, so its matchup conditions read OUR types.
            engineToTickSpec(
              botTickEngine,
              { selfHp: oppHp, oppHp: myHp },
              { oppType: myPokemon?.types ?? [], oppSpecies: partnerId ?? -1 },
            ),
          ).then((tickRes) => {
            foldSigTickStages(tickRes);
            const botEntry = tickRes.guestSigRuntime?.[String(botPartnerId)];
            // M3 — the bot schedules its bespoke rows on the same rules we do (owner
            // ruling 5: the bot runs its signature identically to a human). HP is
            // mirrored: the bot's "opponent" is us.
            const botOutcome = stepBespokeFx(botTickEngine.bespoke, botBespokeFxRef.current, {
              questionNo: idxAtAnswer + 1,
              triggerFired: result.triggerFired,
              disabled: botEntry?.disabled ?? false,
              oppHpPct: myHp / PVP_MAX_HP,
              predictedStatus: botEntry?.predictedStatus ?? null,
            });
            botBespokeFxRef.current = botOutcome.state;
            if (botOutcome.fireBespoke) {
              void applyBotPvpSignatureEffect(matchId, idxAtAnswer, botPartnerId, "bespoke");
            }
            // M4 — the bot gets the same three server-owned channels. It can KO us
            // with Urshifu, shield itself with Zamazenta and crush our clock with the
            // Loyal Three, exactly as a human holding those rows could.
            fireM4Channels({
              engine: botTickEngine,
              dex: botPartnerId,
              questionIndex: idxAtAnswer,
              questionNo: idxAtAnswer + 1,
              triggerFired: result.triggerFired,
              disabled: botEntry?.disabled ?? false,
              side: "opponent",
              asBot: true,
            });
          });
        }
        if (
          botShouldUseItem(p, {
            hpPct: oppHp / PVP_MAX_HP,
            itemsRemaining: MAX_ITEMS_PER_BATTLE - match.guestItemsUsed,
          })
        ) {
          void applyBotPvpLiveItem(matchId, idxAtAnswer, "superpotion");
        }
      }, revealDelay);
    });

    return () => {
      cancelled = true;
      if (revealTimer) clearTimeout(revealTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedIndex, match.isBotMatch]);

  async function handleUseItem(itemId: ItemId) {
    if (itemsUsedRef.current >= MAX_ITEMS_PER_BATTLE) {
      toast.error(`Only ${MAX_ITEMS_PER_BATTLE} items per battle.`);
      return;
    }
    const def = ITEMS.find((i) => i.id === itemId);
    if (!def) return;
    if (usedItemIdsRef.current.has(itemId)) {
      toast.error(`You already used a ${def.name} this battle.`);
      return;
    }

    if (CLIENT_ONLY_ITEMS.includes(itemId)) {
      // Pure client-side UI aid — no server round trip, mirrors Solo exactly.
      // Apply the actual reveal so the aid does something (feedback b9d53ba1):
      // X Accuracy highlights the correct option; Scope dims a random wrong one.
      const q = questions[displayedIndex];
      if (q) {
        if (itemId === "xaccuracy") {
          setRevealedCorrect(q.correct);
        } else if (itemId === "scope") {
          const wrongs = q.options.map((_, i) => i).filter((i) => i !== q.correct);
          setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
        }
      }
      useGameStore.getState().useItem(itemId);
      usedItemIdsRef.current.add(itemId);
      // Announce via the single cue path (wording resolved by the hook from the
      // item id), same shape as the opponent-item cue the route emits.
      emit({
        kind: "item",
        side: "self",
        itemId,
        hitsOpponent: false,
        questionIndex: Math.max(0, displayedIndex),
        dedupeKey: `self:item:${Math.max(0, displayedIndex)}:${itemId}`,
      });
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
    usedItemIdsRef.current.add(itemId);
    const myHpAfter = amIHost ? res.hostHp : res.guestHp;
    const healedHp = Math.max(0, Math.round(myHpAfter - myHp));
    setMyHp(myHpAfter);
    setOppHp(amIHost ? res.guestHp : res.hostHp);
    useGameStore.setState({
      myStages: amIHost ? res.hostStages : res.guestStages,
      oppStages: amIHost ? res.guestStages : res.hostStages,
      battleStatuses: amIHost ? res.hostStatuses : res.guestStatuses,
      opponentStatuses: amIHost ? res.guestStatuses : res.hostStatuses,
    });
    // Announce via the single cue path so the player understands the HP/stat
    // change they just triggered. An offensive berry hits the opponent; the
    // hook resolves wording (name + short effect) from the item id.
    emit({
      kind: "item",
      side: "self",
      itemId,
      hitsOpponent: def.berry?.target === "opponent",
      healedHp: healedHp > 0 ? healedHp : undefined,
      questionIndex: Math.max(0, displayedIndex),
      dedupeKey: `self:item:${Math.max(0, displayedIndex)}:${itemId}`,
    });
    setBagOpen(false);
  }

  /**
   * Owner ruling 2026-07-13: signature moves are AUTOMATIC — a player never taps a
   * Fire button. A row's `manual`-phase effects (Heatran's ability-lock, Manaphy's
   * stat-swap, Terapagos's stat burst, Cresselia's cleanse, the Ruination stat
   * strips…) now fire off the row's OWN engine trigger, still capped at the uses
   * they always had. The cap is enforced server-side as before; the local counter
   * just stops us spamming the RPC once it is spent.
   *
   * Called from the engine tick, on a question where the trigger genuinely fired
   * and the row is not disabled or suppressed.
   */
  async function fireCappedPayload(questionIndex: number) {
    if (!hasPayload || partnerId == null || finishedRef.current) return;
    if (payloadUsedRef.current >= payloadCap) return;
    if (questionIndex < mySuppressedUntil) return;
    if (payloadFiringRef.current) return;

    payloadFiringRef.current = true;
    // Same server-validated path as berries: the client only names WHICH partner
    // fired and on what phase; the server looks up the fixed magnitude by dex id
    // and enforces the per-battle cap (returns noop/'no_charges' if exceeded).
    const res = await applyPvpSignatureEffect(
      matchId,
      Math.max(0, questionIndex),
      partnerId,
      "manual",
      pokedexCount,
    );
    payloadFiringRef.current = false;
    if (!res.ok) return;
    if (res.noop) {
      // Server-enforced cap reached (or nothing to apply) — sync the local counter.
      payloadUsedRef.current = payloadCap;
      setPayloadUsed(payloadCap);
      return;
    }
    payloadUsedRef.current += 1;
    setPayloadUsed((n) => n + 1);
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
    if (move) notify("success", `${move}!`);
    emit({
      kind: "signature",
      side: "self",
      partnerId,
      hitsOpponent: true,
      questionIndex: Math.max(0, questionIndex),
      dedupeKey: `self:manual:${Math.max(0, questionIndex)}:${partnerId}`,
    });
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

  // Merge the client-authoritative confused overlay into the displayed status
  // lists (#1) so the chip + sprite show it, without ever writing it to the
  // synced status row (realtime row-sync would otherwise clobber it — §8).
  const mergeConfused = (list: ActiveStatus[], on: boolean, ticks: number): ActiveStatus[] =>
    on && !list.some((s) => s.kind === "confused")
      ? [...list, { kind: "confused" as StatusKind, curesRemaining: ticks, appliedAt: 0 }]
      : list;
  const myStatusesDisplay = mergeConfused(myStatuses, selfConfused, selfConfusedTicksRef.current);
  const oppStatusesDisplay = mergeConfused(oppStatuses, oppConfused, oppConfusedTicksRef.current);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-battle-field">
      {/* TOP BAR — round pill (Solo-style), signature-fire (timer floats above the card) */}
      <div className="flex shrink-0 items-center justify-between gap-2 pt-[calc(env(safe-area-inset-top)+1rem)] pb-1 px-[max(1.25rem,env(safe-area-inset-left))]">
        <div className="flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 font-pixel text-[9px] text-foreground shadow-card backdrop-blur">
          QUESTION {displayedIndex + 1}/{PVP_QUESTIONS}
        </div>
        <div className="flex items-center gap-2">
          {/* Owner ruling 2026-07-13: signature moves are AUTOMATIC. The Fire button
              is gone — a row's manual-phase effects now fire off its own engine
              trigger (see `fireCappedPayload`), still capped at the uses they always
              had. The signature name and what it does stay visible on the combat
              panel's ability chip. */}
          {hasPayload && (
            <div
              title={signatureMoveName(partnerId) ?? "Signature move"}
              className="flex items-center gap-1 rounded-full bg-card/90 px-3 py-1.5 font-pixel text-[9px] text-foreground shadow-card backdrop-blur"
            >
              {displayedIndex < mySuppressedUntil && (
                <AppIcon src={LOCK_ICON} className="h-2.5 w-2.5" />
              )}{" "}
              {signatureMoveName(partnerId)}
              <span className="tabular-nums opacity-70">
                {displayedIndex < mySuppressedUntil
                  ? "locked"
                  : `${Math.max(0, payloadCap - payloadUsed)}/${payloadCap}`}
              </span>
            </div>
          )}
          {/* No chat entry point here by design (owner ruling 2026-07-26):
              chat lives on the Battle Arena screen and on the post-battle
              result screen, never mid-battle. */}
        </div>
      </div>

      {/* COMBAT ARENA — FRLG diagonal layout, mirroring Solo */}
      <div className="relative min-h-0 flex-1 px-[max(1.25rem,env(safe-area-inset-left))] py-2">
        {/* OPPONENT ZONE: panel top-left, sprite top-right */}
        <div className="flex items-start justify-between">
          <PvpCombatPanel
            align="left"
            name={oppEntry?.name ?? opponentName}
            types={oppTypes}
            hp={oppHp}
            stages={oppStages}
            abilities={oppAbilities}
          />
          <div className="mt-2">
            <ArenaSprite
              id={opponentPartnerId}
              back={false}
              shake={shakeWho === "opponent"}
              floatN={floatDmg?.who === "opponent" ? floatDmg.n : null}
              statuses={oppStatusesDisplay}
              confused={oppConfused}
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
            statuses={myStatusesDisplay}
            confused={selfConfused}
          />
          <PvpCombatPanel
            align="right"
            name={myPokemon?.name ?? findPokemon(partnerId ?? -1)?.name ?? "You"}
            types={myTypes}
            hp={myHp}
            stages={myStages}
            abilities={myAbilities}
          />
        </div>
      </div>

      {/* QUESTION CARD — thumb zone, pinned bottom, floating timer pill above */}
      <div className="relative shrink-0 rounded-t-[28px] bg-card px-[max(1rem,env(safe-area-inset-left))] pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-14 shadow-[0_-8px_30px_-12px_oklch(0.3_0.05_260/0.25)]">
        <div className="relative">
          <div className="pointer-events-none absolute left-1/2 -top-12 z-10 flex -translate-x-1/2 flex-col items-center">
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
                  // Battle aids (feedback b9d53ba1) — only while unanswered. Azelf's
                  // Future Sight culls a rolled set of wrong options and reuses the
                  // same dimmed/disabled treatment, so the two aids read identically.
                  const isDimmed =
                    selected === null && (revealedWrong === i || eliminatedChoices.includes(i));
                  const isHinted = selected === null && revealedCorrect === i;
                  return (
                    <button
                      key={i}
                      data-testid={`option-${i}`}
                      disabled={selected !== null || isDimmed}
                      onClick={() => handleAnswer(i)}
                      className={`min-h-[48px] rounded-2xl border-2 px-4 py-3 text-left font-display text-base transition active:scale-[0.98] ${
                        showState && isCorrectOpt
                          ? "border-hp-good bg-hp-good/15 text-hp-good"
                          : showState && isSelected && !isCorrectOpt
                            ? "border-destructive bg-destructive/10 text-destructive"
                            : isDimmed
                              ? "border-border/60 line-through opacity-50"
                              : isHinted
                                ? "border-hp-good bg-hp-good/10 text-hp-good"
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

              {/* Item shortcuts row — matches Solo's bag placement inside the question card */}
              <div className="mt-3 flex items-center justify-center gap-3">
                <button
                  onClick={() => setBagOpen(true)}
                  className="relative flex h-12 w-12 items-center justify-center rounded-full bg-muted shadow-sm transition active:scale-95"
                >
                  <Backpack className="h-6 w-6 text-muted-foreground" />
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-poke-dark px-1 font-pixel text-[9px] text-white">
                    {itemsUsedRef.current}/{MAX_ITEMS_PER_BATTLE}
                  </span>
                </button>
                {bagItems.slice(0, 3).map((it) => (
                  <button
                    key={it.id}
                    disabled={
                      itemsUsedRef.current >= MAX_ITEMS_PER_BATTLE ||
                      usedItemIdsRef.current.has(it.id)
                    }
                    onClick={() => void handleUseItem(it.id)}
                    className="relative flex h-12 w-12 items-center justify-center rounded-full bg-muted shadow-sm transition active:scale-95 disabled:opacity-40"
                  >
                    <ItemIcon item={it} className="h-8 w-8" />
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
          )}
        </div>
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
                    <div className="font-display-md text-foreground">Your bag is empty</div>
                    <p className="mt-1 text-xs text-foreground/60">
                      Play more PvP battles to earn berries!
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
                            const disabled =
                              itemsUsedRef.current >= MAX_ITEMS_PER_BATTLE ||
                              usedItemIdsRef.current.has(it.id);
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
