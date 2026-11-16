import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'Noto Sans Khmer',
          'Khmer OS Battambang',
          'Khmer OS Siemreap',
          'Leelawadee UI',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
