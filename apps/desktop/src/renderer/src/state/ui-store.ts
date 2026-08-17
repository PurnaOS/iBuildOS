import { create } from "zustand";

// T-003's Zustand slice: ephemeral shell UI state only (palette/attention/chat
// open-ness, theme choice). Project/activity data lives in TanStack Query
// (see ../hooks/useProjects.ts, ../hooks/useActivity.ts) — this store never
// holds anything that came from the IPC contract.

export type Theme = "light" | "dark" | "system";

interface UiState {
  paletteOpen: boolean;
  attentionOpen: boolean;
  chatOpen: boolean;
  theme: Theme;
  setPaletteOpen: (open: boolean) => void;
  setAttentionOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
}

export const useUiStore = create<UiState>((set) => ({
  paletteOpen: false,
  attentionOpen: false,
  chatOpen: false,
  theme: "system",
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setAttentionOpen: (open) => set({ attentionOpen: open }),
  setChatOpen: (open) => set({ chatOpen: open }),
  setTheme: (theme) => set({ theme }),
}));
