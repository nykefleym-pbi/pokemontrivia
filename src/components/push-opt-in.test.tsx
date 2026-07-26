// When the notification card is allowed to appear, and — more importantly —
// when it must not.
//
// The recall system (two crons + an Edge Function that really do send) reached
// nobody before this: the only caller of enablePushNotifications() was a toggle
// inside Profile's settings sheet, and not one player who arrived after the
// owner ever found it. This card is the fix, so its timing is pinned here: a
// native permission prompt shown too early is denied once and denied forever.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useGameStore } from "@/lib/store";

const enablePush = vi.fn();
const subscriptionState = vi.fn();

vi.mock("@/lib/push", () => ({
  pushSupported: () => true,
  getPushSubscriptionState: () => subscriptionState(),
  enablePushNotifications: () => enablePush(),
}));

vi.mock("@/lib/install-prompt", () => ({
  installAvailable: () => false,
  onInstallAvailability: () => () => {},
  promptInstall: () => Promise.resolve("unavailable" as const),
  isStandalone: () => false,
  isIos: () => false,
}));

vi.mock("@/lib/analytics", () => ({ track: () => {} }));

const { PushOptIn } = await import("@/components/push-opt-in");

function setStore(over: { wins?: number; busy?: boolean; onboarded?: boolean } = {}) {
  const s = useGameStore.getState();
  useGameStore.setState({
    hasOnboarded: over.onboarded ?? true,
    stats: { ...s.stats, wins: over.wins ?? 1 },
    inBattle: over.busy ?? false,
    battleScreenActive: false,
    pendingLevelUp: null,
    pushPromptState: "unasked",
    pushPromptLastDate: null,
  });
}

beforeEach(() => {
  enablePush.mockReset().mockResolvedValue({ ok: true });
  subscriptionState.mockReset().mockResolvedValue({ permission: "default", subscribed: false });
});
afterEach(cleanup);

const card = () => screen.queryByText(/Want a nudge when it's ready\?/i);

describe("PushOptIn", () => {
  it("appears after a first win", async () => {
    setStore({ wins: 1 });
    render(<PushOptIn />);
    await waitFor(() => expect(card()).not.toBeNull());
  });

  it("stays away before any win", async () => {
    setStore({ wins: 0 });
    render(<PushOptIn />);
    await waitFor(() => expect(subscriptionState).toHaveBeenCalled());
    expect(card()).toBeNull();
  });

  it("stays away mid-battle", async () => {
    setStore({ wins: 3, busy: true });
    render(<PushOptIn />);
    await waitFor(() => expect(subscriptionState).toHaveBeenCalled());
    expect(card()).toBeNull();
  });

  it("stays away for a player who already subscribed", async () => {
    subscriptionState.mockResolvedValue({ permission: "granted", subscribed: true });
    setStore({ wins: 5 });
    render(<PushOptIn />);
    await waitFor(() => expect(subscriptionState).toHaveBeenCalled());
    expect(card()).toBeNull();
  });

  it("does not touch the native prompt until the player says yes", async () => {
    setStore({ wins: 1 });
    render(<PushOptIn />);
    await waitFor(() => expect(card()).not.toBeNull());
    expect(enablePush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));
    await waitFor(() => expect(enablePush).toHaveBeenCalledTimes(1));
  });

  it("treats a first 'Not now' as recoverable and a second as final", async () => {
    setStore({ wins: 1 });
    const { unmount } = render(<PushOptIn />);
    await waitFor(() => expect(card()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(useGameStore.getState().pushPromptState).toBe("soft-declined");
    unmount();
    cleanup();

    // Next day, second and last ask.
    useGameStore.setState({ pushPromptLastDate: "2020-01-01" });
    render(<PushOptIn />);
    await waitFor(() => expect(card()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(useGameStore.getState().pushPromptState).toBe("asked");
  });

  it("stops asking once the state is terminal", async () => {
    setStore({ wins: 9 });
    useGameStore.setState({ pushPromptState: "asked", pushPromptLastDate: "2020-01-01" });
    render(<PushOptIn />);
    await waitFor(() => expect(subscriptionState).toHaveBeenCalled());
    expect(card()).toBeNull();
  });

  it("records the ask as spent even when the player denies the native prompt", async () => {
    enablePush.mockResolvedValue({ ok: false, error: "Notification permission was not granted." });
    setStore({ wins: 1 });
    render(<PushOptIn />);
    await waitFor(() => expect(card()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /notify me/i }));
    // A denied native prompt can never be re-asked, so re-offering is pointless.
    await waitFor(() => expect(useGameStore.getState().pushPromptState).toBe("asked"));
  });
});
