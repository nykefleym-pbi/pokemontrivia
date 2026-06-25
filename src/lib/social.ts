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
  // NOTE: trainer_name is intentionally omitted — it is owned by the claim flow
  // (claimTrainerName RPC) so that name-uniqueness collisions cannot block
  // routine level/xp/pokedex syncs.
  const payload = {
    id: uid,
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
      if (uid) {
        await syncProfile();
        await reconcileTrainerName();
      }
      return uid;
    })();
  }
  return bootstrapPromise;
}

/** Read the caller's current trainer name from the server. */
export async function getMyTrainerName(): Promise<string | null> {
  const uid = await ensureSession();
  if (!uid) return null;
  const { data, error } = await db
    .from("profiles")
    .select("trainer_name")
    .eq("id", uid)
    .single();
  if (error) { console.warn("[social] getMyTrainerName failed:", error.message); return null; }
  const name = (data as { trainer_name: string | null } | null)?.trainer_name ?? null;
  return name && name.trim() ? name : null;
}

/** One-time reconciliation for installs that onboarded before server-side claim existed. */
async function reconcileTrainerName(): Promise<void> {
  const s = useGameStore.getState();
  if (!s.hasOnboarded || s.isGuest || s.nameReconciled) return;
  const local = (s.trainerName ?? "").trim();
  if (!local) return;
  try {
    const serverName = await getMyTrainerName();
    if (serverName) {
      if (serverName.toLowerCase() === local.toLowerCase()) {
        useGameStore.getState().setNameReconciled(true);
      } else {
        useGameStore.getState().setName(serverName);
        useGameStore.getState().setNameReconciled(true);
      }
      return;
    }
    const res = await claimTrainerName(local);
    if (res.ok) {
      useGameStore.getState().setNameReconciled(true);
      useGameStore.getState().setNeedsNameReclaim(false);
    } else if (res.error === "taken") {
      useGameStore.getState().setNeedsNameReclaim(true);
    }
    // other errors: silently retry on next launch
  } catch (e) {
    console.warn("[social] reconcileTrainerName threw:", e);
  }
}


/** Look up a profile by friend code (preview before adding). */
export async function getProfileByCode(code: string): Promise<TrainerProfile | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const rpc = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await rpc.rpc("lookup_profile_by_code", { _code: clean });
  if (error) { console.warn("[social] getProfileByCode failed:", error.message); return null; }
  if (!data || (typeof data === "object" && !(data as { id?: string }).id)) return null;
  return data as TrainerProfile;
}

/** Send a friend request by code. Friendship becomes mutual only after the recipient accepts. */
export async function addFriendByCode(code: string): Promise<{
  profile?: TrainerProfile;
  status?: "pending" | "accepted" | "already_pending";
  error?: string;
}> {
  const uid = await ensureSession();
  if (!uid) return { error: "No session yet — try again in a moment." };
  const profile = await getProfileByCode(code);
  if (!profile) return { error: "No trainer found with that code." };
  if (profile.id === uid) return { error: "That's your own code!" };
  try {
    const rpc = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { data, error } = await rpc.rpc("send_friend_request", { _code: code.trim().toUpperCase() });
    if (error) {
      console.warn("[social] send_friend_request failed:", error.message);
      return { error: "Couldn't send request, try again." };
    }
    const r = data as { ok?: boolean; status?: string; error?: string } | null;
    if (r && r.ok === true) {
      const status = (r.status as "pending" | "accepted" | "already_pending") ?? "pending";
      return { profile, status };
    }
    const err = (r && r.error) || "";
    const msg =
      err === "not_found" ? "No trainer found with that code." :
      err === "self" ? "That's your own code!" :
      err === "already_friends" ? "You're already friends." :
      err === "no_session" ? "No session yet — try again in a moment." :
      "Couldn't send request, try again.";
    return { error: msg };
  } catch (e) {
    console.warn("[social] addFriendByCode threw:", e);
    return { error: "Couldn't send request, try again." };
  }
}

/** List the caller's pending incoming friend requests with requester display info. */
export async function listIncomingFriendRequests(): Promise<Array<{
  requestId: string;
  fromId: string;
  trainerName: string;
  trainerSprite: string;
  level: number;
  friendCode: string;
  createdAt: string;
}>> {
  try {
    const rpc = supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { data, error } = await rpc.rpc("list_incoming_friend_requests", {});
    if (error) { console.warn("[social] listIncomingFriendRequests failed:", error.message); return []; }
    const rows = (data as Array<{
      request_id: string;
      from_id: string;
      trainer_name: string | null;
      trainer_sprite: string | null;
      level: number | null;
      friend_code: string | null;
      created_at: string;
    }>) ?? [];
    return rows.map((r) => ({
      requestId: r.request_id,
      fromId: r.from_id,
      trainerName: r.trainer_name ?? "",
      trainerSprite: r.trainer_sprite ?? "red",
      level: r.level ?? 1,
      friendCode: r.friend_code ?? "",
      createdAt: r.created_at,
    }));
  } catch (e) {
    console.warn("[social] listIncomingFriendRequests threw:", e);
    return [];
  }
}

/** Accept or decline an incoming friend request. */
export async function respondFriendRequest(
  requestId: string,
  accept: boolean,
): Promise<{ ok: true; status: "accepted" | "declined" } | { ok: false; error: string }> {
  try {
    const rpc = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { data, error } = await rpc.rpc("respond_friend_request", { _request_id: requestId, _accept: accept });
    if (error) { console.warn("[social] respondFriendRequest failed:", error.message); return { ok: false, error: "network" }; }
    const r = data as { ok?: boolean; status?: string; error?: string } | null;
    if (r && r.ok === true && (r.status === "accepted" || r.status === "declined")) {
      return { ok: true, status: r.status };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[social] respondFriendRequest threw:", e);
    return { ok: false, error: "network" };
  }
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

/** Check whether a trainer name is free (case-insensitive). */
export async function isTrainerNameAvailable(name: string): Promise<boolean> {
  const rpc = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await rpc.rpc("is_trainer_name_available", { _name: name });
  if (error) { console.warn("[social] isTrainerNameAvailable failed:", error.message); return false; }
  return data === true;
}

/** Claim a trainer name for the current user. */
export async function claimTrainerName(name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const rpc = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { data, error } = await rpc.rpc("claim_trainer_name", { _name: name });
    if (error) { console.warn("[social] claimTrainerName failed:", error.message); return { ok: false, error: "network" }; }
    const result = data as { ok?: boolean; error?: string } | null;
    if (result && result.ok === true) return { ok: true };
    return { ok: false, error: (result && result.error) || "network" };
  } catch (e) {
    console.warn("[social] claimTrainerName threw:", e);
    return { ok: false, error: "network" };
  }
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
