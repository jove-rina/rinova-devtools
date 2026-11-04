import type { Runtime } from '../core/runtime'
import { button, h, segmented } from '../ui/dom'

export function settingsPlugin(rt: Runtime): import('../types').DevtoolsPlugin {
  return {
    id: 'settings',
    title: '设置',
    icon: 'settings',
    order: 90,
    subtitle: '外观、停靠与本地数据',
    render(container, ctx) {
      const body = h('div', { class: 'rdt-settings rdt-scroll' })
      container.appendChild(body)

      const row = (label: string, desc: string, control: Node) =>
        h('div', { class: 'rdt-setting' }, [
          h('div', { class: 'rdt-setting__text' }, [
            h('div', { class: 'rdt-setting__label', text: label }),
            h('div', { class: 'rdt-setting__desc', text: desc })
          ]),
          h('div', { class: 'rdt-setting__control' }, control)
        ])

      let resetTimer: ReturnType<typeof setTimeout> | undefined

      const render = () => {
        body.replaceChildren()

        const theme = rt.ui.getTheme()
        const dock = rt.ui.getDock()
        const width = rt.ui.getWidth()

        body.appendChild(
          row(
            '主题',
            '跟随系统时会实时响应系统外观变化',
            segmented(
              [
                { value: 'dark', label: '深色', icon: 'moon' },
                { value: 'light', label: '浅色', icon: 'sun' },
                { value: 'auto', label: '跟随系统' }
              ],
              theme,
              (value) => rt.ui.setTheme(value)
            )
          )
        )

        body.appendChild(
          row(
            '面板停靠',
            '停靠方向影响面板滑入位置与尺寸',
            segmented(
              [
                { value: 'right', label: '右侧' },
                { value: 'left', label: '左侧' },
                { value: 'bottom', label: '底部' }
              ],
              dock,
              (value) => rt.ui.setDock(value)
            )
          )
        )

        const widthValue = h('span', { class: 'rdt-tag', text: `${width}px` })
        const range = h('input', {
          class: 'rdt-range',
          type: 'range',
          min: String(rt.options.minWidth),
          max: String(rt.options.maxWidth),
          step: '20',
          value: String(width),
          'aria-label': '面板宽度'
        })
        range.addEventListener('input', () => {
          widthValue.textContent = `${range.value}px`
          rt.ui.setWidth(Number(range.value))
        })
        body.appendChild(
          row('面板宽度', '也可以直接拖拽面板边缘调整', h('div', { class: 'rdt-setting__range' }, [range, widthValue]))
        )

        body.appendChild(
          row(
            '悬浮球位置',
            '拖动悬浮球可移动，松手后自动吸附到最近的边缘',
            button('复位', {
              icon: 'rotate-ccw',
              onClick: () => {
                rt.ui.resetLauncher()
                ctx.toast('悬浮球已复位', 'success')
              }
            })
          )
        )

        const resetButton = button('清除本工具数据', {
          icon: 'trash',
          tone: 'danger',
          onClick: () => {
            if (resetButton.dataset.armed !== 'true') {
              resetButton.dataset.armed = 'true'
              resetButton.querySelector('.rdt-btn__label')!.textContent = '再次点击确认'
              resetTimer = setTimeout(() => {
                resetButton.dataset.armed = 'false'
                const label = resetButton.querySelector('.rdt-btn__label')
                if (label) label.textContent = '清除本工具数据'
              }, 3000)
              return
            }
            rt.ui.resetAll()
            ctx.toast('已清除本地数据并恢复默认', 'success')
          }
        })

        body.appendChild(
          row('本地数据', '清除配置值、界面偏好与插件存储；不影响业务自身的存储', resetButton)
        )

        body.appendChild(
          h('div', { class: 'rdt-about' }, [
            h('div', { text: `Rinova Devtools v${rt.options.version}` }),
            h('div', { text: '框架无关内核 · 任意技术栈通过 DOM 挂载' }),
            h('div', {
              text: rt.options.shortcut ? `快捷键：${rt.options.shortcut}` : '快捷键已关闭'
            }),
            h('div', { text: `存储命名空间：${rt.options.storagePrefix}` })
          ])
        )
      }

      render()
      ctx.on('ui:theme', () => render())
      ctx.on('ui:dock', () => render())
      ctx.on('ui:width', () => render())
      ctx.onDispose(() => {
        if (resetTimer) clearTimeout(resetTimer)
      })
    }
  }
}
