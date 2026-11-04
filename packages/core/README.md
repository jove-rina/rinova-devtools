# @rinova/devtools

框架无关的前端调试面板内核。提供悬浮球、停靠面板、配置、网络、存储、日志、快捷操作与插件系统。

```bash
pnpm add @rinova/devtools
```

```ts
import { createDevtools } from '@rinova/devtools'

createDevtools({
  appName: 'My App',
  enabled: import.meta.env.DEV,
  config: [{ key: 'apiBase', type: 'text', label: 'API 地址' }]
}).mount()
```

- 只依赖 DOM 与 Shadow DOM，可接入 Vue / React / Svelte / 原生页面
- 无 UI 组件库、无遥测、无远程资源
- 网络面板支持复制 cURL、重放请求；配置 schema 驱动、即时生效

完整文档见仓库 `docs/`：架构、配置、插件开发、框架接入、内置面板、路线图。

MIT
