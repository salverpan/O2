import { createApp, reactive, ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue/dist/vue.esm-bundler.js'
import Antd, { message, Modal, theme as antdTheme } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { Marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import katex from 'katex'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import * as echarts from 'echarts/core'
import { BUILTIN_GALLERY_CATALOG, GALLERY_MAP, SymbolPicker, O2Echarts, QuantWidget, WidgetConfigDrawer, LazyChatVisual, WidgetGalleryModal } from './widgets_hub.js'
import { EntityGeoAtlas } from './geo_atlas.js'
import { BacktestLab } from './backtest_lab.js'

const api = {
  async get(path) {
    const r = await fetch(path)
    return r.json()
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
    return r.json()
  },
}

const ICO = {
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/><path d="M12 3a14.5 14.5 0 0 0 0 18"/><path d="M12 3a14.5 14.5 0 0 1 0 18"/></svg>',
  reload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>',
  catalog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/><path d="M12 10v6"/><path d="M9 13h6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 8h.01"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  manage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/><circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="1.6" fill="currentColor" stroke="none"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>',
  folderOpen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',
  folderPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>',
  filePlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 12v6"/></svg>',
  collapseAll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 10h6"/><path d="M21 7v12a2 2 0 0 1-2 2H7"/></svg>',
  upLevel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  project: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10"/><path d="M7 12h6"/><path d="M7 16h8"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></svg>',
  appearance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 14 10-10"/><path d="m4 20 16-16"/><path d="m10 20 10-10"/></svg>',
  shortcut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-7 8h5v10h4V11h5z"/></svg>',
  provider: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4"/><path d="M15 2v4"/><path d="M9 18v4"/><path d="M15 18v4"/><path d="M2 9h4"/><path d="M2 15h4"/><path d="M18 9h4"/><path d="M18 15h4"/></svg>',
  embed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  storage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>',
  rss: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  pinWindow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 6-6"/></svg>',
  backtest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v5.4a2 2 0 0 1-.4 1.2L4.2 17a2 2 0 0 0 1.6 3.2h12.4a2 2 0 0 0 1.6-3.2l-5.4-7.4a2 2 0 0 1-.4-1.2V3"/><path d="M7.5 14.5h9"/></svg>',
  heatmap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  starFill: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  translate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
  checkAll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  compact: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 9v12"/></svg>',
  panelRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  robot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 2v6"/><circle cx="12" cy="2" r="1"/><path d="M8 13h.01"/><path d="M16 13h.01"/><path d="M9 17h6"/></svg>',
  brief: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
  maximize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  minimize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
}

const DOC_TYPE_SPECS = [
  { id: 'regulation', label: '制度法规', color: 'blue', chunk: 'laws' },
  { id: 'finance', label: '财报数据', color: 'green', chunk: 'report' },
  { id: 'contract', label: '合同协议', color: 'purple', chunk: 'laws' },
  { id: 'report', label: '研报方案', color: 'cyan', chunk: 'report' },
  { id: 'spreadsheet', label: '表格台账', color: 'geekblue', chunk: 'table' },
  { id: 'image', label: '图片图纸', color: 'magenta', chunk: 'image' },
  { id: 'general', label: '通用文档', color: 'default', chunk: 'report' },
]
const DOC_TYPE_MAP = Object.fromEntries(DOC_TYPE_SPECS.map((x) => [x.id, x]))
const CHUNK_PROFILE_LABELS = {
  auto: '智能自动',
  laws: '条文切分',
  report: '章节切分',
  table: '带表头表格',
  image: '视觉+OCR',
  one: '整篇索引',
}
const INGEST_ACCEPT = '.pdf,.doc,.docx,.pptx,.ppt,.rtf,.xlsx,.xls,.csv,.tsv,.txt,.md,.markdown,.json,.yaml,.yml,.jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp,.svg,.heic,.heif'

const EFFORTS = [
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
  { id: 'extra_high', label: '极高' },
]
const CHAT_ASCII = [
  '   ____  ___      ___                        __ ',
  '  / __ \\|__ \\    /   |  ____ _ ___   ____   / /_',
  ' / / / /__/ /   / /| | / __ `// _ \\ / __ \\ / __/',
  '/ /_/ // __/   / ___ |/ /_/ //  __// / / // /_  ',
  '\\____//____/  /_/  |_|\\__, / \\___//_/ /_/ \\__/  ',
  '                     /____/                     ',
].join('\n')
const ATTACH_EXT = ['.xlsx', '.csv', '.pdf', '.doc', '.docx', '.md', '.markdown', '.json', '.txt', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.svg', '.webp', '.heif', '.heic']
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.svg', '.webp', '.heif', '.heic']

const App = {
  template: `
<a-config-provider :theme="theme" :locale="zhCN">
<div class="shell" :class="cfg.ui_density ? ('density-' + cfg.ui_density) : 'density-default'">
  <!-- 布局一：顶部标签页 -->
  <header v-if="cfg.ui_density === 'topbar'" class="app-top-tabbar">
    <div class="att-left" role="navigation" aria-label="主导航">
      <button v-for="n in navs" :key="n.key" type="button"
              :class="['att-nav-btn', tab === n.key ? 'on' : '']"
              :aria-current="tab === n.key ? 'page' : undefined"
              @click="tab = n.key">
        <span class="nav-ico" v-html="n.icon"></span>
        <span>{{ n.label }}</span>
      </button>
      <span class="att-divider"></span>
      <button type="button" class="att-nav-btn" title="管理会话" aria-label="管理会话" @click="openHistBrowse">
        <span class="nav-ico" v-html="ICO.search"></span>
      </button>
    </div>
    <div class="att-tabs" role="tablist" aria-label="会话标签">
      <div v-for="c in allSessionChats" :key="c.id"
           role="tab" tabindex="0" :aria-selected="c.id === chatId && tab === 'ask'"
           :class="['att-tab', c.id === chatId && tab === 'ask' ? 'on' : '']"
           :title="c.title || '新对话'"
           @click="openHistChat(c)" @keydown.enter.prevent="openHistChat(c)">
        <span class="att-tab-title">{{ c.title || '新对话' }}</span>
        <matrix-loader v-if="runningIds[c.id]" />
        <button v-if="allSessionChats.length > 1" type="button" class="att-tab-close"
                title="关闭会话" aria-label="关闭会话" @click.stop="closeSessionTab(c)">×</button>
      </div>
      <button type="button" class="att-new-btn" title="新建会话" aria-label="新建会话" @click="newChat">
        <span v-html="ICO.plus"></span>
      </button>
    </div>
    <div class="att-right">
      <button type="button" class="att-nav-btn"
              :title="cfg.ui_theme === 'dark' ? '切换浅色外观' : '切换深色外观'"
              aria-label="切换外观主题"
              @click="toggleTheme">
        <span class="nav-ico" v-html="cfg.ui_theme === 'dark' ? ICO.sun : ICO.moon"></span>
      </button>
      <button type="button" :class="['att-nav-btn', tab === 'settings' ? 'on' : '']"
              @click="tab = tab === 'settings' ? (lastAppTab || 'ask') : 'settings'">
        <span class="nav-ico" v-html="ICO.settings"></span>
        <span>设置</span>
      </button>
    </div>
  </header>

  <!-- 布局二（侧边标签页）与布局三（收件箱）：左侧应用栏始终可见 -->
  <aside v-if="cfg.ui_density !== 'topbar' || histMode" class="sider"
         :class="{ 'sider-hist': histMode, 'sider-inbox': cfg.ui_density === 'compact' }">
    <div v-if="histMode" class="hist-manage-pane">
      <div class="hist-manage-head">
        <span class="hist-manage-title">{{ histPaneTitle }}</span>
        <span class="hist-head-actions">
          <a-tooltip v-if="histMode === 'browse'" title="管理">
            <button type="button" class="hist-tool" :disabled="!histGroups.length" @click="openHistManage">
              <span class="nav-ico" v-html="ICO.manage"></span>
            </button>
          </a-tooltip>
          <button type="button" class="hist-close" aria-label="关闭" @click="closeHistManage">
            <span v-html="ICO.close"></span>
          </button>
        </span>
      </div>
      <div class="hist-scroll">
        <o2-empty v-if="!histGroups.length" description="还没有历史对话" />
        <div v-for="g in histGroups" :key="g.key" class="hist-group">
          <div class="hist-label">{{ g.label }}</div>
          <div v-for="c in g.items" :key="c.id" role="button" tabindex="0"
               :class="['hist-pick', histMode === 'browse' && c.id === chatId ? 'on' : '']"
               @click="onHistRow(c)" @keydown.enter.prevent="onHistRow(c)">
            <a-checkbox v-if="histMode === 'manage'" :checked="!!histPicked[c.id]" />
            <span class="hist-pick-title">{{ c.title || '新对话' }}</span>
            <matrix-loader v-if="runningIds[c.id]" />
            <span v-if="c.pinned" class="hist-pin" v-html="ICO.pin"></span>
          </div>
        </div>
      </div>
      <div v-if="histMode === 'manage'" class="hist-foot">
        <a-button type="text" :disabled="!histPickCount" @click="pinPicked">
          <span class="icon-svg" v-html="ICO.pin"></span>
          <span>{{ histPinLabel }}</span>
        </a-button>
        <span class="hist-foot-split"></span>
        <a-button type="text" :danger="histPickCount > 0" :disabled="!histPickCount" @click="deletePicked">
          <span class="icon-svg" v-html="ICO.trash"></span>
          <span>删除</span>
        </a-button>
      </div>
    </div>
    <nav v-else class="nav" aria-label="主导航">
      <div class="nav-switch">
        <span class="slide-pill" :style="navPillStyle"></span>
        <button v-for="n in navs" :key="n.key"
                :ref="(el) => bindMainNav(n.key, el)"
                :class="['nav-item', tab === n.key ? 'on' : '']"
                :aria-current="tab === n.key ? 'page' : undefined"
                @click="tab = n.key">
          <span class="nav-ico" v-html="n.icon"></span>
          <span>{{ n.label }}</span>
        </button>
      </div>

      <!-- 收件箱顶部快捷操作：搜索会话 -->
      <div v-if="cfg.ui_density === 'compact'" class="sider-quick-actions">
        <div class="sider-search-row">
          <span class="sider-search-ico" v-html="ICO.search"></span>
          <input v-model="histSearchQuery" type="text" class="sider-search-input" aria-label="搜索会话" placeholder="搜索会话…" />
          <button v-if="histSearchQuery" type="button" class="sider-search-clear" aria-label="清空搜索" @click="histSearchQuery = ''">×</button>
        </div>
      </div>

      <button type="button" class="nav-item nav-history" @click="openHistBrowse">
        <span class="nav-ico" v-html="ICO.history"></span>
        <span>历史</span>
      </button>

      <section class="hist">
        <div class="hist-head">
          <span class="hist-head-label">{{ cfg.ui_density === 'compact' ? '最近' : '会话' }}</span>
          <span class="hist-head-actions">
            <a-tooltip title="新建会话">
              <button type="button" class="hist-tool" aria-label="新建会话" @click="newChat">
                <span class="nav-ico" v-html="ICO.plus"></span>
              </button>
            </a-tooltip>
            <a-tooltip title="管理">
              <button type="button" class="hist-tool" aria-label="管理会话" :disabled="!allSessionChats.length" @click="openHistManage">
                <span class="nav-ico" v-html="ICO.manage"></span>
              </button>
            </a-tooltip>
          </span>
        </div>

        <!-- 布局三：收件箱模式 -->
        <div v-if="cfg.ui_density === 'compact'" class="hist-scroll inbox-scroll">
          <div v-if="!filteredSessionChats.length" class="hist-empty">暂无匹配会话</div>
          <button type="button" v-for="c in filteredSessionChats" :key="c.id"
                  :class="['inbox-item', c.id === chatId ? 'on' : '']"
                  :title="c.title" @click="openHistChat(c)">
            <div class="inbox-item-top">
              <span class="inbox-item-title">{{ c.title || '新对话' }}</span>
              <matrix-loader v-if="runningIds[c.id]" />
              <span v-else-if="c.pinned" class="hist-pin" v-html="ICO.pin"></span>
            </div>
            <div class="inbox-item-sub">
              <span class="inbox-item-proj">{{ convTurnCount(c) }} 轮对话</span>
              <span class="inbox-item-time">{{ convRelTime(c.activeAt || c.createdAt) }}</span>
            </div>
          </button>
        </div>

        <!-- 布局二：侧边标签页模式 -->
        <div v-else class="hist-scroll">
          <div v-if="!allSessionChats.length" class="hist-empty">暂无历史对话</div>
          <button type="button" v-for="c in allSessionChats" :key="c.id"
                  :class="['hist-item', c.id === chatId ? 'on' : '']"
                  :title="c.title" @click="openHistChat(c)">
            <span v-if="c.pinned" class="hist-pin" v-html="ICO.pin"></span>
            <span class="hist-title">{{ c.title || '新对话' }}</span>
            <matrix-loader v-if="runningIds[c.id]" />
          </button>
        </div>
      </section>

      <div class="sider-foot-row">
        <button type="button" :class="['nav-item', 'nav-settings', tab === 'settings' ? 'on' : '']"
                @click="tab = 'settings'">
          <span class="nav-ico" v-html="ICO.settings"></span>
          <span>设置</span>
        </button>
      </div>
    </nav>
  </aside>

  <div class="main">
    <div class="content" :class="['pane-' + tab, paneOn ? 'switching' : '']">
      <div class="pane-stage">
      <template v-if="tab === 'search'">
        <div class="hero">
          <h2>多模态智能检索</h2>
          <p class="lead">支持跨项目检索制度条文、财报指标、合同要素、结构化表格与图纸视觉索引。</p>
          <div class="search-row">
            <a-input
              ref="searchInputEl"
              v-model:value="q"
              size="large"
              allow-clear
              placeholder="输入关键词、文档标题、文号、公司主体、合同方或表头字段…"
              @keydown="onSearchKeydown" />
            <a-button type="primary" size="large" :loading="loading" @click="doSearch">搜索</a-button>
          </div>
          <div class="filters">
            <a-select v-model:value="filters.project" placeholder="全部项目" allow-clear
                      size="large" class="w-dept" @change="doSearch">
              <a-select-option v-for="p in facets.projects" :key="p" :value="p">{{ p }}</a-select-option>
            </a-select>
            <a-select v-model:value="filters.doc_type" placeholder="全部文件性质" allow-clear
                      size="large" class="w-type" @change="doSearch">
              <a-select-option v-for="t in DOC_TYPE_SPECS" :key="t.id" :value="t.id">{{ t.label }}</a-select-option>
            </a-select>
            <a-select v-model:value="filters.chunk_type" placeholder="全部内容块" allow-clear
                      size="large" class="w-type" @change="doSearch">
              <a-select-option value="text">正文条文</a-select-option>
              <a-select-option value="table">数据表格</a-select-option>
              <a-select-option value="image">图表索引</a-select-option>
            </a-select>
            <a-select v-model:value="filters.dept" placeholder="全部部门" allow-clear
                      size="large" class="w-dept" @change="doSearch">
              <a-select-option v-for="d in facets.depts" :key="d" :value="d">{{ d }}</a-select-option>
            </a-select>
            <a-select v-model:value="filters.status" placeholder="效力状态" allow-clear
                      size="large" class="w-status" @change="doSearch">
              <a-select-option v-for="s in facets.statuses" :key="s" :value="s">{{ s }}</a-select-option>
            </a-select>
            <span class="spacer"></span>
            <span class="hint" v-if="results.length">{{ results.length }} 条匹配片段</span>
            <span class="hint" v-else-if="searched && !loading">无匹配结果</span>
          </div>
          <div class="chips" v-if="recent.length && !(q || '').trim()">
            <button class="chip" v-for="ex in recent" :key="ex" @click="pickExample(ex)">{{ ex }}</button>
          </div>
        </div>

        <a-spin :spinning="loading">
          <div class="results">
            <div v-for="(r, i) in results" :key="r.chunk_id" class="hit" role="button" tabindex="0"
                 :style="blockDelay(i)" @click="openDoc(r.doc_id, r.chunk_id)" @keydown.enter.prevent="openDoc(r.doc_id, r.chunk_id)">
              <div class="hit-head">
                <div class="hit-tags">
                  <a-tag :color="docTypeColor(r.doc_type)">{{ docTypeLabel(r.doc_type) }}</a-tag>
                  <a-tag>{{ r.project }}{{ r.folder ? ' / ' + r.folder : (r.dept ? ' / ' + r.dept : '') }}</a-tag>
                  <span v-if="r.chunk_type === 'table'" class="chunk-type-badge table">表格切片</span>
                  <span v-else-if="r.chunk_type === 'image'" class="chunk-type-badge image">视觉索引</span>
                  <span class="docno" v-if="r.doc_no">{{ r.doc_no }}</span>
                  <a-tag v-if="r.status && r.status !== '现行'" color="orange">{{ r.status }}</a-tag>
                </div>
                <span class="loc">
                  <span v-if="r.article">{{ r.article }}</span>
                  <span v-if="r.page_start"> · 第 {{ r.page_start }} 页</span>
                </span>
              </div>
              <div class="hit-title">{{ r.title }}</div>
              <div class="poly-pills" v-if="recordPills(r).length">
                <span v-for="(p, pi) in recordPills(r)" :key="pi" class="poly-pill">
                  <span class="poly-pill-k">{{ p.k }}:</span>
                  <span class="poly-pill-v">{{ p.v }}</span>
                </span>
              </div>
              <div class="hit-body" v-html="r.snippet"></div>
              <div class="hit-open">打开原文定位</div>
            </div>
            <o2-empty v-if="!loading && searched && !results.length" description="没有找到匹配内容" />
          </div>
        </a-spin>
      </template>

      <div v-show="tab === 'ask'" class="chatwrap" :class="{ 'bw-inline-open': askBrowserOpen }" ref="chatwrapEl">
          <div :class="['ask-bw-dock', askBrowserOpen ? 'open' : '', askBwDragging ? 'is-dragging' : '']"
               @wheel.ctrl.prevent="onAskBrowserWheel">
            <div class="ask-bw-dock-inner">
              <div class="ask-bw-window"
                   ref="askBrowserWin"
                   :class="{
                     'is-dragging': askBwDragging,
                     'ai-busy': browserState.coPanel.aiActive && !browserState.coPanel.waitingHuman,
                     'waiting-human': browserState.coPanel.waitingHuman
                   }"
                   :style="askBrowserWindowStyle">
                <div v-for="dir in ['n','s','w','e','nw','ne','sw','se']" :key="dir"
                     :class="['ask-bw-resizer', dir]"
                     title="拖动边框中心等比例缩放"
                     @pointerdown.stop.prevent="onAskBwResizeStart(dir, $event)"></div>
                <div class="ask-bw-clip">
                  <div class="ask-bw-top">
                    <div class="ask-bw-navs">
                      <button type="button" class="bw-btn" title="后退"
                              :disabled="!activeBrowserTab || !activeBrowserTab.canGoBack"
                              @click="browserBack" v-html="ICO.left"></button>
                      <button type="button" class="bw-btn" title="前进"
                              :disabled="!activeBrowserTab || !activeBrowserTab.canGoForward"
                              @click="browserForward" v-html="ICO.send"></button>
                      <button type="button" class="bw-btn"
                              :title="activeBrowserTab && activeBrowserTab.loading ? '停止加载' : '刷新'"
                              @click="browserReloadOrStop"
                              v-html="activeBrowserTab && activeBrowserTab.loading ? ICO.close : ICO.reload"></button>
                    </div>
                    <div class="ask-bw-tabstrip">
                      <div v-for="bt in browserState.tabs" :key="bt.id"
                           :class="['ask-bw-tabpill', bt.id === browserState.activeTabId ? 'on' : '']"
                           :title="bt.title || bt.url"
                           @click="switchBrowserTab(bt.id)">
                        <span v-if="bt.loading" class="bw-spin"></span>
                        <img v-else-if="bt.favicon" :src="bt.favicon" class="bw-fav" @error="bt.favicon = ''" alt="" />
                        <span v-else class="bw-tab-ico" v-html="ICO.globe"></span>
                        <span class="ask-bw-tabpill-title">{{ bt.title || '新标签页' }}</span>
                        <button v-if="browserState.tabs.length > 1" type="button" class="ask-bw-tabpill-x"
                                title="关闭标签页" @click.stop="closeBrowserTab(bt.id)" v-html="ICO.close"></button>
                      </div>
                      <button type="button" class="bw-btn" title="新建标签页"
                              @click="newBrowserTab()" v-html="ICO.plus"></button>
                    </div>
                    <input class="ask-bw-url"
                           v-model="browserUrlInput"
                           placeholder="输入网址或搜索词，按 Enter 访问"
                           @focus="onBrowserUrlFocus($event)"
                           @blur="onBrowserUrlBlur"
                           @keydown.enter.prevent="submitBrowserUrl" />
                    <div class="ask-bw-zoom" title="视图缩放">
                      <button type="button" class="ask-bw-zoom-btn" aria-label="缩小" :disabled="askBwScale <= 0.65" @click="stepAskBwScale(-0.1)">−</button>
                      <button type="button" class="ask-bw-zoom-val" aria-label="重置缩放" @click="resetAskBwScale">{{ Math.round(askBwScale * 100) }}%</button>
                      <button type="button" class="ask-bw-zoom-btn" aria-label="放大" :disabled="askBwScale >= 1.35" @click="stepAskBwScale(0.1)">+</button>
                    </div>
                    <button type="button" class="bw-btn" title="收起浏览器" aria-label="收起浏览器"
                            @click="closeAskBrowserByUser" v-html="ICO.close"></button>
                  </div>
                  <div v-if="browserState.coPanel.waitingHuman" class="ask-bw-human-bar">
                    <div class="ask-bw-human-info">
                      <span class="ask-bw-human-text">{{ browserState.coPanel.humanReason || '需要您完成页面验证或登录' }}</span>
                    </div>
                    <button type="button" class="ask-bw-human-btn" @click="confirmHumanBrowserDone">继续</button>
                  </div>
                  <div class="ask-bw-frame">
                    <div class="ask-bw-stage" ref="askBrowserStage">
                      <img v-if="hasNativeBrowser && (browserOccluded || askBwTransitioning) && browserPreviewUrl"
                           :src="browserPreviewUrl" class="bw-freeze" alt="" />
                      <div v-else-if="!hasNativeBrowser" class="bw-fallback">
                        <div class="bw-fallback-card">
                          <h3>在桌面窗口中使用协同浏览器</h3>
                          <p>通过桌面端启动后，此窗口将挂载 16:9 原生浏览器视图，支持 AI 与您同屏协同操作。</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="cfg.news_enabled && askNewsOpen"
               :class="['ask-news-float', askNewsMode === 'float' ? 'mode-float' : 'mode-dock']"
               :style="askNewsMode === 'float' ? askNewsFloatStyle : null">
            <div class="anf-head" @pointerdown="onAskNewsDragStart">
              <div class="anf-title">
                <span class="nav-ico" v-html="ICO.rss"></span>
                <span>快讯引用</span>
                <span v-if="newsFetching || newsStatus.fetching || newsStatus.translating" class="ft-sync-pill" aria-live="polite">
                  <span class="ft-sync-dot"></span>同步中
                </span>
              </div>
              <div style="display:flex;align-items:center;gap:4px" @pointerdown.stop>
                <a-tooltip :title="askNewsMode === 'float' ? '右侧停靠' : '自由悬浮'">
                  <button type="button" class="bw-btn" aria-label="切换窗口停靠模式" @click="askNewsMode = askNewsMode === 'float' ? 'dock' : 'float'" v-html="ICO.pinWindow"></button>
                </a-tooltip>
                <a-tooltip title="刷新">
                  <button type="button" class="bw-btn" aria-label="刷新快讯" @click="fetchNewsNow()" v-html="ICO.reload"></button>
                </a-tooltip>
                <a-tooltip title="关闭">
                  <button type="button" class="bw-btn" aria-label="关闭快讯窗口" @click="askNewsOpen = false" v-html="ICO.close"></button>
                </a-tooltip>
              </div>
            </div>
            <div class="anf-tools">
              <div style="display:flex;align-items:center;gap:6px">
                <div class="news-lang-pills">
                  <button v-for="lg in [{id:'all',l:'全'},{id:'zh',l:'中'},{id:'en',l:'英'},{id:'ru',l:'俄'},{id:'ja',l:'日'}]" :key="lg.id"
                          type="button" :class="['news-pill-btn', newsFilters.lang === lg.id ? 'on' : '']"
                          @click="newsFilters.lang = lg.id; runNewsSearch(true)">{{ lg.l }}</button>
                </div>
                <button type="button" :class="['ft-btn', newsSearchMode === 'semantic' ? 'on' : '']"
                        :aria-pressed="newsSearchMode === 'semantic'"
                        title="切换语义检索"
                        @click="newsSearchMode = newsSearchMode === 'semantic' ? 'keyword' : 'semantic'; if ((newsFilters.q || '').trim()) runNewsSearch(true)">
                  语义
                </button>
                <a-input v-model:value="newsFilters.q" size="small" allow-clear placeholder="搜索快讯…"
                         @pressEnter="runNewsSearch(true)" />
              </div>
            </div>
            <div class="anf-list">
              <o2-empty v-if="!newsItems.length" description="暂无快讯" />
              <div v-for="it in newsItems" :key="it.id"
                   :class="['anf-item', askNewsPicked[it.id] ? 'picked' : '']"
                   @click="toggleAskNewsPick(it)">
                <a-checkbox :checked="!!askNewsPicked[it.id]" style="margin-top:2px" />
                <div style="min-width:0;flex:1;display:flex;flex-direction:column;gap:3px">
                  <div class="news-card-meta">
                    <span :class="['news-lang-badge', it.lang]">{{ it.lang }}</span>
                    <span v-if="it.sentiment" :class="['news-sent', it.sentiment]">{{ sentimentLabel(it.sentiment) }}</span>
                    <span>{{ it.feed_name }}</span>
                    <span style="margin-left:auto" class="ft-mono">{{ formatNewsTime(it.published_at) }}</span>
                  </div>
                  <div style="font-size:12.5px;font-weight:600;line-height:1.38;color:var(--foreground)">
                    {{ it.title_zh || it.title_orig }}
                  </div>
                  <div v-if="it.entities && it.entities.length" style="display:flex;gap:4px;flex-wrap:wrap" @click.stop>
                    <span v-for="e in it.entities.slice(0, 3)" :key="e.name" class="ft-ent-pill"
                          @click="openEntityDossier(e.name)">{{ e.name }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="anf-foot">
              <span class="hint">已选 {{ askNewsPickedCount }} 条</span>
              <div style="display:flex;gap:6px">
                <a-button size="small" :disabled="!askNewsPickedCount" @click="askNewsPicked = {}">清空</a-button>
                <a-button size="small" :disabled="!askNewsPickedCount" @click="citeSelectedNewsToAsk(false)">引用</a-button>
                <a-button size="small" type="primary" :disabled="!askNewsPickedCount" @click="citeSelectedNewsToAsk(true)">分析</a-button>
              </div>
            </div>
          </div>

          <div class="chat-stage">
            <transition name="ascii-fade">
              <pre v-if="!messages.length" class="chat-ascii" aria-hidden="true">{{ chatAscii }}</pre>
            </transition>
            <div class="chatlog" ref="chatlog" @scroll.passive="onChatlogScroll">
            <div v-for="(m, i) in messages" :key="m.id || ('i' + i)" :class="['msg', m.role]" :style="msgDelay(i, messages.length)">
              <div class="bubble">
                <div v-if="m.files && m.files.length" class="msg-files">
                  <span v-for="(f, fi) in m.files" :key="fi" class="msg-file">{{ f.name }}</span>
                </div>
                <div v-if="m.tools && m.tools.length" class="tools">
                  <div class="sbf-window" :style="{ height: sbfWindowH(m) + 'px' }">
                    <div class="sbf-track" :style="{ transform: 'translateY(' + sbfOffset(m) + 'px)' }">
                      <div v-for="(t, j) in m.tools" :key="j" :class="['sbf-item', sbfItemClass(m, j)]">
                        <span class="tool-dot" :class="toolDotClass(t)"></span>
                        <span class="tool-q">{{ toolLabel(t) }}</span>
                        <span v-if="toolMeta(t)" class="tool-n">{{ toolMeta(t) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="m.error" class="chat-error">{{ m.error }}</div>
                <div v-if="m.role === 'assistant' && m.streaming && !m.ask"
                     class="answer-text"
                     :ref="(el) => bindAnswer(m, el)"
                     @click="onAnswerClick($event, m)"></div>
                <div v-else-if="m.content" class="answer-text" v-html="renderAnswer(m.content, m)"
                     @click="onAnswerClick($event, m)"></div>
                <div v-else-if="m.stopped && !m.streaming && !m.ask" class="hint">已停止</div>
                <div v-if="m.visuals && m.visuals.length" class="chat-vis-list">
                  <lazy-chat-visual v-for="(vis, vi) in m.visuals" :key="vis.id || ('vis-' + vi)"
                                    :visual="vis" :theme="cfg.ui_theme"
                                    :sectors="marketSectors" :chokepoints="geoData.chokepoints" :custom-widgets="customWidgets"
                                    :watchlist="marketOverview.watchlist"
                                    :overview="marketOverview" :macro="macroData" :geo="geoData"
                                    :movers="marketMovers" :news-status="newsStatus" :news-items="newsItems"
                                    @save-library="onSaveVisualToLibrary"
                                    @pin-dashboard="onPinVisualToDashboard"
                                    @create-topic-board="onCreateTopicBoard"
                                    @pick-symbol="openMarketDetail"
                                    @toggle-watchlist="toggleWatchlistSymbol" />
                </div>
                <div v-if="m.ask && m.ask.questions && m.ask.questions.length" class="ask-card">
                  <div class="ask-card-head">
                    <span>{{ m.ask.intent === 'recommend' ? '推荐' : '请补充关键条件' }}</span>
                    <span v-if="m.ask.questions.length > 1" class="ask-step">{{ (m.ask.step || 0) + 1 }} / {{ m.ask.questions.length }}</span>
                  </div>
                  <div v-for="q in askCurrentQs(m)" :key="q.id" class="ask-q">
                    <div class="ask-q-prompt">{{ q.prompt }}</div>
                    <div class="ask-opts">
                      <button type="button" v-for="o in q.options" :key="o.id"
                              :class="['ask-opt', askPicked(m, q, o.id) ? 'on' : '']"
                              :disabled="m.ask.submitted"
                              @click="toggleAskOpt(m, q, o)">
                        <span>{{ o.label }}</span>
                        <span v-if="o.recommended" class="ask-rec">建议</span>
                      </button>
                      <button type="button" v-if="q.allow_other !== false"
                              :class="['ask-opt', askOtherOn(m, q) ? 'on' : '']"
                              :disabled="m.ask.submitted"
                              @click="pickAskOther(m, q)">其他</button>
                    </div>
                    <a-input v-if="askOtherOn(m, q)"
                             v-model:value="m.ask.otherText[q.id]"
                             size="large"
                             placeholder="请输入具体情况"
                             :disabled="m.ask.submitted"
                             @pressEnter="nextAsk(m)" />
                  </div>
                  <div v-if="!m.ask.submitted" class="ask-nav">
                    <a-button v-if="m.ask.questions.length > 1" :disabled="!(m.ask.step > 0)" @click="prevAsk(m)">上一题</a-button>
                    <a-button type="primary" :disabled="!askStepDone(m) || asking" @click="nextAsk(m)">{{ askLastStep(m) ? '提交' : '下一题' }}</a-button>
                  </div>
                  <div v-else class="hint ask-done">已提交</div>
                </div>
                <div v-if="displaySources(m).length" class="srcs">
                  <div class="srcs-head" role="button" tabindex="0" :aria-expanded="!!m.showSrc"
                       @click="toggleSrc(m)" @keydown.enter.prevent="toggleSrc(m)">
                    依据 {{ displaySources(m).length }} 条
                    <span class="hint">{{ m.showSrc ? '收起' : '展开' }}</span>
                  </div>
                  <div v-if="m.showSrc">
                    <div v-for="s in displaySources(m)" :key="s.n" class="src" role="button" tabindex="0"
                         @click="openDoc(s.doc_id, s.chunk_id)" @keydown.enter.prevent="openDoc(s.doc_id, s.chunk_id)">
                      <span class="src-n">〔{{ s.n }}〕</span>
                      <span class="src-head">
                        <b>{{ s.title }}</b>
                        <span v-if="s.doc_no" class="docno"> {{ s.doc_no }}</span>
                        <span v-if="s.article" class="loc"> {{ s.article }}</span>
                        <span v-if="s.page" class="loc"> · 第 {{ s.page }} 页</span>
                      </span>
                      <div class="src-text">{{ s.text }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>

          <div class="composer">
            <div class="composer-box" :class="{ over: attachOver }"
                 @dragenter.prevent="onAttachEnter"
                 @dragover.prevent="onAttachEnter"
                 @dragleave.prevent="onAttachLeave"
                 @drop.prevent="onAttachDrop"
                 @paste="onAttachPaste">
              <div v-if="currentQueued.length" class="queued-bar">
                <span>排队中 {{ currentQueued.length }}：</span>
                <span v-for="(qf, idx) in currentQueued" :key="qf.id" class="queued-pill" :title="qf.text">
                  <span class="queued-pill-text">{{ qf.text || '附件引用' }}</span>
                  <button type="button" title="移除" aria-label="移除排队项" @click="removeQueuedFollowup(idx)">×</button>
                </span>
              </div>
              <div v-if="citedNews.length" class="cited-news-bar">
                <div v-for="cn in citedNews" :key="cn.id" class="cited-news-chip" :title="cn.title_zh || cn.title_orig">
                  <span :class="['news-lang-badge', cn.lang]">{{ cn.lang }}</span>
                  <span class="cited-news-chip-title">{{ cn.title_zh || cn.title_orig }}</span>
                  <button type="button" aria-label="移除引用" @click="removeCitedNews(cn.id)">×</button>
                </div>
              </div>
              <div v-if="attachments.length" class="attach-row">
                <div v-for="a in attachments" :key="a.id" :class="['attach-chip', a.state]" :title="a.error || a.name">
                  <span class="attach-name">{{ a.name }}</span>
                  <span v-if="a.state === 'parsing'" class="attach-pct">{{ a.percent || 0 }}%</span>
                  <button type="button" class="attach-x" aria-label="移除附件" @click="removeAttach(a.id)">×</button>
                </div>
              </div>
              <a-textarea ref="askInputEl" v-model:value="question" :auto-size="{ minRows: 3, maxRows: 6 }"
                placeholder="输入问题，Enter 发送，可直接粘贴文件"
                @keydown="onAskKeydown" />
              <div class="composer-bar">
                <a-tooltip title="添加附件">
                  <button type="button" class="attach-btn" aria-label="添加附件" :disabled="asking" @click="pickAttach">
                    <span class="icon-svg" v-html="ICO.plus"></span>
                  </button>
                </a-tooltip>
                <a-tooltip :title="askBrowserBtnTooltip">
                  <button type="button"
                          aria-label="协同浏览器"
                          :class="[
                            'attach-btn',
                            'bw-toggle-btn',
                            askBrowserOpen ? 'on' : '',
                            browserState.coPanel.waitingHuman ? 'waiting-human' : (browserState.coPanel.aiActive ? 'ai-busy' : '')
                          ]"
                          @click="toggleAskBrowserByUser">
                    <span class="icon-svg" v-html="ICO.globe"></span>
                  </button>
                </a-tooltip>
                <a-tooltip v-if="cfg.news_enabled" title="快讯引用">
                  <button type="button" aria-label="快讯引用" :class="['attach-btn', askNewsOpen ? 'on' : '']" @click="toggleAskNews">
                    <span class="icon-svg" v-html="ICO.rss"></span>
                  </button>
                </a-tooltip>
                <input ref="attachInput" class="attach-input" type="file" multiple
                       accept=".xlsx,.csv,.pdf,.doc,.docx,.md,.markdown,.json,.txt,.jpg,.jpeg,.png,.tif,.tiff,.svg,.webp,.heif,.heic" @change="onAttachPicked" />
                <span class="spacer"></span>
                <div class="model-wrap" ref="modelWrap">
                  <button type="button" class="model-pill" :class="{ busy: asking }" aria-haspopup="true" :aria-expanded="menuOpen" @click.stop="toggleModelMenu">
                    <span v-if="channelLabel" class="model-pill-chan">{{ channelLabel }}</span>
                    <span v-if="channelLabel" class="model-pill-sep"></span>
                    <span class="model-pill-text" :data-label="modelLabel">{{ modelLabel }}</span>
                    <span class="model-caret" v-html="ICO.caret"></span>
                  </button>
                  <div v-if="menuOpen" class="model-pop" @click.stop>
                    <button v-if="effortOptions.length" type="button"
                            :class="['mp-row', menuPanel === 'effort' ? 'on' : '']"
                            @click="openPanel('effort')">
                      <span>思考深度</span>
                      <span class="mp-val">{{ effortLabel }}<span class="mp-chev" v-html="ICO.chevron"></span></span>
                    </button>
                    <button v-if="contextLabel" type="button"
                            :class="['mp-row', menuPanel === 'context' ? 'on' : '']"
                            @click="contextOptions.length > 1 && openPanel('context')">
                      <span>上下文</span>
                      <span class="mp-val">
                        {{ contextLabel }}
                        <span v-if="contextOptions.length > 1" class="mp-chev" v-html="ICO.chevron"></span>
                      </span>
                    </button>
                    <div class="mp-hr" v-if="effortOptions.length || contextLabel"></div>
                    <button type="button" :class="['mp-row', menuPanel === 'model' ? 'on' : '']"
                            @click="openPanel('model')">
                      <span>模型</span>
                      <span class="mp-val">
                        <span class="mp-val-text">{{ modelLabel }}</span>
                        <span class="mp-chev" v-html="ICO.chevron"></span>
                      </span>
                    </button>
                    <div v-if="menuPanel === 'effort'" class="model-sub">
                      <button type="button" v-for="e in effortOptions" :key="e.id"
                              :class="['mp-item', cfg.effort === e.id ? 'picked' : '']"
                              @click="setEffort(e.id)">
                        <span>{{ e.label }}</span>
                        <span v-if="cfg.effort === e.id" class="mp-check" v-html="ICO.check"></span>
                      </button>
                    </div>
                    <div v-if="menuPanel === 'context' && contextOptions.length > 1" class="model-sub">
                      <button type="button" v-for="c in contextOptions" :key="c.id"
                              :class="['mp-item', cfg.context === c.id ? 'picked' : '']"
                              @click="setContext(c.id)">
                        <span>{{ c.label }}</span>
                        <span v-if="cfg.context === c.id" class="mp-check" v-html="ICO.check"></span>
                      </button>
                    </div>
                    <div v-if="menuPanel === 'model'" class="model-sub model-sub-wide">
                      <div class="mp-search">
                        <span class="mp-search-ico" v-html="ICO.search"></span>
                        <input v-model="modelQuery" placeholder="搜索模型" />
                      </div>
                      <div class="model-sub-scroll">
                        <template v-for="g in groupedModels" :key="g.id">
                          <div class="mp-group">{{ g.name }}</div>
                          <button type="button" v-for="m in g.models" :key="g.id + ':' + m.id"
                                  :class="['mp-item', cfg.provider_id === g.id && cfg.model === m.id ? 'picked' : '']"
                                  @click="setChatModel(g.id, m.id)">
                            <span>{{ m.label }}</span>
                            <span v-if="cfg.provider_id === g.id && cfg.model === m.id" class="mp-check" v-html="ICO.check"></span>
                          </button>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
                <a-tooltip title="清空对话">
                  <a-button type="text" class="icon-btn" aria-label="清空对话" :disabled="asking" @click="clearChat">
                    <template #icon><span class="icon-svg" v-html="ICO.trash"></span></template>
                  </a-button>
                </a-tooltip>
                <a-tooltip :title="asking ? '停止' : '发送'">
                  <a-button type="primary" class="icon-btn send-btn" :aria-label="asking ? '停止生成' : '发送消息'" @click="asking ? stopAsk() : send()">
                    <template #icon>
                      <span class="icon-svg" v-html="asking ? ICO.stop : ICO.send"></span>
                    </template>
                  </a-button>
                </a-tooltip>
              </div>
            </div>
          </div>
      </div>

      <template v-if="tab === 'browser'">
        <div class="bw-shell">
          <div class="bw-tabs">
            <div v-for="bt in browserState.tabs" :key="bt.id"
                 :class="['bw-tab', bt.id === browserState.activeTabId ? 'on' : '']"
                 :title="bt.title || bt.url"
                 @click="switchBrowserTab(bt.id)">
              <span v-if="bt.loading" class="bw-spin"></span>
              <img v-else-if="bt.favicon" :src="bt.favicon" class="bw-fav" @error="bt.favicon = ''" alt="" />
              <span v-else class="bw-tab-ico" v-html="ICO.globe"></span>
              <span class="bw-tab-title">{{ bt.title || '新标签页' }}</span>
              <button type="button" class="bw-tab-x" title="关闭标签页" aria-label="关闭标签页"
                      @click.stop="closeBrowserTab(bt.id)" v-html="ICO.close"></button>
            </div>
            <button type="button" class="bw-new" title="新建标签页" aria-label="新建标签页"
                    @click="newBrowserTab()" v-html="ICO.plus"></button>
          </div>
          <div class="bw-bar">
            <button type="button" class="bw-btn" title="后退" aria-label="后退"
                    :disabled="!activeBrowserTab || !activeBrowserTab.canGoBack"
                    @click="browserBack" v-html="ICO.left"></button>
            <button type="button" class="bw-btn" title="前进" aria-label="前进"
                    :disabled="!activeBrowserTab || !activeBrowserTab.canGoForward"
                    @click="browserForward" v-html="ICO.send"></button>
            <button type="button" class="bw-btn"
                    :title="activeBrowserTab && activeBrowserTab.loading ? '停止加载' : '刷新'"
                    :aria-label="activeBrowserTab && activeBrowserTab.loading ? '停止加载' : '刷新'"
                    @click="browserReloadOrStop"
                    v-html="activeBrowserTab && activeBrowserTab.loading ? ICO.close : ICO.reload"></button>
            <input class="bw-url"
                   v-model="browserUrlInput"
                   aria-label="网址或搜索词"
                   placeholder="输入网址或搜索词，按 Enter 访问"
                   @focus="onBrowserUrlFocus($event)"
                   @blur="onBrowserUrlBlur"
                   @keydown.enter.prevent="submitBrowserUrl" />
            <button v-if="hasNativeBrowser" type="button" class="bw-btn" title="开发者工具" aria-label="开发者工具"
                    @click="browserDevTools" v-html="ICO.code"></button>
          </div>
          <div class="bw-stage" ref="browserStage">
            <img v-if="hasNativeBrowser && (browserOccluded || askBwTransitioning) && browserPreviewUrl"
                 :src="browserPreviewUrl" class="bw-freeze" alt="" />
            <div v-else-if="!hasNativeBrowser" class="bw-fallback">
              <div class="bw-fallback-card">
                <h3>在桌面窗口中使用内置浏览器</h3>
                <p>通过桌面端启动窗口后，此区域将挂载原生浏览器视图，保持登录状态并支持同屏协同操作。</p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 终端看板 -->
      <template v-if="tab === 'dashboard'">
        <div class="dash-shell">
          <!-- Row 1: 单行极简指令带（可横滑工作区 Tab · 双击重命名 · 悬浮删除 · 零滑钮） -->
          <div class="ft-cmdbar">
            <span class="ft-brand-pill">
              <span>O2</span>
            </span>
            <symbol-picker
              mode="add"
              :watchlist="marketOverview.watchlist"
              compact
              width="148px"
              placeholder="搜股票/加自选…"
              @pick="onDashboardQuickPickSymbol"
              @toggle-watchlist="toggleWatchlistSymbol"
            />
            <span class="ft-sep"></span>
            <div class="ws-tab-strip" role="tablist" aria-label="看板工作区">
              <div v-for="ws in (dashboardLayout.workspaces || [])" :key="ws.id"
                   role="tab" tabindex="0" :aria-selected="dashboardLayout.activeWorkspace === ws.id"
                   :class="['ws-tab', dashboardLayout.activeWorkspace === ws.id ? 'on' : '']"
                   title="双击重命名"
                   @click="switchDashboardWorkspace(ws.id)"
                   @keydown.enter.prevent="switchDashboardWorkspace(ws.id)">
                <input v-if="editingWsKey === 'dash:' + ws.id"
                       v-model="editingWsName"
                       class="ws-tab-input"
                       aria-label="重命名工作区"
                       @click.stop
                       @keydown.enter.prevent="commitWsRename('dash', ws)"
                       @keydown.esc.prevent="cancelWsRename()"
                       @blur="commitWsRename('dash', ws)" />
                <span v-else class="ws-tab-lbl" @dblclick.stop="startWsRename('dash', ws)">{{ ws.name }}</span>
                <button v-if="(dashboardLayout.workspaces || []).length > 1 && editingWsKey !== 'dash:' + ws.id"
                        type="button" class="ws-tab-del" title="删除工作区" aria-label="删除工作区"
                        @click.stop="deleteDashboardWorkspaceById(ws.id)">×</button>
              </div>
              <button type="button" class="ft-icon-btn" style="width:24px;height:24px" title="新建工作区" aria-label="新建工作区"
                      @click="createDashboardWorkspace()" v-html="ICO.plus"></button>
            </div>
            <span class="ft-sep"></span>
            <div class="ft-tools-group">
              <button type="button" class="ft-badge-mini primary" title="打开模块库 / 自定义模块" aria-label="打开模块库"
                      @click="openWidgetGallery('dashboard')">
                <span v-html="ICO.plus" style="display:inline-flex"></span>
                <span>模块库</span>
              </button>
              <button type="button"
                      :class="['ft-badge-mini', !dashboardLayout.locked ? 'warn' : '']"
                      :aria-pressed="!dashboardLayout.locked"
                      :title="dashboardLayout.locked ? '解锁编辑布局' : '完成并锁定布局'"
                      @click="toggleDashboardLock()">
                <span v-html="dashboardLayout.locked ? ICO.lock : ICO.unlock" style="display:inline-flex"></span>
                <span>{{ dashboardLayout.locked ? '编辑' : '完成' }}</span>
              </button>
              <button type="button" :class="['ft-icon-btn', dashCompact ? 'on' : '']"
                      :aria-pressed="dashCompact" title="紧凑间距" aria-label="切换紧凑间距"
                      @click="dashCompact = !dashCompact" v-html="ICO.compact"></button>
              <button type="button" :class="['ft-icon-btn', dashPulseOpen ? 'on' : '']"
                      :aria-pressed="dashPulseOpen" title="态势侧栏" aria-label="切换态势侧栏"
                      @click="dashPulseOpen = !dashPulseOpen" v-html="ICO.panelRight"></button>
              <span class="ft-sep"></span>
              <button type="button" :class="['ft-icon-btn', (newsFetching || marketLoading) ? 'on' : '']"
                      title="刷新数据" aria-label="刷新数据" @click="refreshDashboardAll()" v-html="ICO.reload"></button>
              <button type="button" class="ft-icon-btn" title="布局管理" aria-label="布局管理"
                      @click="dashCustomizeOpen = true" v-html="ICO.layers"></button>
              <button type="button" class="ft-icon-btn"
                      :title="cfg.ui_theme === 'dark' ? '浅色外观' : '深色外观'" aria-label="切换外观"
                      @click="toggleTheme" v-html="cfg.ui_theme === 'dark' ? ICO.sun : ICO.moon"></button>
            </div>
          </div>

          <!-- Row 2: 行情 / 快讯 实时滚动带 -->
          <div class="ft-ticker">
            <div class="news-lang-pills" style="padding:1px 2px">
              <button type="button" :class="['news-pill-btn', dashTickerMode === 'mkt' ? 'on' : '']"
                      style="padding:1px 7px;font-size:10px" @click="dashTickerMode = 'mkt'">行情</button>
              <button type="button" :class="['news-pill-btn', dashTickerMode === 'wire' ? 'on' : '']"
                      style="padding:1px 7px;font-size:10px" @click="dashTickerMode = 'wire'">快讯</button>
            </div>
            <div class="dash-ticker-track">
              <template v-if="dashTickerMode === 'mkt'">
                <span v-for="tk in (marketOverview.ribbon || [])" :key="'mtk-' + tk.secid"
                      class="dash-ticker-item ft-mono" @click="openMarketDetail(tk)">
                  <span style="font-weight:700">{{ tk.symbol }}</span>
                  <span>{{ fmtPrice(tk.price) }}</span>
                  <span :style="{ color: (tk.pct || 0) > 0 ? 'var(--up)' : ((tk.pct || 0) < 0 ? 'var(--down)' : 'var(--muted-foreground)') }">
                    {{ fmtPct(tk.pct) }}
                  </span>
                </span>
              </template>
              <template v-else>
                <span v-for="tk in newsItems.slice(0, 8)" :key="'tk-' + tk.id"
                      class="dash-ticker-item" @click="tab = 'news'; selectNewsItem(tk)">
                  <span :class="['news-lang-badge', tk.lang]">{{ tk.lang }}</span>
                  <span class="ft-mono hint">{{ formatNewsTime(tk.published_at) }}</span>
                  <span>{{ (tk.title_zh || tk.title_orig).slice(0, 44) }}</span>
                </span>
              </template>
            </div>
            <span v-if="newsFetching || marketLoading || newsStatus.translating || newsStatus.embedding" class="ft-sync-pill" aria-live="polite">
              <span class="ft-sync-dot"></span>同步中
            </span>
          </div>

          <!-- 主体：24列自由拖拽 & 无级缩放工作台 + 分栏拖拽条 + 右侧可折叠态势栏 -->
          <div class="ft-dash-body">
            <div class="ft-dash-main" :class="{ compact: dashCompact }">
              <free-grid
                :items="activeDashboardWidgets"
                :cols="24"
                :row-height="dashCompact ? 22 : 26"
                :gap="dashCompact ? 4 : 6"
                :locked="!!dashboardLayout.locked"
                v-model:maximized-id="dashMaximizedId"
                @layout-commit="saveDashboardLayoutDebounced"
              >
                <template #item="{ widget: w, isMaximized, toggleMaximize, startDrag }">
                  <div class="ft-panel-head"
                       :title="dashboardLayout.locked ? '双击放大' : '拖动调整位置，双击放大'"
                       @pointerdown="startDrag($event)"
                       @dblclick="toggleMaximize()">
                    <div class="ft-panel-title">
                      <span class="ft-badge-sq">{{ (widgetMeta(w.type) && widgetMeta(w.type).badge) || 'W' }}</span>
                      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ w.title }}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:3px;flex:none" @dblclick.stop>
                      <template v-if="w.type === 'watchlist_slot'">
                        <div class="wl-head-extra" style="display:inline-flex;gap:2px;margin-right:2px">
                          <button v-for="iv in ['1d','1w','1M']" :key="'wiv-' + w.id + '-' + iv" type="button"
                                  :class="['ft-btn', getDashWlInterval(w) === iv ? 'on' : '']"
                                  style="height:18px;padding:0 5px;font-size:10px"
                                  @click.stop="setDashWlInterval(w, iv)">{{ iv.toUpperCase() }}</button>
                        </div>
                        <button type="button" class="ft-ico-btn" title="AI 研判" aria-label="AI 研判" @click.stop="askAiAboutSymbol(getDashKlineData(w) || getDashWlSelected(w))" v-html="ICO.robot"></button>
                        <button type="button" class="ft-ico-btn wl-head-extra" title="打开行情" aria-label="打开行情" @click.stop="tab = 'markets'" v-html="ICO.chart"></button>
                        <button type="button"
                                :class="['ft-ico-btn', panelRefreshing['wl_' + w.id] ? 'is-spinning' : (panelJustRefreshed['wl_' + w.id] ? 'is-done' : '')]"
                                :disabled="!!panelRefreshing['wl_' + w.id]"
                                :title="panelRefreshing['wl_' + w.id] ? '正在刷新…' : ('刷新自选与K线' + (panelRefreshedAt['wl_' + w.id] ? '（上次 ' + panelRefreshedAt['wl_' + w.id] + '）' : ''))"
                                aria-label="刷新"
                                @click.stop="refreshPanel('wl_' + w.id, () => Promise.all([loadMarketOverview(true), loadDashKlineFor(w, true)]), { successText: '自选与 K 线已刷新' })"
                                v-html="panelJustRefreshed['wl_' + w.id] ? ICO.check : ICO.reload"></button>
                      </template>
                      <template v-else-if="w.type === 'sector_heatmap'">
                        <button type="button" class="ft-ico-btn" title="热力图工作区" aria-label="热力图工作区" @click.stop="switchMarketWorkspace('mkt_heatmap'); tab = 'markets'" v-html="ICO.heatmap"></button>
                        <button type="button"
                                :class="['ft-ico-btn', panelRefreshing.sector_heatmap ? 'is-spinning' : (panelJustRefreshed.sector_heatmap ? 'is-done' : '')]"
                                :disabled="!!panelRefreshing.sector_heatmap"
                                :title="panelRefreshing.sector_heatmap ? '正在刷新…' : ('刷新板块' + (panelRefreshedAt.sector_heatmap ? '（上次 ' + panelRefreshedAt.sector_heatmap + '）' : ''))"
                                aria-label="刷新板块"
                                @click.stop="refreshPanel('sector_heatmap', () => loadMarketSectors(true), { successText: '板块热力图已刷新' })"
                                v-html="panelJustRefreshed.sector_heatmap ? ICO.check : ICO.reload"></button>
                      </template>
                      <template v-else-if="w.type === 'macro_curve'">
                        <button type="button" class="ft-ico-btn" title="AI 研判" aria-label="AI 宏观研判" @click.stop="askAiMacro()" v-html="ICO.robot"></button>
                        <button type="button"
                                :class="['ft-ico-btn', panelRefreshing.macro_curve ? 'is-spinning' : (panelJustRefreshed.macro_curve ? 'is-done' : '')]"
                                :disabled="!!panelRefreshing.macro_curve"
                                :title="panelRefreshing.macro_curve ? '正在刷新…' : ('刷新宏观' + (panelRefreshedAt.macro_curve ? '（上次 ' + panelRefreshedAt.macro_curve + '）' : ''))"
                                aria-label="刷新宏观"
                                @click.stop="refreshPanel('macro_curve', () => loadMacroData(true), { successText: '宏观利率与汇率已刷新' })"
                                v-html="panelJustRefreshed.macro_curve ? ICO.check : ICO.reload"></button>
                      </template>
                      <template v-else-if="w.type === 'geo_odds'">
                        <button type="button" class="ft-ico-btn" title="AI 研判" aria-label="AI 地缘研判" @click.stop="askAiGeo()" v-html="ICO.robot"></button>
                        <button type="button"
                                :class="['ft-ico-btn', panelRefreshing.geo_odds ? 'is-spinning' : (panelJustRefreshed.geo_odds ? 'is-done' : '')]"
                                :disabled="!!panelRefreshing.geo_odds"
                                :title="panelRefreshing.geo_odds ? '正在刷新…' : ('刷新地缘' + (panelRefreshedAt.geo_odds ? '（上次 ' + panelRefreshedAt.geo_odds + '）' : ''))"
                                aria-label="刷新地缘"
                                @click.stop="refreshPanel('geo_odds', () => loadGeoData(true), { successText: '地缘预期概率已刷新' })"
                                v-html="panelJustRefreshed.geo_odds ? ICO.check : ICO.reload"></button>
                      </template>
                      <template v-else-if="w.type === 'desk_note'">
                        <button type="button" class="ft-ico-btn" title="AI 深度追问简报" aria-label="AI 深度追问"
                                @click.stop="onAskAiFromWidget('请基于最新 24 小时全球情报简报，提炼今日最核心的 3 条交易主线与潜在黑天鹅风控点')" v-html="ICO.robot"></button>
                        <button type="button"
                                :class="['ft-ico-btn', newsBriefLoading ? 'is-spinning' : '']"
                                :disabled="newsBriefLoading"
                                title="重新生成" aria-label="重新生成简报"
                                @click.stop="loadNewsBrief(true)" v-html="ICO.reload"></button>
                      </template>
                      <template v-else-if="w.type === 'entity_pulse'">
                        <span v-if="panelRefreshing.entity_pulse" class="ft-panel-status is-spinning">刷新中…</span>
                        <span v-else-if="panelJustRefreshed.entity_pulse" class="ft-panel-status is-done">已更新</span>
                        <span v-else-if="panelRefreshedAt.entity_pulse" class="ft-panel-status ft-mono"
                              :title="'上次刷新时间 ' + panelRefreshedAt.entity_pulse">{{ panelRefreshedAt.entity_pulse }}</span>
                        <button type="button"
                                :class="['ft-ico-btn', panelRefreshing.entity_pulse ? 'is-spinning' : (panelJustRefreshed.entity_pulse ? 'is-done' : '')]"
                                :disabled="!!panelRefreshing.entity_pulse"
                                :title="panelRefreshing.entity_pulse ? '正在刷新实体网络…' : ('刷新实体网络' + (panelRefreshedAt.entity_pulse ? '（上次 ' + panelRefreshedAt.entity_pulse + '）' : ''))"
                                aria-label="刷新实体"
                                @click.stop="refreshEntityPulse()"
                                v-html="panelJustRefreshed.entity_pulse ? ICO.check : ICO.reload"></button>
                      </template>
                      <button v-else-if="w.type === 'live_wire'" type="button" class="ft-ico-btn" title="打开新闻流" aria-label="打开新闻流" @click.stop="tab = 'news'" v-html="ICO.external"></button>
                      <button v-else-if="w.type === 'connector_hub'" type="button" class="ft-ico-btn" title="连接器设置" aria-label="连接器设置" @click.stop="jumpToConnectorSettings('')" v-html="ICO.settings"></button>
                      <button v-if="w.type !== 'connector_hub'" type="button" class="ft-ico-btn" title="自定义模块与叠层" aria-label="自定义模块与叠层"
                              @click.stop="openWidgetConfig('dashboard', w)" v-html="ICO.settings"></button>
                      <button type="button" class="ft-ico-btn" :title="isMaximized ? '还原' : '放大'" :aria-label="isMaximized ? '还原' : '放大'"
                              @click.stop="toggleMaximize()" v-html="isMaximized ? ICO.minimize : ICO.maximize"></button>
                      <button v-if="!dashboardLayout.locked" type="button" class="ft-ico-btn danger" title="移除模块" aria-label="移除模块"
                              @click.stop="removeDashboardWidget(w.id)" v-html="ICO.close"></button>
                    </div>
                  </div>

                  <!-- Watchlist + Live K-Line with News Markers (支持卡内搜股/置顶/移出 & 单卡独立叠层与预警线) -->
                  <div v-if="w.type === 'watchlist_slot'" class="ft-panel-body" style="padding:6px 8px;overflow:hidden">
                    <div class="wl-split">
                      <div class="wl-list" :style="{ width: dashWatchlistWidth + 'px' }">
                        <div class="wl-search-bar">
                          <symbol-picker
                            mode="add"
                            :watchlist="marketOverview.watchlist"
                            compact
                            placeholder="+ 搜股票加自选…"
                            @pick="(it) => addSymbolToWatchlistAndPick(it, w)"
                            @toggle-watchlist="toggleWatchlistSymbol"
                          />
                        </div>
                        <div v-for="item in (marketOverview.watchlist || [])" :key="'dwl-' + w.id + '-' + item.secid"
                             :class="['wl-row', getDashWlSelected(w) && getDashWlSelected(w).secid === item.secid ? 'on' : '']"
                             @click="selectDashWatchItemFor(w, item)">
                          <div style="min-width:0;overflow:hidden">
                            <div style="font-weight:600;color:var(--foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ item.name }}</div>
                            <div class="ft-mono hint" style="font-size:10px">{{ item.symbol }}</div>
                          </div>
                          <span class="ft-mono" style="font-weight:600;white-space:nowrap">{{ fmtPrice(item.price) }}</span>
                          <span class="ft-mono" style="white-space:nowrap" :style="{ fontWeight: 600, color: (item.pct || 0) > 0 ? 'var(--up)' : ((item.pct || 0) < 0 ? 'var(--down)' : 'var(--muted-foreground)') }">
                            {{ fmtPct(item.pct) }}
                          </span>
                          <span class="wl-row-acts">
                            <button type="button" class="wl-pin-btn" title="置顶" aria-label="置顶"
                                    @click.stop="pinWatchlistSymbol(item)">↑</button>
                            <button type="button" class="wl-del-btn" title="移出自选" aria-label="移出自选"
                                    @click.stop="toggleWatchlistSymbol(item)">×</button>
                          </span>
                        </div>
                      </div>
                      <split-resizer direction="v" v-model="dashWatchlistWidth" :min="145" :max="380" @commit="saveDashboardLayoutDebounced" />
                      <div class="wl-chart-col">
                        <div class="wl-chart-head">
                          <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ (getDashKlineData(w) && getDashKlineData(w).name) || (getDashWlSelected(w) && getDashWlSelected(w).name) || '-' }}</b>
                          <span class="ft-mono hint">{{ (getDashWlSelected(w) && getDashWlSelected(w).symbol) || '' }}</span>
                          <span v-if="getDashKlineData(w) && getDashKlineData(w).price != null" class="ft-mono" style="font-weight:700">
                            {{ fmtPrice(getDashKlineData(w).price) }}
                            <span :style="{ color: (getDashKlineData(w).pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">{{ fmtPct(getDashKlineData(w).pct) }}</span>
                          </span>
                          <span class="spacer"></span>
                          <div style="display:inline-flex;align-items:center;gap:3px">
                            <button type="button" :class="['ft-chip', (w.config && w.config.showMa !== false) ? 'on' : '']" title="均线" @click="onUpdateWidgetConfig('dashboard', w.id, { showMa: w.config && w.config.showMa === false })">均线</button>
                            <button type="button" :class="['ft-chip', (w.config && w.config.showBoll) ? 'on' : '']" title="布林带" @click="onUpdateWidgetConfig('dashboard', w.id, { showBoll: !(w.config && w.config.showBoll) })">BOLL</button>
                            <button type="button" :class="['ft-chip', (w.config && w.config.showVol !== false) ? 'on' : '']" title="成交量" @click="onUpdateWidgetConfig('dashboard', w.id, { showVol: w.config && w.config.showVol === false })">量能</button>
                            <button type="button" :class="['ft-chip', (w.config && w.config.showMarkers !== false) ? 'on' : '']" title="快讯事件打点" @click="onUpdateWidgetConfig('dashboard', w.id, { showMarkers: w.config && w.config.showMarkers === false })">事件</button>
                          </div>
                        </div>
                        <div style="flex:1;min-height:0;position:relative">
                          <kline-chart :data="getDashKlineData(w)" :theme="cfg.ui_theme"
                                       :show-ma="!(w.config && w.config.showMa === false)"
                                       :show-boll="!!(w.config && w.config.showBoll)"
                                       :show-vol="!(w.config && w.config.showVol === false)"
                                       :show-markers="!(w.config && w.config.showMarkers === false)"
                                       :redlines="(w.config && w.config.redlines) || []"
                                       @pick-marker="onPickKlineNewsMarker" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Sector Heatmap -->
                  <div v-else-if="w.type === 'sector_heatmap'" class="ft-panel-body" style="padding:4px 6px;gap:4px;overflow:hidden">
                    <div v-if="marketSectors.length" style="display:flex;align-items:center;gap:8px;font-size:10.5px;flex:none;padding:0 2px">
                      <span class="ft-mono" style="color:var(--up);font-weight:700">涨 {{ marketSectors.filter(s => (s.pct || 0) > 0).length }}</span>
                      <span class="ft-mono" style="color:var(--down);font-weight:700">跌 {{ marketSectors.filter(s => (s.pct || 0) < 0).length }}</span>
                      <span class="hint ft-mono" style="margin-left:auto">
                        均幅 {{ ((marketSectors.reduce((a, b) => a + (Number(b.pct) || 0), 0) / marketSectors.length)).toFixed(2) }}%
                      </span>
                    </div>
                    <div v-if="marketSectors.length" style="flex:1;min-height:0;display:flex;position:relative">
                      <sector-treemap :items="marketSectors" :theme="cfg.ui_theme" height="100%" @pick="onPickSector" />
                    </div>
                    <div v-else class="hint" style="padding:18px;text-align:center">加载板块中…</div>
                  </div>

                  <!-- Macro Yields & FX Matrix -->
                  <div v-else-if="w.type === 'macro_curve'" class="ft-panel-body" style="padding:4px 8px;overflow-y:auto">
                    <div v-if="macroSpreadSummary" style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex:none;font-size:10.5px">
                      <span class="ft-mono">
                        <span class="hint">10Y-2Y: </span>
                        <b :style="{ color: macroSpreadSummary.s10_2 < 0 ? 'var(--down)' : 'var(--up)' }">{{ macroSpreadSummary.s10_2 >= 0 ? '+' : '' }}{{ macroSpreadSummary.s10_2 }}bp</b>
                      </span>
                      <span :class="['div-tag', macroSpreadSummary.s10_2 < 0 ? 'high' : (macroSpreadSummary.s10_2 < 25 ? 'warn' : 'ok')]">
                        {{ macroSpreadSummary.s10_2 < 0 ? '曲线倒挂' : (macroSpreadSummary.s10_2 < 25 ? '平坦' : '正常陡峭') }}
                      </span>
                    </div>
                    <div v-if="macroData.treasury && macroData.treasury.rates && macroData.treasury.rates.length"
                         style="flex:1 1 110px;min-height:96px;display:flex;position:relative">
                      <yield-chart :rates="macroData.treasury.rates" :theme="cfg.ui_theme" height="100%" />
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:4px;flex:none">
                      <div v-for="fx in macroFxGrid" :key="fx.pair"
                           style="padding:4px 6px;border:1px solid var(--border);border-radius:3px;background:var(--background);min-width:0">
                        <div class="ft-mono hint" style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="fx.pair">{{ fx.pair }}</div>
                        <div class="ft-mono" style="font-size:12px;font-weight:700;color:var(--foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ fx.val }}</div>
                      </div>
                    </div>
                  </div>

                  <!-- Geopolitics Polymarket + PortWatch -->
                  <div v-else-if="w.type === 'geo_odds'" class="ft-panel-body" style="padding:4px 8px;gap:5px">
                    <div style="display:flex;align-items:center;gap:4px;flex:none;padding-bottom:3px;border-bottom:1px solid var(--border)">
                      <button v-for="tg in [{id:'all',l:'全'},{id:'geopolitics',l:'地缘'},{id:'economy',l:'宏观'}]" :key="tg.id"
                              type="button" :class="['ft-chip', ((w.config && w.config.tag) || 'all') === tg.id ? 'on' : '']"
                              @click="onUpdateWidgetConfig('dashboard', w.id, { tag: tg.id })">{{ tg.l }}</button>
                      <span class="hint ft-mono" style="margin-left:auto;font-size:10px">Polymarket</span>
                    </div>
                    <div style="flex:1;min-height:0;overflow-y:auto">
                      <div v-for="ev in (geoData.events || []).filter(e => !w.config || !w.config.tag || w.config.tag === 'all' || e.tag === w.config.tag).slice(0, (w.config && Number(w.config.limit)) || 12)" :key="ev.id"
                           style="display:flex;flex-direction:column;gap:3px;padding:4px 0;border-bottom:1px solid var(--border);cursor:pointer"
                           @click="openNewsInBrowser(ev.url)">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11.5px">
                          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--foreground)" :title="ev.title">{{ ev.title }}</span>
                          <span class="ft-mono" style="font-weight:700;flex:none"
                                :style="{ color: (ev.yes_pct || 0) >= 70 ? 'var(--down)' : ((ev.yes_pct || 0) >= 40 ? 'var(--warn)' : 'var(--primary)') }">
                            {{ ev.yes_pct != null ? (ev.yes_pct + '%') : '-' }}
                          </span>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px">
                          <div style="flex:1;height:4px;background:var(--muted);border-radius:2px;overflow:hidden">
                            <div :style="{ width: Math.min(100, ev.yes_pct || 0) + '%', height: '100%', background: (ev.yes_pct || 0) >= 70 ? '#ef4444' : ((ev.yes_pct || 0) >= 40 ? '#f59e0b' : 'var(--primary)') }"></div>
                          </div>
                          <span class="ft-mono hint" style="font-size:10px">\${{ fmtCompact(ev.volume24h) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Panel A: 核心数据源与市场连接器紧凑表 -->
                  <div v-else-if="w.type === 'connector_hub'" class="ft-panel-body" style="padding:3px 6px;gap:4px">
                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:10.5px;padding:2px 2px 4px;border-bottom:1px solid var(--border);flex:none">
                      <span class="hint">连接器就绪</span>
                      <span class="ft-mono" style="font-weight:700;color:var(--ok)">{{ readyConnectorCount }} / {{ (cfg.api_connectors || []).length }}</span>
                    </div>
                    <div style="flex:1;min-height:0;overflow-y:auto">
                      <table class="ft-table fixed">
                        <thead>
                          <tr><th style="width:46%">连接器</th><th style="width:28%">分类</th><th style="width:26%">状态</th></tr>
                        </thead>
                        <tbody>
                          <tr v-for="c in (cfg.api_connectors || []).slice(0, 18)" :key="'dc-' + c.id"
                              @click="jumpToConnectorSettings(c.id)">
                            <td :title="c.name"><b>{{ c.name }}</b></td>
                            <td style="color:var(--muted-foreground)" :title="c.category || 'other'">{{ c.category || 'other' }}</td>
                            <td class="ft-mono">
                              <span v-if="c.auth_type === 'none'" style="color:var(--ok)">● 免Key</span>
                              <span v-else-if="c.api_key_set || c.api_secret_set" style="color:var(--ok)">● 已配</span>
                              <span v-else style="color:var(--warn)">○ 待配</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- Panel B: 实体热度与交互式共现网络 -->
                  <div v-else-if="w.type === 'entity_pulse'" class="ft-panel-body ep-body">
                    <div class="ep-toolbar">
                      <div class="ep-pills" role="group" aria-label="统计时间窗">
                        <button v-for="opt in [{ h: 24, l: '24h' }, { h: 168, l: '7天' }, { h: 720, l: '30天' }]"
                                :key="'eph-' + opt.h" type="button"
                                :class="['ep-pill', entityPulseHours === opt.h ? 'on' : '']"
                                @click="setEntityPulseHours(opt.h)">{{ opt.l }}</button>
                      </div>
                      <div class="ep-legend" title="节点与资产颜色代表利多/中性/利空，底图着色代表地缘冲突烈度">
                        <span class="ep-leg-item"><span class="ep-dot" style="background:#059669"></span>利多</span>
                        <span class="ep-leg-item"><span class="ep-dot" style="background:#2563eb"></span>中性</span>
                        <span class="ep-leg-item"><span class="ep-dot" style="background:#dc2626"></span>利空/冲突</span>
                      </div>
                    </div>

                    <div v-if="!newsEntities.length && !(entityGraph.nodes && entityGraph.nodes.length)"
                         class="hint" style="flex:1;display:flex;align-items:center;justify-content:center;padding:18px 8px;text-align:center">
                      {{ panelRefreshing.entity_pulse ? '正在加载全球情报态势图…' : '当前时间窗暂无实体数据' }}
                    </div>
                    <div v-else :class="['ep-main', { 'is-max': isMaximized }]">
                      <div class="ep-graph-wrap">
                        <div v-if="panelRefreshing.entity_pulse" class="ep-loading-bar"></div>
                        <entity-geo-atlas
                          :nodes="entityGraph.nodes || []"
                          :edges="entityGraph.edges || []"
                          :countries="entityGraph.countries || []"
                          :events="entityGraph.events || []"
                          :assets="entityGraph.assets || []"
                          :theme="cfg.ui_theme"
                          :highlight-id="entityHoverId"
                          :refresh-tick="entityGraphRefreshTick"
                          :is-maximized="isMaximized"
                          @pick="openEntityDossier"
                          @hover="entityHoverId = $event"
                        />
                      </div>
                      <div class="ep-table-wrap">
                        <table class="ep-table">
                          <colgroup>
                            <col />
                            <col style="width:44px" />
                            <col style="width:62px" />
                            <col style="width:58px" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>实体</th>
                              <th style="text-align:center">类型</th>
                              <th style="text-align:right">提及</th>
                              <th style="text-align:right">情绪</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="ent in newsEntities.slice(0, isMaximized ? 24 : 10)" :key="'et-' + ent.id"
                                :class="{ 'is-hl': entityHoverId === ent.id }"
                                @mouseenter="entityHoverId = ent.id"
                                @mouseleave="entityHoverId === ent.id && (entityHoverId = null)"
                                @click="openEntityDossier(ent.canonical_name)">
                              <td>
                                <div class="ep-name-cell" :title="ent.canonical_name">
                                  <span class="ep-dot"
                                        :style="{ background: ent.net_sentiment > 0.08 ? '#10b981' : (ent.net_sentiment < -0.08 ? '#ef4444' : '#3b82f6') }"></span>
                                  <span class="ep-name-txt">{{ ent.canonical_name }}</span>
                                </div>
                              </td>
                              <td style="text-align:center">
                                <span :class="['ep-type-tag', entityTypeMeta(ent.entity_type).cls]"
                                      :title="entityTypeMeta(ent.entity_type).title">{{ entityTypeMeta(ent.entity_type).label }}</span>
                              </td>
                              <td class="ft-mono">
                                <div class="ep-mentions-cell">
                                  <span>{{ ent.mentions }}</span>
                                  <div class="ep-heat-track">
                                    <div class="ep-heat-fill"
                                         :style="{
                                           width: Math.max(8, Math.round((Number(ent.mentions) || 0) / entityMaxMentions * 100)) + '%',
                                           background: ent.net_sentiment > 0.08 ? '#10b981' : (ent.net_sentiment < -0.08 ? '#ef4444' : '#3b82f6'),
                                         }"></div>
                                  </div>
                                </div>
                              </td>
                              <td class="ft-mono" style="text-align:right">
                                <span :class="['ep-sent-pill', ent.net_sentiment > 0.08 ? 'up' : (ent.net_sentiment < -0.08 ? 'down' : 'flat')]">
                                  {{ ent.net_sentiment > 0 ? '+' : '' }}{{ Number(ent.net_sentiment || 0).toFixed(2) }}
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <!-- Panel C: 情报情绪与风险温度计 -->
                  <div v-else-if="w.type === 'sentiment_gauge'" class="ft-panel-body sg-layout">
                    <div class="sg-dial">
                      <svg viewBox="0 0 220 118" preserveAspectRatio="xMidYMid meet" style="width:min(100%, 210px);height:auto;max-height:122px">
                        <path d="M 20 100 A 90 90 0 0 1 200 100" fill="none" stroke="var(--muted)" stroke-width="14" stroke-linecap="round" />
                        <path d="M 20 100 A 90 90 0 0 1 200 100" fill="none" :stroke="sentimentGauge.color" stroke-width="14" stroke-linecap="round"
                              :stroke-dasharray="sentimentGauge.dash" />
                        <text x="110" y="78" text-anchor="middle" font-size="24" font-weight="700" fill="var(--foreground)">{{ sentimentGauge.score }}</text>
                        <text x="110" y="96" text-anchor="middle" font-size="10.5" font-weight="700" :fill="sentimentGauge.color">{{ sentimentGauge.label }}</text>
                      </svg>
                    </div>
                    <div class="sg-bars">
                      <div v-for="row in sentimentSignals" :key="row.label" style="display:flex;align-items:center;gap:6px">
                        <span style="width:68px;flex:none;color:var(--muted-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ row.label }}</span>
                        <div style="flex:1;min-width:0;height:6px;background:var(--muted);border-radius:2px;overflow:hidden">
                          <div :style="{ width: row.pct + '%', height: '100%', background: row.color }"></div>
                        </div>
                        <span class="ft-mono" style="width:38px;flex:none;text-align:right">{{ row.val }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Panel D: 实时多语种情报流（支持单卡独立语种与情绪过滤） -->
                  <div v-else-if="w.type === 'live_wire'" class="ft-panel-body" style="padding:4px 6px;gap:4px">
                    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding-bottom:4px;border-bottom:1px solid var(--border);flex:none">
                      <div class="news-lang-pills">
                        <button v-for="lg in [{id:'all',l:'全'},{id:'zh',l:'中'},{id:'en',l:'英'},{id:'ru',l:'俄'},{id:'ja',l:'日'}]" :key="lg.id"
                                type="button" :class="['news-pill-btn', liveWireLang(w) === lg.id ? 'on' : '']"
                                @click="setLiveWireLang('dashboard', w, lg.id)">{{ lg.l }}</button>
                      </div>
                      <div class="news-lang-pills">
                        <button v-for="st in [{id:'all',l:'全情'},{id:'bullish',l:'多'},{id:'bearish',l:'空'}]" :key="st.id"
                                type="button" :class="['news-pill-btn', ((w.config && w.config.sentiment) || 'all') === st.id ? 'on' : '']"
                                @click="onUpdateWidgetConfig('dashboard', w.id, { sentiment: st.id })">{{ st.l }}</button>
                      </div>
                      <span class="spacer"></span>
                      <span class="hint ft-mono">{{ liveWireItemsFor(w).length }} / {{ newsStatus.items_total || 0 }} 条</span>
                    </div>
                    <div style="flex:1;min-height:0;overflow-y:auto">
                      <o2-empty v-if="!liveWireItemsFor(w).length" description="暂无快讯" />
                      <div v-for="it in liveWireItemsFor(w)" :key="'dw-' + w.id + '-' + it.id"
                           style="display:grid;grid-template-columns:46px 28px 16px minmax(0,1fr) auto;align-items:center;gap:6px;padding:4px 4px;border-bottom:1px solid var(--border);font-size:12px;cursor:pointer"
                           @click="tab = 'news'; selectNewsItem(it)">
                        <span class="ft-mono hint">{{ formatNewsTime(it.published_at) }}</span>
                        <span :class="['news-lang-badge', it.lang]" style="text-align:center">{{ it.lang }}</span>
                        <span :style="{ color: it.sentiment === 'bullish' ? 'var(--up)' : (it.sentiment === 'bearish' ? 'var(--down)' : 'var(--muted-foreground)') }">
                          {{ it.sentiment === 'bullish' ? '▲' : (it.sentiment === 'bearish' ? '▼' : '•') }}
                        </span>
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--foreground)">
                          {{ it.title_zh || it.title_orig }}
                        </span>
                        <span class="hint lw-row-src" style="font-size:10.5px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.feed_name }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Panel E: 24h 情报简报 -->
                  <div v-else-if="w.type === 'desk_note'" class="ft-panel-body">
                    <div v-if="newsBriefLoading" class="hint">生成中…</div>
                    <div v-else-if="newsBriefText" class="answer-text" style="font-size:12px;line-height:1.55;overflow-wrap:anywhere"
                         v-html="renderAnswer(newsBriefText, { sources: [] })"></div>
                    <div v-else style="display:flex;align-items:center;justify-content:center;flex:1">
                      <button type="button" class="ft-btn on" @click="loadNewsBrief(true)">
                        <span class="nav-ico" v-html="ICO.brief" style="width:12px;height:12px"></span>
                        <span>生成简报</span>
                      </button>
                    </div>
                  </div>

                  <div v-else-if="isQuantWidgetType(w.type)" class="ft-panel-body" style="padding:0;gap:0;overflow:hidden">
                    <quant-widget :type="w.type" :config="w.config || {}" :theme="cfg.ui_theme"
                                  :sectors="marketSectors" :chokepoints="geoData.chokepoints"
                                  :custom-widgets="customWidgets" :watchlist="marketOverview.watchlist"
                                  :overview="marketOverview" :macro="macroData" :geo="geoData"
                                  :movers="marketMovers" :news-status="newsStatus" :news-items="newsItems"
                                  @pick-symbol="openMarketDetail"
                                  @ask-ai="onAskAiFromWidget"
                                  @update-thumb="onUpdateCustomThumb"
                                  @update-config="(patch) => onUpdateWidgetConfig('dashboard', w.id, patch)"
                                  @toggle-watchlist="toggleWatchlistSymbol" />
                  </div>

                  <div v-else class="ft-panel-body" style="justify-content:center;align-items:center">
                    <span class="hint">未识别的模块类型：{{ w.type }}</span>
                  </div>
                </template>
              </free-grid>
            </div>

            <!-- 可拖拽分栏条 + 右侧可折叠态势窄栏 -->
            <split-resizer v-if="dashPulseOpen" direction="v" :reverse="true"
                           v-model="dashPulseWidth" :min="196" :max="480"
                           @commit="saveDashboardLayoutDebounced" />
            <aside v-if="dashPulseOpen" class="ft-pulse-rail" :style="{ width: dashPulseWidth + 'px' }">
              <div class="ft-pulse-sec" style="background:var(--muted)">
                <div class="ft-pulse-lbl">
                  <span>情绪指数</span>
                  <span class="ft-mono">{{ sentimentGauge.label }}</span>
                </div>
                <div style="display:flex;align-items:baseline;justify-content:space-between">
                  <span class="ft-mono" style="font-size:20px;font-weight:700;color:var(--foreground)">
                    {{ sentimentGauge.score }}<span style="font-size:12px;color:var(--muted-foreground)">/100</span>
                  </span>
                  <span class="ft-mono hint">{{ newsStatus.net_tone >= 0 ? '+' : '' }}{{ newsStatus.net_tone || 0 }}</span>
                </div>
                <div class="ft-breadth-bar">
                  <div :style="{ width: sentimentGauge.score + '%', background: sentimentGauge.color }"></div>
                </div>
              </div>

              <div class="ft-pulse-sec">
                <div class="ft-pulse-lbl"><span>语种分布</span><span class="ft-mono">{{ (newsStatus.by_lang && newsStatus.by_lang.zh) || 0 }}/{{ (newsStatus.by_lang && newsStatus.by_lang.en) || 0 }}/{{ (newsStatus.by_lang && newsStatus.by_lang.ru) || 0 }}</span></div>
                <div class="ft-breadth-bar">
                  <div :style="{ width: langPct('zh') + '%', background: '#3b82f6' }"></div>
                  <div :style="{ width: langPct('en') + '%', background: '#10b981' }"></div>
                  <div :style="{ width: langPct('ru') + '%', background: '#f59e0b' }"></div>
                </div>
              </div>

              <div class="ft-pulse-sec">
                <div class="ft-pulse-lbl"><span>热门实体</span><span class="ft-mono">{{ newsStatus.entities_total || 0 }}</span></div>
                <div v-for="ent in newsEntities.slice(0, 6)" :key="'pe-' + ent.id"
                     class="ft-mkt-row" style="cursor:pointer" @click="openEntityDossier(ent.canonical_name)">
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--foreground)">{{ ent.canonical_name }}</span>
                  <span class="ft-mono" :style="{ color: ent.net_sentiment > 0 ? 'var(--up)' : (ent.net_sentiment < 0 ? 'var(--down)' : 'var(--muted-foreground)') }">
                    {{ ent.mentions }}
                  </span>
                </div>
              </div>

              <div class="ft-pulse-sec">
                <div class="ft-pulse-lbl"><span>交易时段</span></div>
                <div v-for="mk in marketHours" :key="mk.code" class="ft-mkt-row ft-mono">
                  <span style="font-weight:600;color:var(--foreground)">{{ mk.code }}</span>
                  <span :style="{ color: mk.open ? 'var(--up)' : 'var(--muted-foreground)' }">
                    ● {{ mk.detail }}
                  </span>
                </div>
              </div>
            </aside>
          </div>

          <div class="ft-statusbar ft-mono">
            <span>行情 {{ (marketOverview.stats && marketOverview.stats.total) || 0 }} · 订阅源 {{ newsStatus.feeds_enabled || 0 }}/{{ newsStatus.feeds_total || 0 }} · 未读 {{ newsStatus.unread || 0 }}</span>
            <span>{{ dashboardLayout.locked ? '布局已锁定' : '自由编辑中' }}</span>
          </div>
        </div>
      </template>

      <!-- 行情终端主页面：24列自由拖拽 & 无级缩放工作台 -->
      <template v-if="tab === 'markets'">
        <div class="mk-shell">
          <div class="ft-cmdbar">
            <symbol-picker
              mode="add"
              :watchlist="marketOverview.watchlist"
              compact
              width="176px"
              placeholder="搜股票/代码/加自选…"
              @pick="selectMarketSymbol"
              @toggle-watchlist="toggleWatchlistSymbol"
            />
            <span class="ft-sep"></span>
            <div class="ws-tab-strip" role="tablist" aria-label="行情工作区">
              <div v-for="ws in (marketLayout.workspaces || [])" :key="ws.id"
                   role="tab" tabindex="0" :aria-selected="marketLayout.activeWorkspace === ws.id"
                   :class="['ws-tab', marketLayout.activeWorkspace === ws.id ? 'on' : '']"
                   title="双击重命名"
                   @click="switchMarketWorkspace(ws.id)"
                   @keydown.enter.prevent="switchMarketWorkspace(ws.id)">
                <input v-if="editingWsKey === 'mkt:' + ws.id"
                       v-model="editingWsName"
                       class="ws-tab-input"
                       aria-label="重命名工作区"
                       @click.stop
                       @keydown.enter.prevent="commitWsRename('mkt', ws)"
                       @keydown.esc.prevent="cancelWsRename()"
                       @blur="commitWsRename('mkt', ws)" />
                <span v-else class="ws-tab-lbl" @dblclick.stop="startWsRename('mkt', ws)">{{ ws.name }}</span>
                <button v-if="(marketLayout.workspaces || []).length > 1 && editingWsKey !== 'mkt:' + ws.id"
                        type="button" class="ws-tab-del" title="删除工作区" aria-label="删除工作区"
                        @click.stop="deleteMarketWorkspaceById(ws.id)">×</button>
              </div>
              <button type="button" class="ft-icon-btn" style="width:24px;height:24px" title="新建工作区" aria-label="新建工作区"
                      @click="createMarketWorkspace()" v-html="ICO.plus"></button>
            </div>
            <span class="ft-sep"></span>
            <div class="ft-tools-group">
              <button type="button" class="ft-badge-mini primary" title="打开模块库 / 自定义模块" aria-label="打开模块库"
                      @click="openWidgetGallery('markets')">
                <span v-html="ICO.plus" style="display:inline-flex"></span>
                <span>模块库</span>
              </button>
              <button type="button"
                      :class="['ft-badge-mini', !marketLayout.locked ? 'warn' : '']"
                      :aria-pressed="!marketLayout.locked"
                      :title="marketLayout.locked ? '解锁编辑布局' : '完成并锁定布局'"
                      @click="toggleMarketLock()">
                <span v-html="marketLayout.locked ? ICO.lock : ICO.unlock" style="display:inline-flex"></span>
                <span>{{ marketLayout.locked ? '编辑' : '完成' }}</span>
              </button>
              <button type="button" :class="['ft-icon-btn', mktCompact ? 'on' : '']"
                      :aria-pressed="mktCompact" title="紧凑间距" aria-label="切换紧凑间距"
                      @click="mktCompact = !mktCompact" v-html="ICO.compact"></button>
              <button type="button" :class="['ft-icon-btn', mktDetailOpen ? 'on' : '']"
                      :aria-pressed="mktDetailOpen" title="详情侧栏" aria-label="切换详情侧栏"
                      @click="mktDetailOpen = !mktDetailOpen" v-html="ICO.panelRight"></button>
              <span class="ft-sep"></span>
              <button type="button" class="ft-icon-btn" title="布局管理" aria-label="布局管理"
                      @click="mktCustomizeOpen = true" v-html="ICO.layers"></button>
              <button type="button" :class="['ft-icon-btn', marketLoading ? 'on' : '']" title="刷新行情" aria-label="刷新行情"
                      @click="loadMarketOverview(true); loadMarketKline(mktSelectedSecid, true); loadMarketSectors(true); loadMarketMovers(true)" v-html="ICO.reload"></button>
            </div>
          </div>

          <!-- KPI Ribbon (10 cards with 5D sparkline) -->
          <div class="mk-ribbon">
            <div v-for="card in (marketOverview.ribbon || [])" :key="'rk-' + card.secid"
                 :class="['mk-kpi', mktSelectedSecid === card.secid ? 'on' : '']"
                 @click="selectMarketSymbol(card)">
              <div class="mk-kpi-top">
                <span>{{ card.symbol }}</span>
                <span :style="{ color: (card.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">
                  {{ (card.pct || 0) >= 0 ? '▲' : '▼' }} {{ fmtPct(card.pct) }}
                </span>
              </div>
              <div class="mk-kpi-price ft-mono">{{ fmtPrice(card.price) }}</div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
                <span class="ft-mono hint" style="font-size:10px">{{ (card.chg || 0) >= 0 ? '+' : '' }}{{ fmtPrice(card.chg) }}</span>
                <spark-line :values="card.spark" :up="(card.pct || 0) >= 0" />
              </div>
            </div>
          </div>

          <div class="mk-body">
            <div class="mk-main" :class="{ compact: mktCompact }">
              <free-grid
                :items="activeMarketWidgets"
                :cols="24"
                :row-height="mktCompact ? 22 : 26"
                :gap="mktCompact ? 4 : 6"
                :locked="!!marketLayout.locked"
                v-model:maximized-id="mktMaximizedId"
                @layout-commit="saveMarketLayoutDebounced"
              >
                <template #item="{ widget: w, isMaximized, toggleMaximize, startDrag }">
                  <div class="ft-panel-head"
                       :title="marketLayout.locked ? '双击放大' : '拖动调整位置，双击放大'"
                       @pointerdown="startDrag($event)"
                       @dblclick="toggleMaximize()">
                    <div class="ft-panel-title">
                      <span class="ft-badge-sq">{{ (mktWidgetMeta(w.type) && mktWidgetMeta(w.type).badge) || (w.title || 'M').slice(0, 1) }}</span>
                      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ w.title }}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:3px;flex:none" @dblclick.stop>
                      <template v-if="w.type === 'kline_main'">
                        <div class="wl-head-extra" style="display:inline-flex;gap:2px;margin-right:2px">
                          <button v-for="iv in ['1d','1w','1M']" :key="'mkwiv-' + w.id + '-' + iv" type="button"
                                  :class="['ft-btn', getMktWidgetInterval(w) === iv ? 'on' : '']"
                                  style="height:18px;padding:0 5px;font-size:10px"
                                  @click.stop="setMktWidgetInterval(w, iv)">{{ iv.toUpperCase() }}</button>
                        </div>
                        <button type="button" class="ft-ico-btn" title="AI 研判" aria-label="AI 研判"
                                @click.stop="askAiAboutSymbol(getMktKlineData(w) || { secid: (w.config && w.config.secid) || mktSelectedSecid, name: (w.config && w.config.secidName) || mktSelectedName })"
                                v-html="ICO.robot"></button>
                      </template>
                      <template v-else-if="w.type === 'sector_heatmap'">
                        <button type="button"
                                :class="['ft-ico-btn', panelRefreshing.mkt_sector_heatmap ? 'is-spinning' : (panelJustRefreshed.mkt_sector_heatmap ? 'is-done' : '')]"
                                :disabled="!!panelRefreshing.mkt_sector_heatmap"
                                :title="panelRefreshing.mkt_sector_heatmap ? '正在刷新…' : ('刷新板块' + (panelRefreshedAt.mkt_sector_heatmap ? '（上次 ' + panelRefreshedAt.mkt_sector_heatmap + '）' : ''))"
                                aria-label="刷新板块"
                                @click.stop="refreshPanel('mkt_sector_heatmap', () => loadMarketSectors(true), { successText: '板块热力图已刷新' })"
                                v-html="panelJustRefreshed.mkt_sector_heatmap ? ICO.check : ICO.reload"></button>
                      </template>
                      <template v-else-if="w.type === 'macro_curve'">
                        <button type="button"
                                :class="['ft-ico-btn', panelRefreshing.mkt_macro_curve ? 'is-spinning' : (panelJustRefreshed.mkt_macro_curve ? 'is-done' : '')]"
                                :disabled="!!panelRefreshing.mkt_macro_curve"
                                :title="panelRefreshing.mkt_macro_curve ? '正在刷新…' : ('刷新宏观' + (panelRefreshedAt.mkt_macro_curve ? '（上次 ' + panelRefreshedAt.mkt_macro_curve + '）' : ''))"
                                aria-label="刷新宏观"
                                @click.stop="refreshPanel('mkt_macro_curve', () => loadMacroData(true), { successText: '宏观利率与汇率已刷新' })"
                                v-html="panelJustRefreshed.mkt_macro_curve ? ICO.check : ICO.reload"></button>
                      </template>
                      <template v-else-if="w.type === 'geo_odds'">
                        <button type="button"
                                :class="['ft-ico-btn', panelRefreshing.mkt_geo_odds ? 'is-spinning' : (panelJustRefreshed.mkt_geo_odds ? 'is-done' : '')]"
                                :disabled="!!panelRefreshing.mkt_geo_odds"
                                :title="panelRefreshing.mkt_geo_odds ? '正在刷新…' : ('刷新地缘' + (panelRefreshedAt.mkt_geo_odds ? '（上次 ' + panelRefreshedAt.mkt_geo_odds + '）' : ''))"
                                aria-label="刷新地缘"
                                @click.stop="refreshPanel('mkt_geo_odds', () => loadGeoData(true), { successText: '地缘预期概率已刷新' })"
                                v-html="panelJustRefreshed.mkt_geo_odds ? ICO.check : ICO.reload"></button>
                      </template>
                      <template v-else-if="w.type === 'live_wire'">
                        <button type="button" class="ft-ico-btn" title="打开新闻流" aria-label="打开新闻流" @click.stop="tab = 'news'" v-html="ICO.external"></button>
                      </template>
                      <template v-else-if="w.type.startsWith('movers_')">
                        <button type="button"
                                :class="['ft-ico-btn', panelRefreshing[w.type] ? 'is-spinning' : (panelJustRefreshed[w.type] ? 'is-done' : '')]"
                                :disabled="!!panelRefreshing[w.type]"
                                :title="panelRefreshing[w.type] ? '正在刷新…' : ('刷新异动' + (panelRefreshedAt[w.type] ? '（上次 ' + panelRefreshedAt[w.type] + '）' : ''))"
                                aria-label="刷新异动"
                                @click.stop="refreshPanel(w.type, () => loadMarketMovers(true), { successText: '涨跌异动已刷新' })"
                                v-html="panelJustRefreshed[w.type] ? ICO.check : ICO.reload"></button>
                      </template>
                      <span v-else-if="w.type === 'watchlist'" class="ft-mono hint" style="font-size:10.5px;margin-right:2px">{{ (marketOverview.watchlist || []).length }}</span>
                      <span v-else-if="w.type.startsWith('panel_')" class="ft-mono hint" style="font-size:10.5px;margin-right:2px">{{ (marketPanelItems(w) || []).length }}</span>
                      <button type="button" class="ft-ico-btn" title="自定义模块与叠层" aria-label="自定义模块与叠层"
                              @click.stop="openWidgetConfig('markets', w)" v-html="ICO.settings"></button>
                      <button type="button" class="ft-ico-btn" :title="isMaximized ? '还原' : '放大'" :aria-label="isMaximized ? '还原' : '放大'"
                              @click.stop="toggleMaximize()" v-html="isMaximized ? ICO.minimize : ICO.maximize"></button>
                      <button v-if="!marketLayout.locked" type="button" class="ft-ico-btn danger" title="移除模块" aria-label="移除模块"
                              @click.stop="removeMarketWidget(w.id)" v-html="ICO.close"></button>
                    </div>
                  </div>

                  <!-- 内嵌 K-Line 自由模块（支持单卡独立搜股锁定标的、叠层与多条预警线） -->
                  <div v-if="w.type === 'kline_main'" class="ft-panel-body" style="padding:4px 8px;overflow:hidden">
                    <div class="wl-chart-head">
                      <symbol-picker
                        :model-value="(w.config && w.config.secid) || mktSelectedSecid"
                        :label="(getMktKlineData(w) && getMktKlineData(w).name) || (w.config && w.config.secidName) || mktSelectedName || mktSelectedSymbol"
                        :watchlist="marketOverview.watchlist"
                        compact
                        width="132px"
                        @pick="(it) => setMktWidgetSymbol(w, it)"
                        @toggle-watchlist="toggleWatchlistSymbol"
                      />
                      <button v-if="w.config && w.config.secid" type="button" class="ft-chip" title="恢复跟随当前点击标的"
                              @click="clearMktWidgetSymbol(w)">跟随</button>
                      <span v-if="getMktKlineData(w) && getMktKlineData(w).price != null" class="ft-mono" style="font-weight:700">
                        {{ fmtPrice(getMktKlineData(w).price) }}
                        <span :style="{ color: (getMktKlineData(w).pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">{{ fmtPct(getMktKlineData(w).pct) }}</span>
                      </span>
                      <span class="spacer"></span>
                      <div style="display:inline-flex;align-items:center;gap:3px">
                        <button type="button" :class="['ft-chip', !(w.config && w.config.showMa === false) ? 'on' : '']" title="均线" @click="onUpdateWidgetConfig('markets', w.id, { showMa: w.config && w.config.showMa === false })">均线</button>
                        <button type="button" :class="['ft-chip', !!(w.config && w.config.showBoll) ? 'on' : '']" title="布林带" @click="onUpdateWidgetConfig('markets', w.id, { showBoll: !(w.config && w.config.showBoll) })">BOLL</button>
                        <button type="button" :class="['ft-chip', !(w.config && w.config.showVol === false) ? 'on' : '']" title="成交量" @click="onUpdateWidgetConfig('markets', w.id, { showVol: w.config && w.config.showVol === false })">量能</button>
                        <button type="button" :class="['ft-chip', !(w.config && w.config.showMarkers === false) ? 'on' : '']" title="快讯事件打点" @click="onUpdateWidgetConfig('markets', w.id, { showMarkers: w.config && w.config.showMarkers === false })">事件</button>
                      </div>
                    </div>
                    <div style="flex:1;min-height:0;position:relative">
                      <kline-chart :data="getMktKlineData(w)" :theme="cfg.ui_theme"
                                   :show-ma="!(w.config && w.config.showMa === false)"
                                   :show-boll="!!(w.config && w.config.showBoll)"
                                   :show-vol="!(w.config && w.config.showVol === false)"
                                   :show-markers="!(w.config && w.config.showMarkers === false)"
                                   :redlines="(w.config && w.config.redlines) || []"
                                   @pick-marker="onPickKlineNewsMarker" />
                    </div>
                  </div>

                  <!-- 板块热力图自由模块 -->
                  <div v-else-if="w.type === 'sector_heatmap'" class="ft-panel-body" style="padding:4px 6px;gap:4px;overflow:hidden">
                    <div v-if="marketSectors.length" style="display:flex;align-items:center;gap:8px;font-size:10.5px;flex:none;padding:0 2px">
                      <span class="ft-mono" style="color:var(--up);font-weight:700">涨 {{ marketSectors.filter(s => (s.pct || 0) > 0).length }}</span>
                      <span class="ft-mono" style="color:var(--down);font-weight:700">跌 {{ marketSectors.filter(s => (s.pct || 0) < 0).length }}</span>
                      <span class="hint ft-mono" style="margin-left:auto">
                        均幅 {{ ((marketSectors.reduce((a, b) => a + (Number(b.pct) || 0), 0) / marketSectors.length)).toFixed(2) }}%
                      </span>
                    </div>
                    <div v-if="marketSectors.length" style="flex:1;min-height:0;display:flex;position:relative">
                      <sector-treemap :items="marketSectors" :theme="cfg.ui_theme" height="100%" @pick="onPickSector" />
                    </div>
                    <div v-else class="hint" style="padding:18px;text-align:center">加载板块中…</div>
                  </div>

                  <!-- 跨页兼容：宏观利率与汇率 / 地缘概率 / 实时快讯 -->
                  <div v-else-if="w.type === 'macro_curve'" class="ft-panel-body" style="padding:4px 8px;overflow-y:auto">
                    <div v-if="macroSpreadSummary" style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex:none;font-size:10.5px">
                      <span class="ft-mono">
                        <span class="hint">10Y-2Y: </span>
                        <b :style="{ color: macroSpreadSummary.s10_2 < 0 ? 'var(--down)' : 'var(--up)' }">{{ macroSpreadSummary.s10_2 >= 0 ? '+' : '' }}{{ macroSpreadSummary.s10_2 }}bp</b>
                      </span>
                      <span :class="['div-tag', macroSpreadSummary.s10_2 < 0 ? 'high' : (macroSpreadSummary.s10_2 < 25 ? 'warn' : 'ok')]">
                        {{ macroSpreadSummary.s10_2 < 0 ? '曲线倒挂' : (macroSpreadSummary.s10_2 < 25 ? '平坦' : '正常陡峭') }}
                      </span>
                    </div>
                    <div v-if="macroData.treasury && macroData.treasury.rates && macroData.treasury.rates.length"
                         style="flex:1 1 110px;min-height:96px;display:flex;position:relative">
                      <yield-chart :rates="macroData.treasury.rates" :theme="cfg.ui_theme" height="100%" />
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:4px;flex:none">
                      <div v-for="fx in macroFxGrid" :key="fx.pair"
                           style="padding:4px 6px;border:1px solid var(--border);border-radius:3px;background:var(--background);min-width:0">
                        <div class="ft-mono hint" style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ fx.pair }}</div>
                        <div class="ft-mono" style="font-size:12px;font-weight:700;color:var(--foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ fx.val }}</div>
                      </div>
                    </div>
                  </div>

                  <div v-else-if="w.type === 'geo_odds'" class="ft-panel-body" style="padding:4px 8px;gap:5px">
                    <div style="display:flex;align-items:center;gap:4px;flex:none;padding-bottom:3px;border-bottom:1px solid var(--border)">
                      <button v-for="tg in [{id:'all',l:'全'},{id:'geopolitics',l:'地缘'},{id:'economy',l:'宏观'}]" :key="tg.id"
                              type="button" :class="['ft-chip', ((w.config && w.config.tag) || 'all') === tg.id ? 'on' : '']"
                              @click="onUpdateWidgetConfig('markets', w.id, { tag: tg.id })">{{ tg.l }}</button>
                      <span class="hint ft-mono" style="margin-left:auto;font-size:10px">Polymarket</span>
                    </div>
                    <div style="flex:1;min-height:0;overflow-y:auto">
                      <div v-for="ev in (geoData.events || []).filter(e => !w.config || !w.config.tag || w.config.tag === 'all' || e.tag === w.config.tag).slice(0, (w.config && Number(w.config.limit)) || 12)" :key="ev.id"
                           style="display:flex;flex-direction:column;gap:3px;padding:4px 0;border-bottom:1px solid var(--border);cursor:pointer"
                           @click="openNewsInBrowser(ev.url)">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11.5px">
                          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--foreground)" :title="ev.title">{{ ev.title }}</span>
                          <span class="ft-mono" style="font-weight:700;flex:none"
                                :style="{ color: (ev.yes_pct || 0) >= 70 ? 'var(--down)' : ((ev.yes_pct || 0) >= 40 ? 'var(--warn)' : 'var(--primary)') }">
                            {{ ev.yes_pct != null ? (ev.yes_pct + '%') : '-' }}
                          </span>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px">
                          <div style="flex:1;height:4px;background:var(--muted);border-radius:2px;overflow:hidden">
                            <div :style="{ width: Math.min(100, ev.yes_pct || 0) + '%', height: '100%', background: (ev.yes_pct || 0) >= 70 ? '#ef4444' : ((ev.yes_pct || 0) >= 40 ? '#f59e0b' : 'var(--primary)') }"></div>
                          </div>
                          <span class="ft-mono hint" style="font-size:10px">\${{ fmtCompact(ev.volume24h) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-else-if="w.type === 'live_wire'" class="ft-panel-body" style="padding:4px 6px;gap:4px">
                    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding-bottom:4px;border-bottom:1px solid var(--border);flex:none">
                      <div class="news-lang-pills">
                        <button v-for="lg in [{id:'all',l:'全'},{id:'zh',l:'中'},{id:'en',l:'英'},{id:'ru',l:'俄'},{id:'ja',l:'日'}]" :key="lg.id"
                                type="button" :class="['news-pill-btn', liveWireLang(w) === lg.id ? 'on' : '']"
                                @click="setLiveWireLang('markets', w, lg.id)">{{ lg.l }}</button>
                      </div>
                      <div class="news-lang-pills">
                        <button v-for="st in [{id:'all',l:'全情'},{id:'bullish',l:'多'},{id:'bearish',l:'空'}]" :key="st.id"
                                type="button" :class="['news-pill-btn', ((w.config && w.config.sentiment) || 'all') === st.id ? 'on' : '']"
                                @click="onUpdateWidgetConfig('markets', w.id, { sentiment: st.id })">{{ st.l }}</button>
                      </div>
                      <span class="spacer"></span>
                      <span class="hint ft-mono">{{ liveWireItemsFor(w).length }} 条</span>
                    </div>
                    <div style="flex:1;min-height:0;overflow-y:auto">
                      <o2-empty v-if="!liveWireItemsFor(w).length" description="暂无快讯" />
                      <div v-for="it in liveWireItemsFor(w)" :key="'mlw-' + w.id + '-' + it.id"
                           style="display:grid;grid-template-columns:46px 28px 16px minmax(0,1fr) auto;align-items:center;gap:6px;padding:4px 4px;border-bottom:1px solid var(--border);font-size:12px;cursor:pointer"
                           @click="tab = 'news'; selectNewsItem(it)">
                        <span class="ft-mono hint">{{ formatNewsTime(it.published_at) }}</span>
                        <span :class="['news-lang-badge', it.lang]" style="text-align:center">{{ it.lang }}</span>
                        <span :style="{ color: it.sentiment === 'bullish' ? 'var(--up)' : (it.sentiment === 'bearish' ? 'var(--down)' : 'var(--muted-foreground)') }">
                          {{ it.sentiment === 'bullish' ? '▲' : (it.sentiment === 'bearish' ? '▼' : '•') }}
                        </span>
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--foreground)">
                          {{ it.title_zh || it.title_orig }}
                        </span>
                        <span class="hint lw-row-src" style="font-size:10.5px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.feed_name }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- 涨跌异动自由模块（使用专属响应式类，修复容器查询列数错配） -->
                  <div v-else-if="w.type === 'movers_gainers' || w.type === 'movers_losers' || w.type === 'movers_active'"
                       class="ft-panel-body" style="padding:0;gap:0">
                    <div v-for="it in marketMoverItems(w.type)" :key="w.id + '-' + it.secid"
                         :class="['mk-row', 'mk-row-mover', mktSelectedSecid === it.secid ? 'on' : '']"
                         @click="selectMarketSymbol(it)">
                      <span class="mk-dot" :style="{ background: (it.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }"></span>
                      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.name }} <span class="hint ft-mono">{{ it.symbol }}</span></span>
                      <span class="ft-mono" style="text-align:right">{{ fmtPrice(it.price) }}</span>
                      <span class="ft-mono" style="text-align:right;font-weight:600" :style="{ color: (it.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">{{ fmtPct(it.pct) }}</span>
                      <span class="ft-mono hint mk-col-chg" style="text-align:right">{{ fmtCompact(it.amount) }}</span>
                    </div>
                  </div>

                  <!-- 自选列表自由模块（支持卡内直接搜股加自选 & 行内移出） -->
                  <div v-else-if="w.type === 'watchlist'" class="ft-panel-body" style="padding:0;gap:0">
                    <div style="padding:5px 6px;border-bottom:1px solid var(--border);background:var(--background);flex:none">
                      <symbol-picker
                        mode="add"
                        :watchlist="marketOverview.watchlist"
                        compact
                        placeholder="+ 搜索股票加入自选…"
                        @pick="(it) => addSymbolToWatchlistAndPick(it, null)"
                        @toggle-watchlist="toggleWatchlistSymbol"
                      />
                    </div>
                    <div style="flex:1;min-height:0;overflow-y:auto">
                      <div v-for="row in (marketOverview.watchlist || [])" :key="w.id + '-' + row.secid"
                           :class="['mk-row', 'mk-row-wl', mktSelectedSecid === row.secid ? 'on' : '', (w.config && w.config.hideChg) ? 'no-chg' : '', (w.config && w.config.hideSpark) ? 'no-spark' : '']"
                           @click="selectMarketSymbol(row)">
                        <span class="mk-dot" :style="{ background: (row.pct || 0) > 0 ? 'var(--up)' : ((row.pct || 0) < 0 ? 'var(--down)' : 'var(--muted-foreground)') }"></span>
                        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500" :title="row.symbol">
                          {{ row.name }}
                        </span>
                        <span class="ft-mono" style="text-align:right;font-weight:600">{{ fmtPrice(row.price) }}</span>
                        <span v-if="!(w.config && w.config.hideChg)" class="ft-mono mk-col-chg" style="text-align:right" :style="{ color: (row.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">
                          {{ (row.chg || 0) >= 0 ? '+' : '' }}{{ fmtPrice(row.chg) }}
                        </span>
                        <span class="ft-mono" style="text-align:right;font-weight:600" :style="{ color: (row.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">
                          {{ fmtPct(row.pct) }}
                        </span>
                        <span v-if="!(w.config && w.config.hideSpark)" class="mk-col-spark"><spark-line :values="row.spark" :up="(row.pct || 0) >= 0" /></span>
                        <span class="wl-row-acts">
                          <button type="button" class="wl-pin-btn" title="置顶" aria-label="置顶"
                                  @click.stop="pinWatchlistSymbol(row)">↑</button>
                          <button type="button" class="wl-del-btn" title="移出自选" aria-label="移出自选"
                                  @click.stop="toggleWatchlistSymbol(row)">×</button>
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- 高级量化与自定义 ECharts 模块 -->
                  <div v-else-if="isQuantWidgetType(w.type)" class="ft-panel-body" style="padding:0;gap:0;overflow:hidden">
                    <quant-widget :type="w.type" :config="w.config || {}" :theme="cfg.ui_theme"
                                  :sectors="marketSectors" :chokepoints="geoData.chokepoints"
                                  :custom-widgets="customWidgets" :watchlist="marketOverview.watchlist"
                                  :overview="marketOverview" :macro="macroData" :geo="geoData"
                                  :movers="marketMovers" :news-status="newsStatus" :news-items="newsItems"
                                  @pick-symbol="selectMarketSymbol"
                                  @ask-ai="onAskAiFromWidget"
                                  @update-thumb="onUpdateCustomThumb"
                                  @update-config="(patch) => onUpdateWidgetConfig('markets', w.id, patch)"
                                  @toggle-watchlist="toggleWatchlistSymbol" />
                  </div>

                  <!-- 多市场行情面板自由模块 -->
                  <div v-else class="ft-panel-body" style="padding:0;gap:0">
                    <div v-for="row in marketPanelItems(w)" :key="w.id + '-' + row.secid"
                         :class="['mk-row', mktSelectedSecid === row.secid ? 'on' : '', (w.config && w.config.hideChg) ? 'no-chg' : '', (w.config && w.config.hideSpark) ? 'no-spark' : '']"
                         @click="selectMarketSymbol(row)">
                      <span class="mk-dot" :style="{ background: (row.pct || 0) > 0 ? 'var(--up)' : ((row.pct || 0) < 0 ? 'var(--down)' : 'var(--muted-foreground)') }"></span>
                      <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500" :title="row.symbol">
                        {{ row.name }}
                      </span>
                      <span class="ft-mono" style="text-align:right;font-weight:600">{{ fmtPrice(row.price) }}</span>
                      <span v-if="!(w.config && w.config.hideChg)" class="ft-mono mk-col-chg" style="text-align:right" :style="{ color: (row.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">
                        {{ (row.chg || 0) >= 0 ? '+' : '' }}{{ fmtPrice(row.chg) }}
                      </span>
                      <span class="ft-mono" style="text-align:right;font-weight:600" :style="{ color: (row.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">
                        {{ fmtPct(row.pct) }}
                      </span>
                      <span v-if="!(w.config && w.config.hideSpark)" class="mk-col-spark"><spark-line :values="row.spark" :up="(row.pct || 0) >= 0" /></span>
                    </div>
                  </div>
                </template>
              </free-grid>
            </div>

            <!-- 垂直分栏拖拽条 + 右侧可调宽详情栏 -->
            <split-resizer v-if="mktDetailOpen" direction="v" :reverse="true"
                           v-model="mktDetailWidth" :min="280" :max="680"
                           @commit="saveMarketLayoutDebounced" />
            <aside v-if="mktDetailOpen" class="mk-detail" :style="{ width: mktDetailWidth + 'px' }">
              <div class="mk-detail-head">
                <div style="min-width:0">
                  <div style="display:flex;align-items:center;gap:6px">
                    <b style="font-size:14px;color:var(--foreground)">{{ (mktKlineData && mktKlineData.name) || mktSelectedName || mktSelectedSymbol }}</b>
                    <span class="ft-mono hint" style="font-size:11px">{{ mktSelectedSymbol }}</span>
                  </div>
                  <div v-if="mktKlineData && mktKlineData.price != null" class="ft-mono" style="font-size:12px;margin-top:2px">
                    <b>{{ fmtPrice(mktKlineData.price) }}</b>
                    <span style="margin-left:6px" :style="{ color: (mktKlineData.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">
                      {{ (mktKlineData.chg || 0) >= 0 ? '+' : '' }}{{ fmtPrice(mktKlineData.chg) }} · {{ fmtPct(mktKlineData.pct) }}
                    </span>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:4px">
                  <button type="button" :class="['ft-icon-btn', isInWatchlist(mktSelectedSecid) ? 'on' : '']"
                          :title="isInWatchlist(mktSelectedSecid) ? '移出自选' : '加入自选'"
                          :aria-label="isInWatchlist(mktSelectedSecid) ? '移出自选' : '加入自选'"
                          @click="toggleWatchlistSymbol({ secid: mktSelectedSecid, symbol: mktSelectedSymbol || mktSelectedSecid, name: (mktKlineData && mktKlineData.name) || mktSelectedName })"
                          v-html="isInWatchlist(mktSelectedSecid) ? ICO.starFill : ICO.star"></button>
                  <button type="button" class="ft-icon-btn" title="AI 研判" aria-label="AI 研判"
                          @click="askAiAboutSymbol(mktKlineData || { secid: mktSelectedSecid, name: mktSelectedName })"
                          v-html="ICO.robot"></button>
                  <button type="button" class="ft-icon-btn" title="收起" aria-label="收起详情侧栏" @click="mktDetailOpen = false" v-html="ICO.close"></button>
                </div>
              </div>

              <div class="mk-detail-ctrl">
                <div class="news-lang-pills">
                  <button v-for="iv in ['1d','1w','1M']" :key="'dk-' + iv" type="button"
                          :class="['news-pill-btn', mktInterval === iv ? 'on' : '']"
                          @click="mktInterval = iv; loadMarketKline(mktSelectedSecid, true)">{{ iv.toUpperCase() }}</button>
                </div>
                <span class="spacer"></span>
                <div style="display:inline-flex;align-items:center;gap:3px">
                  <button type="button" :class="['ft-chip', chartOpts.ma ? 'on' : '']" :aria-pressed="chartOpts.ma" title="均线" @click="chartOpts.ma = !chartOpts.ma">均线</button>
                  <button type="button" :class="['ft-chip', chartOpts.vol ? 'on' : '']" :aria-pressed="chartOpts.vol" title="成交量" @click="chartOpts.vol = !chartOpts.vol">量能</button>
                  <button type="button" :class="['ft-chip', chartOpts.markers ? 'on' : '']" :aria-pressed="chartOpts.markers" title="快讯事件打点" @click="chartOpts.markers = !chartOpts.markers">事件</button>
                </div>
              </div>

              <div class="mk-chart-box" :style="{ height: mktDetailChartHeight + 'px' }">
                <kline-chart :data="mktKlineData" :theme="cfg.ui_theme"
                             :show-ma="chartOpts.ma" :show-vol="chartOpts.vol" :show-markers="chartOpts.markers"
                             @pick-marker="onPickKlineNewsMarker" />
              </div>

              <!-- 水平分栏拖拽条：自由拉高/拉低 K 线图与新闻区比例 -->
              <split-resizer direction="h" v-model="mktDetailChartHeight" :min="150" :max="540"
                             @commit="saveMarketLayoutDebounced" />

              <div v-if="mktTechSummary" class="ft-telemetry ft-mono" style="justify-content:space-between">
                <span>RSI14 <b>{{ mktTechSummary.rsi }}</b></span>
                <span>MACD <b>{{ mktTechSummary.macd }}</b></span>
                <span>{{ (mktKlineData && mktKlineData.source) || '' }}</span>
              </div>

              <div style="flex:1;min-height:0;overflow-y:auto;padding:6px 10px;display:flex;flex-direction:column;gap:4px">
                <div class="ft-pulse-lbl" style="margin-bottom:2px">
                  <span>关联快讯</span>
                  <span class="ft-mono">{{ ((mktKlineData && mktKlineData.news_events) || []).length }}</span>
                </div>
                <div v-for="ev in ((mktKlineData && mktKlineData.news_events) || [])" :key="'ke-' + ev.id"
                     style="display:grid;grid-template-columns:68px 26px minmax(0,1fr);align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:11.5px;cursor:pointer"
                     @click="onPickKlineNewsMarker(ev)">
                  <span class="ft-mono hint">{{ ev.time }}</span>
                  <span :class="['news-lang-badge', ev.lang]" style="text-align:center">{{ ev.lang }}</span>
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--foreground)">{{ ev.title }}</span>
                </div>
              </div>
            </aside>
          </div>

          <div class="ft-statusbar ft-mono">
            <span>共 {{ (marketOverview.stats && marketOverview.stats.total) || 0 }} 项 · 涨 {{ (marketOverview.stats && marketOverview.stats.up) || 0 }} · 跌 {{ (marketOverview.stats && marketOverview.stats.down) || 0 }}</span>
            <span>{{ ((marketOverview.stats && marketOverview.stats.sources) || []).join(' · ') }}</span>
          </div>
        </div>
      </template>

      <!-- 量化回测与成熟因子实验室 -->
      <template v-if="tab === 'backtest'">
        <backtest-lab
          :dark="cfg.ui_theme === 'dark'"
          :watchlist="(marketOverview && marketOverview.watchlist) || []"
          @ask-ai="onAskAiFromWidget"
        />
      </template>

      <!-- 新闻流主页面 -->
      <template v-if="tab === 'news'">
        <div class="news-shell">
          <!-- Row 1: 单行指令过滤条 -->
          <div class="ft-news-cmd">
            <span class="dash-ticker-badge">快讯</span>
            <a-input v-model:value="newsFilters.q" size="small" allow-clear style="width:176px"
                     placeholder="搜索快讯…" @pressEnter="runNewsSearch(true)" />
            <button type="button" :class="['ft-btn', newsSearchMode === 'semantic' ? 'on' : '']"
                    :aria-pressed="newsSearchMode === 'semantic'" title="切换混合语义检索"
                    @click="newsSearchMode = newsSearchMode === 'semantic' ? 'keyword' : 'semantic'; if ((newsFilters.q || '').trim()) runNewsSearch(true)">
              语义检索
            </button>
            <a-select v-model:value="newsFilters.category" style="width:98px" size="small" @change="runNewsSearch(true)">
              <a-select-option value="all">全部分类</a-select-option>
              <a-select-option v-for="cat in newsCategories" :key="cat" :value="cat">{{ cat }}</a-select-option>
            </a-select>
            <div style="display:inline-flex;gap:2px">
              <button v-for="hw in [{h:1,l:'1H'},{h:6,l:'6H'},{h:24,l:'24H'},{h:168,l:'7D'},{h:0,l:'全'}]" :key="hw.h"
                      type="button" :class="['ft-btn', newsFilters.hours === hw.h ? 'on' : '']"
                      @click="newsFilters.hours = hw.h; runNewsSearch(true)">{{ hw.l }}</button>
            </div>
            <div class="news-lang-pills">
              <button v-for="lg in [{id:'all',l:'全'},{id:'zh',l:'中'},{id:'en',l:'英'},{id:'ru',l:'俄'},{id:'ja',l:'日'}]" :key="lg.id"
                      type="button" :class="['news-pill-btn', newsFilters.lang === lg.id ? 'on' : '']"
                      @click="newsFilters.lang = lg.id; runNewsSearch(true)">{{ lg.l }}</button>
            </div>
            <button type="button" :class="['ft-btn', newsFilters.unread ? 'on' : '']"
                    :aria-pressed="!!newsFilters.unread" title="仅看未读"
                    @click="newsFilters.unread = !newsFilters.unread; runNewsSearch(true)">
              未读<span v-if="newsStatus.unread" class="ft-mono" style="margin-left:3px">{{ newsStatus.unread }}</span>
            </button>
            <button type="button" class="ft-icon-btn" title="全部已读" aria-label="全部标为已读" @click="markAllNewsRead()" v-html="ICO.checkAll"></button>
            <button type="button" :class="['ft-icon-btn', newsFilters.starred ? 'on' : '']" :aria-pressed="!!newsFilters.starred" title="仅看收藏" aria-label="仅看收藏"
                    @click="newsFilters.starred = !newsFilters.starred; runNewsSearch(true)"
                    v-html="newsFilters.starred ? ICO.starFill : ICO.star"></button>
            <span class="spacer"></span>
            <span v-if="newsFetching || newsStatus.fetching || newsStatus.translating || newsStatus.embedding" class="ft-sync-pill" aria-live="polite">
              <span class="ft-sync-dot"></span>自动处理中
            </span>
            <div class="news-lang-pills">
              <button v-for="vm in [{id:'zh',l:'译'},{id:'bilingual',l:'双'},{id:'orig',l:'原'}]" :key="vm.id"
                      type="button" :class="['news-pill-btn', newsViewMode === vm.id ? 'on' : '']"
                      @click="newsViewMode = vm.id">{{ vm.l }}</button>
            </div>
            <button type="button" class="ft-icon-btn" title="情报简报" aria-label="情报简报" @click="openBriefModal()" v-html="ICO.brief"></button>
            <button type="button" :class="['ft-icon-btn', newsFetching ? 'on' : '']" title="刷新快讯" aria-label="刷新快讯"
                    @click="fetchNewsNow()" v-html="ICO.reload"></button>
            <button type="button" class="ft-icon-btn" title="新闻设置" aria-label="新闻设置" @click="openNewsSettings" v-html="ICO.settings"></button>
          </div>

          <!-- Row 2: 态势统计带 -->
          <div class="ft-telemetry ft-mono">
            <span>订阅源 <b>{{ newsStatus.feeds_enabled || 0 }}/{{ newsStatus.feeds_total || 0 }}</b></span>
            <span>快讯 <b>{{ newsStatus.items_total || 0 }}</b></span>
            <span v-if="newsStatus.dedup_saved > 0" :title="'已去重折叠 ' + newsStatus.dedup_saved + ' 条重复报道'">去重 <b style="color:var(--ok)">-{{ newsStatus.dedup_saved }}</b></span>
            <span>事件簇 <b>{{ newsStatus.clusters_total || 0 }}</b></span>
            <span>实体 <b>{{ newsStatus.entities_total || 0 }}</b></span>
            <span style="display:inline-flex;align-items:center;gap:6px">
              <span>情绪</span>
              <span class="ft-tone-bar">
                <span :style="{ width: toneRatio.bullish + '%', background: 'var(--up)' }"></span>
                <span :style="{ width: toneRatio.neutral + '%', background: '#94a3b8' }"></span>
                <span :style="{ width: toneRatio.bearish + '%', background: 'var(--down)' }"></span>
              </span>
              <b>{{ newsStatus.net_tone >= 0 ? '+' : '' }}{{ newsStatus.net_tone || 0 }}</b>
            </span>
            <a-tag v-if="newsFilters.entity" closable color="blue" @close="newsFilters.entity = ''; runNewsSearch(true)">
              实体: {{ newsFilters.entity }}
            </a-tag>
            <span class="spacer"></span>
            <span v-if="newsLastSearchMode === 'hybrid+rerank' || newsLastSearchMode === 'hybrid'" style="color:var(--ok)">● 混合语义精排</span>
          </div>

          <!-- Row 3: 突发横幅 -->
          <div v-if="showBreakingBanner && currentBreaking"
               class="ft-breaking" @click="selectNewsItem(currentBreaking)">
            <span class="ft-breaking-tag">突发</span>
            <span :class="['news-lang-badge', currentBreaking.lang]">{{ currentBreaking.lang }}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:var(--foreground)">
              {{ currentBreaking.title_zh || currentBreaking.title_orig }}
            </span>
            <span v-for="bt in (currentBreaking.breaking_tags || []).slice(0, 2)" :key="'bt-' + bt"
                  class="ft-ent-pill" style="color:var(--down);border-color:rgba(239,68,68,.35)">{{ bt }}</span>
            <span class="hint ft-mono">{{ currentBreaking.feed_name }}</span>
            <button v-if="newsStatus.breaking && newsStatus.breaking.length > 1" type="button"
                    class="ft-ico-btn ft-mono" style="width:auto;padding:0 5px;font-size:10.5px" title="下一条突发" aria-label="下一条突发"
                    @click.stop="nextBreaking()">{{ (breakingIdx % newsStatus.breaking.length) + 1 }}/{{ newsStatus.breaking.length }} ›</button>
            <button type="button" class="ft-ico-btn" aria-label="关闭突发横幅" @click.stop="showBreakingBanner = false">×</button>
          </div>

          <!-- 主区：全宽单行虚拟滚动快讯表 + 右侧滑出式详情栏 -->
          <div class="ft-wire-wrap">
            <div class="ft-wire-list" ref="newsListEl" @scroll="onNewsListScroll">
              <o2-empty v-if="!newsLoading && !newsItems.length" description="暂无匹配快讯" style="margin-top:48px" />
              <div v-else :style="{ height: (newsItems.length * 31) + 'px', position: 'relative' }">
                <div :style="{ transform: 'translateY(' + (newsVirtStart * 31) + 'px)', willChange: 'transform' }">
                  <div v-for="it in newsVirtRows" :key="it.id"
                       :class="['ft-wire-row', !it.read ? 'unread' : '', newsSelectedItem && newsSelectedItem.id === it.id ? 'on' : '']"
                       @click="selectNewsItem(it)">
                    <span class="ft-mono hint" style="font-size:11px">{{ formatNewsTime(it.published_at) }}</span>
                    <span style="display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden">
                      <span class="news-status-dot" :style="{ width:'6px', height:'6px', background: it.sentiment === 'bullish' ? 'var(--up)' : (it.sentiment === 'bearish' ? 'var(--down)' : '#64748b') }"></span>
                      <span style="font-size:11px;color:var(--primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.feed_name }}</span>
                    </span>
                    <span :class="['news-lang-badge', it.lang]" style="text-align:center">{{ it.lang }}</span>
                    <span class="ft-wire-title" :title="it.title_orig">
                      {{ newsViewMode === 'orig' ? it.title_orig : (it.title_zh || it.title_orig) }}
                      <span v-if="newsViewMode === 'bilingual' && it.title_zh && it.title_zh !== it.title_orig"
                            style="color:var(--muted-foreground);font-weight:400;margin-left:8px;font-size:11.5px">
                        {{ it.title_orig }}
                      </span>
                    </span>
                    <span class="ft-wire-ents" @click.stop>
                      <span v-if="it.cluster_count > 1" class="ft-ent-pill" style="color:var(--muted-foreground)">+{{ it.cluster_count - 1 }}</span>
                      <span v-for="e in (it.entities || []).slice(0, 2)" :key="e.name" class="ft-ent-pill"
                            @click="openEntityDossier(e.name)">{{ e.name }}</span>
                    </span>
                    <span class="ft-imp-bars" :title="'冲击烈度 ' + (it.impact || 0) + '/5'">
                      <i :class="{ on: (it.impact || 0) >= 1 }" style="height:5px"></i>
                      <i :class="{ on: (it.impact || 0) >= 3 }" style="height:8px"></i>
                      <i :class="{ on: (it.impact || 0) >= 4 }" style="height:11px"></i>
                    </span>
                    <span :class="['ft-sent-bar', it.sentiment || 'neutral']" :title="sentimentLabel(it.sentiment)"></span>
                  </div>
                </div>
              </div>
              <div v-if="newsItems.length" class="ft-mono hint" style="height:28px;display:flex;align-items:center;justify-content:center;font-size:11px">
                <span v-if="newsLoadingMore">加载中…</span>
                <span v-else-if="newsHasMore">↓ {{ newsItems.length }} / {{ newsTotal }}</span>
                <span v-else>共 {{ newsItems.length }} 条</span>
              </div>
            </div>

            <!-- 右侧滑出式阅读与 AI 研判栏 -->
            <aside v-if="newsSelectedItem" class="ft-wire-detail">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                <div class="news-card-meta">
                  <span :class="['news-lang-badge', newsSelectedItem.lang]">{{ newsSelectedItem.lang }}</span>
                  <span><b>{{ newsSelectedItem.feed_name }}</b></span>
                  <span>· {{ newsSelectedItem.category }}</span>
                  <span class="ft-mono">· {{ formatNewsTime(newsSelectedItem.published_at) }}</span>
                </div>
                <button type="button" class="ft-ico-btn" title="收起" aria-label="收起详情" @click="newsSelectedItem = null">×</button>
              </div>
              <div>
                <h3 style="margin:0;font-size:16px;line-height:1.45;color:var(--foreground)">
                  {{ newsSelectedItem.title_zh || newsSelectedItem.title_orig }}
                </h3>
                <div v-if="newsSelectedItem.title_zh && newsSelectedItem.title_zh !== newsSelectedItem.title_orig"
                     class="news-detail-orig-title" style="font-size:12.5px">
                  {{ newsSelectedItem.title_orig }}
                </div>
              </div>

              <div class="news-detail-actions">
                <button type="button" class="ft-icon-btn on" title="AI 研判" aria-label="AI 研判" @click="sendNewsToChat([newsSelectedItem])" v-html="ICO.robot"></button>
                <button v-if="newsSelectedItem.lang !== 'zh'" type="button" :class="['ft-icon-btn', newsDetailLoading ? 'on' : '']"
                        :title="newsSelectedItem.l2_status === 'done' ? '重新翻译全文' : '翻译全文'" aria-label="翻译全文"
                        @click="translateNewsFull(newsSelectedItem.id, true)" v-html="ICO.translate"></button>
                <button v-if="newsSelectedItem.url" type="button" class="ft-icon-btn" title="打开原文网页" aria-label="打开原文网页"
                        @click="openNewsInBrowser(newsSelectedItem.url)" v-html="ICO.external"></button>
                <button type="button" :class="['ft-icon-btn', newsSelectedItem.starred ? 'on' : '']" title="收藏" aria-label="收藏"
                        @click="toggleNewsStar(newsSelectedItem)" v-html="newsSelectedItem.starred ? ICO.starFill : ICO.star"></button>
              </div>

              <div v-if="(newsSelectedItem.entities && newsSelectedItem.entities.length) || (newsSelectedItem.tags && newsSelectedItem.tags.length)"
                   style="display:flex;gap:5px;flex-wrap:wrap">
                <a-tag v-for="e in (newsSelectedItem.entities || [])" :key="'de-' + e.name" color="blue"
                       style="cursor:pointer" @click="openEntityDossier(e.name)">
                  {{ e.name }} · {{ e.type || 'ORG' }}
                </a-tag>
                <a-tag v-for="tg in (newsSelectedItem.tags || [])" :key="'dt-' + tg">{{ tg }}</a-tag>
              </div>

              <div v-if="newsSelectedItem.cluster_items && newsSelectedItem.cluster_items.length" class="news-cluster-box">
                <div style="font-size:11.5px;font-weight:600;color:var(--foreground)">
                  相关报道 · {{ newsSelectedItem.cluster_items.length }}
                </div>
                <div v-for="sib in newsSelectedItem.cluster_items" :key="'sib-' + sib.id"
                     style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"
                     @click="selectNewsItem(sib)">
                  <span :class="['news-lang-badge', sib.lang]">{{ sib.lang }}</span>
                  <span class="hint">{{ sib.feed_name }}</span>
                  <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--primary)">
                    {{ sib.title_zh || sib.title_orig }}
                  </span>
                </div>
              </div>

              <div v-if="newsViewMode === 'bilingual'" style="display:flex;flex-direction:column;gap:10px">
                <div class="news-bilingual-col">
                  <div class="hint" style="margin-bottom:4px;font-weight:600">译文</div>
                  {{ newsSelectedItem.content_zh || newsSelectedItem.summary_zh || '点击上方翻译按钮可翻译全文' }}
                </div>
                <div class="news-bilingual-col">
                  <div class="hint" style="margin-bottom:4px;font-weight:600">原文</div>
                  {{ newsSelectedItem.content_orig || newsSelectedItem.summary_orig || '无原文正文' }}
                </div>
              </div>
              <div v-else-if="newsViewMode === 'orig'" class="news-detail-content" style="font-size:13px">
                {{ newsSelectedItem.content_orig || newsSelectedItem.summary_orig || '无原文正文' }}
              </div>
              <div v-else class="news-detail-content" style="font-size:13px">
                {{ newsSelectedItem.content_zh || newsSelectedItem.summary_zh || newsSelectedItem.content_orig || newsSelectedItem.summary_orig || '暂无正文' }}
              </div>
            </aside>
          </div>

          <div class="ft-statusbar ft-mono">
            <span>显示 {{ newsItems.length }} / {{ newsTotal }}</span>
            <span>未读 {{ newsStatus.unread || 0 }} · 收藏 {{ newsStatus.starred || 0 }}</span>
          </div>
        </div>
      </template>

      <div v-if="catalogAlive" v-show="tab === 'catalog'" class="cat-workspace">
          <!-- 左侧：Cursor 风格项目与多级文件树（支持下钻到文件与拖拽移动） -->
          <aside class="cat-tree-pane">
            <div class="cat-tree-head">
              <div class="cat-tree-head-left" @click="selectTreeScope('', '')" title="点击回到全部项目">
                <span class="tree-chev open" v-html="ICO.chevron"></span>
                <span class="cat-tree-head-title">{{ catProject || '管理器' }}</span>
              </div>
              <div class="cat-tree-tools">
                <button type="button" class="tree-tool-btn" title="在当前目录新增/导入文件"
                        @click="openIngestInScope(catProject, catFolder)" v-html="ICO.filePlus"></button>
                <button type="button" class="tree-tool-btn" title="在当前位置新建项目或子文件夹"
                        @click="openFolderModal(catProject, catFolder)" v-html="ICO.folderPlus"></button>
                <button type="button" class="tree-tool-btn" title="向上钻取一级目录"
                        :disabled="!catProject && !catFolder"
                        @click="drillUpTree" v-html="ICO.upLevel"></button>
                <button type="button" class="tree-tool-btn" title="刷新目录树"
                        @click="refreshCatalogTree" v-html="ICO.reload"></button>
                <button type="button" class="tree-tool-btn" title="全部展开 / 全部收起"
                        @click="toggleExpandCollapseAll" v-html="ICO.collapseAll"></button>
              </div>
            </div>
            <div class="cat-tree-scroll">
              <button type="button"
                      :class="['tree-node', !catProject && !catFolder && !activeTreeDocId ? 'on' : '']"
                      @click="selectTreeScope('', '')">
                <span class="tree-chev empty" v-html="ICO.chevron"></span>
                <span class="tree-node-ico" v-html="ICO.library"></span>
                <span class="tree-node-name">全部项目资料</span>
                <span class="tree-node-cnt">{{ stats.docs }}</span>
              </button>

              <div v-for="row in cursorTreeRows" :key="row.key"
                   :class="[
                     'tree-node',
                     row.kind === 'file' ? 'is-file' : '',
                     kbOff[row.project] ? 'kb-off' : '',
                     row.isSelected ? 'on' : '',
                     dropTargetKey === row.key ? 'drop-over' : '',
                   ]"
                   :draggable="row.kind === 'file' || row.kind === 'folder'"
                   @dragstart="onTreeDragStart($event, row)"
                   @dragover="onTreeDragOver($event, row)"
                   @dragleave="onTreeDragLeave($event, row)"
                   @drop="onTreeDrop($event, row)"
                   @dragend="onTreeDragEnd"
                   @click="onTreeRowClick(row)">
                <span class="tree-guides" v-if="row.depth > 0">
                  <span v-for="g in row.depth" :key="g" class="tree-guide"></span>
                </span>
                <span v-if="row.kind !== 'file'"
                      :class="['tree-chev', row.open ? 'open' : '', !row.hasChildren ? 'empty' : '']"
                      title="展开 / 收起下级"
                      @click.stop="toggleTreeNodeExpand(row)"
                      v-html="ICO.chevron"></span>
                <span v-else class="tree-chev empty" v-html="ICO.chevron"></span>

                <span v-if="row.kind === 'project'" class="tree-node-ico" v-html="ICO.project"></span>
                <span v-else-if="row.kind === 'folder'" class="tree-node-ico"
                      v-html="row.open ? ICO.folderOpen : ICO.folder"></span>
                <span v-else-if="row.kind === 'placeholder'" :class="['tree-spin', row.loading ? 'on' : '']"></span>
                <span v-else :class="['tree-file-dot', extBadgeClass(row.doc.file_ext)]">{{ extBadgeText(row.doc.file_ext) }}</span>

                <span class="tree-node-name" :title="row.tooltip">{{ row.name }}</span>
                <span v-if="row.kind === 'project' || row.kind === 'folder'" class="tree-node-cnt">{{ row.count }}</span>
                <span v-else-if="row.kind === 'placeholder'" class="tree-node-cnt">{{ row.status }}</span>

                <span class="tree-node-acts" @click.stop>
                  <template v-if="row.kind === 'project' || row.kind === 'folder'">
                    <button type="button" class="tree-act-btn" title="在此目录新增文件"
                            @click="openIngestInScope(row.project, row.folder)" v-html="ICO.filePlus"></button>
                    <button type="button" class="tree-act-btn" title="新建下级文件夹"
                            @click="openFolderModal(row.project, row.folder)" v-html="ICO.folderPlus"></button>
                    <button type="button" class="tree-act-btn" title="重命名"
                            @click="openRenameFolderModal(row.project, row.folder)" v-html="ICO.edit"></button>
                    <button type="button" class="tree-act-btn del" title="删除目录"
                            @click="removeFolderNode(row.project, row.folder, row.count)" v-html="ICO.trash"></button>
                  </template>
                  <template v-else-if="row.kind === 'file'">
                    <button type="button" class="tree-act-btn" title="编辑文件属性与目录"
                            @click="openEditMeta(row.doc)" v-html="ICO.edit"></button>
                    <button type="button" class="tree-act-btn del" title="删除文件"
                            @click="deleteDocRecord(row.doc)" v-html="ICO.trash"></button>
                  </template>
                </span>
                <button v-if="row.kind === 'project'" type="button"
                        :class="['tree-kb', kbOff[row.project] ? 'off' : '']"
                        :title="kbOff[row.project] ? '问答已关闭这个文库，文件仍可查看' : '问答会使用这个文库'"
                        @click.stop="toggleProjectKb(row)">
                  <span class="tree-kb-knob"></span>
                </button>
              </div>
            </div>
          </aside>

          <!-- 右侧：主视图（顶部路径工具栏 + 文件性质透视胶囊 + 多态/动态分列表格） -->
          <div class="cat-main-pane">
            <div class="cat-toolbar">
              <div class="cat-breadcrumb">
                <span :class="catProject ? 'cat-bc-crumb' : 'cat-bc-cur'" @click="selectTreeScope('', '')">全部项目</span>
                <template v-if="catProject">
                  <span>/</span>
                  <span :class="catFolder ? 'cat-bc-crumb' : 'cat-bc-cur'" @click="selectTreeScope(catProject, '')">{{ catProject }}</span>
                </template>
                <template v-if="catFolder">
                  <span>/</span>
                  <span class="cat-bc-cur">{{ catFolder }}</span>
                </template>
              </div>
              <span class="hint">{{ filteredDocs.length }} 份文件</span>
              <span class="spacer"></span>
              <a-input v-model:value="catQuery" allow-clear placeholder="筛选标题、文号、属性或摘要…"
                       class="cat-search-input" />
              <a-tooltip v-if="catProject" title="按主题与性质自动归入子文件夹">
                <a-button :loading="organizing" @click="organizeCurrentProject">
                  智能归档
                </a-button>
              </a-tooltip>
              <input ref="folderUploadInput" type="file" webkitdirectory directory multiple
                     style="display:none" @change="onFolderInputPicked" />
              <a-button class="cat-action-btn" @click="triggerFolderUpload">导入文件夹</a-button>
              <a-button class="cat-action-btn" type="primary" @click="openIngest()">导入文件</a-button>
            </div>

            <!-- 文件性质透视胶囊：混合视图使用多态属性列，选中单一性质时展开专属分列 -->
            <div class="type-capsules">
              <button type="button" :class="['type-cap', !catDocType ? 'on' : '']"
                      @click="setCatDocType('')">
                <span>混合视图</span>
                <span class="type-cap-cnt">{{ scopeTotalCount }}</span>
              </button>
              <button type="button" v-for="dt in scopeDocTypeCapsules" :key="dt.id"
                      :class="['type-cap', catDocType === dt.id ? 'on' : '']"
                      @click="setCatDocType(dt.id)">
                <span>{{ dt.label }}</span>
                <span class="type-cap-cnt">{{ dt.count }}</span>
              </button>
            </div>

            <div class="table-card" ref="tableCard">
              <a-table :data-source="catalogRows" :columns="dynamicColumns" row-key="id" size="middle"
                       :scroll="{ x: 980, y: tableY }"
                       :pagination="{ pageSize: 30, showSizeChanger: false, position: ['bottomCenter'] }"
                       :custom-row="rowClick">
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'title'">
                    <div v-if="record._placeholder" class="doc-cell-main ingest-ph">
                      <div class="doc-cell-top">
                        <span :class="['tree-spin', record._loading ? 'on' : '']"></span>
                        <span class="doc-title" :title="record.title">{{ record.title }}</span>
                        <span class="ingest-ph-status">{{ record._status }}</span>
                      </div>
                    </div>
                    <div v-else class="doc-cell-main">
                      <div class="doc-cell-top">
                        <span :class="['ext-badge', extBadgeClass(record.file_ext)]">{{ extBadgeText(record.file_ext) }}</span>
                        <a class="doc-title" :title="record.title || record.rel_path">{{ record.title || record.rel_path }}</a>
                      </div>
                      <div class="doc-sub-path" v-if="!catProject || !catFolder">
                        {{ record.project }}{{ record.folder ? ' / ' + record.folder : '' }}
                      </div>
                    </div>
                  </template>
                  <template v-else-if="column.key === 'doc_type'">
                    <a-tag :color="docTypeColor(record.doc_type)">{{ docTypeLabel(record.doc_type) }}</a-tag>
                  </template>
                  <template v-else-if="column.key === 'polymorphic'">
                    <div class="poly-wrap">
                      <div class="poly-pills" v-if="recordPills(record).length">
                        <span v-for="(p, pi) in recordPills(record)" :key="pi" class="poly-pill" :title="p.k + ': ' + p.v">
                          <span class="poly-pill-k">{{ p.k }}:</span>
                          <span class="poly-pill-v">{{ p.v }}</span>
                        </span>
                      </div>
                      <div class="poly-summary" v-if="recordSummary(record)" :title="recordSummary(record)">{{ recordSummary(record) }}</div>
                    </div>
                  </template>
                  <template v-else-if="column.key === 'chunk_info'">
                    <div class="chunk-stat-cell">
                      <span>
                        {{ record.n_chunks }} 块
                        <span v-if="record.n_table_chunks" class="chunk-type-badge table">表 {{ record.n_table_chunks }}</span>
                        <span v-if="record.n_image_chunks" class="chunk-type-badge image">图 {{ record.n_image_chunks }}</span>
                      </span>
                      <span class="chunk-prof-tag">{{ chunkProfileLabel(record.chunk_profile) }}</span>
                    </div>
                  </template>
                  <template v-else-if="column.key === 'status'">
                    <a-tag v-if="record.status !== '现行'" color="orange">{{ record.status }}</a-tag>
                    <a-tag v-else color="blue">{{ record.status }}</a-tag>
                  </template>
                  <template v-else-if="column.key.startsWith('meta.')">
                    <span>{{ recordMetaVal(record, column.key.slice(5)) }}</span>
                  </template>
                  <template v-else-if="column.key === 'n_chunks'">
                    <span>{{ record.n_chunks }}</span>
                    <span v-if="record.n_table_chunks" class="chunk-type-badge table">表{{ record.n_table_chunks }}</span>
                  </template>
                  <template v-else-if="column.key === 'op'">
                    <div class="doc-op" @click.stop>
                      <a-dropdown :trigger="['click']">
                        <a class="op-link" @click.prevent>操作</a>
                        <template #overlay>
                          <a-menu @click="(e) => onDocOp(e, record)">
                            <a-menu-item key="edit_meta">编辑属性 / 归类</a-menu-item>
                            <a-menu-item key="update">重新上传文件</a-menu-item>
                            <a-menu-divider v-if="record.doc_type === 'regulation'" />
                            <a-menu-item v-if="record.doc_type === 'regulation' && record.status !== '现行'" key="现行">标为现行</a-menu-item>
                            <a-menu-item v-if="record.doc_type === 'regulation' && record.status !== '试行'" key="试行">标为试行</a-menu-item>
                            <a-menu-item v-if="record.doc_type === 'regulation' && record.status !== '已废止'" key="已废止">标为废止</a-menu-item>
                            <a-menu-divider />
                            <a-menu-item key="delete" style="color:#dc2626">删除</a-menu-item>
                          </a-menu>
                        </template>
                      </a-dropdown>
                    </div>
                  </template>
                </template>
              </a-table>
            </div>
          </div>
        </div>

      <template v-if="tab === 'settings'">
        <div class="settings">
          <div class="oc-settings-wrap">
            <div class="oc-settings-inner">
              <aside class="oc-sider">
                <button type="button" class="oc-back-btn" @click="exitSettings">
                  <span v-html="ICO.left"></span>
                  <span>返回应用</span>
                </button>
                <div class="oc-search-box">
                  <span class="oc-search-ico" v-html="ICO.search"></span>
                  <input v-model="settingsSearch" type="text" class="oc-search-input" placeholder="搜索设置项…" />
                  <button v-if="settingsSearch" type="button" class="oc-search-clear" @click="settingsSearch = ''">
                    <span v-html="ICO.close"></span>
                  </button>
                </div>
                <nav class="oc-nav">
                  <div v-for="(grp, gi) in ocSettingsGroups" :key="gi" class="oc-nav-group">
                    <button v-for="item in grp" :key="item.key" type="button"
                            :class="[
                              'oc-nav-item',
                              !settingsSearch.trim() && settingsSection === item.key ? 'on' : '',
                              settingsSearch.trim() && isNavMatched(item.key) ? 'on' : '',
                              settingsSearch.trim() && !isNavMatched(item.key) ? 'dim' : '',
                            ]"
                            @click="selectSettingsNav(item.key)">
                      <span class="oc-nav-ico" v-html="item.icon"></span>
                      <span>{{ item.label }}</span>
                      <span v-if="item.badge && item.badge()" class="oc-nav-badge">{{ item.badge() }}</span>
                    </button>
                  </div>
                </nav>
              </aside>

              <main class="oc-main" :class="{ switching: settingsOn }">
                <div class="oc-main-container">
                  <div v-if="!settingsSearch.trim()" class="oc-page-head">
                    <div>
                      <h2>{{ ocActiveMeta.title }}</h2>
                      <p>{{ ocActiveMeta.desc }}</p>
                    </div>
                    <div class="oc-head-right">
                      <span v-if="cfgSaveHint" class="oc-save-pill">{{ cfgSaveHint }}</span>
                    </div>
                  </div>
                  <div v-else class="oc-page-head">
                    <div>
                      <h2>搜索结果：“{{ settingsSearch.trim() }}”</h2>
                      <p>点击左侧任一分类可退出搜索并查看完整分组</p>
                    </div>
                    <div class="oc-head-right">
                      <a-button size="small" @click="settingsSearch = ''">清除搜索</a-button>
                    </div>
                  </div>

                  <!-- 1. 偏好设置 (general) -->
                  <template v-if="showSettingsSec('general')">
                    <div class="oc-group">
                      <h4 class="oc-group-title">常规</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">界面布局</div>
                            <div class="oc-row-desc">选择在工作区与会话之间切换以及跟踪运行中任务的方式</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <div class="oc-layout-cards">
                              <!-- Card 1: 顶部标签页 (topbar) -->
                              <button type="button" :class="['oc-layout-card', cfg.ui_density === 'topbar' ? 'on' : '']"
                                      @click="cfg.ui_density = 'topbar'">
                                <div class="oc-layout-preview oc-prev-topbar">
                                  <div class="oc-prev-topstrip">
                                    <span class="oc-wire-pill on"></span>
                                    <span class="oc-wire-pill"></span>
                                    <span class="oc-wire-pill"></span>
                                  </div>
                                  <div class="oc-prev-body">
                                    <span class="oc-wire-line"></span>
                                    <span class="oc-wire-line short"></span>
                                  </div>
                                </div>
                                <span class="oc-layout-label">顶部标签页</span>
                              </button>

                              <!-- Card 2: 侧边标签页 (default / sidebar) -->
                              <button type="button" :class="['oc-layout-card', (!cfg.ui_density || cfg.ui_density === 'default' || cfg.ui_density === 'comfortable') ? 'on' : '']"
                                      @click="cfg.ui_density = 'default'">
                                <div class="oc-layout-preview oc-prev-sidebar">
                                  <div class="oc-prev-sidecol">
                                    <span class="oc-wire-pill on"></span>
                                    <span class="oc-wire-pill"></span>
                                    <span class="oc-wire-pill"></span>
                                  </div>
                                  <div class="oc-prev-body">
                                    <span class="oc-wire-line"></span>
                                    <span class="oc-wire-line short"></span>
                                  </div>
                                </div>
                                <span class="oc-layout-label">侧边标签页</span>
                              </button>

                              <!-- Card 3: 收件箱 / 紧凑 (compact) -->
                              <button type="button" :class="['oc-layout-card', cfg.ui_density === 'compact' ? 'on' : '']"
                                      @click="cfg.ui_density = 'compact'">
                                <div class="oc-layout-preview oc-prev-inbox">
                                  <div class="oc-prev-inboxcol">
                                    <span class="oc-prev-dotrow"><i class="dot-b"></i><b></b></span>
                                    <span class="oc-prev-dotrow"><i class="dot-g"></i><b></b></span>
                                    <span class="oc-prev-dotrow"><i class="dot-o"></i><b></b></span>
                                    <span class="oc-prev-dotrow"><i class="dot-b"></i><b></b></span>
                                  </div>
                                  <div class="oc-prev-body">
                                    <span class="oc-wire-line"></span>
                                    <span class="oc-wire-line short"></span>
                                  </div>
                                </div>
                                <span class="oc-layout-label">收件箱</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">默认启动页面</div>
                            <div class="oc-row-desc">选择启动 O2 桌面端或刷新工作区时的默认落点视图</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-select v-model:value="cfg.default_tab" style="width: 170px">
                              <a-select-option value="ask">智能问答</a-select-option>
                              <a-select-option v-if="cfg.news_enabled" value="dashboard">终端看板</a-select-option>
                              <a-select-option v-if="cfg.news_enabled" value="news">新闻流</a-select-option>
                              <a-select-option value="search">多模态检索</a-select-option>
                              <a-select-option value="catalog">文件与目录库</a-select-option>
                              <a-select-option value="browser">内置浏览器</a-select-option>
                            </a-select>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">后续消息行为</div>
                            <div class="oc-row-desc">选择在回答生成中继续发送消息时是引导当前轮次还是排入队列</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-select v-model:value="cfg.followup_mode" style="width: 170px">
                              <a-select-option value="steer">引导当前轮次</a-select-option>
                              <a-select-option value="queue">加入等待队列</a-select-option>
                            </a-select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="oc-group">
                      <h4 class="oc-group-title">工具与权限</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">内置浏览器</div>
                            <div class="oc-row-desc">允许 AI 在问答界面同屏展开共享浏览器窗口，模拟操作网页与查询实时信息</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-switch v-model:checked="cfg.browser" />
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">命令行终端</div>
                            <div class="oc-row-desc">允许 AI 调用本机终端查看目录状态或运行数据处理脚本</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-switch v-model:checked="cfg.shell" />
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">外部接口调用</div>
                            <div class="oc-row-desc">允许 AI 根据已登记的外部连接器自动发起接口请求</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-switch v-model:checked="cfg.api_call" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="oc-group">
                      <h4 class="oc-group-title">批量导入</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">并发通道数</div>
                            <div class="oc-row-desc">批量导入多份文件或文件夹时的并行解析任务数量</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-select v-model:value="cfg.batch_concurrency" style="width: 170px">
                              <a-select-option :value="1">1 路</a-select-option>
                              <a-select-option :value="2">2 路</a-select-option>
                              <a-select-option :value="3">3 路</a-select-option>
                              <a-select-option :value="4">4 路</a-select-option>
                              <a-select-option :value="6">6 路</a-select-option>
                            </a-select>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">快速元数据识别</div>
                            <div class="oc-row-desc">使用本地高速规则提取文号、日期与摘要，跳过远程模型调用以加速大批量入库</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-switch v-model:checked="cfg.batch_fast_meta" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 2. 外观与参数 (appearance) -->
                  <template v-if="showSettingsSec('appearance')">
                    <div class="oc-group">
                      <h4 class="oc-group-title">主题</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">外观模式</div>
                            <div class="oc-row-desc">在浅色界面与深色终端界面之间切换</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-select v-model:value="cfg.ui_theme" style="width: 170px">
                              <a-select-option value="light">浅色</a-select-option>
                              <a-select-option value="dark">深色</a-select-option>
                            </a-select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="oc-group">
                      <h4 class="oc-group-title">生成与检索参数</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">默认思考深度</div>
                            <div class="oc-row-desc">控制推理模型在回答前的思考强度</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-select v-model:value="cfg.effort" style="width: 170px">
                              <a-select-option v-for="e in EFFORTS" :key="e.id" :value="e.id">{{ e.label }}</a-select-option>
                            </a-select>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">生成温度</div>
                            <div class="oc-row-desc">数值越低回答越严谨稳定，制度与数据核对建议保持 0.0 ~ 0.1</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-select v-model:value="cfg.temperature" style="width: 170px">
                              <a-select-option :value="0">0.0 严谨</a-select-option>
                              <a-select-option :value="0.1">0.1 精准</a-select-option>
                              <a-select-option :value="0.3">0.3 均衡</a-select-option>
                              <a-select-option :value="0.7">0.7 发散</a-select-option>
                            </a-select>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">单次检索片段数</div>
                            <div class="oc-row-desc">每次检索注入上下文的高相关文档切片数量</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-select v-model:value="cfg.top_k" style="width: 170px">
                              <a-select-option :value="6">6 条</a-select-option>
                              <a-select-option :value="8">8 条</a-select-option>
                              <a-select-option :value="12">12 条</a-select-option>
                              <a-select-option :value="16">16 条</a-select-option>
                            </a-select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 3. 快捷键 (shortcuts) -->
                  <template v-if="showSettingsSec('shortcuts')">
                    <div class="oc-group">
                      <div class="oc-group-head">
                        <div>
                          <h4 class="oc-group-title" style="margin-bottom:2px">快捷键</h4>
                          <span class="hint" style="font-size:12px">右键点击任意可编辑项即可录制新快捷键</span>
                        </div>
                        <a-button size="small" :disabled="!hasCustomShortcuts" @click="resetAllShortcuts">恢复默认</a-button>
                      </div>
                    </div>

                    <div v-for="grp in shortcutGroups" :key="grp.key" class="oc-group">
                      <h4 class="oc-group-title">{{ grp.title }}</h4>
                      <div class="oc-card">
                        <div v-for="s in grp.items" :key="s.id"
                             :class="['oc-row', s.editable ? 'oc-kbd-editable' : '']"
                             :title="s.editable ? '右键录制新快捷键' : '固定手势'"
                             @contextmenu="s.editable && onShortcutContext($event, s)">
                          <div class="oc-row-info">
                            <div class="oc-row-title">{{ s.title }}</div>
                            <div class="oc-row-desc">{{ s.desc }}</div>
                          </div>
                          <div class="oc-row-ctrl" style="display:flex;align-items:center;gap:8px">
                            <button v-if="s.editable && isShortcutModified(s.id) && recordingShortcutId !== s.id"
                                    type="button" class="oc-kbd-reset-btn" @click.stop="resetShortcut(s.id)">重置</button>
                            <span v-if="recordingShortcutId === s.id" class="oc-kbd-recording">
                              <span>按下新快捷键，Esc 取消</span>
                            </span>
                            <span v-else class="oc-kbd-group">
                              <template v-for="(tok, idx) in shortcutTokens(getShortcutCombo(s.id))" :key="idx">
                                <span v-if="idx > 0">+</span>
                                <kbd class="oc-kbd">{{ tok }}</kbd>
                              </template>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 4. 提供商 (llm) -->
                  <template v-if="showSettingsSec('llm')">
                    <div class="oc-group">
                      <div class="oc-group-head">
                        <h4 class="oc-group-title">服务商渠道</h4>
                        <a-button size="small" type="primary" @click="openAddProvider">添加渠道</a-button>
                      </div>
                      <div class="oc-chip-bar" style="padding:2px 0 4px">
                        <button type="button" v-for="p in cfg.providers" :key="p.id"
                                :class="['oc-chip', settingsPid === p.id ? 'on' : '']"
                                @click="settingsPid = p.id">
                          <span :class="['oc-chip-dot', p.api_key_set ? 'ok' : '']"></span>
                          <span>{{ p.name }}</span>
                        </button>
                      </div>

                      <div class="oc-card" v-if="currentProvider">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>{{ currentProvider.name }}</span>
                              <span :class="['oc-stat-badge', currentProvider.api_key_set ? 'ok' : '']">
                                {{ currentProvider.api_key_set ? '已配置密钥' : '未配置密钥' }}
                              </span>
                            </div>
                            <div class="oc-row-desc">配置接口地址、通信协议与访问密钥</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-button size="small" danger @click="removeProvider(currentProvider)">删除渠道</a-button>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">Base URL</div>
                            <div class="oc-row-desc">服务端接口根地址，留空则使用官方默认地址</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <a-input v-model:value="currentProvider.base_url"
                                     :placeholder="urlPlaceholder(currentProvider)" />
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">API 协议格式</div>
                            <div class="oc-row-desc">与该提供商通信所使用的请求与流式解析标准</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <a-select v-model:value="currentProvider.protocol" style="width: 100%">
                              <a-select-option v-for="o in protocols" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
                            </a-select>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">API Key</div>
                            <div class="oc-row-desc">输入后按回车或移开焦点即自动加密保存至本地配置</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <div class="field-with-action" style="width:100%">
                              <a-input-password v-model:value="currentProvider.api_key"
                                :placeholder="currentProvider.api_key_set ? '已保存，留空则不修改' : '输入 API Key'"
                                @blur="saveProviderKey(currentProvider)" @pressEnter="saveProviderKey(currentProvider)" />
                              <a-button v-if="currentProvider.api_key_set" danger @click="clearProviderKey(currentProvider)">清除</a-button>
                            </div>
                          </div>
                        </div>

                        <div class="oc-row oc-row-stack">
                          <div class="model-list-head" style="margin-bottom:4px">
                            <div>
                              <div class="oc-row-title">渠道可用模型列表</div>
                              <div class="oc-row-desc">添加或同步模型后，即可在对话顶部或「模型」设置中选用</div>
                            </div>
                            <div class="model-list-actions">
                              <a-button size="small" v-if="currentProvider.api_key_set" @click="syncProviderModels(currentProvider)">同步列表</a-button>
                              <a-button size="small" type="primary" @click="openAddModel">添加模型</a-button>
                            </div>
                          </div>
                          <div v-if="!(currentProvider.models && currentProvider.models.length)" class="model-empty">
                            <span class="model-empty-ico" v-html="ICO.info"></span>
                            <span>当前渠道还没有模型，点击「同步列表」或「添加模型」后即可选用。</span>
                          </div>
                          <div v-else class="model-rows">
                            <div v-for="m in currentProvider.models" :key="m.id" class="model-row">
                              <div class="model-row-main">
                                <b>{{ m.label || m.id }}</b>
                                <span v-if="m.label && m.label !== m.id" class="hint">{{ m.id }}</span>
                              </div>
                              <div style="display:flex;align-items:center;gap:10px">
                                <span v-if="cfg.model === m.id && cfg.provider_id === currentProvider.id" class="oc-stat-badge ok">当前默认</span>
                                <button v-else-if="currentProvider.api_key_set" type="button" class="op-link" style="border:0;background:none"
                                        @click="cfg.provider_id = currentProvider.id; cfg.model = m.id; loadModels()">设为默认</button>
                                <button type="button" class="model-row-del" @click="removeProviderModel(currentProvider, m.id)">删除</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 5. 模型 (models) -->
                  <template v-if="showSettingsSec('models')">
                    <div class="oc-group">
                      <h4 class="oc-group-title">默认对话与入库识别模型</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">当前主力问答模型</div>
                            <div class="oc-row-desc">用于智能问答、多轮工具调用及新文档入库时的结构化属性抽取</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <a-select v-if="modelList.length" :value="cfg.provider_id + '::' + cfg.model"
                                      style="width: 100%" @change="onSettingsModelPick">
                              <a-select-option v-for="m in modelList" :key="m.provider_id + '::' + m.id" :value="m.provider_id + '::' + m.id">
                                {{ m.provider }} · {{ m.label || m.id }}
                              </a-select-option>
                            </a-select>
                            <a-button v-else size="small" type="primary" @click="selectSettingsNav('llm')">前往配置提供商密钥</a-button>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">默认思考深度</div>
                            <div class="oc-row-desc">新建对话时的默认推理强度，也可在对话输入框底部随时切换</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-select v-model:value="cfg.effort" style="width: 170px">
                              <a-select-option v-for="e in EFFORTS" :key="e.id" :value="e.id">{{ e.label }}</a-select-option>
                            </a-select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="oc-group" v-if="modelList.length">
                      <h4 class="oc-group-title">已启用模型 · {{ modelList.length }}</h4>
                      <div class="oc-card">
                        <div v-for="m in modelList" :key="m.provider_id + '::' + m.id" class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>{{ m.label || m.id }}</span>
                              <span class="oc-stat-badge">{{ m.provider }}</span>
                              <span v-if="m.reasoning" class="oc-stat-badge">推理</span>
                              <span v-if="m.image" class="oc-stat-badge">视觉</span>
                              <span v-if="m.context_label" class="oc-stat-badge">{{ m.context_label }}</span>
                            </div>
                            <div class="oc-row-desc">{{ m.id }}</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <span v-if="cfg.model === m.id && cfg.provider_id === m.provider_id" class="oc-stat-badge ok">正在使用</span>
                            <a-button v-else size="small" @click="cfg.provider_id = m.provider_id; cfg.model = m.id">设为默认</a-button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 6. 向量引擎 (embed) -->
                  <template v-if="showSettingsSec('embed')">
                    <div class="oc-group">
                      <h4 class="oc-group-title">语义向量检索</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>启用语义向量检索</span>
                              <span :class="['oc-stat-badge', cfg.embed_use ? 'ok' : '']">{{ embedStatusText }}</span>
                            </div>
                            <div class="oc-row-desc">开启后系统会在后台自动为知识库切片构建并同步语义向量，实现关键词与语义混合检索</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-switch v-model:checked="cfg.embed_use" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="oc-group">
                      <div class="oc-group-head">
                        <h4 class="oc-group-title">向量渠道与模型</h4>
                        <a-button size="small" type="primary" @click="openAddEmbedProvider">添加渠道</a-button>
                      </div>
                      <div class="oc-chip-bar" style="padding:2px 0 4px">
                        <button type="button" v-for="p in cfg.embed_providers" :key="p.id"
                                :class="['oc-chip', settingsEmbedPid === p.id ? 'on' : '']"
                                @click="selectEmbedChannel(p)">
                          <span>{{ p.name }}</span>
                        </button>
                      </div>

                      <div class="oc-card" v-if="currentEmbedProvider">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>{{ currentEmbedProvider.name }}</span>
                              <span :class="['oc-stat-badge', currentEmbedProvider.api_key_set ? 'ok' : '']">
                                {{ currentEmbedProvider.api_key_set ? '已启用' : '未配置' }}
                              </span>
                            </div>
                            <div class="oc-row-desc">用于对知识库切片进行批量向量编码</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-button size="small" danger @click="removeEmbedProvider(currentEmbedProvider)">删除渠道</a-button>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">Base URL</div>
                            <div class="oc-row-desc">向量化接口根地址</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <a-input v-model:value="currentEmbedProvider.base_url"
                                     :placeholder="embedUrlPlaceholder(currentEmbedProvider)" />
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">API 格式</div>
                            <div class="oc-row-desc">支持 OpenAI 兼容标准与通义 DashScope 原生格式</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <a-select v-model:value="currentEmbedProvider.protocol" style="width: 100%">
                              <a-select-option v-for="o in embedProtocols" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
                            </a-select>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">API Key</div>
                            <div class="oc-row-desc">该向量渠道的访问密钥</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <div class="field-with-action" style="width:100%">
                              <a-input-password v-model:value="currentEmbedProvider.api_key"
                                :placeholder="currentEmbedProvider.api_key_set ? '已保存，留空则不修改' : '输入 API Key'"
                                @blur="saveEmbedKey(currentEmbedProvider)" @pressEnter="saveEmbedKey(currentEmbedProvider)" />
                              <a-button v-if="currentEmbedProvider.api_key_set" danger @click="clearEmbedKey(currentEmbedProvider)">清除</a-button>
                            </div>
                          </div>
                        </div>

                        <div class="oc-row" v-if="currentEmbedProvider.models && currentEmbedProvider.models.length">
                          <div class="oc-row-info">
                            <div class="oc-row-title">当前向量模型</div>
                            <div class="oc-row-desc">切换模型后系统会自动按新模型同步向量索引</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <a-select v-model:value="cfg.embed_model" style="width: 100%"
                                      @change="cfg.embed_provider_id = currentEmbedProvider.id">
                              <a-select-option v-for="m in currentEmbedProvider.models" :key="m.id" :value="m.id">
                                {{ m.label || m.id }}
                              </a-select-option>
                            </a-select>
                          </div>
                        </div>

                        <div class="oc-row oc-row-stack">
                          <div class="model-list-head" style="margin-bottom:4px">
                            <div>
                              <div class="oc-row-title">向量模型列表</div>
                              <div class="oc-row-desc">点击任意一行即可选为当前生效模型</div>
                            </div>
                            <div class="model-list-actions">
                              <a-button size="small" v-if="currentEmbedProvider.api_key_set" @click="syncEmbedModels(currentEmbedProvider)">同步列表</a-button>
                              <a-button size="small" type="primary" @click="openAddEmbedModel">添加模型</a-button>
                            </div>
                          </div>
                          <div v-if="!(currentEmbedProvider.models && currentEmbedProvider.models.length)" class="model-empty">
                            <span class="model-empty-ico" v-html="ICO.info"></span>
                            <span>当前没有配置模型，添加后可用于向量化。</span>
                          </div>
                          <div v-else class="model-rows">
                            <div v-for="m in currentEmbedProvider.models" :key="m.id"
                                 :class="['model-row', 'is-pick', cfg.embed_model === m.id ? 'on' : '']"
                                 @click="cfg.embed_model = m.id; cfg.embed_provider_id = currentEmbedProvider.id">
                              <div class="model-row-main">
                                <b>{{ m.label || m.id }}</b>
                                <span v-if="m.label && m.label !== m.id" class="hint">{{ m.id }}</span>
                              </div>
                              <div style="display:flex;align-items:center;gap:10px">
                                <span v-if="cfg.embed_model === m.id" class="oc-stat-badge ok">当前选用</span>
                                <button type="button" class="model-row-del" @click.stop="removeEmbedModel(currentEmbedProvider, m.id)">删除</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 7. 外部 API (api) -->
                  <template v-if="showSettingsSec('api')">
                    <div class="oc-group">
                      <div class="oc-group-head">
                        <h4 class="oc-group-title">外部 API 连接器 · {{ (cfg.api_connectors || []).length }}</h4>
                        <a-button size="small" type="primary" @click="openAddApiConnector">添加连接</a-button>
                      </div>
                      <div class="oc-card oc-card-pad settings-llm" style="padding:0;overflow:hidden">
                        <div class="provider-layout" style="border:0;border-radius:0">
                          <div class="provider-nav" style="background:#f4f4f3">
                            <div class="provider-list api-provider-list">
                              <span class="slide-pill" :style="apiPillStyle"></span>
                              <section v-for="g in apiConnectorGroups" :key="g.id" class="provider-group">
                                <div class="provider-group-label">{{ g.label }}</div>
                                <div class="provider-group-items">
                                  <button type="button" v-for="c in g.items" :key="c.id"
                                          :ref="(el) => bindApiConnector(c.id, el)"
                                          :class="['provider-item', settingsApiId === c.id ? 'on' : '']"
                                          @click="settingsApiId = c.id">
                                    <span class="provider-item-name">{{ c.name }}</span>
                                    <span class="provider-item-state">{{ apiConnectorStateText(c) }}</span>
                                  </button>
                                </div>
                              </section>
                            </div>
                          </div>
                          <div class="provider-form" v-if="currentApiConnector">
                            <a-form layout="vertical">
                              <div class="form-grid-2">
                                <a-form-item label="连接名称">
                                  <a-input v-model:value="currentApiConnector.name" placeholder="如 FRED、高德天气、企业ERP" />
                                </a-form-item>
                                <a-form-item label="API 协议">
                                  <a-select v-model:value="currentApiConnector.protocol">
                                    <a-select-option v-for="o in apiProtocols" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
                                  </a-select>
                                </a-form-item>
                              </div>
                              <a-form-item label="Base URL">
                                <div class="field-with-action">
                                  <a-input v-model:value="currentApiConnector.base_url" placeholder="https://api.example.com" />
                                  <a-button :loading="apiDiscovering" @click="discoverIntoConnector(currentApiConnector)">解析 OpenAPI</a-button>
                                </div>
                              </a-form-item>
                              <div class="form-grid-2">
                                <a-form-item label="鉴权方式">
                                  <a-select v-model:value="currentApiConnector.auth_type">
                                    <a-select-option v-for="o in apiAuthTypes" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
                                  </a-select>
                                </a-form-item>
                                <a-form-item v-if="currentApiConnector.auth_type === 'bearer'" label="Authorization 前缀">
                                  <a-input v-model:value="currentApiConnector.auth_prefix" placeholder="Bearer" />
                                </a-form-item>
                                <a-form-item v-else-if="currentApiConnector.auth_type === 'header' || currentApiConnector.auth_type === 'hmac_sha256'" label="密钥 Header 名">
                                  <a-input v-model:value="currentApiConnector.header_name" placeholder="X-Api-Key" />
                                </a-form-item>
                                <a-form-item v-else-if="currentApiConnector.auth_type === 'query'" label="密钥 Query 参数名">
                                  <a-input v-model:value="currentApiConnector.query_name" placeholder="api_key" />
                                </a-form-item>
                                <a-form-item v-else-if="currentApiConnector.auth_type === 'oauth2_client_credentials'" label="OAuth2 Token URL">
                                  <a-input v-model:value="currentApiConnector.token_url" placeholder="https://example.com/oauth/token" />
                                </a-form-item>
                              </div>
                              <a-form-item v-if="currentApiConnector.auth_type !== 'none'" :label="apiKeyLabel(currentApiConnector.auth_type)">
                                <div class="field-with-action">
                                  <a-input-password v-model:value="currentApiConnector.api_key"
                                    :placeholder="currentApiConnector.api_key_set ? '已保存，留空保持不变' : '填入密钥，运行时自动注入'"
                                    @blur="saveApiConnectorKey(currentApiConnector)" @pressEnter="saveApiConnectorKey(currentApiConnector)" />
                                  <a-button v-if="currentApiConnector.api_key_set" danger @click="clearApiConnectorKey(currentApiConnector)">清除</a-button>
                                </div>
                              </a-form-item>
                              <a-form-item v-if="needsApiSecret(currentApiConnector.auth_type)" :label="apiSecretLabel(currentApiConnector.auth_type)">
                                <div class="field-with-action">
                                  <a-input-password v-model:value="currentApiConnector.api_secret"
                                    :placeholder="currentApiConnector.api_secret_set ? '已保存，留空保持不变' : '填入 Secret / 密码'"
                                    @blur="saveApiConnectorSecret(currentApiConnector)" @pressEnter="saveApiConnectorSecret(currentApiConnector)" />
                                  <a-button v-if="currentApiConnector.api_secret_set" danger @click="clearApiConnectorSecret(currentApiConnector)">清除</a-button>
                                </div>
                              </a-form-item>
                              <div v-if="currentApiConnector.auth_type === 'hmac_sha256'" class="form-grid-2">
                                <a-form-item label="签名参数 / 头名称">
                                  <a-input v-model:value="currentApiConnector.signature_param" placeholder="signature" />
                                </a-form-item>
                                <a-form-item label="签名位置与编码">
                                  <a-input-group compact>
                                    <a-select v-model:value="currentApiConnector.signature_in" style="width: 50%">
                                      <a-select-option value="query">Query 参数</a-select-option>
                                      <a-select-option value="header">HTTP Header</a-select-option>
                                    </a-select>
                                    <a-select v-model:value="currentApiConnector.signature_encoding" style="width: 50%">
                                      <a-select-option value="hex">Hex</a-select-option>
                                      <a-select-option value="base64">Base64</a-select-option>
                                    </a-select>
                                  </a-input-group>
                                </a-form-item>
                              </div>
                              <div class="form-grid-2">
                                <a-form-item label="数据分类">
                                  <a-select v-model:value="currentApiConnector.category">
                                    <a-select-option v-for="o in apiCategories" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
                                  </a-select>
                                </a-form-item>
                                <a-form-item label="连接策略">
                                  <div style="display:flex;gap:16px;padding-top:5px">
                                    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
                                      <a-switch size="small" v-model:checked="currentApiConnector.preferred" />
                                      <span>优先使用</span>
                                    </label>
                                    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
                                      <a-switch size="small" v-model:checked="currentApiConnector.allow_write" />
                                      <span>允许写入</span>
                                    </label>
                                  </div>
                                </a-form-item>
                              </div>
                              <a-form-item label="给 AI 的使用说明">
                                <a-textarea v-model:value="currentApiConnector.notes" :auto-size="{ minRows: 3, maxRows: 8 }"
                                  placeholder="写明接口用途、路径、必填/选填参数及示例。" />
                              </a-form-item>
                              <a-form-item v-if="currentApiConnector.endpoints && currentApiConnector.endpoints.length" label="已登记端点">
                                <div class="model-rows">
                                  <div v-for="(ep, ei) in currentApiConnector.endpoints" :key="ei" class="model-row">
                                    <div class="model-row-main">
                                      <b>{{ ep.method }} {{ ep.path }}</b>
                                      <span v-if="ep.summary || ep.params" class="hint">{{ [ep.summary, ep.params ? ('参数: ' + ep.params) : ''].filter(Boolean).join(' · ') }}</span>
                                    </div>
                                    <button type="button" class="model-row-del" @click="removeApiEndpoint(currentApiConnector, ei)">移除</button>
                                  </div>
                                </div>
                              </a-form-item>
                            </a-form>
                            <div class="provider-form-foot">
                              <div class="model-list-actions">
                                <a-button :loading="apiTesting" @click="testApiConnector(currentApiConnector)">测试连接</a-button>
                                <span v-if="apiTestHint" class="hint">{{ apiTestHint }}</span>
                              </div>
                              <a-button danger @click="removeApiConnector(currentApiConnector)">删除连接</a-button>
                            </div>
                          </div>
                          <div class="provider-form" v-else>
                            <div class="model-empty">
                              <span class="model-empty-ico" v-html="ICO.info"></span>
                              <span>暂无连接，点击右上角「+ 添加连接」开始。</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 7.5 新闻流与情报终端 (news) -->
                  <template v-if="showSettingsSec('news')">
                    <div class="oc-group">
                      <h4 class="oc-group-title">情报终端与抓取策略</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>启用情报与行情终端</span>
                              <span :class="['oc-stat-badge', cfg.news_enabled ? 'ok' : '']">
                                {{ cfg.news_enabled ? '已启用' : '已关闭' }}
                              </span>
                            </div>
                            <div class="oc-row-desc">开启后侧边栏显示看板、行情与新闻流，关闭时后台零网络与算力消耗</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-switch v-model:checked="cfg.news_enabled" />
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">自动翻译与实体抽取</div>
                            <div class="oc-row-desc">抓取外文快讯后在后台自动完成中文摘要翻译、实体抽取与情绪评估，中文源直接提取零模型消耗</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-switch v-model:checked="cfg.news_auto_translate" />
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">定时抓取频率</div>
                            <div class="oc-row-desc">启用新闻流后按设定间隔在后台增量同步订阅源</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-select v-model:value="cfg.news_refresh_minutes" style="width: 170px">
                              <a-select-option :value="5">每 5 分钟</a-select-option>
                              <a-select-option :value="15">每 15 分钟</a-select-option>
                              <a-select-option :value="30">每 30 分钟</a-select-option>
                              <a-select-option :value="60">每 60 分钟</a-select-option>
                              <a-select-option :value="0">仅手动刷新</a-select-option>
                            </a-select>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">RSSHub 网关地址</div>
                            <div class="oc-row-desc">填写公共或自建 RSSHub 地址，自动解析 rsshub:// 订阅路由</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <a-input v-model:value="cfg.news_rsshub_base" placeholder="https://rsshub.app" />
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">本地跨语种向量与语义去重</div>
                            <div class="oc-row-desc">抓取后在后台自动生成跨语种向量并折叠同事件重复报道，无需消耗远程 API</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-switch v-model:checked="cfg.news_local_embed" />
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">本地混合检索精排</div>
                            <div class="oc-row-desc">向量与全文融合召回后使用本地跨语种重排模型提升相关性</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-switch v-model:checked="cfg.news_local_rerank" />
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">索引维护</div>
                            <div class="oc-row-desc">代表稿 {{ newsStatus.items_total || 0 }} 条 · 已去重折叠 {{ newsStatus.dedup_saved || 0 }} 条 · 向量索引 {{ (newsStatus.engine && newsStatus.engine.vec_docs) || 0 }} 条</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-button size="small" :loading="newsReindexing" @click="reindexNewsAll">重建索引</a-button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="oc-group">
                      <h4 class="oc-group-title">行情数据源与代理</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">行情主源</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <a-select v-model:value="cfg.market_source_mode" style="width: 100%">
                              <a-select-option value="auto">全球 Yahoo + A 股 Tushare</a-select-option>
                              <a-select-option value="yfinance">Yahoo 优先</a-select-option>
                              <a-select-option value="tushare">Tushare 优先</a-select-option>
                            </a-select>
                          </div>
                        </div>
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>行情代理地址</span>
                              <span v-if="cfg.detected_system_proxy" class="oc-stat-badge ok">{{ cfg.detected_system_proxy }}</span>
                            </div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <div class="field-with-action" style="width:100%">
                              <a-input v-model:value="cfg.market_proxy"
                                       :placeholder="cfg.detected_system_proxy ? ('自动: ' + cfg.detected_system_proxy) : '留空自动使用系统代理'" />
                              <button type="button" :class="['ft-icon-btn', mktProxyTesting ? 'on' : '']"
                                      style="width:32px;height:32px" title="测试连通性" aria-label="测试行情代理连通性"
                                      @click="testMarketProxy()" v-html="ICO.shortcut"></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="oc-group">
                      <h4 class="oc-group-title">后台翻译与实体抽取模型</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">专用处理模型</div>
                            <div class="oc-row-desc">建议选用轻量高速模型在后台处理批量快讯翻译与实体抽取，留空则跟随主对话模型</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <a-select :value="newsModelSelectVal" style="width:100%" show-search @change="onNewsModelPick">
                              <a-select-option value="">跟随主对话模型</a-select-option>
                              <a-select-opt-group v-for="g in groupedModels" :key="'nm-' + g.id" :label="g.name">
                                <a-select-option v-for="m in g.models" :key="g.id + '::' + m.id" :value="g.id + '::' + m.id">
                                  {{ m.label }}
                                </a-select-option>
                              </a-select-opt-group>
                            </a-select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="oc-group">
                      <div class="oc-group-head">
                        <h4 class="oc-group-title">RSS 订阅源 · {{ newsFeeds.length }}</h4>
                        <div style="display:flex;gap:6px;flex-wrap:wrap">
                          <a-button size="small" @click="importPresetFeeds()">导入预设源</a-button>
                          <a-button size="small" @click="triggerOpmlImport">导入 OPML</a-button>
                          <a-button size="small" @click="exportOpml">导出 OPML</a-button>
                          <a-button size="small" type="primary" :loading="newsFetching" @click="fetchNewsNow()">立即抓取</a-button>
                          <input ref="opmlInput" type="file" accept=".opml,.xml" style="display:none" @change="onOpmlFilePicked" />
                        </div>
                      </div>
                      <div class="oc-card oc-card-pad" style="display:flex;flex-direction:column;gap:12px">
                        <div style="display:grid;grid-template-columns:1.1fr 1.8fr 110px 95px auto;gap:8px;align-items:center">
                          <a-input v-model:value="newFeedForm.name" placeholder="源名称" />
                          <a-input v-model:value="newFeedForm.url" placeholder="RSS / Atom URL 或 rsshub://..." @pressEnter="saveNewFeed" />
                          <a-input v-model:value="newFeedForm.category" placeholder="分类" />
                          <a-select v-model:value="newFeedForm.lang">
                            <a-select-option value="auto">自动</a-select-option>
                            <a-select-option value="zh">中文</a-select-option>
                            <a-select-option value="en">英文</a-select-option>
                            <a-select-option value="ru">俄文</a-select-option>
                            <a-select-option value="ja">日文</a-select-option>
                          </a-select>
                          <a-button type="primary" @click="saveNewFeed">添加</a-button>
                        </div>

                        <o2-empty v-if="!newsFeeds.length" description="暂无订阅源" />
                        <div v-else style="display:flex;flex-direction:column;gap:6px;max-height:360px;overflow-y:auto">
                          <div v-for="fd in newsFeeds" :key="fd.id" class="news-feed-row">
                            <span :class="['news-status-dot', !fd.enabled ? 'off' : (fd.fail_count > 0 ? 'err' : '')]"
                                  :title="fd.last_error || '正常'"></span>
                            <div style="min-width:0;flex:1">
                              <div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500">
                                <span>{{ fd.name }}</span>
                                <span :class="['news-lang-badge', fd.lang === 'auto' ? 'en' : fd.lang]">{{ fd.lang }}</span>
                                <a-tag>{{ fd.category }}</a-tag>
                                <span class="hint">{{ fd.item_count || 0 }} 条</span>
                              </div>
                              <div class="hint" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                                {{ fd.url }}
                                <span v-if="fd.last_error" style="color:var(--down)"> · 失败 {{ fd.fail_count }} 次: {{ fd.last_error }}</span>
                              </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;flex:none">
                              <a-switch size="small" :checked="!!fd.enabled" @change="(v) => toggleFeedEnabled(fd, v)" />
                              <a-button size="small" @click="fetchNewsNow(fd.id)">抓取</a-button>
                              <a-button size="small" danger @click="deleteNewsFeed(fd)">删除</a-button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="oc-group">
                      <div class="oc-group-head">
                        <h4 class="oc-group-title">专有术语表</h4>
                        <a-button size="small" @click="loadDefaultGlossary">加载预设术语</a-button>
                      </div>
                      <div class="oc-card oc-card-pad" style="display:flex;flex-direction:column;gap:10px">
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px">
                          <a-input v-model:value="newGlossaryForm.term" placeholder="外文原文" />
                          <a-input v-model:value="newGlossaryForm.zh" placeholder="标准中文译名" />
                          <a-input v-model:value="newGlossaryForm.note" placeholder="备注" @pressEnter="addGlossaryTerm" />
                          <a-button type="primary" @click="addGlossaryTerm">添加</a-button>
                        </div>
                        <div v-if="(cfg.news_glossary || []).length" style="display:flex;flex-wrap:wrap;gap:6px">
                          <a-tag v-for="(g, gi) in cfg.news_glossary" :key="gi" closable @close="removeGlossaryTerm(gi)">
                            {{ g.term }} → {{ g.zh }}
                          </a-tag>
                        </div>
                        <div v-else class="hint">未设置自定义术语时将自动采用内置财经与航运术语表。</div>
                      </div>
                    </div>
                  </template>

                  <!-- 8. 文档与识别 (ocr / index) -->
                  <template v-if="showSettingsSec('ocr')">
                    <div class="oc-group">
                      <h4 class="oc-group-title">版面与文字识别</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>PaddleOCR-VL Token</span>
                              <span :class="['oc-stat-badge', cfg.paddle_token_set ? 'ok' : '']">
                                {{ cfg.paddle_token_set ? '已配置' : '未配置' }}
                              </span>
                            </div>
                            <div class="oc-row-desc">用于识别扫描件 PDF 及图片中的复杂表格与文字</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <div class="field-with-action" style="width:100%">
                              <a-input-password v-model:value="cfg.paddle_token"
                                :placeholder="cfg.paddle_token_set ? '已保存，留空则不修改' : '填入 Token 后按回车保存'"
                                @blur="savePaddle" @pressEnter="savePaddle" />
                              <a-button v-if="cfg.paddle_token_set" danger @click="clearPaddle">清除</a-button>
                            </div>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">PDF 解析策略</div>
                            <div class="oc-row-desc">智能加速模式下原生文本层 PDF 直接本地高速解析，仅扫描件调用云端识别</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-select v-model:value="cfg.pdf_ocr_mode" style="width: 190px">
                              <a-select-option value="smart">智能加速</a-select-option>
                              <a-select-option value="always">全量云端识别</a-select-option>
                            </a-select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="oc-group">
                      <h4 class="oc-group-title">文件源目录与索引</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">文件源文件夹</div>
                            <div class="oc-row-desc">所有入库文档与多级项目子目录的本地存储根路径</div>
                          </div>
                          <div class="oc-row-ctrl oc-ctrl-wide">
                            <div class="field-with-action" style="width:100%">
                              <a-input v-model:value="cfg.src_root" />
                              <a-button @click="openCacheDir('src_root')">打开目录</a-button>
                            </div>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">全库索引状态</div>
                            <div class="oc-row-desc">已索引 {{ stats.docs }} 份文件 · {{ stats.chunks }} 个切片{{ stats.built_at ? (' · 上次构建: ' + stats.built_at) : '' }}</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-button :loading="stats.rebuilding" @click="rebuild">重建索引</a-button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 9. 浏览器与存储 (storage) -->
                  <template v-if="showSettingsSec('storage')">
                    <div class="oc-group">
                      <h4 class="oc-group-title">浏览器下载</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">下载存放位置</div>
                            <div class="oc-row-desc">选择内置浏览器下载文件的保存目录，独立沙箱目录可避免与个人下载文件夹混杂</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-select v-model:value="cfg.browser_download_mode" style="width: 190px">
                              <a-select-option value="sandbox">独立沙箱目录</a-select-option>
                              <a-select-option value="system">系统下载文件夹</a-select-option>
                            </a-select>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">当前下载路径</div>
                            <div class="oc-row-desc">{{ cacheReport.active_download_dir || '加载中…' }}</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-button size="small" @click="openCacheDir('downloads')">打开目录</a-button>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">自动清理过期临时文件</div>
                            <div class="oc-row-desc">每次启动时自动回收超过 12 小时的未提交上传暂存、临时截图与运行日志</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-switch v-model:checked="cfg.auto_clean_temp" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="oc-group">
                      <div class="oc-group-head">
                        <h4 class="oc-group-title">缓存与空间</h4>
                        <a-button size="small" @click="loadCacheStatus">刷新</a-button>
                      </div>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>上传暂存与临时文件</span>
                              <span class="oc-stat-badge">{{ formatBytes(cacheReport.temp_logs.bytes) }} · {{ cacheReport.temp_logs.files }} 项</span>
                            </div>
                            <div class="oc-row-desc">包含未确认入库的上传暂存文件、浏览器临时截图与工具日志</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-button size="small" :loading="cacheClearing === 'temp'"
                                      :disabled="!cacheReport.temp_logs.files"
                                      @click="clearCacheTarget('temp', '上传暂存与临时文件')">清理</a-button>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>沙箱下载文件</span>
                              <span class="oc-stat-badge">{{ formatBytes(cacheReport.downloads.bytes) }} · {{ cacheReport.downloads.files }} 项</span>
                            </div>
                            <div class="oc-row-desc">存放在独立下载沙箱目录中的浏览器下载附件</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-button size="small" :loading="cacheClearing === 'downloads'"
                                      :disabled="!cacheReport.downloads.files"
                                      @click="clearCacheTarget('downloads', '沙箱下载文件')">清空</a-button>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>浏览器网页缓存</span>
                              <span class="oc-stat-badge">{{ formatBytes(cacheReport.browser_cache.bytes) }}</span>
                            </div>
                            <div class="oc-row-desc">网页静态资源缓存，清理后不会影响网站登录状态</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-button size="small" :loading="cacheClearing === 'browser_cache'"
                                      @click="clearCacheTarget('browser_cache', '浏览器网页缓存')">清理</a-button>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>OCR 版面识别缓存</span>
                              <span class="oc-stat-badge">{{ formatBytes(cacheReport.ocr_cache.bytes) }} · {{ cacheReport.ocr_cache.files }} 项</span>
                            </div>
                            <div class="oc-row-desc">已缓存的扫描件版面识别结果，保留可避免重建索引时重复调用接口</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-button size="small" :loading="cacheClearing === 'ocr_cache'"
                                      :disabled="!cacheReport.ocr_cache.files"
                                      @click="clearCacheTarget('ocr_cache', 'OCR 缓存')">清空</a-button>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">重置浏览器登录状态</div>
                            <div class="oc-row-desc">清除内置浏览器中所有网站的 Cookie 与本地会话数据</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-button size="small" danger :loading="cacheClearing === 'browser_cookies'"
                                      @click="clearCacheTarget('browser_cookies', '所有网站登录状态', true)">重置</a-button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- 10. 关于 (about) -->
                  <template v-if="showSettingsSec('about')">
                    <div class="oc-group">
                      <h4 class="oc-group-title">系统与数据库</h4>
                      <div class="oc-card">
                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">O2 智能分析与知识工作台</div>
                            <div class="oc-row-desc">集成多模态文档库、混合向量检索、金融行情看板、全球快讯终端与协同浏览器</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <span class="oc-stat-badge ok">v2.5</span>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">
                              <span>本地知识库数据库</span>
                              <span class="oc-stat-badge">{{ formatBytes(cacheReport.database.bytes) }}</span>
                            </div>
                            <div class="oc-row-desc">{{ cfg.db_path || cacheReport.database.path || 'data/zdl.sqlite' }}</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <a-button size="small" @click="openCacheDir('data')">打开目录</a-button>
                          </div>
                        </div>

                        <div class="oc-row">
                          <div class="oc-row-info">
                            <div class="oc-row-title">浏览器数据目录</div>
                            <div class="oc-row-desc">{{ cacheReport.browser_cache.path || '%LOCALAPPDATA%\\O2\\browser-profile' }} · {{ formatBytes(cacheReport.browser_cache.profile_bytes) }}</div>
                          </div>
                          <div class="oc-row-ctrl">
                            <span class="oc-stat-badge">持久化</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
              </main>
            </div>
          </div>
        </div>
      </template>
      </div>
    </div>
  </div>

  <a-drawer class="doc-drawer" v-model:open="drawerOpen" :width="drawerWidth" placement="right"
            :title="doc.title || '文件全文'"
            :body-style="{ padding: '16px 16px 12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }">
    <template #extra>
      <div style="display:flex;gap:8px">
        <a-button @click="openEditMeta(doc)">编辑属性</a-button>
        <a-button @click="openFile">打开原文件</a-button>
      </div>
    </template>
    <div class="docmeta" v-if="doc.title">
      <a-tag :color="docTypeColor(doc.doc_type)">{{ docTypeLabel(doc.doc_type) }}</a-tag>
      <a-tag>{{ doc.project }}{{ doc.folder ? ' / ' + doc.folder : '' }}</a-tag>
      <span v-if="doc.doc_no" class="docno">{{ doc.doc_no }}</span>
      <span v-if="doc.issued_date">{{ doc.issued_date }}</span>
      <a-tag v-if="doc.status && doc.status !== '现行'" color="orange">{{ doc.status }}</a-tag>
      <span v-for="(p, pi) in docMetaPills(doc)" :key="pi" class="poly-pill">
        <span class="poly-pill-k">{{ p.k }}:</span>
        <span class="poly-pill-v">{{ p.v }}</span>
      </span>
      <span class="loc">{{ doc.n_pages }} 页 · {{ chunkProfileLabel(doc.chunk_profile) }}</span>
    </div>

    <div class="docview-bar">
      <span class="seg" role="tablist">
        <span role="tab" tabindex="0" :aria-selected="docView === 'pdf'" :class="['seg-item', docView === 'pdf' ? 'on' : '']" @click="setDocView('pdf')" @keydown.enter.prevent="setDocView('pdf')">原页</span>
        <span role="tab" tabindex="0" :aria-selected="docView === 'text'" :class="['seg-item', docView === 'text' ? 'on' : '']" @click="setDocView('text')" @keydown.enter.prevent="setDocView('text')">切片 {{ (doc.chunks || []).length }}</span>
      </span>
      <template v-if="docView === 'pdf' && canPdf">
        <span class="pager-num">第 {{ originPage || 1 }} / {{ doc.n_pages || 1 }} 页</span>
        <a class="pager" v-if="hitPage && originPage !== hitPage" @click="jumpToHit">回到命中处</a>
        <span class="hint" v-if="activeChunk && activeChunk.article">命中 {{ activeChunk.article }}</span>
      </template>
      <span class="spacer"></span>
      <span class="hint" v-if="!canPdf">该格式无原页画布，已为您呈现结构化正文与表格切片</span>
      <span v-if="docView === 'pdf' && canPdf" class="pdf-zoombar" title="Ctrl + 滚轮也可缩放">
        <button type="button" class="pdf-zoom-btn" :disabled="pdfScale <= 0.5" @click="zoomOut">−</button>
        <a-dropdown :trigger="['click']">
          <button type="button" class="pdf-zoom-now">{{ zoomLabel }}</button>
          <template #overlay>
            <a-menu @click="onZoomPreset">
              <a-menu-item key="0.6">60%</a-menu-item>
              <a-menu-item key="0.75">75%</a-menu-item>
              <a-menu-item key="1">适应宽度</a-menu-item>
              <a-menu-item key="1.25">125%</a-menu-item>
              <a-menu-item key="1.5">150%</a-menu-item>
              <a-menu-item key="2">200%</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
        <button type="button" class="pdf-zoom-btn" :disabled="pdfScale >= 3" @click="zoomIn">+</button>
      </span>
    </div>

    <div v-if="docView === 'pdf'"
         class="origin drawer-origin pdf-viewport"
         :class="{ 'is-panning': pdfPanning }"
         ref="pageScroll"
         @scroll="onPageScroll"
         @pointerdown="onPdfDown"
         @pointermove="onPdfMove"
         @pointerup="onPdfUp"
         @pointercancel="onPdfUp">
      <div v-if="!canPdf" class="img-fail">该文件为结构化文档/表格，请切到「结构化切片」查看。</div>
      <div class="pdf-stage" :style="{ width: (pdfScale * 100) + '%' }">
        <div v-for="p in pageList" :key="p" class="page-wrap" :data-page="p">
          <div class="page-frame" :class="{ ready: pageShown(p) }">
            <div v-show="!pageShown(p)" :class="['page-skel', pageReady(p) ? 'is-shimmer' : '']"></div>
            <img v-if="pageReady(p)"
                 :src="pageUrl(currentDocId, p, p === hitPage ? activeChunkId : null, 1.25)"
                 :class="['pageimg', p === hitPage ? 'page-hit' : '', pageShown(p) ? 'is-in' : '']"
                 draggable="false"
                 decoding="async"
                 @load="onPageLoaded(p)"
                 @vue:mounted="onImgMount($event, p)"
                 @error="onPageImgError($event)" alt="原页预览" />
          </div>
          <div class="page-no">第 {{ p }} 页</div>
        </div>
      </div>
    </div>

    <a-spin v-if="docView === 'text'" class="doc-spin" :spinning="docLoading">
      <div class="docbody" :class="{ switching: chunkOn }">
        <div v-for="(c, i) in doc.chunks" :key="c.seq"
             :class="['chunk', { active: c.seq === activeSeq }]"
             :style="blockDelay(i)" :data-seq="c.seq">
          <div class="chunk-head">
            <div>
              <span class="art">{{ c.article || ('片段 #' + c.seq) }}</span>
              <span v-if="c.chapter && c.chapter !== c.article" class="hint" style="margin-left:8px">{{ c.chapter }}</span>
              <span v-if="c.chunk_type === 'table'" class="chunk-type-badge table">结构化表切片</span>
              <span v-else-if="c.chunk_type === 'image'" class="chunk-type-badge image">视觉索引</span>
            </div>
            <span class="pg" v-if="c.page_start">第 {{ c.page_start }} 页</span>
          </div>
          <div v-if="c.chunk_type === 'table'" class="chunk-md-table" v-html="renderChunkTable(c.text)"></div>
          <div v-else class="chunk-text">{{ c.text }}</div>
        </div>
      </div>
    </a-spin>
  </a-drawer>

  <a-modal v-model:open="ingest.open" :width="640" wrap-class-name="ingest-modal"
           :title="ingest.doc_id ? '更新文件' : '导入文件'"
           :confirm-loading="ingest.saving"
           @cancel="onIngestDismiss">
    <template #footer>
      <a-button @click="onIngestCancel">取消</a-button>
      <a-button v-if="batchHasGap" type="primary" @click="retryBatchFromBreak">重试</a-button>
      <a-button type="primary" :loading="ingest.saving"
                :disabled="ingest.parsing || ingest.batchRunning || (!ingest.batchMode && !ingest.tmp_id)"
                @click="onIngestOk">
        {{ ingest.batchMode ? (ingest.batchRunning ? '正在批量入库…' : '完成') : '确认入库' }}
      </a-button>
    </template>
    <div class="ingest-dest">
      <a-form-item label="项目">
        <a-auto-complete v-model:value="ingest.project" :options="projectOptions"
                         placeholder="如：集团制度库" />
      </a-form-item>
      <a-form-item label="文件夹">
        <a-auto-complete v-model:value="ingest.folder" :options="folderOptions"
                         placeholder="留空放入当前根目录（点击「智能归档」后再自动分类）" />
      </a-form-item>
    </div>

    <a-upload-dragger
      class="ingest-drop"
      :before-upload="onIngestFile"
      :multiple="!ingest.doc_id"
      :accept="INGEST_ACCEPT"
      :show-upload-list="false"
      :disabled="ingest.parsing || ingest.batchRunning">
      <div class="ingest-drop-row">
        <span class="ingest-drop-ico" v-html="ICO.filePlus"></span>
        <div class="ingest-drop-copy">
          <p class="ingest-title">{{ ingest.filename || (ingest.doc_id ? '拖入新文件，或点击选择' : '拖入文件，或点击选择') }}</p>
          <p v-if="ingest.doc_id" class="ingest-hint">替换当前文件，入库前可以改字段。</p>
        </div>
      </div>
      <div v-if="!ingest.filename" class="ingest-chips">
        <span>PDF</span><span>Word</span><span>Excel</span><span>PPT</span><span>图片</span><span>文本</span>
      </div>
    </a-upload-dragger>

    <div v-if="ingest.parsing || ingest.batchRunning || (ingest.batchMode && ingest.percent > 0)" class="ingest-progress">
      <a-progress :percent="ingest.percent" :status="ingest.batchRunning || ingest.parsing ? 'active' : (batchHasGap ? 'exception' : 'success')" :show-info="true" />
      <div v-if="ingest.parsing || ingest.batchRunning" class="ingest-status">{{ ingest.progressText || '正在识别…' }}</div>
    </div>

    <!-- 批量队列展示 -->
    <div v-if="ingest.batchMode && ingest.batchItems.length" class="batch-queue">
      <div v-for="(bi, idx) in ingest.batchItems" :key="idx" class="batch-row">
        <span class="batch-row-name" :title="bi.name">{{ bi.name }}</span>
        <span class="batch-row-type">
          <a-tag v-if="bi.doc_type" :color="docTypeColor(bi.doc_type)">{{ docTypeLabel(bi.doc_type) }}</a-tag>
        </span>
        <span class="batch-row-meta" :title="bi.folder || ''">{{ bi.folder || '' }}</span>
        <span class="batch-row-retry">
          <button v-if="(bi.state === 'error' || bi.state === 'pending') && !ingest.batchRunning" type="button" class="batch-retry"
                  title="重试这一份" @click="retryBatchItem(bi)">
            <span class="icon-svg" v-html="ICO.reload"></span>
          </button>
        </span>
        <span class="batch-row-status">
          <a-tag :title="bi.statusText" :color="bi.state === 'done' ? 'green' : (bi.state === 'skipped' ? 'gold' : (bi.state === 'error' ? 'red' : (bi.state === 'running' ? 'blue' : 'default')))">
            {{ shortBatchStatus(bi) }}
          </a-tag>
        </span>
      </div>
    </div>

    <!-- 单文件精修表单 -->
    <a-form v-if="!ingest.batchMode && ingest.tmp_id" layout="vertical" class="ingest-form">
      <div class="form-grid-3">
        <a-form-item label="文件性质">
          <a-select v-model:value="ingest.doc_type" @change="onIngestTypeChange">
            <a-select-option v-for="t in DOC_TYPE_SPECS" :key="t.id" :value="t.id">{{ t.label }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="切分策略">
          <a-select v-model:value="ingest.chunk_profile">
            <a-select-option value="auto">智能自动</a-select-option>
            <a-select-option value="laws">条文切分</a-select-option>
            <a-select-option value="report">章节切分</a-select-option>
            <a-select-option value="table">表格切分</a-select-option>
            <a-select-option value="image">视觉与 OCR</a-select-option>
            <a-select-option value="one">整篇索引</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="日期">
          <a-input v-model:value="ingest.issued_date" placeholder="YYYY-MM-DD" />
        </a-form-item>
      </div>

      <a-form-item label="规范化文件名称">
        <a-input v-model:value="ingest.title" />
      </a-form-item>

      <!-- 根据文件性质动态切换专属字段表单 -->
      <div v-if="ingest.doc_type === 'regulation'" class="form-grid-3">
        <a-form-item label="主管部门 / 发文机关">
          <a-auto-complete v-model:value="ingest.dept" :options="deptOptions" />
        </a-form-item>
        <a-form-item label="发文字号 / 编号">
          <a-input v-model:value="ingest.doc_no" placeholder="如：发文字号或制度编号" />
        </a-form-item>
        <a-form-item label="效力状态">
          <a-select v-model:value="ingest.status">
            <a-select-option value="现行">现行</a-select-option>
            <a-select-option value="试行">试行</a-select-option>
            <a-select-option value="已废止">已废止</a-select-option>
          </a-select>
        </a-form-item>
      </div>

      <div v-else-if="ingest.doc_type === 'finance'" class="form-grid-3">
        <a-form-item label="公司主体">
          <a-input v-model:value="ingest.meta.entity" placeholder="如：公司或主体名称" />
        </a-form-item>
        <a-form-item label="报告期">
          <a-input v-model:value="ingest.meta.period" placeholder="如：2025年报 / 2025Q3" />
        </a-form-item>
        <a-form-item label="审计/报表口径">
          <a-input v-model:value="ingest.meta.audit_status" placeholder="已审计 / 合并口径 / 预算" />
        </a-form-item>
      </div>

      <div v-else-if="ingest.doc_type === 'contract'" class="form-grid-3">
        <a-form-item label="甲方">
          <a-input v-model:value="ingest.meta.party_a" />
        </a-form-item>
        <a-form-item label="乙方 / 相对方">
          <a-input v-model:value="ingest.meta.party_b" />
        </a-form-item>
        <a-form-item label="合同金额">
          <a-input v-model:value="ingest.meta.amount" placeholder="如：480.00万元" />
        </a-form-item>
      </div>

      <div v-else-if="ingest.doc_type === 'report'" class="form-grid-2">
        <a-form-item label="报告类型 / 阶段">
          <a-input v-model:value="ingest.meta.stage" placeholder="可研 / 尽调 / 方案 / 会议纪要" />
        </a-form-item>
        <a-form-item label="编制单位 / 作者">
          <a-input v-model:value="ingest.meta.author" />
        </a-form-item>
      </div>

      <div v-else-if="ingest.doc_type === 'spreadsheet'" class="form-grid-2">
        <a-form-item label="工作表清单">
          <a-input v-model:value="ingest.meta.sheets" />
        </a-form-item>
        <a-form-item label="核心表头字段">
          <a-input v-model:value="ingest.meta.columns" />
        </a-form-item>
      </div>

      <div v-else-if="ingest.doc_type === 'image'" class="form-grid-2">
        <a-form-item label="图像类别">
          <a-input v-model:value="ingest.meta.image_type" placeholder="流程图 / 规划图 / 架构图 / 扫描件" />
        </a-form-item>
        <a-form-item label="分辨率 / 格式">
          <a-input v-model:value="ingest.meta.dimensions" />
        </a-form-item>
      </div>

      <a-form-item label="AI 一句话摘要 / 核心提要">
        <a-input v-model:value="ingest.summary" placeholder="核心内容摘要，支持全文检索" />
      </a-form-item>
    </a-form>
  </a-modal>

  <!-- 新建 / 重命名项目、文件夹弹窗 -->
  <a-modal v-model:open="folderModal.open"
           :title="folderModal.mode === 'rename' ? '重命名 / 移动文件夹' : '新建项目或子文件夹'"
           :ok-text="folderModal.mode === 'rename' ? '保存' : '创建'"
           @ok="confirmCreateFolder">
    <a-form layout="vertical">
      <a-form-item label="项目名称">
        <a-auto-complete v-model:value="folderModal.project" :options="projectOptions" size="large"
                         placeholder="选择已有项目或输入新项目名" />
      </a-form-item>
      <a-form-item :label="folderModal.mode === 'rename' ? '新文件夹路径' : '子文件夹路径'">
        <a-input v-model:value="folderModal.path" size="large"
                 placeholder="多级目录用 / 分隔，留空则仅创建项目" />
      </a-form-item>
      <p v-if="folderModal.mode === 'rename'" class="ingest-hint">
        下级文件夹和文件会同步更新路径与归属。
      </p>
    </a-form>
  </a-modal>

  <!-- 文件属性与多态元数据编辑弹窗 -->
  <a-modal v-model:open="metaModal.open" :width="640" title="编辑文件属性与项目归属" ok-text="保存"
           :confirm-loading="metaModal.saving" @ok="confirmSaveMeta">
    <a-form layout="vertical">
      <div class="form-grid-2">
        <a-form-item label="所属项目">
          <a-auto-complete v-model:value="metaModal.project" :options="projectOptions" />
        </a-form-item>
        <a-form-item label="子文件夹路径">
          <a-auto-complete v-model:value="metaModal.folder" :options="folderOptions" placeholder="多级用 / 分隔" />
        </a-form-item>
      </div>
      <div class="form-grid-3">
        <a-form-item label="文件性质">
          <a-select v-model:value="metaModal.doc_type">
            <a-select-option v-for="t in DOC_TYPE_SPECS" :key="t.id" :value="t.id">{{ t.label }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="日期">
          <a-input v-model:value="metaModal.issued_date" placeholder="YYYY-MM-DD" />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model:value="metaModal.status">
            <a-select-option value="现行">现行</a-select-option>
            <a-select-option value="试行">试行</a-select-option>
            <a-select-option value="已废止">已废止</a-select-option>
          </a-select>
        </a-form-item>
      </div>
      <a-form-item label="文件名称">
        <a-input v-model:value="metaModal.title" />
      </a-form-item>
      <div v-if="metaModal.doc_type === 'regulation'" class="form-grid-2">
        <a-form-item label="主管部门">
          <a-input v-model:value="metaModal.dept" />
        </a-form-item>
        <a-form-item label="文号">
          <a-input v-model:value="metaModal.doc_no" />
        </a-form-item>
      </div>
      <div v-else-if="metaModal.doc_type === 'finance'" class="form-grid-3">
        <a-form-item label="公司主体">
          <a-input v-model:value="metaModal.meta.entity" />
        </a-form-item>
        <a-form-item label="报告期">
          <a-input v-model:value="metaModal.meta.period" />
        </a-form-item>
        <a-form-item label="审计/口径">
          <a-input v-model:value="metaModal.meta.audit_status" />
        </a-form-item>
      </div>
      <div v-else-if="metaModal.doc_type === 'contract'" class="form-grid-3">
        <a-form-item label="甲方">
          <a-input v-model:value="metaModal.meta.party_a" />
        </a-form-item>
        <a-form-item label="乙方">
          <a-input v-model:value="metaModal.meta.party_b" />
        </a-form-item>
        <a-form-item label="合同金额">
          <a-input v-model:value="metaModal.meta.amount" />
        </a-form-item>
      </div>
      <div v-else-if="metaModal.doc_type === 'report'" class="form-grid-2">
        <a-form-item label="报告类型/阶段">
          <a-input v-model:value="metaModal.meta.stage" />
        </a-form-item>
        <a-form-item label="编制单位/作者">
          <a-input v-model:value="metaModal.meta.author" />
        </a-form-item>
      </div>
      <div v-else-if="metaModal.doc_type === 'spreadsheet'" class="form-grid-2">
        <a-form-item label="工作表清单">
          <a-input v-model:value="metaModal.meta.sheets" />
        </a-form-item>
        <a-form-item label="核心表头字段">
          <a-input v-model:value="metaModal.meta.columns" />
        </a-form-item>
      </div>
      <div v-else-if="metaModal.doc_type === 'image'" class="form-grid-2">
        <a-form-item label="图像类别">
          <a-input v-model:value="metaModal.meta.image_type" />
        </a-form-item>
        <a-form-item label="视觉描述">
          <a-input v-model:value="metaModal.meta.visual_summary" />
        </a-form-item>
      </div>
      <a-form-item label="一句话摘要">
        <a-input v-model:value="metaModal.summary" />
      </a-form-item>
    </a-form>
  </a-modal>

  <a-modal v-model:open="addProvider.open" title="添加渠道" ok-text="添加"
           wrapClassName="provider-modal"
           :ok-button-props="{ disabled: addProvider.kind === 'custom' && !(addProvider.name || '').trim() }"
           @ok="confirmAddProvider">
    <a-form layout="vertical">
      <a-form-item label="类型">
        <a-radio-group v-model:value="addProvider.kind">
          <a-radio-button value="deepseek">DeepSeek</a-radio-button>
          <a-radio-button value="opencode-go">OpenCode Go</a-radio-button>
          <a-radio-button value="custom">自定义</a-radio-button>
        </a-radio-group>
      </a-form-item>
      <template v-if="addProvider.kind === 'custom'">
        <a-form-item label="名称">
          <a-input v-model:value="addProvider.name" size="large" placeholder="公司中转" />
        </a-form-item>
        <a-form-item label="API 格式">
          <a-select v-model:value="addProvider.protocol" size="large">
            <a-select-option v-for="o in protocols" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="Base URL">
          <a-input v-model:value="addProvider.base_url" size="large"
                   :placeholder="urlPlaceholder({ protocol: addProvider.protocol })" />
        </a-form-item>
      </template>
      <a-form-item label="API Key">
        <a-input-password v-model:value="addProvider.api_key" size="large" placeholder="输入 API Key" />
      </a-form-item>
    </a-form>
  </a-modal>

  <a-modal v-model:open="addEmbedProvider.open" title="添加 Embedding 渠道" ok-text="添加"
           wrapClassName="provider-modal"
           :ok-button-props="{ disabled: addEmbedProvider.kind === 'custom' && !(addEmbedProvider.name || '').trim() }"
           @ok="confirmAddEmbedProvider">
    <a-form layout="vertical">
      <a-form-item label="类型">
        <a-radio-group v-model:value="addEmbedProvider.kind">
          <a-radio-button value="qwen">千问 AI</a-radio-button>
          <a-radio-button value="siliconflow">硅基流动</a-radio-button>
          <a-radio-button value="openrouter">OpenRouter</a-radio-button>
          <a-radio-button value="custom">自定义</a-radio-button>
        </a-radio-group>
      </a-form-item>
      <template v-if="addEmbedProvider.kind === 'custom'">
        <a-form-item label="名称">
          <a-input v-model:value="addEmbedProvider.name" size="large" placeholder="公司中转" />
        </a-form-item>
        <a-form-item label="API 格式">
          <a-select v-model:value="addEmbedProvider.protocol" size="large">
            <a-select-option v-for="o in embedProtocols" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="Base URL">
          <a-input v-model:value="addEmbedProvider.base_url" size="large"
                   :placeholder="embedUrlPlaceholder({ protocol: addEmbedProvider.protocol })" />
        </a-form-item>
      </template>
      <a-form-item label="API Key">
        <a-input-password v-model:value="addEmbedProvider.api_key" size="large" placeholder="输入 API Key" />
      </a-form-item>
    </a-form>
  </a-modal>

  <a-modal v-model:open="addModel.open" title="添加模型" ok-text="添加"
           :ok-button-props="{ disabled: !(addModel.id || '').trim() }"
           @ok="confirmAddModel">
    <a-form layout="vertical">
      <a-form-item label="模型 ID">
        <a-input v-model:value="addModel.id" size="large" placeholder="deepseek-flash" />
      </a-form-item>
      <a-form-item label="显示名">
        <a-input v-model:value="addModel.label" size="large" placeholder="可留空" />
      </a-form-item>
    </a-form>
  </a-modal>

  <a-modal v-model:open="addApiConnector.open" title="添加外部 API 连接" ok-text="添加"
           wrapClassName="provider-modal"
           :ok-button-props="{ disabled: !(addApiConnector.name || '').trim() || !(addApiConnector.base_url || '').trim() }"
           @ok="confirmAddApiConnector">
    <a-form layout="vertical">
      <a-form-item label="快速预设">
        <div class="api-preset-chips">
          <button type="button" v-for="p in apiPresets" :key="p.id" class="chip" @click="applyApiPreset(p)">{{ p.name }}</button>
        </div>
      </a-form-item>
      <div class="form-grid-2">
        <a-form-item label="连接名称">
          <a-input v-model:value="addApiConnector.name" size="large" placeholder="如 CoinGecko、FRED、高德天气" />
        </a-form-item>
        <a-form-item label="API 协议">
          <a-select v-model:value="addApiConnector.protocol" size="large">
            <a-select-option v-for="o in apiProtocols" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
          </a-select>
        </a-form-item>
      </div>
      <a-form-item label="Base URL">
        <div class="field-with-action">
          <a-input v-model:value="addApiConnector.base_url" size="large" placeholder="https://api.example.com 或 OpenAPI 地址" />
          <a-button :loading="apiDiscovering" @click="discoverIntoModal">解析 OpenAPI</a-button>
        </div>
      </a-form-item>
      <a-form-item label="鉴权方式">
        <a-select v-model:value="addApiConnector.auth_type" size="large">
          <a-select-option v-for="o in apiAuthTypes" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item v-if="addApiConnector.auth_type !== 'none'" :label="apiKeyLabel(addApiConnector.auth_type)">
        <a-input-password v-model:value="addApiConnector.api_key" size="large" placeholder="无需密钥可留空" />
      </a-form-item>
      <a-form-item v-if="needsApiSecret(addApiConnector.auth_type)" :label="apiSecretLabel(addApiConnector.auth_type)">
        <a-input-password v-model:value="addApiConnector.api_secret" size="large" placeholder="Secret / 密码" />
      </a-form-item>
      <a-form-item label="给 AI 的使用说明">
        <a-textarea v-model:value="addApiConnector.notes" :auto-size="{ minRows: 3, maxRows: 6 }"
          placeholder="常用路径、参数说明与返回示例，帮助 AI 准确调用。" />
      </a-form-item>
    </a-form>
  </a-modal>

  <a-drawer v-model:open="dashCustomizeOpen" title="看板布局管理" :width="420" placement="right">
    <div style="display:flex;flex-direction:column;gap:12px">
      <div v-if="activeWorkspaceObj" style="border:1px solid var(--border);border-radius:6px;padding:10px;background:var(--muted);display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span style="font-size:12px;font-weight:600;color:var(--foreground)">当前工作区</span>
          <div style="display:flex;align-items:center;gap:6px">
            <a-button size="small" @click="createDashboardWorkspace()">新建</a-button>
            <a-button size="small" @click="duplicateDashboardWorkspace()">复制</a-button>
            <a-button size="small" danger :disabled="(dashboardLayout.workspaces || []).length <= 1" @click="deleteDashboardWorkspace()">删除</a-button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <a-input v-model:value="activeWorkspaceObj.name" size="small" placeholder="工作区名称" @blur="saveDashboardLayout()" @pressEnter="saveDashboardLayout()" />
          <a-button size="small" @click="toggleDashboardLock()">{{ dashboardLayout.locked ? '解锁编辑' : '锁定布局' }}</a-button>
          <a-button size="small" @click="compactWorkspaceWidgets(activeWorkspaceObj); saveDashboardLayout()">紧凑对齐</a-button>
        </div>
        <div class="hint" style="font-size:11.5px">解锁后可直接拖动卡片标题栏移动位置，拖动边框或四角自由缩放。</div>
      </div>

      <div v-if="activeWorkspaceObj" style="display:flex;flex-direction:column;gap:8px">
        <div v-for="w in activeWorkspaceObj.widgets" :key="w.id"
             style="border:1px solid var(--border);border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;background:var(--card)">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <b style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ w.title }}</b>
            <div style="display:flex;align-items:center;gap:6px;flex:none">
              <button type="button" :class="['ft-chip', w.enabled !== false ? 'on' : '']"
                      @click="w.enabled = w.enabled === false; saveDashboardLayout()">
                {{ w.enabled !== false ? '显示' : '隐藏' }}
              </button>
              <button type="button" class="ft-ico-btn danger" title="移除模块" aria-label="移除模块"
                      @click="removeDashboardWidget(w.id)" v-html="ICO.trash"></button>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;font-size:11.5px">
            <span class="hint ft-mono">宽度</span>
            <a-input-number size="small" :min="w.minW || 4" :max="24" :value="w.w || 8" style="width:62px"
                            @change="(v) => { if (v) { w.w = Math.max(w.minW || 4, Math.min(24, Number(v))); if (w.x + w.w > 24) w.x = 24 - w.w; resolveWidgetOverlap(activeWorkspaceObj, w); saveDashboardLayoutDebounced() } }" />
            <span class="hint ft-mono">高度</span>
            <a-input-number size="small" :min="w.minH || 5" :max="40" :value="w.h || 10" style="width:62px"
                            @change="(v) => { if (v) { w.h = Math.max(w.minH || 5, Math.min(40, Number(v))); resolveWidgetOverlap(activeWorkspaceObj, w); saveDashboardLayoutDebounced() } }" />
            <span class="spacer"></span>
            <span class="hint ft-mono">列 {{ w.x || 0 }} · 行 {{ w.y || 0 }}</span>
          </div>
        </div>
      </div>
      <div v-if="missingDashboardWidgets.length" style="display:flex;flex-wrap:wrap;gap:6px;padding-top:6px;border-top:1px solid var(--border)">
        <button v-for="mw in missingDashboardWidgets" :key="'add-' + mw.type" type="button" class="ft-btn"
                @click="addDashboardWidget(mw.type)">
          <span>+ {{ mw.title }}</span>
        </button>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid var(--border)">
        <a-button size="small" @click="resetDashboardLayout">恢复默认</a-button>
        <a-button size="small" type="primary" @click="dashCustomizeOpen = false">完成</a-button>
      </div>
    </div>
  </a-drawer>

  <a-drawer v-model:open="mktCustomizeOpen" title="行情布局管理" :width="420" placement="right">
    <div style="display:flex;flex-direction:column;gap:12px">
      <div v-if="activeMarketWorkspaceObj" style="border:1px solid var(--border);border-radius:6px;padding:10px;background:var(--muted);display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span style="font-size:12px;font-weight:600;color:var(--foreground)">当前工作区</span>
          <div style="display:flex;align-items:center;gap:6px">
            <a-button size="small" @click="createMarketWorkspace()">新建</a-button>
            <a-button size="small" @click="duplicateMarketWorkspace()">复制</a-button>
            <a-button size="small" danger :disabled="(marketLayout.workspaces || []).length <= 1" @click="deleteMarketWorkspace()">删除</a-button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <a-input v-model:value="activeMarketWorkspaceObj.name" size="small" placeholder="工作区名称" @blur="saveMarketLayout()" @pressEnter="saveMarketLayout()" />
          <a-button size="small" @click="toggleMarketLock()">{{ marketLayout.locked ? '解锁编辑' : '锁定布局' }}</a-button>
          <a-button size="small" @click="compactWorkspaceWidgets(activeMarketWorkspaceObj); saveMarketLayout()">紧凑对齐</a-button>
        </div>
        <div class="hint" style="font-size:11.5px">支持自由组合市场面板、K 线、热力图与量化模块，拖动边框即可调整尺寸。</div>
      </div>

      <div v-if="activeMarketWorkspaceObj" style="display:flex;flex-direction:column;gap:8px">
        <div v-for="w in activeMarketWorkspaceObj.widgets" :key="w.id"
             style="border:1px solid var(--border);border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;background:var(--card)">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <b style="font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ w.title }}</b>
            <div style="display:flex;align-items:center;gap:6px;flex:none">
              <button type="button" :class="['ft-chip', w.enabled !== false ? 'on' : '']"
                      @click="w.enabled = w.enabled === false; saveMarketLayout()">
                {{ w.enabled !== false ? '显示' : '隐藏' }}
              </button>
              <button type="button" class="ft-ico-btn danger" title="移除模块" aria-label="移除模块"
                      @click="removeMarketWidget(w.id)" v-html="ICO.trash"></button>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;font-size:11.5px">
            <span class="hint ft-mono">宽度</span>
            <a-input-number size="small" :min="w.minW || 4" :max="24" :value="w.w || 8" style="width:62px"
                            @change="(v) => { if (v) { w.w = Math.max(w.minW || 4, Math.min(24, Number(v))); if (w.x + w.w > 24) w.x = 24 - w.w; resolveWidgetOverlap(activeMarketWorkspaceObj, w); saveMarketLayoutDebounced() } }" />
            <span class="hint ft-mono">高度</span>
            <a-input-number size="small" :min="w.minH || 5" :max="40" :value="w.h || 10" style="width:62px"
                            @change="(v) => { if (v) { w.h = Math.max(w.minH || 5, Math.min(40, Number(v))); resolveWidgetOverlap(activeMarketWorkspaceObj, w); saveMarketLayoutDebounced() } }" />
            <span class="spacer"></span>
            <span class="hint ft-mono">列 {{ w.x || 0 }} · 行 {{ w.y || 0 }}</span>
          </div>
        </div>
      </div>
      <div v-if="missingMarketWidgets.length" style="display:flex;flex-wrap:wrap;gap:6px;padding-top:6px;border-top:1px solid var(--border)">
        <button v-for="mw in missingMarketWidgets" :key="'madd-' + mw.type" type="button" class="ft-btn"
                @click="addMarketWidget(mw.type)">
          <span>+ {{ mw.title }}</span>
        </button>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid var(--border)">
        <a-button size="small" @click="resetMarketLayout">恢复默认</a-button>
        <a-button size="small" type="primary" @click="mktCustomizeOpen = false">完成</a-button>
      </div>
    </div>
  </a-drawer>

  <widget-gallery-modal
    v-model:open="widgetGalleryOpen"
    :target-scope="widgetGalleryScope"
    :theme="cfg.ui_theme"
    :custom-widgets="customWidgets"
    :sectors="marketSectors"
    :chokepoints="geoData.chokepoints"
    :watchlist="marketOverview.watchlist"
    @add-builtin="onAddBuiltinFromGallery"
    @add-custom="onAddCustomFromGallery"
    @save-custom="onSaveCustomFromStudio"
    @delete-custom="onDeleteCustomWidget"
    @ask-ai-build="onAskAiFromWidget"
    @toggle-watchlist="toggleWatchlistSymbol"
  />

  <widget-config-drawer
    v-model:open="widgetCfgOpen"
    :widget="widgetCfgTarget"
    :scope="widgetCfgScope"
    :watchlist="marketOverview.watchlist"
    @patch-widget="onPatchWidgetFromDrawer"
    @save-as-custom="onSaveWidgetAsCustom"
    @toggle-watchlist="toggleWatchlistSymbol"
  />

  <!-- 实体情报画像抽屉 -->
  <a-drawer v-model:open="entityDrawerOpen" :title="entityProfile ? entityProfile.canonical_name : '实体详情'" :width="500" placement="right">
    <a-spin :spinning="entityLoading">
      <div v-if="entityProfile" style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <a-tag color="blue">{{ entityProfile.entity_type }}</a-tag>
          <span class="hint ft-mono">近 7 日提及 {{ entityProfile.mentions }} 次 · 累计 {{ entityProfile.total_mentions }} 次</span>
          <span class="ft-mono" :style="{ color: entityProfile.net_sentiment > 0 ? 'var(--up)' : (entityProfile.net_sentiment < 0 ? 'var(--down)' : 'var(--muted-foreground)') }">
            净情绪 {{ entityProfile.net_sentiment >= 0 ? '+' : '' }}{{ entityProfile.net_sentiment }}
          </span>
        </div>
        <div v-if="entityProfile.aliases && entityProfile.aliases.length" class="hint" style="font-size:12px">
          别名：{{ entityProfile.aliases.join(' / ') }}
        </div>
        <div style="display:flex;gap:8px">
          <a-button type="primary" size="small" @click="askAiAboutEntity()">AI 深度研判</a-button>
          <a-button size="small" @click="filterNewsByEntity(entityProfile.canonical_name)">查看相关快讯</a-button>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:12px;font-weight:600;color:var(--foreground)">情绪分布 · 利多 {{ entityProfile.bullish }} · 中性 {{ entityProfile.neutral }} · 利空 {{ entityProfile.bearish }}</div>
          <div class="ft-breadth-bar" style="height:8px">
            <div :style="{ width: Math.round((entityProfile.bullish / Math.max(1, entityProfile.bullish + entityProfile.neutral + entityProfile.bearish)) * 100) + '%', background: 'var(--up)' }"></div>
            <div :style="{ width: Math.round((entityProfile.neutral / Math.max(1, entityProfile.bullish + entityProfile.neutral + entityProfile.bearish)) * 100) + '%', background: '#94a3b8' }"></div>
            <div :style="{ width: Math.round((entityProfile.bearish / Math.max(1, entityProfile.bullish + entityProfile.neutral + entityProfile.bearish)) * 100) + '%', background: 'var(--down)' }"></div>
          </div>
        </div>

        <div v-if="entityProfile.co_entities && entityProfile.co_entities.length" style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:12px;font-weight:600;color:var(--foreground)">关联实体</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <span v-for="ce in entityProfile.co_entities" :key="ce.id" class="ft-ent-pill"
                  @click="openEntityDossier(ce.canonical_name)">
              {{ ce.canonical_name }} · {{ ce.co_count }}
            </span>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:12px;font-weight:600;color:var(--foreground)">关联快讯 · {{ (entityProfile.items || []).length }}</div>
          <div v-for="nit in (entityProfile.items || [])" :key="'ep-' + nit.id"
               class="news-card" style="padding:8px 10px"
               @click="entityDrawerOpen = false; tab = 'news'; selectNewsItem(nit)">
            <div class="news-card-meta">
              <span :class="['news-lang-badge', nit.lang]">{{ nit.lang }}</span>
              <span>{{ nit.feed_name }}</span>
              <span style="margin-left:auto" class="ft-mono">{{ formatNewsTime(nit.published_at) }}</span>
            </div>
            <div class="news-card-title" style="font-size:12.5px">{{ nit.title_zh || nit.title_orig }}</div>
          </div>
        </div>
      </div>
    </a-spin>
  </a-drawer>

  <!-- AI 情报简报弹窗 -->
  <a-modal v-model:open="briefModalOpen" title="24 小时情报简报" :width="640" :footer="null">
    <a-spin :spinning="newsBriefLoading">
      <div v-if="newsBriefText" class="answer-text" style="font-size:13.5px;line-height:1.65"
           v-html="renderAnswer(newsBriefText, { sources: [] })"></div>
      <o2-empty v-else description="暂无简报内容" />
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">
        <a-button @click="loadNewsBrief(true)">重新生成</a-button>
        <a-button type="primary" :disabled="!newsBriefText" @click="briefModalOpen = false; question = '请结合以下今日情报简报与本地文档库做深度研判：\\n\\n' + newsBriefText; tab = 'ask'">带入对话</a-button>
      </div>
    </a-spin>
  </a-modal>

</div>
</a-config-provider>
`,
  setup() {
    const tab = ref('ask')
    const paneOn = ref(false)
    const settingsOn = ref(false)
    const chunkOn = ref(false)
    let paneToken = 0
    let settingsToken = 0
    let chunkToken = 0
    function pulsePane() {
      const token = ++paneToken
      paneOn.value = true
      setTimeout(() => { if (token === paneToken) paneOn.value = false }, 1100)
    }
    function pulseSettings() {
      const token = ++settingsToken
      settingsOn.value = true
      setTimeout(() => { if (token === settingsToken) settingsOn.value = false }, 1100)
    }
    function pulseChunks() {
      const token = ++chunkToken
      chunkOn.value = true
      setTimeout(() => { if (token === chunkToken) chunkOn.value = false }, 1100)
    }
    watch(tab, pulsePane)
    const q = ref('')
    const loading = ref(false)
    const results = ref([])
    const searched = ref(false)
    const filters = reactive({
      project: undefined,
      doc_type: undefined,
      chunk_type: undefined,
      dept: undefined,
      status: undefined,
      category: undefined,
    })
    const facets = reactive({
      depts: [],
      folders: [],
      projects: [],
      tree: [],
      doc_types: [],
      chunk_profiles: [],
      chunk_counts: {},
      statuses: [],
      categories: [],
    })
    const stats = reactive({ docs: 0, chunks: 0, built_at: '', llm: false, rebuilding: false })
    const theme = computed(() => {
      const dark = cfg.ui_theme === 'dark'
      return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: dark ? {
          colorPrimary: '#3b82f6',
          colorText: '#e5e7eb',
          colorTextSecondary: '#94a3b8',
          colorBorder: '#1e293b',
          colorBgContainer: '#111827',
          colorBgLayout: '#0b0f17',
          borderRadius: 6,
          fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", Inter, sans-serif',
          controlHeight: 36,
          controlHeightLG: 40,
        } : {
          colorPrimary: '#1d4ed8',
          colorText: '#020617',
          colorTextSecondary: '#64748b',
          colorBorder: '#e2e8f0',
          colorBgContainer: '#ffffff',
          colorBgLayout: '#fafafa',
          borderRadius: 6,
          fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", Inter, sans-serif',
          controlHeight: 36,
          controlHeightLG: 40,
        },
      }
    })
    const navs = computed(() => {
      const list = [
        { key: 'ask', label: '问答', icon: ICO.ask },
      ]
      if (cfg.news_enabled) {
        list.push({ key: 'dashboard', label: '看板', icon: ICO.dashboard })
        list.push({ key: 'markets', label: '行情', icon: ICO.chart })
        list.push({ key: 'backtest', label: '回测', icon: ICO.backtest })
        list.push({ key: 'news', label: '新闻流', icon: ICO.rss })
      } else {
        list.push({ key: 'backtest', label: '回测', icon: ICO.backtest })
      }
      list.push(
        { key: 'browser', label: '浏览器', icon: ICO.globe },
        { key: 'search', label: '检索', icon: ICO.search },
        { key: 'catalog', label: '文件', icon: ICO.catalog },
      )
      return list
    })
    const RECENT_KEY = 'o2-recent-q'
    const recent = ref(loadRecent())
    function loadRecent() {
      try {
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || localStorage.getItem('zdk-recent-q') || '[]')
        return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string' && x.trim()).slice(0, 4) : []
      } catch (e) {
        return []
      }
    }
    function rememberQuery(text) {
      const t = (text || '').trim()
      if (!t) return
      const next = recent.value.filter((x) => x !== t && !t.startsWith(x) && !x.startsWith(t))
      next.unshift(t)
      recent.value = next.slice(0, 4)
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value))
    }
    const askExamples = [
      '检查当前工作目录结构并列出体积最大的文件',
      '帮我整理一份结构清晰的方案对比表',
      '检索本地文档库中与当前主题相关的资料',
    ]
    const pageTitle = computed(() => (
      { search: '检索', ask: '问答', dashboard: '看板', markets: '行情', backtest: '回测', news: '新闻流', browser: '浏览器', catalog: '文件', settings: '设置' }[tab.value] || 'O2'
    ))

    function pageUrl(docId, page, chunkId, zoom) {
      const p = new URLSearchParams({ doc_id: docId, page: page || 1 })
      if (chunkId) p.set('chunk_id', chunkId)
      p.set('zoom', zoom || 1.25)
      p.set('bg', 'w')
      return '/api/page?' + p.toString()
    }

    function pickExample(s) {
      q.value = s
      doSearch()
    }

    let searchTimer = 0
    let searchSeq = 0
    watch(q, (v) => {
      clearTimeout(searchTimer)
      if (!(v || '').trim()) {
        doSearch()
        return
      }
      searchTimer = setTimeout(() => { doSearch() }, 280)
    })

    async function doSearch() {
      clearTimeout(searchTimer)
      const text = (q.value || '').trim()
      const seq = ++searchSeq
      if (!text) {
        searched.value = false
        results.value = []
        loading.value = false
        return
      }
      searched.value = true
      loading.value = true
      try {
        const p = new URLSearchParams({ q: text })
        if (filters.project) p.set('project', filters.project)
        if (filters.doc_type) p.set('doc_type', filters.doc_type)
        if (filters.chunk_type) p.set('chunk_type', filters.chunk_type)
        if (filters.dept) p.set('dept', filters.dept)
        if (filters.status) p.set('status', filters.status)
        if (filters.category) p.set('category', filters.category)
        const rs = await api.get('/api/search?' + p.toString())
        if (seq !== searchSeq) return
        results.value = rs
        rememberQuery(text)
      } finally {
        if (seq === searchSeq) loading.value = false
      }
    }

    const CHATS_KEY = 'o2-chats'
    const CHAT_ID_KEY = 'o2-chat-id'
    const CHAT_KEY = 'o2-chat'
    const CHAT_DRAFT_KEY = 'o2-chat-draft'
    const HIST_LABELS = {
      pin: '置顶', today: '今天', yesterday: '昨天', week: '7天内', month: '30天内', older: '更早',
    }

    function dumpChat(list) {
      return (list || []).map((m) => ({
        id: m.id || '',
        role: m.role,
        content: m.content || '',
        packed: m.packed || '',
        reasoning: m.reasoning || '',
        files: (m.files || []).map((f) => ({ name: f.name, source: f.source || '' })),
        sources: m.sources || [],
        visuals: Array.isArray(m.visuals) ? m.visuals : [],
        tools: (m.tools || []).map((t) => ({
          kind: t.kind || 'search',
          query: t.query || '',
          state: t.state === 'running' ? 'done' : (t.state || 'done'),
          count: t.count || 0,
          exit: t.exit,
          note: t.note || '',
        })),
        showSrc: !!m.showSrc,
        stopped: !!(m.stopped || m.streaming),
        error: m.error || '',
        ask: m.ask && m.ask.questions && m.ask.questions.length ? {
          questions: m.ask.questions,
          picks: m.ask.picks || {},
          otherText: m.ask.otherText || {},
          submitted: !!m.ask.submitted,
          step: m.ask.step || 0,
          intent: m.ask.intent || '',
        } : null,
      }))
    }

    function loadChat() {
      try {
        const raw = JSON.parse(sessionStorage.getItem(CHAT_KEY) || '[]')
        if (!Array.isArray(raw)) return []
        return dumpChat(raw).map((m) => ({ ...m, streaming: false }))
      } catch (e) {
        return []
      }
    }

    function newChatId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    }
    function fallbackTitle(text) {
      let s = String(text || '').replace(/\s+/g, ' ').trim()
      s = s.replace(/^【附件：[^】]*】/, '').trim()
      if (!s) return '新对话'
      if (s.length <= 18) return s
      return s.slice(0, 18).replace(/[，。、；,.\s]+$/g, '')
    }
    function firstUserText(list) {
      const m = (list || []).find((x) => x.role === 'user' && ((x.content || '').trim() || (x.files || []).length))
      if (!m) return ''
      const t = (m.content || '').trim()
      if (t) return t
      return (m.files || []).map((f) => f.name).filter(Boolean).join('、')
    }
    function firstAnswerText(list) {
      const m = (list || []).find((x) => x.role === 'assistant' && (x.content || '').trim() && !x.streaming)
      return m ? m.content.trim() : ''
    }
    function cloneMsgs(list) {
      return dumpChat(list).map((m) => ({ ...m, id: m.id || newChatId(), streaming: false }))
    }
    function computeHasBody(list) {
      return (list || []).some((m) => (
        m && (
          ((m.content || '').trim() || (m.packed || '').trim())
          || (m.files && m.files.length)
          || (m.tools && m.tools.length)
          || (m.visuals && m.visuals.length)
        )
      ))
    }
    function convFullStamp(list) {
      return (list || []).map((m) => [
        m.role || '',
        (m.content || '').length,
        m.content ? m.content.slice(-32) : '',
        (m.packed || '').length,
        (m.files || []).map((f) => f.name).join(','),
        (m.tools || []).map((t) => (t.kind || '') + ':' + (t.state || '') + ':' + (t.note || '') + ':' + (t.count || 0)).join(','),
        (m.sources || []).length,
        m.showSrc ? 1 : 0,
        m.stopped ? 1 : 0,
        m.error || '',
        m.ask ? (m.ask.submitted ? 'S' : (m.ask.step || 0) + ':' + JSON.stringify(m.ask.picks || {})) : '',
      ].join('\u0001')).join('\u0002')
    }
    function liveOf(c) {
      if (!c) return []
      if (!c._live) {
        const cloned = cloneMsgs(c.messages || [])
        c.messages = cloned
        c._live = reactive(cloned)
        c._savedStamp = convFullStamp(c._live)
        c._hasBody = computeHasBody(cloned)
      }
      return c._live
    }
    function chatHasBody(c) {
      if (!c) return false
      if (c._isDraft) return true
      return computeHasBody(c._live) || computeHasBody(c.messages)
    }
    function loadStoredChats() {
      try {
        const raw = JSON.parse(localStorage.getItem(CHATS_KEY) || localStorage.getItem('zdk-chats') || '[]')
        if (!Array.isArray(raw)) return []
        return raw.filter((c) => c && c.id).map((c) => {
          const msgs = Array.isArray(c.messages) ? c.messages : []
          return {
            id: c.id,
            title: c.title || '新对话',
            titleReady: !!c.titleReady,
            createdAt: c.createdAt || Date.now(),
            updatedAt: c.updatedAt || c.createdAt || Date.now(),
            activeAt: c.activeAt || c.createdAt || c.updatedAt || Date.now(),
            pinned: !!c.pinned,
            pinnedAt: c.pinnedAt || 0,
            messages: msgs,
            _hasBody: computeHasBody(msgs),
          }
        })
      } catch (e) {
        return []
      }
    }
    function dayStart(ts) {
      const d = new Date(ts || 0)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    function histBucket(ts) {
      const today = dayStart(Date.now())
      const u = dayStart(ts)
      if (u >= today) return 'today'
      if (u >= today - 86400000) return 'yesterday'
      if (u >= today - 6 * 86400000) return 'week'
      if (u >= today - 29 * 86400000) return 'month'
      return 'older'
    }

    let seeded = loadStoredChats()
    let migrated = false
    if (!seeded.length) {
      const legacy = loadChat()
      if (legacy.some((m) => m.role === 'user' && ((m.content || '').trim() || (m.files || []).length))) {
        seeded = [{
          id: newChatId(),
          title: fallbackTitle(firstUserText(legacy)),
          titleReady: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          activeAt: Date.now(),
          pinned: false,
          pinnedAt: 0,
          messages: legacy,
        }]
        migrated = true
      }
    }
    const conversations = ref(seeded)
    let storedId = ''
    try { storedId = localStorage.getItem(CHAT_ID_KEY) || localStorage.getItem('zdk-chat-id') || '' } catch (e) { storedId = '' }
    let opened = conversations.value.find((c) => c.id === storedId)
    if (!opened && conversations.value.length) opened = conversations.value[0]
    const chatId = ref(opened ? opened.id : '')
    const messages = ref(opened ? liveOf(opened) : [])
    const histMode = ref('')
    const histPicked = reactive({})
    const histSearchQuery = ref('')

    let persistTimer = 0
    let persistIdleId = 0
    let persistPending = false

    function serializeAllConversations(replaceFlag) {
      return conversations.value
        .filter((c) => c && c.id && (computeHasBody(c._live) || computeHasBody(c.messages)))
        .map((c) => {
          const liveMsgs = (c._live && c._live.length) ? dumpChat(c._live) : (c.messages || [])
          c.messages = liveMsgs
          return {
            id: c.id,
            title: c.title || '新对话',
            titleReady: !!c.titleReady,
            createdAt: c.createdAt || 0,
            updatedAt: c.updatedAt || 0,
            activeAt: c.activeAt || c.createdAt || 0,
            pinned: !!c.pinned,
            pinnedAt: c.pinnedAt || 0,
            messages: liveMsgs,
          }
        })
    }

    function flushPersistConversations(replaceBackend = false) {
      if (persistTimer) {
        clearTimeout(persistTimer)
        persistTimer = 0
      }
      if (persistIdleId && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(persistIdleId)
        persistIdleId = 0
      }
      persistPending = false
      if (conversations.value.length > 80) {
        const pinned = conversations.value.filter((c) => c.pinned)
        const rest = conversations.value.filter((c) => !c.pinned)
          .sort((a, b) => (b.activeAt || b.createdAt || 0) - (a.activeAt || a.createdAt || 0))
        const keep = new Set(pinned.concat(rest).slice(0, 80).map((c) => c.id))
        conversations.value = conversations.value.filter((c) => keep.has(c.id))
      }
      const data = serializeAllConversations()
      try {
        localStorage.setItem(CHATS_KEY, JSON.stringify(data))
      } catch (e) {
        const slim = data.map((c) => ({
          ...c,
          messages: (c.messages || []).map((m) => ({
            id: m.id || '', role: m.role, content: m.content || '', files: m.files || [],
            sources: [], tools: m.tools || [], showSrc: false, stopped: !!m.stopped,
            error: m.error || '', ask: m.ask || null,
          })),
        }))
        try { localStorage.setItem(CHATS_KEY, JSON.stringify(slim)) } catch (e2) { /* 配额满则忽略 */ }
      }
      api.post('/api/chats', {
        chats: data,
        active_id: chatId.value || '',
        replace: !!replaceBackend,
      }).catch(() => {})
    }

    async function syncBackendChats() {
      try {
        const res = await api.get('/api/chats')
        const remote = (res && Array.isArray(res.chats)) ? res.chats : []
        if (!remote.length) {
          if (conversations.value.length) flushPersistConversations(false)
          return
        }
        const byId = new Map()
        for (const c of conversations.value) {
          if (c && c.id) byId.set(c.id, c)
        }
        let changed = false
        for (const rc of remote) {
          if (!rc || !rc.id || !Array.isArray(rc.messages)) continue
          const existing = byId.get(rc.id)
          if (!existing) {
            const norm = {
              id: rc.id,
              title: rc.title || '新对话',
              titleReady: !!rc.titleReady,
              createdAt: rc.createdAt || Date.now(),
              updatedAt: rc.updatedAt || rc.createdAt || Date.now(),
              activeAt: rc.activeAt || rc.createdAt || Date.now(),
              pinned: !!rc.pinned,
              pinnedAt: rc.pinnedAt || 0,
              messages: rc.messages,
              _hasBody: computeHasBody(rc.messages),
            }
            conversations.value.push(norm)
            byId.set(norm.id, norm)
            changed = true
          } else {
            const curMsgs = (existing._live && existing._live.length) ? existing._live : (existing.messages || [])
            if (rc.messages.length > curMsgs.length && !runs.has(rc.id)) {
              existing.messages = rc.messages
              existing._live = null
              if (chatId.value === existing.id) {
                messages.value = liveOf(existing)
              }
              changed = true
            }
          }
        }
        if (changed) {
          conversations.value.sort((a, b) => (b.activeAt || b.createdAt || 0) - (a.activeAt || a.createdAt || 0))
          if (!chatId.value && conversations.value.length) {
            const first = conversations.value[0]
            chatId.value = first.id
            messages.value = liveOf(first)
          }
          try {
            localStorage.setItem(CHATS_KEY, JSON.stringify(serializeAllConversations()))
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    }

    function persistConversations() {
      persistPending = true
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        persistTimer = 0
        if (typeof requestIdleCallback === 'function') {
          if (persistIdleId) cancelIdleCallback(persistIdleId)
          persistIdleId = requestIdleCallback(() => {
            persistIdleId = 0
            if (persistPending) flushPersistConversations()
          }, { timeout: 1200 })
        } else if (persistPending) {
          flushPersistConversations()
        }
      }, 350)
    }
    window.addEventListener('beforeunload', () => {
      if (persistPending) flushPersistConversations()
    })

    function convStamp(list) {
      return (list || []).map((m) => [
        m.role || '',
        m.content || '',
        m.packed || '',
        (m.files || []).map((f) => f.name).join(','),
        m.error || '',
      ].join('\u0001')).join('\u0002')
    }

    function saveConv(id) {
      if (!id) return
      const c = conversations.value.find((x) => x.id === id)
      if (!c) return
      const src = c._live || (id === chatId.value ? messages.value : null)
      if (!src) return
      const nextFull = convFullStamp(src)
      if (c._savedStamp === nextFull) {
        if (id === chatId.value) {
          try { localStorage.setItem(CHAT_ID_KEY, id) } catch (e) { /* ignore */ }
        }
        return
      }
      const next = dumpChat(src)
      if (convStamp(next) !== convStamp(c.messages)) {
        c.activeAt = Date.now()
        c.updatedAt = c.activeAt
      }
      c.messages = next
      c._savedStamp = nextFull
      c._hasBody = computeHasBody(next)
      if (!c.titleReady) {
        const text = firstUserText(c.messages)
        if (text) c.title = fallbackTitle(text)
      }
      persistConversations()
      if (id === chatId.value) {
        try { localStorage.setItem(CHAT_ID_KEY, id) } catch (e) { /* ignore */ }
      }
    }

    const saveTimers = {}
    function touchConv(id) {
      if (!id) return
      clearTimeout(saveTimers[id])
      saveTimers[id] = setTimeout(() => saveConv(id), 200)
    }

    function saveChat() {
      saveConv(chatId.value)
    }

    if (migrated) persistConversations()
    const question = ref((() => {
      try { return sessionStorage.getItem(CHAT_DRAFT_KEY) || '' } catch (e) { return '' }
    })())
    const asking = ref(false)
    const runningIds = reactive({})
    const runs = new Map()
    const pendingFollowups = reactive({})
    const currentQueued = computed(() => (chatId.value && pendingFollowups[chatId.value]) || [])
    function removeQueuedFollowup(idx) {
      const q = chatId.value && pendingFollowups[chatId.value]
      if (q && idx >= 0 && idx < q.length) q.splice(idx, 1)
    }
    let arming = false
    const chatlog = ref(null)
    const turns = computed(() => messages.value.filter((m) => m.role === 'user').length)
    let saveChatTimer = null
    watch(messages, () => {
      clearTimeout(saveChatTimer)
      saveChatTimer = setTimeout(saveChat, 200)
    }, { deep: true })
    watch(question, (v) => {
      try { sessionStorage.setItem(CHAT_DRAFT_KEY, v || '') } catch (e) { /* ignore */ }
    })
    watch(chatlog, (el) => {
      if (el && messages.value.length) el.scrollTop = el.scrollHeight
    })

    function scrollChat() {
      nextTick(() => {
        const el = chatlog.value
        if (el) el.scrollTop = el.scrollHeight
      })
    }

    function toolDotClass(t) {
      if (!t || t.state === 'running') return 'running'
      if (t.kind === 'think') return 'ok'
      if (t.kind === 'shell' || t.kind === 'browser' || t.kind === 'api') {
        if (t.note === '失败' || t.note === '未执行' || (t.exit != null && t.exit !== 0)) return 'none'
        return 'ok'
      }
      const n = Number(t.count) || 0
      if (n <= 0) return 'none'
      if (n < 4) return 'few'
      return 'ok'
    }

    function toolLabel(t) {
      if (!t) return ''
      if (t.kind === 'think') return t.state === 'running' ? '思考中' : '已思考'
      if (t.kind === 'read') return '阅读「' + (t.query || '') + '」'
      if (t.kind === 'api') {
        const q = String(t.query || '').replace(/\s+/g, ' ')
        return 'API · ' + (q.length > 72 ? q.slice(0, 72) + '…' : (q || '请求'))
      }
      if (t.kind === 'browser') {
        const q = String(t.query || '').replace(/\s+/g, ' ')
        return '浏览器 · ' + (q.length > 72 ? q.slice(0, 72) + '…' : (q || '操作'))
      }
      if (t.kind === 'shell') {
        const q = String(t.query || '').replace(/\s+/g, ' ')
        return '终端 ' + (q.length > 72 ? q.slice(0, 72) + '…' : q)
      }
      if (t.kind === 'news') {
        const q = String(t.query || '').replace(/\s+/g, ' ')
        return '新闻情报 · ' + (q.length > 72 ? q.slice(0, 72) + '…' : (q || '检索'))
      }
      return '检索「' + (t.query || '') + '」'
    }
    function toolMeta(t) {
      if (!t || t.kind === 'think') return ''
      if (t.kind === 'api' || t.kind === 'news') {
        if (t.state !== 'done') return '检索中…'
        return t.note || ((Number(t.count) || 0) + ' 条')
      }
      if (t.kind === 'browser') {
        if (t.state !== 'done') return '操作中…'
        return t.note || '完成'
      }
      if (t.kind === 'shell') {
        if (t.state !== 'done') return '执行中…'
        return t.note || '完成'
      }
      if (t.state === 'done') return (Number(t.count) || 0) + ' 段'
      return t.kind === 'read' ? '读取中…' : '检索中…'
    }
    const SBF_LINE = 24
    const SBF_ROWS = 3
    const SBF_FOCUS = 1
    function sbfFocusIndex(m) {
      const tools = (m && m.tools) || []
      const n = tools.length
      if (n <= 1) return 0
      const last = tools[n - 1]
      if (last && last.state === 'running') return n - 2
      return n - 1
    }
    function sbfWindowH(m) {
      const n = ((m && m.tools) || []).length
      if (!n) return 0
      return SBF_ROWS * SBF_LINE
    }
    function sbfOffset(m) {
      const n = ((m && m.tools) || []).length
      if (!n) return 0
      return (SBF_FOCUS - sbfFocusIndex(m)) * SBF_LINE
    }
    function sbfItemClass(m, j) {
      const d = j - sbfFocusIndex(m)
      if (d === 0) return 'on'
      if (d === 1 || d === -1) return 'near'
      return 'far'
    }

    function finishThink(cur) {
      const list = (cur && cur.tools) || []
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].kind === 'think' && list[i].state === 'running') {
          list[i].state = 'done'
          break
        }
      }
    }

    function collectSources(list) {
      const map = new Map()
      for (const msg of list || []) {
        for (const s of (msg.sources || [])) {
          const n = Number(s && s.n)
          if (!n || map.has(n)) continue
          map.set(n, s)
        }
      }
      return [...map.values()].sort((a, b) => Number(a.n) - Number(b.n))
    }

    const chatSourcesPool = computed(() => collectSources(messages.value))
    const chatSourcesMap = computed(() => new Map(chatSourcesPool.value.map((s) => [String(s.n), s])))
    const chatAllowedSet = computed(() => new Set(chatSourcesPool.value.map((s) => String(s.n))))

    function allChatSources() {
      return chatSourcesPool.value
    }

    function findSource(n, m) {
      const key = String(n)
      const own = (m && m.sources) || []
      const hit = own.find((x) => String(x.n) === key)
      if (hit) return hit
      return chatSourcesMap.value.get(key) || null
    }

    function sourcesCitedIn(text, pool, poolMap) {
      const allowed = poolMap || new Map((pool || allChatSources()).map((s) => [String(s.n), s]))
      const out = []
      const seen = new Set()
      const src = String(text || '')
      const re = /〔(\d+)〕/g
      let m
      while ((m = re.exec(src))) {
        const n = m[1]
        if (seen.has(n)) continue
        const s = allowed.get(n)
        if (s) {
          seen.add(n)
          out.push(s)
        }
      }
      return out
    }

    function displaySources(m) {
      if (!m) return []
      const raw = m.content || ''
      const own = m.sources || []
      const poolLen = chatSourcesPool.value.length
      const key = poolLen + ':' + own.length + ':' + raw.length
      if (m._dispSrc && m._dispSrcKey === key && m._dispSrcRaw === raw) {
        return m._dispSrc
      }
      const cited = sourcesCitedIn(raw, chatSourcesPool.value, chatSourcesMap.value)
      const map = new Map()
      for (const s of cited.concat(own)) {
        const n = Number(s && s.n)
        if (!n || map.has(n)) continue
        map.set(n, s)
      }
      const res = [...map.values()].sort((a, b) => Number(a.n) - Number(b.n))
      m._dispSrc = res
      m._dispSrcKey = key
      m._dispSrcRaw = raw
      return res
    }

    function toggleSrc(m) {
      if (m) m.showSrc = !m.showSrc
    }

    function attachCitedSources(m) {
      if (!m) return
      const own = m.sources || (m.sources = [])
      for (const s of sourcesCitedIn(m.content, chatSourcesPool.value, chatSourcesMap.value)) {
        if (!own.some((x) => Number(x.n) === Number(s.n))) own.push(s)
      }
    }

    function stripThink(text) {
      return (text || '')
        .replace(/<\s*(think|thinking|reasoning|minimax:thinking)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '')
        .replace(/<\s*(think|thinking|reasoning|minimax:thinking)[^>]*>[\s\S]*$/gi, '')
        .replace(/<\|thought\|>[\s\S]*?<\|\/thought\|>/gi, '')
        .replace(/<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>/gi, '')
        .replace(/<\|thought\|>[\s\S]*$/gi, '')
        .replace(/<\|begin_of_thought\|>[\s\S]*$/gi, '')
        .replace(/◁think▷[\s\S]*?◁\/think▷/gi, '')
        .replace(/◁think▷[\s\S]*$/gi, '')
    }

    function citeAllowed(m) {
      const own = (m && m.sources) || []
      if (!own.length) return chatAllowedSet.value
      const allowed = new Set(chatAllowedSet.value)
      for (const s of own) allowed.add(String(s.n))
      return allowed
    }

    const md = new Marked({ gfm: true, breaks: true })
    md.use(markedKatex({
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      nonStandard: true,
    }))

    function normalizeTex(src) {
      let out = ''
      let i = 0
      while (i < src.length) {
        if (src.startsWith('```', i) || src[i] === '`') {
          const fence = src.startsWith('```', i)
          const mark = fence ? '```' : '`'
          const end = src.indexOf(mark, i + mark.length)
          const stop = end === -1 ? src.length : end + mark.length
          out += src.slice(i, stop)
          i = stop
          continue
        }
        if (src.startsWith('\\[', i) || src.startsWith('\\(', i)) {
          const open = src.startsWith('\\[', i) ? '\\[' : '\\('
          const close = open === '\\[' ? '\\]' : '\\)'
          const end = src.indexOf(close, i + 2)
          if (end !== -1) {
            const body = src.slice(i + 2, end)
            out += open === '\\[' ? '$$' + body + '$$' : '$' + body + '$'
            i = end + 2
            continue
          }
        }
        out += src[i]
        i += 1
      }
      return out
    }

    function renderMath(tex, display) {
      try {
        return katex.renderToString(tex, {
          displayMode: !!display,
          throwOnError: true,
          strict: 'ignore',
          trust: false,
        })
      } catch (e) {
        return ''
      }
    }

    function fillMath(el, tex, display) {
      const html = renderMath(tex, display)
      if (!html) {
        el.classList.add('md-math-raw')
        el.textContent = (display ? '$$' : '$') + tex + (display ? '$$' : '$')
        return
      }
      el.classList.remove('md-math-raw')
      el.innerHTML = html
    }

    function isCite(n, allowed) {
      if (allowed.size) return allowed.has(n)
      return n.length <= 3
    }

    function safeUrl(href) {
      const h = String(href || '').trim()
      if (/^(https?:|mailto:)/i.test(h)) return h
      return ''
    }

    function runKey(marks) {
      return [
        marks.b ? 1 : 0,
        marks.i ? 1 : 0,
        marks.d ? 1 : 0,
        marks.code ? 1 : 0,
        marks.href || '',
        marks.cite ? 1 : 0,
        marks.n || '',
      ].join('\u0001')
    }

    function pushRun(out, text, marks) {
      if (!text) return
      const key = runKey(marks)
      const last = out[out.length - 1]
      if (last && last.kind === 'run' && last.key === key) {
        last.text += text
        return
      }
      out.push({ kind: 'run', key, text, marks })
    }

    function pushPlain(out, text, marks, allowed) {
      if (!text) return
      if (marks.code) {
        pushRun(out, text, marks)
        return
      }
      const re = /〔(\d+)〕/g
      let last = 0
      let m
      while ((m = re.exec(text))) {
        pushRun(out, text.slice(last, m.index), marks)
        if (isCite(m[1], allowed)) pushRun(out, m[0], { ...marks, cite: 1, n: m[1] })
        else pushRun(out, m[0], marks)
        last = m.index + m[0].length
      }
      pushRun(out, text.slice(last), marks)
    }

    function walkInline(tokens, marks, allowed, out) {
      for (const t of tokens || []) {
        if (!t) continue
        if (t.type === 'text' || t.type === 'escape') pushPlain(out, t.text || '', marks, allowed)
        else if (t.type === 'br') out.push({ kind: 'br', key: 'br' })
        else if (t.type === 'strong') walkInline(t.tokens, { ...marks, b: 1 }, allowed, out)
        else if (t.type === 'em') walkInline(t.tokens, { ...marks, i: 1 }, allowed, out)
        else if (t.type === 'del') walkInline(t.tokens, { ...marks, d: 1 }, allowed, out)
        else if (t.type === 'codespan') pushPlain(out, t.text || '', { ...marks, code: 1 }, allowed)
        else if (t.type === 'link') {
          const href = safeUrl(t.href)
          if (href) walkInline(t.tokens || [], { ...marks, href }, allowed, out)
          else pushPlain(out, t.text || '', marks, allowed)
        } else if (t.type === 'image') {
          const href = safeUrl(t.href)
          if (href) out.push({ kind: 'img', key: 'img\u0001' + href, href, alt: t.text || '' })
          else if (t.text) pushPlain(out, t.text, marks, allowed)
        } else if (t.type === 'inlineKatex') {
          out.push({
            kind: 'math',
            key: 'math\u0001' + (t.displayMode ? '1' : '0') + '\u0001' + (t.text || ''),
            tex: t.text || '',
            display: !!t.displayMode,
          })
        } else if (t.type === 'html') pushPlain(out, t.text || '', marks, allowed)
        else if (t.tokens) walkInline(t.tokens, marks, allowed, out)
        else if (t.text) pushPlain(out, t.text, marks, allowed)
      }
    }

    function flattenInline(tokens, allowed) {
      const out = []
      walkInline(tokens, {}, allowed, out)
      return out
    }

    function codeAtoms(text) {
      const out = []
      const lines = String(text || '').split('\n')
      lines.forEach((line, i) => {
        pushRun(out, line, {})
        if (i < lines.length - 1) out.push({ kind: 'br', key: 'br' })
      })
      return out
    }

    function lex(text) {
      try {
        return md.lexer(normalizeTex(text || '')).filter((t) => t && t.type !== 'space' && t.type !== 'def')
      } catch (e) {
        return [{ type: 'paragraph', raw: text || '', text: text || '', tokens: [{ type: 'text', text: text || '' }] }]
      }
    }

    function blockKind(token) {
      if (!token) return ''
      if (token.type === 'heading') return 'h' + (token.depth || 1)
      if (token.type === 'list') return token.ordered ? 'ol' : 'ul'
      return token.type
    }

    function settleCharSpan(span) {
      if (!span || !span.parentNode) return
      const ch = span.textContent || ''
      const prev = span.previousSibling
      if (prev && prev.nodeType === 3) {
        prev.nodeValue += ch
        span.remove()
      } else {
        const next = span.nextSibling
        if (next && next.nodeType === 3) {
          next.nodeValue = ch + next.nodeValue
          span.remove()
        } else {
          span.replaceWith(document.createTextNode(ch))
        }
      }
    }

    function makeChar(ch, animate) {
      if (!animate) return document.createTextNode(ch)
      const span = document.createElement('span')
      span.className = 'ch ch-in'
      span.textContent = ch
      span.addEventListener('animationend', () => settleCharSpan(span), { once: true })
      return span
    }

    function createRun(marks) {
      let el
      if (marks.cite) {
        el = document.createElement('span')
        el.className = 'cite md-run'
        el.dataset.n = marks.n || ''
      } else if (marks.href) {
        el = document.createElement('a')
        el.className = 'md-a md-run'
        el.href = marks.href
        el.target = '_blank'
        el.rel = 'noopener noreferrer'
      } else if (marks.code) {
        el = document.createElement('code')
        el.className = 'md-run'
      } else if (marks.d) {
        el = document.createElement('del')
        el.className = 'md-run'
      } else if (marks.b) {
        el = document.createElement('strong')
        el.className = 'md-run'
      } else if (marks.i) {
        el = document.createElement('em')
        el.className = 'md-run'
      } else {
        el = document.createElement('span')
        el.className = 'md-run'
      }
      if (marks.b && el.tagName !== 'STRONG') el.classList.add('md-b')
      if (marks.i && el.tagName !== 'EM') el.classList.add('md-em')
      if (marks.d && el.tagName !== 'DEL') el.classList.add('md-d')
      if (marks.code && el.tagName !== 'CODE') el.classList.add('md-code')
      return el
    }

    function fillRun(el, text, animate) {
      const s = text || ''
      if (!animate) {
        el.textContent = s
        return
      }
      for (const ch of Array.from(s)) el.appendChild(makeChar(ch, true))
    }

    function patchRunText(el, prevText, nextText, animate) {
      const prev = prevText || ''
      const next = nextText || ''
      if (!animate) {
        if (el.textContent !== next) el.textContent = next
        return
      }
      if (next === prev) return
      if (next.startsWith(prev) && (el.textContent || '') === prev) {
        const added = next.slice(prev.length)
        for (const ch of Array.from(added)) el.appendChild(makeChar(ch, true))
        return
      }
      const prevChars = Array.from(prev)
      const nextChars = Array.from(next)
      let common = 0
      const minLen = Math.min(prevChars.length, nextChars.length)
      while (common < minLen && prevChars[common] === nextChars[common]) common++
      el.textContent = nextChars.slice(0, common).join('')
      for (let j = common; j < nextChars.length; j++) {
        el.appendChild(makeChar(nextChars[j], true))
      }
    }

    function createInlineNode(atom, animate) {
      if (atom.kind === 'br') return document.createElement('br')
      if (atom.kind === 'img') {
        const img = document.createElement('img')
        img.className = 'md-img'
        img.src = atom.href
        img.alt = atom.alt || ''
        img.loading = 'lazy'
        return img
      }
      if (atom.kind === 'math') {
        const el = document.createElement('span')
        el.className = 'md-math' + (atom.display ? ' md-math-block' : '')
        fillMath(el, atom.tex, atom.display)
        return el
      }
      const el = createRun(atom.marks || {})
      fillRun(el, atom.text, animate)
      return el
    }

    function sameAtom(a, b) {
      if (!a || !b || a.kind !== b.kind || a.key !== b.key) return false
      if (a.kind === 'run') return a.text === b.text
      if (a.kind === 'img') return a.href === b.href && a.alt === b.alt
      return true
    }

    function patchInline(host, prev, next, animate) {
      if (!host) return
      const caret = [...host.childNodes].find((n) => n.nodeType === 1 && n.classList && n.classList.contains('caret'))
      const nodes = [...host.childNodes].filter((n) => n !== caret)
      const place = (node) => {
        if (caret && caret.parentNode === host) host.insertBefore(node, caret)
        else host.appendChild(node)
      }
      let i = 0
      const n = Math.min(prev.length, next.length)
      while (i < n && sameAtom(prev[i], next[i])) i++
      if (
        i < prev.length && i < next.length && nodes[i] &&
        prev[i].kind === 'run' && next[i].kind === 'run' &&
        prev[i].key === next[i].key &&
        (next[i].text.startsWith(prev[i].text) || prev[i].text.startsWith(next[i].text))
      ) {
        patchRunText(nodes[i], prev[i].text, next[i].text, animate)
        i += 1
      }
      for (let j = nodes.length - 1; j >= i; j--) nodes[j].remove()
      for (let j = i; j < next.length; j++) place(createInlineNode(next[j], animate && j >= prev.length))
    }

    function caretHost(root) {
      const flow = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH'])
      let el = root
      for (let guard = 0; guard < 16; guard++) {
        const kids = [...el.children].filter((n) => !n.classList.contains('caret'))
        if (!kids.length) return el
        const last = kids[kids.length - 1]
        if (last.classList.contains('md-run') || last.classList.contains('md-img') || last.classList.contains('md-math') || last.tagName === 'BR' || last.tagName === 'INPUT') return el
        if (!flow.has(last.tagName)) return el
        el = last
      }
      return el
    }

    function blockNodes(parent) {
      return [...parent.children].filter((n) => !n.classList.contains('caret'))
    }

    function insertBlock(parent, el) {
      const caret = parent.querySelector(':scope > .caret')
      if (caret) parent.insertBefore(el, caret)
      else parent.appendChild(el)
    }

    function patchBlocks(parent, prevTokens, nextTokens, animate, allowed) {
      const prev = prevTokens || []
      const next = nextTokens || []
      const nodes = blockNodes(parent)
      let i = 0
      while (
        i < prev.length && i < next.length &&
        blockKind(prev[i]) === blockKind(next[i]) &&
        (prev[i].raw || '') === (next[i].raw || '')
      ) i++
      let idx = i
      if (idx < prev.length && idx < next.length && nodes[idx]) {
        patchBlock(nodes[idx], prev[idx], next[idx], animate, allowed)
        idx += 1
      }
      for (let j = nodes.length - 1; j >= idx; j--) nodes[j].remove()
      for (let j = idx; j < next.length; j++) insertBlock(parent, createBlock(next[j], animate, allowed))
    }

    function patchBlock(el, prev, next, animate, allowed) {
      if (blockKind(prev) !== blockKind(next)) {
        const fresh = createBlock(next, animate, allowed)
        el.replaceWith(fresh)
        return fresh
      }
      if (next.type === 'paragraph' || next.type === 'text' || next.type === 'heading') {
        patchInline(el, flattenInline(prev.tokens, allowed), flattenInline(next.tokens, allowed), animate)
        return el
      }
      if (next.type === 'list') {
        patchList(el, prev, next, animate, allowed)
        return el
      }
      if (next.type === 'blockquote') {
        patchBlocks(el, prev.tokens || [], next.tokens || [], animate, allowed)
        return el
      }
      if (next.type === 'blockKatex') {
        if ((prev.text || '') !== (next.text || '') || !el.querySelector('.katex')) fillMath(el, next.text || '', true)
        return el
      }
      if (next.type === 'code') {
        const code = el.querySelector('code') || el
        patchInline(code, codeAtoms(prev.text || ''), codeAtoms(next.text || ''), animate)
        return el
      }
      if (next.type === 'table') {
        patchTable(el, prev, next, animate, allowed)
        return el
      }
      if (next.type === 'html') {
        const prevAtoms = []
        const nextAtoms = []
        pushPlain(prevAtoms, prev.text || '', {}, allowed)
        pushPlain(nextAtoms, next.text || '', {}, allowed)
        patchInline(el, prevAtoms, nextAtoms, animate)
      }
      return el
    }

    function createBlock(token, animate, allowed) {
      if (token.type === 'paragraph' || token.type === 'text') {
        const el = document.createElement(token.type === 'paragraph' ? 'p' : 'div')
        el.className = token.type === 'paragraph' ? 'md-p' : 'md-line'
        patchInline(el, [], flattenInline(token.tokens, allowed), animate)
        return el
      }
      if (token.type === 'heading') {
        const el = document.createElement('h' + Math.min(6, Math.max(1, token.depth || 2)))
        el.className = 'md-h'
        patchInline(el, [], flattenInline(token.tokens, allowed), animate)
        return el
      }
      if (token.type === 'list') {
        const el = document.createElement(token.ordered ? 'ol' : 'ul')
        if (token.ordered && token.start) el.start = token.start
        patchList(el, { items: [] }, token, animate, allowed)
        return el
      }
      if (token.type === 'blockquote') {
        const el = document.createElement('blockquote')
        el.className = 'md-bq'
        patchBlocks(el, [], token.tokens || [], animate, allowed)
        return el
      }
      if (token.type === 'code') {
        const pre = document.createElement('pre')
        pre.className = 'md-pre'
        const code = document.createElement('code')
        if (token.lang) code.className = 'lang-' + String(token.lang).replace(/[^\w+-]/g, '')
        pre.appendChild(code)
        patchInline(code, [], codeAtoms(token.text || ''), animate)
        return pre
      }
      if (token.type === 'hr') return document.createElement('hr')
      if (token.type === 'blockKatex') {
        const el = document.createElement('div')
        el.className = 'md-math md-math-block'
        fillMath(el, token.text || '', true)
        return el
      }
      if (token.type === 'table') return createTable(token, animate, allowed)
      const el = document.createElement('p')
      el.className = 'md-p'
      const atoms = []
      pushPlain(atoms, token.text || token.raw || '', {}, allowed)
      patchInline(el, [], atoms, animate)
      return el
    }

    function patchList(el, prev, next, animate, allowed) {
      if (next.ordered && next.start) el.start = next.start
      const prevItems = prev.items || []
      const nextItems = next.items || []
      const nodes = [...el.children]
      let i = 0
      while (i < prevItems.length && i < nextItems.length && (prevItems[i].raw || '') === (nextItems[i].raw || '')) i++
      let idx = i
      if (idx < prevItems.length && idx < nextItems.length && nodes[idx]) {
        patchItem(nodes[idx], prevItems[idx], nextItems[idx], animate, allowed)
        idx += 1
      }
      for (let j = nodes.length - 1; j >= idx; j--) nodes[j].remove()
      for (let j = idx; j < nextItems.length; j++) el.appendChild(createItem(nextItems[j], animate, allowed))
    }

    function taskBox(item) {
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.disabled = true
      box.checked = !!item.checked
      box.setAttribute('disabled', '')
      if (item.checked) box.setAttribute('checked', '')
      else box.removeAttribute('checked')
      box.tabIndex = -1
      return box
    }

    function createItem(item, animate, allowed) {
      const li = document.createElement('li')
      if (item.task) {
        li.className = 'md-task'
        li.appendChild(taskBox(item))
      }
      const body = document.createElement('div')
      body.className = 'md-li-body'
      patchBlocks(body, [], item.tokens || [], animate, allowed)
      li.appendChild(body)
      return li
    }

    function patchItem(li, prev, next, animate, allowed) {
      const want = !!next.task
      let box = li.querySelector(':scope > input')
      if (want && !box) li.insertBefore(taskBox(next), li.firstChild)
      else if (want && box) box.checked = !!next.checked
      else if (!want && box) box.remove()
      li.classList.toggle('md-task', want)
      let body = li.querySelector(':scope > .md-li-body')
      if (!body) {
        body = document.createElement('div')
        body.className = 'md-li-body'
        li.appendChild(body)
      }
      patchBlocks(body, prev.tokens || [], next.tokens || [], animate, allowed)
    }

    function cellAtoms(cell, allowed) {
      if (cell && cell.tokens) return flattenInline(cell.tokens, allowed)
      const out = []
      pushPlain(out, (cell && cell.text) || '', {}, allowed)
      return out
    }

    function createCell(tag, cell, animate, allowed) {
      const el = document.createElement(tag)
      if (cell && cell.align) el.style.textAlign = cell.align
      patchInline(el, [], cellAtoms(cell, allowed), animate)
      return el
    }

    function createTable(token, animate, allowed) {
      const table = document.createElement('table')
      const thead = document.createElement('thead')
      const hr = document.createElement('tr')
      for (const cell of token.header || []) hr.appendChild(createCell('th', cell, animate, allowed))
      thead.appendChild(hr)
      const body = document.createElement('tbody')
      for (const row of token.rows || []) {
        const tr = document.createElement('tr')
        for (const cell of row) tr.appendChild(createCell('td', cell, animate, allowed))
        body.appendChild(tr)
      }
      table.appendChild(thead)
      table.appendChild(body)
      return table
    }

    function patchTable(el, prev, next, animate, allowed) {
      const prevCols = (prev.header || []).length
      const nextCols = (next.header || []).length
      if (!prevCols || prevCols !== nextCols) {
        el.replaceWith(createTable(next, animate, allowed))
        return
      }
      const ths = [...el.querySelectorAll('thead th')]
      ;(next.header || []).forEach((cell, i) => {
        if (cell && cell.align) ths[i].style.textAlign = cell.align
        patchInline(ths[i], cellAtoms(prev.header[i], allowed), cellAtoms(cell, allowed), animate)
      })
      const body = el.querySelector('tbody')
      const prevRows = prev.rows || []
      const nextRows = next.rows || []
      const trs = [...body.children]
      let i = 0
      while (i < prevRows.length && i < nextRows.length && prevRows[i].length === nextRows[i].length) {
        const tds = [...trs[i].children]
        nextRows[i].forEach((cell, c) => {
          if (cell && cell.align) tds[c].style.textAlign = cell.align
          patchInline(tds[c], cellAtoms(prevRows[i][c], allowed), cellAtoms(cell, allowed), animate)
        })
        i += 1
      }
      for (let j = trs.length - 1; j >= i; j--) trs[j].remove()
      for (let j = i; j < nextRows.length; j++) {
        const tr = document.createElement('tr')
        for (const cell of nextRows[j]) tr.appendChild(createCell('td', cell, animate, allowed))
        body.appendChild(tr)
      }
    }

    function renderAnswer(text, m) {
      const s = text || ''
      const poolLen = chatSourcesPool.value.length
      const ownLen = (m && m.sources && m.sources.length) || 0
      const key = poolLen + ':' + ownLen + ':' + s.length
      if (m && m._userHtml != null && m._userHtmlKey === key && m._userHtmlRaw === s) {
        return m._userHtml
      }
      const wrap = document.createElement('div')
      patchBlocks(wrap, [], lex(stripThink(s)), false, citeAllowed(m))
      const html = wrap.innerHTML
      if (m) {
        m._userHtml = html
        m._userHtmlKey = key
        m._userHtmlRaw = s
      }
      return html
    }

    const answerHosts = new Map()
    const answerDirty = new Set()
    let answerRaf = 0

    function paintAnswer(m) {
      const st = answerHosts.get(m)
      if (!st || !st.el) return
      const el = st.el
      const live = !!(m.streaming && !m.ask)
      const rawContent = m.content || ''
      const poolLen = chatSourcesPool.value.length
      const ownLen = (m.sources && m.sources.length) || 0
      const cacheKey = poolLen + ':' + ownLen + ':' + rawContent.length

      if (!live && st.ready && st.cacheKey === cacheKey && st.lastContent === rawContent) {
        const caret = el.querySelector('.caret')
        if (caret) caret.remove()
        return
      }
      if (!live && !st.ready && m._asstHtml && m._asstKey === cacheKey && m._asstContent === rawContent) {
        el.innerHTML = m._asstHtml
        st.ready = true
        st.cacheKey = cacheKey
        st.lastContent = rawContent
        return
      }

      const next = lex(stripThink(rawContent))
      patchBlocks(el, st.tokens || [], next, !!(st.ready && live), citeAllowed(m))
      let caret = el.querySelector('.caret')
      if (live) {
        if (!caret) {
          caret = document.createElement('span')
          caret.className = 'caret'
        }
        caretHost(el).appendChild(caret)
      } else {
        if (caret) caret.remove()
        if (!m._asstHtml || m._asstContent !== rawContent || m._asstKey !== cacheKey) {
          el.querySelectorAll('span.ch').forEach(settleCharSpan)
          m._asstHtml = el.innerHTML
          m._asstKey = cacheKey
          m._asstContent = rawContent
        }
      }
      st.tokens = next
      st.ready = true
      st.cacheKey = cacheKey
      st.lastContent = rawContent
    }

    function flushAnswers() {
      answerRaf = 0
      const list = [...answerDirty]
      answerDirty.clear()
      for (const m of list) paintAnswer(m)
    }

    function scheduleAnswer(m) {
      if (!m) return
      answerDirty.add(m)
      if (!answerRaf) answerRaf = requestAnimationFrame(flushAnswers)
    }

    function bindAnswer(m, el) {
      if (!el) {
        const st = answerHosts.get(m)
        if (st) answerHosts.delete(m)
        return
      }
      for (const [other, st] of answerHosts) {
        if (other !== m && st.el === el) answerHosts.delete(other)
      }
      const st = answerHosts.get(m)
      if (st && st.el === el) {
        if (m.streaming) scheduleAnswer(m)
        return
      }
      answerHosts.set(m, { el, tokens: [], ready: false, cacheKey: '', lastContent: '' })
      paintAnswer(m)
    }

    function blockDelay(i) {
      const n = Math.min(Number(i) || 0, 12)
      return { animationDelay: (n * 40) + 'ms' }
    }

    function msgDelay(i, total) {
      const start = Math.max(0, (Number(total) || 0) - 4)
      if (i < start) return undefined
      return { animationDelay: ((i - start) * 35) + 'ms' }
    }

    function onAnswerClick(e, m) {
      const t = e.target.closest('.cite')
      if (!t) return
      const s = findSource(t.getAttribute('data-n'), m)
      if (s) {
        m.showSrc = true
        openDoc(s.doc_id, s.chunk_id)
      }
    }

    const searchInputEl = ref(null)
    const askInputEl = ref(null)
    const SHORTCUTS_KEY = 'o2_shortcuts_v1'
    const SHORTCUT_SPECS = [
      { id: 'send_message', group: 'chat', groupTitle: '问答与检索', title: '发送提问 / 提交搜索', desc: '在问答输入框或检索框中立即提交当前内容', default: 'Enter', editable: true },
      { id: 'newline', group: 'chat', groupTitle: '问答与检索', title: '输入框换行', desc: '在问答多行输入框中插入换行符而不直接发送', default: 'Shift+Enter', editable: true },
      { id: 'new_chat', group: 'chat', groupTitle: '问答与检索', title: '新建会话', desc: '在任意页面快速创建并切换到新对话', default: 'Ctrl+N', editable: true },
      { id: 'stop_generation', group: 'chat', groupTitle: '问答与检索', title: '停止当前生成', desc: '当 AI 正在回答时立即中止当前生成轮次', default: 'Escape', editable: true },
      { id: 'focus_input', group: 'chat', groupTitle: '问答与检索', title: '聚焦输入框', desc: '将光标定位到当前问答或检索输入框', default: 'Ctrl+K', editable: true },
      { id: 'open_settings', group: 'nav', groupTitle: '界面与视图', title: '打开 / 退出设置', desc: '快速切换设置页面与工作区视图', default: 'Ctrl+,', editable: true },
      { id: 'toggle_theme', group: 'nav', groupTitle: '界面与视图', title: '切换明暗主题', desc: '在浅色工作台与深色终端主题之间一键切换', default: 'Ctrl+Shift+L', editable: true },
      { id: 'toggle_history', group: 'nav', groupTitle: '界面与视图', title: '打开历史会话', desc: '展开或收起历史会话浏览面板', default: 'Ctrl+H', editable: true },
      { id: 'canvas_zoom', group: 'doc', groupTitle: '文档查阅与导航', title: '原文画布无级缩放', desc: '在文档详情抽屉「原文视图」下放大或缩小原页画布（60% ~ 300%）', default: 'Ctrl+滚轮', editable: false },
      { id: 'canvas_pan', group: 'doc', groupTitle: '文档查阅与导航', title: '原文画布抓手平移', desc: '放大 PDF 或工程图纸后，按住鼠标左键拖拽即可任意方向平移画布', default: '鼠标左键拖拽', editable: false },
    ]
    const SHORTCUT_SPEC_MAP = Object.fromEntries(SHORTCUT_SPECS.map((s) => [s.id, s]))
    function loadShortcutOverrides() {
      try {
        const raw = localStorage.getItem(SHORTCUTS_KEY)
        const obj = raw ? JSON.parse(raw) : {}
        return (obj && typeof obj === 'object') ? obj : {}
      } catch (e) {
        return {}
      }
    }
    const shortcutOverrides = reactive(loadShortcutOverrides())
    const recordingShortcutId = ref('')
    function saveShortcutOverrides() {
      try {
        localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcutOverrides))
      } catch (e) {}
    }
    function getShortcutCombo(id) {
      const spec = SHORTCUT_SPEC_MAP[id]
      if (!spec) return ''
      return shortcutOverrides[id] || spec.default
    }
    function isShortcutModified(id) {
      const spec = SHORTCUT_SPEC_MAP[id]
      return !!(spec && shortcutOverrides[id] && shortcutOverrides[id] !== spec.default)
    }
    const hasCustomShortcuts = computed(() => SHORTCUT_SPECS.some((s) => s.editable && isShortcutModified(s.id)))
    const shortcutGroups = computed(() => {
      const groups = []
      const byKey = {}
      for (const s of SHORTCUT_SPECS) {
        if (!byKey[s.group]) {
          byKey[s.group] = { key: s.group, title: s.groupTitle, items: [] }
          groups.push(byKey[s.group])
        }
        byKey[s.group].items.push(s)
      }
      return groups
    })
    function shortcutTokens(combo) {
      if (!combo) return []
      if (combo === '+') return ['+']
      return combo.split('+').filter(Boolean)
    }
    function formatKeyEvent(e) {
      if (!e || !e.key) return ''
      const k = e.key
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return ''
      const parts = []
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      let keyLabel = k
      if (k === ' ') keyLabel = 'Space'
      else if (k.length === 1) keyLabel = k.toUpperCase()
      else if (k === 'ArrowUp') keyLabel = 'Up'
      else if (k === 'ArrowDown') keyLabel = 'Down'
      else if (k === 'ArrowLeft') keyLabel = 'Left'
      else if (k === 'ArrowRight') keyLabel = 'Right'
      parts.push(keyLabel)
      return parts.join('+')
    }
    function onShortcutContext(e, spec) {
      if (!spec || !spec.editable) return
      e.preventDefault()
      recordingShortcutId.value = spec.id
    }
    function resetShortcut(id) {
      delete shortcutOverrides[id]
      saveShortcutOverrides()
      if (recordingShortcutId.value === id) recordingShortcutId.value = ''
      message.success('已恢复默认快捷键')
    }
    function resetAllShortcuts() {
      for (const k of Object.keys(shortcutOverrides)) delete shortcutOverrides[k]
      saveShortcutOverrides()
      recordingShortcutId.value = ''
      message.success('已恢复全部默认快捷键')
    }
    function focusActiveInput() {
      if (tab.value === 'search') {
        searchInputEl.value && searchInputEl.value.focus && searchInputEl.value.focus()
        return
      }
      if (tab.value !== 'ask') tab.value = 'ask'
      nextTick(() => {
        askInputEl.value && askInputEl.value.focus && askInputEl.value.focus()
      })
    }
    function onAskKeydown(e) {
      if (e.isComposing || e.keyCode === 229) return
      const combo = formatKeyEvent(e)
      if (!combo) return
      if (combo === getShortcutCombo('newline')) {
        if (combo !== 'Shift+Enter') {
          e.preventDefault()
          question.value = (question.value || '') + '\n'
        }
        return
      }
      if (combo === getShortcutCombo('send_message')) {
        e.preventDefault()
        send()
      }
    }
    function onSearchKeydown(e) {
      if (e.isComposing || e.keyCode === 229) return
      const combo = formatKeyEvent(e)
      if (combo && combo === getShortcutCombo('send_message')) {
        e.preventDefault()
        doSearch()
      }
    }
    function onGlobalKeyDown(e) {
      if (recordingShortcutId.value) {
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Escape') {
          recordingShortcutId.value = ''
          return
        }
        const combo = formatKeyEvent(e)
        if (!combo) return
        const conflict = SHORTCUT_SPECS.find((s) => s.editable && s.id !== recordingShortcutId.value && getShortcutCombo(s.id) === combo)
        if (conflict) {
          message.warning(`快捷键 ${combo} 已被「${conflict.title}」占用`)
          return
        }
        const targetId = recordingShortcutId.value
        const spec = SHORTCUT_SPEC_MAP[targetId]
        if (spec && combo === spec.default) delete shortcutOverrides[targetId]
        else shortcutOverrides[targetId] = combo
        saveShortcutOverrides()
        recordingShortcutId.value = ''
        message.success(`已设置「${spec ? spec.title : targetId}」为 ${combo}`)
        return
      }
      if (e.isComposing || e.keyCode === 229) return
      const combo = formatKeyEvent(e)
      if (!combo) return
      if (combo === getShortcutCombo('stop_generation') && asking.value) {
        e.preventDefault()
        stopAsk()
        return
      }
      if (combo === getShortcutCombo('new_chat')) {
        e.preventDefault()
        newChat()
        return
      }
      if (combo === getShortcutCombo('focus_input')) {
        e.preventDefault()
        focusActiveInput()
        return
      }
      if (combo === getShortcutCombo('open_settings')) {
        e.preventDefault()
        tab.value = tab.value === 'settings' ? (lastAppTab.value || 'ask') : 'settings'
        return
      }
      if (combo === getShortcutCombo('toggle_theme')) {
        e.preventDefault()
        toggleTheme()
        return
      }
      if (combo === getShortcutCombo('toggle_history')) {
        e.preventDefault()
        if (histMode.value) closeHistManage()
        else openHistBrowse()
      }
    }
    onMounted(() => window.addEventListener('keydown', onGlobalKeyDown, true))
    onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeyDown, true))

    function onEnter(e) {
      if (e.shiftKey) return
      e.preventDefault()
      send()
    }

    function stopRun(id) {
      const ctrl = id && runs.get(id)
      if (ctrl) ctrl.abort()
    }

    function stopAsk() {
      stopRun(chatId.value)
    }

    function newChat() {
      saveChat()
      flushPersistConversations(false)
      // 若顶部已经存在一个空白的新对话草稿，直接切过去；否则新建一个会话项保留在会话列表中
      const existingDraft = conversations.value.find((c) => c && c._isDraft && !computeHasBody(c._live) && !computeHasBody(c.messages))
      if (existingDraft) {
        chatId.value = existingDraft.id
        messages.value = liveOf(existingDraft)
      } else {
        const c = {
          id: newChatId(),
          title: '新对话',
          titleReady: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          activeAt: Date.now(),
          pinned: false,
          pinnedAt: 0,
          messages: [],
          _isDraft: true,
        }
        conversations.value.unshift(c)
        const inserted = conversations.value[0]
        chatId.value = inserted.id
        messages.value = liveOf(inserted)
      }
      question.value = ''
      attachments.value = []
      asking.value = false
      try { localStorage.setItem(CHAT_ID_KEY, chatId.value) } catch (e) { /* ignore */ }
      tab.value = 'ask'
    }

    function closeSessionTab(c) {
      if (!c) return
      if (c._isDraft && !computeHasBody(c._live) && !computeHasBody(c.messages)) {
        conversations.value = conversations.value.filter((x) => x.id !== c.id)
        if (chatId.value === c.id) {
          const next = conversations.value[0]
          chatId.value = next ? next.id : ''
          messages.value = next ? liveOf(next) : []
        }
        return
      }
      stopRun(c.id)
      delete runningIds[c.id]
      conversations.value = conversations.value.filter((x) => x.id !== c.id)
      delete histPicked[c.id]
      flushPersistConversations(true)
      if (chatId.value === c.id) {
        const next = conversations.value[0]
        chatId.value = next ? next.id : ''
        messages.value = next ? liveOf(next) : []
        asking.value = next ? runs.has(next.id) : false
      }
    }

    function clearChat() {
      const id = chatId.value
      stopRun(id)
      delete runningIds[id]
      chatId.value = ''
      if (id) {
        conversations.value = conversations.value.filter((c) => c.id !== id)
        delete histPicked[id]
        flushPersistConversations(true)
      }
      const next = conversations.value[0]
      chatId.value = next ? next.id : ''
      messages.value = next ? liveOf(next) : []
      question.value = ''
      attachments.value = []
      asking.value = false
      try {
        if (chatId.value) localStorage.setItem(CHAT_ID_KEY, chatId.value)
        else localStorage.removeItem(CHAT_ID_KEY)
        sessionStorage.removeItem(CHAT_KEY)
        sessionStorage.removeItem(CHAT_DRAFT_KEY)
      } catch (e) { /* ignore */ }
    }

    const allSessionChats = computed(() => {
      const rows = conversations.value.filter(chatHasBody)
      const pinned = rows.filter((c) => c.pinned).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0))
      const rest = rows.filter((c) => !c.pinned).sort((a, b) => (b.activeAt || b.createdAt || 0) - (a.activeAt || a.createdAt || 0))
      return pinned.concat(rest)
    })
    const filteredSessionChats = computed(() => {
      const qStr = (histSearchQuery.value || '').trim().toLowerCase()
      if (!qStr) return allSessionChats.value
      return allSessionChats.value.filter((c) => {
        if ((c.title || '').toLowerCase().includes(qStr)) return true
        const list = c._live || c.messages || []
        return list.some((m) => (m.content || '').toLowerCase().includes(qStr))
      })
    })
    function convTurnCount(c) {
      if (!c) return 0
      const list = c._live || c.messages || []
      return Math.max(1, list.filter((m) => m && m.role === 'user').length)
    }
    function convRelTime(ts) {
      if (!ts) return '刚刚'
      const diffSec = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000))
      if (diffSec < 60) return '刚刚'
      const mins = Math.floor(diffSec / 60)
      if (mins < 60) return mins + '分钟'
      const hrs = Math.floor(mins / 60)
      if (hrs < 24) return hrs + '小时'
      const days = Math.floor(hrs / 24)
      return days + '天'
    }

    const histGroups = computed(() => {
      const rows = conversations.value.filter(chatHasBody)
      const pinned = rows.filter((c) => c.pinned).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0))
      const rest = rows.filter((c) => !c.pinned).sort((a, b) => (b.activeAt || b.createdAt || 0) - (a.activeAt || a.createdAt || 0))
      const buckets = { today: [], yesterday: [], week: [], month: [], older: [] }
      rest.forEach((c) => buckets[histBucket(c.activeAt || c.createdAt)].push(c))
      const map = { pin: pinned, ...buckets }
      return ['pin', 'today', 'yesterday', 'week', 'month', 'older']
        .filter((k) => map[k].length)
        .map((k) => ({ key: k, label: HIST_LABELS[k], items: map[k] }))
    })
    const histPickCount = computed(() => Object.keys(histPicked).length)
    const histPaneTitle = computed(() => {
      if (histMode.value === 'browse') return '历史对话'
      return histPickCount.value ? ('已选择 ' + histPickCount.value + ' 个对话') : '选择对话'
    })
    const histPinLabel = computed(() => {
      const ids = Object.keys(histPicked)
      if (!ids.length) return '置顶'
      const rows = conversations.value.filter((c) => histPicked[c.id])
      return rows.length && rows.every((c) => c.pinned) ? '取消置顶' : '置顶'
    })

    function clearPicks() {
      Object.keys(histPicked).forEach((k) => delete histPicked[k])
    }
    function togglePick(id) {
      if (histPicked[id]) delete histPicked[id]
      else histPicked[id] = true
    }
    function closeHistManage() {
      histMode.value = ''
      clearPicks()
    }
    function openHistManage() {
      if (!histGroups.value.length) return
      clearPicks()
      histMode.value = 'manage'
    }
    function openHistBrowse() {
      histMode.value = 'browse'
    }

    function openHistChat(c) {
      if (!c) return
      if (c.id !== chatId.value) {
        saveChat()
        flushPersistConversations(false)
        chatId.value = c.id
        messages.value = liveOf(c)
        asking.value = runs.has(c.id)
        try { localStorage.setItem(CHAT_ID_KEY, c.id) } catch (e) { /* ignore */ }
      }
      tab.value = 'ask'
      if (histMode.value === 'browse') histMode.value = ''
      scrollChat()
    }
    function onHistRow(c) {
      if (histMode.value === 'manage') togglePick(c.id)
      else openHistChat(c)
    }
    function pinPicked() {
      const ids = Object.keys(histPicked)
      if (!ids.length) return
      const rows = conversations.value.filter((c) => histPicked[c.id])
      const unpin = rows.length && rows.every((c) => c.pinned)
      const now = Date.now()
      rows.forEach((c) => {
        c.pinned = !unpin
        c.pinnedAt = unpin ? 0 : now
      })
      persistConversations()
    }
    function deletePicked() {
      const ids = Object.keys(histPicked)
      if (!ids.length) return
      Modal.confirm({
        title: ids.length === 1 ? '删除这个对话？' : ('删除 ' + ids.length + ' 个对话？'),
        content: '删除后无法恢复。',
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        zIndex: 2000,
        onOk() {
          const drop = new Set(ids)
          ids.forEach((id) => stopRun(id))
          const killing = drop.has(chatId.value)
          conversations.value = conversations.value.filter((c) => !drop.has(c.id))
          ids.forEach((id) => {
            delete histPicked[id]
            delete runningIds[id]
          })
          persistConversations()
          if (killing) {
            chatId.value = ''
            messages.value = []
            question.value = ''
            asking.value = false
            try { localStorage.removeItem(CHAT_ID_KEY) } catch (e) { /* ignore */ }
          }
          if (!conversations.value.some(chatHasBody)) closeHistManage()
        },
      })
    }

    function ensureChat(text) {
      let c = conversations.value.find((x) => x.id === chatId.value)
      if (!c) {
        const raw = {
          id: newChatId(),
          title: fallbackTitle(text) || '新对话',
          titleReady: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          activeAt: Date.now(),
          pinned: false,
          pinnedAt: 0,
          messages: [],
        }
        conversations.value.unshift(raw)
        c = conversations.value[0]
        chatId.value = c.id
        messages.value = liveOf(c)
      } else {
        c._isDraft = false
        if (!c._live) messages.value = liveOf(c)
        else if (messages.value !== c._live) messages.value = c._live
        if (!c.titleReady && (!c.title || c.title === '新对话')) {
          const t = fallbackTitle(text)
          if (t) c.title = t
        }
      }
      try { localStorage.setItem(CHAT_ID_KEY, c.id) } catch (e) { /* ignore */ }
    }

    let titleSeq = 0
    async function scheduleTitle(id) {
      const c = conversations.value.find((x) => x.id === id)
      if (!c || c.titleReady) return
      const questionText = firstUserText(c.messages)
      const answerText = firstAnswerText(c.messages)
      if (!questionText || !answerText) return
      const seq = ++titleSeq
      try {
        const r = await api.post('/api/chat/title', {
          question: questionText.slice(0, 500),
          answer: answerText.slice(0, 800),
          provider_id: cfg.provider_id,
          model: cfg.model,
        })
        if (seq !== titleSeq) return
        const cur = conversations.value.find((x) => x.id === id)
        if (!cur || cur.titleReady) return
        if (r && r.summarized && r.title) {
          cur.title = String(r.title).trim()
          cur.titleReady = true
          persistConversations()
        }
      } catch (e) { /* 保留第一问摘录 */ }
    }

    function askExample(s) {
      question.value = s
      send()
    }

    function askPicked(m, q, oid) {
      const p = m.ask && m.ask.picks && m.ask.picks[q.id]
      return !!(p && (p.ids || []).includes(oid))
    }
    function askOtherOn(m, q) {
      const p = m.ask && m.ask.picks && m.ask.picks[q.id]
      return !!(p && p.other)
    }
    function askCurrentQ(m) {
      const qs = m && m.ask && m.ask.questions
      if (!qs || !qs.length) return null
      const i = Math.min(Math.max(m.ask.step || 0, 0), qs.length - 1)
      return qs[i]
    }
    function askCurrentQs(m) {
      const q = askCurrentQ(m)
      return q ? [q] : []
    }
    function askLastStep(m) {
      const qs = m && m.ask && m.ask.questions
      return !!(qs && qs.length && (m.ask.step || 0) >= qs.length - 1)
    }
    function askStepDone(m) {
      const q = askCurrentQ(m)
      if (!q || !m.ask || m.ask.submitted) return false
      const p = m.ask.picks[q.id] || { ids: [], other: false }
      if (p.other) return !!(m.ask.otherText[q.id] || '').trim()
      return (p.ids || []).length > 0
    }
    function canSubmitAsk(m) {
      const ask = m && m.ask
      if (!ask || ask.submitted || !(ask.questions || []).length) return false
      return ask.questions.every((q) => {
        const p = ask.picks[q.id] || { ids: [], other: false }
        if (p.other) return !!(ask.otherText[q.id] || '').trim()
        return (p.ids || []).length > 0
      })
    }
    function prevAsk(m) {
      if (!m.ask || m.ask.submitted) return
      if ((m.ask.step || 0) <= 0) return
      m.ask.step -= 1
    }
    function nextAsk(m) {
      if (!askStepDone(m) || asking.value) return
      if (askLastStep(m)) {
        submitAsk(m)
        return
      }
      m.ask.step = (m.ask.step || 0) + 1
      scrollChat()
    }
    function toggleAskOpt(m, q, o) {
      if (!m.ask || m.ask.submitted) return
      const p = m.ask.picks[q.id]
      if (!p) return
      if (q.allow_multiple) {
        p.other = false
        p.ids = p.ids.includes(o.id)
          ? p.ids.filter((id) => id !== o.id)
          : p.ids.concat(o.id)
      } else {
        p.ids = [o.id]
        p.other = false
      }
    }
    function pickAskOther(m, q) {
      if (!m.ask || m.ask.submitted) return
      const p = m.ask.picks[q.id]
      if (!p) return
      if (q.allow_multiple) {
        p.other = !p.other
      } else {
        p.ids = []
        p.other = true
      }
    }
    function formatAskReply(m) {
      const lines = ['【补充条件】']
      for (const q of m.ask.questions) {
        const p = m.ask.picks[q.id] || { ids: [], other: false }
        const labels = []
        for (const id of p.ids || []) {
          const o = (q.options || []).find((x) => x.id === id)
          if (o) labels.push(o.label)
        }
        if (p.other) {
          const t = (m.ask.otherText[q.id] || '').trim()
          if (t) labels.push(t)
        }
        lines.push(q.prompt + '：' + labels.join('、'))
      }
      return lines.join('\n')
    }
    function submitAsk(m) {
      if (!canSubmitAsk(m) || asking.value) return
      m.ask.submitted = true
      send(formatAskReply(m))
    }

    function packUser(text, files) {
      const parts = []
      for (const f of files || []) {
        if (f.state && f.state !== 'ready') continue
        if (!(f.text || '').trim()) continue
        parts.push('【附件：' + f.name + '】\n' + f.text)
      }
      if (text) parts.push(text)
      return parts.join('\n\n')
    }

    async function send(preset) {
      if (arming) return
      const isQueuedObj = preset && typeof preset === 'object' && preset._queued
      const homeId = (isQueuedObj && preset.convId) || chatId.value
      if (homeId && runs.has(homeId)) {
        if (isQueuedObj) return
        const rawFollow = (typeof preset === 'string' ? preset : (question.value || '')).trim()
        const hasAttach = attachments.value.length > 0
        const hasCited = citedNews.value.length > 0
        if (!rawFollow && !hasAttach && !hasCited) return
        if (!pendingFollowups[homeId]) pendingFollowups[homeId] = []
        const item = {
          _queued: true,
          id: newChatId(),
          convId: homeId,
          text: rawFollow,
          attachments: attachments.value.slice(),
          citedNews: citedNews.value.slice(),
        }
        question.value = ''
        attachments.value = []
        citedNews.value = []
        if (cfg.followup_mode === 'queue') {
          pendingFollowups[homeId].push(item)
          message.info('已加入等待队列')
        } else {
          pendingFollowups[homeId].unshift(item)
          stopRun(homeId)
        }
        return
      }
      arming = true
      let convId = ''
      let cur = null
      let ctrl = null
      let hist = null
      let priorSources = null
      try {
      const activeAttachments = isQueuedObj ? (preset.attachments || []) : attachments.value
      if (activeAttachments.some((a) => a.state === 'parsing')) return
      const vision = modelHasVision.value
      for (const a of activeAttachments) {
        if (a.state !== 'ready' || a.kind !== 'image' || vision || !a.file) continue
        a.state = 'parsing'
        a.percent = 2
        a.kind = 'text'
        a.data = ''
        await parseAttach(a.file, a, false)
      }
      if (!isQueuedObj && chatId.value !== homeId) return
      if (activeAttachments.some((a) => a.state === 'parsing')) return
      if (activeAttachments.some((a) => a.state === 'error')) {
        message.warning('有附件未能处理')
        return
      }
      const ready = activeAttachments.filter((a) => a.state === 'ready' && ((a.text || '').trim() || a.kind === 'image'))
      const citedSnapshot = isQueuedObj ? (preset.citedNews || []).slice() : citedNews.value.slice()
      const rawText = isQueuedObj
        ? (preset.text || '').trim()
        : (typeof preset === 'string' ? preset : (question.value || '')).trim()
      if (!rawText && !ready.length && !citedSnapshot.length) return
      const text = rawText || ('请结合以下 ' + citedSnapshot.length + ' 条新闻进行综合研判：')
      if (!isQueuedObj) {
        question.value = ''
        citedNews.value = []
      }
      const textFiles = ready.filter((a) => a.kind !== 'image')
      const images = ready.filter((a) => a.kind === 'image').slice(0, 4).map((a) => ({
        name: a.name, mime: a.mime || 'image/jpeg', data: a.data,
      }))
      const files = ready.map((a) => ({ name: a.name, source: a.source || '', text: a.text || '', kind: a.kind || 'text' }))
      if (citedSnapshot.length) {
        files.push(...citedSnapshot.map((cn) => ({ name: `[新闻:${cn.lang}] ${cn.title_zh || cn.title_orig}`, source: cn.url || '' })))
      }
      const newsCtx = citedSnapshot.length
        ? citedSnapshot.map((cn, idx) => (
            `[引用新闻 ${idx + 1}] (${cn.lang} · ${cn.feed_name} · ${formatNewsTime(cn.published_at)})\n` +
            `中文标题：${cn.title_zh || cn.title_orig}\n` +
            (cn.title_zh && cn.title_zh !== cn.title_orig ? `原标题：${cn.title_orig}\n` : '') +
            `摘要/正文：${cn.content_zh || cn.summary_zh || cn.summary_orig || ''}\n` +
            (cn.url ? `链接：${cn.url}` : '')
          )).join('\n\n')
        : ''
      if (!isQueuedObj) attachments.value = []
      if (isQueuedObj && homeId && chatId.value !== homeId) {
        const target = conversations.value.find((x) => x.id === homeId)
        if (target) openHistChat(target)
      }
      ensureChat(text || (files[0] && files[0].name) || '')
      convId = chatId.value
      const conv = conversations.value.find((x) => x.id === convId)
      if (conv) {
        if (!conv._live) conv._live = messages.value
        else if (messages.value !== conv._live) messages.value = conv._live
      }
      const packedPrompt = newsCtx
        ? `${packUser(text, textFiles)}\n\n【用户引用的外部新闻情报】\n${newsCtx}`
        : packUser(text, textFiles)
      messages.value.push({
        id: newChatId(),
        role: 'user',
        content: text,
        files: files.map((f) => ({ name: f.name, source: f.source })),
        images,
        packed: packedPrompt,
      })
      cur = reactive({
        id: newChatId(),
        role: 'assistant',
        content: '',
        sources: [],
        tools: [],
        showSrc: false,
        streaming: true,
        stopped: false,
        error: '',
        ask: null,
        reasoning: '',
        _convId: convId,
      })
      messages.value.push(cur)
      saveConv(convId)
      ctrl = new AbortController()
      runs.set(convId, ctrl)
      runningIds[convId] = true
      asking.value = chatId.value === convId
      scrollChat()

      hist = messages.value
        .filter((m) => {
          if (m === cur) return false
          if (m.role === 'user' && ((m.packed || m.content || '').trim() || (m.files && m.files.length))) return true
          if (m.role === 'assistant' && ((m.content || '').trim() || (m.ask && m.ask.questions && m.ask.questions.length))) return true
          return false
        })
        .map((m) => {
          const o = {
            role: m.role,
            content: (m.packed || m.content || '').trim() || (m.ask ? '请补充关键条件后再作答。' : ''),
          }
          if (m.role === 'user' && m.images && m.images.length) o.images = m.images
          return o
        })
      priorSources = collectSources(messages.value)
      } finally {
        arming = false
      }
      if (!ctrl) return

      let ok = true
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: hist,
            sources: priorSources,
            provider_id: cfg.provider_id,
            model: cfg.model,
            effort: cfg.effort,
          }),
          signal: ctrl.signal,
        })
        const ctype = res.headers.get('content-type') || ''
        if (!res.ok || !ctype.includes('event-stream')) {
          const j = await res.json().catch(() => ({}))
          cur.error = j.error || ('请求失败 ' + res.status)
          ok = false
        } else {
          await readStream(res, cur)
        }
      } catch (e) {
        if (e && e.name === 'AbortError') {
          cur.stopped = true
          ;(cur.tools || []).forEach((t) => {
            if (t.state === 'running') t.state = 'done'
          })
        } else {
          cur.error = String(e)
          ok = false
        }
      } finally {
        if (!cur.content && cur._stashedContent) {
          cur.content = cur._stashedContent
        }
        cur.streaming = false
        scheduleAnswer(cur)
        runs.delete(convId)
        delete runningIds[convId]
        const own = conversations.value.find((x) => x.id === convId)
        attachCitedSources(cur, collectSources((own && own._live) || []))
        saveConv(convId)
        flushPersistConversations(false)
        scheduleTitle(convId)
        if (chatId.value === convId) {
          asking.value = false
          scrollChat()
        }
        const qList = pendingFollowups[convId]
        if (qList && qList.length) {
          const nextItem = qList.shift()
          nextTick(() => send(nextItem))
        }
      }
      if (!ok && !cur.content) cur.showSrc = true
    }

    async function readStream(res, cur) {
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const line = raw.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          let ev
          try {
            ev = JSON.parse(line.slice(5).trim())
          } catch (e) {
            continue
          }
          applyEvent(ev, cur)
        }
      }
    }

    function noteStream(cur) {
      if (!cur || !cur._convId) return
      touchConv(cur._convId)
      if (chatId.value === cur._convId) scrollChat()
    }

    function applyEvent(ev, cur) {
      if (ev.type === 'delta') {
        finishThink(cur)
        cur.content += ev.text
        scheduleAnswer(cur)
        noteStream(cur)
      } else if (ev.type === 'thinking') {
        const last = cur.tools[cur.tools.length - 1]
        if (!last || last.kind !== 'think' || last.state !== 'running') {
          cur.tools.push({ kind: 'think', query: '', state: 'running', count: 0 })
        }
        noteStream(cur)
      } else if (ev.type === 'reasoning') {
        if (ev.text) cur.reasoning = ev.text
        finishThink(cur)
      } else if (ev.type === 'reset') {
        if ((cur.content || '').trim().length >= 60) {
          cur.content = cur.content.trimEnd() + '\n\n'
        } else {
          if ((cur.content || '').trim()) cur._stashedContent = cur.content
          cur.content = ''
        }
        scheduleAnswer(cur)
      } else if (ev.type === 'tool') {
        finishThink(cur)
        const a = ev.args || {}
        const kind = (ev.name === 'read_doc' || ev.name === 'read_regulation')
          ? 'read'
          : ev.name === 'pwsh'
            ? 'shell'
            : ev.name === 'browser'
              ? 'browser'
              : ev.name === 'call_api'
                ? 'api'
                : ['search_news', 'entity_brief', 'news_digest'].includes(ev.name)
                  ? 'news'
                  : 'search'
        cur.tools.push({
          kind,
          action: a.action || '',
          query: (kind === 'shell' || kind === 'browser' || kind === 'api')
            ? (a.command || a.query || '')
            : (a.title || a.query || (kind === 'read' ? '文件' : '')),
          state: 'running',
          count: 0,
        })
        noteStream(cur)
      } else if (ev.type === 'tool_result') {
        const list = cur.tools
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].state === 'running') {
            list[i].state = 'done'
            list[i].count = ev.count
            if (ev.exit != null) list[i].exit = ev.exit
            if (ev.note) list[i].note = ev.note
            if (list[i].kind === 'api' && ['save', 'delete', 'discover'].includes(list[i].action)) {
              loadConfig()
            }
            break
          }
        }
        noteStream(cur)
      } else if (ev.type === 'visual') {
        if (!Array.isArray(cur.visuals)) cur.visuals = []
        if (ev.visual) {
          cur.visuals.push(ev.visual)
          ensureMarketBoot()
          if (ev.visual.savedWidgetId) loadCustomWidgets()
          if (ev.visual.pinned) loadDashboardLayout()
        }
        noteStream(cur)
      } else if (ev.type === 'sources') {
        ev.items.forEach((s) => {
          if (!cur.sources.some((x) => x.n === s.n)) cur.sources.push(s)
        })
        scheduleAnswer(cur)
      } else if (ev.type === 'error') {
        cur.error = ev.message
      } else if (ev.type === 'browser_panel') {
        onBrowserPanelEvent(ev)
      } else if (ev.type === 'ask') {
        const questions = ev.questions || []
        const picks = {}
        const otherText = {}
        const intent = questions.some((q) => q.intent === 'recommend') ? 'recommend' : 'ask'
        questions.forEach((q) => {
          const rec = (q.options || []).find((o) => o.recommended)
          picks[q.id] = { ids: rec ? [rec.id] : [], other: false }
          otherText[q.id] = ''
        })
        cur.ask = { questions, picks, otherText, submitted: false, step: 0, intent }
        ;(cur.tools || []).forEach((t) => {
          if (t.state === 'running') t.state = 'done'
        })
        cur.streaming = false
        scheduleAnswer(cur)
        noteStream(cur)
      }
    }

    const docs = ref([])
    const catDept = ref(undefined)
    const catProject = ref('')
    const catFolder = ref('')
    const catDocType = ref('')
    const catQuery = ref('')
    const expandedProjs = reactive({})
    const kbOff = reactive({})
    const treeExpanded = reactive({})
    const activeTreeDocId = ref(null)
    const dropTargetKey = ref('')
    const draggingItem = ref(null)
    const organizing = ref(false)
    const folderUploadInput = ref(null)
    const tableCard = ref(null)
    const tableY = ref(420)

    function treeKeyProject(proj) {
      return 'p::' + proj
    }
    function treeKeyFolder(proj, path) {
      return 'p::' + proj + '|f::' + path
    }
    function treeNodeOpen(key, defaultOpen) {
      const v = treeExpanded[key]
      return v === undefined ? !!defaultOpen : !!v
    }

    function docTypeLabel(dt) {
      return (DOC_TYPE_MAP[dt] && DOC_TYPE_MAP[dt].label) || '通用文档'
    }
    function docTypeColor(dt) {
      return (DOC_TYPE_MAP[dt] && DOC_TYPE_MAP[dt].color) || 'default'
    }
    function chunkProfileLabel(cp) {
      return CHUNK_PROFILE_LABELS[cp] || '条文切分'
    }
    function extBadgeText(ext) {
      const s = (ext || '').replace(/^\./, '').toLowerCase()
      return s || 'doc'
    }
    function extBadgeClass(ext) {
      const s = (ext || '').replace(/^\./, '').toLowerCase()
      if (['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'bmp', 'svg', 'heic', 'heif'].includes(s)) return 'img'
      return s
    }
    function recordMetaVal(r, k) {
      const m = (r && r.meta) || {}
      if (m[k] != null && String(m[k]).trim()) return String(m[k]).trim()
      if (k === 'dept') return r.dept || r.folder || '—'
      if (k === 'sign_date' || k === 'stat_period') return r.issued_date || '—'
      if (k === 'contract_status') return r.status || '履行中'
      if (k === 'metrics' || k === 'visual_summary' || k === 'topic') return r.summary || '—'
      if (k === 'dimensions') return (r.file_ext || '').toUpperCase()
      return '—'
    }
    function recordPills(r) {
      if (!r) return []
      const m = r.meta || {}
      const dt = r.doc_type || 'regulation'
      const pills = []
      const add = (k, v) => {
        const s = String(v == null ? '' : v).trim()
        if (s) pills.push({ k, v: s })
      }
      if (dt === 'regulation') {
        add('文号', r.doc_no || m.doc_no)
        add('部门', m.dept || r.dept || r.folder)
        add('状态', r.status)
        if (m.scope) add('范围', m.scope)
      } else if (dt === 'finance') {
        add('主体', m.entity || r.dept)
        add('报告期', m.period || r.issued_date)
        add('口径', m.audit_status)
        add('单位', m.currency)
      } else if (dt === 'contract') {
        add('甲方', m.party_a)
        add('乙方', m.party_b)
        add('金额', m.amount)
        add('状态', m.contract_status || r.status)
      } else if (dt === 'report') {
        add('类型', m.stage)
        add('作者', m.author || r.dept)
      } else if (dt === 'spreadsheet') {
        add('工作表', m.sheets)
        add('规模', m.row_count)
        add('表头', m.columns)
      } else if (dt === 'image') {
        add('类别', m.image_type)
        add('规格', m.dimensions)
      } else {
        add('主题', m.topic || r.dept)
        if (m.author) add('作者', m.author)
      }
      return pills.slice(0, 4)
    }
    function docMetaPills(doc) {
      const shown = new Set()
      const add = (v) => {
        const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
        if (s) shown.add(s)
      }
      add(doc.project)
      add(doc.folder)
      add(doc.dept)
      add(doc.doc_no)
      add(doc.issued_date)
      if (doc.status && doc.status !== '现行') add(doc.status)
      return recordPills(doc).filter((p) => !shown.has(String(p.v || '').replace(/\s+/g, ' ').trim()))
    }

    function recordSummary(r) {
      const raw = String((r && r.summary) || '').replace(/\s+/g, ' ').trim()
      if (!raw) return ''
      const dup = new Set()
      const add = (v) => {
        const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
        if (s) dup.add(s)
      }
      add(r.doc_no)
      add(r.dept)
      add(r.folder)
      add(r.project)
      add(r.status)
      add(r.issued_date)
      for (const p of recordPills(r)) add(p.v)
      const parts = raw.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean)
      if (parts.length > 1) return parts.filter((p) => !dup.has(p)).join(' · ')
      return dup.has(raw) ? '' : raw
    }

    function renderChunkTable(text) {
      try {
        return answerMarked.parse(String(text || ''))
      } catch (e) {
        return '<pre>' + String(text || '').replace(/</g, '&lt;') + '</pre>'
      }
    }

    const scopeDocs = computed(() => {
      const proj = catProject.value
      const fld = catFolder.value
      const qStr = (catQuery.value || '').trim().toLowerCase()
      return (docs.value || []).filter((d) => {
        if (proj && d.project !== proj) return false
        if (fld && d.folder !== fld && !(d.folder || '').startsWith(fld + '/')) return false
        if (qStr) {
          const blob = [
            d.title, d.doc_no, d.summary, d.project, d.folder, d.dept,
            JSON.stringify(d.meta || {}),
          ].join(' ').toLowerCase()
          if (!blob.includes(qStr)) return false
        }
        return true
      })
    })
    const scopeTotalCount = computed(() => scopeDocs.value.length)
    const scopeDocTypeCapsules = computed(() => {
      const counts = {}
      for (const d of scopeDocs.value) {
        const dt = d.doc_type || 'general'
        counts[dt] = (counts[dt] || 0) + 1
      }
      return DOC_TYPE_SPECS.map((s) => ({
        ...s,
        count: counts[s.id] || 0,
      }))
    })
    const filteredDocs = computed(() => {
      const dt = catDocType.value
      if (!dt) return scopeDocs.value
      return scopeDocs.value.filter((d) => (d.doc_type || 'general') === dt)
    })

    function shortBatchStatus(bi) {
      const s = String((bi && bi.statusText) || '')
      const page = s.match(/(\d+)\s*\/\s*(\d+)/)
      if (page) return page[1] + '/' + page[2]
      if (!bi) return ''
      if (bi.state === 'done') return '已入库'
      if (bi.state === 'skipped') return '已在库'
      if (bi.state === 'pending') return '等待'
      if (bi.state === 'error') {
        if (s.indexOf('中断') >= 0) return '中断'
        if (/fetch|network|网络/i.test(s)) return '网络'
        return '失败'
      }
      if (s.indexOf('入库') >= 0) return '入库'
      return '识别'
    }
    function batchPlaceholderItems() {
      if (ingest.open || !ingest.batchMode) return []
      return ingest.batchItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item.state !== 'done' && item.state !== 'skipped')
    }
    function placeholderFileName(item) {
      return String((item && item.name) || '').split('/').pop() || '未命名文件'
    }
    const catalogRows = computed(() => {
      const real = filteredDocs.value
      const pending = batchPlaceholderItems()
      if (!pending.length) return real
      const proj = catProject.value
      const folder = catFolder.value || ''
      const targetProj = ingest.project || ''
      if (proj && proj !== targetProj) return real
      const extras = []
      for (const { item, idx } of pending) {
        const itemFolder = item.folder || ingest.folder || ''
        if (folder && itemFolder !== folder && !itemFolder.startsWith(folder + '/')) continue
        const base = placeholderFileName(item)
        const ext = (base.match(/(\.[a-z0-9]+)$/i) || [, ''])[1].toLowerCase()
        extras.push({
          id: 'ph-' + idx,
          _placeholder: true,
          _loading: !!ingest.batchRunning && (item.state === 'running' || item.state === 'pending'),
          _status: shortBatchStatus(item),
          title: base,
          file_ext: ext,
          project: targetProj,
          folder: itemFolder,
          doc_type: item.doc_type || '',
        })
      }
      return extras.concat(real)
    })

    const treeDocsIndex = computed(() => {
      const map = new Map()
      for (const d of docs.value || []) {
        const k = (d.project || '') + '\u0000' + (d.folder || '')
        if (!map.has(k)) map.set(k, [])
        map.get(k).push(d)
      }
      return map
    })
    function _treeSortDocs(a, b) {
      return String(a.title || '').localeCompare(String(b.title || ''), 'zh')
    }

    const cursorTreeRows = computed(() => {
      const rows = []
      const projs = facets.tree || []
      const dmap = treeDocsIndex.value
      const selProj = catProject.value
      const selFolder = catFolder.value || ''
      const selDoc = activeTreeDocId.value
      const selMatch = (proj, folder) => (
        selProj === proj && selFolder === (folder || '') && !selDoc
      )

      const pushFile = (d, depth) => {
        rows.push({
          key: 'd::' + d.id,
          kind: 'file',
          depth,
          project: d.project || '',
          folder: d.folder || '',
          name: d.title || d.rel_path || '未命名文件',
          tooltip: [d.project, d.folder, d.title || d.rel_path].filter(Boolean).join(' / '),
          doc: d,
          open: false,
          hasChildren: false,
          isSelected: selDoc === d.id,
        })
      }
      const pendingPh = batchPlaceholderItems()
      const phUsed = new Set()
      const pushPlaceholders = (project, folder, depth) => {
        for (const { item, idx } of pendingPh) {
          const folderOf = item.folder || ingest.folder || ''
          if ((ingest.project || '') !== project || folderOf !== (folder || '')) continue
          phUsed.add(idx)
          const base = placeholderFileName(item)
          rows.push({
            key: 'ph::' + idx,
            kind: 'placeholder',
            depth,
            project,
            folder: folderOf,
            name: base,
            tooltip: base,
            status: shortBatchStatus(item),
            loading: !!ingest.batchRunning && (item.state === 'running' || item.state === 'pending'),
            open: false,
            hasChildren: false,
            isSelected: false,
          })
        }
      }

      for (const proj of projs) {
        const name = proj.name
        const folders = (proj.folders || []).slice()
        const rootFiles = (dmap.get(name + '\u0000') || []).slice().sort(_treeSortDocs)
        const pKey = treeKeyProject(name)
        const pDefaultOpen = true
        const pOpen = treeNodeOpen(pKey, pDefaultOpen)
        const hasChildren = folders.length > 0 || rootFiles.length > 0
        rows.push({
          key: pKey,
          kind: 'project',
          depth: 0,
          project: name,
          folder: '',
          name,
          tooltip: name,
          count: proj.count || 0,
          open: pOpen,
          hasChildren,
          isSelected: selMatch(name, ''),
        })
        if (!pOpen) continue

        folders.sort((a, b) => String(a.path || '').localeCompare(String(b.path || ''), 'zh'))
        const walk = (parentPath) => {
          const kids = folders.filter((f) => {
            const path = f.path || ''
            if (!path) return false
            if (!parentPath) return !path.includes('/')
            return path.startsWith(parentPath + '/') && !path.slice(parentPath.length + 1).includes('/')
          })
          for (const f of kids) {
            const path = f.path || ''
            const fKey = treeKeyFolder(name, path)
            const fFiles = (dmap.get(name + '\u0000' + path) || []).slice().sort(_treeSortDocs)
            const fSub = folders.some((x) => (x.path || '').startsWith(path + '/'))
            const fDepth = (path.match(/\//g) || []).length + 1
            const selectedOrAncestor = selProj === name && (selFolder === path || (selFolder || '').startsWith(path + '/'))
            const fOpen = treeNodeOpen(fKey, selectedOrAncestor) || selectedOrAncestor
            rows.push({
              key: fKey,
              kind: 'folder',
              depth: fDepth,
              project: name,
              folder: path,
              name: f.name || path.split('/').pop(),
              tooltip: name + ' / ' + path,
              count: f.count || 0,
              open: fOpen,
              hasChildren: fSub || fFiles.length > 0,
              isSelected: selMatch(name, path),
            })
            if (!fOpen) continue
            walk(path)
            for (const d of fFiles) pushFile(d, fDepth + 1)
            pushPlaceholders(name, path, fDepth + 1)
          }
          if (!parentPath) {
            for (const d of rootFiles) pushFile(d, 1)
            pushPlaceholders(name, '', 1)
          }
        }
        walk('')
      }
      if (phUsed.size < pendingPh.length && ingest.project) {
        const at = rows.findIndex((r) => r.kind === 'project' && r.project === ingest.project && r.open)
        if (at >= 0) {
          const extra = []
          for (const { item, idx } of pendingPh) {
            if (phUsed.has(idx)) continue
            const base = placeholderFileName(item)
            extra.push({
              key: 'ph::' + idx,
              kind: 'placeholder',
              depth: 1,
              project: ingest.project,
              folder: item.folder || ingest.folder || '',
              name: base,
              tooltip: base,
              status: shortBatchStatus(item),
              loading: !!ingest.batchRunning && (item.state === 'running' || item.state === 'pending'),
              open: false,
              hasChildren: false,
              isSelected: false,
            })
          }
          rows.splice(at + 1, 0, ...extra)
        }
      }
      return rows
    })

    function toggleTreeNodeExpand(row) {
      if (!row || row.kind === 'file' || !row.hasChildren) return
      treeExpanded[row.key] = !row.open
    }
    function onTreeRowClick(row) {
      if (!row) return
      if (row.kind === 'placeholder') {
        ingest.open = true
        return
      }
      if (row.kind === 'file') {
        activeTreeDocId.value = row.doc.id
        catProject.value = row.project || ''
        catFolder.value = row.folder || ''
        treeExpanded[treeKeyProject(row.project)] = true
        if (row.folder) treeExpanded[treeKeyFolder(row.project, row.folder)] = true
        nextTick(measureTable)
        openDoc(row.doc.id, null)
        return
      }
      activeTreeDocId.value = null
      treeExpanded[row.key] = true
      if (row.kind === 'project') {
        treeExpanded[treeKeyProject(row.project)] = true
      }
      selectTreeScope(row.project, row.folder || '')
    }
    function drillUpTree() {
      if (catFolder.value) {
        const parts = catFolder.value.split('/')
        parts.pop()
        const parent = parts.join('/')
        treeExpanded[treeKeyProject(catProject.value)] = true
        if (parent) treeExpanded[treeKeyFolder(catProject.value, parent)] = true
        selectTreeScope(catProject.value, parent)
        return
      }
      if (catProject.value) {
        selectTreeScope('', '')
      }
    }
    async function refreshCatalogTree() {
      await loadFacets()
      await loadDocs()
      await loadStats()
    }
    function toggleExpandCollapseAll() {
      const projs = facets.tree || []
      const anyOpen = projs.some((p) => treeNodeOpen(treeKeyProject(p.name), true))
      const next = !anyOpen
      for (const p of projs) {
        treeExpanded[treeKeyProject(p.name)] = next
        for (const f of p.folders || []) {
          treeExpanded[treeKeyFolder(p.name, f.path)] = next
        }
      }
    }
    function openIngestInScope(proj, folder) {
      if (ingest.batchMode && ingest.batchItems.length) {
        ingest.open = true
        return
      }
      openIngest()
      if (proj) ingest.project = proj
      if (folder) ingest.folder = folder
    }

    function onTreeDragStart(e, row) {
      if (!row || (row.kind !== 'file' && row.kind !== 'folder')) {
        e.preventDefault()
        return
      }
      draggingItem.value = row.kind === 'file'
        ? { kind: 'doc', id: row.doc.id, project: row.project, folder: row.folder }
        : { kind: 'folder', project: row.project, folder: row.folder }
      try {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', JSON.stringify(draggingItem.value))
      } catch (err) { /* ignore */ }
    }
    function _isValidDropTarget(item, row) {
      if (!item || !row || row.kind === 'file') return false
      if (item.kind === 'folder') {
        if (!item.folder) return false
        if (item.project === row.project) {
          if (item.folder === row.folder) return false
          if (row.folder && (row.folder === item.folder || row.folder.startsWith(item.folder + '/'))) return false
        }
      }
      if (item.kind === 'doc') {
        if (item.project === row.project && (item.folder || '') === (row.folder || '')) return false
      }
      return true
    }
    function onTreeDragOver(e, row) {
      if (!_isValidDropTarget(draggingItem.value, row)) return
      e.preventDefault()
      try { e.dataTransfer.dropEffect = 'move' } catch (err) { /* ignore */ }
      dropTargetKey.value = row.key
    }
    function onTreeDragLeave(e, row) {
      if (dropTargetKey.value === row.key) dropTargetKey.value = ''
    }
    function onTreeDragEnd() {
      draggingItem.value = null
      dropTargetKey.value = ''
    }
    async function performMove(item, dstProj, dstFolder) {
      if (!item) return
      if (item.kind === 'doc') {
        const j = await api.post('/api/docs/meta', {
          doc_id: item.id, project: dstProj, folder: dstFolder || '',
        })
        if (!j.ok) {
          message.error(j.error || '移动文件失败')
          return
        }
        message.success('已移动至 ' + (dstProj + (dstFolder ? ' / ' + dstFolder : '')))
        if (activeTreeDocId.value === item.id) {
          catProject.value = dstProj
          catFolder.value = dstFolder || ''
        }
      } else {
        const leaf = (item.folder || '').split('/').pop()
        const dstPath = (dstFolder ? dstFolder + '/' : '') + leaf
        const j = await api.post('/api/folders/move', {
          src_project: item.project,
          src_path: item.folder,
          dst_project: dstProj,
          dst_path: dstPath,
        })
        if (!j.ok) {
          message.error(j.error || '移动文件夹失败')
          return
        }
        message.success(`文件夹已移动，共调整 ${j.moved_docs || 0} 份文件`)
        treeExpanded[treeKeyProject(dstProj)] = true
        if (dstFolder) treeExpanded[treeKeyFolder(dstProj, dstFolder)] = true
      }
      await refreshCatalogTree()
      treeExpanded[dstFolder ? treeKeyFolder(dstProj, dstFolder) : treeKeyProject(dstProj)] = true
    }
    async function onTreeDrop(e, row) {
      e.preventDefault()
      const item = draggingItem.value
      dropTargetKey.value = ''
      draggingItem.value = null
      if (!_isValidDropTarget(item, row)) return
      await performMove(item, row.project, row.folder || '')
    }

    const dynamicColumns = computed(() => {
      const dt = catDocType.value
      if (dt === 'regulation') {
        return [
          { title: '文件名称', key: 'title', ellipsis: true, width: 280, fixed: 'left' },
          { title: '主管部门', key: 'meta.dept', width: 130, ellipsis: true },
          { title: '发文字号', dataIndex: 'doc_no', key: 'doc_no', width: 185, ellipsis: true },
          { title: '发布日期', dataIndex: 'issued_date', key: 'issued_date', width: 115 },
          { title: '效力状态', key: 'status', width: 95 },
          { title: '条款/分段', key: 'n_chunks', width: 95 },
          { title: '操作', key: 'op', width: 76, fixed: 'right' },
        ]
      }
      if (dt === 'finance') {
        return [
          { title: '报表/报告名称', key: 'title', ellipsis: true, width: 250, fixed: 'left' },
          { title: '公司主体', key: 'meta.entity', width: 150, ellipsis: true },
          { title: '报告期', key: 'meta.period', width: 120, ellipsis: true },
          { title: '审计/口径', key: 'meta.audit_status', width: 110 },
          { title: '币种单位', key: 'meta.currency', width: 105 },
          { title: '核心指标与表摘要', key: 'meta.metrics', width: 220, ellipsis: true },
          { title: '分段/表数', key: 'n_chunks', width: 95 },
          { title: '操作', key: 'op', width: 76, fixed: 'right' },
        ]
      }
      if (dt === 'contract') {
        return [
          { title: '合同/协议名称', key: 'title', ellipsis: true, width: 250, fixed: 'left' },
          { title: '甲方', key: 'meta.party_a', width: 160, ellipsis: true },
          { title: '乙方 / 相对方', key: 'meta.party_b', width: 160, ellipsis: true },
          { title: '合同金额', key: 'meta.amount', width: 130, ellipsis: true },
          { title: '签订日期', key: 'meta.sign_date', width: 115 },
          { title: '履行状态', key: 'meta.contract_status', width: 100 },
          { title: '操作', key: 'op', width: 76, fixed: 'right' },
        ]
      }
      if (dt === 'report') {
        return [
          { title: '报告/方案名称', key: 'title', ellipsis: true, width: 260, fixed: 'left' },
          { title: '类型/阶段', key: 'meta.stage', width: 120, ellipsis: true },
          { title: '编制单位 / 作者', key: 'meta.author', width: 150, ellipsis: true },
          { title: '核心主题摘要', dataIndex: 'summary', key: 'summary', width: 260, ellipsis: true },
          { title: '日期', dataIndex: 'issued_date', key: 'issued_date', width: 115 },
          { title: '章节块数', key: 'n_chunks', width: 90 },
          { title: '操作', key: 'op', width: 76, fixed: 'right' },
        ]
      }
      if (dt === 'spreadsheet') {
        return [
          { title: '台账/表格名称', key: 'title', ellipsis: true, width: 240, fixed: 'left' },
          { title: '工作表 (Sheets)', key: 'meta.sheets', width: 160, ellipsis: true },
          { title: '核心表头字段', key: 'meta.columns', width: 260, ellipsis: true },
          { title: '数据规模', key: 'meta.row_count', width: 100 },
          { title: '统计周期', key: 'meta.stat_period', width: 115 },
          { title: '表切片数', key: 'n_chunks', width: 90 },
          { title: '操作', key: 'op', width: 76, fixed: 'right' },
        ]
      }
      if (dt === 'image') {
        return [
          { title: '图像/图纸名称', key: 'title', ellipsis: true, width: 240, fixed: 'left' },
          { title: '图像类别', key: 'meta.image_type', width: 120 },
          { title: 'AI 视觉摘要与图中文字提要', key: 'meta.visual_summary', width: 340, ellipsis: true },
          { title: '尺寸/格式', key: 'meta.dimensions', width: 110 },
          { title: '日期', dataIndex: 'issued_date', key: 'issued_date', width: 115 },
          { title: '操作', key: 'op', width: 76, fixed: 'right' },
        ]
      }
      // 混合多态视图（默认）：零空白格，自适应展示任意文件性质的核心属性胶囊
      return [
        { title: '文件名称与路径', key: 'title', ellipsis: true, width: 260, fixed: 'left' },
        { title: '文件性质', key: 'doc_type', width: 105 },
        { title: '核心属性 / 智能提取（多态列）', key: 'polymorphic', width: 380 },
        { title: '切分与内容块', key: 'chunk_info', width: 130 },
        { title: '日期', dataIndex: 'issued_date', key: 'issued_date', width: 110 },
        { title: '操作', key: 'op', width: 76, fixed: 'right' },
      ]
    })
    const columns = dynamicColumns
    let tableRo = null
    function measureTable() {
      const wrap = tableCard.value
      if (!wrap) return
      const pag = wrap.querySelector('.ant-table-pagination')
      const head = wrap.querySelector('.ant-table-header') || wrap.querySelector('.ant-table-thead')
      const pagH = pag ? pag.getBoundingClientRect().height : 48
      const headH = head ? head.getBoundingClientRect().height : 39
      tableY.value = Math.max(180, Math.floor(wrap.clientHeight - pagH - headH))
    }
    function bindTableMeasure() {
      nextTick(() => {
        const el = tableCard.value
        if (!el) return
        if (tableRo) tableRo.disconnect()
        tableRo = new ResizeObserver(() => measureTable())
        tableRo.observe(el)
        measureTable()
        nextTick(measureTable)
      })
    }
    const drawerWidth = ref(960)
    function syncDrawerWidth() {
      const w = window.innerWidth || 960
      drawerWidth.value = Math.min(960, Math.max(320, w))
    }
    const catalogAlive = ref(false)
    function armCatalog() {
      catalogAlive.value = true
      nextTick(bindTableMeasure)
    }
    watch(tab, (t) => { if (t === 'catalog') armCatalog() })
    watch(docs, () => { if (tab.value === 'catalog') nextTick(measureTable) })
    onMounted(() => {
      syncDrawerWidth()
      window.addEventListener('resize', syncDrawerWidth)
      if (tab.value === 'catalog') armCatalog()
    })
    onBeforeUnmount(() => {
      window.removeEventListener('resize', syncDrawerWidth)
      if (tableRo) tableRo.disconnect()
    })

    const drawerOpen = ref(false)
    const doc = reactive({ chunks: [] })
    const docLoading = ref(false)
    const activeSeq = ref(0)
    const currentDocId = ref(null)
    const docView = ref('text')
    const originPage = ref(1)
    const pageScroll = ref(null)
    const pdfScale = ref(0.6)
    const pdfPanning = ref(false)
    let pdfPan = { x: 0, y: 0, sl: 0, st: 0 }
    const ZOOM_STEPS = [0.5, 0.6, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]
    const zoomLabel = computed(() => (
      Math.abs(pdfScale.value - 1) < 0.001 ? '适应宽度' : `${Math.round(pdfScale.value * 100)}%`
    ))

    function setPdfScale(next, origin) {
      const el = pageScroll.value
      const old = pdfScale.value
      const clamped = Math.min(3, Math.max(0.5, Math.round(next * 100) / 100))
      if (Math.abs(clamped - old) < 0.001) return
      const ratio = clamped / old
      const cx = origin && origin.x != null ? origin.x : (el ? el.clientWidth / 2 : 0)
      const cy = origin && origin.y != null ? origin.y : (el ? el.clientHeight / 2 : 0)
      pdfScale.value = clamped
      nextTick(() => {
        if (!el) return
        el.scrollLeft = (el.scrollLeft + cx) * ratio - cx
        el.scrollTop = (el.scrollTop + cy) * ratio - cy
        if (clamped <= 1) el.scrollLeft = 0
      })
    }
    function zoomIn() {
      const n = ZOOM_STEPS.find((s) => s > pdfScale.value + 0.001)
      setPdfScale(n || ZOOM_STEPS[ZOOM_STEPS.length - 1])
    }
    function zoomOut() {
      const n = [...ZOOM_STEPS].reverse().find((s) => s < pdfScale.value - 0.001)
      setPdfScale(n || ZOOM_STEPS[0])
    }
    function onZoomPreset(e) {
      setPdfScale(Number(e.key))
    }
    function resetPdfZoom() {
      setPdfScale(0.6)
    }

    function onPdfWheel(e) {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const el = pageScroll.value
      if (!el) return
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const rect = el.getBoundingClientRect()
      setPdfScale(pdfScale.value * factor, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    }

    function onPdfDown(e) {
      if (e.button !== 0 || e.ctrlKey || e.metaKey) return
      const el = pageScroll.value
      if (!el) return
      pdfPanning.value = true
      pdfPan = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
      try { el.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
    }

    function onPdfMove(e) {
      if (!pdfPanning.value) return
      const el = pageScroll.value
      if (!el) return
      el.scrollLeft = pdfPan.sl - (e.clientX - pdfPan.x)
      el.scrollTop = pdfPan.st - (e.clientY - pdfPan.y)
    }

    function onPdfUp(e) {
      pdfPanning.value = false
      const el = pageScroll.value
      if (el && e && e.pointerId != null) {
        try { el.releasePointerCapture(e.pointerId) } catch (err) { /* ignore */ }
      }
    }

    watch(pageScroll, (el, prev) => {
      if (prev) prev.removeEventListener('wheel', onPdfWheel)
      if (el) el.addEventListener('wheel', onPdfWheel, { passive: false })
    })
    const canPdf = computed(() => {
      const ext = (doc.file_ext || '').toLowerCase()
      if (ext === '.pdf' || IMAGE_EXT.includes(ext) || ['.bmp', '.tif', '.tiff'].includes(ext)) return true
      const t = doc.text_source || ''
      return t === 'paddleocr-vl' || t === 'pdf-layer' || t === 'vlm' || t === 'vlm+ocr' || t === 'image-meta'
    })
    const pageList = computed(() => {
      const n = doc.n_pages || 1
      return Array.from({ length: n }, (_, i) => i + 1)
    })
    const nearPages = ref({})
    const loadedPages = ref({})
    function pageShown(p) {
      return !!loadedPages.value[p]
    }
    function markPageShown(p) {
      if (!p || loadedPages.value[p]) return
      loadedPages.value = { ...loadedPages.value, [p]: 1 }
    }
    function onImgMount(vnode, p) {
      const el = vnode && vnode.el ? vnode.el : vnode
      if (el && el.complete && el.naturalWidth) onPageLoaded(p)
    }
    function markNear(center) {
      const n = Number(doc.n_pages) || 1
      const p = Math.min(n, Math.max(1, center || 1))
      const next = { ...nearPages.value }
      for (let i = Math.max(1, p - 2); i <= Math.min(n, p + 2); i++) next[i] = 1
      nearPages.value = next
    }
    function pageReady(p) {
      return !!nearPages.value[p]
    }
    const activeChunk = computed(
      () => (doc.chunks || []).find((c) => c.seq === activeSeq.value) || null
    )
    const hitPage = computed(
      () => (activeChunk.value && activeChunk.value.page_start) || 0
    )
    const activeChunkId = computed(() => (activeChunk.value && activeChunk.value.id) || null)
    watch(currentDocId, () => {
      nearPages.value = {}
      loadedPages.value = {}
    })
    watch(activeChunkId, () => {
      const p = hitPage.value
      if (!p || !loadedPages.value[p]) return
      const next = { ...loadedPages.value }
      delete next[p]
      loadedPages.value = next
    })
    watch([originPage, hitPage, () => doc.n_pages], () => {
      markNear(originPage.value || hitPage.value || 1)
    })

    function onPageScroll(e) {
      const el = e.target
      const wraps = el.querySelectorAll('.page-wrap')
      const top = el.scrollTop + el.clientHeight * 0.3
      for (const w of wraps) {
        if (w.offsetTop <= top) {
          const p = Number(w.dataset.page)
          if (p) originPage.value = p
        }
      }
    }

    function onPageImgError(e) {
      const img = e.target
      if (!img.dataset.retry) {
        img.dataset.retry = '1'
        const base = img.getAttribute('src').split('&_r=')[0]
        setTimeout(() => { img.src = base + '&_r=' + Date.now() }, 800)
        return
      }
      const wrap = img.closest('[data-page]')
      if (wrap) markPageShown(Number(wrap.dataset.page))
    }

    const didJump = ref(false)

    function onPageLoaded(p) {
      markPageShown(p)
      if (!didJump.value && hitPage.value && p === hitPage.value) {
        didJump.value = true
        nextTick(() => jumpToHit())
      }
    }

    function jumpToHit(tries) {
      const el = pageScroll.value
      if (!el || !hitPage.value) return
      const w = el.querySelector('.page-wrap[data-page="' + hitPage.value + '"]')
      if (!w) return
      const n = tries || 0
      if (w.offsetTop <= 0 && n < 30) {
        setTimeout(() => jumpToHit(n + 1), 150)
        return
      }
      el.scrollTo({ top: Math.max(0, w.offsetTop - 8), behavior: 'auto' })
      originPage.value = hitPage.value
    }

    function setDocView(v) {
      docView.value = v
      if (v === 'text') pulseChunks()
      if (v === 'pdf') {
        originPage.value = hitPage.value || 1
        nextTick(() => jumpToHit())
      }
    }

    async function openDoc(docId, chunkId) {
      drawerOpen.value = true
      docLoading.value = true
      currentDocId.value = docId
      activeSeq.value = 0
      originPage.value = 0
      pdfScale.value = 0.6
      pdfPanning.value = false
      nextTick(() => {
        const el = pageScroll.value
        if (el) el.scrollLeft = 0
      })
      try {
        const d = await api.get('/api/doc/' + docId)
        Object.keys(doc).forEach((k) => delete doc[k])
        Object.assign(doc, d)
        await nextTick()
        let target = null
        if (chunkId) target = doc.chunks.find((c) => c.id === chunkId)
        const ext = (doc.file_ext || '').toLowerCase()
        const asPdf = (
          ext === '.pdf' ||
          IMAGE_EXT.includes(ext) ||
          doc.text_source === 'paddleocr-vl' ||
          doc.text_source === 'pdf-layer'
        )
        docView.value = asPdf ? 'pdf' : 'text'
        if (!asPdf) pulseChunks()
        if (target) {
          activeSeq.value = target.seq
          originPage.value = target.page_start || 1
          await nextTick()
          didJump.value = false
          if (asPdf) {
            jumpToHit()
          } else {
            const el = document.querySelector('.chunk.active')
            if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
        }
      } finally {
        docLoading.value = false
      }
    }

    async function openFile() {
      const r = await api.post('/api/open', { doc_id: currentDocId.value })
      if (!r.ok) message.error(r.error || '打开失败')
    }

    async function loadStats() {
      Object.assign(stats, await api.get('/api/stats'))
    }
    async function loadFacets() {
      const data = await api.get('/api/facets')
      Object.assign(facets, data)
      for (const p of (data.tree || [])) {
        if (expandedProjs[p.name] === undefined) expandedProjs[p.name] = true
      }
    }
    async function loadDocs() {
      docs.value = await api.get('/api/docs')
    }
    function applyKbOff(names) {
      const off = {}
      for (const name of names || []) off[name] = true
      for (const key of Object.keys(kbOff)) {
        if (!off[key]) delete kbOff[key]
      }
      Object.assign(kbOff, off)
    }
    async function loadKb() {
      try {
        const data = await api.get('/api/kb')
        applyKbOff(data && data.disabled)
      } catch (e) { /* 旧进程还没有这个接口时，开关保持打开 */ }
    }
    async function toggleProjectKb(row) {
      const name = (row && (row.project || row.name)) || ''
      if (!name) return
      const enabled = !!kbOff[name]
      try {
        const data = await api.post('/api/kb', { project: name, enabled })
        if (data && data.error) {
          message.error(data.error)
          return
        }
        applyKbOff(data && data.disabled)
      } catch (e) {
        message.error('没能切换文库，请重启 O2 后再试')
      }
    }
    function isProjExpanded(projName) {
      return expandedProjs[projName] !== false
    }
    function selectTreeScope(projName, folderPath) {
      activeTreeDocId.value = null
      if (projName && !folderPath && catProject.value === projName && !catFolder.value) {
        expandedProjs[projName] = !isProjExpanded(projName)
      } else if (projName) {
        expandedProjs[projName] = true
      }
      catProject.value = projName || ''
      catFolder.value = folderPath || ''
      nextTick(measureTable)
    }
    function setCatDocType(dt) {
      catDocType.value = dt || ''
      nextTick(measureTable)
    }

    const cfg = reactive({
      base_url: '', api_key: '', model: '', src_root: '', effort: 'high',
      provider_id: '', context: '',
      temperature: 0.1, top_k: 8,
      providers: [],
      embed_providers: [],
      embed_provider_id: '',
      embed_model: '',
      embed_use: false,
      embed_running: false,
      api_connectors: [],
      api_key_set: false, paddle_token: '', paddle_token_set: false,
      shell: true, browser: true, api_call: true,
      pdf_ocr_mode: 'smart',
      batch_concurrency: 3,
      batch_fast_meta: false,
      browser_download_mode: 'sandbox',
      auto_clean_temp: true,
      ui_density: 'default',
      ui_theme: 'light',
      default_tab: 'ask',
      followup_mode: 'steer',
      news_enabled: false,
      news_auto_translate: true,
      news_refresh_minutes: 15,
      news_llm_provider_id: '',
      news_llm_model: '',
      news_rsshub_base: 'https://rsshub.app',
      news_glossary: [],
      news_local_embed: true,
      news_local_rerank: true,
      dashboard_layout: null,
      market_proxy: '',
      market_source_mode: 'auto',
      detected_system_proxy: '',
      db_path: '',
    })
    const protocols = ref([
      { id: 'openai', label: 'OpenAI 兼容 (v1/chat/completions)' },
      { id: 'anthropic', label: 'Anthropic Messages (v1/messages)' },
      { id: 'gemini', label: 'Google Gemini' },
    ])
    const embedProtocols = ref([
      { id: 'openai', label: 'OpenAI 兼容 (v1/embeddings)' },
      { id: 'dashscope', label: '通义千问 DashScope 原生' },
    ])
    const apiProtocols = ref([
      { id: 'rest', label: 'REST / HTTP JSON' },
      { id: 'graphql', label: 'GraphQL' },
      { id: 'jsonrpc', label: 'JSON-RPC 2.0' },
      { id: 'form', label: 'Form 表单 (urlencoded / multipart)' },
      { id: 'soap', label: 'SOAP / XML' },
      { id: 'sse', label: 'SSE / EventStream / NDJSON' },
    ])
    const apiAuthTypes = ref([
      { id: 'none', label: '无（免费 / 公开 API，无需密钥）' },
      { id: 'bearer', label: 'Bearer / Token Header (Authorization)' },
      { id: 'header', label: '自定义 Header (X-Api-Key 等)' },
      { id: 'query', label: 'Query 参数 (api_key / key 等)' },
      { id: 'basic', label: 'HTTP Basic (账号 + 密码)' },
      { id: 'hmac_sha256', label: 'HMAC-SHA256 签名 (交易所 / 企业网关)' },
      { id: 'oauth2_client_credentials', label: 'OAuth2 企业令牌' },
      { id: 'cookie', label: 'Cookie 凭证' },
    ])
    const apiCategories = [
      { id: 'macro', label: '宏观与汇率' },
      { id: 'market', label: '行情与公司' },
      { id: 'filings', label: '披露与主体' },
      { id: 'trade', label: '贸易与航运' },
      { id: 'news', label: '新闻与事件' },
      { id: 'reference', label: '文献资料' },
      { id: 'geo', label: '天气与地理' },
      { id: 'dev', label: '开发' },
      { id: 'other', label: '其他' },
    ]
    const apiCategoryByName = {
      fred: 'macro', eia: 'macro', treasuryfiscaldata: 'macro', bls: 'macro',
      ecb: 'macro', worldbank: 'macro', frankfurter: 'macro',
      yahoofinance: 'market', fmp: 'market', finnhub: 'market', eastmoney: 'market',
      eastmoneyhistory: 'market', coingecko: 'market', '山西证券tushare网关': 'market',
      gleif: 'filings', secedgar: 'filings',
      comtrade: 'trade', comtradepreview: 'trade', imfportwatch: 'trade',
      vesselapi: 'trade', digitrafficais: 'trade',
      gdelt: 'news', hackernews: 'news',
      wikipedia: 'reference', openalex: 'reference', crossref: 'reference',
      openmeteo: 'geo', nws: 'geo', usgs: 'geo',
      github: 'dev', pypi: 'dev',
    }
    const apiCategoryKeywords = {
      macro: ['fred', 'stlouisfed', 'eia', 'treasury', 'fiscaldata', 'bls', 'ecb', 'worldbank', 'frankfurter', 'imf', 'oecd', 'pbc', 'gdp', 'cpi', 'ppi', 'inflation', 'forex', 'currency', 'fx', 'macro', '宏观', '汇率', '利率', '央行', '统计局', '通胀', '国债', '外汇'],
      market: ['yahoofinance', 'fmp', 'finnhub', 'eastmoney', 'coingecko', 'tushare', 'akshare', 'binance', 'okx', 'stock', 'quote', 'ticker', 'kline', 'equity', 'etf', 'fund', 'crypto', 'futures', 'market', '行情', '股票', '证券', '基金', '期货', 'k线', '股价', '市值', '交易所'],
      filings: ['gleif', 'secedgar', 'sec.gov', 'edgar', 'cninfo', 'qichacha', 'tianyancha', 'lei', '10-k', '10-q', 'filing', 'disclosure', '披露', '公告', '巨潮', '企查查', '天眼查', '工商', '主体', '招股书', '年报'],
      trade: ['comtrade', 'portwatch', 'vessel', 'digitraffic', 'ais', 'customs', 'tariff', 'freight', 'shipping', 'container', 'port', 'logistics', 'bdi', 'scfi', 'cargo', '贸易', '航运', '船舶', '港口', '海关', '进出口', '关税', '物流', '货运', '运价', '集装箱', '供应链'],
      news: ['gdelt', 'hackernews', 'newsapi', 'rss', 'feed', 'headline', 'reuters', 'bloomberg', 'tass', 'sentiment', '新闻', '资讯', '快讯', '舆情', '事件', '头条', '情报'],
      reference: ['wikipedia', 'openalex', 'crossref', 'arxiv', 'pubmed', 'doi', 'scholar', 'paper', 'journal', '文献', '百科', '论文', '期刊', '学术', '专利'],
      geo: ['openmeteo', 'open-meteo', 'nws', 'weather', 'usgs', 'qweather', 'amap', 'mapbox', 'climate', 'earthquake', 'geocode', '天气', '气象', '预报', '地理', '地图', '高德', '经纬度', '地震'],
      dev: ['github', 'gitlab', 'pypi', 'npmjs', 'docker', 'cloudflare', 'dns', 'ipinfo', 'repos', '开发', '代码', '仓库', '镜像', '域名'],
    }
    function inferApiCategory(name, baseUrl, notes, endpoints) {
      const key = String(name || '').trim().toLowerCase().replace(/\s+/g, '')
      if (apiCategoryByName[key]) return apiCategoryByName[key]
      const epStr = Array.isArray(endpoints)
        ? endpoints.slice(0, 20).map((e) => `${e.path || ''} ${e.summary || ''}`).join(' ').toLowerCase()
        : ''
      const nLow = String(name || '').toLowerCase()
      const uLow = String(baseUrl || '').toLowerCase()
      const descLow = String(notes || '').toLowerCase()
      let best = 'other'
      let bestScore = 0
      for (const [catId, kws] of Object.entries(apiCategoryKeywords)) {
        let sc = 0
        for (const kw of kws) {
          if (nLow.includes(kw) || key.includes(kw)) sc += 6
          if (uLow.includes(kw)) sc += 5
          if (descLow.includes(kw)) sc += 3
          if (epStr.includes(kw)) sc += 2
        }
        if (sc > bestScore) {
          bestScore = sc
          best = catId
        }
      }
      return bestScore >= 3 ? best : 'other'
    }
    const apiPresets = ref([
      { id: 'public', name: '公开 REST API', protocol: 'rest', base_url: 'https://', auth_type: 'none', allow_write: false, notes: '免费、无需 Key 的公开接口。保存后会出现在「已接入 API」目录中，提醒 AI 优先走这条渠道。' },
      { id: 'rest_bearer', name: 'Bearer REST API', protocol: 'rest', base_url: 'https://', auth_type: 'bearer', auth_prefix: 'Bearer', allow_write: false, notes: '通用 Bearer 鉴权 REST / 数据库接口。' },
      { id: 'fred', name: 'FRED', protocol: 'rest', base_url: 'https://api.stlouisfed.org', auth_type: 'query', query_name: 'api_key', allow_write: false, notes: '美联储圣路易斯 FRED。例：GET /fred/series/observations?series_id=FEDFUNDS&file_type=json' },
      { id: 'binance', name: 'Binance', protocol: 'rest', base_url: 'https://api.binance.com', auth_type: 'hmac_sha256', header_name: 'X-MBX-APIKEY', signature_param: 'signature', allow_write: false, notes: '币安接口。行情可匿名 GET /api/v3/ticker/24hr；账户自动 HMAC-SHA256 签名。' },
      { id: 'graphql', name: 'GraphQL API', protocol: 'graphql', base_url: 'https://', auth_type: 'bearer', allow_write: false, notes: '通用 GraphQL 端点。调用时传 graphql_query 与 graphql_variables。' },
      { id: 'jsonrpc', name: 'JSON-RPC 2.0', protocol: 'jsonrpc', base_url: 'https://', auth_type: 'none', allow_write: false, notes: '通用 JSON-RPC 2.0 接口。调用时传 rpc_method 与 rpc_params。' },
      { id: 'oauth2', name: 'OAuth2 / 企业应用', protocol: 'rest', base_url: 'https://', auth_type: 'oauth2_client_credentials', token_url: 'https://', allow_write: false, notes: '自动向 token_url 换取并缓存 access_token，兼容标准 OAuth2、飞书、钉钉、企业微信等。' },
    ])
    const EMBED_PRESET_SPEC = {
      qwen: {
        id: 'qwen', name: '千问 AI', preset: 'qwen', protocol: 'openai',
        base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        models: [
          { id: 'text-embedding-v4', label: 'text-embedding-v4' },
          { id: 'text-embedding-v3', label: 'text-embedding-v3' },
          { id: 'text-embedding-v2', label: 'text-embedding-v2' },
        ],
      },
      siliconflow: {
        id: 'siliconflow', name: '硅基流动', preset: 'siliconflow', protocol: 'openai',
        base_url: 'https://api.siliconflow.cn/v1',
        models: [
          { id: 'BAAI/bge-m3', label: 'BGE-M3' },
          { id: 'BAAI/bge-large-zh-v1.5', label: 'BGE Large 中文' },
          { id: 'Qwen/Qwen3-Embedding-8B', label: 'Qwen3 Embedding 8B' },
          { id: 'Qwen/Qwen3-Embedding-4B', label: 'Qwen3 Embedding 4B' },
        ],
      },
      openrouter: {
        id: 'openrouter', name: 'OpenRouter', preset: 'openrouter', protocol: 'openai',
        base_url: 'https://openrouter.ai/api/v1',
        models: [
          { id: 'openai/text-embedding-3-small', label: 'OpenAI Embedding 3 Small' },
          { id: 'openai/text-embedding-3-large', label: 'OpenAI Embedding 3 Large' },
          { id: 'qwen/qwen3-embedding-8b', label: 'Qwen3 Embedding 8B' },
        ],
      },
    }
    const settingsPid = ref('')
    const settingsEmbedPid = ref('')
    const settingsApiId = ref('')
    const lastAppTab = ref('ask')
    const settingsSearch = ref('')
    const settingsPrimary = [
      { key: 'general', label: '偏好设置' },
      { key: 'appearance', label: '外观' },
      { key: 'shortcuts', label: '快捷键' },
      { key: 'llm', label: '提供商' },
      { key: 'models', label: '模型' },
      { key: 'embed', label: '向量引擎' },
      { key: 'api', label: '外部 API' },
      { key: 'news', label: '新闻流' },
      { key: 'ocr', label: '文档与识别' },
      { key: 'storage', label: '浏览器与存储' },
      { key: 'about', label: '关于' },
    ]
    const ocSettingsGroups = [
      [
        { key: 'general', label: '偏好设置', icon: ICO.manage },
        { key: 'appearance', label: '外观', icon: ICO.appearance },
        { key: 'shortcuts', label: '快捷键', icon: ICO.shortcut },
      ],
      [
        { key: 'llm', label: '提供商', icon: ICO.provider },
        { key: 'models', label: '模型', icon: ICO.sparkle },
        { key: 'embed', label: '向量引擎', icon: ICO.embed },
        { key: 'api', label: '外部 API', icon: ICO.globe },
        { key: 'news', label: '新闻流', icon: ICO.rss },
      ],
      [
        { key: 'ocr', label: '文档与识别', icon: ICO.library },
        { key: 'storage', label: '浏览器与存储', icon: ICO.storage },
      ],
      [
        { key: 'about', label: '关于', icon: ICO.info },
      ],
    ]
    const OC_SECTION_META = {
      general: {
        title: '偏好设置',
        desc: '自定义偏好、界面布局密度、工具权限和批量导入加速行为',
        keywords: '偏好 常规 界面 布局 密度 默认 启动 消息 队列 引导 浏览器 powershell 终端 批量 导入 并发 速度 规则',
      },
      appearance: {
        title: '外观与参数',
        desc: '调整思考推理深度、生成温度、检索片段召回量与画布阅读交互',
        keywords: '外观 推理 强度 effort 温度 temperature top_k 召回 切片 缩放 画布 双指 滚轮',
      },
      shortcuts: {
        title: '快捷键',
        desc: '问答对话、多模态检索与原文画布的键盘快捷操作一览',
        keywords: '快捷键 键盘 回车 enter shift 缩放 平移 拖拽',
      },
      llm: {
        title: '提供商',
        desc: '管理大模型服务商渠道、Base URL、通信协议与 API Key 密钥',
        keywords: '提供商 渠道 大模型 llm api key 密钥 base url deepseek openai anthropic claude gemini 千问 智谱 硅基流动',
      },
      models: {
        title: '模型',
        desc: '选择默认问答与属性抽取模型，查看已启用模型的多模态与推理能力',
        keywords: '模型 默认 推理 视觉 多模态 上下文 模型列表',
      },
      embed: {
        title: '向量引擎',
        desc: '配置 Embedding 语义向量化渠道与模型，管理后台向量索引任务',
        keywords: 'embedding 向量 语义 检索 bge 千问 硅基流动 向量化',
      },
      api: {
        title: '外部 API',
        desc: '管理外部数据源连接器（REST / GraphQL / JSON-RPC），密钥在运行时安全注入',
        keywords: '外部 api 连接器 openapi swagger fred 汇率 行情 鉴权 bearer oauth2 hmac',
      },
      news: {
        title: '新闻流与情报终端',
        desc: '管理中/英/俄 RSS 订阅源、OPML 导入导出、独立高速翻译小模型与专有术语表',
        keywords: '新闻 rss opml 翻译 俄文 英文 中文 情报 终端 术语表 rsshub dashboard 看板',
      },
      ocr: {
        title: '文档与识别',
        desc: '配置 PaddleOCR-VL 版面识别策略、文件源目录与全库索引重建',
        keywords: '文档 文字识别 ocr paddle token 扫描件 pdf 智能加速 文件源 文件夹 索引 重建 src_root',
      },
      storage: {
        title: '浏览器与存储',
        desc: '管理 AI 浏览器文件下载存放目录、临时文件自动回收与各类缓存清理',
        keywords: '浏览器 存储 缓存 下载 临时文件 暂存 uploads 截图 cookie 登录态 清理 空间',
      },
      about: {
        title: '关于',
        desc: '查看版本信息、SQLite 本地知识库数据库体积与运行环境路径',
        keywords: '关于 版本 数据库 sqlite 路径 profile',
      },
    }
    const settingsSection = ref('general')
    const ocActiveMeta = computed(() => OC_SECTION_META[settingsSection.value] || OC_SECTION_META.general)
    function isNavMatched(key) {
      const qStr = (settingsSearch.value || '').trim().toLowerCase()
      if (!qStr) return settingsSection.value === key
      const m = OC_SECTION_META[key]
      if (!m) return false
      return m.title.toLowerCase().includes(qStr)
        || m.desc.toLowerCase().includes(qStr)
        || m.keywords.toLowerCase().includes(qStr)
    }
    function showSettingsSec(key) {
      const qStr = (settingsSearch.value || '').trim().toLowerCase()
      if (!qStr) return settingsSection.value === key
      return isNavMatched(key)
    }
    function selectSettingsNav(key) {
      const norm = key === 'index' ? 'ocr' : key
      settingsSearch.value = ''
      settingsSection.value = norm
      if (norm === 'storage' || norm === 'about') loadCacheStatus()
      if (norm === 'news') { loadNewsFeeds(); loadNewsStatus() }
    }
    function exitSettings() {
      tab.value = lastAppTab.value && lastAppTab.value !== 'settings' ? lastAppTab.value : 'ask'
    }
    function onSettingsModelPick(val) {
      const parts = String(val || '').split('::')
      if (parts.length === 2) {
        cfg.provider_id = parts[0]
        cfg.model = parts[1]
      }
    }
    const cacheReport = reactive({
      uploads: { bytes: 0, files: 0, path: '' },
      temp_logs: { bytes: 0, files: 0 },
      downloads: { bytes: 0, files: 0, path: '' },
      browser_cache: { bytes: 0, profile_bytes: 0, path: '' },
      ocr_cache: { bytes: 0, files: 0, path: '' },
      database: { bytes: 0, path: '' },
      active_download_dir: '',
    })
    const cacheClearing = ref('')
    function formatBytes(bytes) {
      const n = Number(bytes) || 0
      if (n < 1024) return n + ' B'
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
      if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
      return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
    }
    async function loadCacheStatus() {
      try {
        const res = await api.get('/api/cache/status')
        if (res && res.ok) {
          if (res.uploads) Object.assign(cacheReport.uploads, res.uploads)
          if (res.temp_logs) Object.assign(cacheReport.temp_logs, res.temp_logs)
          if (res.downloads) Object.assign(cacheReport.downloads, res.downloads)
          if (res.browser_cache) Object.assign(cacheReport.browser_cache, res.browser_cache)
          if (res.ocr_cache) Object.assign(cacheReport.ocr_cache, res.ocr_cache)
          if (res.database) Object.assign(cacheReport.database, res.database)
          cacheReport.active_download_dir = res.active_download_dir || ''
        }
      } catch (e) { /* ignore */ }
    }
    async function runClearCache(target, label) {
      cacheClearing.value = target
      try {
        const res = await api.post('/api/cache/clear', { target })
        if (!res || !res.ok) {
          message.error((res && res.error) || '清理失败')
          return
        }
        if (res.uploads) Object.assign(cacheReport.uploads, res.uploads)
        if (res.temp_logs) Object.assign(cacheReport.temp_logs, res.temp_logs)
        if (res.downloads) Object.assign(cacheReport.downloads, res.downloads)
        if (res.browser_cache) Object.assign(cacheReport.browser_cache, res.browser_cache)
        if (res.ocr_cache) Object.assign(cacheReport.ocr_cache, res.ocr_cache)
        const freed = formatBytes(res.freed_bytes || 0)
        message.success(`已清理${label}（释放 ${freed}）`)
      } catch (e) {
        message.error(String(e))
      } finally {
        cacheClearing.value = ''
      }
    }
    function clearCacheTarget(target, label, needConfirm) {
      if (needConfirm) {
        Modal.confirm({
          title: `确认清理${label}？`,
          content: '清理后内置浏览器中已登录的网站会话将被注销，需要重新登录。',
          okText: '确认重置',
          okType: 'danger',
          cancelText: '取消',
          onOk: () => runClearCache(target, label),
        })
        return
      }
      runClearCache(target, label)
    }
    async function openCacheDir(kind) {
      try {
        const res = await api.post('/api/cache/open', { kind })
        if (!res || !res.ok) message.error((res && res.error) || '打开目录失败')
      } catch (e) {
        message.error(String(e))
      }
    }
    watch(tab, (next, prev) => {
      if (prev && prev !== 'settings') lastAppTab.value = prev
      if (next === 'settings') loadCacheStatus()
      else nextTick(() => navSlide.schedule(next))
    })
    watch(() => cfg.ui_density, () => {
      nextTick(() => navSlide.schedule(tab.value))
    })
    watch(() => cfg.browser_download_mode, () => {
      if (cfgReady) setTimeout(loadCacheStatus, 600)
    })
    watch(settingsSection, (sec) => {
      if (sec === 'index') {
        settingsSection.value = 'ocr'
        return
      }
      pulseSettings()
      if (sec === 'storage' || sec === 'about') loadCacheStatus()
    })
    const settingsNavMap = {}
    const settingsPill = reactive({ x: 6, y: 6, w: 0, h: 36, on: false })
    function bindSettingsNav(key, el) {
      if (el) settingsNavMap[key] = el
      else delete settingsNavMap[key]
      scheduleSettingsPill()
    }
    function placeSettingsPill() {
      const el = settingsNavMap[settingsSection.value]
      if (!el || !el.parentElement) return
      const nr = el.parentElement.getBoundingClientRect()
      const br = el.getBoundingClientRect()
      if (br.width < 1) return
      settingsPill.x = br.left - nr.left
      settingsPill.y = br.top - nr.top
      settingsPill.w = br.width
      settingsPill.h = br.height
      settingsPill.on = true
    }
    function scheduleSettingsPill() {
      nextTick(() => requestAnimationFrame(placeSettingsPill))
    }
    const settingsPillStyle = computed(() => ({
      width: settingsPill.w + 'px',
      height: settingsPill.h + 'px',
      transform: 'translate(' + settingsPill.x + 'px, ' + settingsPill.y + 'px)',
      opacity: settingsPill.on ? 1 : 0,
    }))
    watch([settingsSection, tab], scheduleSettingsPill)
    function createSlider() {
      const map = {}
      const box = reactive({ x: 0, y: 0, w: 0, h: 0, on: false })
      function place(key) {
        const el = map[key]
        if (!el || !el.parentElement) return
        const br = el.getBoundingClientRect()
        if (br.width < 1 || br.height < 1) return
        const root = el.closest('.provider-list, .nav-switch') || el.parentElement
        const nr = root.getBoundingClientRect()
        box.x = br.left - nr.left
        box.y = br.top - nr.top
        box.w = br.width
        box.h = br.height
        box.on = true
      }
      function schedule(key) {
        nextTick(() => requestAnimationFrame(() => place(key)))
      }
      function bind(key, el) {
        if (el) map[key] = el
        else delete map[key]
      }
      const style = computed(() => ({
        width: box.w + 'px',
        height: box.h + 'px',
        transform: 'translate(' + box.x + 'px,' + box.y + 'px)',
        opacity: box.on ? 1 : 0,
      }))
      return { bind, schedule, style, hide() { box.on = false } }
    }
    const navSlide = createSlider()
    const llmSlide = createSlider()
    const embedSlide = createSlider()
    const apiSlide = createSlider()
    function bindMainNav(key, el) {
      navSlide.bind(key, el)
      if (el && key === tab.value) navSlide.schedule(key)
    }
    function bindLlmProvider(key, el) {
      llmSlide.bind(key, el)
      if (el && key === settingsPid.value) llmSlide.schedule(key)
    }
    function bindEmbedProvider(key, el) {
      embedSlide.bind(key, el)
      if (el && key === settingsEmbedPid.value) embedSlide.schedule(key)
    }
    function bindApiConnector(key, el) {
      apiSlide.bind(key, el)
      if (el && key === settingsApiId.value) apiSlide.schedule(key)
    }
    function placeNavPill() {
      if (['ask', 'browser', 'search', 'catalog'].includes(tab.value)) navSlide.schedule(tab.value)
      else navSlide.hide()
    }
    const navPillStyle = navSlide.style
    const llmPillStyle = llmSlide.style
    const embedPillStyle = embedSlide.style
    const apiPillStyle = apiSlide.style
    watch(tab, placeNavPill)
    watch(settingsPid, (id) => { if (id) llmSlide.schedule(id) })
    watch(settingsEmbedPid, (id) => { if (id) embedSlide.schedule(id) })
    watch(settingsApiId, (id) => { if (id) apiSlide.schedule(id); else apiSlide.hide() })
    onMounted(() => {
      scheduleSettingsPill()
      placeNavPill()
      window.addEventListener('resize', placeSettingsPill)
      window.addEventListener('resize', placeNavPill)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('resize', placeSettingsPill)
      window.removeEventListener('resize', placeNavPill)
    })
    const addProvider = reactive({ open: false, kind: 'custom', name: '', protocol: 'openai', base_url: '', api_key: '' })
    const addEmbedProvider = reactive({ open: false, kind: 'qwen', name: '', protocol: 'openai', base_url: '', api_key: '' })
    const addModel = reactive({ open: false, id: '', label: '', target: 'llm' })
    const addApiConnector = reactive({
      open: false,
      name: '',
      protocol: 'rest',
      base_url: '',
      auth_type: 'none',
      api_key: '',
      api_secret: '',
      auth_prefix: 'Bearer',
      header_name: 'X-Api-Key',
      query_name: 'api_key',
      signature_param: 'signature',
      signature_in: 'query',
      signature_encoding: 'hex',
      token_url: '',
      allow_write: false,
      preferred: false,
      category: 'other',
      notes: '',
      endpoints: [],
    })
    const apiTesting = ref(false)
    const apiTestHint = ref('')
    const apiDiscovering = ref(false)
    const currentProvider = computed(() => (
      (cfg.providers || []).find((p) => p.id === settingsPid.value) || null
    ))
    const currentEmbedProvider = computed(() => (
      (cfg.embed_providers || []).find((p) => p.id === settingsEmbedPid.value) || null
    ))
    const currentApiConnector = computed(() => (
      (cfg.api_connectors || []).find((c) => c.id === settingsApiId.value) || null
    ))
    watch(settingsApiId, () => { apiTestHint.value = '' })
    const embedStatus = reactive({
      total: 0, embedded: 0, pending: 0, job: false, error: '',
      progress: { done: 0, total: 0 },
    })
    const embedStatusText = computed(() => {
      const tot = embedStatus.total || 0
      const done = embedStatus.embedded || 0
      if (embedStatus.error) return embedStatus.error
      if (embedStatus.job) {
        const p = embedStatus.progress || {}
        return `索引中 ${p.done || 0} / ${p.total || tot}`
      }
      if (cfg.embed_use) return tot > 0 ? `自动运行 · ${done}/${tot}` : '自动运行'
      return '已关闭'
    })
    let embedTimer = 0
    const cfgSaveHint = ref('')
    let cfgReady = false
    let saveTimer = 0
    let hintTimer = 0

    function flashSaved() {
      cfgSaveHint.value = '已保存'
      clearTimeout(hintTimer)
      hintTimer = setTimeout(() => {
        if (cfgSaveHint.value === '已保存') cfgSaveHint.value = ''
      }, 1600)
    }

    function channelPayload(list, extra, keyId, clearId) {
      extra = extra || {}
      return (list || []).map((p) => {
        const o = {
          id: p.id,
          name: p.name,
          preset: p.preset || '',
          protocol: p.protocol,
          base_url: p.base_url,
          url_custom: !!p.url_custom,
          models: (p.models || []).map((m) => ({ id: m.id, label: m.label || m.id })),
        }
        if (extra[keyId] === p.id && extra.api_key) o.api_key = extra.api_key
        if (extra[clearId] === p.id) o.clear_key = true
        return o
      })
    }
    function providersPayload(extra) {
      return channelPayload(cfg.providers, extra, 'keyId', 'clearId')
    }
    function embedProvidersPayload(extra) {
      return channelPayload(cfg.embed_providers, extra, 'embedKeyId', 'embedClearId')
    }
    function apiConnectorsPayload(extra) {
      extra = extra || {}
      return (cfg.api_connectors || []).map((c) => {
        const o = {
          id: c.id,
          name: c.name,
          protocol: c.protocol || 'rest',
          base_url: c.base_url || '',
          auth_type: c.auth_type || 'none',
          auth_prefix: c.auth_prefix || 'Bearer',
          header_name: c.header_name || 'X-Api-Key',
          secret_header_name: c.secret_header_name || '',
          query_name: c.query_name || 'api_key',
          secret_query_name: c.secret_query_name || '',
          signature_param: c.signature_param || 'signature',
          signature_in: c.signature_in || 'query',
          signature_encoding: c.signature_encoding || 'hex',
          token_url: c.token_url || '',
          default_headers: c.default_headers || {},
          default_query: c.default_query || {},
          allow_write: !!c.allow_write,
          preferred: !!c.preferred,
          category: c.category || inferApiCategory(c.name),
          notes: c.notes || '',
          endpoints: (c.endpoints || []).map((ep) => ({ ...ep })),
        }
        if (extra.apiKeyId === c.id && extra.api_key) o.api_key = extra.api_key
        if (extra.apiClearKeyId === c.id) o.clear_key = true
        if (extra.apiSecretId === c.id && extra.api_secret) o.api_secret = extra.api_secret
        if (extra.apiClearSecretId === c.id) o.clear_secret = true
        return o
      })
    }

    async function loadConfig() {
      cfgReady = false
      const c = await api.get('/api/config')
      const providers = (c.providers || []).map((p) => ({
        ...p,
        api_key: '',
        models: (p.models || []).map((m) => ({ ...m })),
      }))
      const embedProviders = (c.embed_providers || []).map((p) => ({
        ...p,
        api_key: '',
        models: (p.models || []).map((m) => ({ ...m })),
      }))
      const apiConnectors = (c.api_connectors || []).map((x) => ({
        ...x,
        api_key: '',
        api_secret: '',
        preferred: !!x.preferred,
        category: x.category || inferApiCategory(x.name),
        endpoints: (x.endpoints || []).map((ep) => ({ ...ep })),
      }))
      if (c.protocols && c.protocols.length) protocols.value = c.protocols
      if (c.embed_protocols && c.embed_protocols.length) embedProtocols.value = c.embed_protocols
      if (c.api_protocols && c.api_protocols.length) apiProtocols.value = c.api_protocols
      if (c.api_auth_types && c.api_auth_types.length) apiAuthTypes.value = c.api_auth_types
      if (c.api_presets && c.api_presets.length) apiPresets.value = c.api_presets
      Object.assign(cfg, c)
      cfg.api_key = ''
      cfg.paddle_token = ''
      cfg.providers = providers
      cfg.embed_providers = embedProviders
      cfg.api_connectors = apiConnectors
      cfg.embed_use = !!c.embed_use
      cfg.embed_running = !!c.embed_running
      cfg.shell = c.shell !== false
      cfg.browser = c.browser !== false
      cfg.api_call = c.api_call !== false
      cfg.pdf_ocr_mode = c.pdf_ocr_mode || 'smart'
      cfg.batch_concurrency = Math.max(1, Math.min(6, Number(c.batch_concurrency) || 3))
      cfg.batch_fast_meta = !!c.batch_fast_meta
      cfg.browser_download_mode = c.browser_download_mode || 'sandbox'
      cfg.auto_clean_temp = c.auto_clean_temp !== false
      cfg.ui_density = c.ui_density || 'default'
      cfg.ui_theme = c.ui_theme === 'dark' ? 'dark' : 'light'
      document.documentElement.dataset.theme = cfg.ui_theme
      cfg.default_tab = c.default_tab || 'ask'
      cfg.followup_mode = c.followup_mode || 'steer'
      cfg.news_enabled = !!c.news_enabled
      cfg.news_auto_translate = c.news_auto_translate !== false
      cfg.news_refresh_minutes = c.news_refresh_minutes != null ? Number(c.news_refresh_minutes) : 15
      cfg.news_llm_provider_id = c.news_llm_provider_id || ''
      cfg.news_llm_model = c.news_llm_model || ''
      cfg.news_rsshub_base = c.news_rsshub_base || 'https://rsshub.app'
      cfg.news_glossary = Array.isArray(c.news_glossary) ? c.news_glossary.map((g) => ({ ...g })) : []
      cfg.news_local_embed = c.news_local_embed !== false
      cfg.news_local_rerank = c.news_local_rerank !== false
      cfg.dashboard_layout = c.dashboard_layout || null
      cfg.market_proxy = c.market_proxy || ''
      cfg.market_source_mode = c.market_source_mode || 'auto'
      cfg.detected_system_proxy = c.detected_system_proxy || ''
      if (cfg.news_enabled) {
        loadNewsStatus()
        loadNewsFeeds()
        loadDashboardLayout()
        loadMarketLayout()
      }
      loadCustomWidgets()
      cfg.temperature = c.temperature != null ? Number(c.temperature) : 0.1
      cfg.top_k = c.top_k != null ? Number(c.top_k) : 8
      if (!settingsPid.value || !providers.some((p) => p.id === settingsPid.value)) {
        settingsPid.value = cfg.provider_id || (providers[0] && providers[0].id) || ''
      }
      if (!settingsEmbedPid.value || !embedProviders.some((p) => p.id === settingsEmbedPid.value)) {
        settingsEmbedPid.value = cfg.embed_provider_id || (embedProviders[0] && embedProviders[0].id) || ''
      }
      if (!settingsApiId.value || !apiConnectors.some((x) => x.id === settingsApiId.value)) {
        settingsApiId.value = (apiConnectors[0] && apiConnectors[0].id) || ''
      }
      await nextTick()
      cfgReady = true
    }

    async function persistConfig(extra) {
      if (!cfgReady) return
      cfgSaveHint.value = '保存中'
      const body = {
        model: cfg.model,
        provider_id: cfg.provider_id,
        src_root: cfg.src_root,
        effort: cfg.effort,
        temperature: cfg.temperature,
        top_k: cfg.top_k,
        shell: !!cfg.shell,
        browser: !!cfg.browser,
        api_call: !!cfg.api_call,
        pdf_ocr_mode: cfg.pdf_ocr_mode || 'smart',
        batch_concurrency: Number(cfg.batch_concurrency) || 3,
        batch_fast_meta: !!cfg.batch_fast_meta,
        browser_download_mode: cfg.browser_download_mode || 'sandbox',
        auto_clean_temp: !!cfg.auto_clean_temp,
        ui_density: cfg.ui_density || 'default',
        ui_theme: cfg.ui_theme === 'dark' ? 'dark' : 'light',
        default_tab: cfg.default_tab || 'ask',
        followup_mode: cfg.followup_mode || 'steer',
        news_enabled: !!cfg.news_enabled,
        news_auto_translate: !!cfg.news_auto_translate,
        news_refresh_minutes: Number(cfg.news_refresh_minutes ?? 15),
        news_llm_provider_id: cfg.news_llm_provider_id || '',
        news_llm_model: cfg.news_llm_model || '',
        news_rsshub_base: cfg.news_rsshub_base || 'https://rsshub.app',
        news_glossary: (cfg.news_glossary || []).map((g) => ({ term: g.term, zh: g.zh, note: g.note || '' })),
        news_local_embed: !!cfg.news_local_embed,
        news_local_rerank: !!cfg.news_local_rerank,
        dashboard_layout: cfg.dashboard_layout || null,
        market_proxy: cfg.market_proxy || '',
        market_source_mode: cfg.market_source_mode || 'auto',
        providers: providersPayload(extra),
        embed_provider_id: cfg.embed_provider_id,
        embed_model: cfg.embed_model,
        embed_use: !!cfg.embed_use,
        embed_providers: embedProvidersPayload(extra),
        api_connectors: apiConnectorsPayload(extra),
        ...(extra && extra.paddle_token ? { paddle_token: extra.paddle_token } : {}),
        ...(extra && extra.clear_paddle ? { clear_paddle: true } : {}),
      }
      await api.post('/api/config', body)
      if (extra && extra.api_key && extra.keyId) {
        const p = cfg.providers.find((x) => x.id === extra.keyId)
        if (p) {
          p.api_key = ''
          p.api_key_set = true
        }
      }
      if (extra && extra.clearId) {
        const p = cfg.providers.find((x) => x.id === extra.clearId)
        if (p) {
          p.api_key = ''
          p.api_key_set = false
        }
      }
      if (extra && extra.api_key && extra.embedKeyId) {
        const p = (cfg.embed_providers || []).find((x) => x.id === extra.embedKeyId)
        if (p) {
          p.api_key = ''
          p.api_key_set = true
        }
      }
      if (extra && extra.embedClearId) {
        const p = (cfg.embed_providers || []).find((x) => x.id === extra.embedClearId)
        if (p) {
          p.api_key = ''
          p.api_key_set = false
        }
      }
      if (extra && extra.api_key && extra.apiKeyId) {
        const c = (cfg.api_connectors || []).find((x) => x.id === extra.apiKeyId)
        if (c) {
          c.api_key = ''
          c.api_key_set = true
          c.has_key = true
        }
      }
      if (extra && extra.apiClearKeyId) {
        const c = (cfg.api_connectors || []).find((x) => x.id === extra.apiClearKeyId)
        if (c) {
          c.api_key = ''
          c.api_key_set = false
          c.has_key = !!c.api_secret_set
        }
      }
      if (extra && extra.api_secret && extra.apiSecretId) {
        const c = (cfg.api_connectors || []).find((x) => x.id === extra.apiSecretId)
        if (c) {
          c.api_secret = ''
          c.api_secret_set = true
          c.has_key = true
        }
      }
      if (extra && extra.apiClearSecretId) {
        const c = (cfg.api_connectors || []).find((x) => x.id === extra.apiClearSecretId)
        if (c) {
          c.api_secret = ''
          c.api_secret_set = false
          c.has_key = !!c.api_key_set
        }
      }
      if (extra && extra.paddle_token) cfg.paddle_token = ''
      if (extra && extra.paddle_token) {
        const c = await api.get('/api/config')
        cfg.paddle_token_set = !!c.paddle_token_set
      }
      cfg.api_key_set = (cfg.providers || []).some((p) => p.api_key_set)
      loadStats()
      flashSaved()
    }

    function scheduleSave() {
      if (!cfgReady) return
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => { persistConfig() }, 450)
    }
    watch(() => [
      cfg.model, cfg.src_root, cfg.effort, cfg.provider_id,
      cfg.temperature, cfg.top_k, cfg.shell, cfg.browser, cfg.api_call,
      cfg.pdf_ocr_mode, cfg.batch_concurrency, cfg.batch_fast_meta,
      cfg.browser_download_mode, cfg.auto_clean_temp,
      cfg.ui_density, cfg.ui_theme, cfg.default_tab, cfg.followup_mode,
      cfg.news_enabled, cfg.news_auto_translate, cfg.news_refresh_minutes,
      cfg.news_llm_provider_id, cfg.news_llm_model, cfg.news_rsshub_base,
      cfg.news_local_embed, cfg.news_local_rerank,
      cfg.market_proxy, cfg.market_source_mode,
      JSON.stringify(cfg.news_glossary || []),
      (cfg.providers || []).map((p) => [p.id, p.name, p.protocol, p.base_url, JSON.stringify(p.models)]),
      cfg.embed_use, cfg.embed_provider_id, cfg.embed_model,
      (cfg.embed_providers || []).map((p) => [p.id, p.name, p.protocol, p.base_url, JSON.stringify(p.models)]),
      (cfg.api_connectors || []).map((c) => [
        c.id, c.name, c.protocol, c.base_url, c.auth_type, c.auth_prefix,
        c.header_name, c.query_name, c.signature_param, c.signature_in,
        c.signature_encoding, c.token_url, c.allow_write, c.preferred, c.category, c.notes,
        JSON.stringify(c.endpoints || []),
      ]),
    ], scheduleSave)

    const apiConnectorGroups = computed(() => {
      const buckets = new Map()
      for (const c of cfg.api_connectors || []) {
        const id = c.category || inferApiCategory(c.name)
        if (!buckets.has(id)) buckets.set(id, [])
        buckets.get(id).push(c)
      }
      const groups = []
      for (const cat of apiCategories) {
        const items = buckets.get(cat.id)
        if (!items || !items.length) continue
        items.sort((a, b) => Number(!!b.preferred) - Number(!!a.preferred))
        groups.push({ id: cat.id, label: cat.label, items })
      }
      return groups
    })
    function apiConnectorStateText(c) {
      if (!c) return ''
      const proto = String(c.protocol || 'rest').toUpperCase()
      const auth = c.auth_type === 'none' ? '免费' : (c.api_key_set || c.api_secret_set ? '已配密钥' : '待配密钥')
      return `${c.preferred ? '优先 · ' : ''}${proto} · ${auth}${c.allow_write ? ' · 可写' : ''}`
    }
    function apiKeyLabel(authType) {
      if (authType === 'basic') return 'HTTP Basic 用户名'
      if (authType === 'oauth2_client_credentials') return 'Client ID / App ID'
      if (authType === 'cookie') return 'Cookie 字符串'
      return 'API Key / Token'
    }
    function apiSecretLabel(authType) {
      if (authType === 'basic') return 'HTTP Basic 密码'
      if (authType === 'oauth2_client_credentials') return 'Client Secret / App Secret'
      if (authType === 'hmac_sha256') return 'HMAC Secret'
      return '辅助密钥 (Secret)'
    }
    function needsApiSecret(authType) {
      return ['hmac_sha256', 'basic', 'oauth2_client_credentials'].includes(authType)
    }
    function openAddApiConnector() {
      addApiConnector.name = ''
      addApiConnector.protocol = 'rest'
      addApiConnector.base_url = ''
      addApiConnector.auth_type = 'none'
      addApiConnector.api_key = ''
      addApiConnector.api_secret = ''
      addApiConnector.auth_prefix = 'Bearer'
      addApiConnector.header_name = 'X-Api-Key'
      addApiConnector.query_name = 'api_key'
      addApiConnector.signature_param = 'signature'
      addApiConnector.signature_in = 'query'
      addApiConnector.signature_encoding = 'hex'
      addApiConnector.token_url = ''
      addApiConnector.allow_write = false
      addApiConnector.notes = ''
      addApiConnector.endpoints = []
      addApiConnector.open = true
    }
    function applyApiPreset(p) {
      if (!p) return
      addApiConnector.name = p.id === 'public' || p.id === 'rest_bearer' ? '' : (p.name || '')
      addApiConnector.protocol = p.protocol || 'rest'
      addApiConnector.base_url = p.base_url && p.base_url !== 'https://' ? p.base_url : ''
      addApiConnector.auth_type = p.auth_type || 'none'
      addApiConnector.auth_prefix = p.auth_prefix || 'Bearer'
      addApiConnector.header_name = p.header_name || (p.auth_type === 'hmac_sha256' ? 'X-MBX-APIKEY' : 'X-Api-Key')
      addApiConnector.query_name = p.query_name || 'api_key'
      addApiConnector.signature_param = p.signature_param || 'signature'
      addApiConnector.token_url = p.token_url && p.token_url !== 'https://' ? p.token_url : ''
      addApiConnector.allow_write = !!p.allow_write
      addApiConnector.notes = p.notes || ''
    }
    async function confirmAddApiConnector() {
      const name = (addApiConnector.name || '').trim()
      const base_url = (addApiConnector.base_url || '').trim()
      if (!name || !base_url) return Promise.reject()
      const item = {
        id: 'api_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        name,
        protocol: addApiConnector.protocol || 'rest',
        base_url,
        auth_type: addApiConnector.auth_type || 'none',
        auth_prefix: addApiConnector.auth_prefix || 'Bearer',
        header_name: addApiConnector.header_name || 'X-Api-Key',
        secret_header_name: '',
        query_name: addApiConnector.query_name || 'api_key',
        secret_query_name: '',
        signature_param: addApiConnector.signature_param || 'signature',
        signature_in: addApiConnector.signature_in || 'query',
        signature_encoding: addApiConnector.signature_encoding || 'hex',
        token_url: addApiConnector.token_url || '',
        default_headers: {},
        default_query: {},
        allow_write: !!addApiConnector.allow_write,
        preferred: false,
        category: inferApiCategory(name, base_url, addApiConnector.notes, addApiConnector.endpoints),
        notes: (addApiConnector.notes || '').trim(),
        endpoints: (addApiConnector.endpoints || []).map((ep) => ({ ...ep })),
        api_key: '',
        api_secret: '',
        api_key_set: false,
        api_secret_set: false,
        has_key: false,
      }
      if (!cfg.api_connectors) cfg.api_connectors = []
      cfg.api_connectors.push(item)
      settingsApiId.value = item.id
      addApiConnector.open = false
      const key = (addApiConnector.api_key || '').trim()
      const sec = (addApiConnector.api_secret || '').trim()
      addApiConnector.api_key = ''
      addApiConnector.api_secret = ''
      const extra = {}
      if (key) { extra.apiKeyId = item.id; extra.api_key = key }
      if (sec) { extra.apiSecretId = item.id; extra.api_secret = sec }
      if (key || sec) await persistConfig(extra)
      else scheduleSave()
    }
    function removeApiConnector(c) {
      if (!c) return
      Modal.confirm({
        title: `删除外部 API 连接「${c.name}」？`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk() {
          cfg.api_connectors = (cfg.api_connectors || []).filter((x) => x.id !== c.id)
          if (settingsApiId.value === c.id) {
            settingsApiId.value = (cfg.api_connectors[0] && cfg.api_connectors[0].id) || ''
          }
          scheduleSave()
        },
      })
    }
    function removeApiEndpoint(c, idx) {
      if (!c || !Array.isArray(c.endpoints)) return
      c.endpoints.splice(idx, 1)
      scheduleSave()
    }
    function saveApiConnectorKey(c) {
      if (c && c.api_key) persistConfig({ apiKeyId: c.id, api_key: c.api_key })
    }
    function clearApiConnectorKey(c) {
      if (c) persistConfig({ apiClearKeyId: c.id })
    }
    function saveApiConnectorSecret(c) {
      if (c && c.api_secret) persistConfig({ apiSecretId: c.id, api_secret: c.api_secret })
    }
    function clearApiConnectorSecret(c) {
      if (c) persistConfig({ apiClearSecretId: c.id })
    }
    async function testApiConnector(c) {
      if (!c) return
      apiTesting.value = true
      apiTestHint.value = '正在测试…'
      try {
        const res = await api.post('/api/connectors/test', {
          id: c.id,
          name: c.name,
          protocol: c.protocol,
          base_url: c.base_url,
          auth_type: c.auth_type,
          auth_prefix: c.auth_prefix,
          header_name: c.header_name,
          query_name: c.query_name,
          signature_param: c.signature_param,
          signature_in: c.signature_in,
          signature_encoding: c.signature_encoding,
          token_url: c.token_url,
          api_key: c.api_key || '',
          api_secret: c.api_secret || '',
        })
        if (res.status) {
          apiTestHint.value = `HTTP ${res.status} · ${res.elapsedMs || 0}ms`
          if (res.ok) message.success(`连接正常 (${apiTestHint.value})`)
          else message.warning(`接口已响应 (${apiTestHint.value})`)
        } else {
          apiTestHint.value = res.error || '连接失败'
          message.error(apiTestHint.value)
        }
      } catch (e) {
        apiTestHint.value = String(e)
        message.error(apiTestHint.value)
      } finally {
        apiTesting.value = false
      }
    }
    async function discoverIntoConnector(c) {
      if (!c || !(c.base_url || '').trim()) {
        message.warning('请先填入 Base URL 或 OpenAPI 文档地址')
        return
      }
      apiDiscovering.value = true
      try {
        const res = await api.post('/api/connectors/discover', { url: c.base_url })
        if (!res.ok) {
          message.error(res.error || '解析 OpenAPI 失败')
          return
        }
        if (res.base_url) c.base_url = res.base_url
        if (!c.name && res.name) c.name = res.name
        if (res.auth_type && c.auth_type === 'none') c.auth_type = res.auth_type
        if (res.header_name) c.header_name = res.header_name
        if (res.query_name) c.query_name = res.query_name
        if (res.token_url) c.token_url = res.token_url
        if (res.notes) c.notes = c.notes ? (c.notes + '\n' + res.notes) : res.notes
        if (Array.isArray(res.endpoints) && res.endpoints.length) c.endpoints = res.endpoints
        if (!c.category || c.category === 'other') {
          c.category = res.category || inferApiCategory(c.name, c.base_url, c.notes, c.endpoints)
        }
        message.success(`已解析 ${res.endpoints ? res.endpoints.length : 0} 个端点并自动归类`)
        scheduleSave()
      } catch (e) {
        message.error(String(e))
      } finally {
        apiDiscovering.value = false
      }
    }
    async function discoverIntoModal() {
      const url = (addApiConnector.base_url || '').trim()
      if (!url) {
        message.warning('请先填入 OpenAPI JSON 地址或 API 根地址')
        return
      }
      apiDiscovering.value = true
      try {
        const res = await api.post('/api/connectors/discover', { url })
        if (!res.ok) {
          message.error(res.error || '解析 OpenAPI 失败')
          return
        }
        if (!addApiConnector.name && res.name) addApiConnector.name = res.name
        if (res.base_url) addApiConnector.base_url = res.base_url
        if (res.auth_type) addApiConnector.auth_type = res.auth_type
        if (res.header_name) addApiConnector.header_name = res.header_name
        if (res.query_name) addApiConnector.query_name = res.query_name
        if (res.token_url) addApiConnector.token_url = res.token_url
        if (res.notes) addApiConnector.notes = res.notes
        if (Array.isArray(res.endpoints)) addApiConnector.endpoints = res.endpoints
        message.success(`已解析 ${res.endpoints ? res.endpoints.length : 0} 个端点`)
      } catch (e) {
        message.error(String(e))
      } finally {
        apiDiscovering.value = false
      }
    }

    function saveApiKey() {
      if (cfg.api_key) persistConfig({ api_key: cfg.api_key })
    }
    function saveProviderKey(p) {
      if (p && p.api_key) persistConfig({ keyId: p.id, api_key: p.api_key })
    }
    function clearProviderKey(p) {
      if (!p) return
      persistConfig({ clearId: p.id })
    }
    function urlPlaceholder(p) {
      const proto = (p && p.protocol) || 'openai'
      if (proto === 'anthropic') return 'https://api.anthropic.com'
      if (proto === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/openai'
      return 'https://api.example.com/v1'
    }
    function openAddProvider() {
      addProvider.kind = 'custom'
      addProvider.name = ''
      addProvider.protocol = 'openai'
      addProvider.base_url = ''
      addProvider.api_key = ''
      addProvider.open = true
    }
    function finishAddProvider(ch) {
      settingsPid.value = ch.id
      addProvider.open = false
      const key = (addProvider.api_key || '').trim()
      addProvider.api_key = ''
      if (key) persistConfig({ keyId: ch.id, api_key: key })
      else scheduleSave()
    }
    function confirmAddProvider() {
      const kind = addProvider.kind
      if (kind === 'deepseek' || kind === 'opencode' || kind === 'opencode-go') {
        const preset = kind === 'opencode' ? 'opencode-go' : kind
        const hit = cfg.providers.find((p) => p.preset === preset || (preset === 'opencode-go' && p.preset === 'opencode'))
        if (hit) {
          finishAddProvider(hit)
          return
        }
        const spec = preset === 'deepseek'
          ? { id: 'deepseek', name: 'DeepSeek', preset: 'deepseek', protocol: 'openai', base_url: 'https://api.deepseek.com', models: [{ id: 'deepseek-flash', label: 'DeepSeek Flash' }, { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }] }
          : { id: 'opencode', name: 'OpenCode Go', preset: 'opencode-go', protocol: 'openai', base_url: 'https://opencode.ai/inference/go/openai/v1', models: [] }
        const ch = { ...spec, api_key: '', api_key_set: false, url_custom: false }
        if (cfg.providers.some((p) => p.id === ch.id)) ch.id = ch.id + '-' + Date.now().toString(16).slice(-4)
        cfg.providers.push(ch)
        finishAddProvider(ch)
        return
      }
      const name = (addProvider.name || '').trim()
      if (!name) return Promise.reject()
      const ch = {
        id: 'p-' + Date.now().toString(16),
        name,
        preset: '',
        protocol: addProvider.protocol || 'openai',
        base_url: (addProvider.base_url || '').trim(),
        api_key: '',
        api_key_set: false,
        url_custom: true,
        models: [],
      }
      cfg.providers.push(ch)
      finishAddProvider(ch)
    }
    function removeProvider(p) {
      if (!p) return
      Modal.confirm({
        title: `删除渠道「${p.name}」？`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk() {
          cfg.providers = cfg.providers.filter((x) => x.id !== p.id)
          if (settingsPid.value === p.id) {
            settingsPid.value = (cfg.providers[0] && cfg.providers[0].id) || ''
          }
          if (cfg.provider_id === p.id) {
            cfg.provider_id = (cfg.providers[0] && cfg.providers[0].id) || ''
          }
          scheduleSave()
        },
      })
    }
    function openAddModel() {
      addModel.target = 'llm'
      addModel.id = ''
      addModel.label = ''
      addModel.open = true
    }
    function confirmAddModel() {
      const p = addModel.target === 'embed' ? currentEmbedProvider.value : currentProvider.value
      const id = (addModel.id || '').trim()
      if (!p || !id) return Promise.reject()
      if ((p.models || []).some((m) => m.id === id)) {
        message.warning('该模型已在列表中')
        return Promise.reject()
      }
      if (!p.models) p.models = []
      p.models.push({ id, label: (addModel.label || '').trim() || id })
      if (addModel.target === 'embed') {
        cfg.embed_provider_id = p.id
        if (!cfg.embed_model) cfg.embed_model = id
      }
      addModel.open = false
      scheduleSave()
    }
    function removeProviderModel(p, id) {
      if (!p) return
      p.models = (p.models || []).filter((m) => m.id !== id)
      scheduleSave()
    }
    async function syncProviderModels(p) {
      if (!p) return
      try {
        const j = await api.post('/api/models/sync', { provider_id: p.id })
        if (!j.ok) {
          message.error(j.error || '同步失败')
          return
        }
        p.models = j.models || p.models
        message.success(j.added ? `已加入 ${j.added} 个模型` : '已是最新')
        loadModels(true)
      } catch (e) {
        message.error(String(e))
      }
    }
    function embedUrlPlaceholder(p) {
      const proto = (p && p.protocol) || 'openai'
      if (proto === 'dashscope') return 'https://dashscope.aliyuncs.com/api/v1'
      return 'https://api.example.com/v1'
    }
    function selectEmbedChannel(p) {
      if (!p) return
      settingsEmbedPid.value = p.id
      cfg.embed_provider_id = p.id
      const models = p.models || []
      if (models.length && !models.some((m) => m.id === cfg.embed_model)) {
        cfg.embed_model = models[0].id
      }
    }
    function saveEmbedKey(p) {
      if (p && p.api_key) persistConfig({ embedKeyId: p.id, api_key: p.api_key })
    }
    function clearEmbedKey(p) {
      if (!p) return
      persistConfig({ embedClearId: p.id })
    }
    function openAddEmbedProvider() {
      addEmbedProvider.kind = 'qwen'
      addEmbedProvider.name = ''
      addEmbedProvider.protocol = 'openai'
      addEmbedProvider.base_url = ''
      addEmbedProvider.api_key = ''
      addEmbedProvider.open = true
    }
    function finishAddEmbedProvider(ch) {
      selectEmbedChannel(ch)
      addEmbedProvider.open = false
      const key = (addEmbedProvider.api_key || '').trim()
      addEmbedProvider.api_key = ''
      if (key) persistConfig({ embedKeyId: ch.id, api_key: key })
      else scheduleSave()
    }
    function confirmAddEmbedProvider() {
      const kind = addEmbedProvider.kind
      if (kind !== 'custom') {
        const hit = (cfg.embed_providers || []).find((p) => p.preset === kind || p.id === kind)
        if (hit) {
          finishAddEmbedProvider(hit)
          return
        }
        const spec = EMBED_PRESET_SPEC[kind]
        if (!spec) return Promise.reject()
        const ch = {
          ...spec,
          models: (spec.models || []).map((m) => ({ ...m })),
          api_key: '',
          api_key_set: false,
          url_custom: false,
        }
        if ((cfg.embed_providers || []).some((p) => p.id === ch.id)) {
          ch.id = ch.id + '-' + Date.now().toString(16).slice(-4)
        }
        cfg.embed_providers.push(ch)
        finishAddEmbedProvider(ch)
        return
      }
      const name = (addEmbedProvider.name || '').trim()
      if (!name) return Promise.reject()
      const ch = {
        id: 'e-' + Date.now().toString(16),
        name,
        preset: '',
        protocol: addEmbedProvider.protocol || 'openai',
        base_url: (addEmbedProvider.base_url || '').trim(),
        api_key: '',
        api_key_set: false,
        url_custom: true,
        models: [],
      }
      cfg.embed_providers.push(ch)
      finishAddEmbedProvider(ch)
    }
    function removeEmbedProvider(p) {
      if (!p) return
      Modal.confirm({
        title: `删除渠道「${p.name}」？`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk() {
          cfg.embed_providers = (cfg.embed_providers || []).filter((x) => x.id !== p.id)
          if (settingsEmbedPid.value === p.id) {
            const first = cfg.embed_providers[0]
            settingsEmbedPid.value = (first && first.id) || ''
          }
          if (cfg.embed_provider_id === p.id) {
            const first = cfg.embed_providers[0]
            cfg.embed_provider_id = (first && first.id) || ''
            cfg.embed_model = (first && first.models && first.models[0] && first.models[0].id) || ''
          }
          scheduleSave()
        },
      })
    }
    function openAddEmbedModel() {
      addModel.target = 'embed'
      addModel.id = ''
      addModel.label = ''
      addModel.open = true
    }
    function removeEmbedModel(p, id) {
      if (!p) return
      p.models = (p.models || []).filter((m) => m.id !== id)
      if (cfg.embed_model === id) {
        cfg.embed_model = (p.models[0] && p.models[0].id) || ''
      }
      scheduleSave()
    }
    async function syncEmbedModels(p) {
      if (!p) return
      try {
        const j = await api.post('/api/embed/models/sync', { provider_id: p.id })
        if (!j.ok) {
          message.error(j.error || '同步失败')
          return
        }
        p.models = j.models || p.models
        if ((p.models || []).length && !(p.models || []).some((m) => m.id === cfg.embed_model)) {
          cfg.embed_model = p.models[0].id
        }
        message.success(j.added ? `已加入 ${j.added} 个模型` : '已是最新')
      } catch (e) {
        message.error(String(e))
      }
    }
    async function loadEmbedStatus() {
      try {
        const s = await api.get('/api/embed/status')
        embedStatus.total = s.total || 0
        embedStatus.embedded = s.embedded || 0
        embedStatus.pending = s.pending || 0
        embedStatus.job = !!s.job
        embedStatus.error = s.error || ''
        embedStatus.progress = s.progress || { done: 0, total: 0 }
        cfg.embed_running = !!s.running
      } catch (e) { /* ignore */ }
    }
    function startEmbedPoll() {
      clearInterval(embedTimer)
      if (tab.value !== 'settings') return
      if (settingsSection.value === 'embed' || cfg.embed_running) loadEmbedStatus()
      if (cfg.embed_running) embedTimer = setInterval(loadEmbedStatus, 2000)
    }
    async function startEmbed() {
      await persistConfig()
      const j = await api.post('/api/embed/start', {})
      if (!j.ok) {
        message.error(j.error || '无法启动')
        return
      }
      cfg.embed_running = true
      Object.assign(embedStatus, {
        total: j.total || 0,
        embedded: j.embedded || 0,
        pending: j.pending || 0,
        job: !!j.job,
        error: j.error || '',
        progress: j.progress || { done: 0, total: 0 },
      })
      startEmbedPoll()
    }
    async function stopEmbed() {
      const j = await api.post('/api/embed/stop', {})
      if (!j.ok) {
        message.error(j.error || '无法停止')
        return
      }
      cfg.embed_running = false
      embedStatus.job = false
      embedStatus.error = j.error || ''
      startEmbedPoll()
    }
    function toggleEmbedRun(on) {
      if (on) startEmbed()
      else stopEmbed()
    }
    watch([tab, settingsSection, () => cfg.embed_running], startEmbedPoll)
    onBeforeUnmount(() => clearInterval(embedTimer))
    function savePaddle() {
      if (cfg.paddle_token) persistConfig({ paddle_token: cfg.paddle_token })
    }
    async function clearKey() {
      await api.post('/api/config', { clear_key: true })
      cfg.api_key_set = false
      cfg.api_key = ''
      message.success('密钥已清除')
      loadStats()
    }
    async function clearPaddle() {
      await api.post('/api/config', { clear_paddle: true })
      cfg.paddle_token_set = false
      cfg.paddle_token = ''
      message.success('PaddleOCR Token 已清除')
    }

    async function rebuild() {
      await persistConfig()
      const r = await api.post('/api/rebuild', {})
      if (r.ok) {
        message.info(r.msg)
        const timer = setInterval(async () => {
          await loadStats()
          if (!stats.rebuilding) {
            clearInterval(timer)
            loadFacets()
            loadDocs()
            message.success('索引重建完成')
          }
        }, 2000)
      } else {
        message.warning(r.error)
      }
    }

    function rowClick(record) {
      if (record && record._placeholder) {
        return { onClick: () => { ingest.open = true } }
      }
      return {
        draggable: true,
        onClick: (e) => {
          if (e.target.closest('.doc-op, .ant-dropdown, .ant-dropdown-menu')) return
          activeTreeDocId.value = record.id
          if (record.project) {
            treeExpanded[treeKeyProject(record.project)] = true
            if (record.folder) {
              const acc = []
              for (const p of String(record.folder).split('/')) {
                if (!p) continue
                acc.push(p)
                treeExpanded[treeKeyFolder(record.project, acc.join('/'))] = true
              }
            }
          }
          openDoc(record.id, null)
        },
        onDragstart: (e) => {
          draggingItem.value = {
            kind: 'doc', id: record.id,
            project: record.project || '', folder: record.folder || '',
          }
          try {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', JSON.stringify(draggingItem.value))
          } catch (err) { /* ignore */ }
        },
        onDragend: () => {
          draggingItem.value = null
          dropTargetKey.value = ''
        },
      }
    }

    const ingest = reactive({
      open: false,
      doc_id: null,
      file: null,
      filename: '',
      tmp_id: '',
      parsing: false,
      saving: false,
      percent: 0,
      progressText: '',
      project: '集团制度库',
      folder: '',
      dept: '',
      doc_type: 'regulation',
      chunk_profile: 'auto',
      title: '',
      doc_no: '',
      issued_date: '',
      status: '现行',
      summary: '',
      tags: [],
      meta: {},
      batchMode: false,
      batchRunning: false,
      batchItems: [],
    })
    let ingestAbort = null
    let batchQueueTimer = 0
    let pendingBatchFiles = []
    const batchHasGap = computed(() => (
      ingest.batchMode
      && !ingest.batchRunning
      && ingest.batchItems.some((x) => x.state !== 'done' && x.state !== 'skipped')
    ))

    const projectOptions = computed(() => (facets.projects || []).map((p) => ({ value: p })))
    const folderOptions = computed(() => {
      const p = ingest.open ? ingest.project : (metaModal.open ? metaModal.project : catProject.value)
      const hit = (facets.tree || []).find((x) => x.name === p)
      if (hit && hit.folders) return hit.folders.map((f) => ({ value: f.path }))
      return (facets.folders || []).map((f) => ({ value: f }))
    })
    const deptOptions = computed(() => (facets.depts || []).map((d) => ({ value: d })))

    const folderModal = reactive({
      open: false, project: '', path: '', mode: 'create',
      origProject: '', origPath: '',
    })
    const metaModal = reactive({
      open: false,
      saving: false,
      doc_id: null,
      project: '',
      folder: '',
      dept: '',
      doc_type: 'regulation',
      title: '',
      doc_no: '',
      issued_date: '',
      status: '现行',
      summary: '',
      meta: {},
    })

    function openFolderModal(proj, parentPath) {
      folderModal.mode = 'create'
      folderModal.origProject = ''
      folderModal.origPath = ''
      folderModal.project = proj || catProject.value || '集团制度库'
      folderModal.path = parentPath ? (parentPath + '/') : ''
      folderModal.open = true
    }
    function openRenameFolderModal(proj, folder) {
      folderModal.mode = 'rename'
      folderModal.origProject = proj
      folderModal.origPath = folder || ''
      folderModal.project = proj
      folderModal.path = folder || ''
      folderModal.open = true
    }
    async function confirmCreateFolder() {
      const proj = (folderModal.project || '').trim()
      const path = (folderModal.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()
      if (!proj) {
        message.warning('请输入项目名称')
        return Promise.reject()
      }
      if (folderModal.mode === 'rename') {
        if (proj === folderModal.origProject && path === (folderModal.origPath || '')) {
          folderModal.open = false
          return
        }
        const j = await api.post('/api/folders/move', {
          src_project: folderModal.origProject,
          src_path: folderModal.origPath || '',
          dst_project: proj,
          dst_path: path,
        })
        if (!j.ok) {
          message.error(j.error || '重命名失败')
          return Promise.reject()
        }
        folderModal.open = false
        treeExpanded[treeKeyProject(proj)] = true
        if (path) treeExpanded[treeKeyFolder(proj, path)] = true
        await loadFacets()
        await loadDocs()
        selectTreeScope(proj, path)
        message.success(`已重命名，共调整 ${j.moved_docs || 0} 份文件`)
        return
      }
      const j = await api.post('/api/folders/create', { project: proj, path })
      if (!j.ok) {
        message.error(j.error || '创建失败')
        return Promise.reject()
      }
      folderModal.open = false
      expandedProjs[proj] = true
      treeExpanded[treeKeyProject(proj)] = true
      if (path) treeExpanded[treeKeyFolder(proj, path)] = true
      await loadFacets()
      selectTreeScope(proj, path)
      message.success(path ? `已创建文件夹「${proj} / ${path}」` : `已创建项目「${proj}」`)
    }
    function removeFolderNode(proj, path, count) {
      const label = path ? `文件夹「${proj} / ${path}」` : `项目「${proj}」`
      const n = Number(count) || 0
      Modal.confirm({
        title: n > 0 ? `删除${label}及其下 ${n} 份文件？` : `删除空${label}？`,
        content: n > 0 ? '该目录（含所有子目录）下的文件记录与索引都将被一并删除，此操作不可撤销。' : '',
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        async onOk() {
          const j = await api.post('/api/folders/delete', {
            project: proj, path, force: n > 0,
          })
          if (!j.ok) {
            message.error(j.error || '删除失败')
            return Promise.reject()
          }
          const inScope = catProject.value === proj && (
            !path || catFolder.value === path || (catFolder.value || '').startsWith(path + '/')
          )
          if (inScope) {
            activeTreeDocId.value = null
            selectTreeScope(path ? proj : '', '')
          }
          await refreshCatalogTree()
          message.success(n > 0 ? `已删除目录及 ${j.removed_docs || n} 份文件` : '已删除')
        },
      })
    }
    function deleteDocRecord(record) {
      if (!record || !record.id) return
      Modal.confirm({
        title: `确认从知识库中删除「${record.title || '该文件'}」？`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        async onOk() {
          const j = await api.post('/api/docs/delete', { doc_ids: [record.id] })
          if (!j.ok) {
            message.error(j.error || '删除失败')
            return Promise.reject()
          }
          if (activeTreeDocId.value === record.id) activeTreeDocId.value = null
          if (currentDocId.value === record.id) drawerOpen.value = false
          await refreshCatalogTree()
          message.success('已删除')
        },
      })
    }

    async function organizeCurrentProject() {
      const proj = catProject.value
      if (!proj) {
        message.info('请先在左侧选择一个项目')
        return
      }
      organizing.value = true
      try {
        const j = await api.post('/api/docs/organize', { project: proj })
        if (!j.ok) {
          message.error(j.error || '智能归档失败')
          return
        }
        await loadFacets()
        await loadDocs()
        message.success(`AI 智能归档完成，已整理 ${j.updated || 0} 份文件的目录与性质`)
      } finally {
        organizing.value = false
      }
    }

    function openEditMeta(record) {
      if (!record || !record.id) return
      metaModal.doc_id = record.id
      metaModal.project = record.project || '集团制度库'
      metaModal.folder = record.folder || ''
      metaModal.dept = record.dept || ''
      metaModal.doc_type = record.doc_type || 'regulation'
      metaModal.title = record.title || ''
      metaModal.doc_no = record.doc_no || ''
      metaModal.issued_date = record.issued_date || ''
      metaModal.status = record.status || '现行'
      metaModal.summary = record.summary || ''
      metaModal.meta = { ...(record.meta || {}) }
      metaModal.open = true
    }
    async function confirmSaveMeta() {
      if (!metaModal.doc_id) return
      metaModal.saving = true
      try {
        const j = await api.post('/api/docs/meta', {
          doc_id: metaModal.doc_id,
          project: metaModal.project,
          folder: metaModal.folder,
          dept: metaModal.dept,
          doc_type: metaModal.doc_type,
          title: metaModal.title,
          doc_no: metaModal.doc_no,
          issued_date: metaModal.issued_date,
          status: metaModal.status,
          summary: metaModal.summary,
          meta: metaModal.meta,
        })
        if (!j.ok) {
          message.error(j.error || '保存失败')
          return Promise.reject()
        }
        metaModal.open = false
        await loadDocs()
        await loadFacets()
        if (drawerOpen.value && currentDocId.value === metaModal.doc_id) {
          const d = await api.get('/api/doc/' + metaModal.doc_id)
          Object.assign(doc, d)
        }
        message.success('属性已更新')
      } finally {
        metaModal.saving = false
      }
    }

    function goToSettings(section) {
      tab.value = 'settings'
      if (section) settingsSection.value = section
    }

    function onIngestTypeChange(dt) {
      const spec = DOC_TYPE_MAP[dt]
      if (spec && spec.chunk) ingest.chunk_profile = spec.chunk
    }

    function resetIngest() {
      if (ingestAbort) {
        ingestAbort.abort()
        ingestAbort = null
      }
      clearTimeout(batchQueueTimer)
      pendingBatchFiles = []
      ingest.open = false
      ingest.doc_id = null
      ingest.file = null
      ingest.filename = ''
      ingest.tmp_id = ''
      ingest.parsing = false
      ingest.saving = false
      ingest.percent = 0
      ingest.progressText = ''
      ingest.project = catProject.value || '集团制度库'
      ingest.folder = catFolder.value || ''
      ingest.dept = ''
      ingest.doc_type = catDocType.value || 'regulation'
      ingest.chunk_profile = 'auto'
      ingest.title = ''
      ingest.doc_no = ''
      ingest.issued_date = ''
      ingest.status = '现行'
      ingest.summary = ''
      ingest.tags = []
      ingest.meta = {}
      ingest.batchMode = false
      ingest.batchRunning = false
      ingest.batchItems = []
    }

    function openIngest(docId) {
      if (!docId && ingest.batchMode && ingest.batchItems.length) {
        ingest.open = true
        return
      }
      resetIngest()
      ingest.doc_id = docId || null
      ingest.open = true
    }

    function triggerFolderUpload() {
      if (folderUploadInput.value) {
        folderUploadInput.value.value = ''
        folderUploadInput.value.click()
      }
    }
    function onFolderInputPicked(e) {
      const files = Array.from((e && e.target && e.target.files) || [])
      if (!files.length) return
      const validExts = new Set(INGEST_ACCEPT.split(','))
      const filtered = files.filter((f) => {
        if (!f.name || f.name.startsWith('~$') || f.name.startsWith('.')) return false
        const dot = f.name.lastIndexOf('.')
        const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : ''
        return validExts.has(ext)
      })
      if (!filtered.length) {
        message.warning('所选文件夹中没有受支持的文件格式')
        return
      }
      resetIngest()
      // 若当前未选定项目，则默认以拖入的根文件夹作为项目名
      const firstRel = (filtered[0].webkitRelativePath || '').replace(/\\/g, '/')
      const rootFolder = firstRel.includes('/') ? firstRel.split('/')[0] : ''
      ingest.project = catProject.value || rootFolder || '集团制度库'
      ingest.folder = catFolder.value || ''
      ingest.open = true
      runBatchIngest(filtered)
    }

    function onIngestFile(file) {
      if (ingest.doc_id) {
        ingest.batchMode = false
        ingest.file = file
        ingest.filename = file.name
        ingest.tmp_id = ''
        parseIngest(file)
        return false
      }
      pendingBatchFiles.push(file)
      clearTimeout(batchQueueTimer)
      batchQueueTimer = setTimeout(() => {
        const list = pendingBatchFiles.slice()
        pendingBatchFiles = []
        if (list.length === 1 && !ingest.batchMode) {
          ingest.file = list[0]
          ingest.filename = list[0].name
          ingest.tmp_id = ''
          parseIngest(list[0])
        } else {
          runBatchIngest(list)
        }
      }, 60)
      return false
    }

    function applyIngestMeta(j, file) {
      ingest.tmp_id = j.tmp_id
      ingest.project = j.project || ingest.project || '集团制度库'
      // 仅当用户手动指定文件夹或上传本地子文件夹时才保留 folder，不自动分类
      ingest.folder = ingest.folder || ((file && file.webkitRelativePath && file.webkitRelativePath.includes('/')) ? (j.folder || '') : '')
      ingest.dept = j.dept || ''
      ingest.doc_type = j.doc_type || 'general'
      ingest.chunk_profile = j.chunk_profile || 'auto'
      ingest.title = j.title || ''
      ingest.doc_no = j.doc_no || ''
      ingest.issued_date = j.issued_date || ''
      ingest.status = j.status || '现行'
      ingest.summary = j.summary || ''
      ingest.tags = j.tags || []
      ingest.meta = { ...(j.meta || {}) }
      ingest.filename = j.filename || (file && file.name) || ingest.filename
    }

    async function parseSingleFileUpload(file, relPath, onProg, opts) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('project', ingest.project || '')
      fd.append('folder', ingest.folder || '')
      if (relPath) fd.append('rel_path', relPath)
      if (ingest.doc_id) fd.append('skip_existing', '0')
      if (opts && opts.autoCommit) fd.append('auto_commit', '1')
      const r = await fetch('/api/docs/parse', {
        method: 'POST',
        body: fd,
        signal: ingestAbort ? ingestAbort.signal : undefined,
      })
      const ctype = r.headers.get('content-type') || ''
      if (!ctype.includes('event-stream')) {
        const j = await r.json().catch(() => ({}))
        if (!j.ok) throw new Error(j.error || '识别失败')
        return j
      }
      let result = null
      let errMsg = ''
      await readSse(r, (ev) => {
        if (ev.type === 'progress' && onProg) {
          onProg(ev)
        } else if (ev.type === 'done') {
          result = ev
        } else if (ev.type === 'error') {
          errMsg = ev.error || '识别失败'
        }
      })
      if (errMsg) throw new Error(errMsg)
      if (result && result.skipped) return result
      if (!result || !result.tmp_id) throw new Error('识别中断')
      return result
    }

    async function parseIngest(file) {
      if (ingestAbort) ingestAbort.abort()
      ingestAbort = new AbortController()
      ingest.parsing = true
      ingest.tmp_id = ''
      ingest.percent = 2
      ingest.progressText = '正在上传并分析文件结构…'
      try {
        const rel = file.webkitRelativePath || ''
        const j = await parseSingleFileUpload(file, rel, (ev) => {
          ingest.percent = ev.percent || 0
          ingest.progressText = ev.message || ingest.progressText
        })
        if (j.skipped) {
          ingest.percent = 100
          ingest.progressText = '这份文件已在库，已跳过'
          ingest.filename = j.filename || file.name
          message.info('这份文件已在库，已跳过')
          return
        }
        applyIngestMeta(j, file)
        ingest.percent = 100
        ingest.progressText = '识别完成'
        message.success(`已自动判定为「${docTypeLabel(ingest.doc_type)}」，请核对后入库`)
      } catch (e) {
        if (e && e.name === 'AbortError') return
        message.error(e.message || String(e))
      } finally {
        ingest.parsing = false
        ingestAbort = null
      }
    }

    function onIngestDismiss() {
      ingest.open = false
      const keep = ingest.batchMode && ingest.batchItems.some((x) => x.state !== 'done' && x.state !== 'skipped')
      if (!keep && !ingest.batchRunning && !ingest.parsing) {
        resetIngest()
        return
      }
      if (tab.value !== 'catalog') tab.value = 'catalog'
      const proj = ingest.project || ''
      if (proj) {
        treeExpanded[treeKeyProject(proj)] = true
        const folders = new Set()
        if (ingest.folder) folders.add(ingest.folder)
        for (const it of ingest.batchItems) if (it.folder) folders.add(it.folder)
        for (const f of folders) {
          const acc = []
          for (const p of String(f).split('/')) {
            if (!p) continue
            acc.push(p)
            treeExpanded[treeKeyFolder(proj, acc.join('/'))] = true
          }
        }
      }
    }

    function onIngestCancel() {
      if (ingestAbort) ingestAbort.abort()
      resetIngest()
    }

    let batchBgRefreshTimer = 0
    function scheduleBatchBgRefresh() {
      if (batchBgRefreshTimer) return
      batchBgRefreshTimer = setTimeout(async () => {
        batchBgRefreshTimer = 0
        try {
          await Promise.all([loadFacets(), loadDocs(), loadStats()])
        } catch (e) { /* ignore */ }
      }, 2200)
    }

    async function ingestBatchItem(item) {
      item.state = 'running'
      item.statusText = '解析中…'
      const parsed = await parseSingleFileUpload(item.file, item.file.webkitRelativePath || '', (ev) => {
        item.statusText = ev.message || '识别中…'
      }, { autoCommit: true })
      if (parsed.skipped) {
        item.state = 'skipped'
        item.statusText = '已在库'
        item.doc_type = parsed.doc_type || item.doc_type
        item.folder = parsed.folder || item.folder
        return
      }
      item.doc_type = parsed.doc_type || 'general'
      const hasLocalSubdir = !!(item.file && item.file.webkitRelativePath && item.file.webkitRelativePath.split('/').length > 2)
      item.folder = ingest.folder || (hasLocalSubdir ? (parsed.folder || '') : '')
      if (!parsed.committed) {
        item.statusText = '正在入库…'
        const committed = await api.post('/api/docs/commit', {
          tmp_id: parsed.tmp_id,
          project: parsed.project || ingest.project || '集团制度库',
          folder: item.folder,
          dept: parsed.dept || '',
          doc_type: parsed.doc_type || 'general',
          chunk_profile: parsed.chunk_profile || 'auto',
          title: parsed.title || item.file.name,
          doc_no: parsed.doc_no || '',
          issued_date: parsed.issued_date || '',
          status: parsed.status || '现行',
          summary: parsed.summary || '',
          tags: parsed.tags || [],
          meta: parsed.meta || {},
        })
        if (!committed.ok) throw new Error(committed.error || '入库失败')
      }
      item.state = 'done'
      item.statusText = '已入库'
      if (!ingest.open && ingest.project) {
        treeExpanded[treeKeyProject(ingest.project)] = true
        const acc = []
        for (const p of String(item.folder || ingest.folder || '').split('/')) {
          if (!p) continue
          acc.push(p)
          treeExpanded[treeKeyFolder(ingest.project, acc.join('/'))] = true
        }
        scheduleBatchBgRefresh()
      }
    }

    function batchFailText(e) {
      if (e && e.name === 'AbortError') return '已中断'
      const msg = e && e.message ? e.message : '失败'
      return msg.slice(0, 26)
    }

    function batchSettled(item) {
      return item.state === 'done' || item.state === 'skipped'
    }

    function batchSummaryText() {
      const items = ingest.batchItems
      const done = items.filter((x) => x.state === 'done').length
      const skipped = items.filter((x) => x.state === 'skipped').length
      const left = items.length - done - skipped
      const parts = []
      if (done) parts.push(`新入库 ${done} 份`)
      if (skipped) parts.push(`已在库跳过 ${skipped} 份`)
      if (left) parts.push(`还有 ${left} 份未完成`)
      return { done, skipped, left, text: parts.join('，') || '没有文件' }
    }

    async function finishBatchRefresh() {
      const total = ingest.batchItems.length
      const sum = batchSummaryText()
      ingest.percent = total ? Math.round(((total - sum.left) / total) * 100) : 100
      ingest.progressText = sum.left
        ? `已停下：${sum.text}`
        : `批量处理完成：${sum.text}`
      ingest.batchRunning = false
      ingestAbort = null
      await loadFacets()
      await loadDocs()
      await loadStats()
      if (!sum.left && sum.done > 0) message.success(`成功导入 ${sum.done} 份文件`)
      else if (!sum.left && sum.skipped > 0) message.info(`已在库 ${sum.skipped} 份，已跳过`)
      if (!sum.left && !ingest.open) {
        ingest.batchMode = false
        ingest.batchItems = []
        ingest.percent = 0
        ingest.progressText = ''
      }
    }

    async function runBatchQueue() {
      if (ingest.batchRunning) return
      if (ingestAbort) ingestAbort.abort()
      ingestAbort = new AbortController()
      ingest.batchRunning = true
      const items = ingest.batchItems
      const total = items.length
      const concurrency = Math.max(1, Math.min(6, Number(cfg.batch_concurrency) || 3))
      let cursor = 0
      let aborted = false

      function refreshOverallProgress(activeName) {
        const settledCount = items.filter((x) => batchSettled(x)).length
        ingest.percent = total ? Math.round((settledCount / total) * 100) : 100
        if (activeName) {
          ingest.progressText = `正在并行处理 (${settledCount}/${total} 已完成，${concurrency} 路加速)：${activeName}`
        }
      }

      async function worker() {
        while (!aborted) {
          const i = cursor++
          if (i >= total) break
          const item = items[i]
          if (batchSettled(item)) continue
          refreshOverallProgress(item.file.name)
          try {
            await ingestBatchItem(item)
          } catch (e) {
            item.state = 'error'
            item.statusText = batchFailText(e)
            if (e && e.name === 'AbortError') {
              aborted = true
              break
            }
          }
          refreshOverallProgress(item.file.name)
        }
      }

      const workers = Array.from({ length: Math.min(concurrency, total || 1) }, () => worker())
      await Promise.all(workers)
      if (batchBgRefreshTimer) {
        clearTimeout(batchBgRefreshTimer)
        batchBgRefreshTimer = 0
      }
      await finishBatchRefresh()
    }

    function retryBatchFromBreak() {
      return runBatchQueue()
    }

    async function retryBatchItem(item) {
      if (!item || batchSettled(item) || ingest.batchRunning) return
      if (ingestAbort) ingestAbort.abort()
      ingestAbort = new AbortController()
      ingest.batchRunning = true
      ingest.progressText = `正在重试：${item.file.name}`
      try {
        await ingestBatchItem(item)
      } catch (e) {
        item.state = 'error'
        item.statusText = batchFailText(e)
      }
      await finishBatchRefresh()
    }

    async function runBatchIngest(files) {
      if (ingestAbort) ingestAbort.abort()
      ingestAbort = null
      ingest.batchMode = true
      ingest.filename = `已选择 ${files.length} 个文件批量入库`
      ingest.batchItems = files.map((f) => ({
        file: f,
        name: f.webkitRelativePath || f.name,
        doc_type: '',
        folder: '',
        state: 'pending',
        statusText: '等待中',
      }))
      await runBatchQueue()
    }

    async function readSse(res, onEvent) {
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          const line = raw.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          try {
            onEvent(JSON.parse(line.slice(5).trim()))
          } catch (e) { /* skip */ }
        }
      }
    }

    async function onIngestOk() {
      if (ingest.batchMode) {
        if (ingest.batchRunning) return Promise.reject()
        resetIngest()
        return
      }
      if (ingest.parsing) return Promise.reject()
      if (!ingest.tmp_id) {
        message.warning('请先上传文件')
        return Promise.reject()
      }
      ingest.saving = true
      try {
        const body = {
          tmp_id: ingest.tmp_id,
          project: ingest.project || '集团制度库',
          folder: ingest.folder || '',
          dept: ingest.dept || ingest.folder || '',
          doc_type: ingest.doc_type || 'general',
          chunk_profile: ingest.chunk_profile || 'auto',
          title: ingest.title,
          doc_no: ingest.doc_no,
          issued_date: ingest.issued_date,
          status: ingest.status,
          summary: ingest.summary,
          tags: ingest.tags,
          meta: ingest.meta,
        }
        if (ingest.doc_id) body.doc_id = ingest.doc_id
        const j = await api.post('/api/docs/commit', body)
        if (!j.ok) {
          message.error(j.error || '入库失败')
          return Promise.reject()
        }
        message.success(ingest.doc_id ? '已更新' : '已入库')
        const targetProj = j.project || body.project
        resetIngest()
        if (targetProj) expandedProjs[targetProj] = true
        await loadFacets()
        await loadDocs()
        await loadStats()
      } catch (e) {
        if (e) message.error(String(e))
        return Promise.reject()
      } finally {
        ingest.saving = false
      }
    }

    function onDocOp(ev, record) {
      ev.domEvent && ev.domEvent.stopPropagation()
      const key = ev.key
      if (key === 'edit_meta') {
        openEditMeta(record)
        return
      }
      if (key === 'update') {
        openIngest(record.id)
        return
      }
      if (key === 'delete') {
        Modal.confirm({
          title: `确认从知识库中删除「${record.title || '该文件'}」？`,
          okText: '删除',
          okType: 'danger',
          cancelText: '取消',
          async onOk() {
            const j = await api.post('/api/docs/delete', { doc_ids: [record.id] })
            if (!j.ok) {
              message.error(j.error || '删除失败')
              return Promise.reject()
            }
            message.success('已删除')
            await loadDocs()
            await loadFacets()
            await loadStats()
          },
        })
        return
      }
      if (key !== '已废止' && key !== '现行' && key !== '试行') return
      const label = key === '已废止' ? '废止' : key
      Modal.confirm({
        title: `将「${record.title || '该文件'}」标记为${label}？`,
        okText: '确定',
        cancelText: '取消',
        async onOk() {
          const j = await api.post('/api/docs/status', { doc_id: record.id, status: key })
          if (!j.ok) {
            message.error(j.error || '更新失败')
            return Promise.reject()
          }
          message.success('已标记为' + key)
          await loadDocs()
          await loadFacets()
        },
      })
    }

    const attachments = ref([])
    const attachInput = ref(null)
    const attachOver = ref(false)
    let attachDrag = 0
    const menuOpen = ref(false)
    const menuPanel = ref('')
    const modelWrap = ref(null)
    const modelQuery = ref('')
    const modelList = ref([])
    let modelsAt = 0

    const currentChatModel = computed(() => {
      const list = modelList.value
      return list.find((m) => m.provider_id === cfg.provider_id && m.id === cfg.model)
        || list.find((m) => m.id === cfg.model)
        || null
    })
    const effortOptions = computed(() => (currentChatModel.value && currentChatModel.value.efforts) || [])
    const effortLabel = computed(() => {
      const opts = effortOptions.value
      const hit = opts.find((e) => e.id === cfg.effort)
      if (hit) return hit.label
      const fb = EFFORTS.find((e) => e.id === cfg.effort)
      return (fb && fb.label) || ''
    })
    const contextOptions = computed(() => {
      const m = currentChatModel.value
      if (m && m.context_options && m.context_options.length) return m.context_options
      if (m && m.context_label) return [{ id: String(m.context), label: m.context_label }]
      return []
    })
    const contextLabel = computed(() => {
      const opts = contextOptions.value
      if (!opts.length) return ''
      const hit = opts.find((c) => c.id === cfg.context)
      return (hit && hit.label) || opts[0].label
    })
    const modelLabel = computed(() => {
      const hit = currentChatModel.value
      return (hit && hit.label) || cfg.model || '模型'
    })
    const modelHasVision = computed(() => {
      const hit = currentChatModel.value
      if (hit && hit.image) return true
      return ((hit && hit.inputs) || []).includes('image')
    })
    const channelLabel = computed(() => {
      const hit = currentChatModel.value
      if (hit && hit.provider) return hit.provider
      const p = (cfg.providers || []).find((x) => x.id === cfg.provider_id)
      return (p && p.name) || ''
    })
    const modelPill = computed(() => {
      const bits = []
      if (channelLabel.value) bits.push(channelLabel.value)
      bits.push(modelLabel.value)
      return bits.join(' ')
    })
    const groupedModels = computed(() => {
      const q = (modelQuery.value || '').trim().toLowerCase()
      const groups = []
      const map = new Map()
      for (const m of modelList.value) {
        if (q && !((m.id || '').toLowerCase().includes(q) || (m.label || '').toLowerCase().includes(q) || (m.provider || '').toLowerCase().includes(q))) {
          continue
        }
        const pid = m.provider_id || 'default'
        if (!map.has(pid)) {
          const g = { id: pid, name: m.provider || '模型', models: [] }
          map.set(pid, g)
          groups.push(g)
        }
        map.get(pid).models.push(m)
      }
      return groups
    })
    const filteredModels = groupedModels

    function onDocClick(e) {
      const el = modelWrap.value
      if (menuOpen.value && el && !el.contains(e.target)) {
        menuOpen.value = false
        menuPanel.value = ''
      }
    }
    onMounted(() => document.addEventListener('mousedown', onDocClick))
    onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
    function toggleModelMenu() {
      menuOpen.value = !menuOpen.value
      if (!menuOpen.value) menuPanel.value = ''
    }
    function openPanel(name) {
      menuPanel.value = menuPanel.value === name ? '' : name
      if (name === 'model') loadModels()
    }
    function setEffort(id) {
      cfg.effort = id
      menuPanel.value = ''
    }
    function setContext(id) {
      cfg.context = id
      menuPanel.value = ''
    }
    function applyModelMeta(m) {
      const opts = (m && m.efforts) || []
      if (opts.length && !opts.some((e) => e.id === cfg.effort)) {
        const high = opts.find((e) => e.id === 'high') || opts[opts.length - 1]
        cfg.effort = high.id
      }
      if (m && m.context) cfg.context = String(m.context)
    }
    function setChatModel(providerId, id) {
      cfg.provider_id = providerId
      cfg.model = id
      const m = modelList.value.find((x) => x.provider_id === providerId && x.id === id)
      applyModelMeta(m)
      menuPanel.value = ''
    }
    async function loadModels(force) {
      if (!force && modelList.value.length && Date.now() - modelsAt < 30000) return
      try {
        const j = await api.get('/api/models')
        modelList.value = j.models || []
        modelsAt = Date.now()
        if (j.provider_id && !cfg.provider_id) cfg.provider_id = j.provider_id
        applyModelMeta(currentChatModel.value)
      } catch (e) {
        if (!modelList.value.length && cfg.model) {
          modelList.value = [{ id: cfg.model, label: cfg.model, provider_id: cfg.provider_id }]
        }
      }
    }

    function isImageName(name) {
      const n = (name || '').toLowerCase()
      return IMAGE_EXT.some((ext) => n.endsWith(ext))
    }
    function isAttachFile(file) {
      const n = (file.name || '').toLowerCase()
      return ATTACH_EXT.some((ext) => n.endsWith(ext))
    }
    function pickAttach() {
      if (asking.value || !attachInput.value) return
      attachInput.value.click()
    }
    function onAttachPicked(e) {
      addAttachFiles(e.target.files)
      e.target.value = ''
    }
    function onAttachEnter() {
      attachDrag += 1
      attachOver.value = true
    }
    function onAttachLeave() {
      attachDrag = Math.max(0, attachDrag - 1)
      if (!attachDrag) attachOver.value = false
    }
    function onAttachDrop(e) {
      attachDrag = 0
      attachOver.value = false
      addAttachFiles(e.dataTransfer && e.dataTransfer.files)
    }
    function clipboardFileName(file, index) {
      const name = (file && file.name) || ''
      const generic = !name || name === 'image.png' || name === 'blob' || /^clipboard/i.test(name)
      if (!generic && /\.[a-z0-9]{1,8}$/i.test(name)) return name
      const mime = ((file && file.type) || '').toLowerCase()
      const map = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'image/tiff': '.tiff',
        'image/heic': '.heic',
        'image/heif': '.heif',
        'application/pdf': '.pdf',
        'text/plain': '.txt',
        'text/markdown': '.md',
        'application/json': '.json',
        'text/csv': '.csv',
      }
      const ext = map[mime]
      if (!ext) return name
      const d = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      const stamp = '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
        + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
      return '粘贴-' + stamp + (index ? '-' + index : '') + ext
    }
    function onAttachPaste(e) {
      if (asking.value) return
      const cd = e && e.clipboardData
      if (!cd) return
      const raw = []
      const seen = new Set()
      const push = (file) => {
        if (!file) return
        const key = [file.name, file.size, file.type, file.lastModified].join('|')
        if (seen.has(key)) return
        seen.add(key)
        raw.push(file)
      }
      if (cd.files && cd.files.length) {
        for (const file of cd.files) push(file)
      }
      if (cd.items && cd.items.length) {
        for (const item of cd.items) {
          if (item.kind !== 'file') continue
          try { push(item.getAsFile()) } catch (_err) {}
        }
      }
      if (!raw.length) return
      e.preventDefault()
      const named = raw.map((file, i) => {
        const name = clipboardFileName(file, i)
        if (!name || name === file.name) return file
        try {
          return new File([file], name, { type: file.type || '', lastModified: file.lastModified || Date.now() })
        } catch (_err) {
          return file
        }
      })
      addAttachFiles(named)
    }
    function removeAttach(id) {
      attachments.value = attachments.value.filter((a) => a.id !== id)
    }
    function addAttachFiles(list) {
      const files = [...(list || [])]
      for (const file of files) {
        if (attachments.value.length >= 8) break
        if (!isAttachFile(file)) {
          message.warning('不支持 ' + file.name)
          continue
        }
        const item = reactive({
          id: Date.now() + '-' + Math.random().toString(16).slice(2),
          name: file.name,
          file,
          state: 'parsing',
          percent: 2,
          text: '',
          source: '',
          error: '',
          kind: '',
          mime: '',
          data: '',
        })
        attachments.value.push(item)
        parseAttach(file, item)
      }
    }
    async function parseAttach(file, item, vision) {
      try {
        const useVision = vision !== undefined ? vision : (modelHasVision.value && isImageName(file.name))
        const fd = new FormData()
        fd.append('file', file)
        fd.append('vision', useVision ? '1' : '0')
        const r = await fetch('/api/attach', { method: 'POST', body: fd })
        const ctype = r.headers.get('content-type') || ''
        if (!ctype.includes('event-stream')) {
          const j = await r.json().catch(() => ({}))
          item.state = 'error'
          item.error = j.error || '识别失败'
          return
        }
        await readSse(r, (ev) => {
          if (ev.type === 'progress') {
            item.percent = ev.percent || item.percent
          } else if (ev.type === 'done') {
            item.state = 'ready'
            item.percent = 100
            item.text = ev.text || ''
            item.source = ev.source || ''
            item.kind = ev.kind || (ev.data ? 'image' : 'text')
            item.mime = ev.mime || ''
            item.data = ev.data || ''
            if (ev.name) item.name = ev.name
          } else if (ev.type === 'error') {
            item.state = 'error'
            item.error = ev.error || '识别失败'
          }
        })
        if (item.state === 'parsing') {
          item.state = 'error'
          item.error = '识别中断'
        }
      } catch (e) {
        item.state = 'error'
        item.error = String(e)
      }
    }

    const nativeBw = (typeof window !== 'undefined' && window.o2Browser && window.o2Browser.isElectron)
      ? window.o2Browser
      : null
    const hasNativeBrowser = ref(!!nativeBw)
    const browserStage = ref(null)
    const askBrowserStage = ref(null)
    const askBrowserWin = ref(null)
    const chatwrapEl = ref(null)
    const chatwrapSize = reactive({ w: 980, h: 780 })
    const askBwScale = ref(1.0)
    const askBwDragging = ref(false)
    const askBwTransitioning = ref(false)
    let transitionTimer = 0
    const browserState = reactive({
      ready: !!nativeBw,
      activeTabId: '',
      tabs: [],
      downloads: [],
      coPanel: {
        open: false,
        openSource: '',
        aiActive: false,
        aiActionLabel: '',
        waitingHuman: false,
        humanReason: '',
        lastHumanInputAt: 0,
      },
    })
    const browserUrlInput = ref('')
    const browserUrlFocused = ref(false)
    const browserPreviewUrl = ref('')

    const askBrowserOpen = computed(() => !!browserState.coPanel.open)

    function computeAskBwWidth(sc) {
      const cw = Math.max(480, chatwrapSize.w || 980)
      const ch = Math.max(440, chatwrapSize.h || 780)
      const baseW = Math.min(720, cw - 56)
      const maxStageH = Math.max(165, Math.round((ch - 255) * 0.64 * sc))
      const maxWByH = Math.round((maxStageH * 16) / 9)
      return Math.round(Math.max(320, Math.min(cw - 40, baseW * sc, maxWByH)))
    }

    const askBrowserWindowStyle = computed(() => ({
      width: computeAskBwWidth(askBwScale.value || 1.0) + 'px',
    }))

    const askBrowserBtnTooltip = computed(() => {
      if (browserState.coPanel.waitingHuman) {
        return '需要您操作浏览器（' + (browserState.coPanel.humanReason || '完成验证或登录') + '）'
      }
      if (browserState.coPanel.aiActive) {
        return 'O2 正在操作浏览器' + (browserState.coPanel.aiActionLabel ? ('：' + browserState.coPanel.aiActionLabel) : '')
      }
      return askBrowserOpen.value ? '收起上方协同浏览器' : '展开上方协同浏览器'
    })

    const activeBrowserTab = computed(() => (
      browserState.tabs.find((t) => t.id === browserState.activeTabId) || browserState.tabs[0] || null
    ))
    const browserOccluded = computed(() => !!(
      drawerOpen.value || ingest.open || addProvider.open || addEmbedProvider.open || addModel.open || histMode.value || menuOpen.value
    ))

    async function refreshBrowserPreview() {
      if (!nativeBw) return
      try {
        const shot = await nativeBw.capturePreview()
        if (shot && shot.dataUrl) {
          browserPreviewUrl.value = shot.dataUrl
        }
      } catch (_e) {}
    }

    function sendViewportFast(rect) {
      if (!nativeBw) return
      if (typeof nativeBw.setViewportFast === 'function') {
        nativeBw.setViewportFast(rect)
      } else {
        nativeBw.setViewport(rect).catch(() => {})
      }
    }

    function runAskBwTransition(durationMs = 340) {
      if (!nativeBw) return
      clearTimeout(transitionTimer)
      askBwTransitioning.value = true
      sendViewportFast({ visible: false, animating: true })
      if (!browserPreviewUrl.value) {
        refreshBrowserPreview()
      }
      transitionTimer = setTimeout(() => {
        askBwTransitioning.value = false
        nextTick(() => {
          requestAnimationFrame(() => {
            syncBrowserViewport(false)
            refreshBrowserPreview()
            setTimeout(() => {
              if (!askBwTransitioning.value) syncBrowserViewport(false)
            }, 90)
            setTimeout(() => {
              if (!askBwTransitioning.value) syncBrowserViewport(false)
            }, 240)
          })
        })
      }, durationMs)
    }

    function applyBrowserState(st) {
      if (!st || typeof st !== 'object') return
      browserState.ready = st.ready !== false
      browserState.activeTabId = st.activeTabId || ''
      browserState.tabs = Array.isArray(st.tabs) ? st.tabs : []
      browserState.downloads = Array.isArray(st.downloads) ? st.downloads : []
      if (st.coPanel && typeof st.coPanel === 'object') {
        const prevOpen = browserState.coPanel.open
        const nextOpen = !!st.coPanel.open
        browserState.coPanel.open = nextOpen
        browserState.coPanel.openSource = st.coPanel.openSource || ''
        browserState.coPanel.aiActive = !!st.coPanel.aiActive
        browserState.coPanel.aiActionLabel = st.coPanel.aiActionLabel || ''
        browserState.coPanel.waitingHuman = !!st.coPanel.waitingHuman
        browserState.coPanel.humanReason = st.coPanel.humanReason || ''
        browserState.coPanel.lastHumanInputAt = st.coPanel.lastHumanInputAt || 0
        if (prevOpen !== nextOpen) {
          runAskBwTransition(350)
        }
      }
      if (!browserUrlFocused.value) {
        const cur = activeBrowserTab.value
        browserUrlInput.value = (cur && cur.url) || ''
      }
    }

    function sendCoPanelPatch(patch) {
      if (nativeBw && typeof nativeBw.setCoPanel === 'function') {
        return nativeBw.setCoPanel(patch).then(applyBrowserState).catch(() => {})
      }
      return api.post('/api/browser/action', { action: 'co_panel', ...patch }).then(applyBrowserState).catch(() => {})
    }

    async function toggleAskBrowserByUser() {
      const nextOpen = !browserState.coPanel.open
      if (nextOpen) {
        await refreshBrowserPreview()
        browserState.coPanel.open = true
        browserState.coPanel.openSource = 'user'
        runAskBwTransition(350)
        sendCoPanelPatch({ open: true, openSource: 'user', byUser: true })
      } else {
        closeAskBrowserByUser()
      }
    }

    async function closeAskBrowserByUser() {
      await refreshBrowserPreview()
      browserState.coPanel.open = false
      const wasWaiting = browserState.coPanel.waitingHuman
      if (wasWaiting) {
        browserState.coPanel.waitingHuman = false
        browserState.coPanel.humanReason = ''
      }
      runAskBwTransition(340)
      sendCoPanelPatch({
        open: false,
        byUser: true,
        humanSignal: wasWaiting ? 'user_closed' : '',
      })
    }

    function confirmHumanBrowserDone() {
      browserState.coPanel.waitingHuman = false
      browserState.coPanel.humanReason = ''
      sendCoPanelPatch({
        waitingHuman: false,
        humanSignal: 'manual_done',
      })
    }

    function onBrowserPanelEvent(ev) {
      if (!ev) return
      if (ev.state === 'waiting_human') {
        const wasOpen = browserState.coPanel.open
        browserState.coPanel.waitingHuman = true
        browserState.coPanel.aiActive = true
        browserState.coPanel.humanReason = ev.reason || ev.label || '需要您完成页面验证或登录'
        browserState.coPanel.open = true
        if (!browserState.coPanel.openSource) browserState.coPanel.openSource = 'ai'
        if (!wasOpen) runAskBwTransition(350)
      } else if (ev.state === 'active') {
        const wasOpen = browserState.coPanel.open
        browserState.coPanel.aiActive = true
        browserState.coPanel.aiActionLabel = ev.label || '正在操作浏览器'
        if (!nativeBw && !browserState.coPanel.open) {
          browserState.coPanel.open = true
          if (!browserState.coPanel.openSource) browserState.coPanel.openSource = 'ai'
        }
        if (!wasOpen && browserState.coPanel.open) runAskBwTransition(350)
      } else if (ev.state === 'session_end') {
        browserState.coPanel.aiActive = false
        browserState.coPanel.aiActionLabel = ''
        if (!nativeBw && browserState.coPanel.open && browserState.coPanel.openSource === 'ai' && !browserState.coPanel.waitingHuman) {
          setTimeout(() => {
            if (browserState.coPanel.open && browserState.coPanel.openSource === 'ai' && !browserState.coPanel.waitingHuman) {
              browserState.coPanel.open = false
              browserState.coPanel.openSource = ''
            }
          }, 850)
        }
      }
    }

    async function applyScaleSmooth(nextScale) {
      const clamped = Math.max(0.65, Math.min(1.35, Number(nextScale.toFixed(2))))
      if (clamped === askBwScale.value) return
      await refreshBrowserPreview()
      askBwScale.value = clamped
      runAskBwTransition(235)
    }

    function stepAskBwScale(delta) {
      applyScaleSmooth(askBwScale.value + delta)
    }

    function resetAskBwScale() {
      applyScaleSmooth(1.0)
    }

    let wheelLock = false
    function onAskBrowserWheel(e) {
      if (!e || wheelLock) return
      wheelLock = true
      setTimeout(() => { wheelLock = false }, 120)
      stepAskBwScale(e.deltaY < 0 ? 0.08 : -0.08)
    }

    function onAskBwResizeStart(dir, e) {
      if (!e) return
      const winEl = askBrowserWin.value
      const startRect = winEl ? winEl.getBoundingClientRect() : null
      const startW = (startRect && startRect.width) || computeAskBwWidth(askBwScale.value)
      const baseW = computeAskBwWidth(1.0) || 640
      const startX = e.clientX
      const startY = e.clientY
      const handleEl = e.currentTarget
      if (handleEl && typeof handleEl.setPointerCapture === 'function' && e.pointerId != null) {
        try { handleEl.setPointerCapture(e.pointerId) } catch (_err) {}
      }
      clearTimeout(transitionTimer)
      askBwTransitioning.value = false
      askBwDragging.value = true

      let dragRaf = 0
      const onMove = (ev) => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        let deltaW = 0
        const hasE = dir.includes('e')
        const hasW = dir.includes('w')
        const hasS = dir.includes('s')
        const hasN = dir.includes('n')
        const dwX = hasE ? (dx * 2) : (hasW ? (-dx * 2) : 0)
        const dwY = hasS ? (dy * (16 / 9) * 1.45) : (hasN ? (-dy * (16 / 9) * 1.45) : 0)
        if ((hasE || hasW) && (hasN || hasS)) {
          deltaW = (dwX + dwY) * 0.5
        } else if (hasE || hasW) {
          deltaW = dwX
        } else {
          deltaW = dwY
        }
        const targetW = Math.max(320, startW + deltaW)
        const nextScale = Math.max(0.65, Math.min(1.35, Number((targetW / baseW).toFixed(3))))
        if (nextScale !== askBwScale.value) {
          askBwScale.value = nextScale
          cancelAnimationFrame(dragRaf)
          dragRaf = requestAnimationFrame(() => {
            syncBrowserViewport(true)
          })
        }
      }

      const onEnd = () => {
        cancelAnimationFrame(dragRaf)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onEnd)
        window.removeEventListener('pointercancel', onEnd)
        askBwDragging.value = false
        nextTick(() => {
          syncBrowserViewport(false)
          refreshBrowserPreview()
        })
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onEnd)
      window.addEventListener('pointercancel', onEnd)
    }

    function syncBrowserViewport(animating = false) {
      if (!nativeBw) return
      const isFullBw = tab.value === 'browser'
      const isInlineBw = tab.value === 'ask' && askBrowserOpen.value
      const el = isFullBw ? browserStage.value : (isInlineBw ? askBrowserStage.value : null)
      const rect = el ? el.getBoundingClientRect() : null
      const visible = !!(
        (isFullBw || isInlineBw) &&
        !browserOccluded.value &&
        !askBwTransitioning.value &&
        rect &&
        rect.width > 10 &&
        rect.height > 10
      )
      sendViewportFast({
        visible,
        inline: !!isInlineBw,
        animating: !!(animating || askBwDragging.value),
        x: rect ? rect.left : 0,
        y: rect ? rect.top : 0,
        width: rect ? rect.width : 0,
        height: rect ? rect.height : 0,
      })
    }

    let pumpRaf = 0
    function pumpViewportSync(durationMs = 260) {
      cancelAnimationFrame(pumpRaf)
      const t0 = performance.now()
      const step = (now) => {
        syncBrowserViewport(true)
        if (now - t0 < durationMs) {
          pumpRaf = requestAnimationFrame(step)
        } else {
          syncBrowserViewport(false)
        }
      }
      pumpRaf = requestAnimationFrame(step)
    }

    let browserRo = null
    let askBrowserRo = null
    let chatwrapRo = null
    let chatlogRo = null
    let unbindBrowserState = null
    let chatlogStickBottom = true
    let prevChatlogH = 0

    function onChatlogScroll() {
      const el = chatlog.value
      if (!el) return
      chatlogStickBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) <= 96
    }

    watch(chatlog, (el) => {
      if (chatlogRo) {
        chatlogRo.disconnect()
        chatlogRo = null
      }
      if (el && typeof ResizeObserver !== 'undefined') {
        prevChatlogH = el.clientHeight || 0
        chatlogRo = new ResizeObserver(() => {
          const curH = el.clientHeight || 0
          const deltaH = prevChatlogH - curH
          prevChatlogH = curH
          if (Math.abs(deltaH) < 1) return
          if (chatlogStickBottom || asking.value) {
            el.scrollTop = el.scrollHeight
          } else if (deltaH !== 0) {
            el.scrollTop = Math.max(0, el.scrollTop + Math.round(deltaH * 0.5))
          }
        })
        chatlogRo.observe(el)
      }
    })

    watch(chatwrapEl, (el) => {
      if (chatwrapRo) {
        chatwrapRo.disconnect()
        chatwrapRo = null
      }
      if (el && typeof ResizeObserver !== 'undefined') {
        const updateSize = () => {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) {
            chatwrapSize.w = Math.round(r.width)
            chatwrapSize.h = Math.round(r.height)
          }
          if (!askBwTransitioning.value) syncBrowserViewport()
        }
        chatwrapRo = new ResizeObserver(updateSize)
        chatwrapRo.observe(el)
        updateSize()
      }
    })

    watch(browserStage, (el) => {
      if (browserRo) {
        browserRo.disconnect()
        browserRo = null
      }
      if (el && typeof ResizeObserver !== 'undefined') {
        browserRo = new ResizeObserver(() => {
          if (!askBwTransitioning.value) syncBrowserViewport()
        })
        browserRo.observe(el)
      }
      nextTick(() => {
        if (!askBwTransitioning.value) syncBrowserViewport()
      })
    })

    watch(askBrowserStage, (el) => {
      if (askBrowserRo) {
        askBrowserRo.disconnect()
        askBrowserRo = null
      }
      if (el && typeof ResizeObserver !== 'undefined') {
        askBrowserRo = new ResizeObserver(() => {
          if (!askBwTransitioning.value) syncBrowserViewport(askBwDragging.value)
        })
        askBrowserRo.observe(el)
      }
      nextTick(() => {
        if (!askBwTransitioning.value) syncBrowserViewport()
      })
    })

    watch(tab, () => {
      if (nativeBw) {
        sendViewportFast({ visible: false })
        clearTimeout(transitionTimer)
        askBwTransitioning.value = true
        transitionTimer = setTimeout(() => {
          askBwTransitioning.value = false
          nextTick(() => {
            requestAnimationFrame(() => {
              syncBrowserViewport(false)
            })
          })
        }, 90)
      }
      if ((tab.value === 'browser' || (tab.value === 'ask' && askBrowserOpen.value)) && !nativeBw) {
        api.get('/api/browser/state').then(applyBrowserState).catch(() => {})
      }
    })

    watch(browserOccluded, async (occ) => {
      if (!nativeBw || (tab.value !== 'browser' && !(tab.value === 'ask' && askBrowserOpen.value))) return
      if (occ) {
        await refreshBrowserPreview()
        syncBrowserViewport()
      } else {
        nextTick(syncBrowserViewport)
      }
    })

    watch(activeBrowserTab, (cur, prev) => {
      if (!browserUrlFocused.value) {
        browserUrlInput.value = (cur && cur.url) || ''
      }
      if (cur && !cur.loading && (!prev || prev.loading || prev.id !== cur.id)) {
        setTimeout(refreshBrowserPreview, 120)
      }
    }, { deep: true })

    function onBrowserUrlFocus(e) {
      browserUrlFocused.value = true
      if (e && e.target && typeof e.target.select === 'function') {
        requestAnimationFrame(() => e.target.select())
      }
    }

    function onBrowserUrlBlur() {
      browserUrlFocused.value = false
      const cur = activeBrowserTab.value
      if (cur && !(browserUrlInput.value || '').trim()) {
        browserUrlInput.value = cur.url || ''
      }
    }

    async function submitBrowserUrl() {
      const raw = (browserUrlInput.value || '').trim()
      if (!raw) return
      browserUrlFocused.value = false
      if (nativeBw) {
        applyBrowserState(await nativeBw.navigate(raw))
      } else {
        await api.post('/api/browser/action', { action: 'open', url: raw })
        applyBrowserState(await api.get('/api/browser/state'))
      }
    }

    async function newBrowserTab(url) {
      if (nativeBw) applyBrowserState(await nativeBw.newTab(url || ''))
      else {
        await api.post('/api/browser/action', { action: 'open', url: url || 'https://www.bing.com', new_tab: true })
        applyBrowserState(await api.get('/api/browser/state'))
      }
    }

    async function switchBrowserTab(id) {
      if (nativeBw) applyBrowserState(await nativeBw.switchTab(id))
      else {
        await api.post('/api/browser/action', { action: 'switch_tab', tab_id: id })
        applyBrowserState(await api.get('/api/browser/state'))
      }
    }

    async function closeBrowserTab(id) {
      if (nativeBw) applyBrowserState(await nativeBw.closeTab(id))
      else {
        await api.post('/api/browser/action', { action: 'close_tab', tab_id: id })
        applyBrowserState(await api.get('/api/browser/state'))
      }
    }

    async function browserBack() {
      if (nativeBw) applyBrowserState(await nativeBw.goBack())
      else await api.post('/api/browser/action', { action: 'back' })
    }

    async function browserForward() {
      if (nativeBw) applyBrowserState(await nativeBw.goForward())
      else await api.post('/api/browser/action', { action: 'forward' })
    }

    async function browserReloadOrStop() {
      const cur = activeBrowserTab.value
      if (nativeBw) {
        if (cur && cur.loading) applyBrowserState(await nativeBw.stop())
        else applyBrowserState(await nativeBw.reload())
      } else {
        await api.post('/api/browser/action', { action: 'reload' })
      }
    }

    function browserDevTools() {
      if (nativeBw) nativeBw.toggleDevTools()
    }

    onMounted(() => {
      if (nativeBw) {
        unbindBrowserState = nativeBw.onState(applyBrowserState)
        nativeBw.getState().then(applyBrowserState).catch(() => {})
      } else {
        api.get('/api/browser/state').then(applyBrowserState).catch(() => {})
      }
      window.addEventListener('resize', syncBrowserViewport)
      nextTick(syncBrowserViewport)
    })

    onBeforeUnmount(() => {
      cancelAnimationFrame(pumpRaf)
      clearTimeout(transitionTimer)
      if (unbindBrowserState) unbindBrowserState()
      if (browserRo) browserRo.disconnect()
      if (askBrowserRo) askBrowserRo.disconnect()
      if (chatwrapRo) chatwrapRo.disconnect()
      if (chatlogRo) chatlogRo.disconnect()
      window.removeEventListener('resize', syncBrowserViewport)
    })

    // ============== 主题切换、终端看板与情报大脑 ==============
    const clockNow = ref(Date.now())
    let clockTimer = 0
    onMounted(() => {
      clockTimer = setInterval(() => { clockNow.value = Date.now() }, 1000)
    })
    onBeforeUnmount(() => {
      clearInterval(clockTimer)
    })
    const terminalClock = computed(() => {
      const d = new Date(clockNow.value)
      const p = (n) => String(n).padStart(2, '0')
      return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    })
    const marketHours = computed(() => {
      const d = new Date(clockNow.value)
      const day = d.getUTCDay()
      const mins = d.getUTCHours() * 60 + d.getUTCMinutes()
      const isWknd = day === 0 || day === 6
      const specs = [
        { code: 'SSE', ranges: [[90, 210], [300, 420]], label: '09:30-15:00 CST' },
        { code: 'HKEX', ranges: [[90, 240], [300, 480]], label: '09:30-16:00 HKT' },
        { code: 'MOEX', ranges: [[420, 940]], label: '10:00-18:40 MSK' },
        { code: 'LSE', ranges: [[480, 990]], label: '08:00-16:30 UTC' },
        { code: 'NYSE', ranges: [[870, 1260]], label: '09:30-16:00 EST' },
        { code: 'NASDAQ', ranges: [[870, 1260]], label: '09:30-16:00 EST' },
      ]
      return specs.map((s) => {
        const open = !isWknd && s.ranges.some(([a, b]) => mins >= a && mins < b)
        return { code: s.code, open, detail: s.label }
      })
    })

    function toggleTheme() {
      cfg.ui_theme = cfg.ui_theme === 'dark' ? 'light' : 'dark'
    }
    watch(() => cfg.ui_theme, (val) => {
      document.documentElement.dataset.theme = val === 'dark' ? 'dark' : 'light'
    }, { immediate: true })

    watch(() => cfg.news_enabled, (enabled) => {
      if (!enabled && (tab.value === 'news' || tab.value === 'dashboard' || tab.value === 'markets')) {
        tab.value = 'ask'
      }
      if (enabled) {
        loadNewsStatus()
        loadNewsFeeds()
        loadNewsItems(true)
        loadNewsEntities()
        loadEntityGraph()
        loadDashboardLayout()
        loadMarketLayout()
        ensureMarketBoot()
      }
      nextTick(() => navSlide.schedule(tab.value))
    })

    const QUANT_WIDGET_TYPES = new Set([
      'pro_kline', 'rebased_compare', 'formula_spread', 'percentile_barcode',
      'capital_flow', 'rotation_quadrant', 'chokepoint_watch', 'analog_finder',
      'event_study', 'divergence_radar', 'custom_echarts',
      'macro_clock', 'corr_matrix', 'risk_drawdown', 'market_breadth',
      'style_factor', 'commodity_dashboard', 'rate_spread_watch', 'intel_catalyst',
    ])
    function isQuantWidgetType(t) {
      return QUANT_WIDGET_TYPES.has(t)
    }

    const LEGACY_EN_TITLE_MAP = {
      'WATCHLIST & K-LINE': '自选与 K 线',
      'SECTOR HEATMAP': '板块热力图',
      'MACRO YIELDS & FX': '宏观利率与汇率',
      'GEO & PORTWATCH': '地缘事件概率',
      'DATA BUS': '数据源状态',
      'ENTITY GRAPH': '实体关系网络',
      'RISK PULSE': '情绪温度计',
      'LIVE WIRE': '实时快讯',
      'DESK NOTE': '情报简报',
      'QUANT LAB [M4]': '量化回测',
      'INDICES': '核心指数',
      'CN LOGISTICS & CORE': 'A 股核心资产',
      'A 股物流与龙头': 'A 股核心资产',
      'US & HK EQUITIES': '美港核心资产',
      'FOREX': '全球外汇',
      'COMMODITIES': '大宗商品',
      'ETF & BONDS': 'ETF 与债券',
      'CRYPTO': '加密资产',
      'WATCHLIST': '自选标的',
      'K-LINE TERMINAL': 'K 线主图',
      'TOP GAINERS': '领涨异动',
      'TOP LOSERS': '领跌异动',
      'MOST ACTIVE': '成交活跃',
    }

    const DASHBOARD_WIDGET_REGISTRY = {
      watchlist_slot: { type: 'watchlist_slot', badge: 'M', title: '自选与 K 线', defaultW: 16, defaultH: 12, minW: 8, minH: 8 },
      pro_kline: { type: 'pro_kline', badge: 'PK', title: '多指标共振 K 线', defaultW: 16, defaultH: 14, minW: 8, minH: 9 },
      rebased_compare: { type: 'rebased_compare', badge: 'RB', title: '多标的相对收益', defaultW: 12, defaultH: 11, minW: 6, minH: 7 },
      formula_spread: { type: 'formula_spread', badge: 'FS', title: '跨资产比价与利差', defaultW: 12, defaultH: 11, minW: 6, minH: 7 },
      percentile_barcode: { type: 'percentile_barcode', badge: 'PB', title: '全景资产分位数', defaultW: 12, defaultH: 12, minW: 6, minH: 7 },
      event_study: { type: 'event_study', badge: 'EF', title: '事件因子回测', defaultW: 12, defaultH: 12, minW: 7, minH: 8 },
      analog_finder: { type: 'analog_finder', badge: 'AN', title: '历史相似形态', defaultW: 12, defaultH: 11, minW: 6, minH: 7 },
      capital_flow: { type: 'capital_flow', badge: 'CF', title: '主力资金流向', defaultW: 12, defaultH: 11, minW: 6, minH: 7 },
      rotation_quadrant: { type: 'rotation_quadrant', badge: 'RQ', title: '板块轮动四象限', defaultW: 12, defaultH: 11, minW: 6, minH: 7 },
      chokepoint_watch: { type: 'chokepoint_watch', badge: 'CP', title: '全球航运咽喉监控', defaultW: 12, defaultH: 10, minW: 5, minH: 6 },
      divergence_radar: { type: 'divergence_radar', badge: 'DR', title: '跨市场背离雷达', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      macro_clock: { type: 'macro_clock', badge: 'MC', title: '美林时钟与流动性仪表', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      corr_matrix: { type: 'corr_matrix', badge: 'CM', title: '跨资产相关性矩阵', defaultW: 10, defaultH: 11, minW: 6, minH: 7 },
      risk_drawdown: { type: 'risk_drawdown', badge: 'RD', title: '波动率与最大回撤监控', defaultW: 10, defaultH: 10, minW: 5, minH: 6 },
      market_breadth: { type: 'market_breadth', badge: 'MB', title: '市场广度与赚钱效应', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      style_factor: { type: 'style_factor', badge: 'SF', title: '风格轮动雷达', defaultW: 10, defaultH: 10, minW: 5, minH: 6 },
      commodity_dashboard: { type: 'commodity_dashboard', badge: 'CD', title: '大宗商品与通胀链', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      rate_spread_watch: { type: 'rate_spread_watch', badge: 'RS', title: '利差与汇率压力计', defaultW: 8, defaultH: 9, minW: 5, minH: 6 },
      intel_catalyst: { type: 'intel_catalyst', badge: 'IC', title: '热点催化与多空脉搏', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      custom_echarts: { type: 'custom_echarts', badge: 'AI', title: '自定义图表', defaultW: 12, defaultH: 10, minW: 4, minH: 5 },
      sector_heatmap: { type: 'sector_heatmap', badge: 'H', title: '板块热力图', defaultW: 12, defaultH: 10, minW: 6, minH: 7 },
      macro_curve: { type: 'macro_curve', badge: 'Y', title: '宏观利率与汇率', defaultW: 12, defaultH: 10, minW: 6, minH: 7 },
      geo_odds: { type: 'geo_odds', badge: 'G', title: '地缘事件概率', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      connector_hub: { type: 'connector_hub', badge: 'A', title: '数据源状态', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      entity_pulse: { type: 'entity_pulse', badge: 'E', title: '实体关系网络', defaultW: 8, defaultH: 10, minW: 5, minH: 7 },
      sentiment_gauge: { type: 'sentiment_gauge', badge: 'S', title: '情绪温度计', defaultW: 8, defaultH: 10, minW: 5, minH: 7 },
      live_wire: { type: 'live_wire', badge: 'N', title: '实时快讯', defaultW: 16, defaultH: 11, minW: 7, minH: 6 },
      desk_note: { type: 'desk_note', badge: 'D', title: '情报简报', defaultW: 8, defaultH: 11, minW: 5, minH: 6 },
    }

    const FALLBACK_DASHBOARD_LAYOUT = {
      version: 2,
      cols: 24,
      locked: false,
      pulseWidth: 268,
      watchlistSplitWidth: 232,
      activeWorkspace: 'intel_overview',
      workspaces: [
        {
          id: 'intel_overview',
          name: '终端总览',
          widgets: [
            { id: 'w_watchlist_slot', type: 'watchlist_slot', title: '自选与 K 线', x: 0, y: 0, w: 16, h: 12, minW: 8, minH: 8, enabled: true, config: {} },
            { id: 'w_divergence_radar', type: 'divergence_radar', title: '跨市场背离雷达', x: 16, y: 0, w: 8, h: 12, minW: 5, minH: 6, enabled: true, config: {} },
            { id: 'w_sector_heatmap', type: 'sector_heatmap', title: '板块热力图', x: 0, y: 12, w: 12, h: 10, minW: 6, minH: 7, enabled: true, config: {} },
            { id: 'w_macro_curve', type: 'macro_curve', title: '宏观利率与汇率', x: 12, y: 12, w: 12, h: 10, minW: 6, minH: 7, enabled: true, config: {} },
            { id: 'w_live_wire', type: 'live_wire', title: '实时快讯', x: 0, y: 22, w: 16, h: 11, minW: 7, minH: 6, enabled: true, config: { limit: 24 } },
            { id: 'w_desk_note', type: 'desk_note', title: '情报简报', x: 16, y: 22, w: 8, h: 11, minW: 5, minH: 6, enabled: true, config: {} },
            { id: 'w_entity_pulse', type: 'entity_pulse', title: '实体关系网络', x: 0, y: 33, w: 8, h: 10, minW: 5, minH: 7, enabled: true, config: {} },
            { id: 'w_geo_odds', type: 'geo_odds', title: '地缘事件概率', x: 8, y: 33, w: 8, h: 10, minW: 5, minH: 6, enabled: true, config: {} },
            { id: 'w_connector_hub', type: 'connector_hub', title: '数据源状态', x: 16, y: 33, w: 8, h: 10, minW: 5, minH: 6, enabled: true, config: {} },
          ],
        },
      ],
    }

    const MARKET_WIDGET_REGISTRY = {
      panel_indices: { type: 'panel_indices', badge: 'I', title: '核心指数', panelId: 'indices', defaultW: 8, defaultH: 12, minW: 5, minH: 6 },
      panel_cn_logistics: { type: 'panel_cn_logistics', badge: 'A', title: 'A 股核心资产', panelId: 'cn_logistics', defaultW: 8, defaultH: 12, minW: 5, minH: 6 },
      panel_us_hk: { type: 'panel_us_hk', badge: 'U', title: '美港核心资产', panelId: 'us_hk', defaultW: 8, defaultH: 12, minW: 5, minH: 6 },
      panel_forex: { type: 'panel_forex', badge: 'F', title: '全球外汇', panelId: 'forex', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      panel_commodities: { type: 'panel_commodities', badge: 'C', title: '大宗商品', panelId: 'commodities', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      panel_etf_bonds: { type: 'panel_etf_bonds', badge: 'E', title: 'ETF 与债券', panelId: 'etf_bonds', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      panel_crypto: { type: 'panel_crypto', badge: 'B', title: '加密资产', panelId: 'crypto', defaultW: 12, defaultH: 10, minW: 5, minH: 6 },
      watchlist: { type: 'watchlist', badge: 'W', title: '自选标的', defaultW: 8, defaultH: 12, minW: 5, minH: 6 },
      kline_main: { type: 'kline_main', badge: 'K', title: 'K 线主图', defaultW: 16, defaultH: 14, minW: 8, minH: 8 },
      sector_heatmap: { type: 'sector_heatmap', badge: 'H', title: '板块热力图', defaultW: 12, defaultH: 10, minW: 6, minH: 7 },
      macro_curve: { type: 'macro_curve', badge: 'Y', title: '宏观利率与汇率', defaultW: 12, defaultH: 10, minW: 6, minH: 7 },
      geo_odds: { type: 'geo_odds', badge: 'G', title: '地缘事件概率', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      live_wire: { type: 'live_wire', badge: 'N', title: '实时快讯', defaultW: 16, defaultH: 11, minW: 7, minH: 6 },
      movers_gainers: { type: 'movers_gainers', badge: '▲', title: '领涨异动', defaultW: 8, defaultH: 11, minW: 5, minH: 6 },
      movers_losers: { type: 'movers_losers', badge: '▼', title: '领跌异动', defaultW: 8, defaultH: 11, minW: 5, minH: 6 },
      movers_active: { type: 'movers_active', badge: '⚡', title: '成交活跃', defaultW: 8, defaultH: 11, minW: 5, minH: 6 },
      pro_kline: { type: 'pro_kline', badge: 'PK', title: '多指标共振 K 线', defaultW: 16, defaultH: 14, minW: 8, minH: 9 },
      rebased_compare: { type: 'rebased_compare', badge: 'RB', title: '多标的相对收益', defaultW: 12, defaultH: 11, minW: 6, minH: 7 },
      formula_spread: { type: 'formula_spread', badge: 'FS', title: '跨资产比价与利差', defaultW: 12, defaultH: 11, minW: 6, minH: 7 },
      percentile_barcode: { type: 'percentile_barcode', badge: 'PB', title: '全景资产分位数', defaultW: 12, defaultH: 12, minW: 6, minH: 7 },
      event_study: { type: 'event_study', badge: 'EF', title: '事件因子回测', defaultW: 12, defaultH: 12, minW: 7, minH: 8 },
      analog_finder: { type: 'analog_finder', badge: 'AN', title: '历史相似形态', defaultW: 12, defaultH: 11, minW: 6, minH: 7 },
      capital_flow: { type: 'capital_flow', badge: 'CF', title: '主力资金流向', defaultW: 12, defaultH: 11, minW: 6, minH: 7 },
      rotation_quadrant: { type: 'rotation_quadrant', badge: 'RQ', title: '板块轮动四象限', defaultW: 12, defaultH: 11, minW: 6, minH: 7 },
      chokepoint_watch: { type: 'chokepoint_watch', badge: 'CP', title: '全球航运咽喉监控', defaultW: 12, defaultH: 10, minW: 5, minH: 6 },
      divergence_radar: { type: 'divergence_radar', badge: 'DR', title: '跨市场背离雷达', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      macro_clock: { type: 'macro_clock', badge: 'MC', title: '美林时钟与流动性仪表', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      corr_matrix: { type: 'corr_matrix', badge: 'CM', title: '跨资产相关性矩阵', defaultW: 10, defaultH: 11, minW: 6, minH: 7 },
      risk_drawdown: { type: 'risk_drawdown', badge: 'RD', title: '波动率与最大回撤监控', defaultW: 10, defaultH: 10, minW: 5, minH: 6 },
      market_breadth: { type: 'market_breadth', badge: 'MB', title: '市场广度与赚钱效应', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      style_factor: { type: 'style_factor', badge: 'SF', title: '风格轮动雷达', defaultW: 10, defaultH: 10, minW: 5, minH: 6 },
      commodity_dashboard: { type: 'commodity_dashboard', badge: 'CD', title: '大宗商品与通胀链', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      rate_spread_watch: { type: 'rate_spread_watch', badge: 'RS', title: '利差与汇率压力计', defaultW: 8, defaultH: 9, minW: 5, minH: 6 },
      intel_catalyst: { type: 'intel_catalyst', badge: 'IC', title: '热点催化与多空脉搏', defaultW: 8, defaultH: 10, minW: 5, minH: 6 },
      custom_echarts: { type: 'custom_echarts', badge: 'AI', title: '自定义图表', defaultW: 12, defaultH: 10, minW: 4, minH: 5 },
    }

    const FALLBACK_MARKET_LAYOUT = {
      version: 2,
      cols: 24,
      locked: false,
      detailWidth: 380,
      detailChartHeight: 280,
      activeWorkspace: 'mkt_overview',
      workspaces: [
        {
          id: 'mkt_overview',
          name: '多市场网格',
          widgets: [
            { id: 'mw_indices', type: 'panel_indices', title: '核心指数', x: 0, y: 0, w: 8, h: 12, minW: 5, minH: 6, enabled: true, config: { panelId: 'indices' } },
            { id: 'mw_cn_logistics', type: 'panel_cn_logistics', title: 'A 股核心资产', x: 8, y: 0, w: 8, h: 12, minW: 5, minH: 6, enabled: true, config: { panelId: 'cn_logistics' } },
            { id: 'mw_us_hk', type: 'panel_us_hk', title: '美港核心资产', x: 16, y: 0, w: 8, h: 12, minW: 5, minH: 6, enabled: true, config: { panelId: 'us_hk' } },
            { id: 'mw_forex', type: 'panel_forex', title: '全球外汇', x: 0, y: 12, w: 8, h: 10, minW: 5, minH: 6, enabled: true, config: { panelId: 'forex' } },
            { id: 'mw_commodities', type: 'panel_commodities', title: '大宗商品', x: 8, y: 12, w: 8, h: 10, minW: 5, minH: 6, enabled: true, config: { panelId: 'commodities' } },
            { id: 'mw_etf_bonds', type: 'panel_etf_bonds', title: 'ETF 与债券', x: 16, y: 12, w: 8, h: 10, minW: 5, minH: 6, enabled: true, config: { panelId: 'etf_bonds' } },
            { id: 'mw_crypto', type: 'panel_crypto', title: '加密资产', x: 0, y: 22, w: 12, h: 10, minW: 5, minH: 6, enabled: true, config: { panelId: 'crypto' } },
            { id: 'mw_heatmap', type: 'sector_heatmap', title: '板块热力图', x: 12, y: 22, w: 12, h: 10, minW: 6, minH: 7, enabled: true, config: {} },
          ],
        },
        {
          id: 'mkt_heatmap',
          name: '热力图与异动',
          widgets: [
            { id: 'mw_hm_full', type: 'sector_heatmap', title: '板块热力图', x: 0, y: 0, w: 24, h: 13, minW: 6, minH: 7, enabled: true, config: {} },
            { id: 'mw_mv_gain', type: 'movers_gainers', title: '领涨异动', x: 0, y: 13, w: 8, h: 11, minW: 5, minH: 6, enabled: true, config: {} },
            { id: 'mw_mv_lose', type: 'movers_losers', title: '领跌异动', x: 8, y: 13, w: 8, h: 11, minW: 5, minH: 6, enabled: true, config: {} },
            { id: 'mw_mv_act', type: 'movers_active', title: '成交活跃', x: 16, y: 13, w: 8, h: 11, minW: 5, minH: 6, enabled: true, config: {} },
          ],
        },
        {
          id: 'mkt_kline_desk',
          name: 'K 线研判台',
          widgets: [
            { id: 'mw_kline_main', type: 'kline_main', title: 'K 线主图', x: 0, y: 0, w: 16, h: 14, minW: 8, minH: 8, enabled: true, config: {} },
            { id: 'mw_watchlist', type: 'watchlist', title: '自选标的', x: 16, y: 0, w: 8, h: 14, minW: 5, minH: 6, enabled: true, config: {} },
            { id: 'mw_cn_log_2', type: 'panel_cn_logistics', title: 'A 股核心资产', x: 0, y: 14, w: 12, h: 10, minW: 5, minH: 6, enabled: true, config: { panelId: 'cn_logistics' } },
            { id: 'mw_indices_2', type: 'panel_indices', title: '核心指数', x: 12, y: 14, w: 12, h: 10, minW: 5, minH: 6, enabled: true, config: { panelId: 'indices' } },
          ],
        },
      ],
    }

    function normalizeFreeGridLayout(raw, fallback, registry) {
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.workspaces) || !raw.workspaces.length) {
        return JSON.parse(JSON.stringify(fallback))
      }
      const out = JSON.parse(JSON.stringify(raw))
      out.version = 2
      out.cols = 24
      if (typeof out.locked !== 'boolean') out.locked = false
      for (const ws of out.workspaces) {
        const list = (Array.isArray(ws.widgets) ? ws.widgets : []).filter((it) => it && it.type !== 'backtest_slot')
        ws.widgets = list
        let curX = 0, curY = 0, rowH = 0
        for (const it of list) {
          const meta = registry[it.type] || {}
          if (it.title && LEGACY_EN_TITLE_MAP[it.title]) {
            it.title = LEGACY_EN_TITLE_MAP[it.title]
          }
          it.minW = it.type === 'custom_echarts' ? 4 : (Number(it.minW) || meta.minW || 5)
          it.minH = it.type === 'custom_echarts' ? 5 : (Number(it.minH) || meta.minH || 6)
          if (typeof it.x !== 'number' || typeof it.y !== 'number' || typeof it.w !== 'number' || typeof it.h !== 'number') {
            const span12 = Number(it.colSpan) || 0
            const gw = span12 ? Math.max(it.minW, Math.min(24, span12 * 2)) : (meta.defaultW || 12)
            const gh = Number(it.h) || meta.defaultH || 10
            if (curX + gw > 24) {
              curX = 0
              curY += rowH
              rowH = 0
            }
            it.x = curX
            it.y = curY
            it.w = gw
            it.h = Math.max(it.minH, gh)
            curX += gw
            rowH = Math.max(rowH, it.h)
          } else {
            it.w = Math.max(it.minW, Math.min(24, Math.round(it.w)))
            it.h = Math.max(it.minH, Math.round(it.h))
            it.x = Math.max(0, Math.min(24 - it.w, Math.round(it.x)))
            it.y = Math.max(0, Math.round(it.y))
          }
        }
      }
      return out
    }

    function compactWorkspaceWidgets(ws) {
      if (!ws || !Array.isArray(ws.widgets)) return
      const active = ws.widgets.filter((w) => w.enabled !== false)
      const sorted = active.slice().sort((a, b) => ((a.y || 0) - (b.y || 0)) || ((a.x || 0) - (b.x || 0)))
      const hits = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
      for (const it of sorted) {
        while (it.y > 0) {
          it.y -= 1
          if (sorted.some((o) => o.id !== it.id && hits(it, o))) {
            it.y += 1
            break
          }
        }
      }
    }

    function resolveWidgetOverlap(ws, changed) {
      if (!ws || !Array.isArray(ws.widgets) || !changed) return
      const active = ws.widgets.filter((w) => w.enabled !== false)
      const hits = (a, b) => a.id !== b.id && !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
      const queue = [changed]
      let iter = 0
      while (queue.length && iter++ < 120) {
        const cur = queue.shift()
        for (const other of active) {
          if (hits(cur, other)) {
            other.y = (cur.y || 0) + (cur.h || 8)
            queue.push(other)
          }
        }
      }
      compactWorkspaceWidgets(ws)
    }

    const dashboardLayout = ref(JSON.parse(JSON.stringify(FALLBACK_DASHBOARD_LAYOUT)))
    const dashCustomizeOpen = ref(false)
    const dashCompact = ref(false)
    const dashPulseOpen = ref(true)
    const dashTickerMode = ref('mkt')
    const dashMaximizedId = ref('')
    const editingWsKey = ref('')
    const editingWsName = ref('')
    let dashSaveTimer = 0

    function startWsRename(scope, ws) {
      if (!ws) return
      editingWsKey.value = scope + ':' + ws.id
      editingWsName.value = ws.name || ''
      nextTick(() => {
        const inp = document.querySelector('.ws-tab-input')
        if (inp) { inp.focus(); inp.select() }
      })
    }
    function cancelWsRename() {
      editingWsKey.value = ''
      editingWsName.value = ''
    }
    function commitWsRename(scope, ws) {
      if (editingWsKey.value !== scope + ':' + ws.id) return
      const next = (editingWsName.value || '').trim()
      editingWsKey.value = ''
      editingWsName.value = ''
      if (!next || next === ws.name) return
      ws.name = next
      if (scope === 'dash') saveDashboardLayout()
      else saveMarketLayout()
    }
    function deleteDashboardWorkspaceById(wsId) {
      const list = (dashboardLayout.value && dashboardLayout.value.workspaces) || []
      if (list.length <= 1) return
      const next = list.filter((w) => w.id !== wsId)
      dashboardLayout.value.workspaces = next
      if (dashboardLayout.value.activeWorkspace === wsId) {
        dashboardLayout.value.activeWorkspace = next[0].id
      }
      dashMaximizedId.value = ''
      saveDashboardLayout()
      message.success('已删除看板工作区')
    }
    function deleteMarketWorkspaceById(wsId) {
      const list = (marketLayout.value && marketLayout.value.workspaces) || []
      if (list.length <= 1) return
      const next = list.filter((w) => w.id !== wsId)
      marketLayout.value.workspaces = next
      if (marketLayout.value.activeWorkspace === wsId) {
        marketLayout.value.activeWorkspace = next[0].id
      }
      mktMaximizedId.value = ''
      saveMarketLayout()
      message.success('已删除行情工作区')
    }
    function removeDashboardWidget(wid) {
      const ws = activeWorkspaceObj.value
      if (!ws || !Array.isArray(ws.widgets)) return
      ws.widgets = ws.widgets.filter((w) => w.id !== wid)
      if (dashMaximizedId.value === wid) dashMaximizedId.value = ''
      compactWorkspaceWidgets(ws)
      saveDashboardLayout()
    }
    function removeMarketWidget(wid) {
      const ws = activeMarketWorkspaceObj.value
      if (!ws || !Array.isArray(ws.widgets)) return
      ws.widgets = ws.widgets.filter((w) => w.id !== wid)
      if (mktMaximizedId.value === wid) mktMaximizedId.value = ''
      compactWorkspaceWidgets(ws)
      saveMarketLayout()
    }

    const dashPulseWidth = computed({
      get: () => Number(dashboardLayout.value && dashboardLayout.value.pulseWidth) || 268,
      set: (v) => { if (dashboardLayout.value) dashboardLayout.value.pulseWidth = Math.round(v) },
    })
    const dashWatchlistWidth = computed({
      get: () => Number(dashboardLayout.value && dashboardLayout.value.watchlistSplitWidth) || 232,
      set: (v) => { if (dashboardLayout.value) dashboardLayout.value.watchlistSplitWidth = Math.round(v) },
    })

    const activeWorkspaceObj = computed(() => {
      const wsList = (dashboardLayout.value && dashboardLayout.value.workspaces) || []
      return wsList.find((w) => w.id === dashboardLayout.value.activeWorkspace) || wsList[0] || null
    })
    const activeDashboardWidgets = computed(() => {
      const ws = activeWorkspaceObj.value
      return ws && Array.isArray(ws.widgets) ? ws.widgets.filter((w) => w.enabled !== false) : []
    })
    const missingDashboardWidgets = computed(() => {
      const ws = activeWorkspaceObj.value
      const have = new Set(((ws && ws.widgets) || []).map((w) => w.type))
      return Object.values(DASHBOARD_WIDGET_REGISTRY).filter((r) => !have.has(r.type))
    })
    const readyConnectorCount = computed(() => (
      (cfg.api_connectors || []).filter((c) => c.auth_type === 'none' || c.api_key_set || c.api_secret_set).length
    ))

    function widgetMeta(type) {
      return DASHBOARD_WIDGET_REGISTRY[type] || null
    }
    function addDashboardWidget(type) {
      const ws = activeWorkspaceObj.value
      const meta = DASHBOARD_WIDGET_REGISTRY[type]
      if (!ws || !meta) return
      const maxY = (ws.widgets || []).reduce((m, it) => Math.max(m, (Number(it.y) || 0) + (Number(it.h) || 8)), 0)
      ws.widgets = [...(ws.widgets || []), {
        id: 'w_' + type + '_' + Date.now().toString(36),
        type,
        title: meta.title,
        x: 0,
        y: maxY,
        w: meta.defaultW || 12,
        h: meta.defaultH || 10,
        minW: meta.minW || 5,
        minH: meta.minH || 6,
        enabled: true,
        config: {},
      }]
      saveDashboardLayout()
    }
    async function loadDashboardLayout() {
      try {
        const res = await api.get('/api/dashboard/layout')
        if (res && res.ok && res.layout && Array.isArray(res.layout.workspaces)) {
          dashboardLayout.value = normalizeFreeGridLayout(res.layout, FALLBACK_DASHBOARD_LAYOUT, DASHBOARD_WIDGET_REGISTRY)
        }
      } catch (e) { /* ignore */ }
    }
    async function saveDashboardLayout() {
      try {
        await api.post('/api/dashboard/layout', { layout: dashboardLayout.value })
      } catch (e) { /* ignore */ }
    }
    function saveDashboardLayoutDebounced() {
      clearTimeout(dashSaveTimer)
      dashSaveTimer = setTimeout(saveDashboardLayout, 280)
    }
    function switchDashboardWorkspace(wsId) {
      if (!dashboardLayout.value) return
      dashMaximizedId.value = ''
      dashboardLayout.value.activeWorkspace = wsId
      saveDashboardLayout()
    }
    function toggleDashboardLock() {
      if (!dashboardLayout.value) return
      dashboardLayout.value.locked = !dashboardLayout.value.locked
      saveDashboardLayout()
    }
    function createDashboardWorkspace() {
      if (!dashboardLayout.value) return
      const idx = (dashboardLayout.value.workspaces || []).length + 1
      const id = 'ws_' + Date.now().toString(36)
      const ws = {
        id,
        name: '工作区 ' + idx,
        widgets: [
          { id: 'w_wl_' + id, type: 'watchlist_slot', title: '自选与 K 线', x: 0, y: 0, w: 16, h: 12, minW: 8, minH: 8, enabled: true, config: {} },
          { id: 'w_lw_' + id, type: 'live_wire', title: '实时快讯', x: 16, y: 0, w: 8, h: 12, minW: 7, minH: 6, enabled: true, config: { limit: 24 } },
        ],
      }
      dashboardLayout.value.workspaces.push(ws)
      dashboardLayout.value.activeWorkspace = id
      dashMaximizedId.value = ''
      saveDashboardLayout()
      message.success('已新建看板工作区')
    }
    function duplicateDashboardWorkspace() {
      const cur = activeWorkspaceObj.value
      if (!cur || !dashboardLayout.value) return
      const id = 'ws_' + Date.now().toString(36)
      const copy = JSON.parse(JSON.stringify(cur))
      copy.id = id
      copy.name = (cur.name || '工作区') + ' 副本'
      copy.widgets = (copy.widgets || []).map((w, i) => ({ ...w, id: w.id + '_' + i + '_' + Date.now().toString(36) }))
      dashboardLayout.value.workspaces.push(copy)
      dashboardLayout.value.activeWorkspace = id
      dashMaximizedId.value = ''
      saveDashboardLayout()
      message.success('已复制当前工作区')
    }
    function deleteDashboardWorkspace() {
      const list = (dashboardLayout.value && dashboardLayout.value.workspaces) || []
      if (list.length <= 1) return
      const curId = dashboardLayout.value.activeWorkspace
      const next = list.filter((w) => w.id !== curId)
      dashboardLayout.value.workspaces = next
      dashboardLayout.value.activeWorkspace = next[0].id
      dashMaximizedId.value = ''
      saveDashboardLayout()
      message.success('已删除工作区')
    }
    function moveDashboardWidget(idx, delta) {
      const ws = activeWorkspaceObj.value
      if (!ws || !Array.isArray(ws.widgets)) return
      const target = idx + delta
      if (target < 0 || target >= ws.widgets.length) return
      const arr = ws.widgets.slice()
      const [moved] = arr.splice(idx, 1)
      arr.splice(target, 0, moved)
      ws.widgets = arr
      saveDashboardLayout()
    }
    async function resetDashboardLayout() {
      try {
        const res = await api.post('/api/dashboard/layout', { reset: true })
        if (res && res.ok && res.layout) {
          dashboardLayout.value = normalizeFreeGridLayout(res.layout, FALLBACK_DASHBOARD_LAYOUT, DASHBOARD_WIDGET_REGISTRY)
          dashMaximizedId.value = ''
          message.success('已恢复默认看板布局')
        }
      } catch (e) {
        message.error(String(e))
      }
    }

    // ============== 行情终端 24 列自由工作台状态 ==============
    const marketLayout = ref(JSON.parse(JSON.stringify(FALLBACK_MARKET_LAYOUT)))
    const mktCustomizeOpen = ref(false)
    const mktCompact = ref(false)
    const mktMaximizedId = ref('')
    let mktSaveTimer = 0

    const mktDetailWidth = computed({
      get: () => Number(marketLayout.value && marketLayout.value.detailWidth) || 380,
      set: (v) => { if (marketLayout.value) marketLayout.value.detailWidth = Math.round(v) },
    })
    const mktDetailChartHeight = computed({
      get: () => Number(marketLayout.value && marketLayout.value.detailChartHeight) || 280,
      set: (v) => { if (marketLayout.value) marketLayout.value.detailChartHeight = Math.round(v) },
    })
    const activeMarketWorkspaceObj = computed(() => {
      const wsList = (marketLayout.value && marketLayout.value.workspaces) || []
      return wsList.find((w) => w.id === marketLayout.value.activeWorkspace) || wsList[0] || null
    })
    const activeMarketWidgets = computed(() => {
      const ws = activeMarketWorkspaceObj.value
      return ws && Array.isArray(ws.widgets) ? ws.widgets.filter((w) => w.enabled !== false) : []
    })
    const missingMarketWidgets = computed(() => {
      const ws = activeMarketWorkspaceObj.value
      const have = new Set(((ws && ws.widgets) || []).map((w) => w.type))
      return Object.values(MARKET_WIDGET_REGISTRY).filter((r) => !have.has(r.type))
    })

    function mktWidgetMeta(type) {
      return MARKET_WIDGET_REGISTRY[type] || null
    }
    function marketPanelItems(w) {
      const pid = (w && w.config && w.config.panelId) || String((w && w.type) || '').replace(/^panel_/, '')
      const p = (marketOverview.panels || []).find((x) => x.id === pid)
      const base = ((p && p.items) || []).slice()
      const extras = (w && w.config && Array.isArray(w.config.extraSymbols)) ? w.config.extraSymbols : []
      if (!extras.length) return base
      const seen = new Set(base.map((x) => x.secid))
      const wlMap = Object.fromEntries((marketOverview.watchlist || []).map((x) => [x.secid, x]))
      const allMap = {}
      for (const pn of (marketOverview.panels || [])) {
        for (const it of (pn.items || [])) allMap[it.secid] = it
      }
      for (const ex of extras) {
        if (!ex || !ex.secid || seen.has(ex.secid)) continue
        seen.add(ex.secid)
        base.push(wlMap[ex.secid] || allMap[ex.secid] || { secid: ex.secid, symbol: ex.symbol || ex.secid, name: ex.name || ex.secid })
      }
      return base
    }
    function marketMoverItems(type) {
      if (type === 'movers_gainers') return marketMovers.gainers || []
      if (type === 'movers_losers') return marketMovers.losers || []
      return marketMovers.active || []
    }
    function addMarketWidget(type) {
      const ws = activeMarketWorkspaceObj.value
      const meta = MARKET_WIDGET_REGISTRY[type]
      if (!ws || !meta) return
      const maxY = (ws.widgets || []).reduce((m, it) => Math.max(m, (Number(it.y) || 0) + (Number(it.h) || 8)), 0)
      ws.widgets = [...(ws.widgets || []), {
        id: 'mw_' + type + '_' + Date.now().toString(36),
        type,
        title: meta.title,
        x: 0,
        y: maxY,
        w: meta.defaultW || 8,
        h: meta.defaultH || 10,
        minW: meta.minW || 5,
        minH: meta.minH || 6,
        enabled: true,
        config: meta.panelId ? { panelId: meta.panelId } : {},
      }]
      if (type === 'sector_heatmap') loadMarketSectors(false)
      if (type.startsWith('movers_')) loadMarketMovers(false)
      if (type === 'kline_main' && !mktKlineData.value) loadMarketKline(mktSelectedSecid.value, false)
      saveMarketLayout()
    }
    async function loadMarketLayout() {
      try {
        const res = await api.get('/api/market/layout')
        if (res && res.ok && res.layout && Array.isArray(res.layout.workspaces)) {
          marketLayout.value = normalizeFreeGridLayout(res.layout, FALLBACK_MARKET_LAYOUT, MARKET_WIDGET_REGISTRY)
        }
      } catch (e) { /* ignore */ }
    }
    async function saveMarketLayout() {
      try {
        await api.post('/api/market/layout', { layout: marketLayout.value })
      } catch (e) { /* ignore */ }
    }
    function saveMarketLayoutDebounced() {
      clearTimeout(mktSaveTimer)
      mktSaveTimer = setTimeout(saveMarketLayout, 280)
    }
    function switchMarketWorkspace(wsId) {
      if (!marketLayout.value) return
      const exists = (marketLayout.value.workspaces || []).some((w) => w.id === wsId)
      if (!exists) return
      mktMaximizedId.value = ''
      marketLayout.value.activeWorkspace = wsId
      const ws = activeMarketWorkspaceObj.value
      if (ws && Array.isArray(ws.widgets)) {
        if (ws.widgets.some((w) => w.type === 'sector_heatmap' && w.enabled !== false)) loadMarketSectors(false)
        if (ws.widgets.some((w) => w.type === 'macro_curve' && w.enabled !== false)) loadMacroData(false)
        if (ws.widgets.some((w) => w.type === 'geo_odds' && w.enabled !== false)) loadGeoData(false)
        if (ws.widgets.some((w) => w.type === 'live_wire' && w.enabled !== false) && !newsItems.value.length) loadNewsItems(true)
        if (ws.widgets.some((w) => String(w.type).startsWith('movers_') && w.enabled !== false)) loadMarketMovers(false)
        if (ws.widgets.some((w) => w.type === 'kline_main' && w.enabled !== false) && !mktKlineData.value) loadMarketKline(mktSelectedSecid.value, false)
      }
      saveMarketLayout()
    }
    function toggleMarketLock() {
      if (!marketLayout.value) return
      marketLayout.value.locked = !marketLayout.value.locked
      saveMarketLayout()
    }
    function createMarketWorkspace() {
      if (!marketLayout.value) return
      const idx = (marketLayout.value.workspaces || []).length + 1
      const id = 'mws_' + Date.now().toString(36)
      const ws = {
        id,
        name: '行情区 ' + idx,
        widgets: [
          { id: 'mw_kl_' + id, type: 'kline_main', title: 'K 线主图', x: 0, y: 0, w: 16, h: 13, minW: 8, minH: 8, enabled: true, config: {} },
          { id: 'mw_wl_' + id, type: 'watchlist', title: '自选标的', x: 16, y: 0, w: 8, h: 13, minW: 5, minH: 6, enabled: true, config: {} },
        ],
      }
      marketLayout.value.workspaces.push(ws)
      marketLayout.value.activeWorkspace = id
      mktMaximizedId.value = ''
      if (!mktKlineData.value) loadMarketKline(mktSelectedSecid.value, false)
      saveMarketLayout()
      message.success('已新建行情工作区')
    }
    function duplicateMarketWorkspace() {
      const cur = activeMarketWorkspaceObj.value
      if (!cur || !marketLayout.value) return
      const id = 'mws_' + Date.now().toString(36)
      const copy = JSON.parse(JSON.stringify(cur))
      copy.id = id
      copy.name = (cur.name || '行情区') + ' 副本'
      copy.widgets = (copy.widgets || []).map((w, i) => ({ ...w, id: w.id + '_' + i + '_' + Date.now().toString(36) }))
      marketLayout.value.workspaces.push(copy)
      marketLayout.value.activeWorkspace = id
      mktMaximizedId.value = ''
      saveMarketLayout()
      message.success('已复制当前行情工作区')
    }
    function deleteMarketWorkspace() {
      const list = (marketLayout.value && marketLayout.value.workspaces) || []
      if (list.length <= 1) return
      const curId = marketLayout.value.activeWorkspace
      const next = list.filter((w) => w.id !== curId)
      marketLayout.value.workspaces = next
      marketLayout.value.activeWorkspace = next[0].id
      mktMaximizedId.value = ''
      saveMarketLayout()
      message.success('已删除行情工作区')
    }
    async function resetMarketLayout() {
      try {
        const res = await api.post('/api/market/layout', { reset: true })
        if (res && res.ok && res.layout) {
          marketLayout.value = normalizeFreeGridLayout(res.layout, FALLBACK_MARKET_LAYOUT, MARKET_WIDGET_REGISTRY)
          mktMaximizedId.value = ''
          message.success('已恢复默认行情布局')
        }
      } catch (e) {
        message.error(String(e))
      }
    }

    // ============== 右上角『+ 模块库』、自定义工坊与对话内嵌可视化动作 ==============
    const customWidgets = ref([])
    const widgetGalleryOpen = ref(false)
    const widgetGalleryScope = ref('dashboard')

    async function loadCustomWidgets() {
      try {
        const res = await api.get('/api/widgets')
        if (res && res.ok && Array.isArray(res.items)) {
          customWidgets.value = res.items
        }
      } catch (e) { /* ignore */ }
    }

    function openWidgetGallery(scope) {
      widgetGalleryScope.value = scope || (tab.value === 'markets' ? 'markets' : 'dashboard')
      ensureMarketBoot()
      loadCustomWidgets()
      widgetGalleryOpen.value = true
    }

    function appendWidgetToScope(scope, entry) {
      const isMkt = scope === 'markets'
      const ws = isMkt ? activeMarketWorkspaceObj.value : activeWorkspaceObj.value
      if (!ws) return
      const maxY = (ws.widgets || []).reduce((m, it) => Math.max(m, (Number(it.y) || 0) + (Number(it.h) || 8)), 0)
      ws.widgets = [...(ws.widgets || []), {
        id: (isMkt ? 'mw_' : 'w_') + entry.type + '_' + Date.now().toString(36),
        type: entry.type,
        title: entry.title,
        x: 0,
        y: maxY,
        w: entry.defaultW || 12,
        h: entry.defaultH || 10,
        minW: entry.minW || 6,
        minH: entry.minH || 6,
        enabled: true,
        config: entry.config || {},
      }]
      if (isMkt) saveMarketLayout()
      else saveDashboardLayout()
    }

    function onAddBuiltinFromGallery(meta) {
      if (!meta) return
      const scope = widgetGalleryScope.value
      const regMeta = scope === 'markets' ? MARKET_WIDGET_REGISTRY[meta.type] : DASHBOARD_WIDGET_REGISTRY[meta.type]
      appendWidgetToScope(scope, {
        type: meta.type,
        title: meta.title,
        defaultW: meta.defaultW,
        defaultH: meta.defaultH,
        minW: meta.minW,
        minH: meta.minH,
        config: (regMeta && regMeta.panelId) ? { panelId: regMeta.panelId } : {},
      })
      if (meta.type === 'sector_heatmap' || meta.type === 'market_breadth') loadMarketSectors(false)
      if (meta.type === 'macro_curve' || meta.type === 'rate_spread_watch') loadMacroData(false)
      if (meta.type === 'geo_odds' || meta.type === 'chokepoint_watch' || meta.type === 'commodity_dashboard') loadGeoData(false)
      if ((meta.type === 'live_wire' || meta.type === 'intel_catalyst') && !newsItems.value.length) loadNewsItems(true)
      if (String(meta.type).startsWith('movers_') || meta.type === 'market_breadth') loadMarketMovers(false)
      if (meta.type === 'kline_main' && !mktKlineData.value) loadMarketKline(mktSelectedSecid.value, false)
      widgetGalleryOpen.value = false
      message.success(`已添加「${meta.title}」到当前工作区`)
    }

    function onUpdateWidgetConfig(scope, widgetId, patch) {
      if (!widgetId || !patch || typeof patch !== 'object') return
      const ws = scope === 'markets' ? activeMarketWorkspaceObj.value : activeWorkspaceObj.value
      if (!ws || !Array.isArray(ws.widgets)) return
      const target = ws.widgets.find((x) => x.id === widgetId)
      if (!target) return
      target.config = { ...(target.config || {}), ...patch }
      if (scope === 'markets') saveMarketLayoutDebounced()
      else saveDashboardLayoutDebounced()
    }

    const widgetCfgOpen = ref(false)
    const widgetCfgScope = ref('dashboard')
    const widgetCfgId = ref('')
    const widgetCfgTarget = computed(() => {
      if (!widgetCfgId.value) return null
      const ws = widgetCfgScope.value === 'markets' ? activeMarketWorkspaceObj.value : activeWorkspaceObj.value
      return (ws && Array.isArray(ws.widgets) ? ws.widgets.find((x) => x.id === widgetCfgId.value) : null) || null
    })
    function openWidgetConfig(scope, w) {
      if (!w || !w.id) return
      widgetCfgScope.value = scope || 'dashboard'
      widgetCfgId.value = w.id
      widgetCfgOpen.value = true
    }
    function onPatchWidgetFromDrawer(patch) {
      const target = widgetCfgTarget.value
      if (!target || !patch) return
      if (patch.title !== undefined) target.title = patch.title
      if (patch.config && typeof patch.config === 'object') {
        target.config = { ...(target.config || {}), ...patch.config }
      }
      if (widgetCfgScope.value === 'markets') saveMarketLayoutDebounced()
      else saveDashboardLayoutDebounced()
    }
    async function onSaveWidgetAsCustom(w) {
      if (!w) return
      const isEcharts = w.type === 'custom_echarts'
      try {
        const res = await api.post('/api/widgets/save', {
          title: w.title || '自定义模块',
          description: '从当前工作区保存的自定义模块配置',
          category: 'custom',
          renderer: isEcharts ? 'echarts' : w.type,
          spec: isEcharts
            ? { option: (w.config && w.config.option) || {} }
            : { widgetType: w.type, config: { ...(w.config || {}) } },
          defaultW: w.w || 12,
          defaultH: w.h || 10,
        })
        if (res && res.ok) {
          await loadCustomWidgets()
          message.success(`已将「${w.title}」存入模块库`)
        }
      } catch (e) {
        message.error(String(e))
      }
    }

    function onAddCustomFromGallery(cw) {
      if (!cw) return
      const isEcharts = cw.renderer === 'echarts'
      const bType = isEcharts ? 'custom_echarts' : ((cw.spec && cw.spec.widgetType) || cw.renderer || 'pro_kline')
      const bCfg = isEcharts
        ? { customWidgetId: cw.id, description: cw.description || '', option: cw.spec && cw.spec.option }
        : { ...((cw.spec && cw.spec.config) || {}), customWidgetId: cw.id }
      appendWidgetToScope(widgetGalleryScope.value, {
        type: bType,
        title: cw.title,
        defaultW: cw.defaultW || 12,
        defaultH: cw.defaultH || 10,
        minW: isEcharts ? 4 : 5,
        minH: isEcharts ? 5 : 6,
        config: bCfg,
      })
      widgetGalleryOpen.value = false
      message.success(`已添加「${cw.title}」到当前工作区`)
    }

    async function onSaveCustomFromStudio({ payload, alsoAdd }) {
      try {
        const res = await api.post('/api/widgets/save', payload)
        if (res && res.ok && res.item) {
          await loadCustomWidgets()
          if (alsoAdd) {
            onAddCustomFromGallery(res.item)
          } else {
            message.success(`已保存「${res.item.title}」到模块库`)
          }
        }
      } catch (e) {
        message.error(String(e))
      }
    }

    async function onDeleteCustomWidget(id) {
      try {
        const res = await api.post('/api/widgets/delete', { id })
        if (res && res.ok) {
          customWidgets.value = customWidgets.value.filter((x) => x.id !== id)
          message.success('已从模块库移除')
        }
      } catch (e) {
        message.error(String(e))
      }
    }

    async function onUpdateCustomThumb({ id, thumbnail }) {
      const target = customWidgets.value.find((x) => x.id === id)
      if (!target || !thumbnail) return
      target.thumbnail = thumbnail
      try {
        await api.post('/api/widgets/save', { ...target, thumbnail })
      } catch (e) { /* ignore */ }
    }

    async function onSaveVisualToLibrary({ visual, thumbnail }) {
      if (!visual) return
      try {
        const res = await api.post('/api/widgets/save', {
          id: visual.savedWidgetId || '',
          title: visual.title || 'AI 图表模块',
          description: visual.description || '由 AI 问答生成的交互式可视化模块',
          category: visual.category || 'ai',
          renderer: visual.mode === 'cite_widget' ? visual.widget_type : 'echarts',
          spec: visual.mode === 'cite_widget'
            ? { widgetType: visual.widget_type, config: visual.config || {} }
            : { option: visual.option },
          thumbnail: thumbnail || '',
          defaultW: 12,
          defaultH: 10,
        })
        if (res && res.ok && res.item) {
          visual.savedWidgetId = res.item.id
          await loadCustomWidgets()
          message.success(`已存入模块库：「${res.item.title}」`)
        }
      } catch (e) {
        message.error(String(e))
      }
    }

    async function onPinVisualToDashboard({ visual, thumbnail }) {
      if (!visual) return
      let savedId = visual.savedWidgetId || ''
      if (visual.mode === 'echarts') {
        try {
          const res = await api.post('/api/widgets/save', {
            id: savedId,
            title: visual.title || 'AI 图表模块',
            description: visual.description || '由 AI 问答生成的交互式可视化模块',
            category: visual.category || 'ai',
            renderer: 'echarts',
            spec: { option: visual.option },
            thumbnail: thumbnail || '',
            defaultW: 12,
            defaultH: 10,
          })
          if (res && res.ok && res.item) {
            savedId = res.item.id
            visual.savedWidgetId = savedId
            await loadCustomWidgets()
          }
        } catch (e) { /* ignore */ }
        appendWidgetToScope('dashboard', {
          type: 'custom_echarts',
          title: visual.title || 'AI 图表',
          defaultW: 12,
          defaultH: 10,
          minW: 4,
          minH: 5,
          config: { customWidgetId: savedId, description: visual.description || '', option: visual.option },
        })
      } else if (visual.mode === 'cite_widget') {
        const gm = GALLERY_MAP[visual.widget_type] || {}
        appendWidgetToScope('dashboard', {
          type: visual.widget_type,
          title: visual.title || gm.title || visual.widget_type,
          defaultW: gm.defaultW || 12,
          defaultH: gm.defaultH || 10,
          config: visual.config || {},
        })
      }
      message.success('已钉选到当前看板工作区')
    }

    async function onCreateTopicBoard(visual) {
      if (!visual || !Array.isArray(visual.board_widgets)) return
      try {
        const res = await api.post('/api/widgets/topic_board', {
          workspace_name: visual.workspace_name || visual.title || 'AI 专题看板',
          board_widgets: visual.board_widgets,
        })
        if (res && res.ok && res.layout) {
          dashboardLayout.value = normalizeFreeGridLayout(res.layout, FALLBACK_DASHBOARD_LAYOUT, DASHBOARD_WIDGET_REGISTRY)
          await loadCustomWidgets()
          ensureMarketBoot()
          tab.value = 'dashboard'
          message.success(`已创建专题工作区「${visual.workspace_name || visual.title}」`)
        }
      } catch (e) {
        message.error(String(e))
      }
    }

    function onAskAiFromWidget(promptText) {
      question.value = promptText || ''
      tab.value = 'ask'
    }
    function jumpToConnectorSettings(cid) {
      tab.value = 'settings'
      settingsSection.value = 'api'
      if (cid) settingsApiId.value = cid
    }

    const newsStatus = reactive({
      enabled: false, fetching: false, translating: false, embedding: false,
      feeds_total: 0, feeds_enabled: 0, feeds_error: 0,
      items_total: 0, raw_items_total: 0, dedup_saved: 0, pending_l1: 0, starred: 0,
      unread: 0, clusters_total: 0, entities_total: 0, embedded_total: 0,
      net_tone: 0, breaking: [],
      by_lang: {}, by_category: [], by_sentiment: {},
    })
    const newsFeeds = ref([])
    const newsDefaultGlossary = ref([])
    const newsItems = ref([])
    const newsTotal = ref(0)
    const newsLoading = ref(false)
    const newsFetching = ref(false)
    const newsTranslating = ref(false)
    const newsEmbedding = ref(false)
    const newsReindexing = ref(false)
    const newsSelectedItem = ref(null)
    const newsDetailLoading = ref(false)
    const newsViewMode = ref('bilingual')
    const newsSearchMode = ref('keyword')
    const newsLastSearchMode = ref('keyword')
    const showBreakingBanner = ref(true)
    const breakingIdx = ref(0)
    const currentBreaking = computed(() => {
      const list = newsStatus.breaking || []
      if (!list.length) return null
      return list[breakingIdx.value % list.length] || list[0]
    })
    function nextBreaking() {
      const list = newsStatus.breaking || []
      if (list.length > 1) breakingIdx.value = (breakingIdx.value + 1) % list.length
    }
    const newsFilters = reactive({
      lang: 'all',
      category: 'all',
      sentiment: 'all',
      starred: false,
      unread: false,
      hours: 0,
      entity: '',
      q: '',
    })
    const newFeedForm = reactive({ name: '', url: '', category: '综合', lang: 'auto' })
    const newGlossaryForm = reactive({ term: '', zh: '', note: '' })
    const opmlInput = ref(null)

    const newsEntities = ref([])
    const entityGraph = ref({ nodes: [], edges: [], countries: [], events: [], assets: [] })
    const entityPulseHours = ref(168)
    const entityHoverId = ref(null)
    const entityGraphRefreshTick = ref(0)
    const entityDrawerOpen = ref(false)
    const entityProfile = ref(null)
    const entityLoading = ref(false)

    const panelRefreshing = reactive({})
    const panelJustRefreshed = reactive({})
    const panelRefreshedAt = reactive({})
    const panelRefreshTimers = {}

    function fmtClockTime(d) {
      const dt = d instanceof Date ? d : new Date()
      const hh = String(dt.getHours()).padStart(2, '0')
      const mm = String(dt.getMinutes()).padStart(2, '0')
      const ss = String(dt.getSeconds()).padStart(2, '0')
      return `${hh}:${mm}:${ss}`
    }

    async function refreshPanel(key, taskFn, opts = {}) {
      if (panelRefreshing[key]) return
      panelRefreshing[key] = true
      panelJustRefreshed[key] = false
      const startedAt = Date.now()
      try {
        const result = await taskFn()
        const elapsed = Date.now() - startedAt
        if (elapsed < 420) await new Promise((r) => setTimeout(r, 420 - elapsed))
        panelRefreshedAt[key] = fmtClockTime(new Date())
        panelJustRefreshed[key] = true
        if (panelRefreshTimers[key]) clearTimeout(panelRefreshTimers[key])
        panelRefreshTimers[key] = setTimeout(() => {
          panelJustRefreshed[key] = false
        }, 1800)
        if (!opts.silent) {
          const msg = typeof opts.successText === 'function' ? opts.successText(result) : opts.successText
          if (msg) message.success({ content: msg, key: 'panel-ref-' + key, duration: 2 })
        }
      } catch (e) {
        message.error({
          content: (opts.errorPrefix || '刷新失败：') + ((e && e.message) || String(e)),
          key: 'panel-ref-' + key,
          duration: 3,
        })
      } finally {
        panelRefreshing[key] = false
      }
    }

    const entityMaxMentions = computed(() => {
      let mx = 1
      for (const e of newsEntities.value || []) {
        const m = Number(e.mentions) || 0
        if (m > mx) mx = m
      }
      return mx
    })

    function entityTypeMeta(t) {
      const k = String(t || 'ORG').toUpperCase()
      if (k === 'LOC' || k === 'GPE' || k === 'GEO') return { cls: 'loc', label: '地区', title: `地区/国家 (${k})` }
      if (k === 'ORG') return { cls: 'org', label: '机构', title: '组织/机构 (ORG)' }
      if (k === 'PER' || k === 'PERSON') return { cls: 'per', label: '人物', title: '关键人物 (PER)' }
      if (k === 'ASSET' || k === 'COMMODITY' || k === 'TICKER' || k === 'EQUITY') return { cls: 'asset', label: '资产', title: `资产/大宗 (${k})` }
      return { cls: '', label: k.slice(0, 4), title: k }
    }

    const newsBriefText = ref('')
    const newsBriefLoading = ref(false)
    const briefModalOpen = ref(false)

    const askNewsOpen = ref(false)
    const askNewsMode = ref('dock')
    const askNewsPos = reactive({ x: 80, y: 80 })
    const askNewsPicked = ref({})
    const citedNews = ref([])

    const askNewsPickedCount = computed(() => Object.keys(askNewsPicked.value).filter((k) => askNewsPicked.value[k]).length)
    const askNewsFloatStyle = computed(() => ({
      left: askNewsPos.x + 'px',
      top: askNewsPos.y + 'px',
    }))
    const newsCategories = computed(() => {
      const set = new Set()
      for (const f of newsFeeds.value) if (f.category) set.add(f.category)
      for (const c of newsStatus.by_category || []) if (c.category) set.add(c.category)
      return Array.from(set)
    })
    const newsModelSelectVal = computed(() => {
      if (!cfg.news_llm_provider_id || !cfg.news_llm_model) return ''
      return cfg.news_llm_provider_id + '::' + cfg.news_llm_model
    })
    const sentimentGauge = computed(() => {
      const tone = Number(newsStatus.net_tone) || 0
      const score = Math.max(0, Math.min(100, Math.round(50 + tone * 50)))
      const arc = 282.74
      const fill = ((score / 100) * arc).toFixed(1)
      let label = '中性'
      let color = '#f59e0b'
      if (score >= 60) { label = '偏多'; color = '#10b981' }
      else if (score <= 40) { label = '偏空'; color = '#ef4444' }
      return { score, label, color, dash: `${fill} 300` }
    })
    const sentimentSignals = computed(() => {
      const tot = Math.max(1, Number(newsStatus.items_total) || 0)
      const embPct = Math.round(((Number(newsStatus.embedded_total) || 0) / tot) * 100)
      const l1Pct = Math.round(((tot - (Number(newsStatus.pending_l1) || 0)) / tot) * 100)
      return [
        { label: '中文情报', pct: langPct('zh'), val: langPct('zh') + '%', color: '#3b82f6' },
        { label: '英文情报', pct: langPct('en'), val: langPct('en') + '%', color: '#10b981' },
        { label: '俄文情报', pct: langPct('ru'), val: langPct('ru') + '%', color: '#f59e0b' },
        { label: 'L1 译文覆盖', pct: Math.min(100, l1Pct), val: l1Pct + '%', color: '#8b5cf6' },
        { label: '向量化覆盖', pct: Math.min(100, embPct), val: embPct + '%', color: '#06b6d4' },
      ]
    })
    const toneRatio = computed(() => {
      const bs = newsStatus.by_sentiment || {}
      const b = Number(bs.bullish || 0)
      const n = Number(bs.neutral || 0)
      const r = Number(bs.bearish || 0)
      const tot = Math.max(1, b + n + r)
      return {
        bullish: Math.round((b / tot) * 100),
        neutral: Math.round((n / tot) * 100),
        bearish: Math.round((r / tot) * 100),
      }
    })
    const entityGraphLayout = computed(() => {
      const nodesRaw = (entityGraph.value && entityGraph.value.nodes) || []
      const edgesRaw = (entityGraph.value && entityGraph.value.edges) || []
      const top = nodesRaw.slice(0, 14)
      if (!top.length) return { nodes: [], edges: [] }
      const cx = 160
      const cy = 66
      const posMap = new Map()
      const nodes = top.map((n, idx) => {
        const angle = (idx / top.length) * Math.PI * 2 - Math.PI / 2
        const rx = idx === 0 ? 0 : (idx % 2 === 0 ? 102 : 66)
        const ry = idx === 0 ? 0 : (idx % 2 === 0 ? 40 : 28)
        const x = Math.round(cx + Math.cos(angle) * rx)
        const y = Math.round(cy + Math.sin(angle) * ry)
        const r = Math.max(5, Math.min(11, 5 + Math.sqrt(Number(n.mentions) || 1) * 1.6))
        const ns = Number(n.net_sentiment) || 0
        const color = ns > 0.1 ? '#10b981' : (ns < -0.1 ? '#ef4444' : '#3b82f6')
        const out = { ...n, x, y, r, color }
        posMap.set(n.id, out)
        return out
      })
      const edges = edgesRaw
        .map((e) => {
          const s = posMap.get(e.source)
          const t = posMap.get(e.target)
          if (!s || !t) return null
          return { x1: s.x, y1: s.y, x2: t.x, y2: t.y, weight: e.weight }
        })
        .filter(Boolean)
      return { nodes, edges }
    })

    function onNewsModelPick(val) {
      if (!val) {
        cfg.news_llm_provider_id = ''
        cfg.news_llm_model = ''
        return
      }
      const parts = String(val).split('::')
      if (parts.length === 2) {
        cfg.news_llm_provider_id = parts[0]
        cfg.news_llm_model = parts[1]
      }
    }
    function sentimentLabel(s) {
      return { bullish: '利多', bearish: '利空', neutral: '中性' }[s] || '中性'
    }
    function langPct(k) {
      const tot = Number(newsStatus.items_total) || 0
      if (!tot) return 0
      const v = Number((newsStatus.by_lang && newsStatus.by_lang[k]) || 0)
      return Math.min(100, Math.round((v / tot) * 100))
    }
    function formatNewsTime(ts) {
      const n = Number(ts) || 0
      if (!n) return ''
      const d = new Date(n * 1000)
      const diff = Math.floor((Date.now() - d.getTime()) / 1000)
      if (diff >= 0 && diff < 60) return '刚刚'
      if (diff >= 60 && diff < 3600) return Math.floor(diff / 60) + 'm'
      if (diff >= 3600 && diff < 86400) return Math.floor(diff / 3600) + 'h'
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${mm}-${dd}`
    }

    async function loadNewsStatus() {
      try {
        const res = await api.get('/api/news/status')
        if (res && res.ok) Object.assign(newsStatus, res)
      } catch (e) { /* ignore */ }
    }
    async function loadNewsFeeds() {
      try {
        const res = await api.get('/api/news/feeds')
        if (res && res.ok) {
          newsFeeds.value = res.feeds || []
          newsDefaultGlossary.value = res.default_glossary || []
        }
      } catch (e) { /* ignore */ }
    }
    async function loadNewsEntities(hours, throwOnError) {
      const h = hours != null ? hours : entityPulseHours.value
      try {
        const res = await api.get(`/api/news/entities?hours=${encodeURIComponent(h)}&limit=36`)
        if (res && res.ok) {
          newsEntities.value = res.entities || []
          panelRefreshedAt.entity_pulse = fmtClockTime(new Date())
        } else if (throwOnError) {
          throw new Error((res && res.error) || '加载实体列表失败')
        }
      } catch (e) {
        if (throwOnError) throw e
      }
    }
    async function loadEntityGraph(hours, throwOnError) {
      const h = hours != null ? hours : entityPulseHours.value
      try {
        const res = await api.get(`/api/news/graph?hours=${encodeURIComponent(h)}&limit=36`)
        if (res && res.ok) {
          entityGraph.value = {
            nodes: res.nodes || [],
            edges: res.edges || [],
            countries: res.countries || [],
            events: res.events || [],
            assets: res.assets || [],
          }
          panelRefreshedAt.entity_pulse = fmtClockTime(new Date())
        } else if (throwOnError) {
          throw new Error((res && res.error) || '加载全球态势图谱失败')
        }
      } catch (e) {
        if (throwOnError) throw e
      }
    }
    async function refreshEntityPulse(silent) {
      await refreshPanel('entity_pulse', async () => {
        await Promise.all([
          loadNewsEntities(entityPulseHours.value, true),
          loadEntityGraph(entityPulseHours.value, true),
        ])
        entityGraphRefreshTick.value += 1
        return {
          total: (newsEntities.value || []).length,
          nodes: ((entityGraph.value && entityGraph.value.nodes) || []).length,
          edges: ((entityGraph.value && entityGraph.value.edges) || []).length,
        }
      }, {
        silent: !!silent,
        successText: (r) => (r && r.total)
          ? `实体网络已刷新：${r.total} 个实体 · ${r.edges} 条共现`
          : '实体网络已刷新（当前时间窗暂无实体）',
        errorPrefix: '实体网络刷新失败：',
      })
    }
    function setEntityPulseHours(h) {
      const next = Number(h) || 168
      if (entityPulseHours.value === next) {
        refreshEntityPulse(false)
        return
      }
      entityPulseHours.value = next
      refreshEntityPulse(true)
    }
    async function openEntityDossier(name) {
      if (!name) return
      entityDrawerOpen.value = true
      entityLoading.value = true
      try {
        const res = await api.get('/api/news/entity?name=' + encodeURIComponent(name) + '&hours=' + encodeURIComponent(entityPulseHours.value || 168))
        if (res && res.ok) entityProfile.value = res.profile
        else message.warning((res && res.error) || '暂无该实体详情')
      } catch (e) {
        message.error(String(e))
      } finally {
        entityLoading.value = false
      }
    }
    function filterNewsByEntity(name) {
      entityDrawerOpen.value = false
      newsFilters.entity = name || ''
      tab.value = 'news'
      runNewsSearch(true)
    }
    function askAiAboutEntity() {
      const p = entityProfile.value
      if (!p) return
      entityDrawerOpen.value = false
      const co = (p.co_entities || []).slice(0, 6).map((c) => c.canonical_name).join('、')
      question.value = `请调用 entity_brief 与 search_docs 对实体「${p.canonical_name}」进行深度研判：结合近7天多语种外部新闻态势（当前共提及 ${p.mentions} 次，净情绪 ${p.net_sentiment}，共现实体：${co || '无'}）以及我方本地文档库/制度规范，分析潜在机遇与风险。`
      tab.value = 'ask'
    }
    const newsListEl = ref(null)
    const newsLoadingMore = ref(false)
    const newsHasMore = ref(false)
    const newsScrollTop = ref(0)
    const newsListH = ref(680)
    let newsScrollRaf = 0
    const NEWS_ROW_H = 31
    const NEWS_OVERSCAN = 16
    const newsVirtStart = computed(() => Math.max(0, Math.floor(newsScrollTop.value / NEWS_ROW_H) - NEWS_OVERSCAN))
    const newsVirtRows = computed(() => {
      const start = newsVirtStart.value
      const count = Math.ceil((newsListH.value || 680) / NEWS_ROW_H) + NEWS_OVERSCAN * 2
      return (newsItems.value || []).slice(start, start + count)
    })

    function onNewsListScroll(e) {
      const el = e && e.target
      if (!el) return
      if (!newsScrollRaf) {
        newsScrollRaf = requestAnimationFrame(() => {
          newsScrollRaf = 0
          newsScrollTop.value = el.scrollTop
          if (el.clientHeight > 0) newsListH.value = el.clientHeight
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 360) {
            loadMoreNews()
          }
        })
      }
    }

    async function loadNewsItems(keepSelection, append) {
      const isAppend = !!append
      if (isAppend) {
        if (newsLoadingMore.value || newsLoading.value || !newsHasMore.value || newsLastSearchMode.value === 'hybrid') return
        newsLoadingMore.value = true
      } else {
        newsLoading.value = true
        newsLastSearchMode.value = 'keyword'
        newsScrollTop.value = 0
        if (newsListEl.value) newsListEl.value.scrollTop = 0
      }
      try {
        const off = isAppend ? newsItems.value.length : 0
        const qs = new URLSearchParams({
          lang: newsFilters.lang || 'all',
          category: newsFilters.category || 'all',
          sentiment: newsFilters.sentiment || 'all',
          starred: newsFilters.starred ? '1' : '0',
          unread: newsFilters.unread ? '1' : '0',
          hours: String(newsFilters.hours || 0),
          entity: (newsFilters.entity || '').trim(),
          q: (newsFilters.q || '').trim(),
          limit: '80',
          offset: String(off),
        })
        const res = await api.get('/api/news/items?' + qs.toString())
        if (res && res.ok) {
          const batch = res.items || []
          newsTotal.value = res.total || 0
          if (isAppend) {
            const seen = new Set(newsItems.value.map((x) => x.id))
            const fresh = batch.filter((x) => !seen.has(x.id))
            if (fresh.length) newsItems.value = newsItems.value.concat(fresh)
            newsHasMore.value = batch.length >= 80 && newsItems.value.length < newsTotal.value
          } else {
            newsItems.value = batch
            newsHasMore.value = batch.length >= 80 && batch.length < newsTotal.value
          }
        }
      } catch (e) { /* ignore */ } finally {
        if (isAppend) newsLoadingMore.value = false
        else newsLoading.value = false
      }
    }
    function loadMoreNews() {
      return loadNewsItems(true, true)
    }
    async function runNewsSearch(keepSelection) {
      const qStr = (newsFilters.q || '').trim()
      if (!qStr || newsSearchMode.value !== 'semantic') {
        return loadNewsItems(keepSelection, false)
      }
      newsLoading.value = true
      newsHasMore.value = false
      newsScrollTop.value = 0
      if (newsListEl.value) newsListEl.value.scrollTop = 0
      try {
        const qs = new URLSearchParams({
          q: qStr,
          lang: newsFilters.lang || 'all',
          category: newsFilters.category || 'all',
          hours: String(newsFilters.hours || 0),
          limit: '30',
        })
        const res = await api.get('/api/news/search?' + qs.toString())
        if (res && res.ok) {
          newsItems.value = res.items || []
          newsTotal.value = newsItems.value.length
          newsLastSearchMode.value = res.mode || 'keyword'
        }
      } catch (e) {
        message.error(String(e))
      } finally {
        newsLoading.value = false
      }
    }
    async function markAllNewsRead() {
      const res = await api.post('/api/news/mark_read', {})
      if (res && res.ok) {
        newsItems.value.forEach((it) => { it.read = 1 })
        newsStatus.unread = 0
        message.success('已全部标为已读')
      }
    }
    async function embedNewsNow() {
      newsEmbedding.value = true
      try {
        const res = await api.post('/api/news/embed', { limit: 500 })
        if (!res || !res.ok) {
          message.warning((res && res.error) || '向量化失败')
          return
        }
        const dedupMsg = res.semantic_deduped ? `，跨语种语义去重 ${res.semantic_deduped} 条` : ''
        message.success(`已完成 ${res.embedded || 0} 条代表稿向量索引${dedupMsg}`)
        loadNewsStatus()
        loadNewsItems(true)
      } catch (e) {
        message.error(String(e))
      } finally {
        newsEmbedding.value = false
      }
    }
    async function reindexNewsAll() {
      if (newsReindexing.value) return
      newsReindexing.value = true
      try {
        const res = await api.post('/api/news/reindex', {})
        if (!res || !res.ok) {
          message.warning((res && res.error) || '重建索引失败')
          return
        }
        message.success(`重建完成：代表稿 ${res.canonical_total || 0} 条，去重 ${(res.l1_deduped || 0) + (res.l2_deduped || 0)} 条（耗时 ${res.elapsed_sec || 0}s）`)
        loadNewsStatus()
        loadNewsItems(true)
      } catch (e) {
        message.error(String(e))
      } finally {
        newsReindexing.value = false
      }
    }
    async function loadNewsBrief(force) {
      newsBriefLoading.value = true
      try {
        const res = await api.post('/api/news/brief', { hours: 24, force: !!force })
        if (res && res.ok) newsBriefText.value = res.brief || ''
        else message.error((res && res.error) || '简报生成失败')
      } catch (e) {
        message.error(String(e))
      } finally {
        newsBriefLoading.value = false
      }
    }
    function openBriefModal() {
      briefModalOpen.value = true
      if (!newsBriefText.value) loadNewsBrief(false)
    }
    async function selectNewsItem(it) {
      if (!it || !it.id) return
      it.read = 1
      newsDetailLoading.value = true
      try {
        const res = await api.get('/api/news/item/' + it.id)
        if (res && res.ok && res.item) {
          newsSelectedItem.value = res.item
          loadNewsStatus()
        }
      } catch (e) {
        newsSelectedItem.value = it
      } finally {
        newsDetailLoading.value = false
      }
    }
    async function fetchNewsNow(feedId) {
      newsFetching.value = true
      try {
        const res = await api.post('/api/news/fetch', {
          feed_id: feedId || '',
          translate: !!cfg.news_auto_translate,
        })
        if (!res || !res.ok) {
          message.error((res && res.error) || '抓取失败')
          return
        }
        if (res.busy) {
          message.info('后台正在抓取中，请稍候')
        } else {
          message.success(`抓取完成：新增 ${res.inserted || 0} 条，译文处理 ${res.translated || 0} 条${res.errors ? `（${res.errors} 个源异常）` : ''}`)
        }
        await Promise.all([loadNewsStatus(), loadNewsFeeds(), loadNewsItems(true), loadNewsEntities(), loadEntityGraph()])
      } catch (e) {
        message.error(String(e))
      } finally {
        newsFetching.value = false
      }
    }
    async function translatePendingNews() {
      newsTranslating.value = true
      try {
        const res = await api.post('/api/news/translate_pending', { limit: 24 })
        if (!res || !res.ok) {
          message.error((res && res.error) || '翻译失败')
          return
        }
        message.success(`已完成 ${res.translated || 0} 条待处理新闻翻译与实体抽取`)
        await Promise.all([loadNewsStatus(), loadNewsItems(true), loadNewsEntities(), loadEntityGraph()])
        if (newsSelectedItem.value) await selectNewsItem(newsSelectedItem.value)
      } catch (e) {
        message.error(String(e))
      } finally {
        newsTranslating.value = false
      }
    }
    async function translateNewsFull(itemId, fetchFull) {
      newsDetailLoading.value = true
      try {
        const res = await api.post('/api/news/translate', { id: itemId, fetch_full: !!fetchFull })
        if (!res || !res.ok) {
          message.error((res && res.error) || '正文精翻失败')
          return
        }
        if (res.item) {
          newsSelectedItem.value = res.item
          const idx = newsItems.value.findIndex((x) => x.id === res.item.id)
          if (idx >= 0) Object.assign(newsItems.value[idx], res.item)
        }
        message.success('已完成正文精翻并缓存')
        loadNewsStatus()
      } catch (e) {
        message.error(String(e))
      } finally {
        newsDetailLoading.value = false
      }
    }
    async function toggleNewsStar(it) {
      if (!it || !it.id) return
      const res = await api.post('/api/news/star', { id: it.id })
      if (res && res.ok) {
        it.starred = res.starred ? 1 : 0
        const row = newsItems.value.find((x) => x.id === it.id)
        if (row) row.starred = it.starred
        if (newsSelectedItem.value && newsSelectedItem.value.id === it.id) {
          newsSelectedItem.value.starred = it.starred
        }
        loadNewsStatus()
      }
    }
    async function saveNewFeed() {
      if (!(newFeedForm.url || '').trim()) {
        message.warning('请输入 RSS 源地址')
        return
      }
      const res = await api.post('/api/news/feeds/save', { ...newFeedForm, enabled: true })
      if (!res || !res.ok) {
        message.error((res && res.error) || '添加失败')
        return
      }
      newFeedForm.name = ''
      newFeedForm.url = ''
      message.success('已添加订阅源')
      await Promise.all([loadNewsFeeds(), loadNewsStatus()])
    }
    async function toggleFeedEnabled(fd, enabled) {
      const res = await api.post('/api/news/feeds/save', { ...fd, enabled: !!enabled })
      if (res && res.ok && res.feed) {
        Object.assign(fd, res.feed)
        loadNewsStatus()
      }
    }
    async function deleteNewsFeed(fd) {
      const res = await api.post('/api/news/feeds/delete', { id: fd.id })
      if (res && res.ok) {
        message.success('已删除订阅源：' + fd.name)
        await Promise.all([loadNewsFeeds(), loadNewsStatus()])
      }
    }
    async function importPresetFeeds() {
      const res = await api.post('/api/news/feeds/import_presets', {})
      if (res && res.ok) {
        message.success(`已导入 ${res.added || 0} 个中/英/俄预设源（跳过已存在 ${res.skipped || 0} 个）`)
        await Promise.all([loadNewsFeeds(), loadNewsStatus()])
      }
    }
    function triggerOpmlImport() {
      if (opmlInput.value) {
        opmlInput.value.value = ''
        opmlInput.value.click()
      }
    }
    async function onOpmlFilePicked(e) {
      const f = e && e.target && e.target.files && e.target.files[0]
      if (!f) return
      const xml = await f.text()
      const res = await api.post('/api/news/feeds/import_opml', { xml })
      if (!res || !res.ok) {
        message.error((res && res.error) || 'OPML 导入失败')
        return
      }
      message.success(`OPML 解析 ${res.total || 0} 个源：新增 ${res.added || 0}，跳过 ${res.skipped || 0}`)
      await Promise.all([loadNewsFeeds(), loadNewsStatus()])
    }
    function exportOpml() {
      window.open('/api/news/feeds/export_opml', '_blank')
    }
    function loadDefaultGlossary() {
      const exist = new Set((cfg.news_glossary || []).map((x) => x.term))
      const merged = (cfg.news_glossary || []).slice()
      for (const g of newsDefaultGlossary.value || []) {
        if (!exist.has(g.term)) {
          merged.push({ ...g })
          exist.add(g.term)
        }
      }
      cfg.news_glossary = merged
      message.success('已合并常用中/英/俄财经及航运术语')
    }
    function addGlossaryTerm() {
      const term = (newGlossaryForm.term || '').trim()
      const zh = (newGlossaryForm.zh || '').trim()
      if (!term || !zh) {
        message.warning('请填写外文原文与标准中文译名')
        return
      }
      cfg.news_glossary = [...(cfg.news_glossary || []), { term, zh, note: (newGlossaryForm.note || '').trim() }]
      newGlossaryForm.term = ''
      newGlossaryForm.zh = ''
      newGlossaryForm.note = ''
    }
    function removeGlossaryTerm(idx) {
      const next = (cfg.news_glossary || []).slice()
      next.splice(idx, 1)
      cfg.news_glossary = next
    }

    function openNewsSettings() {
      tab.value = 'settings'
      settingsSection.value = 'news'
    }
    async function openNewsInBrowser(url) {
      if (!url) return
      if (nativeBw) applyBrowserState(await nativeBw.newTab(url))
      else {
        await api.post('/api/browser/action', { action: 'open', url, new_tab: true })
        applyBrowserState(await api.get('/api/browser/state'))
      }
      tab.value = 'browser'
    }
    function toggleAskNews() {
      askNewsOpen.value = !askNewsOpen.value
      if (askNewsOpen.value) {
        loadNewsStatus()
        loadNewsItems(true)
      }
    }
    function toggleAskNewsPick(it) {
      if (!it || !it.id) return
      const cur = { ...askNewsPicked.value }
      if (cur[it.id]) delete cur[it.id]
      else cur[it.id] = it
      askNewsPicked.value = cur
    }
    function removeCitedNews(id) {
      citedNews.value = citedNews.value.filter((x) => x.id !== id)
    }
    function citeSelectedNewsToAsk(sendNow) {
      const picked = Object.values(askNewsPicked.value).filter(Boolean)
      if (!picked.length) return
      const have = new Set(citedNews.value.map((x) => x.id))
      const merged = citedNews.value.slice()
      for (const it of picked) {
        if (!have.has(it.id)) merged.push(it)
      }
      citedNews.value = merged
      askNewsPicked.value = {}
      if (sendNow) {
        if (!(question.value || '').trim()) {
          question.value = '请对引用的多语种新闻进行核心事实提炼、交叉比对与金融/业务影响研判：'
        }
        send()
      }
    }
    function sendNewsToChat(list) {
      const arr = (list || []).filter(Boolean)
      if (!arr.length) return
      const have = new Set(citedNews.value.map((x) => x.id))
      const merged = citedNews.value.slice()
      for (const it of arr) {
        if (!have.has(it.id)) merged.push(it)
      }
      citedNews.value = merged
      tab.value = 'ask'
    }
    function onAskNewsDragStart(e) {
      if (askNewsMode.value !== 'float') return
      const sx = e.clientX
      const sy = e.clientY
      const ox = askNewsPos.x
      const oy = askNewsPos.y
      const onMove = (ev) => {
        askNewsPos.x = Math.max(8, Math.min(window.innerWidth - 340, ox + (ev.clientX - sx)))
        askNewsPos.y = Math.max(8, Math.min(window.innerHeight - 160, oy + (ev.clientY - sy)))
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    // ============== 金融行情 / 宏观 / 地缘终端 ==============
    const marketOverview = reactive({ ribbon: [], panels: [], watchlist: [], stats: {} })
    const marketLoading = ref(false)
    const marketSectors = ref([])
    const marketMovers = reactive({ gainers: [], losers: [], active: [] })
    const macroData = reactive({ treasury: { date: '', rates: [] }, fx: { date: '', rates: {} }, cbr: { date: '', items: {} }, fred: [] })
    const geoData = reactive({ events: [], chokepoints: [] })

    const chartOpts = reactive({ ma: true, vol: true, markers: true })
    const dashWlSelected = ref({ secid: '1.000001', symbol: '000001.SH', name: '上证指数' })
    const dashWlInterval = ref('1d')
    const dashKlineData = ref(null)

    const mktView = ref('panels')
    const mktInterval = ref('1d')
    const mktDetailOpen = ref(true)
    const mktSelectedSecid = ref('1.000001')
    const mktSelectedSymbol = ref('000001.SH')
    const mktSelectedName = ref('上证指数')
    const mktKlineData = ref(null)
    const mktSearchQuery = ref('')
    const mktSearchHits = ref([])
    const mktSearchOpen = ref(false)
    const mktProxyTesting = ref(false)
    let mktSearchTimer = 0
    let marketBooted = false

    async function testMarketProxy() {
      mktProxyTesting.value = true
      try {
        const res = await api.post('/api/market/test_proxy', { proxy: cfg.market_proxy || '' })
        if (res && res.ok) {
          message.success(`YahooFinance 连通 (${res.proxy}, NVDA=${res.price}, ${res.ms}ms)`)
        } else {
          message.error(`代理测试失败 (${(res && res.proxy) || 'direct'}): ${(res && res.error) || '未知错误'}`)
        }
      } catch (e) {
        message.error(String(e))
      } finally {
        mktProxyTesting.value = false
      }
    }

    function fmtPrice(v) {
      if (v === null || v === undefined || v === '') return '-'
      const n = Number(v)
      if (!Number.isFinite(n)) return '-'
      if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      if (Math.abs(n) >= 10) return n.toFixed(2)
      return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') || '0'
    }
    function fmtPct(v) {
      if (v === null || v === undefined || v === '') return '-'
      const n = Number(v)
      if (!Number.isFinite(n)) return '-'
      return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
    }
    function fmtCompact(v) {
      const n = Number(v)
      if (!Number.isFinite(n) || n === 0) return '0'
      if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + 'B'
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M'
      if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K'
      return String(Math.round(n))
    }

    const macroFxGrid = computed(() => {
      const fx = (macroData.fx && macroData.fx.rates) || {}
      const cbr = (macroData.cbr && macroData.cbr.items) || {}
      const out = []
      if (fx.CNY) out.push({ pair: 'USD/CNY', val: Number(fx.CNY).toFixed(4) })
      if (cbr['CBR.USDRUB']) out.push({ pair: 'USD/RUB', val: cbr['CBR.USDRUB'].price })
      if (cbr['CBR.CNYRUB']) out.push({ pair: 'CNY/RUB', val: cbr['CBR.CNYRUB'].price })
      if (fx.EUR) out.push({ pair: 'EUR/USD', val: (1 / Number(fx.EUR)).toFixed(4) })
      if (fx.JPY) out.push({ pair: 'USD/JPY', val: Number(fx.JPY).toFixed(2) })
      if (fx.GBP) out.push({ pair: 'GBP/USD', val: (1 / Number(fx.GBP)).toFixed(4) })
      for (const f of (macroData.fred || []).slice(0, 3)) {
        out.push({ pair: f.label, val: f.value })
      }
      return out.slice(0, 6)
    })

    const macroSpreadSummary = computed(() => {
      const rates = (macroData.treasury && macroData.treasury.rates) || []
      if (!rates.length) return null
      const findRate = (re) => {
        const hit = rates.find((r) => re.test(String(r.label || '') + ' ' + String(r.tenor || '')))
        return hit && hit.rate != null ? Number(hit.rate) : null
      }
      const r10 = findRate(/10[\s-]?Year|10Y/i)
      const r2 = findRate(/2[\s-]?Year|2Y/i)
      if (r10 == null || r2 == null) return null
      return { r10, r2, s10_2: Math.round((r10 - r2) * 100) }
    })

    const mktTechSummary = computed(() => {
      const kd = mktKlineData.value
      if (!kd || !kd.indicators) return null
      const rsiArr = kd.indicators.rsi14 || []
      const macdArr = kd.indicators.macd || []
      const rsi = rsiArr.length ? rsiArr[rsiArr.length - 1].value : '-'
      const m = macdArr.length ? macdArr[macdArr.length - 1] : null
      return {
        rsi,
        macd: m ? `${m.dif} / ${m.dea} (${m.hist >= 0 ? '+' : ''}${m.hist})` : '-',
      }
    })

    async function loadMarketOverview(force) {
      marketLoading.value = true
      try {
        const res = await api.get('/api/market/overview' + (force ? '?force=1' : ''))
        if (res && res.ok) {
          marketOverview.ribbon = res.ribbon || []
          marketOverview.panels = res.panels || []
          marketOverview.watchlist = res.watchlist || []
          marketOverview.stats = res.stats || {}
          if (marketOverview.watchlist.length && !dashKlineData.value) {
            dashWlSelected.value = marketOverview.watchlist[0]
            loadDashKline(false)
          }
        }
      } catch (e) { /* ignore */ } finally {
        marketLoading.value = false
      }
    }
    async function loadDashKline(force) {
      const sel = dashWlSelected.value
      if (!sel || !sel.secid) return
      try {
        const qs = new URLSearchParams({
          secid: sel.secid,
          interval: dashWlInterval.value || '1d',
          limit: '120',
          name: sel.name || '',
        })
        if (force) qs.set('force', '1')
        const res = await api.get('/api/market/kline?' + qs.toString())
        if (res && res.ok) dashKlineData.value = res
      } catch (e) { /* ignore */ }
    }
    async function loadMarketKline(secid, force) {
      const sid = secid || mktSelectedSecid.value
      if (!sid) return
      try {
        const qs = new URLSearchParams({
          secid: sid,
          interval: mktInterval.value || '1d',
          limit: '160',
          name: mktSelectedName.value || '',
        })
        if (force) qs.set('force', '1')
        const res = await api.get('/api/market/kline?' + qs.toString())
        if (res && res.ok) mktKlineData.value = res
      } catch (e) { /* ignore */ }
    }
    async function loadMarketSectors(force) {
      try {
        const res = await api.get('/api/market/sectors?limit=36' + (force ? '&force=1' : ''))
        if (res && res.ok) marketSectors.value = res.items || []
      } catch (e) { /* ignore */ }
    }
    async function loadMarketMovers(force) {
      try {
        const res = await api.get('/api/market/movers?limit=15' + (force ? '&force=1' : ''))
        if (res && res.ok) {
          marketMovers.gainers = res.gainers || []
          marketMovers.losers = res.losers || []
          marketMovers.active = res.active || []
        }
      } catch (e) { /* ignore */ }
    }
    async function loadMacroData(force) {
      try {
        const res = await api.get('/api/market/macro' + (force ? '?force=1' : ''))
        if (res && res.ok) {
          macroData.treasury = res.treasury || { date: '', rates: [] }
          macroData.fx = res.fx || { date: '', rates: {} }
          macroData.cbr = res.cbr || { date: '', items: {} }
          macroData.fred = res.fred || []
        }
      } catch (e) { /* ignore */ }
    }
    async function loadGeoData(force) {
      try {
        const res = await api.get('/api/market/geopolitics' + (force ? '?force=1' : ''))
        if (res && res.ok) {
          geoData.events = res.events || []
          geoData.chokepoints = res.chokepoints || []
        }
      } catch (e) { /* ignore */ }
    }
    function ensureMarketBoot() {
      if (marketBooted) return
      marketBooted = true
      loadMarketOverview(false)
      loadMarketSectors(false)
      loadMacroData(false)
      loadGeoData(false)
    }
    async function refreshDashboardAll() {
      await Promise.all([
        fetchNewsNow(),
        loadMarketOverview(true),
        loadDashKline(true),
        loadMarketSectors(true),
        loadMacroData(true),
        loadGeoData(true),
      ])
    }
    const widgetKlineMap = reactive({})
    const widgetKlineReqMap = {}

    async function loadWidgetKlineById(wid, secid, interval, name, force) {
      if (!wid || !secid) return
      const reqKey = `${secid}|${interval || '1d'}`
      if (!force && widgetKlineReqMap[wid] === reqKey) return
      widgetKlineReqMap[wid] = reqKey
      try {
        const qs = new URLSearchParams({
          secid,
          interval: interval || '1d',
          limit: '140',
          name: name || '',
        })
        if (force) qs.set('force', '1')
        const res = await api.get('/api/market/kline?' + qs.toString())
        if (res && res.ok && widgetKlineReqMap[wid] === reqKey) {
          widgetKlineMap[wid] = res
        } else if (widgetKlineReqMap[wid] === reqKey) {
          delete widgetKlineReqMap[wid]
        }
      } catch (e) {
        if (widgetKlineReqMap[wid] === reqKey) delete widgetKlineReqMap[wid]
      }
    }

    function getDashWlSelected(w) {
      const cid = w && w.config && w.config.secid
      if (cid) {
        const hit = (marketOverview.watchlist || []).find((x) => x.secid === cid)
        if (hit) return hit
        return { secid: cid, symbol: (w.config && w.config.symbol) || cid, name: (w.config && w.config.secidName) || cid }
      }
      return dashWlSelected.value
    }
    function getDashWlInterval(w) {
      return (w && w.config && w.config.interval) || dashWlInterval.value || '1d'
    }
    function getDashKlineData(w) {
      if (w && w.config && (w.config.secid || w.config.interval)) {
        const sel = getDashWlSelected(w)
        const iv = getDashWlInterval(w)
        if (sel && sel.secid) loadWidgetKlineById(w.id, sel.secid, iv, sel.name, false)
        return widgetKlineMap[w.id] || dashKlineData.value
      }
      return dashKlineData.value
    }
    function loadDashKlineFor(w, force) {
      if (w && w.config && (w.config.secid || w.config.interval)) {
        const sel = getDashWlSelected(w)
        if (sel && sel.secid) loadWidgetKlineById(w.id, sel.secid, getDashWlInterval(w), sel.name, !!force)
        return
      }
      loadDashKline(force)
    }
    function selectDashWatchItemFor(w, it) {
      if (!it || !it.secid) return
      if (w && w.id) {
        onUpdateWidgetConfig('dashboard', w.id, { secid: it.secid, symbol: it.symbol || it.secid, secidName: it.name || it.symbol || it.secid })
        loadWidgetKlineById(w.id, it.secid, getDashWlInterval(w), it.name, false)
      }
      dashWlSelected.value = it
      loadDashKline(false)
    }
    function setDashWlInterval(w, iv) {
      if (w && w.id) {
        onUpdateWidgetConfig('dashboard', w.id, { interval: iv })
        const sel = getDashWlSelected(w)
        if (sel && sel.secid) loadWidgetKlineById(w.id, sel.secid, iv, sel.name, true)
      } else {
        dashWlInterval.value = iv
        loadDashKline(true)
      }
    }

    function getMktWidgetInterval(w) {
      return (w && w.config && w.config.interval) || mktInterval.value || '1d'
    }
    function getMktKlineData(w) {
      if (w && w.config && (w.config.secid || w.config.interval)) {
        const sid = w.config.secid || mktSelectedSecid.value
        const nm = w.config.secidName || mktSelectedName.value
        const iv = getMktWidgetInterval(w)
        if (sid) loadWidgetKlineById(w.id, sid, iv, nm, false)
        return widgetKlineMap[w.id] || mktKlineData.value
      }
      return mktKlineData.value
    }
    function setMktWidgetSymbol(w, it) {
      if (!w || !it || !it.secid) return
      onUpdateWidgetConfig('markets', w.id, { secid: it.secid, symbol: it.symbol || it.secid, secidName: it.name || it.symbol || it.secid })
      loadWidgetKlineById(w.id, it.secid, getMktWidgetInterval(w), it.name, true)
    }
    function clearMktWidgetSymbol(w) {
      if (!w) return
      onUpdateWidgetConfig('markets', w.id, { secid: '', symbol: '', secidName: '' })
      delete widgetKlineMap[w.id]
      delete widgetKlineReqMap[w.id]
    }
    function setMktWidgetInterval(w, iv) {
      if (w && w.id) {
        onUpdateWidgetConfig('markets', w.id, { interval: iv })
        const sid = (w.config && w.config.secid) || mktSelectedSecid.value
        const nm = (w.config && w.config.secidName) || mktSelectedName.value
        if (sid) loadWidgetKlineById(w.id, sid, iv, nm, true)
      } else {
        mktInterval.value = iv
        loadMarketKline(mktSelectedSecid.value, true)
      }
    }

    function liveWireLang(w) {
      return (w && w.config && w.config.lang) || 'all'
    }
    function setLiveWireLang(scope, w, langId) {
      if (!w || !w.id) return
      onUpdateWidgetConfig(scope, w.id, { lang: langId })
      if (!newsItems.value.length) loadNewsItems(true)
    }
    function liveWireItemsFor(w) {
      const lang = liveWireLang(w)
      const sent = (w && w.config && w.config.sentiment) || 'all'
      const limit = (w && w.config && Number(w.config.limit)) || 24
      const all = newsItems.value || []
      const filtered = all.filter((x) => {
        if (lang !== 'all' && x.lang !== lang) return false
        if (sent !== 'all' && x.sentiment !== sent) return false
        return true
      })
      return filtered.slice(0, limit)
    }

    async function pinWatchlistSymbol(it) {
      if (!it || !it.secid) return
      try {
        const res = await api.post('/api/market/watchlist', { action: 'pin', secid: it.secid })
        if (res && res.ok) {
          await loadMarketOverview(true)
          message.success(`已置顶「${it.name || it.symbol}」`)
        }
      } catch (e) { /* ignore */ }
    }

    async function addSymbolToWatchlistAndPick(it, w) {
      if (!it || !it.secid) return
      if (!isInWatchlist(it.secid)) {
        await toggleWatchlistSymbol(it)
      }
      if (w && w.type === 'watchlist_slot') {
        selectDashWatchItemFor(w, it)
      } else {
        selectMarketSymbol(it)
      }
    }
    function onDashboardQuickPickSymbol(it) {
      if (!it || !it.secid) return
      const wlWidget = activeDashboardWidgets.value.find((x) => x.type === 'watchlist_slot')
      if (wlWidget) {
        selectDashWatchItemFor(wlWidget, it)
        message.info(`已在 K 线切换到「${it.name || it.symbol}」`)
      } else {
        openMarketDetail(it)
      }
    }

    function selectDashWatchItem(it) {
      if (!it || !it.secid) return
      dashWlSelected.value = it
      loadDashKline(false)
    }
    function selectMarketSymbol(it) {
      if (!it || !it.secid) return
      mktSelectedSecid.value = it.secid
      mktSelectedSymbol.value = it.symbol || it.secid
      mktSelectedName.value = it.name || it.symbol || it.secid
      mktDetailOpen.value = true
      loadMarketKline(it.secid, false)
    }
    function openMarketDetail(it) {
      tab.value = 'markets'
      selectMarketSymbol(it)
    }
    async function onPickKlineNewsMarker(ev) {
      if (!ev) return
      const id = ev.news_id || ev.id
      if (id) {
        tab.value = 'news'
        await selectNewsItem({ id })
      }
    }
    function onPickSector(sec) {
      if (!sec || !sec.name) return
      newsFilters.q = sec.name
      tab.value = 'news'
      runNewsSearch(true)
    }
    function onMktSearchInput() {
      clearTimeout(mktSearchTimer)
      const qs = (mktSearchQuery.value || '').trim()
      if (!qs) {
        mktSearchHits.value = []
        mktSearchOpen.value = false
        return
      }
      mktSearchTimer = setTimeout(async () => {
        try {
          const res = await api.get('/api/market/search?q=' + encodeURIComponent(qs))
          if (res && res.ok) {
            mktSearchHits.value = res.items || []
            mktSearchOpen.value = mktSearchHits.value.length > 0
          }
        } catch (e) { /* ignore */ }
      }, 220)
    }
    function isInWatchlist(secid) {
      return (marketOverview.watchlist || []).some((w) => w.secid === secid)
    }
    async function toggleWatchlistSymbol(it) {
      if (!it || !it.secid) return
      const remove = isInWatchlist(it.secid)
      const res = await api.post('/api/market/watchlist', {
        action: remove ? 'remove' : 'add',
        secid: it.secid,
        symbol: it.symbol || it.secid,
        name: it.name || it.symbol || it.secid,
      })
      if (res && res.ok) {
        await loadMarketOverview(true)
        message.success(remove ? '已移出自选' : '已加入自选')
      }
    }
    function askAiAboutSymbol(sym) {
      if (!sym || !sym.secid) return
      const nm = sym.name || sym.symbol || sym.secid
      question.value = `请调用 market_query（secid="${sym.secid}"）获取「${nm}」最新行情、K线与技术指标，并结合 search_news 与本地文档库进行多维度研判：`
      tab.value = 'ask'
    }
    function askAiMacro() {
      question.value = '请调用 macro_query 获取当前美债利率、汇率（含USD/CNH、USD/RUB）及 FRED 指标，结合最新中/英/俄宏观新闻给出态势研判：'
      tab.value = 'ask'
    }
    function askAiGeo() {
      question.value = '请调用 macro_query(action="geopolitics") 获取地缘预测赔率与港口航运态势，结合俄/英/中新闻流与本地制度规范分析供应链及市场影响：'
      tab.value = 'ask'
    }

    watch(tab, (next) => {
      if (next === 'news' || next === 'dashboard') {
        loadNewsStatus()
        loadNewsFeeds()
        loadNewsItems(true)
        loadNewsEntities()
        if (next === 'dashboard') {
          loadDashboardLayout()
          loadEntityGraph()
          ensureMarketBoot()
        }
      } else if (next === 'markets') {
        loadMarketLayout()
        ensureMarketBoot()
        if (!mktKlineData.value) loadMarketKline(mktSelectedSecid.value, false)
        loadMarketMovers(false)
      }
    })

    loadStats()
    loadFacets()
    loadDocs()
    loadKb()
    loadConfig()
    loadModels()
    syncBackendChats()

    return {
      tab, q, loading, results, searched, filters, facets, stats,
      theme, zhCN, ICO, EFFORTS, protocols, navs, recent, askExamples, pageTitle, pickExample, askExample,
      paneOn, settingsOn, chunkOn,
      hasNativeBrowser, browserStage, askBrowserStage, askBrowserWin, chatwrapEl, askBrowserOpen, askBwScale, askBwDragging, askBwTransitioning,
      askBrowserWindowStyle, askBrowserBtnTooltip, onAskBwResizeStart,
      toggleAskBrowserByUser, closeAskBrowserByUser, confirmHumanBrowserDone, stepAskBwScale, resetAskBwScale, onAskBrowserWheel, onChatlogScroll,
      browserState, browserUrlInput, browserPreviewUrl,
      activeBrowserTab, browserOccluded, onBrowserUrlFocus, onBrowserUrlBlur, submitBrowserUrl,
      newBrowserTab, switchBrowserTab, closeBrowserTab, browserBack, browserForward, browserReloadOrStop, browserDevTools,
      doSearch, pageUrl,
      messages, question, asking, chatlog, chatAscii: CHAT_ASCII, turns, send, stopAsk, newChat, clearChat, onEnter,
      searchInputEl, askInputEl, currentQueued, removeQueuedFollowup,
      shortcutGroups, recordingShortcutId, hasCustomShortcuts, getShortcutCombo, isShortcutModified, shortcutTokens,
      onShortcutContext, resetShortcut, resetAllShortcuts, onAskKeydown, onSearchKeydown,
      chatId, histMode, histPicked, histGroups, histPickCount, histPaneTitle, histPinLabel, runningIds,
      histSearchQuery, allSessionChats, filteredSessionChats, convTurnCount, convRelTime, closeSessionTab,
      openHistManage, openHistBrowse, closeHistManage, openHistChat, onHistRow, togglePick, pinPicked, deletePicked,
      renderAnswer, onAnswerClick, displaySources, toggleSrc, bindAnswer, scheduleAnswer, blockDelay, msgDelay,
      toolDotClass, toolLabel, toolMeta, sbfWindowH, sbfOffset, sbfItemClass,
      attachments, attachInput, attachOver, pickAttach, onAttachPicked,
      onAttachEnter, onAttachLeave, onAttachDrop, onAttachPaste, removeAttach,
      menuOpen, menuPanel, modelWrap, modelQuery, modelPill, modelLabel, channelLabel, modelHasVision, effortLabel,
      effortOptions, contextLabel, contextOptions, groupedModels, filteredModels,
      toggleModelMenu, openPanel, setEffort, setContext, setChatModel, modelList,
      settingsPid, settingsEmbedPid, settingsApiId, settingsPrimary, settingsSection, settingsPillStyle, bindSettingsNav,
      settingsSearch, ocSettingsGroups, ocActiveMeta, isNavMatched, showSettingsSec, selectSettingsNav, exitSettings, onSettingsModelPick,
      cacheReport, cacheClearing, formatBytes, loadCacheStatus, clearCacheTarget, openCacheDir,
      navPillStyle, llmPillStyle, embedPillStyle, apiPillStyle, bindMainNav, bindLlmProvider, bindEmbedProvider, bindApiConnector,
      currentProvider, currentEmbedProvider, currentApiConnector, addProvider, addEmbedProvider, addModel, addApiConnector,
      urlPlaceholder, embedUrlPlaceholder, embedProtocols, embedStatusText,
      apiProtocols, apiAuthTypes, apiCategories, apiConnectorGroups, apiPresets, apiTesting, apiTestHint, apiDiscovering,
      apiConnectorStateText, apiKeyLabel, apiSecretLabel, needsApiSecret,
      openAddApiConnector, applyApiPreset, confirmAddApiConnector, removeApiConnector, removeApiEndpoint,
      saveApiConnectorKey, clearApiConnectorKey, saveApiConnectorSecret, clearApiConnectorSecret,
      testApiConnector, discoverIntoConnector, discoverIntoModal,
      openAddProvider, confirmAddProvider, removeProvider,
      saveProviderKey, clearProviderKey, openAddModel, confirmAddModel,
      removeProviderModel, syncProviderModels,
      selectEmbedChannel, openAddEmbedProvider, confirmAddEmbedProvider, removeEmbedProvider,
      saveEmbedKey, clearEmbedKey, openAddEmbedModel, removeEmbedModel, syncEmbedModels,
      startEmbed, stopEmbed, toggleEmbedRun,
      askPicked, askOtherOn, canSubmitAsk, toggleAskOpt, pickAskOther, submitAsk,
      askCurrentQs, askLastStep, askStepDone, prevAsk, nextAsk,
      docs, catDept, catProject, catFolder, catDocType, catQuery, organizing, folderUploadInput,
      DOC_TYPE_SPECS, INGEST_ACCEPT,
      scopeTotalCount, scopeDocTypeCapsules, filteredDocs, catalogRows, dynamicColumns, columns,
      docTypeLabel, docTypeColor, chunkProfileLabel, extBadgeText, extBadgeClass,
      recordMetaVal, recordPills, docMetaPills, recordSummary, renderChunkTable,
      catalogAlive,
      isProjExpanded, selectTreeScope, setCatDocType,
      cursorTreeRows, dropTargetKey, activeTreeDocId, kbOff, toggleProjectKb,
      onTreeRowClick, toggleTreeNodeExpand, drillUpTree, refreshCatalogTree,
      toggleExpandCollapseAll, openIngestInScope, openRenameFolderModal, deleteDocRecord,
      onTreeDragStart, onTreeDragOver, onTreeDragLeave, onTreeDrop, onTreeDragEnd,
      tableCard, tableY, loadDocs, rowClick,
      drawerOpen, drawerWidth, doc, docLoading, activeSeq, currentDocId,
      docView, canPdf, originPage, activeChunk, pageScroll, pageList,
      hitPage, activeChunkId, pageReady, pageShown, onImgMount, onPageScroll, onPageImgError, onPageLoaded, jumpToHit,
      pdfScale, pdfPanning, zoomLabel, zoomIn, zoomOut, onZoomPreset, resetPdfZoom,
      onPdfDown, onPdfMove, onPdfUp,
      setDocView, openDoc, openFile,
      cfg, cfgSaveHint, saveApiKey, savePaddle, clearKey, clearPaddle, rebuild,
      ingest, projectOptions, folderOptions, deptOptions,
      folderModal, metaModal,
      openFolderModal, confirmCreateFolder, removeFolderNode, organizeCurrentProject,
      openEditMeta, confirmSaveMeta, onIngestTypeChange,
      triggerFolderUpload, onFolderInputPicked,
      openIngest, onIngestFile, onIngestOk, resetIngest, onIngestCancel, onIngestDismiss,
      batchHasGap, retryBatchFromBreak, retryBatchItem, shortBatchStatus, onDocOp,
      toggleTheme, terminalClock, marketHours,
      dashboardLayout, dashCustomizeOpen, dashCompact, dashPulseOpen, dashTickerMode, dashMaximizedId, dashPulseWidth, dashWatchlistWidth,
      editingWsKey, editingWsName, startWsRename, commitWsRename, cancelWsRename, deleteDashboardWorkspaceById, deleteMarketWorkspaceById,
      removeDashboardWidget, removeMarketWidget,
      activeWorkspaceObj, activeDashboardWidgets, missingDashboardWidgets, readyConnectorCount,
      widgetMeta, addDashboardWidget, loadDashboardLayout, saveDashboardLayout, saveDashboardLayoutDebounced,
      switchDashboardWorkspace, toggleDashboardLock, createDashboardWorkspace, duplicateDashboardWorkspace, deleteDashboardWorkspace,
      compactWorkspaceWidgets, resolveWidgetOverlap, moveDashboardWidget, resetDashboardLayout, jumpToConnectorSettings,
      marketLayout, mktCustomizeOpen, mktCompact, mktMaximizedId, mktDetailWidth, mktDetailChartHeight,
      activeMarketWorkspaceObj, activeMarketWidgets, missingMarketWidgets,
      mktWidgetMeta, marketPanelItems, marketMoverItems, addMarketWidget, loadMarketLayout, saveMarketLayout, saveMarketLayoutDebounced,
      switchMarketWorkspace, toggleMarketLock, createMarketWorkspace, duplicateMarketWorkspace, deleteMarketWorkspace, resetMarketLayout,
      customWidgets, widgetGalleryOpen, widgetGalleryScope, isQuantWidgetType,
      loadCustomWidgets, openWidgetGallery, onAddBuiltinFromGallery, onAddCustomFromGallery, onUpdateWidgetConfig,
      widgetCfgOpen, widgetCfgScope, widgetCfgTarget, openWidgetConfig, onPatchWidgetFromDrawer, onSaveWidgetAsCustom, pinWatchlistSymbol,
      onSaveCustomFromStudio, onDeleteCustomWidget, onUpdateCustomThumb,
      onSaveVisualToLibrary, onPinVisualToDashboard, onCreateTopicBoard, onAskAiFromWidget,
      marketOverview, marketLoading, marketSectors, marketMovers, macroData, geoData, macroFxGrid, macroSpreadSummary,
      chartOpts, dashWlSelected, dashWlInterval, dashKlineData,
      getDashWlSelected, getDashWlInterval, getDashKlineData, loadDashKlineFor, selectDashWatchItemFor, setDashWlInterval,
      getMktWidgetInterval, getMktKlineData, setMktWidgetSymbol, clearMktWidgetSymbol, setMktWidgetInterval,
      liveWireLang, setLiveWireLang, liveWireItemsFor, addSymbolToWatchlistAndPick, onDashboardQuickPickSymbol,
      mktView, mktInterval, mktDetailOpen, mktSelectedSecid, mktSelectedSymbol, mktSelectedName, mktKlineData, mktTechSummary,
      mktSearchQuery, mktSearchHits, mktSearchOpen, mktProxyTesting, testMarketProxy,
      fmtPrice, fmtPct, fmtCompact,
      loadMarketOverview, loadDashKline, loadMarketKline, loadMarketSectors, loadMarketMovers, loadMacroData, loadGeoData,
      refreshDashboardAll, selectDashWatchItem, selectMarketSymbol, openMarketDetail,
      onPickKlineNewsMarker, onPickSector, onMktSearchInput, isInWatchlist, toggleWatchlistSymbol,
      askAiAboutSymbol, askAiMacro, askAiGeo,
      newsStatus, newsFeeds, newsItems, newsTotal, newsLoading, newsLoadingMore, newsHasMore, newsFetching, newsTranslating, newsEmbedding,
      newsListEl, newsVirtStart, newsVirtRows, onNewsListScroll, loadMoreNews,
      newsSelectedItem, newsDetailLoading, newsViewMode, newsSearchMode, newsLastSearchMode, showBreakingBanner,
      breakingIdx, currentBreaking, nextBreaking, newsReindexing, reindexNewsAll, newsFilters, newsCategories,
      newsEntities, entityGraph, entityGraphLayout, entityPulseHours, entityHoverId, entityGraphRefreshTick, entityMaxMentions, entityTypeMeta,
      entityDrawerOpen, entityProfile, entityLoading,
      panelRefreshing, panelJustRefreshed, panelRefreshedAt, refreshPanel, refreshEntityPulse, setEntityPulseHours,
      sentimentGauge, sentimentSignals, toneRatio,
      newsBriefText, newsBriefLoading, briefModalOpen,
      newFeedForm, newGlossaryForm, opmlInput, newsModelSelectVal, onNewsModelPick,
      sentimentLabel, langPct, formatNewsTime,
      loadNewsStatus, loadNewsFeeds, loadNewsItems, runNewsSearch, markAllNewsRead, embedNewsNow,
      loadNewsEntities, loadEntityGraph, openEntityDossier, filterNewsByEntity, askAiAboutEntity,
      loadNewsBrief, openBriefModal,
      selectNewsItem, fetchNewsNow, translatePendingNews, translateNewsFull, toggleNewsStar,
      saveNewFeed, toggleFeedEnabled, deleteNewsFeed, importPresetFeeds, triggerOpmlImport, onOpmlFilePicked, exportOpml,
      loadDefaultGlossary, addGlossaryTerm, removeGlossaryTerm, openNewsSettings, openNewsInBrowser,
      askNewsOpen, askNewsMode, askNewsFloatStyle, askNewsPicked, askNewsPickedCount, citedNews,
      toggleAskNews, toggleAskNewsPick, removeCitedNews, citeSelectedNewsToAsk, sendNewsToChat, onAskNewsDragStart,
    }
  },
}

const MATRIX = { cols: 3, rows: 3, duration: 1500 }
const matrixNodes = new Set()
let matrixRaf = 0

function matrixRemap(val) {
  const base = 0.08
  const mid = 0.34
  const peak = 0.94
  if (val <= 0.08) return (val / 0.08) * base
  if (val <= 0.34) return base + ((val - 0.08) / (0.26)) * (mid - base)
  return mid + ((val - 0.34) / 0.66) * (peak - mid)
}

function matrixColor(intensity) {
  const t = matrixRemap(intensity)
  const r = 39 + (255 - 39) * t
  const g = 39 + (255 - 39) * t
  const b = 42 + (255 - 42) * t
  const a = 0.08 + 0.92 * t
  return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ',' + a.toFixed(3) + ')'
}

function matrixFrame(now) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const p = reduce ? 0 : (now % MATRIX.duration) / MATRIX.duration
  const p2 = p * Math.PI * 2
  const { cols, rows } = MATRIX
  for (const canvas of matrixNodes) {
    const ctx = canvas.getContext('2d')
    const dpr = canvas._dpr || 1
    const size = canvas.clientWidth || canvas.width / dpr
    const gap = Math.max(1, size * 0.1)
    const dot = (size - (cols - 1) * gap) / cols
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    for (let r = 0; r < rows; r++) {
      const normR = r / (rows - 1)
      for (let c = 0; c < cols; c++) {
        const normC = c / (cols - 1)
        const intensity = Math.max(0, Math.sin((normC - normR + 1) * Math.PI - p2))
        ctx.fillStyle = matrixColor(Math.min(1, intensity))
        const x = c * (dot + gap) + dot / 2
        const y = r * (dot + gap) + dot / 2
        ctx.beginPath()
        ctx.arc(x, y, dot / 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  matrixRaf = reduce || !matrixNodes.size ? 0 : requestAnimationFrame(matrixFrame)
}

function matrixBind(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const size = canvas.clientWidth || 13
  canvas._dpr = dpr
  canvas.width = Math.round(size * dpr)
  canvas.height = Math.round(size * dpr)
  canvas.style.width = '1em'
  canvas.style.height = '1em'
  matrixNodes.add(canvas)
  if (!matrixRaf) matrixRaf = requestAnimationFrame(matrixFrame)
}

function matrixUnbind(canvas) {
  matrixNodes.delete(canvas)
  if (!matrixNodes.size && matrixRaf) {
    cancelAnimationFrame(matrixRaf)
    matrixRaf = 0
  }
}

const MatrixLoader = {
  template: '<canvas class="matrix-loader" aria-hidden="true" title="生成中"></canvas>',
  mounted() { matrixBind(this.$el) },
  beforeUnmount() { matrixUnbind(this.$el) },
}

const O2Empty = {
  props: { description: { type: String, default: '暂无数据' } },
  template: `
    <div class="o2-empty">
      <div class="o2-empty-art" aria-hidden="true">
        <svg viewBox="0 0 88 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="14" y="14" width="60" height="40" rx="8" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.16" stroke-width="1.5"/>
          <path d="M26 26h24M26 34h36M26 42h18" stroke="currentColor" stroke-opacity="0.24" stroke-width="2" stroke-linecap="round"/>
          <circle cx="66" cy="18" r="10" fill="var(--background, #fff)" stroke="var(--primary, #2563eb)" stroke-opacity="0.45" stroke-width="1.5"/>
          <path d="M63 18h6M66 15v6" stroke="var(--primary, #2563eb)" stroke-opacity="0.65" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="o2-empty-desc">{{ description }}</div>
    </div>
  `,
}

const SparkLine = {
  props: {
    values: { type: Array, default: () => [] },
    up: { type: Boolean, default: true },
  },
  computed: {
    points() {
      const arr = (this.values || []).map(Number).filter(Number.isFinite)
      if (arr.length < 2) return ''
      const min = Math.min(...arr)
      const max = Math.max(...arr)
      const span = max - min || 1
      return arr.map((v, i) => {
        const x = ((i / (arr.length - 1)) * 54 + 1).toFixed(1)
        const y = (16 - ((v - min) / span) * 14).toFixed(1)
        return `${x},${y}`
      }).join(' ')
    },
    stroke() {
      return this.up ? 'var(--up, #10b981)' : 'var(--down, #ef4444)'
    },
  },
  template: `
    <svg viewBox="0 0 56 18" style="width:56px;height:18px;flex:none;display:block">
      <polyline v-if="points" :points="points" fill="none" :stroke="stroke" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `,
}

const KlineChart = {
  props: {
    data: { type: Object, default: null },
    theme: { type: String, default: 'light' },
    showMa: { type: Boolean, default: true },
    showBoll: { type: Boolean, default: false },
    showVol: { type: Boolean, default: true },
    showMarkers: { type: Boolean, default: true },
    redlines: { type: Array, default: () => [] },
  },
  emits: ['pick-marker'],
  setup(props, { emit }) {
    const elRef = ref(null)
    let chart = null
    let candleSeries = null
    let volSeries = null
    let ma5Series = null
    let ma20Series = null
    let bollUpSeries = null
    let bollDnSeries = null
    let activePriceLines = []
    let ro = null
    let markersByTime = {}

    function chartOptsTheme() {
      const dark = props.theme === 'dark'
      return {
        layout: {
          background: { type: ColorType.Solid, color: dark ? '#0b0f17' : '#ffffff' },
          textColor: dark ? '#94a3b8' : '#475569',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: dark ? '#1e293b' : '#f1f5f9' },
          horzLines: { color: dark ? '#1e293b' : '#f1f5f9' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: dark ? '#1e293b' : '#e2e8f0' },
        timeScale: { borderColor: dark ? '#1e293b' : '#e2e8f0', timeVisible: false },
      }
    }

    function dedupSort(list) {
      const seen = new Set()
      return (list || []).slice().sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)).filter((x) => {
        if (!x || !x.time || seen.has(x.time)) return false
        seen.add(x.time)
        return true
      })
    }

    function ensureChart() {
      const el = elRef.value
      if (!el || !el.clientWidth || !el.clientHeight) return
      if (!chart) {
        chart = createChart(el, {
          width: el.clientWidth,
          height: el.clientHeight,
          ...chartOptsTheme(),
        })
        candleSeries = chart.addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ef4444',
          borderVisible: false,
          wickUpColor: '#10b981',
          wickDownColor: '#ef4444',
        })
        volSeries = chart.addHistogramSeries({
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        })
        volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
        ma5Series = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        ma20Series = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        bollUpSeries = chart.addLineSeries({ color: '#38bdf8', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
        bollDnSeries = chart.addLineSeries({ color: '#38bdf8', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
        chart.subscribeClick((param) => {
          if (!param || !param.time) return
          const mk = markersByTime[String(param.time)]
          if (mk) emit('pick-marker', mk)
        })
      } else {
        chart.applyOptions(chartOptsTheme())
      }
      renderData()
    }

    function renderData() {
      if (!chart || !candleSeries) return
      const d = props.data
      const bars = dedupSort((d && d.bars) || [])
      candleSeries.setData(bars.map((b) => ({
        time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
      })))
      if (volSeries) {
        volSeries.setData(props.showVol ? bars.map((b) => ({
          time: b.time,
          value: b.volume || 0,
          color: b.close >= b.open ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)',
        })) : [])
      }
      const ind = (d && d.indicators) || {}
      if (ma5Series) ma5Series.setData(props.showMa ? dedupSort(ind.ma5 || []) : [])
      if (ma20Series) ma20Series.setData(props.showMa ? dedupSort(ind.ma20 || []) : [])
      const bollArr = props.showBoll ? dedupSort(ind.boll || []) : []
      if (bollUpSeries) bollUpSeries.setData(bollArr.map((x) => ({ time: x.time, value: x.upper })).filter((x) => Number.isFinite(x.value)))
      if (bollDnSeries) bollDnSeries.setData(bollArr.map((x) => ({ time: x.time, value: x.lower })).filter((x) => Number.isFinite(x.value)))

      // 更新多条自定义预警线
      for (const pl of activePriceLines) {
        try { candleSeries.removePriceLine(pl) } catch (e) { /* ignore */ }
      }
      activePriceLines = []
      for (const rl of (props.redlines || [])) {
        const pr = Number(rl && rl.price)
        if (!Number.isFinite(pr)) continue
        try {
          activePriceLines.push(candleSeries.createPriceLine({
            price: pr,
            color: (rl && rl.color) || '#f43f5e',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: (rl && rl.label) || '预警线',
          }))
        } catch (e) { /* ignore */ }
      }

      markersByTime = {}
      const rawMarkers = props.showMarkers ? ((d && d.markers) || []) : []
      for (const m of rawMarkers) {
        if (m && m.time && !markersByTime[m.time]) markersByTime[m.time] = m
      }
      candleSeries.setMarkers(rawMarkers)
      if (bars.length) chart.timeScale().fitContent()
    }

    onMounted(() => {
      let rafId = 0
      nextTick(() => {
        ensureChart()
        if (elRef.value && typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver((entries) => {
            const cr = entries[0] && entries[0].contentRect
            if (!cr || cr.width <= 0 || cr.height <= 0) return
            const w = Math.floor(cr.width)
            const h = Math.floor(cr.height)
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => {
              rafId = 0
              if (!elRef.value) return
              if (!chart) ensureChart()
              else chart.applyOptions({ width: w, height: h })
            })
          })
          ro.observe(elRef.value)
        }
      })
      onBeforeUnmount(() => {
        if (rafId) cancelAnimationFrame(rafId)
      })
    })
    watch(() => [props.data, props.showMa, props.showBoll, props.showVol, props.showMarkers, props.redlines], () => nextTick(ensureChart), { deep: true })
    watch(() => props.theme, () => nextTick(ensureChart))
    onBeforeUnmount(() => {
      if (ro) ro.disconnect()
      if (chart) { chart.remove(); chart = null }
    })

    return { elRef }
  },
  template: '<div ref="elRef" style="width:100%;height:100%;min-height:0"></div>',
}

const SectorTreemap = {
  props: {
    items: { type: Array, default: () => [] },
    theme: { type: String, default: 'light' },
    height: { type: String, default: '100%' },
  },
  emits: ['pick'],
  setup(props, { emit }) {
    const elRef = ref(null)
    let inst = null
    let ro = null
    let rafId = 0

    function pctColor(pct) {
      const p = Number(pct) || 0
      if (p >= 3) return '#059669'
      if (p >= 1) return '#10b981'
      if (p > 0) return '#34d399'
      if (p <= -3) return '#b91c1c'
      if (p <= -1) return '#ef4444'
      if (p < 0) return '#f87171'
      return '#64748b'
    }

    function draw() {
      const el = elRef.value
      if (!el || !el.clientWidth || !el.clientHeight) return
      if (!inst) {
        inst = echarts.init(el)
        inst.on('click', (p) => {
          if (p && p.data && p.data.raw) emit('pick', p.data.raw)
        })
      }
      const data = (props.items || []).map((it) => ({
        name: it.name,
        value: Math.max(1, Number(it.mkt_cap) || 1),
        pct: it.pct,
        inflow: it.net_inflow,
        raw: it,
        itemStyle: {
          color: pctColor(it.pct),
          borderColor: props.theme === 'dark' ? '#0b0f17' : '#ffffff',
          borderWidth: 1,
        },
      }))
      inst.setOption({
        animationDurationUpdate: 180,
        tooltip: {
          formatter(info) {
            const d = info.data || {}
            const p = Number(d.pct || 0)
            const inf = ((Number(d.inflow) || 0) / 1e8).toFixed(2)
            return `<b>${d.name || ''}</b><br/>涨跌: ${p >= 0 ? '+' : ''}${p.toFixed(2)}%<br/>主力净流: ${inf}亿`
          },
        },
        series: [{
          type: 'treemap',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          left: 0, right: 0, top: 0, bottom: 0,
          label: {
            show: true,
            color: '#fff',
            fontSize: el.clientWidth < 320 || el.clientHeight < 180 ? 9.5 : 11,
            formatter(p) {
              const pct = Number((p.data && p.data.pct) || 0)
              return `${p.name}\n${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
            },
          },
          data,
        }],
      })
    }

    onMounted(() => {
      nextTick(() => {
        draw()
        if (elRef.value && typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver((entries) => {
            const cr = entries[0] && entries[0].contentRect
            if (!cr || cr.width <= 0 || cr.height <= 0) return
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => {
              rafId = 0
              if (!elRef.value) return
              if (!inst) draw()
              else inst.resize()
            })
          })
          ro.observe(elRef.value)
        }
      })
    })
    watch(() => [props.items, props.theme], () => nextTick(draw))
    onBeforeUnmount(() => {
      if (rafId) cancelAnimationFrame(rafId)
      if (ro) ro.disconnect()
      if (inst) { inst.dispose(); inst = null }
    })

    return { elRef }
  },
  template: `<div ref="elRef" :style="{ width: '100%', height: height, minHeight: 0, flex: height === '100%' ? '1 1 auto' : undefined }"></div>`,
}

const YieldChart = {
  props: {
    rates: { type: Array, default: () => [] },
    theme: { type: String, default: 'light' },
    height: { type: String, default: '100%' },
  },
  setup(props) {
    const elRef = ref(null)
    let inst = null
    let ro = null
    let rafId = 0

    function draw() {
      const el = elRef.value
      if (!el || !el.clientWidth || !el.clientHeight) return
      if (!inst) inst = echarts.init(el)
      const dark = props.theme === 'dark'
      const xs = (props.rates || []).map((r) => String(r.label || '').replace('Treasury ', '').replace('Inflation-Protected Securities ', ''))
      const ys = (props.rates || []).map((r) => Number(r.rate) || 0)
      inst.setOption({
        animationDurationUpdate: 150,
        grid: { left: 10, right: 12, top: 14, bottom: 18, containLabel: true },
        tooltip: { trigger: 'axis', confine: true },
        xAxis: {
          type: 'category',
          data: xs,
          axisLabel: { fontSize: 9, color: dark ? '#94a3b8' : '#64748b', hideOverlap: true },
          axisLine: { lineStyle: { color: dark ? '#1e293b' : '#cbd5e1' } },
        },
        yAxis: {
          type: 'value',
          scale: true,
          axisLabel: { fontSize: 9, color: dark ? '#94a3b8' : '#64748b', formatter: '{value}%' },
          splitLine: { lineStyle: { color: dark ? '#1e293b' : '#f1f5f9' } },
        },
        series: [{
          type: 'line',
          smooth: true,
          data: ys,
          lineStyle: { width: 2, color: '#3b82f6' },
          itemStyle: { color: '#3b82f6' },
          areaStyle: { color: 'rgba(59,130,246,0.14)' },
        }],
      })
    }

    onMounted(() => {
      nextTick(() => {
        draw()
        if (elRef.value && typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver((entries) => {
            const cr = entries[0] && entries[0].contentRect
            if (!cr || cr.width <= 0 || cr.height <= 0) return
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => {
              rafId = 0
              if (!elRef.value) return
              if (!inst) draw()
              else inst.resize()
            })
          })
          ro.observe(elRef.value)
        }
      })
    })
    watch(() => [props.rates, props.theme], () => nextTick(draw))
    onBeforeUnmount(() => {
      if (rafId) cancelAnimationFrame(rafId)
      if (ro) ro.disconnect()
      if (inst) { inst.dispose(); inst = null }
    })

    return { elRef }
  },
  template: `<div ref="elRef" :style="{ width: '100%', height: height, minHeight: 0, flex: height === '100%' ? '1 1 auto' : undefined }"></div>`,
}

const EntityNetworkGraph = {
  props: {
    nodes: { type: Array, default: () => [] },
    edges: { type: Array, default: () => [] },
    theme: { type: String, default: 'light' },
    highlightId: { type: [Number, String], default: null },
    refreshTick: { type: Number, default: 0 },
    isMaximized: { type: Boolean, default: false },
  },
  emits: ['pick', 'hover'],
  setup(props, { emit }) {
    const elRef = ref(null)
    const isRoamed = ref(false)
    let inst = null
    let ro = null
    let rafId = 0
    let lastW = 0
    let lastH = 0
    let renderedIds = []

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    function sentimentColor(ns) {
      const v = Number(ns) || 0
      if (v > 0.08) return '#10b981'
      if (v < -0.08) return '#ef4444'
      return '#3b82f6'
    }

    function computeLayout(nodesRaw, edgesRaw, width, height) {
      const compact = !props.isMaximized && width < 420
      const maxCount = props.isMaximized ? 22 : (width < 320 ? 10 : (width < 460 ? 12 : 16))
      const top = (nodesRaw || []).slice(0, maxCount)
      if (!top.length) return { nodes: [], edges: [] }

      const w = Math.max(220, width)
      const h = Math.max(124, height)
      const cx = w / 2
      const cy = h / 2 - 4
      const maxMentions = Math.max(1, ...top.map((n) => Number(n.mentions) || 1))
      const minR = compact ? 7 : 9
      const maxR = compact ? 15 : 22

      const idSet = new Set(top.map((n) => String(n.id)))
      const degMap = new Map()
      for (const e of edgesRaw || []) {
        const s = String(e.source)
        const t = String(e.target)
        if (!idSet.has(s) || !idSet.has(t)) continue
        degMap.set(s, (degMap.get(s) || 0) + (Number(e.weight) || 1))
        degMap.set(t, (degMap.get(t) || 0) + (Number(e.weight) || 1))
      }

      // 初始放置：最高热度节点居中，其余按黄金角均匀展开避免对称堆叠
      const items = top.map((n, idx) => {
        const ratio = Math.sqrt((Number(n.mentions) || 1) / maxMentions)
        const r = minR + ratio * (maxR - minR)
        const shortName = String(n.canonical_name || '').slice(0, compact ? 6 : 8)
        const labelLen = shortName.length
        const hw = Math.max(r + 6, labelLen * (compact ? 4.8 : 5.4))
        const hh = r + (compact ? 11 : 13)
        let x = cx
        let y = cy
        if (idx > 0) {
          const frac = idx / Math.max(1, top.length - 1)
          const angle = idx * 2.399963229728653 - Math.PI / 2
          const rx = (w * 0.36) * (0.42 + 0.58 * Math.sqrt(frac))
          const ry = (h * 0.36) * (0.42 + 0.58 * Math.sqrt(frac))
          x = cx + Math.cos(angle) * rx
          y = cy + Math.sin(angle) * ry
        }
        return {
          raw: n,
          id: String(n.id),
          name: String(n.canonical_name || ''),
          shortName,
          r,
          hw,
          hh,
          x,
          y,
          vx: 0,
          vy: 0,
          idx,
          deg: degMap.get(String(n.id)) || 0,
        }
      })

      const idxById = new Map(items.map((it, i) => [it.id, i]))
      const validEdges = []
      for (const e of edgesRaw || []) {
        const si = idxById.get(String(e.source))
        const ti = idxById.get(String(e.target))
        if (si == null || ti == null || si === ti) continue
        validEdges.push({
          si,
          ti,
          source: items[si].id,
          target: items[ti].id,
          srcName: items[si].name,
          dstName: items[ti].name,
          weight: Math.max(1, Number(e.weight) || 1),
        })
      }

      const idealEdge = Math.max(54, Math.min(w, h) * 0.36)
      const iters = 130
      for (let step = 0; step < iters; step++) {
        const cooling = 1 - step / iters
        // 节点+标签包围盒互斥（杜绝圆圈和文字互相重叠）
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const a = items[i]
            const b = items[j]
            let dx = b.x - a.x
            let dy = b.y - a.y
            if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
              dx = (i % 2 === 0 ? 1 : -1) * 0.6
              dy = (j % 2 === 0 ? 1 : -1) * 0.6
            }
            const dist = Math.hypot(dx, dy) || 0.01
            const nx = dx / dist
            const ny = dy / dist

            // 常规库仑斥力
            const rep = (compact ? 680 : 1250) / (dist * dist + 140)
            a.vx -= nx * rep
            a.vy -= ny * rep
            b.vx += nx * rep
            b.vy += ny * rep

            // 矩形标签盒硬防重叠分离
            const reqX = a.hw + b.hw + 6
            const reqY = a.hh + b.hh + 4
            const ovX = reqX - Math.abs(dx)
            const ovY = reqY - Math.abs(dy)
            if (ovX > 0 && ovY > 0) {
              if (ovX / reqX < ovY / reqY) {
                const push = ovX * 0.42 * (dx >= 0 ? 1 : -1)
                a.vx -= push
                b.vx += push
              } else {
                const push = ovY * 0.42 * (dy >= 0 ? 1 : -1)
                a.vy -= push
                b.vy += push
              }
            }
          }
        }

        // 共现边引力
        for (const ed of validEdges) {
          const a = items[ed.si]
          const b = items[ed.ti]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.hypot(dx, dy) || 0.01
          const pull = (dist - idealEdge) * 0.018 * Math.min(2.2, 0.7 + Math.log1p(ed.weight) * 0.45)
          const fx = (dx / dist) * pull
          const fy = (dy / dist) * pull
          a.vx += fx
          a.vy += fy
          b.vx -= fx
          b.vy -= fy
        }

        // 中心向心力 + 边界约束（留足底部文字空间）
        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const grav = i === 0 ? 0.065 : 0.022
          it.vx += (cx - it.x) * grav
          it.vy += (cy - it.y) * grav

          const damping = 0.56 * (0.4 + 0.6 * cooling)
          const maxStep = 14 * (0.25 + 0.75 * cooling)
          const stepX = Math.max(-maxStep, Math.min(maxStep, it.vx * damping))
          const stepY = Math.max(-maxStep, Math.min(maxStep, it.vy * damping))
          it.x += stepX
          it.y += stepY
          it.vx *= 0.25
          it.vy *= 0.25

          const padX = Math.min(w * 0.42, Math.max(26, it.hw + 4))
          const padTop = Math.min(h * 0.4, it.r + 10)
          const padBot = Math.min(h * 0.42, it.r + 22)
          it.x = Math.max(padX, Math.min(w - padX, it.x))
          it.y = Math.max(padTop, Math.min(h - padBot, it.y))
        }
      }

      return { nodes: items, edges: validEdges, compact }
    }

    function draw(resetZoom = false) {
      const el = elRef.value
      if (!el || !el.clientWidth || !el.clientHeight) return
      const w = el.clientWidth
      const h = el.clientHeight
      lastW = w
      lastH = h

      if (!inst) {
        inst = echarts.init(el)
        inst.on('click', (p) => {
          if (p && p.dataType === 'node' && p.data && p.data.raw) {
            emit('pick', p.data.raw.canonical_name)
          }
        })
        inst.on('mouseover', (p) => {
          if (p && p.dataType === 'node' && p.data && p.data.raw) {
            emit('hover', p.data.raw.id)
          }
        })
        inst.on('mouseout', (p) => {
          if (p && p.dataType === 'node') {
            emit('hover', null)
          }
        })
        inst.on('graphroam', () => {
          isRoamed.value = true
        })
      }

      const dark = props.theme === 'dark'
      const { nodes, edges, compact } = computeLayout(props.nodes, props.edges, w, h)
      renderedIds = nodes.map((n) => n.id)

      const maxW = Math.max(1, ...edges.map((e) => e.weight))
      const bgHalo = dark ? '#0b0f17' : '#fafafa'
      const txtColor = dark ? '#e2e8f0' : '#0f172a'
      const edgeColor = dark ? 'rgba(148, 163, 184, 0.26)' : 'rgba(100, 116, 139, 0.28)'

      const graphNodes = nodes.map((nd) => {
        const col = sentimentColor(nd.raw.net_sentiment)
        const fillAlpha = dark ? '3d' : '2b'
        return {
          id: nd.id,
          name: nd.name,
          x: Math.round(nd.x * 10) / 10,
          y: Math.round(nd.y * 10) / 10,
          symbolSize: Math.round(nd.r * 2),
          value: nd.raw.mentions,
          raw: nd.raw,
          itemStyle: {
            color: col + fillAlpha,
            borderColor: col,
            borderWidth: nd.idx < 3 ? 2 : 1.5,
            shadowBlur: nd.idx < 3 ? 8 : 0,
            shadowColor: nd.idx < 3 ? (col + '55') : 'transparent',
          },
          label: {
            show: true,
            position: 'bottom',
            distance: 3,
            formatter: nd.shortName,
            color: txtColor,
            fontSize: compact ? 10 : 11,
            fontWeight: nd.idx < 3 ? 600 : 400,
            textBorderColor: bgHalo,
            textBorderWidth: 2.5,
          },
        }
      })

      const graphLinks = edges.map((ed) => ({
        source: ed.source,
        target: ed.target,
        value: ed.weight,
        srcName: ed.srcName,
        dstName: ed.dstName,
        lineStyle: {
          color: edgeColor,
          width: Math.max(1, Math.min(3.2, 0.9 + (ed.weight / maxW) * 2.2)),
          curveness: 0.16,
          opacity: 0.85,
        },
      }))

      const option = {
        animationDuration: 360,
        animationDurationUpdate: 420,
        animationEasingUpdate: 'cubicOut',
        tooltip: {
          confine: true,
          backgroundColor: dark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.96)',
          borderColor: dark ? '#334155' : '#cbd5e1',
          borderWidth: 1,
          textStyle: { color: txtColor, fontSize: 11.5 },
          formatter(p) {
            if (p.dataType === 'edge' && p.data) {
              return `<div style="font-weight:600;margin-bottom:2px">${esc(p.data.srcName)} ↔ ${esc(p.data.dstName)}</div>`
                + `<div style="color:${dark ? '#94a3b8' : '#64748b'}">共现关联：<b>${p.data.value}</b> 篇情报</div>`
            }
            const r = p.data && p.data.raw
            if (!r) return ''
            const ns = Number(r.net_sentiment) || 0
            const nsTxt = (ns > 0 ? '+' : '') + ns.toFixed(2)
            const nsCol = sentimentColor(ns)
            return `<div style="font-weight:700;margin-bottom:3px">${esc(r.canonical_name)} <span style="font-weight:500;font-size:10px;opacity:.75">[${esc(r.entity_type || 'ORG')}]</span></div>`
              + `<div>提及次数：<b>${r.mentions || 0}</b>（多 ${r.bullish || 0} / 中 ${r.neutral || 0} / 空 ${r.bearish || 0}）</div>`
              + `<div>净情绪：<b style="color:${nsCol}">${nsTxt}</b></div>`
              + `<div style="margin-top:3px;font-size:10px;opacity:.7">点击查看实体详情档案</div>`
          },
        },
        series: [{
          type: 'graph',
          layout: 'none',
          roam: true,
          scaleLimit: { min: 0.65, max: 3.2 },
          zoom: resetZoom ? 1 : undefined,
          center: resetZoom ? null : undefined,
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          data: graphNodes,
          links: graphLinks,
          labelLayout: { hideOverlap: true },
          emphasis: {
            focus: 'adjacency',
            scale: 1.18,
            lineStyle: {
              width: 2.6,
              color: '#3b82f6',
              opacity: 0.95,
            },
          },
          blur: {
            itemStyle: { opacity: 0.22 },
            lineStyle: { opacity: 0.08 },
            label: { opacity: 0.28 },
          },
        }],
      }

      if (resetZoom) isRoamed.value = false
      inst.setOption(option, true)
    }

    function resetView() {
      draw(true)
    }

    onMounted(() => {
      nextTick(() => {
        draw(true)
        if (elRef.value && typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver((entries) => {
            const cr = entries[0] && entries[0].contentRect
            if (!cr || cr.width <= 0 || cr.height <= 0) return
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => {
              rafId = 0
              if (!elRef.value) return
              if (!inst || Math.abs(cr.width - lastW) > 18 || Math.abs(cr.height - lastH) > 18) {
                if (inst) inst.resize()
                draw(true)
              } else {
                inst.resize()
              }
            })
          })
          ro.observe(elRef.value)
        }
      })
    })

    watch(() => [props.nodes, props.edges, props.theme, props.refreshTick, props.isMaximized], () => {
      nextTick(() => draw(true))
    })

    watch(() => props.highlightId, (val) => {
      if (!inst) return
      try {
        inst.dispatchAction({ type: 'downplay', seriesIndex: 0 })
        if (val != null) {
          const idx = renderedIds.indexOf(String(val))
          if (idx >= 0) {
            inst.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: idx })
          }
        }
      } catch (e) { /* ignore */ }
    })

    onBeforeUnmount(() => {
      if (rafId) cancelAnimationFrame(rafId)
      if (ro) ro.disconnect()
      if (inst) { inst.dispose(); inst = null }
    })

    return { elRef, isRoamed, resetView }
  },
  template: `
    <div style="position:relative;width:100%;height:100%">
      <div ref="elRef" style="width:100%;height:100%"></div>
      <div v-if="isRoamed" class="ep-graph-tools">
        <button type="button" class="ep-mini-btn" @click.stop="resetView" title="重置缩放与位置">重置视角</button>
      </div>
      <div class="ep-graph-hint">滚轮缩放 · 悬停高亮关联 · 点击看档案</div>
    </div>
  `,
}

const SplitResizer = {
  props: {
    direction: { type: String, default: 'v' }, // 'v' vertical divider (resizes width), 'h' horizontal divider (resizes height)
    modelValue: { type: Number, required: true },
    min: { type: Number, default: 160 },
    max: { type: Number, default: 640 },
    reverse: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'commit'],
  setup(props, { emit }) {
    const dragging = ref(false)
    let rafId = 0
    function onDown(e) {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      dragging.value = true
      const startPos = props.direction === 'v' ? e.clientX : e.clientY
      const startVal = Number(props.modelValue) || props.min
      const bodyCls = props.direction === 'v' ? 'is-splitting-v' : 'is-splitting-h'
      document.body.classList.add(bodyCls)
      let latest = startVal

      function onMove(ev) {
        const curPos = props.direction === 'v' ? ev.clientX : ev.clientY
        const delta = (curPos - startPos) * (props.reverse ? -1 : 1)
        latest = Math.round(Math.max(props.min, Math.min(props.max, startVal + delta)))
        if (rafId) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          rafId = 0
          emit('update:modelValue', latest)
        })
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
        dragging.value = false
        document.body.classList.remove(bodyCls)
        emit('update:modelValue', latest)
        emit('commit', latest)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }
    return { dragging, onDown }
  },
  template: `<div :class="[direction === 'v' ? 'sp-bar-v' : 'sp-bar-h', { dragging }]" @pointerdown="onDown" title="拖拽调整分栏大小"></div>`,
}

const FreeGrid = {
  props: {
    items: { type: Array, default: () => [] },
    cols: { type: Number, default: 24 },
    rowHeight: { type: Number, default: 26 },
    gap: { type: Number, default: 6 },
    locked: { type: Boolean, default: false },
    maximizedId: { type: String, default: '' },
  },
  emits: ['layout-commit', 'update:maximizedId'],
  setup(props, { emit }) {
    const canvasRef = ref(null)
    const canvasW = ref(1100)
    const active = ref(null) // { id, mode, left, top, width, height, x, y, w, h, title }
    let ro = null
    let rafId = 0

    function syncWidth() {
      const el = canvasRef.value
      if (el && el.clientWidth > 40) canvasW.value = el.clientWidth
    }

    function colWidth() {
      const c = Math.max(1, props.cols || 24)
      const g = props.gap
      return Math.max(12, (canvasW.value - g * (c - 1)) / c)
    }

    function itemPx(it) {
      const cw = colWidth()
      const g = props.gap
      const rh = props.rowHeight
      const x = Math.max(0, Math.min(props.cols - 1, Number(it.x) || 0))
      const w = Math.max(1, Math.min(props.cols - x, Number(it.w) || 8))
      const y = Math.max(0, Number(it.y) || 0)
      const h = Math.max(2, Number(it.h) || 8)
      return {
        left: x * (cw + g),
        top: y * (rh + g),
        width: w * cw + (w - 1) * g,
        height: h * rh + (h - 1) * g,
      }
    }

    function collides(a, b) {
      if (a.id === b.id) return false
      return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
    }

    function resolveCollisions(moved) {
      const list = props.items || []
      const queue = [moved]
      let iter = 0
      while (queue.length && iter++ < 120) {
        const cur = queue.shift()
        for (const other of list) {
          if (collides(cur, other)) {
            other.y = cur.y + cur.h
            queue.push(other)
          }
        }
      }
      compactVertical(moved.id)
    }

    function compactVertical(pinnedId = '') {
      const list = (props.items || []).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x))
      for (const it of list) {
        if (pinnedId && it.id === pinnedId) continue
        while (it.y > 0) {
          it.y -= 1
          if (list.some((o) => collides(it, o))) {
            it.y += 1
            break
          }
        }
      }
    }

    const canvasHeight = computed(() => {
      const list = props.items || []
      const maxRow = list.reduce((m, it) => Math.max(m, (Number(it.y) || 0) + (Number(it.h) || 8)), 16)
      const actBottom = active.value ? (active.value.y + active.value.h) : 0
      const rows = Math.max(maxRow, actBottom)
      return Math.max(420, rows * (props.rowHeight + props.gap) + 32)
    })

    const canvasStyle = computed(() => {
      const cw = colWidth()
      return {
        height: canvasHeight.value + 'px',
        '--fg-col-step': (cw + props.gap) + 'px',
        '--fg-row-step': (props.rowHeight + props.gap) + 'px',
      }
    })

    function itemStyle(it) {
      if (props.maximizedId && props.maximizedId === it.id) return {}
      if (active.value && active.value.id === it.id) {
        return {
          left: active.value.left + 'px',
          top: active.value.top + 'px',
          width: active.value.width + 'px',
          height: active.value.height + 'px',
        }
      }
      const p = itemPx(it)
      return {
        left: p.left + 'px',
        top: p.top + 'px',
        width: p.width + 'px',
        height: p.height + 'px',
      }
    }

    const ghostStyle = computed(() => {
      if (!active.value) return null
      const p = itemPx(active.value)
      return {
        left: p.left + 'px',
        top: p.top + 'px',
        width: p.width + 'px',
        height: p.height + 'px',
      }
    })

    function startDrag(it, e) {
      if (props.locked || props.maximizedId === it.id) return
      if (e.button !== 0) return
      if (e.target && e.target.closest('button, input, select, textarea, a, .ant-switch, .ant-select')) return
      e.preventDefault()
      syncWidth()
      const orig = itemPx(it)
      const cw = colWidth()
      const g = props.gap
      const rh = props.rowHeight
      const startX = e.clientX
      const startY = e.clientY

      active.value = {
        id: it.id, mode: 'drag', title: it.title || it.id,
        left: orig.left, top: orig.top, width: orig.width, height: orig.height,
        x: it.x, y: it.y, w: it.w, h: it.h,
      }

      function onMove(ev) {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        const nextLeft = Math.max(0, Math.min(Math.max(0, canvasW.value - orig.width), orig.left + dx))
        const nextTop = Math.max(0, orig.top + dy)
        const gx = Math.max(0, Math.min(props.cols - it.w, Math.round(nextLeft / (cw + g))))
        const gy = Math.max(0, Math.round(nextTop / (rh + g)))
        if (active.value) {
          active.value.left = nextLeft
          active.value.top = nextTop
          active.value.x = gx
          active.value.y = gy
        }
        if (gx !== it.x || gy !== it.y) {
          it.x = gx
          it.y = gy
          resolveCollisions(it)
        }
      }

      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        active.value = null
        compactVertical('')
        emit('layout-commit')
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }

    function startResize(it, dir, e) {
      if (props.locked || props.maximizedId === it.id) return
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      syncWidth()
      const orig = itemPx(it)
      const cw = colWidth()
      const g = props.gap
      const rh = props.rowHeight
      const startX = e.clientX
      const startY = e.clientY
      const minW = Math.max(3, Number(it.minW) || 4)
      const minH = Math.max(4, Number(it.minH) || 5)
      const minPxW = minW * cw + (minW - 1) * g
      const minPxH = minH * rh + (minH - 1) * g
      const origRightPx = orig.left + orig.width
      const origRightCol = it.x + it.w

      active.value = {
        id: it.id, mode: 'resize', title: it.title || it.id,
        left: orig.left, top: orig.top, width: orig.width, height: orig.height,
        x: it.x, y: it.y, w: it.w, h: it.h,
      }

      function onMove(ev) {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        let nextLeft = orig.left
        let nextWpx = orig.width
        let nextHpx = orig.height
        let gx = it.x
        let gw = it.w
        let gh = it.h

        if (dir === 'e' || dir === 'se') {
          const maxPxW = (props.cols - it.x) * cw + (props.cols - it.x - 1) * g
          nextWpx = Math.max(minPxW, Math.min(maxPxW, orig.width + dx))
          gw = Math.max(minW, Math.min(props.cols - it.x, Math.round((nextWpx + g) / (cw + g))))
        }
        if (dir === 'w' || dir === 'sw') {
          nextLeft = Math.max(0, Math.min(origRightPx - minPxW, orig.left + dx))
          nextWpx = origRightPx - nextLeft
          gx = Math.max(0, Math.min(origRightCol - minW, Math.round(nextLeft / (cw + g))))
          gw = Math.max(minW, origRightCol - gx)
        }
        if (dir === 's' || dir === 'se' || dir === 'sw') {
          nextHpx = Math.max(minPxH, orig.height + dy)
          gh = Math.max(minH, Math.round((nextHpx + g) / (rh + g)))
        }

        if (active.value) {
          active.value.left = nextLeft
          active.value.width = nextWpx
          active.value.height = nextHpx
          active.value.x = gx
          active.value.w = gw
          active.value.h = gh
        }
        if (gx !== it.x || gw !== it.w || gh !== it.h) {
          it.x = gx
          it.w = gw
          it.h = gh
          resolveCollisions(it)
        }
      }

      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        active.value = null
        compactVertical('')
        emit('layout-commit')
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }

    function toggleMaximize(id) {
      emit('update:maximizedId', props.maximizedId === id ? '' : id)
    }

    function onKeyEsc(e) {
      if (e.key === 'Escape' && props.maximizedId) {
        emit('update:maximizedId', '')
      }
    }

    onMounted(() => {
      nextTick(() => {
        syncWidth()
        if (canvasRef.value && typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver(() => {
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => {
              rafId = 0
              syncWidth()
            })
          })
          ro.observe(canvasRef.value)
        }
      })
      window.addEventListener('keydown', onKeyEsc)
    })

    onBeforeUnmount(() => {
      if (rafId) cancelAnimationFrame(rafId)
      if (ro) ro.disconnect()
      window.removeEventListener('keydown', onKeyEsc)
    })

    return {
      canvasRef, active, canvasStyle, ghostStyle, itemStyle,
      startDrag, startResize, toggleMaximize,
    }
  },
  template: `
    <div ref="canvasRef" :class="['fg-canvas', { unlocked: !locked }]" :style="canvasStyle">
      <div v-if="maximizedId" class="fg-max-backdrop" @click="$emit('update:maximizedId', '')"></div>
      <div v-if="ghostStyle" class="fg-ghost" :style="ghostStyle"></div>
      <div v-for="it in items" :key="it.id"
           :class="['fg-item', { 'is-active': active && active.id === it.id, 'is-max': maximizedId === it.id }]"
           :style="itemStyle(it)">
        <slot name="item"
              :widget="it"
              :is-maximized="maximizedId === it.id"
              :toggle-maximize="() => toggleMaximize(it.id)"
              :start-drag="(e) => startDrag(it, e)" />
        <template v-if="!locked && maximizedId !== it.id">
          <div class="fg-rh fg-rh-e" @pointerdown="startResize(it, 'e', $event)" title="向右拖拽调整宽度"></div>
          <div class="fg-rh fg-rh-w" @pointerdown="startResize(it, 'w', $event)" title="向左拖拽调整宽度"></div>
          <div class="fg-rh fg-rh-s" @pointerdown="startResize(it, 's', $event)" title="向下拖拽调整高度"></div>
          <div class="fg-rh fg-rh-se" @pointerdown="startResize(it, 'se', $event)" title="拖拽自由调整宽与高"></div>
          <div class="fg-rh fg-rh-sw" @pointerdown="startResize(it, 'sw', $event)" title="拖拽自由调整宽与高"></div>
        </template>
      </div>
      <div v-if="active" class="fg-hud ft-mono">
        {{ active.mode === 'drag' ? '移动' : '缩放' }} · {{ active.title }} · X:{{ active.x }} Y:{{ active.y }} · {{ active.w }}/{{ cols }}列 × {{ active.h }}行
      </div>
    </div>
  `,
}

const app = createApp(App)
app.use(Antd)
app.component('matrix-loader', MatrixLoader)
app.component('o2-empty', O2Empty)
app.component('spark-line', SparkLine)
app.component('kline-chart', KlineChart)
app.component('sector-treemap', SectorTreemap)
app.component('yield-chart', YieldChart)
app.component('entity-network-graph', EntityNetworkGraph)
app.component('entity-geo-atlas', EntityGeoAtlas)
app.component('backtest-lab', BacktestLab)
app.component('split-resizer', SplitResizer)
app.component('free-grid', FreeGrid)
app.component('symbol-picker', SymbolPicker)
app.component('o2-echarts', O2Echarts)
app.component('quant-widget', QuantWidget)
app.component('widget-config-drawer', WidgetConfigDrawer)
app.component('lazy-chat-visual', LazyChatVisual)
app.component('widget-gallery-modal', WidgetGalleryModal)
app.mount('#app')
