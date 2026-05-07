import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Pencil, RotateCcw, Check, Search } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { rankForLevel, xpProgressInLevel, ITEMS, TRAINER_SPRITES, trainerSpriteUrl } from "@/lib/game-data";
import { searchPokemon, spriteUrl } from "@/lib/pokemon-data";
import { AppHeader, XpBar, TypeBadge } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  useEffect(() => {
    if (!hasOnboarded) navigate({ to: "/" });
  }, [hasOnboarded, navigate]);

  const results = useMemo(() => searchPokemon(query, 9), [query]);
  const trainerResults = useMemo(() => {
    const q = trainerQuery.trim().toLowerCase();
    if (!q) return TRAINER_SPRITES.slice(0, 9);
    return TRAINER_SPRITES.filter((id) => id.toLowerCase().includes(q)).slice(0, 30);
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
    if (confirm("Reset all progress? This cannot be undone.")) {
      reset();
      navigate({ to: "/" });
    }
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

        {/* Settings */}
        <h3 className="mb-2 mt-6 font-pixel text-[11px] uppercase text-muted-foreground">Settings</h3>
        <div className="space-y-2">
          <button
            onClick={doReset}
            className="flex w-full items-center justify-between rounded-2xl border-2 border-destructive/30 bg-card p-4 text-destructive shadow-sm transition hover:bg-destructive/5"
          >
            <div className="flex items-center gap-3">
              <RotateCcw className="h-5 w-5" />
              <span className="font-medium">Reset progress</span>
            </div>
          </button>
        </div>
      </div>

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
            {trainerResults.map((id) => (
              <button
                key={id}
                onClick={() => {
                  setTrainerSprite(id);
                  setTrainerPickerOpen(false);
                  toast.success(`Trainer updated!`);
                }}
                className="flex flex-col items-center rounded-2xl border-2 p-2 transition hover:border-primary"
              >
                <img
                  src={trainerSpriteUrl(id)}
                  alt={id}
                  className="sprite h-16 w-16 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                  }}
                />
                <div className="text-[11px] font-semibold capitalize">{id}</div>
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
