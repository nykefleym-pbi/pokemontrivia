import { createContext, useContext } from "react";

/**
 * The desktop phone-mockup frame element that portalled overlays (Radix
 * dialog / sheet / drawer / alert-dialog) should render INTO, so they stay
 * clipped to the mock phone instead of escaping to the full viewport.
 *
 * `null` on real phones and before the frame mounts — in which case the
 * primitives fall back to their default `document.body` portal, i.e. exactly
 * today's behavior. Only the desktop/iPad frame (see routes/__root.tsx) sets a
 * real element, and it's a `position: fixed` containing block (via `transform`),
 * so a `fixed inset-0` overlay portalled into it fills the phone, not the screen.
 */
const FramePortalContext = createContext<HTMLElement | null>(null);

export const FramePortalProvider = FramePortalContext.Provider;

/** Container for a Radix/Vaul `*Portal` — `undefined` (not `null`) so the
 *  primitive uses its default body portal when no frame is active. */
export function useFramePortalContainer(): HTMLElement | undefined {
  return useContext(FramePortalContext) ?? undefined;
}
