import { createRouter, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-card">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-foreground/60">
          An unexpected error occurred. Please try again.
        </p>
        {error.message && (
          <p className="mt-4 rounded-xl bg-poke-blue/10 px-3 py-2 text-left font-mono text-xs text-poke-blue break-words">
            {error.message}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground shadow-pop transition press"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full border-2 bg-card px-5 text-sm font-bold text-foreground transition press"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    // scrollRestoration is deliberately OFF, and turning it on carries one tab's
    // scroll position into the next one.
    //
    // Nothing in this app scrolls the window: __root pins the shell to h-[100dvh]
    // overflow-hidden and every screen owns an inner overflow-y-auto pane. The
    // router's restoration listens on document in the CAPTURE phase, so it tracks
    // those panes too, and keys them by a STRUCTURAL selector -- and since every
    // tab renders the same shape (body > div > div > pane), all five tabs share
    // one selector. On navigation it copies the previous location's entries
    // forward (`toElementEntries[sel] ??= fromElementEntries[sel]`), exempting the
    // window from that copy but not the panes, then applies them.
    //
    // Measured with the real app before this was removed: Profile scrolled to 127
    // -> Dex opened at 127; Dex scrolled to 450 -> Shop opened at 450. The exact
    // offset transfers, which is what gave away the shared-selector copy.
    //
    // Nothing is lost by having it off. Panes remount at 0 on every navigation,
    // and no detail view is a route -- the Dex entry, the Profile sheets and the
    // shop confirmations are all overlays over a pane that never unmounts -- so
    // there is no position a Back press needs restored. Adding
    // scrollToTopSelectors instead would leave the same end state, because the
    // reset branch scrolls those elements to 0 whenever the window did not
    // restore, which here is always.
    scrollRestoration: false,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
