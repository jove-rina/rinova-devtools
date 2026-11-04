/** jsdom 补齐浏览器 API，仅测试环境使用 */
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    })
  })
}

const capturedElements = new WeakSet<Element>()

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function (this: Element) {
    capturedElements.add(this)
  }
  Element.prototype.releasePointerCapture = function (this: Element) {
    capturedElements.delete(this)
  }
  Element.prototype.hasPointerCapture = function (this: Element) {
    return capturedElements.has(this)
  }
}

if (!globalThis.PointerEvent) {
  // @ts-expect-error 测试环境用 MouseEvent 兼容
  globalThis.PointerEvent = MouseEvent
}
