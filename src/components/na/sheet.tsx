"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useFramePortalContainer } from "@/components/frame-portal";
import { NaButton } from "@/components/na/button";

/**
 * Night Arena sheet (Figma "Sheet"): the one overlay the pop-up queue may show,
 * rising from the bottom over a dark scrim. Grabber, title, body, your content,
 * a primary button, an optional text button and a footnote — in that order.
 *
 * Built on Radix Dialog for focus trapping, Escape and screen-reader labels;
 * rendered into the desktop phone frame when there is one, like ui/dialog.
 */
export interface NaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: React.ReactNode;
  children?: React.ReactNode;
  primary?: { label: React.ReactNode; onClick: () => void; disabled?: boolean; kind?: "primary" | "gold" | "success" | "danger" };
  secondary?: { label: React.ReactNode; onClick: () => void };
  footnote?: React.ReactNode;
  /** 0.72 over a result screen (1.6), lighter elsewhere. */
  scrim?: number;
  className?: string;
  /** Keep the title for screen readers only: the sheet draws its own header (17.1, 17.11). */
  hideTitle?: boolean;
  /** 17.9: a red glow round the whole screen, for the one dangerous sheet. */
  edge?: "danger";
}

export function NaSheet({
  open,
  onOpenChange,
  title,
  body,
  children,
  primary,
  secondary,
  footnote,
  scrim = 0.6,
  className,
  hideTitle,
  edge,
}: NaSheetProps) {
  const container = useFramePortalContainer();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={container ?? undefined}>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{ background: `rgb(4 6 15 / ${scrim})` }}
        />
        {edge === "danger" && (
          <div aria-hidden className="pointer-events-none fixed inset-0 z-[51] border-[3px] border-danger/90 bg-danger/[0.04] shadow-[inset_0_0_70px_8px_rgba(255,45,85,0.75)]" />
        )}
        <DialogPrimitive.Content
          className={cn(
            "na-raised fixed inset-x-0 bottom-0 z-50 flex max-h-[92%] flex-col gap-3.5 overflow-y-auto rounded-t-[28px] px-5 pt-2.5 outline-none",
            "pb-[calc(env(safe-area-inset-bottom)+30px)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            className,
          )}
        >
          <div aria-hidden className="mx-auto h-[5px] w-10 shrink-0 rounded-[3px] bg-white/30" />
          <DialogPrimitive.Title className={hideTitle ? "sr-only" : "na-display-m text-foreground"}>{title}</DialogPrimitive.Title>
          {body ? (
            <DialogPrimitive.Description className="na-body text-text-secondary">{body}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          {children && <div className="flex flex-col gap-2.5">{children}</div>}
          {primary && (
            <NaButton block kind={primary.kind ?? "primary"} disabled={primary.disabled} onClick={primary.onClick}>
              {primary.label}
            </NaButton>
          )}
          {secondary && (
            <NaButton block kind="text" size="M" className="h-11" onClick={secondary.onClick}>
              {secondary.label}
            </NaButton>
          )}
          {footnote && <p className="na-caption text-center text-text-muted">{footnote}</p>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
