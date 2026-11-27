import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { NaIcon } from "@/components/na/icon";
import { FittedTrainer } from "@/components/na/battle";
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

  // Figma 15.6 "Match chat: say gg, ask for a rematch".
  return (
    <div className="na-bg-night flex h-full w-full flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
      <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
        <button type="button" aria-label="Back" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-foreground">
          <NaIcon name="arrow-left" size={20} />
        </button>
        <h1 className="na-display-s flex-1 text-foreground">Match Chat</h1>
      </div>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-3 pt-2">
        <span className="na-label text-center uppercase text-[#FF7A85]">VS {opponentName}</span>
        {messages.length === 0 ? (
          <p className="na-body my-auto text-center text-text-secondary">No messages yet. Say gg or ask for a rematch!</p>
        ) : (
          messages.map((m) => {
            const mine = m.userId === myId;
            const art = trainerSpriteUrl(m.trainerSprite);
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}>
                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-night-card-2">
                  {art && <FittedTrainer art={art} alt={m.trainerName} height={28} cx={18} feetY={32} />}
                </span>
                <div className={`flex max-w-[75%] flex-col gap-[3px] ${mine ? "items-end" : "items-start"}`}>
                  <span className="na-label text-text-muted">{m.trainerName}</span>
                  <div className={`flex items-center gap-2 rounded-[20px] px-3.5 py-2 ${mine ? "bg-brand-red/[0.22]" : "bg-white/10"}`}>
                    <span className="na-body whitespace-pre-wrap break-words text-foreground">{m.body}</span>
                    {!mine && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-label="Message actions" className="na-label shrink-0 text-text-muted press">
                            •••
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem disabled={reportedIds.has(m.id)} onClick={() => void handleReport(m.id)}>
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

      <div className="flex shrink-0 flex-col gap-3.5 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">
        {reason ? (
          <p className="na-caption rounded-2xl bg-white/[0.08] px-3 py-2 text-center text-text-secondary">{reason}</p>
        ) : (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {QUICK_MESSAGES.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => void send(q, false)}
                className="na-body-strong shrink-0 rounded-full bg-white/[0.12] px-3.5 py-2 text-foreground press disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
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
            aria-label="Message"
            className="na-body h-11 min-w-0 flex-1 rounded-full border border-white/[0.16] bg-night-deep/60 px-4 text-foreground outline-none placeholder:text-text-muted disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-red text-foreground press disabled:opacity-50"
          >
            <NaIcon name="send" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}