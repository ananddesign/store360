import type { Config } from 'tailwindcss';

/**
 * QWEEN visual language — restrained dark environment, elegant typography,
 * subtle metallic / diamond-inspired accents. Keep the palette small so the
 * brand can be re-skinned from one place.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        qween: {
          // Deep, near-black showroom backdrop.
          void: '#0a0a0b',
          ink: '#111113',
          panel: '#17171a',
          // Warm champagne / metallic gold accent.
          gold: '#c9a15a',
          'gold-soft': '#e4cd9a',
          // Cool diamond highlight.
          diamond: '#d8e6ef',
          mist: '#8a8a92',
          line: 'rgba(201,161,90,0.28)',
        },
      },
      fontFamily: {
        // Uses the CSS variables wired in app/layout.tsx.
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        brand: '0.28em',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        shimmer: {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 600ms ease forwards',
        shimmer: 'shimmer 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
