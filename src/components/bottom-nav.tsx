import { Link, useLocation } from "@tanstack/react-router";
import { Swords, ShoppingBag, User, BookOpen } from "lucide-react";
import { useGameStore } from "@/lib/store";

const TABS = [
  { to: "/battle", label: "Battle", icon: Swords },
  { to: "/shop", label: "Shop", icon: ShoppingBag },
  { to: "/pokedex", label: "Dex", icon: BookOpen },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const loc = useLocation();
  const path = loc.pathname;
  const inBattle = useGameStore((s) => s.inBattle);

  // hide on splash and during active battles
  if (path === "/" || path === "") return null;
  if (inBattle && path.startsWith("/battle")) return null;

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-card/95 backdrop-blur-xl">
      <div className="grid h-16 grid-cols-4 px-2 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-1">
        {TABS.map((t) => {
          const active = path.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className="relative flex flex-col items-center justify-center gap-0.5 transition active:scale-95"
            >
              {active && (
                <span className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-primary" />
              )}
              <Icon
                className={`h-5 w-5 transition-transform ${
                  active ? "scale-110 text-primary" : "text-muted-foreground"
                }`}
              />
              <span
                className={`font-pixel text-[9px] uppercase ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
