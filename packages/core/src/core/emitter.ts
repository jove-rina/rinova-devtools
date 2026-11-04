type Handler = (payload: never) => void

/** 极小事件总线：核心不依赖框架的响应式系统 */
export class Emitter {
  private map = new Map<string, Set<Handler>>()

  on<T>(event: string, handler: (payload: T) => void): () => void {
    let set = this.map.get(event)
    if (!set) {
      set = new Set()
      this.map.set(event, set)
    }
    set.add(handler as Handler)
    return () => this.off(event, handler as Handler)
  }

  off(event: string, handler: Handler): void {
    this.map.get(event)?.delete(handler)
  }

  emit<T>(event: string, payload: T): void {
    const set = this.map.get(event)
    if (!set) return
    for (const handler of [...set]) {
      try {
        ;(handler as (p: T) => void)(payload)
      } catch (error) {
        // 监听方异常不能影响工具本身
        console.error('[rinova-devtools] listener error', error)
      }
    }
  }

  clear(): void {
    this.map.clear()
  }
}
