/**
 * Night Arena type chip (Figma "Type chip"): a glass pill with a dot in the
 * type's colour. The colour comes from the app's --type-* tokens.
 */
export function NaTypeChip({ type, className = "" }: { type: string; className?: string }) {
  const t = type.toLowerCase();
  return (
    <span className={`na-type-chip ${className}`}>
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: `var(--type-${t})` }}
      />
      {t}
    </span>
  );
}
