<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Activity,
  ArrowUpRight,
  Bell,
  Bug,
  ChevronDown,
  Copy,
  Database,
  FileText,
  LayoutDashboard,
  Package,
  Plus,
  Search,
  Settings2,
  Terminal,
  Users,
  Zap
} from '@lucide/vue'
import { useDevtools } from '@rinova/devtools-vue'

const { values, toggle, open } = useDevtools()

interface QuoteRow {
  id: string
  customer: string
  amount: number
  status: 'draft' | 'quoted' | 'won' | 'lost'
  owner: string
  updated: string
}

const quotes = ref<QuoteRow[]>([
  { id: 'PM-2411-042', customer: '远洋建设', amount: 386000, status: 'draft', owner: '李婷', updated: '12 分钟前' },
  { id: 'PM-2411-041', customer: '恒基物流', amount: 128400, status: 'quoted', owner: '王锐', updated: '1 小时前' },
  { id: 'PM-2411-038', customer: '南岸置地', amount: 642000, status: 'won', owner: '陈默', updated: '昨天 18:20' },
  { id: 'PM-2411-036', customer: '同益钢构', amount: 130000, status: 'lost', owner: '周敏', updated: '11 月 2 日' }
])

const summary = ref({ quotes: 42, amount: 1286400, pending: 6, margin: 18.6 })
const lastResult = ref('等待操作')
const busy = ref('')
const activeTab = ref('全部')

interface LogLine {
  time: string
  text: string
  tone: 'default' | 'ok' | 'error'
}

const logs = ref<LogLine[]>([{ time: '—', text: '调试会话已就绪，试试下面的按钮', tone: 'default' }])

const nav = [
  { label: '概览', icon: LayoutDashboard },
  { label: '报价单', icon: FileText, active: true },
  { label: '客户', icon: Users },
  { label: '产品', icon: Package }
]

const visibleQuotes = computed(() => {
  if (activeTab.value === '全部') return quotes.value
  const map: Record<string, QuoteRow['status']> = { 草稿: 'draft', 已报价: 'quoted', 已成交: 'won' }
  return quotes.value.filter((row) => row.status === map[activeTab.value])
})

const statusMeta: Record<QuoteRow['status'], { label: string; tone: string }> = {
  draft: { label: '草稿', tone: 'neutral' },
  quoted: { label: '已报价', tone: 'info' },
  won: { label: '已成交', tone: 'ok' },
  lost: { label: '已丢单', tone: 'error' }
}

const money = (value: number) => `¥${value.toLocaleString('zh-CN')}`

function pushLog(text: string, tone: LogLine['tone'] = 'default') {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  logs.value = [{ time, text, tone }, ...logs.value].slice(0, 6)
}

async function request(label: string, input: string, init?: RequestInit) {
  busy.value = input
  pushLog(`→ ${init?.method ?? 'GET'} ${input}`)
  console.info(`[demo] request ${label}`, input)
  try {
    const response = await fetch(input, init)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error((data as { message?: string }).message ?? `HTTP ${response.status}`)
    if (input === '/api/summary') summary.value = data as typeof summary.value
    lastResult.value = `${label} · ${response.status} · ${JSON.stringify(data).slice(0, 68)}`
    pushLog(`← ${response.status} ${label}`, 'ok')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    lastResult.value = `${label} · 失败 · ${message}`
    pushLog(`✕ ${message}`, 'error')
    console.error(`[demo] ${label} failed`, error)
  } finally {
    busy.value = ''
  }
}

const loadSummary = () => request('读取汇总', '/api/summary')
const slowRequest = () => request('慢请求', '/api/slow')
const failRequest = () => request('模拟 500', '/api/error')
const createQuote = () =>
  request('提交报价', '/api/quotes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customer: '新客户 · 演示', amount: 88000 })
  })

function writeStorage() {
  const value = `draft-${Date.now()}`
  localStorage.setItem('pm-demo-draft', value)
  localStorage.setItem('pm-demo-filter', JSON.stringify({ status: 'draft', owner: '李婷' }))
  pushLog(`已写入 pm-demo-draft`, 'ok')
  lastResult.value = `localStorage 写入完成 · ${value.slice(0, 22)}`
  console.info('[demo] storage written', value)
}

function emitLogs() {
  console.log('[demo] 普通日志：报价单已加载', quotes.value.length, '条')
  console.warn('[demo] 警告日志：毛利率低于 12%')
  lastResult.value = '已向控制台输出 log / warn'
  pushLog('已输出 log / warn', 'ok')
}

onMounted(() => {
  console.log('[demo] PoleMoment 报价工作台已启动')
  console.info('[demo] 快捷键 alt+shift+d 打开 Rinova Devtools')
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand__mark">P</span>
        <span class="brand__text">
          <strong>PoleMoment</strong>
          <em>报价工作台</em>
        </span>
      </div>

      <nav class="nav">
        <p class="nav__title">工作台</p>
        <a
          v-for="item in nav"
          :key="item.label"
          class="nav__item"
          :class="{ 'is-active': item.active }"
          href="#"
          @click.prevent
        >
          <component :is="item.icon" :size="16" :stroke-width="1.8" />
          <span>{{ item.label }}</span>
          <span v-if="item.label === '报价单'" class="nav__count">42</span>
        </a>
        <p class="nav__title">系统</p>
        <a class="nav__item" href="#" @click.prevent>
          <Settings2 :size="16" :stroke-width="1.8" />
          <span>设置</span>
        </a>
      </nav>

      <div class="sidebar__footer">
        <span class="avatar">李</span>
        <span class="sidebar__user">
          <strong>李婷</strong>
          <em>超级管理员</em>
        </span>
        <ChevronDown :size="14" class="muted" />
      </div>
    </aside>

    <div class="work">
      <header class="topbar">
        <div class="crumb">
          <span>工作台</span>
          <span class="crumb__sep">/</span>
          <strong>报价单</strong>
        </div>
        <div class="topbar__search">
          <Search :size="15" class="muted" />
          <input placeholder="搜索报价单、客户或负责人" />
          <kbd>⌘K</kbd>
        </div>
        <button class="icon-btn" title="通知">
          <Bell :size="17" :stroke-width="1.8" />
          <span class="dot" />
        </button>
        <button class="avatar avatar--sm">李</button>
      </header>

      <main class="main">
        <section class="hero">
          <div>
            <h1>报价单</h1>
            <p>管理报价、追踪毛利与客户状态。当前环境：<code>{{ values.gateway }}</code></p>
          </div>
          <div class="hero__actions">
            <a class="btn btn--ghost" href="/vanilla.html" target="_blank">
              <Zap :size="15" />
              框架无关示例
            </a>
            <button class="btn btn--primary" @click="toggle()">
              <Bug :size="15" :stroke-width="2" />
              打开调试面板
            </button>
          </div>
        </section>

        <div class="hint">
          <span class="hint__dot" />
          <span>Rinova Devtools 已接入本页面，按 <kbd>⌥</kbd><kbd>⇧</kbd><kbd>D</kbd> 随时呼出，或点击右下角悬浮球。</span>
          <button class="hint__link" @click="open('network')">
            查看网络请求
            <ArrowUpRight :size="12" />
          </button>
        </div>

        <section class="metrics">
          <article class="metric">
            <span class="metric__label">本月报价单</span>
            <strong>{{ summary.quotes }}</strong>
            <span class="metric__delta"><ArrowUpRight :size="12" /> 8.2%</span>
          </article>
          <article class="metric">
            <span class="metric__label">报价总额</span>
            <strong>{{ money(summary.amount) }}</strong>
            <span class="metric__hint">含税 · 已确认</span>
          </article>
          <article class="metric">
            <span class="metric__label">待跟进</span>
            <strong>{{ summary.pending }}</strong>
            <span class="metric__hint">2 个今日到期</span>
          </article>
          <article class="metric">
            <span class="metric__label">平均毛利率</span>
            <strong>{{ summary.margin }}%</strong>
            <span class="metric__hint metric__hint--warn">低于目标 20%</span>
          </article>
        </section>

        <div class="grid">
          <section class="card">
            <header class="card__head">
              <div class="tabs">
                <button
                  v-for="tab in ['全部', '草稿', '已报价', '已成交']"
                  :key="tab"
                  class="tabs__item"
                  :class="{ 'is-active': activeTab === tab }"
                  @click="activeTab = tab"
                >
                  {{ tab }}
                </button>
              </div>
              <div class="card__tools">
                <button class="btn btn--sm" @click="loadSummary">
                  <Activity :size="14" />
                  刷新汇总
                </button>
                <button class="btn btn--sm btn--primary" @click="createQuote" :disabled="busy === '/api/quotes'">
                  <Plus :size="14" />
                  新建报价
                </button>
              </div>
            </header>

            <table class="quotes">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>客户</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>负责人</th>
                  <th>更新时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in visibleQuotes" :key="row.id">
                  <td><span class="mono">{{ row.id }}</span></td>
                  <td>{{ row.customer }}</td>
                  <td class="mono">{{ money(row.amount) }}</td>
                  <td>
                    <span class="pill" :data-tone="statusMeta[row.status].tone">
                      {{ statusMeta[row.status].label }}
                    </span>
                  </td>
                  <td><span class="owner"><i>{{ row.owner.slice(0, 1) }}</i>{{ row.owner }}</span></td>
                  <td class="muted">{{ row.updated }}</td>
                </tr>
              </tbody>
            </table>

            <footer class="card__foot">
              <span>共 42 条报价单，当前展示 {{ visibleQuotes.length }} 条</span>
              <span class="pager"><b>1</b><span>2</span><span>3</span></span>
            </footer>
          </section>

          <aside class="debug">
            <header class="debug__head">
              <span class="debug__mark"><Bug :size="14" :stroke-width="2.2" /></span>
              <div>
                <strong>调试演示</strong>
                <p>每次操作都会出现在网络 / 日志面板</p>
              </div>
            </header>

            <div class="debug__grid">
              <button class="dbg" @click="loadSummary">
                <Activity :size="15" />
                <span>读取汇总</span>
              </button>
              <button class="dbg" @click="slowRequest">
                <Zap :size="15" />
                <span>慢请求 1.2s</span>
              </button>
              <button class="dbg dbg--danger" @click="failRequest">
                <Terminal :size="15" />
                <span>模拟 500</span>
              </button>
              <button class="dbg" @click="createQuote">
                <FileText :size="15" />
                <span>提交报价</span>
              </button>
              <button class="dbg" @click="writeStorage">
                <Database :size="15" />
                <span>写入存储</span>
              </button>
              <button class="dbg" @click="emitLogs">
                <Terminal :size="15" />
                <span>打日志</span>
              </button>
            </div>

            <div class="result">
              <span class="result__label">最近结果</span>
              <p class="mono">{{ lastResult }}</p>
            </div>

            <div class="terminal">
              <div class="terminal__head">
                <span class="terminal__dots"><i /><i /><i /></span>
                <span>devtools · session</span>
              </div>
              <ul>
                <li v-for="(line, index) in logs" :key="index" :data-tone="line.tone">
                  <span>{{ line.time }}</span>
                  <p>{{ line.text }}</p>
                </li>
              </ul>
            </div>

            <div class="snapshot">
              <span class="snapshot__title">配置快照</span>
              <div class="snapshot__row">
                <span>网关</span><code>{{ values.gateway }}</code>
              </div>
              <div class="snapshot__row">
                <span>灰度</span><code>{{ values.gray || '—' }}</code>
              </div>
              <div class="snapshot__flags">
                <span :data-on="values.mockEnable">Mock</span>
                <span :data-on="values.abDebug">AB</span>
                <span :data-on="values.ueDebug">UE</span>
                <span :data-on="values.apiDebug">接口</span>
              </div>
            </div>

            <footer class="debug__foot">
              <span>Rinova Devtools</span>
              <button class="copy" @click="open('config')">
                <Copy :size="12" />
                打开配置面板
              </button>
            </footer>
          </aside>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
}

.muted {
  color: #8792a0;
}

.mono {
  font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}

/* ------------------------------------------------------------ sidebar */

.sidebar {
  width: 228px;
  flex: none;
  display: flex;
  flex-direction: column;
  padding: 18px 12px 14px;
  background: #ffffff;
  border-right: 1px solid #e6eaf0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 2px 8px 20px;
}

.brand__mark {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: #fff;
  font-weight: 650;
  font-size: 15px;
  background: linear-gradient(150deg, #4c85f5, #2f6feb);
  box-shadow: 0 4px 12px rgba(47, 111, 235, 0.32);
}

.brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.brand__text strong {
  font-size: 13.5px;
  letter-spacing: -0.01em;
}

.brand__text em {
  font-style: normal;
  color: #8792a0;
  font-size: 10.5px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav__title {
  margin: 14px 8px 6px;
  color: #9aa5b1;
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.nav__item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 34px;
  padding: 0 9px;
  border-radius: 7px;
  color: #4a5563;
  font-size: 12.5px;
  transition: background 0.14s ease, color 0.14s ease;
}

.nav__item:hover {
  background: #f4f6fa;
  color: #1c2024;
}

.nav__item.is-active {
  background: #eef3fe;
  color: #2563eb;
  font-weight: 550;
}

.nav__count {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 5px;
  background: #eef1f5;
  color: #6c7a89;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.nav__item.is-active .nav__count {
  background: #dfe9fd;
  color: #2563eb;
}

.sidebar__footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px 2px;
  border-top: 1px solid #eef1f5;
}

.sidebar__user {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  flex: 1;
}

.sidebar__user strong {
  font-size: 11.5px;
  font-weight: 550;
}

.sidebar__user em {
  font-style: normal;
  color: #8792a0;
  font-size: 10px;
}

.avatar {
  width: 28px;
  height: 28px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #e8f0ff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 600;
}

.avatar--sm {
  width: 30px;
  height: 30px;
  border: 1px solid #e6eaf0;
  cursor: pointer;
}

/* ------------------------------------------------------------- work */

.work {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 56px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 24px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #e6eaf0;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8792a0;
  font-size: 12px;
  min-width: 138px;
}

.crumb strong {
  color: #1c2024;
  font-weight: 550;
}

.crumb__sep {
  color: #c3cad3;
}

.topbar__search {
  flex: 1;
  max-width: 420px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 9px;
  border: 1px solid #e6eaf0;
  border-radius: 7px;
  background: #f7f8fb;
}

.topbar__search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  font-size: 12px;
  color: #1c2024;
}

.topbar__search input::placeholder {
  color: #9aa5b1;
}

kbd {
  display: inline-flex;
  align-items: center;
  height: 17px;
  padding: 0 4px;
  border: 1px solid #e1e6ec;
  border-radius: 4px;
  background: #fff;
  color: #8792a0;
  font-family: inherit;
  font-size: 9.5px;
}

.icon-btn {
  position: relative;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid #e6eaf0;
  border-radius: 7px;
  background: #fff;
  color: #4a5563;
  cursor: pointer;
}

.icon-btn .dot {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f04438;
  box-shadow: 0 0 0 1.5px #fff;
}

.topbar > .avatar {
  margin-left: auto;
}

.main {
  padding: 22px 24px 40px;
  max-width: 1320px;
  width: 100%;
}

/* ------------------------------------------------------------- hero */

.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.hero h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 620;
  letter-spacing: -0.02em;
}

.hero p {
  margin: 4px 0 0;
  color: #5b6673;
  font-size: 12px;
}

.hero code {
  padding: 1px 5px;
  border-radius: 4px;
  background: #eef1f5;
  color: #4a5563;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 10.5px;
}

.hero__actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #e1e6ec;
  border-radius: 7px;
  background: #fff;
  color: #3d4752;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, transform 0.12s ease;
}

.btn:hover {
  background: #f7f8fb;
}

.btn:active {
  transform: translateY(0.5px);
}

.btn--primary {
  border-color: #2f6feb;
  background: #2f6feb;
  color: #fff;
  box-shadow: 0 2px 6px rgba(47, 111, 235, 0.26);
}

.btn--primary:hover {
  background: #2563eb;
}

.btn--ghost {
  border-color: transparent;
  background: transparent;
  color: #5b6673;
}

.btn--sm {
  height: 28px;
  padding: 0 9px;
  font-size: 11px;
}

.btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  margin-bottom: 16px;
  border: 1px solid #dfe9fd;
  border-radius: 8px;
  background: linear-gradient(90deg, #f4f8ff, #fbfcff);
  color: #4a5563;
  font-size: 11.5px;
}

.hint__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #2f6feb;
  box-shadow: 0 0 0 3px rgba(47, 111, 235, 0.12);
}

.hint kbd {
  margin: 0 1px;
}

.hint__link {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 0;
  background: transparent;
  color: #2563eb;
  font-size: 11px;
  cursor: pointer;
}

/* ---------------------------------------------------------- metrics */

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 13px 14px 12px;
  border: 1px solid #e6eaf0;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
}

.metric__label {
  color: #6c7a89;
  font-size: 10.5px;
}

.metric strong {
  font-size: 21px;
  font-weight: 620;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.metric__delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: #1a7f37;
  font-size: 10px;
}

.metric__hint {
  color: #8792a0;
  font-size: 10px;
}

.metric__hint--warn {
  color: #b7791f;
}

/* ------------------------------------------------------------- grid */

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 336px;
  gap: 12px;
  align-items: start;
}

.card {
  border: 1px solid #e6eaf0;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
  overflow: hidden;
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px 0 6px;
  border-bottom: 1px solid #eef1f5;
}

.tabs {
  display: flex;
  gap: 2px;
  padding: 4px 0;
}

.tabs__item {
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6c7a89;
  font-size: 11.5px;
  cursor: pointer;
}

.tabs__item:hover {
  color: #1c2024;
}

.tabs__item.is-active {
  background: #f2f5fa;
  color: #1c2024;
  font-weight: 550;
}

.card__tools {
  display: flex;
  gap: 6px;
}

.quotes {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}

.quotes th {
  height: 34px;
  padding: 0 12px;
  text-align: left;
  color: #8792a0;
  font-size: 10px;
  font-weight: 550;
  letter-spacing: 0.02em;
  background: #fafbfd;
  border-bottom: 1px solid #eef1f5;
}

.quotes td {
  height: 44px;
  padding: 0 12px;
  border-bottom: 1px solid #f1f3f6;
  color: #3d4752;
}

.quotes tbody tr:hover {
  background: #fafbfd;
}

.quotes .mono {
  color: #4a5563;
  font-size: 10.5px;
}

.pill {
  display: inline-flex;
  align-items: center;
  height: 19px;
  padding: 0 7px;
  border-radius: 5px;
  background: #f1f3f6;
  color: #5b6673;
  font-size: 10px;
  font-weight: 500;
}

.pill[data-tone='info'] {
  background: #eef3fe;
  color: #2563eb;
}

.pill[data-tone='ok'] {
  background: #ecf8ef;
  color: #1a7f37;
}

.pill[data-tone='error'] {
  background: #fdf0ef;
  color: #d1242f;
}

.owner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.owner i {
  width: 20px;
  height: 20px;
  display: inline-grid;
  place-items: center;
  border-radius: 50%;
  background: #eef3fe;
  color: #2563eb;
  font-style: normal;
  font-size: 9.5px;
  font-weight: 600;
}

.card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  color: #8792a0;
  font-size: 10.5px;
}

.pager {
  display: flex;
  gap: 2px;
}

.pager b,
.pager span {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 500;
}

.pager b {
  background: #eef3fe;
  color: #2563eb;
}

/* ------------------------------------------------------------- debug */

.debug {
  border: 1px solid #222a33;
  border-radius: 12px;
  padding: 13px;
  background:
    radial-gradient(400px 200px at 100% 0, rgba(47, 111, 235, 0.18), transparent 65%),
    linear-gradient(180deg, #161b22, #12161b);
  color: #e7edf4;
  box-shadow: 0 14px 34px rgba(16, 24, 40, 0.16);
}

.debug__head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding-bottom: 11px;
  border-bottom: 1px solid #232b35;
}

.debug__mark {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: linear-gradient(150deg, #4c85f5, #2f6feb);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.debug__head strong {
  font-size: 12px;
  font-weight: 600;
}

.debug__head p {
  margin: 1px 0 0;
  color: #8b98a7;
  font-size: 10px;
}

.debug__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 11px;
}

.dbg {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 9px;
  border: 1px solid #2a323c;
  border-radius: 7px;
  background: #1b2129;
  color: #cdd7e1;
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.14s ease, background 0.14s ease, color 0.14s ease;
}

.dbg:hover {
  border-color: #3b4755;
  background: #212933;
  color: #fff;
}

.dbg--danger {
  color: #ff9d97;
}

.dbg--danger:hover {
  border-color: rgba(248, 81, 73, 0.45);
  background: rgba(248, 81, 73, 0.1);
}

.result {
  margin-top: 11px;
  padding: 8px 9px;
  border: 1px solid #232b35;
  border-radius: 7px;
  background: #0f1419;
}

.result__label {
  color: #6c7a89;
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.result p {
  margin: 3px 0 0;
  color: #b8c4d0;
  font-size: 10px;
  word-break: break-all;
  line-height: 1.5;
}

.terminal {
  margin-top: 9px;
  border: 1px solid #232b35;
  border-radius: 7px;
  background: #0f1419;
  overflow: hidden;
}

.terminal__head {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 24px;
  padding: 0 9px;
  border-bottom: 1px solid #1d252e;
  color: #6c7a89;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 9px;
}

.terminal__dots {
  display: flex;
  gap: 3px;
}

.terminal__dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #2f3a46;
}

.terminal ul {
  list-style: none;
  margin: 0;
  padding: 6px 9px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 96px;
}

.terminal li {
  display: flex;
  gap: 7px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 9.5px;
  line-height: 1.5;
}

.terminal li span {
  flex: none;
  color: #4d5b6a;
}

.terminal li p {
  margin: 0;
  color: #9fb0c1;
  word-break: break-all;
}

.terminal li[data-tone='ok'] p {
  color: #7ee2a2;
}

.terminal li[data-tone='error'] p {
  color: #ff9d97;
}

.snapshot {
  margin-top: 9px;
  padding: 9px;
  border: 1px solid #232b35;
  border-radius: 7px;
  background: #151b22;
}

.snapshot__title {
  color: #6c7a89;
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.snapshot__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 5px;
  font-size: 10px;
}

.snapshot__row span {
  color: #8b98a7;
}

.snapshot__row code {
  color: #cdd7e1;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 9.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.snapshot__flags {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.snapshot__flags span {
  padding: 1px 6px;
  border-radius: 4px;
  background: #1d252e;
  color: #6c7a89;
  font-size: 9px;
}

.snapshot__flags span[data-on='true'] {
  background: rgba(47, 111, 235, 0.16);
  color: #7ea6ff;
}

.debug__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  color: #5b6b7a;
  font-size: 9.5px;
}

.copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: #8b98a7;
  font-size: 9.5px;
  cursor: pointer;
}

.copy:hover {
  color: #cdd7e1;
}

@media (max-width: 1120px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .debug {
    max-width: 520px;
  }
}

@media (max-width: 860px) {
  .sidebar {
    display: none;
  }

  .metrics {
    grid-template-columns: 1fr 1fr;
  }

  .hero {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
