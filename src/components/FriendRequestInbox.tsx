import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/store";
import { ensureSession, listIncomingFriendRequests } from "@/lib/social";
import { playSfx } from "@/lib/audio";
import { FRIENDS_REFRESH_EVENT, openFriendsFrom } from "@/components/friends-screen";

/**
 * Figma 16.1: friend requests wait in Friends (a row there, 16.2) instead of
 * popping up. This only tells you one arrived — a toast with View, never in a
 * battle — once per app open and again on each new request.
 */
export function FriendRequestInbox() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const toldRef = useRef(false);

  const tell = useCallback(
    async (fresh: boolean) => {
      const rows = await listIncomingFriendRequests();
      window.dispatchEvent(new CustomEvent(FRIENDS_REFRESH_EVENT));
      if (!rows.length || (!fresh && toldRef.current) || useGameStore.getState().battleScreenActive) return;
      toldRef.current = true;
      const who = rows.length === 1 ? `${rows[0].trainerName || "A trainer"} wants` : `${rows.length} trainers want`;
      toast(`${who} to be your friend!`, {
        id: "friend-requests",
        action: { label: "View", onClick: () => openFriendsFrom("requests", () => void navigate({ to: "/profile" })) },
      });
    },
    [navigate],
  );

  useEffect(() => {
    if (!hasOnboarded) return;
    void tell(false);
  }, [hasOnboarded, tell]);

  // Realtime subscription for INSERT events targeting this user
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!hasOnboarded) return;
    let cancelled = false;
    (async () => {
      try {
        const uid = await ensureSession();
        if (!uid || cancelled) return;
        const channel = supabase
          .channel(`friend_requests_inbox_${uid}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "friend_requests",
              filter: `to_id=eq.${uid}`,
            },
            () => {
              playSfx("friend_ping");
              void tell(true);
            },
          )
          .subscribe();
        channelRef.current = channel;
      } catch (e) {
        console.warn("[FriendRequestInbox] realtime setup failed:", e);
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
  }, [hasOnboarded, tell]);

  return null;
}
