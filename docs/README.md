# Rinova Devtools 文档

框架无关的前端调试面板，包名 `@rinova/devtools`（内核）与 `@rinova/devtools-vue`（Vue 3 适配器）。

## 阅读顺序

| 文档 | 内容 |
| --- | --- |
| [01 产品定义](./01-产品定义.md) | 定位、目标用户、能力清单、与参考实现的关系、不做什么 |
| [02 架构设计](./02-架构设计.md) | 分层、目录、挂载流程、Shadow DOM、事件模型、状态归属 |
| [03 配置与状态](./03-配置与状态.md) | 字段 schema、取值优先级、持久化键、运行时开关 |
| [04 插件开发](./04-插件开发.md) | 插件 API、上下文、Vue / React 子应用写法、事件契约 |
| [05 框架接入](./05-框架接入.md) | 原生、Vue、React、Svelte、SSR、生产隔离、自动化选择器 |
| [06 内置面板](./06-内置面板.md) | 六个内置面板的行为、限制与视觉规范 |
| [07 决策与路线图](./07-决策与路线图.md) | ADR、已知问题、v0.2 / v0.3 计划 |
| [08 测试计划与用例](./08-测试计划与用例.md) | 122 条自动化用例、15 组浏览器实机步骤、回归门槛 |

## 30 秒上手

```bash
pnpm install
pnpm dev          # 打开 http://localhost:5178 观看演示
```

```ts
import { createDevtools } from '@rinova/devtools'

createDevtools({
  appName: 'My App',
  enabled: import.meta.env.DEV,
  config: [
    { key: 'apiBase', type: 'text', label: 'API 地址' },
    { key: 'debugAb', type: 'switch', label: 'AB 调试' }
  ]
}).mount()
```

默认快捷键 `alt+shift+d`，也可以点右下角悬浮球。

## 仓库结构

```
packages/core     @rinova/devtools      内核（无框架依赖）
packages/vue      @rinova/devtools-vue  Vue 3 适配器
examples/playground                     Vue 3 演示 + 纯 DOM 示例（/vanilla.html）
docs                                    本目录
```

## 验证命令

```bash
pnpm typecheck    # 三个 workspace 全量类型检查
pnpm test         # core 117 + vue 5，共 122 条
pnpm test:coverage
pnpm test:isolation
pnpm build        # core → vue 依次构建
pnpm verify       # typecheck + test + build
```

完整用例与浏览器回归步骤见 [08-测试计划与用例](./08-测试计划与用例.md)。

## 工作日志

按天记录在 [logs/](./logs/README.md)，文件名 `YYYY-MM-DD.md`。当天： [2026-11-05](./logs/2026-11-05.md)。
