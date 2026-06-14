import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PokeballSpinner } from "@/components/game-ui";
import { buildShareCard, type ShareData } from "./share-card-builder";

interface Props {
  open: boolean;
  onClose: () => void;
  data: ShareData;
}

export function ShareCardDialog({ open, onClose, data }: Props) {
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 rounded-3xl bg-card p-5">
        <DialogHeader className="space-y-1.5 text-left">
          <span className="inline-flex w-fit rounded-full bg-poke-yellow/40 px-2.5 py-0.5 font-pixel-xs uppercase text-poke-dark">
            Share Your Victory
          </span>
          <DialogTitle className="font-display-md text-poke-dark">
            Show off your run
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          {loading && (
            <div className="flex min-h-[300px] items-center justify-center rounded-2xl bg-poke-hero/40">
              <PokeballSpinner size={64} spinning />
            </div>
          )}
          {imageUrl && !loading && (
            <>
              <img
                src={imageUrl}
                alt="Battle result"
                className="w-full rounded-2xl shadow-card"
              />
              <div className="mt-3 rounded-2xl bg-poke-hero/50 p-3 text-xs text-muted-foreground">
                <p className="font-bold text-poke-dark">How to save</p>
                <ul className="mt-1 space-y-0.5">
                  <li>📱 <strong>iOS:</strong> long-press → "Save to Photos"</li>
                  <li>🤖 <strong>Android / Desktop:</strong> tap "Save Image" below</li>
                </ul>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="h-12 flex-1 rounded-full border-2 bg-card font-bold text-poke-dark"
                >
                  Close
                </Button>
                <Button
                  onClick={handleSave}
                  className="h-12 flex-1 rounded-full bg-primary font-bold text-primary-foreground shadow-pop"
                >
                  <Download className="mr-2 h-4 w-4" /> Save Image
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
