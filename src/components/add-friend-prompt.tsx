import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NaIcon } from "@/components/na/icon";
import { NaButton } from "@/components/na/button";
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

  // Figma 15.5: a glass row with the add icon, the question, Add and ×.
  return (
    <div className="flex w-full items-center gap-3 rounded-[18px] border border-white/[0.12] bg-white/[0.08] px-3.5 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-foreground">
        {sent ? <NaIcon name="check" size={18} className="text-success" /> : <NaIcon name="user-plus" size={18} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="na-headline truncate text-foreground">{sent ? `Request sent to ${opponentName}` : `Add ${opponentName} as a friend?`}</span>
        <span className="na-caption text-text-secondary">{sent ? "They'll see it in their inbox." : "Battle again anytime!"}</span>
      </span>
      {!sent && (
        <span className="flex shrink-0 items-center gap-1.5">
          <NaButton
            kind="secondary"
            size="M"
            disabled={busy}
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
              toast.success(res.status === "accepted" ? `You and ${opponentName} are now friends!` : `Friend request sent to ${opponentName}`);
            }}
          >
            Add
          </NaButton>
          <button type="button" aria-label="Not now" onClick={() => setDismissed(true)} className="p-1 text-text-muted press">
            <NaIcon name="x" size={18} />
          </button>
        </span>
      )}
    </div>
  );
}