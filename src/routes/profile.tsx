import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { RotateCcw, Check, Search, Volume2, VolumeX, ChevronRight, Moon } from "lucide-react";
import { useGameStore } from "@/lib/store";
import {
  rankForLevel,
  xpProgressInLevel,
  ITEMS,
  TRAINER_SPRITES,
  trainerSpriteUrl,
} from "@/lib/game-data";
import {
  STARTING_PARTNERS,
  canEvolve,
  getEvolutionTargets,
  type PokeEntry,
} from "@/lib/pokemon-data";
import { ABILITIES, getAbility } from "@/lib/abilities";
import { EVOLUTION_TP_COST, getTpMultiplier } from "@/lib/game-data";
import { EvolutionScreen } from "@/components/evolution-screen";
import { XpBar, TypeBadge, PokemonSprite } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ACHIEVEMENTS, unlockedAchievements } from "@/lib/achievements";
import { GYM_LEADERS, type GymLeader } from "@/lib/gym-leaders";
import { isMuted, setMuted } from "@/lib/audio";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const pokemon = useGameStore((s) => s.pokemon);
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
  const stats = useGameStore((s) => s.stats);
  const inventory = useGameStore((s) => s.inventory);
  const setName = useGameStore((s) => s.setName);
  const setPokemon = useGameStore((s) => s.setPokemon);
  const setTrainerSprite = useGameStore((s) => s.setTrainerSprite);
  const reset = useGameStore((s) => s.reset);
  const battleLog = useGameStore((s) => s.battleLog);
  const flags = useGameStore((s) => s.flags);
  const peakLevel = useGameStore((s) => s.peakLevel);
  const pokedex = useGameStore((s) => s.pokedex);

  const trainingPoints = useGameStore((s) => s.trainingPoints);
  const evolvePartner = useGameStore((s) => s.evolvePartner);
  const gymBadges = useGameStore((s) => s.gymBadges);
  const unlocked = useMemo(() => {
    const ctx = { stats, flags, peakLevel, pokedex } as Parameters<typeof unlockedAchievements>[0];
    return new Set(unlockedAchievements(ctx));
  }, [stats, flags, peakLevel, pokedex]);

  const [trophiesOpen, setTrophiesOpen] = useState(false);
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(trainerName);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trainerPickerOpen, setTrainerPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [trainerQuery, setTrainerQuery] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [muted, setMutedState] = useState(false);
  // TODO: dark theme not yet implemented
  const [darkMode, setDarkMode] = useState(false);
  const [brokenTrainerIds, setBrokenTrainerIds] = useState<Set<string>>(new Set());
  const [evolvingFrom, setEvolvingFrom] = useState<PokeEntry | null>(null);
  const [evolvingTo, setEvolvingTo] = useState<PokeEntry | null>(null);

  useEffect(() => {
    setMutedState(isMuted());
  }, []);

  useEffect(() => {
    if (!hasOnboarded) navigate({ to: "/" });
  }, [hasOnboarded, navigate]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STARTING_PARTNERS.filter((p) => (q ? p.name.toLowerCase().startsWith(q) : true)).slice(
      0,
      24,
    );
  }, [query]);
  const trainerResults = useMemo(() => {
    const q = trainerQuery.trim().toLowerCase();
    const pool = TRAINER_SPRITES.filter((t) => !brokenTrainerIds.has(t.id));
    if (!q) return pool.slice(0, 30);
    return pool.filter((t) => t.name.toLowerCase().startsWith(q)).slice(0, 60);
  }, [trainerQuery, brokenTrainerIds]);

  // 7-day activity heatmap — must run BEFORE the conditional return
  const heatmap = useMemo(() => {
    const days: Array<{ date: string; count: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: 0 });
    }
    for (const e of battleLog) {
      const k = new Date(e.timestamp).toISOString().slice(0, 10);
      const slot = days.find((x) => x.date === k);
      if (slot) slot.count++;
    }
    return days;
  }, [battleLog]);

  if (!hasOnboarded || !pokemon) return null;

  const rank = rankForLevel(level);
  const xpProg = xpProgressInLevel(xp);
  const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const avgTime =
    stats.answered > 0 ? Math.round(stats.totalAnswerTime / stats.answered / 100) / 10 : 0;

  function saveName() {
    if (nameDraft.trim()) {
      setName(nameDraft.trim());
      setEditingName(false);
      toast.success("Trainer name updated!");
    }
  }

  function doReset() {
    reset();
    navigate({ to: "/" });
  }

  const xpPct = xpProg.need > 0 ? Math.round((xpProg.current / xpProg.need) * 100) : 0;
  const ringCirc = 2 * Math.PI * 30;
  const winRate = stats.battles > 0 ? Math.round((stats.wins / stats.battles) * 100) : 0;
  const trainerSince = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const weekStreak = (() => {
    let n = 0;
    for (let i = heatmap.length - 1; i >= 0; i--) {
      if (heatmap[i].count > 0) n++;
      else break;
    }
    return n;
  })();
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      <Toaster position="top-center" />

      {/* Hero strip */}
      <div className="px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4"
        >
          <button
            onClick={() => setTrainerPickerOpen(true)}
            className="relative shrink-0 rounded-full bg-white p-1 ring-4 ring-primary shadow-pop transition active:scale-95"
          >
            <img
              src={trainerSpriteUrl(trainerSprite)}
              alt={trainerSprite}
              className="sprite h-20 w-20 rounded-full object-contain"
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-pixel-xs text-primary uppercase truncate">
              {rank} · LV {level}
            </p>
            <h2 className="font-display-lg text-2xl font-extrabold text-poke-dark truncate">
              {trainerName}
            </h2>
            <p className="mt-0.5 text-xs text-poke-dark/55 truncate">
              Trainer since {trainerSince}
            </p>
          </div>
        </motion.div>
      </div>


      <div className="px-5 pb-8 pt-4">
        {/* Partner card */}
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-card p-4 shadow-card">
            <div className="font-pixel-xs text-poke-dark/55">BATTLES WON</div>
            <div className="mt-1 text-3xl font-extrabold text-poke-dark">{stats.wins}</div>
            <div className="mt-1 text-xs font-semibold text-hp-good">{winRate}% win rate</div>
          </div>
          <div className="rounded-3xl bg-card p-4 shadow-card">
            <div className="font-pixel-xs text-poke-dark/55">BEST STREAK</div>
            <div className="mt-1 text-3xl font-extrabold text-primary">{stats.bestStreak}</div>
            <div className="mt-1 text-xs text-poke-dark/60">correct in a row</div>
          </div>
        </div>

        {/* Partner card */}
        <PartnerCard
          pokemon={pokemon}
          tp={trainingPoints[pokemon.id] ?? 0}
          onChange={() => setPickerOpen(true)}
          onEvolve={(target) => {
            const ok = evolvePartner(target);
            if (ok) {
              setEvolvingTo(target);
              setEvolvingFrom(pokemon);
            } else {
              toast.error("Evolution failed.");
            }
          }}
        />

        {/* This week */}
        <div className="mt-3 rounded-3xl bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <div className="font-display-md text-poke-dark">This week</div>
            <div className="font-pixel-xs text-primary">{weekStreak}-DAY STREAK 🔥</div>
          </div>
          <div className="mt-3 flex justify-between gap-1">
            {heatmap.map((d) => {
              const played = d.count > 0;
              const isToday = d.date === todayKey;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`relative h-9 w-9 rounded-full border-2 ${
                      played ? "bg-primary border-primary" : "bg-muted border-muted"
                    } ${isToday ? "ring-2 ring-offset-2 ring-poke-yellow" : ""}`}
                    title={`${d.date}: ${d.count}`}
                  >
                    <div className="absolute left-1/2 top-1/2 h-1.5 w-full -translate-x-1/2 -translate-y-1/2 bg-card/80" />
                    <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-card" />
                  </div>
                  <div className="font-pixel-xs text-poke-dark/50 uppercase">
                    {new Date(d.date)
                      .toLocaleDateString(undefined, { weekday: "short" })
                      .slice(0, 3)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trophies / Badges / Settings buttons */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <button
            onClick={() => setTrophiesOpen(true)}
            className="flex flex-col items-center gap-1 rounded-3xl bg-card p-4 shadow-card transition active:scale-95"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-poke-yellow/20 text-2xl">
              🏆
            </div>
            <span className="font-display-md text-poke-dark">Trophies</span>
            <span className="font-pixel-xs text-poke-dark/50">
              {unlocked.size}/{ACHIEVEMENTS.length}
            </span>
          </button>
          <button
            onClick={() => setBadgesOpen(true)}
            className="flex flex-col items-center gap-1 rounded-3xl bg-card p-4 shadow-card transition active:scale-95"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
              🎖
            </div>
            <span className="font-display-md text-poke-dark">Badges</span>
            <span className="font-pixel-xs text-poke-dark/50">
              {gymBadges.length}/{GYM_LEADERS.length}
            </span>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex flex-col items-center gap-1 rounded-3xl bg-card p-4 shadow-card transition active:scale-95"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-2xl">
              ⚙️
            </div>
            <span className="font-display-md text-poke-dark">Settings</span>
            <span className="font-pixel-xs text-poke-dark/50">&nbsp;</span>
          </button>
        </div>
      </div>

      {/* Trophies sheet */}
      <Sheet open={trophiesOpen} onOpenChange={setTrophiesOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-poke-cream max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Trophies</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-3">
            <div className="rounded-3xl bg-card p-3 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-pixel-xs text-poke-dark/60">
                  {unlocked.size} / {ACHIEVEMENTS.length} UNLOCKED
                </span>
                <span className="font-pixel-xs text-primary">
                  {Math.round((unlocked.size / ACHIEVEMENTS.length) * 100)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-poke-yellow to-primary"
                  style={{ width: `${(unlocked.size / ACHIEVEMENTS.length) * 100}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {ACHIEVEMENTS.map((a) => {
                const got = unlocked.has(a.id);
                return (
                  <div
                    key={a.id}
                    title={`${a.name} — ${a.desc}`}
                    className={`flex flex-col items-center rounded-2xl p-2 shadow-card ${got ? "bg-poke-yellow/20" : "bg-muted/40 opacity-40 grayscale"}`}
                  >
                    <div className="text-3xl">{a.icon}</div>
                    <div className="mt-1 line-clamp-2 text-center text-[10px] font-semibold leading-tight text-poke-dark">
                      {a.name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Badges sheet */}
      <Sheet open={badgesOpen} onOpenChange={setBadgesOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-poke-cream max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Badges</SheetTitle>
          </SheetHeader>
          <div className="mt-3">
            <BadgesTab />
          </div>
        </SheetContent>
      </Sheet>

      {/* Settings sheet */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-poke-cream max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-3xl bg-card p-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                  {muted ? (
                    <VolumeX className="h-5 w-5 text-poke-dark" />
                  ) : (
                    <Volume2 className="h-5 w-5 text-poke-dark" />
                  )}
                </div>
                <div>
                  <div className="font-pixel-xs text-poke-dark/60">SOUND</div>
                  <div className="text-sm font-semibold text-poke-dark">Toggle SFX & music</div>
                </div>
              </div>
              <Switch
                checked={!muted}
                onCheckedChange={(v) => {
                  setMuted(!v);
                  setMutedState(!v);
                }}
              />
            </div>
            <button
              onClick={() => setResetOpen(true)}
              className="flex w-full items-center justify-between rounded-3xl bg-card p-4 shadow-card transition active:scale-95"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-destructive/10">
                  <RotateCcw className="h-5 w-5 text-destructive" />
                </div>
                <div className="text-left">
                  <div className="font-pixel-xs text-destructive/70">DANGER</div>
                  <div className="text-sm font-semibold text-destructive">Reset progress</div>
                </div>
              </div>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all progress?</AlertDialogTitle>
            <AlertDialogDescription>
              This will erase your trainer, level, items, and stats. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doReset}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pokémon picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change partner</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="pl-10"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPokemon(p);
                  setPickerOpen(false);
                  toast.success(`${p.name} chosen!`);
                }}
                className="flex flex-col items-center rounded-2xl border-2 p-2 transition active:scale-95 hover:border-primary"
              >
                <PokemonSprite id={p.id} alt={p.name} className="sprite h-14 w-14" />
                <div className="text-[11px] font-semibold">{p.name}</div>
                <div className="font-pixel text-[8px] text-primary">
                  ⚡ {getAbility(p.types ?? []).name}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Trainer picker */}
      <Dialog open={trainerPickerOpen} onOpenChange={setTrainerPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change trainer</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={trainerQuery}
              onChange={(e) => setTrainerQuery(e.target.value)}
              placeholder="Search trainers..."
              className="pl-10"
            />
          </div>
          <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto">
            {trainerResults.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTrainerSprite(t.id);
                  setTrainerPickerOpen(false);
                  toast.success("Trainer updated!");
                }}
                className="flex flex-col items-center rounded-2xl border-2 p-2 transition active:scale-95 hover:border-primary"
              >
                <img
                  src={trainerSpriteUrl(t.id)}
                  alt={t.name}
                  crossOrigin="anonymous"
                  className="sprite h-16 w-16 object-contain"
                  loading="lazy"
                  onError={() =>
                    setBrokenTrainerIds((s) => {
                      const n = new Set(s);
                      n.add(t.id);
                      return n;
                    })
                  }
                />
                <div className="text-[11px] font-semibold capitalize">{t.name}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {evolvingFrom && evolvingTo && (
        <EvolutionScreen
          from={evolvingFrom}
          to={evolvingTo}
          onComplete={() => {
            setEvolvingFrom(null);
            setEvolvingTo(null);
            toast.success(`Evolved into ${evolvingTo.name}!`);
          }}
        />
      )}
    </div>
  );
}

function PartnerCard({
  pokemon,
  tp,
  onChange,
  onEvolve,
}: {
  pokemon: PokeEntry;
  tp: number;
  onChange: () => void;
  onEvolve: (target: PokeEntry) => void;
}) {
  const targets = useMemo(() => getEvolutionTargets(pokemon), [pokemon]);
  const stage = pokemon.evolutionStage;
  const cost = stage === 1 || stage === 2 ? EVOLUTION_TP_COST[stage] : null;
  const eligible = canEvolve(pokemon) && cost !== null && tp >= cost;
  const mult = getTpMultiplier(tp);
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
    <div className="mt-3 rounded-2xl bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onChange} className="shrink-0 transition active:scale-95">
          <PokemonSprite id={pokemon.id} alt={pokemon.name} className="sprite h-14 w-14" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <div className="font-pixel text-[9px] uppercase text-muted-foreground">Partner</div>
            <button onClick={onChange} className="text-muted-foreground hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="text-sm font-bold">{pokemon.name}</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {(pokemon.types ?? []).map((t) => (
                <TypeBadge key={t} type={t} size="sm" />
              ))}
            </div>
            <span className="font-pixel text-[8px] text-primary">
              ⚡ {getAbility(pokemon.types ?? []).name}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
        <div className="flex-1">
          <div className="flex items-center justify-between font-pixel text-[9px] text-muted-foreground">
            <span>TRAINING POINTS</span>
            <span>
              {tp}
              {cost ? ` / ${cost}` : ""}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-card">
            <div
              className="h-full bg-gradient-to-r from-poke-yellow to-primary"
              style={{ width: `${cost ? Math.min(100, (tp / cost) * 100) : 100}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="font-pixel text-[8px] uppercase text-muted-foreground">DMG ×</span>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 font-pixel text-[10px] text-primary">
            {mult.toFixed(2)}
          </span>
        </div>
      </div>
      {canEvolve(pokemon) && cost !== null && (
        <Button
          size="sm"
          onClick={handleEvolveClick}
          disabled={!eligible}
          className="mt-2 w-full rounded-full bg-primary font-pixel text-[10px] shadow-pop disabled:opacity-50"
        >
          ✨ {eligible ? `Evolve (${cost} TP)` : `Evolve at ${cost} TP`}
        </Button>
      )}
      {pokemon.isFullyEvolved && (
        <div className="mt-2 rounded-full bg-poke-yellow/20 py-1 text-center font-pixel text-[9px] text-poke-dark">
          ⭐ Fully evolved
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
                className="flex flex-col items-center rounded-2xl border-2 p-3 transition hover:border-primary active:scale-95"
              >
                <PokemonSprite id={t.id} alt={t.name} className="sprite h-16 w-16" />
                <div className="mt-1 text-xs font-semibold">{t.name}</div>
                <div className="mt-1 flex gap-0.5">
                  {t.types.map((tt) => (
                    <TypeBadge key={tt} type={tt} size="sm" />
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

function PillTab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="h-9 rounded-full text-xs font-bold text-poke-dark/60 data-[state=active]:bg-card data-[state=active]:text-poke-dark data-[state=active]:shadow-card"
    >
      {children}
    </TabsTrigger>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-card px-3 py-3 text-center shadow-card">
      <div className="text-xl font-extrabold text-poke-dark">{value}</div>
      <div className="mt-0.5 font-pixel-xs text-poke-dark/50">{label}</div>
    </div>
  );
}

function BadgesTab() {
  const gymBadges = useGameStore((s) => s.gymBadges);
  const owned = new Set(gymBadges);
  const regions = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova"] as const;
  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-card p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-pixel-xs text-poke-dark/60">
            {owned.size} / {GYM_LEADERS.length} BADGES
          </span>
          <span className="font-pixel-xs text-primary">
            {Math.round((owned.size / GYM_LEADERS.length) * 100)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-poke-yellow to-primary"
            style={{ width: `${(owned.size / GYM_LEADERS.length) * 100}%` }}
          />
        </div>
      </div>
      {regions.map((r) => {
        const leaders = GYM_LEADERS.filter((g) => g.region === r);
        return (
          <div key={r} className="rounded-3xl bg-card p-3 shadow-card">
            <div className="mb-2 font-pixel-xs text-poke-dark/60">{r.toUpperCase()}</div>
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
        <div className={`text-3xl ${got ? "" : "opacity-20 grayscale"}`}>🎖</div>
      )}
      <div className="mt-1 truncate text-center text-[10px] font-semibold leading-tight text-poke-dark">
        {got ? leader.name : "???"}
      </div>
    </div>
  );
}
