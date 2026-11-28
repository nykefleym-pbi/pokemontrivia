import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { playSfx, playItemCue } from "@/lib/audio";
import { NaIcon } from "@/components/na/icon";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaStatPill } from "@/components/na/top-bar";
import { NaGlassRow } from "@/components/na/celebration";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaButton } from "@/components/na/button";
import { NaSheet } from "@/components/na/sheet";
import { NaOfflineRow } from "@/components/na/offline-row";
import { useGameStore } from "@/lib/store";
import { useDailyGift } from "@/lib/use-daily-gift";
import { useStoreHydrated } from "@/lib/store-hydration";
import { ITEMS, type ItemDef } from "@/lib/game-data";
import { getAbility } from "@/lib/abilities";
import { CATEGORIES, CATEGORY_OF, type ItemCategory } from "@/lib/item-categories";
import {
  SHOP_BUNDLES,
  bundleFaceValue,
  bundleSavingPct,
  type ShopBundle,
} from "@/lib/shop-bundles";
import { ItemIcon } from "@/components/game-ui";
import { BagCapacityBar, BagOverflowPanel, DiscardItemButton } from "@/components/bag-overflow";
import { bagCapacity, bagUnitsUsed, isBagExempt } from "@/lib/store/slices/itemsSlice";

export const Route = createFileRoute("/shop")({
  head: () => pageHead("/shop"),
  component: ShopPage,
});

type Category = ItemCategory;

/** Bag items that fire by themselves in battle; the bag lets you switch each off. */
const AUTO_ITEMS = new Set(["focusband", "quickclaw", "assaultvest", "revive", "oranberry", "silkscarf", "kingsrock", "leftovers", "metronome"]);

/** "5 Potions, 2 Super Potions, a Revive and an Escape Rope" (Oxford comma off for two). */
function bundleContents(b: ShopBundle): string {
  const parts = b.contents.map((c) => {
    const name = ITEMS.find((i) => i.id === c.id)?.name ?? c.id;
    return c.qty > 1 ? `${c.qty} ${name}s` : `${/^[AEIOU]/i.test(name) ? "an" : "a"} ${name}`;
  });
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")}${parts.length > 2 ? "," : ""} and ${parts[parts.length - 1]}`;
}

/** Figma "Shop item": the item on a dark tile, name, what it does, an optional meter, and its price. */
function ShopRow({
  icon,
  name,
  sub,
  price,
  progress,
  short,
  dim,
  onClick,
}: {
  icon: React.ReactNode;
  name: string;
  sub: string;
  price?: number;
  progress?: number;
  /** Not enough coins: the price dims. */
  short?: boolean;
  dim?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`na-glass flex w-full items-center gap-3 rounded-[18px] p-3 text-left ${dim ? "opacity-55" : ""}`}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-night-deep/60">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="na-headline text-foreground">{name}</span>
        <span className="na-caption text-text-secondary">{sub}</span>
        {progress != null && (
          <span className="block h-2 w-full overflow-hidden rounded bg-night-deep">
            <span className="na-fill-gold block h-full rounded" style={{ width: `${Math.max(2, Math.min(100, progress * 100))}%` }} />
          </span>
        )}
      </span>
      {price != null && (
        <span className={`flex shrink-0 items-center gap-1.5 rounded-xl bg-night-card-2 px-3 py-2 shadow-[0_4px_0_#141A3F] ${short ? "opacity-60" : ""}`}>
          <NaRewardIcon kind="Coin" size={20} />
          <span className="na-number-m text-foreground">{price.toLocaleString()}</span>
        </span>
      )}
    </button>
  );
}

/** The four categories as a glass pill strip; the open one is white. */
function NaTabs({ value, onChange }: { value: Category; onChange: (c: Category) => void }) {
  return (
    <div role="tablist" className="flex gap-1 rounded-full bg-white/[0.08] p-1">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={value === c.id}
          onClick={() => onChange(c.id)}
          className={`na-body-strong flex-1 rounded-full px-1 py-2 ${value === c.id ? "bg-[#f4f6ff] text-night-base" : "text-text-secondary"}`}
        >
          {c.label}
        </button>
      ))}
    </div>
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
  // Shared with the gift chest on the Home route (Figma 2.5).
  const {
    now: giftNow,
    claimable: giftClaimable,
    nextDay: giftNextDay,
    clock: giftClock,
    claim: handleClaimGift,
  } = useDailyGift();
  const toggleAutoItem = useGameStore((s) => s.toggleAutoItem);

  const [tab, setTab] = useState<Category>("HEALING");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [bundleConfirm, setBundleConfirm] = useState<ShopBundle | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [bagTab, setBagTab] = useState<Category>("HEALING");
  const [qty, setQty] = useState(1);
  const [short, setShort] = useState<{ item: ItemDef; cost: number } | null>(null);
  /** 17.1 when you can pay for one, 17.2 when you cannot. */
  const openBuy = (s: NonNullable<ConfirmState>) => (s.cost > coins ? setShort({ item: s.item, cost: s.cost }) : setConfirmState(s));

  const totalItems = useMemo(
    () => Object.values(inventory).reduce((a, b) => a + (b ?? 0), 0),
    [inventory],
  );

  // Keyed on the day, not on mount. `useMemo(..., [])` meant the deal was fixed
  // for the life of the mount: this is an installed PWA that people leave open,
  // so a session opened before the rollover kept showing yesterday's item
  // indefinitely — which is what "the discounted item is not changing" was.
  // `giftNow` already ticks once a second for the gift countdown, so this rides
  // it rather than adding a second timer.
  const featuredDay = Math.floor(giftNow / 86_400_000);
  const featured = useMemo(() => {
    const day = featuredDay;
    // Berries are Nearby-Battle-only drops; never feature them in the Solo shop.
    const shoppable = ITEMS.filter((it) => !it.pvpOnly);
    const item = shoppable[day % shoppable.length];
    const steps = [20, 25, 30, 35, 40, 45, 50];
    const discountPct = steps[day % steps.length];
    const discountedCost = Math.max(1, Math.round((item.cost * (100 - discountPct)) / 100));
    return { item, originalCost: item.cost, discountedCost, discountPct };
  }, [featuredDay]);

  useEffect(() => {
    if (hydrated && !hasOnboarded) navigate({ to: "/" });
  }, [hydrated, hasOnboarded, navigate]);

  useEffect(() => {
    if (confirmState) setQty(1);
  }, [confirmState]);

  if (!hydrated || !hasOnboarded) return null;

  const items = ITEMS.filter((it) => CATEGORY_OF[it.id] === tab);
  // The cheapest shop item you can't afford yet: the "Almost yours" row.
  const almost = ITEMS.filter((it) => !it.pvpOnly && CATEGORY_OF[it.id] && priceOf(it.cost) > coins).sort((a, b) => a.cost - b.cost)[0];

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
    <div className="h-full w-full overflow-y-auto pb-nav safe-x">
      <div className="flex flex-col gap-3.5 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+8px)]">
        {/* Header (7.1): SHOP, the Bag button with what you own, your coins. */}
        <div className="flex items-center gap-2">
          <h1 className="na-display-m flex-1 text-foreground">SHOP</h1>
          <button
            type="button"
            onClick={() => {
              playSfx("bag_open");
              setBagOpen(true);
            }}
            aria-label="Open bag"
            className="press relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night-card-2 shadow-[0_4px_0_#141A3F]"
          >
            <NaGlossIcon kind="bag" size={22} />
            {totalItems > 0 && (
              <span className="na-label absolute left-7 top-[-3px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-foreground">
                {totalItems}
              </span>
            )}
          </button>
          <NaStatPill kind="Coin" value={coins.toLocaleString()} />
        </div>
        <NaOfflineRow />

        {/* The daily gift (also on Home's chest). */}
        <NaGlassRow
          tone={giftClaimable ? "gold" : undefined}
          lead={
            <span className={giftClaimable ? "animate-wiggle" : "opacity-40 grayscale"}>
              <NaRewardIcon kind="Gift" size={44} />
            </span>
          }
          title={giftClaimable ? "Your daily gift is ready" : `Next gift in ${giftClock}`}
          sub={`Day ${giftNextDay} of 7`}
          trailing={
            giftClaimable ? (
              <NaButton kind="gold" size="M" onClick={handleClaimGift}>
                Open
              </NaButton>
            ) : undefined
          }
        />

        {/* Lead with something within reach (7.1 note 2). */}
        {almost && (
          <>
            <span className="na-label uppercase text-text-secondary">Almost yours</span>
            <ShopRow
              icon={<ItemIcon item={almost} className="h-[46px] w-[46px]" />}
              name={almost.name}
              sub={`Earn ${(priceOf(almost.cost) - coins).toLocaleString()} more coins to buy it!`}
              progress={coins / priceOf(almost.cost)}
              onClick={() => openBuy({ item: almost, cost: priceOf(almost.cost) })}
            />
          </>
        )}

        <span className="na-label uppercase text-text-secondary">Weekly deals</span>
        <ShopRow
          icon={<ItemIcon item={featured.item} className="h-[46px] w-[46px]" />}
          name={`${featured.item.name} · ${featured.discountPct}% OFF`}
          sub={featuredUsedToday ? "Bought! A new deal lands tomorrow." : `Was ${featured.originalCost.toLocaleString()}. A new deal every day!`}
          price={featuredUsedToday ? undefined : featured.discountedCost}
          dim={featuredUsedToday}
          onClick={
            featuredUsedToday
              ? undefined
              : () =>
                  openBuy({
                    item: featured.item,
                    cost: featured.discountedCost,
                    featured: { originalCost: featured.originalCost, discountPct: featured.discountPct },
                  })
          }
        />
        {SHOP_BUNDLES.filter((b) => !purchasedBundleIds.includes(b.id)).map((bundle) => (
          <ShopRow
            key={bundle.id}
            icon={<NaRewardIcon kind="Chest" size={46} />}
            name={bundle.name}
            sub={bundleContents(bundle)}
            price={bundle.cost}
            onClick={() => setBundleConfirm(bundle)}
          />
        ))}

        <span className="na-label uppercase text-text-secondary">All items</span>
        <NaTabs value={tab} onChange={setTab} />
        {items.map((item) => (
          <ShopRow
            key={item.id}
            icon={<ItemIcon item={item} className="h-[46px] w-[46px]" />}
            name={item.name}
            sub={item.desc}
            price={priceOf(item.cost)}
            short={coins < priceOf(item.cost)}
            onClick={() => openBuy({ item, cost: priceOf(item.cost) })}
          />
        ))}
      </div>

      {/* Bundle: bought whole, so no stepper; the contents instead. */}
      <NaSheet
        open={!!bundleConfirm}
        onOpenChange={(o) => !o && setBundleConfirm(null)}
        title={bundleConfirm?.name ?? ""}
        body={bundleConfirm?.tagline}
        primary={
          bundleConfirm
            ? {
                label: coins < bundleConfirm.cost ? "Not enough coins" : `Buy for ${bundleConfirm.cost.toLocaleString()} Coins`,
                disabled: coins < bundleConfirm.cost,
                onClick: confirmBundle,
              }
            : undefined
        }
        secondary={{ label: "Cancel", onClick: () => setBundleConfirm(null) }}
      >
        {bundleConfirm?.contents.map((c) => {
          const def = ITEMS.find((i) => i.id === c.id);
          if (!def) return null;
          return <NaGlassRow key={c.id} lead={<ItemIcon item={def} className="h-9 w-9" />} title={def.name} sub={def.desc} trailing={<span className="na-number-m text-text-secondary">×{c.qty}</span>} />;
        })}
        {bundleConfirm && (
          <div className="flex items-center justify-between px-1">
            <span className="na-body text-text-secondary">Worth {bundleFaceValue(bundleConfirm).toLocaleString()} separately</span>
            <span className="na-number-m text-success">Save {bundleSavingPct(bundleConfirm)}%</span>
          </div>
        )}
      </NaSheet>

      {/* 17.1 Buy: the item, how many, the cost and what you have left. */}
      {(() => {
        const unitCost = confirmState?.cost ?? 0;
        const totalCost = unitCost * qty;
        const balanceAfter = coins - totalCost;
        const canAfford = balanceAfter >= 0;
        const maxQty = unitCost > 0 ? Math.max(1, Math.floor(coins / unitCost)) : 1;
        const line = (label: string, value: string, valueClass: string, strong?: boolean) => (
          <div className="flex items-center justify-between">
            <span className={strong ? "na-body-strong text-foreground" : "na-body text-text-secondary"}>{label}</span>
            <span className={`na-number-m ${valueClass}`}>{value}</span>
          </div>
        );
        return (
          <NaSheet
            open={!!confirmState}
            onOpenChange={(o) => !o && setConfirmState(null)}
            title={confirmState?.item.name ?? ""}
            hideTitle
            primary={{ label: `Confirm — ${totalCost.toLocaleString()} Coins`, disabled: !canAfford, onClick: confirmPurchase }}
            secondary={{ label: "Cancel", onClick: () => setConfirmState(null) }}
          >
            {confirmState && (
              <>
                <div className="flex items-center gap-3.5">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] bg-reward-gold/[0.16]">
                    <ItemIcon item={confirmState.item} className="h-11 w-11" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="na-title text-foreground">{confirmState.item.name}</span>
                    <span className="na-caption text-text-secondary">{confirmState.item.desc}</span>
                  </span>
                </div>
                {confirmState.featured ? (
                  <span className="na-label self-start rounded-full bg-reward-gold px-3 py-1 uppercase text-night-deep">
                    {confirmState.featured.discountPct}% off · one a day
                  </span>
                ) : (
                  <div className="flex items-center justify-between rounded-[16px] bg-white/10 px-3.5 py-2.5">
                    <span className="na-body-strong text-foreground">Quantity</span>
                    <span className="flex items-center gap-4">
                      <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="na-headline flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.16] text-foreground disabled:opacity-40">
                        −
                      </button>
                      <span className="na-number-l w-6 text-center text-foreground">{qty}</span>
                      <button type="button" aria-label="Increase quantity" disabled={qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="na-headline flex h-9 w-9 items-center justify-center rounded-full bg-brand-red text-foreground disabled:opacity-40">
                        +
                      </button>
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {line("Your Coins", coins.toLocaleString(), "text-foreground")}
                  {line("Cost", `−${totalCost.toLocaleString()}`, "text-brand-red-light")}
                  <div className="h-px bg-white/[0.16]" />
                  {line("Balance after", `${balanceAfter.toLocaleString()} Coins`, canAfford ? "text-success" : "text-danger", true)}
                </div>
              </>
            )}
          </NaSheet>
        );
      })()}

      {/* 17.2 Not enough coins: how many more, and three ways to earn them. */}
      <NaSheet
        open={!!short}
        onOpenChange={(o) => !o && setShort(null)}
        title="Need more coins!"
        body={short ? `You need ${(short.cost - coins).toLocaleString()} more coins for ${/^[aeiou]/i.test(short.item.name) ? "an" : "a"} ${short.item.name}!` : undefined}
        primary={{ label: "Battle now", onClick: () => void navigate({ to: "/battle", search: { autostart: 1 } as never }) }}
        secondary={{ label: "Maybe Later", onClick: () => setShort(null) }}
      >
        <NaGlassRow lead={<NaIcon name="arena" size={32} />} title="Win a battle" sub="Every win earns coins!" onClick={() => void navigate({ to: "/battle", search: { autostart: 1 } as never })} />
        <NaGlassRow lead={<NaGlossIcon kind="calendar" size={32} />} title="Play the Daily Quest" sub="New quests every day!" onClick={() => void navigate({ to: "/battle", search: { mode: "daily" } as never })} />
        <NaGlassRow
          lead={<NaRewardIcon kind="Gift" size={32} />}
          title="Claim your daily gift"
          sub={giftClaimable ? `Day ${giftNextDay} of 7 is ready!` : `Next gift in ${giftClock}`}
          onClick={
            giftClaimable
              ? () => {
                  setShort(null);
                  handleClaimGift();
                }
              : undefined
          }
        />
      </NaSheet>

      {/* 7.1c Your bag: what you own and what it does, grouped like the shop. */}
      {bagOpen && (
        <div className="na-bg-night fixed inset-0 z-50 flex flex-col overflow-y-auto pt-[env(safe-area-inset-top)]">
          <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
            <button type="button" aria-label="Back" onClick={() => setBagOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-foreground">
              <NaIcon name="arrow-left" size={20} />
            </button>
            <h1 className="na-display-s flex-1 text-foreground">Your bag</h1>
          </div>
          <div className="flex flex-1 flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
            <BagCapacityBar />
            <BagOverflowPanel />
            <NaTabs value={bagTab} onChange={setBagTab} />
            {(() => {
              const owned = ITEMS.filter((it) => CATEGORY_OF[it.id] === bagTab && (inventory[it.id] ?? 0) > 0);
              if (owned.length === 0) return <p className="na-body py-6 text-center text-text-secondary">Nothing here yet!</p>;
              return owned.map((it) => {
                const n = inventory[it.id] ?? 0;
                const usable = it.id === "candy" || it.id === "luckyegg" || it.id === "bignugget";
                const auto = AUTO_ITEMS.has(it.id);
                const autoOn = autoItems[it.id] !== false;
                return (
                  <div key={it.id} className="flex items-center gap-3 rounded-[18px] bg-white/[0.08] p-3">
                    <ItemIcon item={it} className="h-11 w-11 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="na-body-strong text-foreground">{it.name}</span>
                      <span className="na-caption text-text-secondary">{it.desc}</span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="na-number-m text-foreground">×{n}</span>
                      {usable ? (
                        <button type="button" onClick={() => handleUseFromBag(it)} className="na-label rounded-full bg-primary px-3 py-1 text-foreground">
                          USE
                        </button>
                      ) : auto ? (
                        <button
                          type="button"
                          aria-pressed={autoOn}
                          onClick={() => toggleAutoItem(it.id)}
                          className={`na-label rounded-full px-2.5 py-1 ${autoOn ? "bg-success/20 text-success" : "bg-white/10 text-text-muted"}`}
                        >
                          {autoOn ? "AUTO: ON" : "AUTO: OFF"}
                        </button>
                      ) : (
                        <span className="na-label text-text-muted">IN BATTLE</span>
                      )}
                    </div>
                    <DiscardItemButton id={it.id} />
                  </div>
                );
              });
            })()}
            {ITEMS.some((it) => it.isBerry && (inventory[it.id] ?? 0) > 0) && (
              <>
                <span className="na-label uppercase text-text-secondary">Berries · battles against other trainers</span>
                {ITEMS.filter((it) => it.isBerry && (inventory[it.id] ?? 0) > 0).map((it) => (
                  <div key={it.id} className="flex items-center gap-3 rounded-[18px] bg-white/[0.08] p-3">
                    <ItemIcon item={it} className="h-11 w-11 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="na-body-strong text-foreground">{it.name}</span>
                      <span className="na-caption text-text-secondary">{it.desc}</span>
                    </div>
                    <span className="na-number-m shrink-0 text-foreground">×{inventory[it.id] ?? 0}</span>
                  </div>
                ))}
              </>
            )}
            <div className="min-h-2 flex-1" />
            <NaButton kind="secondary" block onClick={() => setBagOpen(false)}>
              Explore the Shop
            </NaButton>
          </div>
        </div>
      )}
    </div>
  );
}
