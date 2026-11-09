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
          50: "#eaf0f7",
          100: "#d8e2ee",
          500: "#173b63",
          600: "#0A192F",
          700: "#071426",
          900: "#050e1c"
        }
      },
      boxShadow: {
        panel: "0 14px 40px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
