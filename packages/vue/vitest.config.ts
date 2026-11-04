import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@rinova/devtools': fileURLToPath(new URL('../core/src/index.ts', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true
  }
})
