import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PokeEntry, PokeType } from "@/lib/pokemon-data.generated";

// Loosely-typed table client so this compiles even before Supabase types regenerate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase Database type doesn't yet include the mega_* tables; chained query builder needs a loose return.
const db = supabase as unknown as { from: (t: string) => any };

export const MEGA_BOSS_HP = 400;
/** Boss damage per correct answer. */
export const MEGA_BOSS_DMG = 10;
/** Correct answers needed to deplete the boss (a winning run). */
export const MEGA_WIN_CORRECT = MEGA_BOSS_HP / MEGA_BOSS_DMG;
export const MEGA_SHINY_CHANCE = 0.1;
export const MEGA_QUESTION_COUNT = 50;
/** First try + 1 retake. */
export const MEGA_MAX_ATTEMPTS = 2;

export const MEGA_REWARD = { xp: 2500, coins: 2500, tp: 1000, items: 10 } as const;
export function megaRankScale(rank: number): number {
  if (rank === 1) return 1;
  if (rank === 2) return 0.5;
  if (rank === 3) return 0.3;
  return 0.05;
}

export interface MegaReward {
  xp: number;
  tp: number;
  items: number;
  egg: boolean;
  dexId: number; // base final-evolution Pokédex entry awarded on a win
}

export interface ChampionReward {
  xp: number;
  tp: number;
  items: number;
  trophyId: string;
  trophyName: string;
}

export interface MegaEvent {
  id: string;
  megaId: number;
  name: string;
  baseName: string;
  baseDexId: number;
  types: PokeType[];
  startsAt: string;
  endsAt: string;
  reward: MegaReward;
  champion: ChampionReward;
}

interface MegaEventRow {
  id: string;
  mega_id: number;
  name: string;
  base_name: string;
  base_dex_id: number;
  types: PokeType[] | null;
  starts_at: string;
  ends_at: string;
  win_xp: number;
  win_tp: number;
  win_items: number;
  champ_xp: number;
  champ_tp: number;
  champ_items: number;
  trophy_id: string;
  trophy_name: string;
}

function mapEvent(r: MegaEventRow): MegaEvent {
  return {
    id: r.id,
    megaId: r.mega_id,
    name: r.name,
    baseName: r.base_name,
    baseDexId: r.base_dex_id,
    types: (r.types ?? []) as PokeType[],
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    reward: { xp: r.win_xp, tp: r.win_tp, items: r.win_items, egg: true, dexId: r.base_dex_id },
    champion: {
      xp: r.champ_xp,
      tp: r.champ_tp,
      items: r.champ_items,
      trophyId: r.trophy_id,
      trophyName: r.trophy_name,
    },
  };
}

/** The event whose [startsAt, endsAt) window contains `now`, or null. */
export async function fetchActiveMegaEvent(
  now: Date = new Date(),
  retries = 3,
): Promise<MegaEvent | null> {
  const iso = now.toISOString();
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { data, error } = await db
      .from("mega_events")
      .select("*")
      .lte("starts_at", iso)
      .gt("ends_at", iso)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) return data ? mapEvent(data) : null;
    console.warn("[mega] fetchActiveMegaEvent failed:", error.message);
    if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return null;
}

/** Look up a single event by id (used by the leaderboard + champion-claim flows). */
export async function fetchMegaEvent(id: string): Promise<MegaEvent | null> {
  const { data, error } = await db.from("mega_events").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.warn("[mega] fetchMegaEvent failed:", error.message);
    return null;
  }
  return data ? mapEvent(data) : null;
}

/** Build a PokeEntry-shaped boss for the battle system from a Mega event. */
export function megaToEntry(ev: MegaEvent): PokeEntry {
  return {
    id: ev.megaId,
    slug: ev.name.toLowerCase().replace(/\s+/g, "-"),
    name: ev.name,
    types: ev.types,
    evolvesFromId: ev.baseDexId,
    evolvesToIds: [],
    evolutionStage: 3,
    isFullyEvolved: true,
  };
}

/** True while the event is live (submissions accepted). */
export function isMegaEventActive(ev: MegaEvent, now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= Date.parse(ev.startsAt) && t < Date.parse(ev.endsAt);
}

/** React hook: load the currently-active Mega event once. */
export function useActiveMegaEvent(): { event: MegaEvent | null; loading: boolean } {
  const [event, setEvent] = useState<MegaEvent | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let on = true;
    fetchActiveMegaEvent().then((e) => {
      if (on) {
        setEvent(e);
        setLoading(false);
      }
    });
    return () => {
      on = false;
    };
  }, []);
  return { event, loading };
}
