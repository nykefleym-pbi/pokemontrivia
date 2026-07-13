import type { StatusDef } from "./status-def";

export const burn: StatusDef = {
  id: "burn",
  emoji: "🔥", label: "Burn", major: true, defaultCures: 3,
  describe: () => '−15% correct-answer output + (PvP) −1 Attack stage. Waits out over 3.',
};
