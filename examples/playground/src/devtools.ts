import { definePlugin, h, icon, type DevtoolsPlugin } from '@rinova/devtools'
import { createVueDevtools } from '@rinova/devtools-vue'

interface QuoteRow {
  id: string
  customer: string
  amount: number
  status: string
  owner: string
}

const statusLabel: Record<string, string> = {
  draft: '草稿',
  quoted: '已报价',
  won: '已成交',
  lost: '已丢单'
}

const statusTone: Record<string, string> = {
  draft: 'neutral',
  quoted: 'info',
  won: 'ok',
  lost: 'error'
}

/** 自定义插件示例：任何框架都能用同样的方式写，不依赖 Vue */
function quotesPlugin(): DevtoolsPlugin {
  return definePlugin({
    id: 'quotes',
    title: '报价单',
    icon: 'layers',
    order: 15,
    subtitle: '业务插件示例 · 直接读取 /api/quotes',
    render(container) {
      const page = h('div', { style: { padding: '12px', height: '100%', overflow: 'auto' } })
      const toolbar = h('div', { class: 'rdt-toolbar', style: { border: '0', padding: '0 0 10px' } })
      const list = h('div')
      const title = h('span', { class: 'rdt-count', text: '最近报价单' })
      const refresh = h(
        'button',
        {
          class: 'rdt-btn rdt-btn--ghost',
          type: 'button',
          title: '重新加载',
          onClick: () => void load()
        },
        icon('refresh-cw', 14, 2)
      )
      toolbar.append(title, h('span', { class: 'rdt-toolbar__spacer' }), refresh)
      page.append(toolbar, list)
      container.appendChild(page)

      const load = async () => {
        list.textContent = '加载中…'
        try {
          const response = await fetch('/api/quotes')
          const rows = (await response.json()) as QuoteRow[]
          list.replaceChildren(
            ...rows.map((row) =>
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '9px 2px',
                    borderBottom: '1px solid var(--rdt-border)'
                  }
                },
                [
                  h('div', { style: { minWidth: '0' } }, [
                    h('div', {
                      text: row.id,
                      style: {
                        color: 'var(--rdt-text)',
                        fontFamily: 'var(--rdt-mono)',
                        fontSize: '10.5px'
                      }
                    }),
                    h('div', {
                      text: `${row.customer} · ${row.owner}`,
                      style: { color: 'var(--rdt-faint)', fontSize: '9.5px', marginTop: '2px' }
                    })
                  ]),
                  h(
                    'div',
                    { style: { textAlign: 'right', flex: 'none' } },
                    [
                      h('div', {
                        text: `¥${row.amount.toLocaleString('zh-CN')}`,
                        style: {
                          color: 'var(--rdt-text)',
                          fontFamily: 'var(--rdt-mono)',
                          fontSize: '10.5px'
                        }
                      }),
                      h('span', {
                        class: `rdt-tag rdt-tag--${statusTone[row.status] ?? 'neutral'}`,
                        text: statusLabel[row.status] ?? row.status,
                        style: { marginTop: '3px' }
                      })
                    ]
                  )
                ]
              )
            )
          )
        } catch (error) {
          list.replaceChildren(
            h('div', {
              class: 'rdt-empty__text',
              text: `加载失败：${error instanceof Error ? error.message : String(error)}`
            })
          )
        }
      }

      void load()
    }
  })
}

export const TOKEN_SAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJVLT' +
  'EwMDEiLCJuYW1lIjoi5p2O5am3Iiwicm9sZSI6InN1cGVyYWRtaW4ifQ.demo-signature'

export const devtoolsPlugin = createVueDevtools({
  appName: 'PoleMoment 报价工作台',
  version: '0.1.0-demo',
  enabled: true,
  theme: 'dark',
  dock: 'right',
  width: 560,
  shortcut: 'alt+shift+d',
  storagePrefix: 'polemoment-devtools',
  exposeGlobal: true,
  groups: [
    { id: 'iface', label: '接口', description: '网关与灰度' },
    { id: 'debug', label: '调试开关', description: '按需开启，刷新后保留' }
  ],
  config: [
    {
      key: 'gateway',
      type: 'select',
      label: '网关',
      group: 'iface',
      allowCustom: true,
      placeholder: 'https://api.example.com',
      options: [
        { label: '本地', value: 'http://localhost:5173', description: 'vite' },
        { label: '测试', value: 'https://test.polemoment.com', description: '131' },
        { label: 'Mock', value: 'http://127.0.0.1:8100', description: 'mockserver' }
      ],
      defaultValue: 'http://localhost:5173',
      description: '可直接输入任意地址，输入后自动保存'
    },
    {
      key: 'gray',
      type: 'text',
      label: '灰度版本',
      group: 'iface',
      placeholder: '例如 1.0.8',
      mono: true,
      defaultValue: ''
    },
    {
      key: 'token',
      type: 'text',
      label: 'TOKEN',
      group: 'iface',
      copyable: true,
      mono: true,
      defaultValue: TOKEN_SAMPLE,
      description: '只读字段，右侧按钮一键复制'
    },
    {
      key: 'mockEnable',
      type: 'switch',
      label: 'Mock 数据',
      group: 'iface',
      defaultValue: false,
      description: '本地接口走 MockServer'
    },
    {
      key: 'mockRecord',
      type: 'switch',
      label: '录制请求',
      group: 'iface',
      defaultValue: false
    },
    {
      key: 'abDebug',
      type: 'switch',
      label: 'AB 调试',
      group: 'debug',
      defaultValue: false,
      description: '展示实验分组与命中规则'
    },
    {
      key: 'ueDebug',
      type: 'switch',
      label: 'UE 调试',
      group: 'debug',
      defaultValue: false
    },
    {
      key: 'apiDebug',
      type: 'switch',
      label: '接口调试',
      group: 'debug',
      defaultValue: true,
      description: '请求失败时在控制台打印完整上下文'
    }
  ],
  actions: [
    {
      id: 'copy-token',
      label: '复制当前 TOKEN',
      description: '从配置中读取 token 字段',
      icon: 'key',
      run: async (ctx) => {
        await ctx.copy(String(ctx.getValue('token', '')))
      }
    },
    {
      id: 'switch-mock',
      label: '切换到 Mock 网关',
      description: '一键把网关改为 MockServer',
      icon: 'globe',
      run: (ctx) => {
        ctx.setValue('gateway', 'http://127.0.0.1:8100')
        ctx.toast('网关已切换到 Mock', 'success')
      }
    },
    {
      id: 'clear-storage',
      label: '清空演示存储',
      description: '会删除本页写入的演示数据',
      icon: 'trash',
      tone: 'danger',
      confirm: '确认清空演示存储？',
      run: (ctx) => {
        localStorage.removeItem('pm-demo-draft')
        localStorage.removeItem('pm-demo-filter')
        ctx.toast('演示存储已清空', 'success')
      }
    },
    {
      id: 'reload',
      label: '刷新页面',
      description: '保留 DevTools 配置',
      icon: 'refresh-cw',
      run: () => {
        location.reload()
      }
    }
  ],
  plugins: [quotesPlugin()],
  onConfigChange: ({ changed, values }) => {
    console.info('[demo] config changed:', changed, values[changed])
  }
})
