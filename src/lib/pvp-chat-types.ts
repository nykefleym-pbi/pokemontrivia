// Architect stub (docs/handoffs/global-chat/02-architecture.md §4) — interfaces
// only, reproduced verbatim. Frozen contract: changes route through the
// Architect, not this PR.

export interface ChatMessage {
  id: string;
  matchId: string;
  userId: string;
  trainerName: string;
  trainerSprite: string;
  body: string;
  createdAt: string;
}

export type SendChatError =
  | "no_session" | "chat_disabled" | "not_found" | "forbidden"
  | "chat_closed" | "banned" | "name_required" | "empty" | "too_long"
  | "rate_limited" | "duplicate" | "blocked" | "network";

export type SendResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: SendChatError };

export type ReportResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; error: string };

/** UX-only mirror of the send RPC's gates; never a security boundary. */
export interface ChatState {
  enabled: boolean;      // app_config chat_enabled
  banned: boolean;       // active pvp_chat_bans row for caller
  nameClaimed: boolean;  // profiles.trainer_name present
  windowOpen: boolean;   // now < match.created_at + 24h
}
