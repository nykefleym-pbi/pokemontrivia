export type FxSide = "enemy" | "player";

export interface FxSprite {
  img: HTMLImageElement;
  /** The visible box of the sprite in image px (as FieldSprite trims it). */
  trim: { x: number; y: number; w: number; h: number };
  /** Art px per sprite px: 1 for the opponent (2 pt), 1.5 for your partner (3 pt). */
  k: number;
  /** Centre x and feet y, in art px (half a point). */
  cx: number;
  feet: number;
}

export interface BattleFx {
  setSprite(side: FxSide, s: FxSprite): void;
  has(side: FxSide): boolean;
  attack(type: string, who: FxSide, power?: number): Promise<void>;
  setStatuses(side: FxSide, kinds: string[]): void;
  catchPokemon(onEnemy?: (tintK: number, alpha: number) => void): Promise<void>;
  destroy(): void;
}

export const CATCH_LEN: number;

export function createBattleFx(
  back: HTMLCanvasElement,
  front: HTMLCanvasElement,
  els: { enemy?: HTMLElement | null; player?: HTMLElement | null; stage?: HTMLElement | null },
  opts?: { reduced?: boolean },
): BattleFx;
