import { describe, it, expect, beforeEach } from "vitest";
import {
  DEX_MILESTONES,
  DEX_MILESTONE_REWARDS,
  GENERATIONS,
  claimDexReward,
  dexMilestoneState,
  dexRewardKey,
  dexRewardLabel,
  dexStats,
  generation,
  nextClaimableMilestone,
  type DexStats,
} from "@/lib/dex-rewards";
import { ALL_POKEMON } from "@/lib/pokemon-data";
import { useGameStore } from "@/lib/store";
import type { PokedexEntry } from "@/lib/store/types";

/** Registers the first `n` Pokémon of a generation, as caught or seen only. */
function fill(gen: number, n: number, how: "caught" | "seen" | "shiny") {
  const { from, to } = generation(gen);
  const ids = ALL_POKEMON.filter((p) => p.id >= from && p.id <= to)
    .slice(0, n)
    .map((p) => p.id);
  const dex: Record<number, PokedexEntry> = {};
  for (const id of ids) {
    dex[id] = {
      pokemonId: id,
      firstSeenAt: 1,
      shinyUnlocked: how === "shiny",
      defeatCount: how === "seen" ? 0 : 1,
      caught: how !== "seen",
    };
  }
  return dex;
}

describe("generations", () => {
  it("covers the national dex end to end with no gaps or overlaps", () => {
    expect(GENERATIONS[0].from).toBe(1);
    for (let i = 1; i < GENERATIONS.length; i++) {
      expect(GENERATIONS[i].from).toBe(GENERATIONS[i - 1].to + 1);
    }
  });

  it("names every region", () => {
    for (const g of GENERATIONS) expect(g.region).toMatch(/^[A-Z][a-z]+$/);
  });

  it("falls back to Kanto for an unknown generation rather than throwing", () => {
    expect(generation(99).region).toBe("Kanto");
  });
});

describe("dexStats", () => {
  it("counts caught and seen separately, never both", () => {
    const dex = { ...fill(1, 10, "caught"), ...fill(1, 3, "seen") };
    const s = dexStats(dex, 1);
    // The seen fill overwrites the first three of the caught fill.
    expect(s.caught).toBe(7);
    expect(s.seen).toBe(3);
    expect(s.caught + s.seen).toBe(Object.keys(dex).length);
  });

  it("reads a legacy entry with no `caught` key as caught", () => {
    // Every entry written before the field existed came from a capture, so
    // testing it truthily would demote an existing player's whole dex to seen.
    const legacy: Record<number, PokedexEntry> = {
      1: { pokemonId: 1, firstSeenAt: 1, shinyUnlocked: false, defeatCount: 2 },
    };
    const s = dexStats(legacy, 1);
    expect(s.caught).toBe(1);
    expect(s.seen).toBe(0);
  });

  it("counts only the requested generation", () => {
    const dex = { ...fill(1, 5, "caught"), ...fill(2, 8, "caught") };
    expect(dexStats(dex, 1).caught).toBe(5);
    expect(dexStats(dex, 2).caught).toBe(8);
    expect(dexStats(dex, 3).caught).toBe(0);
  });

  it("totals the generation's real size", () => {
    expect(dexStats({}, 1).total).toBe(151);
    expect(dexStats({}, 1).pct).toBe(0);
  });
});

describe("milestone table", () => {
  it("pays something at every rung", () => {
    for (const m of DEX_MILESTONES) {
      const r = DEX_MILESTONE_REWARDS[m];
      expect(r, String(m)).toBeTruthy();
      expect(r.coins + r.xp, String(m)).toBeGreaterThan(0);
    }
  });

  it("pays strictly more the further up the ladder", () => {
    for (let i = 1; i < DEX_MILESTONES.length; i++) {
      const lo = DEX_MILESTONE_REWARDS[DEX_MILESTONES[i - 1]];
      const hi = DEX_MILESTONE_REWARDS[DEX_MILESTONES[i]];
      expect(hi.coins).toBeGreaterThan(lo.coins);
      expect(hi.xp).toBeGreaterThan(lo.xp);
    }
  });

  it("labels every component of a payout", () => {
    expect(dexRewardLabel(DEX_MILESTONE_REWARDS[25])).toBe("+500 coins · +200 XP");
    const top = dexRewardLabel(DEX_MILESTONE_REWARDS[100]);
    expect(top).toContain("Rare Candy");
    expect(top).toContain("Poké Egg");
  });
});

describe("dexMilestoneState", () => {
  const stats = (caught: number, total = 100): DexStats => ({
    caught,
    seen: 0,
    shiny: 0,
    total,
    pct: caught / total,
  });

  it("opens a rung exactly at the threshold", () => {
    expect(dexMilestoneState(25, stats(24), 1, [])).toBe("locked");
    expect(dexMilestoneState(25, stats(25), 1, [])).toBe("claimable");
  });

  it("does not open a rung the rounded percentage merely looks like", () => {
    // 37/151 is 24.503%, which displays as 24.5% but is not 25% of the dex.
    expect(dexMilestoneState(25, stats(37, 151), 1, [])).toBe("locked");
    expect(dexMilestoneState(25, stats(38, 151), 1, [])).toBe("claimable");
  });

  it("reports a collected rung as claimed even at full completion", () => {
    expect(dexMilestoneState(100, stats(100), 1, [dexRewardKey(1, 100)])).toBe("claimed");
  });

  it("scopes claims to their own generation", () => {
    const claimed = [dexRewardKey(1, 25)];
    expect(dexMilestoneState(25, stats(100), 1, claimed)).toBe("claimed");
    expect(dexMilestoneState(25, stats(100), 2, claimed)).toBe("claimable");
  });

  it("offers the lowest unclaimed rung first", () => {
    expect(nextClaimableMilestone(stats(100), 1, [])).toBe(25);
    expect(nextClaimableMilestone(stats(100), 1, [dexRewardKey(1, 25)])).toBe(50);
    expect(nextClaimableMilestone(stats(10), 1, [])).toBeNull();
  });
});

describe("claimDexReward", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it("refuses a rung that has not been reached", () => {
    const before = useGameStore.getState().coins;
    expect(claimDexReward(1, 25, useGameStore.getState())).toBeNull();
    expect(useGameStore.getState().coins).toBe(before);
    expect(useGameStore.getState().claimedDexRewards).toEqual([]);
  });

  it("grants coins and XP, then marks the rung claimed", () => {
    useGameStore.setState({ pokedex: fill(1, 40, "caught") });
    const coins = useGameStore.getState().coins;
    const res = claimDexReward(1, 25, useGameStore.getState());
    expect(res).not.toBeNull();
    expect(res!.text).toContain("+500 coins");
    expect(useGameStore.getState().coins).toBe(coins + 500);
    expect(useGameStore.getState().claimedDexRewards).toEqual([dexRewardKey(1, 25)]);
  });

  it("refuses a second claim of the same rung", () => {
    useGameStore.setState({ pokedex: fill(1, 40, "caught") });
    expect(claimDexReward(1, 25, useGameStore.getState())).not.toBeNull();
    const coins = useGameStore.getState().coins;
    expect(claimDexReward(1, 25, useGameStore.getState())).toBeNull();
    expect(useGameStore.getState().coins).toBe(coins);
  });

  it("checks the live store, not a caught count the caller passed in", () => {
    // Nothing registered — a stale card offering a rung must not pay out.
    useGameStore.setState({ pokedex: {} });
    expect(claimDexReward(1, 100, useGameStore.getState())).toBeNull();
  });

  it("grants the egg only at the top rung", () => {
    useGameStore.setState({ pokedex: fill(1, 151, "caught") });
    const eggs = useGameStore.getState().pokeEggs.length;
    claimDexReward(1, 75, useGameStore.getState());
    expect(useGameStore.getState().pokeEggs.length).toBe(eggs);
    claimDexReward(1, 100, useGameStore.getState());
    expect(useGameStore.getState().pokeEggs.length).toBe(eggs + 1);
  });
});
