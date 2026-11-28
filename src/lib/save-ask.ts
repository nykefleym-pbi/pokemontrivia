/**
 * When a guest is asked to save a trainer name (Paul, 2026-11-28): on the way
 * out of their first win, then every second finished battle, win or lose,
 * until they save. Kept per device; a guest has no account to keep it in.
 */
const KEY = "poke-trivia-save-ask";
type Store = Pick<Storage, "getItem" | "setItem">;
interface State {
  /** Asked at least once (the first win). */
  asked: boolean;
  /** Battles finished since the last ask. */
  since: number;
}

function read(s: Store): State {
  try {
    const v = JSON.parse(s.getItem(KEY) ?? "null");
    if (v && typeof v.asked === "boolean" && typeof v.since === "number") return v;
  } catch {
    /* fall through */
  }
  return { asked: false, since: 0 };
}

function write(s: Store, v: State) {
  try {
    s.setItem(KEY, JSON.stringify(v));
  } catch {
    /* private mode: asks every time it can't remember, which is the safe side */
  }
}

/** Counts one finished battle and says whether leaving it should ask. Call once per result screen. */
export function countBattleForSaveAsk(won: boolean, storage: Store = window.localStorage): boolean {
  const s = read(storage);
  const since = s.since + 1;
  write(storage, { ...s, since });
  return s.asked ? since >= 2 : won;
}

/** The sheet was shown: start counting again. */
export function markSaveAsked(storage: Store = window.localStorage): void {
  write(storage, { asked: true, since: 0 });
}
