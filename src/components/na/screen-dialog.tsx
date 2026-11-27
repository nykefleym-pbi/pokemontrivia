import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useFramePortalContainer } from "@/components/frame-portal";
import { NaIcon } from "@/components/na/icon";

/**
 * A full Night Arena screen with a back button (Figma 17.4–17.7), opened over
 * whatever is showing. Built on Radix Dialog so it stacks cleanly over a
 * sheet (Edit profile opens the pickers) with focus trapping and Escape.
 */
export function NaScreenDialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  /** Pinned under the scroll: the screen's main button. */
  footer?: React.ReactNode;
}) {
  const container = useFramePortalContainer();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={container ?? undefined}>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="na-bg-night fixed inset-0 z-50 flex flex-col pt-[env(safe-area-inset-top)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
            <DialogPrimitive.Close aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-foreground">
              <NaIcon name="arrow-left" size={20} />
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className="na-display-s flex-1 text-foreground">{title}</DialogPrimitive.Title>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-2">{children}</div>
          {footer && <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Figma "Search field": a rounded glass box with a magnifier. */
export function NaSearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-12 shrink-0 items-center gap-2.5 rounded-[16px] border border-white/[0.12] bg-white/[0.08] px-3.5">
      <NaIcon name="search" size={18} className="shrink-0 text-text-secondary" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="na-body w-full min-w-0 bg-transparent text-foreground outline-none placeholder:text-text-secondary"
      />
    </label>
  );
}
