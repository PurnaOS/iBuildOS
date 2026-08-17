import type { JSX } from "react";

interface StubSectionProps {
  title: string;
  note?: string | undefined;
}

/** Placeholder for nav sections beyond Overview — this scaffold builds the
 * shell (SPEC PS area) and stubs everything else per the work package's
 * scope; DESIGN-CHARTER's decree accepts agent-invented UX for what each
 * section becomes later. */
export function StubSection({ title, note }: StubSectionProps): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
      <p className="text-[13px] font-medium">{title}</p>
      <p className="max-w-xs text-[13px] text-muted-foreground">
        {note ?? "Not built yet in this scaffold."}
      </p>
    </div>
  );
}
