import * as React from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "../../lib/cn.js";
import type { ChecksStatus } from "../../../../shared/domain.js";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        className,
      )}
      {...props}
    />
  );
}

const CHECKS_STATUS_META: Record<
  ChecksStatus,
  { label: string; dotClass: string; Icon: typeof CheckCircle2 }
> = {
  ready: { label: "Ready", dotClass: "text-state-ready", Icon: CheckCircle2 },
  "needs-attention": { label: "Needs attention", dotClass: "text-state-blocked", Icon: AlertCircle },
  "in-progress": { label: "In progress", dotClass: "text-state-active", Icon: Loader2 },
};

/** DESIGN-CHARTER §1: "State is never color-alone (icon + label always)." */
export function StatusBadge({ status }: { status: ChecksStatus }): React.JSX.Element {
  const meta = CHECKS_STATUS_META[status];
  const Icon = meta.Icon;
  return (
    <Badge>
      <Icon className={cn("h-3 w-3", meta.dotClass, status === "in-progress" && "animate-spin")} />
      {meta.label}
    </Badge>
  );
}
