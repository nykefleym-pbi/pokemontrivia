// Status condition vocabulary. One definition file per status lives beside
// this; the index assembles them into the registry the game reads.
export type StatusKind =
  | "confused"
  | "poisoned"
  | "badly-poisoned"
  | "burn"
  | "paralysis"
  | "sleep"
  | "freeze";

export interface StatusMeta {
  emoji: string;
  label: string;
  /** Major statuses block a second major status from stacking. */
  major: boolean;
  /** Cure-item uses (or questions waited) to fully clear, in solo. */
  defaultCures: number;
}

export interface StatusDef extends StatusMeta {
  id: StatusKind;
  /** Player-readable behavior, kept next to the numbers so they can't drift. */
  describe(): string;
}
