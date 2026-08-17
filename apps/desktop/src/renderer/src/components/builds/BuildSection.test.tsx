import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BuildSection } from "./BuildSection.js";
import { createFakeIbuildos } from "../../../test/fakeIbuildos.js";

// Component coverage for the streams/dial work package's Product-mode UI —
// mirrors ../../App.test.tsx's style (fake IPC backed by the real backend
// classes, userEvent for interaction) plus its own carry-forward of the
// PS-006 vocabulary check (DESIGN-CHARTER §4), extended with the glossary
// rows the App.test.tsx seed list doesn't cover — notably "stream" itself
// (Product mode calls it a "build").

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
  "stream",
  "push",
  "pull request",
  "gate",
  "provisional ID",
];

function assertNoBannedVocabulary(): void {
  const text = document.body.textContent ?? "";
  for (const term of BANNED_IN_PRODUCT_MODE) {
    const pattern = new RegExp(`\\b${term}\\b`, term === term.toUpperCase() ? "" : "i");
    expect(pattern.test(text), `Product mode rendered banned term "${term}"`).toBe(false);
  }
}

let fake: ReturnType<typeof createFakeIbuildos>;
let queryClient: QueryClient;

function renderBuild(projectId: string) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BuildSection projectId={projectId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fake = createFakeIbuildos();
  Object.defineProperty(window, "ibuildos", { value: fake.api, configurable: true });
});

afterEach(() => {
  fake.backend.dispose();
});

describe("BuildSection", () => {
  it("lists the project's builds with Product-mode status labels (BD-010/PS-008)", async () => {
    renderBuild("seed-equipment-inspections");

    expect(await screen.findByText("Offline inspection capture")).toBeInTheDocument();
    expect(screen.getByText("Equipment report PDF export")).toBeInTheDocument();
    expect(screen.getByText("Inspection photo attachments")).toBeInTheDocument();

    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText("Waiting on your answer")).toBeInTheDocument();
    // Appears twice for "Inspection photo attachments" — the status badge
    // and its summary line happen to share the same seeded copy.
    expect(screen.getAllByText("Ready for you to accept").length).toBeGreaterThan(0);

    assertNoBannedVocabulary();
  });

  it("opens a build's detail, answers a question card, and it resumes (BD-012)", async () => {
    const user = userEvent.setup();
    renderBuild("seed-equipment-inspections");

    await user.click(await screen.findByText("Equipment report PDF export"));
    expect(
      await screen.findByText("Should sync conflicts favor the newest edit, or ask the user?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ask the user" }));

    expect(
      screen.queryByText("Should sync conflicts favor the newest edit, or ask the user?"),
    ).not.toBeInTheDocument();
    // Resumes into "running", labeled "Building" in Product mode.
    expect(await screen.findAllByText("Building")).not.toHaveLength(0);

    assertNoBannedVocabulary();
  });

  it("lets you change the autonomy dial from a build's detail view (BD-004)", async () => {
    const user = userEvent.setup();
    renderBuild("seed-equipment-inspections");

    await user.click(await screen.findByText("Offline inspection capture"));
    const dial = await screen.findByRole("tablist", { name: "Autonomy dial" });
    const autoTab = within(dial).getByRole("tab", { name: "Auto" });

    await user.click(autoTab);
    expect(autoTab).toHaveAttribute("aria-selected", "true");

    assertNoBannedVocabulary();
  });

  it("sends a steering instruction, visible as recent activity (BD-008)", async () => {
    const user = userEvent.setup();
    renderBuild("seed-equipment-inspections");

    await user.click(await screen.findByText("Offline inspection capture"));
    const input = await screen.findByLabelText("Send an instruction");
    await user.type(input, "Use the existing date utils");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const log = screen.getByRole("log", { name: "Recent activity" });
    expect(within(log).getByText(/Use the existing date utils/)).toBeInTheDocument();

    assertNoBannedVocabulary();
  });

  it("shows remediation actions on a stopped build and retry resumes it (BD-013)", async () => {
    const user = userEvent.setup();
    renderBuild("seed-field-sync-api");

    await user.click(await screen.findByText("Sync conflict resolution"));
    expect(await screen.findByText("This build needs attention")).toBeInTheDocument();
    expect(screen.getByText(/Two checks failed/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.queryByText("This build needs attention")).not.toBeInTheDocument();

    assertNoBannedVocabulary();
  });
});
