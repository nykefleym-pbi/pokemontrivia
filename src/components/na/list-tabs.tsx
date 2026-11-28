/** Figma 17.3 list tabs: separate glass pills, the open one white. The one style for
 *  switching lists (shop, shop bag, battle bag, live bag). Switching modes uses the
 *  17.8 raised segment instead. */
export function NaListTabs<T extends string>({
  tabs,
  value,
  onChange,
  testIdPrefix,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; disabled?: boolean }>;
  value: T;
  onChange: (id: T) => void;
  testIdPrefix?: string;
}) {
  return (
    <div role="tablist" className="flex gap-1">
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-testid={testIdPrefix ? `${testIdPrefix}${t.id}` : undefined}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={`na-label flex min-h-[32px] flex-1 items-center justify-center rounded-full px-1.5 py-1.5 uppercase ${on ? "bg-foreground text-night-deep" : t.disabled ? "bg-white/10 text-text-muted opacity-50" : "bg-white/10 text-text-secondary"}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
