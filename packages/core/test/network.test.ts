import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkCapture } from '../src/core/network-capture'

interface FakeResponseInit {
  status?: number
  statusText?: string
  body?: string
  contentType?: string
  contentLength?: number
}

function fakeResponse(init: FakeResponseInit = {}): Response {
  const headers = new Map<string, string>()
  headers.set('content-type', init.contentType ?? 'application/json')
  if (init.contentLength !== undefined) headers.set('content-length', String(init.contentLength))

  const make = (): Response =>
    ({
      status: init.status ?? 200,
      ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
      statusText: init.statusText ?? 'OK',
      headers: {
        get: (name: string) => headers.get(name.toLowerCase()) ?? null,
        forEach: (cb: (value: string, key: string) => void) => {
          headers.forEach((value, key) => cb(value, key))
        }
      },
      clone: () => make(),
      text: async () => init.body ?? ''
    }) as unknown as Response

  return make()
}

class FakeXHR {
  static last: FakeXHR | null = null
  status = 0
  statusText = ''
  responseType = ''
  responseText = ''
  response: unknown = null
  method = ''
  url = ''
  body: unknown = null
  private listeners: Record<string, Array<(this: FakeXHR) => void>> = {}

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  send(body: unknown): void {
    this.body = body
    FakeXHR.last = this
  }

  addEventListener(type: string, callback: (this: FakeXHR) => void): void {
    ;(this.listeners[type] ??= []).push(callback)
  }

  getAllResponseHeaders(): string {
    return 'content-type: application/json\r\nx-test: yes\r\n'
  }

  finish(status: number, text: string): void {
    this.status = status
    this.statusText = status === 200 ? 'OK' : 'Error'
    this.responseText = text
    ;(this.listeners.loadend ?? []).forEach((callback) => callback.call(this))
  }
}

const originalFetch = window.fetch
let capture: NetworkCapture | null = null

function start(options: ConstructorParameters<typeof NetworkCapture>[0] = {}): NetworkCapture {
  capture = new NetworkCapture(options)
  capture.start()
  return capture
}

const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  window.fetch = originalFetch
})

afterEach(() => {
  capture?.stop()
  capture = null
  window.fetch = originalFetch
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('NetworkCapture / fetch', () => {
  it('start 前不补丁，entries 为空', () => {
    const instance = new NetworkCapture()
    expect(instance.entries()).toEqual([])
    expect(instance.capturing()).toBe(true)
    instance.setCapturing(false)
    expect(instance.capturing()).toBe(false)
  })

  it('stop 后还原 fetch 引用', () => {
    const custom = vi.fn()
    window.fetch = custom as never
    const instance = start()
    expect(window.fetch).not.toBe(custom)
    instance.stop()
    expect(window.fetch).toBe(custom)
    capture = null
  })

  it('记录成功请求的完整信息', async () => {
    window.fetch = vi.fn(async () =>
      fakeResponse({ body: '{"ok":true}', contentLength: 11 })
    ) as never
    const instance = start()
    await window.fetch('/api/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-trace': 'abc' },
      body: '{"id":1}'
    })
    await wait()

    const entry = instance.entries()[0]
    expect(entry.kind).toBe('fetch')
    expect(entry.method).toBe('POST')
    expect(entry.url).toBe('/api/order')
    expect(entry.status).toBe(200)
    expect(entry.ok).toBe(true)
    expect(entry.pending).toBe(false)
    expect(entry.requestHeaders['content-type']).toBe('application/json')
    expect(entry.requestBody).toBe('{"id":1}')
    expect(entry.responseHeaders['content-type']).toBe('application/json')
    expect(entry.responseBody).toBe('{"ok":true}')
    expect(entry.responseSize).toBe(11)
    expect(entry.duration).toBeGreaterThanOrEqual(0)
  })

  it('非 2xx 标记为异常，不抛出', async () => {
    window.fetch = vi.fn(async () => fakeResponse({ status: 500, statusText: 'Server Error' })) as never
    const instance = start()
    await window.fetch('/api/error')
    await wait()
    const entry = instance.entries()[0]
    expect(entry.status).toBe(500)
    expect(entry.ok).toBe(false)
    expect(entry.pending).toBe(false)
  })

  it('网络失败记录 error 并继续抛出', async () => {
    window.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as never
    const instance = start()
    await expect(window.fetch('/api/down')).rejects.toThrow('Failed to fetch')
    await wait()
    const entry = instance.entries()[0]
    expect(entry.error).toBe('Failed to fetch')
    expect(entry.ok).toBe(false)
    expect(entry.pending).toBe(false)
  })

  it('忽略名单中的 URL 不记录', async () => {
    window.fetch = vi.fn(async () => fakeResponse()) as never
    const instance = start({ ignore: ['/telemetry'] })
    await window.fetch('/telemetry/ping')
    await window.fetch('/api/ok')
    await wait()
    expect(instance.entries()).toHaveLength(1)
    expect(instance.entries()[0].url).toBe('/api/ok')
  })

  it('暂停采集后放行请求但不记录，恢复后继续记录', async () => {
    window.fetch = vi.fn(async () => fakeResponse()) as never
    const instance = start()
    instance.setCapturing(false)
    await window.fetch('/api/a')
    expect(instance.entries()).toHaveLength(0)
    instance.setCapturing(true)
    await window.fetch('/api/b')
    await wait()
    expect(instance.entries()).toHaveLength(1)
    expect(instance.entries()[0].url).toBe('/api/b')
  })

  it('环形缓冲保留最新 N 条', async () => {
    window.fetch = vi.fn(async () => fakeResponse()) as never
    const instance = start({ maxEntries: 2 })
    await window.fetch('/api/1')
    await window.fetch('/api/2')
    await window.fetch('/api/3')
    await wait()
    expect(instance.entries().map((entry) => entry.url)).toEqual(['/api/3', '/api/2'])
  })

  it('非文本响应不读 body，但保留 content-length', async () => {
    window.fetch = vi.fn(async () =>
      fakeResponse({ contentType: 'image/png', contentLength: 2048 })
    ) as never
    const instance = start()
    await window.fetch('/img.png')
    await wait()
    expect(instance.entries()[0].responseBody).toBeUndefined()
    expect(instance.entries()[0].responseSize).toBe(2048)
  })

  it('超大响应体截断并标注', async () => {
    const body = 'x'.repeat(200_005)
    window.fetch = vi.fn(async () => fakeResponse({ body })) as never
    const instance = start()
    await window.fetch('/api/big')
    await wait(40)
    const captured = instance.entries()[0].responseBody ?? ''
    expect(captured).toContain('truncated 5 chars')
    expect(captured.length).toBeLessThan(200_100)
    expect(captured.startsWith('x'.repeat(100))).toBe(true)
  })

  it('响应体异步补写，不阻塞返回的 Response', async () => {
    let release: (value: string) => void = () => {}
    const gate = new Promise<string>((resolve) => {
      release = resolve
    })
    window.fetch = vi.fn(async () => {
      const response = fakeResponse({ body: '' })
      return {
        ...response,
        clone: () => ({ ...response, text: () => gate }) as unknown as Response,
        text: async () => 'for caller'
      } as unknown as Response
    }) as never

    const instance = start()
    const response = await window.fetch('/api/slow-body')
    expect(await response.text()).toBe('for caller')
    expect(instance.entries()[0].responseBody).toBeUndefined()
    release('late body')
    await wait(20)
    expect(instance.entries()[0].responseBody).toBe('late body')
  })

  it('replay 生成一条新记录', async () => {
    window.fetch = vi.fn(async () => fakeResponse({ body: '{}' })) as never
    const instance = start()
    await window.fetch('/api/replay', { method: 'POST', body: '{"a":1}' })
    await wait()
    const first = instance.entries()[0]
    const replayed = await instance.replay(first.id)
    await wait()
    expect(instance.entries()).toHaveLength(2)
    expect(replayed?.id).not.toBe(first.id)
    expect(replayed?.method).toBe('POST')
    expect(replayed?.requestBody).toBe('{"a":1}')
  })

  it('replay 不存在的 id 返回 undefined', async () => {
    const instance = start()
    await expect(instance.replay('missing')).resolves.toBeUndefined()
  })

  it('clear 清空并通知订阅者', () => {
    const instance = new NetworkCapture()
    let count = 0
    const off = instance.subscribeChange(() => {
      count += 1
    })
    instance.clear()
    expect(count).toBe(1)
    off()
    instance.clear()
    expect(count).toBe(1)
  })
})

describe('NetworkCapture / XHR', () => {
  it('记录 XHR 状态、响应头与响应体', () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    const instance = start()
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/api/xhr')
    xhr.send()
    FakeXHR.last?.finish(200, '{"xhr":true}')

    const entry = instance.entries()[0]
    expect(entry.kind).toBe('xhr')
    expect(entry.method).toBe('GET')
    expect(entry.url).toBe('/api/xhr')
    expect(entry.status).toBe(200)
    expect(entry.ok).toBe(true)
    expect(entry.responseHeaders['x-test']).toBe('yes')
    expect(entry.responseBody).toBe('{"xhr":true}')
  })

  it('XHR 网络错误（status=0）标记异常', () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    const instance = start()
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/xhr-fail')
    xhr.send('body')
    FakeXHR.last?.finish(0, '')

    const entry = instance.entries()[0]
    expect(entry.status).toBe(0)
    expect(entry.ok).toBe(false)
    expect(entry.error).toBe('Network error')
    expect(entry.requestBody).toBe('body')
  })
})
