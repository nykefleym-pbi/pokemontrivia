import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  captureInstallPrompt,
  installAvailable,
  isIos,
  isStandalone,
  onInstallAvailability,
  promptInstall,
} from "@/lib/install-prompt";

/** A minimal stand-in for the window bits the module touches. */
function fakeWindow() {
  const handlers = new Map<string, Set<(e: Event) => void>>();
  return {
    addEventListener: (type: string, fn: (e: Event) => void) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (e: Event) => void) => {
      handlers.get(type)?.delete(fn);
    },
    fire: (type: string, e: Event) => {
      for (const fn of handlers.get(type) ?? []) fn(e);
    },
    listenerCount: (type: string) => handlers.get(type)?.size ?? 0,
  } as unknown as Window & {
    fire: (type: string, e: Event) => void;
    listenerCount: (type: string) => number;
  };
}

function installEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const prevented = { value: false };
  return {
    event: {
      preventDefault: () => void (prevented.value = true),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome }),
    } as unknown as Event,
    prevented,
  };
}

// The module holds one deferred event in module scope; drain it between tests.
beforeEach(async () => {
  await promptInstall();
});

describe("captureInstallPrompt", () => {
  it("holds the event so an install can be offered later", () => {
    const win = fakeWindow();
    captureInstallPrompt(win);
    expect(installAvailable()).toBe(false);
    win.fire("beforeinstallprompt", installEvent().event);
    expect(installAvailable()).toBe(true);
  });

  it("preventDefaults the event, without which prompt() is unusable", () => {
    const win = fakeWindow();
    captureInstallPrompt(win);
    const { event, prevented } = installEvent();
    win.fire("beforeinstallprompt", event);
    expect(prevented.value).toBe(true);
  });

  it("notifies subscribers when an install becomes available", () => {
    const win = fakeWindow();
    captureInstallPrompt(win);
    const seen: boolean[] = [];
    const off = onInstallAvailability((v) => seen.push(v));
    win.fire("beforeinstallprompt", installEvent().event);
    expect(seen).toEqual([true]);
    off();
  });

  it("forgets the event once the app is installed", () => {
    const win = fakeWindow();
    captureInstallPrompt(win);
    win.fire("beforeinstallprompt", installEvent().event);
    win.fire("appinstalled", new Event("appinstalled"));
    expect(installAvailable()).toBe(false);
  });

  it("removes both listeners on teardown", () => {
    const win = fakeWindow();
    const off = captureInstallPrompt(win);
    expect(win.listenerCount("beforeinstallprompt")).toBe(1);
    expect(win.listenerCount("appinstalled")).toBe(1);
    off();
    expect(win.listenerCount("beforeinstallprompt")).toBe(0);
    expect(win.listenerCount("appinstalled")).toBe(0);
  });
});

describe("promptInstall", () => {
  it("reports what the player chose", async () => {
    const win = fakeWindow();
    captureInstallPrompt(win);
    win.fire("beforeinstallprompt", installEvent("accepted").event);
    await expect(promptInstall()).resolves.toBe("accepted");
  });

  it("is single-use — Chrome refuses a second prompt on the same event", async () => {
    const win = fakeWindow();
    captureInstallPrompt(win);
    win.fire("beforeinstallprompt", installEvent().event);
    await promptInstall();
    await expect(promptInstall()).resolves.toBe("unavailable");
  });

  it("says so when there is nothing to prompt with", async () => {
    await expect(promptInstall()).resolves.toBe("unavailable");
  });
});

describe("platform detection", () => {
  const win = (ua: string, extras: Record<string, unknown> = {}) =>
    ({
      navigator: { userAgent: ua, maxTouchPoints: 0, ...extras },
      matchMedia: () => ({ matches: false }),
    }) as unknown as Window;

  it("spots an iPhone", () => {
    expect(isIos(win("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"))).toBe(true);
  });

  it("spots an iPad, which lies and claims to be a Mac", () => {
    expect(isIos(win("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", { maxTouchPoints: 5 }))).toBe(
      true,
    );
  });

  it("does not mistake a real Mac for iOS", () => {
    expect(isIos(win("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"))).toBe(false);
  });

  it("does not mistake Android for iOS", () => {
    expect(isIos(win("Mozilla/5.0 (Linux; Android 14; Pixel 8)"))).toBe(false);
  });

  it("reads the iOS standalone flag", () => {
    expect(isStandalone(win("iPhone", { standalone: true }))).toBe(true);
    expect(isStandalone(win("iPhone", { standalone: false }))).toBe(false);
  });

  it("reads the display-mode media query everywhere else", () => {
    const installed = {
      navigator: { userAgent: "Pixel", maxTouchPoints: 0 },
      matchMedia: (q: string) => ({ matches: q === "(display-mode: standalone)" }),
    } as unknown as Window;
    expect(isStandalone(installed)).toBe(true);
  });
});
