import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { litGiftPips } from "@/lib/daily-gift";
import { ITEMS } from "@/lib/game-data";
import { syncActivity } from "@/lib/social";

/**
 * The 7-day gift as both places show it: the chest on the Home route (Figma
 * 2.5) and the Shop card. One claim path, so both toast the same way.
 */
export function useDailyGift(tickMs = 1000) {
  const lastClaim = useGameStore((s) => s.dailyGiftLastClaim);
  const streak = useGameStore((s) => s.dailyGiftStreak);
  const freezeUsedDate = useGameStore((s) => s.dailyGiftFreezeUsedDate);
  const claimDailyGift = useGameStore((s) => s.claimDailyGift);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(i);
  }, [tickMs]);
  const today = new Date(now).toISOString().slice(0, 10);
  const claimable = lastClaim !== today;
  // Aware of the weekly forgiven miss: a streak the freeze can still rescue keeps its pips lit.
  const lit = litGiftPips({ lastClaim, streak, freezeUsedDate, today });
  const nextDay = (lit % 7) + 1;
  const d = new Date(now);
  const msToNext = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
  const clock = `${Math.floor(msToNext / 3_600_000)}h ${String(Math.floor((msToNext % 3_600_000) / 60_000)).padStart(2, "0")}m`;

  function claim() {
    const res = claimDailyGift();
    if (!res) return null;
    void syncActivity("last_gift_claim");
    const it = ITEMS.find((x) => x.id === res.itemId);
    if (res.shiny) {
      toast.success(`Day 7 reward! ${res.qty}× ${it?.name ?? "item"} — your next battle win is a guaranteed shiny!`);
    } else {
      toast.success(`Daily Gift opened: ${res.qty}× ${it?.name ?? "item"}`);
    }
    // The player is about to see a streak that arithmetic says should have reset.
    if (res.usedFreeze) {
      toast.success("Streak saved", { description: "You missed a day — this one's forgiven. One free miss a week." });
    }
    if (res.comebackCoins > 0) {
      toast.success(`Welcome back! +${res.comebackCoins} coins`, { description: "Good to see you again." });
    }
    return res;
  }

  return { now, today, claimable, lit, nextDay, clock, claim };
}
