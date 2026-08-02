import type { PokeType } from "@/lib/pokemon-data";

/**
 * The type's own colour, as a CSS value.
 *
 * `--type-*` and NOT `--color-type-*`. The latter looks like the right name and
 * is the one Tailwind's `bg-type-fire` utilities are built from, but it is
 * declared inside `@theme inline` — and `inline` means exactly that: those
 * values are substituted into the generated utilities and never emitted as
 * custom properties, so `var(--color-type-fire)` resolves to nothing at
 * runtime. Every chip came out colourless the first time round.
 *
 * `--type-*` is a plain `:root` declaration and is what `@theme` itself points
 * at, so this stays in step with the badges and panels rather than forking a
 * colour table of its own.
 */
export const typeColorVar = (type: PokeType) => `var(--type-${type})`;
