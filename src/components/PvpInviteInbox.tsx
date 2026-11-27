import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/store";
import { ensureSession, getProfileById, type TrainerProfile } from "@/lib/social";
import { listPvpInvites, declinePvpChallenge, type PvpMatch } from "@/lib/pvp";
import { playSfx } from "@/lib/audio";
import { ALL_POKEMON_SLIM } from "@/lib/pokemon-data.slim.generated";
import { NaSheet } from "@/components/na/sheet";
import { FaceAvatar } from "@/components/na/face-off";

interface Invite extends PvpMatch {
  challenger: TrainerProfile | null;
}

/**
 * Figma 16.4 "A battle invite arrives": one sheet per challenge, never during a
 * battle. Closing it keeps the challenge waiting in Friends (Play on that friend).
 */
export function PvpInviteInbox() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const inBattle = useGameStore((s) => s.battleScreenActive);
  const navigate = useNavigate();
  // never over a battle, the pop-up rule (2.2) — friend battles included
  const onPvp = useLocation({ select: (l) => l.pathname.startsWith("/pvp") });
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const rows = await listPvpInvites();
    const withProfiles = await Promise.all(
      rows.map(async (m) => ({ ...m, challenger: await getProfileById(m.challengerId) })),
    );
    setInvites(withProfiles);
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

  const inv = invites.find((i) => !dismissed.has(i.id));
  const hide = (id: string) => setDismissed((d) => new Set(d).add(id));

  async function decline(id: string) {
    if (busy) return;
    setBusy(true);
    const res = await declinePvpChallenge(id);
    setBusy(false);
    if (!res.ok) {
      toast.error("Couldn't decline, try again.");
      return;
    }
    setInvites((rs) => rs.filter((r) => r.id !== id));
  }

  if (!hasOnboarded || !inv) return null;
  const name = inv.challenger?.trainer_name || "A trainer";
  const partner = inv.challenger?.ace_pokemon_id ? ALL_POKEMON_SLIM.find((p) => p.id === inv.challenger?.ace_pokemon_id)?.name : undefined;

  return (
    <NaSheet
      open={!inBattle && !onPvp}
      onOpenChange={(o) => !o && hide(inv.id)}
      title={`${name} challenges you!`}
      body={`Answer the same questions as ${name}. Beat their score to win!`}
      primary={{
        label: "Accept",
        disabled: busy,
        onClick: () => {
          hide(inv.id);
          void navigate({ to: "/pvp/$matchId", params: { matchId: inv.id } });
        },
      }}
      secondary={{ label: "Decline", onClick: () => void decline(inv.id) }}
      footnote="You can find this challenge in Friends anytime."
    >
      <div className="flex items-center gap-3">
        <FaceAvatar spriteId={inv.challenger?.trainer_sprite || "red"} size={56} ring="#5B8CFF" />
        <span className="flex min-w-0 flex-col">
          <span className="na-headline truncate text-foreground">{name}</span>
          <span className="na-caption text-text-secondary">{[`Level ${inv.challenger?.level ?? 1}`, partner].filter(Boolean).join(" · ")}</span>
        </span>
      </div>
    </NaSheet>
  );
}
