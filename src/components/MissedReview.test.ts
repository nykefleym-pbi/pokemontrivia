import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MissedAnswer } from "@/lib/trivia-core";
import { MissedReview } from "./MissedReview";

/**
 * Story 1 (#1) — the shared missed-answer review card. Rendered to a static HTML
 * string via react-dom/server so it stays deterministic under the repo's `node`
 * Vitest environment (no jsdom / RTL is installed). We assert on the rendered
 * markup, which is the same output both lose screens embed.
 *
 * Note: the extracted Solo markup surfaces each miss's `correctAnswer` +
 * `explanation` (not the question text) — the row shape is intentionally the
 * Solo card verbatim, so tests assert exactly what the component renders.
 */

function render(el: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(el);
}

const missed = (n: number): MissedAnswer[] =>
  Array.from({ length: n }, (_, i) => ({
    question: `Question ${i + 1}?`,
    correctAnswer: `Answer ${i + 1}`,
    explanation: `Because ${i + 1}.`,
  }));

describe("MissedReview (Story 1 / #1)", () => {
  it("renders one row per missed item with its correct answer and explanation", () => {
    const items = missed(3);
    const html = render(createElement(MissedReview, { missed: items }));

    // Header reports the total count.
    expect(html).toContain("Review · 3 Missed");
    // One ✕ marker (row) per item.
    expect((html.match(/✕/g) ?? []).length).toBe(3);
    // Each item's correct answer + explanation is present.
    for (const m of items) {
      expect(html).toContain(m.correctAnswer);
      expect(html).toContain(m.explanation);
    }
  });

  it("renders nothing when missed is empty and no footer (graceful zero-wrong-loss degrade)", () => {
    const html = render(createElement(MissedReview, { missed: [] }));
    // The graceful-degrade case: component returns null → empty markup.
    expect(html).toBe("");
  });

  it("caps the list at 5 rows and shows an 'and N more' overflow line", () => {
    const html = render(createElement(MissedReview, { missed: missed(7) }));

    expect(html).toContain("Review · 7 Missed");
    expect((html.match(/✕/g) ?? []).length).toBe(5); // capped
    expect(html).toContain("and 2 more"); // 7 - 5
  });

  it("renders the optional footer slot when provided", () => {
    const footer = createElement("p", null, "Consolation XP awarded");
    const html = render(
      createElement(MissedReview, { missed: missed(1), footer }),
    );

    expect(html).toContain("Answer 1");
    expect(html).toContain("Consolation XP awarded");
  });

  it("renders the footer even with zero missed (Solo's no-wrong-answers edge case)", () => {
    const footer = createElement("p", null, "Consolation XP awarded");
    const html = render(createElement(MissedReview, { missed: [], footer }));

    // Not null this time: footer forces the card to render, with the empty-state line.
    expect(html).not.toBe("");
    expect(html).toContain("No wrong answers");
    expect(html).toContain("Consolation XP awarded");
  });

  it("omits the explanation dash when a miss has no explanation", () => {
    const html = render(
      createElement(MissedReview, {
        missed: [{ question: "Q?", correctAnswer: "Pikachu", explanation: "" }],
      }),
    );

    expect(html).toContain("Pikachu");
    expect(html).not.toContain("—"); // no " — explanation" segment
  });
});
