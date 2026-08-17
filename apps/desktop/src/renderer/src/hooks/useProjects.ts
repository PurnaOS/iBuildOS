import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateProjectInput, Project } from "../../../shared/domain.js";

const PROJECTS_KEY = ["projects"] as const;

/** PS-002: the Home project grid, backed by the mocked IPC contract. */
export function useProjects() {
  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: async () => (await window.ibuildos.projects.list()).projects,
  });
}

/** PS-004's create-project flow: name -> template -> scaffold (mocked). */
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectInput) =>
      (await window.ibuildos.projects.create(input)).project,
    onSuccess: (project) => {
      queryClient.setQueryData<Project[]>(PROJECTS_KEY, (prev) =>
        prev ? [...prev, project] : [project],
      );
    },
  });
}

export function useOpenProject(id: string | undefined) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: async () => (await window.ibuildos.projects.open({ id: id as string })).project,
    enabled: id !== undefined,
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: async () => (await window.ibuildos.templates.list()).templates,
    staleTime: Infinity,
  });
}
