import { describe, expect, it } from "vitest";
import { storySpec, type BattleShareData } from "./share-card-builder";

const battle: BattleShareData = {
  type: "battle",
  trainerName: "Mika",
  trainerSpriteUrl: "",
  partnerName: "Bulbasaur",
  partnerPokemonId: 1,
  partnerShiny: false,
  opponentName: "Picnicker Janine",
  opponentTitle: "Trainer",
  opponentSpriteUrl: null,
  signaturePokemonId: 1,
  finalPlayerHp: 1,
  maxPlayerHp: 1,
  topStreak: 1,
  topDamage: 1,
  dateISO: "2026-11-27",
  correctCount: 7,
  totalQuestions: 8,
  avgTimeMs: 12_750,
  xpEarned: 75,
  level: 2,
};

describe("storySpec (Figma row 9 stories)", () => {
  it("a win is the yellow Victory card with right, time and XP", () => {
    const s = storySpec(battle);
    expect([s.headline, s.line]).toEqual(["VICTORY!", "Beat Picnicker Janine"]);
    expect(s.stats.map((x) => x.value)).toEqual(["7/8", "1:42", "+75"]);
  });

  it("an Elite Four win names the Elite Four", () => {
    expect(storySpec({ ...battle, type: "elite", opponentTitle: "Elite Four", opponentName: "Lorelei" }).line).toBe("Beat Elite Four Lorelei");
  });

  it("a perfect Daily Quest dares the same questions and shows the day streak", () => {
    const s = storySpec({ ...battle, type: "daily-perfect", correctCount: 10, totalQuestions: 10, dayStreak: 3 });
    expect(s.headline).toBe("10 OUT OF 10!");
    expect(s.stats[2]).toMatchObject({ value: "3", label: "DAY STREAK" });
    expect(s.cta).toBe("Same 10 questions. Your turn?");
  });

  it("an evolution counts the stage along its line", () => {
    const s = storySpec({
      type: "evolution", trainerName: "Mika", trainerSpriteUrl: "", fromPokemonId: 1, fromName: "Bulbasaur", toPokemonId: 2, toName: "Ivysaur",
      toShiny: false, level: 2, rank: "", statBattles: 12, statWins: 0, statLosses: 0, statBestStreak: 0, statCorrect: 0, statAnswered: 0,
      statTotalAnswerTime: 0, dateISO: "2026-11-27",
    });
    expect(s.stats.map((x) => x.value)).toEqual(["2/3", "12"]);
  });

  it("a level-up without an item shows two tiles", () => {
    const s = storySpec({ type: "level-up", trainerName: "Mika", trainerSpriteUrl: "", level: 3, coins: 40, dateISO: "2026-11-27" });
    expect(s.stats.map((x) => x.label)).toEqual(["LEVEL", "COINS"]);
  });
});
