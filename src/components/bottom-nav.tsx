import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useGameStore } from "@/lib/store";

const LEFT_TABS = [
  { to: "/shop", label: "Shop" },
  { to: "/pokedex", label: "Dex" },
] as const;
const RIGHT_TABS = [
  { to: "/profile", label: "Profile" },
] as const;

export function BottomNav() {
  const loc = useLocation();
  const path = loc.pathname;
  const inBattle = useGameStore((s) => s.inBattle);
  const navigate = useNavigate();

  if (path === "/" || path === "") return null;
  if (inBattle && path.startsWith("/battle")) return null;

  const battleActive = path.startsWith("/battle");

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <div className="pointer-events-auto relative flex h-16 w-[min(440px,calc(100%-1.5rem))] items-center justify-around rounded-full border border-border/60 bg-card/95 px-4 shadow-[var(--shadow-float)] backdrop-blur-xl">
        {LEFT_TABS.map((t) => (
          <NavCell key={t.to} tab={t} active={path.startsWith(t.to)} />
        ))}

        {/* elevated center Battle button */}
        <button
          aria-label="Battle"
          onClick={() => navigate({ to: "/battle" })}
          className={`group relative -mt-10 flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full border-[5px] border-card bg-primary text-primary-foreground shadow-pop transition active:scale-95 ${
            battleActive ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-card" : ""
          }`}
        >
          <PokeballGlyph />
        </button>

        {RIGHT_TABS.map((t) => (
          <NavCell key={t.to} tab={t} active={path.startsWith(t.to)} />
        ))}
        {/* spacer to balance with elevated battle button */}
        <span className="w-6" aria-hidden />
      </div>
    </nav>
  );
}

function NavCell({
  tab,
  active,
}: {
  tab: { to: string; label: string };
  active: boolean;
}) {
  return (
    <Link
      to={tab.to}
      className="relative flex h-full w-16 flex-col items-center justify-center transition active:scale-95"
    >
      <span
        className={`text-sm font-bold ${
          active ? "text-poke-dark" : "text-poke-dark/60"
        }`}
      >
        {tab.label}
      </span>
      {active && (
        <span className="absolute bottom-2 h-1 w-1 rounded-full bg-primary" />
      )}
    </Link>
  );
}

function PokeballGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#fff" stroke="#1b1d2b" strokeWidth="2.5" />
      <path d="M2 16 a14 14 0 0 1 28 0 Z" fill="currentColor" stroke="#1b1d2b" strokeWidth="2.5" />
      <rect x="2" y="14.5" width="28" height="3" fill="#1b1d2b" />
      <circle cx="16" cy="16" r="4" fill="#fff" stroke="#1b1d2b" strokeWidth="2.5" />
    </svg>
  );
}
