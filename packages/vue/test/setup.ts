/* 与 core 测试环境保持一致的浏览器 API 垫片 */
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    })
  })
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () {}
  Element.prototype.releasePointerCapture = function () {}
  Element.prototype.hasPointerCapture = function () {
    return false
  }
}
