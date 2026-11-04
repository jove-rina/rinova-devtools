import { afterEach, describe, expect, it, vi } from 'vitest'
import { SafeStorage, copyText, downloadText } from '../src/core/storage'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('SafeStorage', () => {
  it('读写 / 删除 / JSON 回退', () => {
    const storage = new SafeStorage('test-a')
    storage.set('x', '1')
    expect(storage.get('x')).toBe('1')
    storage.remove('x')
    expect(storage.get('x')).toBeNull()
    storage.set('json', '{bad')
    expect(storage.getJSON('json', { ok: true })).toEqual({ ok: true })
  })

  it('命名空间隔离，只清理自己的键', () => {
    const a = new SafeStorage('ns-a')
    const b = new SafeStorage('ns-b')
    a.set('k', 'a')
    b.set('k', 'b')
    localStorage.setItem('unrelated', 'keep')
    a.clearNamespace()
    expect(a.get('k')).toBeNull()
    expect(b.get('k')).toBe('b')
    expect(localStorage.getItem('unrelated')).toBe('keep')
  })

  it('localStorage 不可用时退化到内存', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const storage = new SafeStorage('offline')
    storage.set('k', 'v')
    expect(storage.get('k')).toBe('v')
    storage.clearNamespace()
    expect(storage.get('k')).toBeNull()
  })

  it('写入配额失败时不抛错，内存副本保留', () => {
    let calls = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      calls += 1
      if (calls > 1) throw new Error('QuotaExceededError')
    })
    const storage = new SafeStorage('quota')
    storage.setJSON('large', { a: 1 })
    expect(storage.getJSON('large', null)).toEqual({ a: 1 })
  })
})

describe('clipboard / download', () => {
  it('优先使用 navigator.clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(copyText('hello')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('clipboard 不可用时走 execCommand 降级', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn(() => true) as never
    await expect(copyText('fallback')).resolves.toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('两种方式都失败时返回 false，不抛错', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn(() => false) as never
    await expect(copyText('x')).resolves.toBe(false)
  })

  it('downloadText 生成 Blob 链接并触发下载', () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadText('config.json', '{"a":1}')
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
  })
})
