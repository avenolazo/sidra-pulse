/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./web/index.html",
    "./web/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: "#0a0c10",
          card: "rgba(22, 28, 38, 0.65)",
          emerald: "#10b981",
          gold: "#f59e0b",
          border: "rgba(255, 255, 255, 0.08)",
          textMuted: "#9ca3af"
        }
      },
      backdropBlur: {
        xs: "2px",
      }
    },
  },
  plugins: [],
};
