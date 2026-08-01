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
}));

afterEach(cleanup);

function setup(overrides: Partial<Parameters<typeof ResultScreen>[0]> = {}) {
  const handlers = {
    onRebattle: vi.fn(),
    onBackHome: vi.fn(),
    onRematch: vi.fn(),
  };
  render(
    <ResultScreen
      won
      opponentName="Regieleki"
      correctCount={9}
      totalQuestions={12}
      xpEarned={40}
      tpEarned={12}
      coinsEarned={30}
      speedBonus={0}
      partnerName="Caterpie"
      partnerId={10}
      streak={3}
      streakKept
      currentLevel={7}
      xpIntoLevel={20}
      xpForThisLevel={100}
      levelProgressPct={20}
      newTrophies={[]}
      missed={[]}
      {...handlers}
      {...overrides}
    />,
  );
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
