import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { toast } from "sonner";
import { Loader2, ScanLine, QrCode } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGameStore } from "@/lib/store";
import { startLivePvpMatch } from "@/lib/pvp-live";
import { fetchBattleQuestions } from "@/lib/api/trivia";
import { difficultyForLevel } from "@/lib/game-data";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mirrors Pokémon GO's Trainer Battle QR flow: your friend code doubles as
 * your Battle Code (shown as a QR), and scanning someone else's Battle Code
 * with the in-app camera instantly starts a live match — no waiting lobby,
 * since you're already face to face.
 */
export function NearbyBattleSheet({ open, onOpenChange }: Props) {
  const [tab, setTab] = useState<"code" | "scan">("code");
  const friendCode = useGameStore((s) => s.friendCode);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || tab !== "code" || !friendCode) return;
    let cancelled = false;
    void QRCode.toDataURL(friendCode, { width: 280, margin: 1 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, tab, friendCode]);

  useEffect(() => {
    if (!open) setTab("code");
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl bg-poke-cream max-h-[90vh]">
        <SheetHeader>
          <div className="font-pixel-xs text-primary">FACE TO FACE</div>
          <SheetTitle className="font-display-xl text-foreground">Nearby Battle</SheetTitle>
        </SheetHeader>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setTab("code")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 font-display-md transition ${
              tab === "code" ? "bg-primary text-primary-foreground" : "bg-card text-foreground/60"
            }`}
          >
            <QrCode className="h-4 w-4" /> My Code
          </button>
          <button
            onClick={() => setTab("scan")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 font-display-md transition ${
              tab === "scan" ? "bg-primary text-primary-foreground" : "bg-card text-foreground/60"
            }`}
          >
            <ScanLine className="h-4 w-4" /> Scan
          </button>
        </div>
        <div className="mt-4">
          {tab === "code" ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl bg-card p-6 shadow-card">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Your Battle Code QR" className="h-56 w-56" />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-foreground/40" />
                </div>
              )}
              <div className="text-2xl font-extrabold tracking-[0.15em] text-foreground">
                {friendCode ?? "------"}
              </div>
              <div className="text-center text-xs text-foreground/55">
                Have a nearby trainer scan this to start a battle instantly.
              </div>
            </div>
          ) : (
            <ScanPanel active={open && tab === "scan"} onClose={() => onOpenChange(false)} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ScanPanel({ active, onClose }: { active: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const level = useGameStore((s) => s.level);
  const partnerId = useGameStore((s) => s.pokemon?.id ?? null);
  const friendCode = useGameStore((s) => s.friendCode);
  const seenHashes = useGameStore((s) => s.seenQuestionHashes);
  const seenQuestions = useGameStore((s) => s.seenQuestions);
  const seenCuratedIds = useGameStore((s) => s.seenCuratedIds);
  const markQuestionsSeen = useGameStore((s) => s.markQuestionsSeen);
  const markCuratedSeen = useGameStore((s) => s.markCuratedSeen);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  const handleDecoded = useCallback(
    async (code: string) => {
      if (startingRef.current) return;
      const clean = code.trim().toUpperCase();
      if (!clean || clean.length > 12) return; // not a plausible battle code, keep scanning
      if (clean === friendCode) {
        toast.error("That's your own Battle Code!");
        return;
      }
      startingRef.current = true;
      stopCamera();
      try {
        const data = await fetchBattleQuestions({
          difficulty: difficultyForLevel(level),
          seenHashes,
          seenSamples: seenQuestions.slice(-80),
          excludeIds: seenCuratedIds.slice(-500),
          flowSeed: Math.floor(Math.random() * 1_000_000),
        });
        if (!data.questions || data.questions.length < 5) {
          toast.error("Couldn't prepare the battle. Try again.");
          startingRef.current = false;
          return;
        }
        const res = await startLivePvpMatch(clean, data.questions, partnerId);
        if (!res.ok) {
          const msg =
            res.error === "not_found"
              ? "No trainer found with that Battle Code."
              : res.error === "self"
                ? "That's your own Battle Code!"
                : "Couldn't start the battle. Try again.";
          toast.error(msg);
          startingRef.current = false;
          return;
        }
        markQuestionsSeen(data.questions.map((q) => q.question));
        markCuratedSeen(data.servedIds ?? []);
        onClose();
        void navigate({ to: "/pvp/live/$matchId", params: { matchId: res.matchId } });
      } catch (e) {
        console.warn("[NearbyBattleSheet] scan-to-battle failed:", e);
        toast.error("Couldn't start the battle. Try again.");
        startingRef.current = false;
      }
    },
    [
      friendCode,
      level,
      partnerId,
      seenHashes,
      seenQuestions,
      seenCuratedIds,
      markQuestionsSeen,
      markCuratedSeen,
      navigate,
      onClose,
      stopCamera,
    ],
  );

  useEffect(() => {
    if (!active) {
      stopCamera();
      return;
    }
    startingRef.current = false;
    setCameraError(null);
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        const tick = () => {
          if (cancelled || !videoRef.current || startingRef.current) return;
          const v = videoRef.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(frame.data, frame.width, frame.height);
            if (result && result.data) {
              void handleDecoded(result.data);
              return;
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        console.warn("[NearbyBattleSheet] camera access failed:", e);
        if (!cancelled) setCameraError("Couldn't access the camera. Check permissions and retry.");
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl bg-card p-4 shadow-card">
      <div className="relative h-72 w-full overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-48 w-48 rounded-2xl border-4 border-white/70" />
        </div>
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-white">
            {cameraError}
          </div>
        )}
      </div>
      <div className="text-center text-xs text-foreground/55">
        Point your camera at a nearby trainer's Battle Code.
      </div>
    </div>
  );
}
