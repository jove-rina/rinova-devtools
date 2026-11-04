import { afterEach } from 'vitest'
import { createDevtools, type DevtoolsInstance, type DevtoolsOptions } from '../src/index'

const mounted: DevtoolsInstance[] = []

/** 创建并挂载一个实例，afterEach 会统一销毁 */
export function mountDevtools(options: DevtoolsOptions = {}): DevtoolsInstance {
  const instance = createDevtools({
    appName: 'Test App',
    enabled: true,
    shortcut: 'alt+shift+d',
    storagePrefix: 'rdt-test',
    ...options
  })
  instance.mount()
  mounted.push(instance)
  return instance
}

export function host(): HTMLElement | null {
  return document.querySelector('rinova-devtools')
}

export function shadow(): ShadowRoot {
  const el = host()
  if (!el?.shadowRoot) throw new Error('devtools host not mounted')
  return el.shadowRoot
}

export function q<T extends Element = HTMLElement>(selector: string): T {
  const el = shadow().querySelector<T>(selector)
  if (!el) throw new Error(`selector not found: ${selector}`)
  return el
}

export function qa<T extends Element = HTMLElement>(selector: string): T[] {
  return [...shadow().querySelectorAll<T>(selector)]
}

export function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

export function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export function choose(el: HTMLSelectElement, value: string): void {
  el.value = value
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

export function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      bubbles: true,
      cancelable: true,
      ...init
    })
  )
}

export const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

afterEach(() => {
  while (mounted.length) {
    const instance = mounted.pop()
    try {
      instance?.destroy()
    } catch {
      // ignore cleanup errors
    }
  }
  document.body.innerHTML = ''
  localStorage.clear()
  sessionStorage.clear()
})
