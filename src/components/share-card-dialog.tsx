import { useEffect, useState } from "react";
import { Share2, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PokeballSpinner } from "@/components/game-ui";
import { buildShareCard, type ShareData } from "./share-card-builder";
import { inviteUrl } from "@/lib/referral-rewards";

interface Props {
  open: boolean;
  onClose: () => void;
  data: ShareData;
  /**
   * The sharer's friend code. When given, the shared text carries their
   * `/refer?code=` link, so a card that gets passed around can actually bring
   * someone in — the referral loop pays both sides but only fires through that
   * URL. Omit it and the share stays exactly as it was.
   */
  inviteCode?: string | null;
}

export function ShareCardDialog({ open, onClose, data, inviteCode }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    buildShareCard(data)
      .then(setImageUrl)
      .catch(() => toast.error("Couldn't generate share image."))
      .finally(() => setLoading(false));
  }, [open, data]);

  function handleSave() {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `pokemon-trivia-${data.type}-${data.dateISO}.png`;
    link.click();
    toast.success("Image saved!");
  }

  async function handleShare() {
    if (!imageUrl) return;
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], `poketrivia-${data.dateISO}.png`, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean;
        share?: (d: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };
      if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        const text = inviteCode ? `Beat my score! ${inviteUrl(inviteCode)}` : "Beat my score!";
        await nav.share({ files: [file], title: "Pokémon Trivia Battle", text });
      } else {
        handleSave();
        toast.info("Sharing not supported here — image saved instead.");
      }
    } catch {
      /* user cancelled — no-op */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* z-[200]: must sit above full-screen overlays that open this dialog
          (the evolution screen is fixed at z-[100]); the default z-50 would
          render it invisibly underneath while still blocking all clicks. */}
      <DialogContent className="z-[200] flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-poke-dark p-0 sm:rounded-none">
        <DialogTitle className="sr-only">Share Result</DialogTitle>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white press"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="font-pixel text-[11px] uppercase tracking-[0.25em] text-poke-yellow">
            Share Result
          </span>
          <div className="h-10 w-10" />
        </div>

        {/* Card preview */}
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-2">
          {loading && (
            <div className="flex aspect-square w-full max-w-sm items-center justify-center rounded-3xl bg-white/5">
              <PokeballSpinner size={64} spinning />
            </div>
          )}
          {imageUrl && !loading && (
            <img
              src={imageUrl}
              alt="Battle result"
              className="w-full max-w-sm rounded-3xl shadow-2xl"
            />
          )}
        </div>

        {/* Action bar */}
        <div className="flex shrink-0 gap-3 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <Button
            size="action"
            onClick={handleShare}
            disabled={!imageUrl}
            className="flex-1 bg-primary text-primary-foreground shadow-pop"
          >
            <Share2 className="mr-2 h-5 w-5" /> Share
          </Button>
          <Button
            size="action"
            onClick={handleSave}
            disabled={!imageUrl}
            variant="outline"
            className="flex-1 border-2 border-black/10 bg-white text-poke-dark hover:bg-white/90"
          >
            <ImageIcon className="mr-2 h-5 w-5" /> Save image
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
