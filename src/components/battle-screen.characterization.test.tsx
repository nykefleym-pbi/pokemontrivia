// Characterization/regression baseline for BattleMode's in-battle math
// (handleAnswer / finish in battle-screen.tsx).
//
// WHY THIS EXISTS: that logic is ~50 per-ability special cases plus item
// auto-triggers, tightly interleaved with React state, refs, and timers, with
// no prior test coverage. Per CLAUDE.md's signature-ability warning, this
// codebase has gotten this exact class of thing wrong before when a change
// was eyeballed instead of verified. engine/turn.ts's reduce()/replay() (the
// server-authoritative port of this logic, see that file) must NOT be written
// from a read-through of battle-screen.tsx alone — it must be diffed against
// these snapshots and match byte-for-byte, or the port has a bug.
//
// This drives the REAL, unmodified BattleMode component end-to-end (render +
// simulated clicks) rather than re-implementing the math, so the baseline is
// exactly what players experience today. Non-determinism is pinned: Math.random
// is a fixed constant, the system clock is fixed and only advanced by explicit
// amounts, and the enemy/player/questions are fixed fixtures. `data-testid`
// hooks added to battle-screen.tsx for this (enemy-hp, player-hp, option-N,
// battle-result) are observability-only — they don't change any behavior.
//
// COVERAGE: every rolled ability (content/abilities/rolled) run through one
// fixed 12-answer script, plus the three chance-based wrong-answer branches
// (static / flame-body / cute-charm) forced to proc. NOT covered yet: item
// auto-triggers (Focus Band, Oran Berry, Revive, Silk Scarf, King's Rock,
// Leftovers, Metronome, Quick Claw, Assault Vest), Elite/Weekly-only branches,
// and the confused/poisoned status ticks. Extend `SCRIPT`/`seedStore` to add
// those rather than guessing they're covered.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

vi.mock("@/lib/audio", () => ({
  playSfx: vi.fn(),
  revealPokemon: vi.fn(),
  playBattleResult: vi.fn(),
  playItemCue: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Animations are irrelevant to the battle math being characterized, and
// framer-motion's internal RAF-driven scheduling deadlocks vitest's fake
// timers. Replace it with plain passthrough elements.
vi.mock("framer-motion", () => {
  interface MotionDivProps extends ComponentPropsWithoutRef<"div"> {
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
    layout?: unknown;
    layoutId?: unknown;
    variants?: unknown;
  }
  const stripMotionProps = ({
    initial: _initial,
    animate: _animate,
    exit: _exit,
    transition: _transition,
    layout: _layout,
    layoutId: _layoutId,
    variants: _variants,
    ...rest
  }: MotionDivProps) => rest;
  const Div = (props: MotionDivProps) => <div {...stripMotionProps(props)} />;
  return {
    motion: new Proxy({} as Record<string, typeof Div>, { get: () => Div }),
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

const FIXED_ENEMY_ID = 4; // Charmander — fixed so type-matchup math is stable

vi.mock("@/lib/game-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/game-data")>();
  const { findPokemon } = await import("@/lib/pokemon-data");
  return {
    ...actual,
    pickRandomEnemy: () => ({
      name: "Test Trainer",
      title: "Trainer",
      pokemon: findPokemon(FIXED_ENEMY_ID)!,
      isShiny: false,
    }),
  };
});

import { BattleScreen } from "./battle-screen";
import { useGameStore } from "@/lib/store";
import { findPokemon } from "@/lib/pokemon-data";
import { shuffleTriviaOptions, type Trivia } from "@/lib/trivia-core";
import { ROLLED_LIST } from "@/content/abilities/rolled";
import type { AbilityId } from "@/lib/abilities";
import type { ItemId } from "@/content/items/item-def";
import { ELITE_FOUR, type EliteMember } from "@/lib/elite-four";
import { GYM_LEADERS, type GymLeader } from "@/lib/gym-leaders";

const PLAYER = findPokemon(1)!; // Bulbasaur
const QUESTION_COUNT = 16;

function makeQuestions(n: number): Trivia[] {
  return Array.from({ length: n }, (_, i) => ({
    question: `Question ${i}?`,
    options: ["A", "B", "C", "D"],
    correct: 0,
    explanation: "because",
    category: "Test",
  }));
}

let initialStoreState: ReturnType<typeof useGameStore.getState>;

beforeEach(() => {
  if (!initialStoreState) initialStoreState = useGameStore.getState();
  // Exclude requestAnimationFrame from the fake clock: framer-motion (and
  // jsdom generally) drive rAF-based work that must keep ticking in real
  // time, independent of our explicit setTimeout/Date advances below.
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useGameStore.setState(initialStoreState, true);
});

function seedStore(
  abilityId: AbilityId | null,
  inventory?: Partial<Record<ItemId, number>>,
) {
  useGameStore.setState(
    {
      ...initialStoreState,
      pokemon: PLAYER,
      level: 5,
      abilityId,
      flags: ["tutorial_done"],
      ...(inventory ? { inventory: inventory as Record<ItemId, number> } : {}),
    },
    true,
  );
}

type Action = "correct" | "wrong";

// A fixed sequence exercising both branches repeatedly across several
// QUESTIONS_PER_SET(=5) round boundaries (streak build, streak break,
// wrong-streak thresholds for confuse/poison, set-boundary abilities).
const SCRIPT: Action[] = [
  "correct",
  "correct",
  "correct",
  "wrong",
  "correct",
  "wrong",
  "wrong",
  "correct",
  "correct",
  "correct",
  "wrong",
  "correct",
];

// All-wrong: drives playerHp toward (and past) 0, exercising the near-KO
// branches SCRIPT never reaches — Sturdy's revive-at-1, Torrent's
// below-30%-HP heal, and Amnesia's shifted confuse/poison thresholds.
const ATTRITION_SCRIPT: Action[] = Array(10).fill("wrong");

interface RunBattleOpts {
  inventory?: Partial<Record<ItemId, number>>;
  mode?: "battle" | "elite" | "weekly";
  eliteMember?: EliteMember;
  gymLeader?: GymLeader;
  /** Manually click the item-{id} quick-access button before the script step
   *  at this 0-based index, e.g. { 0: ["xattack"] } clicks X Attack right
   *  before the first scripted answer. */
  useItemsBeforeStep?: Partial<Record<number, ItemId[]>>;
}

async function runBattle(abilityId: AbilityId | null, script: Action[], opts: RunBattleOpts = {}) {
  seedStore(abilityId, opts.inventory);
  const questions = makeQuestions(QUESTION_COUNT);
  // Same fixed Math.random as the component uses, so this predicts which
  // button index is "correct" after battle-screen's own per-question shuffle.
  const correctIdx = shuffleTriviaOptions(questions[0]).correct;
  const wrongIdx = correctIdx === 0 ? 1 : 0;

  render(
    <BattleScreen
      questions={questions}
      onExit={() => {}}
      mode={opts.mode}
      eliteMember={opts.eliteMember}
      gymLeader={opts.gymLeader}
    />,
  );

  // Intro sequencing (banner -> reveal partner -> loadQuestion(0)) resolves
  // by ~2800ms for a regular battle, ~4900ms for an Elite Four battle (its
  // introDelay is 3600ms, not 1500ms).
  await act(async () => {
    await vi.advanceTimersByTimeAsync(opts.eliteMember ? 5000 : 3000);
  });

  const trace: Array<Record<string, unknown>> = [];

  for (let i = 0; i < script.length; i++) {
    const action = script[i];
    if (screen.queryByTestId("player-hp") == null) break; // battle already ended

    // ~3s of "thinking time" before answering — feeds the speed bonus calc.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    for (const itemId of opts.useItemsBeforeStep?.[i] ?? []) {
      const itemBtn = screen.queryByTestId(`item-${itemId}`);
      if (itemBtn) await act(async () => fireEvent.click(itemBtn));
    }

    const idx = action === "correct" ? correctIdx : wrongIdx;
    const btn = screen.queryByTestId(`option-${idx}`);
    if (!btn) break;
    await act(async () => {
      fireEvent.click(btn);
    });

    // feedback delay (1800ms) or finish() delay (1400ms) before the next
    // question/result renders.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    const result = screen.queryByTestId("battle-result");
    trace.push({
      action,
      playerHp: screen.queryByTestId("player-hp")?.textContent ?? null,
      enemyHp: screen.queryByTestId("enemy-hp")?.textContent ?? null,
      ended: !!result,
      ...(result
        ? {
            won: result.getAttribute("data-won"),
            xp: result.getAttribute("data-xp"),
            tp: result.getAttribute("data-tp"),
            coins: result.getAttribute("data-coins"),
            maxStreak: result.getAttribute("data-streak"),
          }
        : {}),
    });
    if (result) break;
  }

  return trace;
}

describe("battle-screen ability characterization (regression baseline)", () => {
  // Bulbasaur with no stored abilityId falls back to its primary type's
  // first rolled ability (leech-seed) — this IS current production
  // behavior for any legacy save without a rolled ability, not a "no
  // ability" case.
  it("baseline — unset abilityId (legacy fallback)", async () => {
    const trace = await runBattle(null, SCRIPT);
    expect(trace).toMatchSnapshot();
  });

  it.each(ROLLED_LIST.map((a) => a.id))("ability: %s", async (abilityId) => {
    const trace = await runBattle(abilityId as AbilityId, SCRIPT);
    expect(trace).toMatchSnapshot();
  });
});

describe("chance-based wrong-answer branches forced to proc", () => {
  it.each(["static", "flame-body", "cute-charm"] as const)("%s procs", async (abilityId) => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const trace = await runBattle(abilityId, SCRIPT);
    expect(trace).toMatchSnapshot();
  });
});

// Previously "sturdy" alone soft-locked under this script: a pending
// nextQuestion() timeout (scheduled by the click that Sturdy's revive kept
// alive) fired *after* an independent finish(false) from the poison-tick
// interval had already ended the battle, calling loadQuestion() and setting
// phase back to "question" — reviving an ended battle into a state no
// further click could recover from (battleEndedRef then silently swallowed
// any real finish() call). Fixed in battle-screen.tsx by guarding
// nextQuestion() with `if (battleEndedRef.current) return;`. All 51
// abilities (including sturdy) now reach a result under this script.
describe("battle-screen ability characterization — attrition (near-KO branches)", () => {
  it.each(ROLLED_LIST.map((a) => a.id))("ability: %s", async (abilityId) => {
    const trace = await runBattle(abilityId as AbilityId, ATTRITION_SCRIPT);
    expect(trace).toMatchSnapshot();
  });
});

describe("item auto-triggers", () => {
  // Battle-start effect (useEffect on mount) — no ability, so the SCRIPT
  // run's wrong-answer damage (15, since this fixture is disadvantaged) is
  // halved throughout instead of just once.
  it("assault vest halves wrong-answer damage all battle", async () => {
    const trace = await runBattle(null, SCRIPT, { inventory: { assaultvest: 1 } });
    expect(trace).toMatchSnapshot();
  });

  // 50% chance (per wrong answer) to negate HP loss entirely, whole battle.
  // Force the proc so the effect is visible under a fixed script.
  it("king's rock negates wrong-answer HP loss (forced proc)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const trace = await runBattle(null, SCRIPT, { inventory: { kingsrock: 1 } });
    expect(trace).toMatchSnapshot();
  });

  // +5 HP after every correct answer, whole battle.
  it("leftovers heals after every correct answer", async () => {
    const trace = await runBattle(null, SCRIPT, { inventory: { leftovers: 1 } });
    expect(trace).toMatchSnapshot();
  });

  // Locks the streak multiplier at its max (3.0x) for every correct answer,
  // whole battle — should hit noticeably harder than the no-item baseline.
  it("metronome locks the streak multiplier at max", async () => {
    const trace = await runBattle(null, SCRIPT, { inventory: { metronome: 1 } });
    expect(trace).toMatchSnapshot();
  });

  // Bonus damage on the first correct answer only, once per battle.
  it("silk scarf boosts the first correct answer", async () => {
    const trace = await runBattle(null, SCRIPT, { inventory: { silkscarf: 1 } });
    expect(trace).toMatchSnapshot();
  });

  // Auto-heals to 50% max HP the moment HP drops to <=10, once per week.
  // Ability pinned to "magic-guard" for these three: it suppresses the
  // poisoned-status tick (see startPoisonTick), which otherwise has its own,
  // separate KO path that doesn't consult Revive/Focus Band/Oran Berry at
  // all — under ATTRITION_SCRIPT with no ability, the poison tick can (and
  // did, when this was first written) reach 0 HP before the wrong-answer
  // click does, silently "stealing" the KO and making the item look
  // untriggered. Pinning the ability removes that race so each item's own
  // logic is what's actually characterized here.
  it("focus band auto-heals to 50% at <=10 HP", async () => {
    const trace = await runBattle("magic-guard", ATTRITION_SCRIPT, { inventory: { focusband: 1 } });
    expect(trace).toMatchSnapshot();
  });

  // Auto-heals 15 HP the instant HP first drops below 30% max, once per battle.
  it("oran berry auto-heals 15 HP on first drop below 30%", async () => {
    const trace = await runBattle("magic-guard", ATTRITION_SCRIPT, { inventory: { oranberry: 1 } });
    expect(trace).toMatchSnapshot();
  });

  // Survives a would-be KO at 25% max HP, once per battle, consuming the item.
  it("revive survives a KO at 25% HP", async () => {
    const trace = await runBattle("magic-guard", ATTRITION_SCRIPT, { inventory: { revive: 1 } });
    expect(trace).toMatchSnapshot();
  });

  // Quick Claw resets the question timer to 20s the first time it drops
  // below 5s, once per battle. Behavioral (not snapshot): verified by NOT
  // clicking and confirming the ~20s auto-timeout-as-wrong-answer that would
  // otherwise fire hasn't happened yet by t=21s, because the timer got reset
  // partway through — there's no data-testid exposing the timer value itself.
  it("quick claw resets the countdown once, delaying the auto-timeout", async () => {
    seedStore(null, { quickclaw: 1 });
    const questions = makeQuestions(QUESTION_COUNT);
    render(<BattleScreen questions={questions} onExit={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const hpBefore = screen.queryByTestId("player-hp")?.textContent;
    // Without Quick Claw, the 20s countdown auto-answers (as wrong) well
    // before this point, changing playerHp. With it, the timer's one reset
    // buys another ~20s, so nothing has happened yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21000);
    });
    const hpAfter = screen.queryByTestId("player-hp")?.textContent;
    expect(hpAfter).toBe(hpBefore);
  });
});

describe("manual items", () => {
  // +20 flat damage on the next correct answer only, single use (consumed
  // immediately after applying).
  it("x attack adds +20 damage to the next correct answer, single use", async () => {
    const trace = await runBattle(null, SCRIPT, {
      inventory: { xattack: 1 },
      useItemsBeforeStep: { 0: ["xattack"] },
    });
    expect(trace).toMatchSnapshot();
  });

  it("potion heals 30 HP", async () => {
    const trace = await runBattle("magic-guard", ATTRITION_SCRIPT, {
      inventory: { potion: 1 },
      useItemsBeforeStep: { 3: ["potion"] },
    });
    expect(trace).toMatchSnapshot();
  });

  it("superpotion heals 60 HP", async () => {
    const trace = await runBattle("magic-guard", ATTRITION_SCRIPT, {
      inventory: { superpotion: 1 },
      useItemsBeforeStep: { 3: ["superpotion"] },
    });
    expect(trace).toMatchSnapshot();
  });

  it("maxpotion fully heals", async () => {
    const trace = await runBattle("magic-guard", ATTRITION_SCRIPT, {
      inventory: { maxpotion: 1 },
      useItemsBeforeStep: { 3: ["maxpotion"] },
    });
    expect(trace).toMatchSnapshot();
  });
});

describe("MAX_ITEMS_PER_BATTLE cap (3 items, manual + auto combined)", () => {
  // Assault Vest (disadvantaged, activates) + King's Rock + Leftovers spend
  // the whole 3-item budget at battle start, in that order — Silk Scarf is
  // still "available" (inventory > 0, unused) but the shared budget is gone
  // by the time its first-correct-answer trigger condition is checked.
  it("silk scarf doesn't fire once the budget is exhausted by whole-battle auto-triggers", async () => {
    const trace = await runBattle(null, SCRIPT, {
      inventory: { assaultvest: 1, kingsrock: 1, leftovers: 1, silkscarf: 1 },
    });
    expect(trace).toMatchSnapshot();
  });

  it("revive/focus band/oran berry don't fire once the budget is exhausted", async () => {
    const trace = await runBattle("magic-guard", ATTRITION_SCRIPT, {
      inventory: {
        assaultvest: 1,
        kingsrock: 1,
        leftovers: 1,
        revive: 1,
        focusband: 1,
        oranberry: 1,
      },
    });
    expect(trace).toMatchSnapshot();
  });

  it("a manual item can't be used once the budget is exhausted", async () => {
    const trace = await runBattle("magic-guard", ATTRITION_SCRIPT, {
      inventory: { assaultvest: 1, kingsrock: 1, leftovers: 1, potion: 1 },
      useItemsBeforeStep: { 3: ["potion"] },
    });
    expect(trace).toMatchSnapshot();
  });
});

describe("Elite Four and Weekly League branches", () => {
  it("elite battle: flat base damage, dark-aura elite bonus, elite-only rewards", async () => {
    const trace = await runBattle("dark-aura", SCRIPT, { mode: "elite", eliteMember: ELITE_FOUR[0] });
    expect(trace).toMatchSnapshot();
  });

  it("weekly league battle: flat base damage, dark-aura weekly bonus, badge/share-card path", async () => {
    const trace = await runBattle("dark-aura", SCRIPT, { mode: "weekly", gymLeader: GYM_LEADERS[0] });
    expect(trace).toMatchSnapshot();
  });
});

describe("confused-status miss chance", () => {
  // Two wrong answers in a row (wrongStreak reaches confuseAt=2 for a
  // non-amnesia ability) applies "confused" before the third answer. "guts"
  // has no Math.random-gated branches of its own, so the fixed random value
  // below only governs the confused-miss check itself.
  const CONFUSE_THEN_ANSWER: Action[] = ["wrong", "wrong", "correct"];

  it("confused miss forced to proc — the correct answer whiffs", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01); // < 0.25 threshold
    const trace = await runBattle("guts", CONFUSE_THEN_ANSWER);
    expect(trace).toMatchSnapshot();
  });

  it("confused but the miss doesn't proc — the correct answer lands", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9); // >= 0.25 threshold
    const trace = await runBattle("guts", CONFUSE_THEN_ANSWER);
    expect(trace).toMatchSnapshot();
  });
});
