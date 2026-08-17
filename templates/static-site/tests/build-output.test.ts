import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// TP-003 (zero-fix guarantee): a real build-output assertion, not a
// tautology. `pnpm test` runs `astro build` first (see package.json's
// `pretest` script), then this suite checks the static output Astro
// actually wrote to `dist/` — the homepage, the one content-collection
// page, and that Tailwind's generated stylesheet is present and non-empty.

const distDir = fileURLToPath(new URL("../dist/", import.meta.url));

function readDist(relativePath: string): string {
  const path = `${distDir}${relativePath}`;
  if (!existsSync(path)) {
    throw new Error(`expected build output at ${path} — did \`astro build\` run?`);
  }
  return readFileSync(path, "utf-8");
}

describe("static build output", () => {
  it("renders the homepage with its heading", () => {
    const html = readDist("index.html");
    expect(html).toContain("Your new static site");
  });

  it("renders the content-collection post page", () => {
    const html = readDist("posts/hello-world/index.html");
    expect(html).toContain("Hello, iBuildOS");
    // Astro HTML-escapes the apostrophe in "template's" as `&#39;` — assert
    // around it rather than embedding a literal apostrophe in the fixture.
    expect(html).toContain("The first post in this template");
    expect(html).toContain("content collection.");
  });

  it("links a non-empty Tailwind-generated stylesheet from the homepage", () => {
    const html = readDist("index.html");
    const match = html.match(/href="(\/_astro\/[^"]+\.css)"/);
    expect(match, "expected a linked /_astro/*.css stylesheet in index.html").not.toBeNull();

    const cssPath = match![1]!.replace(/^\//, "");
    const css = readDist(cssPath);
    expect(css.length).toBeGreaterThan(0);
    // Spot-check a couple of the utility classes used on the homepage/layout
    // actually got generated into the stylesheet (proves Tailwind is wired
    // in, not just imported).
    expect(css).toMatch(/\.bg-sky-500/);
    expect(css).toMatch(/\.text-4xl/);
  });
});
