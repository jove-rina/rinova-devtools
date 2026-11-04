import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { definePlugin } from '../src/index'
import { click, mountDevtools, q, qa, shadow, tick, type } from './helpers'

const realFetch = window.fetch
let clipboardText = ''

function stubClipboard() {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text: string) => {
      clipboardText = text
    } }
  })
}

function fakeResponse(status = 200, body = '{"ok":true}', contentType = 'application/json'): Response {
  const headers = new Map<string, string>([
    ['content-type', contentType],
    ['content-length', String(body.length)]
  ])
  const make = (): Response =>
    ({
      status,
      ok: status >= 200 && status < 300,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: {
        get: (name: string) => headers.get(name.toLowerCase()) ?? null,
        forEach: (cb: (value: string, key: string) => void) => headers.forEach((value, key) => cb(value, key))
      },
      clone: () => make(),
      text: async () => body
    }) as unknown as Response
  return make()
}

function fieldByLabel(label: string): HTMLElement {
  const field = qa('.rdt-field').find(
    (item) => item.querySelector('.rdt-field__label')?.textContent === label
  )
  if (!field) throw new Error(`field not found: ${label}`)
  return field
}

beforeEach(() => {
  clipboardText = ''
})

afterEach(() => {
  window.fetch = realFetch
  vi.restoreAllMocks()
  delete (navigator as { clipboard?: unknown }).clipboard
})

describe('配置面板', () => {
  function mountConfig() {
    const devtools = mountDevtools({
      storagePrefix: 'panel-config',
      groups: [
        { id: 'iface', label: '接口', description: '网关配置' },
        { id: 'debug', label: '调试' }
      ],
      config: [
        {
          key: 'gateway',
          type: 'select',
          label: '网关',
          group: 'iface',
          allowCustom: true,
          options: [
            { label: '本地', value: 'http://local', description: 'localhost' },
            { label: 'Mock', value: 'http://mock', description: '8100' }
          ],
          defaultValue: 'http://local'
        },
        { key: 'token', type: 'text', label: 'TOKEN', group: 'iface', copyable: true, defaultValue: 'secret' },
        { key: 'mock', type: 'switch', label: 'Mock', group: 'iface', defaultValue: false },
        { key: 'retry', type: 'number', label: '重试', group: 'debug', defaultValue: 3, min: 1, max: 5 }
      ]
    })
    devtools.open('config')
    return devtools
  }

  it('按分组渲染字段，副标题显示数量', () => {
    mountConfig()
    expect(q('.rdt-content__subtitle').textContent).toContain('4 项')
    expect(qa('.rdt-group__title').map((el) => el.textContent)).toEqual(['接口', '调试'])
  })

  it('自由输入网关即时写入并持久化', () => {
    const devtools = mountConfig()
    const input = fieldByLabel('网关').querySelector('input') as HTMLInputElement
    type(input, 'https://custom.example.com')
    expect(devtools.getValue('gateway')).toBe('https://custom.example.com')
    expect(JSON.parse(localStorage.getItem('panel-config:values') ?? '{}').gateway).toBe(
      'https://custom.example.com'
    )
  })

  it('预设菜单展开、选择与外部点击关闭', () => {
    const devtools = mountConfig()
    const field = fieldByLabel('网关')
    const addon = field.querySelector('.rdt-input-addon') as HTMLButtonElement
    click(addon)
    expect((field.querySelector('.rdt-menu') as HTMLElement).style.display).toBe('')
    const mockOption = [...field.querySelectorAll('.rdt-menu__item')].find((button) =>
      button.textContent?.includes('Mock')
    ) as HTMLButtonElement
    click(mockOption)
    expect(devtools.getValue('gateway')).toBe('http://mock')
    expect((field.querySelector('.rdt-menu') as HTMLElement).style.display).toBe('none')

    click(addon)
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect((field.querySelector('.rdt-menu') as HTMLElement).style.display).toBe('none')
  })

  it('开关点击切换布尔值', () => {
    const devtools = mountConfig()
    click(fieldByLabel('Mock').querySelector('.rdt-switch') as HTMLElement)
    expect(devtools.getValue('mock')).toBe(true)
    click(fieldByLabel('Mock').querySelector('.rdt-switch') as HTMLElement)
    expect(devtools.getValue('mock')).toBe(false)
  })

  it('数字字段夹取范围', () => {
    const devtools = mountConfig()
    const input = fieldByLabel('重试').querySelector('input') as HTMLInputElement
    input.value = '99'
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(devtools.getValue('retry')).toBe(5)
    input.value = '0'
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(devtools.getValue('retry')).toBe(1)
  })

  it('只读 token 可复制并提示', async () => {
    stubClipboard()
    mountConfig()
    const copy = [...fieldByLabel('TOKEN').querySelectorAll('button')].find((button) =>
      button.textContent?.includes('复制')
    ) as HTMLButtonElement
    click(copy)
    await tick()
    expect(clipboardText).toBe('secret')
    expect(shadow().querySelector('.rdt-toast')?.textContent).toContain('已复制')
  })

  it('恢复默认清空用户修改', () => {
    const devtools = mountConfig()
    const input = fieldByLabel('网关').querySelector('input') as HTMLInputElement
    type(input, 'http://changed')
    const reset = qa<HTMLButtonElement>('.rdt-btn').find((button) =>
      button.textContent?.includes('恢复默认')
    ) as HTMLButtonElement
    click(reset)
    expect(devtools.getValue('gateway')).toBe('http://local')
  })

  it('动态注册字段后面板自动重建', () => {
    const devtools = mountConfig()
    expect(qa('.rdt-field').some((field) => field.textContent?.includes('新字段'))).toBe(false)
    devtools.registerConfigField({ key: 'extra', type: 'text', label: '新字段', group: 'debug' })
    expect(qa('.rdt-field').some((field) => field.textContent?.includes('新字段'))).toBe(true)
  })
})

describe('网络面板', () => {
  it('记录请求、过滤、查看详情与复制 cURL', async () => {
    stubClipboard()
    window.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return url.includes('error') ? fakeResponse(500, '{"message":"bad"}') : fakeResponse(200, '{"ok":true}')
    }) as never
    const devtools = mountDevtools({ storagePrefix: 'panel-net' })
    await window.fetch('/api/ok')
    await window.fetch('/api/error')
    await tick(30)
    devtools.open('network')

    expect(qa('.rdt-netrow')).toHaveLength(2)
    expect(q('.rdt-content__subtitle').textContent).toContain('1 个异常')

    const errorChip = qa<HTMLButtonElement>('.rdt-chip').find((chip) =>
      chip.textContent?.includes('异常')
    ) as HTMLButtonElement
    click(errorChip)
    expect(qa('.rdt-netrow')).toHaveLength(1)
    expect(q('.rdt-netrow').textContent).toContain('/api/error')

    click(q('.rdt-netrow'))
    expect(q('.rdt-detail').style.display).toBe('')
    expect(q('.rdt-detail').textContent).toContain('500')
    expect(q('.rdt-detail').textContent).toContain('bad')

    const curl = [...q('.rdt-detail').querySelectorAll('button')].find((button) =>
      button.textContent?.includes('复制 cURL')
    ) as HTMLButtonElement
    click(curl)
    await tick()
    expect(clipboardText).toContain('curl')
    expect(clipboardText).toContain('/api/error')
  })

  it('搜索过滤、返回列表与重放', async () => {
    const fetchSpy = vi.fn(async () => fakeResponse())
    window.fetch = fetchSpy as never
    const devtools = mountDevtools({ storagePrefix: 'panel-net-2' })
    await window.fetch('/api/alpha')
    await window.fetch('/api/beta')
    await tick(30)
    devtools.open('network')

    const search = q<HTMLInputElement>('.rdt-net .rdt-input')
    type(search, 'beta')
    expect(qa('.rdt-netrow')).toHaveLength(1)

    click(q('.rdt-netrow'))
    const replay = [...q('.rdt-detail').querySelectorAll('button')].find((button) =>
      button.textContent?.includes('重放')
    ) as HTMLButtonElement
    await click(replay)
    await tick(40)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(devtools.network.entries()).toHaveLength(3)

    const back = q('.rdt-detail .rdt-btn') as HTMLButtonElement
    click(back)
    expect(q('.rdt-detail').style.display).toBe('none')
  })

  it('暂停采集与清空记录', async () => {
    window.fetch = vi.fn(async () => fakeResponse()) as never
    const devtools = mountDevtools({ storagePrefix: 'panel-net-3' })
    await window.fetch('/api/one')
    await tick(30)
    devtools.open('network')

    const captureSwitch = q('.rdt-toolbar .rdt-switch') as HTMLButtonElement
    click(captureSwitch)
    expect(devtools.network.capturing()).toBe(false)
    await window.fetch('/api/two')
    expect(devtools.network.entries()).toHaveLength(1)

    const clear = q('.rdt-toolbar button[title="清空记录"]') as HTMLButtonElement
    click(clear)
    expect(devtools.network.entries()).toHaveLength(0)
    expect(q('.rdt-empty').textContent).toContain('还没有请求记录')
  })
})

describe('存储面板', () => {
  it('展示、编辑、新增与删除 localStorage', () => {
    localStorage.setItem('biz-key', 'old')
    const devtools = mountDevtools({ storagePrefix: 'panel-store' })
    devtools.open('storage')

    const row = qa('.rdt-store-row').find((item) => item.textContent?.includes('biz-key'))
    expect(row).toBeTruthy()
    click(row!)
    const textarea = q<HTMLTextAreaElement>('.rdt-store-edit textarea')
    textarea.value = 'new-value'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    const save = [...qa<HTMLButtonElement>('.rdt-store-edit .rdt-btn')].find((button) =>
      button.textContent?.includes('保存')
    ) as HTMLButtonElement
    click(save)
    expect(localStorage.getItem('biz-key')).toBe('new-value')

    const add = qa<HTMLButtonElement>('.rdt-toolbar .rdt-btn').find((button) =>
      button.textContent?.includes('新增')
    ) as HTMLButtonElement
    click(add)
    const keyInput = q<HTMLInputElement>('.rdt-store-edit input')
    type(keyInput, 'created-key')
    const area = q<HTMLTextAreaElement>('.rdt-store-edit textarea')
    area.value = 'created-value'
    area.dispatchEvent(new Event('input', { bubbles: true }))
    const saveNew = [...qa<HTMLButtonElement>('.rdt-store-edit .rdt-btn')].find((button) =>
      button.textContent?.includes('保存')
    ) as HTMLButtonElement
    click(saveNew)
    expect(localStorage.getItem('created-key')).toBe('created-value')

    const createdRow = qa('.rdt-store-row').find((item) => item.textContent?.includes('created-key'))
    click(createdRow!)
    const remove = [...qa<HTMLButtonElement>('.rdt-store-edit .rdt-btn')].find((button) =>
      button.textContent?.includes('删除')
    ) as HTMLButtonElement
    click(remove)
    expect(localStorage.getItem('created-key')).toBeNull()
  })

  it('存储 key / value 按文本渲染，不执行 HTML', () => {
    localStorage.setItem('<img src=x onerror="window.__xss=1">', '<b>bold</b>')
    const devtools = mountDevtools({ storagePrefix: 'panel-store-xss' })
    devtools.open('storage')
    const row = qa('.rdt-store-row').find((item) => item.textContent?.includes('onerror'))
    expect(row).toBeTruthy()
    expect(shadow().querySelector('img')).toBeNull()
    expect(shadow().querySelector('b')).toBeNull()
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined()
  })

  it('切回面板时读取业务新写入的存储', () => {
    const devtools = mountDevtools({ storagePrefix: 'panel-store-refresh' })
    devtools.open('storage')
    expect(qa('.rdt-store-row').some((row) => row.textContent?.includes('late-key'))).toBe(false)
    localStorage.setItem('late-key', '1')
    devtools.open('config')
    devtools.open('storage')
    expect(qa('.rdt-store-row').some((row) => row.textContent?.includes('late-key'))).toBe(true)
  })

  it('Cookie 展示与删除', () => {
    document.cookie = 'rdt_cookie=abc; path=/'
    const devtools = mountDevtools({ storagePrefix: 'panel-store-cookie' })
    devtools.open('storage')
    const cookieTab = qa<HTMLButtonElement>('.rdt-tab').find((tab) =>
      tab.textContent?.includes('Cookie')
    ) as HTMLButtonElement
    click(cookieTab)
    const row = qa('.rdt-store-row').find((item) => item.textContent?.includes('rdt_cookie'))
    expect(row).toBeTruthy()
    click(row!)
    const remove = [...qa<HTMLButtonElement>('.rdt-store-edit .rdt-btn')].find((button) =>
      button.textContent?.includes('删除 Cookie')
    ) as HTMLButtonElement
    click(remove)
    expect(document.cookie).not.toContain('rdt_cookie')
  })
})

describe('日志面板', () => {
  it('捕获、过滤、搜索与清空', () => {
    const devtools = mountDevtools({ storagePrefix: 'panel-log' })
    console.log('hello world')
    console.warn('careful')
    console.error('boom')
    devtools.open('console')
    const consoleView = shadow().querySelector('.rdt-plugin-view[data-plugin="console"]') as HTMLElement
    expect(consoleView.querySelectorAll('.rdt-logrow')).toHaveLength(3)

    const errorChip = [...consoleView.querySelectorAll<HTMLButtonElement>('.rdt-chip')].find((chip) =>
      chip.textContent?.includes('错误')
    ) as HTMLButtonElement
    click(errorChip)
    expect(consoleView.querySelectorAll('.rdt-logrow')).toHaveLength(1)
    expect(consoleView.querySelector('.rdt-logrow')?.textContent).toContain('boom')

    const allChip = [...consoleView.querySelectorAll<HTMLButtonElement>('.rdt-chip')].find((chip) =>
      chip.textContent?.includes('全部')
    ) as HTMLButtonElement
    click(allChip)
    const search = q<HTMLInputElement>('.rdt-logs .rdt-input')
    type(search, 'hello')
    expect(consoleView.querySelectorAll('.rdt-logrow')).toHaveLength(1)

    const clear = q<HTMLButtonElement>('.rdt-toolbar button[title="清空日志"]')
    click(clear)
    expect(qa('.rdt-logrow')).toHaveLength(0)
  })

  it('双击复制单条日志', async () => {
    stubClipboard()
    const devtools = mountDevtools({ storagePrefix: 'panel-log-copy' })
    console.log('copy me')
    devtools.open('console')
    q('.rdt-logrow').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await tick()
    expect(clipboardText).toContain('copy me')
  })
})

describe('快捷操作面板', () => {
  it('普通动作只执行一次', async () => {
    const run = vi.fn()
    const devtools = mountDevtools({
      storagePrefix: 'panel-action',
      actions: [{ id: 'run', label: '执行一次', icon: 'zap', run }]
    })
    devtools.open('actions')
    click(q('.rdt-action__run .rdt-btn'))
    await tick()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('危险动作需要二次确认，点击卡片不会绕过', async () => {
    const run = vi.fn()
    const devtools = mountDevtools({
      storagePrefix: 'panel-action-confirm',
      actions: [{ id: 'danger', label: '危险', tone: 'danger', confirm: '确定？', run }]
    })
    devtools.open('actions')
    click(q('.rdt-action'))
    await tick()
    expect(run).not.toHaveBeenCalled()
    expect(q('.rdt-action__run .rdt-btn').textContent).toContain('确认执行')
    click(q('.rdt-action__run .rdt-btn'))
    await tick()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('运行时增删动作同步到面板', () => {
    const devtools = mountDevtools({ storagePrefix: 'panel-action-runtime', actions: [] })
    devtools.open('actions')
    expect(q('.rdt-actions').textContent).toContain('还没有注册快捷操作')
    const dispose = devtools.registerAction({ id: 'late', label: '后加动作', run: () => {} })
    expect(q('.rdt-actions').textContent).toContain('后加动作')
    dispose()
    expect(q('.rdt-actions').textContent).toContain('还没有注册快捷操作')
  })
})

describe('设置面板', () => {
  it('展示版本、快捷键与存储命名空间', () => {
    const devtools = mountDevtools({ storagePrefix: 'panel-settings', version: '1.2.3' })
    devtools.open('settings')
    const about = q('.rdt-about').textContent ?? ''
    expect(about).toContain('v1.2.3')
    expect(about).toContain('alt+shift+d')
    expect(about).toContain('panel-settings')
  })

  it('跟随系统主题映射为深/浅色', () => {
    const devtools = mountDevtools({ storagePrefix: 'panel-settings-auto' })
    devtools.open('settings')
    const auto = qa<HTMLButtonElement>('.rdt-segmented__item').find((button) =>
      button.textContent?.includes('跟随系统')
    ) as HTMLButtonElement
    click(auto)
    const theme = shadow().querySelector('.rdt-root')?.getAttribute('data-theme')
    expect(['dark', 'light']).toContain(theme)
  })
})

describe('插件懒刷新', () => {
  it('plugin:activate 事件在切换面板时触发', () => {
    let count = 0
    const devtools = mountDevtools({
      storagePrefix: 'panel-activate',
      builtinPlugins: false,
      plugins: [
        definePlugin({
          id: 'lazy',
          title: '懒加载',
          render: (_container, ctx) => {
            ctx.on('plugin:activate', () => {
              count += 1
            })
          }
        }),
        definePlugin({ id: 'other', title: '其它', render: () => {} })
      ]
    })
    devtools.open('lazy')
    count = 0
    devtools.open('other')
    devtools.open('lazy')
    expect(count).toBe(2)
  })
})
