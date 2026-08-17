import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// One minimal content collection ("posts") so the template demonstrates the
// content-collection pattern agents will extend for real projects. Kept to
// a single entry (see src/content/posts/hello-world.md).
const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
  }),
});

export const collections = { posts };
