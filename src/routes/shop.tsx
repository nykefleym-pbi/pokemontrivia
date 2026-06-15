import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, Star } from "lucide-react";
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
  SheetFooter,
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

function ShopPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const xp = useGameStore((s) => s.xp);
  const inventory = useGameStore((s) => s.inventory);
  const buyItem = useGameStore((s) => s.buyItem);

  const [tab, setTab] = useState<Category>("HEALING");
  const [confirmItem, setConfirmItem] = useState<ItemDef | null>(null);

  const featured = useMemo(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    const a = ITEMS[day % ITEMS.length];
    const b = ITEMS[(day + 3) % ITEMS.length];
    return a.id === b.id ? [a] : [a, b];
  }, []);

  useEffect(() => {
    if (!hasOnboarded) navigate({ to: "/" });
  }, [hasOnboarded, navigate]);

  if (!hasOnboarded) return null;

  const items = ITEMS.filter((it) => CATEGORY_OF[it.id] === tab);

  function confirmPurchase() {
    if (!confirmItem) return;
    const ok = buyItem(confirmItem.id as never, confirmItem.cost);
    if (!ok) {
      toast.error(`Need ${confirmItem.cost} XP to buy ${confirmItem.name}.`);
    } else {
      toast.success(`Bought ${confirmItem.name}!`);
    }
    setConfirmItem(null);
  }

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      <Toaster position="top-center" />
      {/* Hero */}
      <div className="px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <p className="font-pixel-xs text-primary">POKÉMART</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="font-display-xl text-poke-dark">Shop</h1>
          <div className="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 shadow-card">
            <Sparkles className="h-4 w-4 text-poke-yellow" />
            <span className="text-sm font-extrabold text-poke-dark">{xp.toLocaleString()}</span>
            <span className="font-pixel-xs text-poke-dark/60">XP</span>
          </div>
        </div>
      </div>

      <div className="px-5 pb-8 pt-4">
        {/* Featured rail */}
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-poke-yellow" />
            <span className="font-pixel-xs text-poke-dark/60">Today's Featured</span>
          </div>
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 snap-x snap-mandatory">
            {featured.map((item) => {
              const owned = inventory[item.id] ?? 0;
              const canAfford = xp >= item.cost;
              return (
                <button
                  key={`feat-${item.id}`}
                  onClick={() => setConfirmItem(item)}
                  className="relative flex w-[78%] shrink-0 snap-start flex-col items-start gap-2 overflow-hidden rounded-3xl border border-poke-yellow/40 bg-gradient-to-br from-poke-yellow/30 to-card p-4 text-left shadow-card"
                >
                  <span className="absolute right-3 top-3 rounded-full bg-poke-yellow px-2 py-0.5 font-pixel-xs text-poke-dark shadow-sm">
                    DAILY
                  </span>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card shadow-sm">
                    <ItemIcon item={item} className="h-10 w-10" />
                  </div>
                  <div className="font-display-md text-poke-dark">{item.name}</div>
                  <div className="line-clamp-2 text-xs text-poke-dark/60">{item.desc}</div>
                  <div className="mt-1 flex w-full items-center justify-between">
                    <span className="text-[11px] text-poke-dark/60">×{owned} owned</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                      canAfford ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      <Sparkles className="h-3 w-3" /> {item.cost}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category tabs */}
        <div className="mb-4 grid grid-cols-4 gap-1 rounded-full bg-poke-dark/10 p-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`h-9 rounded-full text-xs font-bold transition ${
                tab === c.id ? "bg-card text-poke-dark shadow-card" : "text-poke-dark/60"
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
          <div className="grid grid-cols-2 gap-3">
            {items.map((item, i) => {
              const owned = inventory[item.id] ?? 0;
              const canAfford = xp >= item.cost;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="relative flex flex-col gap-2 rounded-3xl bg-card p-4 shadow-card"
                >
                  {item.premium && (
                    <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-poke-yellow text-poke-dark shadow-sm">
                      <Star className="h-3 w-3" fill="currentColor" />
                    </div>
                  )}
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                    <ItemIcon item={item} className="h-10 w-10" />
                  </div>
                  <div className="font-display-md text-poke-dark leading-tight">{item.name}</div>
                  <div className="line-clamp-2 text-[11px] text-muted-foreground">{item.desc}</div>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-poke-dark/70">
                      ×{owned}
                    </span>
                  </div>
                  <Button
                    onClick={() => setConfirmItem(item)}
                    disabled={!canAfford}
                    className={`h-10 w-full rounded-full text-xs font-bold ${
                      canAfford ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Sparkles className="mr-1 h-3 w-3" /> Buy · {item.cost}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!confirmItem} onOpenChange={(o) => !o && setConfirmItem(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          {confirmItem && (
            <>
              <SheetHeader>
                <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-muted">
                  <ItemIcon item={confirmItem} className="h-14 w-14" />
                </div>
                <SheetTitle className="text-center font-display-lg text-poke-dark">
                  {confirmItem.name}
                </SheetTitle>
                <SheetDescription className="text-center text-sm">
                  {confirmItem.desc}
                </SheetDescription>
              </SheetHeader>
              <div className="my-4 grid grid-cols-3 gap-2">
                <Stat label="You have" value={`✨ ${xp}`} tone="default" />
                <Stat label="Cost" value={String(confirmItem.cost)} tone="primary" />
                <Stat label="After" value={String(Math.max(0, xp - confirmItem.cost))} tone="default" />
              </div>
              <SheetFooter className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-full text-sm font-bold"
                  onClick={() => setConfirmItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={xp < confirmItem.cost}
                  className="h-12 flex-1 rounded-full bg-primary text-sm font-bold shadow-pop disabled:opacity-50"
                  onClick={confirmPurchase}
                >
                  Confirm
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "default" | "primary" }) {
  return (
    <div className="rounded-2xl bg-muted/40 px-2 py-2 text-center">
      <div className="font-pixel-xs text-poke-dark/50">{label}</div>
      <div className={`mt-0.5 text-base font-extrabold ${tone === "primary" ? "text-primary" : "text-poke-dark"}`}>
        {value}
      </div>
    </div>
  );
}
