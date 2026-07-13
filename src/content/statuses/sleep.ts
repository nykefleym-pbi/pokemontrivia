import type { StatusDef } from "./status-def";

export const sleep: StatusDef = {
  id: "sleep",
  emoji: "😴", label: "Asleep", major: true, defaultCures: 2,
  describe: () => 'Buttons locked for first ~40% of timer. 1–2 questions, self-clears.',
};
