import type { JSX } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card.js";
import { Badge } from "../../ui/badge.js";
import { useTeamNotes } from "../../../hooks/useInsights.js";
import { formatRelativeTime } from "../../../lib/relativeTime.js";

interface TeamNotesViewProps {
  projectId: string;
}

const KIND_LABEL = { meeting: "Meeting", standup: "Standup" } as const;

// TM-009 (1.1, light this round): "optional, profile-toggled coordination
// types (meeting note, standup log, retro action) so team memory lives in
// the repo rather than leaking back to chat tools; teams that don't use them
// see nothing about them." Kept intentionally simple — a read-only list, no
// authoring flow yet.
export function TeamNotesView({ projectId }: TeamNotesViewProps): JSX.Element {
  const { data, isLoading } = useTeamNotes(projectId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team notes</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0">
        {isLoading || !data ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : data.notes.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">No shared notes yet.</p>
        ) : (
          data.notes.map((note) => (
            <div key={note.id} className="flex flex-col gap-1 rounded-md px-1.5 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Badge>{KIND_LABEL[note.kind]}</Badge>
                  <span className="text-[13px] font-medium">{note.title}</span>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatRelativeTime(note.occurredAt)}
                </span>
              </div>
              <p className="text-[13px] text-muted-foreground">{note.summary}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
