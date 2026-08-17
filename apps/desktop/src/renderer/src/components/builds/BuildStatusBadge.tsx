import type { JSX } from "react";
import {
  Ban,
  CheckCircle2,
  Clock,
  HelpCircle,
  KeyRound,
  Loader2,
  Pause,
  Shuffle,
} from "lucide-react";
import { cn } from "../../lib/cn.js";
import { STREAM_STATUS_LABEL, STREAM_STATUS_TONE } from "../../lib/buildCopy.js";
import { Badge } from "../ui/badge.js";
import type { StreamStatus } from "../../../../shared/domain.js";

const TONE_CLASS: Record<string, string> = {
  done: "text-state-done",
  active: "text-state-active",
  blocked: "text-state-blocked",
  ready: "text-state-ready",
  draft: "text-state-draft",
};

const STATUS_ICON: Record<StreamStatus, typeof Clock> = {
  queued: Clock,
  starting: Loader2,
  running: Loader2,
  paused: Pause,
  waiting_question: HelpCircle,
  waiting_permission: KeyRound,
  review: CheckCircle2,
  superseded: Shuffle,
  aborted: Ban,
  failed: HelpCircle,
  done: CheckCircle2,
};

/** DESIGN-CHARTER §1: "State is never color-alone (icon + label always)." —
 * the same pairing as ../ui/badge.tsx's StatusBadge, applied to a build's
 * status (never the raw StreamStatus string; always via STREAM_STATUS_LABEL,
 * DESIGN-CHARTER §4's glossary). */
export function BuildStatusBadge({ status }: { status: StreamStatus }): JSX.Element {
  const Icon = STATUS_ICON[status];
  const spinning = status === "starting" || status === "running";
  return (
    <Badge>
      <Icon className={cn("h-3 w-3", TONE_CLASS[STREAM_STATUS_TONE[status]], spinning && "animate-spin")} />
      {STREAM_STATUS_LABEL[status]}
    </Badge>
  );
}
