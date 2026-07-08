import { useEffect, useRef } from "react";

/**
 * Traps the browser/Android back button while a battle is active so a stray
 * back press can't silently abandon the run (feedback 2286b6fc).
 *
 * While `active`, a sentinel history entry sits on top of the stack; pressing
 * Back pops the sentinel, which we immediately re-push before invoking
 * `onBackAttempt`. The screen decides what "attempt to leave" means — usually
 * opening its forfeit-confirm dialog. On confirm the screen runs its normal
 * exit path (the guard deactivates when `active` flips false, releasing the
 * sentinel).
 */
export function useForfeitGuard(active: boolean, onBackAttempt: () => void) {
  const cb = useRef(onBackAttempt);
  cb.current = onBackAttempt;

  useEffect(() => {
    if (!active) return;
    window.history.pushState({ battleGuard: true }, "");
    const onPop = () => {
      window.history.pushState({ battleGuard: true }, "");
      cb.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.battleGuard) window.history.back();
    };
  }, [active]);
}
