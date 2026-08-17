import type { JSX } from "react";
import { CheckCircle2, Circle, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { useRerunCase, useStartTestRun, useTestRun } from "../../hooks/useVerification.js";
import type { TestCaseResult, TestCaseStatus, TestRunStatus } from "../../../../shared/ipc/contract/verification.js";

interface TestResultsViewProps {
  targetId: string;
}

const CASE_ICON: Record<TestCaseStatus, typeof CheckCircle2> = {
  pending: Circle,
  running: Loader2,
  passed: CheckCircle2,
  failed: XCircle,
};

const CASE_LABEL: Record<TestCaseStatus, string> = {
  pending: "Waiting to run",
  running: "Running",
  passed: "Passed",
  failed: "Failed",
};

const RUN_LABEL: Record<TestRunStatus, string> = {
  pending: "Waiting to start",
  running: "Running",
  passed: "All checks passed",
  failed: "Some checks failed",
};

// TX-001/TX-002/TX-003/TX-004: run automated checks bound to a story from
// the UI, watch them go pending -> running -> passed/failed per case, and
// re-run a failed one individually without re-running the whole suite.
export function TestResultsView({ targetId }: TestResultsViewProps): JSX.Element {
  const { data: run, isLoading } = useTestRun(targetId);
  const startRun = useStartTestRun(targetId);
  const rerunCase = useRerunCase(targetId);

  const passedCount = run?.cases.filter((c) => c.status === "passed").length ?? 0;
  const totalCount = run?.cases.length ?? 0;
  const busy = startRun.isPending || run?.status === "pending" || run?.status === "running";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Tests</CardTitle>
        <Button size="sm" onClick={() => startRun.mutate()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Run tests
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isLoading ? (
          <p className="text-[13px] text-muted-foreground">Checking for a previous run…</p>
        ) : !run ? (
          <p className="text-[13px] text-muted-foreground">No tests have run yet for this story.</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge>
                {totalCount === 0 ? "No checks yet" : `${passedCount} of ${totalCount} checks passing`}
              </Badge>
              <span className="text-[11px] text-muted-foreground">{RUN_LABEL[run.status]}</span>
            </div>
            <ul className="flex flex-col gap-0.5">
              {run.cases.map((testCase) => (
                <TestCaseRow
                  key={testCase.id}
                  testCase={testCase}
                  onRerun={() => rerunCase.mutate(testCase.id)}
                  rerunning={rerunCase.isPending && rerunCase.variables === testCase.id}
                />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TestCaseRow({
  testCase,
  onRerun,
  rerunning,
}: {
  testCase: TestCaseResult;
  onRerun: () => void;
  rerunning: boolean;
}): JSX.Element {
  const Icon = CASE_ICON[testCase.status];
  return (
    <li className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
      <Icon
        className={
          "h-3.5 w-3.5 shrink-0 " +
          (testCase.status === "passed"
            ? "text-state-done"
            : testCase.status === "failed"
              ? "text-state-blocked"
              : testCase.status === "running"
                ? "animate-spin text-state-active"
                : "text-muted-foreground")
        }
        aria-hidden
      />
      <div className="flex flex-1 flex-col">
        <span className="text-[13px]">{testCase.name}</span>
        <span className="text-[11px] text-muted-foreground">
          {CASE_LABEL[testCase.status]}
          {testCase.detail ? ` — ${testCase.detail}` : ""}
        </span>
      </div>
      {testCase.status === "failed" ? (
        <Button size="sm" variant="ghost" onClick={onRerun} disabled={rerunning}>
          {rerunning ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3 w-3" aria-hidden />
          )}
          Run again
        </Button>
      ) : null}
    </li>
  );
}
