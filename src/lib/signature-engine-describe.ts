/**
 * Plain-language rendering of a row's `engine` spec.
 *
 * Why this exists: the catalog's legacy `trigger`/`effect` fields still hold the
 * PRE-rework ability, and `describeSignatureFull` used to read them. Once the
 * engine took over all 104 Legendary/Mythical rows, the mechanics changed but
 * that text did not — so the in-battle popover confidently described an ability
 * the game no longer had (Zarude read "heal 8 HP every 5 questions" while it in
 * fact healed to FULL below 25%, once per battle). Describing the engine is the
 * only way the words and the mechanics can't drift: they now have one source.
 *
 * The same function backs `scripts/gen-ability-list.ts`, so the owner-facing
 * checklist is literally the text the game shows.
 *
 * Register: this is read by players mid-battle, so it is deliberately jargon-free
 * — "Attack", not "+1 attack stage"; "your HP", not "selfHpPct".
 */
import type {
  BespokeEffectRef,
  DamageMultiplierSpec,
  DisableSpec,
  FixedIndexSpec,
  MultiplierCondition,
  NewSignatureTrigger,
  PhaseWindowSpec,
  SideRef,
  SignatureEngineSpec,
  StatChangeSpec,
} from "./signature-abilities";
import type { PvpStat, StatusKind } from "./game-data";

/** Only the species that actually appear in a condition or disable clause. The
 *  app has no offline Pokédex (names come from the API at runtime), and a full
 *  map would rot; this covers every id the catalog names. */
const CONDITION_SPECIES: Record<number, string> = {
  382: "Kyogre",
  383: "Groudon",
  483: "Dialga",
  484: "Palkia",
  643: "Reshiram",
  644: "Zekrom",
  791: "Solgaleo",
  792: "Lunala",
  888: "Zacian",
  889: "Zamazenta",
  1014: "Okidogi",
  1015: "Munkidori",
  1016: "Fezandipiti",
};

function speciesName(dexId: number): string {
  return CONDITION_SPECIES[dexId] ?? `#${dexId}`;
}

/** Australian spelling — the owner spec and the rest of the UI use "Defence". */
const STAT_LABEL: Record<PvpStat, string> = {
  attack: "Attack",
  defense: "Defence",
  speed: "Speed",
  crit: "Crit chance",
};

const STATUS_LABEL: Record<StatusKind, string> = {
  confused: "Confusion",
  poisoned: "Poison",
  "badly-poisoned": "Bad Poison",
  burn: "Burn",
  paralysis: "Paralysis",
  sleep: "Sleep",
  freeze: "Freeze",
};

function statLabel(stat: PvpStat | "random"): string {
  return stat === "random" ? "a random stat" : STAT_LABEL[stat];
}

function statusLabel(status: StatusKind | "random"): string {
  return status === "random" ? "a random status" : STATUS_LABEL[status];
}

/** "+2" / "-1" — an explicit sign, because a bare "1" reads as a typo. */
function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function whose(target: SideRef): string {
  return target === "self" ? "your" : "the opponent's";
}

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function questions(n: number): string {
  return n === 1 ? "1 question" : `${n} questions`;
}

/** The catalog is mixed-unit by field, and the two are NOT interchangeable — a
 *  fraction rendered as a whole gives "7500%". `pct` is for the 0..1 fields
 *  (chances, `dot_frac_hp`, `frac_hp_random`, `frac_hp_damage`); `whole` is for
 *  the already-percent fields (`lifesteal`, `revive.hpPct`, `heal_pct_of_...`).
 *  Each call site below is pinned to the unit its field actually uses. */
function pct(fraction: number): string {
  // Keep a half-percent rather than rounding it away: Heatran's 0.125 is 12.5%,
  // and "13%" would quietly misreport the spec.
  const n = fraction * 100;
  return `${Number.isInteger(n) ? n : Number(n.toFixed(1))}%`;
}

function whole(percent: number): string {
  return `${percent}%`;
}

function times(factor: number): string {
  // 2 → "double", 3 → "triple"; anything else stays numeric (x2.5).
  if (factor === 2) return "double";
  if (factor === 3) return "triple";
  return `x${factor}`;
}

// ── Trigger ──────────────────────────────────────────────────────────────────

export function describeEngineTrigger(trigger: NewSignatureTrigger): string {
  switch (trigger.type) {
    case "streak_in_a_row":
      return `once you get ${trigger.n} answers right in a row`;
    case "start_of_battle":
      return "from the start of the battle";
    case "every_question":
      return "on every question";
    case "every_even_question":
      return "on every even-numbered question";
    case "every_odd_question":
      return "on every odd-numbered question";
    case "on_questions":
      return `on question${trigger.indices.length === 1 ? "" : "s"} ${list(
        trigger.indices.map(String),
      )}`;
    case "self_afflicted_or_hp_below":
      return `while you have a status condition, or your HP is below ${trigger.pct}%`;
    case "opponent_signature":
      return "when the opponent's signature ability fires";
    case "hp_reaches_zero":
      return "when you would be knocked out";
    case "opponent_uses_item":
      return "when the opponent uses an item";
    case "opp_hp_multiple_of_self":
      return trigger.factor === 2
        ? "while the opponent has at least twice your HP"
        : `while the opponent has at least ${trigger.factor}x your HP`;
  }
}

// ── Stat changes ─────────────────────────────────────────────────────────────

function describeStat(spec: StatChangeSpec): string {
  switch (spec.mode) {
    case "ramp":
      return `${signed(spec.perCorrect)} ${whose(spec.target)} ${statLabel(
        spec.stat,
      ).toLowerCase()} per correct answer, stacking up to 3 times`;
    case "one_shot":
      // Genesect rolls its stat, so "+1 your a random stat" is the naive join.
      if (spec.stat === "random") {
        return `${signed(spec.delta)} to one of ${
          spec.target === "self" ? "your" : "the opponent's"
        } stats at random`;
      }
      return `${signed(spec.delta)} ${whose(spec.target)} ${statLabel(spec.stat).toLowerCase()}`;
    case "decay":
      return `${signed(spec.initial)} ${whose(spec.target)} ${statLabel(
        spec.stat,
      ).toLowerCase()}, then ${signed(spec.perQuestion)} each question after (down to ${signed(
        spec.floor,
      )})`;
  }
}

function describeStats(specs: StatChangeSpec[]): string {
  return list(specs.map(describeStat));
}

// ── Conditional damage / ignore-Defence ──────────────────────────────────────

function describeCondition(cond: MultiplierCondition): string | null {
  switch (cond.on) {
    case "opponent_type":
      return `against ${cond.typeName} types`;
    case "opponent_type_any":
      return `against ${list(cond.typeNames)} types`;
    case "opponent_species":
      return `against ${speciesName(cond.dexId)}`;
    case "opponent_species_any":
      return `against ${list(cond.dexIds.map(speciesName))}`;
    case "always":
      return null;
  }
}

function describeMultiplier(m: DamageMultiplierSpec): string[] {
  const out: string[] = [];
  const when = describeCondition(m.condition);

  if (m.hpTiers && m.hpTiers.length > 0) {
    // Regidrago: the factor is read off your own remaining HP, re-checked every
    // question — the headline of the ability, so it is spelled out in full. A
    // flat `factor` of 1 is the no-op fallback and adds nothing but noise next
    // to a ladder that already bottoms out at x1.
    const ladder = [...m.hpTiers]
      .sort((a, b) => b.atLeastPct - a.atLeastPct)
      .map((t) => `${times(t.factor)} at ${t.atLeastPct}% HP or above`);
    const otherwise = m.factor === 1 ? "" : `, otherwise ${times(m.factor)}`;
    out.push(
      `your damage scales with your own remaining HP (${list(
        ladder,
      )}${otherwise}), re-checked every question`,
    );
  } else if (m.factor !== 1) {
    out.push(when ? `${times(m.factor)} damage ${when}` : `${times(m.factor)} damage`);
  }

  if (m.fallbackFactor != null && m.fallbackFactor !== 1) {
    out.push(`${times(m.fallbackFactor)} damage otherwise`);
  }
  if (m.ignoreDefenseAlways) {
    out.push("your hits ignore the opponent's Defence");
  } else if (m.ignoreDefense) {
    out.push(when ? `your hits ignore the opponent's Defence ${when}` : "your hits ignore the opponent's Defence");
  }
  if (m.onSuccess && m.onSuccess.length > 0) {
    out.push(when ? `${describeStats(m.onSuccess)} ${when}` : describeStats(m.onSuccess));
  }
  if (m.fallback && m.fallback.length > 0) {
    out.push(`${describeStats(m.fallback)} otherwise`);
  }
  return out;
}

// ── Phase windows / fixed-index marks ────────────────────────────────────────

function describePhase(p: PhaseWindowSpec): string {
  const parts: string[] = [];
  // "the first 1 question" → "the first question".
  const window = p.windowN === 1 ? "the first question" : `the first ${questions(p.windowN)}`;
  parts.push(
    p.scaleToPct === 0
      ? `you deal no damage for ${window}`
      : `you deal ${p.scaleToPct}% damage for ${window}`,
  );
  if (p.payoffMultiplier != null) {
    const at = p.payoffAtIndex ?? p.windowN + 1;
    const gate = p.payoffCondition === "opp_hp_gt_self" ? ", if the opponent has more HP than you" : "";
    parts.push(`then ${times(p.payoffMultiplier)} damage on question ${at}${gate}`);
  }
  if (p.payoffEffect) {
    parts.push(`then ${describeBespoke(p.payoffEffect)}`);
  }
  return parts.join(", ");
}

function describeFixedIndex(f: FixedIndexSpec): string {
  const parts: string[] = [];
  if (f.receiveDamagePct === 0) parts.push(`you take no damage on question ${f.index}`);
  else if (f.receiveDamagePct != null)
    parts.push(`you take ${f.receiveDamagePct}% damage on question ${f.index}`);
  if (f.outgoingMultiplier != null) {
    parts.push(
      f.outgoingMultiplier >= 1
        ? `${times(f.outgoingMultiplier)} damage on question ${f.index}`
        : `you deal ${pct(f.outgoingMultiplier)} damage on question ${f.index}`,
    );
  }
  return parts.join(", ");
}

// ── Bespoke effects ──────────────────────────────────────────────────────────

function describeBespoke(fx: BespokeEffectRef): string {
  switch (fx.fx) {
    case "frac_hp_damage":
      return `knock ${pct(fx.pctOfOppCurrentHp)} off the opponent's current HP`;
    case "frac_hp_random":
      return fx.questions == null
        ? `chip the opponent for ${pct(fx.minPct)}–${pct(fx.maxPct)} of their max HP`
        : `chip the opponent for ${pct(fx.minPct)}–${pct(fx.maxPct)} of their max HP each question for the next ${questions(
            fx.questions,
          )}`;
    case "instant_ko":
      return `a ${pct(fx.chance)} chance to knock the opponent out on the spot`;
    case "dot_frac_hp":
      return `burn the opponent for ${pct(fx.pct)} of their max HP each question for ${questions(
        fx.questions,
      )}`;
    case "flat_next_question_damage":
      return `a delayed strike that hits for ${fx.amount} damage two questions later`;
    case "lifesteal_pct_of_damage":
      return `heal yourself for ${whole(fx.pct)} of the damage you deal`;
    case "revive":
      return `revive at ${whole(fx.hpPct)} HP${fx.cure ? " and clear your status" : ""} instead of fainting`;
    case "full_heal_cure":
      return "heal to full and clear every status condition";
    case "heal_pct_of_damage_taken":
      return `clear your status and heal back ${whole(fx.pct)} of the damage you take for ${questions(
        fx.questions,
      )}`;
    case "disable_opponent_ability":
      return "shut off the opponent's signature ability";
    case "item_lockout":
      return "lock the opponent out of their items";
    case "eliminate_choices":
      return `remove ${fx.min}–${fx.max} wrong answers from your next question`;
    case "predicted_status_reveal":
      return `foresee a status condition, which lands on the opponent once they drop below ${fx.applyIfOppHpBelowPct}% HP`;
    case "copy_opponent_ability":
      return "copy the opponent's signature ability";
    case "reflect_opponent_stat":
      return "turn the opponent's stat drops against them";
    case "use_opponent_item":
      return "use the opponent's item for yourself";
  }
}

// ── Cooldown / disable ───────────────────────────────────────────────────────

function describeDisable(d: DisableSpec): string | null {
  switch (d.kind) {
    case "revert_stat_after_incorrect":
      return `The stat change is undone after ${questions(d.n).replace("question", "wrong answer")}.`;
    case "disable_increase_after_incorrect":
      return `It stops growing after ${d.n} wrong answer${d.n === 1 ? "" : "s"}, but keeps fading.`;
    case "disable_effect_after_incorrect":
      return `It switches off after ${d.n} wrong answer${d.n === 1 ? "" : "s"}.`;
    case "disable_multiplier_after_incorrect":
      return `The damage bonus switches off after ${d.n} wrong answer${d.n === 1 ? "" : "s"}.`;
    case "disable_healing_after_questions":
      return `The healing stops ${questions(d.n)} after it starts.`;
    case "disable_effect_after_questions":
      return `It switches off ${questions(d.n)} after it fires.`;
    case "disable_next_question_after_effect":
      return "After it fires, it sits out the next question.";
    case "once_per_battle":
      return "Once per battle.";
    case "any_of": {
      const parts = d.of.map(describeDisable).filter((s): s is string => s != null);
      return parts.length > 0 ? parts.join(" ") : null;
    }
    case "disabled_if_opponent_species":
      return `It does nothing at all against ${list(d.dexIds.map(speciesName))}.`;
    case "disabled_if_used_healing_item":
      return "It switches off permanently the moment you use a healing item.";
    case "none":
      return null;
  }
}

// ── The whole row ────────────────────────────────────────────────────────────

/**
 * Just the effect clauses — no trigger, no cooldown. Backs the terse in-battle
 * activation toast, which fires at the moment the ability procs (so "when" is
 * already obvious and the player has ~2 seconds to read). Null when the row's
 * whole payload is its trigger.
 */
export function describeEngineEffects(engine: SignatureEngineSpec): string | null {
  const effects = collectEffects(engine);
  return effects.length > 0 ? capitalize(list(effects)) : null;
}

function collectEffects(engine: SignatureEngineSpec): string[] {
  const effects: string[] = [];

  if (engine.stat && engine.stat.length > 0) effects.push(describeStats(engine.stat));
  if (engine.incorrectStat && engine.incorrectStat.length > 0) {
    effects.push(`${describeStats(engine.incorrectStat)} when you answer wrong`);
  }
  if (engine.status) {
    for (const s of engine.status) {
      const target = s.target === "self" ? "you" : "the opponent";
      const gate =
        s.ifOpponentSpeciesAny && s.ifOpponentSpeciesAny.length > 0
          ? ` (only against ${list(s.ifOpponentSpeciesAny.map(speciesName))})`
          : "";
      const chance = s.chance >= 1 ? "" : `a ${pct(s.chance)} chance to `;
      effects.push(
        `${chance}inflict ${statusLabel(s.status)} on ${target} for ${questions(s.questions)}${gate}`,
      );
    }
  }
  if (engine.multiplier) effects.push(...describeMultiplier(engine.multiplier));
  if (engine.phase) effects.push(describePhase(engine.phase));
  if (engine.fixedIndex) {
    for (const f of engine.fixedIndex) {
      const text = describeFixedIndex(f);
      if (text) effects.push(text);
    }
  }
  if (engine.shield) {
    effects.push(
      engine.shield.receivePct === 0
        ? `you take no damage from the opponent for ${questions(engine.shield.questions)}`
        : `you take only ${engine.shield.receivePct}% damage from the opponent for ${questions(
            engine.shield.questions,
          )}`,
    );
  }
  if (engine.nullifySelfDamage) {
    effects.push("wrong answers cost you no HP (the opponent's hits still land in full)");
  }
  if (engine.opponentTimer) {
    effects.push(
      `cut the opponent's answer timer to ${Math.round(engine.opponentTimer.ms / 1000)} seconds for ${questions(
        engine.opponentTimer.questions,
      )}`,
    );
  }
  if (engine.bespoke) effects.push(...engine.bespoke.map(describeBespoke));

  return effects;
}

/**
 * One or two sentences: what the ability does and when, then its cooldown.
 * Never returns an empty string for a real engine row — every row has at least
 * a trigger, so the worst case degrades to "Triggers <when>."
 */
export function describeEngineSpec(engine: SignatureEngineSpec): string {
  const effects = collectEffects(engine);

  // Rows whose effects already name their own question numbers (Giratina's
  // q1/q2/q11/q12 marks, Regigigas's payoff question) would otherwise end
  // "...double damage on question 12 on questions 2 and 12." The trigger clause
  // is pure repetition there, so drop it.
  const whenIsRedundant =
    engine.trigger.type === "on_questions" &&
    ((engine.fixedIndex?.length ?? 0) > 0 || engine.phase != null);

  const when = describeEngineTrigger(engine.trigger);
  const head =
    effects.length === 0
      ? `Triggers ${when}.`
      : whenIsRedundant
        ? `${capitalize(list(effects))}.`
        : `${capitalize(list(effects))} ${when}.`;

  const tail: string[] = [];
  if (engine.latchOnTrigger) tail.push("Once it fires, it lasts the rest of the battle.");
  if (engine.expireAfterQuestions != null && engine.expireAfterQuestions > 0) {
    tail.push(`It wears off after ${questions(engine.expireAfterQuestions)}.`);
  }
  const disable = engine.disable ? describeDisable(engine.disable) : null;
  if (disable) tail.push(disable);

  return [head, ...tail].join(" ");
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  // Never touch a leading multiplier — Blacephalon opens on "x5 damage", and a
  // blind uppercase turns it into "X5".
  if (/^x\d/.test(s)) return s;
  return s[0].toUpperCase() + s.slice(1);
}
