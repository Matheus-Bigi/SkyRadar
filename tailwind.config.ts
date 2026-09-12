import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        radar: {
          bg: "#05080a",
          panel: "#0a1210",
          panelborder: "#1c2b26",
          green: "#33ff99",
          greendim: "#1f7a55",
          amber: "#e0a840",
          mil: "#c9d6de",
          text: "#d7e6e1",
          textdim: "#7d938c",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["Roboto Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 12px rgba(51,255,153,0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
