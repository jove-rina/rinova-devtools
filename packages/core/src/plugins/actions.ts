import type { DevtoolsAction } from '../types'
import type { Runtime } from '../core/runtime'
import { button, clear, empty, h, icon } from '../ui/dom'

export function actionsPlugin(rt: Runtime): import('../types').DevtoolsPlugin {
  return {
    id: 'actions',
    title: '快捷操作',
    icon: 'zap',
    order: 50,
    subtitle: () => `${rt.actions.length} 个操作 · 由接入方注册`,
    render(container, ctx) {
      const list = h('div', { class: 'rdt-actions rdt-scroll' })
      container.appendChild(list)

      const armed = new Set<string>()
      const timers = new Map<string, ReturnType<typeof setTimeout>>()

      const run = async (action: DevtoolsAction) => {
        if (action.confirm && !armed.has(action.id)) {
          armed.add(action.id)
          paint()
          const timer = setTimeout(() => {
            armed.delete(action.id)
            paint()
          }, 2600)
          timers.set(action.id, timer)
          return
        }
        const timer = timers.get(action.id)
        if (timer) clearTimeout(timer)
        armed.delete(action.id)
        paint()
        try {
          await action.run({
            devtools: ctx.devtools,
            values: ctx.values,
            getValue: (key, fallback) => ctx.getValue(key, fallback),
            setValue: (key, value) => ctx.setValue(key, value),
            open: (pluginId) => ctx.devtools.open(pluginId),
            close: () => ctx.devtools.close(),
            toast: (text, tone) => ctx.toast(text, tone),
            copy: (text) => ctx.copy(text)
          })
        } catch (error) {
          ctx.toast(error instanceof Error ? error.message : String(error), 'error')
          console.error('[rinova-devtools] action failed', error)
        }
      }

      const paint = () => {
        clear(list)
        if (!rt.actions.length) {
          list.appendChild(h('div', { class: 'rdt-actions' }, [
            empty('还没有注册快捷操作。通过 actions 选项或 devtools.registerAction() 添加。', 'zap')
          ]))
          return
        }
        for (const action of rt.actions) {
          const isArmed = armed.has(action.id)
          list.appendChild(
            h(
              'div',
              {
                class: 'rdt-action',
                dataset: { tone: action.tone ?? 'default' },
                role: 'button',
                tabindex: '0',
                onClick: () => void run(action),
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    void run(action)
                  }
                }
              },
              [
                h('span', { class: 'rdt-action__icon' }, icon(action.icon ?? 'play', 15, 1.9)),
                h('span', { class: 'rdt-action__text' }, [
                  h('span', { class: 'rdt-action__label', text: action.label }),
                  action.description ? h('span', { class: 'rdt-action__desc', text: action.description }) : null
                ]),
                h('span', { class: 'rdt-action__run' }, [
                  button(isArmed ? '确认执行？' : '执行', {
                    tone: isArmed ? 'danger' : action.tone === 'danger' ? 'danger' : 'default',
                    onClick: (event: MouseEvent) => {
                      event.stopPropagation()
                      void run(action)
                    }
                  })
                ])
              ]
            )
          )
        }
      }

      paint()
      ctx.on('actions:change', () => paint())
      ctx.onDispose(() => {
        timers.forEach((timer) => clearTimeout(timer))
      })
    }
  }
}
