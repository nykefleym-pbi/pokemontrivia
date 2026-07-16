// Public surface of the battle engine. Isomorphic: runs in Edge Functions
// (authority) and in the client (optimistic preview). ESLint boundary rules
// ban React, Supabase, UI, and ambient randomness/time inside this folder.
export * from "./state";
export * from "./timers";
export * from "./damage";
export * from "./rng";
export * from "./turn";
export * from "./solo-battle-config";
export * from "./solo-battle-replay";
