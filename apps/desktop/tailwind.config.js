/** @type {import('tailwindcss').Config} */
// DESIGN-CHARTER.md §1 tokens: shadcn/ui-on-Radix base, Linear-class compact
// density (13px base type set on body — NOT html's root, so the rem-based 4px
// spacing scale below stays a true 4px grid), 1px hairline borders over
// shadows, neutral gray ramp + one accent color, light+dark from day one.
export default {
  darkMode: ["class"],
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        // Semantic artifact-state buckets (DESIGN-CHARTER §1) — computed from
        // the profile, never the only signal (icon + label always pair with these).
        state: {
          done: "hsl(var(--state-done))",
          active: "hsl(var(--state-active))",
          blocked: "hsl(var(--state-blocked))",
          ready: "hsl(var(--state-ready))",
          draft: "hsl(var(--state-draft))",
        },
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
      },
      fontSize: {
        base: ["13px", { lineHeight: "20px" }],
        reading: ["15px", { lineHeight: "24px" }],
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      transitionTimingFunction: {
        DEFAULT: "ease-out",
      },
    },
  },
  plugins: [],
};
