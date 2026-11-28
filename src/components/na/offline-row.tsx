import { useEffect, useState } from "react";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaButton } from "@/components/na/button";

/** Live browser online state (navigator.onLine + its events). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/**
 * Figma 14.3's no-connection state as one row at the top of a screen that
 * needs the server (Shop, Friends, leaderboards). Shows only while offline, or
 * when the screen says its own request failed (`failed`). Try again calls
 * `onRetry`, else reloads the page.
 */
export function NaOfflineRow({ failed = false, onRetry }: { failed?: boolean; onRetry?: () => void }) {
  const online = useOnline();
  if (online && !failed) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-[18px] border border-white/[0.12] bg-white/[0.08] p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
        <NaGlossIcon kind="wifi-off" size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="na-headline text-foreground">No connection</span>
        <span className="na-caption text-text-secondary">Your progress is saved on this device.</span>
      </span>
      <NaButton kind="secondary" size="M" onClick={() => (onRetry ? onRetry() : window.location.reload())}>
        Try again
      </NaButton>
    </div>
  );
}
