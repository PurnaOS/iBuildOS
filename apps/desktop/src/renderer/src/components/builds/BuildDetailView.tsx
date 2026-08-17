import type { JSX } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Separator } from "../ui/separator.js";
import { BuildStatusBadge } from "./BuildStatusBadge.js";
import { AutonomyDialControl } from "./AutonomyDialControl.js";
import { QuestionCard } from "./QuestionCard.js";
import { SteeringInput } from "./SteeringInput.js";
import { RemediationActions } from "./RemediationActions.js";
import {
  useAnswerQuestion,
  useAutonomyDial,
  useBuild,
  useRemediateBuild,
  useSteerBuild,
} from "../../hooks/useBuilds.js";
import { STREAM_STAGE_LABEL, TESTS_STATUS_LABEL } from "../../lib/buildCopy.js";

interface BuildDetailViewProps {
  projectId: string;
  buildId: string;
  onBack: () => void;
}

const STEERABLE = new Set(["queued", "starting", "running", "paused", "waiting_question", "waiting_permission"]);

/** DESIGN-CHARTER §2's "stream watch," Product lens: stage/status/progress,
 * the autonomy dial, a question card when the build is waiting, a steering
 * box, and remediation actions when it's stopped. */
export function BuildDetailView({ projectId, buildId, onBack }: BuildDetailViewProps): JSX.Element {
  const { data: build, isLoading } = useBuild(buildId);
  const { dial, setDial, isSaving: isDialSaving } = useAutonomyDial(projectId);
  const answerQuestion = useAnswerQuestion();
  const steer = useSteerBuild();
  const remediate = useRemediateBuild();

  if (isLoading || !build) {
    return (
      <div className="flex h-full flex-col gap-4 p-4">
        <BackButton onBack={onBack} />
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const progressPercent = Math.round((build.progress.tasksDone / build.progress.tasksTotal) * 100);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <BackButton onBack={onBack} />

      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-medium">{build.storyName}</h2>
          <p className="text-[11px] text-muted-foreground">
            {build.stage ? STREAM_STAGE_LABEL[build.stage] : "Not started"} ·{" "}
            {TESTS_STATUS_LABEL[build.testsStatus]}
          </p>
        </div>
        <BuildStatusBadge status={build.status} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {build.progress.tasksDone} of {build.progress.tasksTotal} tasks done
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar"
            aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}
            aria-label="Build progress">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[13px]">{build.summary}</p>
        </CardContent>
      </Card>

      {build.status === "waiting_question" && build.question ? (
        <QuestionCard
          question={build.question}
          isAnswering={answerQuestion.isPending}
          onAnswer={(answer) =>
            answerQuestion.mutate({ streamId: build.id, questionId: build.question!.id, answer })
          }
        />
      ) : null}

      {build.status === "failed" ? (
        <RemediationActions
          reason={build.statusReason}
          isBusy={remediate.isPending}
          onRetry={() => remediate.mutate({ streamId: build.id, action: "retry" })}
          onSteer={(instruction) =>
            remediate.mutate({ streamId: build.id, action: "steer", instruction })
          }
          onAbort={() => remediate.mutate({ streamId: build.id, action: "abort" })}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>How it builds</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {dial ? <AutonomyDialControl dial={dial} onChange={setDial} disabled={isDialSaving} /> : null}
        </CardContent>
      </Card>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Send an instruction</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          <SteeringInput
            disabled={!STEERABLE.has(build.status)}
            isSending={steer.isPending}
            onSend={(instruction) => steer.mutate({ streamId: build.id, instruction })}
          />
          <Separator />
          <div className="flex flex-col gap-1" role="log" aria-live="polite" aria-label="Recent activity">
            {build.notes.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nothing sent yet.</p>
            ) : (
              build.notes.map((note, index) => (
                <p key={index} className="text-[13px] text-muted-foreground">
                  {note}
                </p>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <Button variant="ghost" size="sm" onClick={onBack} className="w-fit">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Back to Build
    </Button>
  );
}
