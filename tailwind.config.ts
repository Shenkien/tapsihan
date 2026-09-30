import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tapsihan brand — matched to the KUY'S Tapsihan kiosk design system:
        // #760000 maroon, #520000 deep maroon, #FFC800 yellow, #FFF8EF cream,
        // #F7EBDD warm cream, #241414 dark text, #6F5550 muted text, #E2CFC1 border.
        leaf: {
          900: "#760000",
          700: "#520000",
        },
        rice: {
          50: "#fff8ef",
          100: "#f7ebdd",
        },
        achuete: {
          600: "#760000",
          700: "#520000",
        },
        turmeric: {
          500: "#ffc800",
        },
        charcoal: {
          900: "#241414",
        },
        danger: "#c52020",
        success: {
          bg: "#e7f0e5",
          text: "#2b4f3d",
        },
        border: "#e2cfc1",
        background: "#fff8ef",
        foreground: "#241414",
        primary: {
          DEFAULT: "#760000",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#520000",
          foreground: "#fff8ef",
        },
        muted: {
          DEFAULT: "#f7ebdd",
          foreground: "#6f5550",
        },
        accent: {
          DEFAULT: "#ffc800",
          foreground: "#241414",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        marker: ["var(--font-marker)", "cursive"],
      },
      borderRadius: {
        DEFAULT: "18px",
      },
      boxShadow: {
        brand: "0 12px 30px -12px rgba(139, 0, 0, 0.35)",
      },
      backgroundImage: {
        "brand-dots": "radial-gradient(rgba(139, 0, 0, 0.07) 1px, transparent 1px)",
      },
      backgroundSize: {
        "brand-dots": "22px 22px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
