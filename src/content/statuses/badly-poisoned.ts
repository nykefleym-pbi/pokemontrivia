import type { StatusDef } from "./status-def";

export const badlyPoisoned: StatusDef = {
  id: "badly-poisoned",
  emoji: "☠️☠️", label: "Badly Poisoned", major: true, defaultCures: 5,
  describe: () => 'Ramping Toxic tier. Longer (5) and only fully removed by a cure item.',
};
