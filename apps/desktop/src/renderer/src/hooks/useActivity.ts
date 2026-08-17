import { useEffect, useState } from "react";
import type { ActivityEvent } from "../../../shared/domain.js";

interface Params {
  projectId?: string | undefined;
}

/** PS-008 live activity surface: subscribes to the "activity.events" IPC
 * channel and keeps a bounded, newest-first feed in local state. */
export function useActivityFeed({ projectId }: Params = {}, limit = 20): ActivityEvent[] {
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    const unsubscribe = window.ibuildos.activity.subscribe(
      projectId ? { projectId } : undefined,
      (event) => setEvents((prev) => [event, ...prev].slice(0, limit)),
    );
    return unsubscribe;
  }, [projectId, limit]);

  return events;
}

/** PS-009 attention queue: initial snapshot via `attention.list`, then kept
 * live by the same subscription channel, filtered to needsAttention events. */
export function useAttentionQueue({ projectId }: Params = {}): ActivityEvent[] {
  const [items, setItems] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    setItems([]);

    void window.ibuildos.attention.list(projectId ? { projectId } : undefined).then((res) => {
      if (!cancelled) setItems(res.items);
    });

    const unsubscribe = window.ibuildos.activity.subscribe(
      projectId ? { projectId } : undefined,
      (event) => {
        if (event.needsAttention) setItems((prev) => [event, ...prev]);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId]);

  return items;
}
