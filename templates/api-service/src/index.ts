import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

// {port} in the contract's preview.url is allocated by iBuildOS and injected
// as PORT (FORMATS.md §7) — falls back to 3000 for a bare `pnpm dev`.
const port = Number(process.env.PORT ?? 3000);
const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api-service listening on http://localhost:${info.port}`);
});
