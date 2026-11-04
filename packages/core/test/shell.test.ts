import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDevtools, definePlugin, type PluginContext } from '../src/index'
import { click, host, mountDevtools, press, q, qa, shadow, tick } from './helpers'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createDevtools / 生命周期', () => {
  it('mount 生成唯一宿主与面板骨架', () => {
    const devtools = mountDevtools()
    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(1)
    expect(host()?.getAttribute('data-rinova-devtools')).toBe('')
    expect(shadow().querySelector('.rdt-panel')).toBeTruthy()
    expect(shadow().querySelector('.rdt-launcher')).toBeTruthy()
    expect(q('.rdt-panel').classList.contains('is-open')).toBe(false)
    expect(q('.rdt-panel').dataset.dock).toBe('right')
    expect(q('.rdt-statusbar').textContent).toContain('请求')
    expect(q('.rdt-statusbar').textContent).toContain('日志')
    expect(devtools.mounted).toBe(true)
  })

  it('重复 mount 是幂等的', () => {
    const devtools = mountDevtools()
    devtools.mount()
    devtools.mount()
    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(1)
  })

  it('destroy 清理宿主和全局监听，可重新 mount', () => {
    const devtools = mountDevtools()
    devtools.destroy()
    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(0)
    press('D', { altKey: true, shiftKey: true })
    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(0)

    devtools.mount()
    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(1)
    devtools.destroy()
  })

  it('open() 在未 mount 时自动挂载', () => {
    const devtools = createDevtools({ appName: 'Auto', enabled: true, storagePrefix: 'auto-mount' })
    expect(host()).toBeNull()
    devtools.open()
    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(1)
    expect(q('.rdt-panel').classList.contains('is-open')).toBe(true)
    devtools.destroy()
  })

  it('destroy 未挂载实例不抛错', () => {
    const devtools = createDevtools({ enabled: true })
    expect(() => devtools.destroy()).not.toThrow()
  })

  it('enabled=false 时不挂载、不操作 DOM', () => {
    mountDevtools({ enabled: false })
    expect(host()).toBeNull()
  })

  it('enabled 函数抛错时按关闭处理', () => {
    mountDevtools({
      enabled: () => {
        throw new Error('boom')
      }
    })
    expect(host()).toBeNull()
  })

  it('launcher=false 隐藏悬浮球，但 API 仍可打开面板', () => {
    const devtools = mountDevtools({ launcher: false })
    expect(q('.rdt-launcher').style.display).toBe('none')
    devtools.open()
    expect(q('.rdt-panel').classList.contains('is-open')).toBe(true)
  })

  it('面板宽度按 maxWidth 与视口夹取', () => {
    mountDevtools({ width: 2000, maxWidth: 900 })
    expect(q('.rdt-panel').style.getPropertyValue('--rdt-width')).toBe('')
    expect(shadow().querySelector('.rdt-root')?.getAttribute('style')).toContain('--rdt-width: 900px')
  })
})

describe('面板开关与快捷键', () => {
  it('open / close / toggle / isOpen', () => {
    const devtools = mountDevtools()
    expect(devtools.isOpen()).toBe(false)
    devtools.open('network')
    expect(devtools.isOpen()).toBe(true)
    expect(q('.rdt-panel').classList.contains('is-open')).toBe(true)
    expect(q('.rdt-content__title').textContent).toBe('网络')
    devtools.toggle()
    expect(devtools.isOpen()).toBe(false)
    devtools.toggle()
    expect(devtools.isOpen()).toBe(true)
    devtools.close()
    expect(devtools.isOpen()).toBe(false)
  })

  it('alt+shift+d 开关面板，Esc 关闭', () => {
    const devtools = mountDevtools()
    press('D', { altKey: true, shiftKey: true })
    expect(devtools.isOpen()).toBe(true)
    press('D', { altKey: true, shiftKey: true })
    expect(devtools.isOpen()).toBe(false)
    press('D', { altKey: true, shiftKey: true })
    press('Escape')
    expect(devtools.isOpen()).toBe(false)
  })

  it('shortcut=false 时快捷键不生效', () => {
    const devtools = mountDevtools({ shortcut: false })
    press('D', { altKey: true, shiftKey: true })
    expect(devtools.isOpen()).toBe(false)
  })

  it('快捷键大小写不敏感', () => {
    const devtools = mountDevtools()
    press('d', { altKey: true, shiftKey: true })
    expect(devtools.isOpen()).toBe(true)
  })

  it('点击悬浮球可开关面板', () => {
    const devtools = mountDevtools()
    click(q('.rdt-launcher'))
    expect(devtools.isOpen()).toBe(true)
  })
})

describe('插件注册', () => {
  it('自定义插件渲染、上下文可读写配置', () => {
    let ctx: PluginContext | null = null
    const plugin = definePlugin({
      id: 'custom',
      title: '自定义',
      icon: 'layers',
      subtitle: '测试插件',
      render(container, context) {
        ctx = context
        container.textContent = `VALUE:${context.getValue('token', '')}`
      }
    })
    const devtools = mountDevtools({
      storagePrefix: 'plugin-ctx',
      values: { token: 'abc' },
      config: [{ key: 'token', type: 'text', label: 'Token' }],
      builtinPlugins: false,
      plugins: [plugin]
    })
    devtools.open('custom')
    expect(q('.rdt-content__title').textContent).toBe('自定义')
    expect(q('.rdt-content__subtitle').textContent).toBe('测试插件')
    expect(q('.rdt-plugin-view.is-active').textContent).toBe('VALUE:abc')
    expect(ctx).not.toBeNull()
  })

  it('enabled=false 的插件不进入侧栏', () => {
    const devtools = mountDevtools({
      storagePrefix: 'plugin-disabled',
      builtinPlugins: false,
      plugins: [
        definePlugin({ id: 'off', title: '关闭', enabled: false, render: (c) => (c.textContent = 'x') }),
        definePlugin({ id: 'on', title: '开启', render: (c) => (c.textContent = 'y') })
      ]
    })
    expect(devtools.listPlugins().map((plugin) => plugin.id)).toEqual(['on'])
    expect(qa('.rdt-rail__item').map((button) => button.title)).toEqual(['开启'])
  })

  it('同 id 插件覆盖内置面板', () => {
    const devtools = mountDevtools({
      storagePrefix: 'plugin-override',
      config: [{ key: 'a', type: 'text', label: 'A' }],
      plugins: [
        definePlugin({
          id: 'config',
          title: '配置覆盖',
          render: (container) => (container.textContent = 'OVERRIDE')
        })
      ]
    })
    expect(qa('.rdt-rail__item').map((button) => button.title)).toContain('配置覆盖')
    devtools.open('config')
    expect(q('.rdt-plugin-view.is-active').textContent).toBe('OVERRIDE')
  })

  it('builtinPlugins=false 只保留业务插件', () => {
    mountDevtools({
      storagePrefix: 'plugin-only',
      builtinPlugins: false,
      plugins: [definePlugin({ id: 'only', title: '唯一', render: () => {} })]
    })
    expect(qa('.rdt-rail__item').map((button) => button.title)).toEqual(['唯一'])
  })

  it('builtinPlugins 数组作为白名单', () => {
    mountDevtools({ storagePrefix: 'plugin-allow', builtinPlugins: ['config', 'network'] })
    expect(qa('.rdt-rail__item').map((button) => button.title)).toEqual(['配置', '网络'])
  })

  it('builtinPlugins=false 且无业务插件时显示空态', () => {
    const devtools = mountDevtools({ storagePrefix: 'plugin-empty', builtinPlugins: false })
    devtools.open()
    expect(q('.rdt-content__title').textContent).toBe('开发者工具')
    expect(q('.rdt-empty').textContent).toContain('还没有可用的调试面板')
    expect(qa('.rdt-rail__item')).toHaveLength(0)

    const dispose = devtools.registerPlugin(
      definePlugin({ id: 'first', title: '第一个', render: (c) => (c.textContent = 'FIRST') })
    )
    expect(q('.rdt-content__title').textContent).toBe('第一个')
    expect(q('.rdt-plugin-view.is-active').textContent).toBe('FIRST')
    dispose()
    expect(q('.rdt-empty').textContent).toContain('还没有可用的调试面板')
  })

  it('非法的 activePlugin 回退到第一个面板', () => {
    localStorage.setItem(
      'plugin-invalid-active:ui',
      JSON.stringify({ activePlugin: 'ghost', theme: 'dark', dock: 'right', width: 560 })
    )
    const devtools = mountDevtools({
      storagePrefix: 'plugin-invalid-active',
      builtinPlugins: false,
      plugins: [
        definePlugin({ id: 'first', title: '第一个', render: () => {} }),
        definePlugin({ id: 'second', title: '第二个', render: () => {} })
      ]
    })
    devtools.open()
    expect(q('.rdt-content__title').textContent).toBe('第一个')
    expect(q('.rdt-rail__item.is-active').title).toBe('第一个')
  })

  it('插件渲染异常被隔离，面板显示错误信息', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const devtools = mountDevtools({
      storagePrefix: 'plugin-error',
      builtinPlugins: false,
      plugins: [
        definePlugin({
          id: 'broken',
          title: '坏插件',
          render() {
            throw new Error('render failed')
          }
        })
      ]
    })
    devtools.open('broken')
    expect(q('.rdt-plugin-view.is-active').textContent).toContain('渲染失败')
    expect(q('.rdt-plugin-view.is-active').textContent).toContain('render failed')
  })

  it('removePlugin 移除当前面板后切到其它插件', () => {
    const devtools = mountDevtools({
      storagePrefix: 'plugin-remove',
      builtinPlugins: false,
      plugins: [
        definePlugin({ id: 'a', title: 'A', render: () => {} }),
        definePlugin({ id: 'b', title: 'B', render: () => {} })
      ]
    })
    devtools.open('a')
    devtools.removePlugin('a')
    expect(devtools.listPlugins().map((plugin) => plugin.id)).toEqual(['b'])
    expect(q('.rdt-content__title').textContent).toBe('B')
  })

  it('registerPlugin 运行时注册并返回注销函数', () => {
    const devtools = mountDevtools({ storagePrefix: 'plugin-runtime', builtinPlugins: false })
    const dispose = devtools.registerPlugin(
      definePlugin({ id: 'late', title: '后注册', render: (c) => (c.textContent = 'late') })
    )
    expect(qa('.rdt-rail__item').map((button) => button.title)).toContain('后注册')
    dispose()
    expect(qa('.rdt-rail__item').map((button) => button.title)).not.toContain('后注册')
  })

  it('插件私有存储按 id 隔离', () => {
    const seen: string[] = []
    const make = (id: string, key: string, value: string) =>
      definePlugin({
        id,
        title: id,
        render: (_container, ctx) => {
          ctx.storage.set(key, value)
          seen.push(ctx.storage.get(key, ''))
        }
      })
    mountDevtools({
      storagePrefix: 'plugin-storage',
      builtinPlugins: false,
      plugins: [make('p1', 'token', 'one'), make('p2', 'token', 'two')]
    })
    expect(seen).toEqual(['one', 'two'])
    const raw = JSON.parse(localStorage.getItem('plugin-storage:plugin:p1:token') ?? 'null')
    expect(raw).toBe('one')
  })
})

describe('配置与设置持久化', () => {
  it('配置变更触发 onConfigChange 与 config:change', () => {
    const onChange = vi.fn()
    const devtools = mountDevtools({
      storagePrefix: 'config-events',
      config: [{ key: 'gateway', type: 'text', label: '网关' }],
      values: { gateway: 'a' },
      onConfigChange: onChange
    })
    const listener = vi.fn()
    devtools.on('config:change', listener)
    devtools.setValue('gateway', 'b')
    expect(devtools.getValue('gateway')).toBe('b')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ changed: 'gateway', source: 'program' }))
    expect(listener).toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('config-events:values') ?? '{}').gateway).toBe('b')
  })

  it('设置面板切换主题并持久化', () => {
    const devtools = mountDevtools({ storagePrefix: 'ui-theme' })
    devtools.open('settings')
    const light = qa<HTMLButtonElement>('.rdt-segmented__item').find((button) =>
      button.textContent?.includes('浅色')
    )
    expect(light).toBeTruthy()
    click(light!)
    expect(shadow().querySelector('.rdt-root')?.getAttribute('data-theme')).toBe('light')
    expect(JSON.parse(localStorage.getItem('ui-theme:ui') ?? '{}').theme).toBe('light')
  })

  it('设置面板切换停靠方向', () => {
    const devtools = mountDevtools({ storagePrefix: 'ui-dock' })
    devtools.open('settings')
    const left = qa<HTMLButtonElement>('.rdt-segmented__item').find((button) =>
      button.textContent?.includes('左侧')
    )
    click(left!)
    expect(q('.rdt-panel').dataset.dock).toBe('left')
    expect(JSON.parse(localStorage.getItem('ui-dock:ui') ?? '{}').dock).toBe('left')
  })

  it('拖拽宽度滑杆更新 CSS 变量并持久化', () => {
    const devtools = mountDevtools({ storagePrefix: 'ui-width' })
    devtools.open('settings')
    const range = q<HTMLInputElement>('.rdt-range')
    range.value = '700'
    range.dispatchEvent(new Event('input', { bubbles: true }))
    expect(shadow().querySelector('.rdt-root')?.getAttribute('style')).toContain('--rdt-width: 700px')
    expect(JSON.parse(localStorage.getItem('ui-width:ui') ?? '{}').width).toBe(700)
  })

  it('拖拽面板左边缘调整宽度', () => {
    const devtools = mountDevtools({ storagePrefix: 'ui-resize', dock: 'right' })
    devtools.open('settings')
    const handle = q('.rdt-resizer')
    const pointer = (type: string, x: number) =>
      handle.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 400, pointerId: 1 })
      )
    pointer('pointerdown', 800)
    pointer('pointermove', 600)
    pointer('pointerup', 600)
    expect(shadow().querySelector('.rdt-root')?.getAttribute('style')).toContain('--rdt-width: 412px')
  })

  it('底部停靠拖拽上边缘调整高度', () => {
    const devtools = mountDevtools({ storagePrefix: 'ui-resize-bottom', dock: 'bottom' })
    devtools.open('settings')
    const handle = q('.rdt-resizer')
    const pointer = (type: string, y: number) =>
      handle.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, clientX: 500, clientY: y, pointerId: 1 })
      )
    pointer('pointerdown', 500)
    pointer('pointermove', 400)
    pointer('pointerup', 400)
    expect(parseInt(q('.rdt-panel').style.height, 10)).toBe(window.innerHeight - 400 - 12)
  })

  it('拖拽悬浮球保存坐标，靠近右边缘吸附', () => {
    mountDevtools({ storagePrefix: 'launcher-drag' })
    const launcher = q('.rdt-launcher')
    const pointer = (type: string, x: number, y: number) =>
      launcher.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 })
      )
    pointer('pointerdown', 0, 0)
    pointer('pointermove', 500, 300)
    pointer('pointermove', 1000, 300)
    pointer('pointerup', 1000, 300)
    expect(launcher.style.left).toBe('960px')
    expect(launcher.dataset.edge).toBe('right')
    const saved = JSON.parse(localStorage.getItem('launcher-drag:ui') ?? '{}').launcher
    expect(saved).toEqual({ x: 960, y: 300 })
  })

  it('清除本地数据恢复配置默认值与界面默认值', () => {
    const devtools = mountDevtools({
      storagePrefix: 'ui-reset',
      builtinPlugins: ['settings'],
      config: [{ key: 'gateway', type: 'text', label: '网关', defaultValue: 'default' }],
      values: { gateway: 'changed' }
    })
    devtools.setValue('gateway', 'changed')
    devtools.open('settings')
    const resetButton = qa<HTMLButtonElement>('.rdt-btn').find((button) =>
      button.textContent?.includes('清除本工具数据')
    )
    expect(resetButton).toBeTruthy()
    click(resetButton!)
    click(resetButton!)
    expect(devtools.getValue('gateway')).toBe('default')
    expect(JSON.parse(localStorage.getItem('ui-reset:ui') ?? '{}').theme).toBe('dark')
  })

  it('损坏的 UI / values JSON 回退默认值，不抛错', () => {
    localStorage.setItem('bad-json:ui', '{not json')
    localStorage.setItem('bad-json:values', '{not json')
    const devtools = mountDevtools({
      storagePrefix: 'bad-json',
      config: [{ key: 'x', type: 'text', label: 'X', defaultValue: 'ok' }]
    })
    expect(devtools.getValue('x')).toBe('ok')
    expect(q('.rdt-panel').dataset.dock).toBe('right')
  })

  it('非法的界面偏好被忽略', () => {
    localStorage.setItem(
      'bad-ui:ui',
      JSON.stringify({ theme: 'neon', dock: 'top', width: 'wide', launcher: { x: 'a' }, activePlugin: 1 })
    )
    mountDevtools({ storagePrefix: 'bad-ui' })
    expect(shadow().querySelector('.rdt-root')?.getAttribute('data-theme')).toBe('dark')
    expect(q('.rdt-panel').dataset.dock).toBe('right')
  })
})

describe('角标与状态栏', () => {
  it('console 错误累计到悬浮球角标与日志计数', async () => {
    mountDevtools({ storagePrefix: 'badge' })
    console.error('badge-test')
    await tick()
    expect(q('.rdt-launcher__badge').style.display).toBe('')
    expect(q('.rdt-launcher__badge').textContent).toBe('1')
    expect(q('.rdt-statusbar').textContent).toContain('1 日志')
  })
})
