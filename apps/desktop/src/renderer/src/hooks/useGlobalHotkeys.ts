import { useEffect } from "react";
import { useUiStore } from "../state/ui-store.js";

// DESIGN-CHARTER §2 nav map: "Global: ⌘K palette · attention queue (⌘J) ·
// chat panel (⌘L, context-aware)"; mode switch is "⌘E, per-user, per-project".
export function useGlobalHotkeys(onToggleMode?: () => void): void {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const setAttentionOpen = useUiStore((s) => s.setAttentionOpen);
  const setChatOpen = useUiStore((s) => s.setChatOpen);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      switch (event.key.toLowerCase()) {
        case "k":
          event.preventDefault();
          setPaletteOpen(true);
          break;
        case "j":
          event.preventDefault();
          setAttentionOpen(true);
          break;
        case "l":
          event.preventDefault();
          setChatOpen(true);
          break;
        case "e":
          if (onToggleMode) {
            event.preventDefault();
            onToggleMode();
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setPaletteOpen, setAttentionOpen, setChatOpen, onToggleMode]);
}
