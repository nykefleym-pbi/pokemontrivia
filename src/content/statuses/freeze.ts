import type { StatusDef } from "./status-def";

export const freeze: StatusDef = {
  id: "freeze",
  emoji: "❄️", label: "Frozen", major: true, defaultCures: 2,
  describe: () => 'Skip the current question; ~30% thaw/question, guaranteed after 2.',
};
