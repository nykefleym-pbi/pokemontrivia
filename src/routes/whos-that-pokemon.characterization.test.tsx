// Characterization/wiring test for WhosThatPokemon after Phase 4's
// server-authority wiring: round generation and reward grant now flow
// through startWhosThat()/submitWhosThat() (the whos-that Edge Function),
// not a client-generated makeRound() + direct store mutations. Mirrors the
// discipline used for Mega Raid/Daily Quest — render the REAL component via
// RTL and drive it through scripted plays.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/audio", () => ({
  playCry: vi.fn(),
  playSfx: vi.fn(),
  stopBgm: vi.fn(),
  revealPokemon: vi.fn(),
  playWhosThatShout: vi.fn(),
}));

vi.mock("@/lib/social", () => ({ syncActivity: vi.fn().mockResolvedValue(undefined) }));

const { startWhosThat, submitWhosThat } = vi.hoisted(() => ({
  startWhosThat: vi.fn(),
  submitWhosThat: vi.fn(),
}));
vi.mock("@/services/client/whos-that", () => ({ startWhosThat, submitWhosThat }));

import { WhosThatPokemon } from "./whos-that-pokemon";
import { useGameStore } from "@/lib/store";
import { findPokemon } from "@/lib/pokemon-data";
import type { WhosThatRound } from "@/lib/whos-that";

const PARTNER = findPokemon(1)!; // Bulbasaur

const ROUND_1A: WhosThatRound = {
  monId: 25, // Pikachu
  name: "Pikachu",
  types: ["electric"],
  mode: "1A",
  isShiny: false,
  rewardId: "potion",
  rewardName: "Potion",
  rewardIcon: "/icons/potion.png",
  cropBack: false,
  cropDX: 0,
  cropDY: 0,
  choices: ["Pikachu", "Raichu", "Pichu", "Eevee"],
};

const ROUND_1B: WhosThatRound = { ...ROUND_1A, mode: "1B" };

let initialStoreState: ReturnType<typeof useGameStore.getState>;

beforeEach(() => {
  if (!initialStoreState) initialStoreState = useGameStore.getState();
  startWhosThat.mockReset();
  submitWhosThat.mockReset();
  startWhosThat.mockResolvedValue({ locked: false, roundId: "round-1", round: ROUND_1A });
});

afterEach(() => {
  cleanup();
  useGameStore.setState(initialStoreState, true);
});

function seedStore() {
  useGameStore.setState({ ...initialStoreState, pokemon: PARTNER }, true);
}

describe("WhosThatPokemon server-authority wiring", () => {
  it("guessing correctly applies the server's returned reward and shows the win screen", async () => {
    submitWhosThat.mockResolvedValue({
      correct: true,
      reward: { xp: 100, itemId: "potion", itemQty: 1 },
      monId: 25,
      name: "Pikachu",
      isShiny: false,
    });
    seedStore();
    render(<WhosThatPokemon />);

    const input = await screen.findByPlaceholderText("Type the Pokémon's name…");
    fireEvent.change(input, { target: { value: "Pikachu" } });
    await act(async () => {
      fireEvent.click(screen.getByText("SUBMIT"));
    });

    expect(await screen.findByText("COLLECT")).toBeTruthy();
    expect(submitWhosThat).toHaveBeenCalledWith("round-1", { guessText: "Pikachu" });
    const state = useGameStore.getState();
    expect(state.xp).toBe(initialStoreState.xp + 100);
    expect(state.inventory.potion ?? 0).toBe((initialStoreState.inventory.potion ?? 0) + 1);
    expect(state.pokedex[25]).toBeTruthy();
  });

  it("guessing wrong applies no reward and shows the answer", async () => {
    submitWhosThat.mockResolvedValue({ correct: false, reward: null, monId: 25, name: "Pikachu", isShiny: false });
    seedStore();
    render(<WhosThatPokemon />);

    const input = await screen.findByPlaceholderText("Type the Pokémon's name…");
    fireEvent.change(input, { target: { value: "Bulbasaur" } });
    await act(async () => {
      fireEvent.click(screen.getByText("SUBMIT"));
    });

    expect(await screen.findByText("Not quite…")).toBeTruthy();
    const state = useGameStore.getState();
    expect(state.xp).toBe(initialStoreState.xp);
    expect(state.pokedex[25]).toBeFalsy();
  });

  it("sends the selected types for a 1B round, validated server-side", async () => {
    startWhosThat.mockResolvedValue({ locked: false, roundId: "round-2", round: ROUND_1B });
    submitWhosThat.mockResolvedValue({
      correct: true,
      reward: { xp: 100, itemId: "potion", itemQty: 1 },
      monId: 25,
      name: "Pikachu",
      isShiny: false,
    });
    seedStore();
    render(<WhosThatPokemon />);

    const typeButton = await screen.findByText("electric");
    await act(async () => {
      fireEvent.click(typeButton);
    });
    await act(async () => {
      fireEvent.click(screen.getByText("SUBMIT"));
    });

    expect(await screen.findByText("COLLECT")).toBeTruthy();
    expect(submitWhosThat).toHaveBeenCalledWith("round-2", { guessTypes: ["electric"] });
  });

  it("applies nothing when the server reports alreadyGranted", async () => {
    submitWhosThat.mockResolvedValue({ correct: true, alreadyGranted: true, reward: null, monId: 25, name: "Pikachu", isShiny: false });
    seedStore();
    render(<WhosThatPokemon />);

    const input = await screen.findByPlaceholderText("Type the Pokémon's name…");
    fireEvent.change(input, { target: { value: "Pikachu" } });
    await act(async () => {
      fireEvent.click(screen.getByText("SUBMIT"));
    });

    await screen.findByText("COLLECT");
    const state = useGameStore.getState();
    expect(state.xp).toBe(initialStoreState.xp);
    expect(state.inventory.potion ?? 0).toBe(initialStoreState.inventory.potion ?? 0);
  });

  it("falls back to a local guess check (no reward) when the submit call fails", async () => {
    submitWhosThat.mockRejectedValue(new Error("network down"));
    seedStore();
    render(<WhosThatPokemon />);

    const input = await screen.findByPlaceholderText("Type the Pokémon's name…");
    fireEvent.change(input, { target: { value: "Pikachu" } });
    await act(async () => {
      fireEvent.click(screen.getByText("SUBMIT"));
    });

    expect(await screen.findByText("COLLECT")).toBeTruthy();
    // No reward applied — a network failure never grants XP/items locally.
    expect(useGameStore.getState().xp).toBe(initialStoreState.xp);
  });

  it("shows the locked screen when the server reports the hourly gate is active", async () => {
    startWhosThat.mockResolvedValue({ locked: true, msToNextHour: 12 * 60 * 1000 });
    seedStore();
    render(<WhosThatPokemon />);

    expect(await screen.findByText("Play again in")).toBeTruthy();
    expect(submitWhosThat).not.toHaveBeenCalled();
  });
});
