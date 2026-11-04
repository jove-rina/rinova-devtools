/**
 * @rinova/devtools 公共类型定义。
 *
 * 这一层不依赖任何框架：所有类型都是可 JSON 序列化的描述，
 * 适配器（Vue / React / 原生）只负责把宿主状态翻译成这些描述。
 */

export type DevtoolsTheme = 'dark' | 'light' | 'auto'

export type DockSide = 'right' | 'left' | 'bottom'

export type ConfigValue = string | number | boolean | null

export type ValueMap = Record<string, ConfigValue>

export type ToastTone = 'success' | 'error' | 'info' | 'warning'

export interface ToastMessage {
  id: number
  text: string
  tone: ToastTone
}

export interface ConfigOption {
  label: string
  value: string
  description?: string
  /** 用户运行时新增的选项，可删除 */
  custom?: boolean
}

interface ConfigFieldBase {
  /** 唯一键，同时作为持久化与业务读取的键 */
  key: string
  label: string
  /** 分组 id，对应 {@link ConfigGroup.id}；缺省归入“常规” */
  group?: string
  description?: string
  disabled?: boolean
}

export interface SelectField extends ConfigFieldBase {
  type: 'select'
  options: ConfigOption[]
  /** 允许输入预设之外的值（写入并保留为自定义项） */
  allowCustom?: boolean
  placeholder?: string
  defaultValue?: string
}

export interface TextField extends ConfigFieldBase {
  type: 'text'
  placeholder?: string
  /** 只读且带复制按钮（token / 灰度号等） */
  copyable?: boolean
  mono?: boolean
  defaultValue?: string
}

export interface TextareaField extends ConfigFieldBase {
  type: 'textarea'
  placeholder?: string
  rows?: number
  mono?: boolean
  defaultValue?: string
}

export interface NumberField extends ConfigFieldBase {
  type: 'number'
  min?: number
  max?: number
  step?: number
  defaultValue?: number
}

export interface SwitchField extends ConfigFieldBase {
  type: 'switch'
  defaultValue?: boolean
}

export type ConfigField = SelectField | TextField | TextareaField | NumberField | SwitchField

export interface ConfigGroup {
  id: string
  label: string
  description?: string
}

export type IconName =
  | 'activity'
  | 'alert-circle'
  | 'arrow-left'
  | 'arrow-up-right'
  | 'box'
  | 'bug'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'circle'
  | 'clipboard'
  | 'copy'
  | 'database'
  | 'eraser'
  | 'external-link'
  | 'eye'
  | 'eye-off'
  | 'filter'
  | 'globe'
  | 'key'
  | 'layers'
  | 'list-filter'
  | 'moon'
  | 'panel-right'
  | 'play'
  | 'plus'
  | 'refresh-cw'
  | 'rotate-ccw'
  | 'search'
  | 'send'
  | 'settings'
  | 'sliders-horizontal'
  | 'sparkles'
  | 'sun'
  | 'terminal'
  | 'trash'
  | 'x'
  | 'zap'

export interface NetworkEntry {
  id: string
  kind: 'fetch' | 'xhr'
  method: string
  url: string
  status: number
  statusText: string
  ok: boolean
  pending: boolean
  startAt: number
  duration: number
  requestHeaders: Record<string, string>
  requestBody?: string
  responseHeaders: Record<string, string>
  responseBody?: string
  responseSize: number
  error?: string
}

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  id: number
  level: LogLevel
  at: number
  args: string
  count: number
}

export interface DevtoolsActionContext {
  devtools: DevtoolsInstance
  values: ValueMap
  getValue<T extends ConfigValue = ConfigValue>(key: string, fallback?: T): T
  setValue(key: string, value: ConfigValue): void
  open(pluginId?: string): void
  close(): void
  toast(text: string, tone?: ToastTone): void
  copy(text: string): Promise<boolean>
}

export type ActionTone = 'default' | 'danger'

export interface DevtoolsAction {
  id: string
  label: string
  description?: string
  icon?: IconName
  tone?: ActionTone
  /** 执行前确认文案；true 使用默认文案 */
  confirm?: boolean | string
  run(ctx: DevtoolsActionContext): void | Promise<void>
}

export interface NetworkApi {
  entries(): NetworkEntry[]
  clear(): void
  replay(id: string): Promise<NetworkEntry | undefined>
  capturing(): boolean
  setCapturing(value: boolean): void
}

export interface PluginContext {
  id: string
  /** shadow root，可用于挂弹层；普通渲染请用 container */
  root: ShadowRoot
  /** 插件独占的内容容器（面板切换时保留现场） */
  container: HTMLElement
  app: { name: string; version: string }
  get values(): ValueMap
  getValue<T extends ConfigValue = ConfigValue>(key: string, fallback?: T): T
  setValue(key: string, value: ConfigValue): void
  /** 监听配置变更，返回取消函数 */
  onChange(handler: (payload: ConfigChangePayload) => void): () => void
  /** 监听任意 devtools 事件，返回取消函数 */
  on<T = unknown>(event: string, handler: (payload: T) => void): () => void
  emit(event: string, payload?: unknown): void
  /** 命名空间为本插件 id 的持久化存储 */
  storage: {
    get<T>(key: string, fallback: T): T
    set(key: string, value: unknown): void
    remove(key: string): void
  }
  network: NetworkApi
  toast(text: string, tone?: ToastTone): void
  copy(text: string): Promise<boolean>
  /** 在插件被移除 / devtools 销毁时执行 */
  onDispose(fn: () => void): void
  devtools: DevtoolsInstance
}

export interface DevtoolsPlugin {
  id: string
  title: string
  icon?: IconName
  /** 侧栏排序，数字小的在前 */
  order?: number
  /** 面板标题下方的说明文案 */
  subtitle?: string | (() => string)
  enabled?: boolean | (() => boolean)
  /** 侧栏角标，返回 null 表示不显示 */
  badge?: () => number | string | null
  /**
   * 渲染入口。容器会在首次激活时创建，之后切换标签不复建。
   * 需要清理的资源请用 ctx.onDispose 注册。
   */
  render(container: HTMLElement, ctx: PluginContext): void
  /** 插件自身的内部状态变更时调用，驱动角标刷新 */
  refresh?(): void
}

export interface ConfigChangePayload {
  values: ValueMap
  changed: string
  source: 'user' | 'program' | 'reset'
}

export interface NetworkCaptureOptions {
  maxEntries?: number
  /** 是否捕获响应体，默认 true，单条上限 200KB */
  responseBody?: boolean
  /** 额外跳过的 URL 片段 */
  ignore?: string[]
}

export interface DevtoolsOptions {
  /** 面板标题与应用名，默认取 document.title */
  appName?: string
  version?: string
  /** false 时完全不挂载（生产环境常用） */
  enabled?: boolean | (() => boolean)
  theme?: DevtoolsTheme
  /** 面板停靠方向，默认 right */
  dock?: DockSide
  /** 面板宽度，默认 560 */
  width?: number
  minWidth?: number
  maxWidth?: number
  /** 悬浮球；false 表示不显示（只保留快捷键/程序调用） */
  launcher?: boolean | { draggable?: boolean }
  /** 快捷键，默认 alt+shift+d；false 关闭 */
  shortcut?: string | false
  /** localStorage 前缀，默认 rinova-devtools */
  storagePrefix?: string
  config?: ConfigField[]
  groups?: ConfigGroup[]
  /** 初始值，优先级低于用户本地保存值 */
  values?: ValueMap
  actions?: DevtoolsAction[]
  plugins?: DevtoolsPlugin[]
  /** 内置面板白名单，false 表示全部不装 */
  builtinPlugins?: BuiltinPluginId[] | false
  captureNetwork?: boolean
  captureConsole?: boolean
  network?: NetworkCaptureOptions
  maxLogEntries?: number
  /** 挂到 window.__RINOVA_DEVTOOLS__，便于控制台调试 */
  exposeGlobal?: boolean | string
  onConfigChange?(payload: ConfigChangePayload): void
  onOpen?(): void
  onClose?(): void
}

export type BuiltinPluginId =
  | 'config'
  | 'network'
  | 'storage'
  | 'console'
  | 'actions'
  | 'settings'

export interface DevtoolsInstance {
  readonly version: string
  readonly appName: string
  readonly mounted: boolean
  mount(): DevtoolsInstance
  destroy(): void
  open(pluginId?: string): void
  close(): void
  toggle(): void
  isOpen(): boolean
  registerPlugin(plugin: DevtoolsPlugin): () => void
  removePlugin(id: string): void
  listPlugins(): DevtoolsPlugin[]
  registerAction(action: DevtoolsAction): () => void
  registerConfigField(field: ConfigField): () => void
  getValues(): ValueMap
  getValue<T extends ConfigValue = ConfigValue>(key: string, fallback?: T): T
  setValue(key: string, value: ConfigValue): void
  setValues(patch: ValueMap): void
  resetConfig(): void
  on<T = unknown>(event: string, handler: (payload: T) => void): () => void
  off(event: string, handler: (payload: never) => void): void
  toast(text: string, tone?: ToastTone): void
  network: NetworkApi
}
