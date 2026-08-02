import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store";
import { useStoreHydrated } from "@/lib/store-hydration";
import { PokeballSpinner } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import { MatchChatScreen } from "@/components/match-chat-screen";
import { getLivePvpMatch, type LivePvpMatch } from "@/lib/pvp-live";
import { ensureSession, getProfileById, type TrainerProfile } from "@/lib/social";
import { fetchRecentChatMessages, getChatState, subscribeToMatchChat } from "@/lib/pvp-chat";
import type { ChatMessage, ChatState } from "@/lib/pvp-chat-types";

export const Route = createFileRoute("/pvp/chat/$matchId")({
  component: PvpChatPage,
});

type Phase = "loading" | "not_found" | "ready";

function PvpChatPage() {
  const { matchId } = Route.useParams();
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const hydrated = useStoreHydrated();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [match, setMatch] = useState<LivePvpMatch | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<TrainerProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatState, setChatState] = useState<ChatState | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!hasOnboarded) {
      navigate({ to: "/" });
      return;
    }
    (async () => {
      const uid = await ensureSession();
      const m = await getLivePvpMatch(matchId);
      if (!uid || !m) {
        setPhase("not_found");
        return;
      }
      setMyId(uid);
      setMatch(m);
      const opponentId = uid === m.hostId ? m.guestId : m.hostId;
      void getProfileById(opponentId).then(setOpponentProfile);

      const [backfill, state] = await Promise.all([
        fetchRecentChatMessages(matchId),
        getChatState(matchId),
      ]);
      setMessages(backfill);
      setChatState(state);
      setPhase("ready");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, hasOnboarded, hydrated]);

  // Live new-message stream, appended de-duped by id (backfill + this
  // subscription can otherwise both deliver the same freshly-sent row).
  useEffect(() => {
    if (!hasOnboarded || phase !== "ready") return;
    return subscribeToMatchChat(matchId, (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
  }, [hasOnboarded, phase, matchId]);

  if (!hydrated || !hasOnboarded) return null;

  if (phase === "loading") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-poke-cream">
        <PokeballSpinner spinning />
      </div>
    );
  }

  if (phase === "not_found") {
    return (
      <div className="screen-x flex h-full w-full flex-col items-center justify-center gap-4 bg-poke-cream text-center">
        <div className="font-display text-lg text-foreground">
          This chat isn't available anymore.
        </div>
        <Button size="action" onClick={() => navigate({ to: "/arena" })}>
          Back to Arena
        </Button>
      </div>
    );
  }

  // Still-active matches go back into the battle; a finished/forfeited match
  // (or one whose grace window has simply lapsed) goes back to the Arena,
  // matching PvpResultScreen's own onBack destination.
  const backTo =
    match?.status === "active"
      ? () => navigate({ to: "/pvp/live/$matchId", params: { matchId } })
      : () => navigate({ to: "/arena" });

  return (
    <MatchChatScreen
      matchId={matchId}
      myId={myId ?? ""}
      opponentName={opponentProfile?.trainer_name || "Opponent"}
      messages={messages}
      chatState={chatState}
      onBack={backTo}
    />
  );
}
