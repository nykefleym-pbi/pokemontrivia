import { useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { NaButton } from "@/components/na/button";
import { NaAnswerFace, NaCoachBubble, answerTileClass } from "@/components/na/battle";
import type { MissedAnswer } from "@/lib/trivia-core";

/**
 * Figma 4.3 "Learn from the mistake": each missed question comes back with the
 * answer you chose, the right one and its explanation, and Professor Oak.
 * Several mistakes page through one at a time (Next, then Done on the last).
 * shortcut: the "Practice more questions" round is a new mode (phase 2), not drawn here.
 */
export function MistakesReview({ missed, onClose }: { missed: MissedAnswer[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const m = missed[i];
  if (!m) return null;
  const last = i >= missed.length - 1;
  return (
    <div
      role="dialog"
      aria-label="Review your answer"
      className="na-bg-night fixed inset-0 z-[60] flex flex-col pt-[env(safe-area-inset-top)]"
    >
      <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
        <button
          type="button"
          aria-label="Back"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="na-display-s flex-1 uppercase text-foreground">Review your answer</h1>
        {missed.length > 1 && (
          <span className="na-number-m text-text-secondary">
            {i + 1} of {missed.length}
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-2 screen-bottom">
        <NaCoachBubble text="Let's see what you missed!" pointer="down" style={{ position: "relative" }} />
        <div className="na-glass flex flex-col gap-2.5 rounded-[20px] p-4">
          <p className="na-title text-foreground">{m.question}</p>
          {m.chosenAnswer && (
            <div className={answerTileClass("wrong")}>
              <NaAnswerFace index={m.chosenIndex ?? 0} text={m.chosenAnswer} state="wrong" />
            </div>
          )}
          <div className={answerTileClass("reveal")}>
            <NaAnswerFace index={m.correctIndex ?? 0} text={m.correctAnswer} state="reveal" />
          </div>
          {m.explanation && (
            <div className="flex items-start gap-2.5 rounded-[14px] bg-night-deep/60 p-3">
              <FileText className="h-5 w-5 shrink-0 text-foreground" aria-hidden />
              <p className="na-body text-foreground">{m.explanation}</p>
            </div>
          )}
        </div>
        <div className="min-h-2 flex-1" />
        <NaButton block onClick={() => (last ? onClose() : setI(i + 1))}>
          {last ? "Done" : "Next"}
        </NaButton>
      </div>
    </div>
  );
}
