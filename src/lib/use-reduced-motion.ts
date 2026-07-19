import { useReducedMotion as useFmReducedMotion } from "framer-motion";
import { useGameStore } from "@/lib/store";

/** True when EITHER the OS-level "prefers-reduced-motion" setting OR the
 * in-app Settings > Reduce motion toggle is on. Same API/signature as
 * before this flag existed — callers don't need to know which source won. */
export function useReducedMotion(): boolean {
  const storeFlag = useGameStore((s) => s.reducedMotion);
  return !!useFmReducedMotion() || storeFlag;
}

/** Returns the second arg when reduced motion is active. */
export function motionSafe<T>(variants: T, fallback: T, reduced: boolean): T {
  return reduced ? fallback : variants;
}
