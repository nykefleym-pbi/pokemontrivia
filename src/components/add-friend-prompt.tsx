import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus, Check } from "lucide-react";
import { listFriends, listPendingRequestTargets, sendFriendRequestById } from "@/lib/social";

/**
 * "Add the trainer you just battled" — offered on the Nearby Battle result.
 *
 * Renders NOTHING unless there is something to offer: no opponent id (a Training
 * Bot match has no profile row at all), already friends, or a request already
 * pending in either direction. That check is why this is a component rather than
 * a prop on the result screen — the answer needs two network calls, and a prompt
 * that appears and then retracts once they land would be worse than none.
 */
export function AddFriendPrompt({
  opponentId,
  opponentName,
}: {
  opponentId: string | null | undefined;
  opponentName: string;
}) {
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!opponentId) return;
    let cancelled = false;
    void (async () => {
      const [friends, pending] = await Promise.all([
        listFriends().catch(() => []),
        listPendingRequestTargets().catch(() => new Set<string>()),
      ]);
      if (cancelled) return;
      const already = friends.some((f) => f.id === opponentId) || pending.has(opponentId);
      setEligible(!already);
    })();
    return () => {
      cancelled = true;
    };
  }, [opponentId]);

  if (!opponentId || !eligible || dismissed) return null;

  return (
    <div className="mx-auto w-full max-w-sm rounded-[20px] border border-white/15 bg-white/[0.07] px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
          <UserPlus className="h-4 w-4 text-white" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-white">
            {sent ? `Request sent to ${opponentName}` : `Add ${opponentName} as a friend?`}
          </div>
          <div className="text-xs text-white/60">
            {sent ? "They'll see it in their inbox." : "Battle them again any time."}
          </div>
        </div>
        {sent ? (
          <Check className="h-5 w-5 shrink-0 text-hp-good" aria-hidden />
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                const res = await sendFriendRequestById(opponentId);
                setBusy(false);
                if (res.error) {
                  toast.error(res.error);
                  return;
                }
                setSent(true);
                toast.success(
                  res.status === "accepted"
                    ? `You and ${opponentName} are now friends!`
                    : `Friend request sent to ${opponentName}`,
                );
              }}
              disabled={busy}
              className="h-8 rounded-full bg-white px-3 text-xs font-bold text-foreground transition press disabled:opacity-50"
            >
              Add
            </button>
            <button
              aria-label="Not now"
              onClick={() => setDismissed(true)}
              className="h-8 rounded-full px-2 text-xs font-bold text-white/50 transition press"
            >
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
