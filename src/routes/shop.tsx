import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, Star } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { ITEMS } from "@/lib/game-data";
import { AppHeader } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/shop")({
  component: ShopPage,
});

function ShopPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const xp = useGameStore((s) => s.xp);
  const inventory = useGameStore((s) => s.inventory);
  const buyItem = useGameStore((s) => s.buyItem);

  useEffect(() => {
    if (!hasOnboarded) navigate({ to: "/" });
  }, [hasOnboarded, navigate]);

  if (!hasOnboarded) return null;

  function tryBuy(id: string, name: string, cost: number) {
    const ok = buyItem(id as never, cost);
    if (!ok) {
      toast.error(`Need ${cost} XP to buy ${name}.`);
    } else {
      toast.success(`Bought ${name}!`);
    }
  }

  return (
    <div className="min-h-screen bg-background">
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
        <p className="mb-4 text-sm text-muted-foreground">
          Spend XP earned in battle on items that turn the tide.
        </p>

        <div className="space-y-3">
          {ITEMS.map((item, i) => {
            const owned = inventory[item.id] ?? 0;
            const canAfford = xp >= item.cost;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="relative flex items-center gap-3 rounded-2xl border-2 border-border bg-card p-3 shadow-sm"
              >
                {item.premium && (
                  <div className="absolute -top-2 right-3 flex items-center gap-1 rounded-full bg-poke-yellow px-2 py-0.5 font-pixel text-[8px] text-poke-dark shadow-sm">
                    <Star className="h-2.5 w-2.5" /> PREMIUM
                  </div>
                )}
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted text-3xl">
                  {item.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold">{item.name}</h3>
                    <span className="font-pixel text-[9px] text-muted-foreground">×{owned}</span>
                  </div>
                  <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={!canAfford}
                  onClick={() => tryBuy(item.id, item.name, item.cost)}
                  className="shrink-0 rounded-full bg-primary px-4 font-semibold disabled:opacity-40"
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {item.cost}
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
