import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { ITEM_BY_ID } from "@/content/items";
import type { ItemId } from "@/lib/game-data";
import { ItemIcon } from "@/components/game-ui";
import {
  bagCapacity,
  bagUnitsUsed,
  bagUpgradePrice,
  isBagExempt,
  overflowRefundValue,
} from "@/lib/store/slices/itemsSlice";

/** Units held / capacity, plus the escalating expansion offer. Berries are not
 *  counted here because they do not count against the cap. */
export function BagCapacityBar() {
  const inventory = useGameStore((s) => s.inventory);
  const bagUpgrades = useGameStore((s) => s.bagUpgrades);
  const coins = useGameStore((s) => s.coins);
  const purchaseBagUpgrade = useGameStore((s) => s.purchaseBagUpgrade);

  const used = bagUnitsUsed(inventory);
  const cap = bagCapacity(bagUpgrades);
  const price = bagUpgradePrice(bagUpgrades);
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const full = used >= cap;

  return (
    <div className="rounded-2xl bg-card px-4 py-3 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="font-pixel-xs uppercase tracking-wider text-foreground/45">Bag space</div>
        <div className={`font-pixel-xs ${full ? "text-destructive" : "text-foreground"}`}>
          {used}/{cap}
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] ${full ? "bg-destructive" : "bg-hp-good"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {price === null ? (
        <p className="mt-2 text-xs text-foreground/55">Bag fully upgraded.</p>
      ) : (
        <button
          onClick={() => {
            if (purchaseBagUpgrade()) toast.success(`Bag upgraded — ${cap + 10} slots`);
            else toast.error(`Need ${price.toLocaleString()} coins`);
          }}
          disabled={coins < price}
          className="mt-2.5 inline-flex h-9 w-full items-center justify-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground shadow-pop transition active:scale-95 disabled:opacity-40"
        >
          +10 space · {price.toLocaleString()} coins
        </button>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-foreground/50">
        Berries don&apos;t take up bag space.
      </p>
    </div>
  );
}

/**
 * Rewards that would not fit. Each row offers the three ways out the owner
 * specified — take it (once there is room), half its shop value in coins, or
 * give it up — and keeps offering for as long as the bag is too full to hold it.
 */
export function BagOverflowPanel() {
  const pending = useGameStore((s) => s.pendingBagOverflow);
  const inventory = useGameStore((s) => s.inventory);
  const bagUpgrades = useGameStore((s) => s.bagUpgrades);
  const claimOverflow = useGameStore((s) => s.claimOverflow);
  const refundOverflow = useGameStore((s) => s.refundOverflow);
  const forfeitOverflow = useGameStore((s) => s.forfeitOverflow);

  if (pending.length === 0) return null;
  const room = Math.max(0, bagCapacity(bagUpgrades) - bagUnitsUsed(inventory));

  return (
    <div className="rounded-2xl border-2 border-destructive/35 bg-destructive/[0.06] px-4 py-3">
      <div className="font-display-md text-foreground">Bag full — rewards waiting</div>
      <p className="mt-0.5 text-xs leading-snug text-foreground/65">
        These are being held for you. Make room and take them, trade them for half their shop value,
        or give them up.
      </p>
      <div className="mt-3 flex flex-col gap-2.5">
        {pending.map((entry) => {
          const def = ITEM_BY_ID[entry.id];
          if (!def) return null;
          const refund = overflowRefundValue(entry.id, entry.qty);
          return (
            <div key={entry.id} className="rounded-[18px] bg-card px-3.5 py-3 shadow-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-primary/[0.08]">
                  <ItemIcon item={def} className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold leading-tight text-foreground">{def.name}</div>
                  <div className="text-xs text-foreground/55">×{entry.qty} waiting</div>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    if (claimOverflow(entry.id)) toast.success(`${def.name} moved to your bag`);
                  }}
                  disabled={room < 1}
                  className="h-8 rounded-full bg-hp-good px-3 text-xs font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-40"
                >
                  {room < 1 ? "No room" : `Move ${Math.min(entry.qty, room)} to bag`}
                </button>
                <button
                  onClick={() => {
                    const paid = refundOverflow(entry.id);
                    toast.success(`Traded for ${paid.toLocaleString()} coins`);
                  }}
                  className="h-8 rounded-full bg-poke-yellow px-3 text-xs font-bold text-foreground shadow-sm transition active:scale-95"
                >
                  Refund {refund.toLocaleString()}
                </button>
                <button
                  onClick={() => {
                    if (forfeitOverflow(entry.id)) toast(`${def.name} given up`);
                  }}
                  className="h-8 rounded-full bg-muted px-3 text-xs font-bold text-foreground/60 transition active:scale-95"
                >
                  Give up
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Throws one unit away to make room. Premium items need a second tap to go
 * through: a mistap on a 2,500-coin item that pays nothing back is not something
 * to make easy.
 */
export function DiscardItemButton({ id }: { id: ItemId }) {
  const discardItem = useGameStore((s) => s.discardItem);
  const [armed, setArmed] = useState(false);
  const def = ITEM_BY_ID[id];
  if (!def || isBagExempt(id)) return null;
  const needsConfirm = !!def.premium;

  return (
    <button
      aria-label={armed ? `Confirm discarding ${def.name}` : `Discard one ${def.name}`}
      onClick={() => {
        if (needsConfirm && !armed) {
          setArmed(true);
          window.setTimeout(() => setArmed(false), 3000);
          return;
        }
        setArmed(false);
        if (discardItem(id, 1)) toast(`Discarded 1 ${def.name}`);
      }}
      className={`flex h-8 items-center justify-center rounded-full px-2.5 text-xs font-bold transition active:scale-95 ${
        armed ? "bg-destructive text-white" : "bg-muted text-foreground/45"
      }`}
    >
      {armed ? "Sure?" : <Trash2 className="h-4 w-4" />}
    </button>
  );
}
