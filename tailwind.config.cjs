/** @type {import('tailwindcss').Config} */
// Mirrors the tokens in src/index.css — see docs/BRAND_GUIDE.md.
// Every accent is sampled from the real logo, not from the cover art.
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wage: {
          ink: '#06090B',
          'ink-2': '#0B1014',
          panel: '#11171C',
          'panel-2': '#182027',
          line: '#212A31',
          'line-hi': '#313D47',
          paper: '#F4F7F9',
          muted: '#8B98A3',
          'muted-2': '#5C6771',

          amber: '#FC9000',
          'amber-2': '#FFAA33',
          red: '#E43000',
          chrome: '#E4E4E8',
          silver: '#E4E4E8',

          success: '#34D399',
          warning: '#E8A317',
          error: '#E5484D',

          // aliases kept so un-migrated components keep compiling
          gold: '#FC9000',
          ember: '#E43000',
          cyan: '#E4E4E8',
          violet: '#FFAA33',
          orange: '#FC9000',
          bg: '#06090B',
          border: '#212A31',
        },
      },
      fontFamily: {
        display: ['"Archivo Black"', 'Bahnschrift', 'Impact', 'sans-serif'],
        body: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
