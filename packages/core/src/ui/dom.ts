import { createIcon } from '../icons'
import type { IconName } from '../types'

type Child = Node | string | number | null | undefined | false
type Children = Child | Children[]

export interface ElementAttrs {
  class?: string
  text?: string
  html?: string
  title?: string
  type?: string
  value?: string
  placeholder?: string
  disabled?: boolean
  checked?: boolean
  style?: Partial<CSSStyleDeclaration> | Record<string, string>
  dataset?: Record<string, string>
  [key: string]: unknown
}

function applyAttrs(el: Element, attrs: ElementAttrs = {}): void {
  for (const [rawKey, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue
    if (rawKey === 'class') {
      el.setAttribute('class', String(value))
      continue
    }
    if (rawKey === 'text') {
      el.textContent = String(value)
      continue
    }
    if (rawKey === 'html') {
      el.innerHTML = String(value)
      continue
    }
    if (rawKey === 'style') {
      if (typeof value === 'string') {
        el.setAttribute('style', value)
      } else {
        Object.assign((el as HTMLElement).style, value)
      }
      continue
    }
    if (rawKey === 'dataset') {
      for (const [dk, dv] of Object.entries(value as Record<string, string>)) {
        ;(el as HTMLElement).dataset[dk] = dv
      }
      continue
    }
    if (rawKey.startsWith('on') && typeof value === 'function') {
      el.addEventListener(rawKey.slice(2).toLowerCase(), value as EventListener)
      continue
    }
    if (value === true) {
      el.setAttribute(rawKey, '')
      continue
    }
    el.setAttribute(rawKey, String(value))
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: ElementAttrs | null,
  children?: Children
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  applyAttrs(el, attrs ?? {})
  append(el, children)
  return el
}

export function append(parent: Element, children?: Children): void {
  if (children === undefined || children === null || children === false) return
  if (Array.isArray(children)) {
    for (const child of children) append(parent, child)
    return
  }
  parent.appendChild(typeof children === 'string' || typeof children === 'number'
    ? document.createTextNode(String(children))
    : children)
}

export function icon(name: IconName | undefined, size = 16, strokeWidth = 1.8): SVGSVGElement {
  return createIcon(name, size, strokeWidth)
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild)
}

export function button(
  label: string,
  opts: {
    icon?: IconName
    tone?: 'default' | 'primary' | 'danger' | 'ghost'
    onClick?: (event: MouseEvent) => void
    title?: string
  } = {}
): HTMLButtonElement {
  const tone = opts.tone ?? 'default'
  const el = h(
    'button',
    {
      class: `rdt-btn rdt-btn--${tone}`,
      type: 'button',
      title: opts.title ?? label,
      onClick: opts.onClick
    },
    [opts.icon ? icon(opts.icon, 14, 2) : null, label ? h('span', { class: 'rdt-btn__label', text: label }) : null]
  )
  if (!label) el.classList.add('rdt-btn--icon-only')
  return el
}

export function field(label: string, control: Node, hint?: string): HTMLElement {
  return h('label', { class: 'rdt-field' }, [
    h('span', { class: 'rdt-field__label', text: label }),
    control,
    hint ? h('span', { class: 'rdt-field__hint', text: hint }) : null
  ])
}

export function empty(text: string, iconName?: IconName): HTMLElement {
  return h('div', { class: 'rdt-empty' }, [
    iconName ? h('span', { class: 'rdt-empty__icon' }, icon(iconName, 22, 1.6)) : null,
    h('p', { class: 'rdt-empty__text', text })
  ])
}

export function tag(text: string, tone: 'neutral' | 'ok' | 'warn' | 'error' | 'info' = 'neutral'): HTMLElement {
  return h('span', { class: `rdt-tag rdt-tag--${tone}`, text })
}

export function segmented<T extends string>(
  items: Array<{ value: T; label: string; icon?: IconName }>,
  value: T,
  onPick: (value: T) => void
): HTMLElement {
  const wrap = h('div', { class: 'rdt-segmented', role: 'tablist' })
  const buttons: HTMLButtonElement[] = []
  const paint = (current: T) => {
    buttons.forEach((b) => b.classList.toggle('is-active', b.dataset.value === current))
  }
  for (const item of items) {
    const btn = h(
      'button',
      {
        class: 'rdt-segmented__item',
        type: 'button',
        dataset: { value: item.value },
        onClick: () => {
          paint(item.value)
          onPick(item.value)
        }
      },
      [item.icon ? icon(item.icon, 13, 2) : null, h('span', { text: item.label })]
    )
    buttons.push(btn)
    wrap.appendChild(btn)
  }
  paint(value)
  return wrap
}
