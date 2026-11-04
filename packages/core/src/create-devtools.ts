import type {
  BuiltinPluginId,
  ConfigField,
  ConfigValue,
  DevtoolsAction,
  DevtoolsInstance,
  DevtoolsOptions,
  DevtoolsPlugin,
  DevtoolsTheme,
  DockSide,
  ToastTone,
  ValueMap
} from './types'
import { ConsoleCapture } from './core/console-capture'
import { ConfigStore } from './core/config-store'
import { Emitter } from './core/emitter'
import { NetworkCapture } from './core/network-capture'
import type { ResolvedOptions, Runtime } from './core/runtime'
import { SafeStorage, copyText } from './core/storage'
import { createBuiltinPlugins } from './plugins'
import { Shell, type ShellUiState } from './ui/shell'
import { VERSION } from './version'

const DEFAULT_PREFIX = 'rinova-devtools'

interface PersistedUi {
  theme?: DevtoolsTheme
  dock?: DockSide
  width?: number
  activePlugin?: string
  launcher?: { x: number; y: number } | null
}

function isTheme(value: unknown): value is DevtoolsTheme {
  return value === 'dark' || value === 'light' || value === 'auto'
}

function isDock(value: unknown): value is DockSide {
  return value === 'right' || value === 'left' || value === 'bottom'
}

function isEnabled(options: DevtoolsOptions): boolean {
  const enabled = options.enabled
  if (typeof enabled === 'function') {
    try {
      return enabled()
    } catch {
      return false
    }
  }
  return enabled !== false
}

/**
 * 创建 devtools 实例。
 *
 * 该函数不依赖任何框架；Vue/React 适配器只是对它的薄封装。
 * 未调用 mount() 前不会修改 DOM，也不会补丁任何全局函数。
 */
export function createDevtools(options: DevtoolsOptions = {}): DevtoolsInstance {
  const appName =
    options.appName ??
    (typeof document !== 'undefined' && document.title ? document.title.trim() : 'Application')
  const resolved: ResolvedOptions = {
    ...options,
    appName,
    version: options.version ?? VERSION,
    theme: isTheme(options.theme) ? options.theme : 'dark',
    dock: isDock(options.dock) ? options.dock : 'right',
    width: options.width ?? 560,
    minWidth: options.minWidth ?? 400,
    maxWidth: options.maxWidth ?? 900,
    shortcut: options.shortcut === undefined ? 'alt+shift+d' : options.shortcut,
    storagePrefix: options.storagePrefix ?? DEFAULT_PREFIX
  }

  const storage = new SafeStorage(resolved.storagePrefix)
  const bus = new Emitter()
  const network = new NetworkCapture({
    maxEntries: options.network?.maxEntries ?? 200,
    responseBody: options.network?.responseBody ?? true,
    ignore: options.network?.ignore ?? []
  })
  const logs = new ConsoleCapture(options.maxLogEntries ?? 300)
  const actions: DevtoolsAction[] = [...(options.actions ?? [])]
  const config = new ConfigStore(
    options.config ?? [],
    storage,
    options.groups ?? [],
    options.values ?? {}
  )

  // 页面卸载时还原被补丁的全局函数，避免影响 SPA 之外的页面
  const onPageHide = () => {
    network.stop()
    logs.stop()
  }

  const persistedUi = storage.getJSON<PersistedUi>('ui', {})
  const ui: ShellUiState = {
    theme: isTheme(persistedUi.theme) ? persistedUi.theme : resolved.theme,
    dock: isDock(persistedUi.dock) ? persistedUi.dock : resolved.dock,
    width: typeof persistedUi.width === 'number' ? persistedUi.width : resolved.width,
    activePlugin: typeof persistedUi.activePlugin === 'string' ? persistedUi.activePlugin : '',
    launcher:
      persistedUi.launcher && Number.isFinite(persistedUi.launcher.x) && Number.isFinite(persistedUi.launcher.y)
        ? persistedUi.launcher
        : null
  }

  const saveUi = (patch: Partial<ShellUiState>): void => {
    Object.assign(ui, patch)
    storage.setJSON('ui', ui)
  }

  let mounted = false
  let host: HTMLElement | null = null
  let shell: Shell | null = null
  let globalKey: string | null = null

  const registry = new Map<string, DevtoolsPlugin>()
  const allowedBuiltins = options.builtinPlugins

  const notifyActionChange = () => bus.emit('actions:change', actions)

  const runtime: Runtime = {
    options: resolved,
    storage,
    config,
    network,
    logs,
    bus,
    actions,
    app: {
      name: appName,
      version: resolved.version,
      mode:
        typeof location !== 'undefined' &&
        ['localhost', '127.0.0.1', '::1'].includes(location.hostname)
          ? 'local'
          : 'remote'
    },
    ui: {
      getTheme: () => ui.theme,
      getDock: () => ui.dock,
      getWidth: () => ui.width,
      setTheme: (theme) => {
        if (ui.theme === theme) return
        ui.theme = theme
        saveUi({ theme })
        bus.emit('ui:theme', { theme })
      },
      setDock: (dock) => {
        if (ui.dock === dock) return
        ui.dock = dock
        saveUi({ dock })
        bus.emit('ui:dock', { dock })
      },
      setWidth: (width) => {
        const clamped = Math.max(resolved.minWidth, Math.min(resolved.maxWidth, width))
        ui.width = clamped
        saveUi({ width: clamped })
        bus.emit('ui:width', { width: clamped })
      },
      resetLauncher: () => {
        ui.launcher = null
        saveUi({ launcher: null })
        bus.emit('ui:launcher-reset', undefined)
      },
      resetAll: () => {
        storage.clearNamespace()
        config.reset()
        ui.theme = resolved.theme
        ui.dock = resolved.dock
        ui.width = resolved.width
        ui.activePlugin = ''
        ui.launcher = null
        saveUi({})
        bus.emit('ui:theme', { theme: ui.theme })
        bus.emit('ui:dock', { dock: ui.dock })
        bus.emit('ui:width', { width: ui.width })
        bus.emit('ui:reset', undefined)
      },
      activePlugin: () => ui.activePlugin,
      activate: (pluginId) => shell?.open(pluginId)
    },
    getInstance: () => instance,
    toast: (text, tone) => {
      if (shell) shell.addToast(text, tone)
      else console.info(`[rinova-devtools] ${text}`)
    },
    copy: async (text) => {
      const ok = await copyText(text)
      if (shell) shell.addToast(ok ? '已复制到剪贴板' : '复制失败，请手动选择', ok ? 'success' : 'error')
      return ok
    },
    open: (pluginId) => instance.open(pluginId),
    close: () => instance.close()
  }

  const initialPlugins = (() => {
    const map = new Map<string, DevtoolsPlugin>()
    if (allowedBuiltins !== false) {
      const builtins = createBuiltinPlugins(runtime)
      for (const plugin of builtins) {
        if (!allowedBuiltins || allowedBuiltins.includes(plugin.id as BuiltinPluginId)) {
          map.set(plugin.id, plugin)
        }
      }
    }
    for (const plugin of options.plugins ?? []) map.set(plugin.id, plugin)
    return [...map.values()].filter((plugin) => {
      if (typeof plugin.enabled === 'function') {
        try {
          return plugin.enabled()
        } catch {
          return false
        }
      }
      return plugin.enabled !== false
    })
  })()
  initialPlugins.forEach((plugin) => registry.set(plugin.id, plugin))

  config.subscribe((payload) => {
    bus.emit('config:change', payload)
    options.onConfigChange?.(payload)
  })

  const mount = (): DevtoolsInstance => {
    if (mounted) return instance
    if (!isEnabled(options) || typeof document === 'undefined') return instance

    host = document.createElement('rinova-devtools')
    host.setAttribute('data-rinova-devtools', '')
    Object.assign(host.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483600',
      display: 'block',
      pointerEvents: 'none'
    })
    document.body.appendChild(host)

    if (options.captureNetwork !== false) network.start()
    if (options.captureConsole !== false) logs.start()

    const shadow = host.attachShadow({ mode: 'open' })
    shell = new Shell(shadow, runtime, ui, saveUi)
    shell.mountPlugins([...registry.values()])
    mounted = true

    if (options.exposeGlobal !== false) {
      globalKey =
        typeof options.exposeGlobal === 'string' ? options.exposeGlobal : '__RINOVA_DEVTOOLS__'
      ;(window as unknown as Record<string, unknown>)[globalKey] = instance
    }

    bus.emit('mount', undefined)
    return instance
  }

  const destroy = (): void => {
    if (!mounted) return
    shell?.dispose()
    shell = null
    network.stop()
    logs.stop()
    host?.remove()
    host = null
    mounted = false
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide)
    if (globalKey) {
      const scope = window as unknown as Record<string, unknown>
      if (scope[globalKey] === instance) delete scope[globalKey]
      globalKey = null
    }
    bus.emit('destroy', undefined)
  }

  const instance: DevtoolsInstance = {
    get version() {
      return resolved.version
    },
    get appName() {
      return appName
    },
    get mounted() {
      return mounted
    },
    mount,
    destroy,
    open(pluginId?: string) {
      if (!mounted) mount()
      if (!mounted) return
      shell?.open(pluginId)
    },
    close() {
      shell?.close()
    },
    toggle() {
      if (!mounted) {
        mount()
        shell?.open()
        return
      }
      shell?.toggle()
    },
    isOpen() {
      return shell?.isOpen() ?? false
    },
    registerPlugin(plugin: DevtoolsPlugin) {
      if (plugin.enabled === false) return () => {}
      if (typeof plugin.enabled === 'function') {
        try {
          if (!plugin.enabled()) return () => {}
        } catch {
          return () => {}
        }
      }
      registry.set(plugin.id, plugin)
      if (shell) shell.registerPlugin(plugin)
      bus.emit('plugins:change', [...registry.values()])
      return () => instance.removePlugin(plugin.id)
    },
    removePlugin(id: string) {
      registry.delete(id)
      shell?.unregisterPlugin(id)
      bus.emit('plugins:change', [...registry.values()])
    },
    listPlugins() {
      return [...registry.values()]
    },
    registerAction(action: DevtoolsAction) {
      const index = actions.findIndex((item) => item.id === action.id)
      if (index >= 0) actions[index] = action
      else actions.push(action)
      notifyActionChange()
      return () => {
        const current = actions.findIndex((item) => item.id === action.id)
        if (current >= 0) actions.splice(current, 1)
        notifyActionChange()
      }
    },
    registerConfigField(field: ConfigField) {
      const dispose = config.registerField(field)
      bus.emit('config:fields', config.fields)
      return () => {
        dispose()
        bus.emit('config:fields', config.fields)
      }
    },
    getValues() {
      return config.get()
    },
    getValue<T extends ConfigValue = ConfigValue>(key: string, fallback?: T) {
      return config.getValue(key, fallback as T)
    },
    setValue(key: string, value: ConfigValue) {
      config.set(key, value, 'program')
    },
    setValues(patch: ValueMap) {
      config.setMany(patch, 'program')
    },
    resetConfig() {
      config.reset()
    },
    on<T>(event: string, handler: (payload: T) => void) {
      return bus.on(event, handler)
    },
    off(event: string, handler: (payload: never) => void) {
      bus.off(event, handler)
    },
    toast(text: string, tone?: ToastTone) {
      runtime.toast(text, tone)
    },
    network: {
      entries: () => network.entries(),
      clear: () => network.clear(),
      replay: (id: string) => network.replay(id),
      capturing: () => network.capturing(),
      setCapturing: (value: boolean) => network.setCapturing(value)
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onPageHide)
  }

  return instance
}
