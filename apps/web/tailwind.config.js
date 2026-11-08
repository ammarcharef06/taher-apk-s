/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Noto Sans Arabic", "system-ui", "sans-serif"]
      },
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          500: "#2764d8",
          600: "#1e50b5",
          700: "#1d4291",
          900: "#172b58"
        }
      },
      boxShadow: {
        panel: "0 14px 40px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
