import { describe, expect, it } from "vitest";
import {
  stepBespokeFx,
  eliminatedChoiceIndices,
  EMPTY_BESPOKE_FX_STATE,
  DOOM_DESIRE_DELAY_Q,
  type BespokeFxState,
} from "./signature-bespoke-fx";
import type { BespokeEffectRef } from "./signature-abilities";

const base = {
  questionNo: 1,
  triggerFired: false,
  disabled: false,
  oppHpPct: 1,
};

describe("bespoke fx: Jirachi #385 delayed strike", () => {
  const fx: BespokeEffectRef[] = [{ fx: "flat_next_question_damage", amount: 20 }];

  it("arms on the trigger and resolves exactly DOOM_DESIRE_DELAY_Q questions later", () => {
    const armed = stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, {
      ...base,
      questionNo: 5,
      triggerFired: true,
    });
    expect(armed.state.pendingStrikeAtQ).toBe(5 + DOOM_DESIRE_DELAY_Q);
    expect(armed.fireBespoke).toBe(false); // arming deals no damage

    // The question in between must not resolve it.
    const between = stepBespokeFx(fx, armed.state, { ...base, questionNo: 6 });
    expect(between.fireBespoke).toBe(false);
    expect(between.state.pendingStrikeAtQ).toBe(7);

    const landed = stepBespokeFx(fx, between.state, { ...base, questionNo: 7 });
    expect(landed.fireBespoke).toBe(true);
    expect(landed.state.pendingStrikeAtQ).toBeNull();
  });

  it("does not stack a second strike onto an in-flight one", () => {
    const armed = stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, {
      ...base,
      questionNo: 5,
      triggerFired: true,
    });
    // Trigger fires again while a strike is already scheduled — must not re-arm.
    const again = stepBespokeFx(fx, armed.state, {
      ...base,
      questionNo: 6,
      triggerFired: true,
    });
    expect(again.state.pendingStrikeAtQ).toBe(7);
  });

  it("a disabled row cannot arm", () => {
    const r = stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, {
      ...base,
      questionNo: 3,
      triggerFired: true,
      disabled: true,
    });
    expect(r.state.pendingStrikeAtQ).toBeNull();
  });
});

describe("bespoke fx: Heatran #485 damage-over-time window", () => {
  const fx: BespokeEffectRef[] = [{ fx: "dot_frac_hp", pct: 0.125, questions: 3 }];

  it("chips on every question inside the window, then closes", () => {
    let s: BespokeFxState = stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, {
      ...base,
      questionNo: 4,
      triggerFired: true,
    }).state;
    expect(s.dotThroughQ).toBe(7);

    const ticks: boolean[] = [];
    for (const q of [5, 6, 7, 8]) {
      const r = stepBespokeFx(fx, s, { ...base, questionNo: q });
      ticks.push(r.fireBespoke);
      s = r.state;
    }
    // q5, q6, q7 burn; q8 is past the window.
    expect(ticks).toEqual([true, true, true, false]);
    expect(s.dotThroughQ).toBeNull();
  });

  it("a disable (Heatran missed twice) slams the window shut early", () => {
    const opened = stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, {
      ...base,
      questionNo: 2,
      triggerFired: true,
    });
    expect(opened.state.dotThroughQ).toBe(5);

    const cut = stepBespokeFx(fx, opened.state, { ...base, questionNo: 3, disabled: true });
    expect(cut.state.dotThroughQ).toBeNull();
    expect(cut.fireBespoke).toBe(false);

    // And the following question inside the ORIGINAL window must not burn.
    const after = stepBespokeFx(fx, cut.state, { ...base, questionNo: 4 });
    expect(after.fireBespoke).toBe(false);
  });
});

describe("bespoke fx: Uxie #480 predicted status", () => {
  const fx: BespokeEffectRef[] = [{ fx: "predicted_status_reveal", applyIfOppHpBelowPct: 50 }];

  it("mirrors the server's roll, then lands it the first time the opponent drops below 50%", () => {
    const revealed = stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, {
      ...base,
      questionNo: 1,
      triggerFired: true,
      predictedStatus: "sleep",
      oppHpPct: 0.9,
    });
    expect(revealed.state.predictedStatus).toBe("sleep");
    expect(revealed.fireBespoke).toBe(false); // revealed, not yet landed
    expect(revealed.cue).toContain("sleep");

    const stillHigh = stepBespokeFx(fx, revealed.state, { ...base, questionNo: 2, oppHpPct: 0.55 });
    expect(stillHigh.fireBespoke).toBe(false);

    const lands = stepBespokeFx(fx, stillHigh.state, { ...base, questionNo: 3, oppHpPct: 0.49 });
    expect(lands.fireBespoke).toBe(true);
    expect(lands.state.predictionLanded).toBe(true);

    // Once only — dropping further must not re-inflict.
    const again = stepBespokeFx(fx, lands.state, { ...base, questionNo: 4, oppHpPct: 0.2 });
    expect(again.fireBespoke).toBe(false);
  });

  it("never fires without a prediction to honour (the tick never rolled one)", () => {
    const r = stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, {
      ...base,
      questionNo: 3,
      oppHpPct: 0.1,
      predictedStatus: null,
    });
    expect(r.fireBespoke).toBe(false);
  });
});

describe("bespoke fx: Azelf #482 choice elimination", () => {
  const fx: BespokeEffectRef[] = [
    { fx: "eliminate_choices", min: 1, max: 3, onIndices: [5, 10, 15, 20] },
  ];

  it("schedules the cull onto the NEXT question", () => {
    const r = stepBespokeFx(
      fx,
      EMPTY_BESPOKE_FX_STATE,
      { ...base, questionNo: 5, triggerFired: true },
      () => 0, // roll the minimum
    );
    expect(r.state.eliminateOnQ).toBe(6);
    expect(r.state.eliminateCount).toBe(1);
  });

  it("rolls within [min, max]", () => {
    const max = stepBespokeFx(
      fx,
      EMPTY_BESPOKE_FX_STATE,
      { ...base, questionNo: 5, triggerFired: true },
      () => 0.999,
    );
    expect(max.state.eliminateCount).toBe(3);
  });

  it("culls only wrong options, and only on the scheduled question", () => {
    const state: BespokeFxState = {
      ...EMPTY_BESPOKE_FX_STATE,
      eliminateOnQ: 6,
      eliminateCount: 2,
    };
    const culled = eliminatedChoiceIndices(state, 6, 4, 2, () => 0);
    expect(culled).toHaveLength(2);
    expect(culled).not.toContain(2); // the correct answer survives
    // Wrong question — nothing culled.
    expect(eliminatedChoiceIndices(state, 7, 4, 2, () => 0)).toEqual([]);
  });

  // Owner ruling 2026-07-12: a max roll IS allowed to leave only the correct answer.
  it("a max roll may remove every wrong answer (the jackpot free point)", () => {
    const state: BespokeFxState = {
      ...EMPTY_BESPOKE_FX_STATE,
      eliminateOnQ: 3,
      eliminateCount: 3,
    };
    const culled = eliminatedChoiceIndices(state, 3, 4, 1, () => 0);
    expect(culled).toEqual([0, 2, 3]);
    expect(culled).not.toContain(1);
  });
});

describe("bespoke fx: rows this scheduler must not touch", () => {
  it("Mesprit's item lockout and Marshadow's mirror are server-owned (no client fire)", () => {
    const mesprit = stepBespokeFx([{ fx: "item_lockout" }], EMPTY_BESPOKE_FX_STATE, {
      ...base,
      triggerFired: true,
    });
    expect(mesprit.fireBespoke).toBe(false);

    const marshadow = stepBespokeFx([{ fx: "use_opponent_item" }], EMPTY_BESPOKE_FX_STATE, {
      ...base,
      triggerFired: true,
    });
    expect(marshadow.fireBespoke).toBe(false);
  });

  it("a row with no bespoke effects is inert", () => {
    const r = stepBespokeFx(undefined, EMPTY_BESPOKE_FX_STATE, { ...base, triggerFired: true });
    expect(r.fireBespoke).toBe(false);
    expect(r.state).toBe(EMPTY_BESPOKE_FX_STATE);
  });
});

describe("bespoke fx: Arceus #493 and Manaphy #490 fire straight through", () => {
  it("Arceus chips every question its trigger fires, and never while disabled", () => {
    const fx: BespokeEffectRef[] = [{ fx: "frac_hp_random", minPct: 0.01, maxPct: 0.1 }];
    expect(
      stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, { ...base, triggerFired: true }).fireBespoke,
    ).toBe(true);
    expect(
      stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, { ...base, triggerFired: true, disabled: true })
        .fireBespoke,
    ).toBe(false);
    expect(
      stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, { ...base, triggerFired: false }).fireBespoke,
    ).toBe(false);
  });

  it("Manaphy reflects only when the observer says the opponent's signature fired", () => {
    const fx: BespokeEffectRef[] = [{ fx: "reflect_opponent_stat", factor: -1 }];
    expect(
      stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, { ...base, triggerFired: true }).fireBespoke,
    ).toBe(true);
    expect(
      stepBespokeFx(fx, EMPTY_BESPOKE_FX_STATE, { ...base, triggerFired: false }).fireBespoke,
    ).toBe(false);
  });
});
