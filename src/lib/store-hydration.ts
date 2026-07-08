import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store";

/**
 * Returns true once the Zustand persist store has finished rehydrating from
 * localStorage. Always starts `false` (so SSR and the first client render
 * produce identical output — no hydration mismatch), then flips to `true` in an
 * effect: immediately if hydration already completed, otherwise when
 * `onFinishHydration` fires.
 *
 * Onboarding guards that redirect based on persisted state (e.g. `hasOnboarded`)
 * must wait for this — otherwise they fire against default values during
 * hydration and bounce deep-linked users away.
 */
export function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useGameStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useGameStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  return hydrated;
}
