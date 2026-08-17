import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui's standard class-merge helper — own components, own utility. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
