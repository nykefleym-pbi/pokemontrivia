import { useState } from "react";
import { toast } from "sonner";
import { NaIcon } from "@/components/na/icon";
import { useGameStore } from "@/lib/store";
import { ITEM_BY_ID } from "@/content/items";
import type { ItemId } from "@/lib/game-data";
import { ItemIcon } from "@/components/game-ui";
import { NaButton } from "@/components/na/button";
import { NaSheet } from "@/components/na/sheet";
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
    // Figma 7.1c Bag space: the bar turns red when the bag is full (17.10).
    <div className={`na-glass flex flex-col gap-2 rounded-[20px] p-3.5 ${full ? "border border-danger/60 bg-danger/[0.06]" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="na-label uppercase text-text-secondary">Bag space</span>
        <span className={`na-number-m ${full ? "text-danger" : "text-foreground"}`}>
          {used}/{cap}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-night-deep">
        <div className={`h-full rounded transition-[width] ${full ? "bg-danger" : "na-fill-success"}`} style={{ width: `${pct}%` }} />
      </div>
      {price !== null && (
        <NaButton
          kind="secondary"
          size="M"
          block
          disabled={coins < price}
          onClick={() => {
            if (purchaseBagUpgrade()) toast.success(`Bag upgraded: ${cap + 10} slots!`);
            else toast.error(`Need ${price.toLocaleString()} coins`);
          }}
        >
          Add 10 slots · {price.toLocaleString()} coins
        </NaButton>
      )}
      <p className="na-caption text-text-muted">
        {price === null ? "Bag fully upgraded! " : ""}Berries don&apos;t use bag space.
      </p>
    </div>
  );
}


/**
 * Figma 17.10: rewards that would not fit wait here. Each row offers the three
 * ways out the owner specified — take it (once there is room), sell it for half
 * its shop price, or let it go — for as long as the bag is too full to hold it.
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
    <div className="flex flex-col gap-2 rounded-[20px] border border-danger/40 bg-danger/[0.08] p-3">
      <span className="na-headline text-foreground">
        {room < 1 ? "Your bag is full! " : ""}
        {pending.length} reward{pending.length === 1 ? " is" : "s are"} waiting.
      </span>
      <p className="na-caption text-text-secondary">
        Make room to claim them, sell them for half price, or let them go. We&apos;ll keep them safe until you decide.
      </p>
      {pending.map((entry) => {
        const def = ITEM_BY_ID[entry.id];
        if (!def) return null;
        const refund = overflowRefundValue(entry.id, entry.qty);
        return (
          <div key={entry.id} className="flex flex-col gap-1.5 rounded-[14px] bg-night-card-2 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <ItemIcon item={def} className="h-7 w-7 shrink-0" />
              <span className="na-body-strong flex-1 text-foreground">{def.name}</span>
              <span className="na-caption text-text-secondary">×{entry.qty} waiting</span>
            </div>
            <div className="flex items-center gap-1.5">
              <NaButton
                kind="secondary"
                size="M"
                className="flex-1"
                disabled={room < 1}
                onClick={() => {
                  if (claimOverflow(entry.id)) toast.success(`${def.name} moved to your bag`);
                }}
              >
                {room < 1 ? "Bag full" : `Move ${Math.min(entry.qty, room)} to bag`}
              </NaButton>
              <NaButton
                kind="gold"
                size="M"
                className="flex-1"
                onClick={() => {
                  const paid = refundOverflow(entry.id);
                  toast.success(`Sold for ${paid.toLocaleString()} coins`);
                }}
              >
                Sell for {refund.toLocaleString()}
              </NaButton>
              <NaButton
                kind="text"
                size="M"
                onClick={() => {
                  if (forfeitOverflow(entry.id)) toast(`${def.name} let go`);
                }}
              >
                Let go
              </NaButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// shortcut: English plural by adding "s"; fine for every item name today, revisit if one ends oddly.
const plural = (name: string, n: number) => (n === 1 || name.endsWith("s") ? name : `${name}s`);

/**
 * Figma 17.11: the buy sheet (17.1) turned round for throwing away. − and +
 * choose how many, All N takes the lot; what you have, what goes, what you keep
 * and the bag space after, so nobody does the sums. Pays nothing back, and says so.
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

  // Bounded by what is held RIGHT NOW (read from the store): using the item while
  // the sheet is open must not leave it offering a quantity that no longer exists.
  const max = Math.max(1, owned);
  const amount = Math.min(qty, max);
  const left = Math.max(0, owned - amount);
  const cap = bagCapacity(bagUpgrades);
  const usedAfter = Math.max(0, bagUnitsUsed(inventory) - amount);
  // Value thrown away at shop price — never shown as a payout.
  const valueLost = def.cost * amount;
  const line = (label: string, value: string, valueClass: string, strong?: boolean) => (
    <div className="flex items-center justify-between">
      <span className={strong ? "na-body-strong text-foreground" : "na-body text-text-secondary"}>{label}</span>
      <span className={`na-number-m ${valueClass}`}>{value}</span>
    </div>
  );

  return (
    <>
      <button
        aria-label={`Discard ${def.name}`}
        onClick={() => {
          setQty(1);
          setOpen(true);
        }}
        className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-text-muted"
      >
        <NaIcon name="trash" size={16} />
      </button>

      <NaSheet
        open={open}
        onOpenChange={setOpen}
        title={`Throw away ${def.name}?`}
        hideTitle
        primary={{
          label: `Throw away ${amount} ${plural(def.name, amount)}`,
          onClick: () => {
            if (discardItem(id, amount)) toast(`Threw away ${amount} ${plural(def.name, amount)}`);
            setOpen(false);
          },
        }}
        secondary={{ label: amount === 1 ? "Keep it" : "Keep them", onClick: () => setOpen(false) }}
      >
        <div className="flex items-center gap-3.5">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] bg-danger/[0.14]">
            <ItemIcon item={def} className="h-11 w-11" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="na-title text-foreground">{def.name}</span>
            <span className="na-caption text-text-secondary">{def.desc}</span>
          </span>
        </div>
        <div className="flex items-center justify-between rounded-[16px] bg-white/10 px-3.5 py-2.5">
          <span className="flex items-center gap-2">
            <span className="na-body-strong text-foreground">Quantity</span>
            {max > 1 && (
              <button type="button" onClick={() => setQty(max)} className="na-label rounded-full border border-danger/30 bg-danger/[0.12] px-2 py-0.5 uppercase text-danger">
                All {max}
              </button>
            )}
          </span>
          <span className="flex items-center gap-4">
            <button type="button" aria-label="One fewer" disabled={amount <= 1} onClick={() => setQty(Math.max(1, amount - 1))} className="na-headline flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.16] text-foreground disabled:opacity-40">
              −
            </button>
            <span className="na-number-l w-6 text-center text-foreground">{amount}</span>
            <button type="button" aria-label="One more" disabled={amount >= max} onClick={() => setQty(Math.min(max, amount + 1))} className="na-headline flex h-9 w-9 items-center justify-center rounded-full bg-brand-red text-foreground disabled:opacity-40">
              +
            </button>
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {line(`Your ${plural(def.name, 2)}`, String(owned), "text-foreground")}
          {line("Throwing away", `−${amount}`, "text-brand-red-light")}
          <div className="h-px bg-white/[0.16]" />
          {line("You keep", `${left} ${plural(def.name, left)}`, left === 0 ? "text-danger" : "text-foreground", true)}
          {line("Bag space after", `${usedAfter}/${cap}`, "text-success")}
        </div>
        {valueLost > 0 && (def.premium || valueLost >= 500) ? (
          <p className="na-caption rounded-[14px] border border-danger/25 bg-danger/[0.06] px-3 py-2 text-center text-foreground">
            {def.premium ? "A Premium item! " : ""}That&apos;s {valueLost.toLocaleString()} coins of value, and none of it comes back.
          </p>
        ) : (
          <p className="na-caption text-center text-text-muted">Thrown-away items are gone for good, and you get no coins back.</p>
        )}
      </NaSheet>
    </>
  );
}