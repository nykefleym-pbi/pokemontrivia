// 17.3: the starred bag item rides beside the bag button; one tap uses it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ItemBagSheet } from "@/components/game-ui";
import { useGameStore } from "@/lib/store";

afterEach(() => {
  cleanup();
  useGameStore.setState({ starredItem: null });
});

const props = (onUseItem = vi.fn()) => ({
  bagOpen: false,
  onBagOpenChange: () => {},
  inventory: { potion: 2 },
  usedThisBattle: {},
  itemsUsedThisBattleCount: 0,
  maxItemsPerBattle: 3,
  itemCapReached: false,
  choiceSpecsActive: false,
  anyItemUsedThisBattle: false,
  escapeDisabled: false,
  onUseItem,
  variant: "icon" as const,
});

describe("starred bag item chip", () => {
  it("shows no chip until an item is starred", () => {
    render(<ItemBagSheet {...props()} />);
    expect(screen.queryByTestId("starred-item")).toBeNull();
  });

  it("uses the starred item in one tap", () => {
    useGameStore.setState({ starredItem: "potion" });
    const onUseItem = vi.fn();
    render(<ItemBagSheet {...props(onUseItem)} />);
    fireEvent.click(screen.getByTestId("starred-item"));
    expect(onUseItem).toHaveBeenCalledWith("potion");
  });

  it("hides the chip when the starred item has run out", () => {
    useGameStore.setState({ starredItem: "potion" });
    render(<ItemBagSheet {...props()} inventory={{}} />);
    expect(screen.queryByTestId("starred-item")).toBeNull();
  });
});
