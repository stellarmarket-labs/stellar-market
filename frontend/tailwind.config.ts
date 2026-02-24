import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        stellar: {
          blue: "#3E54CF",
          purple: "#7B61FF",
        },
        theme: {
          bg: "var(--bg-main)",
          card: "var(--bg-card)",
          border: "var(--border)",
          text: "var(--text-muted)",
          heading: "var(--text-heading)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
