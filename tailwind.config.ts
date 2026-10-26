import type { Config } from "tailwindcss";

export default {
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        oled: "#000000",
        surface: {
          DEFAULT: "#0c0c0c",
          2: "#141414",
          hover: "#161616",
        },
        line: {
          DEFAULT: "#222222",
          strong: "#333333",
        },
        body: "#a3a3a3",
        muted: "#737373",
        subtle: "#525252",
      },
      fontFamily: {
        sans: ["'DM Sans'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["'Manrope'", "sans-serif"],
      },
      keyframes: {
        "pulse-monochrome": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.35", transform: "scale(0.82)" },
        },
        "post-slide-in": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-mono": "pulse-monochrome 2.2s ease-in-out infinite",
        "slide-in": "post-slide-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
    },
  },
  plugins: [],
} satisfies Config;
