import type { JSX } from "react";
import { cn } from "../../lib/cn.js";
import type { Mode } from "../../lib/nav.js";

interface ModeSwitchProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

/** DESIGN-CHARTER §2: "Mode switch: PRODUCT ⇄ ENGINEERING (⌘E, per-user,
 * per-project)." SPEC PS-003: "Every project shall offer Product mode and
 * Engineering mode as first-class, instantly switchable projections of the
 * same underlying model" — a preference, never a permission. */
export function ModeSwitch({ mode, onChange }: ModeSwitchProps): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="Mode"
      className="inline-flex items-center rounded-md border border-border p-0.5 text-[13px]"
    >
      {(["product", "engineering"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={mode === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 capitalize transition-colors duration-150 ease-out",
            mode === option
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
