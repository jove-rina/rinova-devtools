/** 纯函数工具：不依赖 DOM，可单独测试 */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1) return '<1 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function formatClock(at: number): string {
  const date = new Date(at)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** 安全 JSON 预览：处理循环引用、函数、超长字符串 */
export function previewValue(value: unknown, maxLength = 400): string {
  const seen = new WeakSet<object>()
  try {
    const json = JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`
        if (typeof val === 'bigint') return `${val}n`
        if (val && typeof val === 'object') {
          if (seen.has(val)) return '[Circular]'
          seen.add(val)
        }
        return val
      },
      2
    )
    if (json === undefined) return String(value)
    return truncate(json, maxLength)
  } catch {
    return String(value)
  }
}

export function prettyJSON(text: string | undefined): string {
  if (!text) return ''
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

export function isProbablyJSON(text: string | undefined): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (!/^[[{]/.test(trimmed)) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

export function shortUrl(url: string, max = 90): string {
  try {
    const parsed = new URL(url, location.href)
    const rest = `${parsed.pathname}${parsed.search}`
    return truncate(rest === '/' ? parsed.host : rest, max)
  } catch {
    return truncate(url, max)
  }
}

export function id(prefix = 'rdt'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 从 RequestInfo 推导 URL 字符串 */
export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

/** 简易 headers 归一化 */
export function normalizeHeaders(headers: HeadersInit | undefined | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headers) return out
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value
    })
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value
  } else {
    Object.assign(out, headers)
  }
  return out
}
