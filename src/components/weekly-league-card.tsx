import { useEffect, useState } from "react";
import { Swords } from "lucide-react";
import type { WeeklyLeagueState } from "@/lib/store";
import { findGymLeader } from "@/lib/gym-leaders";
import { Button } from "@/components/ui/button";
import { PokemonSprite, TypeBadge } from "@/components/game-ui";

interface Props {
  weeklyLeague: WeeklyLeagueState;
  onStart: () => void;
  resumeMode?: boolean;
  loading?: boolean;
}

export function WeeklyLeagueCard({ weeklyLeague, onStart, resumeMode = false, loading = false }: Props) {
  const leader = findGymLeader(weeklyLeague.gymLeaderId);
  if (!leader) return null;
  return (
    <div className="flex flex-col items-center text-center">
      <div className="rounded-full bg-poke-yellow px-3 py-0.5 font-pixel text-[9px] uppercase text-poke-dark">
        ⚔️ Weekly League
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        <TrainerSprite trainerId={leader.trainerSpriteId} />
        <PokemonSprite id={leader.signaturePokemonId} className="sprite h-20 w-20 shrink-0" />
      </div>

      <div className="mt-2 font-pixel text-sm text-foreground">{leader.name}</div>
      <div className="mt-1 flex items-center justify-center gap-1">
        <TypeBadge type={leader.type} size="sm" />
      </div>

      <div className="mt-2 line-clamp-2 px-2 text-xs italic text-muted-foreground">"{leader.quote}"</div>

      <div className="mt-3 font-pixel text-[10px] text-foreground">
        Reward: <span className="text-primary">{leader.badge}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">One attempt — no retries.</div>

      <Button
        size="lg"
        onClick={onStart}
        disabled={loading}
        className="mt-4 w-full rounded-full bg-gradient-to-r from-poke-yellow to-primary py-5 font-pixel text-[11px] shadow-pop"
      >
        <Swords className="mr-2 h-4 w-4" />
        {loading ? "Loading..." : resumeMode ? "Resume Challenge" : `Challenge ${leader.name}`}
      </Button>
    </div>
  );
}

interface ResultProps {
  weeklyLeague: WeeklyLeagueState;
  nextWeekStart: number;
}

export function WeeklyLeagueResultCard({ weeklyLeague, nextWeekStart }: ResultProps) {
  const leader = findGymLeader(weeklyLeague.gymLeagueId ?? weeklyLeague.gymLeaderId);
  const isWin = weeklyLeague.status === "won";
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const tick = () => {
      const ms = nextWeekStart - Date.now();
      if (ms <= 0) {
        setTimeLeft("Refreshing...");
        return;
      }
      const days = Math.floor(ms / (24 * 60 * 60 * 1000));
      const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      setTimeLeft(`${days}d ${hours}h`);
    };
    tick();
    const i = setInterval(tick, 60000);
    return () => clearInterval(i);
  }, [nextWeekStart]);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-3xl">{isWin ? "🏆" : "💔"}</div>
      <div className="mt-2 font-pixel text-xs">
        {isWin ? `${leader?.badge} earned!` : `Defeated by ${leader?.name}`}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">Next challenge in {timeLeft}</div>
    </div>
  );
}

function TrainerSprite({ trainerId }: { trainerId: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <img
      src={`/trainers/gym/${trainerId}.png`}
      alt={trainerId}
      className="sprite h-20 w-20 shrink-0 object-contain"
      onError={() => setBroken(true)}
    />
  );
}
