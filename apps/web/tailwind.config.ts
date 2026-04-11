import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Legacy tokens (backwards compat)
        navy: {
          deep: "#0A1628",
          darker: "#091829",
        },
        gold: {
          DEFAULT: "#C9A84C",
          primary: "#C9A84C",
          light: "#D4B460",
        },
        ivory: "#F5F0E8",
        // COVA V1 token system
        "cova-bg": "var(--cova-bg)",
        "cova-surface": "var(--cova-surface)",
        "cova-surface-2": "var(--cova-surface-2)",
        "cova-surface-3": "var(--cova-surface-3)",
        "cova-gold": "var(--cova-gold)",
        "cova-gold-light": "var(--cova-gold-light)",
        "cova-gold-dim": "var(--cova-gold-dim)",
        "cova-ivory": "var(--cova-ivory)",
        "cova-ivory-dim": "var(--cova-ivory-dim)",
        "cova-muted": "var(--cova-muted)",
        "cova-subtle": "var(--cova-subtle)",
        "cova-border": "var(--cova-border)",
        "cova-border-gold": "var(--cova-border-gold)",
        "cova-border-dim": "var(--cova-border-dim)",
        "cova-success": "var(--cova-success)",
        "cova-error": "var(--cova-error)",
        "cova-warning": "var(--cova-warning)",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Palatino Linotype", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        playfair: ["var(--font-playfair)", "Georgia", "serif"],
        "dm-sans": ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
