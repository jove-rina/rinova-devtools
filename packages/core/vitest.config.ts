import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/env.d.ts', 'src/**/*.d.ts'],
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 75,
        lines: 80
      }
    }
  }
})
