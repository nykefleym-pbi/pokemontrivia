import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Star, ShoppingBag, Minus, Plus } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { ITEMS, type ItemDef, type ItemId } from "@/lib/game-data";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/shop")({
  component: ShopPage,
});

type Category = "HEALING" | "BATTLE" | "UTILITY" | "PREMIUM";

const CATEGORY_OF: Record<ItemId, Category> = {
  potion: "HEALING",
  revive: "HEALING",
  xattack: "BATTLE",
  scope: "BATTLE",
  xaccuracy: "BATTLE",
  escape: "UTILITY",
  candy: "PREMIUM",
  luckyegg: "PREMIUM",
};

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: "HEALING", label: "Healing" },
  { id: "BATTLE", label: "Battle" },
  { id: "UTILITY", label: "Utility" },
  { id: "PREMIUM", label: "Premium" },
];

const BAG_SHORT_DESC: Record<string, string> = {
  potion: "Restore 30 HP",
  revive: "Revive to 50 HP",
  xattack: "2× damage next answer",
  scope: "Remove one wrong answer",
  candy: "+50 TP for your partner",
  escape: "Bail out, no XP lost",
  xaccuracy: "+5 seconds to your timer",
  luckyegg: "Double XP this battle",
};

function bagDesc(it: ItemDef): string {
  return BAG_SHORT_DESC[it.id] ?? it.desc;
}

function ItemIcon({ item, className }: { item: ItemDef; className: string }) {
  return (
    <img
      src={item.iconUrl}
      alt={item.name}
      crossOrigin="anonymous"
      className={`sprite object-contain ${className}`}
      onError={(e) => {
        const el = e.currentTarget as HTMLImageElement;
        el.replaceWith(
          Object.assign(document.createElement("span"), {
            textContent: item.emoji,
            className: "text-3xl",
          }),
        );
      }}
    />
  );
}

type ConfirmState =
  | { item: ItemDef; cost: number; featured?: { originalCost: number; discountPct: number } }
  | null;

function ShopPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const xp = useGameStore((s) => s.xp);
  const inventory = useGameStore((s) => s.inventory);
  const buyItem = useGameStore((s) => s.buyItem);

  const [tab, setTab] = useState<Category>("HEALING");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [bagOpen, setBagOpen] = useState(false);

  const totalItems = useMemo(
    () => Object.values(inventory).reduce((a, b) => a + (b ?? 0), 0),
    [inventory],
  );

  const featured = useMemo(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    const item = ITEMS[day % ITEMS.length];
    const steps = [20, 25, 30, 35, 40, 45, 50];
    const discountPct = steps[day % steps.length];
    const discountedCost = Math.max(1, Math.round((item.cost * (100 - discountPct)) / 100));
    return { item, originalCost: item.cost, discountedCost, discountPct };
  }, []);

  useEffect(() => {
    if (!hasOnboarded) navigate({ to: "/" });
  }, [hasOnboarded, navigate]);

  if (!hasOnboarded) return null;

  const items = ITEMS.filter((it) => CATEGORY_OF[it.id] === tab);

  function confirmPurchase() {
    if (!confirmState) return;
    const { item, cost } = confirmState;
    const ok = buyItem(item.id as never, cost);
    if (!ok) {
      toast.error(`Need ${cost} XP to buy ${item.name}.`);
    } else {
      toast.success(`Bought ${item.name}!`);
    }
    setConfirmState(null);
  }

  const ownedInBag = ITEMS.filter((it) => (inventory[it.id] ?? 0) > 0);

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      <Toaster position="top-center" />
      {/* Hero */}
      <div className="px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <p className="font-pixel-xs text-primary">WELCOME TO</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="font-display-xl text-poke-dark">PokéMart</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBagOpen(true)}
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-card shadow-card"
              aria-label="Open bag"
            >
              <ShoppingBag className="h-5 w-5 text-poke-dark" />
              {totalItems > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 font-pixel-xs text-white">
                  {totalItems}
                </span>
              )}
            </button>
            <div className="flex items-center gap-1.5 rounded-full bg-poke-yellow px-3.5 py-2 shadow-card">
              <Star className="h-4 w-4 fill-poke-dark text-poke-dark" />
              <span className="text-sm font-extrabold text-poke-dark">{xp.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-8 pt-2">
        {/* Featured — single discounted item */}
        <button
          onClick={() =>
            setConfirmState({
              item: featured.item,
              cost: featured.discountedCost,
              featured: {
                originalCost: featured.originalCost,
                discountPct: featured.discountPct,
              },
            })
          }
          className="relative mb-5 flex w-full items-center gap-5 overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-[#b5341f] p-6 pt-9 text-left shadow-card"
        >
          <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-poke-yellow px-3 py-0.5 font-pixel-xs uppercase text-poke-dark shadow-sm">
            Discounted {featured.discountPct}% off
          </span>
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-white/10"
          />
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <ItemIcon item={featured.item} className="h-14 w-14" />
          </div>
          <div className="min-w-0 flex-1 pt-2">
            <div className="font-display-lg text-white">{featured.item.name}</div>
            <div className="mt-1.5 text-sm leading-snug text-white/85">{featured.item.desc}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="rounded-full bg-white px-3.5 py-1.5 text-sm font-extrabold text-primary">
              {featured.discountedCost} XP
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white/60 line-through">
              {featured.originalCost} XP
            </span>
          </div>
        </button>

        {/* Category tabs */}
        <div className="mb-4 grid grid-cols-4 gap-1 rounded-full bg-poke-dark/10 p-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`h-9 rounded-full text-xs font-bold transition ${
                tab === c.id ? "bg-poke-dark text-white shadow-card" : "text-poke-dark/60"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Stocked trainer! Nothing else here.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item, i) => {
              const owned = inventory[item.id] ?? 0;
              const canAfford = xp >= item.cost;
              return (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => setConfirmState({ item, cost: item.cost })}
                  className="relative flex w-full items-center gap-4 rounded-3xl bg-card p-5 text-left shadow-card"
                >
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-poke-yellow/20">
                    <ItemIcon item={item} className="h-12 w-12" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-display-md leading-tight text-poke-dark">
                        {item.name}
                      </div>
                      {item.premium && (
                        <Star className="h-3.5 w-3.5 text-poke-yellow" fill="currentColor" />
                      )}
                    </div>
                    {owned > 0 && (
                      <span className="mt-1 inline-flex w-fit rounded-full bg-poke-dark/10 px-2 py-0.5 font-pixel-xs text-poke-dark/70">
                        OWNED ×{owned}
                      </span>
                    )}
                    <div className="mt-1.5 text-xs leading-snug text-muted-foreground">
                      {item.desc}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-extrabold ${
                      canAfford
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.cost.toLocaleString()} XP
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Purchase confirmation */}
      <Sheet open={!!confirmState} onOpenChange={(o) => !o && setConfirmState(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          {confirmState && (
            <>
              <SheetHeader>
                <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-muted">
                  <ItemIcon item={confirmState.item} className="h-14 w-14" />
                </div>
                <SheetTitle className="text-center font-display-lg text-poke-dark">
                  {confirmState.item.name}
                </SheetTitle>
                <SheetDescription className="text-center text-sm">
                  {confirmState.item.desc}
                </SheetDescription>
                {confirmState.featured && (
                  <div className="mx-auto mt-2 inline-flex items-center gap-2 self-center rounded-full bg-poke-yellow px-3 py-1 font-pixel-xs uppercase text-poke-dark">
                    Discounted! {confirmState.featured.discountPct}% off
                  </div>
                )}
                {confirmState.featured && (
                  <div className="mt-2 text-center text-xs text-poke-dark/60">
                    <span className="line-through">{confirmState.featured.originalCost} XP</span>
                    <span className="mx-2">→</span>
                    <span className="font-extrabold text-primary">{confirmState.cost} XP</span>
                  </div>
                )}
              </SheetHeader>
              <div className="my-4 grid grid-cols-3 gap-2">
                <Stat label="You have" value={`✨ ${xp}`} tone="default" />
                <Stat label="Cost" value={String(confirmState.cost)} tone="primary" />
                <Stat
                  label="After"
                  value={String(Math.max(0, xp - confirmState.cost))}
                  tone="default"
                />
              </div>
              <SheetFooter className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-full text-sm font-bold"
                  onClick={() => setConfirmState(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={xp < confirmState.cost}
                  className="h-12 flex-1 rounded-full bg-primary text-sm font-bold shadow-pop disabled:opacity-50"
                  onClick={confirmPurchase}
                >
                  <Sparkles className="mr-1 h-3 w-3" /> Confirm
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Bag */}
      <Sheet open={bagOpen} onOpenChange={setBagOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-center font-display-lg text-poke-dark">
              Your Bag
            </SheetTitle>
            <SheetDescription className="text-center text-sm">
              {totalItems > 0
                ? `${totalItems} item${totalItems === 1 ? "" : "s"} in your bag`
                : "Stock up on items to use in battle"}
            </SheetDescription>
          </SheetHeader>
          {(() => {
            const bagGroups = CATEGORIES
              .map((cat) => ({
                ...cat,
                items: ITEMS.filter(
                  (it) => CATEGORY_OF[it.id] === cat.id && (inventory[it.id] ?? 0) > 0
                ),
              }))
              .filter((g) => g.items.length > 0);
            return (
              <div className="my-4 max-h-[65vh] overflow-y-auto">
                {ownedInBag.length === 0 ? (
                  <div className="rounded-3xl bg-poke-yellow/15 p-6 text-center">
                    <div className="mx-auto mb-2 text-4xl">🎒</div>
                    <div className="font-display-md text-poke-dark">Your bag is empty</div>
                    <p className="mt-1 text-xs text-poke-dark/60">Buy items below to stock up.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bagGroups.map((group) => (
                      <div key={group.id}>
                        <div className="mb-2 font-pixel-xs uppercase tracking-wider text-poke-dark/45">
                          {group.label}
                        </div>
                        <div className="flex flex-col gap-2.5">
                          {group.items.map((it) => {
                            const n = inventory[it.id] ?? 0;
                            return (
                              <div
                                key={it.id}
                                className="flex items-center gap-3.5 rounded-[20px] bg-card px-4 py-3 shadow-card"
                              >
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-primary/[0.08]">
                                  <ItemIcon item={it} className="h-9 w-9" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold leading-tight text-poke-dark">
                                    {it.name}
                                  </div>
                                  <div className="mt-0.5 truncate text-xs text-poke-dark/55">
                                    {BAG_SHORT_DESC[it.id] ?? it.desc}
                                  </div>
                                </div>
                                <div className="shrink-0 font-pixel-xs text-poke-dark">×{n}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="rounded-2xl bg-poke-blue/10 px-4 py-3 text-xs leading-snug text-poke-dark/70">
                      💡 Battle items appear in your item dock during a match. Tap one before
                      answering to activate it.
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "primary";
}) {
  return (
    <div className="rounded-2xl bg-muted/40 px-2 py-2 text-center">
      <div className="font-pixel-xs text-poke-dark/50">{label}</div>
      <div
        className={`mt-0.5 text-base font-extrabold ${
          tone === "primary" ? "text-primary" : "text-poke-dark"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
