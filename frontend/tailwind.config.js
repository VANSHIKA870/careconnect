/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0efff',
          500: '#0070f3',
          600: '#0061d5',
          700: '#004ebd',
        }
      }
    },
  },
  plugins: [],
}
