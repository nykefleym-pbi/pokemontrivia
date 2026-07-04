import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Swords, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/store";
import { ensureSession, getProfileById, type TrainerProfile } from "@/lib/social";
import { listPvpInvites, declinePvpChallenge, type PvpMatch } from "@/lib/pvp";
import { playSfx } from "@/lib/audio";
import { trainerSpriteUrl } from "@/lib/game-data";

interface Invite extends PvpMatch {
  challenger: TrainerProfile | null;
}

export function PvpInviteInbox() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await listPvpInvites();
    const withProfiles = await Promise.all(
      rows.map(async (m) => ({ ...m, challenger: await getProfileById(m.challengerId) })),
    );
    setInvites(withProfiles);
    setOpen(withProfiles.length > 0);
  }, []);

  useEffect(() => {
    if (!hasOnboarded) return;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [hasOnboarded, refresh]);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!hasOnboarded) return;
    let cancelled = false;
    (async () => {
      try {
        const uid = await ensureSession();
        if (!uid || cancelled) return;
        const channel = supabase
          .channel(`pvp_invites_inbox_${uid}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "pvp_matches",
              filter: `opponent_id=eq.${uid}`,
            },
            () => {
              playSfx("friend_ping");
              void refresh();
            },
          )
          .subscribe();
        channelRef.current = channel;
      } catch (e) {
        console.warn("[PvpInviteInbox] realtime setup failed:", e);
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

  function dismiss(matchId: string) {
    setInvites((rs) => {
      const next = rs.filter((r) => r.id !== matchId);
      if (next.length === 0) setOpen(false);
      return next;
    });
  }

  async function handleDecline(matchId: string) {
    if (busyId) return;
    setBusyId(matchId);
    const res = await declinePvpChallenge(matchId);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Couldn't decline, try again.");
      return;
    }
    dismiss(matchId);
  }

  function handlePlay(matchId: string) {
    dismiss(matchId);
    setOpen(false);
    void navigate({ to: "/pvp/$matchId", params: { matchId } });
  }

  if (!hasOnboarded || invites.length === 0) return null;

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
            PvP {invites.length === 1 ? "challenge" : "challenges"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {invites.map((inv) => {
            const busy = busyId === inv.id;
            return (
              <div
                key={inv.id}
                className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card"
              >
                <img
                  src={trainerSpriteUrl(inv.challenger?.trainer_sprite || "red")}
                  alt=""
                  className="sprite h-12 w-12 shrink-0 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-base text-foreground">
                    {inv.challenger?.trainer_name || "A trainer"}
                  </div>
                  <div className="font-pixel-xs text-foreground/55">
                    LV {inv.challenger?.level ?? 1} · challenged you
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 rounded-full"
                    disabled={busy}
                    onClick={() => void handleDecline(inv.id)}
                    aria-label="Decline"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    disabled={busy}
                    onClick={() => handlePlay(inv.id)}
                    aria-label="Play"
                  >
                    <Swords className="h-4 w-4" />
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
