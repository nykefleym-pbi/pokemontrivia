import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

interface TutorialStep {
  id: 1 | 2 | 3;
  title: string;
  body: string;
}

const STEPS: TutorialStep[] = [
  {
    id: 1,
    title: "How battles work",
    body: "Tap an answer to attack. Correct answers hit the enemy. Wrong answers hit you back.",
  },
  {
    id: 2,
    title: "Watch your HP",
    body: "Run out of HP and you lose. Drain the enemy's HP to win the battle.",
  },
  {
    id: 3,
    title: "Speed matters",
    body: "Faster correct answers deal more damage. Chain them in a row for a streak multiplier.",
  },
];

interface Props {
  step: 1 | 2 | 3 | null;
  onDismiss: () => void;
  onSkip: () => void;
}

export function TutorialOverlay({ step, onDismiss, onSkip }: Props) {
  const current = step ? STEPS.find((s) => s.id === step) : null;

  useEffect(() => {
    if (current) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [current]);

  return (
    <AnimatePresence>
      {current && (
        <>
          <motion.div
            key="tut-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            key={`tut-card-${current.id}`}
            initial={{ scale: 0.85, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            className="fixed inset-0 z-[81] flex items-center justify-center px-6"
          >
            <div className="w-full max-w-sm rounded-3xl border-2 border-poke-dark bg-card p-5 shadow-pop">
              <div className="mb-2 font-pixel text-[10px] uppercase text-primary">
                Tutorial · {current.id}/3
              </div>
              <h3 className="text-lg font-bold">{current.title}</h3>
              <p className="mt-2 text-sm leading-snug text-muted-foreground">{current.body}</p>
              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={onSkip}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Skip tutorial
                </button>
                <Button onClick={onDismiss} size="sm" className="rounded-full px-5">
                  Got it
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
