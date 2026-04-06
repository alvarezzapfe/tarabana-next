import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "monospace"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        cream: "#F5F0E8",
        ink: "#1A1108",
        amber: {
          DEFAULT: "#C8720A",
          light: "#F0A030",
        },
        foam: "#FAF6EE",
      },
    },
  },
  plugins: [],
};

export default config;
