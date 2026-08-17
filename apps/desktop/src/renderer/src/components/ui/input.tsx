import * as React from "react";
import { cn } from "../../lib/cn.js";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-md border border-border bg-background px-2.5 text-[13px]",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-ring transition-colors duration-150 ease-out",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
