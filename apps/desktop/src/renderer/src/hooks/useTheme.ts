import { useEffect } from "react";
import { useUiStore } from "../state/ui-store.js";

const STORAGE_KEY = "ibuildos:theme";

/** Applies the store's theme choice to <html data-theme>, persisting the
 * manual choice. "system" removes the attribute so globals.css's
 * prefers-color-scheme block decides — DESIGN-CHARTER §1: "light + dark
 * themes from day one, prefers-color-scheme + manual toggle." */
export function useTheme(): void {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") setTheme(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);
}
