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
  superpotion: "HEALING",
  maxpotion: "HEALING",
  focusband: "HEALING",
  xattack: "BATTLE",
  scope: "BATTLE",
  xaccuracy: "BATTLE",
  quickclaw: "BATTLE",
  assaultvest: "BATTLE",
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
  superpotion: "Restore 60 HP",
  maxpotion: "Fully restore HP",
  xattack: "+20 damage next answer",
  scope: "Remove one wrong answer",
  xaccuracy: "Reveal the correct answer",
  escape: "Bail out, no XP lost",
  candy: "+50 TP for your partner",
  luckyegg: "2× XP for 24 hours",
  focusband: "Auto: clutch heal at low HP",
  quickclaw: "Auto: timer reset under 5s",
  assaultvest: "Auto: ½ damage vs bad matchups",
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
  const coins = useGameStore((s) => s.coins);
  const inventory = useGameStore((s) => s.inventory);
  const buyItem = useGameStore((s) => s.buyItem);
  const useItem = useGameStore((s) => s.useItem);
  const autoItems = useGameStore((s) => s.autoItems);
  const dailyGiftLastClaim = useGameStore((s) => s.dailyGiftLastClaim);
  const dailyGiftStreak = useGameStore((s) => s.dailyGiftStreak);
  const claimDailyGift = useGameStore((s) => s.claimDailyGift);
  const [giftNow, setGiftNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setGiftNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const giftToday = new Date(giftNow).toISOString().slice(0, 10);
  const giftYesterday = (() => { const d = new Date(giftNow); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const giftClaimable = dailyGiftLastClaim !== giftToday;
  const giftClaimedToday = dailyGiftLastClaim === giftToday;
  const giftContinuing = dailyGiftLastClaim === giftYesterday;
  const giftLit = giftClaimedToday ? dailyGiftStreak : (giftContinuing ? dailyGiftStreak : 0);
  const giftNextDay = (giftLit % 7) + 1;
  const giftMsToNext = Date.UTC(new Date(giftNow).getUTCFullYear(), new Date(giftNow).getUTCMonth(), new Date(giftNow).getUTCDate() + 1) - giftNow;
  const giftClock = `${Math.floor(giftMsToNext / 3_600_000)}h ${String(Math.floor((giftMsToNext % 3_600_000) / 60_000)).padStart(2, "0")}m`;
  function handleClaimGift() {
    const res = claimDailyGift();
    if (!res) return;
    const it = ITEMS.find((x) => x.id === res.itemId);
    if (res.shiny) {
      toast.success(`Day 7 reward! ${res.qty}× ${it?.name ?? "item"} ${it?.emoji ?? "🎁"} — your next battle win is a guaranteed shiny! ✨`);
    } else {
      toast.success(`Daily Gift opened: ${res.qty}× ${it?.name ?? "item"} ${it?.emoji ?? "🎁"}`);
    }
  }
  const toggleAutoItem = useGameStore((s) => s.toggleAutoItem);

  const [tab, setTab] = useState<Category>("HEALING");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [qty, setQty] = useState(1);

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

  useEffect(() => {
    if (confirmState) setQty(1);
  }, [confirmState]);

  if (!hasOnboarded) return null;

  const items = ITEMS.filter((it) => CATEGORY_OF[it.id] === tab);

  function confirmPurchase() {
    if (!confirmState) return;
    const { item, cost } = confirmState;
    let bought = 0;
    for (let i = 0; i < qty; i++) {
      const ok = buyItem(item.id as never, cost);
      if (!ok) break;
      bought++;
    }
    if (bought === 0) {
      toast.error(`Need ${cost * qty} Coins to buy ${qty}× ${item.name}.`);
    } else if (bought < qty) {
      toast.success(`Bought ${bought}× ${item.name} (ran out of Coins).`);
    } else {
      toast.success(`Bought ${qty}× ${item.name}!`);
    }
    setConfirmState(null);
  }

  const ownedInBag = ITEMS.filter((it) => (inventory[it.id] ?? 0) > 0);

  function handleUseFromBag(it: ItemDef) {
    const ok = useItem(it.id);
    if (!ok) {
      toast.error(
        it.id === "luckyegg"
          ? "Lucky Egg can only be used once per week."
          : `Can't use ${it.name} right now.`,
      );
      return;
    }
    if (it.id === "candy") toast.success("🍬 +50 TP added to your partner!");
    else if (it.id === "luckyegg") toast.success("🥚 2× XP active for 24 hours!");
    else toast.success(`Used ${it.name}!`);
  }

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      <Toaster position="top-center" />
      {/* Hero */}
      <div className="px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <p className="font-pixel-xs text-primary">WELCOME TO</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="font-display-xl text-foreground">PokéMart</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBagOpen(true)}
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-card shadow-card"
              aria-label="Open bag"
            >
              <ShoppingBag className="h-5 w-5 text-foreground" />
              {totalItems > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 font-pixel-xs text-white">
                  {totalItems}
                </span>
              )}
            </button>
            <div className="flex items-center gap-1.5 rounded-full bg-poke-yellow px-3.5 py-2 shadow-card">
              <Star className="h-4 w-4 fill-poke-dark text-foreground" />
              <span className="text-sm font-extrabold text-foreground">{coins.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-8 pt-2">
        {/* Daily Gift */}
        {giftClaimable ? (
          <button onClick={handleClaimGift} className="relative mb-5 flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#F2D64E] to-[#E8A93C] p-5 text-left shadow-card active:scale-[0.99]">
            <span className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 font-pixel-xs uppercase text-white shadow-sm">Free</span>
            <div className="shrink-0 text-5xl drop-shadow">🎁</div>
            <div className="min-w-0 flex-1">
              <div className="font-pixel-xs uppercase text-foreground/70">Daily Gift · Day {giftNextDay}</div>
              <div className="text-lg font-extrabold leading-tight text-foreground">Tap to open your free item!</div>
              <div className="mt-2.5 flex items-center gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => {
                  const day = i + 1;
                  const filled = day <= giftLit;
                  const active = day === giftNextDay;
                  return (
                    <div key={day} className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${filled ? "bg-primary text-white" : active ? "bg-white text-primary ring-2 ring-primary" : "bg-black/10 text-foreground/40"}`}>
                      {day === 7 ? "★" : day}
                    </div>
                  );
                })}
              </div>
            </div>
          </button>
        ) : (
          <div className="relative mb-5 flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-card p-5 shadow-card">
            <div className="shrink-0 text-5xl opacity-40 grayscale">🎁</div>
            <div className="min-w-0 flex-1">
              <div className="font-pixel-xs uppercase text-foreground/55">Daily Gift · claimed today</div>
              <div className="text-lg font-extrabold leading-tight text-foreground/70">Next gift in {giftClock}</div>
              <div className="mt-2.5 flex items-center gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => {
                  const day = i + 1;
                  const filled = day <= giftLit;
                  return (
                    <div key={day} className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${filled ? "bg-primary text-white" : "bg-black/10 text-foreground/40"}`}>
                      {day === 7 ? "★" : day}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

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
          <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-poke-yellow px-3 py-0.5 font-pixel-xs uppercase text-foreground shadow-sm">
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
              {featured.discountedCost} Coins
            </span>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white/60 line-through">
              {featured.originalCost} Coins
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
                tab === c.id ? "bg-poke-dark text-white shadow-card" : "text-foreground/60"
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
              const canAfford = coins >= item.cost;
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
                      <div className="font-display-md leading-tight text-foreground">
                        {item.name}
                      </div>
                      {item.premium && (
                        <Star className="h-3.5 w-3.5 text-poke-yellow" fill="currentColor" />
                      )}
                    </div>
                    {owned > 0 && (
                      <span className="mt-1 inline-flex w-fit rounded-full bg-poke-dark/10 px-2 py-0.5 font-pixel-xs text-foreground/70">
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
                    {item.cost.toLocaleString()} Coins
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
              {/* Top row: icon + name + desc (left-aligned) */}
              <div className="flex items-center gap-4 pt-2">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-poke-yellow/20">
                  <ItemIcon item={confirmState.item} className="h-11 w-11" />
                </div>
                <div className="min-w-0">
                  <div className="font-display-lg text-foreground">{confirmState.item.name}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{confirmState.item.desc}</div>
                </div>
              </div>

              {/* Featured discount note (only for featured) */}
              {confirmState.featured && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-poke-yellow px-3 py-1 font-pixel-xs uppercase text-foreground">
                  Discounted {confirmState.featured.discountPct}% off
                </div>
              )}

              {/* Quantity stepper */}
              {(() => {
                const unitCost = confirmState.cost;
                const maxQty = unitCost > 0 ? Math.max(1, Math.floor(coins / unitCost)) : 1;
                return (
                  <div className="mt-4 flex items-center justify-between rounded-2xl bg-poke-blue/10 px-4 py-3">
                    <span className="font-bold text-foreground">Quantity</span>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        disabled={qty <= 1}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground shadow-card disabled:opacity-40"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center text-lg font-extrabold tabular-nums text-foreground">{qty}</span>
                      <button
                        onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                        disabled={qty >= maxQty}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-poke-dark text-white shadow-card disabled:opacity-40"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Cost breakdown rows */}
              {(() => {
                const unitCost = confirmState.cost;
                const totalCost = unitCost * qty;
                const balanceAfter = coins - totalCost;
                const canAfford = balanceAfter >= 0;
                return (
                  <div className="mt-4 space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Your Coins</span>
                      <span className="font-bold text-foreground tabular-nums">{coins.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Cost</span>
                      <span className="font-bold text-primary tabular-nums">−{totalCost.toLocaleString()}</span>
                    </div>
                    <div className="border-t border-dashed border-border pt-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">Balance after</span>
                        <span className={`font-extrabold tabular-nums ${canAfford ? "text-hp-good" : "text-destructive"}`}>
                          {balanceAfter.toLocaleString()} Coins
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Confirm + Cancel */}
              {(() => {
                const unitCost = confirmState.cost;
                const totalCost = unitCost * qty;
                const balanceAfter = coins - totalCost;
                const canAfford = balanceAfter >= 0;
                return (
                  <div className="mt-5 space-y-2">
                    <Button
                      disabled={!canAfford}
                      onClick={confirmPurchase}
                      className="h-13 w-full rounded-full bg-primary py-6 text-base font-bold text-primary-foreground shadow-pop disabled:opacity-50"
                    >
                      Confirm — {totalCost.toLocaleString()} Coins
                    </Button>
                    <button
                      onClick={() => setConfirmState(null)}
                      className="w-full py-2 text-center text-sm font-bold text-muted-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                );
              })()}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Bag */}
      <Sheet open={bagOpen} onOpenChange={setBagOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-center font-display-lg text-foreground">
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
                    <div className="font-display-md text-foreground">Your bag is empty</div>
                    <p className="mt-1 text-xs text-foreground/60">Buy items below to stock up.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bagGroups.map((group) => (
                      <div key={group.id}>
                        <div className="mb-2 font-pixel-xs uppercase tracking-wider text-foreground/45">
                          {group.label}
                        </div>
                        <div className="flex flex-col gap-2.5">
                          {group.items.map((it) => {
                            const n = inventory[it.id] ?? 0;
                            const isUsable = it.id === "candy" || it.id === "luckyegg";
                            const isAuto =
                              it.id === "focusband" ||
                              it.id === "quickclaw" ||
                              it.id === "assaultvest";
                            const autoOn = autoItems[it.id] !== false;
                            return (
                              <div
                                key={it.id}
                                className="flex items-center gap-3.5 rounded-[20px] bg-card px-4 py-3 shadow-card"
                              >
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-primary/[0.08]">
                                  <ItemIcon item={it} className="h-9 w-9" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold leading-tight text-foreground">
                                    {it.name}
                                  </div>
                                  <div className="mt-0.5 truncate text-xs text-foreground/55">
                                    {BAG_SHORT_DESC[it.id] ?? it.desc}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className="font-pixel-xs text-foreground">×{n}</span>
                                  {isUsable && (
                                    <button
                                      onClick={() => handleUseFromBag(it)}
                                      className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition active:scale-95"
                                    >
                                      Use
                                    </button>
                                  )}
                                  {isAuto && (
                                    <button
                                      onClick={() => toggleAutoItem(it.id)}
                                      className={`rounded-full px-3 py-1.5 text-xs font-bold shadow-sm transition active:scale-95 ${
                                        autoOn ? "bg-hp-good text-white" : "bg-muted text-foreground/50"
                                      }`}
                                    >
                                      {autoOn ? "Auto: On" : "Auto: Off"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="rounded-2xl bg-poke-blue/10 px-4 py-3 text-xs leading-snug text-foreground/70">
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

