import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, Star } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { ITEMS, type ItemDef, type ItemId } from "@/lib/game-data";
import { AppHeader } from "@/components/game-ui";
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

const CATEGORIES: Category[] = ["HEALING", "BATTLE", "UTILITY", "PREMIUM"];

function ShopPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const xp = useGameStore((s) => s.xp);
  const inventory = useGameStore((s) => s.inventory);
  const buyItem = useGameStore((s) => s.buyItem);

  const [tab, setTab] = useState<Category>("HEALING");
  const [confirmItem, setConfirmItem] = useState<ItemDef | null>(null);

  // Daily featured: rotate by UTC date
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
    <div className="min-h-screen bg-background pb-24">
      <Toaster position="top-center" />
      <AppHeader>
        <div className="flex items-end justify-between">
          <div>
            <p className="font-pixel text-[10px] uppercase text-muted-foreground">Shop</p>
            <h1 className="font-pixel text-base text-foreground">PokéMart</h1>
          </div>
          <div className="rounded-full bg-poke-yellow px-3 py-1 font-pixel text-[11px] text-poke-dark shadow-sm">
            ✨ {xp} XP
          </div>
        </div>
      </AppHeader>

      <div className="px-5 pb-8 pt-2">
        {/* Daily featured */}
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-1.5 font-pixel text-[10px] uppercase text-muted-foreground">
            <Star className="h-3 w-3 text-poke-yellow" /> Today's Featured
          </div>
          <div className="grid grid-cols-2 gap-2">
            {featured.map((item) => {
              const owned = inventory[item.id] ?? 0;
              return (
                <button
                  key={`feat-${item.id}`}
                  onClick={() => setConfirmItem(item)}
                  className="relative flex flex-col items-start gap-1 overflow-hidden rounded-2xl border-2 border-poke-yellow bg-gradient-to-br from-poke-yellow/15 to-card p-3 text-left shadow-pop"
                >
                  <span className="absolute -right-6 top-2 rotate-45 bg-poke-yellow px-6 py-0.5 font-pixel text-[8px] text-poke-dark">
                    DAILY
                  </span>
                  <img src={item.iconUrl} alt={item.name} className="sprite h-10 w-10 object-contain" />
                  <div className="font-pixel text-[10px]">{item.name}</div>
                  <div className="text-[10px] text-muted-foreground">×{owned} owned</div>
                  <div className="mt-1 font-pixel text-[10px] text-primary">
                    <Sparkles className="mr-0.5 inline h-2.5 w-2.5" /> {item.cost}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category tabs */}
        <div className="mb-3 flex gap-1 overflow-x-auto rounded-full bg-muted p-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setTab(c)}
              className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 font-pixel text-[9px] transition ${
                tab === c ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Stocked trainer! Nothing else here.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((item, i) => {
              const owned = inventory[item.id] ?? 0;
              const canAfford = xp >= item.cost;
              return (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => setConfirmItem(item)}
                  className={`relative flex flex-col items-start gap-1.5 rounded-2xl border-2 bg-card p-3 text-left shadow-sm transition ${
                    canAfford ? "border-border" : "border-border opacity-60"
                  }`}
                >
                  {item.premium && (
                    <div className="absolute -top-1.5 right-2 flex items-center gap-0.5 rounded-full bg-poke-yellow px-1.5 py-0.5 font-pixel text-[8px] text-poke-dark shadow-sm">
                      <Star className="h-2 w-2" />
                    </div>
                  )}
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-muted">
                    <img
                      src={item.iconUrl}
                      alt={item.name}
                      className="sprite h-9 w-9 object-contain"
                      onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement;
                        el.replaceWith(
                          Object.assign(document.createElement("span"), {
                            textContent: item.emoji,
                            className: "text-2xl",
                          }),
                        );
                      }}
                    />
                  </div>
                  <div className="font-pixel text-[10px] leading-tight">{item.name}</div>
                  <div className="text-[10px] text-muted-foreground">×{owned} owned</div>
                  <div className="mt-auto flex w-full items-center justify-between pt-1">
                    <span className="font-pixel text-[10px] text-primary">
                      <Sparkles className="mr-0.5 inline h-2.5 w-2.5" /> {item.cost}
                    </span>
                  </div>
                </motion.button>
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
                <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                  <img src={confirmItem.iconUrl} alt={confirmItem.name} className="sprite h-12 w-12 object-contain" />
                </div>
                <SheetTitle className="text-center font-pixel text-sm">{confirmItem.name}</SheetTitle>
                <SheetDescription className="text-center text-xs">
                  {confirmItem.desc}
                </SheetDescription>
              </SheetHeader>
              <div className="my-4 flex items-center justify-around text-center text-xs">
                <div>
                  <div className="text-muted-foreground">You have</div>
                  <div className="font-pixel text-base text-foreground">✨ {xp}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Cost</div>
                  <div className="font-pixel text-base text-primary">{confirmItem.cost}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">After</div>
                  <div className="font-pixel text-base text-foreground">{Math.max(0, xp - confirmItem.cost)}</div>
                </div>
              </div>
              <SheetFooter className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-full"
                  onClick={() => setConfirmItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={xp < confirmItem.cost}
                  className="flex-1 rounded-full bg-primary disabled:opacity-50"
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
