import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { PwaRegister } from "@/components/pwa-register";
import { useGameStore } from "@/lib/store";
import { useEnsureSocial } from "@/lib/social";
import { FriendRequestInbox } from "@/components/FriendRequestInbox";
import { NameReclaimPrompt } from "@/components/NameReclaimPrompt";


import appCss from "../styles.css?url";



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
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
      { title: "Pokémon Trivia Battle" },
      { name: "description", content: "A vibrant Pokémon trivia battler with AI-generated questions, type effectiveness, items and ranks." },
      { name: "theme-color", content: "#dc2626" },
      { property: "og:title", content: "Pokémon Trivia Battle" },
      { property: "og:description", content: "A vibrant Pokémon trivia battler with AI-generated questions, type effectiveness, items and ranks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Pokémon Trivia Battle" },
      { name: "twitter:description", content: "A vibrant Pokémon trivia battler with AI-generated questions, type effectiveness, items and ranks." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4821ffd7-0b16-4355-afee-f0c11331bc94/id-preview-899adb33--3026bd96-efdd-46df-80e9-123ce9557fc1.lovable.app-1776994971470.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4821ffd7-0b16-4355-afee-f0c11331bc94/id-preview-899adb33--3026bd96-efdd-46df-80e9-123ce9557fc1.lovable.app-1776994971470.png" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Trivia Battle" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
      { rel: "apple-touch-icon", sizes: "512x512", href: "/icons/icon-512.png" },
      { rel: "preconnect", href: "https://raw.githubusercontent.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://pokeapi.co", crossOrigin: "anonymous" },
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
  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-background">
      <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-background">
        <Outlet />
        <BottomNav />
      </div>
      <FriendRequestInbox />
      <NameReclaimPrompt />

      <PwaRegister />
    </div>
  );
}

