import type { NetworkEntry } from '../types'
import type { Runtime } from '../core/runtime'
import { toCurl } from '../utils/curl'
import { formatBytes, formatClock, formatDuration, isProbablyJSON, prettyJSON } from '../utils/format'
import { button, clear, empty, h, icon } from '../ui/dom'

type Filter = 'all' | 'fetch' | 'xhr' | 'error'

function statusText(entry: NetworkEntry): string {
  if (entry.pending) return '···'
  if (entry.error) return 'ERR'
  return String(entry.status || '—')
}

function statusTone(entry: NetworkEntry): 'ok' | 'error' | 'neutral' {
  if (entry.pending) return 'neutral'
  if (entry.error || !entry.ok) return 'error'
  return 'ok'
}

export function networkPlugin(rt: Runtime): import('../types').DevtoolsPlugin {
  return {
    id: 'network',
    title: '网络',
    icon: 'activity',
    order: 20,
    subtitle: () => {
      const entries = rt.network.entries()
      const failed = entries.filter((entry) => !entry.pending && (entry.error || !entry.ok)).length
      return `${entries.length} 条记录${failed ? ` · ${failed} 个异常` : ''} · 点击查看详情`
    },
    badge: () => {
      const failed = rt.network.entries().filter((entry) => !entry.pending && (entry.error || !entry.ok)).length
      return failed || null
    },
    render(container, ctx) {
      let filter: Filter = 'all'
      let query = ''
      let selectedId: string | null = null

      const searchInput = h('input', {
        class: 'rdt-input',
        type: 'search',
        placeholder: '按 URL / 方法 / 状态过滤',
        'aria-label': '过滤请求'
      })
      searchInput.addEventListener('input', () => {
        query = searchInput.value.trim().toLowerCase()
        renderList()
      })

      const countEl = h('span', { class: 'rdt-count' })
      const listEl = h('div', { class: 'rdt-netlist rdt-scroll' })
      const filterbar = h('div', { class: 'rdt-filterbar' })

      const captureSwitch = h('button', {
        class: 'rdt-switch',
        type: 'button',
        role: 'switch',
        'aria-checked': String(ctx.network.capturing()),
        'aria-label': '网络采集',
        title: '暂停 / 恢复采集',
        onClick: () => {
          const next = captureSwitch.getAttribute('aria-checked') !== 'true'
          ctx.network.setCapturing(next)
          captureSwitch.setAttribute('aria-checked', String(next))
          renderList()
        }
      })

      const toolbar = h('div', { class: 'rdt-toolbar' }, [
        h('div', { class: 'rdt-search' }, [icon('search', 13, 2), searchInput]),
        countEl,
        h('div', { class: 'rdt-toolbar__spacer' }),
        h('label', { class: 'rdt-selectall' }, [h('span', { text: '采集' }), captureSwitch]),
        button('', {
          icon: 'trash',
          title: '清空记录',
          tone: 'ghost',
          onClick: () => {
            ctx.network.clear()
            selectedId = null
            renderAll()
          }
        })
      ])

      const detailEl = h('div', { class: 'rdt-detail rdt-scroll' })

      container.append(
        h('div', { class: 'rdt-net' }, [toolbar, filterbar, listEl, detailEl])
      )

      const matches = (entry: NetworkEntry): boolean => {
        if (filter === 'error' && (entry.pending || (!entry.error && entry.ok))) return false
        if (filter === 'fetch' && entry.kind !== 'fetch') return false
        if (filter === 'xhr' && entry.kind !== 'xhr') return false
        if (!query) return true
        return (
          entry.url.toLowerCase().includes(query) ||
          entry.method.toLowerCase().includes(query) ||
          statusText(entry).toLowerCase().includes(query)
        )
      }

      const renderFilterbar = () => {
        const entries = rt.network.entries()
        const items: Array<{ id: Filter; label: string; count: number }> = [
          { id: 'all', label: '全部', count: entries.length },
          {
            id: 'error',
            label: '异常',
            count: entries.filter((entry) => !entry.pending && (entry.error || !entry.ok)).length
          },
          { id: 'fetch', label: 'Fetch', count: entries.filter((entry) => entry.kind === 'fetch').length },
          { id: 'xhr', label: 'XHR', count: entries.filter((entry) => entry.kind === 'xhr').length }
        ]
        clear(filterbar)
        for (const item of items) {
          const chip = h(
            'button',
            {
              class: `rdt-chip${filter === item.id ? ' is-active' : ''}`,
              type: 'button',
              onClick: () => {
                filter = item.id
                renderList()
              }
            },
            [h('span', { text: item.label }), h('span', { class: 'rdt-count', text: String(item.count) })]
          )
          filterbar.appendChild(chip)
        }
      }

      const renderList = () => {
        const entries = rt.network.entries()
        const scrollTop = listEl.scrollTop
        clear(listEl)
        countEl.textContent = `${entries.filter(matches).length} / ${entries.length}`
        renderFilterbar()

        if (!entries.length) {
          listEl.appendChild(empty('还没有请求记录。触发一次接口调用后，这里会自动出现。', 'activity'))
          return
        }

        const filtered = entries.filter(matches)
        if (!filtered.length) {
          listEl.appendChild(empty('没有匹配当前条件的请求。', 'search'))
          return
        }

        for (const entry of filtered) {
          const row = h(
            'div',
            {
              class: `rdt-netrow${selectedId === entry.id ? ' is-active' : ''}`,
              role: 'button',
              tabindex: '0',
              onClick: () => openDetail(entry.id),
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') openDetail(entry.id)
              }
            },
            [
              h('span', { class: 'rdt-netrow__method', text: entry.method, dataset: { method: entry.method } }),
              h('span', {
                class: 'rdt-netrow__status',
                text: statusText(entry),
                dataset: {
                  error: String(!entry.pending && (!entry.ok || Boolean(entry.error))),
                  pending: String(entry.pending)
                }
              }),
              h('span', { class: 'rdt-netrow__url', title: entry.url }, pathLabel(entry.url)),
              h('span', {
                class: 'rdt-netrow__time',
                text: entry.pending ? '…' : formatDuration(entry.duration)
              })
            ]
          )
          listEl.appendChild(row)
        }
        listEl.scrollTop = scrollTop
      }

      const pathLabel = (url: string): HTMLElement => {
        let parsed: URL
        try {
          parsed = new URL(url, location.href)
        } catch {
          return h('span', { text: url })
        }
        const sameOrigin = parsed.origin === location.origin
        return h('span', {}, [
          sameOrigin ? null : h('em', { text: parsed.host }),
          h('span', { text: `${parsed.pathname}${parsed.search}` })
        ])
      }

      const copyBlock = (title: string, text: string) =>
        h('div', { class: 'rdt-detail__title' }, [
          h('span', { text: title }),
          button('', {
            icon: 'copy',
            tone: 'ghost',
            title: `复制${title}`,
            onClick: () => {
              void ctx.copy(text)
            }
          })
        ])

      const kv = (data: Record<string, string>) =>
        h(
          'div',
          { class: 'rdt-kv' },
          Object.entries(data).map(([key, value]) => [
            h('span', { class: 'rdt-kv__key', text: key }),
            h('span', { class: 'rdt-kv__value', text: value })
          ])
        )

      const openDetail = (entryId: string) => {
        selectedId = entryId
        renderList()
        renderDetail()
      }

      const renderDetail = () => {
        const entry = rt.network.entries().find((item) => item.id === selectedId)
        clear(detailEl)
        if (!entry) {
          detailEl.style.display = 'none'
          listEl.style.display = ''
          return
        }
        listEl.style.display = 'none'
        detailEl.style.display = ''

        const head = h('div', { class: 'rdt-detail__head' }, [
          button('', {
            icon: 'arrow-left',
            tone: 'ghost',
            title: '返回列表',
            onClick: () => {
              selectedId = null
              detailEl.style.display = 'none'
              listEl.style.display = ''
              renderList()
            }
          }),
          h('span', { class: 'rdt-tag', text: entry.method }),
          h('span', { class: 'rdt-detail__url', text: entry.url })
        ])

        const actions = h('div', { class: 'rdt-detail__head' }, [
          button('复制 cURL', {
            icon: 'copy',
            onClick: () => {
              void ctx.copy(toCurl(entry))
            }
          }),
          button('重放', {
            icon: 'refresh-cw',
            onClick: async () => {
              const replayed = await ctx.network.replay(entry.id)
              if (replayed) {
                selectedId = replayed.id
                renderAll()
                ctx.toast('已重放请求', 'success')
              } else {
                ctx.toast('重放失败', 'error')
              }
            }
          })
        ])

        const meta = h('div', { class: 'rdt-kv' }, [
          h('span', { class: 'rdt-kv__key', text: '状态' }),
          h('span', { class: 'rdt-kv__value' }, [
            h('span', {
              class: `rdt-tag rdt-tag--${statusTone(entry)}`,
              text: entry.pending ? 'pending' : `${entry.status} ${entry.statusText}`.trim()
            })
          ]),
          h('span', { class: 'rdt-kv__key', text: '耗时' }),
          h('span', { class: 'rdt-kv__value', text: entry.pending ? '进行中' : formatDuration(entry.duration) }),
          h('span', { class: 'rdt-kv__key', text: '大小' }),
          h('span', { class: 'rdt-kv__value', text: entry.responseSize ? formatBytes(entry.responseSize) : '—' }),
          h('span', { class: 'rdt-kv__key', text: '类型' }),
          h('span', { class: 'rdt-kv__value', text: `${entry.kind} · ${formatClock(entry.startAt)}` })
        ])

        detailEl.append(head, actions, meta)

        if (entry.error) {
          detailEl.appendChild(
            h('div', { class: 'rdt-detail__section' }, [
              h('div', { class: 'rdt-detail__title', text: '错误' }),
              h('pre', { class: 'rdt-code', text: entry.error })
            ])
          )
        }

        const reqSection = h('div', { class: 'rdt-detail__section' }, [
          h('div', { class: 'rdt-detail__title', text: '请求头' }),
          Object.keys(entry.requestHeaders).length
            ? kv(entry.requestHeaders)
            : h('div', { class: 'rdt-faint rdt-mono', text: '无' })
        ])
        if (entry.requestBody) {
          const pretty = isProbablyJSON(entry.requestBody)
          reqSection.appendChild(copyBlock('请求体', entry.requestBody))
          reqSection.appendChild(
            h('pre', { class: 'rdt-code', text: pretty ? prettyJSON(entry.requestBody) : entry.requestBody })
          )
        }
        detailEl.appendChild(reqSection)

        const resSection = h('div', { class: 'rdt-detail__section' }, [
          h('div', { class: 'rdt-detail__title', text: '响应头' }),
          Object.keys(entry.responseHeaders).length
            ? kv(entry.responseHeaders)
            : h('div', { class: 'rdt-faint rdt-mono', text: '无' })
        ])
        if (entry.pending) {
          resSection.appendChild(
            h('div', { class: 'rdt-detail__section rdt-muted rdt-mono' }, [
              h('span', { class: 'rdt-spinner' }),
              h('span', { text: ' 请求进行中…', style: { marginLeft: '7px' } })
            ])
          )
        } else if (entry.responseBody) {
          resSection.appendChild(copyBlock('响应体', entry.responseBody))
          resSection.appendChild(
            h('pre', {
              class: 'rdt-code',
              text: isProbablyJSON(entry.responseBody) ? prettyJSON(entry.responseBody) : entry.responseBody
            })
          )
        }
        detailEl.appendChild(resSection)
      }

      const renderAll = () => {
        renderList()
        renderDetail()
      }

      renderAll()

      const offChange = rt.network.subscribeChange(() => renderAll())
      ctx.onDispose(offChange)
    }
  }
}
