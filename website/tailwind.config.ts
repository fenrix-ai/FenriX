import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0d10',
        surface: '#14181d',
        'surface-raised': '#1c2128',
        ink: '#e7ecf2',
        'ink-dim': '#8b95a3',
        cyan: { DEFAULT: '#0099ff', soft: '#66ccff' },
        coral: '#ff6b4a',
        success: '#00d18a'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      letterSpacing: { tightish: '-0.02em', tighter2: '-0.04em' },
      maxWidth: { content: '1200px' },
      keyframes: {
        eyePulse: {
          '0%, 100%': { opacity: '0.6', filter: 'drop-shadow(0 0 4px #0099ff)' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 14px #0099ff)' }
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'eye-pulse': 'eyePulse 4s ease-in-out infinite',
        'fade-up': 'fadeUp 0.6s ease-out forwards'
      }
    }
  },
  plugins: []
}
export default config
