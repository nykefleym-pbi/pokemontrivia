import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { unlockAudio, playSfx, playBgm } from "@/lib/audio";
import { BottomNav } from "@/components/bottom-nav";
import { PwaRegister } from "@/components/pwa-register";
import { useGameStore } from "@/lib/store";
import { useEnsureSocial } from "@/lib/social";
import { FriendRequestInbox } from "@/components/FriendRequestInbox";
import { PvpInviteInbox } from "@/components/PvpInviteInbox";
import { LivePvpWatcher } from "@/components/LivePvpWatcher";
import { NameReclaimPrompt } from "@/components/NameReclaimPrompt";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/react";

import appCss from "../styles.css?url";

// Apple PWA launch ("splash") images. w/h are each device's PORTRAIT CSS-point
// dimensions; the orientation media feature selects the portrait vs landscape
// artwork. Files live in public/icons/splash_screens/<base>_<orientation>.png.
const APPLE_SPLASH: ReadonlyArray<{ base: string; w: number; h: number; r: number }> = [
  // iPhones
  { base: "4__iPhone_SE__iPod_touch_5th_generation_and_later", w: 320, h: 568, r: 2 },
  { base: "iPhone_8__iPhone_7__iPhone_6s__iPhone_6__4.7__iPhone_SE", w: 375, h: 667, r: 2 },
  { base: "iPhone_8_Plus__iPhone_7_Plus__iPhone_6s_Plus__iPhone_6_Plus", w: 414, h: 736, r: 3 },
  { base: "iPhone_11__iPhone_XR", w: 414, h: 896, r: 2 },
  { base: "iPhone_11_Pro_Max__iPhone_XS_Max", w: 414, h: 896, r: 3 },
  { base: "iPhone_13_mini__iPhone_12_mini__iPhone_11_Pro__iPhone_XS__iPhone_X", w: 375, h: 812, r: 3 },
  {
    base: "iPhone_17e__iPhone_16e__iPhone_14__iPhone_13_Pro__iPhone_13__iPhone_12_Pro__iPhone_12",
    w: 390,
    h: 844,
    r: 3,
  },
  { base: "iPhone_14_Plus__iPhone_13_Pro_Max__iPhone_12_Pro_Max", w: 428, h: 926, r: 3 },
  { base: "iPhone_16__iPhone_15_Pro__iPhone_15__iPhone_14_Pro", w: 393, h: 852, r: 3 },
  { base: "iPhone_16_Plus__iPhone_15_Pro_Max__iPhone_15_Plus__iPhone_14_Pro_Max", w: 430, h: 932, r: 3 },
  { base: "iPhone_17_Pro__iPhone_17__iPhone_16_Pro", w: 402, h: 874, r: 3 },
  { base: "iPhone_17_Pro_Max__iPhone_16_Pro_Max", w: 440, h: 956, r: 3 },
  { base: "iPhone_Air", w: 420, h: 912, r: 3 },
  // iPads
  { base: "9.7__iPad_Pro__7.9__iPad_mini__9.7__iPad_Air__9.7__iPad", w: 768, h: 1024, r: 2 },
  { base: "10.2__iPad", w: 810, h: 1080, r: 2 },
  { base: "10.5__iPad_Air", w: 834, h: 1112, r: 2 },
  { base: "8.3__iPad_Mini", w: 744, h: 1133, r: 2 },
  { base: "10.9__iPad_Air", w: 820, h: 1180, r: 2 },
  { base: "11__iPad_Pro__10.5__iPad_Pro", w: 834, h: 1194, r: 2 },
  { base: "11__iPad_Pro_M4", w: 834, h: 1210, r: 2 },
  { base: "12.9__iPad_Pro", w: 1024, h: 1366, r: 2 },
  { base: "13__iPad_Pro_M4", w: 1032, h: 1376, r: 2 },
];

const appleSplashLinks = APPLE_SPLASH.flatMap(({ base, w, h, r }) =>
  (["portrait", "landscape"] as const).map((orientation) => ({
    rel: "apple-touch-startup-image",
    media: `screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: ${orientation})`,
    href: `/icons/splash_screens/${base}_${orientation}.png`,
  })),
);

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-pixel text-5xl text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Wild PAGE fled!</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This route doesn't exist in the Pokédex.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-pop transition active:scale-95"
          >
            Back to Battle
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "Pokémon Trivia Battle" },
      {
        name: "description",
        content:
          "A vibrant Pokémon trivia battler with AI-generated questions, type effectiveness, items and ranks.",
      },
      { name: "theme-color", content: "#dc2626" },
      { property: "og:title", content: "Pokémon Trivia Battle" },
      {
        property: "og:description",
        content:
          "A vibrant Pokémon trivia battler with AI-generated questions, type effectiveness, items and ranks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Pokémon Trivia Battle" },
      {
        name: "twitter:description",
        content:
          "A vibrant Pokémon trivia battler with AI-generated questions, type effectiveness, items and ranks.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4821ffd7-0b16-4355-afee-f0c11331bc94/id-preview-899adb33--3026bd96-efdd-46df-80e9-123ce9557fc1.lovable.app-1776994971470.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4821ffd7-0b16-4355-afee-f0c11331bc94/id-preview-899adb33--3026bd96-efdd-46df-80e9-123ce9557fc1.lovable.app-1776994971470.png",
      },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Trivia Battle" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/icons/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/icons/favicon-16.png" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
      { rel: "apple-touch-icon", sizes: "512x512", href: "/icons/icon-512.png" },
      ...appleSplashLinks,
      { rel: "preconnect", href: "https://cdn.jsdelivr.net", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://raw.githubusercontent.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://pokeapi.co", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://cdn.jsdelivr.net" },
      { rel: "dns-prefetch", href: "https://raw.githubusercontent.com" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Press+Start+2P&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem('poke-trivia-store')||'{}');if(s&&s.state&&s.state.darkMode)document.documentElement.classList.add('dark');}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useEnsureSocial();

  const darkMode = useGameStore((s) => s.darkMode);
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [darkMode]);

  const reducedMotion = useGameStore((s) => s.reducedMotion);
  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.classList.add("reduce-motion");
    else root.classList.remove("reduce-motion");
  }, [reducedMotion]);

  // Unlock audio on the first user gesture, and play a subtle tap on any
  // button / link press app-wide.
  useEffect(() => {
    const onTap = (e: MouseEvent) => {
      unlockAudio();
      const t = e.target as HTMLElement | null;
      if (t && t.closest('button, [role="button"], a, [role="tab"]')) playSfx("tap");
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("click", onTap);
    return () => window.removeEventListener("click", onTap);
  }, []);

  // Background music per top-level screen. /battle and /whos-that-pokemon manage
  // their own (mode-dependent) music.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (pathname === "/") playBgm("splash");
    else if (pathname === "/shop") playBgm("shop");
    else if (pathname === "/pokedex") playBgm("dex");
    else if (pathname === "/profile") playBgm("profile");
    // Battle Arena has no dedicated track — borrow the Elite Four intro's
    // "face off" energy so the tab isn't musically silent. Uses the "arena"
    // context (non-battle) so the Settings Music toggle silences it.
    else if (pathname === "/arena") playBgm("arena");
  }, [pathname]);
  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "user"}>
      <div className="h-[100dvh] w-full overflow-hidden bg-background">
        <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-background">
          <Outlet />
          <BottomNav />
        </div>
        {/* Single app-wide toaster: every route (incl. /pvp/live Training & Nearby
            Battle) renders toasts through this. Do NOT add per-route <Toaster>s —
            multiple mounts double every toast. Sonner uses fixed positioning, so
            the ancestor overflow-hidden here does not clip it. */}
        <Toaster position="top-center" />
        <FriendRequestInbox />
        <PvpInviteInbox />
        <LivePvpWatcher />
        <NameReclaimPrompt />

        <PwaRegister />
        <Analytics />
      </div>
    </MotionConfig>
  );
}
