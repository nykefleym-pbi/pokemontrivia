import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Night Arena button — the Figma "Button" component set (Kind x Size).
 *
 * Kept apart from ui/button.tsx on purpose: that one carries shadcn's rounding,
 * text size and scale-press, which fight this design's 3D lip (the face drops
 * into the lip instead of shrinking). Styles live in styles.css as na-btn-*.
 */
export type NaButtonKind = "primary" | "gold" | "success" | "secondary" | "danger" | "ghost" | "text";

// Spelled out in full: Tailwind only generates classes it can see in the source,
// so `na-btn-${kind}` would silently ship an unstyled button.
const KIND_CLASS: Record<NaButtonKind, string> = {
  primary: "na-btn-primary",
  gold: "na-btn-gold",
  success: "na-btn-success",
  secondary: "na-btn-secondary",
  danger: "na-btn-danger",
  ghost: "na-btn-ghost",
  text: "na-btn-text",
};

export interface NaButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: NaButtonKind;
  /** L = the main action of a screen (56px), M = everything else (44px). */
  size?: "L" | "M";
  block?: boolean;
}

export const NaButton = React.forwardRef<HTMLButtonElement, NaButtonProps>(
  ({ kind = "primary", size = "L", block, className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "na-btn",
        kind !== "text" && (size === "L" ? "na-btn-l" : "na-btn-m"),
        KIND_CLASS[kind],
        block && "w-full",
        className,
      )}
      {...props}
    />
  ),
);
NaButton.displayName = "NaButton";
