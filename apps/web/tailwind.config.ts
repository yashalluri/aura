import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        aura: {
          purple: "#8B5CF6",
          pink: "#EC4899",
          dark: "#0A0A0F",
          card: "#141420",
          border: "#1E1E2E",
        },
      },
    },
  },
  plugins: [],
};

export default config;
