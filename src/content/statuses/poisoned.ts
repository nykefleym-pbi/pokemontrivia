import type { StatusDef } from "./status-def";

export const poisoned: StatusDef = {
  id: "poisoned",
  emoji: "☠️", label: "Poisoned", major: true, defaultCures: 3,
  describe: () => 'Major DoT. 3 cures in solo.',
};
