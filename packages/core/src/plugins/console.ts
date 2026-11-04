import type { LogLevel } from '../types'
import type { Runtime } from '../core/runtime'
import { formatClock } from '../utils/format'
import { button, clear, empty, h, icon } from '../ui/dom'

type LevelFilter = 'all' | LogLevel

export function consolePlugin(rt: Runtime): import('../types').DevtoolsPlugin {
  return {
    id: 'console',
    title: '日志',
    icon: 'terminal',
    order: 40,
    subtitle: 'console 与未捕获异常 · 双击一行可复制',
    badge: () => {
      const errors = rt.logs.entries().filter((entry) => entry.level === 'error').length
      return errors || null
    },
    render(container, ctx) {
      let level: LevelFilter = 'all'
      let query = ''

      const searchInput = h('input', {
        class: 'rdt-input',
        type: 'search',
        placeholder: '搜索日志内容',
        'aria-label': '搜索日志'
      })
      searchInput.addEventListener('input', () => {
        query = searchInput.value.trim().toLowerCase()
        renderList()
      })

      const filterbar = h('div', { class: 'rdt-filterbar' })
      const listEl = h('div', { class: 'rdt-loglist rdt-scroll' })
      const countEl = h('span', { class: 'rdt-count' })

      const toolbar = h('div', { class: 'rdt-toolbar' }, [
        h('div', { class: 'rdt-search' }, [icon('search', 13, 2), searchInput]),
        countEl,
        h('div', { class: 'rdt-toolbar__spacer' }),
        button('复制全部', {
          icon: 'copy',
          tone: 'ghost',
          title: '复制当前筛选结果',
          onClick: () => {
            const text = filtered()
              .slice()
              .reverse()
              .map((entry) => `[${formatClock(entry.at)}] ${entry.level.toUpperCase()} ${entry.args}`)
              .join('\n')
            void ctx.copy(text || '(空)')
          }
        }),
        button('', {
          icon: 'trash',
          tone: 'ghost',
          title: '清空日志',
          onClick: () => {
            rt.logs.clear()
            renderAll()
          }
        })
      ])

      container.append(h('div', { class: 'rdt-logs' }, [toolbar, filterbar, listEl]))

      const filtered = () => {
        return rt.logs.entries().filter((entry) => {
          if (level === 'info' && entry.level !== 'info' && entry.level !== 'log') return false
          if (level !== 'all' && level !== 'info' && entry.level !== level) return false
          if (!query) return true
          return entry.args.toLowerCase().includes(query) || entry.level.includes(query)
        })
      }

      const renderFilterbar = () => {
        const entries = rt.logs.entries()
        const items: Array<{ id: LevelFilter; label: string; count: number }> = [
          { id: 'all', label: '全部', count: entries.length },
          { id: 'info', label: '信息', count: entries.filter((entry) => entry.level === 'info' || entry.level === 'log').length },
          { id: 'warn', label: '警告', count: entries.filter((entry) => entry.level === 'warn').length },
          { id: 'error', label: '错误', count: entries.filter((entry) => entry.level === 'error').length }
        ]
        clear(filterbar)
        for (const item of items) {
          filterbar.appendChild(
            h(
              'button',
              {
                class: `rdt-chip${level === item.id ? ' is-active' : ''}`,
                type: 'button',
                onClick: () => {
                  level = item.id
                  renderList()
                }
              },
              [h('span', { text: item.label }), h('span', { class: 'rdt-count', text: String(item.count) })]
            )
          )
        }
      }

      const renderList = () => {
        const entries = filtered()
        clear(listEl)
        countEl.textContent = `${entries.length} / ${rt.logs.entries().length}`
        renderFilterbar()

        if (!entries.length) {
          listEl.appendChild(
            empty(
              rt.logs.entries().length ? '没有匹配的日志。' : '还没有日志。console.log 输出会实时出现在这里。',
              'terminal'
            )
          )
          return
        }

        for (const entry of entries) {
          const row = h('div', {
            class: 'rdt-logrow',
            dataset: { level: entry.level === 'log' ? 'info' : entry.level },
            title: '双击复制这条日志',
            onDblclick: () => {
              void ctx.copy(`[${formatClock(entry.at)}] ${entry.level.toUpperCase()} ${entry.args}`)
            }
          }, [
            h('span', { class: 'rdt-logrow__time', text: formatClock(entry.at) }),
            h('span', { class: 'rdt-logrow__level', text: entry.level }),
            h('span', { class: 'rdt-logrow__msg' }, [
              h('span', { text: entry.args }),
              entry.count > 1 ? h('span', { class: 'rdt-logrow__count', text: String(entry.count) }) : null
            ])
          ])
          listEl.appendChild(row)
        }
      }

      const renderAll = () => {
        renderList()
      }

      renderAll()
      ctx.onDispose(rt.logs.subscribeChange(() => renderAll()))
    }
  }
}
