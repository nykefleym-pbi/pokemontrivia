export type Theme = "light" | "dark" | "system";

const KEY = "pokemon-theme";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function resolved(t: Theme): "light" | "dark" {
  if (t !== "system") return t;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const mode = resolved(t);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function setTheme(t: Theme) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  }
  applyTheme(t);
}

export function initTheme() {
  applyTheme(getTheme());
  if (typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", () => {
      if (getTheme() === "system") applyTheme("system");
    });
  }
}
