import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";
import { Backend } from "./backend/index.js";
import { createIpcRouter } from "./ipc.js";

// T-001: TS core (here: just app lifecycle + the IPC router, M4 scope) runs in
// Electron's main process; previews/agent I/O are later milestones, not this
// scaffold. This process has zero renderer/DOM concerns.

const dirname = fileURLToPath(new URL(".", import.meta.url));

const backend = new Backend();
const router = createIpcRouter(backend);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    show: false,
    backgroundColor: "#0b0b0c",
    // Default chrome on every platform for this scaffold: a custom/hiddenInset
    // title bar means reserving space for macOS's floating traffic-light
    // buttons in every header (HomeScreen's, ProjectWindow's) — real, but
    // purely visual, polish for a later pass rather than this milestone.
    webPreferences: {
      // T-008: context isolation on, no nodeIntegration in the renderer —
      // the only door from renderer to main is the preload-exposed,
      // zod-validated API surface.
      // Forced to CJS output in electron.vite.config.ts (sandboxed preload
      // can't load ESM) — see that file's comment.
      preload: join(dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Never let the renderer navigate the main window to an external origin, or
  // open one in a new Electron window — hand it to the OS browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const devUrl = rendererDevUrl();
    const isOwnRenderer = devUrl ? url.startsWith(devUrl) : url.startsWith("file://");
    if (!isOwnRenderer) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Captured up front: reading win.webContents from inside the listener would
  // throw "Object has been destroyed" since that's exactly what just happened.
  const senderId = win.webContents.id;
  win.webContents.on("destroyed", () => router.disposeSender(senderId));

  const devUrl = rendererDevUrl();
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(dirname, "../renderer/index.html"));
  }
}

function rendererDevUrl(): string | undefined {
  return process.env["ELECTRON_RENDERER_URL"];
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  backend.dispose();
});
