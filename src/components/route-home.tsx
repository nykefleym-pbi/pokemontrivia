import { useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { NaIcon } from "@/components/na/icon";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { NaTopBar } from "@/components/na/top-bar";
import { GENERATIONS } from "@/lib/dex-rewards";
import { ROUTE_REGIONS, regionRoute, gymTown, nextStep, routeGym, routeNumber, stopTrainer, stopsForGym, wildStops } from "@/lib/route";
import { dayStreak } from "@/lib/win-streak";
import { useDailyGift } from "@/lib/use-daily-gift";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaSheet } from "@/components/na/sheet";
import { FitSprite, FittedTrainer } from "@/components/na/battle";
import type { EliteMember } from "@/lib/elite-four";
import { NaRegionRow } from "@/components/na/region-row";


/**
 * Home: your route (Figma 2.3, 2.4, 2.6), a Duolingo-style path of 3D coins.
 *
 * Paul, 2026-11-28: the wild half of the route's battles comes first (tall grass), then
 * Who's That, then the trainer half, then today's Daily Quest, then the gym, open as soon
 * as you reach it (a lost gym waits for one trainer win). The daily gift is a chest on the
 * road (2.5); the Mega Raid lives in the Arena and the pop-up, not here. Your partner walks the dotted trail into
 * the current step; the current coin hops with a burst of stars. Only the top bar stays put.
 */

type StepState = "done" | "current" | "locked";
type Main =
  | { key: string; kind: "stop"; wild: boolean; state: StepState; label: string }
  | { key: string; kind: "whos"; state: StepState }
  | { key: string; kind: "daily"; state: StepState }
  | { key: string; kind: "rematch"; state: StepState }
  | { key: string; kind: "chest" }
  | { key: string; kind: "gym"; state: StepState }
  | { key: string; kind: "elite" };
interface Placed { key: string; cx: number; cy: number; r: number }

const COIN = 74;
const R = { stop: COIN / 2, whos: COIN / 2, daily: COIN / 2, rematch: COIN / 2, chest: COIN / 2, gym: 50, elite: 46 };

/** Coin colours: the face's light and mid tone, and the lip below it. */
const TONE = {
  gold: ["#ffe38a", "#f5b400", "#a87500"],
  brand: ["#ff8a95", "#ee2f45", "#99122a"],
  locked: ["#3b4686", "#2a3366", "#121736"],
  blue: ["#a9c2ff", "#5b8cff", "#2b4fb8"],
} as const;

/** A Duolingo-style step: a round 3D coin seen a little from above (an oval face on a thick lip).
 *  The current one hops, and stars burst out each time it lands. */
function Coin({
  tone,
  size = COIN,
  hop,
  label,
  disabled,
  onClick,
  children,
}: {
  tone: keyof typeof TONE;
  size?: number;
  hop?: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [light, mid, lip] = TONE[tone];
  const h = Math.round(size * 0.86);
  const cycle = { duration: 1.1, repeat: Infinity, repeatDelay: 1.3 };
  return (
    <div className="relative" style={{ width: size, height: h + 10 }}>
      {hop &&
        ([[-34, -18], [36, -22], [0, -40]] as const).map(([dx, dy], i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 -ml-2 -mt-2 text-reward-gold"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 1, 0], scale: [0.3, 0.3, 1, 0.5], x: [0, 0, dx, dx * 1.35], y: [0, 0, dy, dy * 1.35] }}
            transition={{ ...cycle, times: [0, 0.5, 0.68, 1], delay: i * 0.04 }}
          >
            <NaIcon name="star-filled" size={16} />
          </motion.span>
        ))}
      <motion.button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="absolute left-0 top-0 flex items-center justify-center rounded-[50%] press"
        style={{
          width: size,
          height: h,
          background: `radial-gradient(ellipse 70% 60% at 50% 32%, ${light} 0%, ${mid} 70%)`,
          boxShadow: `0 9px 0 ${lip}, 0 14px 18px rgb(0 0 0 / 0.35), inset 0 -5px 0 rgb(0 0 0 / 0.16), inset 0 3px 0 rgb(255 255 255 / 0.4)`,
        }}
        animate={hop ? { y: [0, -14, 0, -5, 0], scaleY: [1, 1.04, 0.92, 1, 1] } : undefined}
        transition={hop ? { ...cycle, times: [0, 0.3, 0.55, 0.75, 1], ease: "easeOut" } : undefined}
      >
        <span className="pointer-events-none absolute inset-[13%] rounded-[50%] border-[3px] border-white/25" aria-hidden />
        <span className="relative">{children}</span>
      </motion.button>
    </div>
  );
}

/** Cubic from a to b leaving and entering horizontally, as the road in Figma. */
function seg(a: [number, number], b: [number, number]) {
  const s = b[0] > a[0] ? 1 : -1;
  const k = Math.abs(b[0] - a[0]) * 0.6;
  return [a, [a[0] + s * k, a[1]], [b[0] - s * k, b[1]], b] as const;
}
function bez(s: ReturnType<typeof seg>, t: number): [number, number] {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * s[0][i] + 3 * u * u * t * s[1][i] + 3 * u * t * t * s[2][i] + t * t * t * s[3][i]) as [number, number];
}
/** Points every ~gap px along the curve, first and last on its ends; d = share of length. */
function evenDots(s: ReturnType<typeof seg>, gap: number) {
  const N = 64, P: Array<[number, number]> = [], L = [0];
  for (let i = 0; i <= N; i++) {
    P.push(bez(s, i / N));
    if (i) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  }
  const n = Math.max(1, Math.round(L[N] / gap)), out: Array<{ x: number; y: number; d: number }> = [];
  for (let j = 0, i = 0; j <= n; j++) {
    const d = (L[N] * j) / n;
    while (i < N - 1 && L[i + 1] < d) i++;
    const f = (d - L[i]) / (L[i + 1] - L[i] || 1);
    out.push({ x: P[i][0] + (P[i + 1][0] - P[i][0]) * f, y: P[i][1] + (P[i + 1][1] - P[i][1]) * f, d: j / n });
  }
  return out;
}

function TimerChip({ text, done, color }: { text: string; done?: boolean; color?: string }) {
  return (
    <span className={`flex items-center gap-1 rounded-full px-[9px] py-[3px] ${done ? "bg-success/[0.18]" : "bg-white/[0.12]"}`}>
      {done ? <NaIcon name="check" size={12} className="text-success" /> : <span style={{ color: color ?? "#FFC83D" }}><NaIcon name="clock" size={12} /></span>}
      <span className="na-label whitespace-nowrap text-foreground">{text}</span>
    </span>
  );
}

function StartTag() {
  return <span className="na-button-m rounded-[10px] bg-foreground px-3 py-[5px] text-night-base">START</span>;
}

/** Your partner on the trail, standing on its shadow and hopping now and then (no speech bubble). */
function TrailPartner({ id, x, y }: { id: number; x: number; y: number }) {
  const hop = { duration: 0.9, repeat: Infinity, repeatDelay: 1.6, times: [0, 0.35, 0.6, 0.8, 1] };
  return (
    <div className="pointer-events-none absolute z-10" style={{ left: x, top: y }}>
      <motion.span
        className="absolute -left-6 -top-[6px] h-3 w-12 rounded-[50%] bg-night-deep/60"
        animate={{ scaleX: [1, 0.7, 1.1, 1, 1], opacity: [1, 0.6, 1, 1, 1] }}
        transition={hop}
      />
      <motion.div
        className="absolute -left-[40px] -top-[78px] origin-bottom"
        animate={{ y: [0, -16, 0, -4, 0], scaleY: [1, 1.05, 0.9, 1, 1], rotate: [0, -4, 0, 2, 0] }}
        transition={hop}
      >
        <FitSprite id={id} size={80} feet />
      </motion.div>
    </div>
  );
}

export function RouteHome({
  onStart,
  onStartDaily,
  onStartWeekly,
  loading,
  dailyDone,
  elite,
  onElite,
}: {
  onStart: () => void;
  onStartDaily: () => void;
  onStartWeekly: () => void;
  loading: boolean;
  dailyDone: boolean;
  /** 11.1: the Elite Four member blocking the road, if any; her stop opens the challenge (11.2). */
  elite?: EliteMember | null;
  onElite?: () => void;
}) {
  const navigate = useNavigate();
  const pokemon = useGameStore((s) => s.pokemon);
  const route = useGameStore((s) => s.route);
  const battleLog = useGameStore((s) => s.battleLog);
  const whosThatHourKey = useGameStore((s) => s.whosThatHourKey);
  const gift = useDailyGift(30_000);
  const [giftOpen, setGiftOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);

  const now = gift.now;
  const frozenDays = useGameStore((s) => s.frozenDays);
  const streak = useMemo(() => dayStreak(battleLog, now, false, frozenDays), [battleLog, now, frozenDays]);
  const leader = routeGym(route);
  const town = gymTown(leader);
  const step = nextStep(route, dailyDone);
  const total = stopsForGym(route.gym);
  const wildN = wildStops(route.gym);
  const [scrolled, setScrolled] = useState(false);
  const whosReady = Math.floor(now / 3_600_000) !== whosThatHourKey;
  const whosMin = Math.ceil((3_600_000 - (now % 3_600_000)) / 60_000);
  const d = new Date(now);
  const dailyHours = Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now) / 3_600_000);

  // ---- the road: wild stops, Who's That, trainer stops, Daily Quest, (a rematch trainer), the gym.
  const stepState = (here: boolean, done: boolean): StepState => (done ? "done" : here ? "current" : "locked");
  const main: Main[] = [];
  for (let i = 0; i < total; i++) {
    if (i === wildN) main.push({ key: "whos", kind: "whos", state: stepState(step.kind === "whos", !!route.whos) });
    const wild = i < wildN;
    main.push({
      key: `s${i}`,
      kind: "stop",
      wild,
      state: stepState((step.kind === "wild" || step.kind === "trainer") && step.stop === i, i < route.beaten),
      label: wild ? "Wild Pokémon" : stopTrainer(route, i),
    });
    if (i === 0) main.push({ key: "chest", kind: "chest" });
  }
  main.push({ key: "daily", kind: "daily", state: stepState(step.kind === "daily", dailyDone) });
  if (route.gymLost) main.push({ key: "rematch", kind: "rematch", state: stepState(step.kind === "trainer" && step.stop === null, false) });
  main.push({ key: "gym", kind: "gym", state: stepState(step.kind === "gym", false) });
  // 11.1: a pending Elite Four member stands on the road as its START; the steps after her wait.
  if (elite) {
    const at = main.findIndex((m) => "state" in m && m.state === "current");
    const cur = main[at];
    if (cur && "state" in cur) main[at] = { ...cur, state: "locked" } as Main;
    main.splice(Math.max(0, at), 0, { key: "elite", kind: "elite" });
  }
  const currentIdx = Math.max(0, elite ? main.findIndex((m) => m.kind === "elite") : main.findIndex((m) => "state" in m && m.state === "current"));


  // ---- geometry, measured against the real width.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(390);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 390));
    ro.observe(el);
    setW(el.clientWidth || 390);
    return () => ro.disconnect();
  }, []);
  // Two columns as in Figma (x 105 / 285 of 390); 132 between steps, more into the current one
  // (your partner walks there) and before the gym.
  const colX = (i: number) => (i % 2 === 0 ? (W * 105) / 390 : (W * 285) / 390);
  const placed: Placed[] = [];
  let y = currentIdx === 0 ? 210 : 70;
  main.forEach((m, i) => {
    if (i > 0) y += 132 + (i === currentIdx ? 96 : 0) + (m.kind === "gym" ? 44 : 0) + (main[i - 1].kind === "chest" ? -12 : 0);
    placed.push({ key: m.key, cx: colX(i), cy: y, r: R[m.kind] });
  });
  const height = y + 210;
  // Where the road leaves step i towards its neighbour.
  const att = (i: number, incoming: boolean): [number, number] => {
    const p = placed[i], o = placed[incoming ? i - 1 : i + 1];
    const dir = o.cx > p.cx ? 1 : -1;
    const dy = i > 0 && i < placed.length - 1 ? (incoming ? -12 : 12) : 0;
    return [p.cx + dir * (p.r + 8), p.cy + dy];
  };
  const segs = placed.slice(1).map((_, k) => seg(att(k, false), att(k + 1, true)));
  // A lead-in from the top when the very first step is the current one, so your partner has a trail.
  const leadIn = seg([placed[0].cx + W * 0.3, placed[0].cy - 170], [placed[0].cx + R.stop + 8, placed[0].cy]);
  const trail = currentIdx === 0 ? leadIn : segs[currentIdx - 1];
  const partnerAt = evenDots(trail, 1).find((p) => p.d >= (streak.secured ? 0.62 : 0.5))!;

  // Open at the top, scrolling only as far as it takes to show the current step above the tabs.
  const scrollRef = useRef<HTMLDivElement>(null);
  const curY = placed[currentIdx]?.cy ?? 0;
  useEffect(() => {
    const sc = scrollRef.current, wrap = wrapRef.current;
    if (!sc || !wrap) return;
    sc.scrollTop = Math.max(0, wrap.offsetTop + curY + 150 - sc.clientHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.region, route.gym, route.beaten, route.whos, route.gymLost, dailyDone]);

  if (!pokemon) return null;

  const battlesLeft = Math.max(0, total - route.beaten);
  const bannerSub = elite
    ? `${elite.name} of the ${elite.title} is blocking your path!`
    : step.kind === "gym"
      ? `${town} is open! Beat ${leader.name} for the ${leader.badge}!`
      : step.kind === "whos"
        ? "Name the mystery Pokémon in Who's That to go on!"
        : step.kind === "daily"
          ? `Play today's Daily Quest, then ${town} opens!`
          : route.gymLost && battlesLeft === 0
            ? `Beat one trainer, then challenge ${leader.name} again!`
            : `Win ${battlesLeft} more battle${battlesLeft === 1 ? "" : "s"} to reach ${town}!`;
  const hint = streak.secured
    ? `Your ${streak.days}-day streak is secured for today!`
    : streak.days > 0
      ? `Win one battle to keep your ${streak.days}-day streak!`
      : "Win a battle to start your streak!";

  const lockedToast = (what: string) => toast(`Finish the steps before ${what} first.`);

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
      className="h-full w-full overflow-y-auto pb-nav safe-x"
    >
      {/* Top bar — stays put while the route scrolls (2.4); it only gets a backing once something slides under it. */}
      <div
        className={`sticky top-0 z-20 flex items-center gap-2.5 px-4 pb-1.5 pt-[calc(env(safe-area-inset-top)+6px)] transition-colors ${scrolled ? "bg-night-base/85 backdrop-blur-md" : ""}`}
      >
        <div className="flex-1">
          <NaTopBar onAvatar={() => navigate({ to: "/profile" })} avatarLabel="Your profile" />
        </div>
      </div>

      {/* Route banner and the streak line, with room around them (Paul, 2026-11-28: too tight). */}
      <div className="px-4 pt-5">
        <div className="na-glass flex min-h-[86px] items-center gap-3 rounded-[20px] py-3 pl-4 pr-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="na-label text-reward-gold">{ROUTE_REGIONS[route.region].toUpperCase()}</span>
            <span className="na-display-s text-foreground">Route {routeNumber(route)}</span>
            <span className="na-caption text-text-secondary">{bannerSub}</span>
          </div>
          <button
            type="button"
            aria-label="Choose your region"
            onClick={() => setRegionOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night-card-2 shadow-[0_4px_0_#141A3F] press"
          >
            <NaGlossIcon kind="map" size={22} />
          </button>
        </div>
        <div className="mt-4 flex justify-center">
          <span className={`flex items-center gap-1.5 rounded-full py-[5px] pl-1.5 pr-3 ${streak.secured ? "bg-success/[0.16]" : "bg-white/10"}`}>
            <NaRewardIcon kind="Streak" size={20} />
            <span className="na-caption text-foreground">{hint}</span>
          </span>
        </div>
      </div>

      {/* The route */}
      <div ref={wrapRef} className="relative mx-auto mt-6 w-full max-w-[430px]" style={{ height }}>
        <svg className="pointer-events-none absolute inset-0" width={W} height={height} aria-hidden>
          {[...(currentIdx === 0 ? [leadIn] : []), ...segs].map((sg, i) => {
            const k = currentIdx === 0 ? i - 1 : i; // segment index along the road (-1: the lead-in)
            return evenDots(sg, 15).map((p, j) => {
              if (Math.hypot(p.x - partnerAt.x, p.y - partnerAt.y) < 16) return null;
              const walked = k < currentIdx - 1 || (sg === trail && p.d <= partnerAt.d);
              return <circle key={`${i}-${j}`} cx={p.x} cy={p.y} r={3.5} fill={walked ? "#FFC83D" : "rgba(244,246,255,0.3)"} />;
            });
          })}
        </svg>

        {main.map((m, i) => {
          const p = placed[i];
          const top = p.cy - (m.kind === "gym" ? 50 : m.kind === "elite" ? R.elite : COIN * 0.43);
          if (m.kind === "elite") {
            if (!elite) return null;
            return (
              <div key={m.key} className="absolute flex w-[170px] -translate-x-1/2 flex-col items-center gap-1.5" style={{ left: p.cx, top }}>
                <span className="absolute -top-10"><StartTag /></span>
                <button
                  type="button"
                  aria-label={`${elite.title} ${elite.name}`}
                  onClick={onElite}
                  className="na-glow-brand relative h-[92px] w-[92px] overflow-hidden rounded-full border-[3px] border-brand-red bg-night-card press"
                >
                  <FittedTrainer art={elite.trainerSpriteUrl} height={74} cx={43} feetY={82} />
                </button>
                <span className="flex items-center gap-1">
                  <NaGlossIcon kind="crown" size={14} />
                  <span className="na-label uppercase text-[#FF7A85]">{elite.title}</span>
                </span>
                <span className="na-headline text-center text-foreground">{elite.name}</span>
                <span className="na-caption text-center text-text-secondary">Defeat {elite.name} to unlock the next route!</span>
              </div>
            );
          }
          if (m.kind === "chest") {
            return (
              <div key={m.key} className="absolute flex w-[110px] -translate-x-1/2 flex-col items-center gap-1" style={{ left: p.cx, top }}>
                <Coin tone={gift.claimable ? "gold" : "locked"} label={gift.claimable ? `Day ${gift.nextDay} gift` : "Gift opened"} onClick={() => setGiftOpen(true)}>
                  {gift.claimable ? <NaRewardIcon kind="Gift" size={44} /> : <NaIcon name="check" size={30} className="text-reward-gold" />}
                </Coin>
                <span className={`na-caption text-center ${gift.claimable ? "text-reward-gold" : "text-text-secondary"}`}>
                  {gift.claimable ? `Day ${gift.nextDay} gift` : "Gift opened"}
                </span>
              </div>
            );
          }
          if (m.kind === "gym") {
            const open = m.state === "current";
            return (
              <div key={m.key} className="absolute flex w-[180px] -translate-x-1/2 flex-col items-center gap-1" style={{ left: p.cx, top }}>
                {open && <span className="absolute -top-10"><StartTag /></span>}
                <Coin
                  tone={open ? "gold" : "locked"}
                  size={100}
                  hop={open}
                  label={`${town}: ${leader.name}`}
                  disabled={open && loading}
                  onClick={() => (open ? onStartWeekly() : toast(route.gymLost && battlesLeft === 0 && dailyDone ? `Beat one trainer, then challenge ${leader.name} again!` : `Finish the route to open ${town}!`))}
                >
                  <img src={leader.badgeIconUrl} alt={leader.badge} className={`h-[58px] w-[58px] object-contain ${open ? "" : "opacity-60 grayscale"}`} />
                </Coin>
                <span className="na-label mt-1 uppercase text-reward-gold">Gym</span>
                <span className="na-headline text-center text-foreground">{town}</span>
                <span className="na-caption text-center text-text-secondary">Beat {leader.name} to win the {leader.badge}!</span>
              </div>
            );
          }
          // the steps: wild / trainer stops, Who's That, Daily Quest, the rematch trainer
          const cur = m.state === "current";
          const done = m.state === "done";
          const icon =
            m.kind === "whos" ? "question" : m.kind === "daily" ? "calendar" : m.kind === "stop" && m.wild ? "pokeball" : "star";
          const title =
            m.kind === "whos" ? "Who's That?" : m.kind === "daily" ? "Daily Quest" : m.kind === "rematch" ? "One more trainer" : m.label;
          let chip: { text: string; done?: boolean; color?: string } | null = null;
          if (m.kind === "whos") chip = done ? (whosReady ? { text: "Bonus round!", color: "#5B8CFF" } : { text: `New in ${whosMin} min`, color: "#5B8CFF" }) : null;
          if (m.kind === "daily") chip = done ? { text: "Done", done: true } : { text: `${dailyHours} h left`, color: "#FF8A1F" };
          const onClick = () => {
            if (m.kind === "whos") {
              if (cur || (done && whosReady)) return navigate({ to: "/whos-that-pokemon" });
              return done ? toast(`A new round starts in ${whosMin} min.`) : lockedToast("Who's That");
            }
            if (m.kind === "daily") {
              if (done) return toast("Today's Daily Quest is done. A new one tomorrow!");
              return cur ? !loading && onStartDaily() : lockedToast("the Daily Quest");
            }
            if (cur) return onStart();
            if (!done) lockedToast(title);
          };
          return (
            <div key={m.key} className="absolute flex w-[132px] -translate-x-1/2 flex-col items-center gap-1" style={{ left: p.cx, top }}>
              {cur && <span className="absolute -top-10"><StartTag /></span>}
              <Coin
                tone={done ? (m.kind === "whos" && whosReady ? "blue" : "gold") : cur ? (m.kind === "whos" ? "blue" : "brand") : "locked"}
                hop={cur}
                label={cur ? `Start: ${title}` : title}
                disabled={cur && loading}
                onClick={onClick}
              >
                {done && !(m.kind === "whos" && whosReady) ? (
                  <NaIcon name="check" size={34} className="text-on-gold" />
                ) : (
                  <span className={cur || done ? "" : "opacity-45 grayscale"}>
                    <NaGlossIcon kind={icon} size={34} />
                  </span>
                )}
              </Coin>
              <span className={`na-caption mt-1 text-center ${m.state === "locked" ? "text-text-muted" : "text-text-secondary"}`}>{title}</span>
              {chip && <TimerChip text={chip.text} done={chip.done} color={chip.color} />}
            </div>
          );
        })}

        {/* Your partner on the trail into the current step (2.3 / 2.6), 1.5x, no speech bubble */}
        <TrailPartner id={pokemon.id} x={partnerAt.x} y={partnerAt.y} />
      </div>

      <GiftCalendar open={giftOpen} onOpenChange={setGiftOpen} gift={gift} />
      <RegionSheet open={regionOpen} onOpenChange={setRegionOpen} />
    </div>
  );
}

/** 2.5 Gift calendar, opened from the chest: the same 7-day gift as the Shop's. */
function GiftCalendar({
  open,
  onOpenChange,
  gift,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  gift: ReturnType<typeof useDailyGift>;
}) {
  const todayDay = gift.claimable ? gift.nextDay : gift.lit;
  return (
    <NaSheet
      open={open}
      onOpenChange={onOpenChange}
      title={gift.claimable ? `Day ${gift.nextDay} gift` : "Gift opened"}
      body={gift.claimable ? "Claim a new reward every day for 7 days!" : `Come back in ${gift.clock} for your next gift!`}
      primary={
        gift.claimable
          ? { label: "Open gift", kind: "gold", onClick: () => { gift.claim(); onOpenChange(false); } }
          : { label: "Got it", onClick: () => onOpenChange(false) }
      }
      secondary={gift.claimable ? { label: "Maybe Later", onClick: () => onOpenChange(false) } : undefined}
      footnote="Missed a reward? Check the Shop!"
    >
      <div className="flex flex-wrap justify-center gap-3">
        {Array.from({ length: 7 }, (_, i) => {
          const day = i + 1;
          const state = day < todayDay || (!gift.claimable && day === todayDay) ? "claimed" : day === todayDay ? "today" : "future";
          return (
            <div key={day} className="flex w-[52px] flex-col items-center gap-1">
              <span className={`na-label ${state === "today" ? "text-reward-gold" : "text-text-secondary"}`}>DAY {day}</span>
              <span
                className={`flex h-[52px] w-[52px] items-center justify-center rounded-[14px] ${
                  state === "claimed" ? "bg-white/[0.08]" : state === "today" ? "na-glow-gold border-2 border-reward-gold bg-night-card" : "bg-white/[0.06]"
                }`}
              >
                {state === "claimed" ? (
                  <NaIcon name="check" size={24} className="text-success" />
                ) : (
                  <span className={state === "future" ? "opacity-40" : ""}>
                    <NaRewardIcon kind="Gift" size={state === "today" ? 42 : 36} />
                  </span>
                )}
              </span>
              <span className={`na-caption text-center ${state === "future" ? "text-text-muted" : "text-foreground"}`}>
                {state === "claimed" ? "Opened" : day === 7 ? "Big gift" : "Gift"}
              </span>
            </div>
          );
        })}
      </div>
    </NaSheet>
  );
}

/** 6.2 Choose your region: each region has its own fixed route; your place on every one is kept. */
function RegionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const route = useGameStore((s) => s.route);
  const saved = useGameStore((s) => s.routeSaved);
  const pokedex = useGameStore((s) => s.pokedex);
  const chooseRegion = useGameStore((s) => s.chooseRegion);
  const [pick, setPick] = useState(route.region);
  useEffect(() => {
    if (open) setPick(route.region);
  }, [open, route.region]);
  return (
    <NaSheet
      open={open}
      onOpenChange={onOpenChange}
      title="CHOOSE YOUR REGION"
      body="Battle with Pokémon from your chosen region and complete your Pokédex faster!"
      primary={{
        label: `Battle in ${ROUTE_REGIONS[pick]}`,
        onClick: () => {
          chooseRegion(pick);
          onOpenChange(false);
        },
      }}
      secondary={{ label: "Cancel", onClick: () => onOpenChange(false) }}
    >
      {ROUTE_REGIONS.map((name, i) => {
        const g = GENERATIONS.find((x) => x.region === name)!;
        const n = g.to - g.from + 1;
        let caught = 0;
        for (let id = g.from; id <= g.to; id++) if (pokedex[id]?.caught) caught++;
        const r = regionRoute(i, route, saved);
        return (
          <NaRegionRow
            key={name}
            name={name}
            sub={`${caught} of ${n} caught · Route ${routeNumber(r)}`}
            pct={caught / n}
            on={i === pick}
            onClick={() => setPick(i)}
          />
        );
      })}
    </NaSheet>
  );
}