// Moved: this math now lives in src/engine (state/timers/damage), where the
// server and the client will import the same implementation. This shim keeps
// the historic import path working; new code should import from "@/engine".
export * from "../engine/state";
export * from "../engine/timers";
export * from "../engine/damage";
