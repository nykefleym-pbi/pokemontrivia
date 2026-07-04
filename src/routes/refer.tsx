import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useGameStore } from "@/lib/store";
import { PokeballSpinner } from "@/components/game-ui";

// Mirrors the shape of a Pokémon GO referral link
// (pokemongolive.com/refer?code=...): a dedicated path that immediately
// forwards into the app rather than sitting as a bare query param on the
// splash screen. Onboarded users skip straight past it into the battle hub;
// new users land on "/" with the code carried over, which auto-advances
// straight into trainer creation (see routes/index.tsx).
export const Route = createFileRoute("/refer")({
  component: ReferPage,
  validateSearch: (s: Record<string, unknown>): { code?: string } =>
    typeof s.code === "string" ? { code: s.code } : {},
});

function ReferPage() {
  const { code } = Route.useSearch();
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();

  useEffect(() => {
    if (hasOnboarded) {
      navigate({ to: "/battle", search: { autostart: 0 } as never, replace: true });
    } else {
      navigate({ to: "/", search: (code ? { ref: code } : {}) as never, replace: true });
    }
  }, [hasOnboarded, code, navigate]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-poke-cream">
      <PokeballSpinner spinning />
    </div>
  );
}
