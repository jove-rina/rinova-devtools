import { describe, expect, it } from 'vitest'
import { shellQuote, toCurl } from '../src/utils/curl'
import { formatBytes, formatDuration, isProbablyJSON, prettyJSON, previewValue } from '../src/utils/format'
import { matchHotkey, parseHotkey } from '../src/utils/hotkey'

describe('toCurl', () => {
  it('生成带 header 与 JSON body 的 cURL', () => {
    const curl = toCurl({
      method: 'POST',
      url: 'https://api.example.com/quotes?id=42',
      requestHeaders: { 'content-type': 'application/json', authorization: 'Bearer abc' },
      requestBody: '{"amount":100}'
    })
    expect(curl).toContain("curl 'https://api.example.com/quotes?id=42'")
    expect(curl).toContain('-X POST')
    expect(curl).toContain("-H 'content-type: application/json'")
    expect(curl).toContain("-H 'authorization: Bearer abc'")
    expect(curl).toContain("--data-raw '{\"amount\":100}'")
  })

  it('GET 不输出 -X，且不追加空 body', () => {
    const curl = toCurl({ method: 'GET', url: 'https://a.dev/x', requestHeaders: {} })
    expect(curl).not.toContain('-X')
    expect(curl).not.toContain('--data')
  })

  it('表单 body 使用 --data', () => {
    const curl = toCurl({
      method: 'POST',
      url: 'https://a.dev/x',
      requestHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' },
      requestBody: 'a=1&b=2'
    })
    expect(curl).toContain("--data 'a=1&b=2'")
  })

  it('安全转义单引号', () => {
    expect(shellQuote("a'b")).toBe("'a'\\''b'")
    expect(shellQuote('')).toBe("''")
    expect(shellQuote('plain-value_1')).toBe('plain-value_1')
  })
})

describe('format utils', () => {
  it('格式化字节', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024 * 3.2)).toBe('3.2 MB')
  })

  it('格式化耗时', () => {
    expect(formatDuration(0.4)).toBe('<1 ms')
    expect(formatDuration(123.4)).toBe('123 ms')
    expect(formatDuration(1500)).toBe('1.50 s')
  })

  it('JSON 预览处理循环引用', () => {
    const value: Record<string, unknown> = { a: 1 }
    value.self = value
    expect(previewValue(value)).toContain('[Circular]')
  })

  it('识别并美化 JSON', () => {
    expect(isProbablyJSON('{"a":1}')).toBe(true)
    expect(isProbablyJSON('hello')).toBe(false)
    expect(prettyJSON('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(prettyJSON('not json')).toBe('not json')
  })
})

describe('hotkey', () => {
  const event = (init: Partial<KeyboardEvent>) => init as KeyboardEvent

  it('解析组合键', () => {
    expect(parseHotkey('alt+shift+d')).toEqual({
      key: 'd',
      alt: true,
      ctrl: false,
      meta: false,
      shift: true
    })
    expect(parseHotkey('Meta+Shift+Space')?.key).toBe('space')
  })

  it('匹配修饰键完整一致', () => {
    const hotkey = parseHotkey('alt+shift+d')!
    expect(matchHotkey(event({ key: 'D', altKey: true, shiftKey: true }), hotkey)).toBe(true)
    expect(matchHotkey(event({ key: 'D', altKey: true, shiftKey: false }), hotkey)).toBe(false)
    expect(matchHotkey(event({ key: 'D', altKey: true, shiftKey: true, metaKey: true }), hotkey)).toBe(false)
  })

  it('非法输入返回 null', () => {
    expect(parseHotkey('')).toBeNull()
    expect(parseHotkey('shift+alt')).toBeNull()
  })
})
