import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
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
