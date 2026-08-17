import { useState, type JSX } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTheme } from "./hooks/useTheme.js";
import { useGlobalHotkeys } from "./hooks/useGlobalHotkeys.js";
import { HomeScreen } from "./components/home/HomeScreen.js";
import { ProjectWindow } from "./components/project/ProjectWindow.js";
import { CommandPalette } from "./components/layout/CommandPalette.js";
import { AttentionQueue } from "./components/layout/AttentionQueue.js";
import { ChatPanel } from "./components/layout/ChatPanel.js";
import type { Mode } from "./lib/nav.js";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

type Screen = { type: "home" } | { type: "project"; id: string };

// DESIGN-CHARTER §2's navigation map, top to bottom: Home <-> Project window,
// with the global palette/attention-queue/chat-panel overlays available from
// anywhere (rendered once here, not per-screen).
function AppShell(): JSX.Element {
  const [screen, setScreen] = useState<Screen>({ type: "home" });
  const [modeByProject, setModeByProject] = useState<Record<string, Mode>>({});

  useTheme();

  function setModeFor(projectId: string, mode: Mode): void {
    setModeByProject((prev) => ({ ...prev, [projectId]: mode }));
  }

  function toggleMode(): void {
    if (screen.type !== "project") return;
    const current = modeByProject[screen.id] ?? "product";
    setModeFor(screen.id, current === "product" ? "engineering" : "product");
  }

  useGlobalHotkeys(screen.type === "project" ? toggleMode : undefined);

  function openProject(id: string): void {
    setScreen({ type: "project", id });
  }

  function goHome(): void {
    setScreen({ type: "home" });
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      {screen.type === "home" ? (
        <HomeScreen onOpenProject={openProject} />
      ) : (
        <ProjectWindow
          projectId={screen.id}
          mode={modeByProject[screen.id] ?? "product"}
          onModeChange={(mode) => setModeFor(screen.id, mode)}
          onBack={goHome}
        />
      )}
      <CommandPalette onGoHome={goHome} onOpenProject={openProject} />
      <AttentionQueue onOpenProject={openProject} />
      <ChatPanel />
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
