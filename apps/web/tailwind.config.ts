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
        navy: {
          deep: "#0B1F3A",
          darker: "#091829",
        },
        gold: {
          DEFAULT: "#C9A84C",
          primary: "#C9A84C",
          light: "#D4B460",
        },
        ivory: "#F5F0E8",
      },
      fontFamily: {
        serif: [
          "var(--font-serif)",
          "Palatino Linotype",
          "Book Antiqua",
          "Palatino",
          "Georgia",
          "serif",
        ],
      },
    },
  },
  plugins: [],
};
export default config;
