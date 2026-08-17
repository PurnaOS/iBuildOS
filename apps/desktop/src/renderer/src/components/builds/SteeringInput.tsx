import { useState, type JSX } from "react";
import { Send } from "lucide-react";
import { Input } from "../ui/input.js";
import { Button } from "../ui/button.js";

interface SteeringInputProps {
  onSend: (instruction: string) => void;
  isSending?: boolean | undefined;
  disabled?: boolean | undefined;
}

/** BD-008: "The user shall be able to send instructions into any running
 * stream's session ... visible in the transcript, without restarting the
 * stream." This is that box — the build's notes list (rendered by the
 * caller) is the Product-mode substitute for "the transcript." */
export function SteeringInput({ onSend, isSending, disabled }: SteeringInputProps): JSX.Element {
  const [instruction, setInstruction] = useState("");

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = instruction.trim();
        if (!trimmed) return;
        onSend(trimmed);
        setInstruction("");
      }}
    >
      <Input
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder="Tell it something, e.g. “use the existing date utils”"
        aria-label="Send an instruction"
        disabled={disabled || isSending}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={disabled || isSending || instruction.trim().length === 0}
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
        Send
      </Button>
    </form>
  );
}
