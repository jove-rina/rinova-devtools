export interface Hotkey {
  key: string
  alt: boolean
  ctrl: boolean
  meta: boolean
  shift: boolean
}

/** 解析 "alt+shift+d" / "ctrl+shift+i" 形式的快捷键 */
export function parseHotkey(input: string): Hotkey | null {
  const parts = input
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const hotkey: Hotkey = { key: '', alt: false, ctrl: false, meta: false, shift: false }
  for (const part of parts) {
    if (part === 'alt' || part === 'option') hotkey.alt = true
    else if (part === 'ctrl' || part === 'control') hotkey.ctrl = true
    else if (part === 'meta' || part === 'cmd' || part === 'command') hotkey.meta = true
    else if (part === 'shift') hotkey.shift = true
    else hotkey.key = part
  }
  return hotkey.key ? hotkey : null
}

export function matchHotkey(event: KeyboardEvent, hotkey: Hotkey): boolean {
  const key = event.key.toLowerCase()
  const normalized = hotkey.key === 'space' ? ' ' : hotkey.key
  return (
    key === normalized &&
    Boolean(event.altKey) === hotkey.alt &&
    Boolean(event.ctrlKey) === hotkey.ctrl &&
    Boolean(event.metaKey) === hotkey.meta &&
    Boolean(event.shiftKey) === hotkey.shift
  )
}

/** 焦点位于输入控件时，避免无修饰键快捷键误触 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}
