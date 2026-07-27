import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/store";
import { ensureSession } from "@/lib/social";
import { findPendingLiveMatch } from "@/lib/pvp-live";
import { playSfx } from "@/lib/audio";

/** How often to ask the server whether someone has pulled me into a match,
 *  while this tab is actually in front of the player. Realtime still wins the
 *  race in the normal case; this is the floor on how late the news can be. */
const POLL_MS = 4_000;

/**
 * Background watcher for the "scanned into a Nearby Battle" side: the
 * instant someone scans your Battle Code, a pvp_live_matches row is created
 * with guest_id = you. There's no invite/accept step (mirrors Pokémon GO —
 * you're already face to face), so this just pulls you straight into the
 * live match the moment it appears.
 *
 * Two ways of hearing about it, because one was not enough:
 *
 *  - **realtime** (`postgres_changes` INSERT) — instant, and how it should
 *    normally arrive.
 *  - **polling** `findPendingLiveMatch` — the safety net. postgres_changes
 *    has no replay, so a socket asleep behind a backgrounded tab, a
 *    reconnect, or a client still mid-`subscribe()` when the row landed used
 *    to miss the news *permanently*: the scanner sat in a battle whose
 *    opponent never showed. Polling only runs while the tab is visible, and
 *    a check also fires on mount, on becoming visible again, and when the
 *    realtime channel (re)subscribes — the three moments an event is most
 *    likely to have been dropped.
 *
 * Whichever gets there first wins; `handledRef` makes the other a no-op.
 */
export function LivePvpWatcher() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const handledRef = useRef<string | null>(null);

  // Read through a ref, not a dep: re-running this effect on every navigation
  // would tear down and re-subscribe the realtime channel, reopening the very
  // window this component exists to close.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!hasOnboarded) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let onVisible: (() => void) | null = null;

    const pullIn = (matchId: string) => {
      if (cancelled || !matchId) return;
      if (handledRef.current === matchId) return;
      // Already inside a live match — never yank the player out of one battle
      // and into another.
      if (pathRef.current.startsWith("/pvp/live/")) return;
      handledRef.current = matchId;
      playSfx("friend_ping");
      void navigate({ to: "/pvp/live/$matchId", params: { matchId } });
    };

    (async () => {
      try {
        const uid = await ensureSession();
        if (!uid || cancelled) return;

        const check = async () => {
          if (cancelled || document.visibilityState !== "visible") return;
          if (pathRef.current.startsWith("/pvp/live/")) return;
          const matchId = await findPendingLiveMatch(uid);
          if (matchId) pullIn(matchId);
        };

        onVisible = () => {
          if (document.visibilityState === "visible") void check();
        };
        document.addEventListener("visibilitychange", onVisible);

        channelRef.current = supabase
          .channel(`pvp_live_watcher_${uid}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "pvp_live_matches",
              filter: `guest_id=eq.${uid}`,
            },
            (payload) => {
              const matchId = (payload.new as { id?: string } | null)?.id;
              if (matchId) pullIn(matchId);
            },
          )
          .subscribe((status) => {
            // A fresh SUBSCRIBED after a dropped socket is exactly when an
            // INSERT can have happened with nobody listening.
            if (status === "SUBSCRIBED") void check();
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.warn("[LivePvpWatcher] realtime channel", status, "— polling covers it");
            }
          });

        void check();
        timer = setInterval(() => void check(), POLL_MS);
      } catch (e) {
        console.warn("[LivePvpWatcher] watcher setup failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch {
          /* noop */
        }
        channelRef.current = null;
      }
    };
  }, [hasOnboarded, navigate]);

  return null;
}
