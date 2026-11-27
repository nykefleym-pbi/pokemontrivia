import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { NaIcon } from "@/components/na/icon";
import { playCry, playSfx } from "@/lib/audio";
import { useGameStore } from "@/lib/store";
import { useStoreHydrated } from "@/lib/store-hydration";
import { EggHatch } from "@/components/mega/EggHatch";
import { ALL_POKEMON, type PokeType } from "@/lib/pokemon-data";
import { FitSprite } from "@/components/na/battle";
import { DexCompletionCard } from "@/components/dex-completion-card";
import { DexDetail } from "@/components/dex-detail";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaRegionRow } from "@/components/na/region-row";
import { NaSheet } from "@/components/na/sheet";
import { GENERATIONS, dexStats, generation, nextClaimableMilestone } from "@/lib/dex-rewards";
import { dexStatus } from "@/lib/pokedex";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/pokedex")({
  head: () => pageHead("/pokedex"),
  component: PokedexPage,
});

const ALL_TYPES: PokeType[] = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];

/**
 * Entries you've opened in the Pokédex, so fresh catches wear NEW until you open
 * them (Figma 6.1, mechanic 2). The first visit counts every catch so far as
 * opened: an old save shouldn't light up a hundred badges.
 * shortcut: this device only; move into the store and save payload if NEW should follow a player across phones.
 */
const OPENED_KEY = "poke-trivia-dex-opened";
function useOpened(caughtIds: number[]) {
  const [opened, setOpened] = useState<Set<number> | null>(null);
  useEffect(() => {
    let ids: number[] | null = null;
    try {
      const raw = localStorage.getItem(OPENED_KEY);
      ids = raw ? (JSON.parse(raw) as number[]) : null;
    } catch {
      /* private mode: every catch just counts as opened */
    }
    if (!ids) {
      ids = caughtIds;
      try {
        localStorage.setItem(OPENED_KEY, JSON.stringify(ids));
      } catch {
        /* ignore */
      }
    }
    setOpened(new Set(ids));
    // read once per visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const open = (id: number) =>
    setOpened((s) => {
      if (!s || s.has(id)) return s;
      const n = new Set(s).add(id);
      try {
        localStorage.setItem(OPENED_KEY, JSON.stringify([...n]));
      } catch {
        /* ignore */
      }
      return n;
    });
  return { isNew: (id: number) => !!opened && !opened.has(id), open };
}

type Show = "all" | "caught" | "new";

function PokedexPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const hydrated = useStoreHydrated();
  const pokedex = useGameStore((s) => s.pokedex);
  const claimed = useGameStore((s) => s.claimedDexRewards);
  const battleRegion = useGameStore((s) => s.route.region);
  const navigate = useNavigate();
  // Starts on the region you battle in (route regions are generations 1-5).
  const [gen, setGen] = useState(battleRegion + 1);
  const [show, setShow] = useState<Show>("all");
  const [type, setType] = useState<"all" | PokeType>("all");
  const [shinyOnly, setShinyOnly] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showShiny, setShowShiny] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);

  const caughtIds = useMemo(() => Object.keys(pokedex).map(Number).filter((id) => dexStatus(pokedex[id]) === "caught"), [pokedex]);
  const { isNew, open } = useOpened(caughtIds);

  // The cry plays the moment an entry opens (owner ruling 2026-07-26).
  useEffect(() => {
    if (detailId != null) playCry(detailId);
  }, [detailId]);

  useEffect(() => {
    if (hydrated && !hasOnboarded) navigate({ to: "/" });
  }, [hydrated, hasOnboarded, navigate]);

  const range = generation(gen);
  const stats = useMemo(() => dexStats(pokedex, gen), [pokedex, gen]);
  const claimable = nextClaimableMilestone(stats, gen, claimed ?? []);

  const filtered = useMemo(
    () =>
      ALL_POKEMON.filter((p) => {
        if (p.id < range.from || p.id > range.to) return false;
        if (type !== "all" && !p.types.includes(type)) return false;
        const e = pokedex[p.id];
        if (shinyOnly && !e?.shinyUnlocked) return false;
        const caught = dexStatus(e) === "caught";
        if (show === "caught") return caught;
        if (show === "new") return caught && isNew(p.id);
        return true;
      }),
    [range, type, shinyOnly, show, pokedex, isNew],
  );

  if (!hydrated || !hasOnboarded) return null;

  return (
    <div className="h-full w-full overflow-y-auto pb-nav safe-x">
      <div className="flex flex-col gap-3.5 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+8px)]">
        {/* Header (6.1): title, the region chip and the egg button. */}
        <div className="flex items-center gap-2">
          <h1 className="na-display-m flex-1 text-foreground">POKÉDEX</h1>
          <button
            type="button"
            onClick={() => setRegionOpen(true)}
            className="press flex items-center gap-1.5 rounded-full border border-white/[0.16] bg-white/10 py-1.5 pl-2.5 pr-2"
          >
            <NaGlossIcon kind="map" size={16} />
            <span className="na-body-strong text-foreground">{range.region}</span>
            <NaIcon name="chevron-right" size={14} className="text-text-muted" />
          </button>
          <EggHatch />
        </div>

        {/* Region progress; tapping it opens the rewards card (6.1a), which also opens by itself when a reward is waiting. */}
        <button type="button" aria-expanded={cardOpen || claimable !== null} onClick={() => setCardOpen((v) => !v)} className="flex flex-col gap-1.5 text-left">
          <span className="na-caption text-text-secondary">
            {stats.caught} of {stats.total} registered! Complete your Pokédex to earn rewards!
          </span>
          <span className="block h-2 w-full overflow-hidden rounded bg-night-deep">
            <span className="na-fill-gold block h-full rounded" style={{ width: `${Math.max(1, stats.pct * 100)}%` }} />
          </span>
        </button>
        {(cardOpen || claimable !== null) && <DexCompletionCard gen={gen} />}

        {/* All / Caught / New */}
        <div role="tablist" className="flex gap-1 rounded-[14px] bg-night-deep/60 p-1">
          {(["all", "caught", "new"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={show === s}
              onClick={() => setShow(s)}
              className={`flex h-[38px] flex-1 items-center justify-center rounded-[10px] ${
                show === s ? "na-body-strong bg-night-card-2 text-foreground shadow-[0_4px_0_#141A3F]" : "na-body text-text-secondary"
              }`}
            >
              {s === "all" ? "All" : s === "caught" ? "Caught" : "New"}
            </button>
          ))}
        </div>

        {/* Type and Shiny, as today. */}
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`press flex items-center gap-1.5 rounded-full border bg-white/10 px-3 py-[7px] ${type === "all" ? "border-white/[0.16]" : "border-reward-gold"}`}
              >
                <span className="flex gap-0.5" aria-hidden>
                  {(type === "all" ? (["grass", "fire", "water"] as const) : [type]).map((t) => (
                    <span key={t} className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--type-${t})` }} />
                  ))}
                </span>
                <span className="na-body-strong capitalize text-foreground">{type === "all" ? "+ Type" : type}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 rounded-2xl border-white/10 bg-night-raised p-2" align="start">
              <div className="flex flex-wrap gap-1">
                {(["all", ...ALL_TYPES] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`press rounded-full px-2.5 py-1 text-[11px] font-bold capitalize text-white ${type === t ? "ring-2 ring-reward-gold" : ""}`}
                    style={{ background: t === "all" ? "rgb(255 255 255 / 0.14)" : `var(--type-${t})` }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            aria-pressed={shinyOnly}
            onClick={() => setShinyOnly((v) => !v)}
            className={`press flex items-center gap-1.5 rounded-full border bg-white/10 px-3 py-[7px] ${shinyOnly ? "border-reward-gold" : "border-white/[0.16]"}`}
          >
            <NaIcon name="sparkle" size={16} className="text-reward-gold" />
            <span className="na-body-strong text-foreground">Shiny</span>
          </button>
        </div>

        {/* The grid: four per row, number under each (Figma Dex cell). */}
        <div className="grid grid-cols-4 gap-x-3 gap-y-3.5 pb-6">
          {filtered.map((p) => {
            const e = pokedex[p.id];
            const status = dexStatus(e);
            const caught = status === "caught";
            const fresh = caught && isNew(p.id);
            const num = `#${String(p.id).padStart(3, "0")}`;
            return (
              <button
                key={p.id}
                type="button"
                aria-label={status ? `${p.name} ${num}${fresh ? ", new" : ""}` : `Unknown ${num}`}
                onClick={() => {
                  open(p.id);
                  setDetailId(p.id);
                  setShowShiny(!!e?.shinyUnlocked);
                }}
                style={{ contentVisibility: "auto", containIntrinsicSize: "80px 92px" }}
                className={`press relative flex flex-col items-center gap-1 rounded-2xl px-1.5 py-[7px] ${
                  fresh
                    ? "na-glow-gold border-[1.5px] border-reward-gold bg-white/[0.08]"
                    : status
                      ? "border border-white/[0.12] bg-white/[0.08]"
                      : "border border-white/[0.12] bg-white/[0.04]"
                }`}
              >
                {status ? (
                  <FitSprite id={p.id} shiny={!!e?.shinyUnlocked} size={56} className={caught ? "" : "sprite-silhouette"} />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-night-deep/60">
                    <NaGlossIcon kind="question" size={28} />
                  </span>
                )}
                <span className={`na-label ${status ? "text-text-secondary" : "text-text-muted"}`}>{num}</span>
                {fresh && <span className="na-fill-gold na-label absolute left-1 top-1 rounded-md px-[5px] py-px text-on-gold">NEW</span>}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="na-body col-span-4 py-10 text-center text-text-secondary">
              {show === "new" ? "No new Pokémon. Win battles to catch more!" : "Nothing here yet!"}
            </p>
          )}
        </div>
      </div>

      <NaSheet
        open={regionOpen}
        onOpenChange={setRegionOpen}
        title="CHOOSE A REGION"
        body="See every Pokémon of a region and how many you've caught!"
        secondary={{ label: "Cancel", onClick: () => setRegionOpen(false) }}
      >
        {GENERATIONS.map((g) => {
          const s = dexStats(pokedex, g.gen);
          return (
            <NaRegionRow
              key={g.gen}
              name={g.region}
              sub={`${s.caught} of ${s.total} caught`}
              pct={s.pct}
              on={g.gen === gen}
              onClick={() => {
                setGen(g.gen);
                setRegionOpen(false);
              }}
            />
          );
        })}
      </NaSheet>

      {detailId !== null &&
        (() => {
          const p = ALL_POKEMON.find((x) => x.id === detailId);
          if (!p) return null;
          const entry = pokedex[detailId];
          return (
            <DexDetail
              species={p}
              caught={!!entry}
              shinyUnlocked={!!entry?.shinyUnlocked}
              showShiny={showShiny}
              onToggleShiny={() =>
                setShowShiny((v) => {
                  if (!v) playSfx("shiny");
                  return !v;
                })
              }
              onPlayCry={() => playCry(p.id)}
              onSelect={(id) => {
                open(id);
                setDetailId(id);
                setShowShiny(false);
              }}
              onClose={() => setDetailId(null)}
              isCaught={(id) => !!pokedex[id]}
            />
          );
        })()}
    </div>
  );
}
