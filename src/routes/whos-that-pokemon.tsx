import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { findPokemon, spriteUrl, type PokeType } from "@/lib/pokemon-data";
import type { ItemId } from "@/lib/game-data";
import { rollLevelUpRewards } from "@/lib/level-rewards";
import { PokeballSpinner, typeColorMap } from "@/components/game-ui";
import { NaButton } from "@/components/na/button";
import { NaIcon } from "@/components/na/icon";
import { FitSprite } from "@/components/na/battle";
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
  head: () => pageHead("/whos-that-pokemon"),
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
  // The spotlight's height: it shrinks (to 150) when 1B's 18 type keys need the room, as the old app did.
  const [spotH, setSpotH] = useState(230);
  const spotObserver = useRef<ResizeObserver | null>(null);
  const spotRefCb = useCallback((el: HTMLDivElement | null) => {
    spotObserver.current?.disconnect();
    if (!el || typeof ResizeObserver === "undefined") return;
    spotObserver.current = new ResizeObserver(() => setSpotH(el.offsetHeight || 230));
    spotObserver.current.observe(el);
  }, []);
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
      // The route's Who's That step: played, caught or fled (Paul, 2026-11-28).
      useGameStore.getState().markRouteWhos();
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
      <div className="na-bg-night flex h-full w-full flex-col overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+24px)] text-center">
        <WhosThatWordmark />
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <span className="na-label uppercase text-text-secondary">Play again in</span>
          <span className="na-display-m tabular-nums text-foreground">{fmtHMS(msToNextHour)}</span>
        </div>
        <NaButton block onClick={goHome}>
          Home
        </NaButton>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="na-bg-night flex h-full w-full flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="na-body text-text-secondary">Couldn&apos;t load. Check your connection.</p>
        <div className="flex w-full max-w-[300px] flex-col gap-3">
          <NaButton
            block
            onClick={() => {
              setLoadError(false);
              setStartNonce((n) => n + 1);
            }}
          >
            Try again
          </NaButton>
          <NaButton kind="secondary" size="M" block onClick={goHome}>
            Home
          </NaButton>
        </div>
      </div>
    );
  }
  if (!round) {
    return (
      <div className="na-bg-night flex h-full w-full items-center justify-center">
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
        nextMin={Math.ceil(msToNextHour / 60_000)}
        onCollect={goHome}
      />
    );
  }

  if (phase === "incorrect") {
    return (
      <WhosThatFled
        id={round.monId}
        name={round.name}
        guess={round.mode === "3" ? (selChoice ?? undefined) : round.mode === "1B" ? undefined : guess.trim() || undefined}
        flavor={fledDetail.flavor}
        flavorSettled={fledDetail.status !== "loading"}
        genus={fledDetail.genus}
        heightM={fledDetail.heightM}
        nextMin={Math.ceil(msToNextHour / 60_000)}
        reason={fledReason}
        onClose={goHome}
      />
    );
  }

  // ---- Figma 12.1 / 12.4: the round on the Night Arena background.
  const key3d = "shadow-[0_4px_0_#9AA3C7,inset_0_2px_0_rgb(255_255_255/0.35)] bg-[#F4F6FF] text-night-base";
  const spot = Math.max(150, Math.min(230, spotH));
  const silhouette = (
    // The shadow in black on a plain white spotlight: no glow, no rings, no prize before you answer.
    // 230 tall by default; a flex item that gives up height (not the screen scrolling) when the keys below need it.
    <div ref={spotRefCb} className="flex min-h-[150px] w-full flex-[0_1_230px] items-center justify-center" role="img" aria-label="silhouette">
      <span className="flex items-center justify-center rounded-full bg-white" style={{ width: spot - 4, height: spot - 4 }}>
        <FitSprite id={round.monId} size={Math.round((spot * 176) / 230)} className="[filter:brightness(0)]" />
      </span>
    </div>
  );
  const nameInput = (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="whos-guess" className="na-label uppercase text-text-secondary">
        Your answer
      </label>
      <span className="flex h-[54px] items-center rounded-[14px] border-2 border-info bg-night-deep/60 px-3.5">
        <input
          id="whos-guess"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Type the Pokémon's name…"
          autoFocus
          autoComplete="off"
          className="na-headline w-full min-w-0 bg-transparent text-foreground outline-none placeholder:text-text-muted"
        />
      </span>
      <span className="na-caption text-text-secondary">Type the Pokémon&apos;s name</span>
    </div>
  );
  const submitBtn = (
    <NaButton block disabled={!canSubmit} onClick={submit}>
      Submit
    </NaButton>
  );

  return (
    <div className="na-bg-night flex h-full w-full flex-col gap-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+8px)]">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goHome}
          aria-label="Back"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-night-card-2 text-foreground shadow-[0_4px_0_#04060F,inset_0_1px_0_rgb(255_255_255/0.1)] press"
        >
          <NaIcon name="arrow-left" size={22} />
        </button>
        <span className="flex items-center gap-1.5 rounded-full bg-white/[0.12] py-[5px] pl-2 pr-3">
          <span className="text-reward-gold">
            <NaIcon name="clock" size={16} />
          </span>
          <span className="na-label tabular-nums text-foreground">{`0:${String(timeLeft).padStart(2, "0")}`}</span>
        </span>
      </div>
      {/* Figma gives the logo a 300 x 126 box */}
      <div className="flex h-[126px] shrink-0 items-center">
        <WhosThatWordmark />
      </div>

      {(round.mode === "1A" || round.mode === "1B") && silhouette}

      {round.mode === "2" && (
        // A zoomed-in piece of it, sometimes from behind, in a gold-rimmed lens.
        <div className="relative mx-auto mt-4 h-[200px] w-[200px] shrink-0 overflow-hidden rounded-full border-4 border-reward-gold/70 bg-night-raised">
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
        <div className="mt-4 flex flex-col items-center gap-2">
          <button type="button" onClick={playCryNow} disabled={playsLeft <= 0} className={`na-button-m flex items-center gap-1.5 rounded-full px-[18px] py-2.5 disabled:opacity-40 press ${key3d}`}>
            <NaIcon name="volume" size={18} line /> Play cry
          </button>
          <span className="na-caption text-text-secondary">
            {playsLeft} {playsLeft === 1 ? "play" : "plays"} left
          </span>
          <div className="mt-2 grid w-full grid-cols-2 gap-2">
            {round.choices.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelChoice(c)}
                className={`na-button-m rounded-[14px] px-3 py-[9px] press ${
                  selChoice === c ? "bg-info text-foreground shadow-[0_4px_0_#2B4FB8,inset_0_2px_0_rgb(255_255_255/0.35)]" : key3d
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {round.mode === "4" && (
        <div className="mt-10 flex flex-col items-center gap-5">
          <div className="flex items-center gap-3">
            {round.types.map((t, i) => (
              <span key={t} className="flex items-center gap-3">
                {i > 0 && <span className="na-title text-text-muted">+</span>}
                <span className={`na-title rounded-full px-[26px] py-2.5 uppercase text-foreground shadow-[0_4px_0_rgb(0_0_0/0.35),inset_0_2px_0_rgb(255_255_255/0.35)] ${typeColorMap[t]}`}>
                  {t}
                </span>
              </span>
            ))}
          </div>
          <p className="na-body-strong text-center text-foreground">Name any Pokémon with this typing.</p>
        </div>
      )}

      {round.mode === "5" && (
        <div className="mt-2">
          {!dexEntry || dexLoading ? (
            <p className="na-body py-16 text-center text-text-secondary">Reading the Pokédex…</p>
          ) : dexEntry.flavor === "" ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="na-body text-text-secondary">Couldn&apos;t load the entry.</p>
              <NaButton kind="secondary" size="M" onClick={() => setDexNonce((n) => n + 1)}>
                Try again
              </NaButton>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-xl bg-night-raised p-3">
              <span className="na-label uppercase text-reward-gold">Pokédex entry</span>
              <span className="flex flex-wrap gap-1.5">
                {dexEntry.genus && <span className="na-label rounded-full bg-white/[0.12] px-2.5 py-1 text-foreground">{dexEntry.genus}</span>}
                {dexEntry.heightM && <span className="na-label rounded-full bg-white/[0.12] px-2.5 py-1 text-foreground">{dexEntry.heightM}</span>}
              </span>
              <p className="na-body text-foreground">“{dexEntry.flavor}”</p>
            </div>
          )}
        </div>
      )}

      {round.mode === "1B" && (
        <div className="flex flex-col gap-2">
          <p className="na-headline text-center text-foreground">What type is it?</p>
          <p className="na-caption -mt-1.5 text-center text-text-secondary">Choose 1 or 2 types.</p>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => {
              const on = selTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleType(t)}
                  className={`na-label rounded-[14px] px-1.5 py-2 uppercase text-foreground press ${typeColorMap[t]} ${
                    on ? "outline outline-[3px] outline-foreground" : ""
                  } shadow-[0_4px_0_rgb(0_0_0/0.35),inset_0_2px_0_rgb(255_255_255/0.35)]`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="min-h-2 flex-1" />
      {(round.mode === "1A" || round.mode === "2" || round.mode === "4" || round.mode === "5") && nameInput}
      {submitBtn}
    </div>
  );
}