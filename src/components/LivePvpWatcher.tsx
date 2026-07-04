import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/store";
import { ensureSession } from "@/lib/social";
import { playSfx } from "@/lib/audio";

/**
 * Background watcher for the "scanned into a Nearby Battle" side: the
 * instant someone scans your Battle Code, a pvp_live_matches row is created
 * with guest_id = you. There's no invite/accept step (mirrors Pokémon GO —
 * you're already face to face), so this just pulls you straight into the
 * live match the moment it appears.
 */
export function LivePvpWatcher() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!hasOnboarded) return;
    let cancelled = false;
    (async () => {
      try {
        const uid = await ensureSession();
        if (!uid || cancelled) return;
        const channel = supabase
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
              if (!matchId) return;
              playSfx("friend_ping");
              void navigate({ to: "/pvp/live/$matchId", params: { matchId } });
            },
          )
          .subscribe();
        channelRef.current = channel;
      } catch (e) {
        console.warn("[LivePvpWatcher] realtime setup failed:", e);
      }
    })();
    return () => {
      cancelled = true;
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
