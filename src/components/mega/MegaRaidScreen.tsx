import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PokemonSprite } from "@/components/game-ui";
import type { Trivia } from "@/components/battle-screen";
import { useGameStore } from "@/lib/store";
import { ITEMS, type ItemId } from "@/lib/game-data";
import {
  MEGA_BOSS_HP,
  MEGA_SHINY_CHANCE,
  MEGA_MAX_ATTEMPTS,
  type MegaEvent,
} from "@/lib/mega/schedule";
import { submitMegaRun } from "@/lib/mega/runs";
import { MegaResults, type MegaRewardItem } from "@/components/mega/MegaResults";

const PLAYER_MAX_HP = 100;
const TIMER = 20;
const BOSS_DMG = 10; // per correct answer; 40 correct depletes 400 HP
const PLAYER_DMG = 8; // per wrong answer
const TYPE_COLORS: Record<string, string> = {
  fire: "#EE8130", dragon: "#6F35FC", water: "#6390F0", grass: "#7AC74C", electric: "#F7D02C",
  ice: "#96D9D6", fighting: "#C22E28", poison: "#A33EA1", ground: "#E2BF65", flying: "#A98FF3",
  psychic: "#F95587", bug: "#A6B91A", rock: "#B6A136", ghost: "#735797", dark: "#705746",
  steel: "#B7B7CE", fairy: "#D685AD", normal: "#A8A77A",
};

const HEAL: Partial<Record<ItemId, number>> = { potion: 30, superpotion: 60, maxpotion: PLAYER_MAX_HP };
const REWARD_POOL: ItemId[] = ["potion", "superpotion", "maxpotion", "xattack", "scope", "xaccuracy", "candy", "luckyegg"];

function itemDef(id: ItemId) {
  return ITEMS.find((i) => i.id === id);
}

interface Props {
  event: MegaEvent;
  questions: Trivia[];
  onExit: () => void;
  onViewLeaderboard: () => void;
  onRematch: () => void;
}

export function MegaRaidScreen({ event, questions, onExit, onViewLeaderboard, onRematch }: Props) {
  const total = questions.length;
  const inventory = useGameStore((s) => s.inventory);
  const grantItem = useGameStore((s) => s.grantItem);

  const [bossShiny] = useState(() => Math.random() < MEGA_SHINY_CHANCE);
  const [qIndex, setQIndex] = useState(0);
  const [bossHp, setBossHp] = useState(MEGA_BOSS_HP);
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [timer, setTimer] = useState(TIMER);
  const [picked, setPicked] = useState<number | null>(null);
  const [locked, setLocked] = useState(false); // showing feedback
  const [correctCount, setCorrectCount] = useState(0);
  const [bagOpen, setBagOpen] = useState(false);
  const [phase, setPhase] = useState<"fighting" | "result">("fighting");

  const [usedOnce, setUsedOnce] = useState<Set<ItemId>>(new Set());
  const [xAtkArmed, setXAtkArmed] = useState(false);
  const [removedWrong, setRemovedWrong] = useState<number | null>(null);
  const [revealCorrect, setRevealCorrect] = useState(false);

  const startRef = useRef<number>(Date.now());
  const escapedRef = useRef(false);
  const endedRef = useRef(false);

  const [result, setResult] = useState<{
    outcome: "win" | "loss"; accuracy: number; correct: number; rank: number | null; attempts: number; items: MegaRewardItem[];
  } | null>(null);

  const q = questions[qIndex];
  const lowHp = playerHp / PLAYER_MAX_HP <= 0.3 && playerHp > 0;
  const hasAnyPotion = (["potion", "superpotion", "maxpotion"] as ItemId[]).some((id) => (inventory[id] ?? 0) > 0);
  

  const grantRewards = useCallback((): MegaRewardItem[] => {
    const st = useGameStore.getState();
    st.addXp(event.reward.xp);
    const partner = st.pokemon;
    if (partner) st.addTrainingPoints(partner.id, event.reward.tp);
    st.recordPokedexCapture(event.reward.dexId, bossShiny);
    st.grantPokeEgg(1);
    const counts = new Map<ItemId, number>();
    for (let i = 0; i < event.reward.items; i++) {
      const id = REWARD_POOL[Math.floor(Math.random() * REWARD_POOL.length)];
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const summary: MegaRewardItem[] = [];
    counts.forEach((qty, id) => {
      st.grantItem(id, qty);
      const def = itemDef(id);
      if (def) summary.push({ id, name: def.name, iconUrl: def.iconUrl, qty });
    });
    return summary;
  }, [event, bossShiny]);

  const finish = useCallback(
    async (won: boolean, finalCorrect: number) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const timeMs = Date.now() - startRef.current;
      const accuracy = Math.round((finalCorrect / total) * 100);
      const items = won ? grantRewards() : [];
      let rank: number | null = null;
      let attempts = MEGA_MAX_ATTEMPTS;
      const res = await submitMegaRun({ eventId: event.id, accuracy, correct: finalCorrect, total, timeMs });
      if (res.ok) { rank = res.rank || null; attempts = res.row?.attempts ?? MEGA_MAX_ATTEMPTS; }
      else if (res.error && !/no attempts/i.test(res.error)) {
        toast.error("Couldn't save your run — check your connection.");
      }
      setResult({ outcome: won ? "win" : "loss", accuracy, correct: finalCorrect, rank, attempts, items });
      setPhase("result");
    },
    [event, total, grantRewards],
  );

  const advance = useCallback(
    (nextCorrect: number, nextBossHp: number, nextPlayerHp: number) => {
      if (nextBossHp <= 0) { void finish(true, nextCorrect); return; }
      if (nextPlayerHp <= 0) { void finish(false, nextCorrect); return; }
      if (qIndex + 1 >= total) { void finish(nextCorrect >= MEGA_BOSS_HP / BOSS_DMG, nextCorrect); return; }
      setQIndex((i) => i + 1);
      setPicked(null);
      setLocked(false);
      setRemovedWrong(null);
      setRevealCorrect(false);
      setTimer(TIMER);
    },
    [qIndex, total, finish],
  );

  const answer = useCallback(
    (idx: number | null) => {
      if (locked || phase !== "fighting") return;
      setLocked(true);
      setPicked(idx);
      const isCorrect = idx !== null && idx === q.correct;
      let nextBoss = bossHp;
      let nextPlayer = playerHp;
      let nextCorrect = correctCount;
      if (isCorrect) {
        nextCorrect += 1;
        nextBoss = Math.max(0, bossHp - BOSS_DMG * (xAtkArmed ? 2 : 1));
        setCorrectCount(nextCorrect);
        setBossHp(nextBoss);
      } else {
        nextPlayer = Math.max(0, playerHp - PLAYER_DMG);
        setPlayerHp(nextPlayer);
      }
      setXAtkArmed(false);
      window.setTimeout(() => advance(nextCorrect, nextBoss, nextPlayer), 1100);
    },
    [locked, phase, q, bossHp, playerHp, correctCount, xAtkArmed, advance],
  );

  useEffect(() => {
    if (phase !== "fighting" || locked || bagOpen) return;
    if (timer <= 0) { answer(null); return; }
    const t = window.setTimeout(() => setTimer((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [timer, locked, bagOpen, phase, answer]);

  const usePotion = useCallback(
    (id: ItemId) => {
      if ((inventory[id] ?? 0) <= 0) return;
      const heal = HEAL[id] ?? 0;
      if (playerHp >= PLAYER_MAX_HP) { toast("HP already full"); return; }
      setPlayerHp((hp) => Math.min(PLAYER_MAX_HP, hp + heal));
      grantItem(id, -1);
      toast.success(`${itemDef(id)?.name} used`);
    },
    [inventory, playerHp, grantItem],
  );

  const useBattleItem = useCallback(
    (id: ItemId) => {
      if (usedOnce.has(id) || (inventory[id] ?? 0) <= 0 || locked) return;
      if (id === "xattack") setXAtkArmed(true);
      if (id === "scope") {
        const wrongs = [0, 1, 2, 3].filter((i) => i !== q.correct);
        setRemovedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
      }
      if (id === "xaccuracy") setRevealCorrect(true);
      grantItem(id, -1);
      setUsedOnce((s) => new Set(s).add(id));
      toast.success(`${itemDef(id)?.name} used`);
      setBagOpen(false);
    },
    [usedOnce, inventory, locked, q, grantItem],
  );

  const escape = useCallback(() => {
    if ((inventory.escape ?? 0) <= 0) { toast.error("No Escape Rope in your bag"); return; }
    escapedRef.current = true;
    endedRef.current = true;
    grantItem("escape", -1);
    toast("You fled the raid — this attempt doesn't count.");
    onExit();
  }, [inventory, grantItem, onExit]);

  if (phase === "result" && result) {
    return (
      <MegaResults
        event={event}
        outcome={result.outcome}
        accuracy={result.accuracy}
        correct={result.correct}
        total={total}
        timeMs={Date.now() - startRef.current}
        rank={result.rank}
        shiny={bossShiny}
        items={result.items}
        canRematch={result.outcome === "loss" && result.attempts < MEGA_MAX_ATTEMPTS}
        onRematch={onRematch}
        onHome={onExit}
        onViewLeaderboard={onViewLeaderboard}
      />
    );
  }

  const bossPct = Math.max(0, (bossHp / MEGA_BOSS_HP) * 100);
  const playerPct = Math.max(0, (playerHp / PLAYER_MAX_HP) * 100);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: "#14161F", fontFamily: "Outfit, sans-serif" }}>
      <div
        className="relative px-4 pb-3.5"
        style={{ paddingTop: 48, background: "radial-gradient(circle at 50% 30%, #2E3A5C 0%, #1C2333 58%, #14161F 100%)", overflow: "hidden" }}
      >
        <div className="absolute inset-0" style={{ background: "repeating-conic-gradient(from 0deg at 50% 26%, rgba(242,214,78,0.14) 0deg 6deg, transparent 6deg 13deg)" }} />
        <div className="relative text-center">
          <div className="text-[22px] font-black text-white">{event.name}{bossShiny ? " ✨" : ""}</div>
          <div className="mt-1.5 flex justify-center gap-1.5">
            {event.types.map((t) => (
              <span key={t} className="font-pixel text-white" style={{ fontSize: 6, background: TYPE_COLORS[t] ?? "#777", padding: "4px 9px", borderRadius: 999 }}>
                {t.toUpperCase()}
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="font-pixel text-white" style={{ fontSize: 7 }}>HP</span>
            <div className="flex-1 overflow-hidden" style={{ height: 14, borderRadius: 999, background: "rgba(0,0,0,0.35)", border: "1.5px solid rgba(255,255,255,0.25)" }}>
              <div style={{ width: `${bossPct}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #F2D64E, #EE8130)", transition: "width 0.4s" }} />
            </div>
            <span className="font-pixel text-white" style={{ fontSize: 7 }}>{bossHp}/{MEGA_BOSS_HP}</span>
          </div>
        </div>
        <div className="relative mt-1.5 flex justify-center">
          <div className="absolute" style={{ bottom: 8, width: 150, height: 26, borderRadius: "50%", background: "rgba(0,0,0,0.35)" }} />
          <PokemonSprite id={event.megaId} shiny={bossShiny} alt={event.name} className="relative h-[150px] w-[150px] object-contain [filter:drop-shadow(0_8px_14px_rgba(0,0,0,0.55))]" />
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-4 pt-2.5" style={{ background: "#14161F" }}>
        <PartnerSprite />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-white"><PartnerName /></span>
            <span className="font-pixel" style={{ fontSize: 6.5, color: "#E23B2E" }}>{playerHp}/{PLAYER_MAX_HP}</span>
          </div>
          <div className="mt-1 overflow-hidden" style={{ height: 9, borderRadius: 999, background: "rgba(255,255,255,0.12)" }}>
            <div style={{ width: `${playerPct}%`, height: "100%", borderRadius: 999, background: lowHp ? "#E23B2E" : "#3F9D5A", transition: "width 0.4s" }} />
          </div>
        </div>
      </div>

      <div className="px-4 pt-2 text-center font-pixel" style={{ fontSize: 6.5, color: "rgba(255,255,255,0.5)" }}>
        QUESTION {qIndex + 1} / {total} · {correctCount} CORRECT
      </div>

      <div className="relative mt-2.5 flex-1 overflow-y-auto" style={{ background: "#fff", borderRadius: "32px 32px 0 0", boxShadow: "0 -12px 36px -14px rgba(20,16,40,0.4)", padding: "18px 20px 26px" }}>
        <div className="absolute left-1/2 flex items-center gap-2" style={{ top: -22, transform: "translateX(-50%)", background: "#fff", borderRadius: 999, padding: "7px 16px 7px 8px", boxShadow: "0 10px 24px -8px rgba(20,16,40,0.4)" }}>
          <svg width="30" height="30" viewBox="0 0 30 30">
            <circle cx="15" cy="15" r="12" fill="none" stroke="oklch(0.92 0.02 250)" strokeWidth="4" />
            <circle cx="15" cy="15" r="12" fill="none" stroke={timer <= 5 ? "#E23B2E" : "#3F9D5A"} strokeWidth="4" strokeDasharray="75.4" strokeDashoffset={75.4 * (1 - timer / TIMER)} strokeLinecap="round" transform="rotate(-90 15 15)" />
          </svg>
          <span className="text-base font-extrabold" style={{ color: timer <= 5 ? "#E23B2E" : "#3F9D5A" }}>{timer}s</span>
        </div>

        {lowHp && hasAnyPotion && (
          <div className="mt-2 flex items-center justify-between rounded-2xl px-3.5 py-2.5" style={{ background: "rgba(226,59,46,0.1)", border: "1.5px solid rgba(226,59,46,0.4)" }}>
            <span className="text-[13px] font-bold" style={{ color: "#C22E28" }}>⚠️ Low HP — use a potion!</span>
            <button onClick={() => setBagOpen(true)} className="font-pixel" style={{ fontSize: 7, color: "#fff", background: "#E23B2E", borderRadius: 999, padding: "6px 11px" }}>OPEN BAG</button>
          </div>
        )}

        <div className="mt-3 text-center font-pixel" style={{ fontSize: 7, color: "#6B6E7B" }}>{q.category?.toUpperCase() || "TRIVIA"}</div>
        <div className="mt-2.5 flex min-h-[72px] items-center justify-center text-center text-[19px] font-bold leading-snug text-foreground [text-wrap:pretty]">{q.question}</div>

        <div className="mt-3.5 flex flex-col gap-2.5">
          {q.options.map((opt, i) => {
            const isCorrect = i === q.correct;
            const isPicked = i === picked;
            const removed = removedWrong === i;
            let bg = "oklch(0.96 0.01 250)", border = "2px solid transparent", color = "#3A3F4C";
            if (revealCorrect && isCorrect && !locked) { border = "2px solid #3F9D5A"; }
            if (locked) {
              if (isCorrect) { bg = "rgba(63,157,90,0.16)"; border = "2px solid #3F9D5A"; color = "#2E7D44"; }
              else if (isPicked) { bg = "rgba(226,59,46,0.12)"; border = "2px solid rgba(226,59,46,0.6)"; color = "#C22E28"; }
            }
            return (
              <button
                key={i}
                disabled={locked || removed}
                onClick={() => answer(i)}
                className="flex h-[52px] items-center justify-between rounded-2xl px-4 text-left text-base font-semibold"
                style={{ background: bg, border, color, opacity: removed ? 0.35 : 1 }}
              >
                <span>{opt}</span>
                {locked && isCorrect && <span style={{ color: "#3F9D5A" }}>✓</span>}
                {locked && isPicked && !isCorrect && <span style={{ color: "#C22E28" }}>✕</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-center gap-3">
          <DockItem id="potion" count={inventory.potion ?? 0} onClick={() => usePotion("potion")} disabled={locked} />
          <DockItem id="superpotion" count={inventory.superpotion ?? 0} onClick={() => usePotion("superpotion")} disabled={locked} />
          <button onClick={() => setBagOpen(true)} className="flex h-[50px] items-center rounded-full px-4 font-pixel" style={{ fontSize: 7, color: "#1C2333", background: "#F2D64E", boxShadow: "0 3px 0 #C9AE2E" }}>BAG</button>
        </div>
      </div>

      {bagOpen && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={() => setBagOpen(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(10,8,20,0.55)" }} />
          <div className="relative" style={{ background: "#FBF3DF", borderRadius: "28px 28px 0 0", padding: "14px 20px 32px", boxShadow: "0 -16px 40px -12px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto" style={{ width: 42, height: 5, borderRadius: 999, background: "#E2D6B6" }} />
            <div className="mt-3.5 flex items-center justify-between">
              <div className="text-xl font-black" style={{ color: "#1C2333" }}>Bag</div>
              <div className="font-pixel" style={{ fontSize: 7, color: "#9A7320", background: "#F6E6C4", borderRadius: 999, padding: "6px 10px" }}>RAID RULES</div>
            </div>
            <div className="mt-2 font-pixel" style={{ fontSize: 7, letterSpacing: 1, color: "#6B6E7B" }}>HEALING · STACKABLE</div>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {(["potion", "superpotion", "maxpotion"] as ItemId[]).map((id) => (
                <BagRow key={id} id={id} count={inventory[id] ?? 0} subtitle={`Restore ${HEAL[id]} HP · stack freely`} onUse={() => usePotion(id)} disabled={(inventory[id] ?? 0) <= 0 || playerHp >= PLAYER_MAX_HP} />
              ))}
            </div>
            <div className="mt-3.5 font-pixel" style={{ fontSize: 7, letterSpacing: 1, color: "#6B6E7B" }}>BATTLE · ONCE PER BATTLE</div>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {(["xattack", "scope", "xaccuracy"] as ItemId[]).map((id) => (
                <BagRow key={id} id={id} count={inventory[id] ?? 0} subtitle={itemDef(id)?.desc ?? ""} used={usedOnce.has(id)} onUse={() => useBattleItem(id)} disabled={usedOnce.has(id) || (inventory[id] ?? 0) <= 0 || locked} />
              ))}
            </div>
            <button onClick={escape} className="mt-4 flex h-12 w-full items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "rgba(28,35,51,0.9)" }}>
              🪢 Flee with Escape Rope (doesn't count)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PartnerSprite() {
  const partner = useGameStore((s) => s.pokemon);
  if (!partner) return <div style={{ width: 58, height: 58 }} />;
  return <PokemonSprite id={partner.id} back alt={partner.name} className="h-[58px] w-[58px]" />;
}
function PartnerName() {
  const partner = useGameStore((s) => s.pokemon);
  return <>{partner?.name ?? "Partner"}</>;
}

function DockItem({ id, count, onClick, disabled }: { id: ItemId; count: number; onClick: () => void; disabled?: boolean }) {
  const def = itemDef(id);
  const off = count <= 0 || disabled;
  return (
    <button onClick={onClick} disabled={off} className="relative flex h-[50px] w-[50px] items-center justify-center rounded-full" style={{ background: "oklch(0.96 0.01 250)", border: "1.5px solid oklch(0.9 0.02 250)", opacity: off ? 0.45 : 1 }}>
      <img src={def?.iconUrl} alt={def?.name} className="h-8 w-8 [image-rendering:pixelated]" />
      {count > 0 && (
        <span className="absolute flex items-center justify-center font-bold text-white" style={{ top: -4, right: -4, minWidth: 18, height: 18, fontSize: 10, borderRadius: 999, background: "#1C2333" }}>{count}</span>
      )}
    </button>
  );
}

function BagRow({ id, count, subtitle, used, onUse, disabled }: { id: ItemId; count: number; subtitle: string; used?: boolean; onUse: () => void; disabled?: boolean }) {
  const def = itemDef(id);
  return (
    <div className="flex items-center gap-3 rounded-2xl px-3.5 py-3" style={{ background: "#FDF8EC", boxShadow: "0 3px 0 #ECE2C8", opacity: disabled && !used ? 0.55 : 1 }}>
      <div className="flex h-[46px] w-[46px] items-center justify-center rounded-xl" style={{ background: "#F7DACB" }}>
        <img src={def?.iconUrl} alt={def?.name} className="h-8 w-8 [image-rendering:pixelated]" />
      </div>
      <div className="flex-1">
        <div className="text-[15px] font-bold" style={{ color: "#1C2333" }}>{def?.name} {count > 0 && <span style={{ color: "#6B6E7B" }}>×{count}</span>}</div>
        <div className="text-xs" style={{ color: "#6B6E7B" }}>{subtitle}</div>
      </div>
      <button onClick={onUse} disabled={disabled} className="font-pixel" style={{ fontSize: 6.5, color: used ? "#6B6E7B" : "#fff", background: used ? "#EFE7D2" : disabled ? "#C9B998" : "#E23B2E", borderRadius: 999, padding: "8px 11px" }}>
        {used ? "USED" : "USE"}
      </button>
    </div>
  );
}
