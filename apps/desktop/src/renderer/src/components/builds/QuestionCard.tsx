import { useState, type JSX } from "react";
import { HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import type { StreamQuestion } from "../../../../shared/domain.js";

interface QuestionCardProps {
  question: StreamQuestion;
  onAnswer: (answer: string) => void;
  isAnswering?: boolean | undefined;
}

/** BD-012/GU-005: "the stream shall enter a waiting state, surface the
 * question through generative UI ... and resume on answer." Fixed choices
 * render as buttons; a question without `options` falls back to a free-text
 * box (still a decision card, just an open one). */
export function QuestionCard({ question, onAnswer, isAnswering }: QuestionCardProps): JSX.Element {
  const [freeText, setFreeText] = useState("");

  return (
    <Card className="border-state-blocked">
      <CardHeader className="flex-row items-start gap-2 space-y-0">
        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-blocked" aria-hidden />
        <div className="flex flex-col gap-1">
          <CardTitle>Needs your answer to continue</CardTitle>
          <p className="text-[13px]">{question.prompt}</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {question.options ? (
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant="outline"
                disabled={isAnswering}
                onClick={() => onAnswer(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = freeText.trim();
              if (!trimmed) return;
              onAnswer(trimmed);
              setFreeText("");
            }}
          >
            <Input
              value={freeText}
              onChange={(event) => setFreeText(event.target.value)}
              placeholder="Type your answer"
              aria-label="Your answer"
              disabled={isAnswering}
            />
            <Button type="submit" size="sm" disabled={isAnswering || freeText.trim().length === 0}>
              Answer
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
