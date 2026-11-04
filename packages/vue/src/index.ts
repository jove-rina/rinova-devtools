import {
  defineComponent,
  getCurrentInstance,
  inject,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  provide,
  ref,
  shallowRef,
  type App,
  type InjectionKey,
  type PropType,
  type ShallowRef
} from 'vue'
import {
  createDevtools,
  type ConfigChangePayload,
  type ConfigValue,
  type DevtoolsInstance,
  type DevtoolsOptions,
  type ValueMap
} from '@rinova/devtools'

export const DEVTOOLS_KEY: InjectionKey<DevtoolsInstance> = Symbol('rinova-devtools')

export interface VueDevtoolsOptions extends DevtoolsOptions {
  /** app.use 时自动挂载，默认 true */
  autoMount?: boolean
}

export interface VueDevtoolsPlugin {
  devtools: DevtoolsInstance
  install(app: App): void
}

/**
 * Vue 3 插件：接管实例生命周期，并向下提供 inject key。
 *
 * ```ts
 * app.use(createVueDevtools({ appName: 'My App', enabled: import.meta.env.DEV }))
 * ```
 */
export function createVueDevtools(options: VueDevtoolsOptions = {}): VueDevtoolsPlugin {
  const { autoMount = true, ...coreOptions } = options
  const devtools = createDevtools(coreOptions)

  const mount = () => {
    if (autoMount) devtools.mount()
  }

  return {
    devtools,
    install(app: App) {
      app.provide(DEVTOOLS_KEY, devtools)
      app.config.globalProperties.$devtools = devtools
      if (!autoMount) return
      if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true })
      } else {
        mount()
      }
    }
  }
}

export interface UseDevtoolsReturn {
  devtools: DevtoolsInstance
  /** 配置值的响应式快照，任意键变更后整体替换 */
  values: ShallowRef<ValueMap>
  isOpen: ShallowRef<boolean>
  open(pluginId?: string): void
  close(): void
  toggle(): void
  getValue<T extends ConfigValue = ConfigValue>(key: string, fallback?: T): T
  setValue(key: string, value: ConfigValue): void
}

/**
 * 在组件内读取配置值并保持响应式。
 * 需要先通过 `app.use(createVueDevtools(...))` 注入实例。
 */
export function useDevtools(): UseDevtoolsReturn {
  const devtools = inject(DEVTOOLS_KEY, null)
  if (!devtools) {
    throw new Error('[rinova-devtools] 未找到实例：请在 app 上调用 app.use(createVueDevtools(...))')
  }

  const values = shallowRef<ValueMap>({ ...devtools.getValues() })
  const isOpen = shallowRef(devtools.isOpen())

  const disposers: Array<() => void> = [
    devtools.on<ConfigChangePayload>('config:change', (payload) => {
      values.value = { ...payload.values }
    }),
    devtools.on('open', () => {
      isOpen.value = true
    }),
    devtools.on('close', () => {
      isOpen.value = false
    })
  ]

  if (getCurrentInstance()) {
    onScopeDispose(() => disposers.forEach((dispose) => dispose()))
  }

  return {
    devtools,
    values,
    isOpen,
    open: (pluginId?: string) => devtools.open(pluginId),
    close: () => devtools.close(),
    toggle: () => devtools.toggle(),
    getValue: (key, fallback) => devtools.getValue(key, fallback),
    setValue: (key, value) => devtools.setValue(key, value)
  }
}

/**
 * 即插即用组件：不依赖全局插件，挂载时创建实例，卸载时销毁。
 * 若需要 useDevtools()，请改用 createVueDevtools 插件方式。
 */
export const RinovaDevtools = defineComponent({
  name: 'RinovaDevtools',
  props: {
    options: {
      type: Object as PropType<DevtoolsOptions>,
      default: () => ({})
    },
    autoMount: {
      type: Boolean,
      default: true
    }
  },
  emits: {
    ready: (_devtools: DevtoolsInstance) => true
  },
  setup(props, { emit, expose }) {
    const instance = shallowRef<DevtoolsInstance | null>(null)
    const provided = ref(false)

    onMounted(() => {
      const devtools = createDevtools(props.options)
      instance.value = devtools
      if (props.autoMount) devtools.mount()
      if (!provided.value) {
        provide(DEVTOOLS_KEY, devtools)
        provided.value = true
      }
      emit('ready', devtools)
    })

    onBeforeUnmount(() => {
      instance.value?.destroy()
      instance.value = null
    })

    expose({
      get devtools() {
        return instance.value
      },
      open: (pluginId?: string) => instance.value?.open(pluginId),
      close: () => instance.value?.close(),
      toggle: () => instance.value?.toggle()
    })

    return () => null
  }
})

declare module 'vue' {
  export interface ComponentCustomProperties {
    $devtools: DevtoolsInstance
  }
}
