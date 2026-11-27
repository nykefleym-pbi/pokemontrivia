import { useMemo, useState } from "react";
import { NaIcon } from "@/components/na/icon";
import { FitSprite } from "@/components/na/battle";
import { NaButton } from "@/components/na/button";
import { useGameStore } from "@/lib/store";
import { EVOLUTION_TP_COST, getTpMultiplier } from "@/lib/game-data";
import { canEvolve, getEvolutionTargets, type PokeEntry } from "@/lib/pokemon-data";
import { GYM_LEADERS, type GymLeader } from "@/lib/gym-leaders";
import { PokemonSprite } from "@/components/game-ui";
import { TypeChip } from "@/components/type-chip";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON } from "@/lib/app-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Figma 6.3 Evolution card: your partner, a chevron, the next form as a
 * silhouette, "NEXT: IVYSAUR", the Training Points still to go, the meter and
 * Evolve (dim until you can). A partner with nothing left to evolve into says so.
 */
export function EvolutionCard({
  pokemon,
  tp,
  lifetime,
  onEvolve,
}: {
  pokemon: PokeEntry;
  /** Spendable balance: what the meter fills against. */
  tp: number;
  /** Everything this partner has ever earned: what the damage multiplier reads. */
  lifetime: number;
  onEvolve: (target: PokeEntry) => void;
}) {
  const targets = useMemo(() => getEvolutionTargets(pokemon), [pokemon]);
  const stage = pokemon.evolutionStage;
  const cost = canEvolve(pokemon) && (stage === 1 || stage === 2) ? EVOLUTION_TP_COST[stage] : null;
  const eligible = cost !== null && tp >= cost;
  const [evoOpen, setEvoOpen] = useState(false);
  const next = targets[0];

  return (
    <div className="na-glass flex flex-col gap-3 rounded-[22px] p-4">
      <div className="flex items-center gap-2.5">
        <FitSprite id={pokemon.id} size={74} />
        {cost !== null && next ? (
          <>
            <NaIcon name="chevron-right" size={26} className="shrink-0 text-reward-gold" />
            <FitSprite id={next.id} size={75} className="[filter:brightness(0)_invert(29%)_sepia(1)_saturate(3)_hue-rotate(190deg)]" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="na-display-s text-foreground">NEXT: {targets.length > 1 ? `${targets.length} FORMS` : next.name.toUpperCase()}</span>
              <span className="na-caption text-text-secondary">
                {eligible ? "Ready to evolve!" : `${(cost - tp).toLocaleString()} Training Points to go`}
              </span>
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="na-display-s text-foreground">{pokemon.name.toUpperCase()}</span>
            <span className="na-caption text-text-secondary">Fully evolved! Damage ×{getTpMultiplier(lifetime).toFixed(2)}</span>
          </div>
        )}
      </div>
      {cost !== null && (
        <>
          <span className="block h-2 w-full overflow-hidden rounded bg-night-deep">
            <span className="na-fill-gold block h-full rounded" style={{ width: `${Math.max(1, Math.min(100, (tp / cost) * 100))}%` }} />
          </span>
          <NaButton
            kind={eligible ? "gold" : "secondary"}
            size="M"
            block
            aria-disabled={!eligible}
            onClick={() => {
              if (!eligible) return;
              if (targets.length === 1) onEvolve(targets[0]);
              else setEvoOpen(true);
            }}
          >
            {eligible ? "Evolve!" : `Evolve at ${cost.toLocaleString()}`}
          </NaButton>
        </>
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

export function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl bg-card p-4 shadow-card">
      <div className="font-pixel-xs text-foreground/55 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-foreground">{value}</div>
    </div>
  );
}

export function BadgesTab() {
  const gymBadges = useGameStore((s) => s.gymBadges);
  const owned = new Set(gymBadges);
  const regions = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova"] as const;
  return (
    <div className="space-y-3">
      {regions.map((r) => {
        const leaders = GYM_LEADERS.filter((g) => g.region === r);
        return (
          <div key={r} className="flex flex-col gap-2 rounded-[20px] border border-white/[0.12] bg-white/[0.06] p-3">
            <div className="na-label text-center uppercase text-text-secondary">
              {r} · {leaders.filter((g) => owned.has(g.id)).length} of {leaders.length}
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
      className={`flex flex-col items-center gap-0.5 rounded-[14px] px-1 py-2 ${got ? "bg-reward-gold/[0.16]" : "bg-night-deep/40"}`}
    >
      {!imgBroken ? (
        <img
          src={leader.badgeIconUrl}
          alt={got ? leader.badge : "Locked badge"}
          crossOrigin="anonymous"
          className={`h-10 w-10 object-contain ${got ? "" : "badge-silhouette"}`}
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
        className={`na-caption w-full truncate text-center ${got ? "text-foreground" : "text-text-muted opacity-70"}`}
      >
        {leader.name}
      </div>
      <div
        className={`na-label w-full truncate text-center ${got ? "text-text-secondary" : "text-text-muted opacity-50"}`}
      >
        {leader.badge.replace(/\s*badge$/i, "")}
      </div>
    </div>
  );
}
