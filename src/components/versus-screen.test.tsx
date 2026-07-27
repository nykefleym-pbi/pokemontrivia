// The face-off screen. It serves both a 30-second matchmaking wait and a
// 3-second pre-battle beat, so what matters is that it stays honest about
// whether an opponent exists yet, and that its buttons don't collide with the
// tap-to-skip that covers the whole screen.
import type { ComponentPropsWithoutRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("framer-motion", () => {
  interface P extends ComponentPropsWithoutRef<"img"> {
    initial?: unknown;
    animate?: unknown;
    transition?: unknown;
  }
  const strip = ({ initial: _i, animate: _a, transition: _t, ...rest }: P) => rest;
  const Img = (props: P) => <img {...strip(props)} />;
  return { motion: new Proxy({} as Record<string, typeof Img>, { get: () => Img }) };
});

const { VersusScreen } = await import("@/components/versus-screen");

const me = { name: "Ash", spriteId: "ace-trainer-m", level: 12, rating: 1120, code: "ABC123" };
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

  it("shows a rating badge only for trainers who have one", () => {
    render(<VersusScreen me={me} opponent={{ ...rival, rating: null }} status="x" />);
    expect(screen.getByText("1,120")).toBeTruthy();
    expect(screen.queryByText("1,210")).toBeNull();
  });

  it("shows the player's own code but never the opponent's", () => {
    render(<VersusScreen me={me} opponent={{ ...rival, code: "SECRET1" }} status="x" />);
    expect(screen.getByText("ABC123")).toBeTruthy();
    expect(screen.queryByText("SECRET1")).toBeNull();
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
