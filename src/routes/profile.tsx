import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Pencil, RotateCcw, Check, Search, Volume2, VolumeX, Sparkles } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { rankForLevel, xpProgressInLevel, ITEMS, TRAINER_SPRITES, trainerSpriteUrl } from "@/lib/game-data";
import { ALL_POKEMON, searchPokemon, spriteUrl, type PokeType } from "@/lib/pokemon-data";
import { AppHeader, XpBar, TypeBadge } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
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



  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(trainerName);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trainerPickerOpen, setTrainerPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [trainerQuery, setTrainerQuery] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [muted, setMutedState] = useState(false);
  const fullState = useGameStore();
  const battleLog = useGameStore((s) => s.battleLog);
  const pokedex = useGameStore((s) => s.pokedex);
  const [dexGen, setDexGen] = useState(1);
  const [dexQuery, setDexQuery] = useState("");
  const [dexType, setDexType] = useState<"all" | PokeType>("all");
  const [dexDetailId, setDexDetailId] = useState<number | null>(null);
  const [dexShowShiny, setDexShowShiny] = useState(false);
  const unlocked = useMemo(() => new Set(unlockedAchievements(fullState)), [fullState]);

  useEffect(() => { setMutedState(isMuted()); }, []);

  useEffect(() => {
    if (!hasOnboarded) navigate({ to: "/" });
  }, [hasOnboarded, navigate]);

  const results = useMemo(() => searchPokemon(query, 9), [query]);
  const trainerResults = useMemo(() => {
    const q = trainerQuery.trim().toLowerCase();
    if (!q) return TRAINER_SPRITES.slice(0, 9);
    return TRAINER_SPRITES.filter((t) => t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)).slice(0, 30);
  }, [trainerQuery]);

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
      <AppHeader>
        <h1 className="font-pixel text-base">Profile</h1>
      </AppHeader>

      <div className="px-5 pb-8 pt-2">
        {/* Identity card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl bg-gradient-to-br from-primary/15 via-card to-poke-yellow/15 p-5 shadow-card"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => setTrainerPickerOpen(true)}
              className="relative shrink-0 rounded-3xl bg-card p-2 shadow-pop"
            >
              <img
                src={trainerSpriteUrl(trainerSprite)}
                alt={trainerSprite}
                className="sprite h-20 w-20 object-contain"
              />
              <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                <Pencil className="h-3 w-3" />
              </div>
            </button>
            <div className="min-w-0 flex-1">
              {editingName ? (
                <div className="flex gap-2">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={16}
                    className="h-9"
                    autoFocus
                  />
                  <Button size="sm" onClick={saveName}>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setNameDraft(trainerName);
                    setEditingName(true);
                  }}
                  className="flex items-center gap-1.5 text-left"
                >
                  <h2 className="text-xl font-bold">{trainerName}</h2>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-full bg-poke-dark px-2 py-0.5 font-pixel text-[9px] text-poke-yellow">
                  LV {level}
                </span>
                <span className="font-pixel text-[10px] text-muted-foreground">{rank}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {pokemon.types.map((t) => (
                  <TypeBadge key={t} type={t} />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <XpBar xp={xpProg.current} need={xpProg.need} />
          </div>
        </motion.div>

        {/* Starter card */}
        <button
          onClick={() => setPickerOpen(true)}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left shadow-sm transition hover:bg-muted/50"
        >
          <img
            src={spriteUrl(pokemon.id)}
            alt={pokemon.name}
            className="sprite h-14 w-14"
          />
          <div className="flex-1">
            <div className="font-pixel text-[10px] uppercase text-muted-foreground">Starter</div>
            <div className="text-sm font-bold">{pokemon.name}</div>
          </div>
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Stats grid */}
        <h3 className="mb-2 mt-6 font-pixel text-[11px] uppercase text-muted-foreground">Stats</h3>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Battles" value={stats.battles} />
          <Stat label="Wins" value={stats.wins} />
          <Stat label="Losses" value={stats.losses} />
          <Stat label="Accuracy" value={`${accuracy}%`} />
          <Stat label="Best Streak" value={stats.bestStreak} />
          <Stat label="Avg Time" value={`${avgTime}s`} />
        </div>

        {/* Inventory */}
        <h3 className="mb-2 mt-6 font-pixel text-[11px] uppercase text-muted-foreground">Inventory</h3>
        <div className="grid grid-cols-4 gap-2 rounded-2xl bg-card p-3 shadow-sm">
          {ITEMS.map((it) => {
            const n = inventory[it.id] ?? 0;
            return (
              <div
                key={it.id}
                className={`flex flex-col items-center rounded-xl p-2 ${
                  n > 0 ? "bg-muted" : "opacity-30"
                }`}
                title={it.name}
              >
                <img
                  src={it.iconUrl}
                  alt={it.name}
                  className="sprite h-9 w-9 object-contain"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    el.replaceWith(
                      Object.assign(document.createElement("span"), {
                        textContent: it.emoji,
                        className: "text-2xl",
                      }),
                    );
                  }}
                />
                <div className="font-pixel text-[9px] text-primary">×{n}</div>
              </div>
            );
          })}
        </div>

        {/* Trophies */}
        <h3 className="mb-2 mt-6 font-pixel text-[11px] uppercase text-muted-foreground">
          Trophies ({unlocked.size}/{ACHIEVEMENTS.length})
        </h3>
        <div className="grid grid-cols-4 gap-2 rounded-2xl bg-card p-3 shadow-sm">
          {ACHIEVEMENTS.map((a) => {
            const got = unlocked.has(a.id);
            return (
              <div
                key={a.id}
                title={`${a.name} — ${a.desc}`}
                className={`flex flex-col items-center rounded-xl p-2 ${got ? "bg-poke-yellow/20" : "grayscale opacity-30"}`}
              >
                <div className="text-2xl">{a.icon}</div>
                <div className="mt-1 text-center text-[9px] font-semibold leading-tight">{a.name}</div>
              </div>
            );
          })}
        </div>

        {/* Pokédex */}
        <PokedexSection
          pokedex={pokedex}
          dexGen={dexGen}
          setDexGen={setDexGen}
          dexQuery={dexQuery}
          setDexQuery={setDexQuery}
          dexType={dexType}
          setDexType={setDexType}
          onOpen={(id) => { setDexDetailId(id); setDexShowShiny(false); }}
        />

        {/* Battle Log */}
        {battleLog.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 font-pixel text-[11px] uppercase text-muted-foreground">Recent Battles</h3>
            <div className="space-y-1.5 rounded-2xl bg-card p-3 shadow-sm">
              {battleLog.slice(0, 10).map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className={e.won ? "text-hp-good" : "text-destructive"}>{e.won ? "WIN" : "LOSS"}</span>
                  <span className="flex-1 truncate px-2 text-muted-foreground">vs {e.opponent}</span>
                  <span className="font-pixel text-[10px] text-primary">+{e.xpGained} XP</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Settings */}
        <h3 className="mb-2 mt-6 font-pixel text-[11px] uppercase text-muted-foreground">Settings</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-2xl border-2 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              <span className="font-medium">Sound</span>
            </div>
            <Switch
              checked={!muted}
              onCheckedChange={(v) => { setMuted(!v); setMutedState(!v); }}
            />
          </div>
          <button
            onClick={() => setResetOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl border-2 border-destructive/30 bg-card p-4 text-destructive shadow-sm transition hover:bg-destructive/5"
          >
            <div className="flex items-center gap-3">
              <RotateCcw className="h-5 w-5" />
              <span className="font-medium">Reset progress</span>
            </div>
          </button>
        </div>
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
          <DialogHeader>
            <DialogTitle>Change starter</DialogTitle>
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
                className="flex flex-col items-center rounded-2xl border-2 p-2 transition hover:border-primary"
              >
                <img src={spriteUrl(p.id)} alt={p.name} className="sprite h-14 w-14" />
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
                  toast.success(`Trainer updated!`);
                }}
                className="flex flex-col items-center rounded-2xl border-2 p-2 transition hover:border-primary"
              >
                <img
                  src={trainerSpriteUrl(t.id)}
                  alt={t.name}
                  className="sprite h-16 w-16 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                  }}
                />
                <div className="text-[11px] font-semibold capitalize">{t.name}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Pokédex detail */}
      <Dialog open={dexDetailId !== null} onOpenChange={(o) => !o && setDexDetailId(null)}>
        <DialogContent className="max-w-xs">
          {dexDetailId !== null && (() => {
            const p = ALL_POKEMON.find((x) => x.id === dexDetailId);
            const entry = pokedex[dexDetailId];
            if (!p) return null;
            const showShiny = dexShowShiny && entry?.shinyUnlocked;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span>#{String(p.id).padStart(4, "0")} {p.name}</span>
                    {entry?.shinyUnlocked && <Sparkles className="h-4 w-4 text-yellow-400" />}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col items-center gap-3">
                  <img src={spriteUrl(p.id, { shiny: showShiny })} alt={p.name} className="sprite h-32 w-32" />
                  <div className="flex gap-1">{p.types.map((t) => <TypeBadge key={t} type={t} />)}</div>
                  {entry ? (
                    <div className="text-center text-xs text-muted-foreground">
                      <div>Defeated {entry.defeatCount}×</div>
                      <div>First seen {new Date(entry.firstSeenAt).toLocaleDateString()}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Not yet captured</div>
                  )}
                  {entry?.shinyUnlocked && (
                    <Button size="sm" variant="outline" onClick={() => setDexShowShiny((v) => !v)}>
                      Toggle {showShiny ? "Normal" : "Shiny"}
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ALL_TYPES: PokeType[] = [
  "normal","fire","water","electric","grass","ice","fighting","poison","ground",
  "flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy",
];

const GEN_RANGES: Array<{ gen: number; from: number; to: number }> = [
  { gen: 1, from: 1, to: 151 },
  { gen: 2, from: 152, to: 251 },
  { gen: 3, from: 252, to: 386 },
  { gen: 4, from: 387, to: 493 },
  { gen: 5, from: 494, to: 649 },
  { gen: 6, from: 650, to: 721 },
  { gen: 7, from: 722, to: 809 },
  { gen: 8, from: 810, to: 905 },
  { gen: 9, from: 906, to: 1025 },
];

function PokedexSection({
  pokedex,
  dexGen,
  setDexGen,
  dexQuery,
  setDexQuery,
  dexType,
  setDexType,
  onOpen,
}: {
  pokedex: Record<number, import("@/lib/store").PokedexEntry>;
  dexGen: number;
  setDexGen: (n: number) => void;
  dexQuery: string;
  setDexQuery: (s: string) => void;
  dexType: "all" | PokeType;
  setDexType: (t: "all" | PokeType) => void;
  onOpen: (id: number) => void;
}) {
  const total = ALL_POKEMON.length;
  const captured = Object.keys(pokedex).length;
  const shinies = Object.values(pokedex).filter((e) => e.shinyUnlocked).length;

  const range = GEN_RANGES.find((g) => g.gen === dexGen)!;
  const q = dexQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    return ALL_POKEMON.filter((p) => {
      if (p.id < range.from || p.id > range.to) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (dexType !== "all" && !p.types.includes(dexType)) return false;
      return true;
    });
  }, [range.from, range.to, q, dexType]);

  return (
    <>
      <h3 className="mb-2 mt-6 flex items-center justify-between font-pixel text-[11px] uppercase text-muted-foreground">
        <span>Pokédex {captured}/{total}</span>
        <span className="flex items-center gap-1 text-yellow-500">
          <Sparkles className="h-3 w-3" /> {shinies}
        </span>
      </h3>
      <div className="rounded-2xl bg-card p-3 shadow-sm">
        <div className="mb-2 flex gap-2">
          <Input
            value={dexQuery}
            onChange={(e) => setDexQuery(e.target.value)}
            placeholder="Search name..."
            className="h-8 flex-1 text-xs"
          />
          <select
            value={dexType}
            onChange={(e) => setDexType(e.target.value as "all" | PokeType)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="all">All types</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {GEN_RANGES.map((g) => (
            <button
              key={g.gen}
              onClick={() => setDexGen(g.gen)}
              className={`rounded-full px-2 py-0.5 font-pixel text-[9px] ${
                dexGen === g.gen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              GEN {g.gen}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {filtered.map((p) => {
            const e = pokedex[p.id];
            const got = !!e;
            return (
              <button
                key={p.id}
                onClick={() => onOpen(p.id)}
                className={`relative flex flex-col items-center rounded-lg p-1 ${
                  got ? "bg-muted/50" : "bg-muted/20"
                }`}
              >
                <img
                  src={spriteUrl(p.id)}
                  alt={got ? p.name : "???"}
                  loading="lazy"
                  className="sprite h-12 w-12"
                  style={got ? undefined : { filter: "brightness(0)" }}
                />
                <div className="w-full truncate text-center text-[8px] font-semibold">
                  {got ? p.name : "???"}
                </div>
                {got && e.defeatCount > 1 && (
                  <div className="absolute right-0.5 top-0.5 rounded bg-primary px-1 font-pixel text-[7px] text-primary-foreground">
                    ×{e.defeatCount}
                  </div>
                )}
                {e?.shinyUnlocked && (
                  <Sparkles className="absolute left-0.5 top-0.5 h-3 w-3 text-yellow-400" />
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-5 py-4 text-center text-xs text-muted-foreground">
              No matches.
            </div>
          )}
        </div>
      </div>
    </>
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
