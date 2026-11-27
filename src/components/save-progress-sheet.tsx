import { useEffect, useMemo, useState } from "react";
import { NaIcon } from "@/components/na/icon";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { TRAINER_SPRITES, trainerSpriteUrl } from "@/lib/game-data";
import {
  bootstrapSocial,
  isTrainerNameAvailable,
  claimTrainerName,
  claimReferral,
  syncProfile,
} from "@/lib/social";
import { rollReferralReward } from "@/lib/referral-rewards";
import { validateTrainerName, claimErrorMessage, TRAINER_NAME_MAX } from "@/lib/trainer-name";
import { getPendingReferral, clearPendingReferral } from "@/lib/pending-referral";
import { track } from "@/lib/analytics";
import { NaSheet } from "@/components/na/sheet";
import { NaButton } from "@/components/na/button";

type Avail = "idle" | "checking" | "available" | "taken" | "invalid";

/** The six looks Figma 1.6 offers first; "Show me more" opens every trainer. */
const FIRST_LOOKS = ["ace-trainer-f", "lass", "youngster", "hiker", "beauty", "black-belt"];

/**
 * 1.6 Save your progress — asked after a win, not before play (Figma flow
 * "First session", decision 5 option 1). A guest picks a trainer name and a
 * look; saving claims the name, turns the guest into a full trainer (synced to
 * the server) and pays any invite reward kept from the landing link.
 *
 * "Maybe later" closes it; it opens again after every win until saved (owner
 * ruling 2026-11-26).
 */
export function SaveProgressSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [avail, setAvail] = useState<Avail>("idle");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [sprite, setSprite] = useState(FIRST_LOOKS[0]);
  const [showAll, setShowAll] = useState(false);
  const [broken, setBroken] = useState<Set<string>>(new Set());

  // The anonymous session must exist before a name can be claimed.
  useEffect(() => {
    if (open) void bootstrapSocial();
  }, [open]);

  // Availability, checked as you type (debounced, stale replies ignored).
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setAvail("idle");
      setMsg("");
      return;
    }
    const v = validateTrainerName(name);
    if (!v.ok) {
      setAvail("invalid");
      setMsg(claimErrorMessage(v.error));
      return;
    }
    setAvail("checking");
    setMsg("Checking…");
    const t = window.setTimeout(async () => {
      const ok = await isTrainerNameAvailable(v.name);
      if (name.trim() !== v.name) return;
      setAvail(ok ? "available" : "taken");
      setMsg(ok ? "Available" : claimErrorMessage("taken"));
    }, 350);
    return () => window.clearTimeout(t);
  }, [name]);

  const looks = useMemo(() => {
    const all = TRAINER_SPRITES.filter((t) => !broken.has(t.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    if (showAll) return all;
    const first = FIRST_LOOKS.map((id) => all.find((t) => t.id === id)).filter(
      (t): t is (typeof all)[number] => Boolean(t),
    );
    return first.length ? first : all.slice(0, 6);
  }, [broken, showAll, sprite]);

  async function save() {
    const v = validateTrainerName(name);
    if (!v.ok) {
      setAvail("invalid");
      setMsg(claimErrorMessage(v.error));
      return;
    }
    setSaving(true);
    try {
      await bootstrapSocial();
      const res = await claimTrainerName(v.name);
      if (!res.ok && (res.error === "taken" || res.error === "length" || res.error === "chars")) {
        setAvail(res.error === "taken" ? "taken" : "invalid");
        setMsg(claimErrorMessage(res.error));
        return;
      }
      // Claimed, or the backend is unreachable: never block play. A local
      // reservation is retried by reconcileTrainerName once back online.
      const s = useGameStore.getState();
      if (!s.pokemon) return;
      s.setOnboarded(v.name, s.pokemon, sprite, s.abilityId ?? undefined);
      s.setNameReconciled(true); // as onboarding always did; reconcileTrainerName handles offline
      track("onboard_complete", { starter: s.pokemon.name, referred: Boolean(getPendingReferral()), play_first: true });
      toast.success(res.ok ? `Saved! Welcome, ${v.name}!` : "Name reserved (will sync when online)");
      onOpenChange(false);
      const ref = getPendingReferral();
      void syncProfile().then(async () => {
        if (!ref) return;
        const r = await claimReferral(ref);
        clearPendingReferral();
        if (!r.ok) return;
        const reward = rollReferralReward();
        const g = useGameStore.getState();
        g.addCoins(reward.coins);
        g.grantPokeEgg(reward.eggs);
        for (const it of reward.items) g.grantItem(it.id, it.qty);
        toast.success(
          `Invite bonus! +${reward.coins} coins, +${reward.eggs} Poké Egg, +${reward.items.length} items!`,
        );
      });
    } finally {
      setSaving(false);
    }
  }

  const good = avail === "available";
  const bad = avail === "taken" || avail === "invalid";

  return (
    <NaSheet
      open={open}
      onOpenChange={onOpenChange}
      scrim={0.72}
      title="Save your progress"
      body="Choose your trainer name to save your Pokémon, Pokédex, and battle streak!"
      primary={{
        label: saving ? "Saving…" : "Save",
        onClick: () => void save(),
        disabled: saving || !name.trim() || avail === "checking" || bad,
      }}
      secondary={{ label: "Maybe Later", onClick: () => onOpenChange(false) }}
      footnote="No worries! You can keep battling without saving for now."
    >
      <label className="flex flex-col gap-1.5">
        <span className="na-label uppercase text-text-secondary">Trainer name</span>
        <span
          className={`flex h-[54px] items-center gap-2 rounded-[14px] border-2 bg-night-deep/60 px-3.5 ${
            good ? "border-success" : bad ? "border-danger" : "border-white/[0.16]"
          }`}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={TRAINER_NAME_MAX}
            placeholder="e.g. Ash"
            aria-invalid={bad}
            className="na-headline w-full min-w-0 bg-transparent text-foreground outline-none placeholder:text-text-muted"
          />
          {good && (
            <span className="na-caption flex shrink-0 items-center gap-1 text-success">
              <NaIcon name="check" size={16} /> {msg}
            </span>
          )}
          {bad && <NaIcon name="x" size={16} className="shrink-0 text-danger" />}
        </span>
        {/* Figma 1.6 hides the helper; it speaks only while checking or on a problem. */}
        {(bad || avail === "checking") && (
          <span className={`na-caption ${bad ? "text-danger" : "text-text-muted"}`}>{msg}</span>
        )}
      </label>

      <span className="na-label uppercase text-text-secondary">Choose your look</span>
      <div className="flex flex-wrap gap-3">
        {looks.map((t) => {
          const on = t.id === sprite;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSprite(t.id)}
              aria-label={t.name}
              aria-pressed={on}
              className={`flex h-[66px] w-[66px] items-center justify-center overflow-hidden rounded-[18px] bg-white/[0.08] ${
                on ? "border-[2.5px] border-primary" : "border border-white/[0.12]"
              }`}
            >
              <img
                src={trainerSpriteUrl(t.id)}
                alt=""
                loading="lazy"
                className="sprite h-[60px] w-[60px] object-contain"
                onError={() => setBroken((s) => new Set(s).add(t.id))}
              />
            </button>
          );
        })}
      </div>
      {!showAll && (
        <NaButton kind="ghost" size="M" className="self-start" onClick={() => setShowAll(true)}>
          Show me more
        </NaButton>
      )}
    </NaSheet>
  );
}
