import { useState } from "react";
import { NaIcon } from "@/components/na/icon";
import { toast } from "sonner";
import { NaSheet } from "@/components/na/sheet";
import { enablePushNotifications } from "@/lib/push";
import { track } from "@/lib/analytics";
import { useGameStore } from "@/lib/store";
import { dayStreak } from "@/lib/win-streak";

/** Figma "Notification": the reminder as it lands on the lock screen, in the partner's voice. */
export function ReminderPreview() {
  const partner = useGameStore((s) => s.pokemon?.name ??"Your partner");
  const log = useGameStore((s) => s.battleLog);
  const days = dayStreak(log).days;
  return (
    <div className="flex w-full items-start gap-2.5 rounded-[22px] border border-white/[0.12] bg-white/[0.16] p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_12px_32px_rgb(0_0_0/0.35)]">
      <img src="/icons/icon-192.png" alt="" className="h-[38px] w-[38px] shrink-0 rounded-[9px] bg-night-base" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="na-label uppercase text-text-secondary">Trivia Battle</span>
          <span className="na-caption text-text-muted">now</span>
        </div>
        <span className="na-body-strong text-foreground">{partner} is waiting for you</span>
        <span className="na-caption text-text-secondary">
          {days > 0 ? `Win one battle to keep your ${days}-day streak alive! ` : "Win one battle to start a streak! "}
          Your daily gift is ready to claim!
        </span>
      </div>
    </div>
  );
}

/**
 * 4.5 / 4.5b: "Remind me", asked from the Tomorrow row right after a win. On an
 * iPhone outside the installed app there is no push, so it shows the install steps.
 */
export function RemindSheet({
  open,
  onOpenChange,
  ios,
  onEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ios: boolean;
  onEnabled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function turnOn() {
    setBusy(true);
    try {
      const res = await enablePushNotifications();
      if (res.ok) {
        track("push_prompt_accepted", { source: "victory" });
        toast.success("You're set! We'll remind you when something's ready.");
        onEnabled();
      } else {
        track("push_prompt_dismissed", { source: "victory", reason: res.error ?? "unknown" });
      }
    } finally {
      setBusy(false);
      onOpenChange(false);
    }
  }
  if (ios) {
    return (
      <NaSheet
        open={open}
        onOpenChange={onOpenChange}
        scrim={0.72}
        title="Never Miss a Daily Reward!"
        body="On iPhone, add the game to your home screen first. It's the only way we can tell you when your egg hatches!"
        primary={{ label: "Got it", onClick: () => onOpenChange(false) }}
      >
        {[
          ["share", "Tap Share at the bottom of Safari"],
          ["home", "Choose “Add to Home Screen”"],
        ].map(([icon, text]) => {
          return (
            <div key={text as string} className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <NaIcon name={icon} size={20} className="text-reward-gold" />
              </span>
              <span className="na-body-strong text-foreground">{text as string}</span>
            </div>
          );
        })}
      </NaSheet>
    );
  }
  return (
    <NaSheet
      open={open}
      onOpenChange={onOpenChange}
      scrim={0.72}
      title="Never Miss a Daily Reward!"
      body="Get a friendly reminder when your Daily Quest and gift are ready."
      primary={{ label: busy ? "Just a sec…" : "Turn on reminders", onClick: () => void turnOn(), disabled: busy }}
      secondary={{ label: "Maybe Later", onClick: () => onOpenChange(false) }}
      footnote="Your phone will ask for permission next."
    >
      <ReminderPreview />
    </NaSheet>
  );
}
