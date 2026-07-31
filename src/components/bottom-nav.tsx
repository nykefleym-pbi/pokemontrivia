import { Link, useLocation } from "@tanstack/react-router";
import { ShoppingBag, BookOpen, User, Swords } from "lucide-react";
import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store";

const TABS = [
  { to: "/battle", label: "Home", Icon: PokeballIcon },
  { to: "/shop", label: "Shop", Icon: ShoppingBag },
  { to: "/arena", label: "Arena", Icon: Swords },
  { to: "/pokedex", label: "Dex", Icon: BookOpen },
  { to: "/profile", label: "Profile", Icon: User },
] as const;

export function BottomNav() {
  const loc = useLocation();
  const path = loc.pathname;
  const battleScreenActive = useGameStore((s) => s.battleScreenActive);

  if (path === "/" || path === "") return null;
  if (path.startsWith("/whos-that-pokemon")) return null;
  // Every /pvp route is a full-screen flow of its own (the live battle, the
  // result screen, match chat). `battleScreenActive` only covers the battle
  // itself, which left the nav floating over the chat composer.
  if (path.startsWith("/pvp")) return null;
  if (battleScreenActive) return null;

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <div className="pointer-events-auto grid h-16 w-[min(440px,calc(100%-1.5rem))] grid-cols-5 items-center rounded-full border border-border/60 bg-card/95 px-2 shadow-[var(--shadow-float)] backdrop-blur-xl">
        {TABS.map((t) => (
          <NavCell key={t.to} tab={t} active={path.startsWith(t.to)} emphasize={t.to === "/arena"} />
        ))}
      </div>
    </nav>
  );
}

function NavCell({
  tab,
  active,
  emphasize,
}: {
  tab: { to: string; label: string; Icon: React.ComponentType<{ className?: string }> };
  active: boolean;
  emphasize?: boolean;
}) {
  const { Icon, label, to } = tab;
  return (
    <Link
      to={to}
      aria-label={label}
      className="relative flex h-full flex-col items-center justify-center transition press"
    >
      {active ? (
        <motion.span
          layoutId="bottom-nav-active-pill"
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pop ${
            emphasize ? "h-10 w-10" : "h-9 w-9"
          }`}
        >
          <Icon className={emphasize ? "h-5 w-5" : "h-[18px] w-[18px]"} />
        </motion.span>
      ) : (
        <span className="text-[13px] font-bold text-foreground/60">{label}</span>
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
