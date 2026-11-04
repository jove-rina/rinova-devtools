import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

/** 演示用 API：真实 fetch 请求，便于 DevTools 网络面板采集 */
function mockApi(): Plugin {
  const routes: Record<string, (body: string) => { status?: number; json: unknown; delay?: number }> = {
    '/api/summary': () => ({
      json: {
        quotes: 42,
        amount: 1286400,
        pending: 6,
        margin: 18.6
      }
    }),
    '/api/quotes': () => ({
      json: [
        { id: 'PM-2411-042', customer: '远洋建设', amount: 386000, status: 'draft', owner: '李婷' },
        { id: 'PM-2411-041', customer: '恒基物流', amount: 128400, status: 'quoted', owner: '王锐' },
        { id: 'PM-2411-038', customer: '南岸置地', amount: 642000, status: 'won', owner: '陈默' },
        { id: 'PM-2411-036', customer: '同益钢构', amount: 130000, status: 'lost', owner: '周敏' }
      ]
    }),
    '/api/slow': () => ({
      delay: 1200,
      json: { ok: true, message: '慢请求完成', cost: 1200 }
    }),
    '/api/error': () => ({
      status: 500,
      json: { code: 'QUOTE_LOCKED', message: '报价单已被其他用户锁定' }
    }),
    '/api/users': () => ({
      json: [
        { id: 'U-1001', name: '李婷', role: 'superadmin' },
        { id: 'U-1002', name: '王锐', role: 'admin' },
        { id: 'U-1003', name: '陈默', role: 'employee' }
      ]
    })
  }

  return {
    name: 'rinova-playground-mock-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const handler = routes[url.pathname]
        if (!handler) return next()
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', () => {
          const result = handler(body)
          setTimeout(() => {
            res.statusCode = result.status ?? 200
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(result.json))
          }, result.delay ?? 120)
        })
      })
    }
  }
}

export default defineConfig({
  plugins: [vue(), mockApi()],
  server: {
    port: 5178,
    strictPort: true
  },
  resolve: {
    alias: {
      '@rinova/devtools': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@rinova/devtools-vue': fileURLToPath(new URL('../../packages/vue/src/index.ts', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        vanilla: fileURLToPath(new URL('vanilla.html', import.meta.url))
      }
    }
  }
})
