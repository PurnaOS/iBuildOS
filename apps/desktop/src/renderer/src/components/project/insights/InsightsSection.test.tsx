import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InsightsSection } from "./InsightsSection.js";
import { createFakeIbuildos } from "../../../../test/fakeIbuildos.js";

// Mirrors App.test.tsx's PS-006 vocabulary gate, scoped to the Insights
// surfaces (App.test.tsx's own check never navigates into Insights, so this
// file is where that guarantee actually gets exercised for this domain).
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
  "stream",
  "gate",
  "trunk",
  "HEAD",
  "SHA",
];

function assertNoBannedVocabulary(): void {
  const text = document.body.textContent ?? "";
  for (const term of BANNED_IN_PRODUCT_MODE) {
    const pattern = new RegExp(`\\b${term}\\b`, term === term.toUpperCase() ? "" : "i");
    expect(pattern.test(text), `Insights rendered banned term "${term}"`).toBe(false);
  }
}

let fake: ReturnType<typeof createFakeIbuildos>;
let queryClient: QueryClient;

beforeEach(() => {
  fake = createFakeIbuildos();
  Object.defineProperty(window, "ibuildos", { value: fake.api, configurable: true });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  fake.backend.dispose();
  fake.insightsBackend.dispose();
});

function renderInsights(projectId: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <InsightsSection projectId={projectId} />
    </QueryClientProvider>,
  );
}

describe("InsightsSection", () => {
  it("shows the Dashboards tab by default: progress, quality, and workload", async () => {
    renderInsights("seed-equipment-inspections");

    expect(await screen.findByText("Progress")).toBeInTheDocument();
    expect(await screen.findByText("18 of 24")).toBeInTheDocument();
    expect(screen.getByText("Quality")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("Team workload")).toBeInTheDocument();
    expect(screen.getByText("Priya Shah")).toBeInTheDocument();
    expect(screen.getByText("Arjun Mehta")).toBeInTheDocument();

    assertNoBannedVocabulary();
  });

  it("Adoption tab shows an empty state for a greenfield project", async () => {
    const user = userEvent.setup();
    renderInsights("seed-equipment-inspections");

    await user.click(screen.getByRole("tab", { name: "Adoption" }));
    expect(await screen.findByText("No adoption history here")).toBeInTheDocument();

    assertNoBannedVocabulary();
  });

  it("Adoption tab shows a burndown for a brownfield project", async () => {
    const user = userEvent.setup();
    renderInsights("seed-field-sync-api");

    await user.click(screen.getByRole("tab", { name: "Adoption" }));
    expect(await screen.findByText("9 of 42")).toBeInTheDocument();
    expect(screen.getByText("76%")).toBeInTheDocument();
    expect(screen.getByText(/42 remaining/)).toBeInTheDocument();
    expect(screen.getByText(/9 remaining/)).toBeInTheDocument();

    assertNoBannedVocabulary();
  });

  it("My queue tab lists items waiting on the current user", async () => {
    const user = userEvent.setup();
    renderInsights("seed-field-sync-api");

    await user.click(screen.getByRole("tab", { name: "My queue" }));
    expect(await screen.findByRole("heading", { name: /My queue/ })).toBeInTheDocument();
    expect(screen.getByText(/Priya Shah/)).toBeInTheDocument();
    expect(await screen.findByText("Adopted-scope contract for /sync endpoints")).toBeInTheDocument();
    expect(screen.getByText(/Waiting on your review/)).toBeInTheDocument();

    assertNoBannedVocabulary();
  });

  it("My queue tab shows an empty state when nothing is waiting", async () => {
    const user = userEvent.setup();
    renderInsights("seed-release-notes-site");

    await user.click(screen.getByRole("tab", { name: "My queue" }));
    expect(await screen.findByText("Nothing is waiting on you right now.")).toBeInTheDocument();

    assertNoBannedVocabulary();
  });

  it("Team notes tab lists coordination notes", async () => {
    const user = userEvent.setup();
    renderInsights("seed-field-sync-api");

    await user.click(screen.getByRole("tab", { name: "Team notes" }));
    expect(await screen.findByText("Adoption kickoff")).toBeInTheDocument();
    expect(screen.getByText("Meeting")).toBeInTheDocument();

    assertNoBannedVocabulary();
  });

  it("Team notes tab shows an empty state for a quiet project", async () => {
    const user = userEvent.setup();
    renderInsights("seed-release-notes-site");

    await user.click(screen.getByRole("tab", { name: "Team notes" }));
    expect(await screen.findByText("No shared notes yet.")).toBeInTheDocument();
  });
});
