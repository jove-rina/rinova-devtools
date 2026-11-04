import { createDevtools, definePlugin, h } from '@rinova/devtools'

let count = 0
const counter = document.getElementById('count')!
const renderCount = () => {
  counter.textContent = String(count)
}

const devtools = createDevtools({
  appName: 'Vanilla 页面',
  version: '0.1.0-demo',
  theme: 'auto',
  dock: 'bottom',
  shortcut: 'alt+shift+d',
  storagePrefix: 'vanilla-demo',
  exposeGlobal: true,
  config: [
    {
      key: 'apiBase',
      type: 'select',
      label: '接口地址',
      allowCustom: true,
      options: [
        { label: '当前域', value: '' },
        { label: 'MockServer', value: 'http://127.0.0.1:8100' }
      ],
      defaultValue: ''
    },
    {
      key: 'verbose',
      type: 'switch',
      label: '详细日志',
      defaultValue: true,
      description: '开关值会持久化到 localStorage'
    }
  ],
  actions: [
    {
      id: 'reset-count',
      label: '把计数器归零',
      icon: 'rotate-ccw',
      run: () => {
        count = 0
        renderCount()
      }
    }
  ],
  plugins: [
    definePlugin({
      id: 'vanilla-note',
      title: '接入说明',
      icon: 'sparkles',
      order: 5,
      subtitle: '第三方插件同样只用原生 DOM',
      render(container, ctx) {
        container.appendChild(
          h('div', { style: { padding: '14px', fontSize: '12px', lineHeight: '1.8', color: 'var(--rdt-dim)' } }, [
            h('p', { text: '当前页面没有使用任何框架。' }),
            h('p', {
              text: '核心包只依赖 DOM API，Vue / React / Svelte 适配器都只是薄封装。',
              style: { marginTop: '6px' }
            }),
            h('p', {
              text: `配置值 verbose = ${String(ctx.getValue('verbose', false))}`,
              style: { marginTop: '10px', color: 'var(--rdt-faint)' }
            })
          ])
        )
      }
    })
  ]
})

devtools.mount()

document.getElementById('inc')!.addEventListener('click', () => {
  count += 1
  renderCount()
  console.info('[vanilla] count =', count)
})

document.getElementById('open')!.addEventListener('click', () => devtools.open())

document.getElementById('fetch')!.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/users')
    const data = await response.json()
    console.log('[vanilla] users', data)
    devtools.toast(`加载了 ${data.length} 个用户`, 'success')
  } catch (error) {
    console.error('[vanilla] users failed', error)
  }
})

document.getElementById('log')!.addEventListener('click', () => {
  console.log('[vanilla] 这是一条普通日志', { at: Date.now() })
})

document.getElementById('store')!.addEventListener('click', () => {
  const value = `value-${Date.now()}`
  localStorage.setItem('vanilla-demo-value', value)
  console.log('[vanilla] localStorage 写入', value)
  devtools.toast('已写入 localStorage', 'success')
})

renderCount()
