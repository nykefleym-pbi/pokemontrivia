import { useEffect, useState } from "react";
import { ITEMS, type ItemId } from "@/lib/game-data";
import { ItemIcon } from "@/components/game-ui";
import { NaButton } from "@/components/na/button";
import { NaConfetti, NaWordmark } from "@/components/na/celebration";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { FaceAvatar } from "@/components/na/face-off";
import { INVITE_REWARD_EVENT, type InviteRewardDetail } from "@/lib/invite-reward-event";

/**
 * Figma 16.8 "Invite reward: you both get it": who invited you, 500 coins, a
 * Poké Egg and 5 random items each (referral-rewards.ts). Replaces the toasts.
 */
export function InviteRewardScreen() {
  const [d, setD] = useState<InviteRewardDetail | null>(null);
  useEffect(() => {
    const on = (e: Event) => setD((e as CustomEvent<InviteRewardDetail>).detail);
    window.addEventListener(INVITE_REWARD_EVENT, on);
    return () => window.removeEventListener(INVITE_REWARD_EVENT, on);
  }, []);
  if (!d || !d.rewards.length) return null;

  const coins = d.rewards.reduce((a, r) => a + r.coins, 0);
  const eggs = d.rewards.reduce((a, r) => a + r.eggs, 0);
  const items = d.rewards.flatMap((r) => r.items.map((i) => i.id));
  const title = d.from ? `A GIFT FROM ${d.from.name.toUpperCase()}!` : "A GIFT FOR YOU!";
  const line = d.from
    ? `${d.from.name} invited you. You both get:`
    : d.joined && d.joined > 1
      ? `${d.joined} friends joined with your code. You get:`
      : "A friend joined with your code. You both get:";
  const item = (id: ItemId) => ITEMS.find((i) => i.id === id);
  const first = item(items[0]);

  return (
    <div className="na-bg-night fixed inset-0 z-[60] flex flex-col items-center gap-3.5 overflow-hidden px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)]">
      <div className="pointer-events-none absolute inset-x-0 top-0">
        <NaConfetti w={390} h={520} n={40} />
      </div>
      <NaWordmark kind="levelup" size={Math.min(48, Math.floor(720 / title.length))}>
        {title}
      </NaWordmark>
      <div className="flex items-center gap-2.5">
        {d.from ? <FaceAvatar spriteId={d.from.sprite || "red"} size={36} ring="#FFC83D" /> : <NaRewardIcon kind="Gift" size={32} />}
        <span className="na-body-strong text-text-secondary">{line}</span>
      </div>
      <div className="flex w-full gap-2.5">
        {(
          [
            [<NaRewardIcon key="c" kind="Coin" size={56} />, coins.toLocaleString(), "COINS"],
            [<NaRewardIcon key="e" kind="Egg" size={56} />, String(eggs), eggs === 1 ? "POKÉ EGG" : "POKÉ EGGS"],
            [first ? <ItemIcon key="i" item={first} className="h-14 w-14" /> : null, String(items.length), "ITEMS"],
          ] as const
        ).map(([icon, n, label]) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1 rounded-[18px] border border-reward-gold/40 bg-white/[0.08] p-3">
            {icon}
            <span className="na-number-l text-reward-gold">{n}</span>
            <span className="na-label text-text-secondary">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {items.map((id, i) => {
          const it = item(id);
          return it ? <ItemIcon key={`${id}${i}`} item={it} className="h-10 w-10" /> : null;
        })}
      </div>
      <div className="flex-1" />
      <NaButton
        block
        onClick={() => {
          setD(null);
          d.then?.();
        }}
      >
        Let's go!
      </NaButton>
    </div>
  );
}
