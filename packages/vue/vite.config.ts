import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      external: ['vue', '@rinova/devtools']
    }
  }
})
