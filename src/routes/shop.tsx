import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { playSfx, playItemCue } from "@/lib/audio";
import { Star, ShoppingBag, Minus, Plus } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { litGiftPips } from "@/lib/daily-gift";
import { useStoreHydrated } from "@/lib/store-hydration";
import { ITEMS, type ItemDef } from "@/lib/game-data";
import { getAbility } from "@/lib/abilities";
import { CATEGORIES, CATEGORY_OF, BAG_SHORT_DESC, type ItemCategory } from "@/lib/item-categories";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON, COIN_ICON } from "@/lib/app-icons";
import {
  SHOP_BUNDLES,
  bundleFaceValue,
  bundleSavingPct,
  itemTileTint,
  type ShopBundle,
} from "@/lib/shop-bundles";
import { ItemIcon } from "@/components/game-ui";
import { BagCapacityBar, BagOverflowPanel, DiscardItemButton } from "@/components/bag-overflow";
import { bagCapacity, bagUnitsUsed, isBagExempt } from "@/lib/store/slices/itemsSlice";
import { syncActivity } from "@/lib/social";
import { Button } from "@/components/ui/button";
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

type Category = ItemCategory;

/**
 * A horizontal ribbon tag, pinned to the card's top-right and running off the
 * edge.
 *
 * This was a 45° corner banner. A diagonal band across the top-right corner
 * cuts straight through the one column that has to stay readable — the price —
 * and no amount of padding fixes that without pushing the price off-centre.
 * Horizontal keeps the ribbon read (it still overhangs, and the card's
 * `overflow-hidden` still clips it) while confining it to a 22px strip the
 * price simply starts below.
 *
 * The left end is notched into a pennant by `clip-path` rather than rounded,
 * which is what separates "ribbon" from "chip that drifted into the corner".
 * The label is `font-extrabold`, not the pixel face — the pixel face has no
 * small size that stays legible.
 */
function RibbonTag({ label, bg }: { label: string; bg: string }) {
  return (
    <span
      className="pointer-events-none absolute -right-1 top-3 z-20 py-[5px] pl-4 pr-4 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-md"
      style={{
        background: bg,
        clipPath: "polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%)",
      }}
    >
      {label}
    </span>
  );
}

/**
 * Radiating light behind a product sprite.
 *
 * Two layers on purpose: a conic ray fan for the "burst", and a soft radial
 * glow to keep the rays from cutting hard edges across the artwork. Both are
 * pure CSS so they cost no image weight and inherit no colour of their own —
 * the caller supplies the tint, so the same burst works on a red card and a
 * purple one.
 */
function SpriteBurst({ tint = "rgba(255,255,255,0.5)" }: { tint?: string }) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 animate-[spin_18s_linear_infinite] rounded-full"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${tint} 0deg 6deg, transparent 6deg 16deg)`,
          maskImage: "radial-gradient(circle, #000 30%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(circle, #000 30%, transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[18%] rounded-full blur-md"
        style={{ background: tint }}
      />
    </>
  );
}

type ConfirmState = {
  item: ItemDef;
  cost: number;
  featured?: { originalCost: number; discountPct: number };
} | null;

function ShopPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const hydrated = useStoreHydrated();
  const navigate = useNavigate();
  const coins = useGameStore((s) => s.coins);
  const partner = useGameStore((s) => s.pokemon);
  const partnerAbilityId = useGameStore((s) => s.abilityId);
  // Metalworks ability: regular shop prices are 10% off (featured deals keep
  // their own bigger discount).
  const metalworks = !!partner && getAbility(partner.types, partnerAbilityId).id === "metalworks";
  const priceOf = (cost: number) => (metalworks ? Math.max(1, Math.round(cost * 0.9)) : cost);
  const inventory = useGameStore((s) => s.inventory);
  const buyItem = useGameStore((s) => s.buyItem);
  const buyBundle = useGameStore((s) => s.buyBundle);
  const purchasedBundleIds = useGameStore((s) => s.purchasedBundleIds);
  const featuredDealLastPurchase = useGameStore((s) => s.featuredDealLastPurchase);
  const markFeaturedDealPurchased = useGameStore((s) => s.markFeaturedDealPurchased);
  const applyItem = useGameStore((s) => s.useItem);
  const autoItems = useGameStore((s) => s.autoItems);
  const dailyGiftLastClaim = useGameStore((s) => s.dailyGiftLastClaim);
  const dailyGiftStreak = useGameStore((s) => s.dailyGiftStreak);
  const dailyGiftFreezeUsedDate = useGameStore((s) => s.dailyGiftFreezeUsedDate);
  const claimDailyGift = useGameStore((s) => s.claimDailyGift);
  const [giftNow, setGiftNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setGiftNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const giftToday = new Date(giftNow).toISOString().slice(0, 10);
  const giftClaimable = dailyGiftLastClaim !== giftToday;
  // Shared with Home's strip, and aware of the weekly forgiven miss — a streak
  // the freeze can still rescue must keep its pips lit, or the player sees it
  // "reset" and stops trying a day before it would have been saved.
  const giftLit = litGiftPips({
    lastClaim: dailyGiftLastClaim,
    streak: dailyGiftStreak,
    freezeUsedDate: dailyGiftFreezeUsedDate,
    today: giftToday,
  });
  const giftNextDay = (giftLit % 7) + 1;
  const giftMsToNext =
    Date.UTC(
      new Date(giftNow).getUTCFullYear(),
      new Date(giftNow).getUTCMonth(),
      new Date(giftNow).getUTCDate() + 1,
    ) - giftNow;
  const giftClock = `${Math.floor(giftMsToNext / 3_600_000)}h ${String(Math.floor((giftMsToNext % 3_600_000) / 60_000)).padStart(2, "0")}m`;
  function handleClaimGift() {
    const res = claimDailyGift();
    if (!res) return;
    void syncActivity("last_gift_claim");
    const it = ITEMS.find((x) => x.id === res.itemId);
    if (res.shiny) {
      toast.success(
        `Day 7 reward! ${res.qty}× ${it?.name ?? "item"} — your next battle win is a guaranteed shiny!`,
      );
    } else {
      toast.success(`Daily Gift opened: ${res.qty}× ${it?.name ?? "item"}`);
    }
    // Worth its own toast: the player is about to see a streak number that
    // arithmetic says should have reset, and an unexplained one reads as a bug.
    if (res.usedFreeze) {
      toast.success("Streak saved", {
        description: "You missed a day — this one's forgiven. One free miss a week.",
      });
    }
    if (res.comebackCoins > 0) {
      toast.success(`Welcome back! +${res.comebackCoins} coins`, {
        description: "Good to see you again.",
      });
    }
  }
  const toggleAutoItem = useGameStore((s) => s.toggleAutoItem);

  const [tab, setTab] = useState<Category>("HEALING");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [bundleConfirm, setBundleConfirm] = useState<ShopBundle | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [qty, setQty] = useState(1);

  const totalItems = useMemo(
    () => Object.values(inventory).reduce((a, b) => a + (b ?? 0), 0),
    [inventory],
  );

  const featured = useMemo(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    // Berries are Nearby-Battle-only drops; never feature them in the Solo shop.
    const shoppable = ITEMS.filter((it) => !it.pvpOnly);
    const item = shoppable[day % shoppable.length];
    const steps = [20, 25, 30, 35, 40, 45, 50];
    const discountPct = steps[day % steps.length];
    const discountedCost = Math.max(1, Math.round((item.cost * (100 - discountPct)) / 100));
    return { item, originalCost: item.cost, discountedCost, discountPct };
  }, []);

  useEffect(() => {
    if (hydrated && !hasOnboarded) navigate({ to: "/" });
  }, [hydrated, hasOnboarded, navigate]);

  useEffect(() => {
    if (confirmState) setQty(1);
  }, [confirmState]);

  if (!hydrated || !hasOnboarded) return null;

  const items = ITEMS.filter((it) => CATEGORY_OF[it.id] === tab);

  // The discounted featured item is limited to one purchase per day.
  const todayISO = new Date().toISOString().slice(0, 10);
  const featuredUsedToday = featuredDealLastPurchase === todayISO;

  function confirmBundle() {
    if (!bundleConfirm) return;
    const b = bundleConfirm;
    const ok = buyBundle(b.id);
    if (!ok) {
      playSfx("error");
      const st = useGameStore.getState();
      // Same two-reason split as confirmPurchase: saying "Coins" when the bag
      // was the problem sends the player to the wrong screen.
      toast.error(
        st.coins < b.cost
          ? `Need ${b.cost.toLocaleString()} Coins for the ${b.name}.`
          : "Your bag can't hold the whole bundle. Make room and try again.",
      );
      setBundleConfirm(null);
      return;
    }
    playSfx("purchase");
    toast.success(`${b.name} unlocked!`, {
      description: b.contents
        .map((c) => `${c.qty}× ${ITEMS.find((i) => i.id === c.id)?.name ?? c.id}`)
        .join(", "),
    });
    setBundleConfirm(null);
  }

  function confirmPurchase() {
    if (!confirmState) return;
    const { item, cost } = confirmState;
    // Featured deal: always a single unit, and only once per day.
    const isFeatured = !!confirmState.featured;
    if (isFeatured && featuredUsedToday) {
      playSfx("error");
      toast.error("You've already grabbed today's deal — check back tomorrow!");
      setConfirmState(null);
      return;
    }
    const buyQty = isFeatured ? 1 : qty;
    let bought = 0;
    for (let i = 0; i < buyQty; i++) {
      const ok = buyItem(item.id as never, cost);
      if (!ok) break;
      bought++;
    }
    // buyItem refuses for two different reasons now, and saying "Coins" when the
    // bag was the problem sends the player to the wrong screen.
    const st = useGameStore.getState();
    const outOfSpace =
      !isBagExempt(item.id) && bagUnitsUsed(st.inventory) >= bagCapacity(st.bagUpgrades);
    if (bought === 0) {
      playSfx("error");
      toast.error(
        outOfSpace
          ? `Your bag is full. Discard something or buy more bag space.`
          : `Need ${cost * buyQty} Coins to buy ${buyQty}× ${item.name}.`,
      );
    } else {
      playSfx("purchase");
      if (isFeatured) markFeaturedDealPurchased();
      toast.success(
        bought < buyQty
          ? `Bought ${bought}× ${item.name} (${outOfSpace ? "bag is full" : "ran out of Coins"}).`
          : `Bought ${buyQty}× ${item.name}!`,
      );
    }
    setConfirmState(null);
  }

  const ownedInBag = ITEMS.filter((it) => (inventory[it.id] ?? 0) > 0);

  function handleUseFromBag(it: ItemDef) {
    const ok = applyItem(it.id);
    if (!ok) {
      playSfx("error");
      toast.error(
        it.id === "luckyegg"
          ? "Lucky Egg can only be used once per week."
          : it.id === "bignugget"
            ? "Big Nugget requires a fully evolved partner."
            : `Can't use ${it.name} right now.`,
      );
      return;
    }
    if (it.id === "potion" || it.id === "superpotion" || it.id === "maxpotion") playItemCue();
    else playSfx("item_use");
    if (it.id === "candy") toast.success("+50 TP added to your partner!");
    else if (it.id === "luckyegg") toast.success("2× XP active for 24 hours!");
    else if (it.id === "bignugget") toast.success("TP → coins for the next 3 days!");
    else toast.success(`Used ${it.name}!`);
  }

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      {/* Hero */}
      <div className="px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <p className="font-pixel-xs text-primary">WELCOME TO</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="font-display-xl text-foreground">PokéMart</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                playSfx("bag_open");
                setBagOpen(true);
              }}
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
              <AppIcon src={COIN_ICON} alt="Coins" className="h-5 w-5" />
              <span className="text-sm font-extrabold text-foreground">
                {coins.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-8 pt-2">
        {/* Daily Gift */}
        {giftClaimable ? (
          <button
            onClick={handleClaimGift}
            className="relative mb-5 flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#F2D64E] to-[#E8A93C] p-5 text-left shadow-card active:scale-[0.99]"
          >
            <span className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 font-pixel-xs uppercase text-white shadow-sm">
              Free
            </span>
            <div className="shrink-0 drop-shadow">
              <AppIcon src={UI_ICON.dailyGift} className="h-12 w-12" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-pixel-xs uppercase text-foreground/70">
                Daily Gift · Day {giftNextDay}
              </div>
              <div className="text-lg font-extrabold leading-tight text-foreground">
                Tap to open your free item!
              </div>
              <div className="mt-2.5 flex items-center gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => {
                  const day = i + 1;
                  const filled = day <= giftLit;
                  const active = day === giftNextDay;
                  return (
                    <div
                      key={day}
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${filled ? "bg-primary text-white" : active ? "bg-white text-primary ring-2 ring-primary" : "bg-black/10 text-foreground/40"}`}
                    >
                      {day === 7 ? "★" : day}
                    </div>
                  );
                })}
              </div>
            </div>
          </button>
        ) : (
          <div className="relative mb-5 flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-card p-5 shadow-card">
            <div className="shrink-0 opacity-40 grayscale">
              <AppIcon src={UI_ICON.dailyGift} className="h-12 w-12" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-pixel-xs uppercase text-foreground/55">
                Daily Gift · claimed today
              </div>
              <div className="text-lg font-extrabold leading-tight text-foreground/70">
                Next gift in {giftClock}
              </div>
              <div className="mt-2.5 flex items-center gap-1.5">
                {Array.from({ length: 7 }).map((_, i) => {
                  const day = i + 1;
                  const filled = day <= giftLit;
                  return (
                    <div
                      key={day}
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${filled ? "bg-primary text-white" : "bg-black/10 text-foreground/40"}`}
                    >
                      {day === 7 ? "★" : day}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Featured — single discounted item, one purchase per day. Once
            bought, the big card collapses to a slim note so the catalog below
            isn't pushed down by a spent deal. */}
        {featuredUsedToday ? (
          <div className="mb-5 flex items-center justify-center gap-2 rounded-full bg-poke-dark/10 px-4 py-2 text-xs font-bold text-foreground/60">
            <Star className="h-3.5 w-3.5" />
            Daily deal claimed — a new deal lands tomorrow
          </div>
        ) : (
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
            className="relative mb-3 flex w-full items-center gap-3 overflow-hidden rounded-3xl border-2 border-white bg-gradient-to-br from-primary to-[#b5341f] p-3 pl-2 text-left shadow-card transition-transform duration-100 active:scale-[0.98] disabled:opacity-60"
          >
            <RibbonTag label="Weekly Special" bg="#5B3F95" />
            <span className="absolute left-3 top-3 z-20 rounded-full bg-poke-yellow px-2.5 py-1 font-pixel-xs uppercase leading-none text-foreground shadow-sm">
              {featured.discountPct}% Off
            </span>
            {/* The sprite leads. It was 56px inside an 80px chip beside a
                display-lg title, so the title won a card whose whole job is to
                sell a piece of art.

                It stood on a white-rimmed disc for a while. The disc drew a
                hard edge right where the burst is meant to fade out, so the two
                fought and the sprite ended up sitting in a bubble. The burst
                and the ground shadow do the staging on their own. */}
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
              <SpriteBurst tint="rgba(255,214,120,0.55)" />
              <div
                aria-hidden
                className="absolute bottom-2 h-6 w-20 rounded-[50%] bg-black/25 blur-[3px]"
              />
              <ItemIcon item={featured.item} className="relative h-20 w-20 drop-shadow-lg" />
            </div>
            <div className="min-w-0 flex-1 pt-4">
              <div className="font-display-md text-white">{featured.item.name}</div>
              <div className="mt-1 line-clamp-3 text-[11px] leading-snug text-white/85">
                {featured.item.desc}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 pt-7">
              <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold text-primary">
                <AppIcon src={COIN_ICON} alt="" className="h-4 w-4" />
                {featured.discountedCost.toLocaleString()}
              </span>
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold text-white/60 line-through">
                {featured.originalCost.toLocaleString()}
              </span>
            </div>
          </button>
        )}

        {/* Bundle — one purchase, several items, priced under their combined
            shelf value. The catalog sells one thing at a time, which makes a
            new trainer's first visit a series of small decisions with no
            obvious starting point. See lib/shop-bundles.ts for the pricing. */}
        {SHOP_BUNDLES.filter((b) => !purchasedBundleIds.includes(b.id)).map((bundle) => (
          <button
            key={bundle.id}
            onClick={() => setBundleConfirm(bundle)}
            className="relative mb-5 flex w-full items-center gap-3 overflow-hidden rounded-3xl border-2 border-white bg-gradient-to-br from-[#6B4FA0] to-[#3F2A6E] p-3 text-left shadow-card transition-transform duration-100 active:scale-[0.98]"
          >
            <RibbonTag label={bundle.ribbon} bg="var(--brand-red, #E3350D)" />
            {/* Bare overlapping sprites on one shared burst. Each used to sit in
                its own bordered disc, which read as three separate buttons
                rather than as one pile of loot. */}
            <div className="relative flex h-24 w-[92px] shrink-0 items-center justify-center">
              <SpriteBurst tint="rgba(214,180,255,0.5)" />
              <div className="relative flex items-center -space-x-4">
                {bundle.contents.slice(0, 3).map((c) => {
                  const def = ITEMS.find((i) => i.id === c.id);
                  return def ? (
                    <ItemIcon key={c.id} item={def} className="h-11 w-11 drop-shadow-lg" />
                  ) : null;
                })}
              </div>
            </div>
            <div className="min-w-0 flex-1 pt-3">
              <div className="text-[15px] font-extrabold leading-tight text-white">
                {bundle.name}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/80">
                {bundle.tagline}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {bundle.contents.map((c) => {
                  const def = ITEMS.find((i) => i.id === c.id);
                  return def ? (
                    <span
                      key={c.id}
                      className="flex items-center gap-0.5 text-[10px] font-bold text-white/90"
                    >
                      <ItemIcon item={def} className="h-3.5 w-3.5" />×{c.qty}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 pt-7">
              <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold text-[#3F2A6E]">
                <AppIcon src={COIN_ICON} alt="" className="h-4 w-4" />
                {bundle.cost.toLocaleString()}
              </span>
            </div>
          </button>
        ))}

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
          /* Four to a row, scrolling vertically. The old one-per-row list spent
             a full 96px band per item on a 16px sprite and a description most
             players already know — at four across the sprite is the row, which
             is what a shop shelf should be. Descriptions truncate to two lines
             here; the full text is on the buy sheet, one tap away.

             Rarity groupings are deliberately absent: the catalog has no rarity
             concept, and inventing one would be a game-design claim dressed as
             a colour. The tints are per-item and mean nothing beyond telling
             four tiles apart. */
          <div className="grid grid-cols-3 gap-2.5">
            {items.map((item, i) => {
              const owned = inventory[item.id] ?? 0;
              const canAfford = coins >= priceOf(item.cost);
              return (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.03 }}
                  onClick={() => setConfirmState({ item, cost: priceOf(item.cost) })}
                  className={`relative flex flex-col items-center rounded-2xl border-2 p-2 pt-2.5 text-center shadow-card transition-transform duration-100 active:scale-[0.96] ${
                    item.premium ? "border-poke-yellow" : "border-white"
                  }`}
                  style={{
                    // Tint at the top fading to white, so the sprite sits on
                    // colour and the text below sits on paper.
                    background: `linear-gradient(180deg, ${itemTileTint(item.id)} 0%, #fff 78%)`,
                  }}
                >
                  {/* Premium is the gold rim, not a badge. The star sat in the
                      top-right corner over the tile's own tint, which is where
                      the eye goes first — so a decoration outranked the item
                      art. Recolouring the border the tile already has says the
                      same thing using none of the tile's space. */}
                  <ItemIcon item={item} className="h-16 w-16 drop-shadow-sm" />
                  <div className="mt-1.5 line-clamp-2 text-[11px] font-extrabold leading-tight text-foreground">
                    {item.name}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[9px] leading-tight text-foreground/55">
                    {item.desc}
                  </div>
                  {/* Owned always renders, even at zero. It used to appear only
                      when held, which moved the price up and down between tiles
                      in the same row and left the two colliding. */}
                  <span className="mb-1.5 mt-2 rounded-full bg-black/[0.07] px-2 py-0.5 font-pixel-xs text-[8px] leading-none text-foreground/60">
                    OWNED ×{owned}
                  </span>
                  <span
                    className={`mt-auto flex w-full items-center justify-center gap-1 rounded-full px-1 py-1.5 text-[11px] font-extrabold ${
                      canAfford
                        ? "bg-white text-foreground shadow-sm"
                        : "bg-black/10 text-foreground/40"
                    }`}
                  >
                    <AppIcon src={COIN_ICON} alt="" className="h-3.5 w-3.5" />
                    {priceOf(item.cost).toLocaleString()}
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bundle confirmation. Its own sheet rather than a mode of the item
          sheet: there is no quantity stepper (a bundle is bought whole) and
          the body is a contents manifest, not one item's description. */}
      <Sheet open={!!bundleConfirm} onOpenChange={(o) => !o && setBundleConfirm(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          {bundleConfirm && (
            <>
              <SheetHeader>
                <SheetTitle>{bundleConfirm.name}</SheetTitle>
                <SheetDescription>{bundleConfirm.tagline}</SheetDescription>
              </SheetHeader>
              <div className="mt-3 flex flex-col gap-2">
                {bundleConfirm.contents.map((c) => {
                  const def = ITEMS.find((i) => i.id === c.id);
                  if (!def) return null;
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 rounded-2xl bg-poke-dark/5 p-2.5"
                    >
                      <ItemIcon item={def} className="h-9 w-9 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-foreground">{def.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{def.desc}</div>
                      </div>
                      <span className="shrink-0 font-pixel-xs text-foreground/70">×{c.qty}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-2xl bg-poke-yellow/15 px-3 py-2">
                <span className="text-xs font-bold text-foreground/70">
                  Worth {bundleFaceValue(bundleConfirm).toLocaleString()} separately
                </span>
                <span className="font-pixel-xs text-primary">
                  SAVE {bundleSavingPct(bundleConfirm)}%
                </span>
              </div>
              <Button
                size="lg"
                onClick={confirmBundle}
                disabled={coins < bundleConfirm.cost}
                className="mt-4 h-12 w-full rounded-full text-base font-bold"
              >
                <AppIcon src={COIN_ICON} alt="" className="mr-2 h-5 w-5" />
                {coins < bundleConfirm.cost
                  ? "Not enough Coins"
                  : `Buy for ${bundleConfirm.cost.toLocaleString()}`}
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>

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
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {confirmState.item.desc}
                  </div>
                </div>
              </div>

              {/* Featured discount note (only for featured) */}
              {confirmState.featured && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-poke-yellow px-3 py-1 font-pixel-xs uppercase text-foreground">
                  Discounted {confirmState.featured.discountPct}% off
                </div>
              )}

              {/* Quantity stepper — hidden for the featured deal (one per day) */}
              {!confirmState.featured &&
                (() => {
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
                        <span className="w-6 text-center text-lg font-extrabold tabular-nums text-foreground">
                          {qty}
                        </span>
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
                      <span className="font-bold text-foreground tabular-nums">
                        {coins.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Cost</span>
                      <span className="font-bold text-primary tabular-nums">
                        −{totalCost.toLocaleString()}
                      </span>
                    </div>
                    <div className="border-t border-dashed border-border pt-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">Balance after</span>
                        <span
                          className={`font-extrabold tabular-nums ${canAfford ? "text-hp-good" : "text-destructive"}`}
                        >
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
            const bagGroups = CATEGORIES.map((cat) => ({
              ...cat,
              items: ITEMS.filter(
                (it) => CATEGORY_OF[it.id] === cat.id && (inventory[it.id] ?? 0) > 0,
              ),
            })).filter((g) => g.items.length > 0);
            // Berries are Nearby-Battle-only, excluded from the shop categories;
            // surface them here read-only so players can see what they're holding.
            const ownedBerries = ITEMS.filter((it) => it.isBerry && (inventory[it.id] ?? 0) > 0);
            return (
              <div className="my-4 max-h-[65vh] space-y-3 overflow-y-auto">
                <BagCapacityBar />
                <BagOverflowPanel />
                {ownedInBag.length === 0 ? (
                  <div className="rounded-3xl bg-poke-yellow/15 p-6 text-center">
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
                            const isUsable =
                              it.id === "candy" || it.id === "luckyegg" || it.id === "bignugget";
                            const isAuto =
                              it.id === "focusband" ||
                              it.id === "quickclaw" ||
                              it.id === "assaultvest" ||
                              it.id === "revive" ||
                              it.id === "oranberry" ||
                              it.id === "silkscarf" ||
                              it.id === "kingsrock" ||
                              it.id === "leftovers" ||
                              it.id === "metronome";
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
                                        autoOn
                                          ? "bg-hp-good text-white"
                                          : "bg-muted text-foreground/50"
                                      }`}
                                    >
                                      {autoOn ? "Auto: On" : "Auto: Off"}
                                    </button>
                                  )}
                                  <DiscardItemButton id={it.id} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {ownedBerries.length > 0 && (
                      <div>
                        <div className="mb-2 font-pixel-xs uppercase tracking-wider text-foreground/45">
                          Berries · PvP
                        </div>
                        <div className="flex flex-col gap-2.5">
                          {ownedBerries.map((it) => (
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
                                <div className="mt-0.5 text-xs leading-snug text-foreground/55">
                                  {it.desc}
                                </div>
                              </div>
                              <span className="shrink-0 font-pixel-xs text-foreground">
                                ×{inventory[it.id] ?? 0}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="rounded-2xl bg-poke-blue/10 px-4 py-3 text-xs leading-snug text-foreground/70">
                      Battle items appear in your item dock during a match. Berries are used only in
                      PvP.
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
