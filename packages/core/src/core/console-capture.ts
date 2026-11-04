import type { LogEntry, LogLevel } from '../types'
import { previewValue } from '../utils/format'

type LogListener = (entry: LogEntry) => void

const METHODS: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug']

function serialize(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`
      if (arg instanceof Element) return `<${arg.tagName.toLowerCase()}>`
      return previewValue(arg, 600)
    })
    .join(' ')
}

/** console 采集：保留原 console 行为，只做旁路记录 */
export class ConsoleCapture {
  private list: LogEntry[] = []
  private listeners = new Set<LogListener>()
  private changeListeners = new Set<() => void>()
  private originals = new Map<LogLevel, (...args: unknown[]) => void>()
  private started = false
  private seq = 0
  private onError = (event: ErrorEvent) => {
    this.append('error', [`${event.message} (${event.filename}:${event.lineno})`])
  }
  private onRejection = (event: PromiseRejectionEvent) => {
    this.append('error', ['Unhandled rejection:', event.reason])
  }

  constructor(private maxEntries = 300) {}

  start(): void {
    if (this.started || typeof window === 'undefined') return
    this.started = true
    for (const level of METHODS) {
      const original = console[level]
      this.originals.set(level, original)
      console[level] = (...args: unknown[]) => {
        original.apply(console, args)
        this.append(level, args)
      }
    }
    window.addEventListener('error', this.onError)
    window.addEventListener('unhandledrejection', this.onRejection)
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    for (const [level, original] of this.originals) console[level] = original as typeof console.log
    this.originals.clear()
    window.removeEventListener('error', this.onError)
    window.removeEventListener('unhandledrejection', this.onRejection)
  }

  entries(): LogEntry[] {
    return this.list
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeChange(listener: () => void): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  clear(): void {
    this.list = []
    for (const listener of this.changeListeners) listener()
  }

  private append(level: LogLevel, args: unknown[]): void {
    const text = serialize(args)
    const last = this.list[0]
    if (last && last.level === level && last.args === text && Date.now() - last.at < 1200) {
      last.count += 1
      last.at = Date.now()
      for (const listener of this.changeListeners) listener()
      return
    }
    const entry: LogEntry = { id: ++this.seq, level, at: Date.now(), args: text, count: 1 }
    this.list.unshift(entry)
    if (this.list.length > this.maxEntries) this.list.length = this.maxEntries
    for (const listener of this.changeListeners) listener()
    for (const listener of this.listeners) listener(entry)
  }
}
