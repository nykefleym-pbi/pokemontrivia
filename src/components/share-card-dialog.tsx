import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Your Victory!</DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex items-center justify-center py-12">
            <PokeballSpinner size={48} />
          </div>
        )}
        {imageUrl && !loading && (
          <>
            <img src={imageUrl} alt="Battle result" className="w-full rounded-xl shadow-pop" />
            <div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">How to save:</p>
              <ul className="mt-1 space-y-0.5">
                <li>📱 <strong>iOS:</strong> Long-press the image → "Save to Photos"</li>
                <li>🤖 <strong>Android / Desktop:</strong> Tap "Save Image" below</li>
              </ul>
            </div>
            <DialogFooter className="mt-3">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={handleSave}>
                <Download className="mr-2 h-4 w-4" /> Save Image
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
