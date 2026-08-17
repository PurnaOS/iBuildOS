import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// iBuildOS static-site template (T-012). Astro's static output mode is the
// default ("output: 'static'") — `astro build` emits plain HTML/CSS/JS to
// `dist/`, which is what the TP-003 zero-fix guarantee checks.
// `PORT` is how the app injects its allocated port (FORMATS.md §7: "`{port}`
// in `preview.url` is allocated by the app and injected as `PORT`") — honored
// here for both `astro dev` and `astro preview` via `server.port`.
const port = process.env.PORT ? Number(process.env.PORT) : 4321;

export default defineConfig({
  server: { port },
  vite: {
    plugins: [tailwindcss()],
  },
});
