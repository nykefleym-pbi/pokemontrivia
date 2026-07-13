import type { StatusDef } from "./status-def";

export const confused: StatusDef = {
  id: "confused",
  emoji: "🌀", label: "Confused", major: false, defaultCures: 2,
  describe: () => 'Volatile — stacks with everything, low magnitude. 2 cures (1 with `toxic`).',
};
