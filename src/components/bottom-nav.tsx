import { Link, useLocation } from "@tanstack/react-router";
import { ShoppingBag, BookOpen, User } from "lucide-react";
import { useGameStore } from "@/lib/store";

const TABS = [
  { to: "/battle", label: "Battle", Icon: PokeballIcon },
  { to: "/shop", label: "Shop", Icon: ShoppingBag },
  { to: "/pokedex", label: "Dex", Icon: BookOpen },
  { to: "/profile", label: "Profile", Icon: User },
] as const;

export function BottomNav() {
  const loc = useLocation();
  const path = loc.pathname;
  const inBattle = useGameStore((s) => s.inBattle);

  if (path === "/" || path === "") return null;
  if (inBattle && path.startsWith("/battle")) return null;

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <div className="pointer-events-auto grid h-16 w-[min(440px,calc(100%-1.5rem))] grid-cols-4 items-center rounded-full border border-border/60 bg-card/95 px-2 shadow-[var(--shadow-float)] backdrop-blur-xl">
        {TABS.map((t) => (
          <NavCell key={t.to} tab={t} active={path.startsWith(t.to)} />
        ))}
      </div>
    </nav>
  );
}

function NavCell({
  tab,
  active,
}: {
  tab: { to: string; label: string; Icon: React.ComponentType<{ className?: string }> };
  active: boolean;
}) {
  const { Icon, label, to } = tab;
  return (
    <Link
      to={to}
      className="relative flex h-full flex-col items-center justify-center transition active:scale-95"
    >
      {active ? (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pop">
          <Icon className="h-[18px] w-[18px]" />
        </span>
      ) : (
        <span className="text-[15px] font-bold text-poke-dark/60">{label}</span>
      )}
    </Link>
  );
}

function PokeballIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#fff" stroke="#1b1d2b" strokeWidth="2.5" />
      <path d="M2 16 a14 14 0 0 1 28 0 Z" fill="currentColor" stroke="#1b1d2b" strokeWidth="2.5" />
      <rect x="2" y="14.5" width="28" height="3" fill="#1b1d2b" />
      <circle cx="16" cy="16" r="4" fill="#fff" stroke="#1b1d2b" strokeWidth="2.5" />
    </svg>
  );
}
