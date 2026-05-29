import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#0b0d12", 900: "#0f1115", 800: "#151823", 700: "#1e2230", 600: "#2a2f3d" },
        accent: { root: "#7b8aa8", sub: "#c79a3a", tool: "#52a888", err: "#d8585e" },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
