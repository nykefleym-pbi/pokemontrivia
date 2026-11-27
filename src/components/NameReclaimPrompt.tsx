import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { NaSheet } from "@/components/na/sheet";
import { NaIcon } from "@/components/na/icon";
import { isTrainerNameAvailable, claimTrainerName, bootstrapSocial } from "@/lib/social";
import { validateTrainerName, claimErrorMessage, TRAINER_NAME_MAX } from "@/lib/trainer-name";

type Avail = "idle" | "checking" | "available" | "taken" | "invalid";

export function NameReclaimPrompt() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const needsNameReclaim = useGameStore((s) => s.needsNameReclaim);
  const setName = useGameStore((s) => s.setName);
  const setNameReconciled = useGameStore((s) => s.setNameReconciled);
  const setNeedsNameReclaim = useGameStore((s) => s.setNeedsNameReclaim);
  const oldName = useGameStore((s) => s.trainerName);

  const open = hasOnboarded && needsNameReclaim;

  const [draft, setDraft] = useState("");
  const [avail, setAvail] = useState<Avail>("idle");
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setDraft("");
      setAvail("idle");
      setMsg("");
    } else setDraft(oldName ?? ""); // 14.5: the taken name shows in the field, marked "Already taken"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setAvail("idle");
      setMsg("");
      return;
    }
    const v = validateTrainerName(draft);
    if (!v.ok) {
      setAvail("invalid");
      setMsg(claimErrorMessage(v.error));
      return;
    }
    setAvail("checking");
    setMsg("Checking…");
    const t = window.setTimeout(async () => {
      const ok = await isTrainerNameAvailable(v.name);
      if (draft.trim() !== v.name) return;
      if (ok) {
        setAvail("available");
        setMsg("Name available");
      } else {
        setAvail("taken");
        setMsg(claimErrorMessage("taken"));
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [draft, open]);

  async function handleConfirm() {
    const v = validateTrainerName(draft);
    if (!v.ok) {
      setAvail("invalid");
      setMsg(claimErrorMessage(v.error));
      return;
    }
    setSubmitting(true);
    try {
      await bootstrapSocial();
      const res = await claimTrainerName(v.name);
      if (!res.ok) {
        if (res.error === "taken") {
          setAvail("taken");
          setMsg(claimErrorMessage("taken"));
        } else {
          setAvail("idle");
          setMsg(claimErrorMessage(res.error));
        }
        return;
      }
      setName(v.name);
      setNameReconciled(true);
      setNeedsNameReclaim(false);
      toast.success("Trainer name updated!");
    } finally {
      setSubmitting(false);
    }
  }

  const canConfirm = !submitting && avail === "available";
  const bad = avail === "taken" || avail === "invalid";

  // Figma 14.5 "Your name was taken": a sheet that can't be dismissed (friends and
  // leaderboards need a name); Save lights up once the name is free.
  return (
    <NaSheet
      open={open}
      onOpenChange={() => {}}
      title="Choose a new trainer name"
      body={`"${oldName || "Your name"}" is already taken. Try another name to continue!`}
      primary={{ label: submitting ? "Saving…" : "Save", onClick: () => void handleConfirm(), disabled: !canConfirm }}
    >
      <label htmlFor="reclaim-name" className="na-label uppercase text-text-secondary">
        Trainer name
      </label>
      <span
        className={`-mt-1 flex h-[54px] items-center gap-2 rounded-[14px] border-2 bg-night-deep/60 px-3.5 ${
          avail === "available" ? "border-success" : bad ? "border-danger" : "border-white/[0.16]"
        }`}
      >
        <input
          id="reclaim-name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={TRAINER_NAME_MAX}
          autoFocus
          aria-invalid={bad}
          className="na-headline w-full min-w-0 bg-transparent text-foreground outline-none"
        />
        {(avail === "available" || bad) && (
          <span className={`na-caption flex shrink-0 items-center gap-1 ${bad ? "text-danger" : "text-success"}`}>
            <NaIcon name={bad ? "x" : "check"} size={16} className={bad ? "text-foreground" : undefined} />
            {avail === "taken" ? "Already taken" : msg}
          </span>
        )}
      </span>
      <span className="na-caption -mt-1 text-text-secondary">
        {avail === "invalid" ? msg : "3–16 characters: letters, numbers, spaces, _ or -"}
      </span>
    </NaSheet>
  );
}