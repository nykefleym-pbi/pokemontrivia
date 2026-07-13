// Signature-ability content definitions. One file per legendary/mythical row,
// each wrapping its existing engine spec from src/lib/signature-abilities.ts —
// see CLAUDE.md: liveness is computed, never inferred, and rows are generated
// from the catalog, never hand-edited.
import type { SignatureEngineSpec } from "../../../lib/signature-engine-types";

export interface SignatureDef {
  /** internalKey from the catalog row — unique, code-only (never shown to players). */
  id: string;
  /** Catalog record key (== SignatureAbility.pokemonId; see CALYREX_SHADOW_RIDER_ID
   *  for the one synthetic id). */
  pokemonId: number;
  species: string;
  engine: SignatureEngineSpec;
  describe(): string;
}
