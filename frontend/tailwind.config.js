/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sky-blue': '#87CEEB',
        'charcoal': '#1c1c1c',
        'dark-gray': '#2a2a2a',
        'light-gray': '#3a3a3a',
      },
      fontFamily: {
        'sans': ['Inter', 'Poppins', 'SF Pro', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

