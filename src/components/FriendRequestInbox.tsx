import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/store";
import { ensureSession, listIncomingFriendRequests, respondFriendRequest } from "@/lib/social";
import { trainerSpriteUrl } from "@/lib/game-data";

interface IncomingRequest {
  requestId: string;
  fromId: string;
  trainerName: string;
  trainerSprite: string;
  level: number;
  friendCode: string;
  createdAt: string;
}

export const FRIENDS_REFRESH_EVENT = "poketrivia:friends-refresh";

export function FriendRequestInbox() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await listIncomingFriendRequests();
    setRequests(rows);
    setOpen(rows.length > 0);
  }, []);

  // Initial load + on window focus
  useEffect(() => {
    if (!hasOnboarded) return;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hasOnboarded, refresh]);

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
              void refresh();
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
  }, [hasOnboarded, refresh]);

  async function handleRespond(req: IncomingRequest, accept: boolean) {
    if (respondingId) return;
    setRespondingId(req.requestId);
    const res = await respondFriendRequest(req.requestId, accept);
    setRespondingId(null);
    if (!res.ok) {
      toast.error("Couldn't respond, try again.");
      return;
    }
    setRequests((rs) => {
      const next = rs.filter((r) => r.requestId !== req.requestId);
      if (next.length === 0) setOpen(false);
      return next;
    });
    if (res.status === "accepted") {
      toast.success(`You're now friends with ${req.trainerName || "trainer"}!`);
      try {
        window.dispatchEvent(new CustomEvent(FRIENDS_REFRESH_EVENT));
      } catch {
        /* noop */
      }
    } else {
      toast("Request declined.");
    }
  }

  if (!hasOnboarded || requests.length === 0) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setOpen(false);
      }}
    >
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display-xl text-foreground">
            Friend {requests.length === 1 ? "request" : "requests"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {requests.map((req) => {
            const busy = respondingId === req.requestId;
            return (
              <div
                key={req.requestId}
                className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card"
              >
                <img
                  src={trainerSpriteUrl(req.trainerSprite || "red")}
                  alt=""
                  className="sprite h-12 w-12 shrink-0 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-base text-foreground">
                    {req.trainerName || "Trainer"}
                  </div>
                  <div className="font-pixel-xs text-foreground/55">
                    LV {req.level} · {req.friendCode}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 rounded-full"
                    disabled={busy}
                    onClick={() => void handleRespond(req, false)}
                    aria-label="Decline"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    disabled={busy}
                    onClick={() => void handleRespond(req, true)}
                    aria-label="Accept"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
