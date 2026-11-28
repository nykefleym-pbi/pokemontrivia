import type { ReactNode } from "react";
import { NaIcon } from "@/components/na/icon";

/** Figma "Stepper" (17.1 buy, 17.11 throw away): one Quantity row, − and + as 44 px buttons
 *  with the 3D lip, the count between. `extra` sits beside the label (17.11's "All 5"). */
export function NaStepper({
  value,
  max,
  onChange,
  extra,
  fewerLabel = "One fewer",
  moreLabel = "One more",
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  extra?: ReactNode;
  fewerLabel?: string;
  moreLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[16px] bg-white/10 py-2 pl-3.5 pr-2">
      <span className="flex items-center gap-2">
        <span className="na-body-strong text-foreground">Quantity</span>
        {extra}
      </span>
      <span className="flex items-center gap-3">
        <button type="button" aria-label={fewerLabel} disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))} className="na-btn na-btn-secondary h-11 w-11 rounded-[14px]">
          <NaIcon name="minus" size={22} />
        </button>
        <span className="na-number-l min-w-8 text-center tabular-nums text-foreground" aria-live="polite">
          {value}
        </span>
        <button type="button" aria-label={moreLabel} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="na-btn na-btn-primary h-11 w-11 rounded-[14px]">
          <NaIcon name="plus" size={22} />
        </button>
      </span>
    </div>
  );
}
