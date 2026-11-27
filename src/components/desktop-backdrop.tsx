import { AppIcon } from "@/components/app-icon";
import { NaIcon } from "@/components/na/icon";
import { UI_ICON } from "@/lib/app-icons";

/** Paul's desktop keys (Figma 8.2); the question panel listens for them (na/battle.tsx). */
const KEYS: [string, string][] = [
  ["Up / Down", "Select an answer"],
  ["Space", "Submit"],
  ["1–4 or A–D", "Answer instantly"],
  ["Ctrl", "Open your bag"],
];

/**
 * Figma 8.2: the night around the desktop phone, the logo and the landing lines
 * to its left and the keyboard card to its right. Rendered only when the phone
 * is framed (routes/__root.tsx); the side pieces hide when the window is too
 * narrow for them. Positioned off --frame-width, which the frame sets.
 */
export function DesktopBackdrop() {
  return (
    <div className="na-bg-night pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute top-1/2 hidden w-[400px] -translate-y-1/2 flex-col items-center gap-2.5 text-center min-[1180px]:flex"
        style={{ right: "calc(50% + var(--frame-width) / 2 + 115px)" }}
      >
        <AppIcon src={UI_ICON.appLogo} alt="Pokémon Trivia Battle" className="h-[150px] w-[260px] object-contain" eager />
        <p className="na-title mt-3 text-foreground">Prove your Pokémon knowledge in battle!</p>
        <p className="na-body max-w-[340px] text-text-secondary">Answer trivia, defeat trainers, catch Pokémon, and build your team!</p>
      </div>
      <div
        className="na-deep absolute top-1/2 hidden w-[300px] -translate-y-1/2 flex-col gap-3 rounded-[22px] p-5 min-[1180px]:flex"
        style={{ left: "calc(50% + var(--frame-width) / 2 + 95px)" }}
      >
        <span className="flex items-center gap-2">
          <NaIcon name="keyboard" size={22} />
          <span className="na-label text-reward-gold">KEYBOARD</span>
        </span>
        {KEYS.map(([k, what]) => (
          <span key={k} className="flex items-center gap-2.5">
            <span className="na-body-strong rounded-lg bg-night-card-2 px-2.5 py-1 text-foreground shadow-[0_3px_0_#141A3F]">{k}</span>
            <span className="na-body text-text-secondary">{what}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
