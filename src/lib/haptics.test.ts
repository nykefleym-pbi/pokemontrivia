import { describe, it, expect, vi, afterEach } from "vitest";
import { answerHaptic } from "@/lib/haptics";

const withVibrate = (impl: (p: number | number[]) => boolean) => {
  Object.defineProperty(globalThis, "navigator", {
    value: { vibrate: vi.fn(impl) },
    configurable: true,
  });
  return (globalThis.navigator as unknown as { vibrate: ReturnType<typeof vi.fn> }).vibrate;
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "navigator");
});

describe("answerHaptic", () => {
  it("buzzes once when right and three times when wrong", () => {
    const vibrate = withVibrate(() => true);
    answerHaptic(true);
    answerHaptic(false);
    expect(vibrate.mock.calls).toEqual([[30], [[50, 30, 50]]]);
  });

  it("does nothing where the Vibration API is absent", () => {
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    expect(() => answerHaptic(true)).not.toThrow();
  });

  it("swallows a blocked vibrate rather than failing the answer", () => {
    withVibrate(() => {
      throw new Error("blocked by permissions policy");
    });
    expect(() => answerHaptic(true)).not.toThrow();
  });
});
