import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Force the BROWSER (WebChannel) Firestore build — the transport students'
// laptops actually use. Vitest resolves with Vite's *server* conditions, which
// drop `browser`, and @firebase/firestore's exports map lists `node` before
// `browser` anyway, so a resolve.conditions tweak cannot win: only an explicit
// alias selects it. Without this the suite runs the Node/gRPC build, which is
// never shipped and whose Listen stream desynchronises against the Firestore
// emulator (emulator-side ListenResponse framing race) — the client SDK then
// treats it as a retryable stream failure, enters 60s maximum backoff, and
// silently stops delivering snapshots without ever calling the onSnapshot error
// callback. See docs/superpowers/salary-showdown-HANDOFF.md §3.
const browserBuild = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@firebase\/firestore$/,
        replacement: browserBuild('./node_modules/@firebase/firestore/dist/index.esm.js'),
      },
      {
        find: /^firebase\/firestore$/,
        replacement: browserBuild('./node_modules/firebase/firestore/dist/esm/index.esm.js'),
      },
    ],
  },
  test: {
    // The alias above only bites if Vite — not Node's own ESM loader — does the
    // resolving, so the Firestore packages must be inlined rather than
    // externalised as ordinary node_modules deps.
    server: { deps: { inline: [/@firebase\/firestore/, /firebase\/firestore/, /webchannel-wrapper/] } },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    include: ['src/**/*.itest.{ts,tsx}'],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
