import { describe, expect, it, vi } from 'vitest'
import { ConfigStore, fieldDefault } from '../src/core/config-store'
import type { ConfigField } from '../src/types'

class MemoryStorage {
  data = new Map<string, unknown>()
  getJSON<T>(key: string, fallback: T): T {
    return (this.data.has(key) ? (this.data.get(key) as T) : fallback) as T
  }
  setJSON(key: string, value: unknown): void {
    this.data.set(key, value)
  }
}

const fields: ConfigField[] = [
  {
    key: 'gateway',
    type: 'select',
    label: '网关',
    options: [
      { label: '本地', value: 'http://localhost' },
      { label: '测试', value: 'http://test' }
    ]
  },
  { key: 'token', type: 'text', label: 'Token' },
  { key: 'retry', type: 'number', label: '重试', defaultValue: 3 },
  { key: 'mock', type: 'switch', label: 'Mock' }
]

describe('ConfigStore', () => {
  it('用字段默认值初始化', () => {
    const store = new ConfigStore(fields, new MemoryStorage() as never)
    expect(store.get()).toEqual({
      gateway: 'http://localhost',
      token: '',
      retry: 3,
      mock: false
    })
  })

  it('本地保存值优先于默认值，并做类型归一化', () => {
    const storage = new MemoryStorage()
    storage.setJSON('values', { gateway: 'http://test', mock: 'yes', retry: '8' })
    const store = new ConfigStore(fields, storage as never)
    expect(store.get()).toEqual({
      gateway: 'http://test',
      token: '',
      retry: 8,
      mock: true
    })
  })

  it('丢弃已不存在字段的历史值', () => {
    const storage = new MemoryStorage()
    storage.setJSON('values', { removed: 'old' })
    const store = new ConfigStore(fields, storage as never)
    expect(Object.keys(store.get()).sort()).toEqual(['gateway', 'mock', 'retry', 'token'])
  })

  it('本地保存值优先于代码传入的初始值', () => {
    const storage = new MemoryStorage()
    storage.setJSON('values', { gateway: 'http://test' })
    const store = new ConfigStore(fields, storage as never, [], { gateway: 'http://localhost' })
    expect(store.getValue('gateway')).toBe('http://test')
  })

  it('set 会持久化并派发变更', () => {
    const storage = new MemoryStorage()
    const store = new ConfigStore(fields, storage as never)
    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.set('mock', true)).toBe(true)
    expect(store.getValue('mock')).toBe(true)
    expect(listener).toHaveBeenCalledWith({
      values: expect.objectContaining({ mock: true }),
      changed: 'mock',
      source: 'user'
    })
    expect((storage.data.get('values') as Record<string, unknown>).mock).toBe(true)
  })

  it('重复赋相同值不派发', () => {
    const store = new ConfigStore(fields, new MemoryStorage() as never)
    const listener = vi.fn()
    store.subscribe(listener)
    store.set('retry', 3)
    expect(listener).not.toHaveBeenCalled()
  })

  it('reset 恢复默认值', () => {
    const store = new ConfigStore(fields, new MemoryStorage() as never)
    store.set('gateway', 'http://test')
    store.set('mock', true)
    store.reset()
    expect(store.getValue('gateway')).toBe('http://localhost')
    expect(store.getValue('mock')).toBe(false)
  })

  it('registerField 使用已有持久化值，移除后清理', () => {
    const storage = new MemoryStorage()
    storage.setJSON('values', { feature: true })
    const store = new ConfigStore(fields, storage as never)
    const dispose = store.registerField({ key: 'feature', type: 'switch', label: 'Feature' })
    expect(store.getValue('feature')).toBe(true)
    dispose()
    expect(store.getValue('feature', 'gone')).toBe('gone')
  })

  it('分组按声明顺序输出，未声明的分组追加在后', () => {
    const store = new ConfigStore(fields, new MemoryStorage() as never, [{ id: 'iface', label: '接口' }])
    expect(store.groups.map((group) => group.id)).toEqual(['iface', 'general'])
  })

  it('switch 的字符串历史值按语义归一化', () => {
    const storage = new MemoryStorage()
    storage.setJSON('values', { mock: 'false' })
    const store = new ConfigStore(fields, storage as never)
    expect(store.getValue('mock')).toBe(false)
    store.set('mock', '0')
    expect(store.getValue('mock')).toBe(false)
    store.set('mock', 'off')
    expect(store.getValue('mock')).toBe(false)
    store.set('mock', 'yes')
    expect(store.getValue('mock')).toBe(true)
  })

  it('number 非法值回退默认值，并按 min / max 夹取', () => {
    const constrained: ConfigField[] = [
      { key: 'retry', type: 'number', label: '重试', defaultValue: 3, min: 1, max: 5 }
    ]
    const storage = new MemoryStorage()
    storage.setJSON('values', { retry: 'abc' })
    const store = new ConfigStore(constrained, storage as never)
    expect(store.getValue('retry')).toBe(3)
    store.set('retry', 0)
    expect(store.getValue('retry')).toBe(1)
    store.set('retry', 99)
    expect(store.getValue('retry')).toBe(5)
    store.set('retry', 4.5)
    expect(store.getValue('retry')).toBe(4.5)
  })

  it('select 的历史值不在 options 内时回退，allowCustom 则保留', () => {
    const storage = new MemoryStorage()
    storage.setJSON('values', { gateway: 'http://removed', custom: 'http://mine' })
    const list: ConfigField[] = [
      ...fields,
      {
        key: 'custom',
        type: 'select',
        label: '自定义',
        allowCustom: true,
        options: [{ label: '本地', value: 'http://local' }]
      }
    ]
    const store = new ConfigStore(list, storage as never)
    expect(store.getValue('gateway')).toBe('http://localhost')
    expect(store.getValue('custom')).toBe('http://mine')
  })

  it('setMany 忽略未知字段，set 未知字段返回 false', () => {
    const store = new ConfigStore(fields, new MemoryStorage() as never)
    expect(store.set('not-exist', 'x')).toBe(false)
    expect(store.setMany({ mock: true, notExist: 1 })).toBe(true)
    expect(store.getValue('mock')).toBe(true)
    expect(store.get()).not.toHaveProperty('notExist')
  })

  it('reset 派发 source=reset', () => {
    const store = new ConfigStore(fields, new MemoryStorage() as never)
    store.set('mock', true)
    const listener = vi.fn()
    store.subscribe(listener)
    store.reset()
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ changed: '*', source: 'reset', values: expect.objectContaining({ mock: false }) })
    )
  })

  it('fieldDefault 覆盖所有字段类型', () => {
    expect(fieldDefault({ key: 'a', type: 'text', label: 'A' })).toBe('')
    expect(fieldDefault({ key: 'b', type: 'number', label: 'B', defaultValue: 2 })).toBe(2)
    expect(fieldDefault({ key: 'c', type: 'switch', label: 'C' })).toBe(false)
    expect(
      fieldDefault({
        key: 'd',
        type: 'select',
        label: 'D',
        options: [{ label: 'One', value: 'one' }]
      })
    ).toBe('one')
  })
})
