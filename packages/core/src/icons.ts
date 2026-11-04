import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Box,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clipboard,
  Copy,
  Database,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Globe,
  Key,
  Layers,
  ListFilter,
  Moon,
  PanelRight,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  X,
  Zap,
  createElement,
  type IconNode
} from 'lucide'
import type { IconName } from './types'

const ICONS: Record<IconName, IconNode> = {
  activity: Activity,
  'alert-circle': AlertCircle,
  'arrow-left': ArrowLeft,
  'arrow-up-right': ArrowUpRight,
  box: Box,
  bug: Bug,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  circle: Circle,
  clipboard: Clipboard,
  copy: Copy,
  database: Database,
  eraser: Eraser,
  'external-link': ExternalLink,
  eye: Eye,
  'eye-off': EyeOff,
  filter: Filter,
  globe: Globe,
  key: Key,
  layers: Layers,
  'list-filter': ListFilter,
  moon: Moon,
  'panel-right': PanelRight,
  play: Play,
  plus: Plus,
  'refresh-cw': RefreshCw,
  'rotate-ccw': RotateCcw,
  search: Search,
  send: Send,
  settings: Settings,
  'sliders-horizontal': SlidersHorizontal,
  sparkles: Sparkles,
  sun: Sun,
  terminal: Terminal,
  trash: Trash2,
  x: X,
  zap: Zap
}

export const iconNames = Object.keys(ICONS) as IconName[]

/** 创建 lucide 图标；未知图标回退为圆点，避免插件报错打断面板 */
export function createIcon(name: IconName | undefined, size = 16, strokeWidth = 1.8): SVGSVGElement {
  const node = (name && ICONS[name]) || Circle
  const svg = createElement(node, {
    width: String(size),
    height: String(size),
    'stroke-width': String(strokeWidth),
    'aria-hidden': 'true'
  }) as SVGSVGElement
  svg.classList.add('rdt-icon')
  return svg
}
