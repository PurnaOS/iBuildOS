import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button.js";

describe("Button", () => {
  it("renders its label and forwards a click", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Accept story</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Accept story" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Create project
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
