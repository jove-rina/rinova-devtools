import { createDevtools } from './create-devtools'
import type { ConfigField, DevtoolsPlugin } from './types'

export { createDevtools }
export { VERSION } from './version'
export { h, icon, button, field, empty, tag, segmented } from './ui/dom'
export { formatBytes, formatDuration, formatClock, previewValue, prettyJSON } from './utils/format'
export { toCurl } from './utils/curl'
export type {
  ActionTone,
  BuiltinPluginId,
  ConfigChangePayload,
  ConfigField,
  ConfigGroup,
  ConfigOption,
  ConfigValue,
  DevtoolsAction,
  DevtoolsActionContext,
  DevtoolsInstance,
  DevtoolsOptions,
  DevtoolsPlugin,
  DevtoolsTheme,
  DockSide,
  IconName,
  LogEntry,
  LogLevel,
  NetworkApi,
  NetworkCaptureOptions,
  NetworkEntry,
  PluginContext,
  ToastTone,
  ValueMap
} from './types'

/** 仅用于获得类型推断，运行时原样返回 */
export function definePlugin(plugin: DevtoolsPlugin): DevtoolsPlugin {
  return plugin
}

/** 仅用于获得类型推断，运行时原样返回 */
export function defineConfig(fields: ConfigField[]): ConfigField[] {
  return fields
}
