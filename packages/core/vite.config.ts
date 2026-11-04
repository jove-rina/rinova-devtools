import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    cssCodeSplit: false,
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      output: {}
    }
  }
})
