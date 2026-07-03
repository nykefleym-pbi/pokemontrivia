import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";

// Loosely-typed table client so this compiles even before Supabase types regenerate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase Database type doesn't yet include every table here; chained query builder needs a loose return.
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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn("[social] anon sign-in failed:", error.message);
    return null;
  }
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
  if (error) {
    console.warn("[social] syncProfile failed:", error.message);
    return null;
  }
  if (data?.friend_code) useGameStore.getState().setFriendCode(data.friend_code);
  return data as TrainerProfile;
}

export type ActivityField =
  | "last_daily_claim"
  | "last_weekly_attempt"
  | "last_whos_that_played"
  | "last_mega_played"
  | "last_gift_claim";

/**
 * Fire-and-forget: stamp a "last played this mode" timestamp on the caller's
 * profile row, so the server-side reminder cron can tell who's overdue for a
 * push without needing to know each device's local state. Silently no-ops if
 * there's no session yet (guest not yet onboarded) — never blocks gameplay.
 */
export async function syncActivity(field: ActivityField): Promise<void> {
  const uid = await ensureSession();
  if (!uid) return;
  const { error } = await db
    .from("profiles")
    .update({ [field]: new Date().toISOString() })
    .eq("id", uid);
  if (error) console.warn(`[social] syncActivity(${field}) failed:`, error.message);
}

/**
 * Fire-and-forget push trigger. The Edge Function independently re-verifies
 * that the underlying friend_request/friendship actually exists before
 * sending, so a caller can't use this to push arbitrary notifications.
 */
async function notifyPush(
  kind: "friend_request" | "friend_accepted",
  toUserId: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-push", {
      body: { kind, toUserId, title, body },
    });
    if (error) console.warn(`[social] notifyPush(${kind}) failed:`, error.message);
  } catch (e) {
    console.warn(`[social] notifyPush(${kind}) threw:`, e);
  }
}

/** Push the original requester once their friend request has been accepted. */
export async function notifyFriendAccepted(requesterId: string): Promise<void> {
  const myName = useGameStore.getState().trainerName || "A trainer";
  await notifyPush(
    "friend_accepted",
    requesterId,
    "Friend request accepted",
    `${myName} accepted your friend request!`,
  );
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
  const { data, error } = await db.from("profiles").select("trainer_name").eq("id", uid).single();
  if (error) {
    console.warn("[social] getMyTrainerName failed:", error.message);
    return null;
  }
  const name = (data as { trainer_name: string | null } | null)?.trainer_name ?? null;
  return name && name.trim() ? name : null;
}

/**
 * Ensure the current Supabase backend's profile carries our local trainer name.
 * Runs once per app load for onboarded, non-guest installs. We intentionally do
 * NOT skip on the local `nameReconciled` flag: it may have been set against a
 * previous backend, so we always verify the *current* backend has our name and
 * re-claim it if missing (e.g. after a backend migration). The check is a single
 * indexed lookup, so this is cheap.
 */
async function reconcileTrainerName(): Promise<void> {
  const s = useGameStore.getState();
  if (!s.hasOnboarded || s.isGuest) return;
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
  const rpc = supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await rpc.rpc("lookup_profile_by_code", { _code: clean });
  if (error) {
    console.warn("[social] getProfileByCode failed:", error.message);
    return null;
  }
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
    const rpc = supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await rpc.rpc("send_friend_request", {
      _code: code.trim().toUpperCase(),
    });
    if (error) {
      console.warn("[social] send_friend_request failed:", error.message);
      return { error: "Couldn't send request, try again." };
    }
    const r = data as { ok?: boolean; status?: string; error?: string } | null;
    if (r && r.ok === true) {
      const status = (r.status as "pending" | "accepted" | "already_pending") ?? "pending";
      if (status === "pending") {
        const myName = useGameStore.getState().trainerName || "A trainer";
        void notifyPush(
          "friend_request",
          profile.id,
          "New friend request",
          `${myName} wants to be your friend!`,
        );
      }
      return { profile, status };
    }
    const err = (r && r.error) || "";
    const msg =
      err === "not_found"
        ? "No trainer found with that code."
        : err === "self"
          ? "That's your own code!"
          : err === "already_friends"
            ? "You're already friends."
            : err === "no_session"
              ? "No session yet — try again in a moment."
              : "Couldn't send request, try again.";
    return { error: msg };
  } catch (e) {
    console.warn("[social] addFriendByCode threw:", e);
    return { error: "Couldn't send request, try again." };
  }
}

/** Send a friend request keyed by the target's user id (e.g. from a leaderboard row). */
export async function sendFriendRequestById(
  targetId: string,
): Promise<{ status?: "pending" | "accepted" | "already_pending"; error?: string }> {
  const uid = await ensureSession();
  if (!uid) return { error: "No session yet — try again in a moment." };
  if (targetId === uid) return { error: "That's you!" };
  try {
    const rpc = supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await rpc.rpc("send_friend_request_by_id", { _target: targetId });
    if (error) {
      console.warn("[social] send_friend_request_by_id failed:", error.message);
      return { error: "Couldn't send request, try again." };
    }
    const r = data as { ok?: boolean; status?: string; error?: string } | null;
    if (r && r.ok === true) {
      const status = (r.status as "pending" | "accepted" | "already_pending") ?? "pending";
      if (status === "pending") {
        const myName = useGameStore.getState().trainerName || "A trainer";
        void notifyPush(
          "friend_request",
          targetId,
          "New friend request",
          `${myName} wants to be your friend!`,
        );
      }
      return { status };
    }
    const err = (r && r.error) || "";
    return {
      error:
        err === "already_friends"
          ? "You're already friends."
          : err === "self"
            ? "That's you!"
            : "Couldn't send request, try again.",
    };
  } catch (e) {
    console.warn("[social] sendFriendRequestById threw:", e);
    return { error: "Couldn't send request, try again." };
  }
}

/** User ids the caller has outgoing pending friend requests to. */
export async function listPendingRequestTargets(): Promise<Set<string>> {
  const uid = await ensureSession();
  if (!uid) return new Set();
  try {
    const rpc = supabase as unknown as {
      rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await rpc.rpc("my_pending_request_targets");
    if (error || !Array.isArray(data)) return new Set();
    return new Set(data as string[]);
  } catch {
    return new Set();
  }
}

/** List the caller's pending incoming friend requests with requester display info. */
export async function listIncomingFriendRequests(): Promise<
  Array<{
    requestId: string;
    fromId: string;
    trainerName: string;
    trainerSprite: string;
    level: number;
    friendCode: string;
    createdAt: string;
  }>
> {
  try {
    const rpc = supabase as unknown as {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await rpc.rpc("list_incoming_friend_requests", {});
    if (error) {
      console.warn("[social] listIncomingFriendRequests failed:", error.message);
      return [];
    }
    const rows =
      (data as Array<{
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
    const rpc = supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await rpc.rpc("respond_friend_request", {
      _request_id: requestId,
      _accept: accept,
    });
    if (error) {
      console.warn("[social] respondFriendRequest failed:", error.message);
      return { ok: false, error: "network" };
    }
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
  if (error) {
    console.warn("[social] listFriends failed:", error.message);
    return [];
  }
  return (data ?? [])
    .map((r: { friend: TrainerProfile | null }) => r.friend)
    .filter(Boolean) as TrainerProfile[];
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
  const rpc = supabase as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await rpc.rpc("is_trainer_name_available", { _name: name });
  if (error) {
    console.warn("[social] isTrainerNameAvailable failed:", error.message);
    return false;
  }
  return data === true;
}

/** Claim a trainer name for the current user. */
export async function claimTrainerName(
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const rpc = supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await rpc.rpc("claim_trainer_name", { _name: name });
    if (error) {
      console.warn("[social] claimTrainerName failed:", error.message);
      return { ok: false, error: "network" };
    }
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
