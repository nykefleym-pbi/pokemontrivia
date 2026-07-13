// Status registry. Adding a status = add a file here and list it below;
// the Record type makes a missing StatusKind a compile error.
import { confused } from "./confused";
import { poisoned } from "./poisoned";
import { badlyPoisoned } from "./badly-poisoned";
import { burn } from "./burn";
import { paralysis } from "./paralysis";
import { sleep } from "./sleep";
import { freeze } from "./freeze";
import type { StatusDef, StatusKind, StatusMeta } from "./status-def";

export type { StatusDef, StatusKind, StatusMeta } from "./status-def";

export const STATUS_BY_ID: Record<StatusKind, StatusDef> = {
  "confused": confused,
  "poisoned": poisoned,
  "badly-poisoned": badlyPoisoned,
  "burn": burn,
  "paralysis": paralysis,
  "sleep": sleep,
  "freeze": freeze,
};

export const STATUS_LIST: readonly StatusDef[] = Object.values(STATUS_BY_ID);

/** Legacy shape consumed across the app; same objects, narrower type. */
export const STATUS_META: Record<StatusKind, StatusMeta> = STATUS_BY_ID;
