import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/store";
import { ensureSession } from "@/lib/social";
import type {
  ChatMessage,
  ChatState,
  ReportResult,
  SendChatError,
  SendResult,
} from "@/lib/pvp-chat-types";

const BACKFILL_LIMIT = 100;

interface ChatMessageRow {
  id: string;
  match_id: string;
  user_id: string;
  trainer_name: string;
  trainer_sprite: string;
  body: string;
  created_at: string;
}

function fromRow(r: ChatMessageRow): ChatMessage {
  return {
    id: r.id,
    matchId: r.match_id,
    userId: r.user_id,
    trainerName: r.trainer_name,
    trainerSprite: r.trainer_sprite,
    body: r.body,
    createdAt: r.created_at,
  };
}

/**
 * Send a chat message in a match. The RPC only echoes `{ok:true, id}` (it
 * snapshots name/sprite server-side rather than round-tripping them back), so
 * the returned `ChatMessage` is assembled client-side from the same values the
 * server just snapshotted (the caller's own current trainer name/sprite) —
 * the realtime INSERT (`subscribeToMatchChat`) delivers the authoritative row
 * moments later; screens should dedupe by `id`.
 */
export async function sendChatMessage(matchId: string, body: string): Promise<SendResult> {
  const trimmed = body.trim();
  try {
    const { data, error } = await supabase.rpc("send_pvp_chat_message", {
      _match_id: matchId,
      _body: trimmed,
    });
    if (error) {
      console.warn("[pvp-chat] sendChatMessage failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as { ok?: boolean; id?: string; error?: string } | null;
    if (r && r.ok === true && r.id) {
      const uid = await ensureSession();
      const s = useGameStore.getState();
      return {
        ok: true,
        message: {
          id: r.id,
          matchId,
          userId: uid ?? "",
          trainerName: s.trainerName || "Trainer",
          trainerSprite: s.trainerSprite || "red",
          body: trimmed,
          createdAt: new Date().toISOString(),
        },
      };
    }
    return { ok: false, error: (r && (r.error as SendChatError | undefined)) || "network" };
  } catch (e) {
    console.warn("[pvp-chat] sendChatMessage threw:", e);
    return { ok: false, error: "network" };
  }
}

/** Report a chat message for human triage. Fire-and-forget from the caller's
 * point of view — the server escalates via webhook independently. */
export async function reportChatMessage(messageId: string, reason: string): Promise<ReportResult> {
  try {
    const { data, error } = await supabase.rpc("report_pvp_chat_message", {
      _message_id: messageId,
      _reason: reason,
    });
    if (error) {
      console.warn("[pvp-chat] reportChatMessage failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as { ok?: boolean; duplicate?: boolean; error?: string } | null;
    if (r && r.ok === true) return { ok: true, duplicate: r.duplicate };
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-chat] reportChatMessage threw:", e);
    return { ok: false, error: "network" };
  }
}

/** Backfill a match's chat history, oldest → newest, capped at 100 messages. */
export async function fetchRecentChatMessages(matchId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("pvp_chat_messages")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })
    .limit(BACKFILL_LIMIT);
  if (error) {
    console.warn("[pvp-chat] fetchRecentChatMessages failed:", error.message);
    return [];
  }
  return ((data ?? []) as ChatMessageRow[]).map(fromRow);
}

/** UX-only snapshot of the send RPC's gates (never a security boundary — the
 * send RPC re-checks everything itself). Null on any failure (network/no row). */
export async function getChatState(matchId: string): Promise<ChatState | null> {
  try {
    const { data, error } = await supabase.rpc("get_pvp_chat_state", { _match_id: matchId });
    if (error) {
      console.warn("[pvp-chat] getChatState failed:", error.message);
      return null;
    }
    const r = data as Partial<ChatState> | null;
    if (!r) return null;
    return {
      enabled: !!r.enabled,
      banned: !!r.banned,
      nameClaimed: !!r.nameClaimed,
      windowOpen: !!r.windowOpen,
    };
  } catch (e) {
    console.warn("[pvp-chat] getChatState threw:", e);
    return null;
  }
}

/** Subscribe to new chat messages for a match (RLS already scopes delivery to
 * the two participants — mirrors `subscribeToLivePvpEffects`'s channel shape).
 * Returns an unsubscribe function. */
export function subscribeToMatchChat(
  matchId: string,
  onMessage: (msg: ChatMessage) => void,
): () => void {
  const channel = supabase
    .channel(`pvp_chat_messages_${matchId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "pvp_chat_messages", filter: `match_id=eq.${matchId}` },
      (payload) => {
        onMessage(fromRow(payload.new as ChatMessageRow));
      },
    )
    .subscribe();
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* noop */
    }
  };
}
