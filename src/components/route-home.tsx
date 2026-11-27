import { useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Clock } from "lucide-react";
import { NaIcon } from "@/components/na/icon";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { PokemonSprite } from "@/components/game-ui";
import { getWeekRangeUtc } from "@/lib/game-data";
import { NaTopBar } from "@/components/na/top-bar";
import { GENERATIONS } from "@/lib/dex-rewards";
import { ROUTE_REGIONS, regionRoute, gymTown, routeGym, routeNumber, stopTrainer, stopsForGym, stopsLeft } from "@/lib/route";
import { dayStreak } from "@/lib/win-streak";
import { useDailyGift } from "@/lib/use-daily-gift";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaSheet } from "@/components/na/sheet";
import { NaRegionRow } from "@/components/na/region-row";

/** Home's Mega Raid state: `null` while loading, `"none"` when no raid is live
 *  (the side route stays hidden), else the live event. */
export type MegaHomeState =
  | null
  | "none"
  | { name: string; megaId: number; endsAt: string; disabled: boolean; reason: "cleared" | "exhausted" | "active" };

/**
 * Home: your route (Figma 2.3, 2.4, 2.6), a Duolingo-style path.
 *
 * Trainer stops alternate between two columns and lead to the gym, which is
 * the Weekly League. Side routes fork off the road to the Daily Quest, Who's
 * That and a live Mega Raid; the daily gift is a chest on the road (2.5). Your
 * partner stands on the trail heading for START. Only the top bar stays put;
 * the banner scrolls away with the route (2.4).
 */

type StopState = "done" | "current" | "locked";
type Main =
  | { key: string; kind: "stop"; state: StopState; label: string }
  | { key: string; kind: "chest" }
  | { key: string; kind: "gym" };
type SideKind = "daily" | "whos" | "mega";
interface Placed { key: string; cx: number; cy: number; r: number }

const R = { stop: 36, chest: 36, gym: 46, side: 32 };
const SIDE_COLOR: Record<SideKind, string> = { daily: "#FF8A1F", whos: "#5B8CFF", mega: "#FF7A85" };

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
      {done ? <NaIcon name="check" size={12} className="text-success" /> : <Clock className="h-3 w-3" style={{ color: color ?? "#FFC83D" }} strokeWidth={2.5} />}
      <span className="na-label whitespace-nowrap text-foreground">{text}</span>
    </span>
  );
}

function StartTag() {
  return <span className="na-button-m rounded-[10px] bg-foreground px-3 py-[5px] text-night-base">START</span>;
}

export function RouteHome({
  onStart,
  onStartDaily,
  onStartWeekly,
  onStartMega,
  mega,
  loading,
  dailyDone,
}: {
  onStart: () => void;
  onStartDaily: () => void;
  onStartWeekly: () => void;
  onStartMega: () => void;
  mega: MegaHomeState;
  loading: boolean;
  dailyDone: boolean;
}) {
  const navigate = useNavigate();
  const pokemon = useGameStore((s) => s.pokemon);
  const route = useGameStore((s) => s.route);
  const weeklyLeague = useGameStore((s) => s.weeklyLeague);
  const battleLog = useGameStore((s) => s.battleLog);
  const whosThatHourKey = useGameStore((s) => s.whosThatHourKey);
  const gift = useDailyGift(30_000);
  const [giftOpen, setGiftOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);

  const now = gift.now;
  const streak = useMemo(() => dayStreak(battleLog, now), [battleLog, now]);
  const leader = routeGym(route);
  const town = gymTown(leader);
  const left = stopsLeft(route);
  const weeklyHere = weeklyLeague?.gymLeaderId === leader.id;
  // This week's one try at the gym is still unspent.
  const weekUnused = weeklyHere && (weeklyLeague?.status === "not_started" || weeklyLeague?.status === "in_progress");
  const gymOpen = left === 0 && weekUnused;
  const [scrolled, setScrolled] = useState(false);
  const whosReady = Math.floor(now / 3_600_000) !== whosThatHourKey;
  const whosMin = Math.ceil((3_600_000 - (now % 3_600_000)) / 60_000);
  const d = new Date(now);
  const dailyHours = Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now) / 3_600_000);
  const weekDays = Math.ceil((getWeekRangeUtc().nextStart - now) / 86_400_000);

  // ---- the road: main stops, the chest after the first stop, the gym last.
  const total = stopsForGym(route.gym);
  const main: Main[] = [];
  for (let i = 0; i < total; i++) {
    main.push({
      key: `s${i}`,
      kind: "stop",
      state: i < route.beaten ? "done" : i === route.beaten ? "current" : "locked",
      label: stopTrainer(route, i),
    });
    if (i === 0) main.push({ key: "chest", kind: "chest" });
  }
  main.push({ key: "gym", kind: "gym" });
  const currentIdx = left > 0 ? main.findIndex((m) => m.kind === "stop" && m.state === "current") : main.length - 1;

  // Side routes fork off the stop they belong to, into the other column.
  const sides: Array<{ kind: SideKind; from: number }> = [];
  const used = new Set<number>();
  const fork = (kind: SideKind, prefs: number[]) => {
    const i = prefs.find((p) => p >= 0 && p < main.length && !used.has(p));
    if (i !== undefined) { used.add(i); sides.push({ kind, from: i }); }
  };
  fork("daily", [0, 2]);
  // Figma: off the trainer just before START (2.6), or off START when a chest is before it (2.3).
  const beforeCur = main[currentIdx - 1]?.kind === "stop" ? currentIdx - 1 : currentIdx;
  fork("whos", [beforeCur, currentIdx, currentIdx + 1, 1]);
  // Always on the road; greyed out while no raid is live (owner ruling 2026-11-27).
  fork("mega", [main.length - 2, main.length - 1, main.length - 3]);

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
  // Figma 2.3 / 2.4 / 2.6: columns at x 105 and 285 of 390; the first stop's
  // middle 44 below the route's top; 120 between stops, 230 into START (the
  // partner walks that stretch), 150 after it (170 when a side route hangs
  // there), 180 into the gym, 126 after a first stop with a side route.
  const colX = (i: number) => (i % 2 === 0 ? (W * 105) / 390 : (W * 285) / 390);
  const hasSide = (i: number) => sides.some((s) => s.from === i);
  const placed: Placed[] = [];
  let y = currentIdx === 0 ? 154 : 44;
  main.forEach((m, i) => {
    if (i > 0) {
      const prevCur = i - 1 === currentIdx;
      const prevChest = main[i - 1].kind === "chest";
      y +=
        120 +
        (i === currentIdx ? (hasSide(i - 1) ? 60 : 130) : 0) +
        (prevChest ? -20 : 0) +
        (prevCur ? 30 + (hasSide(i - 1) ? 20 : 0) : 0) +
        (m.kind === "gym" ? 60 : 0) +
        (i === 1 && hasSide(0) ? 6 : 0);
    }
    placed.push({ key: m.key, cx: colX(i), cy: y, r: R[m.kind] });
  });
  const height = y + 190;
  // Where the road leaves stop i towards its neighbour (14px above/below the middle on through-stops).
  const att = (i: number, incoming: boolean): [number, number] => {
    const p = placed[i], o = placed[incoming ? i - 1 : i + 1];
    const dir = o.cx > p.cx ? 1 : -1;
    const dy = i > 0 && i < placed.length - 1 ? (incoming ? -14 : 14) : 0;
    return [p.cx + dir * (p.r + 6), p.cy + dy];
  };
  const segs = placed.slice(1).map((_, k) => seg(att(k, false), att(k + 1, true)));
  // Your partner on the trail into START: halfway (2.3), 60% once today is secured (2.6).
  const partnerSeg = currentIdx - 1;
  const partnerF = streak.secured ? 0.6 : 0.5;
  const partnerAt =
    partnerSeg >= 0 ? evenDots(segs[partnerSeg], 1).find((p) => p.d >= partnerF)! : { x: placed[0].cx, y: placed[0].cy - 108, d: 0 };

  // Open at the top like 2.3, scrolling only as far as it takes to show START above the tabs.
  const scrollRef = useRef<HTMLDivElement>(null);
  const curY = placed[currentIdx]?.cy ?? 0;
  useEffect(() => {
    const sc = scrollRef.current, wrap = wrapRef.current;
    if (!sc || !wrap) return;
    sc.scrollTop = Math.max(0, wrap.offsetTop + curY + 128 - sc.clientHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.region, route.gym, route.beaten]);

  if (!pokemon) return null;

  const bannerSub =
    left > 0
      ? `Defeat ${left} more trainer${left === 1 ? "" : "s"} to reach ${town}!`
      : gymOpen
        ? `${town} is open! Beat ${leader.name} for the ${leader.badge}!`
        : `${town} opens again on Monday.`;
  const hint = streak.secured
    ? `Your ${streak.days}-day streak is secured for today!`
    : streak.days > 0
      ? `Win one battle to keep your ${streak.days}-day streak!`
      : "Win a battle to start your streak!";

  function tapGym() {
    if (gymOpen) return onStartWeekly();
    if (left > 0) return toast(`Beat ${left} more trainer${left === 1 ? "" : "s"} to open ${town}!`);
    toast(weeklyHere && weeklyLeague?.status === "lost" ? `${leader.name} is ready for a rematch on Monday.` : `${town} opens on Monday.`);
  }

  const sideNode = (s: { kind: SideKind; from: number }) => {
    const fromP = placed[s.from];
    const cx = fromP.cx > W / 2 ? (W * 105) / 390 : (W * 285) / 390;
    const a = att(s.from, s.from === placed.length - 1);
    const dir = cx > a[0] ? 1 : -1;
    let label = "", chip = "", done = false, off = false, onClick = () => {};
    let art: React.ReactNode = null;
    if (s.kind === "daily") {
      label = "Daily Quest";
      done = dailyDone;
      chip = done ? "Done" : `${dailyHours} h left`;
      art = <PokemonSprite id={479} alt="" className="sprite h-[58px] w-[58px] scale-[1.45]" />;
      onClick = () => (done ? toast("Today's Daily Quest is done. A new one tomorrow!") : !loading && onStartDaily());
    } else if (s.kind === "whos") {
      label = "Who's That?";
      chip = whosReady ? "Play now" : `New in ${whosMin} min`;
      art = <PokemonSprite id={25} alt="" className="h-[50px] w-[50px] scale-[1.4] [filter:brightness(0)] [image-rendering:pixelated]" />;
      onClick = () => (whosReady ? navigate({ to: "/whos-that-pokemon" }) : toast(`A new round starts in ${whosMin} min.`));
    } else if (mega !== null && mega !== "none") {
      label = "Mega Raid";
      done = mega.disabled;
      const ms = Date.parse(mega.endsAt) - now;
      const dd = Math.floor(ms / 86_400_000), hh = Math.floor((ms % 86_400_000) / 3_600_000);
      chip = mega.reason === "cleared" ? "Cleared" : mega.reason === "exhausted" ? "No tries left" : `Ends in ${dd > 0 ? `${dd}d ` : ""}${hh}h`;
      art = <NaRewardIcon kind="XP" size={40} />;
      onClick = () => (!mega.disabled ? onStartMega() : toast("You're done with this Mega Raid."));
    } else {
      label = "Mega Raid";
      off = true;
      chip = mega === null ? "Checking" : "No raid now";
      art = <NaRewardIcon kind="XP" size={40} />;
      onClick = () => toast("No Mega Raid right now. Check back soon!");
    }
    return { cx, y: a[1], a, dir, label, chip, done, off, art, onClick };
  };

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
      className="h-full w-full overflow-y-auto pb-nav safe-x"
    >
      {/* Top bar — stays put while the route scrolls (2.4); it only gets a backing once something slides under it. */}
      <div
        className={`sticky top-0 z-20 flex items-center gap-2.5 px-4 pb-1.5 pt-[calc(env(safe-area-inset-top)+6px)] transition-colors ${
          scrolled ? "bg-night-base/85 backdrop-blur-md" : ""
        }`}
      >
        <div className="flex-1">
          <NaTopBar onAvatar={() => navigate({ to: "/profile" })} avatarLabel="Your profile" />
        </div>
      </div>

      {/* Route banner + the streak line (2.3): banner 7 below the top bar, the line 6 below it, the route right after. */}
      <div className="px-4 pt-[7px]">
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
        <div className="mt-1.5 flex justify-center">
          <span
            className={`flex items-center gap-1.5 rounded-full py-[5px] pl-1.5 pr-3 ${streak.secured ? "bg-success/[0.16]" : "bg-white/10"}`}
          >
            <NaRewardIcon kind="Streak" size={20} />
            <span className="na-caption text-foreground">{hint}</span>
          </span>
        </div>
      </div>

      {/* The route */}
      <div ref={wrapRef} className="relative mx-auto w-full max-w-[430px]" style={{ height }}>
        <svg className="pointer-events-none absolute inset-0" width={W} height={height} aria-hidden>
          {segs.map((sg, i) =>
            evenDots(sg, 14).map((p, j) => {
              if (Math.hypot(p.x - partnerAt.x, p.y - partnerAt.y) < 18) return null;
              const walked = i < partnerSeg || (i === partnerSeg && p.d <= partnerF);
              return <circle key={`${i}-${j}`} cx={p.x} cy={p.y} r={3} fill={walked ? "#FFC83D" : "rgba(244,246,255,0.3)"} />;
            }),
          )}
          {sides.map((s) => {
            const n = sideNode(s);
            return (
              <line
                key={s.kind}
                x1={n.a[0]}
                y1={n.a[1]}
                x2={n.cx - n.dir * (R.side + 6)}
                y2={n.a[1]}
                stroke={SIDE_COLOR[s.kind]}
                strokeOpacity={0.6}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="6 8"
              />
            );
          })}
        </svg>

        {main.map((m, i) => {
          const p = placed[i];
          if (m.kind === "stop") {
            const cur = m.state === "current";
            return (
              <div key={m.key} className="absolute flex w-[130px] -translate-x-1/2 flex-col items-center" style={{ left: p.cx, top: p.cy - R.stop }}>
                {cur && <span className="absolute -top-9"><StartTag /></span>}
                <button
                  type="button"
                  aria-label={cur ? `Battle ${m.label}` : m.label}
                  disabled={cur && loading}
                  onClick={() => (cur ? onStart() : m.state === "locked" ? toast(`Beat the trainers before ${m.label} first.`) : undefined)}
                  className={`flex h-[72px] w-[72px] items-center justify-center rounded-full press ${
                    m.state === "done"
                      ? "na-fill-gold shadow-[0_5px_0_#B07A00]"
                      : cur
                        ? "na-fill-brand shadow-[0_5px_0_#A3142C] outline outline-4 outline-offset-0 outline-foreground"
                        : "bg-night-card-2 shadow-[0_5px_0_#141A3F]"
                  }`}
                >
                  {m.state === "done" && <NaIcon name="check" size={32} className="text-on-gold" />}
                  {cur && <NaGlossIcon kind="star" size={32} />}
                  {m.state === "locked" && <NaGlossIcon kind="lock" size={28} />}
                </button>
                <span className={`na-caption mt-1.5 text-center ${m.state === "locked" ? "text-text-muted" : "text-text-secondary"}`}>{m.label}</span>
              </div>
            );
          }
          if (m.kind === "chest") {
            return (
              <div key={m.key} className="absolute flex w-[110px] -translate-x-1/2 flex-col items-center gap-1.5" style={{ left: p.cx, top: p.cy - R.chest }}>
                <button
                  type="button"
                  aria-label={gift.claimable ? `Day ${gift.nextDay} gift` : "Gift opened"}
                  onClick={() => setGiftOpen(true)}
                  className={`flex h-[72px] w-[72px] items-center justify-center rounded-full press ${
                    gift.claimable ? "na-fill-gold shadow-[0_5px_0_#B07A00]" : "bg-night-card-2 shadow-[0_5px_0_#141A3F]"
                  }`}
                >
                  {gift.claimable ? <NaRewardIcon kind="Gift" size={46} /> : <NaIcon name="check" size={30} className="text-reward-gold" />}
                </button>
                <span className={`na-caption text-center ${gift.claimable ? "text-reward-gold" : "text-text-secondary"}`}>
                  {gift.claimable ? `Day ${gift.nextDay} gift` : "Gift opened"}
                </span>
              </div>
            );
          }
          return (
            <div key={m.key} className="absolute flex w-[170px] -translate-x-1/2 flex-col items-center gap-1.5" style={{ left: p.cx, top: p.cy - R.gym }}>
              {gymOpen && <span className="absolute -top-9"><StartTag /></span>}
              <button
                type="button"
                aria-label={`${town}: ${leader.name}`}
                onClick={tapGym}
                disabled={gymOpen && loading}
                className="na-glow-gold flex h-[92px] w-[92px] items-center justify-center rounded-full border-[3px] border-reward-gold bg-night-card press"
              >
                <img src={leader.badgeIconUrl} alt={leader.badge} className="h-[62px] w-[62px] object-contain" />
              </button>
              <span className="na-label uppercase text-reward-gold">Weekly League</span>
              <span className="na-headline text-center text-foreground">{town}</span>
              <span className="na-caption text-center text-text-secondary">Beat {leader.name} to win the {leader.badge}!</span>
              <TimerChip text={weekUnused ? `Ends in ${weekDays} day${weekDays === 1 ? "" : "s"}` : "Opens Monday"} />
            </div>
          );
        })}

        {sides.map((s) => {
          const n = sideNode(s);
          return (
            <div key={s.kind} className="absolute flex w-[104px] -translate-x-1/2 flex-col items-center gap-1" style={{ left: n.cx, top: n.y - R.side }}>
              <button
                type="button"
                aria-label={n.label}
                onClick={n.onClick}
                className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-[2.5px] bg-night-card-2 shadow-[0_5px_0_#141A3F] press ${n.off ? "opacity-45 grayscale" : n.done ? "opacity-60" : ""}`}
                style={{ borderColor: SIDE_COLOR[s.kind] }}
              >
                {n.art}
              </button>
              <span className="na-body-strong text-center text-foreground">{n.label}</span>
              <TimerChip text={n.chip} done={n.done} color={n.off ? "#8E98CF" : SIDE_COLOR[s.kind]} />
            </div>
          );
        })}

        {/* Your partner on the trail, with a line (2.3 / 2.6) */}
        <div className="pointer-events-none absolute" style={{ left: partnerAt.x, top: partnerAt.y }}>
          <span className="absolute -left-5 -top-[5px] h-2.5 w-10 rounded-[50%] bg-night-deep/55" />
          <PokemonSprite id={pokemon.id} alt={pokemon.name} className="sprite absolute -left-8 -top-[40px] h-16 w-16 max-w-none origin-bottom scale-[2.1]" />
          <span
            className={`na-caption absolute -top-[43px] whitespace-nowrap rounded-xl bg-foreground px-2.5 py-1.5 text-night-base ${
              streak.secured ? "right-[34px]" : "left-[34px]"
            }`}
          >
            {streak.secured ? "See you tomorrow!" : "Let's go!"}
          </span>
        </div>
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