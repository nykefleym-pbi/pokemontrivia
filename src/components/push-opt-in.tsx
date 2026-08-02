import { useCallback, useEffect, useState } from "react";
import { Bell, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { enablePushNotifications, getPushSubscriptionState, pushSupported } from "@/lib/push";
import { shouldAskForPush, shouldOfferInstall } from "@/lib/push-opt-in";
import {
  installAvailable,
  isIos,
  isStandalone,
  onInstallAvailability,
  promptInstall,
} from "@/lib/install-prompt";
import { track } from "@/lib/analytics";

/**
 * The one place that asks a player to turn notifications on, and the one place
 * that offers to install the app.
 *
 * Both were previously unreachable: notifications only from a toggle inside
 * Profile's settings sheet, and installing not at all. They share a card
 * because on iOS they are the same decision — Safari hides the Push API from a
 * browser tab, so "notify me" there means "install first".
 *
 * Timing lives in `push-opt-in.ts`, deliberately pure: a permission prompt
 * shown at the wrong moment is denied once and denied forever.
 */
export function PushOptIn() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const wins = useGameStore((s) => s.stats.wins);
  const inBattle = useGameStore((s) => s.inBattle);
  const battleScreenActive = useGameStore((s) => s.battleScreenActive);
  const pendingLevelUp = useGameStore((s) => s.pendingLevelUp);
  const state = useGameStore((s) => s.pushPromptState);
  const lastDate = useGameStore((s) => s.pushPromptLastDate);
  const recordPushPrompt = useGameStore((s) => s.recordPushPrompt);

  const [subscribed, setSubscribed] = useState(true); // assume yes until we know
  const [canInstall, setCanInstall] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void getPushSubscriptionState().then((s) => setSubscribed(s.subscribed));
  }, []);

  useEffect(() => {
    setCanInstall(installAvailable());
    return onInstallAvailability(setCanInstall);
  }, []);

  const busy = inBattle || battleScreenActive || pendingLevelUp !== null;
  const today = new Date().toISOString().slice(0, 10);
  const standalone = typeof window !== "undefined" && isStandalone();
  const ios = typeof window !== "undefined" && isIos();

  // On iOS the install card IS the notification path, so it takes precedence.
  // On Android we ask for notifications directly instead: Chrome delivers push
  // to a plain tab perfectly well, and an install is the bigger ask — so the
  // install card only steps in there when push is impossible anyway.
  const canSubscribeHere = typeof window !== "undefined" && pushSupported();
  const wantsInstall =
    typeof window !== "undefined" &&
    shouldOfferInstall({
      hasOnboarded,
      wins,
      busy,
      standalone,
      installable: (ios && !standalone) || (!canSubscribeHere && canInstall),
      state,
      lastDate,
      today,
    });

  const wantsPush =
    !wantsInstall &&
    shouldAskForPush({
      hasOnboarded,
      wins,
      busy,
      subscribed,
      canSubscribe: canSubscribeHere,
      state,
      lastDate,
      today,
    });

  const mode: "install" | "push" | null = wantsInstall ? "install" : wantsPush ? "push" : null;

  useEffect(() => {
    if (mode && !open) {
      setOpen(true);
      track("push_prompt_shown", { source: "first-win", mode });
    }
    // Only opens; closing is the player's or the handler's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const decline = useCallback(() => {
    // First no is recoverable, second is final.
    recordPushPrompt(state === "unasked" ? "soft-declined" : "asked");
    track("push_prompt_dismissed", { source: "first-win", mode: mode ?? "unknown" });
    setOpen(false);
  }, [recordPushPrompt, state, mode]);

  async function acceptPush() {
    setBusyAction(true);
    try {
      const res = await enablePushNotifications();
      recordPushPrompt("asked");
      if (res.ok) {
        setSubscribed(true);
        track("push_prompt_accepted", { source: "first-win" });
        toast.success("You're set — we'll tell you when something's ready.");
      } else {
        track("push_prompt_dismissed", { source: "first-win", reason: res.error ?? "unknown" });
      }
    } finally {
      setBusyAction(false);
      setOpen(false);
    }
  }

  async function acceptInstall() {
    setBusyAction(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "accepted") {
        recordPushPrompt("asked");
        track("install_prompt_accepted", { platform: ios ? "ios" : "android" });
        toast.success("Installed — open it from your home screen.");
        setOpen(false);
      } else if (outcome === "dismissed") {
        decline();
      }
      // "unavailable" on iOS: the card's instructions are the whole answer, so
      // leave it open for them to follow.
    } finally {
      setBusyAction(false);
    }
  }

  if (!mode) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : decline())}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "install" ? (
              <SquarePlus className="h-5 w-5 text-primary" />
            ) : (
              <Bell className="h-5 w-5 text-primary" />
            )}
            {mode === "install" ? "Keep it on your home screen" : "Want a nudge when it's ready?"}
          </DialogTitle>
          <DialogDescription>
            {mode === "install"
              ? ios
                ? "Add the app to your home screen to play full-screen — and it's the only way iPhone will let us tell you when your egg hatches."
                : "Add the app to your home screen so it opens full-screen, like a real app."
              : "Your Daily Quest, your Poké Egg and the weekly gym leader all come back on a timer. We'll let you know when they do — nothing else."}
          </DialogDescription>
        </DialogHeader>

        {mode === "install" && ios && (
          <ol className="mt-1 space-y-2 text-sm text-foreground/80">
            <li className="flex items-center gap-2">
              <Share className="h-4 w-4 shrink-0 text-primary" />
              Tap Share at the bottom of Safari
            </li>
            <li className="flex items-center gap-2">
              <SquarePlus className="h-4 w-4 shrink-0 text-primary" />
              Choose &ldquo;Add to Home Screen&rdquo;
            </li>
          </ol>
        )}

        <div className="mt-3 flex flex-col gap-2">
          {!(mode === "install" && ios) && (
            <Button
              size="action"
              onClick={() => void (mode === "install" ? acceptInstall() : acceptPush())}
              disabled={busyAction}
              className="w-full"
            >
              {busyAction ? "Just a sec…" : mode === "install" ? "Add to home screen" : "Notify me"}
            </Button>
          )}
          <Button
            size="action"
            variant="ghost"
            onClick={decline}
            disabled={busyAction}
            className="w-full text-foreground/60"
          >
            {mode === "install" && ios ? "Got it" : "Not now"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
