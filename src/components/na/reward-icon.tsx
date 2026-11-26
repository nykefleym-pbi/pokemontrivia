import { useId } from "react";

/**
 * Night Arena reward icons (Figma "Reward icon" set): vector tokens with a 3D
 * lip and a top highlight, drawn on a 64 grid and scaled to `size`. Copied
 * path for path from the design file; gradient ids are made unique per
 * instance so several icons on one screen never share a gradient.
 */
const G = (id: string, a: string, b: string, y1 = 4, y2 = 58, mid?: string) =>
  `<linearGradient id="${id}" x1="32" y1="${y1}" x2="32" y2="${y2}" gradientUnits="userSpaceOnUse"><stop stop-color="${a}"/>${mid ? `<stop offset="0.55" stop-color="${mid}"/>` : ""}<stop offset="1" stop-color="${b}"/></linearGradient>`;

const ICON: Record<string, [string, string]> = {
  Coin: [G("a", "#FFE98F", "#F2A600"), '<circle cx="32" cy="34" r="27" fill="#A86A00"/><circle cx="32" cy="31" r="27" fill="url(#a)"/><circle cx="32" cy="31" r="20.5" stroke="#FFF4C7" stroke-opacity="0.75" stroke-width="3"/><path d="M12 31h40" stroke="#B37400" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="31" r="6" fill="#FFF4C7" stroke="#B37400" stroke-width="3.5"/><ellipse cx="23" cy="15" rx="9" ry="3.5" fill="white" fill-opacity="0.55"/>'],
  XP: [G("a", "#CDB6FF", "#7650F0", 3), '<path d="M32 6 56 19.5v27L32 60 8 46.5v-27z" fill="#4E31B5"/><path d="M32 3 56 16.5v27L32 57 8 43.5v-27z" fill="url(#a)"/><path d="M32 10.5 49.5 20.6v20.8L32 51.5 14.5 41.4V20.6z" stroke="#EFE7FF" stroke-opacity="0.55" stroke-width="2"/><path d="M32 18 35.06 25.79 43.41 26.29 36.95 31.61 39.05 39.71 32 35.2 24.95 39.71 27.05 31.61 20.59 26.29 28.94 25.79Z" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="24" cy="13.5" rx="7" ry="2.6" fill="white" fill-opacity="0.5"/>'],
  TP: [G("a", "#8AF5EA", "#14B4A3"), '<path d="M32 9 56 34 32 59 8 34z" fill="#0B7468" stroke="#0B7468" stroke-width="6" stroke-linejoin="round"/><path d="M32 6 56 31 32 56 8 31z" fill="url(#a)" stroke="url(#a)" stroke-width="6" stroke-linejoin="round"/><path d="M35 15 23 33h9l-3 13 12-18h-9z" fill="white" stroke="white" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="22" cy="21" rx="6" ry="2.4" fill="white" fill-opacity="0.5"/>'],
  Streak: [G("a", "#FFD66B", "#F0501A", 3, 60, "#FF8A1F"), '<path d="M32 7c4 10 19 16 19 33a19 19 0 0 1-38 0c0-8 5-15 9-19 2 6 6 9 9 9-3-9-2-17 1-23z" fill="#A8360A"/><path d="M32 4c4 10 19 16 19 33a19 19 0 0 1-38 0c0-8 5-15 9-19 2 6 6 9 9 9-3-9-2-17 1-23z" fill="url(#a)"/><path d="M32 29c2 5 10 8 10 16a10 10 0 0 1-20 0c0-4 2-8 4-10 1 3 3 5 5 5-1-4-.5-8 1-11z" fill="#FFF1B8"/><ellipse cx="25" cy="30" rx="3" ry="6" fill="white" fill-opacity="0.35"/>'],
  Freeze: [G("a", "#D6F3FF", "#46A9EE"), '<path d="M32 7 54 15v18c0 14-9.5 22.5-22 27-12.5-4.5-22-13-22-27V15z" fill="#22679E"/><path d="M32 4 54 12v18c0 14-9.5 22.5-22 27C19.5 52.5 10 44 10 30V12z" fill="url(#a)"/><path d="M32 18v24M21.6 24l20.8 12M21.6 36l20.8-12" stroke="white" stroke-width="3" stroke-linecap="round"/><path d="M28 19.5 32 22l4-2.5M28 40.5 32 38l4 2.5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="22" cy="14" rx="6" ry="2.2" fill="white" fill-opacity="0.6"/>'],
  Gift: [G("a", "#FF7A85", "#D91E36", 24, 58) + G("b", "#FF97A0", "#F0384E", 18, 30), '<rect x="11" y="31" width="42" height="29" rx="6" fill="#8E1024"/><rect x="11" y="28" width="42" height="29" rx="6" fill="url(#a)"/><rect x="7" y="19" width="50" height="13" rx="5" fill="url(#b)"/><rect x="27.5" y="19" width="9" height="38" fill="#FFC83D"/><path d="M32 19c-3-8-14-11-15-5-1 4 6 5 15 5zM32 19c3-8 14-11 15-5 1 4-6 5-15 5z" fill="#FFC83D" stroke="#E0A000" stroke-width="2" stroke-linejoin="round"/><ellipse cx="18" cy="22.5" rx="6" ry="1.8" fill="white" fill-opacity="0.5"/>'],
  Egg: [G("a", "#FFFBEF", "#E2CC94", 4, 60), '<path d="M32 8c10 0 21 15 21 28a21 21 0 0 1-42 0C11 23 22 8 32 8z" fill="#A88A4E"/><path d="M32 5c10 0 21 15 21 28a21 21 0 0 1-42 0C11 20 22 5 32 5z" fill="url(#a)"/><path d="M21 30c3-4 9-4 11 1-3 4-9 4-11-1zM36 42c2-3 7-3 9 1-2 3-7 3-9-1zM34 18c2-2 5-2 6 1-2 2-5 2-6-1z" fill="#4FC27E"/><ellipse cx="24" cy="17" rx="3.5" ry="6" fill="white" fill-opacity="0.6"/>'],
  Chest: [G("a", "#D9893F", "#8E4A1C", 14, 58), '<path d="M9 33h46v24a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5z" fill="#5E2E10"/><path d="M9 30h46v24a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5z" fill="url(#a)"/><path d="M9 30c0-12 10-19 23-19s23 7 23 19z" fill="url(#a)"/><path d="M9 30h46" stroke="#FFC83D" stroke-width="4"/><path d="M21 13v46M43 13v46" stroke="#FFC83D" stroke-width="4"/><rect x="27" y="26" width="10" height="13" rx="3" fill="#FFC83D" stroke="#B07A00" stroke-width="2"/><ellipse cx="20" cy="18" rx="6" ry="2" fill="white" fill-opacity="0.4"/>'],
  Trophy: [G("a", "#FFE98F", "#F0A500", 6, 50), '<path d="M18 13H9c0 9 5 13 11 13M46 13h9c0 9-5 13-11 13" stroke="#F0A500" stroke-width="4" stroke-linecap="round"/><path d="M18 9h28v12a14 14 0 0 1-28 0z" fill="url(#a)"/><rect x="28" y="34" width="8" height="9" fill="#E09A00"/><rect x="19" y="44" width="26" height="12" rx="4" fill="#A86A00"/><rect x="19" y="41" width="26" height="12" rx="4" fill="url(#a)"/><path d="M32 13l2 4.4 4.8.5-3.6 3.2 1 4.7L32 23.4l-4.2 2.4 1-4.7-3.6-3.2 4.8-.5z" fill="white"/><ellipse cx="23.5" cy="15" rx="2.5" ry="5" fill="white" fill-opacity="0.45"/>'],
  Potion: [G("a", "#D79BFF", "#7B2FD6", 26, 58), '<rect x="25" y="4" width="14" height="9" rx="3" fill="#B07A4A"/><path d="M26 12h12v9l11 17a13 13 0 0 1-11 20H26a13 13 0 0 1-11-20l11-17z" fill="white" fill-opacity="0.18" stroke="white" stroke-opacity="0.6" stroke-width="2.5" stroke-linejoin="round"/><path d="M18.5 37h27l2.4 3.8A10 10 0 0 1 39.5 55h-15a10 10 0 0 1-8.4-14.2z" fill="url(#a)"/><circle cx="27" cy="45" r="2.5" fill="white" fill-opacity="0.6"/><circle cx="35" cy="48" r="1.8" fill="white" fill-opacity="0.5"/><path d="M22 30l4-6" stroke="white" stroke-opacity="0.7" stroke-width="2.5" stroke-linecap="round"/>'],
  Accuracy: [G("a", "#8DF7C9", "#14BF7B"), '<circle cx="32" cy="34" r="27" fill="#0B7A4E"/><circle cx="32" cy="31" r="27" fill="url(#a)"/><circle cx="32" cy="31" r="20.5" stroke="white" stroke-opacity="0.55" stroke-width="3"/><path d="M21 31.5l7.5 7.5L44 23.5" stroke="white" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="23" cy="15" rx="9" ry="3.5" fill="white" fill-opacity="0.5"/>'],
  Time: [G("a", "#A9C4FF", "#4C7DFF"), '<circle cx="32" cy="34" r="27" fill="#2647A8"/><circle cx="32" cy="31" r="27" fill="url(#a)"/><circle cx="32" cy="31" r="18" fill="white" fill-opacity="0.92"/><path d="M32 20v11l7 5" stroke="#2B4FB8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="23" cy="13" rx="8" ry="3" fill="white" fill-opacity="0.5"/>'],
};

export type RewardIconKind = "Coin" | "XP" | "TP" | "Streak" | "Freeze" | "Gift" | "Egg" | "Chest" | "Trophy" | "Potion" | "Accuracy" | "Time";

export function NaRewardIcon({ kind, size = 24, className }: { kind: RewardIconKind; size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [defs, body] = ICON[kind];
  const html = `<defs>${defs}</defs>${body}`
    .replace(/id="([ab])"/g, `id="$1${uid}"`)
    .replace(/url\(#([ab])\)/g, `url(#$1${uid})`);
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
