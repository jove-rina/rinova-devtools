import type {
  ConfigValue,
  DevtoolsAction,
  DevtoolsInstance,
  DevtoolsOptions,
  DevtoolsTheme,
  DockSide,
  ToastTone,
  ValueMap
} from '../types'
import type { ConfigStore } from './config-store'
import type { ConsoleCapture } from './console-capture'
import type { Emitter } from './emitter'
import type { NetworkCapture } from './network-capture'
import type { SafeStorage } from './storage'

/** 解析后的配置：默认值已补齐 */
export interface ResolvedOptions extends DevtoolsOptions {
  appName: string
  version: string
  theme: DevtoolsTheme
  dock: DockSide
  width: number
  minWidth: number
  maxWidth: number
  shortcut: string | false
  storagePrefix: string
}

export interface RuntimeUi {
  getTheme(): DevtoolsTheme
  getDock(): DockSide
  getWidth(): number
  setTheme(theme: DevtoolsTheme): void
  setDock(dock: DockSide): void
  setWidth(width: number): void
  resetLauncher(): void
  resetAll(): void
  activePlugin(): string
  activate(pluginId: string): void
}

/** 内置与第三方插件共享的运行时，避免插件直接依赖内部实现细节 */
export interface Runtime {
  options: ResolvedOptions
  storage: SafeStorage
  config: ConfigStore
  network: NetworkCapture
  logs: ConsoleCapture
  bus: Emitter
  actions: DevtoolsAction[]
  ui: RuntimeUi
  app: { name: string; version: string; mode: string }
  getInstance(): DevtoolsInstance
  toast(text: string, tone?: ToastTone): void
  copy(text: string): Promise<boolean>
  open(pluginId?: string): void
  close(): void
}

export function readValue<T extends ConfigValue = ConfigValue>(
  values: ValueMap,
  key: string,
  fallback: T
): T {
  const value = values[key]
  return (value === undefined ? fallback : value) as T
}
