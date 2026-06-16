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
import { ABILITIES } from "@/lib/abilities";
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
  const [statsOpen, setStatsOpen] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(trainerName);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trainerPickerOpen, setTrainerPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [trainerQuery, setTrainerQuery] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [muted, setMutedState] = useState(false);
  const darkMode = useGameStore((s) => s.darkMode);
  const setDarkMode = useGameStore((s) => s.setDarkMode);

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
      9,
    );
  }, [query]);
  const trainerResults = useMemo(() => {
    const q = trainerQuery.trim().toLowerCase();
    const pool = TRAINER_SPRITES.filter((t) => !brokenTrainerIds.has(t.id));
    if (!q) return pool.slice(0, 9);
    return pool.filter((t) => t.name.toLowerCase().startsWith(q)).slice(0, 9);
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
            <h2 className="font-display-lg text-2xl font-extrabold text-foreground truncate">
              {trainerName}
            </h2>
            <p className="mt-0.5 text-xs text-foreground/55 truncate">
              Trainer since {trainerSince}
            </p>
          </div>
        </motion.div>
      </div>


      <div className="px-5 pb-8 pt-4">
        {/* Partner card */}
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setStatsOpen(true)}
            className="rounded-3xl bg-card p-4 text-left shadow-card transition active:scale-95"
          >
            <div className="font-pixel-xs text-foreground/55">BATTLES WON</div>
            <div className="mt-1 text-3xl font-extrabold text-foreground">{stats.wins}</div>
            <div className="mt-1 text-xs font-semibold text-hp-good">{winRate}% win rate</div>
          </button>
          <div className="rounded-3xl bg-card p-4 shadow-card">
            <div className="font-pixel-xs text-foreground/55">BEST STREAK</div>
            <div className="mt-1 text-3xl font-extrabold text-primary">{stats.bestStreak}</div>
            <div className="mt-1 text-xs text-foreground/60">correct in a row</div>
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
            <div className="font-display-md text-foreground">This week</div>
            <div className="font-pixel-xs text-primary">{weekStreak}-DAY STREAK 🔥</div>
          </div>
          <div className="mt-3 flex justify-between gap-1">
            {heatmap.map((d) => {
              const played = d.count > 0;
              const isToday = d.date === todayKey;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${isToday ? "ring-2 ring-primary ring-offset-1" : ""}`}
                    title={`${d.date}: ${d.count}`}
                  >
                    <PokeballIcon
                      className={`h-8 w-8 text-primary ${played ? "" : "opacity-30 grayscale"}`}
                    />
                  </div>
                  <div className="font-pixel-xs text-foreground/50 uppercase">
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
            <span className="font-display-md text-foreground">Trophies</span>
            <span className="font-pixel-xs text-foreground/50">
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
            <span className="font-display-md text-foreground">Badges</span>
            <span className="font-pixel-xs text-foreground/50">
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
            <span className="font-display-md text-foreground">Settings</span>
            <span className="font-pixel-xs text-foreground/50">&nbsp;</span>
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
            <div className="font-pixel-xs text-primary">
              {unlocked.size} OF {ACHIEVEMENTS.length} EARNED
            </div>
            <SheetTitle className="font-display-xl text-foreground">Trophies</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2.5">
            {ACHIEVEMENTS.map((a) => {
              const got = unlocked.has(a.id);
              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-3 rounded-3xl p-4 shadow-card ${got ? "bg-card" : "bg-card/60"}`}
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${got ? "bg-poke-yellow/25" : "bg-muted"}`}
                  >
                    {got ? a.icon : "🔒"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`font-display-md ${got ? "text-foreground" : "text-foreground/50"}`}
                    >
                      {a.name}
                    </div>
                    <div className="text-xs text-foreground/55">{a.desc}</div>
                  </div>
                  {got && <Check className="h-5 w-5 shrink-0 text-hp-good" />}
                </div>
              );
            })}
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
            <div className="font-pixel-xs text-primary">
              {gymBadges.length} OF {GYM_LEADERS.length} EARNED
            </div>
            <SheetTitle className="font-display-xl text-foreground">Badge case</SheetTitle>
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
          <div className="mt-3 space-y-5">
            <section>
              <div className="mb-2 font-pixel-xs uppercase text-foreground/45">General</div>
              <div className="overflow-hidden rounded-3xl bg-card shadow-card divide-y divide-border">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                      {muted ? (
                        <VolumeX className="h-5 w-5 text-foreground" />
                      ) : (
                        <Volume2 className="h-5 w-5 text-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Sounds & music</div>
                      <div className="text-xs text-foreground/55">Battle cries, SFX, BGM</div>
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
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                      <Moon className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Dark mode</div>
                      <div className="text-xs text-foreground/55">Easier on the eyes at night</div>
                    </div>
                  </div>
                  {/* TODO: dark theme not yet implemented */}
                  <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                </div>
              </div>
            </section>

            <section>
              <div className="mb-2 font-pixel-xs uppercase text-foreground/45">Trainer</div>
              <div className="overflow-hidden rounded-3xl bg-card shadow-card divide-y divide-border">
                <button
                  onClick={() => {
                    setNameDraft(trainerName);
                    setRenameOpen(true);
                  }}
                  className="flex w-full items-center justify-between p-4 text-left transition active:scale-[0.98]"
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">Rename trainer</div>
                    <div className="text-xs text-foreground/55 truncate">
                      Currently: {trainerName}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/40" />
                </button>
                <button
                  onClick={() => {
                    setTrainerPickerOpen(true);
                  }}
                  className="flex w-full items-center justify-between p-4 text-left transition active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <img src={trainerSpriteUrl(trainerSprite)} alt="" className="sprite h-8 w-8 object-contain" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Repick avatar</div>
                      <div className="text-xs text-foreground/55 truncate">
                        Currently: {trainerSprite}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/40" />
                </button>
                <button
                  onClick={() => {
                    setPickerOpen(true);
                  }}
                  className="flex w-full items-center justify-between p-4 text-left transition active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <PokemonSprite id={pokemon.id} alt="" className="sprite h-8 w-8" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Repick partner</div>
                      <div className="text-xs text-foreground/55 truncate">
                        Currently: {pokemon.name}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/40" />
                </button>
              </div>
            </section>

            <section>
              <div className="mb-2 font-pixel-xs uppercase text-destructive/70">Danger zone</div>
              <button
                onClick={() => setResetOpen(true)}
                className="flex w-full items-center gap-3 rounded-3xl bg-card p-4 shadow-card transition active:scale-95"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-destructive/10">
                  <RotateCcw className="h-5 w-5 text-destructive" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-destructive">Reset progress</div>
                  <div className="text-xs text-foreground/55">Wipes XP, badges & Pokédex</div>
                </div>
              </button>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      {/* All stats sheet */}
      <Sheet open={statsOpen} onOpenChange={setStatsOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-poke-cream max-h-[80vh] overflow-y-auto"
        >
          <SheetHeader>
            <div className="font-pixel-xs text-primary">CAREER STATS</div>
            <SheetTitle className="font-display-xl text-foreground">All stats</SheetTitle>
          </SheetHeader>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <StatBox label="Battles" value={stats.battles} />
            <StatBox label="Wins" value={stats.wins} />
            <StatBox label="Losses" value={stats.losses} />
            <StatBox label="Win rate" value={`${winRate}%`} />
            <StatBox label="Best streak" value={stats.bestStreak} />
            <StatBox label="Accuracy" value={`${accuracy}%`} />
            <StatBox label="Avg time" value={`${avgTime}s`} />
            <StatBox label="Questions" value={stats.answered} />
            <StatBox label="Correct" value={stats.correct} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Rename trainer dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename trainer</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={16}
              className="h-10 rounded-full"
              autoFocus
            />
            <Button
              onClick={() => {
                if (nameDraft.trim()) {
                  setName(nameDraft.trim());
                  setRenameOpen(false);
                  toast.success("Trainer name updated!");
                }
              }}
              className="rounded-full"
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>


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
    <div className="mt-3 rounded-3xl bg-card p-4 shadow-card">
      <div className="flex items-center gap-4">
        <button onClick={onChange} className="shrink-0 transition active:scale-95">
          <PokemonSprite id={pokemon.id} alt={pokemon.name} className="sprite h-20 w-20" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display-lg text-xl font-extrabold text-foreground truncate">
              {pokemon.name}
            </span>
            {(pokemon.types ?? []).slice(0, 1).map((t) => (
              <TypeBadge key={t} type={t} size="sm" />
            ))}
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-poke-blue to-primary"
              style={{ width: `${cost ? Math.min(100, (tp / cost) * 100) : 100}%` }}
            />
          </div>
          <div className="mt-1 text-xs font-semibold text-foreground/60">
            TP {tp}
            {cost ? ` · ×${mult.toFixed(2)}` : ""}
          </div>
        </div>
      </div>
      {canEvolve(pokemon) && cost !== null && (
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={handleEvolveClick}
            disabled={!eligible}
            className="h-12 flex-1 rounded-full bg-gradient-to-r from-poke-yellow to-primary font-bold text-white shadow-pop disabled:opacity-60"
          >
            ✦ Evolve
          </Button>
          {!eligible && (
            <span className="shrink-0 text-xs font-semibold text-foreground/55">
              {Math.max(0, cost - tp)} TP to go
            </span>
          )}
        </div>
      )}
      {pokemon.isFullyEvolved && (
        <div className="mt-4 rounded-full bg-muted py-2 text-center text-xs font-bold text-foreground/60">
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
      className="h-9 rounded-full text-xs font-bold text-foreground/60 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-card"
    >
      {children}
    </TabsTrigger>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-card px-3 py-3 text-center shadow-card">
      <div className="text-xl font-extrabold text-foreground">{value}</div>
      <div className="mt-0.5 font-pixel-xs text-foreground/50">{label}</div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
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

function BadgesTab() {
  const gymBadges = useGameStore((s) => s.gymBadges);
  const owned = new Set(gymBadges);
  const regions = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova"] as const;
  return (
    <div className="space-y-3">
      {regions.map((r) => {
        const leaders = GYM_LEADERS.filter((g) => g.region === r);
        return (
          <div key={r} className={`rounded-3xl p-3 shadow-card ${REGION_TINT[r] ?? "bg-card"}`}>
            <div className="mb-2 text-center font-pixel-xs text-foreground/60">{r.toUpperCase()}</div>
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

function PokeballIcon({ className }: { className?: string }) {
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
        <div className={`text-3xl ${got ? "" : "opacity-20 grayscale"}`}>🎖</div>
      )}
      {got && (
        <div className="mt-1 truncate text-center text-[10px] font-semibold leading-tight text-foreground">
          {leader.name}
        </div>
      )}
    </div>
  );
}
