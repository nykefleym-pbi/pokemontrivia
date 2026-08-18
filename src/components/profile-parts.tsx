import { useMemo, useState } from "react";
import { Swords, Users, X } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { EVOLUTION_TP_COST, getTpMultiplier } from "@/lib/game-data";
import { canEvolve, getEvolutionTargets, type PokeEntry } from "@/lib/pokemon-data";
import { type TrainerProfile } from "@/lib/social";
import { GYM_LEADERS, type GymLeader } from "@/lib/gym-leaders";
import { PokemonSprite, LegendaryFrame } from "@/components/game-ui";
import { TypeChip } from "@/components/type-chip";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON } from "@/lib/app-icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PartnerCard({
  pokemon,
  tp,
  lifetime,
  onChange: _onChange,
  onEvolve,
}: {
  pokemon: PokeEntry;
  /** Spendable balance — what the evolution bar fills against. */
  tp: number;
  /** Everything this partner has ever earned — what the damage multiplier
   *  reads, and what evolving no longer resets. See `lifetimeTp`. */
  lifetime: number;
  onChange: () => void;
  onEvolve: (target: PokeEntry) => void;
}) {
  const targets = useMemo(() => getEvolutionTargets(pokemon), [pokemon]);
  const stage = pokemon.evolutionStage;
  const cost = stage === 1 || stage === 2 ? EVOLUTION_TP_COST[stage] : null;
  const eligible = canEvolve(pokemon) && cost !== null && tp >= cost;
  // Lifetime TP, so the figure survives evolving — and shown whether or not
  // there is an evolution left, because a fully-evolved partner still has a
  // multiplier and used to be told nothing about it.
  const mult = getTpMultiplier(lifetime);
  const [evoOpen, setEvoOpen] = useState(false);

  function handleEvolveClick() {
    if (!eligible) return;
    if (targets.length === 1) {
      onEvolve(targets[0]);
    } else {
      setEvoOpen(true);
    }
  }

  return (
    <LegendaryFrame pokemonId={pokemon.id} types={pokemon.types ?? []} className="mt-3">
      <div className="rounded-3xl bg-card p-4 shadow-card">
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <PokemonSprite id={pokemon.id} alt={pokemon.name} className="sprite h-20 w-20" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display-lg text-xl font-extrabold text-foreground truncate">
                {pokemon.name}
              </span>
              {(pokemon.types ?? []).slice(0, 1).map((t) => (
                <TypeChip key={t} type={t} selected size="sm" />
              ))}
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-poke-blue to-primary"
                style={{ width: `${cost ? Math.min(100, (tp / cost) * 100) : 100}%` }}
              />
            </div>
            <div className="mt-1 text-xs font-semibold text-foreground/60">
              TP {tp} · Damage ×{mult.toFixed(2)}
            </div>
          </div>
        </div>
        {canEvolve(pokemon) && cost !== null && (
          <div className="mt-4 flex items-center gap-3">
            <Button
              size="action"
              onClick={handleEvolveClick}
              disabled={!eligible}
              className={`flex-1 shadow-pop ${
                eligible
                  ? "bg-gradient-to-r from-poke-yellow to-primary text-white"
                  : "bg-muted text-foreground/50"
              }`}
            >
              {/* TP progress lives in the bar under the Pokémon's name; don't
                repeat it here (feedback ab8a72c9). */}
              ✦ Evolve
            </Button>
          </div>
        )}
        {pokemon.isFullyEvolved && (
          <div className="mt-4 rounded-full bg-muted py-2 text-center text-xs font-bold text-foreground/60">
            Fully evolved
          </div>
        )}

        <Dialog open={evoOpen} onOpenChange={setEvoOpen}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Choose evolution</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {targets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setEvoOpen(false);
                    onEvolve(t);
                  }}
                  className="flex flex-col items-center rounded-2xl border-2 p-3 transition hover:border-primary press"
                >
                  <PokemonSprite id={t.id} alt={t.name} className="sprite h-16 w-16" />
                  <div className="mt-1 text-xs font-semibold">{t.name}</div>
                  <div className="mt-1 flex gap-0.5">
                    {t.types.map((tt) => (
                      <TypeChip key={tt} type={tt} selected size="sm" />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </LegendaryFrame>
  );
}

export function CardStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-card px-3 py-3 text-center shadow-card">
      <div className="text-xl font-extrabold text-foreground">{value}</div>
      <div className="mt-0.5 font-pixel-xs text-foreground/50">{label}</div>
    </div>
  );
}

export function FriendRow({
  friend,
  onRemove,
  onChallenge,
  challengeBusy,
}: {
  friend: TrainerProfile;
  onRemove: () => void;
  onChallenge?: () => void;
  challengeBusy?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
        <Users className="h-5 w-5 text-foreground/60" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display-md text-foreground">{friend.trainer_name}</div>
        <div className="text-xs text-foreground/55">
          LV {friend.level} · {friend.pokedex_count} caught
        </div>
      </div>
      {onChallenge && (
        <button
          onClick={onChallenge}
          disabled={challengeBusy}
          aria-label="Challenge to PvP"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary transition press disabled:opacity-50"
        >
          <Swords className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={onRemove}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive transition press"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl bg-card p-4 shadow-card">
      <div className="font-pixel-xs text-foreground/55 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-foreground">{value}</div>
    </div>
  );
}

const REGION_TINT: Record<string, string> = {
  Kanto: "bg-primary/10",
  Johto: "bg-poke-yellow/15",
  Hoenn: "bg-hp-good/12",
  Sinnoh: "bg-poke-blue/12",
  Unova: "bg-purple-500/10",
};

export function BadgesTab() {
  const gymBadges = useGameStore((s) => s.gymBadges);
  const owned = new Set(gymBadges);
  const regions = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova"] as const;
  return (
    <div className="space-y-3">
      {regions.map((r) => {
        const leaders = GYM_LEADERS.filter((g) => g.region === r);
        return (
          <div key={r} className={`rounded-3xl p-3 shadow-card ${REGION_TINT[r] ?? "bg-card"}`}>
            <div className="mb-2 text-center font-pixel-xs text-foreground/60">
              {r.toUpperCase()}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {leaders.map((g) => {
                const got = owned.has(g.id);
                return <BadgeCell key={g.id} leader={g} got={got} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PokeballIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#fff" stroke="#1b1d2b" strokeWidth="2.5" />
      <path d="M2 16 a14 14 0 0 1 28 0 Z" fill="currentColor" stroke="#1b1d2b" strokeWidth="2.5" />
      <rect x="2" y="14.5" width="28" height="3" fill="#1b1d2b" />
      <circle cx="16" cy="16" r="4" fill="#fff" stroke="#1b1d2b" strokeWidth="2.5" />
    </svg>
  );
}

function BadgeCell({ leader, got }: { leader: GymLeader; got: boolean }) {
  const [imgBroken, setImgBroken] = useState(false);
  return (
    <div
      title={got ? `${leader.name} — ${leader.badge}` : "???"}
      className={`flex flex-col items-center rounded-2xl p-2 ${got ? "bg-poke-yellow/20" : "bg-muted/40"}`}
    >
      {!imgBroken ? (
        <img
          src={leader.badgeIconUrl}
          alt={got ? leader.badge : "Locked badge"}
          crossOrigin="anonymous"
          className={`h-12 w-12 object-contain ${got ? "" : "badge-silhouette"}`}
          onError={() => setImgBroken(true)}
        />
      ) : (
        <AppIcon
          src={UI_ICON.badges}
          className={`h-12 w-12 ${got ? "" : "opacity-20 grayscale"}`}
        />
      )}
      {/* Named whether or not it is earned (owner request 2026-08-17). A locked
          cell used to be art alone, so the grid gave no clue which leader it
          was or what it is called — the name was only in the `title` tooltip,
          which a phone has no way to show. The badge name goes under the
          leader's: the art IS the badge, so it is the line that identifies what
          you are looking at, and the leader is who you take it from. Both
          truncate rather than wrap, so a long pair can't make one cell taller
          than the rest of the row. */}
      <div
        className={`mt-1 w-full truncate text-center text-[10px] font-semibold leading-tight ${
          got ? "text-foreground" : "text-foreground/40"
        }`}
      >
        {leader.name}
      </div>
      <div
        className={`w-full truncate text-center text-[9px] leading-tight ${
          got ? "text-foreground/55" : "text-foreground/30"
        }`}
      >
        {leader.badge.replace(/\s*badge$/i, "")}
      </div>
    </div>
  );
}
