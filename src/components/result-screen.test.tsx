// Solo battle result screen — which button does what.
//
// Owner report 2026-07-26: "Next Battle" on the Victory screen went back to the
// hub instead of starting the next battle, and there was no way home from that
// screen at all. The defeat screen already had both (Rematch + Back home); this
// pins the win screen to the same contract.
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ResultScreen } from "@/components/result-screen";
import { useGameStore } from "@/lib/store";

vi.mock("framer-motion", () => {
  interface MotionDivProps extends ComponentPropsWithoutRef<"div"> {
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
  }
  const strip = ({ initial: _i, animate: _a, exit: _e, transition: _t, ...rest }: MotionDivProps) =>
    rest;
  const Div = (props: MotionDivProps) => <div {...strip(props)} />;
  return { motion: new Proxy({} as Record<string, typeof Div>, { get: () => Div }) };
});

vi.mock("@/components/game-ui", () => ({
  PokemonSprite: () => <img alt="partner" />,
  // Purely decorative, but it has to exist: a missing export from a `vi.mock`
  // factory throws at import time and fails every test in the file, not just
  // the ones that render it.
  SpriteBurst: () => <div data-testid="sprite-burst" />,
}));

vi.mock("@/components/MissedReview", () => ({
  MissedReview: () => <div data-testid="missed-review" />,
  // Same trap as the game-ui mock below: a missing export from a vi.mock
  // factory throws at import time and fails every test in the file.
  MISSED_REVIEW_MAX: 5,
}));

afterEach(cleanup);

const RESULT_PROPS = {
  won: true,
  opponentName: "Regieleki",
  correctCount: 9,
  totalQuestions: 12,
  xpEarned: 40,
  tpEarned: 12,
  coinsEarned: 30,
  speedBonus: 0,
  partnerName: "Caterpie",
  partnerId: 10,
  streak: 3,
  streakKept: true,
  currentLevel: 7,
  xpIntoLevel: 20,
  xpForThisLevel: 100,
  levelProgressPct: 20,
  newTrophies: [],
  missed: [],
  onRebattle: () => {},
  onBackHome: () => {},
} satisfies Parameters<typeof ResultScreen>[0];

function setup(overrides: Partial<Parameters<typeof ResultScreen>[0]> = {}) {
  const handlers = {
    onRebattle: vi.fn(),
    onBackHome: vi.fn(),
    onRematch: vi.fn(),
  };
  render(<ResultScreen {...RESULT_PROPS} {...handlers} {...overrides} />);
  return handlers;
}

describe("ResultScreen — victory", () => {
  it("starts the next battle from Next Battle rather than leaving the battle", () => {
    const { onRematch, onRebattle, onBackHome } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Next Battle" }));
    expect(onRematch).toHaveBeenCalledTimes(1);
    expect(onRebattle).not.toHaveBeenCalled();
    expect(onBackHome).not.toHaveBeenCalled();
  });

  it("falls back to leaving for a mode with nothing to restart (daily, weekly)", () => {
    const { onRebattle } = setup({ onRematch: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Next Battle" }));
    expect(onRebattle).toHaveBeenCalledTimes(1);
  });

  it("offers a way home, and it goes home", () => {
    const { onBackHome, onRematch } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Back home" }));
    expect(onBackHome).toHaveBeenCalledTimes(1);
    expect(onRematch).not.toHaveBeenCalled();
  });

  it("keeps Share result available alongside both", () => {
    const onShare = vi.fn();
    setup({ canShare: true, onShare });
    fireEvent.click(screen.getByRole("button", { name: /Share result/ }));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Next Battle" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back home" })).toBeTruthy();
  });
});

describe("ResultScreen — defeat", () => {
  it("still has Rematch and Back home wired the way they were", () => {
    const { onRematch, onBackHome } = setup({ won: false });
    fireEvent.click(screen.getByRole("button", { name: "Rematch" }));
    expect(onRematch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back home" }));
    expect(onBackHome).toHaveBeenCalledTimes(1);
  });

  it("falls back to onRebattle when no rematch is possible", () => {
    const { onRebattle } = setup({ won: false, onRematch: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Rematch" }));
    expect(onRebattle).toHaveBeenCalledTimes(1);
  });
});

describe("ResultScreen — one-attempt modes (hideRematch)", () => {
  it("victory: no rematch button, but Back home still gets you out", () => {
    setup({ won: true, hideRematch: true });
    expect(screen.queryByRole("button", { name: /next battle/i })).toBeNull();
    expect(screen.getByRole("button", { name: /back home/i })).toBeTruthy();
  });

  it("defeat: no rematch button, but Back home still gets you out", () => {
    setup({ won: false, hideRematch: true });
    expect(screen.queryByRole("button", { name: /^rematch$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /back home/i })).toBeTruthy();
  });

  it("without the flag the button is still there (regular battles unchanged)", () => {
    setup({ won: true });
    expect(screen.getByRole("button", { name: /next battle/i })).toBeTruthy();
  });
});

describe("ResultScreen — the bottom nav claim", () => {
  // Owner report 2026-08-01: after a defeat, going home left the bottom nav
  // gone for the rest of the session.
  //
  // `setBattleScreenActive` is a CLAIM COUNTER (see lib/store.ts) — the
  // argument means "claim" or "release", it is not a value to restore. This
  // screen's cleanup used to hand back the value it captured on mount, which is
  // `true`, so unmounting CLAIMED the nav a second time instead of releasing
  // it and the count never came back to zero. The store's own unit tests can't
  // see that: they only exercise well-formed claim/release pairs.
  //
  // The outer claim below is what makes this a regression test rather than a
  // tautology: the battle screen already holds the nav when this screen mounts,
  // which is exactly the state in which "restore what I saw" and "release"
  // differ. Start from zero and the two are indistinguishable.
  it("releases its claim on unmount so the nav comes back", () => {
    // The battle screen we render inside already holds the nav.
    useGameStore.setState({ battleScreenActive: true, fullScreenClaims: 1 });
    const { unmount } = render(<ResultScreen {...RESULT_PROPS} />);
    expect(useGameStore.getState().fullScreenClaims).toBe(2);
    unmount();
    expect(useGameStore.getState().fullScreenClaims, "gave back exactly what it took").toBe(1);

    // ...and once the battle screen lets go too, the nav is back.
    useGameStore.getState().setBattleScreenActive(false);
    expect(useGameStore.getState().battleScreenActive).toBe(false);
  });
});
