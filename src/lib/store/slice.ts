import type { StateCreator } from "zustand";
import type { GameState } from "@/lib/store";

export type StoreSlice<T> = StateCreator<GameState, [["zustand/persist", unknown]], [], T>;
