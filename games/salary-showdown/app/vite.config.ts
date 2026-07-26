import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Build into the BACKEND project dir: hosting deploys from
  // backend/firebase.json, and firebase-tools' Config.path() rejects any
  // public dir that resolves outside the firebase.json directory
  // ("../app/dist is outside of project directory"), so the bundle has to
  // land inside backend/ for `firebase deploy --only hosting` to work.
  build: { outDir: '../backend/dist', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    exclude: ['**/node_modules/**', '**/*.itest.*'],
  },
});
