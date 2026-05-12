import { useReducedMotion as useFmReducedMotion } from "framer-motion";

export function useReducedMotion(): boolean {
  return !!useFmReducedMotion();
}

/** Returns the second arg when reduced motion is active. */
export function motionSafe<T>(variants: T, fallback: T, reduced: boolean): T {
  return reduced ? fallback : variants;
}
