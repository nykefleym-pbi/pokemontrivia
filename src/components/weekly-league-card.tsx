import { useEffect, useState } from "react";
import { Swords, Trophy, HeartCrack } from "lucide-react";
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

export function WeeklyLeagueCard({
  weeklyLeague,
  onStart,
  resumeMode = false,
  loading = false,
}: Props) {
  const leader = findGymLeader(weeklyLeague.gymLeaderId);
  if (!leader) return null;
  return (
    <div className="flex flex-col items-center rounded-3xl bg-gradient-to-br from-poke-blue/15 to-poke-yellow/25 p-5 text-center">
      <div className="rounded-full bg-poke-blue px-3 py-1 font-pixel-xs uppercase text-white">
        Weekly League
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <SpriteHalo>
          <TrainerSprite trainerId={leader.trainerSpriteId} />
        </SpriteHalo>
        <span className="font-pixel-xs rounded-full bg-poke-dark px-2 py-1 text-white">VS</span>
        <SpriteHalo>
          <PokemonSprite id={leader.signaturePokemonId} className="sprite h-20 w-20 shrink-0" />
        </SpriteHalo>
      </div>

      <div className="mt-3 font-display-md text-foreground">{leader.name}</div>
      <div className="mt-1.5">
        <TypeBadge type={leader.type} size="sm" />
      </div>

      <div className="mt-3 px-2 text-xs italic text-muted-foreground line-clamp-2">
        <span className="text-poke-yellow/80">“</span>
        {leader.quote}
        <span className="text-poke-yellow/80">”</span>
      </div>

      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-poke-yellow/40 px-3 py-1 text-xs font-bold text-foreground">
        <Trophy className="h-3.5 w-3.5" />
        {leader.badge}
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground">One attempt — no retries.</div>

      <Button
        size="action"
        onClick={onStart}
        disabled={loading}
        className="mt-4 w-full bg-primary text-primary-foreground shadow-pop"
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
  const leader = findGymLeader(weeklyLeague.gymLeaderId);
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
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-full ${
          isWin ? "bg-poke-yellow/40 text-foreground" : "bg-destructive/15 text-destructive"
        }`}
      >
        {isWin ? <Trophy className="h-7 w-7" /> : <HeartCrack className="h-7 w-7" />}
      </div>
      <div className="mt-2 font-display-md text-foreground">
        {isWin ? `${leader?.badge} earned!` : `Defeated by ${leader?.name}`}
      </div>
      <div className="mt-2 rounded-2xl bg-card/60 px-3 py-1.5 text-xs text-muted-foreground">
        Next challenge in <span className="font-bold text-foreground">{timeLeft}</span>
      </div>
    </div>
  );
}

function SpriteHalo({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 -m-2 rounded-full bg-poke-yellow/30 blur-xl" />
      <div className="relative">{children}</div>
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
