import type { ConfigField, PluginContext, SelectField } from '../types'
import type { Runtime } from '../core/runtime'
import { h, icon, button } from '../ui/dom'

interface Control {
  sync(): void
}

function renderSelect(field: SelectField, ctx: PluginContext, register: (control: Control) => void): HTMLElement {
  if (field.allowCustom) {
    const input = h('input', {
      class: 'rdt-input rdt-mono',
      type: 'text',
      value: String(ctx.getValue(field.key, field.defaultValue ?? '')),
      placeholder: field.placeholder ?? '输入或选择预设值',
      disabled: field.disabled
    })
    input.addEventListener('input', () => ctx.setValue(field.key, input.value))

    const menu = h('div', { class: 'rdt-menu' })
    menu.style.display = 'none'
    for (const option of field.options) {
      menu.appendChild(
        h(
          'button',
          {
            class: 'rdt-menu__item',
            type: 'button',
            onClick: () => {
              input.value = option.value
              ctx.setValue(field.key, option.value)
              menu.style.display = 'none'
            }
          },
          [
            h('span', { text: option.label }),
            option.description ? h('span', { class: 'rdt-menu__desc', text: option.description }) : null
          ]
        )
      )
    }

    const toggle = h(
      'button',
      {
        class: 'rdt-input-addon',
        type: 'button',
        title: '选择预设',
        'aria-label': '选择预设',
        disabled: field.disabled,
        onClick: (event: MouseEvent) => {
          event.stopPropagation()
          menu.style.display = menu.style.display === 'none' ? '' : 'none'
        }
      },
      icon('chevron-down', 13, 2)
    )

    const wrap = h('div', { class: 'rdt-combo' }, [
      h('div', { class: 'rdt-combo__row' }, [input, toggle]),
      menu
    ])

    const onOutside = (event: PointerEvent) => {
      if (!wrap.contains(event.target as Node)) menu.style.display = 'none'
    }
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') menu.style.display = 'none'
    }
    document.addEventListener('pointerdown', onOutside, true)
    document.addEventListener('keydown', onKeydown, true)
    ctx.onDispose(() => {
      document.removeEventListener('pointerdown', onOutside, true)
      document.removeEventListener('keydown', onKeydown, true)
    })

    register({
      sync: () => {
        if (document.activeElement !== input) input.value = String(ctx.getValue(field.key, ''))
      }
    })
    return wrap
  }

  const select = h('select', { disabled: field.disabled })
  field.options.forEach((option) => {
    select.appendChild(
      h('option', {
        value: option.value,
        text: option.description ? `${option.label} · ${option.description}` : option.label
      })
    )
  })
  select.value = String(ctx.getValue(field.key, field.defaultValue ?? ''))
  select.addEventListener('change', () => ctx.setValue(field.key, select.value))
  const wrap = h('div', { class: 'rdt-select' }, [select, h('span', { class: 'rdt-select__chevron' }, icon('chevron-down', 13, 2))])
  register({
    sync: () => {
      select.value = String(ctx.getValue(field.key, ''))
    }
  })
  return wrap
}

function renderField(
  field: ConfigField,
  ctx: PluginContext,
  register: (control: Control) => void,
  onSaved: () => void
): HTMLElement {
  if (field.type === 'switch') {
    const switchEl = h('button', {
      class: 'rdt-switch',
      type: 'button',
      role: 'switch',
      'aria-checked': String(Boolean(ctx.getValue(field.key, field.defaultValue ?? false))),
      'aria-label': field.label,
      disabled: field.disabled,
      onClick: () => {
        const next = switchEl.getAttribute('aria-checked') !== 'true'
        switchEl.setAttribute('aria-checked', String(next))
        ctx.setValue(field.key, next)
        onSaved()
      }
    })
    register({
      sync: () => {
        switchEl.setAttribute('aria-checked', String(Boolean(ctx.getValue(field.key, false))))
      }
    })
    return h('div', { class: 'rdt-field rdt-field--row' }, [
      h('div', { class: 'rdt-field__text' }, [
        h('span', { class: 'rdt-field__label', text: field.label }),
        field.description ? h('span', { class: 'rdt-field__hint', text: field.description }) : null
      ]),
      switchEl
    ])
  }

  let control: HTMLElement
  if (field.type === 'select') {
    control = renderSelect(field, ctx, register)
  } else if (field.type === 'textarea') {
    const textarea = h('textarea', {
      class: `rdt-textarea${field.mono ? ' rdt-mono' : ''}`,
      rows: field.rows ?? 4,
      placeholder: field.placeholder ?? '',
      disabled: field.disabled
    })
    textarea.value = String(ctx.getValue(field.key, ''))
    textarea.addEventListener('input', () => ctx.setValue(field.key, textarea.value))
    register({
      sync: () => {
        if (document.activeElement !== textarea) textarea.value = String(ctx.getValue(field.key, ''))
      }
    })
    control = textarea
  } else if (field.type === 'number') {
    const input = h('input', {
      class: 'rdt-input rdt-mono',
      type: 'number',
      min: field.min,
      max: field.max,
      step: field.step,
      disabled: field.disabled,
      value: String(ctx.getValue(field.key, field.defaultValue ?? 0))
    })
    input.addEventListener('change', () => {
      const numeric = Number(input.value)
      if (Number.isFinite(numeric)) ctx.setValue(field.key, numeric)
    })
    register({
      sync: () => {
        if (document.activeElement !== input) input.value = String(ctx.getValue(field.key, ''))
      }
    })
    control = input
  } else {
    const input = h('input', {
      class: `rdt-input${field.mono ? ' rdt-mono' : ''}`,
      type: 'text',
      placeholder: field.placeholder ?? '',
      disabled: field.disabled,
      readonly: field.copyable,
      value: String(ctx.getValue(field.key, ''))
    })
    input.addEventListener('input', () => {
      if (!field.copyable) ctx.setValue(field.key, input.value)
    })
    register({
      sync: () => {
        if (document.activeElement !== input) input.value = String(ctx.getValue(field.key, ''))
      }
    })
    if (field.copyable) {
      control = h('div', { class: 'rdt-input-group' }, [
        input,
        button('复制', {
          icon: 'copy',
          onClick: () => {
            void ctx.copy(String(ctx.getValue(field.key, '')))
          }
        })
      ])
    } else {
      control = input
    }
  }

  return h('div', { class: 'rdt-field' }, [
    h('span', { class: 'rdt-field__label', text: field.label }),
    control,
    field.description ? h('span', { class: 'rdt-field__hint', text: field.description }) : null
  ])
}

export function configPlugin(rt: Runtime): import('../types').DevtoolsPlugin {
  return {
    id: 'config',
    title: '配置',
    icon: 'sliders-horizontal',
    order: 10,
    subtitle: () => `${rt.config.fields.length} 项 · 修改即时生效`,
    render(container, ctx) {
      const scroll = h('div', { class: 'rdt-scroll-body' })
      const config = h('div', { class: 'rdt-config' })
      const controls = new Map<string, Control>()
      let savedTimer: ReturnType<typeof setTimeout> | undefined

      const savedHint = h('span', { class: 'rdt-field__saved' })
      const markSaved = () => {
        savedHint.textContent = '已保存'
        savedHint.style.opacity = '1'
        if (savedTimer) clearTimeout(savedTimer)
        savedTimer = setTimeout(() => {
          savedHint.style.opacity = '0'
        }, 1200)
      }

      const build = () => {
        controls.clear()
        config.replaceChildren()
        for (const group of rt.config.groups) {
          const fields = rt.config.fieldsOf(group.id)
          if (!fields.length) continue
          const section = h('section', { class: 'rdt-group' }, [
            h('div', { class: 'rdt-group__head' }, [
              h('h3', { class: 'rdt-group__title', text: group.label }),
              group.description ? h('span', { class: 'rdt-group__desc', text: group.description }) : null
            ])
          ])
          for (const field of fields) {
            section.appendChild(
              renderField(field, ctx, (control) => controls.set(field.key, control), markSaved)
            )
          }
          config.appendChild(section)
        }

        const footer = h('div', { class: 'rdt-config__footer' }, [
          button('恢复默认', {
            icon: 'rotate-ccw',
            onClick: () => {
              rt.config.reset()
              controls.forEach((control) => control.sync())
              ctx.toast('已恢复默认配置', 'success')
            }
          }),
          savedHint,
          h('span', { class: 'rdt-statusbar__spacer' }),
          h('span', { text: '自动保存到本地' })
        ])
        config.appendChild(footer)
      }

      build()
      scroll.appendChild(config)
      container.appendChild(scroll)

      ctx.onChange(() => {
        controls.forEach((control) => control.sync())
      })
      ctx.on('config:fields', () => build())
      ctx.on('plugin:activate', ({ id }: { id: string }) => {
        if (id === 'config') controls.forEach((control) => control.sync())
      })
      ctx.onDispose(() => {
        if (savedTimer) clearTimeout(savedTimer)
      })
    }
  }
}
