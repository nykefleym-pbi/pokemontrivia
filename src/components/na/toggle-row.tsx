/** Figma "Toggle row": a label and its description, and a green switch. */
export function NaToggleRow({
  label,
  description,
  on,
  disabled,
  onChange,
  children,
}: {
  label: string;
  description: string;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  /** Extra control under the row (a volume slider). */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="na-body-strong text-foreground">{label}</span>
          <span className="na-caption text-text-secondary">{description}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(!on)}
          className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "na-fill-success" : "bg-white/[0.16]"}`}
        >
          <span className={`absolute top-[3px] h-6 w-6 rounded-full bg-[#f4f6ff] transition-[left] ${on ? "left-[25px]" : "left-[3px]"}`} />
        </button>
      </div>
      {children}
    </div>
  );
}
