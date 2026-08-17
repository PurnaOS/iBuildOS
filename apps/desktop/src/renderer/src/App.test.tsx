import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.js";
import { createFakeIbuildos } from "../test/fakeIbuildos.js";

// DESIGN-CHARTER §4's PS-006 gate instrument: "the PS-006 CI lint runs
// Product-mode strings against this table." This is that check, as a Vitest
// assertion against rendered DOM text — a word-boundary regex so "header"
// doesn't false-positive on "head", etc.
const BANNED_IN_PRODUCT_MODE = [
  "branch",
  "worktree",
  "checkout",
  "commit",
  "merge",
  "diff",
  "patch",
  "repo",
  "repository",
  "pipeline",
  "lint",
  "linter",
  "frontmatter",
  "yaml",
  "rebase",
  "transcript",
  "HEAD",
  "SHA",
];

// Radix Dialog content (CommandPalette/AttentionQueue/ChatPanel/
// CreateProjectDialog) renders through a Portal straight onto document.body,
// not inside RTL's `container` — so this checks the whole body, catching
// portal content too.
function assertNoBannedVocabulary(): void {
  const text = document.body.textContent ?? "";
  for (const term of BANNED_IN_PRODUCT_MODE) {
    const pattern = new RegExp(`\\b${term}\\b`, term === term.toUpperCase() ? "" : "i");
    expect(pattern.test(text), `Product mode rendered banned term "${term}"`).toBe(false);
  }
}

let fake: ReturnType<typeof createFakeIbuildos>;

beforeEach(() => {
  fake = createFakeIbuildos();
  Object.defineProperty(window, "ibuildos", { value: fake.api, configurable: true });
});

afterEach(() => {
  fake.backend.dispose();
});

describe("App", () => {
  it("renders Home with the seeded project grid", async () => {
    render(<App />);
    expect(await screen.findByText("iBuildOS")).toBeInTheDocument();
    expect(await screen.findByText("Equipment Inspections")).toBeInTheDocument();
    expect(screen.getByText("Field Sync API")).toBeInTheDocument();
  });

  it("walks the guided create-project flow end to end against the IPC fake (PS-004)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Equipment Inspections");

    await user.click(screen.getByRole("button", { name: /new project/i }));
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("Project name"), "Offline Sync Tool");
    await user.click(dialog.getByRole("button", { name: "Next" }));

    const templateOption = await dialog.findByText("Web app");
    await user.click(templateOption);
    await user.click(dialog.getByRole("button", { name: "Create project" }));

    // Lands on the new project's Home (its Overview), not back on the app Home
    // — the name legitimately appears twice (window header + Overview
    // heading), so this asserts presence rather than uniqueness.
    expect(await screen.findAllByText("Offline Sync Tool")).not.toHaveLength(0);
    expect(screen.getByRole("tab", { name: "product" })).toHaveAttribute("aria-selected", "true");
  });

  it("switches Product <-> Engineering mode without navigating away (PS-003)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText("Equipment Inspections"));

    expect(await screen.findByText("Activity")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "engineering" }));
    expect(await screen.findByText("Trunk state")).toBeInTheDocument();
  });

  it("keeps every Product-mode surface free of git/engineering jargon (PS-006)", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Equipment Inspections");
    assertNoBannedVocabulary();

    // The global overlays (⌘K palette, ⌘J attention queue, ⌘L chat panel) and
    // the create-project wizard are Product-mode surfaces too.
    await user.keyboard("{Meta>}k{/Meta}");
    await screen.findByPlaceholderText(/search projects and actions/i);
    assertNoBannedVocabulary();
    await user.keyboard("{Escape}");

    await user.keyboard("{Meta>}j{/Meta}");
    await screen.findByText("Needs your attention");
    assertNoBannedVocabulary();
    await user.keyboard("{Escape}");

    await user.keyboard("{Meta>}l{/Meta}");
    await screen.findByText("Assistant");
    assertNoBannedVocabulary();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: /new project/i }));
    await screen.findByRole("dialog");
    assertNoBannedVocabulary();
    await user.keyboard("{Escape}");

    await user.click(screen.getByText("Equipment Inspections"));
    await screen.findByText("Activity");
    assertNoBannedVocabulary();
  });
});
