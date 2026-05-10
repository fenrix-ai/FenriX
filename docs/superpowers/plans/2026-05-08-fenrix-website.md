# FenriX Marketing Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-page marketing site for FenriX at `website/`, with a non-functional Bakery Bash demo at `/demo/bakery-bash`, deployed as a second Firebase Hosting site under the existing `bakery-bash-54d12` project.

**Architecture:** Vite + React 19 + TypeScript + Tailwind CSS application living at `website/` in this repo. React Router v7 for `/` (long-scroll homepage) and `/demo/bakery-bash`. Static content in `src/data/*.ts`. The contact form is the only dynamic write — it uses a lazy-loaded Firebase Web SDK to push docs into a new `contact_submissions` Firestore collection. The website's `firebase.json` is scoped to its own hosting target; the existing Bakery Bash deploy is untouched.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind CSS v3.4, React Router v7, Firebase Web SDK v12, Vitest, react-hook-form, Zod, lucide-react, `@fontsource/inter`, `@fontsource/space-grotesk`, `@fontsource/jetbrains-mono`.

**Spec:** [docs/superpowers/specs/2026-05-08-fenrix-website-design.md](../specs/2026-05-08-fenrix-website-design.md)

---

## Phase 1 — Foundation

### Task 1: Scaffold the project

**Files:**
- Create: `website/package.json`
- Create: `website/tsconfig.json`
- Create: `website/tsconfig.app.json`
- Create: `website/tsconfig.node.json`
- Create: `website/vite.config.ts`
- Create: `website/index.html`
- Create: `website/src/main.tsx`
- Create: `website/src/App.tsx`
- Create: `website/src/vite-env.d.ts`

- [ ] **Step 1: Create the directory and run npm init**

```bash
mkdir -p website && cd website
```

- [ ] **Step 2: Write `website/package.json`**

```json
{
  "name": "fenrix-website",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^6.0.0",
    "typescript": "~5.6.0",
    "vite": "^7.0.0"
  }
}
```

- [ ] **Step 3: Write `website/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 }
})
```

(Port 5174 so it doesn't collide with Bakery Bash's 5173.)

- [ ] **Step 4: Write `website/tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 5: Write `website/tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Write `website/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 7: Write `website/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/fenrix-logo.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="FenriX is a student-run AI studio at Chapman University, building competitive analytics games that teach by playing them." />
    <title>FenriX — Gamifying the classroom with AI.</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Write `website/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 9: Write `website/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 10: Write `website/src/App.tsx`** (placeholder, real router in Task 3)

```tsx
export function App() {
  return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>FenriX scaffold up.</div>
}
```

- [ ] **Step 11: Create empty `website/src/styles/globals.css`** (filled in Task 2)

```bash
mkdir -p website/src/styles && echo "" > website/src/styles/globals.css
```

- [ ] **Step 12: Install dependencies**

```bash
cd website && npm install
```

Expected: dependencies install cleanly, no peer-dep errors blocking startup.

- [ ] **Step 13: Verify dev server starts**

Use the preview tool to start the dev server. The page should show "FenriX scaffold up."

- [ ] **Step 14: Commit**

```bash
git add website/
git commit -m "feat(website): scaffold Vite + React + TS app"
```

---

### Task 2: Tailwind, design tokens, fonts

**Files:**
- Create: `website/tailwind.config.ts`
- Create: `website/postcss.config.js`
- Modify: `website/src/styles/globals.css`
- Modify: `website/package.json` (add deps)

- [ ] **Step 1: Install Tailwind, PostCSS, fonts, lucide-react**

```bash
cd website && npm install -D tailwindcss@^3.4 postcss@^8.4 autoprefixer@^10.4
cd website && npm install @fontsource/inter @fontsource/space-grotesk @fontsource/jetbrains-mono lucide-react
```

- [ ] **Step 2: Initialize Tailwind config**

Skip `npx tailwindcss init` — write the config manually for ESM/TS support.

Write `website/tailwind.config.ts`:

```ts
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
```

- [ ] **Step 3: Write `website/postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
}
```

- [ ] **Step 4: Replace `website/src/styles/globals.css`** with full content

```css
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/500.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/inter/700.css';
@import '@fontsource/space-grotesk/500.css';
@import '@fontsource/space-grotesk/700.css';
@import '@fontsource/jetbrains-mono/400.css';
@import '@fontsource/jetbrains-mono/500.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html { color-scheme: dark; }
  body {
    @apply bg-bg text-ink font-sans antialiased;
    font-feature-settings: 'cv11', 'ss01';
  }
  ::selection {
    @apply bg-cyan/30 text-ink;
  }
  *:focus-visible {
    @apply outline-none ring-2 ring-cyan ring-offset-2 ring-offset-bg rounded-sm;
  }
}

@layer components {
  .container-page {
    @apply mx-auto w-full max-w-content px-6 md:px-10;
  }
  .reveal {
    @apply opacity-0 translate-y-3 transition-all duration-700 ease-out;
  }
  .reveal.is-visible {
    @apply opacity-100 translate-y-0;
  }
  @media (prefers-reduced-motion: reduce) {
    .reveal { @apply opacity-100 translate-y-0 transition-none; }
    .animate-eye-pulse { animation: none !important; }
  }
}
```

- [ ] **Step 5: Update `website/src/App.tsx`** to verify Tailwind works

```tsx
export function App() {
  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center">
      <h1 className="font-display text-5xl tracking-tightish">
        Fenri<span className="text-cyan">X</span>
      </h1>
    </div>
  )
}
```

- [ ] **Step 6: Verify in browser**

Reload preview. Expected: dark background, large "FenriX" with cyan X, Space Grotesk font.

- [ ] **Step 7: Commit**

```bash
git add website/
git commit -m "feat(website): add Tailwind, design tokens, fonts"
```

---

### Task 3: Routing + page shells

**Files:**
- Create: `website/src/pages/Home.tsx`
- Create: `website/src/pages/DemoBakeryBash.tsx`
- Modify: `website/src/App.tsx`

- [ ] **Step 1: Write `website/src/pages/Home.tsx`** (placeholder)

```tsx
export function Home() {
  return (
    <main>
      <section className="container-page py-32">
        <h1 className="font-display text-6xl tracking-tighter2">FenriX home (placeholder)</h1>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Write `website/src/pages/DemoBakeryBash.tsx`** (placeholder)

```tsx
import { Link } from 'react-router-dom'

export function DemoBakeryBash() {
  return (
    <main className="min-h-screen container-page py-16">
      <Link to="/" className="text-ink-dim hover:text-cyan">← Back to FenriX</Link>
      <h1 className="font-display text-5xl mt-8">Bakery Bash demo (placeholder)</h1>
    </main>
  )
}
```

- [ ] **Step 3: Replace `website/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { DemoBakeryBash } from './pages/DemoBakeryBash'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/demo/bakery-bash" element={<DemoBakeryBash />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 4: Verify both routes render**

Reload preview, then navigate to `/demo/bakery-bash`. Both should show their placeholder text.

- [ ] **Step 5: Commit**

```bash
git add website/
git commit -m "feat(website): add router and page shells"
```

---

## Phase 2 — Shared chrome (Logo, Nav, Footer, primitives)

### Task 4: Logo + StatusPill primitives

**Files:**
- Create: `website/public/fenrix-logo.svg`
- Create: `website/src/components/Logo.tsx`
- Create: `website/src/components/StatusPill.tsx`

- [ ] **Step 1: Save the FenriX wolf logo to `website/public/fenrix-logo.svg`**

The logo provided in the prompt is a polygonal wolf head with a cyan eye. For v1, hand-craft an SVG approximation in `Logo.tsx` (Step 2) — the public `.svg` is just for the favicon and OG previews. Use a placeholder simple SVG; replace with the real artwork file once exported from the source.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0b0d10"/>
  <polygon points="8,40 32,8 56,40 32,56" fill="#14181d" stroke="#e7ecf2" stroke-width="1.5"/>
  <circle cx="42" cy="28" r="3" fill="#0099ff"/>
</svg>
```

- [ ] **Step 2: Write `website/src/components/Logo.tsx`** — inline SVG with animated eye

```tsx
type Props = { className?: string; size?: number }

export function Logo({ className = '', size = 40 }: Props) {
  return (
    <svg
      role="img"
      aria-label="FenriX logo"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      <g fill="none" stroke="#e7ecf2" strokeWidth="1.2" strokeLinejoin="round">
        <polygon points="6,52 26,18 46,8 66,16 84,30 94,54 78,78 56,90 30,86 14,72" fill="#1c2128" />
        <polyline points="6,52 26,40 26,18" />
        <polyline points="26,40 46,30 46,8" />
        <polyline points="46,30 66,30 66,16" />
        <polyline points="66,30 84,42 84,30" />
        <polyline points="46,30 56,52 78,50 84,42" />
        <polyline points="56,52 56,72 30,86" />
        <polyline points="56,72 78,78" />
      </g>
      <circle cx="74" cy="38" r="3.6" fill="#0099ff" className="animate-eye-pulse" />
    </svg>
  )
}
```

(The polygon path approximates the source artwork. When the team exports a clean SVG from the original file, swap the `<g>` contents — `Logo` API stays the same.)

- [ ] **Step 3: Write `website/src/components/StatusPill.tsx`**

```tsx
type Status = 'live' | 'in-development' | 'concept'
type Props = { status: Status; className?: string }

const config: Record<Status, { label: string; dot: string; bg: string; fg: string }> = {
  live:             { label: 'LIVE',           dot: 'bg-success',  bg: 'bg-success/10',  fg: 'text-success' },
  'in-development': { label: 'IN DEVELOPMENT', dot: 'bg-cyan',     bg: 'bg-cyan/10',     fg: 'text-cyan-soft' },
  concept:          { label: 'CONCEPT',        dot: 'bg-coral',    bg: 'bg-coral/10',    fg: 'text-coral' }
}

export function StatusPill({ status, className = '' }: Props) {
  const c = config[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase px-2 py-1 rounded ${c.bg} ${c.fg} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}
```

- [ ] **Step 4: Smoke-render Logo in Home.tsx temporarily**

Edit `Home.tsx` to render `<Logo size={120} />` so we can visually verify.

- [ ] **Step 5: Verify in browser**

Reload — Logo renders with pulsing cyan eye. StatusPill is built but not yet wired (verified visually in Task 9).

- [ ] **Step 6: Commit**

```bash
git add website/
git commit -m "feat(website): add Logo and StatusPill primitives"
```

---

### Task 5: Nav (sticky top bar with mobile menu)

**Files:**
- Create: `website/src/components/Nav.tsx`
- Modify: `website/src/pages/Home.tsx`

- [ ] **Step 1: Write `website/src/components/Nav.tsx`**

```tsx
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo } from './Logo'

const links = [
  { href: '#work', label: 'Work' },
  { href: '#about', label: 'About' },
  { href: '#team', label: 'Team' },
  { href: '#contact', label: 'Contact' }
]

export function Nav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-bg/70 border-b border-white/5">
      <nav className="container-page flex items-center justify-between h-16">
        <a href="#top" className="flex items-center gap-2 font-display font-bold text-lg tracking-tightish">
          <Logo size={28} />
          <span>Fenri<span className="text-cyan">X</span></span>
        </a>
        <ul className="hidden md:flex items-center gap-8 text-sm text-ink-dim">
          {links.map(l => (
            <li key={l.href}>
              <a href={l.href} className="hover:text-ink transition-colors">{l.label}</a>
            </li>
          ))}
        </ul>
        <a
          href="#contact"
          className="hidden md:inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-cyan text-bg hover:bg-cyan-soft transition-colors"
        >
          Get in touch
        </a>
        <button
          className="md:hidden p-2 text-ink"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>
      {open && (
        <ul className="md:hidden border-t border-white/5 py-4 px-6 space-y-3">
          {links.map(l => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setOpen(false)} className="block py-1 text-ink-dim hover:text-ink">{l.label}</a>
            </li>
          ))}
          <li>
            <a href="#contact" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm font-medium rounded-md bg-cyan text-bg text-center">
              Get in touch
            </a>
          </li>
        </ul>
      )}
    </header>
  )
}
```

- [ ] **Step 2: Update `Home.tsx`** to mount Nav

```tsx
import { Nav } from '../components/Nav'

export function Home() {
  return (
    <>
      <Nav />
      <main id="top" className="pt-16">
        {/* sections will go here */}
        <div className="container-page py-32">
          <h1 className="font-display text-5xl">FenriX home (placeholder — sections coming)</h1>
        </div>
      </main>
    </>
  )
}
```

- [ ] **Step 3: Verify**

Reload. Sticky nav at top. Resize to mobile width — hamburger appears, menu opens/closes.

- [ ] **Step 4: Commit**

```bash
git add website/
git commit -m "feat(website): add sticky Nav with mobile menu"
```

---

### Task 6: Footer

**Files:**
- Create: `website/src/sections/Footer.tsx`
- Modify: `website/src/pages/Home.tsx`

- [ ] **Step 1: Write `website/src/sections/Footer.tsx`**

```tsx
import { Github } from 'lucide-react'
import { Logo } from '../components/Logo'

export function Footer() {
  return (
    <footer className="border-t border-white/5 mt-24">
      <div className="container-page py-12 grid gap-10 md:grid-cols-3">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div className="font-display font-bold text-xl">Fenri<span className="text-cyan">X</span></div>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim mb-3">Studio</div>
          <ul className="space-y-2 text-sm">
            <li><a href="#work" className="hover:text-cyan">Work</a></li>
            <li><a href="#about" className="hover:text-cyan">About</a></li>
            <li><a href="#team" className="hover:text-cyan">Team</a></li>
            <li><a href="#contact" className="hover:text-cyan">Contact</a></li>
          </ul>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim mb-3">Connect</div>
          <ul className="space-y-2 text-sm">
            <li>
              <a href="https://github.com/fenrix-ai" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-cyan">
                <Github size={14} /> github.com/fenrix-ai
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="container-page py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs text-ink-dim">
          <span>© 2026 FenriX · Chapman University</span>
          <span>Built by FenriX, with Claude.</span>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Wire into `Home.tsx`**

```tsx
import { Footer } from '../sections/Footer'
// ...
<Footer />
```

- [ ] **Step 3: Verify and commit**

```bash
git add website/
git commit -m "feat(website): add Footer"
```

---

## Phase 3 — Homepage sections

### Task 7: Hero section

**Files:**
- Create: `website/src/sections/Hero.tsx`
- Modify: `website/src/pages/Home.tsx`

- [ ] **Step 1: Write `website/src/sections/Hero.tsx`**

```tsx
import { ArrowRight } from 'lucide-react'
import { Logo } from '../components/Logo'

export function Hero() {
  return (
    <section
      className="relative overflow-hidden border-b border-white/5"
      aria-labelledby="hero-title"
    >
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 80% 10%, rgba(0,153,255,0.18), transparent 60%), radial-gradient(ellipse 40% 30% at 0% 80%, rgba(255,107,74,0.10), transparent 60%)'
        }}
      />
      {/* Grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '64px 64px'
        }}
      />

      <div className="container-page relative pt-28 pb-24 md:pt-36 md:pb-32 grid gap-16 md:grid-cols-[1.4fr_1fr] items-center">
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full bg-success/10 text-success border border-success/20">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Now playtesting — Bakery Bash
          </span>
          <h1
            id="hero-title"
            className="mt-6 font-display font-bold text-5xl md:text-7xl leading-[0.95] tracking-tighter2"
          >
            We're gamifying the classroom.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-dim leading-relaxed">
            FenriX is a student-run AI studio at Chapman University, building
            competitive analytics games that teach by playing them.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href="#work"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-cyan text-bg font-medium hover:bg-cyan-soft transition-colors"
            >
              See our work <ArrowRight size={16} />
            </a>
            <a
              href="#contact"
              className="inline-flex items-center px-5 py-3 rounded-md border border-white/15 text-ink hover:bg-white/5 transition-colors"
            >
              Get in touch
            </a>
          </div>
        </div>
        <div className="hidden md:flex justify-end">
          <Logo size={280} className="drop-shadow-[0_0_60px_rgba(0,153,255,0.15)]" />
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `Home.tsx`** (replace the placeholder div)

```tsx
import { Hero } from '../sections/Hero'
// inside <main>:
<Hero />
```

- [ ] **Step 3: Verify in browser**

Reload. Hero renders with glow, grid texture, headline, CTAs, and large pulsing logo on the right at desktop width.

- [ ] **Step 4: Commit**

```bash
git add website/
git commit -m "feat(website): add Hero section"
```

---

### Task 8: Mission section

**Files:**
- Create: `website/src/sections/Mission.tsx`
- Modify: `website/src/pages/Home.tsx`

- [ ] **Step 1: Write `website/src/sections/Mission.tsx`**

```tsx
const stats = [
  { value: '4', label: 'Active projects' },
  { value: '8', label: 'Contributors' },
  { value: '1', label: 'University' }
]

export function Mission() {
  return (
    <section id="about" className="container-page py-24 md:py-32" aria-labelledby="mission-title">
      <div className="grid gap-12 md:grid-cols-[1fr_1fr] items-start">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-cyan-soft mb-4">
            Mission
          </div>
          <h2 id="mission-title" className="font-display font-bold text-3xl md:text-5xl tracking-tightish leading-tight">
            Mythic build.<br />Modern minds.
          </h2>
        </div>
        <div className="space-y-5 text-lg text-ink-dim leading-relaxed">
          <p>
            <span className="text-ink font-medium">FenriX</span> takes its name from{' '}
            <span className="text-ink">Fenrir</span>, the great wolf of Norse myth, fused with{' '}
            <span className="text-ink">AI</span>. We believe the fastest way to learn a
            decision is to live with the consequences of making it.
          </p>
          <p>
            We design competitive simulations that turn coursework into strategy —
            economics into a marketplace, sports analytics into a war room, debate into
            an arena. Students play. The math sticks.
          </p>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-3 gap-px bg-white/5 border border-white/5 rounded-xl overflow-hidden">
        {stats.map(s => (
          <div key={s.label} className="bg-bg p-6 md:p-10 text-center">
            <div className="font-display text-5xl md:text-6xl text-cyan tracking-tightish">{s.value}</div>
            <div className="mt-2 font-mono text-[10px] tracking-widest uppercase text-ink-dim">{s.label}</div>
          </div>
        ))}
      </div>

      <blockquote className="mt-16 border-l-2 border-cyan pl-6 max-w-2xl">
        <p className="font-display text-2xl md:text-3xl tracking-tightish">"Do the Hard Things."</p>
        <footer className="mt-3 text-sm text-ink-dim">— Prof. Tim Frenzel, Faculty Advisor</footer>
      </blockquote>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `Home.tsx`** below Hero. Verify and commit.

```bash
git add website/
git commit -m "feat(website): add Mission section"
```

---

### Task 9: ProjectCard + projects data + Work section

**Files:**
- Create: `website/src/data/projects.ts`
- Create: `website/src/components/ProjectCard.tsx`
- Create: `website/src/sections/Work.tsx`
- Modify: `website/src/pages/Home.tsx`

- [ ] **Step 1: Write `website/src/data/projects.ts`**

```ts
export type ProjectStatus = 'live' | 'in-development' | 'concept'

export type Project = {
  slug: string
  name: string
  status: ProjectStatus
  domain: string
  tagline: string
  description: string
  href?: string  // internal link if there's a demo page
}

export const projects: Project[] = [
  {
    slug: 'bakery-bash',
    name: 'Bakery Bash',
    status: 'live',
    domain: 'Strategy',
    tagline: 'Competitive bakery sim. Players fight for revenue in a shared plaza.',
    description:
      'Five rounds of pricing, advertising, hiring, and menu decisions. Best strategy wins.',
    href: '/demo/bakery-bash'
  },
  {
    slug: 'front-office',
    name: 'Front Office',
    status: 'in-development',
    domain: 'Sports Analytics',
    tagline: 'NBA general manager game. Build a dynasty with data-driven decisions.',
    description: 'Draft, trade, and develop players using real performance distributions.'
  },
  {
    slug: 'tutor',
    name: 'Tutor',
    status: 'in-development',
    domain: 'Adaptive Learning',
    tagline: 'An AI tutor that gamifies your own lesson material.',
    description: 'Drop in a syllabus. Walk out with quizzes, drills, and a leaderboard.'
  },
  {
    slug: 'debate-arena',
    name: 'Debate Arena',
    status: 'concept',
    domain: 'Rhetoric',
    tagline: 'Real-time debates against an AI opponent. Argument quality is scored.',
    description: 'Cross-examine, rebut, and build your case under the clock.'
  }
]
```

- [ ] **Step 2: Write `website/src/components/ProjectCard.tsx`**

```tsx
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusPill } from './StatusPill'
import type { Project } from '../data/projects'

type Props = { project: Project; featured?: boolean }

export function ProjectCard({ project, featured = false }: Props) {
  const inner = (
    <article
      className={`group relative h-full overflow-hidden rounded-xl border border-white/8 bg-surface p-6 md:p-8 transition-all duration-300 hover:-translate-y-1 hover:border-cyan/40 hover:bg-surface-raised ${
        featured ? 'md:col-span-2 md:row-span-1' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <StatusPill status={project.status} />
        <span className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">
          {project.domain}
        </span>
      </div>
      <h3
        className={`mt-6 font-display font-bold tracking-tightish ${
          featured ? 'text-4xl md:text-5xl' : 'text-2xl md:text-3xl'
        }`}
      >
        {project.name}
      </h3>
      <p className={`mt-3 text-ink-dim ${featured ? 'text-lg' : 'text-sm'} leading-relaxed`}>
        {project.tagline}
      </p>
      {featured && (
        <p className="mt-2 text-ink-dim text-sm leading-relaxed max-w-md">
          {project.description}
        </p>
      )}
      {project.href && (
        <span className="mt-6 inline-flex items-center gap-1.5 font-medium text-cyan group-hover:text-cyan-soft transition-colors">
          View demo <ArrowUpRight size={14} />
        </span>
      )}
    </article>
  )
  return project.href ? <Link to={project.href}>{inner}</Link> : inner
}
```

- [ ] **Step 3: Write `website/src/sections/Work.tsx`**

```tsx
import { projects } from '../data/projects'
import { ProjectCard } from '../components/ProjectCard'

export function Work() {
  const [featured, ...rest] = projects
  return (
    <section id="work" className="container-page py-24 md:py-32" aria-labelledby="work-title">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-12">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-cyan-soft mb-3">
            Selected work
          </div>
          <h2 id="work-title" className="font-display font-bold text-3xl md:text-5xl tracking-tightish">
            Four projects in flight.
          </h2>
        </div>
        <p className="text-ink-dim max-w-xs md:text-right">
          One classroom at a time. Ship, watch students play, fix what hurts.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-3 auto-rows-fr">
        <ProjectCard project={featured} featured />
        {rest.map(p => (
          <ProjectCard key={p.slug} project={p} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Wire into `Home.tsx`. Verify in browser. Commit.**

```bash
git add website/
git commit -m "feat(website): add Work section with project cards"
```

---

### Task 10: BakeryBashFeature section

**Files:**
- Create: `website/src/sections/BakeryBashFeature.tsx`
- Modify: `website/src/pages/Home.tsx`

- [ ] **Step 1: Write `website/src/sections/BakeryBashFeature.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'

const steps = [
  { n: '01', title: 'Pick strategy', body: 'Set prices, ad budget, staff levels.' },
  { n: '02', title: 'Run the round', body: 'Customers walk the plaza. Money moves.' },
  { n: '03', title: 'See results', body: 'Read the scoreboard. Adjust. Run it back.' }
]

export function BakeryBashFeature() {
  return (
    <section
      className="border-y border-white/5 bg-gradient-to-b from-bg to-surface/40"
      aria-labelledby="bb-feature-title"
    >
      <div className="container-page py-24 md:py-32">
        <div className="grid gap-12 md:grid-cols-[1.1fr_1fr] items-center">
          {/* Mockup placeholder */}
          <div className="relative aspect-[4/3] rounded-xl border border-white/10 bg-surface overflow-hidden shadow-2xl shadow-cyan/5">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan/10 via-transparent to-coral/10" />
            <div className="absolute top-0 left-0 right-0 h-8 bg-bg/80 border-b border-white/5 flex items-center gap-1.5 px-3">
              <span className="w-2.5 h-2.5 rounded-full bg-coral/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-cyan/70" />
              <span className="ml-3 font-mono text-[10px] text-ink-dim">bakery-bash · round 3 · 02:14 left</span>
            </div>
            <div className="absolute inset-0 pt-8 p-6 flex items-center justify-center">
              <span className="font-display text-5xl text-ink-dim/50">[ Game preview ]</span>
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-coral mb-3">
              Featured
            </div>
            <h2 id="bb-feature-title" className="font-display font-bold text-3xl md:text-5xl tracking-tightish">
              Bakery Bash.
            </h2>
            <p className="mt-4 text-lg text-ink-dim leading-relaxed">
              Run a competing bakery in a shared plaza. Five rounds. Real-time
              leaderboard. Real-time regret.
            </p>
            <ul className="mt-8 space-y-3 text-ink">
              <li className="flex items-start gap-3"><span className="text-cyan font-mono text-sm mt-1">→</span> Five rounds of pricing, ads, and hiring decisions</li>
              <li className="flex items-start gap-3"><span className="text-cyan font-mono text-sm mt-1">→</span> Compete head-to-head with your classmates</li>
              <li className="flex items-start gap-3"><span className="text-cyan font-mono text-sm mt-1">→</span> Live leaderboard, post-round analytics</li>
            </ul>
            <Link
              to="/demo/bakery-bash"
              className="mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-md bg-coral text-bg font-medium hover:bg-coral/80 transition-colors"
            >
              <Play size={16} /> Play the demo
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-px bg-white/5 border border-white/5 rounded-xl overflow-hidden md:grid-cols-3">
          {steps.map(s => (
            <div key={s.n} className="bg-bg p-8">
              <div className="font-mono text-xs text-cyan-soft">{s.n}</div>
              <div className="mt-2 font-display text-xl">{s.title}</div>
              <p className="mt-1 text-sm text-ink-dim">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `Home.tsx` below Work. Verify. Commit.**

```bash
git add website/
git commit -m "feat(website): add BakeryBashFeature section"
```

---

### Task 11: GeometricAvatar (TDD) + TeamCard + team data + Team section

**Files:**
- Create: `website/src/components/GeometricAvatar.tsx`
- Create: `website/src/components/__tests__/GeometricAvatar.test.tsx`
- Create: `website/src/data/team.ts`
- Create: `website/src/components/TeamCard.tsx`
- Create: `website/src/sections/Team.tsx`
- Modify: `website/src/pages/Home.tsx`
- Modify: `website/package.json` (add testing deps)

- [ ] **Step 1: Install testing deps**

```bash
cd website && npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Add vitest config to `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts']
  }
})
```

Add to `tsconfig.app.json` `compilerOptions.types`: `["vitest/globals", "@testing-library/jest-dom"]`.

Create `website/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Write the failing test `website/src/components/__tests__/GeometricAvatar.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { initialsOf, avatarPaletteFor } from '../GeometricAvatar'

describe('GeometricAvatar', () => {
  describe('initialsOf', () => {
    it('returns first letter of first and last word, uppercased', () => {
      expect(initialsOf('Tim Frenzel')).toBe('TF')
      expect(initialsOf('sofia morales vilchis')).toBe('SV')
    })
    it('returns single letter for single-word names', () => {
      expect(initialsOf('Cher')).toBe('C')
    })
    it('strips honorifics', () => {
      expect(initialsOf('Prof. Tim Frenzel')).toBe('TF')
    })
    it('handles empty input', () => {
      expect(initialsOf('')).toBe('?')
    })
  })

  describe('avatarPaletteFor', () => {
    it('returns the same palette for the same name (deterministic)', () => {
      const a = avatarPaletteFor('Dylan Massaro')
      const b = avatarPaletteFor('Dylan Massaro')
      expect(a).toEqual(b)
    })
    it('returns different palettes for different names', () => {
      const a = avatarPaletteFor('Dylan Massaro')
      const b = avatarPaletteFor('Sofia Morales')
      expect(a).not.toEqual(b)
    })
    it('always returns one of the configured palettes', () => {
      const palette = avatarPaletteFor('Anyone')
      expect(['cyan', 'coral', 'mixed']).toContain(palette)
    })
  })
})
```

- [ ] **Step 4: Run test — expect failure**

```bash
cd website && npm run test
```

Expected: tests fail with "Cannot find module" — `GeometricAvatar.tsx` doesn't exist yet.

- [ ] **Step 5: Write `website/src/components/GeometricAvatar.tsx`**

```tsx
type Palette = 'cyan' | 'coral' | 'mixed'

export function initialsOf(name: string): string {
  if (!name) return '?'
  const cleaned = name.replace(/\b(Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s*/gi, '').trim()
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0][0]!.toUpperCase()
  return (words[0][0]! + words[words.length - 1]![0]!).toUpperCase()
}

function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const PALETTES: Palette[] = ['cyan', 'coral', 'mixed']
export function avatarPaletteFor(name: string): Palette {
  return PALETTES[hashOf(name) % PALETTES.length]!
}

const PATTERNS = [
  // Triangle pointing right
  'M 0 0 L 100 50 L 0 100 Z',
  // Diamond
  'M 50 0 L 100 50 L 50 100 L 0 50 Z',
  // Top-left triangle
  'M 0 0 L 100 0 L 0 100 Z',
  // Polygon (pentagon-ish)
  'M 50 5 L 95 35 L 80 90 L 20 90 L 5 35 Z'
]

type Props = {
  name: string
  photo?: string
  size?: number
  className?: string
}

export function GeometricAvatar({ name, photo, size = 96, className = '' }: Props) {
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        width={size}
        height={size}
        className={`rounded-xl object-cover ${className}`}
      />
    )
  }
  const palette = avatarPaletteFor(name)
  const path = PATTERNS[hashOf(name) % PATTERNS.length]!
  const initials = initialsOf(name)
  const fill = palette === 'cyan' ? '#0099ff' : palette === 'coral' ? '#ff6b4a' : 'url(#mix)'

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`rounded-xl bg-surface-raised border border-white/8 ${className}`}
      role="img"
      aria-label={`${name} avatar`}
    >
      <defs>
        <linearGradient id="mix" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0099ff" />
          <stop offset="100%" stopColor="#ff6b4a" />
        </linearGradient>
      </defs>
      <path d={path} fill={fill} opacity="0.18" />
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontWeight="500"
        fontSize="32"
        fill="#e7ecf2"
      >
        {initials}
      </text>
    </svg>
  )
}
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd website && npm run test
```

Expected: all GeometricAvatar tests pass.

- [ ] **Step 7: Write `website/src/data/team.ts`**

```ts
export type TeamMember = {
  name: string
  role: string
  motto?: string
  photo?: string  // URL — empty for v1
}

export const team: TeamMember[] = [
  { name: 'Prof. Tim Frenzel',     role: 'Faculty Advisor',     motto: 'Do the Hard Things' },
  { name: 'Dylan Massaro',         role: 'Teaching Assistant'  },
  { name: 'Katrina McCay',         role: 'Teaching Assistant'  },
  { name: 'Mia Truong',            role: 'Teaching Assistant'  },
  { name: 'Dylan Barlava',         role: 'Student Engineer'    },
  { name: 'Kavin Ravi',            role: 'Student Engineer'    },
  { name: 'Scott Switzer',         role: 'Student Engineer'    },
  { name: 'Sofia Morales Vilchis', role: 'Student Engineer'    }
]
```

- [ ] **Step 8: Write `website/src/components/TeamCard.tsx`**

```tsx
import { GeometricAvatar } from './GeometricAvatar'
import type { TeamMember } from '../data/team'

export function TeamCard({ member }: { member: TeamMember }) {
  return (
    <article
      data-photo={member.photo ?? ''}
      className="rounded-xl border border-white/8 bg-surface p-5 hover:bg-surface-raised hover:border-cyan/30 transition-colors"
    >
      <GeometricAvatar name={member.name} photo={member.photo} size={88} />
      <h3 className="mt-4 font-display font-bold text-lg leading-snug">{member.name}</h3>
      <div className="mt-1 font-mono text-[10px] tracking-widest uppercase text-ink-dim">
        {member.role}
      </div>
      {member.motto && (
        <div className="mt-3 text-sm text-cyan-soft italic">"{member.motto}"</div>
      )}
    </article>
  )
}
```

- [ ] **Step 9: Write `website/src/sections/Team.tsx`**

```tsx
import { team } from '../data/team'
import { TeamCard } from '../components/TeamCard'

export function Team() {
  return (
    <section id="team" className="container-page py-24 md:py-32" aria-labelledby="team-title">
      <div className="mb-12">
        <div className="font-mono text-[10px] tracking-widest uppercase text-cyan-soft mb-3">
          Team
        </div>
        <h2 id="team-title" className="font-display font-bold text-3xl md:text-5xl tracking-tightish">
          Built by students. Advised by faculty.
        </h2>
        <p className="mt-3 text-ink-dim">Chapman University · 2026 cohort</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {team.map(m => (
          <TeamCard key={m.name} member={m} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 10: Wire into `Home.tsx`. Verify in browser. Commit.**

```bash
git add website/
git commit -m "feat(website): add Team section with geometric avatars"
```

---

### Task 12: ScrollReveal utility (reduced-motion aware)

**Files:**
- Create: `website/src/components/ScrollReveal.tsx`
- Modify: section files to use it on key headlines

- [ ] **Step 1: Write `website/src/components/ScrollReveal.tsx`**

```tsx
import { useEffect, useRef, type ReactNode } from 'react'

type Props = { children: ReactNode; delay?: number; as?: keyof JSX.IntrinsicElements }

export function ScrollReveal({ children, delay = 0, as: Tag = 'div' }: Props) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      el.classList.add('is-visible')
      return
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setTimeout(() => el.classList.add('is-visible'), delay)
          obs.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [delay])

  // @ts-expect-error — generic dynamic tag
  return <Tag ref={ref} className="reveal">{children}</Tag>
}
```

- [ ] **Step 2: Wrap key elements** in `Hero.tsx`, `Mission.tsx`, `Work.tsx`, `BakeryBashFeature.tsx`, `Team.tsx`. Wrap each section's main heading + body cluster.

Example for `Mission.tsx` — wrap the outer `<div className="grid gap-12 ...">`:

```tsx
<ScrollReveal>
  <div className="grid gap-12 md:grid-cols-[1fr_1fr] items-start">
    {/* ... */}
  </div>
</ScrollReveal>
```

- [ ] **Step 3: Verify in browser**

Reload, scroll. Sections fade up as they enter view. Toggle macOS Reduce Motion → no animation, content visible immediately.

- [ ] **Step 4: Commit**

```bash
git add website/
git commit -m "feat(website): add ScrollReveal with reduced-motion respect"
```

---

## Phase 4 — Contact form

### Task 13: Firebase config + lazy init

**Files:**
- Create: `website/.env.example`
- Create: `website/.env.local` (gitignored — copy from .env.example)
- Create: `website/src/lib/firebase.ts`
- Modify: `website/.gitignore` (already inherits root .gitignore for `.env.local`)

- [ ] **Step 1: Install firebase**

```bash
cd website && npm install firebase
```

- [ ] **Step 2: Write `website/.env.example`**

```bash
# Firebase Web SDK config — populate from `firebase apps:sdkconfig WEB --project bakery-bash-54d12`
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

- [ ] **Step 3: Write `website/src/lib/firebase.ts`** (lazy)

```ts
import type { FirebaseApp } from 'firebase/app'
import type { Firestore } from 'firebase/firestore'

let appPromise: Promise<FirebaseApp> | null = null
let dbPromise: Promise<Firestore> | null = null

function readConfig() {
  const env = import.meta.env
  return {
    apiKey: env.VITE_FIREBASE_API_KEY!,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN!,
    projectId: env.VITE_FIREBASE_PROJECT_ID!,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID!,
    appId: env.VITE_FIREBASE_APP_ID!
  }
}

export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp } = await import('firebase/app')
      return initializeApp(readConfig())
    })()
  }
  return appPromise
}

export async function getDb(): Promise<Firestore> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const app = await getFirebaseApp()
      const { getFirestore } = await import('firebase/firestore')
      return getFirestore(app)
    })()
  }
  return dbPromise
}
```

- [ ] **Step 4: Copy real config into `.env.local`**

```bash
cd website && cp .env.example .env.local
firebase apps:sdkconfig WEB --project bakery-bash-54d12
# Manually paste the values into website/.env.local (apiKey, authDomain, etc.)
```

- [ ] **Step 5: Commit**

```bash
git add website/
git commit -m "feat(website): add lazy Firebase init"
```

---

### Task 14: submit-contact lib (TDD)

**Files:**
- Create: `website/src/lib/submit-contact.ts`
- Create: `website/src/lib/__tests__/submit-contact.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// website/src/lib/__tests__/submit-contact.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitContact, type ContactPayload } from '../submit-contact'

const addDocMock = vi.fn()
const collectionMock = vi.fn(() => 'collectionRef')

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  collection: (...args: unknown[]) => collectionMock(...args),
  serverTimestamp: () => 'TS'
}))
vi.mock('../firebase', () => ({
  getDb: vi.fn().mockResolvedValue({})
}))

const valid: ContactPayload = {
  name: 'Sofia Morales',
  email: 'sofia@example.com',
  org: 'Chapman',
  topic: 'partnership',
  message: 'We would love to talk.'
}

describe('submitContact', () => {
  beforeEach(() => {
    addDocMock.mockReset()
    collectionMock.mockClear()
  })

  it('writes to contact_submissions with a server timestamp', async () => {
    addDocMock.mockResolvedValue({ id: 'abc' })
    await submitContact(valid)
    expect(collectionMock).toHaveBeenCalledWith({}, 'contact_submissions')
    expect(addDocMock).toHaveBeenCalledWith('collectionRef', expect.objectContaining({
      name: 'Sofia Morales',
      email: 'sofia@example.com',
      createdAt: 'TS'
    }))
  })

  it('rejects when honeypot is filled', async () => {
    await expect(
      submitContact({ ...valid, _honeypot: 'spam' } as ContactPayload)
    ).rejects.toThrow(/honeypot/i)
    expect(addDocMock).not.toHaveBeenCalled()
  })

  it('trims whitespace before writing', async () => {
    addDocMock.mockResolvedValue({ id: 'abc' })
    await submitContact({ ...valid, name: '  Sofia  ', message: '  hi  ' })
    expect(addDocMock).toHaveBeenCalledWith(
      'collectionRef',
      expect.objectContaining({ name: 'Sofia', message: 'hi' })
    )
  })

  it('surfaces firestore errors', async () => {
    addDocMock.mockRejectedValue(new Error('permission-denied'))
    await expect(submitContact(valid)).rejects.toThrow(/permission-denied/)
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd website && npm run test
```

Expected: fails — `submit-contact.ts` doesn't exist.

- [ ] **Step 3: Write `website/src/lib/submit-contact.ts`**

```ts
import { getDb } from './firebase'

export type ContactTopic = 'partnership' | 'sponsorship' | 'press' | 'joining' | 'other'

export type ContactPayload = {
  name: string
  email: string
  org?: string
  topic: ContactTopic
  message: string
  _honeypot?: string
}

export async function submitContact(payload: ContactPayload): Promise<void> {
  if (payload._honeypot) {
    throw new Error('honeypot triggered')
  }
  const db = await getDb()
  const { addDoc, collection, serverTimestamp } = await import('firebase/firestore')
  await addDoc(collection(db, 'contact_submissions'), {
    name: payload.name.trim(),
    email: payload.email.trim(),
    org: payload.org?.trim() ?? '',
    topic: payload.topic,
    message: payload.message.trim(),
    createdAt: serverTimestamp(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
  })
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd website && npm run test
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add website/
git commit -m "feat(website): add tested submit-contact lib"
```

---

### Task 15: Contact section UI

**Files:**
- Create: `website/src/sections/Contact.tsx`
- Modify: `website/src/pages/Home.tsx`

- [ ] **Step 1: Install react-hook-form + zod**

```bash
cd website && npm install react-hook-form zod @hookform/resolvers
```

- [ ] **Step 2: Write `website/src/sections/Contact.tsx`**

```tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, AlertCircle, Send } from 'lucide-react'
import { submitContact } from '../lib/submit-contact'

const Schema = z.object({
  name: z.string().min(1, 'Required').max(120),
  email: z.string().email('Invalid email').max(200),
  org: z.string().max(200).optional(),
  topic: z.enum(['partnership', 'sponsorship', 'press', 'joining', 'other']),
  message: z.string().min(10, 'Tell us a little more').max(4000),
  _honeypot: z.string().optional()
})
type FormValues = z.infer<typeof Schema>

export function Contact() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { topic: 'partnership' }
  })
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')

  const onSubmit = async (values: FormValues) => {
    try {
      await submitContact(values)
      setStatus('ok')
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  if (status === 'ok') {
    return (
      <section id="contact" className="container-page py-24 md:py-32">
        <div className="max-w-xl mx-auto text-center">
          <CheckCircle2 size={48} className="mx-auto text-success" />
          <h2 className="mt-6 font-display font-bold text-3xl md:text-4xl">Message received.</h2>
          <p className="mt-3 text-ink-dim">We'll be in touch within 5 business days.</p>
        </div>
      </section>
    )
  }

  return (
    <section id="contact" className="container-page py-24 md:py-32" aria-labelledby="contact-title">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="font-mono text-[10px] tracking-widest uppercase text-cyan-soft mb-3">Contact</div>
          <h2 id="contact-title" className="font-display font-bold text-3xl md:text-5xl tracking-tightish">
            Want to play, partner, or join?
          </h2>
          <p className="mt-3 text-ink-dim">Drop us a note — we read everything.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {/* Honeypot — hidden from real users */}
          <input type="text" tabIndex={-1} autoComplete="off" {...register('_honeypot')} className="hidden" aria-hidden />

          <Field label="Name" error={errors.name?.message}>
            <input {...register('name')} className={inputCls} autoComplete="name" />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <input type="email" {...register('email')} className={inputCls} autoComplete="email" />
          </Field>
          <Field label="Organization or school (optional)" error={errors.org?.message}>
            <input {...register('org')} className={inputCls} autoComplete="organization" />
          </Field>
          <Field label="Topic" error={errors.topic?.message}>
            <select {...register('topic')} className={inputCls}>
              <option value="partnership">Partnership</option>
              <option value="sponsorship">Sponsorship</option>
              <option value="press">Press</option>
              <option value="joining">Joining FenriX</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Message" error={errors.message?.message}>
            <textarea rows={5} {...register('message')} className={`${inputCls} resize-y min-h-[120px]`} />
          </Field>

          {status === 'error' && (
            <div className="flex items-start gap-2 text-coral text-sm">
              <AlertCircle size={16} className="mt-0.5" />
              Something broke. Please try again in a moment.
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-cyan text-bg font-medium hover:bg-cyan-soft disabled:opacity-50 transition-colors"
          >
            <Send size={16} />
            {isSubmitting ? 'Sending…' : 'Send message'}
          </button>
        </form>

        <p className="mt-12 text-center text-sm text-ink-dim">
          Want to join FenriX as a student?{' '}
          <a href="https://github.com/fenrix-ai" target="_blank" rel="noreferrer" className="text-cyan hover:text-cyan-soft underline-offset-4 hover:underline">
            See us on GitHub →
          </a>
        </p>
      </div>
    </section>
  )
}

const inputCls =
  'w-full px-4 py-3 rounded-md bg-surface border border-white/10 text-ink placeholder:text-ink-dim/60 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30 transition-colors'

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-ink-dim mb-1.5">{label}</span>
      {children}
      {error && <span role="alert" className="mt-1 block text-xs text-coral">{error}</span>}
    </label>
  )
}
```

- [ ] **Step 3: Wire into `Home.tsx` above Footer.**

- [ ] **Step 4: Verify in browser**

Validation triggers on submit (empty fields show errors). Honeypot field is hidden. **Don't actually submit** — Firestore rules aren't deployed yet.

- [ ] **Step 5: Commit**

```bash
git add website/
git commit -m "feat(website): add Contact form with validation"
```

---

### Task 16: Add `contact_submissions` Firestore rule

**Files:**
- Modify: `games/bakery-bash/backend/firestore.rules`

- [ ] **Step 1: Read existing rules to find a good insertion point**

```bash
cat games/bakery-bash/backend/firestore.rules | head -60
```

- [ ] **Step 2: Add a top-level match block** above the closing `}` of `match /databases/{database}/documents`:

```
    // ─────────────────────────────────────────────────────────
    // contact_submissions — created by the FenriX marketing
    // site contact form (website/src/sections/Contact.tsx).
    // Reads only via the Firebase console — no UI surfaces these.
    // ─────────────────────────────────────────────────────────
    match /contact_submissions/{doc} {
      allow read: if false;
      allow create: if
        request.resource.data.email is string
        && request.resource.data.email.size() < 200
        && request.resource.data.message is string
        && request.resource.data.message.size() < 4000
        && request.resource.data.name is string
        && request.resource.data.name.size() < 120;
      allow update, delete: if false;
    }
```

- [ ] **Step 3: Commit (rules deploy is manual, post-merge)**

```bash
git add games/bakery-bash/backend/firestore.rules
git commit -m "feat(rules): allow contact_submissions creates from website"
```

(Deploy is `firebase deploy --only firestore:rules --project bakery-bash-54d12` from `games/bakery-bash/backend/`. Do this once during the deploy step in Task 24.)

---

## Phase 5 — Bakery Bash demo page

### Task 17: DemoShell + tab nav

**Files:**
- Create: `website/src/components/demo/DemoShell.tsx`
- Modify: `website/src/pages/DemoBakeryBash.tsx`

- [ ] **Step 1: Write `website/src/components/demo/DemoShell.tsx`**

```tsx
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export type DemoTab = 'lobby' | 'strategy' | 'results' | 'leaderboard'

const TABS: { id: DemoTab; label: string }[] = [
  { id: 'lobby',       label: '01 · Lobby' },
  { id: 'strategy',    label: '02 · Strategy' },
  { id: 'results',     label: '03 · Round Results' },
  { id: 'leaderboard', label: '04 · Leaderboard' }
]

type Props = { screens: Record<DemoTab, ReactNode> }

export function DemoShell({ screens }: Props) {
  const [tab, setTab] = useState<DemoTab>('lobby')
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-bg/85 backdrop-blur-md">
        <div className="container-page flex items-center justify-between h-14">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-ink-dim hover:text-ink">
            <ArrowLeft size={14} /> Back to FenriX
          </Link>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 rounded-full bg-coral/10 text-coral border border-coral/20">
            <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse" />
            DEMO · NOT PLAYABLE · v1.0
          </span>
        </div>
      </header>

      <div className="container-page grid gap-6 md:grid-cols-[200px_1fr] py-8">
        <nav aria-label="Demo screens" className="md:sticky md:top-20 self-start">
          <ul className="flex md:block gap-2 md:gap-0 md:space-y-1 overflow-x-auto md:overflow-visible">
            {TABS.map(t => (
              <li key={t.id}>
                <button
                  onClick={() => setTab(t.id)}
                  className={`block w-full text-left whitespace-nowrap px-3 py-2 rounded-md font-mono text-xs tracking-wider ${
                    tab === t.id
                      ? 'bg-cyan/15 text-cyan border border-cyan/30'
                      : 'text-ink-dim hover:text-ink hover:bg-white/5 border border-transparent'
                  }`}
                  aria-current={tab === t.id ? 'page' : undefined}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="rounded-xl border border-white/8 bg-surface p-6 md:p-8 min-h-[600px]">
          {screens[tab]}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `website/src/pages/DemoBakeryBash.tsx`** with placeholders for each screen

```tsx
import { DemoShell } from '../components/demo/DemoShell'

export function DemoBakeryBash() {
  return (
    <DemoShell
      screens={{
        lobby:       <div>Lobby coming soon</div>,
        strategy:    <div>Strategy coming soon</div>,
        results:     <div>Results coming soon</div>,
        leaderboard: <div>Leaderboard coming soon</div>
      }}
    />
  )
}
```

- [ ] **Step 3: Verify, commit**

```bash
git add website/
git commit -m "feat(website): add demo page shell with tab nav"
```

---

### Task 18: Demo screen — Lobby

**Files:**
- Create: `website/src/data/demo-fixtures.ts`
- Create: `website/src/components/demo/LobbyScreen.tsx`
- Modify: `website/src/pages/DemoBakeryBash.tsx`

- [ ] **Step 1: Write `website/src/data/demo-fixtures.ts`**

```ts
export type DemoPlayer = {
  id: string
  handle: string
  bakery: string
  cash: number
  status: 'ready' | 'thinking' | 'submitted'
}

export const demoPlayers: DemoPlayer[] = [
  { id: 'p1', handle: 'sofia_v',     bakery: 'Crumb Theory',     cash: 12450, status: 'submitted' },
  { id: 'p2', handle: 'kavin.r',     bakery: 'Knead Speed',      cash: 11210, status: 'submitted' },
  { id: 'p3', handle: 'dyl.b',       bakery: 'Dough Joneses',    cash: 10870, status: 'thinking' },
  { id: 'p4', handle: 'mia.t',       bakery: 'Truffle in Mind',  cash: 10520, status: 'submitted' },
  { id: 'p5', handle: 'scott.s',     bakery: 'Loaf, Actually',   cash: 9870,  status: 'ready' },
  { id: 'p6', handle: 'katrina.m',   bakery: 'Rye Society',      cash: 9540,  status: 'thinking' },
  { id: 'p7', handle: 'dyl.m',       bakery: 'Bread & Beyond',   cash: 9120,  status: 'submitted' },
  { id: 'p8', handle: 'house',       bakery: 'Brioche Direct',   cash: 8210,  status: 'ready' }
]

export type DemoLeader = {
  rank: number
  player: string
  bakery: string
  netProfit: number
  rounds: number
}

export const demoLeaderboard: DemoLeader[] = [
  { rank: 1, player: 'sofia_v',   bakery: 'Crumb Theory',    netProfit: 4870, rounds: 5 },
  { rank: 2, player: 'kavin.r',   bakery: 'Knead Speed',     netProfit: 4210, rounds: 5 },
  { rank: 3, player: 'mia.t',     bakery: 'Truffle in Mind', netProfit: 3540, rounds: 5 },
  { rank: 4, player: 'dyl.b',     bakery: 'Dough Joneses',   netProfit: 3120, rounds: 5 },
  { rank: 5, player: 'dyl.m',     bakery: 'Bread & Beyond',  netProfit: 2880, rounds: 5 },
  { rank: 6, player: 'katrina.m', bakery: 'Rye Society',     netProfit: 1940, rounds: 5 },
  { rank: 7, player: 'scott.s',   bakery: 'Loaf, Actually',  netProfit: 1610, rounds: 5 },
  { rank: 8, player: 'house',     bakery: 'Brioche Direct',  netProfit:  -250, rounds: 5 }
]

export type WaterfallStep = { label: string; value: number }
export const demoWaterfall: WaterfallStep[] = [
  { label: 'Revenue',      value:  5400 },
  { label: 'COGS',         value: -2100 },
  { label: 'Wages',        value:  -900 },
  { label: 'Ad spend',     value:  -650 },
  { label: 'Rent',         value:  -400 },
  { label: 'Net profit',   value:  1350 }
]
```

- [ ] **Step 2: Write `website/src/components/demo/LobbyScreen.tsx`**

```tsx
import { demoPlayers } from '../../data/demo-fixtures'

const statusStyles = {
  ready:     { dot: 'bg-ink-dim', label: 'Ready'      },
  thinking:  { dot: 'bg-cyan animate-pulse', label: 'Thinking…' },
  submitted: { dot: 'bg-success', label: 'Submitted'  }
} as const

export function LobbyScreen() {
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">Round 1 / 5</div>
          <h2 className="mt-1 font-display font-bold text-2xl">Bidding closed.</h2>
        </div>
        <div className="font-mono text-cyan-soft text-sm">⏱ 02:14 to next round</div>
      </header>

      <div className="rounded-lg border border-white/8 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-ink-dim font-mono text-[10px] tracking-widest uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Player</th>
              <th className="text-left px-4 py-3 font-medium">Bakery</th>
              <th className="text-right px-4 py-3 font-medium">Cash</th>
              <th className="text-right px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {demoPlayers.map((p, i) => {
              const s = statusStyles[p.status]
              return (
                <tr key={p.id} className={i % 2 ? 'bg-bg' : 'bg-surface'}>
                  <td className="px-4 py-3 font-mono text-ink">{p.handle}</td>
                  <td className="px-4 py-3">{p.bakery}</td>
                  <td className="px-4 py-3 text-right font-mono">${p.cash.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      <span className="text-ink-dim">{s.label}</span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire into `DemoBakeryBash.tsx`. Verify. Commit.**

```bash
git add website/
git commit -m "feat(website): add demo Lobby screen"
```

---

### Task 19: Demo screen — Strategy

**Files:**
- Create: `website/src/components/demo/StrategyScreen.tsx`

- [ ] **Step 1: Write `StrategyScreen.tsx`** — local-state-only sliders/buttons

```tsx
import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'

export function StrategyScreen() {
  const [price, setPrice] = useState(6.5)
  const [adSpend, setAdSpend] = useState(400)
  const [staff, setStaff] = useState(3)

  return (
    <div className="space-y-8">
      <header>
        <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">Round 2 / 5 · Strategy</div>
        <h2 className="mt-1 font-display font-bold text-2xl">Set your plan.</h2>
        <p className="text-ink-dim text-sm mt-1">All inputs are local — nothing is saved.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Slider label="Croissant price" min={3} max={12} step={0.25} value={price} onChange={setPrice} format={v => `$${v.toFixed(2)}`} />
        <Slider label="Ad spend" min={0} max={2000} step={50} value={adSpend} onChange={setAdSpend} format={v => `$${v.toLocaleString()}`} />
      </div>

      <div className="rounded-lg border border-white/8 bg-bg p-5 flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">Bakers on shift</div>
          <div className="mt-1 font-display text-3xl">{staff}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setStaff(s => Math.max(1, s - 1))} className="w-9 h-9 rounded-md border border-white/10 hover:bg-white/5 inline-flex items-center justify-center" aria-label="Hire one fewer baker"><Minus size={14} /></button>
          <button onClick={() => setStaff(s => Math.min(8, s + 1))} className="w-9 h-9 rounded-md border border-white/10 hover:bg-white/5 inline-flex items-center justify-center" aria-label="Hire one more baker"><Plus size={14} /></button>
        </div>
      </div>

      <div className="rounded-lg bg-cyan/5 border border-cyan/15 p-5">
        <div className="font-mono text-[10px] tracking-widest uppercase text-cyan-soft">Forecast</div>
        <div className="mt-2 grid grid-cols-3 gap-4 text-center">
          <Stat label="Demand" value={Math.round(800 + adSpend * 0.4 - (price - 5) * 60).toString()} />
          <Stat label="Revenue" value={`$${Math.round((800 + adSpend * 0.4 - (price - 5) * 60) * price).toLocaleString()}`} />
          <Stat label="Margin" value={`${Math.max(0, Math.round((price - 2.4) / price * 100))}%`} />
        </div>
      </div>

      <button className="px-6 py-3 rounded-md bg-cyan/40 text-bg font-medium cursor-not-allowed opacity-60" disabled>
        Submit (demo — disabled)
      </button>
    </div>
  )
}

function Slider({ label, min, max, step, value, onChange, format }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; format: (v: number) => string
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-bg p-5">
      <div className="flex items-baseline justify-between">
        <label className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">{label}</label>
        <span className="font-display text-2xl text-cyan">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="mt-4 w-full accent-cyan"
        aria-label={label}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-2xl">{value}</div>
      <div className="mt-1 font-mono text-[10px] tracking-widest uppercase text-ink-dim">{label}</div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into DemoBakeryBash.tsx. Verify sliders move and forecasts update. Commit.**

```bash
git add website/
git commit -m "feat(website): add demo Strategy screen"
```

---

### Task 20: Demo screen — Round Results (with SVG waterfall)

**Files:**
- Create: `website/src/components/demo/ResultsScreen.tsx`

- [ ] **Step 1: Write `ResultsScreen.tsx`**

```tsx
import { demoWaterfall } from '../../data/demo-fixtures'

export function ResultsScreen() {
  // Compute running totals to position bars
  let running = 0
  const bars = demoWaterfall.map((s, i) => {
    const start = running
    running += s.value
    const end = running
    const isTotal = i === demoWaterfall.length - 1
    return { ...s, start, end, isTotal }
  })
  const max = Math.max(...bars.map(b => Math.max(b.start, b.end)))
  const min = Math.min(...bars.map(b => Math.min(b.start, b.end, 0)))
  const range = max - min || 1

  const W = 720
  const H = 320
  const barW = (W - 80) / bars.length - 12

  const y = (v: number) => H - 40 - ((v - min) / range) * (H - 80)

  return (
    <div className="space-y-8">
      <header>
        <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">Round 3 / 5 · Results</div>
        <h2 className="mt-1 font-display font-bold text-2xl">Profit waterfall.</h2>
      </header>

      <div className="rounded-lg border border-white/8 bg-bg p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px] h-auto" aria-label="Profit waterfall chart">
          {/* Axis */}
          <line x1="40" x2={W - 20} y1={y(0)} y2={y(0)} stroke="#8b95a3" strokeDasharray="2 4" opacity="0.4" />
          {bars.map((b, i) => {
            const x = 40 + i * (barW + 12)
            const top = y(Math.max(b.start, b.end))
            const height = Math.abs(y(b.start) - y(b.end))
            const fill = b.isTotal ? '#0099ff' : b.value >= 0 ? '#00d18a' : '#ff6b4a'
            return (
              <g key={b.label}>
                <rect x={x} y={top} width={barW} height={Math.max(2, height)} fill={fill} opacity="0.75" rx="2" />
                <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize="11" fill="#e7ecf2" fontFamily="JetBrains Mono">
                  {b.value >= 0 ? '+' : ''}{b.value.toLocaleString()}
                </text>
                <text x={x + barW / 2} y={H - 18} textAnchor="middle" fontSize="10" fill="#8b95a3" fontFamily="JetBrains Mono" textTransform="uppercase">
                  {b.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <SummaryStat label="Net profit"    value="+$1,350"  tone="success" />
        <SummaryStat label="Customers served" value="843"    tone="ink" />
        <SummaryStat label="Round rank"    value="2 of 8"   tone="cyan" />
      </div>
    </div>
  )
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone: 'success' | 'cyan' | 'ink' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'cyan' ? 'text-cyan' : 'text-ink'
  return (
    <div className="rounded-lg border border-white/8 bg-bg p-5">
      <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">{label}</div>
      <div className={`mt-2 font-display text-3xl ${color}`}>{value}</div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into DemoBakeryBash.tsx. Verify chart renders. Commit.**

```bash
git add website/
git commit -m "feat(website): add demo Results screen with waterfall"
```

---

### Task 21: Demo screen — Leaderboard

**Files:**
- Create: `website/src/components/demo/LeaderboardScreen.tsx`

- [ ] **Step 1: Write `LeaderboardScreen.tsx`**

```tsx
import { useState } from 'react'
import { demoLeaderboard } from '../../data/demo-fixtures'
import { ChevronDown, ChevronUp } from 'lucide-react'

type SortKey = 'rank' | 'netProfit'

export function LeaderboardScreen() {
  const [sort, setSort] = useState<SortKey>('rank')
  const sorted = [...demoLeaderboard].sort((a, b) =>
    sort === 'netProfit' ? b.netProfit - a.netProfit : a.rank - b.rank
  )
  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono text-[10px] tracking-widest uppercase text-ink-dim">Final · 5 / 5</div>
        <h2 className="mt-1 font-display font-bold text-2xl">Leaderboard.</h2>
      </header>

      <div className="rounded-lg border border-white/8 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-ink-dim font-mono text-[10px] tracking-widest uppercase">
            <tr>
              <th className="text-left px-4 py-3">
                <button onClick={() => setSort('rank')} className="inline-flex items-center gap-1 hover:text-ink">
                  Rank {sort === 'rank' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                </button>
              </th>
              <th className="text-left px-4 py-3">Player</th>
              <th className="text-left px-4 py-3">Bakery</th>
              <th className="text-right px-4 py-3">
                <button onClick={() => setSort('netProfit')} className="inline-flex items-center gap-1 hover:text-ink">
                  Net profit {sort === 'netProfit' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.player} className={`${i % 2 ? 'bg-bg' : 'bg-surface'} ${row.rank === 1 ? 'ring-1 ring-inset ring-cyan/30' : ''}`}>
                <td className="px-4 py-3 font-mono">
                  {row.rank === 1 && <span className="text-cyan mr-1">★</span>}
                  {row.rank}
                </td>
                <td className="px-4 py-3 font-mono">{row.player}</td>
                <td className="px-4 py-3">{row.bakery}</td>
                <td className={`px-4 py-3 text-right font-mono ${row.netProfit >= 0 ? 'text-success' : 'text-coral'}`}>
                  {row.netProfit >= 0 ? '+' : ''}${row.netProfit.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into `DemoBakeryBash.tsx`. Final wiring:**

```tsx
import { DemoShell } from '../components/demo/DemoShell'
import { LobbyScreen } from '../components/demo/LobbyScreen'
import { StrategyScreen } from '../components/demo/StrategyScreen'
import { ResultsScreen } from '../components/demo/ResultsScreen'
import { LeaderboardScreen } from '../components/demo/LeaderboardScreen'

export function DemoBakeryBash() {
  return (
    <DemoShell
      screens={{
        lobby:       <LobbyScreen />,
        strategy:    <StrategyScreen />,
        results:     <ResultsScreen />,
        leaderboard: <LeaderboardScreen />
      }}
    />
  )
}
```

- [ ] **Step 3: Verify all 4 screens. Commit.**

```bash
git add website/
git commit -m "feat(website): add demo Leaderboard screen and wire all screens"
```

---

## Phase 6 — Polish + Ship

### Task 22: Accessibility pass

- [ ] **Step 1: Add skip-to-content link** in `App.tsx`, just inside `<BrowserRouter>`:

```tsx
<a href="#top" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:rounded focus:bg-cyan focus:text-bg z-[100]">
  Skip to content
</a>
```

- [ ] **Step 2: Verify keyboard nav**

Tab through the homepage — every interactive element gets a visible focus ring. Skip link appears on first Tab.

- [ ] **Step 3: Verify reduced-motion**

System Settings → Accessibility → Reduce motion → reload site → animations off, content visible.

- [ ] **Step 4: Verify color contrast**

Spot-check `text-ink-dim` on `bg-bg` (#8b95a3 on #0b0d10) — passes AA (~7.5:1). `text-cyan-soft` on `bg-bg` (#66ccff on #0b0d10) — passes AA.

- [ ] **Step 5: Commit**

```bash
git add website/
git commit -m "feat(website): add skip-to-content link"
```

---

### Task 23: Production build verification

- [ ] **Step 1: Build**

```bash
cd website && npm run build
```

Expected: clean exit, `website/dist/` directory created with `index.html`, hashed JS, hashed CSS.

- [ ] **Step 2: Preview the production build**

```bash
cd website && npm run preview
```

Click through homepage and demo. Submit the form once with a valid value (this DOES write to Firestore — only do it after Task 24's rules are deployed; otherwise expect a permission error in the console).

- [ ] **Step 3: Bundle size check**

```bash
ls -lh website/dist/assets/*.js | sort -k5 -h | tail
```

Largest entry chunk should be < 200KB (firebase chunk is lazy-split — it appears only after the contact form mounts).

---

### Task 24: Firebase hosting target + deploy

**Files:**
- Create: `website/firebase.json`
- Create: `website/.firebaserc`

- [ ] **Step 1: Write `website/firebase.json`**

```json
{
  "hosting": {
    "target": "fenrix-site",
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css|svg|woff2)",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
      }
    ]
  }
}
```

- [ ] **Step 2: Write `website/.firebaserc`**

```json
{
  "projects": { "default": "bakery-bash-54d12" },
  "targets": {
    "bakery-bash-54d12": {
      "hosting": {
        "fenrix-site": ["fenrix-site"]
      }
    }
  }
}
```

- [ ] **Step 3: Provision the hosting site (one-time, manual)**

```bash
cd website
firebase hosting:sites:create fenrix-site --project bakery-bash-54d12
firebase target:apply hosting fenrix-site fenrix-site --project bakery-bash-54d12
```

(If `fenrix-site` is taken globally, use `fenrix-org` or `fenrix-studio` and update `.firebaserc` + `firebase.json` accordingly.)

- [ ] **Step 4: Deploy Firestore rules** (from the bakery-bash backend)

```bash
cd games/bakery-bash/backend
firebase deploy --only firestore:rules --project bakery-bash-54d12
```

- [ ] **Step 5: Deploy the website**

```bash
cd website
npm run build
firebase deploy --only hosting:fenrix-site --project bakery-bash-54d12
```

Expected: Firebase prints a hosting URL like `https://fenrix-site.web.app`.

- [ ] **Step 6: Smoke-test the live site**

- Visit the hosting URL.
- Confirm Hero loads.
- Click through to `/demo/bakery-bash`, hit each tab.
- Submit the contact form (real submission). Verify a doc appears in `contact_submissions` in the Firebase console.

- [ ] **Step 7: Write a short `website/README.md`**

```md
# FenriX Website

Marketing site for FenriX, deployed at https://fenrix-site.web.app.

## Dev

```bash
cd website
npm install
cp .env.example .env.local       # paste Firebase web SDK config
npm run dev                      # http://localhost:5174
```

## Deploy

```bash
cd website
npm run build
firebase deploy --only hosting:fenrix-site --project bakery-bash-54d12
```

Reads contact submissions in the Firebase console under
`contact_submissions`.
```

- [ ] **Step 8: Commit**

```bash
git add website/
git commit -m "feat(website): add Firebase hosting target and deploy config"
```

---

## Self-Review Checklist (run after writing this plan)

- [x] **Spec coverage:**
  - Hero, Mission, Work, Bakery Bash feature, Team, Contact, Footer — Tasks 7, 8, 9, 10, 11, 15, 6 ✓
  - Demo page (4 screens) — Tasks 17–21 ✓
  - Geometric avatars deterministic — Task 11 (with TDD) ✓
  - Lazy Firebase / contact form rules — Tasks 13, 14, 15, 16 ✓
  - Reduced-motion, focus rings, skip-link — Tasks 2 (CSS), 12, 22 ✓
  - Hosting target, separate from Bakery Bash deploy — Task 24 ✓
- [x] **Placeholder scan:** No "TBD" / "TODO" / "implement later" — every step has concrete code or commands.
- [x] **Type consistency:** `Project`, `TeamMember`, `ContactPayload`, `ContactTopic`, `DemoTab` defined once, referenced consistently.
- [x] **No tasks reference undefined symbols:** all imports resolve to files created earlier in the plan.

---

## Notes

- **Time estimate:** 4–6 hours for an experienced React engineer.
- **Test coverage:** The two utilities with non-trivial logic (`GeometricAvatar` initials/hash, `submit-contact`) have unit tests. UI sections are verified visually via the dev server.
- **Photos in Team:** the spec calls out a `data-photo` slot. `TeamCard` already supports this — when a real photo URL is added to `team.ts`, `GeometricAvatar` automatically renders the image instead of the geometric pattern.
- **Real Bakery Bash screenshot:** the BakeryBashFeature mockup placeholder can be swapped for a real image by dropping a file into `website/public/` and replacing the placeholder block in `BakeryBashFeature.tsx`.
