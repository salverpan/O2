import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue/dist/vue.esm-bundler.js'
import { message } from 'ant-design-vue'
import * as echarts from 'echarts/core'
import {
  TreemapChart, LineChart, BarChart, PieChart, ScatterChart,
  RadarChart, CandlestickChart, HeatmapChart, FunnelChart,
  SankeyChart, GraphChart, GaugeChart,
} from 'echarts/charts'
import {
  TooltipComponent, GridComponent, TitleComponent, LegendComponent,
  DataZoomComponent, MarkLineComponent, MarkPointComponent,
  MarkAreaComponent, VisualMapComponent, RadarComponent, GraphicComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  TreemapChart, LineChart, BarChart, PieChart, ScatterChart,
  RadarChart, CandlestickChart, HeatmapChart, FunnelChart,
  SankeyChart, GraphChart, GaugeChart,
  TooltipComponent, GridComponent, TitleComponent, LegendComponent,
  DataZoomComponent, MarkLineComponent, MarkPointComponent,
  MarkAreaComponent, VisualMapComponent, RadarComponent, GraphicComponent,
  CanvasRenderer,
])

const STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
const STAR_FILL_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
const SEARCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'

function makeSvgThumb(kind) {
  const shapes = {
    pro_kline: `
      <rect x="24" y="20" width="192" height="48" rx="2" fill="rgba(59,130,246,0.07)" stroke="#1e293b"/>
      <path d="M28 56 Q84 26 144 38 T212 28" fill="none" stroke="#60a5fa" stroke-width="1.4" stroke-dasharray="3 2"/>
      <path d="M28 66 Q84 44 144 54 T212 46" fill="none" stroke="#60a5fa" stroke-width="1.4" stroke-dasharray="3 2"/>
      <line x1="48" y1="30" x2="48" y2="62" stroke="#10b981" stroke-width="1.8"/><rect x="44" y="38" width="8" height="16" fill="#10b981"/>
      <line x1="82" y1="34" x2="82" y2="64" stroke="#ef4444" stroke-width="1.8"/><rect x="78" y="42" width="8" height="14" fill="#ef4444"/>
      <line x1="118" y1="24" x2="118" y2="56" stroke="#10b981" stroke-width="1.8"/><rect x="114" y="30" width="8" height="18" fill="#10b981"/>
      <line x1="154" y1="28" x2="154" y2="58" stroke="#10b981" stroke-width="1.8"/><rect x="150" y="34" width="8" height="16" fill="#10b981"/>
      <line x1="190" y1="22" x2="190" y2="52" stroke="#ef4444" stroke-width="1.8"/><rect x="186" y="28" width="8" height="15" fill="#ef4444"/>
      <rect x="38" y="76" width="10" height="14" fill="#10b981" opacity="0.75"/><rect x="56" y="80" width="10" height="10" fill="#10b981" opacity="0.75"/>
      <rect x="74" y="90" width="10" height="10" fill="#ef4444" opacity="0.75"/><rect x="92" y="74" width="10" height="16" fill="#10b981" opacity="0.75"/>
      <path d="M126 96 L152 82 L178 88 L208 76" fill="none" stroke="#f59e0b" stroke-width="2"/>`,
    rebased: `
      <line x1="20" y1="72" x2="220" y2="72" stroke="#475569" stroke-dasharray="3 3"/>
      <path d="M22 72 L64 60 L108 64 L154 38 L216 24" fill="none" stroke="#3b82f6" stroke-width="2.6"/>
      <path d="M22 72 L64 68 L108 58 L154 52 L216 44" fill="none" stroke="#10b981" stroke-width="2.2"/>
      <path d="M22 72 L64 78 L108 82 L154 74 L216 68" fill="none" stroke="#f59e0b" stroke-width="2"/>`,
    formula: `
      <rect x="20" y="26" width="200" height="64" fill="rgba(59,130,246,0.08)"/>
      <line x1="20" y1="26" x2="220" y2="26" stroke="#ef4444" stroke-dasharray="4 3"/>
      <line x1="20" y1="58" x2="220" y2="58" stroke="#64748b" stroke-dasharray="3 3"/>
      <line x1="20" y1="90" x2="220" y2="90" stroke="#10b981" stroke-dasharray="4 3"/>
      <path d="M22 78 L62 64 L98 70 L138 40 L178 46 L218 30" fill="none" stroke="#3b82f6" stroke-width="2.6"/>`,
    barcode: `
      <rect x="24" y="22" width="192" height="10" rx="3" fill="#1e293b"/><rect x="24" y="22" width="178" height="10" rx="3" fill="#ef4444"/>
      <rect x="24" y="40" width="192" height="10" rx="3" fill="#1e293b"/><rect x="24" y="40" width="142" height="10" rx="3" fill="#f59e0b"/>
      <rect x="24" y="58" width="192" height="10" rx="3" fill="#1e293b"/><rect x="24" y="58" width="96" height="10" rx="3" fill="#3b82f6"/>
      <rect x="24" y="76" width="192" height="10" rx="3" fill="#1e293b"/><rect x="24" y="76" width="32" height="10" rx="3" fill="#38bdf8"/>`,
    flow: `
      <line x1="120" y1="18" x2="120" y2="98" stroke="#475569"/>
      <rect x="120" y="24" width="78" height="11" rx="2" fill="#10b981"/>
      <rect x="120" y="40" width="56" height="11" rx="2" fill="#10b981"/>
      <rect x="120" y="56" width="38" height="11" rx="2" fill="#34d399"/>
      <rect x="52" y="72" width="68" height="11" rx="2" fill="#ef4444"/>
      <rect x="74" y="88" width="46" height="11" rx="2" fill="#f87171"/>`,
    quadrant: `
      <line x1="120" y1="16" x2="120" y2="100" stroke="#475569" stroke-dasharray="3 3"/>
      <line x1="22" y1="58" x2="218" y2="58" stroke="#475569" stroke-dasharray="3 3"/>
      <circle cx="172" cy="34" r="11" fill="#10b981" opacity="0.8"/>
      <circle cx="148" cy="44" r="7" fill="#34d399" opacity="0.8"/>
      <circle cx="76" cy="36" r="9" fill="#3b82f6" opacity="0.85"/>
      <circle cx="164" cy="80" r="8" fill="#f59e0b" opacity="0.8"/>
      <circle cx="68" cy="82" r="10" fill="#ef4444" opacity="0.8"/>`,
    shipping: `
      <rect x="34" y="42" width="14" height="52" rx="2" fill="#3b82f6"/><rect x="50" y="58" width="14" height="36" rx="2" fill="#f59e0b"/>
      <rect x="86" y="28" width="14" height="66" rx="2" fill="#3b82f6"/><rect x="102" y="48" width="14" height="46" rx="2" fill="#f59e0b"/>
      <rect x="138" y="36" width="14" height="58" rx="2" fill="#3b82f6"/><rect x="154" y="62" width="14" height="32" rx="2" fill="#f59e0b"/>
      <rect x="186" y="52" width="14" height="42" rx="2" fill="#3b82f6"/>`,
    analog: `
      <line x1="138" y1="18" x2="138" y2="98" stroke="#64748b" stroke-dasharray="3 3"/>
      <path d="M22 82 L56 68 L94 74 L138 46" fill="none" stroke="#f8fafc" stroke-width="2.8"/>
      <path d="M138 46 L168 34 L196 38 L218 22" fill="none" stroke="#3b82f6" stroke-width="2.2" stroke-dasharray="4 3"/>
      <path d="M138 46 L168 50 L196 42 L218 36" fill="none" stroke="#10b981" stroke-width="1.8" stroke-dasharray="3 3"/>
      <path d="M138 46 L168 58 L196 64 L218 54" fill="none" stroke="#f59e0b" stroke-width="1.6" stroke-dasharray="3 3"/>`,
    factor: `
      <polygon points="72,66 116,52 164,36 214,24 214,72 164,76 116,74 72,66" fill="rgba(16,185,129,0.2)" />
      <line x1="72" y1="18" x2="72" y2="98" stroke="#f59e0b" stroke-dasharray="3 3"/>
      <path d="M24 72 L48 69 L72 66 L116 58 L164 48 L214 38" fill="none" stroke="#10b981" stroke-width="2.6"/>`,
    radar_alert: `
      <rect x="26" y="24" width="188" height="20" rx="4" fill="rgba(239,68,68,0.18)" stroke="#ef4444"/>
      <rect x="26" y="50" width="188" height="20" rx="4" fill="rgba(245,158,11,0.16)" stroke="#f59e0b"/>
      <rect x="26" y="76" width="188" height="20" rx="4" fill="rgba(16,185,129,0.16)" stroke="#10b981"/>`,
    heatmap: `
      <rect x="22" y="20" width="94" height="46" rx="3" fill="#059669"/>
      <rect x="120" y="20" width="98" height="28" rx="3" fill="#10b981"/>
      <rect x="120" y="52" width="48" height="44" rx="3" fill="#ef4444"/>
      <rect x="172" y="52" width="46" height="44" rx="3" fill="#3b82f6"/>
      <rect x="22" y="70" width="94" height="26" rx="3" fill="#f59e0b"/>`,
    list_panel: `
      <rect x="22" y="20" width="196" height="14" rx="2" fill="#1e293b"/>
      <rect x="22" y="40" width="196" height="14" rx="2" fill="#1e293b"/>
      <rect x="22" y="60" width="196" height="14" rx="2" fill="#1e293b"/>
      <rect x="22" y="80" width="196" height="14" rx="2" fill="#1e293b"/>
      <circle cx="32" cy="27" r="3" fill="#10b981"/><rect x="164" y="24" width="42" height="6" rx="2" fill="#10b981"/>
      <circle cx="32" cy="47" r="3" fill="#ef4444"/><rect x="164" y="44" width="42" height="6" rx="2" fill="#ef4444"/>
      <circle cx="32" cy="67" r="3" fill="#10b981"/><rect x="164" y="64" width="42" height="6" rx="2" fill="#10b981"/>
      <circle cx="32" cy="87" r="3" fill="#3b82f6"/><rect x="164" y="84" width="42" height="6" rx="2" fill="#3b82f6"/>`,
    macro_clock: `
      <rect x="24" y="18" width="92" height="36" rx="4" fill="rgba(16,185,129,0.22)" stroke="#10b981"/>
      <rect x="124" y="18" width="92" height="36" rx="4" fill="rgba(245,158,11,0.14)" stroke="#334155"/>
      <rect x="24" y="60" width="92" height="36" rx="4" fill="rgba(59,130,246,0.14)" stroke="#334155"/>
      <rect x="124" y="60" width="92" height="36" rx="4" fill="rgba(239,68,68,0.14)" stroke="#334155"/>
      <circle cx="70" cy="36" r="7" fill="#10b981"/><circle cx="70" cy="36" r="12" fill="none" stroke="#10b981" stroke-opacity="0.45"/>`,
    corr_matrix: `
      <rect x="42" y="16" width="34" height="18" rx="2" fill="#ef4444"/><rect x="80" y="16" width="34" height="18" rx="2" fill="#f59e0b"/>
      <rect x="118" y="16" width="34" height="18" rx="2" fill="#334155"/><rect x="156" y="16" width="34" height="18" rx="2" fill="#2563eb"/>
      <rect x="42" y="38" width="34" height="18" rx="2" fill="#f59e0b"/><rect x="80" y="38" width="34" height="18" rx="2" fill="#ef4444"/>
      <rect x="118" y="38" width="34" height="18" rx="2" fill="#10b981"/><rect x="156" y="38" width="34" height="18" rx="2" fill="#3b82f6"/>
      <rect x="42" y="60" width="34" height="18" rx="2" fill="#334155"/><rect x="80" y="60" width="34" height="18" rx="2" fill="#10b981"/>
      <rect x="118" y="60" width="34" height="18" rx="2" fill="#ef4444"/><rect x="156" y="60" width="34" height="18" rx="2" fill="#1e293b"/>
      <rect x="42" y="82" width="34" height="18" rx="2" fill="#2563eb"/><rect x="80" y="82" width="34" height="18" rx="2" fill="#3b82f6"/>
      <rect x="118" y="82" width="34" height="18" rx="2" fill="#1e293b"/><rect x="156" y="82" width="34" height="18" rx="2" fill="#ef4444"/>`,
    risk_drawdown: `
      <line x1="20" y1="24" x2="220" y2="24" stroke="#475569" stroke-dasharray="3 3"/>
      <polygon points="20,24 54,32 88,68 122,48 164,88 196,60 220,42 220,24" fill="rgba(239,68,68,0.28)"/>
      <polyline points="20,24 54,32 88,68 122,48 164,88 196,60 220,42" fill="none" stroke="#ef4444" stroke-width="2.2"/>`,
    market_breadth: `
      <rect x="24" y="20" width="122" height="12" rx="3" fill="#10b981"/>
      <rect x="148" y="20" width="68" height="12" rx="3" fill="#ef4444"/>
      <rect x="30" y="68" width="24" height="28" rx="2" fill="#b91c1c"/>
      <rect x="62" y="56" width="24" height="40" rx="2" fill="#ef4444"/>
      <rect x="94" y="48" width="24" height="48" rx="2" fill="#64748b"/>
      <rect x="126" y="40" width="24" height="56" rx="2" fill="#10b981"/>
      <rect x="158" y="52" width="24" height="44" rx="2" fill="#059669"/>
      <rect x="190" y="72" width="24" height="24" rx="2" fill="#34d399"/>`,
    style_factor: `
      <polygon points="120,16 172,38 172,78 120,98 68,78 68,38" fill="none" stroke="#334155" stroke-width="1"/>
      <polygon points="120,30 156,45 156,71 120,84 84,71 84,45" fill="none" stroke="#334155" stroke-width="1"/>
      <polygon points="120,22 166,46 148,74 120,86 78,66 94,38" fill="rgba(59,130,246,0.28)" stroke="#3b82f6" stroke-width="2"/>
      <polygon points="120,34 148,42 162,76 120,72 86,74 96,46" fill="rgba(16,185,129,0.2)" stroke="#10b981" stroke-width="1.6"/>`,
    commodity: `
      <rect x="20" y="18" width="62" height="36" rx="4" fill="rgba(245,158,11,0.2)" stroke="#f59e0b"/>
      <rect x="89" y="18" width="62" height="36" rx="4" fill="rgba(16,185,129,0.18)" stroke="#10b981"/>
      <rect x="158" y="18" width="62" height="36" rx="4" fill="rgba(239,68,68,0.18)" stroke="#ef4444"/>
      <rect x="20" y="60" width="96" height="36" rx="4" fill="rgba(59,130,246,0.16)" stroke="#3b82f6"/>
      <rect x="124" y="60" width="96" height="36" rx="4" fill="rgba(139,92,246,0.16)" stroke="#8b5cf6"/>`,
    rate_spread: `
      <path d="M22 72 Q76 42 132 48 T218 28" fill="none" stroke="#3b82f6" stroke-width="2.4"/>
      <rect x="24" y="80" width="58" height="18" rx="3" fill="#1e293b" stroke="#10b981"/>
      <rect x="91" y="80" width="58" height="18" rx="3" fill="#1e293b" stroke="#f59e0b"/>
      <rect x="158" y="80" width="58" height="18" rx="3" fill="#1e293b" stroke="#3b82f6"/>`,
    catalyst: `
      <rect x="22" y="18" width="136" height="10" rx="3" fill="#10b981"/>
      <rect x="160" y="18" width="58" height="10" rx="3" fill="#ef4444"/>
      <rect x="22" y="38" width="196" height="16" rx="3" fill="#1e293b" stroke="#f59e0b"/>
      <rect x="22" y="60" width="196" height="16" rx="3" fill="#1e293b" stroke="#10b981"/>
      <rect x="22" y="82" width="196" height="16" rx="3" fill="#1e293b" stroke="#3b82f6"/>`,
  }
  const body = shapes[kind] || shapes.rebased
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 112"><rect width="240" height="112" rx="6" fill="#0b1120"/>${body}</svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

export const SYMBOL_PRESETS = [
  { secid: '0.399300', symbol: '399300.SZ', name: '沪深300', market: '指数' },
  { secid: '1.000001', symbol: '000001.SH', name: '上证指数', market: '指数' },
  { secid: '100.SPX', symbol: '^GSPC', name: '标普500', market: '美股' },
  { secid: '100.NDX', symbol: '^NDX', name: '纳斯达克100', market: '美股' },
  { secid: '124.HSTECH', symbol: 'HSTECH', name: '恒生科技', market: '港股' },
  { secid: '1.600519', symbol: '600519.SH', name: '贵州茅台', market: 'A股' },
  { secid: '0.300750', symbol: '300750.SZ', name: '宁德时代', market: 'A股' },
  { secid: '116.00700', symbol: '00700.HK', name: '腾讯控股', market: '港股' },
  { secid: '105.NVDA', symbol: 'NVDA', name: '英伟达', market: '美股' },
  { secid: '101.GC00Y', symbol: 'GC=F', name: 'COMEX黄金', market: '商品' },
  { secid: '112.B00Y', symbol: 'BZ=F', name: '布伦特原油', market: '能源' },
  { secid: 'CG.bitcoin', symbol: 'BTC', name: 'Bitcoin', market: '加密' },
]

export const REBASED_GROUPS = [
  { id: 'cn_bluechip', label: 'A股核心', secids: '0.399300,1.600519,0.300750,1.601318' },
  { id: 'global_idx', label: '全球指数', secids: '0.399300,100.HSI,100.SPX,100.NDX' },
  { id: 'macro_asset', label: '金·油·债·汇', secids: '101.GC00Y,112.B00Y,105.TLT,100.UDI' },
  { id: 'tech_leaders', label: '中美科技', secids: '105.NVDA,105.MSFT,116.00700,0.300750' },
]

export const FORMULA_PRESETS = [
  { id: 'gold_oil', label: '金油比' },
  { id: 'copper_gold', label: '铜金比' },
  { id: 'gold_silver', label: '金银比' },
  { id: 'csi_bond', label: '股债性价比' },
  { id: 'us_cn_tech', label: '纳指/恒科' },
  { id: 'ship_oil', label: '航运/布油' },
]

export const CORR_GROUPS = [
  { id: 'macro_core', label: '大类资产' },
  { id: 'global_eq', label: '全球股指' },
  { id: 'tech_leaders', label: '中美科技' },
  { id: 'watchlist', label: '我的自选' },
]

export const FACTOR_PACKS = [
  { id: 'oversold_reversal', label: '冰点反转' },
  { id: 'squeeze_breakout', label: '压缩突破' },
  { id: 'macd_golden_trend', label: '金叉共振' },
  { id: 'liquidity_impulse', label: '放量脉冲' },
]

export const DEFAULT_KLINE_OVERLAYS = {
  ma5: true,
  ma10: false,
  ma20: true,
  ma60: true,
  ema12: false,
  ema26: false,
  boll: true,
  vol: false,
  macd: true,
  rsi: true,
}

export const BUILTIN_GALLERY_CATALOG = [
  {
    type: 'pro_kline',
    badge: 'PK',
    title: '多指标共振 K 线',
    category: 'kline',
    categoryLabel: '走势与叠加',
    scopes: ['dashboard', 'markets'],
    defaultW: 16, defaultH: 14, minW: 8, minH: 9,
    summary: '支持全市场搜股，所有均线/EMA/BOLL/成交量/MACD/RSI 与多条价格预警线均可自由勾选叠层。',
    thumbnail: makeSvgThumb('pro_kline'),
  },
  {
    type: 'rebased_compare',
    badge: 'RB',
    title: '多标的超额收益对比',
    category: 'kline',
    categoryLabel: '走势与叠加',
    scopes: ['dashboard', 'markets'],
    defaultW: 12, defaultH: 11, minW: 6, minH: 7,
    summary: '任意 2～6 只股票或指数起点归零对比超额表现，可选回看天数、基准线与面积叠层。',
    thumbnail: makeSvgThumb('rebased'),
  },
  {
    type: 'formula_spread',
    badge: 'FS',
    title: '跨资产比值与分位通道',
    category: 'macro',
    categoryLabel: '宏观跨资产',
    scopes: ['dashboard', 'markets'],
    defaultW: 12, defaultH: 11, minW: 6, minH: 7,
    summary: '内置金油比、铜金比、金银比与股债比，并支持任意双标的比值/价差及均值/±1σ/±2σ 叠层开关。',
    thumbnail: makeSvgThumb('formula'),
  },
  {
    type: 'percentile_barcode',
    badge: 'PB',
    title: '全景资产历史分位',
    category: 'factor',
    categoryLabel: '因子与分位',
    scopes: ['dashboard', 'markets'],
    defaultW: 12, defaultH: 12, minW: 6, minH: 7,
    summary: '快速定位高估与低估区间，支持切换全景资产、我的自选股或自定义搜股池。',
    thumbnail: makeSvgThumb('barcode'),
  },
  {
    type: 'event_study',
    badge: 'EF',
    title: '量化事件因子回测',
    category: 'factor',
    categoryLabel: '因子与分位',
    scopes: ['dashboard', 'markets'],
    defaultW: 12, defaultH: 12, minW: 7, minH: 8,
    summary: '支持全市场搜股回测恐慌反转、压缩突破、金叉共振与放量脉冲的历史胜率与收益区间。',
    thumbnail: makeSvgThumb('factor'),
  },
  {
    type: 'analog_finder',
    badge: 'AN',
    title: '历史相似走势推演',
    category: 'factor',
    categoryLabel: '因子与分位',
    scopes: ['dashboard', 'markets'],
    defaultW: 12, defaultH: 11, minW: 6, minH: 7,
    summary: '支持全市场搜股检索近 30 日最相似历史阶段，可自定义推演叠层与样本条数。',
    thumbnail: makeSvgThumb('analog'),
  },
  {
    type: 'capital_flow',
    badge: 'CF',
    title: '行业主力资金净流向',
    category: 'flow',
    categoryLabel: '资金结构',
    scopes: ['dashboard', 'markets'],
    defaultW: 12, defaultH: 11, minW: 6, minH: 7,
    summary: '双向对比全市场主力资金净流入与净流出行业板块，可选展示条数与流入/流出过滤。',
    thumbnail: makeSvgThumb('flow'),
  },
  {
    type: 'rotation_quadrant',
    badge: 'RQ',
    title: '板块轮动四象限',
    category: 'flow',
    categoryLabel: '资金结构',
    scopes: ['dashboard', 'markets'],
    defaultW: 12, defaultH: 11, minW: 6, minH: 7,
    summary: '结合板块涨跌幅、主力净流入与市值体量，识别领涨主线、左侧潜伏与诱多背离板块。',
    thumbnail: makeSvgThumb('quadrant'),
  },
  {
    type: 'divergence_radar',
    badge: 'DR',
    title: '跨市场背离雷达',
    category: 'intel',
    categoryLabel: '情报风控',
    scopes: ['dashboard', 'markets'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 6,
    summary: '自动扫描金美同涨、跨资产分化、板块量价背离等市场异动信号。',
    thumbnail: makeSvgThumb('radar_alert'),
  },
  {
    type: 'chokepoint_watch',
    badge: 'CP',
    title: '全球贸易要道监测',
    analyst: '航运物流师',
    category: 'shipping',
    categoryLabel: '商品与航运',
    scopes: ['dashboard', 'markets'],
    defaultW: 12, defaultH: 10, minW: 5, minH: 6,
    summary: '监测苏伊士、霍尔木兹、马六甲等全球关键通道的货运与能源通行量变化，窄卡自动切横向排行。',
    thumbnail: makeSvgThumb('shipping'),
  },
  // ======== 8 个跨领域分析师精选小模块 ========
  {
    type: 'macro_clock',
    badge: 'MC',
    title: '美林时钟与流动性仪表',
    analyst: '宏观策略师',
    category: 'macro',
    categoryLabel: '宏观与固收',
    scopes: ['dashboard', 'markets'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 6,
    summary: '借鉴桥水与美林宏观框架，以铜金/油金/美债美元实时动量定位复苏、过热、滞胀或衰退象限与配置主线。',
    thumbnail: makeSvgThumb('macro_clock'),
  },
  {
    type: 'corr_matrix',
    badge: 'CM',
    title: '跨资产相关性矩阵',
    analyst: '组合风险经理',
    category: 'macro',
    categoryLabel: '宏观与固收',
    scopes: ['dashboard', 'markets'],
    defaultW: 10, defaultH: 11, minW: 6, minH: 7,
    summary: '实时计算股/债/金/油/汇或自选标的滚动相关系数热力图，量化分散度并自动识别最佳对冲配对。',
    thumbnail: makeSvgThumb('corr_matrix'),
  },
  {
    type: 'risk_drawdown',
    badge: 'RD',
    title: '波动率与最大回撤监控',
    analyst: '量化风控师',
    category: 'factor',
    categoryLabel: '因子与风控',
    scopes: ['dashboard', 'markets'],
    defaultW: 10, defaultH: 10, minW: 5, minH: 6,
    summary: '借鉴 CTA 风控台，支持全市场搜股实时测算年化波动率、动态水下回撤曲线、95% VaR 与夏普/卡玛比率。',
    thumbnail: makeSvgThumb('risk_drawdown'),
  },
  {
    type: 'market_breadth',
    badge: 'MB',
    title: '市场广度与赚钱效应',
    analyst: '盘面交易员',
    category: 'flow',
    categoryLabel: '资金与盘面',
    scopes: ['dashboard', 'markets'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 6,
    summary: '实时统计全市场行业涨跌比、资金净流入占比与收益率分布直方图，一眼判断赚钱效应冷暖。',
    thumbnail: makeSvgThumb('market_breadth'),
  },
  {
    type: 'style_factor',
    badge: 'SF',
    title: '风格轮动雷达',
    analyst: '权益策略师',
    category: 'factor',
    categoryLabel: '因子与风控',
    scopes: ['dashboard', 'markets'],
    defaultW: 10, defaultH: 10, minW: 5, minH: 6,
    summary: '横跨大盘核心、A股成长、港股科技、美股科技、国债防御与黄金，对比 5D/20D/60D 动量切换雷达。',
    thumbnail: makeSvgThumb('style_factor'),
  },
  {
    type: 'commodity_dashboard',
    badge: 'CD',
    title: '大宗商品与通胀链',
    analyst: '大宗商品师',
    category: 'shipping',
    categoryLabel: '商品与航运',
    scopes: ['dashboard', 'markets'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 6,
    summary: '一屏聚合贵金属、能源、工业金属与航运压力热力卡片，捕捉上游成本传导与通胀预期脉冲。',
    thumbnail: makeSvgThumb('commodity'),
  },
  {
    type: 'rate_spread_watch',
    badge: 'RS',
    title: '利差与汇率压力计',
    analyst: 'FICC固收师',
    category: 'macro',
    categoryLabel: '宏观与固收',
    scopes: ['dashboard', 'markets'],
    defaultW: 8, defaultH: 9, minW: 5, minH: 6,
    summary: '盯盘美债 10Y-2Y / 10Y-3M 利差（倒挂预警）、美元指数、离岸人民币与长久期债基强弱。',
    thumbnail: makeSvgThumb('rate_spread'),
  },
  {
    type: 'intel_catalyst',
    badge: 'IC',
    title: '热点催化与多空脉搏',
    analyst: '事件情报师',
    category: 'intel',
    categoryLabel: '情报与催化',
    scopes: ['dashboard', 'markets'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 6,
    summary: '按事件冲击度排序多语种快讯与多空情绪占比，并支持一键发起 AI 产业链与市场影响推演。',
    thumbnail: makeSvgThumb('catalyst'),
  },
  {
    type: 'sector_heatmap',
    badge: 'H',
    title: '行业市值热力图',
    category: 'flow',
    categoryLabel: '资金结构',
    scopes: ['dashboard', 'markets'],
    defaultW: 12, defaultH: 10, minW: 6, minH: 7,
    summary: '按行业市值面积与涨跌幅度渲染全景矩形热力图，直观呈现市场冷暖。',
    thumbnail: makeSvgThumb('heatmap'),
  },
  // Dashboard 核心模块
  {
    type: 'watchlist_slot',
    badge: 'M',
    title: '自选与事件 K 线',
    category: 'kline',
    categoryLabel: '走势与叠加',
    scopes: ['dashboard'],
    defaultW: 16, defaultH: 12, minW: 8, minH: 8,
    summary: '左侧自选实时报价（支持卡内搜股、置顶与移出），右侧交互式 K 线支持自定义叠层与预警线。',
    thumbnail: makeSvgThumb('pro_kline'),
  },
  {
    type: 'macro_curve',
    badge: 'Y',
    title: '国债利率与汇率矩阵',
    category: 'macro',
    categoryLabel: '宏观跨资产',
    scopes: ['dashboard', 'markets'],
    defaultW: 12, defaultH: 10, minW: 6, minH: 7,
    summary: '展示美债各期限利率曲线、跨境核心汇率牌价与宏观序列指标。',
    thumbnail: makeSvgThumb('rebased'),
  },
  {
    type: 'geo_odds',
    badge: 'G',
    title: '宏观与地缘预期概率',
    category: 'macro',
    categoryLabel: '宏观跨资产',
    scopes: ['dashboard', 'markets'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 6,
    summary: '聚合全球宏观决议与地缘热点事件的实时市场隐含概率。',
    thumbnail: makeSvgThumb('barcode'),
  },
  {
    type: 'entity_pulse',
    badge: 'E',
    title: '实体热度与关系图谱',
    category: 'intel',
    categoryLabel: '情报风控',
    scopes: ['dashboard'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 7,
    summary: '呈现近期多语种情报中的高频关联机构、地区与核心资产共现拓扑。',
    thumbnail: makeSvgThumb('quadrant'),
  },
  {
    type: 'live_wire',
    badge: 'N',
    title: '多语种实时快讯',
    category: 'intel',
    categoryLabel: '情报风控',
    scopes: ['dashboard', 'markets'],
    defaultW: 16, defaultH: 11, minW: 7, minH: 6,
    summary: '自动汇聚并翻译中、英、俄、日最新财经与地缘快讯，支持单卡独立语种与情绪筛选。',
    thumbnail: makeSvgThumb('radar_alert'),
  },
  {
    type: 'sentiment_gauge',
    badge: 'S',
    title: '情报情绪温度计',
    category: 'intel',
    categoryLabel: '情报风控',
    scopes: ['dashboard'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 7,
    summary: '展示全网多语种快讯净情绪得分、各语种占比及译文/向量化覆盖进度。',
    thumbnail: makeSvgThumb('barcode'),
  },
  {
    type: 'desk_note',
    badge: 'D',
    title: '24h 情报简报',
    category: 'intel',
    categoryLabel: '情报风控',
    scopes: ['dashboard'],
    defaultW: 8, defaultH: 11, minW: 5, minH: 6,
    summary: 'AI 自动归纳近 24 小时跨语种核心宏观与市场动态，一键刷新研报摘要。',
    thumbnail: makeSvgThumb('list_panel'),
  },
  {
    type: 'connector_hub',
    badge: 'A',
    title: '数据源连接状态',
    category: 'macro',
    categoryLabel: '宏观跨资产',
    scopes: ['dashboard'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 6,
    summary: '实时监控外部行情、宏观与新闻 API 连接器配置状态，点击直达设置。',
    thumbnail: makeSvgThumb('list_panel'),
  },
  // Markets 专属模块
  {
    type: 'kline_main',
    badge: 'K',
    title: 'K 线主图',
    category: 'kline',
    categoryLabel: '走势与叠加',
    scopes: ['markets'],
    defaultW: 16, defaultH: 14, minW: 8, minH: 8,
    summary: '交互式专业 K 线主图，支持单卡独立锁定标的、自定义均线/布林/量能/事件叠层与多条预警线。',
    thumbnail: makeSvgThumb('pro_kline'),
  },
  {
    type: 'watchlist',
    badge: 'W',
    title: '自选标的列表',
    category: 'kline',
    categoryLabel: '走势与叠加',
    scopes: ['markets'],
    defaultW: 8, defaultH: 12, minW: 5, minH: 6,
    summary: '自选股实时报价、涨跌额、涨幅与 5 日微走势图，支持卡内搜股添加、置顶与移除。',
    thumbnail: makeSvgThumb('list_panel'),
  },
  {
    type: 'panel_indices',
    badge: 'I',
    title: '核心指数报价',
    category: 'kline',
    categoryLabel: '走势与叠加',
    scopes: ['markets'],
    defaultW: 8, defaultH: 12, minW: 5, minH: 6,
    summary: '沪深、港股、美股与亚欧核心股指实时报价与分时迷你线，支持自定义列与追加关注标的。',
    thumbnail: makeSvgThumb('list_panel'),
  },
  {
    type: 'panel_cn_logistics',
    badge: 'A',
    title: 'A 股核心资产',
    category: 'kline',
    categoryLabel: '走势与叠加',
    scopes: ['markets'],
    defaultW: 8, defaultH: 12, minW: 5, minH: 6,
    summary: 'A 股大盘权重与核心龙头实时盯盘表，支持点击 ⚙️ 自由增减股票与列显隐。',
    thumbnail: makeSvgThumb('list_panel'),
  },
  {
    type: 'panel_us_hk',
    badge: 'U',
    title: '美港核心资产',
    category: 'kline',
    categoryLabel: '走势与叠加',
    scopes: ['markets'],
    defaultW: 8, defaultH: 12, minW: 5, minH: 6,
    summary: '美股与港股科技、消费、工业龙头实时行情列表，支持自由扩展标的。',
    thumbnail: makeSvgThumb('list_panel'),
  },
  {
    type: 'panel_forex',
    badge: 'F',
    title: '全球外汇牌价',
    category: 'macro',
    categoryLabel: '宏观跨资产',
    scopes: ['markets'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 6,
    summary: '离岸人民币、美元指数、欧元、日元等主要货币对实时走势。',
    thumbnail: makeSvgThumb('list_panel'),
  },
  {
    type: 'panel_commodities',
    badge: 'C',
    title: '大宗商品期货',
    category: 'macro',
    categoryLabel: '宏观跨资产',
    scopes: ['markets'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 6,
    summary: '黄金、白银、原油、铜与天然气等大宗商品核心品种实时报价。',
    thumbnail: makeSvgThumb('list_panel'),
  },
  {
    type: 'panel_etf_bonds',
    badge: 'E',
    title: 'ETF 与债券',
    category: 'macro',
    categoryLabel: '宏观跨资产',
    scopes: ['markets'],
    defaultW: 8, defaultH: 10, minW: 5, minH: 6,
    summary: '境内外宽基 ETF 与长久期国债 ETF 实时行情。',
    thumbnail: makeSvgThumb('list_panel'),
  },
  {
    type: 'panel_crypto',
    badge: 'B',
    title: '加密资产',
    category: 'macro',
    categoryLabel: '宏观跨资产',
    scopes: ['markets'],
    defaultW: 12, defaultH: 10, minW: 5, minH: 6,
    summary: 'BTC、ETH 等 7×24 全球风险流动性风向标实时行情。',
    thumbnail: makeSvgThumb('list_panel'),
  },
  {
    type: 'movers_gainers',
    badge: '▲',
    title: '领涨异动榜',
    category: 'flow',
    categoryLabel: '资金结构',
    scopes: ['markets'],
    defaultW: 8, defaultH: 11, minW: 5, minH: 6,
    summary: '实时追踪当日涨幅居前且成交活跃的强势标的。',
    thumbnail: makeSvgThumb('flow'),
  },
  {
    type: 'movers_losers',
    badge: '▼',
    title: '领跌异动榜',
    category: 'flow',
    categoryLabel: '资金结构',
    scopes: ['markets'],
    defaultW: 8, defaultH: 11, minW: 5, minH: 6,
    summary: '实时追踪当日跌幅居前的调整标的与风控异动。',
    thumbnail: makeSvgThumb('flow'),
  },
  {
    type: 'movers_active',
    badge: '⚡',
    title: '成交活跃榜',
    category: 'flow',
    categoryLabel: '资金结构',
    scopes: ['markets'],
    defaultW: 8, defaultH: 11, minW: 5, minH: 6,
    summary: '按成交额排行呈现当日全市场主力资金最集中的焦点个股。',
    thumbnail: makeSvgThumb('flow'),
  },
]

export const GALLERY_MAP = Object.fromEntries(BUILTIN_GALLERY_CATALOG.map((x) => [x.type, x]))

// ============== 通用全市场搜股 + 一键自选组件（支持键盘上下选择 + Enter + 批量点星自选） ==============
export const SymbolPicker = {
  props: {
    modelValue: { type: String, default: '' },
    label: { type: String, default: '' },
    watchlist: { type: Array, default: () => [] },
    placeholder: { type: String, default: '搜股票/代码/指数…' },
    mode: { type: String, default: 'select' }, // 'select' | 'add'
    compact: { type: Boolean, default: false },
    showWatchlistStar: { type: Boolean, default: true },
    width: { type: String, default: '' },
  },
  emits: ['update:modelValue', 'pick', 'toggle-watchlist'],
  setup(props, { emit }) {
    const rootRef = ref(null)
    const inputRef = ref(null)
    const popRef = ref(null)
    const open = ref(false)
    const query = ref('')
    const hits = ref([])
    const searching = ref(false)
    const activeIdx = ref(0)
    const popStyle = ref({})
    let timer = 0
    let reqSeq = 0

    const watchlistSet = computed(() => new Set((props.watchlist || []).map((w) => w.secid)))

    const displayLabel = computed(() => {
      if (props.label) return props.label
      const sid = props.modelValue
      if (!sid) return ''
      const inWl = (props.watchlist || []).find((x) => x.secid === sid)
      if (inWl) return inWl.name || inWl.symbol || sid
      const inPre = SYMBOL_PRESETS.find((x) => x.secid === sid)
      if (inPre) return inPre.name
      return sid
    })

    const presetFallback = computed(() => {
      const seen = watchlistSet.value
      return SYMBOL_PRESETS.filter((p) => !seen.has(p.secid))
    })

    const flatVisibleList = computed(() => {
      if (query.value.trim()) return hits.value || []
      return [...(props.watchlist || []), ...presetFallback.value]
    })

    function positionPopover() {
      const el = rootRef.value
      if (!el) return
      const rect = el.getBoundingClientRect()
      const popW = Math.min(368, Math.max(288, rect.width))
      const popH = 310
      let left = rect.left
      if (left + popW > window.innerWidth - 8) {
        left = Math.max(8, rect.right - popW)
      }
      let top = rect.bottom + 4
      if (top + popH > window.innerHeight - 8 && rect.top > popH + 12) {
        top = Math.max(8, rect.top - popH - 4)
      }
      popStyle.value = {
        position: 'fixed',
        left: `${Math.round(left)}px`,
        top: `${Math.round(top)}px`,
        width: `${Math.round(popW)}px`,
        zIndex: 1400,
      }
    }

    function openPopover() {
      open.value = true
      activeIdx.value = 0
      nextTick(() => {
        positionPopover()
        if (inputRef.value && document.activeElement !== inputRef.value) {
          inputRef.value.focus()
        }
      })
    }

    function closePopover() {
      open.value = false
      query.value = ''
      hits.value = []
      activeIdx.value = 0
    }

    function onInput() {
      clearTimeout(timer)
      activeIdx.value = 0
      const q = (query.value || '').trim()
      if (!q) {
        hits.value = []
        searching.value = false
        return
      }
      searching.value = true
      const seq = ++reqSeq
      timer = setTimeout(async () => {
        try {
          const r = await fetch('/api/market/search?q=' + encodeURIComponent(q))
          const data = await r.json()
          if (seq !== reqSeq) return
          hits.value = (data && data.ok && Array.isArray(data.items)) ? data.items : []
          activeIdx.value = 0
        } catch (e) {
          if (seq === reqSeq) hits.value = []
        } finally {
          if (seq === reqSeq) searching.value = false
        }
      }, 160)
    }

    function onKeydown(e) {
      const list = flatVisibleList.value
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        closePopover()
        return
      }
      if (!list.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        activeIdx.value = (activeIdx.value + 1) % list.length
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        activeIdx.value = (activeIdx.value - 1 + list.length) % list.length
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const target = list[activeIdx.value] || list[0]
        if (target) onPick(target)
      }
    }

    function onPick(item) {
      if (!item || !item.secid) return
      if (props.mode === 'select') {
        emit('update:modelValue', item.secid)
      }
      emit('pick', item)
      closePopover()
    }

    function onToggleStar(item) {
      if (!item || !item.secid) return
      emit('toggle-watchlist', {
        secid: item.secid,
        symbol: item.symbol || item.secid,
        name: item.name || item.symbol || item.secid,
      })
    }

    function onDocPointerDown(e) {
      if (!open.value) return
      if (rootRef.value && rootRef.value.contains(e.target)) return
      if (popRef.value && popRef.value.contains(e.target)) return
      closePopover()
    }

    function onWinResizeOrScroll() {
      if (open.value) positionPopover()
    }

    onMounted(() => {
      document.addEventListener('pointerdown', onDocPointerDown, true)
      window.addEventListener('resize', onWinResizeOrScroll)
    })
    onBeforeUnmount(() => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', onDocPointerDown, true)
      window.removeEventListener('resize', onWinResizeOrScroll)
    })

    return {
      rootRef, inputRef, popRef, open, query, hits, searching, activeIdx, popStyle,
      watchlistSet, displayLabel, presetFallback,
      STAR_SVG, STAR_FILL_SVG, SEARCH_SVG,
      openPopover, closePopover, onInput, onKeydown, onPick, onToggleStar,
    }
  },
  template: `
    <div ref="rootRef" class="sp-picker" :class="{ compact: compact, open: open }" :style="width ? { width } : undefined">
      <div class="sp-trigger" @click="openPopover">
        <span class="sp-ico" v-html="SEARCH_SVG"></span>
        <input
          v-if="open || mode === 'add'"
          ref="inputRef"
          v-model="query"
          type="text"
          class="sp-input"
          :placeholder="mode === 'select' && displayLabel ? displayLabel : placeholder"
          @focus="openPopover"
          @input="onInput"
          @keydown="onKeydown"
        />
        <span v-else class="sp-val" :title="displayLabel || placeholder">{{ displayLabel || placeholder }}</span>
        <span v-if="!open && mode === 'select'" class="sp-caret">▾</span>
      </div>

      <teleport to="body">
        <div v-if="open" ref="popRef" class="sp-popover" :style="popStyle" @pointerdown.stop>
          <div v-if="query.trim()" class="sp-pop-body">
            <div class="sp-pop-sec">
              <span>全市场搜索（↑↓选择 · Enter确认）</span>
              <span class="ft-mono">{{ searching ? '搜索中…' : hits.length + ' 条' }}</span>
            </div>
            <div v-if="!searching && !hits.length" class="sp-pop-empty">未找到匹配标的，可输入代码、中文名或英文 Ticker</div>
            <div v-for="(it, idx) in hits" :key="'h-' + it.secid"
                 class="sp-pop-item" :class="{ on: modelValue === it.secid || activeIdx === idx }"
                 @mouseenter="activeIdx = idx" @click="onPick(it)">
              <span class="ft-mono sp-code">{{ it.symbol || it.secid }}</span>
              <span class="sp-name">{{ it.name }}</span>
              <span class="sp-mkt">{{ it.market || '' }}</span>
              <button v-if="showWatchlistStar" type="button" class="sp-wl-pill" :class="{ on: watchlistSet.has(it.secid) }"
                      :title="watchlistSet.has(it.secid) ? '移出自选（不关闭列表）' : '加入自选（不关闭列表）'"
                      @click.stop="onToggleStar(it)">
                <span class="sp-wl-ico" v-html="watchlistSet.has(it.secid) ? STAR_FILL_SVG : STAR_SVG"></span>
                <span>{{ watchlistSet.has(it.secid) ? '已选' : '自选' }}</span>
              </button>
            </div>
          </div>

          <div v-else class="sp-pop-body">
            <template v-if="watchlist && watchlist.length">
              <div class="sp-pop-sec">
                <span>我的自选</span>
                <span class="ft-mono">{{ watchlist.length }}</span>
              </div>
              <div v-for="(w, idx) in watchlist" :key="'w-' + w.secid"
                   class="sp-pop-item" :class="{ on: modelValue === w.secid || activeIdx === idx }"
                   @mouseenter="activeIdx = idx" @click="onPick(w)">
                <span class="ft-mono sp-code">{{ w.symbol || w.secid }}</span>
                <span class="sp-name">{{ w.name }}</span>
                <span v-if="w.pct != null" class="ft-mono sp-pct" :style="{ color: w.pct >= 0 ? 'var(--up)' : 'var(--down)' }">
                  {{ w.pct >= 0 ? '+' : '' }}{{ Number(w.pct).toFixed(2) }}%
                </span>
                <span v-else class="sp-mkt">自选</span>
                <button v-if="showWatchlistStar" type="button" class="sp-wl-pill on" title="移出自选"
                        @click.stop="onToggleStar(w)">
                  <span class="sp-wl-ico" v-html="STAR_FILL_SVG"></span>
                  <span>已选</span>
                </button>
              </div>
            </template>

            <div class="sp-pop-sec">
              <span>常用核心标的</span>
              <span class="hint">输入代码可搜全市场</span>
            </div>
            <div v-for="(p, pidx) in presetFallback" :key="'p-' + p.secid"
                 class="sp-pop-item" :class="{ on: modelValue === p.secid || activeIdx === ((watchlist ? watchlist.length : 0) + pidx) }"
                 @mouseenter="activeIdx = (watchlist ? watchlist.length : 0) + pidx" @click="onPick(p)">
              <span class="ft-mono sp-code">{{ p.symbol }}</span>
              <span class="sp-name">{{ p.name }}</span>
              <span class="sp-mkt">{{ p.market }}</span>
              <button v-if="showWatchlistStar" type="button" class="sp-wl-pill" :class="{ on: watchlistSet.has(p.secid) }"
                      :title="watchlistSet.has(p.secid) ? '移出自选' : '加入自选'"
                      @click.stop="onToggleStar(p)">
                <span class="sp-wl-ico" v-html="watchlistSet.has(p.secid) ? STAR_FILL_SVG : STAR_SVG"></span>
                <span>{{ watchlistSet.has(p.secid) ? '已选' : '自选' }}</span>
              </button>
            </div>
          </div>
        </div>
      </teleport>
    </div>
  `,
}

function deepClonePreserveFns(val, seen = new WeakMap()) {
  if (val === null || typeof val !== 'object') return val
  if (seen.has(val)) return seen.get(val)
  if (Array.isArray(val)) {
    const arr = []
    seen.set(val, arr)
    for (let i = 0; i < val.length; i++) arr.push(deepClonePreserveFns(val[i], seen))
    return arr
  }
  const out = {}
  seen.set(val, out)
  for (const k of Object.keys(val)) {
    out[k] = deepClonePreserveFns(val[k], seen)
  }
  return out
}

function isNeutralHardcodedColor(col) {
  if (typeof col !== 'string') return false
  const c = col.trim().toLowerCase()
  return [
    '#000', '#000000', '#111', '#111111', '#222', '#222222', '#333', '#333333',
    '#444', '#555', '#666', '#666666', '#777', '#888', '#999', '#aaa', '#bbb',
    '#ccc', '#cccccc', '#ddd', '#dddddd', '#e5e5e5', '#e6e6e6', '#eee', '#eeeeee',
    '#f0f0f0', '#f5f5f5', '#fff', '#ffffff', 'black', 'white', 'gray', 'grey',
  ].includes(c)
}

function harmonizeEchartsOption(rawOpt, dark, env = {}) {
  if (!rawOpt || typeof rawOpt !== 'object') return {}
  const opt = deepClonePreserveFns(rawOpt)
  const fg = dark ? '#e2e8f0' : '#0f172a'
  const muted = dark ? '#94a3b8' : '#64748b'
  const split = dark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)'
  const border = dark ? '#334155' : '#cbd5e1'

  const w = Number(env.width) || 0
  const h = Number(env.height) || 0
  const responsive = env.responsive !== false && w > 0 && h > 0
  const inCard = !!env.inCard
  const isTiny = responsive && (w < 300 || h < 190)
  const isNarrow = responsive && w < 420
  const isShort = responsive && h < 245
  const isCompact = isNarrow || isShort

  opt.backgroundColor = 'transparent'
  if (typeof opt.animation === 'undefined') opt.animation = true
  opt.animationDurationUpdate = 160
  opt.textStyle = { ...(opt.textStyle || {}), color: fg }

  if (opt.title) {
    const patchTitle = (t) => {
      if (!t || typeof t !== 'object') return t
      // 卡片头部已展示标题，嵌入看板时精简重复内嵌 title 避免遮挡图表
      if (inCard && (!t.subtext || isShort)) {
        return { ...t, show: false }
      }
      return {
        ...t,
        textStyle: { fontSize: isCompact ? 11 : 12, fontWeight: 600, color: fg, ...(t.textStyle || {}) },
        subtextStyle: { fontSize: isCompact ? 9.5 : 10.5, color: muted, ...(t.subtextStyle || {}) },
      }
    }
    opt.title = Array.isArray(opt.title) ? opt.title.map(patchTitle) : patchTitle(opt.title)
  }

  let hasVisibleLegend = false
  if (opt.legend) {
    const patchLeg = (l) => {
      if (!l || typeof l !== 'object') return l
      if (l.show === false) return l
      hasVisibleLegend = true
      const next = {
        type: 'scroll',
        pageIconSize: 10,
        pageIconColor: fg,
        pageIconInactiveColor: border,
        pageTextStyle: { color: muted, fontSize: 10 },
        itemWidth: isCompact ? 10 : 12,
        itemHeight: isCompact ? 6 : 8,
        ...l,
        textStyle: { fontSize: isCompact ? 9.5 : 10.5, color: muted, ...(l.textStyle || {}) },
      }
      if (inCard && isNarrow && (next.orient === 'vertical' || next.right !== undefined && next.top === undefined)) {
        next.orient = 'horizontal'
        next.top = 2
        next.left = 6
        next.right = 6
        delete next.bottom
      }
      return next
    }
    opt.legend = Array.isArray(opt.legend) ? opt.legend.map(patchLeg) : patchLeg(opt.legend)
  }

  const rawTooltip = (opt.tooltip && typeof opt.tooltip === 'object') ? { ...opt.tooltip } : {}
  if (typeof rawTooltip.valueFormatter === 'string') {
    const tpl = rawTooltip.valueFormatter
    rawTooltip.valueFormatter = (v) => (v == null ? '-' : tpl.replace(/\{c\}|\{value\}/g, String(v)))
  }
  opt.tooltip = {
    trigger: 'axis',
    confine: true,
    backgroundColor: dark ? 'rgba(15,23,42,0.94)' : 'rgba(255,255,255,0.96)',
    borderColor: border,
    textStyle: { color: fg, fontSize: isTiny ? 10.5 : 11.5 },
    ...rawTooltip,
  }

  const patchAxis = (ax, isY = false) => {
    if (!ax) return ax
    const one = (a) => {
      if (!a || typeof a !== 'object') return a
      const rawLineStyle = (a.axisLine && a.axisLine.lineStyle) || {}
      const rawSplitStyle = (a.splitLine && a.splitLine.lineStyle) || {}
      const nextLineCol = (!rawLineStyle.color || isNeutralHardcodedColor(rawLineStyle.color)) ? border : rawLineStyle.color
      const nextSplitCol = (!rawSplitStyle.color || isNeutralHardcodedColor(rawSplitStyle.color)) ? split : rawSplitStyle.color
      const rawLbl = (a.axisLabel && typeof a.axisLabel === 'object') ? { ...a.axisLabel } : {}
      if (rawLbl.color && isNeutralHardcodedColor(rawLbl.color)) rawLbl.color = muted
      const next = {
        ...a,
        axisLabel: {
          fontSize: isTiny ? 9 : (isCompact ? 9.5 : 10.5),
          color: muted,
          ...(isY ? {} : { hideOverlap: true }),
          ...rawLbl,
          ...(isTiny && typeof rawLbl.fontSize === 'number' ? { fontSize: Math.min(rawLbl.fontSize, 9.5) } : {}),
        },
        axisLine: {
          ...(a.axisLine || {}),
          lineStyle: { ...rawLineStyle, color: nextLineCol },
        },
        splitLine: {
          ...(a.splitLine || {}),
          lineStyle: { ...rawSplitStyle, color: nextSplitCol },
        },
        nameTextStyle: { color: muted, fontSize: isCompact ? 9.5 : 10, ...(a.nameTextStyle || {}) },
      }
      if (inCard && isTiny && next.name) {
        next.name = ''
      }
      return next
    }
    return Array.isArray(ax) ? ax.map(one) : one(ax)
  }
  if (opt.xAxis) opt.xAxis = patchAxis(opt.xAxis, false)
  if (opt.yAxis) opt.yAxis = patchAxis(opt.yAxis, true)

  const seriesList = Array.isArray(opt.series) ? opt.series : (opt.series ? [opt.series] : [])
  const firstType = seriesList[0]?.type
  const isNonCartesian = ['pie', 'radar', 'gauge', 'treemap', 'sankey', 'funnel', 'graph'].includes(firstType)

  // 修复系列中暗色/亮色下不可见的 markLine 与 label 颜色
  for (const s of seriesList) {
    if (!s || typeof s !== 'object') continue
    if (s.markLine) {
      if (s.markLine.lineStyle && isNeutralHardcodedColor(s.markLine.lineStyle.color)) {
        s.markLine.lineStyle = { ...s.markLine.lineStyle, color: dark ? '#cbd5e1' : '#334155' }
      }
      if (s.markLine.label && (!s.markLine.label.color || isNeutralHardcodedColor(s.markLine.label.color))) {
        s.markLine.label = {
          ...s.markLine.label,
          color: fg,
          fontSize: isCompact ? 9.5 : (s.markLine.label.fontSize || 10.5),
        }
      }
      if (Array.isArray(s.markLine.data)) {
        s.markLine.data = s.markLine.data.map((d) => {
          if (!d || typeof d !== 'object') return d
          const nd = { ...d }
          if (nd.lineStyle && isNeutralHardcodedColor(nd.lineStyle.color)) {
            nd.lineStyle = { ...nd.lineStyle, color: dark ? '#cbd5e1' : '#334155' }
          }
          return nd
        })
      }
    }
    if (s.label && isNeutralHardcodedColor(s.label.color)) {
      s.label = { ...s.label, color: fg }
    }
  }

  if (!opt.grid) {
    if (!isNonCartesian) {
      opt.grid = {
        left: isNarrow ? 8 : 12,
        right: isNarrow ? 12 : 16,
        top: hasVisibleLegend ? (isShort ? 26 : 32) : (isShort ? 12 : 18),
        bottom: isShort ? 12 : 20,
        containLabel: true,
      }
    }
  } else if (!Array.isArray(opt.grid)) {
    opt.grid.containLabel = true
    if (inCard && responsive) {
      // 限制对话生成图表硬编码的大像素边距，释放绘图区空间
      if (typeof opt.grid.left === 'number' && opt.grid.left > 24) {
        opt.grid.left = isNarrow ? 6 : 12
      }
      if (typeof opt.grid.right === 'number' && opt.grid.right > 32) {
        opt.grid.right = isNarrow ? 14 : 26
      }
      if (typeof opt.grid.top === 'number') {
        const minTop = hasVisibleLegend ? (isShort ? 26 : 32) : (isShort ? 12 : 18)
        opt.grid.top = Math.min(opt.grid.top, minTop + 8)
        if (hasVisibleLegend && opt.grid.top < minTop) opt.grid.top = minTop
      }
      if (typeof opt.grid.bottom === 'number' && opt.grid.bottom > 26) {
        opt.grid.bottom = isShort ? 10 : 18
      }
    }
  }

  // 对话自定义图表在看板内缩放时的智能密度与非笛卡尔自适应
  if (inCard && responsive) {
    const y0 = Array.isArray(opt.yAxis) ? opt.yAxis[0] : opt.yAxis
    const x0 = Array.isArray(opt.xAxis) ? opt.xAxis[0] : opt.xAxis
    const hasYZoom = Array.isArray(opt.dataZoom) && opt.dataZoom.some((z) => z && z.yAxisIndex !== undefined)
    const hasXZoom = Array.isArray(opt.dataZoom) && opt.dataZoom.some((z) => z && (z.xAxisIndex !== undefined || z.yAxisIndex === undefined))

    // 1) 横向类目条形图（如 30 个行业排名）：高度不足时自动注入滚轮+超细滑块，拉高自动展开全部
    if (y0 && y0.type === 'category' && Array.isArray(y0.data) && y0.data.length >= 7 && !Array.isArray(opt.grid)) {
      const n = y0.data.length
      const gTop = typeof opt.grid?.top === 'number' ? opt.grid.top : 20
      const gBot = typeof opt.grid?.bottom === 'number' ? opt.grid.bottom : 18
      const plotH = Math.max(72, h - gTop - gBot - 16)
      const minRowPx = isTiny ? 15 : 17.5
      const maxVis = Math.max(4, Math.floor(plotH / minRowPx))
      const maxChars = w < 290 ? 4 : (w < 390 ? 6 : (w < 520 ? 8 : 14))
      if (!y0.axisLabel.formatter) {
        y0.axisLabel.formatter = (v) => {
          const s = String(v ?? '')
          return s.length > maxChars ? s.slice(0, maxChars) + '…' : s
        }
      }
      if (n > maxVis && !hasYZoom) {
        y0.axisLabel.interval = 0
        const dz = Array.isArray(opt.dataZoom) ? opt.dataZoom.slice() : []
        dz.push(
          {
            type: 'inside',
            yAxisIndex: 0,
            startValue: 0,
            endValue: maxVis - 1,
            zoomOnMouseWheel: false,
            moveOnMouseWheel: true,
            moveOnMouseMove: false,
          },
          {
            type: 'slider',
            yAxisIndex: 0,
            width: 8,
            right: 2,
            top: gTop,
            bottom: gBot + 8,
            startValue: 0,
            endValue: maxVis - 1,
            showDetail: false,
            brushSelect: false,
            borderColor: 'transparent',
            backgroundColor: dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)',
            fillerColor: dark ? 'rgba(59,130,246,0.45)' : 'rgba(59,130,246,0.38)',
            handleSize: 0,
          },
        )
        opt.dataZoom = dz
        if (opt.grid && !Array.isArray(opt.grid)) {
          opt.grid.right = Math.max(Number(opt.grid.right) || 0, isNarrow ? 22 : 34)
        }
      } else {
        y0.axisLabel.interval = 0
      }
      // 窄卡片隐藏易溢出的柱外数值标签，靠 hover tooltip 精确读取
      for (const s of seriesList) {
        if (s && s.type === 'bar' && s.label && s.label.show) {
          if (w < 300) {
            s.label = { ...s.label, show: false }
          } else {
            s.label = { ...s.label, fontSize: isCompact ? 9 : Math.min(10.5, Number(s.label.fontSize) || 10) }
          }
        }
      }
    }

    // 2) 纵向类目图（柱图/折线）：超窄自动倾斜标签或启用滚轮缩放
    if (x0 && x0.type === 'category' && Array.isArray(x0.data) && x0.data.length >= 6 && !Array.isArray(opt.grid)) {
      const n = x0.data.length
      const pxPerCat = (w - 40) / n
      if (pxPerCat < 38 && typeof x0.axisLabel.rotate === 'undefined') {
        x0.axisLabel.rotate = pxPerCat < 24 ? 32 : 20
      }
      if (n > 18 && w < 380 && !hasXZoom) {
        const dz = Array.isArray(opt.dataZoom) ? opt.dataZoom.slice() : []
        dz.push({ type: 'inside', xAxisIndex: 0, start: 0, end: Math.max(40, Math.round((14 / n) * 100)) })
        opt.dataZoom = dz
      }
    }

    // 3) 饼图 / 雷达 / 仪表盘随容器比例自动缩放半径与居中
    for (const s of seriesList) {
      if (!s || typeof s !== 'object') continue
      if (s.type === 'pie') {
        s.center = ['50%', hasVisibleLegend ? '56%' : '50%']
        if (isTiny) {
          s.radius = Array.isArray(s.radius) ? ['34%', '66%'] : '66%'
          s.label = { ...(s.label || {}), show: false }
          s.labelLine = { ...(s.labelLine || {}), show: false }
        } else if (isCompact) {
          s.radius = Array.isArray(s.radius) ? ['34%', '62%'] : '62%'
          if (s.label) s.label = { ...s.label, fontSize: 9.5 }
        }
      } else if (s.type === 'gauge') {
        s.radius = isTiny ? '92%' : '86%'
        s.detail = { ...(s.detail || {}), fontSize: isTiny ? 14 : (isCompact ? 16 : 20) }
        s.title = { ...(s.title || {}), fontSize: isTiny ? 10 : 11.5 }
      }
    }
    if (opt.radar) {
      const patchRadar = (rd) => ({
        ...rd,
        center: ['50%', hasVisibleLegend ? '56%' : '52%'],
        radius: isTiny ? '52%' : (isCompact ? '58%' : (rd.radius || '66%')),
        axisName: { fontSize: isTiny ? 9 : (isCompact ? 10 : 11), color: muted, ...(rd.axisName || {}) },
      })
      opt.radar = Array.isArray(opt.radar) ? opt.radar.map(patchRadar) : patchRadar(opt.radar)
    }
  }

  return opt
}

function fmtCompactAxis(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  const abs = Math.abs(n)
  if (abs >= 1e5) return (n / 1e3).toFixed(0) + 'k'
  if (abs >= 1e4) return (n / 1e3).toFixed(1) + 'k'
  if (abs >= 100) return n.toFixed(0)
  if (abs >= 1) return n.toFixed(2).replace(/\.?0+$/, '')
  return n.toFixed(3).replace(/\.?0+$/, '')
}

function calcSma(closes, period) {
  const out = []
  let sum = 0
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]
    if (i >= period) sum -= closes[i - period]
    out.push(i >= period - 1 ? Number((sum / period).toFixed(4)) : null)
  }
  return out
}

function calcEma(closes, period) {
  const out = []
  const k = 2 / (period + 1)
  let ema = null
  for (let i = 0; i < closes.length; i++) {
    const v = closes[i]
    ema = ema === null ? v : (v * k + ema * (1 - k))
    out.push(i >= period - 1 ? Number(ema.toFixed(4)) : null)
  }
  return out
}

export const O2Echarts = {
  props: {
    option: { type: Object, default: null },
    theme: { type: String, default: 'light' },
    height: { type: String, default: '100%' },
    wantSnapshot: { type: Boolean, default: false },
    responsive: { type: Boolean, default: true },
    inCard: { type: Boolean, default: false },
  },
  emits: ['snapshot', 'chart-click'],
  setup(props, { emit, expose }) {
    const elRef = ref(null)
    let inst = null
    let ro = null
    let rafId = 0
    let relayoutTimer = 0
    let snapTimer = 0
    let lastW = 0
    let lastH = 0

    function capturePng() {
      if (!inst) return ''
      try {
        return inst.getDataURL({ type: 'png', pixelRatio: 1.5, backgroundColor: props.theme === 'dark' ? '#0f172a' : '#ffffff' })
      } catch (e) {
        return ''
      }
    }

    function draw() {
      const el = elRef.value
      if (!el || !el.clientWidth || !el.clientHeight || !props.option) return
      lastW = el.clientWidth
      lastH = el.clientHeight
      if (!inst) {
        inst = echarts.init(el)
        inst.on('click', (p) => emit('chart-click', p))
      }
      const dark = props.theme === 'dark'
      const harmonized = harmonizeEchartsOption(props.option, dark, {
        width: lastW,
        height: lastH,
        responsive: props.responsive,
        inCard: props.inCard,
      })
      inst.setOption(harmonized, { notMerge: true })
      if (props.wantSnapshot) {
        clearTimeout(snapTimer)
        snapTimer = setTimeout(() => {
          const url = capturePng()
          if (url) emit('snapshot', url)
        }, 280)
      }
    }

    onMounted(() => {
      nextTick(() => {
        draw()
        if (elRef.value && typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver((entries) => {
            const cr = entries[0] && entries[0].contentRect
            if (!cr || cr.width <= 0 || cr.height <= 0) return
            const nw = Math.round(cr.width)
            const nh = Math.round(cr.height)
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => {
              rafId = 0
              if (!elRef.value) return
              if (!inst) {
                draw()
                return
              }
              inst.resize()
              if (props.responsive && props.inCard && (Math.abs(nw - lastW) >= 16 || Math.abs(nh - lastH) >= 16)) {
                clearTimeout(relayoutTimer)
                relayoutTimer = setTimeout(() => {
                  if (elRef.value && inst) {
                    draw()
                    inst.resize()
                  }
                }, 95)
              }
            })
          })
          ro.observe(elRef.value)
        }
      })
    })

    watch(() => [props.option, props.theme, props.responsive, props.inCard], () => nextTick(draw), { deep: true })

    onBeforeUnmount(() => {
      clearTimeout(snapTimer)
      clearTimeout(relayoutTimer)
      if (rafId) cancelAnimationFrame(rafId)
      if (ro) ro.disconnect()
      if (inst) { inst.dispose(); inst = null }
    })

    expose({ capturePng })
    return { elRef }
  },
  template: `<div ref="elRef" :style="{ width: '100%', height: height, minHeight: 0, flex: height === '100%' ? '1 1 auto' : undefined }"></div>`,
}

function parseCustomSecidList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map((x) => (typeof x === 'string' ? { secid: x, name: x } : x)).filter((x) => x && x.secid)
  }
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean).map((sid) => {
    const pre = SYMBOL_PRESETS.find((p) => p.secid === sid)
    return { secid: sid, name: (pre && pre.name) || sid }
  })
}

function normalizeRedlines(cfg) {
  const out = []
  if (cfg && Array.isArray(cfg.redlines)) {
    for (const r of cfg.redlines) {
      if (r && Number.isFinite(Number(r.price)) && String(r.price).trim() !== '') {
        out.push({ price: Number(r.price), label: r.label || '预警线', color: r.color || '#f43f5e' })
      }
    }
  }
  if (!out.length && cfg && Number.isFinite(Number(cfg.redline)) && String(cfg.redline).trim() !== '') {
    out.push({ price: Number(cfg.redline), label: cfg.redlineLabel || '预警线', color: '#f43f5e' })
  }
  return out
}

export const QuantWidget = {
  components: { 'o2-echarts': O2Echarts, 'symbol-picker': SymbolPicker },
  props: {
    type: { type: String, required: true },
    config: { type: Object, default: () => ({}) },
    theme: { type: String, default: 'light' },
    sectors: { type: Array, default: () => [] },
    chokepoints: { type: Array, default: () => [] },
    customWidgets: { type: Array, default: () => [] },
    watchlist: { type: Array, default: () => [] },
    overview: { type: Object, default: () => ({}) },
    macro: { type: Object, default: () => ({}) },
    geo: { type: Object, default: () => ({}) },
    movers: { type: Object, default: () => ({}) },
    newsStatus: { type: Object, default: () => ({}) },
    newsItems: { type: Array, default: () => [] },
  },
  emits: ['pick-symbol', 'ask-ai', 'update-thumb', 'update-config', 'toggle-watchlist'],
  setup(props, { emit, expose }) {
    const wrapRef = ref(null)
    const chartRef = ref(null)
    const boxW = ref(560)
    const boxH = ref(320)
    let boxRo = null

    const loading = ref(false)
    const secid = ref((props.config && props.config.secid) || '0.399300')
    const secidName = ref((props.config && props.config.secidName) || '')
    const interval = ref((props.config && props.config.interval) || '1d')
    const barLimit = ref(Number(props.config?.limit) || 140)
    const showBoll = ref(props.config?.overlays ? props.config.overlays.boll !== false : props.config?.showBoll !== false)
    const redlineVal = ref(props.config?.redline ?? '')
    const redlineLabel = ref(props.config?.redlineLabel || '预警线')
    const rebasedGroup = ref((props.config && props.config.group) || (props.config && props.config.secids ? 'custom' : 'cn_bluechip'))
    const rebasedLimit = ref(Number(props.config?.rebasedLimit) || 90)
    const customCompareList = ref(parseCustomSecidList(props.config && (props.config.customSymbols || props.config.secids)))
    const formulaPreset = ref((props.config && props.config.preset) || 'gold_oil')
    const formulaSecidA = ref((props.config && props.config.secid_a) || '101.GC00Y')
    const formulaNameA = ref((props.config && props.config.name_a) || '')
    const formulaSecidB = ref((props.config && props.config.secid_b) || '112.B00Y')
    const formulaNameB = ref((props.config && props.config.name_b) || '')
    const formulaOp = ref((props.config && props.config.op) || 'ratio')
    const factorPack = ref((props.config && props.config.factor_pack) || 'oversold_reversal')
    const corrGroup = ref((props.config && props.config.corrGroup) || 'macro_core')
    const corrLimit = ref(Number(props.config?.corrLimit) || 60)
    const riskLimit = ref(Number(props.config?.riskLimit) || 240)
    const styleView = ref((props.config && props.config.styleView) || 'bar')
    const barcodeZoneFilter = ref('all')
    const divFilter = ref('all')
    const chokeMode = ref((props.config && props.config.chokeMode) || 'split')
    const catalystFilter = ref((props.config && props.config.catalystFilter) || 'all')

    const rawData = ref(null)
    let redlineTimer = 0

    const watchlistSet = computed(() => new Set((props.watchlist || []).map((w) => w.secid)))

    const klineOverlays = computed(() => {
      const ov = (props.config && props.config.overlays) || {}
      return {
        ma5: ov.ma5 !== false,
        ma10: !!ov.ma10,
        ma20: ov.ma20 !== false,
        ma60: ov.ma60 !== false,
        ema12: !!ov.ema12,
        ema26: !!ov.ema26,
        boll: ov.boll !== undefined ? !!ov.boll : showBoll.value,
        vol: !!ov.vol,
        macd: ov.macd !== false,
        rsi: ov.rsi !== false,
      }
    })

    const barcodeSecidsParam = computed(() => {
      const mode = (props.config && props.config.poolMode) || 'default'
      if (mode === 'watchlist') {
        return (props.watchlist || []).map((w) => w.secid).filter(Boolean).join(',')
      }
      if (mode === 'custom') {
        return parseCustomSecidList(props.config && (props.config.barcodeSymbols || props.config.secids)).map((x) => x.secid).join(',')
      }
      return ''
    })

    function emitConfig(patch) {
      emit('update-config', patch)
    }

    function onPickMainSymbol(item) {
      if (!item || !item.secid) return
      secid.value = item.secid
      secidName.value = item.name || item.symbol || item.secid
      emitConfig({ secid: secid.value, secidName: secidName.value })
    }

    function onSetInterval(iv) {
      interval.value = iv
      emitConfig({ interval: iv })
    }

    function onToggleBoll() {
      showBoll.value = !showBoll.value
      emitConfig({
        showBoll: showBoll.value,
        overlays: { ...klineOverlays.value, boll: showBoll.value },
      })
    }

    function onRedlineInput() {
      clearTimeout(redlineTimer)
      redlineTimer = setTimeout(() => {
        emitConfig({ redline: redlineVal.value, redlineLabel: redlineLabel.value })
      }, 360)
    }

    function onSelectRebasedGroup(gid) {
      rebasedGroup.value = gid
      if (gid === 'custom') {
        if (!customCompareList.value.length) {
          customCompareList.value = parseCustomSecidList(REBASED_GROUPS[0].secids)
        }
        emitConfig({
          group: 'custom',
          secids: customCompareList.value.map((x) => x.secid).join(','),
          customSymbols: customCompareList.value.slice(),
        })
      } else {
        emitConfig({ group: gid, secids: '' })
      }
    }

    function onAddCompareSymbol(item) {
      if (!item || !item.secid) return
      if (customCompareList.value.some((x) => x.secid === item.secid)) return
      if (customCompareList.value.length >= 6) {
        message.info('最多同时对比 6 只标的')
        return
      }
      customCompareList.value = [...customCompareList.value, { secid: item.secid, name: item.name || item.symbol || item.secid }]
      rebasedGroup.value = 'custom'
      emitConfig({
        group: 'custom',
        secids: customCompareList.value.map((x) => x.secid).join(','),
        customSymbols: customCompareList.value.slice(),
      })
    }

    function onRemoveCompareSymbol(sid) {
      if (customCompareList.value.length <= 2) {
        message.info('至少保留 2 只对比标的')
        return
      }
      customCompareList.value = customCompareList.value.filter((x) => x.secid !== sid)
      emitConfig({
        group: 'custom',
        secids: customCompareList.value.map((x) => x.secid).join(','),
        customSymbols: customCompareList.value.slice(),
      })
    }

    function onSelectFormulaPreset(pid) {
      formulaPreset.value = pid
      emitConfig({
        preset: pid,
        secid_a: formulaSecidA.value,
        name_a: formulaNameA.value,
        secid_b: formulaSecidB.value,
        name_b: formulaNameB.value,
        op: formulaOp.value,
      })
    }

    function onPickFormulaA(item) {
      if (!item || !item.secid) return
      formulaSecidA.value = item.secid
      formulaNameA.value = item.name || item.symbol || item.secid
      formulaPreset.value = 'custom'
      emitConfig({ preset: 'custom', secid_a: formulaSecidA.value, name_a: formulaNameA.value, secid_b: formulaSecidB.value, name_b: formulaNameB.value, op: formulaOp.value })
    }

    function onPickFormulaB(item) {
      if (!item || !item.secid) return
      formulaSecidB.value = item.secid
      formulaNameB.value = item.name || item.symbol || item.secid
      formulaPreset.value = 'custom'
      emitConfig({ preset: 'custom', secid_a: formulaSecidA.value, name_a: formulaNameA.value, secid_b: formulaSecidB.value, name_b: formulaNameB.value, op: formulaOp.value })
    }

    function onToggleFormulaOp() {
      formulaOp.value = formulaOp.value === 'ratio' ? 'spread' : 'ratio'
      formulaPreset.value = 'custom'
      emitConfig({ preset: 'custom', secid_a: formulaSecidA.value, name_a: formulaNameA.value, secid_b: formulaSecidB.value, name_b: formulaNameB.value, op: formulaOp.value })
    }

    function onSelectFactorPack(pk) {
      factorPack.value = pk
      emitConfig({ factor_pack: pk })
    }

    function onSetRebasedLimit(lim) {
      rebasedLimit.value = lim
      emitConfig({ rebasedLimit: lim })
    }

    function onSelectCorrGroup(gid) {
      corrGroup.value = gid
      emitConfig({ corrGroup: gid })
    }

    function onSetCorrLimit(lim) {
      corrLimit.value = lim
      emitConfig({ corrLimit: lim })
    }

    function onSetRiskLimit(lim) {
      riskLimit.value = lim
      emitConfig({ riskLimit: lim })
    }

    function onToggleCustomFitMode() {
      const next = (props.config && props.config.fitMode) === 'raw' ? 'auto' : 'raw'
      emitConfig({ fitMode: next })
    }

    function onExportCustomPng() {
      const url = capturePng()
      if (!url) {
        message.info('当前图表尚在渲染中')
        return
      }
      const a = document.createElement('a')
      a.href = url
      a.download = ((customRecord.value && customRecord.value.title) || 'o2-chart') + '.png'
      a.click()
    }

    async function fetchJson(url) {
      const r = await fetch(url)
      return r.json()
    }

    const LOCAL_ONLY_TYPES = new Set([
      'capital_flow', 'rotation_quadrant', 'chokepoint_watch', 'custom_echarts',
      'market_breadth', 'commodity_dashboard', 'rate_spread_watch', 'intel_catalyst',
    ])

    async function load() {
      const t = props.type
      if (LOCAL_ONLY_TYPES.has(t)) return
      loading.value = true
      try {
        if (t === 'pro_kline') {
          const qs = new URLSearchParams({ secid: secid.value, interval: interval.value, limit: String(barLimit.value || 140), name: secidName.value || '' })
          rawData.value = await fetchJson('/api/market/kline?' + qs.toString())
        } else if (t === 'rebased_compare') {
          let sids = ''
          if (rebasedGroup.value === 'custom' && customCompareList.value.length) {
            sids = customCompareList.value.map((x) => x.secid).join(',')
          } else {
            sids = (REBASED_GROUPS.find((g) => g.id === rebasedGroup.value) || REBASED_GROUPS[0]).secids
          }
          const lim = Number(rebasedLimit.value) || 90
          rawData.value = await fetchJson(`/api/market/quant?action=rebased&limit=${lim}&secids=` + encodeURIComponent(sids))
        } else if (t === 'formula_spread') {
          if (formulaPreset.value === 'custom') {
            const qs = new URLSearchParams({
              action: 'formula',
              preset: 'custom',
              secid_a: formulaSecidA.value,
              secid_b: formulaSecidB.value,
              op: formulaOp.value,
            })
            rawData.value = await fetchJson('/api/market/quant?' + qs.toString())
          } else {
            rawData.value = await fetchJson('/api/market/quant?action=formula&preset=' + encodeURIComponent(formulaPreset.value))
          }
        } else if (t === 'percentile_barcode') {
          const sp = barcodeSecidsParam.value
          const url = sp ? ('/api/market/quant?action=barcode&secids=' + encodeURIComponent(sp)) : '/api/market/quant?action=barcode'
          rawData.value = await fetchJson(url)
        } else if (t === 'analog_finder') {
          rawData.value = await fetchJson('/api/market/quant?action=analog&secid=' + encodeURIComponent(secid.value))
        } else if (t === 'event_study') {
          rawData.value = await fetchJson(`/api/market/quant?action=factors&secid=${encodeURIComponent(secid.value)}&factor_pack=${encodeURIComponent(factorPack.value)}`)
        } else if (t === 'divergence_radar') {
          rawData.value = await fetchJson('/api/market/quant?action=divergence')
        } else if (t === 'macro_clock') {
          rawData.value = await fetchJson('/api/market/quant?action=macro_regime')
        } else if (t === 'corr_matrix') {
          const qs = new URLSearchParams({ action: 'correlation', group: corrGroup.value, limit: String(corrLimit.value || 60) })
          if (corrGroup.value === 'watchlist') {
            const wlSids = (props.watchlist || []).map((w) => w.secid).filter(Boolean).slice(0, 7).join(',')
            if (wlSids) qs.set('secids', wlSids)
          }
          rawData.value = await fetchJson('/api/market/quant?' + qs.toString())
        } else if (t === 'risk_drawdown') {
          rawData.value = await fetchJson(`/api/market/quant?action=risk_metrics&secid=${encodeURIComponent(secid.value)}&limit=${riskLimit.value || 240}`)
        } else if (t === 'style_factor') {
          rawData.value = await fetchJson('/api/market/quant?action=style_rotation')
        }
      } catch (e) { /* ignore */ } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      load()
      if (wrapRef.value && typeof ResizeObserver !== 'undefined') {
        boxRo = new ResizeObserver((entries) => {
          const cr = entries[0] && entries[0].contentRect
          if (!cr) return
          if (cr.width > 0) boxW.value = Math.round(cr.width)
          if (cr.height > 0) boxH.value = Math.round(cr.height)
        })
        boxRo.observe(wrapRef.value)
      }
    })
    onBeforeUnmount(() => {
      clearTimeout(redlineTimer)
      if (boxRo) boxRo.disconnect()
    })

    const rebasedKey = computed(() => (
      (rebasedGroup.value === 'custom' ? customCompareList.value.map((x) => x.secid).join(',') : rebasedGroup.value) + ':' + rebasedLimit.value
    ))
    const corrKey = computed(() => (
      corrGroup.value + ':' + corrLimit.value + ':' + (corrGroup.value === 'watchlist' ? (props.watchlist || []).map((w) => w.secid).join(',') : '')
    ))

    watch(() => [props.type, secid.value, interval.value, barLimit.value, rebasedKey.value, formulaPreset.value, formulaSecidA.value, formulaSecidB.value, formulaOp.value, factorPack.value, barcodeSecidsParam.value, corrKey.value, riskLimit.value], load)
    watch(() => props.config, (nc) => {
      if (!nc) return
      if (nc.secid && nc.secid !== secid.value) secid.value = nc.secid
      if (nc.secidName !== undefined && nc.secidName !== secidName.value) secidName.value = nc.secidName
      if (nc.interval && nc.interval !== interval.value) interval.value = nc.interval
      if (nc.limit && Number(nc.limit) !== barLimit.value) barLimit.value = Number(nc.limit)
      if (nc.rebasedLimit && Number(nc.rebasedLimit) !== rebasedLimit.value) rebasedLimit.value = Number(nc.rebasedLimit)
      if (nc.overlays && nc.overlays.boll !== undefined && nc.overlays.boll !== showBoll.value) showBoll.value = !!nc.overlays.boll
      else if (nc.showBoll !== undefined && nc.showBoll !== showBoll.value) showBoll.value = nc.showBoll
      if (nc.preset && nc.preset !== formulaPreset.value) formulaPreset.value = nc.preset
      if (nc.secid_a && nc.secid_a !== formulaSecidA.value) formulaSecidA.value = nc.secid_a
      if (nc.name_a !== undefined && nc.name_a !== formulaNameA.value) formulaNameA.value = nc.name_a
      if (nc.secid_b && nc.secid_b !== formulaSecidB.value) formulaSecidB.value = nc.secid_b
      if (nc.name_b !== undefined && nc.name_b !== formulaNameB.value) formulaNameB.value = nc.name_b
      if (nc.op && nc.op !== formulaOp.value) formulaOp.value = nc.op
      if (nc.factor_pack && nc.factor_pack !== factorPack.value) factorPack.value = nc.factor_pack
      if (nc.corrGroup && nc.corrGroup !== corrGroup.value) corrGroup.value = nc.corrGroup
      if (nc.corrLimit && Number(nc.corrLimit) !== corrLimit.value) corrLimit.value = Number(nc.corrLimit)
      if (nc.riskLimit && Number(nc.riskLimit) !== riskLimit.value) riskLimit.value = Number(nc.riskLimit)
      if (nc.styleView && nc.styleView !== styleView.value) styleView.value = nc.styleView
      if (nc.chokeMode && nc.chokeMode !== chokeMode.value) chokeMode.value = nc.chokeMode
      if (nc.catalystFilter && nc.catalystFilter !== catalystFilter.value) catalystFilter.value = nc.catalystFilter
      if (nc.redline !== undefined && nc.redline !== redlineVal.value) redlineVal.value = nc.redline
      if (nc.redlineLabel && nc.redlineLabel !== redlineLabel.value) redlineLabel.value = nc.redlineLabel
      if (nc.group && nc.group !== rebasedGroup.value) rebasedGroup.value = nc.group
      if (nc.customSymbols || nc.secids) {
        const parsed = parseCustomSecidList(nc.customSymbols || nc.secids)
        if (parsed.length && parsed.map((x) => x.secid).join(',') !== customCompareList.value.map((x) => x.secid).join(',')) {
          customCompareList.value = parsed
        }
      }
    }, { deep: true })

    const customRecord = computed(() => {
      const cid = props.config && props.config.customWidgetId
      if (!cid) return null
      return (props.customWidgets || []).find((x) => x.id === cid) || null
    })

    const customDescription = computed(() => (
      (props.config && props.config.description) || (customRecord.value && customRecord.value.description) || ''
    ))

    const barcodeRows = computed(() => {
      let items = ((rawData.value && rawData.value.items) || []).slice()
      if (barcodeZoneFilter.value === 'hot') items = items.filter((x) => x.percentile >= 75)
      else if (barcodeZoneFilter.value === 'ice') items = items.filter((x) => x.percentile <= 25)
      const order = (props.config && props.config.sortOrder) || 'desc'
      items.sort((a, b) => order === 'asc' ? (a.percentile - b.percentile) : (b.percentile - a.percentile))
      return items
    })

    const proKlineSummary = computed(() => {
      const d = rawData.value
      if (props.type !== 'pro_kline' || !d || !Array.isArray(d.bars) || !d.bars.length) return null
      const rsiArr = (d.indicators && d.indicators.rsi14) || []
      const lastRsi = rsiArr.length ? Number(rsiArr[rsiArr.length - 1].value) : null
      let state = '中性', stateCls = 'info'
      if (lastRsi != null) {
        if (lastRsi >= 70) { state = `RSI ${lastRsi.toFixed(0)} 超买`; stateCls = 'high' }
        else if (lastRsi <= 30) { state = `RSI ${lastRsi.toFixed(0)} 超卖`; stateCls = 'ok' }
        else { state = `RSI ${lastRsi.toFixed(0)}`; stateCls = 'info' }
      }
      return { price: d.price, pct: d.pct, state, stateCls }
    })

    const rebasedSummary = computed(() => {
      const d = rawData.value
      if (props.type !== 'rebased_compare' || !d || !Array.isArray(d.series) || !d.series.length) return null
      const sorted = d.series.slice().sort((a, b) => (b.latest_pct || 0) - (a.latest_pct || 0))
      const top = sorted[0]
      const bot = sorted[sorted.length - 1]
      return {
        leader: top,
        laggard: bot,
        spread: Number(((top.latest_pct || 0) - (bot.latest_pct || 0)).toFixed(1)),
      }
    })

    const analogSummary = computed(() => {
      const d = rawData.value
      if (props.type !== 'analog_finder' || !d || !Array.isArray(d.analogs) || !d.analogs.length) return null
      const fwds = d.analogs.map((a) => Number(a.forward_20d_pct) || 0)
      const avg = fwds.reduce((s, v) => s + v, 0) / fwds.length
      const upCnt = fwds.filter((v) => v > 0).length
      return { avg: Number(avg.toFixed(2)), upCnt, total: fwds.length, top: d.analogs[0] }
    })

    const capitalFlowSummary = computed(() => {
      const list = props.sectors || []
      if (!list.length) return null
      let pos = 0, neg = 0
      for (const s of list) {
        const v = (Number(s.net_inflow) || 0) / 1e8
        if (v >= 0) pos += v
        else neg += v
      }
      return { net: Number((pos + neg).toFixed(1)), pos: Number(pos.toFixed(1)), neg: Number(neg.toFixed(1)) }
    })

    const quadrantCounts = computed(() => {
      const list = props.sectors || []
      const c = { lead: 0, lurk: 0, trap: 0, weak: 0 }
      for (const s of list) {
        const x = Number(s.pct) || 0
        const y = Number(s.net_inflow) || 0
        if (x >= 0 && y >= 0) c.lead++
        else if (x < 0 && y >= 0) c.lurk++
        else if (x >= 0 && y < 0) c.trap++
        else c.weak++
      }
      return c
    })

    const filteredDivergences = computed(() => {
      const list = (rawData.value && rawData.value.alerts) || []
      if (divFilter.value === 'all') return list
      if (divFilter.value === 'macro') return list.filter((x) => /宏观|跨资产/.test(x.tag || ''))
      if (divFilter.value === 'trap') return list.filter((x) => /背离|诱多/.test(x.tag || ''))
      if (divFilter.value === 'lurk') return list.filter((x) => /潜伏|吸筹/.test(x.tag || ''))
      return list
    })

    const breadthStats = computed(() => {
      const list = props.sectors || []
      const up = list.filter((s) => (Number(s.pct) || 0) > 0).length
      const down = list.filter((s) => (Number(s.pct) || 0) < 0).length
      const flat = list.length - up - down
      const total = Math.max(1, list.length)
      const upPct = Math.round((up / total) * 100)
      const inflowUp = list.filter((s) => (Number(s.net_inflow) || 0) > 0).length
      const avgPct = list.length ? Number((list.reduce((a, b) => a + (Number(b.pct) || 0), 0) / list.length).toFixed(2)) : 0
      const pcts = list.map((s) => Number(s.pct) || 0)
      const maxPct = pcts.length ? Math.max(...pcts) : 0
      const minPct = pcts.length ? Math.min(...pcts) : 0
      const buckets = [
        { lbl: '<-2%', cnt: 0, col: '#b91c1c' },
        { lbl: '-2~-1', cnt: 0, col: '#ef4444' },
        { lbl: '-1~0', cnt: 0, col: '#f87171' },
        { lbl: '0~1', cnt: 0, col: '#34d399' },
        { lbl: '1~2', cnt: 0, col: '#10b981' },
        { lbl: '>2%', cnt: 0, col: '#059669' },
      ]
      for (const p of pcts) {
        if (p < -2) buckets[0].cnt++
        else if (p < -1) buckets[1].cnt++
        else if (p < 0) buckets[2].cnt++
        else if (p < 1) buckets[3].cnt++
        else if (p < 2) buckets[4].cnt++
        else buckets[5].cnt++
      }
      let temp = '均衡震荡', tempColor = '#3b82f6'
      if (upPct >= 75) { temp = '普涨过热'; tempColor = '#10b981' }
      else if (upPct >= 58) { temp = '多头主导'; tempColor = '#34d399' }
      else if (upPct <= 20) { temp = '情绪冰点'; tempColor = '#ef4444' }
      else if (upPct <= 40) { temp = '弱势防御'; tempColor = '#f59e0b' }
      return { total: list.length, up, down, flat, upPct, inflowUp, avgPct, dispersion: Number((maxPct - minPct).toFixed(2)), buckets, temp, tempColor }
    })

    const commodityTiles = computed(() => {
      const panels = (props.overview && props.overview.panels) || []
      const pickPanel = (id) => (panels.find((p) => p.id === id)?.items || [])
      const comms = pickPanel('commodities').map((x) => ({ ...x, grp: /金|银/.test(x.name || '') ? '贵金属' : (/油|气/.test(x.name || '') ? '能源' : '工业') }))
      const fx = pickPanel('forex').filter((x) => /美元|人民币|日元/.test(x.name || '') || /UDI|USDCNH/.test(x.secid || '')).slice(0, 2).map((x) => ({ ...x, grp: '汇率' }))
      const ship = pickPanel('cn_logistics').filter((x) => /海控|顺丰|招轮|港/.test(x.name || '')).slice(0, 2).map((x) => ({ ...x, grp: '航运物流' }))
      return [...comms, ...ship, ...fx]
    })

    const rateSpreadMetrics = computed(() => {
      const rates = (props.macro && props.macro.treasury && props.macro.treasury.rates) || []
      const findRate = (re) => {
        const hit = rates.find((r) => re.test(String(r.label || '') + ' ' + String(r.tenor || '')))
        return hit && hit.rate != null ? Number(hit.rate) : null
      }
      const r10 = findRate(/10[\s-]?Year|10Y/i)
      const r2 = findRate(/2[\s-]?Year|2Y/i)
      const r3m = findRate(/3[\s-]?Month|3M|1[\s-]?Month/i)
      const r30 = findRate(/30[\s-]?Year|30Y/i)
      const s10_2 = (r10 != null && r2 != null) ? Math.round((r10 - r2) * 100) : null
      const s10_3m = (r10 != null && r3m != null) ? Math.round((r10 - r3m) * 100) : null
      let curveState = '正常陡峭', curveCls = 'ok'
      if (s10_2 != null) {
        if (s10_2 < 0) { curveState = '倒挂衰退预警'; curveCls = 'high' }
        else if (s10_2 < 25) { curveState = '平坦观望'; curveCls = 'warn' }
      }
      const panels = (props.overview && props.overview.panels) || []
      const fxItems = (panels.find((p) => p.id === 'forex')?.items || []).slice(0, 4)
      const bondItems = (panels.find((p) => p.id === 'etf_bonds')?.items || []).filter((x) => /债|TLT|国债/.test((x.name || '') + (x.symbol || ''))).slice(0, 3)
      return { r10, r2, r3m, r30, s10_2, s10_3m, curveState, curveCls, fxItems, bondItems }
    })

    const catalystData = computed(() => {
      const items = (props.newsItems || []).slice()
      let filtered = items
      if (catalystFilter.value === 'bullish') filtered = items.filter((x) => x.sentiment === 'bullish')
      else if (catalystFilter.value === 'bearish') filtered = items.filter((x) => x.sentiment === 'bearish')
      else if (catalystFilter.value === 'high') filtered = items.filter((x) => (Number(x.impact_score) || 0) >= 65 || x.sentiment !== 'neutral')
      filtered.sort((a, b) => ((Number(b.impact_score) || 0) - (Number(a.impact_score) || 0)) || ((Number(b.published_at) || 0) - (Number(a.published_at) || 0)))
      const bull = items.filter((x) => x.sentiment === 'bullish').length
      const bear = items.filter((x) => x.sentiment === 'bearish').length
      const tot = Math.max(1, bull + bear)
      return {
        rows: filtered.slice(0, Number(props.config?.limit) || 14),
        bull,
        bear,
        bullPct: Math.round((bull / tot) * 100),
      }
    })

    const computedOption = computed(() => {
      const t = props.type
      const d = rawData.value
      const cfg = props.config || {}

      if (t === 'custom_echarts') {
        const rec = customRecord.value
        return (cfg && cfg.option) || (rec && rec.spec && rec.spec.option) || null
      }

      if (t === 'pro_kline') {
        if (!d || !Array.isArray(d.bars) || !d.bars.length) return null
        const bars = d.bars
        const dates = bars.map((b) => b.time)
        const closes = bars.map((b) => Number(b.close) || 0)
        const ohlc = bars.map((b) => [b.open, b.close, b.low, b.high])
        const ind = d.indicators || {}
        const ov = klineOverlays.value
        const mapSeries = (arr, key = 'value') => {
          const mp = Object.fromEntries((arr || []).map((x) => [x.time, x[key]]))
          return dates.map((dt) => (mp[dt] !== undefined ? mp[dt] : null))
        }

        const rlines = normalizeRedlines({ ...cfg, redline: redlineVal.value, redlineLabel: redlineLabel.value })
        const series = [
          {
            name: d.name || secidName.value || secid.value,
            type: 'candlestick',
            data: ohlc,
            itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' },
            markLine: rlines.length ? {
              symbol: 'none',
              data: rlines.map((rl) => ({
                yAxis: rl.price,
                lineStyle: { color: rl.color || '#f43f5e', width: 1.7, type: 'dashed' },
                label: {
                  position: 'insideEndTop',
                  formatter: `${rl.label}: ${rl.price}`,
                  color: '#fff',
                  backgroundColor: rl.color || '#e11d48',
                  padding: [2, 5],
                  borderRadius: 3,
                  fontSize: 10,
                },
              })),
            } : undefined,
          },
        ]

        if (ov.ma5) series.push({ name: 'MA5', type: 'line', data: mapSeries(ind.ma5), smooth: true, showSymbol: false, lineStyle: { width: 1.2, color: '#3b82f6' } })
        if (ov.ma10) series.push({ name: 'MA10', type: 'line', data: calcSma(closes, 10), smooth: true, showSymbol: false, lineStyle: { width: 1.2, color: '#06b6d4' } })
        if (ov.ma20) series.push({ name: 'MA20', type: 'line', data: mapSeries(ind.ma20), smooth: true, showSymbol: false, lineStyle: { width: 1.2, color: '#f59e0b' } })
        if (ov.ma60) series.push({ name: 'MA60', type: 'line', data: mapSeries(ind.ma60), smooth: true, showSymbol: false, lineStyle: { width: 1.2, color: '#a855f7' } })
        if (ov.ema12) series.push({ name: 'EMA12', type: 'line', data: calcEma(closes, 12), smooth: true, showSymbol: false, lineStyle: { width: 1.1, type: 'dotted', color: '#14b8a6' } })
        if (ov.ema26) series.push({ name: 'EMA26', type: 'line', data: calcEma(closes, 26), smooth: true, showSymbol: false, lineStyle: { width: 1.1, type: 'dotted', color: '#f97316' } })
        if (ov.boll && ind.boll && ind.boll.length) {
          series.push(
            { name: 'BOLL上轨', type: 'line', data: mapSeries(ind.boll, 'upper'), smooth: true, showSymbol: false, lineStyle: { width: 1, type: 'dashed', color: '#38bdf8' } },
            { name: 'BOLL下轨', type: 'line', data: mapSeries(ind.boll, 'lower'), smooth: true, showSymbol: false, lineStyle: { width: 1, type: 'dashed', color: '#38bdf8' } },
          )
        }

        // 动态组装副图（按勾选叠加，并在极矮高度下自动精简防撞车）
        const subPanes = []
        if (ov.vol) subPanes.push('vol')
        if (ov.macd) subPanes.push('macd')
        if (ov.rsi) subPanes.push('rsi')
        const maxSubs = boxH.value < 220 ? 1 : (boxH.value < 290 ? 2 : 3)
        const activeSubs = subPanes.slice(0, maxSubs)

        const leftPad = boxW.value < 380 ? 44 : 54
        const grids = []
        const xAxes = []
        const yAxes = []
        const topPad = boxH.value < 190 ? 12 : 26

        if (activeSubs.length === 0) {
          grids.push({ left: leftPad, right: 12, top: topPad, bottom: 20 })
          xAxes.push({ type: 'category', data: dates, axisLabel: { hideOverlap: true } })
          yAxes.push({ scale: true, splitNumber: 5, axisLabel: { formatter: fmtCompactAxis } })
        } else if (activeSubs.length === 1) {
          grids.push(
            { left: leftPad, right: 12, top: topPad, height: '56%' },
            { left: leftPad, right: 12, top: '69%', bottom: 20 },
          )
          xAxes.push(
            { type: 'category', data: dates, axisLabel: { show: false } },
            { type: 'category', gridIndex: 1, data: dates, axisLabel: { hideOverlap: true } },
          )
          yAxes.push({ scale: true, splitNumber: 4, axisLabel: { formatter: fmtCompactAxis } })
        } else if (activeSubs.length === 2) {
          grids.push(
            { left: leftPad, right: 12, top: topPad, height: '44%' },
            { left: leftPad, right: 12, top: '57%', height: '16%' },
            { left: leftPad, right: 12, top: '77%', bottom: 20 },
          )
          xAxes.push(
            { type: 'category', data: dates, axisLabel: { show: false } },
            { type: 'category', gridIndex: 1, data: dates, axisLabel: { show: false } },
            { type: 'category', gridIndex: 2, data: dates, axisLabel: { hideOverlap: true } },
          )
          yAxes.push({ scale: true, splitNumber: 4, axisLabel: { formatter: fmtCompactAxis } })
        } else {
          grids.push(
            { left: leftPad, right: 12, top: topPad, height: '38%' },
            { left: leftPad, right: 12, top: '50%', height: '12%' },
            { left: leftPad, right: 12, top: '65%', height: '13%' },
            { left: leftPad, right: 12, top: '81%', bottom: 20 },
          )
          xAxes.push(
            { type: 'category', data: dates, axisLabel: { show: false } },
            { type: 'category', gridIndex: 1, data: dates, axisLabel: { show: false } },
            { type: 'category', gridIndex: 2, data: dates, axisLabel: { show: false } },
            { type: 'category', gridIndex: 3, data: dates, axisLabel: { hideOverlap: true } },
          )
          yAxes.push({ scale: true, splitNumber: 4, axisLabel: { formatter: fmtCompactAxis } })
        }

        activeSubs.forEach((paneKind, i) => {
          const gi = i + 1
          if (paneKind === 'vol') {
            yAxes.push({ scale: true, gridIndex: gi, splitNumber: 2, axisLabel: { formatter: fmtCompactAxis } })
            series.push({
              name: '成交量',
              type: 'bar',
              xAxisIndex: gi,
              yAxisIndex: gi,
              data: bars.map((b) => ({
                value: Number(b.volume) || 0,
                itemStyle: { color: b.close >= b.open ? 'rgba(16,185,129,0.65)' : 'rgba(239,68,68,0.65)' },
              })),
            })
          } else if (paneKind === 'macd') {
            yAxes.push({ scale: true, gridIndex: gi, splitNumber: 2, axisLabel: { formatter: fmtCompactAxis } })
            const macdHist = mapSeries(ind.macd, 'hist')
            series.push(
              {
                name: 'MACD柱', type: 'bar', xAxisIndex: gi, yAxisIndex: gi,
                data: macdHist.map((v) => ({ value: v, itemStyle: { color: (v || 0) >= 0 ? '#10b981' : '#ef4444' } })),
              },
              { name: 'DIF', type: 'line', xAxisIndex: gi, yAxisIndex: gi, data: mapSeries(ind.macd, 'dif'), showSymbol: false, lineStyle: { width: 1.1, color: '#3b82f6' } },
              { name: 'DEA', type: 'line', xAxisIndex: gi, yAxisIndex: gi, data: mapSeries(ind.macd, 'dea'), showSymbol: false, lineStyle: { width: 1.1, color: '#f59e0b' } },
            )
          } else if (paneKind === 'rsi') {
            yAxes.push({ min: 0, max: 100, gridIndex: gi, splitNumber: 2 })
            series.push({
              name: 'RSI14', type: 'line', xAxisIndex: gi, yAxisIndex: gi, data: mapSeries(ind.rsi14), showSymbol: false,
              lineStyle: { width: 1.4, color: '#ec4899' },
              markLine: {
                symbol: 'none', silent: true,
                lineStyle: { type: 'dotted', color: '#64748b' },
                data: [{ yAxis: 70 }, { yAxis: 30 }],
                label: { fontSize: 9, position: 'insideEndTop' },
              },
            })
          }
        })

        return {
          legend: { show: boxH.value >= 190, type: 'scroll', top: 2, left: 6, right: 6, itemWidth: 10, itemHeight: 6, textStyle: { fontSize: 10 } },
          axisPointer: { link: [{ xAxisIndex: 'all' }] },
          dataZoom: [{ type: 'inside', xAxisIndex: grids.map((_, idx) => idx), start: 35, end: 100 }],
          grid: grids,
          xAxis: xAxes,
          yAxis: yAxes,
          series,
        }
      }

      if (t === 'rebased_compare') {
        if (!d || !Array.isArray(d.series) || !d.series.length) return null
        const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4']
        const smooth = cfg.smooth !== false
        const showZero = cfg.zeroLine !== false
        const areaFill = !!cfg.areaFill
        return {
          legend: { type: 'scroll', top: 2, left: 6, right: 6, textStyle: { fontSize: 10 } },
          grid: { left: 10, right: 14, top: 30, bottom: 20, containLabel: true },
          xAxis: { type: 'category', data: d.dates || [], axisLabel: { hideOverlap: true } },
          yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
          series: d.series.map((s, idx) => ({
            name: `${s.name} (${s.latest_pct >= 0 ? '+' : ''}${s.latest_pct}%)`,
            type: 'line',
            smooth,
            showSymbol: false,
            connectNulls: true,
            lineStyle: { width: 2, color: palette[idx % palette.length] },
            itemStyle: { color: palette[idx % palette.length] },
            areaStyle: areaFill ? { opacity: 0.08 } : undefined,
            markLine: idx === 0 && showZero ? {
              symbol: 'none', silent: true,
              lineStyle: { color: '#64748b', type: 'dashed' },
              data: [{ yAxis: 0 }],
            } : undefined,
            data: s.values,
          })),
        }
      }

      if (t === 'formula_spread') {
        if (!d || !d.ok || !Array.isArray(d.values) || !d.values.length) return null
        const titleLabel = formulaPreset.value === 'custom'
          ? `${formulaNameA.value || formulaSecidA.value} ${formulaOp.value === 'ratio' ? '/' : '-'} ${formulaNameB.value || formulaSecidB.value}`
          : d.title
        const lines = []
        if (cfg.showSigma2 !== false) {
          lines.push(
            { yAxis: d.up2, lineStyle: { color: '#ef4444', type: 'dashed' }, label: { formatter: '+2σ', color: '#ef4444', fontSize: 9.5, distance: 3 } },
            { yAxis: d.dn2, lineStyle: { color: '#10b981', type: 'dashed' }, label: { formatter: '-2σ', color: '#10b981', fontSize: 9.5, distance: 3 } },
          )
        }
        if (cfg.showSigma1 !== false) {
          lines.push(
            { yAxis: d.up1, lineStyle: { color: '#f59e0b', type: 'dotted' }, label: { formatter: '+1σ', color: '#f59e0b', fontSize: 9.5, distance: 3 } },
            { yAxis: d.dn1, lineStyle: { color: '#38bdf8', type: 'dotted' }, label: { formatter: '-1σ', color: '#38bdf8', fontSize: 9.5, distance: 3 } },
          )
        }
        if (cfg.showMean !== false) {
          lines.push({ yAxis: d.mean, lineStyle: { color: '#94a3b8', type: 'dashed' }, label: { formatter: '均值', color: '#94a3b8', fontSize: 9.5, distance: 3 } })
        }
        return {
          grid: { left: 10, right: 48, top: 18, bottom: 20, containLabel: true },
          xAxis: { type: 'category', data: d.dates, axisLabel: { hideOverlap: true } },
          yAxis: { type: 'value', scale: true, axisLabel: { formatter: fmtCompactAxis } },
          series: [{
            name: titleLabel,
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: d.values,
            lineStyle: { width: 2.2, color: '#3b82f6' },
            areaStyle: cfg.areaFill !== false ? { color: 'rgba(59,130,246,0.10)' } : undefined,
            markLine: lines.length ? { symbol: 'none', silent: true, data: lines } : undefined,
          }],
        }
      }

      if (t === 'capital_flow') {
        const list = (props.sectors || []).slice()
        if (!list.length) return null
        list.sort((a, b) => (Number(b.net_inflow) || 0) - (Number(a.net_inflow) || 0))
        const cfgTopN = Number(cfg.topN) || 0
        const eachSide = cfgTopN || (boxH.value < 210 ? 4 : (boxH.value < 265 ? 5 : 7))
        const fmode = cfg.flowMode || 'both'
        const merged = fmode === 'in'
          ? list.slice(0, eachSide).reverse()
          : (fmode === 'out' ? list.slice(-eachSide) : [...list.slice(-eachSide), ...list.slice(0, eachSide)])
        return {
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: 8, right: 18, top: 10, bottom: 20, containLabel: true },
          xAxis: { type: 'value', axisLabel: { formatter: '{value}亿', hideOverlap: true } },
          yAxis: {
            type: 'category',
            data: merged.map((x) => x.name),
            axisLabel: {
              interval: 0,
              fontSize: 10,
              formatter: (v) => (String(v).length > 6 ? String(v).slice(0, 6) + '…' : v),
            },
          },
          series: [{
            name: '主力净流入(亿)',
            type: 'bar',
            barMaxWidth: 14,
            data: merged.map((x) => {
              const v = Number(((Number(x.net_inflow) || 0) / 1e8).toFixed(2))
              return { value: v, itemStyle: { color: v >= 0 ? '#10b981' : '#ef4444', borderRadius: v >= 0 ? [0, 3, 3, 0] : [3, 0, 0, 3] } }
            }),
          }],
        }
      }

      if (t === 'rotation_quadrant') {
        const list = props.sectors || []
        if (!list.length) return null
        const pts = list.map((s) => {
          const x = Number(s.pct) || 0
          const y = Number(((Number(s.net_inflow) || 0) / 1e8).toFixed(2))
          const cap = Math.max(1, Number(s.mkt_cap) || 1)
          return {
            name: s.name,
            value: [x, y, cap],
            itemStyle: {
              color: x >= 0 && y >= 0 ? '#10b981' : (x < 0 && y >= 0 ? '#3b82f6' : (x >= 0 && y < 0 ? '#f59e0b' : '#ef4444')),
              opacity: 0.85,
            },
          }
        })
        const caps = pts.map((p) => p.value[2])
        const maxCap = Math.max(...caps, 1)
        const wmColor = props.theme === 'dark' ? 'rgba(148,163,184,0.34)' : 'rgba(71,85,105,0.38)'
        return {
          tooltip: {
            trigger: 'item',
            formatter: (p) => `<b>${p.data.name}</b><br/>涨跌幅: ${p.data.value[0] >= 0 ? '+' : ''}${p.data.value[0]}%<br/>主力净流: ${p.data.value[1] >= 0 ? '+' : ''}${p.data.value[1]}亿`,
          },
          graphic: boxW.value >= 280 ? [
            { type: 'text', right: 20, top: 24, silent: true, style: { text: '↗ 领涨主线', fill: '#10b981', opacity: 0.6, font: '600 10px sans-serif' } },
            { type: 'text', left: 54, top: 24, silent: true, style: { text: '↖ 左侧潜伏', fill: '#3b82f6', opacity: 0.6, font: '600 10px sans-serif' } },
            { type: 'text', right: 20, bottom: 34, silent: true, style: { text: '↘ 诱多背离', fill: '#f59e0b', opacity: 0.6, font: '600 10px sans-serif' } },
            { type: 'text', left: 54, bottom: 34, silent: true, style: { text: '↙ 弱势出清', fill: wmColor, font: '600 10px sans-serif' } },
          ] : undefined,
          grid: { left: 10, right: 16, top: 22, bottom: 28, containLabel: true },
          xAxis: {
            type: 'value',
            name: boxW.value >= 300 ? '涨跌%' : '',
            nameLocation: 'middle',
            nameGap: 18,
            splitLine: { show: true },
            axisLabel: { formatter: '{value}%', hideOverlap: true },
          },
          yAxis: { type: 'value', name: boxW.value >= 300 ? '净流(亿)' : '', nameGap: 6, splitLine: { show: true } },
          series: [{
            type: 'scatter',
            data: pts,
            symbolSize: (val) => Math.max(8, Math.min(24, Math.sqrt(val[2] / maxCap) * 22)),
            label: { show: cfg.showLabels !== false && boxW.value >= 260, formatter: (p) => p.data.name, position: 'top', fontSize: 9.5, color: props.theme === 'dark' ? '#cbd5e1' : '#334155' },
            labelLayout: cfg.hideOverlap !== false ? { hideOverlap: true } : undefined,
            markLine: cfg.showAxes !== false ? {
              silent: true, symbol: 'none',
              lineStyle: { color: '#64748b', type: 'dashed' },
              data: [{ xAxis: 0 }, { yAxis: 0 }],
            } : undefined,
          }],
        }
      }

      if (t === 'chokepoint_watch') {
        const cps = (props.chokepoints || []).slice()
        if (!cps.length) return null
        if (chokeMode.value === 'total') {
          cps.sort((a, b) => (Number(a.n_total) || 0) - (Number(b.n_total) || 0))
        }
        const names = cps.map((c) => String(c.portname || '').replace(' Strait', '').replace(' Canal', ''))
        const isHorizontal = boxW.value < 380 || chokeMode.value === 'total'
        if (isHorizontal) {
          return {
            legend: { show: chokeMode.value !== 'total', type: 'scroll', top: 2, left: 6, right: 6 },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            grid: { left: 8, right: 16, top: chokeMode.value !== 'total' ? 26 : 10, bottom: 16, containLabel: true },
            xAxis: { type: 'value', axisLabel: { hideOverlap: true } },
            yAxis: {
              type: 'category',
              data: names,
              axisLabel: { interval: 0, fontSize: 9.5, formatter: (v) => (String(v).length > 9 ? String(v).slice(0, 9) + '…' : v) },
            },
            series: chokeMode.value === 'total'
              ? [{ name: '日通行总艘次', type: 'bar', barMaxWidth: 14, data: cps.map((c) => Number(c.n_total) || 0), itemStyle: { color: '#3b82f6', borderRadius: [0, 3, 3, 0] } }]
              : [
                { name: '集装箱船', type: 'bar', stack: 'ship', barMaxWidth: 14, data: cps.map((c) => Number(c.n_container) || 0), itemStyle: { color: '#3b82f6' } },
                { name: '油轮', type: 'bar', stack: 'ship', barMaxWidth: 14, data: cps.map((c) => Number(c.n_tanker) || 0), itemStyle: { color: '#f59e0b', borderRadius: [0, 3, 3, 0] } },
              ],
          }
        }
        return {
          legend: { type: 'scroll', top: 2, left: 6, right: 6 },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: 10, right: 14, top: 28, bottom: 8, containLabel: true },
          xAxis: {
            type: 'category',
            data: names,
            axisLabel: { rotate: 20, interval: 0, fontSize: 9.5 },
          },
          yAxis: { type: 'value', name: '艘次', nameGap: 6 },
          series: [
            { name: '集装箱船', type: 'bar', data: cps.map((c) => Number(c.n_container) || 0), itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] } },
            { name: '油轮', type: 'bar', data: cps.map((c) => Number(c.n_tanker) || 0), itemStyle: { color: '#f59e0b', borderRadius: [3, 3, 0, 0] } },
          ],
        }
      }

      if (t === 'analog_finder') {
        if (!d || !d.ok || !Array.isArray(d.labels)) return null
        const colors = ['#60a5fa', '#34d399', '#fbbf24']
        const topN = Math.max(1, Math.min(3, Number(cfg.topN) || 3))
        const series = [
          {
            name: `${d.name} 当前走势`,
            type: 'line',
            data: d.current,
            showSymbol: false,
            lineStyle: { width: 2.8, color: props.theme === 'dark' ? '#f8fafc' : '#0f172a' },
            markLine: cfg.showDivider !== false ? {
              symbol: 'none', silent: true,
              data: [{
                xAxis: d.labels[d.window - 1],
                lineStyle: { color: '#ef4444', type: 'dashed' },
                label: { formatter: '今日→推演', fontSize: 9.5, position: 'insideEndTop' },
              }],
            } : undefined,
          },
        ]
        if (cfg.showAvg !== false) {
          series.push({
            name: 'Top均值推演',
            type: 'line',
            data: d.avg_projection,
            showSymbol: false,
            lineStyle: { width: 2.4, type: 'dashed', color: '#3b82f6' },
          })
        }
        if (cfg.showSamples !== false) {
          for (const [i, a] of (d.analogs || []).slice(0, topN).entries()) {
            series.push({
              name: `${a.period.slice(0, 7)} (${a.similarity}%)`,
              type: 'line',
              data: a.path,
              showSymbol: false,
              lineStyle: { width: 1.2, type: 'dotted', color: colors[i % colors.length], opacity: 0.72 },
            })
          }
        }
        return {
          legend: { type: 'scroll', top: 2, left: 6, right: 6, textStyle: { fontSize: 9.5 } },
          grid: { left: 10, right: 14, top: 30, bottom: 20, containLabel: true },
          xAxis: { type: 'category', data: d.labels, axisLabel: { hideOverlap: true } },
          yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
          series,
        }
      }

      if (t === 'event_study') {
        if (!d || !d.ok || !Array.isArray(d.labels)) return null
        const ml = []
        if (cfg.showTriggerLine !== false) {
          ml.push({ xAxis: 'T0(触发)', lineStyle: { color: '#f59e0b', type: 'dashed' }, label: { formatter: '信号触发', fontSize: 9.5, position: 'insideEndTop' } })
        }
        if (cfg.showZeroLine !== false) {
          ml.push({ yAxis: 0, lineStyle: { color: '#64748b', type: 'dotted' } })
        }
        const series = [
          {
            name: '平均累计收益',
            type: 'line',
            data: d.mean_curve,
            showSymbol: false,
            lineStyle: { width: 2.6, color: '#3b82f6' },
            areaStyle: { color: 'rgba(59,130,246,0.13)' },
            markLine: ml.length ? { symbol: 'none', silent: true, data: ml } : undefined,
          },
        ]
        if (cfg.showBand !== false) {
          series.unshift({
            name: '75%分位上沿',
            type: 'line',
            data: d.p75_curve,
            showSymbol: false,
            lineStyle: { width: 1, type: 'dashed', color: '#10b981' },
          })
          series.push({
            name: '25%分位下沿',
            type: 'line',
            data: d.p25_curve,
            showSymbol: false,
            lineStyle: { width: 1, type: 'dashed', color: '#ef4444' },
          })
        }
        return {
          legend: { type: 'scroll', top: 2, left: 6, right: 6, textStyle: { fontSize: 10 } },
          grid: { left: 10, right: 14, top: 30, bottom: 20, containLabel: true },
          xAxis: { type: 'category', data: d.labels, axisLabel: { hideOverlap: true } },
          yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
          series,
        }
      }

      if (t === 'corr_matrix') {
        if (!d || !d.ok || !Array.isArray(d.names) || !Array.isArray(d.matrix)) return null
        const shortNames = d.names.map((n) => String(n).replace('COMEX', '').replace('布伦特', '').slice(0, boxW.value < 340 ? 4 : 6))
        const dark = props.theme === 'dark'
        return {
          tooltip: {
            trigger: 'item',
            formatter: (p) => {
              const v = p.data
              return `<b>${d.names[v[0]]} × ${d.names[v[1]]}</b><br/>相关系数 r = <b>${v[2]}</b>`
            },
          },
          grid: { left: 6, right: 10, top: 8, bottom: 8, containLabel: true },
          xAxis: { type: 'category', data: shortNames, splitArea: { show: false }, axisLabel: { interval: 0, rotate: boxW.value < 380 ? 28 : 0, fontSize: 9.5 } },
          yAxis: { type: 'category', data: shortNames, splitArea: { show: false }, axisLabel: { interval: 0, fontSize: 9.5 } },
          visualMap: {
            show: false,
            min: -1,
            max: 1,
            inRange: {
              color: dark
                ? ['#1d4ed8', '#2563eb', '#1e293b', '#b45309', '#dc2626']
                : ['#2563eb', '#60a5fa', '#f1f5f9', '#f59e0b', '#dc2626'],
            },
          },
          series: [{
            type: 'heatmap',
            data: d.matrix,
            label: {
              show: boxW.value >= 250 && boxH.value >= 165,
              fontSize: boxW.value < 340 ? 8.5 : 10,
              color: dark ? '#f8fafc' : '#0f172a',
              formatter: (p) => Number(p.data[2]).toFixed(2),
            },
            itemStyle: {
              borderColor: dark ? '#0b0f17' : '#ffffff',
              borderWidth: 1.5,
              borderRadius: 2,
            },
          }],
        }
      }

      if (t === 'risk_drawdown') {
        if (!d || !d.ok || !Array.isArray(d.drawdown_curve) || !d.drawdown_curve.length) return null
        return {
          tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '-' : `${v}%`) },
          grid: { left: 8, right: 14, top: 14, bottom: 18, containLabel: true },
          xAxis: { type: 'category', data: d.dates, axisLabel: { hideOverlap: true } },
          yAxis: { type: 'value', max: 0, axisLabel: { formatter: '{value}%' } },
          series: [{
            name: '动态水下回撤',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: d.drawdown_curve,
            lineStyle: { width: 1.8, color: '#ef4444' },
            areaStyle: { color: 'rgba(239,68,68,0.22)' },
            markLine: {
              symbol: 'none', silent: true,
              data: [{ yAxis: d.max_drawdown, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: `最大回撤 ${d.max_drawdown}%`, position: 'insideEndBottom', fontSize: 9.5, color: '#ef4444' } }],
            },
          }],
        }
      }

      if (t === 'market_breadth') {
        const bs = breadthStats.value
        if (!bs.total) return null
        return {
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: 8, right: 10, top: 14, bottom: 18, containLabel: true },
          xAxis: { type: 'category', data: bs.buckets.map((b) => b.lbl), axisLabel: { interval: 0, fontSize: 9.5 } },
          yAxis: { type: 'value', minInterval: 1, splitNumber: 3 },
          series: [{
            name: '行业数',
            type: 'bar',
            barMaxWidth: 26,
            data: bs.buckets.map((b) => ({ value: b.cnt, itemStyle: { color: b.col, borderRadius: [3, 3, 0, 0] } })),
            label: { show: true, position: 'top', fontSize: 9.5, formatter: (p) => (p.value > 0 ? p.value : '') },
          }],
        }
      }

      if (t === 'style_factor') {
        if (!d || !d.ok || !Array.isArray(d.items) || !d.items.length) return null
        const items = d.items
        if (styleView.value === 'radar') {
          const allVals = items.flatMap((x) => [x.r5, x.r20, x.r60])
          const bound = Math.max(8, Math.ceil(Math.max(...allVals.map((v) => Math.abs(v))) / 5) * 5)
          return {
            legend: { type: 'scroll', top: 2, left: 6, right: 6, textStyle: { fontSize: 9.5 } },
            tooltip: { trigger: 'item' },
            radar: {
              center: ['50%', '56%'],
              radius: boxH.value < 220 ? '54%' : '64%',
              indicator: items.map((x) => ({ name: x.style, min: -bound, max: bound })),
              axisName: { fontSize: 9.5 },
              splitArea: { areaStyle: { color: ['transparent'] } },
            },
            series: [{
              type: 'radar',
              symbolSize: 4,
              data: [
                { name: '5日', value: items.map((x) => x.r5), lineStyle: { color: '#3b82f6', width: 2 }, itemStyle: { color: '#3b82f6' }, areaStyle: { color: 'rgba(59,130,246,0.16)' } },
                { name: '20日', value: items.map((x) => x.r20), lineStyle: { color: '#10b981', width: 2 }, itemStyle: { color: '#10b981' }, areaStyle: { color: 'rgba(16,185,129,0.14)' } },
                { name: '60日', value: items.map((x) => x.r60), lineStyle: { color: '#f59e0b', width: 1.6, type: 'dashed' }, itemStyle: { color: '#f59e0b' } },
              ],
            }],
          }
        }
        return {
          legend: { type: 'scroll', top: 2, left: 6, right: 6, textStyle: { fontSize: 9.5 } },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: 8, right: 12, top: 28, bottom: 20, containLabel: true },
          xAxis: { type: 'category', data: items.map((x) => x.style), axisLabel: { interval: 0, rotate: boxW.value < 360 ? 22 : 0, fontSize: 9.5 } },
          yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
          series: [
            { name: '5日%', type: 'bar', barMaxWidth: 12, data: items.map((x) => x.r5), itemStyle: { color: '#3b82f6', borderRadius: [2, 2, 0, 0] } },
            { name: '20日%', type: 'bar', barMaxWidth: 12, data: items.map((x) => x.r20), itemStyle: { color: '#10b981', borderRadius: [2, 2, 0, 0] } },
            { name: '60日%', type: 'bar', barMaxWidth: 12, data: items.map((x) => x.r60), itemStyle: { color: '#f59e0b', borderRadius: [2, 2, 0, 0] } },
          ],
        }
      }

      return null
    })

    function onAutoSnapshot(pngUrl) {
      const rec = customRecord.value
      if (rec && pngUrl && String(rec.thumbnail || '').startsWith('data:image/svg+xml')) {
        emit('update-thumb', { id: rec.id, thumbnail: pngUrl })
      }
    }

    function capturePng() {
      return chartRef.value && chartRef.value.capturePng ? chartRef.value.capturePng() : ''
    }

    function barZoneColor(pr) {
      if (pr >= 85) return '#ef4444'
      if (pr >= 68) return '#f59e0b'
      if (pr <= 15) return '#38bdf8'
      if (pr <= 32) return '#60a5fa'
      return '#10b981'
    }

    function fmtSmallPrice(v) {
      const n = Number(v)
      if (!Number.isFinite(n)) return '-'
      if (Math.abs(n) >= 1000) return n.toFixed(1)
      if (Math.abs(n) >= 10) return n.toFixed(2)
      return n.toFixed(3)
    }

    function fmtPctTxt(v) {
      const n = Number(v)
      if (!Number.isFinite(n)) return '-'
      return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
    }

    function onChartClick(p) {
      if (props.type === 'style_factor' && rawData.value && Array.isArray(rawData.value.items)) {
        const hit = rawData.value.items.find((x) => x.style === p.name)
        if (hit) emit('pick-symbol', hit)
      } else if (props.type === 'capital_flow' && p && p.name) {
        emit('ask-ai', `请分析今日「${p.name}」行业板块主力资金净流向（${p.value}亿）背后的催化因素与持续性`)
      } else if (props.type === 'rotation_quadrant' && p && p.data && p.data.name) {
        emit('ask-ai', `请分析「${p.data.name}」板块当前涨跌幅 ${p.data.value[0]}%、主力净流 ${p.data.value[1]}亿所处的轮动象限与后续机会`)
      }
    }

    expose({ capturePng, reload: load })

    return {
      wrapRef, chartRef, boxW, boxH, loading,
      secid, secidName, interval, showBoll, redlineVal, redlineLabel,
      rebasedGroup, rebasedLimit, customCompareList, formulaPreset, formulaSecidA, formulaNameA, formulaSecidB, formulaNameB, formulaOp, factorPack,
      corrGroup, corrLimit, riskLimit, styleView, barcodeZoneFilter, divFilter, chokeMode, catalystFilter,
      rawData, customRecord, customDescription, computedOption, watchlistSet, barcodeRows,
      proKlineSummary, rebasedSummary, analogSummary, capitalFlowSummary, quadrantCounts, filteredDivergences,
      breadthStats, commodityTiles, rateSpreadMetrics, catalystData,
      SYMBOL_PRESETS, REBASED_GROUPS, FORMULA_PRESETS, FACTOR_PACKS, CORR_GROUPS,
      STAR_SVG, STAR_FILL_SVG,
      onPickMainSymbol, onSetInterval, onToggleBoll, onRedlineInput,
      onSelectRebasedGroup, onSetRebasedLimit, onAddCompareSymbol, onRemoveCompareSymbol,
      onSelectFormulaPreset, onPickFormulaA, onPickFormulaB, onToggleFormulaOp, onSelectFactorPack,
      onSelectCorrGroup, onSetCorrLimit, onSetRiskLimit, onToggleCustomFitMode, onExportCustomPng,
      onAutoSnapshot, onChartClick, barZoneColor, fmtSmallPrice, fmtPctTxt, load, emitConfig,
    }
  },
  template: `
    <div ref="wrapRef" class="qw-wrap">
      <!-- 紧凑内联参数控制条（支持搜全市场股票 + 一键自选 + 参数持久化） -->
      <div v-if="type === 'pro_kline'" class="qw-ctrl">
        <symbol-picker
          v-model="secid"
          :label="(rawData && rawData.name) || secidName"
          :watchlist="watchlist"
          compact
          width="132px"
          @pick="onPickMainSymbol"
          @toggle-watchlist="(s) => $emit('toggle-watchlist', s)"
        />
        <span v-if="proKlineSummary && boxW >= 340" class="ft-mono" style="font-size:11px;font-weight:700;white-space:nowrap">
          {{ fmtSmallPrice(proKlineSummary.price) }}
          <span :style="{ color: (proKlineSummary.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">{{ fmtPctTxt(proKlineSummary.pct) }}</span>
        </span>
        <span v-if="proKlineSummary && boxW >= 460" :class="['div-tag', proKlineSummary.stateCls]">{{ proKlineSummary.state }}</span>
        <div class="qw-pills">
          <button v-for="iv in ['1d','1w','1M']" :key="iv" type="button" :class="['ft-chip', interval === iv ? 'on' : '']" @click="onSetInterval(iv)">{{ iv.toUpperCase() }}</button>
          <button type="button" :class="['ft-chip', showBoll ? 'on' : '']" @click="onToggleBoll">BOLL</button>
        </div>
        <input v-if="boxW >= 360" v-model="redlineVal" type="number" step="any" placeholder="预警线" aria-label="预警价格阈值" class="qw-inp" title="输入价格阈值后自动绘制水平预警线，点右上角⚙可配多条预警线与叠层" @input="onRedlineInput" />
      </div>

      <div v-else-if="type === 'rebased_compare'" class="qw-ctrl">
        <div class="qw-pills">
          <button v-for="g in REBASED_GROUPS" :key="g.id" type="button" :class="['ft-chip', rebasedGroup === g.id ? 'on' : '']" @click="onSelectRebasedGroup(g.id)">{{ g.label }}</button>
          <button type="button" :class="['ft-chip', rebasedGroup === 'custom' ? 'on' : '']" @click="onSelectRebasedGroup('custom')">自选</button>
        </div>
        <div class="qw-pills" style="margin-left:auto">
          <button v-for="lim in [30, 60, 90, 180]" :key="lim" type="button" :class="['ft-chip', rebasedLimit === lim ? 'on' : '']" @click="onSetRebasedLimit(lim)">{{ lim }}D</button>
        </div>
        <symbol-picker
          v-if="rebasedGroup === 'custom'"
          mode="add"
          :watchlist="watchlist"
          compact
          width="116px"
          placeholder="+ 添对比股"
          @pick="onAddCompareSymbol"
          @toggle-watchlist="(s) => $emit('toggle-watchlist', s)"
        />
        <div v-if="rebasedSummary && boxW >= 330" class="qw-subbar">
          <span>领跑 <b style="color:var(--up)">{{ rebasedSummary.leader.name }} {{ fmtPctTxt(rebasedSummary.leader.latest_pct) }}</b></span>
          <span class="hint">·</span>
          <span>首尾差 <b class="ft-mono">{{ rebasedSummary.spread }}%</b></span>
        </div>
        <div v-if="rebasedGroup === 'custom' && customCompareList.length" class="sp-tags" style="width:100%">
          <span v-for="it in customCompareList" :key="it.secid" class="sp-tag">
            <span>{{ it.name }}</span>
            <button type="button" @click="onRemoveCompareSymbol(it.secid)" aria-label="移除">×</button>
          </span>
        </div>
      </div>

      <div v-else-if="type === 'formula_spread'" class="qw-ctrl">
        <div class="qw-pills">
          <button v-for="fp in FORMULA_PRESETS" :key="fp.id" type="button" :class="['ft-chip', formulaPreset === fp.id ? 'on' : '']" @click="onSelectFormulaPreset(fp.id)">{{ fp.label }}</button>
          <button type="button" :class="['ft-chip', formulaPreset === 'custom' ? 'on' : '']" @click="onSelectFormulaPreset('custom')">自定义</button>
        </div>
        <div v-if="rawData && rawData.ok" style="margin-left:auto;display:inline-flex;align-items:center;gap:4px">
          <span v-if="rawData.zscore != null && boxW >= 320" class="ft-mono hint" style="font-size:10.5px">
            Z {{ rawData.zscore >= 0 ? '+' : '' }}{{ rawData.zscore }}σ
          </span>
          <span class="ft-mono qw-pct-pill" style="margin-left:0" :style="{ color: barZoneColor(rawData.percentile) }">
            {{ rawData.percentile }}% 分位
          </span>
        </div>
        <div v-if="rawData && rawData.ok && rawData.desc && boxW >= 380 && formulaPreset !== 'custom'" class="qw-subbar">
          <span class="ft-mono">现值 <b>{{ rawData.latest }}</b> / 均值 {{ rawData.mean }}</span>
          <span class="hint" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">· {{ rawData.desc }}</span>
        </div>
        <div v-if="formulaPreset === 'custom'" style="display:flex;align-items:center;gap:4px;width:100%;flex-wrap:wrap">
          <symbol-picker v-model="formulaSecidA" :label="formulaNameA" :watchlist="watchlist" compact width="122px"
                         @pick="onPickFormulaA" @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
          <button type="button" class="ft-chip on" title="切换比值或价差" @click="onToggleFormulaOp">{{ formulaOp === 'ratio' ? '÷ 比值' : '− 价差' }}</button>
          <symbol-picker v-model="formulaSecidB" :label="formulaNameB" :watchlist="watchlist" compact width="122px"
                         @pick="onPickFormulaB" @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
        </div>
      </div>

      <div v-else-if="type === 'analog_finder'" class="qw-ctrl">
        <symbol-picker
          v-model="secid"
          :label="(rawData && rawData.name) || secidName"
          :watchlist="watchlist"
          compact
          width="130px"
          @pick="onPickMainSymbol"
          @toggle-watchlist="(s) => $emit('toggle-watchlist', s)"
        />
        <span v-if="analogSummary" class="ft-mono" style="font-size:10.5px;margin-left:auto;white-space:nowrap"
              :style="{ color: analogSummary.avg >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 700 }">
          T+20均值 {{ fmtPctTxt(analogSummary.avg) }} ({{ analogSummary.upCnt }}/{{ analogSummary.total }}涨)
        </span>
        <div v-if="analogSummary && boxW >= 360" class="qw-subbar">
          <span class="hint">最似 {{ analogSummary.top.period }} · 相似度 {{ analogSummary.top.similarity }}%</span>
        </div>
      </div>

      <div v-else-if="type === 'event_study'" class="qw-ctrl">
        <symbol-picker
          v-model="secid"
          :label="(rawData && rawData.name) || secidName"
          :watchlist="watchlist"
          compact
          width="120px"
          @pick="onPickMainSymbol"
          @toggle-watchlist="(s) => $emit('toggle-watchlist', s)"
        />
        <div class="qw-pills">
          <button v-for="pk in FACTOR_PACKS" :key="pk.id" type="button" :class="['ft-chip', factorPack === pk.id ? 'on' : '']" @click="onSelectFactorPack(pk.id)">{{ pk.label }}</button>
        </div>
        <div v-if="rawData && rawData.stats" class="qw-subbar ft-mono">
          <span>样本 <b>{{ rawData.sample_count || 0 }}</b></span>
          <span>T+5: <b :style="{ color: rawData.stats.t5.avg >= 0 ? 'var(--up)' : 'var(--down)' }">{{ rawData.stats.t5.win_rate }}%</b></span>
          <span>T+10: <b :style="{ color: rawData.stats.t10.avg >= 0 ? 'var(--up)' : 'var(--down)' }">{{ rawData.stats.t10.win_rate }}% ({{ fmtPctTxt(rawData.stats.t10.avg) }})</b></span>
          <span v-if="boxW >= 360">T+20: <b :style="{ color: rawData.stats.t20.avg >= 0 ? 'var(--up)' : 'var(--down)' }">{{ rawData.stats.t20.win_rate }}%</b></span>
        </div>
      </div>

      <div v-else-if="type === 'percentile_barcode'" class="qw-ctrl">
        <div class="qw-pills">
          <button v-for="pm in [{id:'default',l:'全景'},{id:'watchlist',l:'自选'}]" :key="pm.id" type="button"
                  :class="['ft-chip', ((config && config.poolMode) || 'default') === pm.id ? 'on' : '']"
                  @click="emitConfig({ poolMode: pm.id })">{{ pm.l }}</button>
        </div>
        <div class="qw-pills">
          <button v-for="zf in [{id:'all',l:'全'},{id:'hot',l:'极热'},{id:'ice',l:'极冷'}]" :key="zf.id" type="button"
                  :class="['ft-chip', barcodeZoneFilter === zf.id ? 'on' : '']"
                  @click="barcodeZoneFilter = zf.id">{{ zf.l }}</button>
        </div>
        <button type="button" class="ft-chip" style="margin-left:auto"
                @click="emitConfig({ sortOrder: (config && config.sortOrder) === 'asc' ? 'desc' : 'asc' })">
          {{ (config && config.sortOrder) === 'asc' ? '低→高 ↑' : '高→低 ↓' }}
        </button>
      </div>

      <div v-else-if="type === 'capital_flow'" class="qw-ctrl">
        <div class="qw-pills">
          <button v-for="m in [{id:'both',l:'双向'},{id:'in',l:'净流入'},{id:'out',l:'净流出'}]" :key="m.id" type="button"
                  :class="['ft-chip', ((config && config.flowMode) || 'both') === m.id ? 'on' : '']"
                  @click="emitConfig({ flowMode: m.id })">{{ m.l }}</button>
        </div>
        <span v-if="capitalFlowSummary" class="ft-mono" style="margin-left:auto;font-size:10.5px;font-weight:700"
              :style="{ color: capitalFlowSummary.net >= 0 ? 'var(--up)' : 'var(--down)' }">
          合计 {{ capitalFlowSummary.net >= 0 ? '+' : '' }}{{ capitalFlowSummary.net }}亿
        </span>
      </div>

      <div v-else-if="type === 'rotation_quadrant'" class="qw-ctrl">
        <span class="ft-mono" style="font-size:10px;color:#10b981;font-weight:700">主线 {{ quadrantCounts.lead }}</span>
        <span class="ft-mono" style="font-size:10px;color:#3b82f6;font-weight:700">潜伏 {{ quadrantCounts.lurk }}</span>
        <span class="ft-mono" style="font-size:10px;color:#f59e0b;font-weight:700">背离 {{ quadrantCounts.trap }}</span>
        <span class="ft-mono" style="font-size:10px;color:#ef4444;font-weight:700">出清 {{ quadrantCounts.weak }}</span>
        <span v-if="boxW >= 340" class="hint" style="margin-left:auto;font-size:10px">点气泡可AI拆解</span>
      </div>

      <div v-else-if="type === 'chokepoint_watch'" class="qw-ctrl">
        <div class="qw-pills">
          <button type="button" :class="['ft-chip', chokeMode === 'split' ? 'on' : '']" @click="chokeMode = 'split'; emitConfig({ chokeMode: 'split' })">船型对比</button>
          <button type="button" :class="['ft-chip', chokeMode === 'total' ? 'on' : '']" @click="chokeMode = 'total'; emitConfig({ chokeMode: 'total' })">总量排行</button>
        </div>
        <span v-if="chokepoints && chokepoints.length" class="hint ft-mono" style="margin-left:auto;font-size:10px">
          {{ chokepoints.length }} 要道 · {{ chokepoints.reduce((s, c) => s + (Number(c.n_total) || 0), 0) }} 艘/日
        </span>
      </div>

      <div v-else-if="type === 'divergence_radar'" class="qw-ctrl">
        <div class="qw-pills">
          <button v-for="df in [{id:'all',l:'全'},{id:'macro',l:'宏观'},{id:'trap',l:'背离'},{id:'lurk',l:'潜伏'}]" :key="df.id" type="button"
                  :class="['ft-chip', divFilter === df.id ? 'on' : '']" @click="divFilter = df.id">{{ df.l }}</button>
        </div>
        <button type="button" class="ft-chip" style="margin-left:auto" @click="load">刷新</button>
      </div>

      <div v-else-if="type === 'corr_matrix'" class="qw-ctrl">
        <div class="qw-pills">
          <button v-for="cg in CORR_GROUPS" :key="cg.id" type="button" :class="['ft-chip', corrGroup === cg.id ? 'on' : '']" @click="onSelectCorrGroup(cg.id)">{{ cg.label }}</button>
        </div>
        <div class="qw-pills" style="margin-left:auto">
          <button v-for="lim in [30, 60, 120]" :key="lim" type="button" :class="['ft-chip', corrLimit === lim ? 'on' : '']" @click="onSetCorrLimit(lim)">{{ lim }}D</button>
        </div>
        <div v-if="rawData && rawData.ok && boxW >= 310" class="qw-subbar ft-mono">
          <span>分散度 |r|={{ rawData.avg_abs_corr }}</span>
          <span v-if="rawData.best_hedge" style="color:var(--primary)">· 最佳对冲 {{ rawData.best_hedge.a }}/{{ rawData.best_hedge.b }} ({{ rawData.best_hedge.corr }})</span>
        </div>
      </div>

      <div v-else-if="type === 'risk_drawdown'" class="qw-ctrl">
        <symbol-picker
          v-model="secid"
          :label="(rawData && rawData.name) || secidName"
          :watchlist="watchlist"
          compact
          width="128px"
          @pick="onPickMainSymbol"
          @toggle-watchlist="(s) => $emit('toggle-watchlist', s)"
        />
        <div class="qw-pills" style="margin-left:auto">
          <button v-for="lim in [120, 240]" :key="lim" type="button" :class="['ft-chip', riskLimit === lim ? 'on' : '']" @click="onSetRiskLimit(lim)">{{ lim }}D</button>
        </div>
        <div v-if="rawData && rawData.ok" class="qw-kpi-strip">
          <div class="qw-kpi-mini">
            <span class="hint">年化波动</span>
            <b class="ft-mono">{{ rawData.vol_ann }}%</b>
          </div>
          <div class="qw-kpi-mini">
            <span class="hint">最大回撤</span>
            <b class="ft-mono" style="color:var(--down)">{{ rawData.max_drawdown }}%</b>
          </div>
          <div class="qw-kpi-mini">
            <span class="hint">距高点</span>
            <b class="ft-mono" :style="{ color: rawData.current_drawdown < -5 ? 'var(--down)' : 'var(--foreground)' }">{{ rawData.current_drawdown }}%</b>
          </div>
          <div v-if="boxW >= 340" class="qw-kpi-mini">
            <span class="hint">夏普 / VaR95</span>
            <b class="ft-mono">{{ rawData.sharpe }} / {{ rawData.var_95 }}%</b>
          </div>
        </div>
      </div>

      <div v-else-if="type === 'style_factor'" class="qw-ctrl">
        <div class="qw-pills">
          <button type="button" :class="['ft-chip', styleView === 'bar' ? 'on' : '']" @click="styleView = 'bar'; emitConfig({ styleView: 'bar' })">多周期柱图</button>
          <button type="button" :class="['ft-chip', styleView === 'radar' ? 'on' : '']" @click="styleView = 'radar'; emitConfig({ styleView: 'radar' })">风格雷达</button>
        </div>
        <span v-if="rawData && rawData.leader_20d" class="ft-mono" style="margin-left:auto;font-size:10.5px;color:var(--up);font-weight:700">
          20日领跑: {{ rawData.leader_20d.style }} {{ fmtPctTxt(rawData.leader_20d.r20) }}
        </span>
      </div>

      <div v-else-if="type === 'custom_echarts' && boxH >= 165" class="qw-ctrl qw-ctrl-thin">
        <span class="hint" style="font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0" :title="customDescription || '交互式自定义图表（拖拽缩放自动适配密度与边距）'">
          {{ customDescription || '滚轮缩放 · 拖动卡片自动适配' }}
        </span>
        <div class="qw-pills" style="flex:none">
          <button type="button" :class="['ft-chip', (config && config.fitMode) !== 'raw' ? 'on' : '']"
                  title="切换看板自适应排版或原始 JSON 尺寸" @click="onToggleCustomFitMode">
            {{ (config && config.fitMode) === 'raw' ? '原始' : '自适应' }}
          </button>
          <button v-if="boxW >= 300" type="button" class="ft-chip" title="导出高清 PNG" @click="onExportCustomPng">PNG</button>
          <button v-if="boxW >= 340" type="button" class="ft-chip" @click="$emit('ask-ai', '请基于图表「' + ((customRecord && customRecord.title) || '自定义图表') + '」做深度拆解与后续策略推演')">AI解读</button>
        </div>
      </div>

      <!-- 主体渲染区 -->
      <div v-if="type === 'percentile_barcode'" class="qw-scroll">
        <div v-if="loading && !barcodeRows.length" class="hint" style="padding:18px;text-align:center">计算 200 日分位数矩阵中…</div>
        <div v-for="row in barcodeRows" :key="row.secid" class="pbc-row" :class="{ wide: boxW >= 390 }"
             @click="row.secid.includes('.') || row.secid.startsWith('CG.') ? $emit('pick-symbol', row) : null">
          <div style="min-width:0">
            <div style="font-weight:600;color:var(--foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ row.name }}</div>
            <div class="hint" style="font-size:9.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ row.category }}</div>
          </div>
          <div class="pbc-track" title="虚线为 50% 历史中位数">
            <div class="pbc-mid"></div>
            <div class="pbc-fill" :style="{ width: Math.max(3, row.percentile) + '%', background: barZoneColor(row.percentile) }"></div>
          </div>
          <span class="ft-mono" :style="{ fontWeight: 700, textAlign: 'right', color: barZoneColor(row.percentile) }">{{ row.percentile }}%</span>
          <span v-if="boxW >= 390" class="ft-mono" style="text-align:right;font-size:10px" :style="{ color: (row.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">
            {{ row.pct ? fmtPctTxt(row.pct) : ('R' + Math.round(row.rsi14 || 50)) }}
          </span>
          <button v-if="row.secid.includes('.') || row.secid.startsWith('CG.')" type="button"
                  class="sp-star-btn" :class="{ on: watchlistSet.has(row.secid) }"
                  :title="watchlistSet.has(row.secid) ? '移出自选' : '加入自选'"
                  @click.stop="$emit('toggle-watchlist', { secid: row.secid, symbol: row.secid, name: row.name })"
                  v-html="watchlistSet.has(row.secid) ? STAR_FILL_SVG : STAR_SVG"></button>
          <span v-else></span>
        </div>
      </div>

      <div v-else-if="type === 'divergence_radar'" class="qw-scroll" style="gap:6px;padding:6px">
        <div v-if="!filteredDivergences.length" class="hint" style="padding:18px;text-align:center">{{ loading ? '扫描跨市场异动中…' : '当前筛选下暂无背离信号' }}</div>
        <div v-for="(al, idx) in filteredDivergences" :key="idx" class="div-alert-card"
             @click="al.secid ? $emit('pick-symbol', { secid: al.secid, name: al.title }) : null">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
            <span class="div-tag" :class="al.level || 'info'">{{ al.tag }}</span>
            <button type="button" class="ft-chip" @click.stop="$emit('ask-ai', al.title + '：' + al.detail)">AI研判</button>
          </div>
          <div style="font-weight:600;font-size:12px;color:var(--foreground);word-break:break-word">{{ al.title }}</div>
          <div class="hint" style="font-size:11px;line-height:1.4;word-break:break-word">{{ al.detail }}</div>
        </div>
      </div>

      <!-- 宏观策略师：美林时钟与流动性仪表 -->
      <div v-else-if="type === 'macro_clock'" class="qw-scroll" style="gap:7px;padding:7px">
        <div v-if="loading && !rawData" class="hint" style="padding:18px;text-align:center">测算全球增长/通胀/流动性动量中…</div>
        <template v-else-if="rawData && rawData.ok">
          <div class="mc-quads">
            <div v-for="q in [
              { id: 'recovery', name: '复苏期', sub: '增长↑ 通胀↓', asset: '股票 / 成长', col: '#10b981' },
              { id: 'overheat', name: '过热期', sub: '增长↑ 通胀↑', asset: '大宗 / 周期', col: '#f59e0b' },
              { id: 'recession', name: '衰退期', sub: '增长↓ 通胀↓', asset: '国债 / 红利', col: '#3b82f6' },
              { id: 'stagflation', name: '滞胀期', sub: '增长↓ 通胀↑', asset: '黄金 / 现金', col: '#ef4444' },
            ]" :key="q.id" :class="['mc-quad', rawData.regime === q.id ? 'on' : '']"
                 :style="rawData.regime === q.id ? { borderColor: q.col, background: q.col + '18' } : undefined">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
                <b style="font-size:11.5px" :style="{ color: rawData.regime === q.id ? q.col : 'var(--foreground)' }">{{ q.name }}</b>
                <span v-if="rawData.regime === q.id" class="mc-live-dot" :style="{ background: q.col }"></span>
              </div>
              <div class="hint" style="font-size:9.5px">{{ q.sub }}</div>
              <div style="font-size:10px;font-weight:600;color:var(--foreground);margin-top:2px">{{ q.asset }}</div>
            </div>
          </div>
          <div class="mc-meters">
            <div v-for="m in [
              { lbl: '增长动能', val: rawData.growth_score, col: rawData.growth_score >= 0 ? '#10b981' : '#ef4444' },
              { lbl: '通胀压力', val: rawData.inflation_score, col: rawData.inflation_score >= 0 ? '#f59e0b' : '#38bdf8' },
              { lbl: '美元流动性', val: rawData.liquidity_score, col: rawData.liquidity_score >= 0 ? '#3b82f6' : '#a855f7' },
            ]" :key="m.lbl" class="mc-meter-row">
              <span class="hint" style="width:58px;flex:none;font-size:10.5px">{{ m.lbl }}</span>
              <div class="pbc-track" style="flex:1;position:relative">
                <div class="pbc-mid"></div>
                <div class="pbc-fill" :style="{ width: Math.min(100, Math.max(6, (m.val + 100) / 2)) + '%', background: m.col }"></div>
              </div>
              <span class="ft-mono" style="width:42px;text-align:right;font-size:10.5px;font-weight:700" :style="{ color: m.col }">
                {{ m.val >= 0 ? '+' : '' }}{{ m.val }}
              </span>
            </div>
          </div>
          <div class="mc-playbook">
            <span class="hint" style="font-size:10px">配置主线</span>
            <b style="font-size:11px;color:var(--foreground);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ rawData.playbook }}</b>
            <button type="button" class="ft-chip" @click="$emit('ask-ai', '当前美林时钟处于' + rawData.regime_label + '（增长' + rawData.growth_score + '、通胀' + rawData.inflation_score + '、流动性' + rawData.liquidity_score + '），请给出大类资产配置与风控建议')">AI推演</button>
          </div>
          <div v-if="rawData.signals && rawData.signals.length && boxH >= 245" class="mc-probes">
            <span v-for="sg in rawData.signals" :key="sg.secid" class="mc-probe-pill" @click="$emit('pick-symbol', sg)">
              <span>{{ sg.name.replace('COMEX', '') }}</span>
              <b class="ft-mono" :style="{ color: sg.r20 >= 0 ? 'var(--up)' : 'var(--down)' }">{{ sg.r20 >= 0 ? '+' : '' }}{{ sg.r20 }}%</b>
            </span>
          </div>
        </template>
      </div>

      <!-- 盘面交易员：市场广度与赚钱效应 -->
      <div v-else-if="type === 'market_breadth'" class="qw-wrap" style="padding:6px 8px;gap:6px">
        <div class="mb-top">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
            <span class="div-tag" :style="{ background: breadthStats.tempColor + '22', color: breadthStats.tempColor }">{{ breadthStats.temp }}</span>
            <span class="ft-mono" style="font-size:11px;font-weight:700">
              <span style="color:var(--up)">涨 {{ breadthStats.up }}</span>
              <span class="hint"> / </span>
              <span style="color:var(--down)">跌 {{ breadthStats.down }}</span>
              <span class="hint"> · 均幅 </span>
              <span :style="{ color: breadthStats.avgPct >= 0 ? 'var(--up)' : 'var(--down)' }">{{ fmtPctTxt(breadthStats.avgPct) }}</span>
            </span>
          </div>
          <div class="ft-breadth-bar" style="height:8px;margin-top:4px">
            <div :style="{ width: breadthStats.upPct + '%', background: '#10b981' }"></div>
            <div :style="{ width: (100 - breadthStats.upPct) + '%', background: '#ef4444' }"></div>
          </div>
          <div class="qw-kpi-strip" style="margin-top:4px;padding:0;border:0">
            <div class="qw-kpi-mini"><span class="hint">上涨占比</span><b class="ft-mono">{{ breadthStats.upPct }}%</b></div>
            <div class="qw-kpi-mini"><span class="hint">净流入板块</span><b class="ft-mono">{{ breadthStats.inflowUp }}/{{ breadthStats.total }}</b></div>
            <div class="qw-kpi-mini"><span class="hint">首尾离散</span><b class="ft-mono">{{ breadthStats.dispersion }}%</b></div>
          </div>
        </div>
        <div class="qw-chart-stage" style="padding:0">
          <o2-echarts v-if="computedOption" ref="chartRef" :option="computedOption" :theme="theme" height="100%" />
          <div v-else class="hint" style="display:grid;place-items:center;flex:1;font-size:11.5px">等待板块数据…</div>
        </div>
      </div>

      <!-- 大宗商品与供应链分析师：商品与通胀链 -->
      <div v-else-if="type === 'commodity_dashboard'" class="qw-scroll" style="gap:6px;padding:6px 8px">
        <div v-if="!commodityTiles.length" class="hint" style="padding:18px;text-align:center">加载大宗商品行情中…</div>
        <div v-else class="cd-grid">
          <div v-for="it in commodityTiles" :key="it.secid" class="cd-tile"
               :class="(it.pct || 0) >= 1.5 ? 'hot' : ((it.pct || 0) <= -1.5 ? 'cold' : '')"
               @click="$emit('pick-symbol', it)">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
              <span style="font-size:11px;font-weight:600;color:var(--foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.name }}</span>
              <span class="hint" style="font-size:9.5px;flex:none">{{ it.grp }}</span>
            </div>
            <div style="display:flex;align-items:baseline;justify-content:space-between;gap:4px;margin-top:2px">
              <b class="ft-mono" style="font-size:12.5px;color:var(--foreground)">{{ fmtSmallPrice(it.price) }}</b>
              <span class="ft-mono" style="font-size:11px;font-weight:700" :style="{ color: (it.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">
                {{ fmtPctTxt(it.pct) }}
              </span>
            </div>
          </div>
        </div>
        <div v-if="chokepoints && chokepoints.length" class="mc-playbook" style="margin-top:auto">
          <span class="hint" style="font-size:10px">咽喉通航</span>
          <span class="ft-mono" style="font-size:10.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            {{ chokepoints.slice(0, 3).map(c => String(c.portname || '').replace(' Strait','').replace(' Canal','') + ':' + (c.n_total || 0)).join(' · ') }}
          </span>
        </div>
      </div>

      <!-- FICC 固收与外汇分析师：利差与汇率压力计 -->
      <div v-else-if="type === 'rate_spread_watch'" class="qw-scroll" style="gap:7px;padding:7px 8px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <span :class="['div-tag', rateSpreadMetrics.curveCls]">{{ rateSpreadMetrics.curveState }}</span>
          <button type="button" class="ft-chip" @click="$emit('ask-ai', '请结合当前美债10Y-2Y利差(' + (rateSpreadMetrics.s10_2 ?? '-') + 'bp)、10Y(' + (rateSpreadMetrics.r10 ?? '-') + '%)及离岸人民币与美元指数走势，分析利率与汇率对股债资产的传导影响')">FICC研判</button>
        </div>
        <div class="rs-grid">
          <div class="rs-card">
            <span class="hint">美债 10Y-2Y</span>
            <b class="ft-mono" :style="{ color: rateSpreadMetrics.s10_2 != null && rateSpreadMetrics.s10_2 < 0 ? 'var(--down)' : 'var(--up)' }">
              {{ rateSpreadMetrics.s10_2 != null ? ((rateSpreadMetrics.s10_2 >= 0 ? '+' : '') + rateSpreadMetrics.s10_2 + ' bp') : '-' }}
            </b>
          </div>
          <div class="rs-card">
            <span class="hint">美债 10Y-3M</span>
            <b class="ft-mono" :style="{ color: rateSpreadMetrics.s10_3m != null && rateSpreadMetrics.s10_3m < 0 ? 'var(--down)' : 'var(--up)' }">
              {{ rateSpreadMetrics.s10_3m != null ? ((rateSpreadMetrics.s10_3m >= 0 ? '+' : '') + rateSpreadMetrics.s10_3m + ' bp') : '-' }}
            </b>
          </div>
          <div class="rs-card">
            <span class="hint">US 10Y 基准</span>
            <b class="ft-mono">{{ rateSpreadMetrics.r10 != null ? (rateSpreadMetrics.r10.toFixed(2) + '%') : '-' }}</b>
          </div>
          <div class="rs-card">
            <span class="hint">US 2Y 政策锚</span>
            <b class="ft-mono">{{ rateSpreadMetrics.r2 != null ? (rateSpreadMetrics.r2.toFixed(2) + '%') : '-' }}</b>
          </div>
        </div>
        <div v-if="rateSpreadMetrics.fxItems.length || rateSpreadMetrics.bondItems.length" style="display:flex;flex-direction:column;gap:3px">
          <div v-for="it in [...rateSpreadMetrics.fxItems, ...rateSpreadMetrics.bondItems]" :key="it.secid"
               class="rs-row" @click="$emit('pick-symbol', it)">
            <span style="font-weight:600;color:var(--foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.name }}</span>
            <span class="ft-mono">{{ fmtSmallPrice(it.price) }}</span>
            <span class="ft-mono" style="font-weight:700;text-align:right" :style="{ color: (it.pct || 0) >= 0 ? 'var(--up)' : 'var(--down)' }">{{ fmtPctTxt(it.pct) }}</span>
          </div>
        </div>
      </div>

      <!-- 事件驱动与地缘情报分析师：热点催化与多空脉搏 -->
      <div v-else-if="type === 'intel_catalyst'" class="qw-wrap">
        <div class="qw-ctrl">
          <div class="qw-pills">
            <button v-for="cf in [{id:'all',l:'全'},{id:'high',l:'高冲击'},{id:'bullish',l:'利多'},{id:'bearish',l:'利空'}]" :key="cf.id" type="button"
                    :class="['ft-chip', catalystFilter === cf.id ? 'on' : '']"
                    @click="catalystFilter = cf.id; emitConfig({ catalystFilter: cf.id })">{{ cf.l }}</button>
          </div>
          <span class="ft-mono" style="margin-left:auto;font-size:10.5px">
            <b style="color:var(--up)">多{{ catalystData.bull }}</b> / <b style="color:var(--down)">空{{ catalystData.bear }}</b>
          </span>
          <div class="ft-breadth-bar" style="width:100%;height:4px">
            <div :style="{ width: catalystData.bullPct + '%', background: '#10b981' }"></div>
            <div :style="{ width: (100 - catalystData.bullPct) + '%', background: '#ef4444' }"></div>
          </div>
        </div>
        <div class="qw-scroll" style="gap:4px;padding:5px 7px">
          <div v-if="!catalystData.rows.length" class="hint" style="padding:18px;text-align:center">暂无催化快讯</div>
          <div v-for="it in catalystData.rows" :key="it.id" class="ic-row">
            <span :style="{ color: it.sentiment === 'bullish' ? 'var(--up)' : (it.sentiment === 'bearish' ? 'var(--down)' : 'var(--muted-foreground)'), fontWeight: 700 }">
              {{ it.sentiment === 'bullish' ? '▲' : (it.sentiment === 'bearish' ? '▼' : '•') }}
            </span>
            <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--foreground)" :title="it.title_zh || it.title_orig">
              {{ it.title_zh || it.title_orig }}
            </span>
            <button type="button" class="ft-chip" style="flex:none"
                    @click.stop="$emit('ask-ai', '请作为事件驱动分析师，推演该催化事件对相关产业链与资产的影响：' + (it.title_zh || it.title_orig))">推演</button>
          </div>
        </div>
      </div>

      <div v-else class="qw-chart-stage">
        <o2-echarts v-if="computedOption" ref="chartRef"
                    :option="computedOption" :theme="theme" height="100%"
                    :in-card="type === 'custom_echarts'"
                    :responsive="type !== 'custom_echarts' || (config && config.fitMode) !== 'raw'"
                    :want-snapshot="type === 'custom_echarts' && !!(customRecord && String(customRecord.thumbnail || '').startsWith('data:image/svg+xml'))"
                    @snapshot="onAutoSnapshot"
                    @chart-click="onChartClick" />
        <div v-else class="hint" style="display:flex;align-items:center;justify-content:center;flex:1;font-size:12px">
          {{ loading ? '加载量化图表中…' : (rawData && rawData.error ? rawData.error : '暂无数据') }}
        </div>
      </div>
    </div>
  `,
}

// ============== 通用卡片配置与叠层自定义抽屉（任意已添加卡片随时点 ⚙ 实时修改） ==============
export const WidgetConfigDrawer = {
  components: { 'symbol-picker': SymbolPicker },
  props: {
    open: { type: Boolean, default: false },
    widget: { type: Object, default: null },
    scope: { type: String, default: 'dashboard' },
    watchlist: { type: Array, default: () => [] },
  },
  emits: ['update:open', 'patch-widget', 'save-as-custom', 'toggle-watchlist'],
  setup(props, { emit }) {
    const newRedPrice = ref('')
    const newRedLabel = ref('预警线')
    const newRedColor = ref('#f43f5e')
    const jsonDraft = ref('')
    const jsonErr = ref('')

    const w = computed(() => props.widget || null)
    const cfg = computed(() => (w.value && w.value.config) || {})

    watch(() => [props.open, w.value && w.value.id], () => {
      jsonErr.value = ''
      if (w.value && w.value.type === 'custom_echarts') {
        try {
          jsonDraft.value = JSON.stringify((cfg.value && cfg.value.option) || {}, null, 2)
        } catch (e) {
          jsonDraft.value = '{}'
        }
      }
    })

    function patchTitle(val) {
      if (!w.value) return
      emit('patch-widget', { title: val })
    }

    function patchCfg(p) {
      if (!w.value) return
      emit('patch-widget', { config: { ...cfg.value, ...p } })
    }

    const overlays = computed(() => ({
      ...DEFAULT_KLINE_OVERLAYS,
      ...(cfg.value.overlays || {}),
      boll: cfg.value.overlays && cfg.value.overlays.boll !== undefined
        ? !!cfg.value.overlays.boll
        : cfg.value.showBoll !== false,
    }))

    function toggleOverlay(key) {
      const next = { ...overlays.value, [key]: !overlays.value[key] }
      patchCfg({ overlays: next, showBoll: next.boll })
    }

    const redlines = computed(() => normalizeRedlines(cfg.value))

    function addRedline() {
      const p = Number(newRedPrice.value)
      if (!Number.isFinite(p) || String(newRedPrice.value).trim() === '') {
        message.warning('请输入有效价格数值')
        return
      }
      const next = [...redlines.value, { price: p, label: (newRedLabel.value || '预警线').trim(), color: newRedColor.value || '#f43f5e' }]
      patchCfg({ redlines: next, redline: '', redlineLabel: '' })
      newRedPrice.value = ''
    }

    function removeRedline(idx) {
      const next = redlines.value.filter((_, i) => i !== idx)
      patchCfg({ redlines: next, redline: '', redlineLabel: '' })
    }

    const customSymbols = computed(() => parseCustomSecidList(cfg.value.customSymbols || cfg.value.secids))
    function addCompareSym(it) {
      if (!it || !it.secid) return
      if (customSymbols.value.some((x) => x.secid === it.secid)) return
      if (customSymbols.value.length >= 6) {
        message.info('最多选择 6 只标的')
        return
      }
      const next = [...customSymbols.value, { secid: it.secid, name: it.name || it.symbol || it.secid }]
      patchCfg({ group: 'custom', customSymbols: next, secids: next.map((x) => x.secid).join(',') })
    }
    function removeCompareSym(sid) {
      if (customSymbols.value.length <= 2) {
        message.info('至少保留 2 只对比标的')
        return
      }
      const next = customSymbols.value.filter((x) => x.secid !== sid)
      patchCfg({ group: 'custom', customSymbols: next, secids: next.map((x) => x.secid).join(',') })
    }

    const barcodeSymbols = computed(() => parseCustomSecidList(cfg.value.barcodeSymbols))
    function addBarcodeSym(it) {
      if (!it || !it.secid) return
      if (barcodeSymbols.value.some((x) => x.secid === it.secid)) return
      const next = [...barcodeSymbols.value, { secid: it.secid, name: it.name || it.symbol || it.secid }]
      patchCfg({ poolMode: 'custom', barcodeSymbols: next })
    }
    function removeBarcodeSym(sid) {
      const next = barcodeSymbols.value.filter((x) => x.secid !== sid)
      patchCfg({ poolMode: 'custom', barcodeSymbols: next })
    }

    const extraPanelSymbols = computed(() => Array.isArray(cfg.value.extraSymbols) ? cfg.value.extraSymbols : [])
    function addPanelSym(it) {
      if (!it || !it.secid) return
      if (extraPanelSymbols.value.some((x) => x.secid === it.secid)) return
      const next = [...extraPanelSymbols.value, { secid: it.secid, symbol: it.symbol || it.secid, name: it.name || it.symbol || it.secid }]
      patchCfg({ extraSymbols: next })
    }
    function removePanelSym(sid) {
      patchCfg({ extraSymbols: extraPanelSymbols.value.filter((x) => x.secid !== sid) })
    }

    function applyJsonOption() {
      try {
        const parsed = JSON.parse(jsonDraft.value || '{}')
        if (!parsed || typeof parsed !== 'object') throw new Error('必须为 JSON 对象')
        jsonErr.value = ''
        patchCfg({ option: parsed })
        message.success('已应用图表配置')
      } catch (e) {
        jsonErr.value = 'JSON 语法错误：' + e.message
      }
    }

    return {
      w, cfg, overlays, redlines, newRedPrice, newRedLabel, newRedColor,
      customSymbols, barcodeSymbols, extraPanelSymbols, jsonDraft, jsonErr,
      REBASED_GROUPS, FORMULA_PRESETS, FACTOR_PACKS, CORR_GROUPS,
      patchTitle, patchCfg, toggleOverlay, addRedline, removeRedline,
      addCompareSym, removeCompareSym, addBarcodeSym, removeBarcodeSym,
      addPanelSym, removePanelSym, applyJsonOption,
    }
  },
  template: `
    <a-drawer :open="open" :width="400" placement="right"
              :title="w ? ('模块自定义 · ' + (w.title || w.type)) : '模块自定义'"
              @close="$emit('update:open', false)">
      <div v-if="w" class="wcd-body">
        <!-- 通用：卡片名称 -->
        <div class="wcd-sec">
          <div class="wcd-sec-title">基础信息</div>
          <div class="wcd-row">
            <span class="hint">卡片标题</span>
            <a-input :value="w.title" size="small" @update:value="patchTitle" placeholder="自定义显示标题" />
          </div>
        </div>

        <!-- pro_kline: 全量指标与多条预警线自定义 -->
        <template v-if="w.type === 'pro_kline'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">标的与周期</div>
            <div class="wcd-row">
              <span class="hint">标的</span>
              <symbol-picker :model-value="cfg.secid || '0.399300'" :label="cfg.secidName || ''" :watchlist="watchlist"
                             @pick="(it) => patchCfg({ secid: it.secid, secidName: it.name || it.symbol || it.secid })"
                             @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
            </div>
            <div class="wcd-row">
              <span class="hint">周期</span>
              <div style="display:flex;gap:4px">
                <button v-for="iv in ['1d','1w','1M']" :key="iv" type="button"
                        :class="['ft-chip', (cfg.interval || '1d') === iv ? 'on' : '']"
                        @click="patchCfg({ interval: iv })">{{ iv.toUpperCase() }}</button>
              </div>
            </div>
            <div class="wcd-row">
              <span class="hint">K线根数</span>
              <div style="display:flex;gap:4px">
                <button v-for="n in [60, 120, 180, 240]" :key="n" type="button"
                        :class="['ft-chip', (Number(cfg.limit) || 140) === n ? 'on' : '']"
                        @click="patchCfg({ limit: n })">{{ n }}根</button>
              </div>
            </div>
          </div>

          <div class="wcd-sec">
            <div class="wcd-sec-title">主图叠层（自由多选）</div>
            <div class="wcd-checks">
              <button v-for="it in [{k:'ma5',l:'MA5'},{k:'ma10',l:'MA10'},{k:'ma20',l:'MA20'},{k:'ma60',l:'MA60'},{k:'ema12',l:'EMA12'},{k:'ema26',l:'EMA26'},{k:'boll',l:'BOLL 布林带'}]"
                      :key="it.k" type="button" :class="['ft-chip', overlays[it.k] ? 'on' : '']"
                      @click="toggleOverlay(it.k)">{{ overlays[it.k] ? '✓ ' : '+ ' }}{{ it.l }}</button>
            </div>
          </div>

          <div class="wcd-sec">
            <div class="wcd-sec-title">副图叠层（自由多选）</div>
            <div class="wcd-checks">
              <button v-for="it in [{k:'vol',l:'成交量 VOL'},{k:'macd',l:'MACD'},{k:'rsi',l:'RSI14'}]"
                      :key="it.k" type="button" :class="['ft-chip', overlays[it.k] ? 'on' : '']"
                      @click="toggleOverlay(it.k)">{{ overlays[it.k] ? '✓ ' : '+ ' }}{{ it.l }}</button>
            </div>
          </div>

          <div class="wcd-sec">
            <div class="wcd-sec-title">水平预警线（可叠加多条）</div>
            <div style="display:flex;gap:4px;align-items:center">
              <a-input v-model:value="newRedPrice" size="small" type="number" placeholder="价格" style="width:84px" />
              <a-input v-model:value="newRedLabel" size="small" placeholder="标签（如支撑/目标）" style="flex:1" />
              <input v-model="newRedColor" type="color" style="width:26px;height:24px;border:1px solid var(--border);border-radius:3px;padding:1px;background:transparent;cursor:pointer" />
              <a-button size="small" type="primary" @click="addRedline">添加</a-button>
            </div>
            <div v-if="redlines.length" style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
              <div v-for="(rl, idx) in redlines" :key="idx" class="wcd-rl-item">
                <span style="width:10px;height:10px;border-radius:2px;flex:none" :style="{ background: rl.color }"></span>
                <span class="ft-mono" style="font-weight:700">{{ rl.price }}</span>
                <span class="hint" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ rl.label }}</span>
                <button type="button" class="ft-ico-btn danger" @click="removeRedline(idx)">×</button>
              </div>
            </div>
          </div>
        </template>

        <!-- watchlist_slot / kline_main: K线叠层与预警线 -->
        <template v-else-if="w.type === 'watchlist_slot' || w.type === 'kline_main'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">标的与周期</div>
            <div class="wcd-row">
              <span class="hint">锁定标的</span>
              <symbol-picker :model-value="cfg.secid || ''" :label="cfg.secidName || ''" :watchlist="watchlist"
                             placeholder="搜股票锁定（留空跟随点击）"
                             @pick="(it) => patchCfg({ secid: it.secid, symbol: it.symbol || it.secid, secidName: it.name || it.symbol || it.secid })"
                             @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
            </div>
            <div class="wcd-row">
              <span class="hint">周期</span>
              <div style="display:flex;gap:4px">
                <button v-for="iv in ['1d','1w','1M']" :key="iv" type="button"
                        :class="['ft-chip', (cfg.interval || '1d') === iv ? 'on' : '']"
                        @click="patchCfg({ interval: iv })">{{ iv.toUpperCase() }}</button>
              </div>
            </div>
          </div>
          <div class="wcd-sec">
            <div class="wcd-sec-title">K 线叠层（单卡独立控制）</div>
            <div class="wcd-checks">
              <button type="button" :class="['ft-chip', cfg.showMa !== false ? 'on' : '']" @click="patchCfg({ showMa: cfg.showMa === false })">{{ cfg.showMa !== false ? '✓ ' : '+ ' }}均线 MA5/20</button>
              <button type="button" :class="['ft-chip', !!cfg.showBoll ? 'on' : '']" @click="patchCfg({ showBoll: !cfg.showBoll })">{{ cfg.showBoll ? '✓ ' : '+ ' }}BOLL 布林带</button>
              <button type="button" :class="['ft-chip', cfg.showVol !== false ? 'on' : '']" @click="patchCfg({ showVol: cfg.showVol === false })">{{ cfg.showVol !== false ? '✓ ' : '+ ' }}成交量</button>
              <button type="button" :class="['ft-chip', cfg.showMarkers !== false ? 'on' : '']" @click="patchCfg({ showMarkers: cfg.showMarkers === false })">{{ cfg.showMarkers !== false ? '✓ ' : '+ ' }}新闻事件打点</button>
            </div>
          </div>
          <div class="wcd-sec">
            <div class="wcd-sec-title">水平预警线（可叠加多条）</div>
            <div style="display:flex;gap:4px;align-items:center">
              <a-input v-model:value="newRedPrice" size="small" type="number" placeholder="价格" style="width:84px" />
              <a-input v-model:value="newRedLabel" size="small" placeholder="标签" style="flex:1" />
              <input v-model="newRedColor" type="color" style="width:26px;height:24px;border:1px solid var(--border);border-radius:3px;padding:1px;background:transparent;cursor:pointer" />
              <a-button size="small" type="primary" @click="addRedline">添加</a-button>
            </div>
            <div v-if="redlines.length" style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
              <div v-for="(rl, idx) in redlines" :key="idx" class="wcd-rl-item">
                <span style="width:10px;height:10px;border-radius:2px;flex:none" :style="{ background: rl.color }"></span>
                <span class="ft-mono" style="font-weight:700">{{ rl.price }}</span>
                <span class="hint" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ rl.label }}</span>
                <button type="button" class="ft-ico-btn danger" @click="removeRedline(idx)">×</button>
              </div>
            </div>
          </div>
        </template>

        <!-- rebased_compare -->
        <template v-else-if="w.type === 'rebased_compare'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">对比标的与时间窗口</div>
            <div class="wcd-row">
              <span class="hint">预设组</span>
              <select :value="cfg.group || 'cn_bluechip'" class="qw-sel" style="width:100%;height:26px"
                      @change="(e) => patchCfg({ group: e.target.value, secids: e.target.value === 'custom' ? customSymbols.map(x => x.secid).join(',') : '' })">
                <option v-for="g in REBASED_GROUPS" :key="g.id" :value="g.id">{{ g.label }}</option>
                <option value="custom">自定义标的组合（2～6只）</option>
              </select>
            </div>
            <div class="wcd-row">
              <span class="hint">搜股加入</span>
              <symbol-picker mode="add" :watchlist="watchlist" placeholder="搜股票加入对比…"
                             @pick="addCompareSym" @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
            </div>
            <div v-if="customSymbols.length" class="sp-tags">
              <span v-for="it in customSymbols" :key="it.secid" class="sp-tag">
                <span>{{ it.name }}</span>
                <button type="button" @click="removeCompareSym(it.secid)">×</button>
              </span>
            </div>
            <div class="wcd-row">
              <span class="hint">回看窗口</span>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                <button v-for="d in [30, 60, 90, 180, 250]" :key="d" type="button"
                        :class="['ft-chip', (Number(cfg.rebasedLimit) || 90) === d ? 'on' : '']"
                        @click="patchCfg({ rebasedLimit: d })">{{ d }}日</button>
              </div>
            </div>
          </div>
          <div class="wcd-sec">
            <div class="wcd-sec-title">图表叠层</div>
            <div class="wcd-checks">
              <button type="button" :class="['ft-chip', cfg.smooth !== false ? 'on' : '']" @click="patchCfg({ smooth: cfg.smooth === false })">{{ cfg.smooth !== false ? '✓ ' : '+ ' }}平滑曲线</button>
              <button type="button" :class="['ft-chip', cfg.zeroLine !== false ? 'on' : '']" @click="patchCfg({ zeroLine: cfg.zeroLine === false })">{{ cfg.zeroLine !== false ? '✓ ' : '+ ' }}0% 基准线</button>
              <button type="button" :class="['ft-chip', !!cfg.areaFill ? 'on' : '']" @click="patchCfg({ areaFill: !cfg.areaFill })">{{ cfg.areaFill ? '✓ ' : '+ ' }}面积填充</button>
            </div>
          </div>
        </template>

        <!-- formula_spread -->
        <template v-else-if="w.type === 'formula_spread'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">合成公式</div>
            <div class="wcd-row">
              <span class="hint">公式模式</span>
              <select :value="cfg.preset || 'gold_oil'" class="qw-sel" style="width:100%;height:26px"
                      @change="(e) => patchCfg({ preset: e.target.value })">
                <option v-for="fp in FORMULA_PRESETS" :key="fp.id" :value="fp.id">{{ fp.label }}</option>
                <option value="custom">自定义双标的比值 / 价差</option>
              </select>
            </div>
            <template v-if="cfg.preset === 'custom'">
              <div class="wcd-row">
                <span class="hint">标的 A</span>
                <symbol-picker :model-value="cfg.secid_a || '101.GC00Y'" :label="cfg.name_a || ''" :watchlist="watchlist"
                               @pick="(it) => patchCfg({ preset: 'custom', secid_a: it.secid, name_a: it.name || it.symbol })"
                               @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
              </div>
              <div class="wcd-row">
                <span class="hint">运算</span>
                <div style="display:flex;gap:4px">
                  <button type="button" :class="['ft-chip', (cfg.op || 'ratio') === 'ratio' ? 'on' : '']" @click="patchCfg({ preset: 'custom', op: 'ratio' })">比值 (A÷B)</button>
                  <button type="button" :class="['ft-chip', cfg.op === 'spread' ? 'on' : '']" @click="patchCfg({ preset: 'custom', op: 'spread' })">价差 (A−B)</button>
                </div>
              </div>
              <div class="wcd-row">
                <span class="hint">标的 B</span>
                <symbol-picker :model-value="cfg.secid_b || '112.B00Y'" :label="cfg.name_b || ''" :watchlist="watchlist"
                               @pick="(it) => patchCfg({ preset: 'custom', secid_b: it.secid, name_b: it.name || it.symbol })"
                               @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
              </div>
            </template>
          </div>
          <div class="wcd-sec">
            <div class="wcd-sec-title">分位通道叠层</div>
            <div class="wcd-checks">
              <button type="button" :class="['ft-chip', cfg.showMean !== false ? 'on' : '']" @click="patchCfg({ showMean: cfg.showMean === false })">{{ cfg.showMean !== false ? '✓ ' : '+ ' }}均值线</button>
              <button type="button" :class="['ft-chip', cfg.showSigma1 !== false ? 'on' : '']" @click="patchCfg({ showSigma1: cfg.showSigma1 === false })">{{ cfg.showSigma1 !== false ? '✓ ' : '+ ' }}±1σ 通道</button>
              <button type="button" :class="['ft-chip', cfg.showSigma2 !== false ? 'on' : '']" @click="patchCfg({ showSigma2: cfg.showSigma2 === false })">{{ cfg.showSigma2 !== false ? '✓ ' : '+ ' }}±2σ 极值带</button>
              <button type="button" :class="['ft-chip', cfg.areaFill !== false ? 'on' : '']" @click="patchCfg({ areaFill: cfg.areaFill === false })">{{ cfg.areaFill !== false ? '✓ ' : '+ ' }}面积填充</button>
            </div>
          </div>
        </template>

        <!-- percentile_barcode -->
        <template v-else-if="w.type === 'percentile_barcode'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">标的池与排序</div>
            <div class="wcd-checks">
              <button v-for="pm in [{id:'default',l:'全景核心资产'},{id:'watchlist',l:'仅我的自选股'},{id:'custom',l:'自定义搜股池'}]" :key="pm.id"
                      type="button" :class="['ft-chip', (cfg.poolMode || 'default') === pm.id ? 'on' : '']"
                      @click="patchCfg({ poolMode: pm.id })">{{ pm.l }}</button>
            </div>
            <template v-if="cfg.poolMode === 'custom'">
              <div class="wcd-row" style="margin-top:4px">
                <span class="hint">添加标的</span>
                <symbol-picker mode="add" :watchlist="watchlist" placeholder="搜股票加入分位矩阵…"
                               @pick="addBarcodeSym" @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
              </div>
              <div v-if="barcodeSymbols.length" class="sp-tags">
                <span v-for="it in barcodeSymbols" :key="it.secid" class="sp-tag">
                  <span>{{ it.name }}</span>
                  <button type="button" @click="removeBarcodeSym(it.secid)">×</button>
                </span>
              </div>
            </template>
            <div class="wcd-row" style="margin-top:4px">
              <span class="hint">排序</span>
              <div style="display:flex;gap:4px">
                <button type="button" :class="['ft-chip', (cfg.sortOrder || 'desc') === 'desc' ? 'on' : '']" @click="patchCfg({ sortOrder: 'desc' })">分位高→低</button>
                <button type="button" :class="['ft-chip', cfg.sortOrder === 'asc' ? 'on' : '']" @click="patchCfg({ sortOrder: 'asc' })">分位低→高</button>
              </div>
            </div>
          </div>
        </template>

        <!-- event_study -->
        <template v-else-if="w.type === 'event_study'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">标的与事件因子</div>
            <div class="wcd-row">
              <span class="hint">标的</span>
              <symbol-picker :model-value="cfg.secid || '0.399300'" :label="cfg.secidName || ''" :watchlist="watchlist"
                             @pick="(it) => patchCfg({ secid: it.secid, secidName: it.name || it.symbol })"
                             @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
            </div>
            <div class="wcd-checks">
              <button v-for="pk in FACTOR_PACKS" :key="pk.id" type="button"
                      :class="['ft-chip', (cfg.factor_pack || 'oversold_reversal') === pk.id ? 'on' : '']"
                      @click="patchCfg({ factor_pack: pk.id })">{{ pk.label }}</button>
            </div>
          </div>
          <div class="wcd-sec">
            <div class="wcd-sec-title">图表叠层</div>
            <div class="wcd-checks">
              <button type="button" :class="['ft-chip', cfg.showBand !== false ? 'on' : '']" @click="patchCfg({ showBand: cfg.showBand === false })">{{ cfg.showBand !== false ? '✓ ' : '+ ' }}25%~75% 分位区间</button>
              <button type="button" :class="['ft-chip', cfg.showTriggerLine !== false ? 'on' : '']" @click="patchCfg({ showTriggerLine: cfg.showTriggerLine === false })">{{ cfg.showTriggerLine !== false ? '✓ ' : '+ ' }}T0 触发线</button>
              <button type="button" :class="['ft-chip', cfg.showZeroLine !== false ? 'on' : '']" @click="patchCfg({ showZeroLine: cfg.showZeroLine === false })">{{ cfg.showZeroLine !== false ? '✓ ' : '+ ' }}0% 基准线</button>
            </div>
          </div>
        </template>

        <!-- analog_finder -->
        <template v-else-if="w.type === 'analog_finder'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">标的与推演叠层</div>
            <div class="wcd-row">
              <span class="hint">标的</span>
              <symbol-picker :model-value="cfg.secid || '0.399300'" :label="cfg.secidName || ''" :watchlist="watchlist"
                             @pick="(it) => patchCfg({ secid: it.secid, secidName: it.name || it.symbol })"
                             @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
            </div>
            <div class="wcd-row">
              <span class="hint">相似样本</span>
              <div style="display:flex;gap:4px">
                <button v-for="n in [1, 2, 3]" :key="n" type="button" :class="['ft-chip', (Number(cfg.topN) || 3) === n ? 'on' : '']" @click="patchCfg({ topN: n })">Top {{ n }}</button>
              </div>
            </div>
            <div class="wcd-checks">
              <button type="button" :class="['ft-chip', cfg.showAvg !== false ? 'on' : '']" @click="patchCfg({ showAvg: cfg.showAvg === false })">{{ cfg.showAvg !== false ? '✓ ' : '+ ' }}均值推演线</button>
              <button type="button" :class="['ft-chip', cfg.showSamples !== false ? 'on' : '']" @click="patchCfg({ showSamples: cfg.showSamples === false })">{{ cfg.showSamples !== false ? '✓ ' : '+ ' }}历史单条样本</button>
              <button type="button" :class="['ft-chip', cfg.showDivider !== false ? 'on' : '']" @click="patchCfg({ showDivider: cfg.showDivider === false })">{{ cfg.showDivider !== false ? '✓ ' : '+ ' }}今日分界线</button>
            </div>
          </div>
        </template>

        <!-- capital_flow -->
        <template v-else-if="w.type === 'capital_flow'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">筛选与条数</div>
            <div class="wcd-row">
              <span class="hint">展示数量</span>
              <div style="display:flex;gap:4px">
                <button v-for="n in [5, 7, 10]" :key="n" type="button" :class="['ft-chip', (Number(cfg.topN) || 7) === n ? 'on' : '']" @click="patchCfg({ topN: n })">Top {{ n }}</button>
              </div>
            </div>
            <div class="wcd-row">
              <span class="hint">资金方向</span>
              <div style="display:flex;gap:4px">
                <button v-for="m in [{id:'both',l:'双向对比'},{id:'in',l:'仅净流入'},{id:'out',l:'仅净流出'}]" :key="m.id"
                        type="button" :class="['ft-chip', (cfg.flowMode || 'both') === m.id ? 'on' : '']"
                        @click="patchCfg({ flowMode: m.id })">{{ m.l }}</button>
              </div>
            </div>
          </div>
        </template>

        <!-- rotation_quadrant -->
        <template v-else-if="w.type === 'rotation_quadrant'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">象限叠层</div>
            <div class="wcd-checks">
              <button type="button" :class="['ft-chip', cfg.showLabels !== false ? 'on' : '']" @click="patchCfg({ showLabels: cfg.showLabels === false })">{{ cfg.showLabels !== false ? '✓ ' : '+ ' }}板块名称标签</button>
              <button type="button" :class="['ft-chip', cfg.hideOverlap !== false ? 'on' : '']" @click="patchCfg({ hideOverlap: cfg.hideOverlap === false })">{{ cfg.hideOverlap !== false ? '✓ ' : '+ ' }}自动防文字重叠</button>
              <button type="button" :class="['ft-chip', cfg.showAxes !== false ? 'on' : '']" @click="patchCfg({ showAxes: cfg.showAxes === false })">{{ cfg.showAxes !== false ? '✓ ' : '+ ' }}十字象限分界</button>
            </div>
          </div>
        </template>

        <!-- live_wire -->
        <template v-else-if="w.type === 'live_wire'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">快讯过滤</div>
            <div class="wcd-row">
              <span class="hint">语种</span>
              <div style="display:flex;gap:4px">
                <button v-for="lg in [{id:'all',l:'全'},{id:'zh',l:'中'},{id:'en',l:'英'},{id:'ru',l:'俄'},{id:'ja',l:'日'}]" :key="lg.id"
                        type="button" :class="['ft-chip', (cfg.lang || 'all') === lg.id ? 'on' : '']"
                        @click="patchCfg({ lang: lg.id })">{{ lg.l }}</button>
              </div>
            </div>
            <div class="wcd-row">
              <span class="hint">情绪</span>
              <div style="display:flex;gap:4px">
                <button v-for="s in [{id:'all',l:'全部'},{id:'bullish',l:'仅利多'},{id:'bearish',l:'仅利空'}]" :key="s.id"
                        type="button" :class="['ft-chip', (cfg.sentiment || 'all') === s.id ? 'on' : '']"
                        @click="patchCfg({ sentiment: s.id })">{{ s.l }}</button>
              </div>
            </div>
            <div class="wcd-row">
              <span class="hint">显示条数</span>
              <div style="display:flex;gap:4px">
                <button v-for="n in [15, 24, 40, 60]" :key="n" type="button" :class="['ft-chip', (Number(cfg.limit) || 24) === n ? 'on' : '']" @click="patchCfg({ limit: n })">{{ n }}条</button>
              </div>
            </div>
          </div>
        </template>

        <!-- watchlist / panel_* / movers_* -->
        <template v-else-if="w.type === 'watchlist' || w.type.startsWith('panel_') || w.type.startsWith('movers_')">
          <div class="wcd-sec">
            <div class="wcd-sec-title">列显隐配置</div>
            <div class="wcd-checks">
              <button type="button" :class="['ft-chip', cfg.hideChg !== true ? 'on' : '']" @click="patchCfg({ hideChg: !cfg.hideChg })">{{ cfg.hideChg !== true ? '✓ ' : '+ ' }}显示涨跌额/成交额</button>
              <button v-if="!w.type.startsWith('movers_')" type="button" :class="['ft-chip', cfg.hideSpark !== true ? 'on' : '']" @click="patchCfg({ hideSpark: !cfg.hideSpark })">{{ cfg.hideSpark !== true ? '✓ ' : '+ ' }}显示5日微图</button>
            </div>
          </div>
          <div v-if="w.type.startsWith('panel_')" class="wcd-sec">
            <div class="wcd-sec-title">追加自选关注标的到此列表</div>
            <symbol-picker mode="add" :watchlist="watchlist" placeholder="搜股票追加显示到本面板…"
                           @pick="addPanelSym" @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
            <div v-if="extraPanelSymbols.length" class="sp-tags" style="margin-top:6px">
              <span v-for="it in extraPanelSymbols" :key="it.secid" class="sp-tag">
                <span>{{ it.name }}</span>
                <button type="button" @click="removePanelSym(it.secid)">×</button>
              </span>
            </div>
          </div>
        </template>

        <!-- custom_echarts -->
        <template v-else-if="w.type === 'custom_echarts'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">看板缩放适配模式</div>
            <div class="wcd-checks">
              <button type="button" :class="['ft-chip', (cfg.fitMode || 'auto') !== 'raw' ? 'on' : '']" @click="patchCfg({ fitMode: 'auto' })">智能自适应（推荐）</button>
              <button type="button" :class="['ft-chip', cfg.fitMode === 'raw' ? 'on' : '']" @click="patchCfg({ fitMode: 'raw' })">原始 JSON 布局</button>
            </div>
            <div class="hint" style="font-size:11px">智能自适应会根据卡片当前宽高自动压缩边距、精简重叠标签并在条目过多时启用滚轮滑块。</div>
          </div>
          <div class="wcd-sec">
            <div class="wcd-sec-title">ECharts JSON 实时编辑</div>
            <a-textarea v-model:value="jsonDraft" :rows="10" class="ft-mono" style="font-size:11px" />
            <div v-if="jsonErr" style="color:var(--down);font-size:11px">{{ jsonErr }}</div>
            <div style="display:flex;justify-content:flex-end">
              <a-button size="small" type="primary" @click="applyJsonOption">应用配置</a-button>
            </div>
          </div>
        </template>

        <!-- corr_matrix -->
        <template v-else-if="w.type === 'corr_matrix'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">相关性资产池与窗口</div>
            <div class="wcd-checks">
              <button v-for="cg in CORR_GROUPS" :key="cg.id" type="button"
                      :class="['ft-chip', (cfg.corrGroup || 'macro_core') === cg.id ? 'on' : '']"
                      @click="patchCfg({ corrGroup: cg.id })">{{ cg.label }}</button>
            </div>
            <div class="wcd-row">
              <span class="hint">滚动窗口</span>
              <div style="display:flex;gap:4px">
                <button v-for="d in [30, 60, 120]" :key="d" type="button"
                        :class="['ft-chip', (Number(cfg.corrLimit) || 60) === d ? 'on' : '']"
                        @click="patchCfg({ corrLimit: d })">{{ d }}日</button>
              </div>
            </div>
          </div>
        </template>

        <!-- risk_drawdown -->
        <template v-else-if="w.type === 'risk_drawdown'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">风控监控标的与回看期</div>
            <div class="wcd-row">
              <span class="hint">标的</span>
              <symbol-picker :model-value="cfg.secid || '0.399300'" :label="cfg.secidName || ''" :watchlist="watchlist"
                             @pick="(it) => patchCfg({ secid: it.secid, secidName: it.name || it.symbol })"
                             @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
            </div>
            <div class="wcd-row">
              <span class="hint">回看窗口</span>
              <div style="display:flex;gap:4px">
                <button v-for="d in [120, 240, 360]" :key="d" type="button"
                        :class="['ft-chip', (Number(cfg.riskLimit) || 240) === d ? 'on' : '']"
                        @click="patchCfg({ riskLimit: d })">{{ d }}日</button>
              </div>
            </div>
          </div>
        </template>

        <!-- style_factor -->
        <template v-else-if="w.type === 'style_factor'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">展示形态</div>
            <div class="wcd-checks">
              <button type="button" :class="['ft-chip', (cfg.styleView || 'bar') === 'bar' ? 'on' : '']" @click="patchCfg({ styleView: 'bar' })">多周期柱图</button>
              <button type="button" :class="['ft-chip', cfg.styleView === 'radar' ? 'on' : '']" @click="patchCfg({ styleView: 'radar' })">风格雷达图</button>
            </div>
          </div>
        </template>

        <!-- intel_catalyst -->
        <template v-else-if="w.type === 'intel_catalyst'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">催化过滤与条数</div>
            <div class="wcd-checks">
              <button v-for="cf in [{id:'all',l:'全部'},{id:'high',l:'仅高冲击'},{id:'bullish',l:'仅利多'},{id:'bearish',l:'仅利空'}]" :key="cf.id" type="button"
                      :class="['ft-chip', (cfg.catalystFilter || 'all') === cf.id ? 'on' : '']"
                      @click="patchCfg({ catalystFilter: cf.id })">{{ cf.l }}</button>
            </div>
            <div class="wcd-row">
              <span class="hint">条数</span>
              <div style="display:flex;gap:4px">
                <button v-for="n in [8, 14, 24]" :key="n" type="button"
                        :class="['ft-chip', (Number(cfg.limit) || 14) === n ? 'on' : '']"
                        @click="patchCfg({ limit: n })">{{ n }}条</button>
              </div>
            </div>
          </div>
        </template>

        <!-- geo_odds -->
        <template v-else-if="w.type === 'geo_odds'">
          <div class="wcd-sec">
            <div class="wcd-sec-title">显示条数</div>
            <div class="wcd-checks">
              <button v-for="n in [6, 12, 20]" :key="n" type="button" :class="['ft-chip', (Number(cfg.limit) || 12) === n ? 'on' : '']" @click="patchCfg({ limit: n })">{{ n }}条</button>
            </div>
          </div>
        </template>

        <div class="wcd-foot">
          <a-button size="small" @click="$emit('save-as-custom', w)">另存为我的模块</a-button>
          <a-button size="small" type="primary" @click="$emit('update:open', false)">完成</a-button>
        </div>
      </div>
    </a-drawer>
  `,
}

export const LazyChatVisual = {
  components: { 'o2-echarts': O2Echarts, 'quant-widget': QuantWidget },
  props: {
    visual: { type: Object, required: true },
    theme: { type: String, default: 'light' },
    sectors: { type: Array, default: () => [] },
    chokepoints: { type: Array, default: () => [] },
    customWidgets: { type: Array, default: () => [] },
    watchlist: { type: Array, default: () => [] },
    overview: { type: Object, default: () => ({}) },
    macro: { type: Object, default: () => ({}) },
    geo: { type: Object, default: () => ({}) },
    movers: { type: Object, default: () => ({}) },
    newsStatus: { type: Object, default: () => ({}) },
    newsItems: { type: Array, default: () => [] },
  },
  emits: ['save-library', 'pin-dashboard', 'create-topic-board', 'pick-symbol', 'toggle-watchlist'],
  setup(props, { emit }) {
    const wrapRef = ref(null)
    const innerRef = ref(null)
    const inView = ref(true)
    const snapshotUrl = ref('')
    let io = null

    const bodyHeight = computed(() => (
      props.visual && props.visual.mode === 'cite_widget' && ['pro_kline', 'event_study'].includes(props.visual.widget_type)
        ? '340px'
        : '296px'
    ))

    function captureCurrent() {
      if (innerRef.value && innerRef.value.capturePng) {
        const png = innerRef.value.capturePng()
        if (png) snapshotUrl.value = png
      }
      return snapshotUrl.value
    }

    onMounted(() => {
      if (typeof IntersectionObserver !== 'undefined' && wrapRef.value) {
        io = new IntersectionObserver((entries) => {
          const vis = entries[0] && entries[0].isIntersecting
          if (!vis && inView.value) {
            captureCurrent()
            inView.value = false
          } else if (vis && !inView.value) {
            inView.value = true
          }
        }, { rootMargin: '220px 0px' })
        io.observe(wrapRef.value)
      }
    })

    onBeforeUnmount(() => {
      if (io) io.disconnect()
    })

    function onSaveLib() {
      const thumb = captureCurrent()
      emit('save-library', { visual: props.visual, thumbnail: thumb })
    }

    function onPinBoard() {
      const thumb = captureCurrent()
      emit('pin-dashboard', { visual: props.visual, thumbnail: thumb })
    }

    function onExportPng() {
      const url = captureCurrent()
      if (!url) {
        message.info('当前模块不支持直接导出静态 PNG')
        return
      }
      const a = document.createElement('a')
      a.href = url
      a.download = ((props.visual && props.visual.title) || 'o2-chart') + '.png'
      a.click()
    }

    return { wrapRef, innerRef, inView, snapshotUrl, bodyHeight, onSaveLib, onPinBoard, onExportPng }
  },
  template: `
    <div ref="wrapRef" class="chat-vis-card">
      <div class="chat-vis-head">
        <div style="min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="ft-badge-sq">{{ visual.mode === 'topic_board' ? 'B' : (visual.mode === 'cite_widget' ? 'W' : 'E') }}</span>
            <b style="font-size:13px;color:var(--foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ visual.title }}</b>
          </div>
          <div v-if="visual.description" class="hint" style="font-size:11.5px;margin-top:2px">{{ visual.description }}</div>
        </div>
        <div v-if="visual.mode !== 'topic_board'" style="display:flex;align-items:center;gap:6px;flex:none">
          <button v-if="visual.mode === 'echarts'" type="button" class="ft-btn" @click="onSaveLib">存至模块库</button>
          <button type="button" class="ft-btn on" @click="onPinBoard">添加至看板</button>
          <button v-if="visual.mode === 'echarts'" type="button" class="ft-btn" @click="onExportPng">导出图片</button>
        </div>
      </div>

      <div v-if="visual.mode === 'topic_board'" class="chat-vis-topic">
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          <span v-for="(bw, bi) in (visual.board_widgets || [])" :key="bi" class="ft-ent-pill" style="height:22px;line-height:22px;padding:0 8px">
            {{ bw.title || bw.type }}
          </span>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button type="button" class="ft-btn on" style="height:28px;padding:0 12px;font-size:12px"
                  @click="$emit('create-topic-board', visual)">
            创建专题看板
          </button>
        </div>
      </div>

      <div v-else class="chat-vis-body" :style="{ minHeight: bodyHeight }">
        <template v-if="inView">
          <o2-echarts v-if="visual.mode === 'echarts'" ref="innerRef"
                      :option="visual.option" :theme="theme" :height="bodyHeight"
                      :in-card="true"
                      :want-snapshot="!snapshotUrl" @snapshot="(u) => snapshotUrl = u" />
          <div v-else :style="{ height: bodyHeight, display: 'flex', flexDirection: 'column' }">
            <quant-widget ref="innerRef"
                          :type="visual.widget_type"
                          :config="visual.config || {}"
                          :theme="theme"
                          :sectors="sectors"
                          :chokepoints="chokepoints"
                          :custom-widgets="customWidgets"
                          :watchlist="watchlist"
                          :overview="overview"
                          :macro="macro"
                          :geo="geo"
                          :movers="movers"
                          :news-status="newsStatus"
                          :news-items="newsItems"
                          @pick-symbol="(s) => $emit('pick-symbol', s)"
                          @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
          </div>
        </template>
        <div v-else class="chat-vis-hibernated" @click="inView = true">
          <img v-if="snapshotUrl" :src="snapshotUrl" alt="" :style="{ width: '100%', height: bodyHeight, objectFit: 'contain', display: 'block' }" />
          <div v-else class="hint" :style="{ height: bodyHeight, display: 'grid', placeItems: 'center' }">图表已休眠释放显存 · 点击或滚回唤醒</div>
        </div>
      </div>
    </div>
  `,
}

export const WidgetGalleryModal = {
  components: { 'quant-widget': QuantWidget, 'symbol-picker': SymbolPicker },
  props: {
    open: { type: Boolean, default: false },
    targetScope: { type: String, default: 'dashboard' },
    theme: { type: String, default: 'light' },
    customWidgets: { type: Array, default: () => [] },
    sectors: { type: Array, default: () => [] },
    chokepoints: { type: Array, default: () => [] },
    watchlist: { type: Array, default: () => [] },
  },
  emits: ['update:open', 'add-builtin', 'add-custom', 'save-custom', 'delete-custom', 'ask-ai-build', 'toggle-watchlist'],
  setup(props, { emit }) {
    const activeCat = ref('all')
    const searchQ = ref('')
    const previewRef = ref(null)

    const studio = reactive({
      editingId: '',
      baseType: 'pro_kline',
      title: '沪深300 · 多指标共振 K 线',
      description: '自由组合均线、布林通道、成交量、MACD/RSI 副图与价格预警线。',
      secid: '0.399300',
      secidName: '沪深300',
      overlays: { ...DEFAULT_KLINE_OVERLAYS },
      group: 'cn_bluechip',
      rebasedLimit: 90,
      customSymbols: [
        { secid: '0.399300', name: '沪深300' },
        { secid: '100.SPX', name: '标普500' },
        { secid: '101.GC00Y', name: 'COMEX黄金' },
      ],
      preset: 'gold_oil',
      secid_a: '101.GC00Y',
      name_a: 'COMEX黄金',
      secid_b: '112.B00Y',
      name_b: '布伦特原油',
      op: 'ratio',
      factor_pack: 'oversold_reversal',
      redline: '',
      redlineLabel: '预警线',
      echartsJson: '',
      aiPrompt: '',
    })

    const CATEGORIES = [
      { id: 'all', label: '全部' },
      { id: 'kline', label: '走势与叠加' },
      { id: 'macro', label: '宏观与固收' },
      { id: 'flow', label: '资金与盘面' },
      { id: 'factor', label: '因子与风控' },
      { id: 'shipping', label: '商品与航运' },
      { id: 'intel', label: '情报与催化' },
      { id: 'custom', label: '我的模块' },
      { id: 'studio', label: '新建 / 编辑' },
    ]

    const filteredBuiltin = computed(() => {
      if (activeCat.value === 'custom' || activeCat.value === 'studio') return []
      const kw = searchQ.value.trim().toLowerCase()
      const scope = props.targetScope || 'dashboard'
      return BUILTIN_GALLERY_CATALOG.filter((it) => {
        if (Array.isArray(it.scopes) && !it.scopes.includes(scope)) return false
        if (activeCat.value !== 'all' && it.category !== activeCat.value) return false
        if (!kw) return true
        return it.title.toLowerCase().includes(kw) || (it.summary || '').toLowerCase().includes(kw) || (it.analyst || '').toLowerCase().includes(kw)
      })
    })

    const filteredCustom = computed(() => {
      if (activeCat.value !== 'all' && activeCat.value !== 'custom') return []
      const kw = searchQ.value.trim().toLowerCase()
      return (props.customWidgets || []).filter((it) => {
        if (!kw) return true
        return (it.title || '').toLowerCase().includes(kw) || (it.description || '').toLowerCase().includes(kw)
      })
    })

    const parsedCustomOption = computed(() => {
      if (studio.baseType !== 'custom_echarts') return null
      try {
        const obj = JSON.parse(studio.echartsJson || '{}')
        return obj && typeof obj === 'object' ? obj : null
      } catch (e) {
        return null
      }
    })

    const studioConfig = computed(() => {
      if (studio.baseType === 'custom_echarts') {
        return { option: parsedCustomOption.value }
      }
      if (studio.baseType === 'rebased_compare') {
        return {
          group: studio.group,
          rebasedLimit: studio.rebasedLimit,
          secids: studio.group === 'custom' ? studio.customSymbols.map((x) => x.secid).join(',') : '',
          customSymbols: studio.group === 'custom' ? studio.customSymbols.slice() : [],
        }
      }
      if (studio.baseType === 'formula_spread') {
        return {
          preset: studio.preset,
          secid_a: studio.secid_a,
          name_a: studio.name_a,
          secid_b: studio.secid_b,
          name_b: studio.name_b,
          op: studio.op,
        }
      }
      if (studio.baseType === 'risk_drawdown') {
        return {
          secid: studio.secid,
          secidName: studio.secidName,
          riskLimit: 240,
        }
      }
      if (studio.baseType === 'corr_matrix') {
        return {
          corrGroup: 'macro_core',
          corrLimit: 60,
        }
      }
      return {
        secid: studio.secid,
        secidName: studio.secidName,
        overlays: { ...studio.overlays },
        showBoll: !!studio.overlays.boll,
        preset: studio.preset,
        factor_pack: studio.factor_pack,
        redline: studio.redline,
        redlineLabel: studio.redlineLabel,
      }
    })

    function resetStudio() {
      studio.editingId = ''
      studio.baseType = 'pro_kline'
      studio.title = '沪深300 · 多指标共振 K 线'
      studio.description = '自由组合均线、布林通道、成交量、MACD/RSI 副图与价格预警线。'
      studio.secid = '0.399300'
      studio.secidName = '沪深300'
      studio.overlays = { ...DEFAULT_KLINE_OVERLAYS }
      studio.redline = ''
      studio.redlineLabel = '预警线'
      studio.echartsJson = ''
    }

    function onEditCustom(cw) {
      if (!cw) return
      studio.editingId = cw.id || ''
      studio.title = cw.title || '自定义模块'
      studio.description = cw.description || ''
      if (cw.renderer === 'echarts') {
        studio.baseType = 'custom_echarts'
        try {
          studio.echartsJson = JSON.stringify((cw.spec && cw.spec.option) || {}, null, 2)
        } catch (e) {
          studio.echartsJson = '{}'
        }
      } else {
        const cfg = (cw.spec && cw.spec.config) || {}
        studio.baseType = (cw.spec && cw.spec.widgetType) || cw.renderer || 'pro_kline'
        if (cfg.secid) studio.secid = cfg.secid
        if (cfg.secidName) studio.secidName = cfg.secidName
        studio.overlays = { ...DEFAULT_KLINE_OVERLAYS, ...(cfg.overlays || {}) }
        if (cfg.group) studio.group = cfg.group
        if (cfg.rebasedLimit) studio.rebasedLimit = Number(cfg.rebasedLimit) || 90
        if (cfg.customSymbols || cfg.secids) studio.customSymbols = parseCustomSecidList(cfg.customSymbols || cfg.secids)
        if (cfg.preset) studio.preset = cfg.preset
        if (cfg.secid_a) studio.secid_a = cfg.secid_a
        if (cfg.name_a) studio.name_a = cfg.name_a
        if (cfg.secid_b) studio.secid_b = cfg.secid_b
        if (cfg.name_b) studio.name_b = cfg.name_b
        if (cfg.op) studio.op = cfg.op
        if (cfg.factor_pack) studio.factor_pack = cfg.factor_pack
        studio.redline = cfg.redline ?? ''
        studio.redlineLabel = cfg.redlineLabel || '预警线'
      }
      activeCat.value = 'studio'
    }

    function onStudioPickMain(item) {
      if (!item || !item.secid) return
      studio.secid = item.secid
      studio.secidName = item.name || item.symbol || item.secid
      if (!studio.editingId) {
        const suffix = studio.baseType === 'pro_kline' ? '共振 K 线' : (studio.baseType === 'event_study' ? '因子回测' : '历史推演')
        studio.title = `${studio.secidName} · ${suffix}`
      }
    }

    function onStudioAddCompare(item) {
      if (!item || !item.secid) return
      if (studio.customSymbols.some((x) => x.secid === item.secid)) return
      if (studio.customSymbols.length >= 6) {
        message.info('最多选择 6 只标的')
        return
      }
      studio.customSymbols = [...studio.customSymbols, { secid: item.secid, name: item.name || item.symbol || item.secid }]
      studio.group = 'custom'
    }

    function onStudioRemoveCompare(sid) {
      if (studio.customSymbols.length <= 2) {
        message.info('至少保留 2 只对比标的')
        return
      }
      studio.customSymbols = studio.customSymbols.filter((x) => x.secid !== sid)
    }

    function onStudioPickFormulaA(item) {
      if (!item || !item.secid) return
      studio.secid_a = item.secid
      studio.name_a = item.name || item.symbol || item.secid
      studio.preset = 'custom'
    }

    function onStudioPickFormulaB(item) {
      if (!item || !item.secid) return
      studio.secid_b = item.secid
      studio.name_b = item.name || item.symbol || item.secid
      studio.preset = 'custom'
    }

    function onQuickWatchlistPick(item) {
      if (!item || !item.secid) return
      emit('toggle-watchlist', item)
    }

    function onSaveStudio(alsoAdd) {
      const png = previewRef.value && previewRef.value.capturePng ? previewRef.value.capturePng() : ''
      if (studio.baseType === 'custom_echarts') {
        if (!parsedCustomOption.value) {
          message.error('ECharts JSON 格式无效，请检查语法')
          return
        }
        emit('save-custom', {
          payload: {
            id: studio.editingId || '',
            title: studio.title.trim() || '自定义图表',
            description: studio.description.trim() || '用户自定义 ECharts 模块',
            category: 'custom',
            renderer: 'echarts',
            spec: { option: parsedCustomOption.value },
            thumbnail: png,
            defaultW: 12,
            defaultH: 10,
          },
          alsoAdd,
        })
        studio.editingId = ''
        return
      }
      emit('save-custom', {
        payload: {
          id: studio.editingId || '',
          title: studio.title.trim() || '自定义量化模块',
          description: studio.description.trim() || '用户自定义参数模块',
          category: 'custom',
          renderer: studio.baseType,
          spec: { widgetType: studio.baseType, config: { ...studioConfig.value } },
          thumbnail: png,
          defaultW: studio.baseType === 'pro_kline' ? 16 : 12,
          defaultH: studio.baseType === 'pro_kline' ? 14 : 11,
        },
        alsoAdd,
      })
      studio.editingId = ''
    }

    function onAskAiBuild() {
      const p = studio.aiPrompt.trim() || '请调用行情与宏观工具获取沪深300、标普500与黄金近期数据，用 render_visual 绘制一张交互式对比分析图并保存到模块库和看板'
      emit('ask-ai-build', p)
      emit('update:open', false)
    }

    return {
      activeCat, searchQ, previewRef, studio, CATEGORIES,
      SYMBOL_PRESETS, REBASED_GROUPS, FORMULA_PRESETS, FACTOR_PACKS,
      filteredBuiltin, filteredCustom, studioConfig,
      resetStudio, onEditCustom,
      onStudioPickMain, onStudioAddCompare, onStudioRemoveCompare,
      onStudioPickFormulaA, onStudioPickFormulaB, onQuickWatchlistPick,
      onSaveStudio, onAskAiBuild,
    }
  },
  template: `
    <a-modal :open="open" :width="'min(960px, 94vw)'" :footer="null"
             :title="targetScope === 'markets' ? '模块库 · 行情工作台' : '模块库 · 终端看板'"
             @cancel="$emit('update:open', false)">
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div role="tablist" aria-label="模块分类" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <button v-for="c in CATEGORIES" :key="c.id" type="button" role="tab"
                    :aria-selected="activeCat === c.id"
                    :class="['ft-btn', activeCat === c.id ? 'on' : '']"
                    style="height:26px;padding:0 10px;font-size:12px"
                    @click="activeCat = c.id">
              <span>{{ c.label }}</span>
              <span v-if="c.id === 'custom' && customWidgets.length" class="ft-mono" style="opacity:0.8">{{ customWidgets.length }}</span>
            </button>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <symbol-picker
              mode="add"
              :watchlist="watchlist"
              width="176px"
              placeholder="搜股票 / 点星标加自选…"
              @pick="onQuickWatchlistPick"
              @toggle-watchlist="(s) => $emit('toggle-watchlist', s)"
            />
            <a-input v-if="activeCat !== 'studio'" v-model:value="searchQ" size="small" allow-clear
                     placeholder="筛选模块…" style="width:156px" />
          </div>
        </div>

        <!-- 新建 / 编辑自定义模块 -->
        <div v-if="activeCat === 'studio'" class="wg-studio">
          <div class="wg-studio-form">
            <div style="padding:10px 12px;border:1px solid var(--border);border-radius:6px;background:var(--muted);display:flex;flex-direction:column;gap:8px">
              <div style="font-weight:600;font-size:12.5px;color:var(--foreground)">AI 智能生成</div>
              <a-textarea v-model:value="studio.aiPrompt" :rows="2"
                          placeholder="描述你想看的数据对比或指标逻辑，AI 将自动生成图表模块…" />
              <div style="display:flex;justify-content:flex-end">
                <a-button type="primary" size="small" @click="onAskAiBuild">生成模块</a-button>
              </div>
            </div>

            <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span style="font-weight:600;font-size:12.5px;color:var(--foreground)">
                  {{ studio.editingId ? '编辑已保存模块' : '参数与叠层配置（添加到看板后仍可点 ⚙ 随时修改）' }}
                </span>
                <button v-if="studio.editingId" type="button" class="ft-chip" @click="resetStudio">切回新建</button>
              </div>
              <div style="display:grid;grid-template-columns:64px minmax(0,1fr);align-items:center;gap:6px;font-size:12px">
                <span class="hint">模板</span>
                <select v-model="studio.baseType" aria-label="选择基底模板" class="qw-sel" style="width:100%;height:28px" :disabled="!!studio.editingId && studio.baseType === 'custom_echarts'">
                  <option value="pro_kline">多指标共振 K 线</option>
                  <option value="rebased_compare">多标的超额收益对比</option>
                  <option value="formula_spread">跨资产比值与分位通道</option>
                  <option value="risk_drawdown">波动率与最大回撤监控</option>
                  <option value="corr_matrix">跨资产相关性矩阵</option>
                  <option value="event_study">量化事件因子回测</option>
                  <option value="analog_finder">历史相似走势推演</option>
                  <option v-if="studio.baseType === 'custom_echarts'" value="custom_echarts">自定义 ECharts JSON</option>
                </select>
                <span class="hint">标题</span>
                <a-input v-model:value="studio.title" size="small" />
                <span class="hint">简介</span>
                <a-input v-model:value="studio.description" size="small" placeholder="简述模块用途" />

                <template v-if="['pro_kline','event_study','analog_finder','risk_drawdown'].includes(studio.baseType)">
                  <span class="hint">标的</span>
                  <symbol-picker
                    v-model="studio.secid"
                    :label="studio.secidName"
                    :watchlist="watchlist"
                    placeholder="搜索 A/港/美股、指数、商品…"
                    @pick="onStudioPickMain"
                    @toggle-watchlist="(s) => $emit('toggle-watchlist', s)"
                  />
                </template>

                <template v-if="studio.baseType === 'pro_kline'">
                  <span class="hint">叠层</span>
                  <div class="wcd-checks">
                    <button v-for="it in [{k:'ma5',l:'MA5'},{k:'ma10',l:'MA10'},{k:'ma20',l:'MA20'},{k:'ma60',l:'MA60'},{k:'ema12',l:'EMA12'},{k:'boll',l:'BOLL'},{k:'vol',l:'VOL'},{k:'macd',l:'MACD'},{k:'rsi',l:'RSI'}]"
                            :key="it.k" type="button" :class="['ft-chip', studio.overlays[it.k] ? 'on' : '']"
                            @click="studio.overlays[it.k] = !studio.overlays[it.k]">{{ it.l }}</button>
                  </div>
                  <span class="hint">预警线</span>
                  <div style="display:flex;gap:4px">
                    <a-input v-model:value="studio.redline" size="small" placeholder="价格阈值" style="width:96px" />
                    <a-input v-model:value="studio.redlineLabel" size="small" placeholder="标签名称" />
                  </div>
                </template>

                <template v-if="studio.baseType === 'rebased_compare'">
                  <span class="hint">标的组</span>
                  <select v-model="studio.group" aria-label="选择对比组" class="qw-sel" style="width:100%;height:28px">
                    <option v-for="g in REBASED_GROUPS" :key="g.id" :value="g.id">{{ g.label }}</option>
                    <option value="custom">自定义股票组合（最多6只）</option>
                  </select>
                  <span class="hint">周期</span>
                  <div style="display:flex;gap:4px">
                    <button v-for="d in [30, 60, 90, 180]" :key="d" type="button" :class="['ft-chip', studio.rebasedLimit === d ? 'on' : '']" @click="studio.rebasedLimit = d">{{ d }}日</button>
                  </div>
                  <template v-if="studio.group === 'custom'">
                    <span class="hint">添标的</span>
                    <div style="display:flex;flex-direction:column;gap:5px;min-width:0">
                      <symbol-picker
                        mode="add"
                        :watchlist="watchlist"
                        placeholder="搜索股票加入对比（点星加自选）…"
                        @pick="onStudioAddCompare"
                        @toggle-watchlist="(s) => $emit('toggle-watchlist', s)"
                      />
                      <div class="sp-tags">
                        <span v-for="it in studio.customSymbols" :key="it.secid" class="sp-tag">
                          <span>{{ it.name }}</span>
                          <button type="button" @click="onStudioRemoveCompare(it.secid)">×</button>
                        </span>
                      </div>
                    </div>
                  </template>
                </template>

                <template v-if="studio.baseType === 'formula_spread'">
                  <span class="hint">公式</span>
                  <select v-model="studio.preset" aria-label="选择合成公式" class="qw-sel" style="width:100%;height:28px">
                    <option v-for="fp in FORMULA_PRESETS" :key="fp.id" :value="fp.id">{{ fp.label }}</option>
                    <option value="custom">自定义双标的比值 / 价差</option>
                  </select>
                  <template v-if="studio.preset === 'custom'">
                    <span class="hint">标的 A</span>
                    <symbol-picker v-model="studio.secid_a" :label="studio.name_a" :watchlist="watchlist"
                                   @pick="onStudioPickFormulaA" @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
                    <span class="hint">运算</span>
                    <div style="display:flex;gap:4px">
                      <button type="button" :class="['ft-chip', studio.op === 'ratio' ? 'on' : '']" @click="studio.op = 'ratio'">比值 (A ÷ B)</button>
                      <button type="button" :class="['ft-chip', studio.op === 'spread' ? 'on' : '']" @click="studio.op = 'spread'">价差 (A − B)</button>
                    </div>
                    <span class="hint">标的 B</span>
                    <symbol-picker v-model="studio.secid_b" :label="studio.name_b" :watchlist="watchlist"
                                   @pick="onStudioPickFormulaB" @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
                  </template>
                </template>

                <template v-if="studio.baseType === 'event_study'">
                  <span class="hint">因子</span>
                  <select v-model="studio.factor_pack" aria-label="选择事件因子" class="qw-sel" style="width:100%;height:28px">
                    <option v-for="pk in FACTOR_PACKS" :key="pk.id" :value="pk.id">{{ pk.label }}</option>
                  </select>
                </template>

                <template v-if="studio.baseType === 'custom_echarts'">
                  <span class="hint">配置</span>
                  <a-textarea v-model:value="studio.echartsJson" :rows="6" class="ft-mono" style="font-size:11px" />
                </template>
              </div>
              <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
                <a-button size="small" @click="onSaveStudio(false)">{{ studio.editingId ? '更新模块' : '保存' }}</a-button>
                <a-button type="primary" size="small" @click="onSaveStudio(true)">{{ studio.editingId ? '更新并添加' : '保存并添加' }}</a-button>
              </div>
            </div>
          </div>

          <div class="wg-studio-preview">
            <div class="hint" style="font-size:11.5px;margin-bottom:6px">实时预览</div>
            <div style="flex:1;min-height:330px;border:1px solid var(--border);border-radius:6px;overflow:hidden;display:flex;background:var(--card)">
              <quant-widget ref="previewRef" :type="studio.baseType" :config="studioConfig" :theme="theme"
                            :sectors="sectors" :chokepoints="chokepoints" :watchlist="watchlist"
                            @toggle-watchlist="(s) => $emit('toggle-watchlist', s)" />
            </div>
          </div>
        </div>

        <!-- 静态缩略图卡片网格 -->
        <div v-else class="wg-grid">
          <div v-for="cw in filteredCustom" :key="cw.id" class="wg-card">
            <div class="wg-thumb">
              <img :src="cw.thumbnail" :alt="cw.title" loading="lazy" />
              <span class="wg-cat-tag ai">自定义</span>
            </div>
            <div class="wg-info">
              <div class="wg-title">{{ cw.title }}</div>
              <div class="wg-desc">{{ cw.description }}</div>
              <div class="wg-actions">
                <button type="button" class="ft-btn on" style="height:24px;padding:0 12px" @click="$emit('add-custom', cw)">添加</button>
                <div style="display:flex;gap:4px">
                  <button type="button" class="ft-btn" style="height:24px;padding:0 8px" @click="onEditCustom(cw)">编辑</button>
                  <button type="button" class="ft-btn" style="height:24px;color:var(--down)" @click="$emit('delete-custom', cw.id)">删除</button>
                </div>
              </div>
            </div>
          </div>

          <div v-for="m in filteredBuiltin" :key="m.type" class="wg-card">
            <div class="wg-thumb">
              <img :src="m.thumbnail" :alt="m.title" loading="lazy" />
              <span v-if="m.analyst" class="wg-analyst-tag">{{ m.analyst }}</span>
              <span class="wg-cat-tag">{{ m.categoryLabel }}</span>
            </div>
            <div class="wg-info">
              <div class="wg-title">{{ m.title }}</div>
              <div class="wg-desc">{{ m.summary }}</div>
              <div class="wg-actions">
                <button type="button" class="ft-btn on" style="height:24px;padding:0 12px" @click="$emit('add-builtin', m)">添加</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </a-modal>
  `,
}
