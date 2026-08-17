import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VerificationSection } from "./VerificationSection.js";
import { createFakeIbuildos } from "../../../test/fakeIbuildos.js";

// Same PS-006 gate instrument as ../../App.test.tsx's own check -- repeated
// here because App.test.tsx never navigates into this section, so its check
// never exercises this component's rendered text.
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

function assertNoBannedVocabulary(): void {
  const text = document.body.textContent ?? "";
  for (const term of BANNED_IN_PRODUCT_MODE) {
    const pattern = new RegExp(`\\b${term}\\b`, term === term.toUpperCase() ? "" : "i");
    expect(pattern.test(text), `Rendered banned term "${term}"`).toBe(false);
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
});

function renderSection() {
  return render(
    <QueryClientProvider client={queryClient}>
      <VerificationSection />
    </QueryClientProvider>,
  );
}

describe("VerificationSection", () => {
  it("walks the happy path: run tests, accept the story, and combine (RV-003/RV-004, IG-003)", async () => {
    const user = userEvent.setup();
    renderSection();

    // Preview and tests both render for the default (first) story.
    await screen.findByText("Live preview");
    expect(await screen.findByText(/Offline sync/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Run tests" }));

    // All three scripted cases resolve to "passed" for this demo target.
    await screen.findByText("3 of 3 checks passing", {}, { timeout: 3_000 });

    // Every criterion is now verified, so accepting is allowed.
    const acceptButton = screen.getByRole("button", { name: "Accept story" });
    expect(acceptButton).not.toBeDisabled();
    await user.click(acceptButton);

    await screen.findByText("Accepted");

    // Combining requires acceptance -- now satisfied -- and resolves to a
    // clean landing for this target (no "conflict" in its id).
    await user.click(screen.getByRole("button", { name: "Finish & combine" }));
    await screen.findByText("Combined with the live product.", {}, { timeout: 2_000 });

    assertNoBannedVocabulary();
  });

  it("the legacy-import demo: a waiver clears a failed check, and combining surfaces a conflict needing attention", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("tab", { name: "Legacy data import" }));
    await user.click(screen.getByRole("button", { name: "Run tests" }));

    // The dedupe case is scripted to fail for this target.
    await screen.findByText(/Failed/, {}, { timeout: 3_000 });
    expect(screen.getByText("1 of 2 checks passing")).toBeInTheDocument();

    // Accepting is blocked until every criterion clears.
    expect(screen.getByRole("button", { name: "Accept story" })).toBeDisabled();

    // Waive the still-unverified criterion instead of fixing the test.
    const waiveButtons = screen.getAllByRole("button", { name: "Waive" });
    await user.click(waiveButtons[0]!);
    const reasonInput = screen.getByPlaceholderText(/OK to accept without a passing check/i);
    await user.type(reasonInput, "Tracked separately");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await screen.findByText(/Waived — Tracked separately/);

    const acceptButton = screen.getByRole("button", { name: "Accept story" });
    expect(acceptButton).not.toBeDisabled();
    await user.click(acceptButton);
    await screen.findByText("Accepted");

    await user.click(screen.getByRole("button", { name: "Finish & combine" }));
    await screen.findByText(/need reconciling/i, {}, { timeout: 2_000 });
    expect(screen.getByText("Needs attention")).toBeInTheDocument();

    // A retry is offered, in Product-mode vocabulary throughout.
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    assertNoBannedVocabulary();
  });

  it("switching stories keeps each one's state independent", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Run tests" }));
    await screen.findByText("3 of 3 checks passing", {}, { timeout: 3_000 });

    await user.click(screen.getByRole("tab", { name: "Legacy data import" }));
    expect(screen.getByText("No tests have run yet for this story.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Offline sync" }));
    expect(await screen.findByText("3 of 3 checks passing")).toBeInTheDocument();
  });
});
