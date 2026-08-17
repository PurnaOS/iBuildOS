import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutonomyDial, RemediationAction, Stream } from "../../../shared/domain.js";

const buildsKey = (projectId: string) => ["builds", projectId] as const;
const buildKey = (id: string) => ["build", id] as const;
const dialKey = (projectId: string) => ["build-dial", projectId] as const;
const dialWaivedKey = (projectId: string) => ["build-dial-waived", projectId] as const;

/** DESIGN-CHARTER §2's Build section (product sidebar): the live list of
 * builds for a project, kept current via the streams.events subscription —
 * mirrors useActivityFeed's subscribe-and-merge pattern (../hooks/
 * useActivity.ts), but merges whole-entity updates into a list rather than
 * prepending log lines, and also seeds each build's own ["build", id] cache
 * entry so opening its detail view never shows a stale snapshot. */
export function useBuilds(projectId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: buildsKey(projectId),
    queryFn: async () => (await window.ibuildos.streams.list({ projectId })).streams,
  });

  useEffect(() => {
    const unsubscribe = window.ibuildos.streams.subscribe({ projectId }, (stream) => {
      queryClient.setQueryData<Stream[]>(buildsKey(projectId), (prev) => {
        if (!prev) return [stream];
        const index = prev.findIndex((s) => s.id === stream.id);
        if (index === -1) return [...prev, stream];
        const next = [...prev];
        next[index] = stream;
        return next;
      });
      queryClient.setQueryData<Stream>(buildKey(stream.id), stream);
    });
    return unsubscribe;
  }, [projectId, queryClient]);

  return query;
}

/** A single build's detail (BD-010: stage, status, progress, question). */
export function useBuild(id: string | undefined) {
  return useQuery({
    queryKey: buildKey(id ?? ""),
    queryFn: async () => (await window.ibuildos.streams.get({ id: id as string })).stream,
    enabled: id !== undefined,
  });
}

/** BD-004's autonomy dial, per project. */
export function useAutonomyDial(projectId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: dialKey(projectId),
    queryFn: async () => (await window.ibuildos.streams.getDial({ projectId })).dial,
  });
  const mutation = useMutation({
    mutationFn: async (dial: AutonomyDial) =>
      (await window.ibuildos.streams.setDial({ projectId, dial })).dial,
    onSuccess: (dial) => queryClient.setQueryData(dialKey(projectId), dial),
  });
  return {
    dial: query.data,
    isLoading: query.isLoading,
    setDial: mutation.mutate,
    isSaving: mutation.isPending,
  };
}

function useApplyStream() {
  const queryClient = useQueryClient();
  return (stream: Stream) => {
    queryClient.setQueryData(buildKey(stream.id), stream);
    queryClient.setQueryData<Stream[]>(buildsKey(stream.projectId), (prev) =>
      prev ? prev.map((s) => (s.id === stream.id ? stream : s)) : prev,
    );
  };
}

/** BD-012: answer a waiting build's question card. */
export function useAnswerQuestion() {
  const applyStream = useApplyStream();
  return useMutation({
    mutationFn: async (input: { streamId: string; questionId: string; answer: string }) =>
      (await window.ibuildos.streams.answerQuestion(input)).stream,
    onSuccess: applyStream,
  });
}

/** BD-008: send an instruction into a running build. */
export function useSteerBuild() {
  const applyStream = useApplyStream();
  return useMutation({
    mutationFn: async (input: { streamId: string; instruction: string }) =>
      (await window.ibuildos.streams.steer(input)).stream,
    onSuccess: applyStream,
  });
}

/** BD-013: one-click remediation (retry/steer/abort) for a stopped build. */
export function useRemediateBuild() {
  const applyStream = useApplyStream();
  return useMutation({
    mutationFn: async (input: {
      streamId: string;
      action: RemediationAction;
      instruction?: string;
    }) => (await window.ibuildos.streams.remediate(input)).stream,
    onSuccess: applyStream,
  });
}

/** D-115: builds accepted/added to the live product automatically under the
 * `auto` dial, queued here for after-the-fact review. */
export function useDialWaived(projectId: string) {
  return useQuery({
    queryKey: dialWaivedKey(projectId),
    queryFn: async () => (await window.ibuildos.streams.listDialWaived({ projectId })).items,
  });
}

export function useMarkDialWaivedReviewed(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await window.ibuildos.streams.markDialWaivedReviewed({ id })).item,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dialWaivedKey(projectId) });
    },
  });
}
