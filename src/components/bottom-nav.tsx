import { Link, useLocation } from "@tanstack/react-router";
import { Home, ShoppingBag, BookOpen, User, Swords } from "lucide-react";
import { useGameStore } from "@/lib/store";

const TABS = [
  { to: "/battle", label: "Home", Icon: Home },
  { to: "/shop", label: "Shop", Icon: ShoppingBag },
  { to: "/arena", label: "Arena", Icon: Swords },
  { to: "/pokedex", label: "Dex", Icon: BookOpen },
  { to: "/profile", label: "Profile", Icon: User },
] as const;

/**
 * Figma "Tab bar": labelled tabs across the bottom, the active one in a red
 * tint. The Shop gets a dot while today's gift is still unopened.
 */
export function BottomNav() {
  const loc = useLocation();
  const path = loc.pathname;
  const battleScreenActive = useGameStore((s) => s.battleScreenActive);
  const giftReady = useGameStore((s) => s.dailyGiftLastClaim !== new Date().toISOString().slice(0, 10));

  if (path === "/" || path === "") return null;
  if (path.startsWith("/whos-that-pokemon")) return null;
  // Every /pvp route is a full-screen flow of its own (the live battle, the
  // result screen, match chat). `battleScreenActive` only covers the battle
  // itself, which left the nav floating over the chat composer.
  if (path.startsWith("/pvp")) return null;
  if (battleScreenActive) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.12] bg-night-deep/[0.92] backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid h-16 max-w-[440px] grid-cols-5 px-2.5 py-1.5">
        {TABS.map(({ to, label, Icon }) => {
          const on = path.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              aria-current={on ? "page" : undefined}
              className="flex flex-col items-center justify-center gap-[3px] press"
            >
              <span
                className={`relative flex h-[30px] w-[52px] items-center justify-center rounded-xl ${on ? "bg-primary/20" : ""}`}
              >
                <Icon className={`h-[22px] w-[22px] ${on ? "text-[#FF7A85]" : "text-text-muted"}`} strokeWidth={2.2} />
                {to === "/shop" && giftReady && (
                  <span className="absolute right-2 top-px h-2.5 w-2.5 rounded-full border-2 border-night-deep bg-primary" />
                )}
              </span>
              <span className={`na-label ${on ? "text-foreground" : "text-text-muted"}`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
