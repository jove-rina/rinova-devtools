# @rinova/devtools-vue

`@rinova/devtools` 的 Vue 3 适配器：插件、组合式函数与即插即用组件。

```bash
pnpm add @rinova/devtools @rinova/devtools-vue
```

```ts
import { createApp } from 'vue'
import { createVueDevtools } from '@rinova/devtools-vue'

app.use(createVueDevtools({
  appName: 'My App',
  enabled: import.meta.env.DEV,
  config: [{ key: 'apiBase', type: 'text', label: 'API 地址' }]
}))
```

```ts
import { useDevtools } from '@rinova/devtools-vue'

const { values, open, toggle } = useDevtools()
```

也可以直接用组件：

```vue
<RinovaDevtools :options="{ appName: 'My App' }" />
```

文档见仓库 `docs/05-框架接入.md`。

MIT
