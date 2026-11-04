import type { ConfigChangePayload, ConfigField, ConfigGroup, ConfigValue, ValueMap } from '../types'
import type { SafeStorage } from './storage'

const GENERAL_GROUP = 'general'

export function fieldDefault(field: ConfigField): ConfigValue {
  switch (field.type) {
    case 'select':
      return field.defaultValue ?? field.options[0]?.value ?? ''
    case 'number':
      return field.defaultValue ?? 0
    case 'switch':
      return field.defaultValue ?? false
    default:
      return field.defaultValue ?? ''
  }
}

function coerce(field: ConfigField, value: unknown): ConfigValue {
  switch (field.type) {
    case 'switch': {
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        return !(normalized === 'false' || normalized === '0' || normalized === '' || normalized === 'off')
      }
      return Boolean(value)
    }
    case 'number': {
      const numeric = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(numeric)) return fieldDefault(field)
      let clamped = numeric
      if (field.min !== undefined) clamped = Math.max(field.min, clamped)
      if (field.max !== undefined) clamped = Math.min(field.max, clamped)
      return clamped
    }
    case 'select': {
      const text = value === null || value === undefined ? '' : String(value)
      if (!field.allowCustom && field.options.length) {
        const allowed = field.options.some((option) => option.value === text)
        if (!allowed) return field.defaultValue ?? field.options[0].value
      }
      return text
    }
    case 'text':
    case 'textarea':
      return value === null || value === undefined ? '' : String(value)
    default:
      return null
  }
}

export class ConfigStore {
  private fieldsMap = new Map<string, ConfigField>()
  private groupOrder: ConfigGroup[] = []
  private state: ValueMap = {}
  private persisted: ValueMap = {}
  private listeners = new Set<(payload: ConfigChangePayload) => void>()

  constructor(
    fields: ConfigField[],
    private storage: SafeStorage,
    groups: ConfigGroup[] = [],
    initial: ValueMap = {}
  ) {
    this.groupOrder = [...groups]
    fields.forEach((field) => this.fieldsMap.set(field.key, field))
    this.persisted = this.storage.getJSON<ValueMap>('values', {})
    this.state = this.buildState(initial)
    this.persist()
  }

  private buildState(initial: ValueMap): ValueMap {
    const persisted = this.persisted
    const state: ValueMap = {}
    for (const [key, field] of this.fieldsMap) {
      const hasInitial = Object.prototype.hasOwnProperty.call(initial, key)
      const hasPersisted = Object.prototype.hasOwnProperty.call(persisted, key)
      const raw = hasPersisted ? persisted[key] : hasInitial ? initial[key] : fieldDefault(field)
      state[key] = coerce(field, raw)
    }
    // 保留已删除字段的历史值会让“配置”看起来不干净，直接丢弃
    return state
  }

  private persist(): void {
    this.storage.setJSON('values', this.state)
  }

  get fields(): ConfigField[] {
    return [...this.fieldsMap.values()]
  }

  get groups(): ConfigGroup[] {
    const result = [...this.groupOrder]
    const seen = new Set(result.map((group) => group.id))
    for (const field of this.fieldsMap.values()) {
      const groupId = field.group ?? GENERAL_GROUP
      if (!seen.has(groupId)) {
        seen.add(groupId)
        result.push({ id: groupId, label: groupId === GENERAL_GROUP ? '常规' : groupId })
      }
    }
    return result
  }

  fieldsOf(groupId: string): ConfigField[] {
    return this.fields.filter((field) => (field.group ?? GENERAL_GROUP) === groupId)
  }

  get(): ValueMap {
    return { ...this.state }
  }

  getValue<T extends ConfigValue = ConfigValue>(key: string, fallback?: T): T {
    const value = this.state[key]
    return (value === undefined ? (fallback as T) : value) as T
  }

  registerField(field: ConfigField): () => void {
    if (this.fieldsMap.has(field.key)) return () => {}
    this.fieldsMap.set(field.key, field)
    this.state[field.key] = coerce(
      field,
      Object.prototype.hasOwnProperty.call(this.persisted, field.key)
        ? this.persisted[field.key]
        : fieldDefault(field)
    )
    this.persist()
    return () => {
      this.fieldsMap.delete(field.key)
      delete this.state[field.key]
      this.persist()
    }
  }

  set(key: string, raw: ConfigValue, source: ConfigChangePayload['source'] = 'user'): boolean {
    const field = this.fieldsMap.get(key)
    if (!field) return false
    const value = coerce(field, raw)
    if (this.state[key] === value) return false
    this.state[key] = value
    this.persist()
    this.emit({ values: this.get(), changed: key, source })
    return true
  }

  setMany(patch: ValueMap, source: ConfigChangePayload['source'] = 'program'): boolean {
    let changed = ''
    for (const [key, value] of Object.entries(patch)) {
      const field = this.fieldsMap.get(key)
      if (!field) continue
      const next = coerce(field, value)
      if (this.state[key] !== next) {
        this.state[key] = next
        changed = key
      }
    }
    if (!changed) return false
    this.persist()
    this.emit({ values: this.get(), changed, source })
    return true
  }

  reset(): void {
    for (const [key, field] of this.fieldsMap) this.state[key] = fieldDefault(field)
    this.persist()
    this.emit({ values: this.get(), changed: '*', source: 'reset' })
  }

  subscribe(listener: (payload: ConfigChangePayload) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(payload: ConfigChangePayload): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(payload)
      } catch (error) {
        console.error('[rinova-devtools] config listener error', error)
      }
    }
  }
}
