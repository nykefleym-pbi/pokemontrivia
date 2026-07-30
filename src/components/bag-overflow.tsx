import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Minus, Plus, ArrowRight, AlertTriangle } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { ITEM_BY_ID } from "@/content/items";
import type { ItemId } from "@/lib/game-data";
import { ItemIcon } from "@/components/game-ui";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * Throws items away to make room, behind an explicit confirmation with a
 * quantity slider.
 *
 * This replaced an arm-then-tap-again button that discarded exactly one unit.
 * Two things were wrong with it: clearing a 30-unit stack meant thirty taps, and
 * "Sure?" appearing in place of a bin icon is not a confirmation anyone reads —
 * on a stack of Max Potions the second tap lands before the first has registered
 * as a question. Discarding pays nothing back, so it needs a dialog that names
 * the item and the amount.
 *
 * The dialog answers the two questions the first version left out. It showed what
 * you would LOSE but never what you would be LEFT WITH, and it never showed the
 * bag space being bought — which is the entire reason anyone opens it. Both are
 * now before→after, so the trade is legible without arithmetic.
 */
export function DiscardItemButton({ id }: { id: ItemId }) {
  const discardItem = useGameStore((s) => s.discardItem);
  const inventory = useGameStore((s) => s.inventory);
  const bagUpgrades = useGameStore((s) => s.bagUpgrades);
  const owned = inventory[id] ?? 0;
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const def = ITEM_BY_ID[id];
  if (!def || isBagExempt(id)) return null;

  // Bounded by what is held RIGHT NOW. Reading `owned` from the store rather than
  // a prop matters: using an item from the same row while the dialog is open would
  // otherwise leave the slider offering a quantity that no longer exists, and
  // discardItem would silently clamp it — the player taps "Discard 12" and loses 3.
  const max = Math.max(1, owned);
  const amount = Math.min(qty, max);
  const left = Math.max(0, owned - amount);

  // Discarding is how you make room, so the room is worth showing. Non-exempt
  // items are 1 unit each, so freeing `amount` units is exact.
  const cap = bagCapacity(bagUpgrades);
  const usedNow = bagUnitsUsed(inventory);
  const usedAfter = Math.max(0, usedNow - amount);
  const pctNow = Math.min(100, Math.round((usedNow / cap) * 100));
  const pctAfter = Math.min(100, Math.round((usedAfter / cap) * 100));

  // What is being thrown away, at shop price. NOT a refund — the copy has to be
  // careful here, because a number next to a discard button reads as a payout.
  const valueLost = def.cost * amount;

  const step = (delta: number) => setQty(Math.max(1, Math.min(max, amount + delta)));

  return (
    <>
      <button
        aria-label={`Discard ${def.name}`}
        onClick={() => {
          setQty(1);
          setOpen(true);
        }}
        className="flex h-8 items-center justify-center rounded-full bg-muted px-2.5 text-xs font-bold text-foreground/45 transition active:scale-95"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[330px] gap-0 overflow-hidden p-0">
          {/* Danger-tinted head so the dialog reads as a destructive action at a
              glance, rather than as another shop sheet. */}
          <div className="bg-destructive/[0.07] px-5 pb-4 pt-5">
            {/* pr-7 keeps a long item name clear of DialogContent's own close X,
                which sits at right-4 top-4. */}
            <DialogHeader className="space-y-1 pr-7 text-left">
              <DialogTitle className="flex items-center gap-2 text-[19px]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/15">
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                </span>
                Discard {def.name}?
              </DialogTitle>
              <DialogDescription className="text-xs leading-snug">
                Thrown-away items are gone for good and pay nothing back.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-5 pb-5 pt-4">
            {/* Item, and the count going. */}
            <div className="flex items-center gap-3.5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] bg-primary/[0.08]">
                <ItemIcon item={def} className="h-12 w-12" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display-md leading-tight text-foreground">
                  {def.name}
                </div>
                <div className="mt-0.5 font-pixel-xs uppercase tracking-wider text-foreground/40">
                  {def.category}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-display-lg leading-none text-destructive">−{amount}</div>
              </div>
            </div>

            {/* The two before→afters. Left column is the stack, right is bag room:
                what you keep, and what you gain by giving it up. */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[16px] bg-muted/50 px-3 py-2.5">
                <div className="font-pixel-xs uppercase tracking-wider text-foreground/40">
                  You keep
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-foreground/35 line-through">{owned}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-foreground/35" aria-hidden />
                  <span
                    className={`font-display-md leading-none ${left === 0 ? "text-destructive" : "text-foreground"}`}
                  >
                    {left}
                  </span>
                </div>
              </div>
              <div className="rounded-[16px] bg-muted/50 px-3 py-2.5">
                <div className="font-pixel-xs uppercase tracking-wider text-foreground/40">
                  Bag space
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-foreground/35 line-through">
                    {usedNow}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-foreground/35" aria-hidden />
                  <span className="font-display-md leading-none text-hp-good">{usedAfter}</span>
                  <span className="text-[11px] font-bold text-foreground/40">/{cap}</span>
                </div>
              </div>
            </div>

            {/* The bar the Bag sheet already shows, so freeing room is something
                you can SEE rather than infer from two numbers. */}
            <div className="relative mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-hp-good/30"
                style={{ width: `${pctNow}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-hp-good transition-[width]"
                style={{ width: `${pctAfter}%` }}
              />
            </div>

            {max > 1 && (
              <div className="mt-4">
                <div className="flex items-center gap-3">
                  {/* Steppers flank the slider because a 60-wide slider on a phone
                      cannot reliably land on one exact unit. */}
                  <button
                    aria-label="One fewer"
                    onClick={() => step(-1)}
                    disabled={amount <= 1}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition active:scale-90 disabled:opacity-30"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <Slider
                    value={[amount]}
                    min={1}
                    max={max}
                    step={1}
                    onValueChange={([v]) => setQty(v ?? 1)}
                    aria-label={`Amount of ${def.name} to discard`}
                    className="flex-1"
                  />
                  <button
                    aria-label="One more"
                    onClick={() => step(1)}
                    disabled={amount >= max}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition active:scale-90 disabled:opacity-30"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    onClick={() => setQty(1)}
                    className="rounded-full bg-muted/60 px-2.5 py-1 font-pixel-xs uppercase tracking-wider text-foreground/50 transition active:scale-95"
                  >
                    Just 1
                  </button>
                  <button
                    onClick={() => setQty(max)}
                    className="rounded-full bg-destructive/10 px-2.5 py-1 font-pixel-xs uppercase tracking-wider text-destructive transition active:scale-95"
                  >
                    All {max}
                  </button>
                </div>
              </div>
            )}

            {/* Only for things worth real money. Shown as value THROWN AWAY, never
                as an amount received — this is the discard path, and the overflow
                panel's half-value refund is a different offer entirely. */}
            {valueLost > 0 && (def.premium || valueLost >= 500) && (
              <div className="mt-4 flex items-start gap-2 rounded-[16px] border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5">
                <AlertTriangle className="mt-[1px] h-4 w-4 shrink-0 text-destructive" aria-hidden />
                <div className="text-[11.5px] leading-snug text-foreground/75">
                  {def.premium ? (
                    <>
                      <span className="font-bold text-foreground">Premium item.</span> You&apos;re
                      giving up {valueLost.toLocaleString()} coins of value for nothing.
                    </>
                  ) : (
                    <>
                      That&apos;s {valueLost.toLocaleString()} coins of value, and none of it comes
                      back.
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="h-12 flex-1 rounded-full bg-muted text-sm font-bold text-foreground/70 transition active:scale-95"
              >
                Keep it
              </button>
              <button
                onClick={() => {
                  if (discardItem(id, amount)) {
                    toast(`Discarded ${amount} ${def.name}`);
                  }
                  setOpen(false);
                }}
                className="h-12 flex-1 rounded-full bg-destructive text-sm font-bold text-white shadow-pop transition active:scale-95"
              >
                Discard {amount}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
