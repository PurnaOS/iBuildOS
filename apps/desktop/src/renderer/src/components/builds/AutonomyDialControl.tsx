import type { JSX } from "react";
import { cn } from "../../lib/cn.js";
import { AUTONOMY_DIAL_DESCRIPTION, AUTONOMY_DIAL_LABEL } from "../../lib/buildCopy.js";
import { AUTONOMY_DIALS, type AutonomyDial } from "../../../../shared/domain.js";

interface AutonomyDialControlProps {
  dial: AutonomyDial;
  onChange: (dial: AutonomyDial) => void;
  disabled?: boolean | undefined;
}

/** BD-004's autonomy dial (SPEC.md §7.1: "She sets the autonomy dial to
 * cruise"). Same tablist pattern as ../layout/ModeSwitch.tsx, three-way
 * instead of two. `step`/`cruise`/`auto` are the product's own chosen names
 * (not engineering jargon), so they're shown as-is. */
export function AutonomyDialControl({ dial, onChange, disabled }: AutonomyDialControlProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="tablist"
        aria-label="Autonomy dial"
        className="inline-flex items-center rounded-md border border-border p-0.5 text-[13px]"
      >
        {AUTONOMY_DIALS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={dial === option}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-[5px] px-2.5 py-1 transition-colors duration-150 ease-out",
              "disabled:pointer-events-none disabled:opacity-50",
              dial === option
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {AUTONOMY_DIAL_LABEL[option]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{AUTONOMY_DIAL_DESCRIPTION[dial]}</p>
    </div>
  );
}
