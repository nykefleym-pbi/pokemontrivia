import type { StatusDef } from "./status-def";

export const paralysis: StatusDef = {
  id: "paralysis",
  emoji: "⚡", label: "Paralysis", major: true, defaultCures: 3,
  describe: () => 'Shorter timer + chance to short an input. 3 questions.',
};
