import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', '__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    // tests/api/ holds Playwright API contract tests that hit a real running
    // server — they intentionally do not run under Vitest. tests/e2e/ is
    // Playwright too.
    exclude: ['node_modules', '.next', 'lib/**', 'tests/e2e/**', 'tests/api/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '.next/',
        'tailwind.config.ts',
        'next.config.mjs',
        'postcss.config.mjs',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
