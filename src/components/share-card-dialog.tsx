import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { useFramePortalContainer } from "@/components/frame-portal";
import { NaIcon } from "@/components/na/icon";
import { PokeballSpinner } from "@/components/game-ui";
import { buildShareCard, type ShareData } from "./share-card-builder";
import { inviteUrl } from "@/lib/referral-rewards";

interface Props {
  open: boolean;
  onClose: () => void;
  data: ShareData;
  /**
   * The sharer's friend code. When given, the shared text and the copied link
   * carry their `/refer?code=` link, so a card that gets passed around can
   * bring someone in — the referral loop only fires through that URL.
   */
  inviteCode?: string | null;
}

const GAME_URL = "https://pokemontriviabattle.vercel.app";

/**
 * Figma 9.1 "Share your win": a sheet over the result with the story card at
 * half size, then Stories, Chats, Save image and Copy link. The preview is the
 * exact PNG that gets shared (story-card.ts).
 */
export function ShareCardDialog({ open, onClose, data, inviteCode }: Props) {
  const container = useFramePortalContainer();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const link = inviteCode ? inviteUrl(inviteCode) : GAME_URL;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    buildShareCard(data)
      .then(setImageUrl)
      .catch(() => toast.error("Couldn't make your card."))
      .finally(() => setLoading(false));
  }, [open, data]);

  function save() {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `pokemon-trivia-${data.type}-${data.dateISO}.png`;
    a.click();
    toast.success("Image saved!");
  }

  /** The phone's share sheet with the picture: Stories sends it alone, Chats adds the dare and the link. */
  async function share(withText: boolean) {
    if (!imageUrl) return;
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], `poketrivia-${data.dateISO}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share(withText ? { files: [file], title: "Pokémon Trivia Battle", text: `Think you can beat me? ${link}` } : { files: [file] });
      } else {
        save();
        toast.info("Sharing isn't available here, so we saved the image instead.");
      }
    } catch {
      /* the player closed the share sheet */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied!");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  const targets: Array<[string, string, () => void]> = [
    ["image", "Stories", () => void share(false)],
    ["share", "Chats", () => void share(true)],
    ["image", "Save image", save],
    ["link", "Copy link", () => void copy()],
  ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal container={container ?? undefined}>
        {/* z-[200]: above the full-screen result, level-up and evolution screens that open it. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-[rgb(4_6_15/0.75)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="na-raised fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-4 rounded-t-[28px] px-5 pb-[calc(env(safe-area-inset-bottom)+30px)] pt-2.5 outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom">
          <div aria-hidden className="h-[5px] w-10 shrink-0 rounded-[3px] bg-white/30" />
          <DialogPrimitive.Title className="na-display-s text-center text-foreground">Share your win</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">A story card of your result, ready to share.</DialogPrimitive.Description>
          <div className="relative h-[320px] w-[180px] shrink-0 overflow-hidden rounded-[14px] bg-night-card">
            {imageUrl && !loading ? (
              <img src={imageUrl} alt="Your story card" className="h-full w-full" />
            ) : (
              <span className="absolute inset-0 grid place-items-center">
                <PokeballSpinner size={48} spinning />
              </span>
            )}
          </div>
          <div className="flex gap-[18px]">
            {targets.map(([icon, label, go]) => (
              <button key={label} type="button" disabled={!imageUrl} onClick={go} className="press flex flex-col items-center gap-1.5 disabled:opacity-50">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-night-card-2 text-foreground shadow-[0_4px_0_#04060F,inset_0_1px_0_rgb(255_255_255/0.1)]">
                  <NaIcon name={icon} size={24} />
                </span>
                <span className="na-caption text-text-secondary">{label}</span>
              </button>
            ))}
          </div>
          <p className="na-caption text-center text-text-muted">
            Your card only shows your Trainer name and level. No other personal details are shared.
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
