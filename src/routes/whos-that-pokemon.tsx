import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useGameStore } from "@/lib/store";
import { ALL_POKEMON, spriteUrl, type PokeType } from "@/lib/pokemon-data";
import { ITEMS, type ItemId } from "@/lib/game-data";
import { PokemonSprite } from "@/components/game-ui";
import { playCry } from "@/lib/audio";

export const Route = createFileRoute("/whos-that-pokemon")({
  component: WhosThatPokemon,
});

const HOUR = 3_600_000;
const SHINY_RATE = 1 / 20;
const ANSWER_SECONDS = 20;
const CRY_PLAYS = 3;

const TYPES: PokeType[] = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison",
  "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];
const TYPE_BG: Record<PokeType, string> = {
  normal: "bg-type-normal", fire: "bg-type-fire", water: "bg-type-water",
  electric: "bg-type-electric", grass: "bg-type-grass", ice: "bg-type-ice",
  fighting: "bg-type-fighting", poison: "bg-type-poison", ground: "bg-type-ground",
  flying: "bg-type-flying", psychic: "bg-type-psychic", bug: "bg-type-bug",
  rock: "bg-type-rock", ghost: "bg-type-ghost", dragon: "bg-type-dragon",
  dark: "bg-poke-dark", steel: "bg-muted-foreground", fairy: "bg-pink-400",
};
const TYPE_TEXT: Record<PokeType, string> = {
  normal: "text-type-normal", fire: "text-type-fire", water: "text-type-water",
  electric: "text-type-electric", grass: "text-type-grass", ice: "text-type-ice",
  fighting: "text-type-fighting", poison: "text-type-poison", ground: "text-type-ground",
  flying: "text-type-flying", psychic: "text-type-psychic", bug: "text-type-bug",
  rock: "text-type-rock", ghost: "text-type-ghost", dragon: "text-type-dragon",
  dark: "text-poke-dark", steel: "text-muted-foreground", fairy: "text-pink-400",
};

const REWARD_POOL = ITEMS.filter((i) => !i.premium);

function normalizeName(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findByNorm(input: string) {
  const n = normalizeName(input);
  if (!n) return undefined;
  return ALL_POKEMON.find((p) => normalizeName(p.name) === n);
}
function sameTypes(a: PokeType[], b: PokeType[]): boolean {
  if (a.length !== b.length) return false;
  return [...a].sort().join(",") === [...b].sort().join(",");
}
function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
function fmtHMS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

type Mode = "1A" | "1B" | "2" | "3" | "4" | "5";
interface Round {
  monId: number; name: string; types: PokeType[]; mode: Mode;
  isShiny: boolean; rewardId: ItemId; rewardName: string; rewardIcon: string;
  cropBack: boolean; cropDX: number; cropDY: number;
  choices: string[];
}
interface DexEntry { flavor: string; genus: string; heightM: string; }

function makeRound(): Round {
  const mon = ALL_POKEMON[Math.floor(Math.random() * ALL_POKEMON.length)];
  const reward = REWARD_POOL[Math.floor(Math.random() * REWARD_POOL.length)];
  const mode = (["1A", "1B", "2", "3", "4", "5"] as Mode[])[Math.floor(Math.random() * 6)];
  const others = sample(ALL_POKEMON.filter((p) => p.id !== mon.id), 3).map((p) => p.name);
  return {
    monId: mon.id, name: mon.name, types: mon.types, mode,
    isShiny: Math.random() < SHINY_RATE,
    rewardId: reward.id, rewardName: reward.name, rewardIcon: reward.iconUrl,
    cropBack: mon.id <= 649 ? Math.random() < 0.5 : false,
    cropDX: Math.round((Math.random() - 0.5) * 56),
    cropDY: Math.round((Math.random() - 0.5) * 56),
    choices: sample([mon.name, ...others], 4),
  };
}

function WhosThatPokemon() {
  const navigate = useNavigate();
  const whosThatHourKey = useGameStore((s) => s.whosThatHourKey);
  const consumeWhosThat = useGameStore((s) => s.consumeWhosThat);
  const addXp = useGameStore((s) => s.addXp);
  const grantItem = useGameStore((s) => s.grantItem);
  const recordPokedexCapture = useGameStore((s) => s.recordPokedexCapture);

  const [round, setRound] = useState<Round | null>(null);
  const [locked, setLocked] = useState(false);
  const [phase, setPhase] = useState<"play" | "correct" | "incorrect">("play");
  const [guess, setGuess] = useState("");
  const [selTypes, setSelTypes] = useState<PokeType[]>([]);
  const [selChoice, setSelChoice] = useState<string | null>(null);
  const [caught, setCaught] = useState<{ id: number; name: string } | null>(null);
  const [playsLeft, setPlaysLeft] = useState(CRY_PLAYS);
  const [dexEntry, setDexEntry] = useState<DexEntry | null>(null);
  const [dexLoading, setDexLoading] = useState(false);
  const [dexNonce, setDexNonce] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ANSWER_SECONDS);
  const [now, setNow] = useState(Date.now());
  const claimedRef = useRef(false);
  const initRef = useRef(false);

  const ready = !round || round.mode !== "5" || (!!dexEntry && dexEntry.flavor !== "");

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (Math.floor(Date.now() / HOUR) === whosThatHourKey) setLocked(true);
    else { setRound(makeRound()); consumeWhosThat(); }
  }, [whosThatHourKey, consumeWhosThat]);

  useEffect(() => {
    if (round?.mode !== "5") return;
    let cancelled = false;
    setDexLoading(true); setDexEntry(null);
    (async () => {
      try {
        const [spRes, pkRes] = await Promise.all([
          fetch(`https://pokeapi.co/api/v2/pokemon-species/${round.monId}`),
          fetch(`https://pokeapi.co/api/v2/pokemon/${round.monId}`),
        ]);
        if (!spRes.ok) throw new Error("species");
        const sp = await spRes.json();
        const pk = pkRes.ok ? await pkRes.json() : null;
        const fe = (sp.flavor_text_entries || []).find((e: { language?: { name: string } }) => e.language?.name === "en");
        const flavor = ((fe?.flavor_text as string) || "").replace(/[\f\n\r]/g, " ").replace(/\s+/g, " ").trim();
        const ge = (sp.genera || []).find((g: { language?: { name: string } }) => g.language?.name === "en");
        const genus = ((ge?.genus as string) || "").replace(/\s*Pokémon\s*$/i, "").toUpperCase();
        const heightM = pk?.height ? `${(pk.height / 10).toFixed(1)} m` : "";
        if (!cancelled) { setDexEntry({ flavor, genus, heightM }); setDexLoading(false); }
      } catch {
        if (!cancelled) { setDexEntry({ flavor: "", genus: "", heightM: "" }); setDexLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [round?.mode, round?.monId, dexNonce]);

  useEffect(() => {
    if (phase !== "play" || !round || !ready) return;
    if (timeLeft <= 0) { setPhase("incorrect"); return; }
    const t = setTimeout(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, round, ready, timeLeft]);

  useEffect(() => {
    if (phase !== "incorrect" && !locked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase, locked]);

  useEffect(() => {
    if (phase === "correct" && round && !claimedRef.current) {
      claimedRef.current = true;
      addXp(100);
      grantItem(round.rewardId, 1);
      recordPokedexCapture(caught?.id ?? round.monId, round.isShiny);
    }
  }, [phase, round, caught, addXp, grantItem, recordPokedexCapture]);

  const goHome = () => navigate({ to: "/battle" });

  const canSubmit = !round ? false
    : round.mode === "1B" ? selTypes.length > 0
    : round.mode === "3" ? selChoice !== null
    : guess.trim().length > 0;

  function submit() {
    if (!round || !canSubmit) return;
    if (round.mode === "1B") { setPhase(sameTypes(selTypes, round.types) ? "correct" : "incorrect"); return; }
    if (round.mode === "3") { setPhase(selChoice === round.name ? "correct" : "incorrect"); return; }
    if (round.mode === "4") {
      const m = findByNorm(guess);
      if (m && sameTypes(m.types, round.types)) { setCaught({ id: m.id, name: m.name }); setPhase("correct"); }
      else setPhase("incorrect");
      return;
    }
    setPhase(normalizeName(guess) === normalizeName(round.name) ? "correct" : "incorrect");
  }
  function toggleType(t: PokeType) {
    setSelTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : p.length >= 2 ? p : [...p, t]));
  }
  function playCryNow() {
    if (!round || playsLeft <= 0) return;
    playCry(round.monId);
    setPlaysLeft((n) => n - 1);
  }

  const msToNextHour = HOUR - (now % HOUR);

  if (locked) {
    return (
      <div className="flex h-full w-full flex-col overflow-y-auto bg-poke-cream px-5 pb-10 pt-8 text-center">
        <h1 className="font-pixel text-lg leading-relaxed text-foreground">WHO'S THAT<br />POKÉMON?</h1>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="text-5xl">⏰</div>
          <div className="font-pixel text-[10px] uppercase tracking-wide text-foreground/50">Play again in</div>
          <div className="font-pixel text-xl text-primary">{fmtHMS(msToNextHour)}</div>
        </div>
        <button onClick={goHome} className="rounded-full border-2 border-poke-dark/15 bg-white py-3.5 font-pixel text-sm tracking-wide text-poke-dark shadow-card active:scale-[0.98]">CLOSE</button>
      </div>
    );
  }
  if (!round) return null;

  if (phase === "correct") {
    const shown = caught ?? { id: round.monId, name: round.name };
    return (
      <div className="flex h-full w-full flex-col overflow-y-auto bg-poke-cream px-5 pb-8 pt-10">
        <div className="relative flex flex-col items-center">
          <div className="absolute inset-x-0 top-4 mx-auto h-56 w-56" style={{ background: "repeating-conic-gradient(from 0deg, rgba(245,197,24,0.22) 0deg 6deg, transparent 6deg 14deg)" }} />
          {round.isShiny && <div className="z-10 mb-1 rounded-full bg-poke-yellow px-3 py-1 font-pixel text-[10px] text-poke-dark shadow-card">✨ SHINY!</div>}
          <PokemonSprite id={shown.id} shiny={round.isShiny} alt={shown.name} className={`relative z-10 h-44 w-44 [image-rendering:pixelated] ${round.isShiny ? "drop-shadow-[0_0_14px_rgba(245,197,24,0.85)]" : ""}`} />
          <h1 className="z-10 mt-2 text-3xl font-extrabold text-foreground">It's {shown.name}!</h1>
        </div>
        <div className="mt-6 space-y-3">
          <Row icon={<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-poke-yellow/30 text-xl">⭐</div>} title="+100 XP" />
          <Row sub="You got" title={round.rewardName} icon={<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10"><img src={round.rewardIcon} alt={round.rewardName} className="h-7 w-7 [image-rendering:pixelated]" /></div>} />
          <Row icon={<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-hp-good/20 text-xl">✓</div>} title="Added to Pokédex" />
        </div>
        <div className="flex-1" />
        <button onClick={goHome} className="rounded-full bg-primary py-4 font-pixel text-base tracking-wide text-primary-foreground shadow-card active:scale-[0.98]">COLLECT</button>
      </div>
    );
  }

  if (phase === "incorrect") {
    return (
      <div className="flex h-full w-full flex-col overflow-y-auto items-center bg-poke-cream px-5 pb-8 pt-12 text-center">
        <PokemonSprite id={round.monId} alt={round.name} className="h-40 w-40 [image-rendering:pixelated] opacity-90" />
        <h1 className="mt-4 text-3xl font-extrabold text-foreground">Not quite…</h1>
        {round.mode === "4"
          ? <p className="mt-2 text-lg text-foreground/70">e.g. <span className="font-bold text-foreground">{round.name}</span> has that typing.</p>
          : <p className="mt-2 text-lg text-foreground/70">It was <span className="font-bold text-foreground">{round.name}</span>.</p>}
        <div className="mt-6 font-pixel text-[10px] uppercase tracking-wide text-foreground/45">Play again in</div>
        <div className="mt-1 font-pixel text-base text-primary">{fmtHMS(msToNextHour)}</div>
        <div className="flex-1" />
        <button onClick={goHome} className="w-full rounded-full border-2 border-poke-dark/15 bg-white py-3.5 font-pixel text-sm tracking-wide text-poke-dark shadow-card active:scale-[0.98]">CLOSE</button>
      </div>
    );
  }

  const silhouettePanel = (
    <div className="relative mx-auto mt-6 aspect-square w-64 overflow-hidden rounded-[28px] shadow-card" style={{ background: "radial-gradient(circle at 50% 45%, #ff6a5d 0%, #e03a2f 55%, #b3261c 100%)" }}>
      <div className="absolute inset-0" style={{ background: "repeating-conic-gradient(from 0deg at 50% 45%, rgba(255,255,255,0.10) 0deg 4deg, transparent 4deg 9deg)" }} />
      <PokemonSprite id={round.monId} alt="silhouette" className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 [filter:brightness(0)] [image-rendering:pixelated]" />
    </div>
  );
  const nameInput = (
    <div className="mt-auto pt-8">
      <input value={guess} onChange={(e) => setGuess(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Type the Pokémon's name…" autoFocus
        className="w-full rounded-full border-2 border-poke-dark/10 bg-white px-5 py-4 text-base text-poke-dark shadow-card outline-none placeholder:text-poke-dark/35 focus:border-primary/40" />
      <button onClick={submit} disabled={!canSubmit} className="mt-3 w-full rounded-full bg-primary py-4 font-pixel text-base tracking-wide text-primary-foreground shadow-card disabled:opacity-50 active:scale-[0.98]">SUBMIT</button>
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-poke-cream px-5 pb-8 pt-6">
      <div className="flex items-center justify-between">
        <button onClick={goHome} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl text-poke-dark shadow-card active:scale-95">‹</button>
        <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-pixel text-[11px] text-primary shadow-card"><span>⏱</span>{`0:${String(timeLeft).padStart(2, "0")}`}</div>
      </div>
      <h1 className="mt-3 text-center font-pixel text-lg leading-relaxed text-foreground">WHO'S THAT<br />POKÉMON?</h1>

      {(round.mode === "1A" || round.mode === "1B") && silhouettePanel}

      {round.mode === "2" && (
        <div className="relative mx-auto mt-8 h-60 w-60 overflow-hidden rounded-full border-[6px] border-poke-dark bg-poke-dark shadow-card ring-4 ring-white">
          <div
            className="absolute inset-0 [image-rendering:pixelated]"
            style={{
              backgroundImage: `url(${spriteUrl(round.monId, { back: round.cropBack })})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: "300%",
              backgroundPosition: `${50 + round.cropDX}% ${50 + round.cropDY}%`,
            }}
          />
        </div>
      )}

      {round.mode === "3" && (
        <div className="mt-6 flex flex-1 flex-col">
          <div className="flex flex-col items-center">
            <button onClick={playCryNow} disabled={playsLeft <= 0}
              className="flex items-center gap-2 rounded-full border-b-4 border-primary/60 bg-white px-7 py-3.5 font-pixel text-base text-primary shadow-card disabled:opacity-40 active:translate-y-0.5 active:border-b-0">
              <span className="text-lg">🔊</span> PLAY CRY
            </button>
            <div className="mt-2 font-pixel text-[9px] uppercase tracking-wide text-foreground/45">{playsLeft} {playsLeft === 1 ? "play" : "plays"} left</div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {round.choices.map((c) => {
              const on = selChoice === c;
              return (
                <button key={c} onClick={() => setSelChoice(c)}
                  className={`rounded-2xl px-3 py-5 text-base font-extrabold shadow-card transition active:scale-95 ${on ? "bg-[oklch(0.62_0.16_250)] text-white" : "bg-white text-poke-dark"}`}>
                  {c}
                </button>
              );
            })}
          </div>
          <div className="mt-auto pt-8"><button onClick={submit} disabled={!canSubmit} className="w-full rounded-full bg-primary py-4 font-pixel text-base tracking-wide text-primary-foreground shadow-card disabled:opacity-50 active:scale-[0.98]">SUBMIT</button></div>
        </div>
      )}

      {round.mode === "4" && (
        <div className="mt-12 flex flex-col items-center">
          <div className="flex items-center gap-3">
            {round.types.map((t, i) => (
              <div key={t} className="flex items-center gap-3">
                {i > 0 && <span className="font-pixel text-lg text-foreground/50">+</span>}
                <span className={`rounded-full px-6 py-3 font-pixel text-base uppercase tracking-wide text-white shadow-card ${TYPE_BG[t]}`}>{t}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-2xl font-extrabold leading-tight text-foreground">Name any Pokémon with<br />this typing.</p>
        </div>
      )}

      {round.mode === "5" && (
        <div className="mt-6">
          {!dexEntry || dexLoading ? (
            <div className="py-16 text-center font-pixel text-[10px] text-foreground/50">Loading Pokédex entry…</div>
          ) : dexEntry.flavor === "" ? (
            <div className="py-12 text-center">
              <div className="font-pixel text-[10px] text-poke-dark/60">Couldn't load the entry.</div>
              <button onClick={() => setDexNonce((n) => n + 1)} className="mt-3 rounded-full bg-primary px-5 py-2 font-pixel text-[10px] text-primary-foreground active:scale-95">RETRY</button>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[340px] rounded-[22px] bg-[#e23b30] p-4 shadow-card">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-[#4aa3df] ring-2 ring-white" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
              </div>
              <div className="mt-3 rounded-2xl border-2 border-poke-dark/80 bg-[#dfe8d6] p-4">
                <div className="font-pixel text-[8px] tracking-wide text-poke-dark/70">POKÉDEX ENTRY</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {dexEntry.genus && <span className="rounded-md bg-yellow-200 px-2 py-1 font-pixel text-[8px] text-poke-dark">{dexEntry.genus}</span>}
                  {dexEntry.heightM && <span className="rounded-md bg-blue-200 px-2 py-1 font-pixel text-[8px] text-poke-dark">{dexEntry.heightM}</span>}
                </div>
                <p className="mt-3 text-[15px] font-semibold leading-relaxed text-poke-dark">"{dexEntry.flavor}"</p>
              </div>
              <div className="mt-3 text-center font-pixel text-[9px] tracking-wide text-white">WHO IS BEING DESCRIBED?</div>
            </div>
          )}
        </div>
      )}

      {round.mode === "1B" && (
        <div className="mt-5 flex flex-1 flex-col">
          <div className="text-center text-xl font-extrabold text-poke-dark">What type is it?</div>
          <div className="mt-0.5 text-center text-sm text-poke-dark/55">Pick 1 or 2 types.</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {TYPES.map((t) => {
              const on = selTypes.includes(t);
              return (
                <button key={t} onClick={() => toggleType(t)}
                  className={`rounded-full border-2 py-2.5 font-pixel text-[9px] uppercase tracking-wide transition active:scale-95 ${on ? `${TYPE_BG[t]} border-transparent text-white` : `border-current bg-transparent ${TYPE_TEXT[t]}`}`}>
                  {on ? "✓ " : ""}{t}
                </button>
              );
            })}
          </div>
          <button onClick={submit} disabled={!canSubmit} className="mt-5 w-full rounded-full bg-primary py-4 font-pixel text-base tracking-wide text-primary-foreground shadow-card disabled:opacity-50 active:scale-[0.98]">SUBMIT</button>
        </div>
      )}

      {(round.mode === "1A" || round.mode === "2" || round.mode === "4" || round.mode === "5") && nameInput}
    </div>
  );
}

function Row({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-3xl bg-white px-4 py-3 shadow-card">
      {icon}
      <div className="min-w-0">
        {sub && <div className="text-xs text-poke-dark/50">{sub}</div>}
        <div className="font-bold leading-tight text-poke-dark">{title}</div>
      </div>
    </div>
  );
}
