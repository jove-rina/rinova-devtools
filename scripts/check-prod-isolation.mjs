/**
 * 生产隔离检查：验证 `if (import.meta.env.DEV) { await import('@rinova/devtools') }`
 * 在 production build 中确实被摇掉，产物不包含任何 devtools 代码。
 *
 * 运行：node scripts/check-prod-isolation.mjs
 */
import { build } from 'vite'
import { fileURLToPath } from 'node:url'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workDir = path.join(repoRoot, 'node_modules', '.cache', 'rdt-prod-isolation')
const entryFile = path.join(workDir, 'entry.js')
const outDir = path.join(workDir, 'dist')

await fs.rm(workDir, { recursive: true, force: true })
await fs.mkdir(workDir, { recursive: true })

await fs.writeFile(
  entryFile,
  `
const bootstrap = async () => {
  if (import.meta.env.DEV) {
    const { createDevtools } = await import('@rinova/devtools')
    createDevtools({ appName: 'isolation-check' }).mount()
  }
  document.body.dataset.ready = '1'
}
bootstrap()
`
)

await build({
  root: workDir,
  logLevel: 'silent',
  resolve: {
    alias: {
      '@rinova/devtools': path.join(repoRoot, 'packages/core/src/index.ts')
    }
  },
  build: {
    outDir,
    emptyOutDir: true,
    minify: true,
    lib: {
      entry: entryFile,
      formats: ['es'],
      fileName: () => 'bundle.js'
    }
  }
})

const files = await fs.readdir(outDir)
const jsFiles = files.filter((file) => file.endsWith('.js'))
assert.ok(jsFiles.length > 0, 'build produced no js output')

const markers = ['rdt-launcher', 'createDevtools', 'rinova-devtools', 'shadowRoot']
let matched = []
let total = 0
for (const file of jsFiles) {
  const code = await fs.readFile(path.join(outDir, file), 'utf8')
  total += code.length
  for (const marker of markers) {
    if (code.includes(marker)) matched.push(`${file}: ${marker}`)
  }
}

if (matched.length) {
  console.error(`FAIL 生产产物仍包含 devtools 代码: ${matched.join(', ')}`)
  process.exit(1)
}

console.log(`PASS 生产产物已剔除 devtools（${jsFiles.join(', ')}，${total} bytes）`)
