import { describe, it, expect } from "vitest";
import { swipeIntent } from "@/lib/swipe";

describe("swipeIntent", () => {
  it("reads a long drag right as the previous entry", () => {
    expect(swipeIntent({ dx: 90, dy: 4, dt: 300 })).toBe("prev");
  });

  it("reads a long drag left as the next entry", () => {
    expect(swipeIntent({ dx: -90, dy: 4, dt: 300 })).toBe("next");
  });

  it("commits on a short but fast flick", () => {
    // Under the distance threshold, over the velocity one.
    expect(swipeIntent({ dx: -30, dy: 2, dt: 50 })).toBe("next");
  });

  it("ignores a short slow drag", () => {
    expect(swipeIntent({ dx: -30, dy: 2, dt: 600 })).toBeNull();
  });

  it("ignores a vertical scroll even when it travels far sideways", () => {
    // This is the case that makes a naive "did x move enough" check fire a page
    // turn in the middle of scrolling the sheet.
    expect(swipeIntent({ dx: 80, dy: 200, dt: 400 })).toBeNull();
  });

  it("ignores a gesture that did not move", () => {
    expect(swipeIntent({ dx: 0, dy: 0, dt: 120 })).toBeNull();
  });

  it("does not divide by zero on an instantaneous gesture", () => {
    expect(swipeIntent({ dx: 4, dy: 0, dt: 0 })).toBeNull();
  });
});
