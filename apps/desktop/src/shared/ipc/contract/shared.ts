import { z } from "zod";

// Shared across every domain slice in this directory, so each doesn't
// redefine its own — kept in one place to avoid drift as streams/insights
// slices are added.
export const NoInput = z.undefined();
