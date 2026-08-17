import { fileURLToPath } from "node:url";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

// Launches the *built* Electron app (run `pnpm build` first — see
// playwright.config.ts) and walks SPEC.md §7.1's opening beats: Home renders,
// then PS-004's guided create-project flow (name -> template -> scaffold)
// against the real in-memory IPC backend, end to end through actual Electron
// IPC (not the renderer-only fake used by the Vitest suite). It also waits
// out one PS-008 "activity.events" tick — the half of T-008 the Vitest suite
// can't reach, since its fake calls the backend directly and never crosses
// contextBridge/ipcRenderer/ipcMain at all.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const mainEntry = path.join(dirname, "../dist/main/index.js");

test("Home renders, and the create-project flow lands on the new project", async () => {
  const app = await electron.launch({ args: [mainEntry] });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await expect(window.getByText("iBuildOS")).toBeVisible();
    await expect(window.getByText("Equipment Inspections")).toBeVisible();

    await window.getByRole("button", { name: /new project/i }).click();
    const dialog = window.getByRole("dialog");
    await dialog.getByLabel("Project name").fill("Offline Sync Tool");
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByText("Web app").click();
    await dialog.getByRole("button", { name: "Create project" }).click();

    // The name legitimately appears twice (window header + Overview heading).
    await expect(window.getByText("Offline Sync Tool").first()).toBeVisible();
    await expect(window.getByRole("tab", { name: "product" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // A scripted PS-008 beat fires every 4s (see src/main/backend/core.ts) and must
    // arrive over the real subscribe -> ipcRenderer.send -> ipcMain.on ->
    // sender.send -> ipcRenderer.on path for the Activity card to update.
    await expect(window.getByText("Nothing has happened yet.")).toBeHidden({
      timeout: 8_000,
    });
  } finally {
    await app.close();
  }
});

// The streams/dial work package's Product-mode surface (DESIGN-CHARTER §2's
// "Build" sidebar section): list -> detail, the autonomy dial (BD-004), and
// steering (BD-008) — over the same real IPC path as the test above, not the
// Vitest-only renderer fake.
test("Build section shows a project's builds and lets you steer one", async () => {
  const app = await electron.launch({ args: [mainEntry] });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await window.getByText("Equipment Inspections").click();
    await expect(window.getByText("Activity")).toBeVisible();

    await window.getByRole("button", { name: "Build" }).click();
    await expect(window.getByText("Offline inspection capture")).toBeVisible();
    await expect(window.getByText("Waiting on your answer", { exact: true })).toBeVisible();

    await window.getByText("Offline inspection capture").click();
    const dial = window.getByRole("tablist", { name: "Autonomy dial" });
    await expect(dial).toBeVisible();

    const autoTab = dial.getByRole("tab", { name: "Auto" });
    await autoTab.click();
    await expect(autoTab).toHaveAttribute("aria-selected", "true");

    await window.getByLabel("Send an instruction").fill("Use the existing date utils");
    await window.getByRole("button", { name: "Send" }).click();
    await expect(window.getByRole("log", { name: "Recent activity" })).toContainText(
      "Use the existing date utils",
    );
  } finally {
    await app.close();
  }
});
