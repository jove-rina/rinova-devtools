import styles from '../styles/index.less?inline'
import type {
  ConfigValue,
  DevtoolsPlugin,
  DevtoolsTheme,
  DockSide,
  PluginContext,
  ToastTone,
  ValueMap
} from '../types'
import type { Runtime } from '../core/runtime'
import { copyText } from '../core/storage'
import { isEditableTarget, matchHotkey, parseHotkey } from '../utils/hotkey'
import { clear, h, icon } from './dom'

export interface ShellUiState {
  theme: DevtoolsTheme
  dock: DockSide
  width: number
  activePlugin: string
  launcher: { x: number; y: number } | null
}

interface PluginEntry {
  plugin: DevtoolsPlugin
  view: HTMLElement
  railButton: HTMLButtonElement
  badgeEl: HTMLElement | null
  disposers: Array<() => void>
  mounted: boolean
}

const HOST_MARGIN = 12
const LAUNCHER_MARGIN = 18
const LAUNCHER_SIZE = 46
const SNAP_THRESHOLD = 44

export class Shell {
  readonly root: HTMLElement
  private launcher: HTMLButtonElement
  private launcherBadge: HTMLElement
  private launcherHint: HTMLElement
  private panel: HTMLElement
  private rail: HTMLElement
  private titleEl: HTMLElement
  private subtitleEl: HTMLElement
  private bodyEl: HTMLElement
  private themeButton: HTMLButtonElement
  private toastsEl: HTMLElement
  private statusNet: HTMLElement
  private statusLogs: HTMLElement
  private statusCapture: HTMLElement
  private entries = new Map<string, PluginEntry>()
  private emptyView: HTMLElement | null = null
  private openState = false
  private activeId = ''
  private listeners: Array<() => void> = []
  private mediaQuery?: MediaQueryList
  private onMediaChange = () => this.applyTheme()
  private suppressedClick = false

  constructor(
    private shadow: ShadowRoot,
    private rt: Runtime,
    private ui: ShellUiState,
    private saveUi: (patch: Partial<ShellUiState>) => void
  ) {
    const style = document.createElement('style')
    style.textContent = styles
    shadow.appendChild(style)

    this.root = h('div', { class: 'rdt-root' })
    shadow.appendChild(this.root)

    const env = this.envLabel()
    this.themeButton = h('button', {
      class: 'rdt-iconbtn',
      type: 'button',
      title: '切换主题',
      'aria-label': '切换主题',
      onClick: () => this.toggleTheme()
    })
    this.launcherBadge = h('span', { class: 'rdt-launcher__badge' })
    this.launcherBadge.style.display = 'none'
    this.launcherHint = h('span', {
      class: 'rdt-launcher__hint',
      text: `开发者工具 · ${this.shortcutHint()}`
    })
    this.launcher = h(
      'button',
      {
        class: 'rdt-launcher',
        type: 'button',
        title: `${this.rt.options.appName} · 开发者工具`,
        'aria-label': '打开 Rinova 开发者工具',
        'data-open': 'false',
        ...(this.rt.options.shortcut
          ? { 'aria-keyshortcuts': this.rt.options.shortcut.replace(/\b\w/g, (c) => c.toUpperCase()) }
          : {})
      },
      [
        icon('bug', 18, 1.9),
        this.launcherBadge,
        this.launcherHint
      ]
    )

    this.rail = h('nav', { class: 'rdt-rail', 'aria-label': '调试工具面板' })
    this.titleEl = h('h2', { class: 'rdt-content__title', text: '' })
    this.subtitleEl = h('p', { class: 'rdt-content__subtitle', text: '' })
    this.bodyEl = h('div', { class: 'rdt-content__body' })
    this.statusNet = h('span', { class: 'rdt-statusbar__item' })
    this.statusLogs = h('span', { class: 'rdt-statusbar__item' })
    this.statusCapture = h('button', {
      class: 'rdt-statusbar__item',
      type: 'button',
      title: '暂停 / 恢复网络采集',
      style: {
        background: 'transparent',
        border: '0',
        padding: '0',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer'
      },
      onClick: () => {
        this.rt.network.setCapturing(!this.rt.network.capturing())
        this.refreshBadges()
      }
    })
    this.toastsEl = h('div', { class: 'rdt-toasts', role: 'status', 'aria-live': 'polite' })

    this.panel = h('section', { class: 'rdt-panel', 'data-dock': ui.dock, 'aria-label': 'Rinova 开发者工具' }, [
      h('div', { class: 'rdt-resizer', title: '拖拽调整宽度' }),
      h('header', { class: 'rdt-panel__header' }, [
        h('div', { class: 'rdt-brand' }, [
          h('span', { class: 'rdt-brand__mark' }, icon('bug', 13, 2.2)),
          h('span', { class: 'rdt-brand__name', text: this.rt.options.appName }),
          h('span', {
            class: 'rdt-brand__env',
            text: env.label,
            dataset: { local: env.local ? 'true' : 'false' }
          })
        ]),
        h('div', { class: 'rdt-header__actions' }, [
          this.themeButton,
          h(
            'button',
            {
              class: 'rdt-iconbtn',
              type: 'button',
              title: '关闭 (Esc)',
              'aria-label': '关闭',
              onClick: () => this.close()
            },
            icon('x', 15, 2)
          )
        ])
      ]),
      h('div', { class: 'rdt-main' }, [
        this.rail,
        h('div', { class: 'rdt-content' }, [
          h('div', { class: 'rdt-content__head' }, [
            h('div', { class: 'rdt-content__titles' }, [this.titleEl, this.subtitleEl]),
            h('div', { class: 'rdt-content__actions' })
          ]),
          this.bodyEl
        ])
      ]),
      h('footer', { class: 'rdt-statusbar' }, [
        this.statusCapture,
        this.statusNet,
        this.statusLogs,
        h('span', { class: 'rdt-statusbar__spacer' }),
        h('span', { class: 'rdt-statusbar__item rdt-statusbar__shortcut', text: this.shortcutHint() })
      ])
    ])

    this.root.append(this.panel, this.launcher, this.toastsEl)

    this.root.style.setProperty('--rdt-width', `${this.resolveWidth(ui.width)}px`)
    this.applyTheme()
    this.bindLauncher()
    this.bindResizer()
    this.bindGlobal()

    this.statusCapture.innerHTML = ''
    this.statusCapture.appendChild(h('span', { class: 'rdt-statusbar__dot' }))
    this.statusCapture.appendChild(h('span', { text: 'capturing' }))

    this.listeners.push(
      rt.network.subscribeChange(() => this.refreshBadges()),
      rt.logs.subscribeChange(() => this.refreshBadges()),
      rt.bus.on('network:change', () => this.refreshBadges()),
      rt.bus.on('log:change', () => this.refreshBadges()),
      rt.bus.on('ui:theme', () => this.applyTheme()),
      rt.bus.on('ui:dock', ({ dock }: { dock: DockSide }) => {
        this.panel.dataset.dock = dock
        this.ui.dock = dock
      }),
      rt.bus.on('ui:width', ({ width }: { width: number }) => {
        this.root.style.setProperty('--rdt-width', `${this.resolveWidth(width)}px`)
        this.ui.width = width
      }),
      rt.bus.on('ui:reset', () => this.applyReset()),
      rt.bus.on('ui:launcher-reset', () => this.applyLauncherPosition())
    )

    this.refreshBadges()
    this.applyLauncherPosition()
  }

  private resolveWidth(width: number): number {
    const { minWidth, maxWidth } = this.rt.options
    const viewportMax = typeof window === 'undefined' ? Infinity : window.innerWidth - 24
    const upper = Math.max(minWidth, Math.min(maxWidth, viewportMax))
    return Math.max(minWidth, Math.min(upper, width))
  }

  private envLabel(): { label: string; local: boolean } {
    const hostname = typeof location === 'undefined' ? '' : location.hostname
    const local = !hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    return { label: local ? 'local' : hostname.replace(/^www\./, ''), local }
  }

  private shortcutHint(): string {
    const shortcut = this.rt.options.shortcut
    if (!shortcut) return '未设置快捷键'
    const symbols: Record<string, string> = {
      meta: '⌘',
      cmd: '⌘',
      command: '⌘',
      alt: '⌥',
      option: '⌥',
      shift: '⇧',
      ctrl: '⌃',
      control: '⌃'
    }
    return shortcut
      .split('+')
      .map((part) => {
        const key = part.trim().toLowerCase()
        if (!key) return ''
        if (symbols[key]) return symbols[key]
        if (key === 'space') return 'Space'
        return part.trim().toUpperCase()
      })
      .join('')
  }

  // ---------------------------------------------------------------- theme

  private resolvedTheme(): 'dark' | 'light' {
    if (this.ui.theme !== 'auto') return this.ui.theme
    if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  private applyTheme(): void {
    this.root.dataset.theme = this.resolvedTheme()
    clear(this.themeButton)
    this.themeButton.appendChild(icon(this.resolvedTheme() === 'dark' ? 'sun' : 'moon', 15, 1.9))
    this.themeButton.title = this.resolvedTheme() === 'dark' ? '切换到浅色主题' : '切换到深色主题'

    if (!this.mediaQuery && typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      this.mediaQuery.addEventListener('change', this.onMediaChange)
    }
  }

  private toggleTheme(): void {
    this.rt.ui.setTheme(this.resolvedTheme() === 'dark' ? 'light' : 'dark')
  }

  // --------------------------------------------------------------- plugins

  mountPlugins(plugins: DevtoolsPlugin[]): void {
    plugins.forEach((plugin) => this.registerPlugin(plugin))
    this.syncEmptyState()
    if (!this.entries.size) return
    const preferred = this.ui.activePlugin || plugins[0]?.id
    this.activate(this.entries.has(preferred) ? preferred : this.entries.keys().next().value ?? '')
  }

  /** 没有任何插件时给一个说得清楚的空态，而不是一块空白 */
  private syncEmptyState(): void {
    if (this.entries.size === 0) {
      if (this.emptyView) return
      this.emptyView = h('div', { class: 'rdt-plugin-view is-active', dataset: { plugin: '__empty__' } }, [
        h('div', { class: 'rdt-empty' }, [
          icon('layers', 24, 1.6),
          h('p', { class: 'rdt-empty__text', text: '还没有可用的调试面板' }),
          h('p', {
            class: 'rdt-empty__text',
            text: '通过 options.plugins 或 devtools.registerPlugin() 注册第一个面板。',
            style: { marginTop: '-2px' }
          })
        ])
      ])
      this.bodyEl.appendChild(this.emptyView)
      this.titleEl.textContent = '开发者工具'
      this.subtitleEl.textContent = '暂无面板'
      this.subtitleEl.style.display = ''
      return
    }
    if (this.emptyView) {
      this.emptyView.remove()
      this.emptyView = null
    }
  }

  registerPlugin(plugin: DevtoolsPlugin): void {
    if (this.entries.has(plugin.id)) this.unregisterPlugin(plugin.id)

    const view = h('div', { class: 'rdt-plugin-view', dataset: { plugin: plugin.id } })
    this.bodyEl.appendChild(view)

    const badgeEl = h('span', { class: 'rdt-rail__badge' })
    badgeEl.style.display = 'none'
    const railButton = h(
      'button',
      {
        class: 'rdt-rail__item',
        type: 'button',
        title: plugin.title,
        'aria-label': plugin.title,
        dataset: { plugin: plugin.id },
        onClick: () => {
          this.open(plugin.id)
        }
      },
      [icon(plugin.icon ?? 'circle', 17, 1.8), badgeEl]
    )

    const entry: PluginEntry = { plugin, view, railButton, badgeEl, disposers: [], mounted: false }
    const wasEmpty = this.emptyView !== null
    this.entries.set(plugin.id, entry)
    this.syncEmptyState()
    this.renderRail()

    const ctx = this.createContext(plugin, view, entry)
    try {
      plugin.render(view, ctx)
      entry.mounted = true
    } catch (error) {
      view.appendChild(
        h('div', { class: 'rdt-empty' }, [
          h('p', { class: 'rdt-empty__text', text: `面板「${plugin.title}」渲染失败：${String(error)}` })
        ])
      )
      console.error(`[rinova-devtools] plugin "${plugin.id}" failed to render`, error)
    }

    if (wasEmpty && !this.activeId) this.activate(plugin.id)
    else if (this.activeId === plugin.id) this.applyActive(this.activeId)
    this.refreshBadges()
  }

  unregisterPlugin(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    entry.disposers.forEach((dispose) => {
      try {
        dispose()
      } catch {
        // ignore
      }
    })
    entry.view.remove()
    entry.railButton.remove()
    this.entries.delete(id)
    this.syncEmptyState()
    if (this.activeId === id) {
      const next = [...this.entries.keys()][0]
      if (next) this.activate(next)
      this.activeId = next ?? ''
    }
    this.renderRail()
  }

  private renderRail(): void {
    clear(this.rail)
    const sorted = [...this.entries.values()].sort((a, b) => {
      const orderA = a.plugin.order ?? 100
      const orderB = b.plugin.order ?? 100
      return orderA === orderB ? a.plugin.title.localeCompare(b.plugin.title) : orderA - orderB
    })
    // 设置常驻底部，避免和业务面板混在一起
    const settingsEntry = sorted.find((entry) => entry.plugin.id === 'settings')
    for (const entry of sorted) {
      if (entry === settingsEntry) continue
      entry.railButton.classList.toggle('is-active', entry.plugin.id === this.activeId)
      this.rail.appendChild(entry.railButton)
    }
    this.rail.appendChild(h('div', { class: 'rdt-rail__spacer' }))
    if (settingsEntry) {
      settingsEntry.railButton.classList.toggle('is-active', settingsEntry.plugin.id === this.activeId)
      this.rail.appendChild(settingsEntry.railButton)
    }
    const shortVersion = this.rt.options.version.match(/(\d+\.\d+)/)?.[1] ?? this.rt.options.version
    this.rail.appendChild(h('div', { class: 'rdt-rail__version', text: `v${shortVersion}` }))
  }

  private createContext(plugin: DevtoolsPlugin, view: HTMLElement, entry: PluginEntry): PluginContext {
    const rt = this.rt
    const disposers = entry.disposers
    const pluginStorageKey = (key: string) => `plugin:${plugin.id}:${key}`

    const context: PluginContext = {
      id: plugin.id,
      root: this.shadow,
      container: view,
      app: { name: this.rt.options.appName, version: this.rt.options.version },
      get values(): ValueMap {
        return rt.config.get()
      },
      getValue<T extends ConfigValue = ConfigValue>(key: string, fallback?: T): T {
        return rt.config.getValue(key, fallback as T)
      },
      setValue(key: string, value: ConfigValue): void {
        rt.config.set(key, value, 'program')
      },
      onChange(handler) {
        const off = rt.config.subscribe(handler)
        disposers.push(off)
        return off
      },
      on<T>(event: string, handler: (payload: T) => void) {
        const off = rt.bus.on(event, handler)
        disposers.push(off)
        return off
      },
      emit(event, payload) {
        rt.bus.emit(event, payload)
      },
      storage: {
        get<T>(key: string, fallback: T): T {
          return rt.storage.getJSON<T>(pluginStorageKey(key), fallback)
        },
        set(key: string, value: unknown): void {
          rt.storage.setJSON(pluginStorageKey(key), value)
        },
        remove(key: string): void {
          rt.storage.remove(pluginStorageKey(key))
        }
      },
      network: {
        entries: () => rt.network.entries(),
        clear: () => rt.network.clear(),
        replay: (id: string) => rt.network.replay(id),
        capturing: () => rt.network.capturing(),
        setCapturing: (value: boolean) => rt.network.setCapturing(value)
      },
      toast: (text, tone) => rt.toast(text, tone),
      copy: async (text: string) => {
        const ok = await copyText(text)
        rt.toast(ok ? '已复制到剪贴板' : '复制失败，请手动选择', ok ? 'success' : 'error')
        return ok
      },
      onDispose(fn) {
        disposers.push(fn)
      },
      devtools: rt.getInstance()
    }

    return context
  }

  activate(id: string): void {
    if (!this.entries.has(id)) return
    this.activeId = id
    this.saveUi({ activePlugin: id })
    this.applyActive(id)
    this.renderRail()
    this.rt.bus.emit('plugin:activate', { id })
  }

  private applyActive(id: string): void {
    for (const entry of this.entries.values()) {
      const active = entry.plugin.id === id
      entry.view.classList.toggle('is-active', active)
      entry.railButton.classList.toggle('is-active', active)
    }
    const entry = this.entries.get(id)
    if (!entry) return
    this.titleEl.textContent = entry.plugin.title
    this.updateSubtitle()
  }

  private updateSubtitle(): void {
    const entry = this.entries.get(this.activeId)
    if (!entry) return
    const subtitle =
      typeof entry.plugin.subtitle === 'function' ? entry.plugin.subtitle() : entry.plugin.subtitle ?? ''
    this.subtitleEl.textContent = subtitle
    this.subtitleEl.style.display = subtitle ? '' : 'none'
  }

  refreshBadges(): void {
    let errors = 0
    for (const entry of this.entries.values()) {
      let badge: number | string | null = null
      try {
        badge = entry.plugin.badge?.() ?? null
      } catch {
        badge = null
      }
      const el = entry.badgeEl
      if (!el) continue
      if (badge === null || badge === '' || badge === 0) {
        el.style.display = 'none'
      } else {
        el.style.display = ''
        el.textContent = String(badge)
      }
    }

    const net = this.rt.network.entries()
    errors += net.filter((entry) => !entry.pending && (!entry.ok || entry.error)).length
    errors += this.rt.logs.entries().filter((entry) => entry.level === 'error').length
    if (errors > 0) {
      this.launcherBadge.style.display = ''
      this.launcherBadge.textContent = errors > 99 ? '99+' : String(errors)
    } else {
      this.launcherBadge.style.display = 'none'
    }

    clear(this.statusNet)
    this.statusNet.appendChild(
      h('span', { text: `${net.length} 请求` })
    )
    clear(this.statusLogs)
    this.statusLogs.appendChild(h('span', { text: `${this.rt.logs.entries().length} 日志` }))

    clear(this.statusCapture)
    const dot = h('span', { class: `rdt-statusbar__dot${this.rt.network.capturing() ? '' : ' is-off'}` })
    this.statusCapture.append(dot, h('span', { text: this.rt.network.capturing() ? 'capturing' : 'paused' }))
    this.updateSubtitle()
  }

  // ---------------------------------------------------------------- panel

  open(pluginId?: string): void {
    if (pluginId) this.activate(pluginId)
    else if (!this.activeId) {
      const first = [...this.entries.keys()][0]
      if (first) this.activate(first)
    }
    this.openState = true
    this.panel.classList.add('is-open')
    this.launcher.dataset.open = 'true'
    this.rt.bus.emit('open', { plugin: this.activeId })
    this.rt.options.onOpen?.()
  }

  close(): void {
    if (!this.openState) return
    this.openState = false
    this.panel.classList.remove('is-open')
    this.launcher.dataset.open = 'false'
    this.rt.bus.emit('close', undefined)
    this.rt.options.onClose?.()
  }

  toggle(): void {
    if (this.openState) this.close()
    else this.open()
  }

  isOpen(): boolean {
    return this.openState
  }

  // ------------------------------------------------------------- launcher

  private bindLauncher(): void {
    const launcher = this.launcher
    const draggable =
      this.rt.options.launcher === false
        ? false
        : typeof this.rt.options.launcher === 'object'
          ? this.rt.options.launcher.draggable !== false
          : true
    let startX = 0
    let startY = 0
    let originX = 0
    let originY = 0
    let dragging = false

    const onPointerMove = (event: PointerEvent) => {
      if (!launcher.hasPointerCapture(event.pointerId)) return
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      if (!dragging && Math.hypot(dx, dy) > 4) {
        dragging = true
        launcher.classList.add('is-dragging')
      }
      if (!dragging) return
      const pos = this.clampLauncher(originX + dx, originY + dy)
      this.positionLauncher(pos.x, pos.y)
    }

    const finish = (event: PointerEvent) => {
      if (!launcher.hasPointerCapture(event.pointerId)) return
      launcher.releasePointerCapture(event.pointerId)
      launcher.removeEventListener('pointermove', onPointerMove)
      launcher.removeEventListener('pointerup', finish)
      launcher.removeEventListener('pointercancel', finish)
      if (dragging) {
        launcher.classList.remove('is-dragging')
        const snapped = this.snapLauncher(
          Number.parseFloat(launcher.style.left) || 0,
          Number.parseFloat(launcher.style.top) || 0
        )
        this.positionLauncher(snapped.x, snapped.y)
        this.saveUi({ launcher: snapped })
        this.suppressedClick = true
        setTimeout(() => {
          this.suppressedClick = false
        }, 0)
      }
      dragging = false
    }

    launcher.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !draggable) return
      const rect = launcher.getBoundingClientRect()
      startX = event.clientX
      startY = event.clientY
      originX = rect.left
      originY = rect.top
      launcher.setPointerCapture(event.pointerId)
      launcher.addEventListener('pointermove', onPointerMove)
      launcher.addEventListener('pointerup', finish)
      launcher.addEventListener('pointercancel', finish)
    })

    launcher.addEventListener('click', () => {
      if (this.suppressedClick) return
      this.toggle()
    })

    this.listeners.push(() => {
      launcher.removeEventListener('pointermove', onPointerMove)
      launcher.removeEventListener('pointerup', finish)
      launcher.removeEventListener('pointercancel', finish)
    })
  }

  private clampLauncher(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.max(4, Math.min(window.innerWidth - LAUNCHER_SIZE - 4, x)),
      y: Math.max(4, Math.min(window.innerHeight - LAUNCHER_SIZE - 4, y))
    }
  }

  private snapLauncher(x: number, y: number): { x: number; y: number } {
    const maxX = window.innerWidth - LAUNCHER_SIZE
    const maxY = window.innerHeight - LAUNCHER_SIZE
    let nextX = x
    let nextY = y
    let edge = ''
    if (x < SNAP_THRESHOLD) {
      nextX = LAUNCHER_MARGIN
      edge = 'left'
    } else if (maxX - x < SNAP_THRESHOLD) {
      nextX = maxX - LAUNCHER_MARGIN
      edge = 'right'
    }
    if (maxY - y < SNAP_THRESHOLD) {
      nextY = maxY - LAUNCHER_MARGIN
      if (!edge) edge = 'bottom'
    }
    this.launcher.dataset.edge = edge
    return this.clampLauncher(nextX, nextY)
  }

  private positionLauncher(x: number, y: number): void {
    this.launcher.style.left = `${x}px`
    this.launcher.style.top = `${y}px`
    this.launcher.style.right = 'auto'
    this.launcher.style.bottom = 'auto'
  }

  private applyLauncherPosition(): void {
    if (this.rt.options.launcher === false) {
      this.launcher.style.display = 'none'
      return
    }
    const saved = this.ui.launcher
    if (saved) {
      const pos = this.snapLauncher(saved.x, saved.y)
      this.positionLauncher(pos.x, pos.y)
      return
    }
    const x = window.innerWidth - LAUNCHER_SIZE - LAUNCHER_MARGIN
    const y = window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN
    this.positionLauncher(x, y)
    this.launcher.dataset.edge = 'right'
  }

  // -------------------------------------------------------------- resizer

  private bindResizer(): void {
    const handle = this.panel.querySelector('.rdt-resizer') as HTMLElement | null
    if (!handle) return
    let dragging = false

    const onMove = (event: PointerEvent) => {
      if (!dragging) return
      const dock = this.ui.dock
      if (dock === 'bottom') {
        const height = Math.max(220, Math.min(window.innerHeight * 0.78, window.innerHeight - event.clientY - 12))
        this.panel.style.height = `${height}px`
        return
      }
      const raw =
        dock === 'right' ? window.innerWidth - event.clientX - HOST_MARGIN : event.clientX - HOST_MARGIN
      const width = this.resolveWidth(raw)
      this.root.style.setProperty('--rdt-width', `${width}px`)
    }

    const finish = (event: PointerEvent) => {
      if (!dragging) return
      dragging = false
      handle.classList.remove('is-dragging')
      handle.releasePointerCapture(event.pointerId)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', finish)
      const dock = this.ui.dock
      if (dock === 'bottom') return
      const width = Number.parseFloat(
        getComputedStyle(this.root).getPropertyValue('--rdt-width') || `${this.ui.width}`
      )
      this.saveUi({ width })
    }

    handle.addEventListener('pointerdown', (event) => {
      dragging = true
      handle.classList.add('is-dragging')
      handle.setPointerCapture(event.pointerId)
      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', finish)
    })
  }

  // ---------------------------------------------------------------- global

  private bindGlobal(): void {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.openState) {
        event.stopPropagation()
        this.close()
        return
      }
      const shortcut = this.rt.options.shortcut
      if (!shortcut) return
      const parsed = parseHotkey(shortcut)
      if (!parsed) return
      if (isEditableTarget(event.target) && !parsed.alt && !parsed.meta && !parsed.ctrl) return
      if (matchHotkey(event, parsed)) {
        event.preventDefault()
        this.toggle()
      }
    }
    const onResize = () => {
      this.root.style.setProperty('--rdt-width', `${this.resolveWidth(this.ui.width)}px`)
      if (!this.launcher.style.left) return
      const pos = this.clampLauncher(
        Number.parseFloat(this.launcher.style.left) || 0,
        Number.parseFloat(this.launcher.style.top) || 0
      )
      this.positionLauncher(pos.x, pos.y)
    }
    window.addEventListener('keydown', onKeydown, true)
    window.addEventListener('resize', onResize)
    this.listeners.push(() => {
      window.removeEventListener('keydown', onKeydown, true)
      window.removeEventListener('resize', onResize)
    })
  }

  // ----------------------------------------------------------------- toast

  addToast(text: string, tone: ToastTone = 'info'): void {
    const el = h('div', { class: 'rdt-toast', dataset: { tone }, role: 'status' }, [
      h('span', { class: 'rdt-toast__dot' }),
      h('span', { text })
    ])
    this.toastsEl.appendChild(el)
    setTimeout(() => {
      el.style.opacity = '0'
      el.style.transform = 'translateY(4px)'
      el.style.transition = 'opacity .16s ease, transform .16s ease'
      setTimeout(() => el.remove(), 170)
    }, 2100)
  }

  // ----------------------------------------------------------------- reset

  private applyReset(): void {
    this.ui.launcher = null
    this.ui.width = this.rt.options.width
    this.root.style.setProperty('--rdt-width', `${this.ui.width}px`)
    this.panel.dataset.dock = this.rt.options.dock
    this.ui.dock = this.rt.options.dock
    this.applyLauncherPosition()
    const first = [...this.entries.keys()][0]
    if (first) this.activate(first)
  }

  dispose(): void {
    this.listeners.forEach((off) => off())
    this.listeners = []
    if (this.mediaQuery) this.mediaQuery.removeEventListener('change', this.onMediaChange)
    for (const entry of this.entries.values()) {
      entry.disposers.forEach((dispose) => {
        try {
          dispose()
        } catch {
          // ignore
        }
      })
    }
    this.entries.clear()
    this.root.remove()
  }
}
