import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2 } from "lucide-react";
import { useGameStore } from "@/lib/store";

/**
 * "My Code" QR block — extracted verbatim from `NearbyBattleSheet.tsx` so the
 * Arena's Nearby Battle card can render it inline instead of behind a sheet.
 * Your friend code doubles as your Battle Code; a nearby trainer scans this
 * to start a live match instantly.
 */
export function BattleCodeQr() {
  const friendCode = useGameStore((s) => s.friendCode);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!friendCode) return;
    let cancelled = false;
    void QRCode.toDataURL(friendCode, { width: 280, margin: 1 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [friendCode]);

  return (
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
  );
}
