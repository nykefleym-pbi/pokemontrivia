import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Pencil, RotateCcw, Check, Search, Volume2, VolumeX } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { rankForLevel, xpProgressInLevel, ITEMS, TRAINER_SPRITES, trainerSpriteUrl } from "@/lib/game-data";
import { STARTING_PARTNERS, canEvolve, getEvolutionTargets, type PokeEntry } from "@/lib/pokemon-data";
import { ABILITIES, getAbility } from "@/lib/abilities";
import { EVOLUTION_TP_COST, getTpMultiplier } from "@/lib/game-data";
import { EvolutionScreen } from "@/components/evolution-screen";
import { XpBar, TypeBadge, PokemonSprite } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { GYM_LEADERS } from "@/lib/gym-leaders";
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
  const abilityCodex = useGameStore((s) => s.abilityCodex);
  const trainingPoints = useGameStore((s) => s.trainingPoints);
  const evolvePartner = useGameStore((s) => s.evolvePartner);
  const unlocked = useMemo(() => {
    const ctx = { stats, flags, peakLevel, pokedex } as Parameters<typeof unlockedAchievements>[0];
    return new Set(unlockedAchievements(ctx));
  }, [stats, flags, peakLevel, pokedex]);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(trainerName);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trainerPickerOpen, setTrainerPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [trainerQuery, setTrainerQuery] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [muted, setMutedState] = useState(false);
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
    return STARTING_PARTNERS
      .filter((p) => (q ? p.name.toLowerCase().startsWith(q) : true))
      .slice(0, 24);
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
  const avgTime = stats.answered > 0 ? Math.round(stats.totalAnswerTime / stats.answered / 100) / 10 : 0;

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

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />

      <div className="px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <h1 className="mb-3 font-pixel text-base">Profile</h1>

        {/* Hero card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl bg-gradient-to-br from-primary/15 via-card to-poke-yellow/15 p-4 shadow-card"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTrainerPickerOpen(true)}
              className="relative shrink-0 rounded-2xl bg-card p-1.5 shadow-pop transition active:scale-95"
            >
              <img
                src={trainerSpriteUrl(trainerSprite)}
                alt={trainerSprite}
                className="sprite h-16 w-16 object-contain"
              />
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                <Pencil className="h-3 w-3" />
              </div>
            </button>
            <div className="min-w-0 flex-1">
              {editingName ? (
                <div className="flex gap-2">
                  <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={16} className="h-8" autoFocus />
                  <Button size="sm" onClick={saveName}><Check className="h-4 w-4" /></Button>
                </div>
              ) : (
                <button
                  onClick={() => { setNameDraft(trainerName); setEditingName(true); }}
                  className="flex items-center gap-1.5 text-left transition active:scale-95"
                >
                  <h2 className="text-lg font-bold">{trainerName}</h2>
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-full bg-poke-dark px-2 py-0.5 font-pixel text-[9px] text-poke-yellow">
                  LV {level}
                </span>
                <span className="font-pixel text-[9px] text-muted-foreground truncate">{rank}</span>
              </div>
              <div className="mt-2"><XpBar xp={xpProg.current} need={xpProg.need} /></div>
            </div>
          </div>
        </motion.div>

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

        {/* Tabs */}
        <Tabs defaultValue="stats" className="mt-4">
          <TabsList className="grid w-full h-auto auto-rows-fr grid-cols-4 gap-1">
            <TabsTrigger value="stats" className="font-pixel text-[8px]">Stats</TabsTrigger>
            <TabsTrigger value="inventory" className="font-pixel text-[8px]">Inventory</TabsTrigger>
            <TabsTrigger value="trophies" className="font-pixel text-[8px]">Trophies</TabsTrigger>
            <TabsTrigger value="badges" className="font-pixel text-[8px]">Badges</TabsTrigger>
            <TabsTrigger value="abilities" className="font-pixel text-[8px]">Abilities</TabsTrigger>
            <TabsTrigger value="battles" className="font-pixel text-[8px]">Battles</TabsTrigger>
            <TabsTrigger value="settings" className="font-pixel text-[8px]">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Battles" value={stats.battles} />
              <Stat label="Wins" value={stats.wins} />
              <Stat label="Losses" value={stats.losses} />
              <Stat label="Accuracy" value={`${accuracy}%`} />
              <Stat label="Best Streak" value={stats.bestStreak} />
              <Stat label="Avg Time" value={`${avgTime}s`} />
            </div>
            {/* heatmap */}
            <div className="rounded-2xl bg-card p-3 shadow-sm">
              <div className="mb-2 font-pixel text-[9px] uppercase text-muted-foreground">Last 7 days</div>
              <div className="flex justify-between gap-1">
                {heatmap.map((d) => {
                  const intensity = Math.min(4, d.count);
                  const bg =
                    intensity === 0 ? "bg-muted"
                    : intensity === 1 ? "bg-primary/30"
                    : intensity === 2 ? "bg-primary/55"
                    : intensity === 3 ? "bg-primary/80"
                    : "bg-primary";
                  return (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                      <div className={`h-8 w-full rounded ${bg}`} title={`${d.date}: ${d.count}`} />
                      <div className="font-pixel text-[8px] text-muted-foreground">
                        {new Date(d.date).toLocaleDateString(undefined, { weekday: "narrow" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* inventory */}
            <div>
              <div className="mb-2 font-pixel text-[9px] uppercase text-muted-foreground">Inventory</div>
              <div className="grid grid-cols-4 gap-2 rounded-2xl bg-card p-3 shadow-sm">
                {ITEMS.map((it) => {
                  const n = inventory[it.id] ?? 0;
                  return (
                    <div key={it.id} className={`flex flex-col items-center rounded-xl p-2 ${n > 0 ? "bg-muted" : "opacity-30"}`} title={it.name}>
                      <img src={it.iconUrl} alt={it.name} crossOrigin="anonymous" className="sprite h-9 w-9 object-contain" onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement;
                        el.replaceWith(Object.assign(document.createElement("span"), { textContent: it.emoji, className: "text-2xl" }));
                      }} />
                      <div className="font-pixel text-[9px] text-primary">×{n}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="trophies" className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-pixel text-[9px] uppercase text-muted-foreground">
                {unlocked.size}/{ACHIEVEMENTS.length}
              </span>
              <span className="font-pixel text-[9px] text-primary">
                {Math.round((unlocked.size / ACHIEVEMENTS.length) * 100)}%
              </span>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-gradient-to-r from-poke-yellow to-primary"
                style={{ width: `${(unlocked.size / ACHIEVEMENTS.length) * 100}%` }} />
            </div>
            <div className="grid grid-cols-4 gap-2 rounded-2xl bg-card p-3 shadow-sm">
              {ACHIEVEMENTS.map((a) => {
                const got = unlocked.has(a.id);
                return (
                  <div key={a.id} title={`${a.name} — ${a.desc}`}
                    className={`flex flex-col items-center rounded-xl p-2 ${got ? "bg-poke-yellow/20" : "grayscale opacity-30"}`}>
                    <div className="text-2xl">{a.icon}</div>
                    <div className="mt-1 text-center text-[9px] font-semibold leading-tight">{a.name}</div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="badges" className="mt-3">
            <BadgesTab />
          </TabsContent>

          <TabsContent value="abilities" className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-pixel text-[9px] uppercase text-muted-foreground">
                {abilityCodex.length}/{Object.keys(ABILITIES).length} discovered
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(ABILITIES).map((ab) => {
                const known = abilityCodex.includes(ab.id);
                return (
                  <div
                    key={ab.id}
                    className={`rounded-2xl bg-card p-3 shadow-sm ${known ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="text-xs font-bold">{ab.name}</div>
                      <TypeBadge type={ab.type} />
                    </div>
                    <div className="mt-1 text-[10px] leading-tight text-muted-foreground">
                      {known ? ab.description : "???"}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="battles" className="mt-3">
            {battleLog.length === 0 ? (
              <p className="rounded-2xl bg-card p-4 text-center text-sm text-muted-foreground">No battles yet.</p>
            ) : (
              <div className="space-y-1.5 rounded-2xl bg-card p-3 shadow-sm">
                {battleLog.slice(0, 12).map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`font-pixel text-[9px] ${e.won ? "text-hp-good" : "text-destructive"}`}>{e.won ? "WIN" : "LOSS"}</span>
                    <span className="flex-1 truncate text-muted-foreground">vs {e.opponent}</span>
                    <span className="font-pixel text-[9px] text-primary">+{e.xpGained}</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-2xl border-2 bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                <span className="font-medium">Sound</span>
              </div>
              <Switch checked={!muted} onCheckedChange={(v) => { setMuted(!v); setMutedState(!v); }} />
            </div>


            <button
              onClick={() => setResetOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl border-2 border-destructive/30 bg-card p-4 text-destructive shadow-sm transition active:scale-95 hover:bg-destructive/5"
            >
              <div className="flex items-center gap-3">
                <RotateCcw className="h-5 w-5" />
                <span className="font-medium">Reset progress</span>
              </div>
            </button>
          </TabsContent>
        </Tabs>
      </div>

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
            <AlertDialogAction onClick={doReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pokémon picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Change partner</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="pl-10" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {results.map((p) => (
              <button key={p.id}
                onClick={() => { setPokemon(p); setPickerOpen(false); toast.success(`${p.name} chosen!`); }}
                className="flex flex-col items-center rounded-2xl border-2 p-2 transition active:scale-95 hover:border-primary">
                <PokemonSprite id={p.id} alt={p.name} className="sprite h-14 w-14" />
                <div className="text-[11px] font-semibold">{p.name}</div>
                <div className="font-pixel text-[8px] text-primary">⚡ {getAbility(p.types).name}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Trainer picker */}
      <Dialog open={trainerPickerOpen} onOpenChange={setTrainerPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Change trainer</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={trainerQuery} onChange={(e) => setTrainerQuery(e.target.value)} placeholder="Search trainers..." className="pl-10" />
          </div>
          <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto">
            {trainerResults.map((t) => (
              <button key={t.id}
                onClick={() => { setTrainerSprite(t.id); setTrainerPickerOpen(false); toast.success("Trainer updated!"); }}
                className="flex flex-col items-center rounded-2xl border-2 p-2 transition active:scale-95 hover:border-primary">
                <img src={trainerSpriteUrl(t.id)} alt={t.name} crossOrigin="anonymous" className="sprite h-16 w-16 object-contain" loading="lazy"
                  onError={() => setBrokenTrainerIds((s) => { const n = new Set(s); n.add(t.id); return n; })} />
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
              {pokemon.types.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
            </div>
            <span className="font-pixel text-[8px] text-primary">⚡ {getAbility(pokemon.types).name}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
        <div className="flex-1">
          <div className="flex items-center justify-between font-pixel text-[9px] text-muted-foreground">
            <span>TRAINING POINTS</span>
            <span>{tp}{cost ? ` / ${cost}` : ""}</span>
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
          <DialogHeader><DialogTitle>Choose evolution</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {targets.map((t) => (
              <button
                key={t.id}
                onClick={() => { setEvoOpen(false); onEvolve(t); }}
                className="flex flex-col items-center rounded-2xl border-2 p-3 transition hover:border-primary active:scale-95"
              >
                <PokemonSprite id={t.id} alt={t.name} className="sprite h-16 w-16" />
                <div className="mt-1 text-xs font-semibold">{t.name}</div>
                <div className="mt-1 flex gap-0.5">
                  {t.types.map((tt) => <TypeBadge key={tt} type={tt} size="sm" />)}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-card px-3 py-3 text-center shadow-sm">
      <div className="font-pixel text-base text-primary">{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

function BadgesTab() {
  const gymBadges = useGameStore((s) => s.gymBadges);
  const owned = new Set(gymBadges);
  const regions = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova"] as const;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[9px] uppercase text-muted-foreground">
          {owned.size}/{GYM_LEADERS.length} badges
        </span>
        <span className="font-pixel text-[9px] text-primary">
          {Math.round((owned.size / GYM_LEADERS.length) * 100)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-gradient-to-r from-poke-yellow to-primary"
          style={{ width: `${(owned.size / GYM_LEADERS.length) * 100}%` }}
        />
      </div>
      {regions.map((r) => {
        const leaders = GYM_LEADERS.filter((g) => g.region === r);
        return (
          <div key={r} className="rounded-2xl bg-card p-3 shadow-sm">
            <div className="mb-2 font-pixel text-[9px] uppercase text-muted-foreground">{r}</div>
            <div className="grid grid-cols-4 gap-2">
              {leaders.map((g) => {
                const got = owned.has(g.id);
                return (
                  <div
                    key={g.id}
                    title={`${g.name} — ${g.badge}`}
                    className={`flex flex-col items-center rounded-xl p-2 ${got ? "bg-poke-yellow/20" : "grayscale opacity-30"}`}
                  >
                    <div className="text-2xl">🎖</div>
                    <div className="mt-1 truncate text-center text-[9px] font-semibold leading-tight">
                      {g.name}
                    </div>
                    <div className="text-center text-[8px] leading-tight text-muted-foreground">
                      {got ? g.badge.replace(" Badge", "") : "???"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
