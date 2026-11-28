import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";
import { PokeballSpinner } from "@/components/game-ui";
import { claimReferral, ensureSession, getProfileByCode } from "@/lib/social";
import { rollReferralReward } from "@/lib/referral-rewards";
import { showInviteReward } from "@/lib/invite-reward-event";
import { setPendingReferral } from "@/lib/pending-referral";

// Mirrors the shape of a Pokémon GO referral link
// (pokemongolive.com/refer?code=...). Paul 2026-11-28: a new player opens on
// the gift (16.8) — claimed and already in their bag — and Let's go carries
// on into the first session (1.1). Onboarded players skip straight to the hub.
export const Route = createFileRoute("/refer")({
  head: () => pageHead("/refer"),
  component: ReferPage,
  validateSearch: (s: Record<string, unknown>): { code?: string } =>
    typeof s.code === "string" ? { code: s.code } : {},
});

function ReferPage() {
  const { code } = Route.useSearch();
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (hasOnboarded) {
      void navigate({ to: "/battle", search: { autostart: 0 } as never, replace: true });
      return;
    }
    const toLanding = (ref?: string) => void navigate({ to: "/", search: (ref ? { ref } : {}) as never, replace: true });
    if (!code) return toLanding();
    void (async () => {
      try {
        // An anonymous session is enough to claim: every account gets its profile row at sign-up.
        if (!(await ensureSession())) throw new Error("no session");
        const [res, inviter] = await Promise.all([claimReferral(code), getProfileByCode(code)]);
        if (!res.ok) {
          // Unreachable server: keep the old path, claimed when the trainer name is saved.
          if (res.error === "network" || res.error === "no_session") return toLanding(code);
          return toLanding(); // already referred, own code, unknown code: just play
        }
        const reward = rollReferralReward();
        const g = useGameStore.getState();
        g.addCoins(reward.coins);
        g.grantPokeEgg(reward.eggs);
        for (const it of reward.items) g.grantItem(it.id, it.qty);
        showInviteReward({
          from: inviter ? { name: inviter.trainer_name || "Your friend", sprite: inviter.trainer_sprite } : undefined,
          rewards: [reward],
          then: () => toLanding(),
        });
      } catch {
        setPendingReferral(code);
        toLanding(code);
      }
    })();
  }, [hasOnboarded, code, navigate]);

  return (
    <div className="na-bg-night flex h-full w-full items-center justify-center">
      <PokeballSpinner spinning />
    </div>
  );
}
