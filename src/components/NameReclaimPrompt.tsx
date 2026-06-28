import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isTrainerNameAvailable, claimTrainerName, bootstrapSocial } from "@/lib/social";
import { validateTrainerName, claimErrorMessage, TRAINER_NAME_MAX } from "@/lib/trainer-name";

type Avail = "idle" | "checking" | "available" | "taken" | "invalid";

export function NameReclaimPrompt() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const needsNameReclaim = useGameStore((s) => s.needsNameReclaim);
  const setName = useGameStore((s) => s.setName);
  const setNameReconciled = useGameStore((s) => s.setNameReconciled);
  const setNeedsNameReclaim = useGameStore((s) => s.setNeedsNameReclaim);

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
    }
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

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md rounded-2xl [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Pick a new trainer name</DialogTitle>
          <DialogDescription>
            Your previous trainer name is no longer available. Choose a new one to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="New trainer name"
            maxLength={TRAINER_NAME_MAX}
            autoFocus
            className="h-12 rounded-full border-[2.5px] border-primary bg-card px-5 text-base font-bold"
          />
          <p
            className={`mt-2 text-xs ${
              avail === "available"
                ? "text-green-600"
                : avail === "taken" || avail === "invalid"
                  ? "text-red-600"
                  : "text-foreground/60"
            }`}
          >
            {msg || "3–16 characters · letters, numbers, spaces, _ and -"}
          </p>
        </div>
        <div className="mt-2 flex justify-end">
          <Button
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            className="h-11 rounded-full px-6 font-bold"
          >
            {submitting ? "Saving…" : "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
