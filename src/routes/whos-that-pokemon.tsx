import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { findPokemon, spriteUrl, type PokeType } from "@/lib/pokemon-data";
import type { ItemId } from "@/lib/game-data";
import { rollLevelUpRewards } from "@/lib/level-rewards";
import { PokeballSpinner, PokemonSprite } from "@/components/game-ui";
import { TypeChip } from "@/components/type-chip";
import { Button } from "@/components/ui/button";
import { WhosThatWordmark } from "@/components/whos-that-wordmark";
import { WhosThatCaught } from "@/components/whos-that-caught";
import { WhosThatFled } from "@/components/whos-that-fled";
import { useSpeciesDetail } from "@/lib/species-detail";
import { playCry, playSfx, stopBgm, revealPokemon, playWhosThatShout } from "@/lib/audio";
import { answerHaptic } from "@/lib/haptics";
import { pokeApiUrls } from "@/lib/api/pokeapi";
import { syncActivity } from "@/lib/social";
import {
  checkGuess,
  findByNorm,
  HOUR,
  maskSpeciesName,
  type WhosThatGuess,
  type WhosThatRound as Round,
} from "@/lib/whos-that";
import { startWhosThat, submitWhosThat } from "@/services/client/whos-that";

export const Route = createFileRoute("/whos-that-pokemon")({
  component: WhosThatPokemon,
});

const ANSWER_SECONDS = 20;
const CRY_PLAYS = 3;

const TYPES: PokeType[] = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
];

function fmtHMS(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

interface DexEntry {
  flavor: string;
  genus: string;
  heightM: string;
}

export function WhosThatPokemon() {
  const navigate = useNavigate();
  const consumeWhosThat = useGameStore((s) => s.consumeWhosThat);
  const addXp = useGameStore((s) => s.addXp);
  const grantItem = useGameStore((s) => s.grantItem);
  const recordPokedexCapture = useGameStore((s) => s.recordPokedexCapture);

  const [round, setRound] = useState<Round | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [phase, setPhase] = useState<"play" | "correct" | "incorrect">("play");
  const [fledReason, setFledReason] = useState<"timeout" | "wrong">("wrong");
  const [guess, setGuess] = useState("");
  const [selTypes, setSelTypes] = useState<PokeType[]>([]);
  const [selChoice, setSelChoice] = useState<string | null>(null);
  const [caught, setCaught] = useState<{ id: number; name: string } | null>(null);
  // Both are set from the server's response when the guess resolves, and only
  // read by the result screen.
  const [awardedXp, setAwardedXp] = useState(0);
  const [playsLeft, setPlaysLeft] = useState(CRY_PLAYS);
  const [dexEntry, setDexEntry] = useState<DexEntry | null>(null);
  const [dexLoading, setDexLoading] = useState(false);
  const [dexNonce, setDexNonce] = useState(0);
  // The fled screen's Pokédex entry. Uses the shared cached hook rather than
  // the mode-5 fetch above, for two reasons: that one is gated to mode 5 and
  // this screen is reachable from every mode, and it MASKS the species name —
  // correct while you are still guessing, wrong once the answer is on screen.
  // Passing null outside the fled phase keeps it from fetching during play.
  const fledDetail = useSpeciesDetail(phase === "incorrect" ? round?.monId ?? null : null);
  const [timeLeft, setTimeLeft] = useState(ANSWER_SECONDS);
  const [now, setNow] = useState(Date.now());
  const [startNonce, setStartNonce] = useState(0);
  const startedRef = useRef(-1);
  const burnedRef = useRef(false);
  const resolvedRef = useRef(false);

  const ready = !round || round.mode !== "5" || (!!dexEntry && dexEntry.flavor !== "");

  // Round generation now lives server-side (whos-that Edge Function) — the
  // server picks the Pokémon/mode/reward/shiny-roll and enforces the
  // one-round-per-hour gate itself, instead of trusting a client-generated
  // round + client-only hour-key check.
  //
  // Keyed on `startNonce` rather than run-once, so the error state can ask for
  // another attempt. A single failed call used to be terminal: the guard was a
  // plain boolean, so one dropped request on a phone left the screen showing
  // "check your connection" with nothing but CLOSE — and the hour's round was
  // spent from the player's point of view even though the server never issued
  // one. The ref still guards against a repeat for the SAME nonce, which is
  // what keeps StrictMode's double-invoke from starting two rounds.
  useEffect(() => {
    if (startedRef.current === startNonce) return;
    startedRef.current = startNonce;
    void (async () => {
      try {
        const res = await startWhosThat();
        if (res.locked) {
          setLocked(true);
          return;
        }
        setRoundId(res.roundId);
        setRound(res.round);
      } catch {
        setLoadError(true);
      }
    })();
  }, [startNonce]);

  // No background music here — only the "Who's that Pokémon?!" voice shout plays.
  useEffect(() => {
    stopBgm();
  }, []);

  // Claim the full-screen lock, the same way the battle, daily and mega screens
  // do. `bottom-nav.tsx` also matches this route by PATH, but a path match only
  // holds while the router agrees the URL is this one — it says nothing during a
  // transition, and nothing at all if the screen is ever mounted from somewhere
  // else. The claim is a counter the screen owns for exactly as long as it is
  // mounted, which is the property actually wanted here.
  const setBattleScreenActive = useGameStore((s) => s.setBattleScreenActive);
  useEffect(() => {
    setBattleScreenActive(true);
    return () => setBattleScreenActive(false);
  }, [setBattleScreenActive]);

  // "Who's that Pokémon?!" voice shout once per fresh round (silhouette shown).
  const shoutedRef = useRef<number | null>(null);
  useEffect(() => {
    if (round && phase === "play" && !locked && shoutedRef.current !== round.monId) {
      shoutedRef.current = round.monId;
      playWhosThatShout();
    }
  }, [round, phase, locked]);

  useEffect(() => {
    if ((phase === "correct" || phase === "incorrect") && !burnedRef.current) {
      burnedRef.current = true;
      answerHaptic(phase === "correct");
      playSfx(phase === "correct" ? "correct" : "wrong");
      if (round) revealPokemon(round.monId);
      consumeWhosThat();
      void syncActivity("last_whos_that_played");
    }
  }, [phase, round, consumeWhosThat]);

  useEffect(() => {
    if (round?.mode !== "5") return;
    let cancelled = false;
    setDexLoading(true);
    setDexEntry(null);
    (async () => {
      try {
        const [spRes, pkRes] = await Promise.all([
          fetch(pokeApiUrls.species(round.monId)),
          fetch(pokeApiUrls.pokemon(round.monId)),
        ]);
        if (!spRes.ok) throw new Error("species");
        const sp = await spRes.json();
        const pk = pkRes.ok ? await pkRes.json() : null;
        const fe = (sp.flavor_text_entries || []).find(
          (e: { language?: { name: string } }) => e.language?.name === "en",
        );
        // Redact the species name before this ever reaches state: PokeAPI's
        // flavor text names the Pokémon outright in a great many entries (older
        // ones in block capitals), which gives away the answer in the one mode
        // whose whole point is reading the entry. The genus goes through the
        // same masking — a few of those carry the name too.
        const answerName = findPokemon(round.monId)?.name ?? "";
        const rawFlavor = ((fe?.flavor_text as string) || "")
          .replace(/[\f\n\r]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const flavor = maskSpeciesName(rawFlavor, answerName);
        const ge = (sp.genera || []).find(
          (g: { language?: { name: string } }) => g.language?.name === "en",
        );
        const genus = maskSpeciesName(
          ((ge?.genus as string) || "").replace(/\s*Pokémon\s*$/i, ""),
          answerName,
        ).toUpperCase();
        const heightM = pk?.height ? `${(pk.height / 10).toFixed(1)} m` : "";
        if (!cancelled) {
          setDexEntry({ flavor, genus, heightM });
          setDexLoading(false);
        }
      } catch {
        if (!cancelled) {
          setDexEntry({ flavor: "", genus: "", heightM: "" });
          setDexLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [round?.mode, round?.monId, dexNonce]);

  // The server validates the guess against its OWN held round and grants
  // XP/the round's reward item exactly once — this is the sole place the
  // reward actually gets applied, using the server's response rather than
  // a client-recomputed WHOS_THAT_XP/round.rewardId (see whos-that/index.ts).
  const resolveGuess = useCallback(
    async (
      guessPayload: WhosThatGuess,
      caughtGuess: { id: number; name: string } | null,
      // Passed explicitly by the timer rather than inferred from an empty
      // payload: "no guess" and "the clock ran out" happen to coincide today,
      // but only one of them is what the fled screen is reporting.
      viaTimeout = false,
    ) => {
      if (!roundId || resolvedRef.current) return;
      resolvedRef.current = true;
      setFledReason(viaTimeout ? "timeout" : "wrong");
      if (caughtGuess) setCaught(caughtGuess);
      let res;
      try {
        res = await submitWhosThat(roundId, guessPayload);
      } catch {
        // Network failure — fall back to a local guess check so a hiccup
        // doesn't strand the player mid-round with no verdict at all. No
        // reward is applied here: it's only ever granted from the server's
        // own response, so a network failure costs a round rather than
        // risking an unverified grant.
        setPhase(round && checkGuess(round, guessPayload) ? "correct" : "incorrect");
        return;
      }
      setPhase(res.correct ? "correct" : "incorrect");
      if (res.alreadyGranted || !res.reward) return;
      const prevLevel = useGameStore.getState().level;
      // Read the XP the SERVER granted rather than a client constant — it is
      // the only place the amount is decided, and the result screen prints it.
      setAwardedXp(res.reward.xp);
      const dexId = caughtGuess?.id ?? res.monId;
      addXp(res.reward.xp);
      grantItem(res.reward.itemId as ItemId, res.reward.itemQty);
      recordPokedexCapture(dexId, res.isShiny);
      useGameStore.getState().pushBattleLog({
        opponent: "Who's That Pokémon",
        won: true,
        xpGained: res.reward.xp,
        bestStreak: 0,
        timestamp: Date.now(),
        mode: "whosthat",
      });
      const newLevel = useGameStore.getState().level;
      if (newLevel > prevLevel) {
        const rewards = rollLevelUpRewards(prevLevel, newLevel);
        if (rewards) {
          useGameStore.getState().mergePendingLevelUp(rewards);
          if (rewards.coins > 0) useGameStore.getState().addCoins(rewards.coins);
          for (const it of rewards.items) useGameStore.getState().grantItem(it.id, it.qty);
          if (rewards.eggs > 0) useGameStore.getState().grantPokeEgg(rewards.eggs);
        }
      }
    },
    [roundId, round, addXp, grantItem, recordPokedexCapture],
  );

  useEffect(() => {
    if (phase !== "play" || !round || !ready) return;
    if (timeLeft <= 0) {
      // An empty guess fails every mode's check server-side, so this both
      // resolves the round (no lingering "unresolved" row to resume into)
      // and matches the original always-incorrect-on-timeout behavior.
      void resolveGuess({}, null, true);
      return;
    }
    const t = setTimeout(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, round, ready, timeLeft, resolveGuess]);

  useEffect(() => {
    if (phase !== "incorrect" && !locked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase, locked]);

  const goHome = () => navigate({ to: "/battle", search: { autostart: 0 } as never });

  const canSubmit = !round
    ? false
    : round.mode === "1B"
      ? selTypes.length > 0
      : round.mode === "3"
        ? selChoice !== null
        : guess.trim().length > 0;

  function submit() {
    if (!round || !canSubmit) return;
    if (round.mode === "1B") {
      void resolveGuess({ guessTypes: selTypes }, null);
      return;
    }
    if (round.mode === "3") {
      void resolveGuess({ guessChoice: selChoice ?? undefined }, null);
      return;
    }
    if (round.mode === "4") {
      const m = findByNorm(guess);
      void resolveGuess({ guessText: guess }, m ? { id: m.id, name: m.name } : null);
      return;
    }
    void resolveGuess({ guessText: guess }, null);
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
      <div className="flex h-full w-full flex-col overflow-y-auto bg-poke-cream screen-x pb-10 pt-8 text-center">
        <WhosThatWordmark />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="font-pixel text-[10px] uppercase tracking-wide text-foreground/50">
            Play again in
          </div>
          <div className="font-pixel text-xl text-primary">{fmtHMS(msToNextHour)}</div>
        </div>
        <button
          onClick={goHome}
          className="rounded-full border-2 border-poke-dark/15 bg-white py-3.5 font-pixel text-sm tracking-wide text-poke-dark shadow-card press-lg"
        >
          CLOSE
        </button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-poke-cream px-5 text-center">
        <div className="font-pixel text-[10px] text-poke-dark/60">
          Couldn&apos;t load — check your connection.
        </div>
        <div className="btn-stack w-full max-w-[260px]">
          <Button
            size="action"
            onClick={() => {
              setLoadError(false);
              setStartNonce((n) => n + 1);
            }}
            className="w-full bg-primary text-primary-foreground shadow-card"
          >
            TRY AGAIN
          </Button>
          <Button
            size="action"
            onClick={goHome}
            className="w-full border-2 border-poke-dark/15 bg-white text-poke-dark shadow-card"
          >
            CLOSE
          </Button>
        </div>
      </div>
    );
  }
  if (!round) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-poke-cream">
        <PokeballSpinner spinning />
      </div>
    );
  }

  if (phase === "correct") {
    const shown = caught ?? { id: round.monId, name: round.name };
    return (
      <WhosThatCaught
        id={shown.id}
        name={shown.name}
        isShiny={round.isShiny}
        awardedXp={awardedXp}
        rewardName={round.rewardName}
        rewardIcon={round.rewardIcon}
        onCollect={goHome}
      />
    );
  }

  if (phase === "incorrect") {
    return (
      <WhosThatFled
        id={round.monId}
        name={round.name}
        flavor={fledDetail.flavor}
        flavorSettled={fledDetail.status !== "loading"}
        countdown={fmtHMS(msToNextHour)}
        reason={fledReason}
        onClose={goHome}
      />
    );
  }

  const silhouettePanel = (
    // Edge to edge: `-mx-7` cancels the screen gutter this sits inside, which
    // is the only way a child of a padded screen reaches the bezel. Height is
    // unchanged from the square it replaced (16rem), so the reveal beat and the
    // space below it stay where they were — this got WIDER, not taller.
    // `h-64` is the WANTED height, not a guaranteed one: this is a flex item in
    // a fixed-height column, so it gets compressed by whatever sits below it —
    // mode 1B's 18-chip type picker squeezed it from 256px to 143px on a
    // 390x844 phone. That is fine on its own; what cropped the silhouette
    // (owner report 2026-08-06) is that the sprite inside was a FIXED 15rem and
    // `overflow-hidden` cut off whatever no longer fit. The sprite is now sized
    // as a share of the panel (below), so shrinking scales it instead of
    // clipping it, and `min-h` stops the shrink before the shape gets too small
    // to read — past that the screen scrolls.
    <div
      className="relative -mx-7 mt-6 h-64 min-h-[11.5rem] overflow-hidden border-y-4 border-poke-yellow shadow-card"
      style={{
        background: "radial-gradient(circle at 50% 45%, #ff6a5d 0%, #e03a2f 55%, #b3261c 100%)",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "repeating-conic-gradient(from 0deg at 50% 45%, rgba(255,255,255,0.10) 0deg 4deg, transparent 4deg 9deg)",
        }}
      />
      {/* Golden halo behind the shape. Blurred and circular so it reads as the
          silhouette being lit rather than as a second border. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(255,214,92,0.55) 0%, transparent 70%)" }}
      />
      {/* Sized as a PERCENTAGE of the panel, not a fixed 15rem: 94% of the
          16rem box is the same ~15rem it has always been, but it now tracks the
          panel instead of being able to outgrow it and get clipped. `w-full` +
          `object-contain` (PokemonSprite's default) means the height is the
          binding constraint, so a tall Pokémon fits whole. PokéAPI sprites carry
          their own transparent margin, so the black shape lands short of the
          remaining 0.5rem again and never touches the gold rule. */}
      <PokemonSprite
        id={round.monId}
        alt="silhouette"
        className="absolute left-1/2 top-1/2 h-[94%] w-full -translate-x-1/2 -translate-y-1/2 [filter:brightness(0)] [image-rendering:pixelated]"
      />
    </div>
  );
  const nameInput = (
    <div className="mt-auto pt-8">
      <input
        value={guess}
        onChange={(e) => setGuess(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Type the Pokémon's name…"
        autoFocus
        className="w-full rounded-full border-2 border-poke-dark/10 bg-white px-5 py-4 text-base text-poke-dark shadow-card outline-none placeholder:text-poke-dark/35 focus:border-primary/40"
      />
      <button
        onClick={submit}
        disabled={!canSubmit}
        className="mt-3 w-full rounded-full bg-primary py-4 font-pixel text-base tracking-wide text-primary-foreground shadow-card disabled:opacity-50 press-lg"
      >
        SUBMIT
      </button>
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-poke-cream px-5 pb-8 pt-6">
      <div className="flex items-center justify-between">
        <button
          onClick={goHome}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl text-poke-dark shadow-card press"
        >
          ‹
        </button>
        <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-pixel text-[11px] text-primary shadow-card">
          {`0:${String(timeLeft).padStart(2, "0")}`}
        </div>
      </div>
      <WhosThatWordmark className="mt-3" />

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
            <button
              onClick={playCryNow}
              disabled={playsLeft <= 0}
              className="flex items-center gap-2 rounded-full border-b-4 border-primary/60 bg-white px-7 py-3.5 font-pixel text-base text-primary shadow-card disabled:opacity-40 press-push active:border-b-0"
            >
              PLAY CRY
            </button>
            <div className="mt-2 font-pixel text-[9px] uppercase tracking-wide text-foreground/45">
              {playsLeft} {playsLeft === 1 ? "play" : "plays"} left
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {round.choices.map((c) => {
              const on = selChoice === c;
              return (
                <button
                  key={c}
                  onClick={() => setSelChoice(c)}
                  className={`rounded-2xl px-3 py-5 text-base font-extrabold shadow-card transition press ${on ? "bg-[oklch(0.62_0.16_250)] text-white" : "bg-white text-poke-dark"}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <div className="mt-auto pt-8">
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="w-full rounded-full bg-primary py-4 font-pixel text-base tracking-wide text-primary-foreground shadow-card disabled:opacity-50 press-lg"
            >
              SUBMIT
            </button>
          </div>
        </div>
      )}

      {round.mode === "4" && (
        <div className="mt-12 flex flex-col items-center">
          <div className="flex items-center gap-3">
            {round.types.map((t, i) => (
              <div key={t} className="flex items-center gap-3">
                {i > 0 && <span className="font-pixel text-lg text-foreground/50">+</span>}
                <TypeChip type={t} size="lg" />
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-2xl font-extrabold leading-tight text-foreground">
            Name any Pokémon with
            <br />
            this typing.
          </p>
        </div>
      )}

      {round.mode === "5" && (
        <div className="mt-6">
          {!dexEntry || dexLoading ? (
            <div className="py-16 text-center font-pixel text-[10px] text-foreground/50">
              Loading Pokédex entry…
            </div>
          ) : dexEntry.flavor === "" ? (
            <div className="py-12 text-center">
              <div className="font-pixel text-[10px] text-poke-dark/60">
                Couldn't load the entry.
              </div>
              <button
                onClick={() => setDexNonce((n) => n + 1)}
                className="mt-3 rounded-full bg-primary px-5 py-2 font-pixel text-[10px] text-primary-foreground press"
              >
                RETRY
              </button>
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
                <div className="font-pixel text-[9px] tracking-wide text-poke-dark/70">
                  POKÉDEX ENTRY
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {dexEntry.genus && (
                    <span className="rounded-md bg-yellow-200 px-2 py-1 font-pixel text-[9px] text-poke-dark">
                      {dexEntry.genus}
                    </span>
                  )}
                  {dexEntry.heightM && (
                    <span className="rounded-md bg-blue-200 px-2 py-1 font-pixel text-[9px] text-poke-dark">
                      {dexEntry.heightM}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[15px] font-semibold leading-relaxed text-poke-dark">
                  "{dexEntry.flavor}"
                </p>
              </div>
              <div className="mt-3 text-center font-pixel text-[9px] tracking-wide text-white">
                WHO IS BEING DESCRIBED?
              </div>
            </div>
          )}
        </div>
      )}

      {round.mode === "1B" && (
        <div className="mt-5 flex flex-1 flex-col">
          <div className="text-center text-xl font-extrabold text-poke-dark">What type is it?</div>
          <div className="mt-0.5 text-center text-sm text-poke-dark/55">Pick 1 or 2 types.</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <TypeChip
                key={t}
                type={t}
                size="pick"
                selected={selTypes.includes(t)}
                onClick={() => toggleType(t)}
              />
            ))}
          </div>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="mt-5 w-full rounded-full bg-primary py-4 font-pixel text-base tracking-wide text-primary-foreground shadow-card disabled:opacity-50 press-lg"
          >
            SUBMIT
          </button>
        </div>
      )}

      {(round.mode === "1A" || round.mode === "2" || round.mode === "4" || round.mode === "5") &&
        nameInput}
    </div>
  );
}

/**
 * One reward on the catch screen: art over a tinted card, then what it is.
 *
 * The tint is passed as a raw colour and mixed here rather than taken as a
 * class, because the three tiles differ ONLY by hue — spelling out three
 * near-identical class strings at the call site is how they drift apart.
 */

