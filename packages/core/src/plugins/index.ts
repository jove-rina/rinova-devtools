import type { DevtoolsPlugin } from '../types'
import type { Runtime } from '../core/runtime'
import { actionsPlugin } from './actions'
import { configPlugin } from './config'
import { consolePlugin } from './console'
import { networkPlugin } from './network'
import { settingsPlugin } from './settings'
import { storagePlugin } from './storage'

export const BUILTIN_PLUGIN_IDS = ['config', 'network', 'storage', 'console', 'actions', 'settings'] as const

/** 内置面板按侧栏顺序创建；第三方插件用 order 插空 */
export function createBuiltinPlugins(rt: Runtime): DevtoolsPlugin[] {
  return [
    configPlugin(rt),
    networkPlugin(rt),
    storagePlugin(rt),
    consolePlugin(rt),
    actionsPlugin(rt),
    settingsPlugin(rt)
  ]
}
