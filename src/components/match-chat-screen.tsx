import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, MoreHorizontal, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trainerSpriteUrl } from "@/lib/game-data";
import { sendChatMessage, reportChatMessage } from "@/lib/pvp-chat";
import type { ChatMessage, ChatState, SendChatError } from "@/lib/pvp-chat-types";

const BODY_MAX_LEN = 300;

/** One-tap canned messages. Deliberately short, positive and rematch-oriented:
 * they carry the whole "say gg / ask for a rematch" flow without a keyboard,
 * which is the only thing most players want out of a post-battle chat. */
const QUICK_MESSAGES = [
  "gg!",
  "Good luck!",
  "Rematch?",
  "Nice battle!",
  "Well played!",
  "Thanks!",
] as const;

function sendErrorMessage(err: SendChatError): string {
  switch (err) {
    case "no_session":
      return "Session issue — try again in a moment.";
    case "chat_disabled":
      return "Chat is temporarily disabled.";
    case "not_found":
      return "This match couldn't be found.";
    case "forbidden":
      return "You can't chat in this match.";
    case "chat_closed":
      return "Chat for this battle has closed.";
    case "banned":
      return "You're currently unable to send chat messages.";
    case "name_required":
      return "Claim a trainer name in your Profile before you can chat.";
    case "empty":
      return "Message can't be empty.";
    case "too_long":
      return `Message is too long (max ${BODY_MAX_LEN} characters).`;
    case "rate_limited":
      return "You're sending messages too fast — slow down.";
    case "duplicate":
      return "You already sent that message.";
    case "blocked":
      return "That message was blocked by the chat filter.";
    case "network":
    default:
      return "Couldn't send — check your connection and try again.";
  }
}

/** UX-only disabled-composer reason, mirroring the send RPC's own guard order
 * (kill switch → ban → name-claim → window). Never a security boundary — the
 * send RPC re-checks everything regardless of what this shows. */
function disabledReason(state: ChatState | null): string | null {
  if (!state) return null;
  if (!state.enabled) return "Chat is temporarily disabled.";
  if (state.banned) return "You're unable to send messages in this chat.";
  if (!state.nameClaimed) return "Claim a trainer name in your Profile before you can chat.";
  if (!state.windowOpen) return "Chat for this battle has closed.";
  return null;
}

interface MatchChatScreenProps {
  matchId: string;
  myId: string;
  opponentName: string;
  messages: ChatMessage[];
  chatState: ChatState | null;
  onBack: () => void;
}

export function MatchChatScreen({
  matchId,
  myId,
  opponentName,
  messages,
  chatState,
  onBack,
}: MatchChatScreenProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const reason = disabledReason(chatState);
  const trimmed = draft.trim();
  const canSend = !sending && !reason && trimmed.length > 0 && trimmed.length <= BODY_MAX_LEN;

  /** Shared by the composer and the quick-message chips. `clearDraft` is only
   * true for the composer — a chip must never wipe something being typed. */
  async function send(body: string, clearDraft: boolean) {
    if (sending || reason) return;
    const text = body.trim();
    if (!text || text.length > BODY_MAX_LEN) return;
    setSending(true);
    const res = await sendChatMessage(matchId, text);
    setSending(false);
    if (res.ok) {
      if (clearDraft) setDraft("");
    } else {
      toast.error(sendErrorMessage(res.error));
    }
  }

  async function handleSend() {
    if (!canSend) return;
    await send(trimmed, true);
  }

  async function handleReport(messageId: string) {
    if (reportedIds.has(messageId)) return;
    const res = await reportChatMessage(messageId, "inappropriate");
    if (res.ok) {
      setReportedIds((prev) => new Set(prev).add(messageId));
      toast.success(res.duplicate ? "You already reported this message." : "Reported — thanks, we'll take a look.");
    } else {
      toast.error("Couldn't report that message. Try again.");
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-poke-cream">
      {/* HEADER — pixel eyebrow à la NearbyBattleSheet's "FACE TO FACE" */}
      <div className="shrink-0 border-b border-border/60 bg-card px-[max(1rem,env(safe-area-inset-left))] screen-top pb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted press"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <div className="font-pixel-xs text-primary">VS {opponentName.toUpperCase()}</div>
            <h1 className="font-display-lg text-foreground">Match Chat</h1>
          </div>
        </div>
      </div>

      {/* MESSAGE LIST */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="font-display text-sm text-foreground/60">
              No messages yet — say gg or ask for a rematch!
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.userId === myId;
            return (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}
              >
                <img
                  src={trainerSpriteUrl(m.trainerSprite)}
                  alt={m.trainerName}
                  className="h-9 w-9 shrink-0 rounded-full bg-card shadow-card"
                />
                <div className={`flex max-w-[75%] flex-col ${mine ? "items-end" : "items-start"}`}>
                  <span className="font-pixel-xs text-foreground/60">{m.trainerName}</span>
                  <div
                    className={`mt-0.5 flex items-center gap-1 rounded-3xl px-4 py-2 shadow-card ${
                      mine ? "bg-primary/10 text-foreground" : "bg-card text-foreground"
                    }`}
                  >
                    <span className="whitespace-pre-wrap break-words text-sm">{m.body}</span>
                    {!mine && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Message actions"
                            className="ml-1 shrink-0 rounded-full p-0.5 text-foreground/40 transition hover:text-foreground/70 press"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={mine ? "end" : "start"}>
                          <DropdownMenuItem
                            disabled={reportedIds.has(m.id)}
                            onClick={() => void handleReport(m.id)}
                          >
                            {reportedIds.has(m.id) ? "Reported" : "Report"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* COMPOSER */}
      <div className="screen-x shrink-0 border-t border-border/60 bg-card pt-3 screen-bottom">
        {reason && (
          <div className="mb-2 rounded-2xl bg-muted px-3 py-2 text-center text-xs text-foreground/60">
            {reason}
          </div>
        )}
        {!reason && (
          <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
            {QUICK_MESSAGES.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => void send(q, false)}
                className="shrink-0 rounded-full bg-muted px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm transition press disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, BODY_MAX_LEN))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            maxLength={BODY_MAX_LEN}
            placeholder={reason ? "Chat is unavailable" : "Say something…"}
            disabled={!!reason || sending}
            className="flex-1 rounded-full"
          />
          <Button
            size="icon"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground shadow-pop"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
