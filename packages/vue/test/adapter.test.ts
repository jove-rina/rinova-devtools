import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createVueDevtools, RinovaDevtools, useDevtools, type UseDevtoolsReturn } from '../src/index'
import type { DevtoolsInstance } from '@rinova/devtools'

const apps: Array<{ unmount(): void }> = []
const devtoolsInstances: DevtoolsInstance[] = []

afterEach(() => {
  while (devtoolsInstances.length) {
    try {
      devtoolsInstances.pop()?.destroy()
    } catch {
      // ignore
    }
  }
  while (apps.length) apps.pop()?.unmount()
  document.body.innerHTML = ''
  localStorage.clear()
  vi.restoreAllMocks()
})

function track<T extends { devtools: DevtoolsInstance }>(plugin: T): T {
  devtoolsInstances.push(plugin.devtools)
  return plugin
}

function mountApp(root: ReturnType<typeof defineComponent>, plugin: ReturnType<typeof createVueDevtools>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const app = createApp(root)
  app.use(plugin)
  app.mount(container)
  apps.push(app)
  return app
}

describe('createVueDevtools', () => {
  it('install 后自动挂载，并能读取 / 订阅配置值', async () => {
    const plugin = track(
      createVueDevtools({
        appName: 'Vue Test',
        storagePrefix: 'vue-adapter',
        builtinPlugins: ['config'],
        config: [{ key: 'gateway', type: 'text', label: '网关', defaultValue: 'a' }]
      })
    )
    let apiRef: UseDevtoolsReturn | null = null
    const api = () => {
      if (!apiRef) throw new Error('useDevtools not called')
      return apiRef
    }
    const Root = defineComponent({
      setup() {
        apiRef = useDevtools()
        return () => h('div', { class: 'root' }, api().values.value.gateway as string)
      }
    })
    const app = mountApp(Root, plugin)

    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(1)
    expect(app.config.globalProperties.$devtools).toBe(plugin.devtools)
    expect(api().values.value.gateway).toBe('a')

    plugin.devtools.setValue('gateway', 'b')
    await nextTick()
    expect(api().values.value.gateway).toBe('b')
    expect(api().getValue('gateway')).toBe('b')

    api().open('config')
    await nextTick()
    expect(api().isOpen.value).toBe(true)
    api().close()
    await nextTick()
    expect(api().isOpen.value).toBe(false)
  })

  it('autoMount=false 时不挂载，手动 mount 后出现宿主', () => {
    const plugin = track(
      createVueDevtools({
        appName: 'No Auto',
        storagePrefix: 'vue-no-auto',
        autoMount: false,
        builtinPlugins: ['config']
      })
    )
    const Root = defineComponent({
      setup() {
        useDevtools()
        return () => h('div')
      }
    })
    mountApp(Root, plugin)
    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(0)
    plugin.devtools.mount()
    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(1)
    plugin.devtools.destroy()
  })

  it('devtools.destroy 后宿主移除，配置值仍可读取', () => {
    const plugin = track(
      createVueDevtools({
        appName: 'Destroy',
        storagePrefix: 'vue-destroy',
        builtinPlugins: ['config'],
        values: { x: 1 },
        config: [{ key: 'x', type: 'number', label: 'X' }]
      })
    )
    mountApp(defineComponent({ setup: () => () => h('div') }), plugin)
    plugin.devtools.destroy()
    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(0)
    expect(plugin.devtools.getValue('x')).toBe(1)
  })
})

describe('RinovaDevtools 组件', () => {
  it('挂载时创建、卸载时销毁实例', async () => {
    const show = ref(true)
    const Root = defineComponent({
      setup() {
        return () =>
          show.value
            ? h(RinovaDevtools, {
                options: { appName: 'Component', storagePrefix: 'vue-component', builtinPlugins: ['config'] }
              })
            : h('div')
      }
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp(Root)
    app.mount(container)
    apps.push(app)

    await nextTick()
    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(1)

    show.value = false
    await nextTick()
    expect(document.querySelectorAll('rinova-devtools')).toHaveLength(0)
  })

  it('通过 ref 暴露 open / close / toggle', async () => {
    const instance = ref<{ open(id?: string): void; close(): void; toggle(): void } | null>(null)
    const Root = defineComponent({
      setup() {
        return () =>
          h(RinovaDevtools, {
            ref: instance,
            options: {
              appName: 'Expose',
              storagePrefix: 'vue-expose',
              builtinPlugins: ['config']
            }
          })
      }
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const app = createApp(Root)
    app.mount(container)
    apps.push(app)
    await nextTick()

    instance.value?.open('config')
    await nextTick()
    const panel = document.querySelector('rinova-devtools')?.shadowRoot?.querySelector('.rdt-panel')
    expect(panel?.classList.contains('is-open')).toBe(true)
    instance.value?.close()
    await nextTick()
    expect(panel?.classList.contains('is-open')).toBe(false)
  })
})
