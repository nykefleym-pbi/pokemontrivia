// The face-off screen. It serves both a 30-second matchmaking wait and a
// 3-second pre-battle beat, so what matters is that it stays honest about
// whether an opponent exists yet, and that its buttons don't collide with the
// tap-to-skip that covers the whole screen.
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("framer-motion", async () => {
  interface P extends ComponentPropsWithoutRef<"img"> {
    initial?: unknown;
    animate?: unknown;
    transition?: unknown;
  }
  const strip = ({ initial: _i, animate: _a, transition: _t, ...rest }: P) => rest;
  const { createElement } = await import("react");
  // motion.<tag> renders a plain <tag> without the animation props.
  return { motion: new Proxy({}, { get: (_, tag: string) => (props: P) => createElement(tag, strip(props)) }) };
});

const { VersusScreen } = await import("@/components/versus-screen");
const { trainingBotSide } = await import("@/lib/training-bot");
const { VERSUS_BACKDROPS, DEFAULT_VERSUS_BACKDROP_ID } = await import("@/lib/versus-backdrops");

const me = { name: "Ash", spriteId: "ace-trainer-m", level: 12, rating: 1120 };
const rival = { name: "Gary", spriteId: "ace-trainer-f", level: 14, rating: 1210 };

afterEach(cleanup);

describe("VersusScreen", () => {
  it("shows only the player while matchmaking is still looking", () => {
    render(<VersusScreen me={me} opponent={null} status="Finding an opponent…" />);
    expect(screen.getByText("Ash")).toBeTruthy();
    expect(screen.queryByText("Gary")).toBeNull();
    expect(screen.getByText("Finding an opponent…")).toBeTruthy();
  });

  it("shows both trainers once an opponent exists", () => {
    render(<VersusScreen me={me} opponent={rival} status="Battle starting…" />);
    expect(screen.getByText("Ash")).toBeTruthy();
    expect(screen.getByText("Gary")).toBeTruthy();
  });

  it("shows a rating only for trainers who have one", () => {
    render(<VersusScreen me={me} opponent={{ ...rival, rating: null }} status="x" />);
    expect(screen.getByText("RATING 1,120")).toBeTruthy();
    expect(screen.queryByText(/1,210/)).toBeNull();
  });

  it("labels a trainer name, then title, then rating", () => {
    const { container } = render(<VersusScreen me={me} opponent={null} status="x" />);
    const lines = [...container.querySelectorAll("div")]
      .map((d) => (d.children.length === 0 ? d.textContent?.trim() : null))
      .filter(Boolean);
    const i = lines.indexOf("Ash");
    expect(i).toBeGreaterThanOrEqual(0);
    // Title between the name and the rating — the owner's stated hierarchy.
    expect(lines[i + 1]).toBe("Great League Champ");
    expect(lines[i + 2]).toBe("RATING 1,120");
  });

  it("draws the comic split: dark while searching, their half blue once found (Figma 15.1 / 15.1b)", () => {
    const bg = (c: HTMLElement) => [...c.querySelectorAll("img")].map((i) => i.getAttribute("src")).filter((s) => s?.startsWith("/versus/vs-"));
    const searching = render(<VersusScreen me={me} opponent={null} status="x" />);
    expect(bg(searching.container)).toEqual(["/versus/vs-finding.png"]);
    cleanup();
    const found = render(<VersusScreen me={me} opponent={rival} status="x" />);
    expect(bg(found.container)).toEqual(["/versus/vs-found.png"]);
  });

  it("lets an avatar image stand in for the trainer sprite", () => {
    const { container } = render(
      <VersusScreen
        me={me}
        opponent={{ ...rival, avatarUrl: "/versus/training-bot.gif" }}
        status="x"
      />,
    );
    const srcs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs).toContain("/versus/training-bot.gif");
  });

  it("gives the Training Bot its own face, not the player's and not a blank", () => {
    // Both bugs the owner hit, as one test. The Arena handed the bot the
    // player's sprite; the live match handed it "" and drew nothing.
    const bot = trainingBotSide(12);
    expect(bot.name).toBe("Training Bot");
    expect(bot.spriteId).not.toBe(me.spriteId);
    expect(bot.spriteId).not.toBe("");

    const { container } = render(<VersusScreen me={me} opponent={bot} status="x" />);
    // `img.sprite`, not every img: the halves carry backdrop images too, and
    // counting those made this assert "two pictures" rather than "two faces".
    const srcs = [...container.querySelectorAll("img.sprite")]
      .map((i) => i.getAttribute("src"))
      .filter((s): s is string => !!s);
    // Two distinct avatars on screen, and neither of them empty.
    expect(srcs.length).toBe(2);
    expect(new Set(srcs).size).toBe(2);
    expect(srcs.every((s) => s !== "")).toBe(true);
  });

  it("stands the bot on the shared default backdrop", () => {
    // It briefly rolled a random one per match. That needed module state to
    // hold steady across the Arena -> match-route handover; a fixed world is
    // simpler and is what the owner asked for.
    const file = decodeURIComponent(trainingBotSide(12).backdrop ?? "");
    expect(file).toBe(`/versus/${VERSUS_BACKDROPS[0].file}`);
    expect(VERSUS_BACKDROPS[0].id).toBe(DEFAULT_VERSUS_BACKDROP_ID);
  });

  it("shows the same backdrop every time, so a handover cannot change it", () => {
    // Three screens draw the bot in a row across a route change. Anything that
    // varied per call would swap the world out mid-face-off.
    const first = trainingBotSide(12).backdrop;
    for (let i = 0; i < 50; i++) expect(trainingBotSide(i).backdrop).toBe(first);
  });

  it("renders no avatar at all rather than a broken one for an unknown sprite", () => {
    const { container } = render(
      <VersusScreen me={me} opponent={{ name: "Ghost", spriteId: "no-such-trainer" }} status="x" />,
    );
    const srcs = [...container.querySelectorAll("img.sprite")].map((i) => i.getAttribute("src"));
    // Only the player's. The unresolvable one is absent, not present-and-empty.
    expect(srcs.length).toBe(1);
    expect(srcs[0]).toBeTruthy();
  });

  it("skips on tap when the caller allows it", () => {
    const onSkip = vi.fn();
    const { container } = render(
      <VersusScreen me={me} opponent={rival} status="Battle starting…" onSkip={onSkip} />,
    );
    fireEvent.click(container.firstChild as Element);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("does not skip when there is nothing to skip to", () => {
    const { container } = render(<VersusScreen me={me} opponent={null} status="Finding…" />);
    // No handler, no button role — the search screen must not look tappable.
    expect((container.firstChild as HTMLElement).getAttribute("role")).toBeNull();
  });

  it("keeps an action button from also firing the skip underneath it", () => {
    const onSkip = vi.fn();
    const onCancel = vi.fn();
    render(
      <VersusScreen
        me={me}
        opponent={null}
        status="Finding…"
        onSkip={onSkip}
        actions={<button onClick={onCancel}>Cancel</button>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });
});
