/** 带命名空间的 localStorage 访问；不可用时退化为内存，保证隐私模式不崩 */
export class SafeStorage {
  private memory = new Map<string, string>()
  private available = true

  constructor(private prefix: string) {
    try {
      const probe = `${prefix}:__probe__`
      window.localStorage.setItem(probe, '1')
      window.localStorage.removeItem(probe)
    } catch {
      this.available = false
    }
  }

  private get store(): Storage | undefined {
    if (!this.available) return undefined
    try {
      return window.localStorage
    } catch {
      return undefined
    }
  }

  private full(key: string): string {
    return `${this.prefix}:${key}`
  }

  get(key: string): string | null {
    const full = this.full(key)
    const store = this.store
    if (store) {
      try {
        const value = store.getItem(full)
        if (value !== null) return value
      } catch {
        // 读取失败时使用内存副本
      }
    }
    return this.memory.get(full) ?? null
  }

  set(key: string, value: string): void {
    const full = this.full(key)
    this.memory.set(full, value)
    try {
      this.store?.setItem(full, value)
    } catch {
      // 配额不足时只保留内存副本
    }
  }

  remove(key: string): void {
    this.memory.delete(this.full(key))
    try {
      this.store?.removeItem(this.full(key))
    } catch {
      // ignore
    }
  }

  getJSON<T>(key: string, fallback: T): T {
    const raw = this.get(key)
    if (!raw) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  setJSON(key: string, value: unknown): void {
    try {
      this.set(key, JSON.stringify(value))
    } catch {
      // ignore
    }
  }

  /** 清理本命名空间下的所有键（其他工具的数据不受影响） */
  clearNamespace(): void {
    const prefix = `${this.prefix}:`
    const keys: string[] = []
    const store = this.store
    if (store) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i)
        if (key && key.startsWith(prefix)) keys.push(key)
      }
    }
    keys.forEach((key) => store?.removeItem(key))
    for (const key of [...this.memory.keys()]) {
      if (key.startsWith(prefix)) this.memory.delete(key)
    }
  }
}

/** 拷贝到剪贴板，返回是否成功（含非安全上下文降级） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

/** 触发浏览器下载（导出配置等） */
export function downloadText(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
