import { type JSX, useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { cn } from "../../lib/cn.js";
import { useCreateProject, useTemplates } from "../../hooks/useProjects.js";
import type { TemplateId } from "../../../../shared/domain.js";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (projectId: string) => void;
}

type Step = "name" | "template";

// PS-004: "Creating a project shall offer: name -> template choice (TP) ->
// agent connection (AC) -> scaffold + initial commit — producing a valid,
// buildable project without any file or git operation performed by the
// user." The agent-connection step is AC-002/T-005 territory (ACP adapter
// picker, M3) — out of scope for this scaffold, which covers name ->
// template -> scaffold against the in-memory fake (see README's scope note).
export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateProjectDialogProps): JSX.Element {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<TemplateId | undefined>(undefined);
  const { data: templates } = useTemplates();
  const createProject = useCreateProject();

  function reset(): void {
    setStep("name");
    setName("");
    setTemplate(undefined);
    createProject.reset();
  }

  function handleOpenChange(next: boolean): void {
    onOpenChange(next);
    if (!next) reset();
  }

  async function handleCreate(): Promise<void> {
    if (!template) return;
    const project = await createProject.mutateAsync({ name, template });
    onCreated(project.id);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            {step === "name" ? "Give your project a name." : "Choose a starting point."}
          </DialogDescription>
        </DialogHeader>

        <div className="p-4">
          {step === "name" ? (
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Equipment Inspections"
              aria-label="Project name"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) setStep("template");
              }}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {(templates ?? []).map((option) => {
                const selected = option.id === template;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTemplate(option.id)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors duration-150 ease-out",
                      selected ? "border-accent bg-muted" : "border-border hover:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        selected ? "border-accent bg-accent text-accent-foreground" : "border-border",
                      )}
                    >
                      {selected ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[13px] font-medium">{option.name}</span>
                      <span className="text-[11px] text-muted-foreground">{option.summary}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {createProject.isError ? (
            <p role="alert" className="mt-2 text-[11px] text-destructive">
              {createProject.error instanceof Error
                ? createProject.error.message
                : "Something went wrong."}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          {step === "template" ? (
            <Button variant="outline" onClick={() => setStep("name")}>
              Back
            </Button>
          ) : null}
          {step === "name" ? (
            <Button onClick={() => setStep("template")} disabled={!name.trim()}>
              Next
            </Button>
          ) : (
            <Button onClick={() => void handleCreate()} disabled={!template || createProject.isPending}>
              {createProject.isPending ? "Creating…" : "Create project"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
