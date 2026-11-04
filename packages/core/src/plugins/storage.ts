import type { Runtime } from '../core/runtime'
import { formatBytes } from '../utils/format'
import { button, clear, empty, h, icon } from '../ui/dom'

type StoreKind = 'local' | 'session' | 'cookie'

interface StoreItem {
  key: string
  value: string
}

function readStore(kind: StoreKind): StoreItem[] {
  try {
    if (kind === 'cookie') {
      return document.cookie
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const index = part.indexOf('=')
          const key = index < 0 ? part : part.slice(0, index)
          return { key: decodeURIComponent(key), value: index < 0 ? '' : part.slice(index + 1) }
        })
    }
    const store = kind === 'local' ? window.localStorage : window.sessionStorage
    const items: StoreItem[] = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key === null) continue
      items.push({ key, value: store.getItem(key) ?? '' })
    }
    return items.sort((a, b) => a.key.localeCompare(b.key))
  } catch {
    return []
  }
}

function byteSize(value: string): number {
  return new Blob([value]).size
}

export function storagePlugin(_rt: Runtime): import('../types').DevtoolsPlugin {
  return {
    id: 'storage',
    title: '存储',
    icon: 'database',
    order: 30,
    subtitle: 'localStorage / sessionStorage / Cookie，可直接编辑',
    render(container, ctx) {
      let kind: StoreKind = 'local'
      let query = ''
      let editing: StoreItem | null = null
      let creating = false

      const tabsEl = h('div', { class: 'rdt-tabs' })
      const searchInput = h('input', {
        class: 'rdt-input',
        type: 'search',
        placeholder: '按 key 过滤',
        'aria-label': '过滤存储项'
      })
      const listEl = h('div', { class: 'rdt-scroll rdt-list' })
      const editorEl = h('div', { class: 'rdt-store-edit rdt-scroll' })
      const bodyEl = h('div', { style: { flex: '1', minHeight: '0', position: 'relative' } })

      const tabs: Array<{ id: StoreKind; label: string }> = [
        { id: 'local', label: 'Local' },
        { id: 'session', label: 'Session' },
        { id: 'cookie', label: 'Cookie' }
      ]

      searchInput.addEventListener('input', () => {
        query = searchInput.value.trim().toLowerCase()
        renderList()
      })

      const addButton = button('新增', {
        icon: 'plus',
        onClick: () => {
          creating = true
          editing = { key: '', value: '' }
          renderEditor()
        }
      })

      const toolbar = h('div', { class: 'rdt-toolbar' }, [
        h('div', { class: 'rdt-search' }, [icon('search', 13, 2), searchInput]),
        h('div', { class: 'rdt-toolbar__spacer' }),
        addButton,
        button('', {
          icon: 'refresh-cw',
          tone: 'ghost',
          title: '刷新',
          onClick: () => renderAll(),
        })
      ])

      container.append(
        h('div', { class: 'rdt-net' }, [
          tabsEl,
          toolbar,
          bodyEl
        ])
      )
      listEl.style.height = '100%'
      editorEl.style.height = '100%'
      editorEl.style.display = 'none'
      bodyEl.append(listEl, editorEl)

      const renderTabs = () => {
        clear(tabsEl)
        for (const tab of tabs) {
          const count = readStore(tab.id).length
          tabsEl.appendChild(
            h(
              'button',
              {
                class: `rdt-tab${kind === tab.id ? ' is-active' : ''}`,
                type: 'button',
                onClick: () => {
                  kind = tab.id
                  editing = null
                  creating = false
                  addButton.style.display = tab.id === 'cookie' ? 'none' : ''
                  renderAll()
                }
              },
              [h('span', { text: tab.label }), h('span', { class: 'rdt-tab__count', text: String(count) })]
            )
          )
        }
      }

      const renderList = () => {
        const items = readStore(kind).filter((item) =>
          query ? item.key.toLowerCase().includes(query) : true
        )
        clear(listEl)
        if (!items.length) {
          listEl.appendChild(
            empty(
              query
                ? '没有匹配的 key。'
                : kind === 'cookie'
                  ? '当前页面没有可读取的 Cookie（HttpOnly 不可见）。'
                  : '这个存储空间是空的。',
              'database'
            )
          )
          return
        }
        for (const item of items) {
          listEl.appendChild(
            h(
              'div',
              {
                class: 'rdt-store-row',
                role: 'button',
                tabindex: '0',
                onClick: () => {
                  editing = item
                  creating = false
                  renderEditor()
                }
              },
              [
                h('span', { class: 'rdt-store-row__key', text: item.key, title: item.key }),
                h('span', { class: 'rdt-store-row__value', text: item.value || '—', title: item.value }),
                h('span', { class: 'rdt-store-row__size', text: formatBytes(byteSize(item.value)) })
              ]
            )
          )
        }
      }

      const renderEditor = () => {
        if (!editing) {
          editorEl.style.display = 'none'
          listEl.style.display = ''
          return
        }
        listEl.style.display = 'none'
        editorEl.style.display = ''
        clear(editorEl)

        const keyInput = h('input', {
          class: 'rdt-input rdt-mono',
          type: 'text',
          placeholder: 'key',
          value: editing.key,
          readonly: !creating
        })
        const valueArea = h('textarea', { class: 'rdt-textarea rdt-mono', placeholder: 'value' })
        valueArea.value = editing.value

        const actions = h('div', { class: 'rdt-store-edit__actions' })

        actions.appendChild(
          button('返回', {
            icon: 'arrow-left',
            tone: 'ghost',
            onClick: () => {
              editing = null
              creating = false
              renderEditor()
              renderList()
            }
          })
        )
        actions.appendChild(h('div', { class: 'rdt-toolbar__spacer' }))

        if (kind !== 'cookie') {
          actions.appendChild(
            button('删除', {
              icon: 'trash',
              tone: 'danger',
              onClick: () => {
                if (!editing) return
                const store = kind === 'local' ? window.localStorage : window.sessionStorage
                try {
                  store.removeItem(editing.key)
                  ctx.toast(`已删除 ${editing.key}`, 'success')
                } catch {
                  ctx.toast('删除失败', 'error')
                }
                editing = null
                creating = false
                renderAll()
              }
            })
          )
          actions.appendChild(
            button('保存', {
              icon: 'check',
              tone: 'primary',
              onClick: () => {
                const key = keyInput.value.trim()
                if (!key) {
                  ctx.toast('key 不能为空', 'error')
                  return
                }
                const store = kind === 'local' ? window.localStorage : window.sessionStorage
                try {
                  store.setItem(key, valueArea.value)
                  ctx.toast('已保存', 'success')
                } catch {
                  ctx.toast('写入失败（可能超出配额）', 'error')
                  return
                }
                editing = null
                creating = false
                renderAll()
              }
            })
          )
        } else {
          actions.appendChild(
            button('删除 Cookie', {
              icon: 'trash',
              tone: 'danger',
              onClick: () => {
                if (!editing) return
                const name = editing.key
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${location.pathname}`
                ctx.toast(`已删除 Cookie ${name}`, 'success')
                editing = null
                renderAll()
              }
            })
          )
        }

        editorEl.append(
          h('div', { class: 'rdt-store-edit__head' }, [
            h('span', { class: 'rdt-store-edit__key', text: kind === 'cookie' ? 'Cookie' : kind === 'local' ? 'localStorage' : 'sessionStorage' })
          ]),
          h('div', { class: 'rdt-field' }, [h('span', { class: 'rdt-field__label', text: 'Key' }), keyInput]),
          h('div', { class: 'rdt-field' }, [h('span', { class: 'rdt-field__label', text: 'Value' }), valueArea]),
          actions
        )
      }

      const renderAll = () => {
        addButton.style.display = kind === 'cookie' ? 'none' : ''
        renderTabs()
        renderList()
        renderEditor()
      }

      renderAll()
      ctx.on('plugin:activate', ({ id }: { id: string }) => {
        if (id !== 'storage') return
        // 其它面板/业务代码可能刚写过存储，切回时重新读一遍
        if (!editing) renderAll()
      })
    }
  }
}
