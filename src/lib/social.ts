import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";

// Loosely-typed table client so this compiles even before Supabase types regenerate.
const db = supabase as unknown as { from: (t: string) => any };

export interface TrainerProfile {
  id: string;
  friend_code: string;
  trainer_name: string;
  trainer_sprite: string;
  level: number;
  xp: number;
  pokedex_count: number;
  ace_pokemon_id: number | null;
  updated_at: string;
}

let bootstrapPromise: Promise<string | null> | null = null;

/** Ensure an anonymous session exists; returns the user id (or null on failure). */
export async function ensureSession(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) { console.warn("[social] anon sign-in failed:", error.message); return null; }
  return data.user?.id ?? null;
}

/** Push the local trainer up to the profiles table; cache the friend code. */
export async function syncProfile(): Promise<TrainerProfile | null> {
  const uid = await ensureSession();
  if (!uid) return null;
  const s = useGameStore.getState();
  const payload = {
    id: uid,
    trainer_name: s.trainerName || "Trainer",
    trainer_sprite: s.trainerSprite || "red",
    level: s.level ?? 1,
    xp: s.xp ?? 0,
    pokedex_count: Object.keys(s.pokedex ?? {}).length,
    ace_pokemon_id: s.pokemon?.id ?? null,
  };
  const { data, error } = await db
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();
  if (error) { console.warn("[social] syncProfile failed:", error.message); return null; }
  if (data?.friend_code) useGameStore.getState().setFriendCode(data.friend_code);
  return data as TrainerProfile;
}

/** Idempotent app-load bootstrap (runs once). */
export function bootstrapSocial(): Promise<string | null> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const uid = await ensureSession();
      if (uid) await syncProfile();
      return uid;
    })();
  }
  return bootstrapPromise;
}

/** Look up a profile by friend code (preview before adding). */
export async function getProfileByCode(code: string): Promise<TrainerProfile | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const { data, error } = await db
    .from("profiles").select("*").eq("friend_code", clean).maybeSingle();
  if (error) { console.warn("[social] getProfileByCode failed:", error.message); return null; }
  return (data as TrainerProfile) ?? null;
}

/** Add a friend by code. Returns { profile } or { error }. */
export async function addFriendByCode(code: string): Promise<{ profile?: TrainerProfile; error?: string }> {
  const uid = await ensureSession();
  if (!uid) return { error: "No session yet — try again in a moment." };
  const profile = await getProfileByCode(code);
  if (!profile) return { error: "No trainer found with that code." };
  if (profile.id === uid) return { error: "That's your own code!" };
  const { error } = await db.from("friends").insert({ owner_id: uid, friend_id: profile.id });
  if (error && !String(error.message).toLowerCase().includes("duplicate")) return { error: error.message };
  return { profile };
}

/** List the current user's friends (their profiles). */
export async function listFriends(): Promise<TrainerProfile[]> {
  const uid = await ensureSession();
  if (!uid) return [];
  const { data, error } = await db
    .from("friends")
    .select("friend:profiles!friends_friend_id_fkey(*)")
    .eq("owner_id", uid);
  if (error) { console.warn("[social] listFriends failed:", error.message); return []; }
  return (data ?? []).map((r: any) => r.friend).filter(Boolean) as TrainerProfile[];
}

/** Remove a friend. */
export async function removeFriend(friendId: string): Promise<boolean> {
  const uid = await ensureSession();
  if (!uid) return false;
  const { error } = await db.from("friends").delete().eq("owner_id", uid).eq("friend_id", friendId);
  return !error;
}

/** Hook: bootstrap social identity once, after onboarding. */
export function useEnsureSocial() {
  const ranRef = useRef(false);
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  useEffect(() => {
    if (ranRef.current || !hasOnboarded) return;
    ranRef.current = true;
    void bootstrapSocial();
  }, [hasOnboarded]);
}
