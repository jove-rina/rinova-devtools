import type { NetworkCaptureOptions, NetworkEntry } from '../types'
import { id, normalizeHeaders, requestUrl } from '../utils/format'

type EntryListener = (entry: NetworkEntry) => void

const TEXTUAL =
  /json|text|xml|javascript|graphql|x-www-form-urlencoded|html|plain/i

function headerValue(headers: Record<string, string>, name: string): string {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name)
  return key ? headers[key] : ''
}

function bodyToString(body: BodyInit | null | undefined): string | undefined {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  if (body instanceof FormData) {
    const parts: string[] = []
    body.forEach((value, key) => {
      parts.push(`${key}=${typeof value === 'string' ? value : '[File]'}`)
    })
    return parts.join('&')
  }
  if (body instanceof Blob) return `[Blob ${body.size} bytes]`
  if (body instanceof ArrayBuffer) return `[ArrayBuffer ${body.byteLength} bytes]`
  return '[binary body]'
}

async function readLimited(response: Response, max = 200_000): Promise<string | undefined> {
  const type = response.headers.get('content-type') ?? ''
  if (!TEXTUAL.test(type)) return undefined
  try {
    const text = await Promise.race([
      response.text(),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 4000))
    ])
    return text.length > max ? `${text.slice(0, max)}\n… [truncated ${text.length - max} chars]` : text
  } catch {
    return undefined
  }
}

/**
 * 网络采集器：直接补丁 window.fetch / XMLHttpRequest。
 * 只在 mount 时启动一次，面板打开/关闭不影响采集。
 */
export class NetworkCapture {
  private list: NetworkEntry[] = []
  private listeners = new Set<EntryListener>()
  private changeListeners = new Set<() => void>()
  private maxEntries: number
  private captureResponseBody: boolean
  private ignore: string[]
  private started = false
  private originalFetch?: typeof window.fetch
  private originalXhrOpen?: XMLHttpRequest['open']
  private originalXhrSend?: XMLHttpRequest['send']
  private enabled = true

  constructor(options: NetworkCaptureOptions = {}) {
    this.maxEntries = options.maxEntries ?? 200
    this.captureResponseBody = options.responseBody ?? true
    this.ignore = options.ignore ?? []
  }

  start(): void {
    if (this.started || typeof window === 'undefined') return
    this.started = true
    this.patchFetch()
    this.patchXhr()
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    if (this.originalFetch) window.fetch = this.originalFetch
    if (this.originalXhrOpen) XMLHttpRequest.prototype.open = this.originalXhrOpen
    if (this.originalXhrSend) XMLHttpRequest.prototype.send = this.originalXhrSend
  }

  capturing(): boolean {
    return this.enabled
  }

  setCapturing(value: boolean): void {
    this.enabled = value
    this.notifyChange()
  }

  entries(): NetworkEntry[] {
    return this.list
  }

  clear(): void {
    this.list = []
    this.notifyChange()
  }

  subscribe(listener: EntryListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeChange(listener: () => void): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  private shouldIgnore(url: string): boolean {
    return this.ignore.some((part) => part && url.includes(part))
  }

  private push(entry: NetworkEntry): void {
    this.list.unshift(entry)
    if (this.list.length > this.maxEntries) this.list.length = this.maxEntries
    this.notifyChange()
  }

  private update(entry: NetworkEntry): void {
    this.notifyChange()
    for (const listener of [...this.listeners]) listener(entry)
  }

  private notifyChange(): void {
    for (const listener of [...this.changeListeners]) listener()
  }

  private patchFetch(): void {
    const original = window.fetch
    if (!original) return
    this.originalFetch = original
    const self = this
    window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
      if (!self.enabled) return original.call(window, input, init)
      const url = requestUrl(input)
      if (self.shouldIgnore(url)) return original.call(window, input, init)

      const request = input instanceof Request ? input : undefined
      const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
      const entry: NetworkEntry = {
        id: id('net'),
        kind: 'fetch',
        method,
        url,
        status: 0,
        statusText: '',
        ok: false,
        pending: true,
        startAt: Date.now(),
        duration: 0,
        requestHeaders: normalizeHeaders(init?.headers ?? request?.headers),
        requestBody: bodyToString(init?.body),
        responseHeaders: {},
        responseSize: 0
      }

      if (!entry.requestBody && request && method !== 'GET' && method !== 'HEAD') {
        // 不阻塞真实请求：克隆体异步读取，读到后补写
        void request
          .clone()
          .text()
          .then((text) => {
            entry.requestBody = text
            self.update(entry)
          })
          .catch(() => {
            // ignore unreadable body
          })
      }

      self.push(entry)
      const started = performance.now()
      const pending = original.call(window, input, init)

      try {
        const response = await pending
        entry.status = response.status
        entry.statusText = response.statusText
        entry.ok = response.ok
        entry.pending = false
        entry.duration = performance.now() - started

        const headers: Record<string, string> = {}
        response.headers.forEach((value, key) => {
          headers[key] = value
        })
        entry.responseHeaders = headers
        const length = Number(headerValue(headers, 'content-length'))
        entry.responseSize = Number.isFinite(length) && length > 0 ? length : 0
        self.update(entry)

        // 响应体异步读取，绝不拖慢调用方的 fetch promise
        if (self.captureResponseBody) {
          void readLimited(response.clone()).then((body) => {
            if (body !== undefined) {
              entry.responseBody = body
              if (!entry.responseSize) entry.responseSize = new Blob([body]).size
              self.update(entry)
            }
          })
        }
        return response
      } catch (error) {
        entry.pending = false
        entry.error = error instanceof Error ? error.message : String(error)
        entry.duration = performance.now() - started
        self.update(entry)
        throw error
      }
    }
  }

  private patchXhr(): void {
    if (typeof XMLHttpRequest === 'undefined') return
    const self = this
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send
    this.originalXhrOpen = originalOpen
    this.originalXhrSend = originalSend

    XMLHttpRequest.prototype.open = function patchedOpen(
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      ;(this as XMLHttpRequest & { __rdt?: { method: string; url: string } }).__rdt = {
        method: String(method).toUpperCase(),
        url: String(url)
      }
      // @ts-expect-error 透传原生重载
      return originalOpen.call(this, method, url, ...rest)
    }

    XMLHttpRequest.prototype.send = function patchedSend(body?: Document | XMLHttpRequestBodyInit | null) {
      const meta = (this as XMLHttpRequest & { __rdt?: { method: string; url: string } }).__rdt
      if (!self.enabled || !meta || self.shouldIgnore(meta.url)) {
        return originalSend.call(this, body ?? null)
      }

      const entry: NetworkEntry = {
        id: id('net'),
        kind: 'xhr',
        method: meta.method,
        url: meta.url,
        status: 0,
        statusText: '',
        ok: false,
        pending: true,
        startAt: Date.now(),
        duration: 0,
        requestHeaders: {},
        requestBody: bodyToString(body as BodyInit | null | undefined),
        responseHeaders: {},
        responseSize: 0
      }
      self.push(entry)
      const started = performance.now()

      const finish = () => {
        entry.pending = false
        entry.duration = performance.now() - started
        entry.status = this.status
        entry.statusText = this.statusText
        entry.ok = this.status >= 200 && this.status < 400
        if (this.status === 0) entry.error = 'Network error'
        try {
          const raw = this.getAllResponseHeaders()
          const headers: Record<string, string> = {}
          raw
            .trim()
            .split(/[\r\n]+/)
            .filter(Boolean)
            .forEach((line) => {
              const index = line.indexOf(':')
              if (index > 0) headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim()
            })
          entry.responseHeaders = headers
        } catch {
          // ignore
        }
        try {
          if (self.captureResponseBody && (this.responseType === '' || this.responseType === 'text')) {
            const text = this.responseText
            if (self.captureResponseBody) {
              entry.responseBody = text.length > 200_000 ? `${text.slice(0, 200_000)}\n… [truncated]` : text
              entry.responseSize = new Blob([text]).size
            }
          } else if (this.responseType === 'json') {
            const text = JSON.stringify(this.response)
            entry.responseBody = text
            entry.responseSize = new Blob([text]).size
          }
        } catch {
          // ignore
        }
        self.update(entry)
      }

      this.addEventListener('loadend', finish)
      return originalSend.call(this, body ?? null)
    }
  }

  async replay(entryId: string): Promise<NetworkEntry | undefined> {
    const source = this.list.find((entry) => entry.id === entryId)
    if (!source) return undefined
    const before = this.list.length
    try {
      await window.fetch(source.url, {
        method: source.method,
        headers: source.requestHeaders,
        body: ['GET', 'HEAD'].includes(source.method) ? undefined : source.requestBody,
        credentials: 'same-origin'
      })
    } catch {
      // 重放失败也会作为一条错误记录出现在列表里
    }
    if (this.list.length > before) return this.list[0]
    return this.list[0]
  }
}
