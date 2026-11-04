import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConsoleCapture } from '../src/core/console-capture'

let capture: ConsoleCapture | null = null

afterEach(() => {
  capture?.stop()
  capture = null
  vi.restoreAllMocks()
})

describe('ConsoleCapture', () => {
  it('按级别捕获，最新在前', () => {
    capture = new ConsoleCapture()
    capture.start()
    console.log('one')
    console.info('two')
    console.warn('three')
    console.error('four')
    console.debug('five')
    const entries = capture.entries()
    expect(entries.map((entry) => entry.level)).toEqual(['debug', 'error', 'warn', 'info', 'log'])
    expect(entries[0].args).toBe('five')
  })

  it('同级别同内容在窗口期内合并计数', () => {
    capture = new ConsoleCapture()
    capture.start()
    console.warn('dup')
    console.warn('dup')
    console.warn('dup')
    expect(capture.entries()).toHaveLength(1)
    expect(capture.entries()[0].count).toBe(3)
  })

  it('不同级别相同内容不合并', () => {
    capture = new ConsoleCapture()
    capture.start()
    console.warn('same')
    console.error('same')
    expect(capture.entries()).toHaveLength(2)
  })

  it('环形缓冲不超过上限，clear 清空', () => {
    capture = new ConsoleCapture(2)
    capture.start()
    console.log('1')
    console.log('2')
    console.log('3')
    expect(capture.entries()).toHaveLength(2)
    capture.clear()
    expect(capture.entries()).toHaveLength(0)
  })

  it('stop 还原原始 console', () => {
    const original = console.log
    capture = new ConsoleCapture()
    capture.start()
    expect(console.log).not.toBe(original)
    capture.stop()
    expect(console.log).toBe(original)
    capture = null
  })

  it('捕获未处理异常与 Promise rejection', () => {
    capture = new ConsoleCapture()
    capture.start()
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', filename: 'app.js', lineno: 12 }))
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown }
    rejection.reason = new Error('rejected')
    window.dispatchEvent(rejection)
    const entries = capture.entries()
    expect(entries.some((entry) => entry.args.includes('boom'))).toBe(true)
    expect(entries.some((entry) => entry.args.includes('rejected'))).toBe(true)
  })

  it('Error / DOM 节点序列化可读', () => {
    capture = new ConsoleCapture()
    capture.start()
    console.error(new Error('bad thing'))
    console.log(document.createElement('div'))
    expect(capture.entries()[1].args).toContain('Error: bad thing')
    expect(capture.entries()[0].args).toContain('<div>')
  })

  it('subscribeChange 在新增与清空时触发', () => {
    capture = new ConsoleCapture()
    const listener = vi.fn()
    capture.subscribeChange(listener)
    capture.start()
    console.log('x')
    capture.clear()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
