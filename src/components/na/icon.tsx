import { useId } from "react";
import { hifi } from "@/components/na/gloss-data";
import { NaGlossIcon, uniqueIds, type GlossIconKind } from "@/components/na/gloss-icon";
import { NaRewardIcon, type RewardIconKind } from "@/components/na/reward-icon";

/**
 * The Figma icon set, as the plugin's `icon(name)` draws it (dev/plugin-src.js):
 * a name in GLOSS_OF becomes its glossy version (a Reward icon, an extra reward
 * icon such as Swords or Medal, or a glossy kit icon); every other name is the
 * Night Arena line icon (24 grid, 2 px stroke, dev/build-scripts.txt ICONS).
 * `line` forces the line drawing, as `icon(name, color, size, true)` does.
 * Copied from the plugin: change them there first (Paul: always the Figma icon).
 */
const LINE: Record<string, string> = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  shop: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  arena: '<path d="M5 5l14 14"/><path d="M19 5 5 19"/><path d="M3 17l4 4"/><path d="M17 21l4-4"/>',
  dex: '<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v14"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M12 8C10 4 5 4 5 7c0 1 1 1 3 1"/><path d="M12 8c2-4 7-4 7-1 0 1-1 1-3 1"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4"/><path d="M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4"/><path d="M8 21h8"/><path d="M9 17h6v4H9z"/>',
  flame: '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3-1-3-1-5 0-7z"/>',
  "flame-filled": '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3-1-3-1-5 0-7z"/>',
  coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  check: '<path d="M5 12l4 4 10-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  "star-filled": '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  "chevron-right": '<path d="M9 6l6 6-6 6"/>',
  "arrow-left": '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
  share: '<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v8h14v-8"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  shuffle: '<path d="M4 7h3c4 0 6 10 10 10h3"/><path d="M4 17h3c1.6 0 2.8-1.6 3.9-3.6"/><path d="M13.1 9.6C14.2 8 15.4 7 17 7h3"/><path d="M18 4l3 3-3 3"/><path d="M18 14l3 3-3 3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  heart: '<path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"/>',
  "heart-filled": '<path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  egg: '<path d="M12 3c3.5 0 7 5.5 7 10a7 7 0 0 1-14 0c0-4.5 3.5-10 7-10z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z"/>',
  pokeball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h6M15 12h6"/><circle cx="12" cy="12" r="3"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7v.5"/><path d="M12 17h.01"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  snowflake: '<path d="M12 2v20M4.9 7l14.2 10M4.9 17 19.1 7"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  chest: '<rect x="3" y="9" width="18" height="11" rx="2"/><path d="M3 13h18"/><path d="M5 9a7 5 0 0 1 14 0"/><path d="M11 12h2v3h-2z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  review: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 11h6M9 15h4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  // the plugin's standalone SVGs: CHAT (Arena header), TRASH (bag bin), RULER and WEIGHT (6.4 facts)
  chat: '<path d="M4 5h16v11H11l-5 4v-4H4z"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/>',
  ruler: '<path d="m3 15 12-12 6 6L9 21z"/><path d="m7 11 2 2M10 8l2 2M13 5l2 2"/>',
  weight: '<path d="M6 9h12l2 11H4z"/><circle cx="12" cy="6" r="2.5"/>',
  // plugin-src.js USERPLUS / SEND (rows 15-16)
  "user-plus": '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M19 8v6M16 11h6"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
  // build-scripts.txt ICONS plus / minus (the 17.1 / 17.11 stepper)
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
};
const FILLED = new Set(["heart-filled", "play", "flame-filled", "star-filled"]);

/** Plugin REWARD_SVG: the extra reward icons (medal, crossed swords). */
const REWARD_SVG: Record<string, string> = {
  Medal:
    '<path d="M17 4h12l9 26H26z" fill="#9C1428"/><path d="M47 4H35l-9 26h12z" fill="#E5384F"/><path d="M29 4l4 11" stroke="#FFC83D" stroke-width="2.5"/><circle cx="32" cy="44" r="17" fill="#A86A00"/><circle cx="32" cy="41" r="17" fill="url(#a)"/><circle cx="32" cy="41" r="12" stroke="#FFF4C7" stroke-opacity="0.75" stroke-width="2.5"/><path d="M32 34L33.76 38.57L38.66 38.84L34.85 41.93L36.11 46.66L32 44L27.89 46.66L29.15 41.93L25.34 38.84L30.24 38.57Z" fill="white" stroke="white" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="25" cy="31" rx="5" ry="2" fill="white" fill-opacity="0.55"/>',
  Swords: (() => {
    const sword = (m: boolean, dy: number, shade: boolean) => {
      const X = (x: number) => (m ? 64 - x : x);
      const Y = (y: number) => y + dy;
      const pt = (a: number[][]) => a.map((p) => X(p[0]) + "," + Y(p[1])).join(" ");
      const ln = (a: number[], b: number[], c: string, w: number) =>
        `<path d="M${X(a[0])} ${Y(a[1])}L${X(b[0])} ${Y(b[1])}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
      const blade = pt([[8, 8], [15, 10], [42, 37], [37, 42], [10, 15]]);
      if (shade)
        return `<polygon points="${blade}" fill="#4A5670"/>` + ln([34, 46], [46, 34], "#4A5670", 6) + ln([42, 42], [51, 51], "#4A5670", 6) + `<circle cx="${X(53)}" cy="${Y(53)}" r="4" fill="#4A5670"/>`;
      return (
        `<polygon points="${blade}" fill="url(#a)"/>` +
        ln([12, 12], [38, 38], "#FFFFFF", 1.6).replace("/>", ' stroke-opacity="0.7"/>') +
        ln([34, 46], [46, 34], "#F0A500", 6) +
        ln([42, 42], [51, 51], "#7A4320", 5) +
        `<circle cx="${X(53)}" cy="${Y(53)}" r="4" fill="#FFC83D" stroke="#B07A00" stroke-width="1.5"/>`
      );
    };
    return sword(true, 3, true) + sword(true, 0, false) + sword(false, 3, true) + sword(false, 0, false);
  })(),
};
const rewardSvg = (kind: string) => {
  const g = kind === "Swords" ? ["#FFFFFF", "#9FB1CF"] : ["#FFE98F", "#F0A500"];
  return hifi(
    `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="a" x1="32" y1="4" x2="32" y2="58" gradientUnits="userSpaceOnUse"><stop stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/></linearGradient></defs>${REWARD_SVG[kind]}</svg>`,
  ) as string;
};

/** Plugin GLOSS_OF: which names draw glossy, and as what. */
const GLOSS_OF: Record<string, string> = {
  trophy: "RI:Trophy", chest: "RI:Chest", gift: "RI:Gift", egg: "RI:Egg", coin: "RI:Coin", "flame-filled": "RI:Streak",
  arena: "RW:Swords", medal: "RW:Medal", shop: "bag", "star-filled": "star", "heart-filled": "heart", heart: "heart-empty",
};
for (const k of ["crown", "map", "lock", "question", "dex", "profile", "volume", "wifi-off", "calendar", "bag", "pokeball", "play", "keyboard", "target", "refresh", "qr", "gear", "shield", "bell", "globe"]) GLOSS_OF[k] = k;

function RewardArt({ kind, size, className }: { kind: string; size: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 [&>svg]:h-full [&>svg]:w-full ${className ?? ""}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: uniqueIds(rewardSvg(kind), uid) }}
    />
  );
}

/** A line icon as a standalone SVG string in `color` (the share card draws it on a canvas). */
export const lineIconSvg = (name: string, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${FILLED.has(name) ? color : "none"}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LINE[name]}</svg>`;

export function NaIcon({ name, size = 24, className, line }: { name: string; size?: number; className?: string; line?: boolean }) {
  const g = !line ? GLOSS_OF[name] : undefined;
  if (g?.startsWith("RI:")) return <NaRewardIcon kind={g.slice(3) as RewardIconKind} size={size} className={className} />;
  if (g?.startsWith("RW:")) return <RewardArt kind={g.slice(3)} size={size} className={className} />;
  if (g) return <NaGlossIcon kind={g as GlossIconKind} size={size} className={className} />;
  const inner = LINE[name];
  if (!inner) throw new Error(`No Figma icon "${name}"`);
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={FILLED.has(name) ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
