// ─────────────────────────────────────────────────────────────────────────────
// signature-rework-types.ts — signature-rework M1 contract surface.
//
// The trigger / stat / disable / multiplier / phase / bespoke / engine-spec
// vocabulary that was FROZEN here as a standalone stub has now been MERGED into
// the real catalog module (`signature-abilities.ts`). This file is kept
// compiling as a thin re-export so any importer that still points at
// `signature-rework-types` resolves to the canonical definitions, and so the
// SERVER-side contract types below (runtime blob + RPC args/result — owned by
// DB/Backend, NOT the catalog) have a stable home.
//
// Frontend Engineer (shard A) owns the merge; see
// docs/handoffs/signature-rework/03-frontend-a.md.
// ─────────────────────────────────────────────────────────────────────────────

// ── Canonical vocabulary — now defined in signature-abilities.ts ─────────────
export { SIG_BATTLE_QUESTIONS, SIG_STAGE_CLAMP, SIG_STACK_CAP } from "./signature-abilities";
export type {
  SideRef,
  TriggerEvalSite,
  NewSignatureTrigger,
  RampStatSpec,
  OneShotStatSpec,
  DecayStatSpec,
  StatChangeSpec,
  DisableSpec,
  MultiplierCondition,
  DamageMultiplierSpec,
  PhaseWindowSpec,
  FixedIndexSpec,
  BespokeEffectRef,
  SignatureEngineSpec,
} from "./signature-abilities";
export type { PvpStat, StatusKind } from "./game-data";

import type { SignatureEngineSpec } from "./signature-abilities";

// ── 7. Server-owned per-ability, per-side runtime state ──────────────────────
// Stored in NEW columns pvp_live_matches.host_sig_runtime / guest_sig_runtime
// (jsonb, default '{}'), keyed by ability dex id (string). Owned by Database +
// Backend (not the catalog); kept here as the frozen cross-builder contract.
export interface SigRuntimeEntry {
  /** Ramp stacks currently applied (0..SIG_STACK_CAP). */
  stacks: number;
  /** This ability's net signed contribution to each stage map it touched, so a
   *  multi-stat row reverts EVERY stat it moved (not just the first). Keyed
   *  `"<target>:<stat>"` where target ∈ {"self","opp"} and stat is a PvpStat,
   *  e.g. `"opp:def": -2`. Empty when the ability has applied nothing. */
  netByStat: Record<string, number>;
  /** Consecutive incorrect answers since last correct (resets to 0 on correct). */
  consecutiveWrong: number;
  /** Hard-disabled (once-per-battle spent, or disable-whole threshold met). */
  disabled: boolean;
  /** Only the increase portion disabled; decay may continue (Deoxys/Magearna). */
  increaseDisabled: boolean;
  /** Fired at least once (battle_start / once-per-battle bookkeeping). */
  firedThisBattle: boolean;
  /** 1-indexed question at which the trigger last fired (decay/phase origin). */
  phaseIdx: number;
  /** One-shot "next question disabled" — the question index to skip (Mewtwo/Entei/Jirachi). */
  disabledUntilQ: number;
  /** Jirachi #385: 1-indexed question at which the armed delayed strike lands.
   *  Absent/0 when no strike is pending. */
  pendingStrikeAtQ?: number;
  /** Uxie #23: the status rolled at reveal time. The status later inflicted MUST
   *  equal this value (owner ruling: prediction and infliction are the same). */
  predictedStatus?: string;
  /** M4 — Zamazenta #889 / Iron Boulder #1022: the last 1-indexed question on which
   *  this side takes ZERO damage. Written by pvp_sig_m4_window; read by
   *  submit_pvp_live_answer off the DEFENDER's runtime (the attacker computes the
   *  damage, so only the server can throw it away). */
  shieldThroughQ?: number;
  /** M4 — Eternatus #890: while true, this side's WRONG-ANSWER self-damage is 0.
   *  The opponent's hits still land in full (owner ruling 2026-07-12). */
  selfDmgZero?: boolean;
  /** M4 — the Loyal Three (#1014/#1015/#1016): force the OPPONENT's answer timer
   *  down to `oppTimerMs` through question `oppTimerThroughQ`. Lives on the
   *  OWNER's runtime and is read CROSS-SIDE by the victim's client, which is the
   *  only place a timer can actually be enforced. */
  oppTimerMs?: number;
  oppTimerThroughQ?: number;
}
export type SigRuntimeMap = Record<string, SigRuntimeEntry>; // key = dex id as string

// ── 9. Server RPC contract (frozen) ──────────────────────────────────────────
/** New server-authoritative turn resolver. Owns ALL runtime bookkeeping:
 *  consecutiveWrong update, stack increment, decay tick, disable/revert,
 *  once-per-battle, next-question-skip. Additive to apply_pvp_signature_effect
 *  (which keeps battle_start/manual/one-shot/bespoke phases). */
export interface SigEngineTickArgs {
  _match_id: string;
  _question_index: number; // 0-indexed as the loop passes it; server maps to 1-indexed
  _pokemon_id: number;
  _correct: boolean;
  _trigger_fired: boolean; // client-evaluated deterministic predicate (site="client")
  _stat_specs?: unknown[]; // StatChangeSpec[] the server applies/tracks per netByStat key
  _disable_kind?: string; // "none" | disable-effect kind for this row
  _disable_n?: number; // threshold N for disable-after-N kinds
  _disable_next_question?: boolean; // one-shot next-question skip (Mewtwo/Entei/Jirachi)
  _stack_cap?: number; // per-row ramp cap (defaults to SIG_STACK_CAP = 3)
  // ── M2/M3 widening (migration 20260711133000, args 11-14) ──────────────────
  _incorrect_stat_specs?: unknown[]; // StatChangeSpec[] applied on a WRONG answer (Hoopa #386)
  _expire_after_questions?: number; // auto-disable+revert n questions after the fire (Moltres #146); 0 = never
  _self_hp?: number | null; // acting side's HP at answer time (Regigigas payoff gate; server clamps)
  _opp_hp?: number | null; // opponent's HP at answer time
}
export interface SigEngineTickResult {
  ok: boolean;
  hostStages?: Record<string, number>;
  guestStages?: Record<string, number>;
  hostSigRuntime?: SigRuntimeMap;
  guestSigRuntime?: SigRuntimeMap;
  noop?: boolean;
  reason?: string;
  /** Raw DB error string from the RPC's `{ok:false,error}` envelope. Backend
   *  maps this into `reason` for callers; kept here so the contract type mirrors
   *  the server payload exactly. */
  error?: string;
}

/** The trigger type carried on a catalog row's `engine` spec — a documentation
 *  anchor for Backend resolving `_trigger_fired`. The predicate itself lives in
 *  `hitTriggerHolds`/`postTriggerFires` (signature-abilities.ts). */
export type EngineTriggerOf = SignatureEngineSpec["trigger"];
