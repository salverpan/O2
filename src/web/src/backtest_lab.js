import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue/dist/vue.esm-bundler.js'
import { auiMessage as message } from './aui_components.js'
import * as echarts from 'echarts/core'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import { O2Echarts, SymbolPicker } from './widgets_hub.js'

async function qGet(url) {
  const r = await fetch(url)
  return r.json()
}

async function qPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  return r.json()
}

function fmtSigned(v, suf = '%', digits = 2) {
  if (v == null || Number.isNaN(Number(v))) return '-'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}${suf}`
}

function clsVal(v) {
  const n = Number(v || 0)
  if (n > 0) return 'bt-up'
  if (n < 0) return 'bt-down'
  return ''
}

function isoOffsetDays(daysBack) {
  const d = new Date(Date.now() - daysBack * 86400000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function todayIso() {
  return isoOffsetDays(0)
}

// ---------------------------------------------------------------------------
// Global Persistent Sync Store (survives tab switches & browser refreshes)
// ---------------------------------------------------------------------------
const _syncListeners = new Set()
let _syncTimer = null

export const quantSyncStore = reactive({
  job: null,
  resumable: null,
  get isRunning() {
    return !!(this.job && (this.job.status === 'pending' || this.job.status === 'running'))
  },
  get progress() {
    return this.job ? Math.max(0, Math.min(100, Number(this.job.progress) || 0)) : 0
  },
  get stage() {
    return (this.job && this.job.stage) || ''
  },
})

function _notifySyncListeners(ev) {
  for (const fn of _syncListeners) {
    try { fn(ev) } catch (e) {}
  }
}

export function onQuantSyncEvent(fn) {
  _syncListeners.add(fn)
  return () => _syncListeners.delete(fn)
}

function _ensureGlobalSyncPolling() {
  if (_syncTimer) return
  _syncTimer = setInterval(async () => {
    const cur = quantSyncStore.job
    if (!cur || (cur.status !== 'pending' && cur.status !== 'running')) {
      clearInterval(_syncTimer)
      _syncTimer = null
      return
    }
    try {
      const res = await qGet('/api/quant/job/' + encodeURIComponent(cur.id))
      if (!res || !res.ok || !res.job) return
      const u = res.job
      quantSyncStore.job = u
      if (u.status === 'done' || u.status === 'failed') {
        clearInterval(_syncTimer)
        _syncTimer = null
        if (u.status === 'done') {
          const r = u.result || {}
          if (r.paused) message.info('已暂停同步，断点已保存')
          else if (r.failed_symbols) message.warning(`同步完成，${r.failed_symbols} 只失败可续传`)
          else message.success('数据同步完成')
        } else if (u.error) {
          message.error(String(u.error).slice(0, 120))
        }
        await hydrateActiveSync(false)
        _notifySyncListeners({ type: 'finished', job: u })
      }
    } catch (e) {}
  }, 1100)
}

export async function hydrateActiveSync(startPoll = true) {
  try {
    const res = await qGet('/api/quant/sync/active')
    if (res && res.ok) {
      quantSyncStore.resumable = res.resumable || null
      if (res.job) {
        quantSyncStore.job = res.job
        if (startPoll) _ensureGlobalSyncPolling()
      } else if (quantSyncStore.job && (quantSyncStore.job.status === 'pending' || quantSyncStore.job.status === 'running')) {
        quantSyncStore.job = null
      }
    }
  } catch (e) {}
}

export async function startGlobalSync(payload, isResume = false) {
  const res = await qPost('/api/quant/sync', payload)
  if (!res || !res.ok) {
    message.error((res && res.error) || '提交同步失败')
    return false
  }
  quantSyncStore.job = {
    id: res.job_id,
    job_type: 'sync_data',
    title: res.title,
    status: res.status || 'pending',
    progress: res.progress != null ? res.progress : 3,
    stage: res.stage || (isResume ? '正在从断点恢复同步...' : '正在启动同步...'),
  }
  if (res.already_running) message.info('数据同步已在后台运行')
  _ensureGlobalSyncPolling()
  return true
}

export async function stopGlobalSync() {
  const jid = (quantSyncStore.job && quantSyncStore.job.id) || ''
  const res = await qPost('/api/quant/sync/stop', { job_id: jid })
  if (res && res.ok) message.info('正在保存断点并暂停...')
}

// ---------------------------------------------------------------------------
// Sub-component 1: FreqUI / TradingView Lightweight-Charts K-line Trade Replay
// ---------------------------------------------------------------------------
const TradeKlineReplay = {
  name: 'TradeKlineReplay',
  props: {
    replay: { type: Object, default: null },
    dark: { type: Boolean, default: false },
    focusTrade: { type: Object, default: null },
  },
  setup(props) {
    const hostRef = ref(null)
    let chart = null
    let candleSeries = null
    let volSeries = null
    let ro = null

    function destroyChart() {
      if (ro) { ro.disconnect(); ro = null }
      if (chart) { chart.remove(); chart = null }
      candleSeries = null
      volSeries = null
    }

    function buildChart() {
      destroyChart()
      const el = hostRef.value
      const rep = props.replay
      if (!el || !rep || !Array.isArray(rep.bars) || !rep.bars.length) return

      const dark = !!props.dark
      chart = createChart(el, {
        width: el.clientWidth || 720,
        height: el.clientHeight || 340,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: dark ? '#94a3b8' : '#475569',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: dark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)' },
          horzLines: { color: dark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: dark ? '#1e293b' : '#e2e8f0' },
        timeScale: { borderColor: dark ? '#1e293b' : '#e2e8f0', timeVisible: false },
      })

      candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      })
      candleSeries.setData(
        rep.bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }))
      )

      volSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      })
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
      volSeries.setData(
        rep.bars.map((b) => ({
          time: b.time,
          value: b.volume || 0,
          color: b.close >= b.open ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)',
        }))
      )

      for (const ov of (rep.overlays || [])) {
        if (!ov.data || !ov.data.length) continue
        const ls = chart.addLineSeries({
          color: ov.color || '#3b82f6',
          lineWidth: 1.5,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        ls.setData(ov.data)
      }

      if (Array.isArray(rep.markers) && rep.markers.length) {
        candleSeries.setMarkers(rep.markers)
      }

      chart.timeScale().fitContent()

      ro = new ResizeObserver(() => {
        if (chart && el.clientWidth > 0 && el.clientHeight > 0) {
          chart.applyOptions({ width: el.clientWidth, height: el.clientHeight })
        }
      })
      ro.observe(el)
    }

    function applyFocus(tr) {
      if (!chart || !props.replay || !props.replay.bars || !tr || !tr.entry_date) return
      const bars = props.replay.bars
      const eIdx = bars.findIndex((b) => b.time >= tr.entry_date)
      const xIdx = tr.exit_date ? bars.findIndex((b) => b.time >= tr.exit_date) : eIdx
      if (eIdx < 0) return
      const fromIdx = Math.max(0, eIdx - 18)
      const toIdx = Math.min(bars.length - 1, Math.max(eIdx, xIdx) + 18)
      try {
        chart.timeScale().setVisibleRange({ from: bars[fromIdx].time, to: bars[toIdx].time })
      } catch (e) {}
    }

    onMounted(() => nextTick(buildChart))
    onBeforeUnmount(destroyChart)
    watch(() => [props.replay, props.dark], () => nextTick(buildChart))
    watch(() => props.focusTrade, (tr) => { if (tr) nextTick(() => applyFocus(tr)) })

    return { hostRef }
  },
  template: `
    <div class="bt-kline-wrap">
      <div v-if="replay" class="bt-kline-legend ft-mono">
        <span class="bt-kl-sym">{{ replay.name }} ({{ replay.symbol }})</span>
        <span v-for="ov in (replay.overlays || [])" :key="ov.name" class="bt-kl-item">
          <i :style="{ background: ov.color }"></i>{{ ov.name }}
        </span>
        <span class="bt-kl-item"><i style="background:#10b981"></i>买入</span>
        <span class="bt-kl-item"><i style="background:#f59e0b"></i>盈利卖</span>
        <span class="bt-kl-item"><i style="background:#ef4444"></i>亏损卖</span>
      </div>
      <div ref="hostRef" class="bt-kline-canvas"></div>
    </div>
  `,
}

// ---------------------------------------------------------------------------
// Sub-component 2: QuantStats 3-Pane Synchronized Equity / Drawdown / DailyRet
// ---------------------------------------------------------------------------
const QuantStatsSyncedChart = {
  name: 'QuantStatsSyncedChart',
  props: {
    result: { type: Object, required: true },
    compareRuns: { type: Array, default: () => [] },
    dark: { type: Boolean, default: false },
    logScale: { type: Boolean, default: false },
    rangeKey: { type: String, default: 'ALL' },
  },
  setup(props) {
    const elRef = ref(null)
    let inst = null
    let ro = null

    function render() {
      const el = elRef.value
      const r = props.result
      if (!el || !r || !r.series || !r.series.dates || !r.series.dates.length) return
      if (!inst) inst = echarts.init(el)

      const dark = !!props.dark
      const fg = dark ? '#cbd5e1' : '#334155'
      const muted = '#64748b'
      const gridLine = dark ? 'rgba(148,163,184,0.10)' : 'rgba(15,23,42,0.07)'
      const border = dark ? '#334155' : '#cbd5e1'

      const dates = r.series.dates
      const n = dates.length
      const rangeDays = { '1M': 22, '3M': 65, '6M': 130, '1Y': 252, 'ALL': n }[props.rangeKey] || n
      const startPct = props.rangeKey === 'ALL' ? 0 : Math.max(0, Math.round((1 - rangeDays / Math.max(1, n)) * 100))

      const topSeries = [
        {
          name: '策略净值',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: r.series.nav,
          showSymbol: false,
          lineStyle: { width: 2, color: '#3b82f6' },
          areaStyle: props.logScale ? undefined : {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(59,130,246,0.20)' },
              { offset: 1, color: 'rgba(59,130,246,0.01)' },
            ]),
          },
        },
        {
          name: `基准 (${(r.meta && r.meta.benchmark) || 'Benchmark'})`,
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: r.series.benchmark,
          showSymbol: false,
          lineStyle: { width: 1.3, type: 'dashed', color: '#94a3b8' },
        },
        {
          name: '超额净值',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: r.series.excess,
          showSymbol: false,
          lineStyle: { width: 1.5, color: '#f59e0b' },
        },
      ]

      const cmpPalette = ['#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316']
      ;(props.compareRuns || []).forEach((cj, idx) => {
        if (!cj || !cj.result || !cj.result.series) return
        const mp = new Map()
        const ds = cj.result.series.dates || []
        const nv = cj.result.series.nav || []
        for (let i = 0; i < ds.length; i++) mp.set(ds[i], nv[i])
        topSeries.push({
          name: `对比: ${cj.title.slice(0, 18)}`,
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          connectNulls: true,
          showSymbol: false,
          lineStyle: { width: 1.6, color: cmpPalette[idx % cmpPalette.length] },
          data: dates.map((d) => (mp.has(d) ? mp.get(d) : null)),
        })
      })

      const dailyRets = r.series.daily_returns || dates.map(() => 0)

      inst.setOption({
        backgroundColor: 'transparent',
        animation: false,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross', lineStyle: { color: muted, width: 1, type: 'dashed' } },
          backgroundColor: dark ? 'rgba(13,19,32,0.95)' : 'rgba(255,255,255,0.96)',
          borderColor: border,
          textStyle: { color: fg, fontSize: 11 },
        },
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        legend: {
          top: 2, left: 8, right: 8, type: 'scroll',
          itemWidth: 12, itemHeight: 7,
          textStyle: { color: muted, fontSize: 10.5 },
        },
        grid: [
          { left: 52, right: 16, top: 28, height: '48%' },
          { left: 52, right: 16, top: '60%', height: '16%' },
          { left: 52, right: 16, top: '80%', height: '13%' },
        ],
        xAxis: [
          { type: 'category', gridIndex: 0, data: dates, boundaryGap: false, axisLine: { lineStyle: { color: border } }, axisLabel: { show: false }, axisTick: { show: false } },
          { type: 'category', gridIndex: 1, data: dates, boundaryGap: false, axisLine: { lineStyle: { color: border } }, axisLabel: { show: false }, axisTick: { show: false } },
          { type: 'category', gridIndex: 2, data: dates, boundaryGap: false, axisLine: { lineStyle: { color: border } }, axisLabel: { color: muted, fontSize: 10 } },
        ],
        yAxis: [
          {
            type: props.logScale ? 'log' : 'value',
            gridIndex: 0, scale: true,
            splitLine: { lineStyle: { color: gridLine } },
            axisLabel: { color: muted, fontSize: 10, formatter: (v) => Number(v).toFixed(2) },
          },
          {
            type: 'value', gridIndex: 1, max: 0, splitNumber: 2,
            splitLine: { lineStyle: { color: gridLine } },
            axisLabel: { color: muted, fontSize: 9.5, formatter: '{value}%' },
          },
          {
            type: 'value', gridIndex: 2, splitNumber: 2,
            splitLine: { lineStyle: { color: gridLine } },
            axisLabel: { color: muted, fontSize: 9.5, formatter: '{value}%' },
          },
        ],
        dataZoom: [{ type: 'inside', xAxisIndex: [0, 1, 2], start: startPct, end: 100 }],
        series: [
          ...topSeries,
          {
            name: '水下回撤(%)',
            type: 'line',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: r.series.drawdown,
            showSymbol: false,
            lineStyle: { width: 1.2, color: '#ef4444' },
            areaStyle: { color: 'rgba(239,68,68,0.22)' },
          },
          {
            name: '日收益(%)',
            type: 'bar',
            xAxisIndex: 2,
            yAxisIndex: 2,
            data: dailyRets,
            itemStyle: {
              color: (p) => (Number(p.value) >= 0 ? 'rgba(16,185,129,0.72)' : 'rgba(239,68,68,0.72)'),
            },
          },
        ],
      }, true)
    }

    onMounted(() => {
      nextTick(() => {
        render()
        if (elRef.value) {
          ro = new ResizeObserver(() => { if (inst) inst.resize() })
          ro.observe(elRef.value)
        }
      })
    })
    onBeforeUnmount(() => {
      if (ro) ro.disconnect()
      if (inst) { inst.dispose(); inst = null }
    })
    watch(() => [props.result, props.compareRuns, props.dark, props.logScale, props.rangeKey], () => nextTick(render), { deep: true })

    return { elRef }
  },
  template: `<div ref="elRef" style="width:100%;height:100%"></div>`,
}

// ---------------------------------------------------------------------------
// Presets, Benchmarks, Sync Scopes & Code Templates
// ---------------------------------------------------------------------------

const DEFAULT_CUSTOM_CODE = `# 可用变量: open, high, low, close, volume, ret, pd, np, talib, qf
# 需赋值布尔 Series: entries (买入信号), exits (卖出信号)
# 可选 overlays = {'名称': pd.Series} 叠画到 K 线复盘图

ma_fast = close.ewm(span=12, adjust=False).mean()
ma_slow = close.ewm(span=36, adjust=False).mean()
rsi = qf._calc_rsi(close, 14)

entries = (ma_fast > ma_slow) & (ma_fast.shift(1) <= ma_slow.shift(1)) & (rsi < 70)
exits = (ma_fast < ma_slow) | (rsi > 80)
overlays = {'EMA12': ma_fast, 'EMA36': ma_slow}
`

const STRATEGY_PRESETS = [
  {
    id: 'p_hs300_ema', badge: 'A股', title: '沪深300ETF 双均线', sub: 'EMA10/30 · K线复盘',
    apply: (f) => {
      f.engine = 'vectorbt'; f.strategy = 'dual_ma'; f.symbol = '510300.SH'; f.benchmark = '000300.SH'
      f.sp.fast = 10; f.sp.slow = 30; f.sp.ema = true; f.custom_factor_ids = []
    },
  },
  {
    id: 'p_us_rot', badge: '美股', title: '美股龙头 动量轮动', sub: '美股核心池 · Top5',
    apply: (f) => {
      f.engine = 'vectorbt'; f.strategy = 'etf_momentum_rotation'; f.universe = 'us_stocks'; f.benchmark = '^GSPC'
      f.sp.lookback = 20; f.sp.rebalance_days = 10; f.sp.top_k = 5; f.sp.abs_momentum_filter = true; f.sp.risk_adjusted = true; f.custom_factor_ids = []
    },
  },
  {
    id: 'p_etf_rot', badge: 'ETF', title: '24只ETF 动量轮动', sub: '风险调整动量 · Top3',
    apply: (f) => {
      f.engine = 'vectorbt'; f.strategy = 'etf_momentum_rotation'; f.universe = 'etf_pool'; f.benchmark = '000300.SH'
      f.sp.lookback = 20; f.sp.rebalance_days = 10; f.sp.top_k = 3; f.sp.abs_momentum_filter = true; f.sp.risk_adjusted = true; f.custom_factor_ids = []
    },
  },
  {
    id: 'p_qlib_lgb', badge: 'QLIB', title: 'A股 Alpha158+LGBM', sub: '沪深300 Top10 · T+1',
    apply: (f) => {
      f.engine = 'qlib'; f.strategy = 'qlib_multifactor'; f.universe = 'hs300'; f.benchmark = '000300.SH'
      f.sp.model_type = 'lightgbm'; f.sp.factor_set = 'alpha158_core'; f.sp.topk = 10; f.sp.n_drop = 2; f.sp.rebalance_days = 5; f.custom_factor_ids = []
    },
  },
]

const QUICK_SYMBOLS = [
  { code: '510300.SH', label: '300ETF' },
  { code: '518880.SH', label: '黄金ETF' },
  { code: '600519.SH', label: '茅台' },
  { code: 'NVDA', label: 'NVDA' },
  { code: 'AAPL', label: 'AAPL' },
  { code: 'TSLA', label: 'TSLA' },
  { code: 'QQQ', label: 'QQQ' },
  { code: 'SPY', label: 'SPY' },
  { code: '0700.HK', label: '腾讯' },
  { code: 'BTC-USD', label: 'BTC' },
]

const SYNC_POOL_OPTIONS = [
  { id: 'hs300', label: '沪深300成分股 (A股)', sub: '前复权日线 + 基本面 + 涨跌停' },
  { id: 'zz500', label: '中证500成分股 (A股)', sub: '中盘成长 + 基本面 + 涨跌停' },
  { id: 'etf_pool', label: 'A股主流 ETF 池 (24只)', sub: '宽基/半导体/医药/红利/国债/黄金' },
  { id: 'us_stocks', label: '美股核心龙头 (42只)', sub: 'NVDA/AAPL/MSFT/TSLA/META/AVGO/PLTR...' },
  { id: 'us_etf', label: '美股主流 ETF (14只)', sub: 'SPY/QQQ/IWM/TLT/GLD/SMH/XLK...' },
  { id: 'hk_stocks', label: '港股核心科网/蓝筹 (18只)', sub: '腾讯/阿里/美团/小米/中芯/海油...' },
  { id: 'global', label: '全球指数 · 商品 · 加密 (12只)', sub: '标普/纳指/恒指/金银油铜/BTC/ETH' },
]

const FACTOR_SETS = [
  { id: 'alpha158_core', label: 'Qlib Alpha158 核心量价集 (20因子)' },
  { id: 'alpha101_core', label: 'WorldQuant Alpha101 精选 (26因子)' },
  { id: 'alpha_all_combo', label: 'Alpha158 + Alpha101 + 基本面全集 (53因子)' },
  { id: 'value_lowvol_quality', label: '价值 + 红利 + 低波 + 反转组合 (8因子)' },
]

const FORMULA_OPS = [
  { lbl: 'rank()', insert: 'rank()' },
  { lbl: 'ts_mean(x,20)', insert: 'ts_mean(close, 20)' },
  { lbl: 'ts_std(x,20)', insert: 'ts_std(close, 20)' },
  { lbl: 'ts_corr(x,y,10)', insert: 'ts_corr(open, volume, 10)' },
  { lbl: 'delay(x,5)', insert: 'delay(close, 5)' },
  { lbl: 'delta(x,3)', insert: 'delta(close, 3)' },
]

const FORMULA_EXAMPLES = [
  { label: '量价背离反转', expr: '-ts_corr(rank(delta(log(volume), 2)), rank((close - open) / open), 6)' },
  { label: '20日低波价值', expr: '-ts_std(ret, 20) + rank(1 / pe_ttm)' },
  { label: '短期超跌回补', expr: '-rank(close / delay(close, 5) - 1) * rank(ts_mean(volume, 5) / ts_mean(volume, 20))' },
]

// ---------------------------------------------------------------------------
// Main Component: BacktestLab
// ---------------------------------------------------------------------------
export const BacktestLab = {
  name: 'BacktestLab',
  components: { O2Echarts, SymbolPicker, TradeKlineReplay, QuantStatsSyncedChart },
  props: {
    dark: { type: Boolean, default: false },
    watchlist: { type: Array, default: () => [] },
  },
  emits: ['ask-ai'],
  setup(props, { emit }) {
    const mode = ref('workbench') // workbench | factors | data

    // IDE Pane Visibility & Sizes
    const showRunsRail = ref(true)
    const showRightRail = ref(true)
    const rightRailMode = ref('config') // config | metrics
    const showBottomDock = ref(true)
    const dockHeight = ref(215)
    const mainView = ref('equity') // equity | kline | risk | sweep
    const dockTab = ref('trades') // trades | positions | holdings | importance | logs | compare
    const tradeFilter = ref('all')
    const focusedTrade = ref(null)

    // Chart Controls
    const equityLogScale = ref(false)
    const equityRange = ref('ALL')
    const sweepMetric = ref('sharpe')

    // Config Accordion Sections (Time range is ALWAYS visible at top — never collapsed!)
    const cfgOpen = reactive({ strategy: true, cost: true, risk: false })
    const openAccKeys = computed({
      get: () => ['strategy', 'cost', 'risk'].filter((k) => cfgOpen[k]),
      set: (arr) => {
        const s = new Set(arr || [])
        cfgOpen.strategy = s.has('strategy')
        cfgOpen.cost = s.has('cost')
        cfgOpen.risk = s.has('risk')
      },
    })

    // Environment & Warehouse
    const envLoading = ref(false)
    const envStatus = ref({
      ok: false, python: '', isolated_venv: false, tushare_ready: false, packages: {},
      store: { exists: false, total_rows: 0, symbols: 0, min_date: '', max_date: '', basic_rows: 0, limit_rows: 0, qlib_bin_ready: false, disk_mb: 0, universes: {}, last_sync_at: 0 },
      templates: [],
    })
    const storeSymbols = ref([])
    const symbolSearch = ref('')
    const symbolMarketFilter = ref('ALL')

    // Jobs & Compare
    const jobs = ref([])
    const runsFilter = ref('all')
    const compareIds = ref([])
    const compareCache = reactive({})
    const activeBtJob = ref(null)
    const activeSweepJob = ref(null)
    const activeEvalJob = ref(null)
    const activeBatchJob = ref(null)
    const activeSyncJob = computed(() => quantSyncStore.job)
    const resumableSync = computed(() => quantSyncStore.resumable || envStatus.value.resumable_sync || null)

    // Backtest Form
    const btForm = reactive({
      engine: 'vectorbt',
      strategy: 'dual_ma',
      symbol: '510300.SH',
      universe: 'etf_pool',
      benchmark: '000300.SH',
      start_date: '',
      end_date: '',
      init_cash: 1000000,
      fees_bps: 3,
      stamp_duty_bps: 5,
      slippage_bps: 5,
      stop_loss_pct: 0,
      take_profit_pct: 0,
      custom_factor_ids: [],
      sp: {
        fast: 10, slow: 30, ema: true,
        signal: 9, ma_filter: 60,
        rsi_window: 14, rsi_low: 32, rsi_high: 68, boll_window: 20,
        entry_window: 20, exit_window: 10,
        lookback: 20, rebalance_days: 10, top_k: 3, abs_momentum_filter: true, risk_adjusted: true,
        factor_id: 'ta_rsi14', pct_window: 120, buy_quantile: 0.75, sell_quantile: 0.30,
        code_name: 'EMA+RSI自定义策略', code: DEFAULT_CUSTOM_CODE,
        model_type: 'lightgbm', factor_set: 'alpha158_core', topk: 10, n_drop: 2, label_horizon: 5, train_ratio: 0.55,
      },
    })

    // Factor Research State
    const factors = ref([])
    const leaderboardMap = reactive({})
    const factorFamily = ref('ALL')
    const factorSearch = ref('')
    const factorSortKey = ref('abs_icir')
    const factorSortDir = ref('desc')
    const factorBasket = ref([])
    const selectedFactorId = ref('wq_alpha006')
    const customFactorExpr = ref('')
    const useCustomExpr = ref(false)
    const evalForm = reactive({ universe: 'hs300', quantiles: 5, standardize: true, flip_sign: false })
    const corrModalOpen = ref(false)
    const corrLoading = ref(false)
    const corrResult = ref(null)

    // Flexible Multi-Market Sync Form
    const syncForm = reactive({
      scopes: ['hs300', 'etf_pool', 'us_stocks', 'us_etf', 'global'],
      rangeMode: 'years', // years | custom_dates
      years: 3,
      start_date: isoOffsetDays(365 * 3),
      end_date: todayIso(),
      hs300_limit: 80,
      zz500_limit: 60,
      custom_symbols_text: '',
    })

    let pollTimer = null

    async function loadStatus(force = false) {
      envLoading.value = true
      try {
        const res = await qGet('/api/quant/status' + (force ? '?force=1' : ''))
        if (res && typeof res === 'object') {
          envStatus.value = { ...envStatus.value, ...res }
          // Default backtest start/end dates to warehouse range if empty
          if (!btForm.start_date && res.store && res.store.min_date) btForm.start_date = res.store.min_date
          if (!btForm.end_date && res.store && res.store.max_date) btForm.end_date = res.store.max_date
        }
      } finally {
        envLoading.value = false
      }
    }

    async function loadStoreSymbols() {
      try {
        const res = await qGet('/api/quant/symbols')
        if (res && res.ok && Array.isArray(res.items)) storeSymbols.value = res.items
      } catch (e) {}
    }

    async function loadFactors() {
      try {
        const res = await qGet('/api/quant/factors')
        if (res && res.ok && Array.isArray(res.items)) factors.value = res.items
      } catch (e) {}
    }

    async function loadLeaderboard() {
      try {
        const res = await qGet('/api/quant/leaderboard?universe=' + encodeURIComponent(evalForm.universe))
        if (res && res.ok && Array.isArray(res.items)) {
          for (const k of Object.keys(leaderboardMap)) delete leaderboardMap[k]
          for (const it of res.items) leaderboardMap[it.factor_id] = it
        }
      } catch (e) {}
    }

    async function loadJobs() {
      try {
        const res = await qGet('/api/quant/jobs?limit=60')
        if (res && res.ok && Array.isArray(res.items)) {
          jobs.value = res.items
          let hasRunning = false
          const runBt = res.items.find((j) => j.job_type === 'backtest' && (j.status === 'pending' || j.status === 'running'))
          if (runBt) { activeBtJob.value = runBt; hasRunning = true }
          else if (!activeBtJob.value) {
            const firstBt = res.items.find((j) => j.job_type === 'backtest' && j.status === 'done')
            if (firstBt) await openJobDetail(firstBt.id, false)
          }
          const runEv = res.items.find((j) => j.job_type === 'factor_eval' && (j.status === 'pending' || j.status === 'running'))
          if (runEv) { activeEvalJob.value = runEv; hasRunning = true }
          else if (!activeEvalJob.value) {
            const firstEv = res.items.find((j) => j.job_type === 'factor_eval' && j.status === 'done')
            if (firstEv) await openJobDetail(firstEv.id, false)
          }
          const runSw = res.items.find((j) => j.job_type === 'param_sweep' && (j.status === 'pending' || j.status === 'running'))
          if (runSw) { activeSweepJob.value = runSw; hasRunning = true }
          const runBa = res.items.find((j) => j.job_type === 'factor_batch' && (j.status === 'pending' || j.status === 'running'))
          if (runBa) { activeBatchJob.value = runBa; hasRunning = true }
          if (hasRunning) ensurePolling()
        }
      } catch (e) {}
    }

    async function openJobDetail(jobId, switchMode = true) {
      const res = await qGet('/api/quant/job/' + encodeURIComponent(jobId))
      if (!res || !res.ok || !res.job) return
      const job = res.job
      if (job.job_type === 'backtest') {
        activeBtJob.value = job
        compareCache[job.id] = job
        if (job.result && job.result.feature_importance && job.result.feature_importance.length) {
          dockTab.value = 'importance'
        } else {
          dockTab.value = 'trades'
        }
        if (mainView.value === 'kline' && !(job.result && job.result.kline_replay)) {
          mainView.value = 'equity'
        }
        if (switchMode) mode.value = 'workbench'
      } else if (job.job_type === 'factor_eval') {
        activeEvalJob.value = job
        if (switchMode) mode.value = 'factors'
      } else if (job.job_type === 'param_sweep') {
        activeSweepJob.value = job
        mainView.value = 'sweep'
        if (switchMode) mode.value = 'workbench'
      }
    }

    function ensurePolling() {
      if (pollTimer) return
      pollTimer = setInterval(async () => {
        const running = [activeBtJob.value, activeSweepJob.value, activeEvalJob.value, activeBatchJob.value].filter(
          (j) => j && (j.status === 'pending' || j.status === 'running')
        )
        if (!running.length) {
          clearInterval(pollTimer)
          pollTimer = null
          return
        }
        let anyDone = false
        for (const t of running) {
          try {
            const res = await qGet('/api/quant/job/' + encodeURIComponent(t.id))
            if (!res || !res.ok || !res.job) continue
            const u = res.job
            if (u.job_type === 'backtest') activeBtJob.value = u
            else if (u.job_type === 'param_sweep') activeSweepJob.value = u
            else if (u.job_type === 'factor_eval') activeEvalJob.value = u
            else if (u.job_type === 'factor_batch') activeBatchJob.value = u

            if (u.status === 'done' || u.status === 'failed') {
              anyDone = true
              if (u.status === 'done') {
                if (u.job_type === 'backtest') {
                  compareCache[u.id] = u
                  message.success('回测完成')
                } else if (u.job_type === 'param_sweep') {
                  mainView.value = 'sweep'
                  message.success('参数热力图已生成')
                } else if (u.job_type === 'factor_batch') {
                  loadLeaderboard()
                  message.success(`批量体检完成（${(u.result && u.result.items ? u.result.items.length : 0)} 个因子入榜）`)
                } else if (u.job_type === 'factor_eval') {
                  loadLeaderboard()
                  message.success('Alphalens 因子体检完成')
                }
              } else if (u.error) {
                message.error(String(u.error).slice(0, 120))
              }
            }
          } catch (e) {}
        }
        if (anyDone) loadJobs()
      }, 1100)
    }

    function setQuickDateRange(key) {
      const maxD = (envStatus.value.store && envStatus.value.store.max_date) || todayIso()
      const minD = (envStatus.value.store && envStatus.value.store.min_date) || ''
      if (key === 'ALL') {
        btForm.start_date = minD
        btForm.end_date = maxD
        return
      }
      const daysMap = { '6M': 183, '1Y': 365, '2Y': 730, '3Y': 1095, '5Y': 1826 }
      const dBack = daysMap[key] || 365
      const endObj = new Date(maxD + 'T00:00:00')
      const startObj = new Date(endObj.getTime() - dBack * 86400000)
      const pad = (n) => String(n).padStart(2, '0')
      const sIso = `${startObj.getFullYear()}-${pad(startObj.getMonth() + 1)}-${pad(startObj.getDate())}`
      btForm.start_date = (minD && sIso < minD) ? minD : sIso
      btForm.end_date = maxD
    }

    function applyPreset(p) {
      p.apply(btForm)
      message.info(`已载入预设：${p.title}`)
    }

    function selectEngine(eng) {
      btForm.engine = eng
      if (eng === 'qlib') {
        btForm.strategy = 'qlib_multifactor'
        if (!['hs300', 'zz500', 'us_stocks', 'hk_stocks', 'all_cn_stocks'].includes(btForm.universe)) {
          btForm.universe = 'hs300'
        }
      } else if (btForm.strategy === 'qlib_multifactor') {
        btForm.strategy = 'dual_ma'
      }
    }

    function onStrategyChange(sid) {
      btForm.strategy = sid
      if (sid === 'qlib_multifactor') {
        btForm.engine = 'qlib'
      } else {
        btForm.engine = 'vectorbt'
      }
    }

    function onPickSymbol(item) {
      if (!item) return
      const sid = String(item.secid || '')
      if (sid.startsWith('1.') && /^\d+$/.test(sid.slice(2))) btForm.symbol = sid.slice(2) + '.SH'
      else if (sid.startsWith('0.') && /^\d+$/.test(sid.slice(2))) btForm.symbol = sid.slice(2) + '.SZ'
      else if (sid.startsWith('116.') && /^\d+$/.test(sid.slice(4))) btForm.symbol = String(parseInt(sid.slice(4), 10)).padStart(4, '0') + '.HK'
      else btForm.symbol = item.symbol || sid
    }

    async function runBacktest() {
      if (!envStatus.value.store || !envStatus.value.store.exists) {
        message.warning('请先同步本地量化数据仓')
        mode.value = 'data'
        return
      }
      const spPayload = { ...btForm.sp }
      if (btForm.engine === 'qlib' && btForm.custom_factor_ids.length) {
        spPayload.factor_ids = [...btForm.custom_factor_ids]
        spPayload.factor_set = `basket_${btForm.custom_factor_ids.length}`
      }
      const res = await qPost('/api/quant/backtest', {
        engine: btForm.engine,
        strategy: btForm.strategy,
        symbol: btForm.symbol,
        universe: btForm.universe,
        benchmark: btForm.benchmark,
        start_date: btForm.start_date,
        end_date: btForm.end_date,
        init_cash: btForm.init_cash,
        fees_bps: btForm.fees_bps,
        stamp_duty_bps: btForm.stamp_duty_bps,
        slippage_bps: btForm.slippage_bps,
        stop_loss_pct: btForm.stop_loss_pct,
        take_profit_pct: btForm.take_profit_pct,
        strategy_params: spPayload,
      })
      if (!res || !res.ok) return message.error((res && res.error) || '提交回测失败')
      activeBtJob.value = { id: res.job_id, job_type: 'backtest', title: res.title, engine: res.engine, status: 'pending', progress: 4, stage: '正在启动回测引擎...' }
      ensurePolling()
      loadJobs()
    }

    async function runParamSweep() {
      if (btForm.engine !== 'vectorbt' || ['factor_timing', 'custom_code'].includes(btForm.strategy)) {
        message.info('参数热力扫描支持双均线 / MACD / RSI布林 / 海龟突破 / 多资产动量轮动')
        return
      }
      const res = await qPost('/api/quant/sweep', {
        strategy: btForm.strategy,
        symbol: btForm.symbol,
        universe: btForm.universe,
        start_date: btForm.start_date,
        end_date: btForm.end_date,
        fees_bps: btForm.fees_bps,
        slippage_bps: btForm.slippage_bps,
        strategy_params: { ...btForm.sp },
      })
      if (!res || !res.ok) return message.error((res && res.error) || '提交扫描失败')
      activeSweepJob.value = { id: res.job_id, job_type: 'param_sweep', title: res.title, status: 'pending', progress: 5, stage: '正在扫描参数网格...' }
      mainView.value = 'sweep'
      ensurePolling()
    }

    function applySweepCell(params) {
      const sr = sweepResult.value
      if (!sr || !params || !Array.isArray(params.value)) return
      const [xi, yi, val] = params.value
      if (val == null) return
      const xv = sr.x_vals[xi]
      const yv = sr.y_vals[yi]
      btForm.sp[sr.x_key] = xv
      btForm.sp[sr.y_key] = yv
      rightRailMode.value = 'config'
      showRightRail.value = true
      message.success(`已回填参数：${sr.x_label}=${xv}，${sr.y_label}=${yv}`)
    }

    async function runFactorEval(fidOverride = null) {
      if (fidOverride) {
        selectedFactorId.value = fidOverride
        useCustomExpr.value = false
      }
      const res = await qPost('/api/quant/factor_eval', {
        factor_id: useCustomExpr.value ? 'custom' : selectedFactorId.value,
        custom_expr: useCustomExpr.value ? customFactorExpr.value : '',
        universe: evalForm.universe,
        quantiles: evalForm.quantiles,
        standardize: evalForm.standardize,
        flip_sign: evalForm.flip_sign,
      })
      if (!res || !res.ok) return message.error((res && res.error) || '提交因子体检失败')
      activeEvalJob.value = { id: res.job_id, job_type: 'factor_eval', title: res.title, status: 'pending', progress: 5, stage: '正在运行 Alphalens 体检...' }
      ensurePolling()
    }

    async function runFactorBatch() {
      const res = await qPost('/api/quant/factor_batch', {
        family: factorFamily.value,
        universe: evalForm.universe,
        horizon: 5,
      })
      if (!res || !res.ok) return message.error((res && res.error) || '提交批量体检失败')
      activeBatchJob.value = { id: res.job_id, job_type: 'factor_batch', title: `批量体检 ${factorFamily.value}`, status: 'pending', progress: 5, stage: '正在扫描因子库...' }
      ensurePolling()
    }

    function toggleBasket(fid) {
      const idx = factorBasket.value.indexOf(fid)
      if (idx >= 0) factorBasket.value.splice(idx, 1)
      else factorBasket.value.push(fid)
    }

    async function openFactorCorrModal() {
      if (factorBasket.value.length < 2) return message.warning('请先勾选至少 2 个因子')
      corrModalOpen.value = true
      corrLoading.value = true
      corrResult.value = null
      try {
        const res = await qPost('/api/quant/factor_corr', { factor_ids: factorBasket.value, universe: evalForm.universe })
        if (res && res.ok) corrResult.value = res
        else message.error((res && res.error) || '计算相关性失败')
      } finally {
        corrLoading.value = false
      }
    }

    function sendBasketToQlib() {
      if (!factorBasket.value.length) return
      btForm.engine = 'qlib'
      btForm.strategy = 'qlib_multifactor'
      btForm.universe = evalForm.universe
      btForm.custom_factor_ids = [...factorBasket.value]
      cfgOpen.strategy = true
      rightRailMode.value = 'config'
      showRightRail.value = true
      mode.value = 'workbench'
      message.success(`已将 ${factorBasket.value.length} 个精选因子载入 Qlib 多因子配置`)
    }

    function sendSingleFactorToTiming(fid) {
      btForm.engine = 'vectorbt'
      btForm.strategy = 'factor_timing'
      btForm.sp.factor_id = fid
      btForm.custom_factor_ids = []
      cfgOpen.strategy = true
      rightRailMode.value = 'config'
      showRightRail.value = true
      mode.value = 'workbench'
      message.info(`已将因子 ${fid} 填入择时配置`)
    }

    async function toggleCompare(job) {
      const idx = compareIds.value.indexOf(job.id)
      if (idx >= 0) { compareIds.value.splice(idx, 1); return }
      if (compareIds.value.length >= 5) return message.warning('最多同时对比 5 个实验')
      compareIds.value.push(job.id)
      if (!compareCache[job.id]) {
        const res = await qGet('/api/quant/job/' + encodeURIComponent(job.id))
        if (res && res.ok && res.job) compareCache[job.id] = res.job
      }
    }

    async function deleteJob(jobId) {
      const res = await qPost('/api/quant/job/delete', { id: jobId })
      if (res && res.ok) {
        jobs.value = jobs.value.filter((j) => j.id !== jobId)
        compareIds.value = compareIds.value.filter((id) => id !== jobId)
        if (activeBtJob.value && activeBtJob.value.id === jobId) activeBtJob.value = null
      }
    }

    function onClickTradeRow(tr) {
      if (btResult.value && btResult.value.kline_replay) {
        mainView.value = 'kline'
        focusedTrade.value = { ...tr, _ts: Date.now() }
      }
    }

    function toggleSyncScope(id) {
      const idx = syncForm.scopes.indexOf(id)
      if (idx >= 0) syncForm.scopes.splice(idx, 1)
      else syncForm.scopes.push(id)
    }

    function importWatchlistToSync() {
      const wl = props.watchlist || []
      if (!wl.length) return message.info('自选列表为空')
      const codes = wl.map((w) => w.secid || w.symbol).filter(Boolean)
      const prev = syncForm.custom_symbols_text.trim()
      syncForm.custom_symbols_text = prev ? `${prev}, ${codes.join(', ')}` : codes.join(', ')
      message.success(`已导入 ${codes.length} 个自选标的`)
    }

    async function runSync(resumeTask = null) {
      const isResume = resumeTask && typeof resumeTask === 'object' && resumeTask.task_key
      let payload
      if (isResume) {
        const rp = resumeTask.params || {}
        payload = {
          scopes: Array.isArray(rp.scopes) && rp.scopes.length ? rp.scopes : [...syncForm.scopes],
          start_date: rp.start_date || resumeTask.start_date || syncForm.start_date,
          end_date: rp.end_date || resumeTask.end_date || syncForm.end_date,
          hs300_limit: rp.hs300_limit || syncForm.hs300_limit,
          zz500_limit: rp.zz500_limit || syncForm.zz500_limit,
          custom_symbols: rp.custom_symbols || '',
          resume_task_key: resumeTask.task_key,
        }
      } else {
        const customText = (syncForm.custom_symbols_text || '').trim()
        if (!syncForm.scopes.length && !customText) {
          return message.warning('请至少勾选一个标的池或输入自定义代码')
        }
        payload = {
          scopes: [...syncForm.scopes],
          hs300_limit: syncForm.hs300_limit,
          zz500_limit: syncForm.zz500_limit,
          custom_symbols: customText,
        }
        if (syncForm.rangeMode === 'custom_dates') {
          payload.start_date = syncForm.start_date
          payload.end_date = syncForm.end_date
        } else {
          payload.years = Number(syncForm.years) || 3
        }
      }
      await startGlobalSync(payload, !!isResume)
    }

    async function stopSync() {
      await stopGlobalSync()
    }

    function jumpBacktestSymbol(sym, mkt) {
      btForm.engine = 'vectorbt'
      btForm.strategy = 'dual_ma'
      btForm.symbol = sym
      if (mkt === 'US_STOCK' || mkt === 'US_ETF') btForm.benchmark = '^GSPC'
      else if (mkt === 'HK_STOCK') btForm.benchmark = '^HSI'
      else btForm.benchmark = '000300.SH'
      mode.value = 'workbench'
      showRightRail.value = true
      rightRailMode.value = 'config'
      message.info(`已选中 ${sym}，点击「运行回测」即可开始`)
    }

    function askAiReviewBacktest() {
      const r = btResult.value
      if (!r || !r.kpis) return
      const k = r.kpis
      const m = r.meta || {}
      emit('ask-ai', [
        `请以资深量化基金经理视角深度诊断这份回测报告（评估过拟合、尾部风险、滑点敏感性与改进方案）：`,
        `- 策略：${m.strategy_label || m.strategy}（引擎：${r.engine}）`,
        `- 区间：${r.series.dates[0]} ~ ${r.series.dates[r.series.dates.length - 1]} (${r.series.dates.length} 交易日)`,
        `- 收益：累计 ${k.total_return}% | 年化 ${k.annual_return}% | 基准(${m.benchmark}) ${k.benchmark_return}% | 超额 ${k.excess_return}%`,
        `- 风险：夏普 ${k.sharpe} | 索提诺 ${k.sortino} | 卡玛 ${k.calmar} | 最大回撤 ${k.max_drawdown}% (${k.max_dd_date}) | VaR95 ${k.var_95}%`,
        `- 交易：${k.total_trades}笔 | 胜率 ${k.win_rate}% | 盈亏比 ${k.profit_factor} | 期望收益 ${k.expectancy}%`,
      ].join('\n'))
    }

    function startDockResize(e) {
      e.preventDefault()
      const startY = e.clientY
      const startH = dockHeight.value
      const onMove = (ev) => { dockHeight.value = Math.max(120, Math.min(460, startH + (startY - ev.clientY))) }
      const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    // Computed Views
    const btJobs = computed(() =>
      jobs.value.filter((j) => {
        if (j.job_type !== 'backtest') return false
        if (runsFilter.value === 'all') return true
        return (j.engine || '').toLowerCase().includes(runsFilter.value)
      })
    )
    const btResult = computed(() => (activeBtJob.value && activeBtJob.value.result && activeBtJob.value.result.ok ? activeBtJob.value.result : null))
    const sweepResult = computed(() => (activeSweepJob.value && activeSweepJob.value.result && activeSweepJob.value.result.ok ? activeSweepJob.value.result : null))
    const evalResult = computed(() => (activeEvalJob.value && activeEvalJob.value.result && activeEvalJob.value.result.ok ? activeEvalJob.value.result : null))
    // Strict boolean loading flags — NEVER pass null into Ant Design Vue <a-button :loading>,
    // because typeof null === 'object' crashes antd Button (reading 'delay') and hides the button!
    const isBtRunning = computed(() => !!(activeBtJob.value && (activeBtJob.value.status === 'pending' || activeBtJob.value.status === 'running')))
    const isSweepRunning = computed(() => !!(activeSweepJob.value && (activeSweepJob.value.status === 'pending' || activeSweepJob.value.status === 'running')))
    const isBatchRunning = computed(() => !!(activeBatchJob.value && (activeBatchJob.value.status === 'pending' || activeBatchJob.value.status === 'running')))
    const isEvalRunning = computed(() => !!(activeEvalJob.value && (activeEvalJob.value.status === 'pending' || activeEvalJob.value.status === 'running')))
    const isSyncRunning = computed(() => quantSyncStore.isRunning)
    const vectorbtTemplates = computed(() => (envStatus.value.templates || []).filter((t) => t.engine === 'vectorbt'))
    const isSingleAssetStrategy = computed(() => btForm.engine === 'vectorbt' && btForm.strategy !== 'etf_momentum_rotation')
    const universeOptions = computed(() => {
      const u = (envStatus.value.store && envStatus.value.store.universes) || {}
      const list = [
        { value: 'hs300', label: (u.hs300 && u.hs300.label) || '沪深300核心池' },
        { value: 'zz500', label: (u.zz500 && u.zz500.label) || '中证500核心池' },
        { value: 'etf_pool', label: (u.etf_pool && u.etf_pool.label) || 'A股主流ETF池' },
        { value: 'us_stocks', label: (u.us_stocks && u.us_stocks.label) || '美股核心龙头池' },
        { value: 'us_etf', label: (u.us_etf && u.us_etf.label) || '美股核心ETF池' },
        { value: 'hk_stocks', label: (u.hk_stocks && u.hk_stocks.label) || '港股核心池' },
        { value: 'global_core', label: (u.global_core && u.global_core.label) || '全球指数/商品/加密池' },
        { value: 'all_cn_stocks', label: (u.all_cn_stocks && u.all_cn_stocks.label) || '全部已同步A股' },
      ]
      return list
    })
    const compareRuns = computed(() =>
      compareIds.value
        .filter((id) => !activeBtJob.value || id !== activeBtJob.value.id)
        .map((id) => compareCache[id])
        .filter((j) => j && j.result && j.result.ok)
    )
    const filteredTrades = computed(() => {
      const arr = [...((btResult.value && btResult.value.trades) || [])].reverse()
      if (tradeFilter.value === 'win') return arr.filter((t) => Number(t.return_pct) > 0)
      if (tradeFilter.value === 'loss') return arr.filter((t) => Number(t.return_pct) <= 0)
      return arr
    })
    const familyCounts = computed(() => {
      const m = { ALL: factors.value.length }
      for (const f of factors.value) m[f.family] = (m[f.family] || 0) + 1
      return m
    })
    const sortedLeaderboardRows = computed(() => {
      const q = (factorSearch.value || '').trim().toLowerCase()
      const rows = factors.value
        .filter((f) => {
          if (factorFamily.value !== 'ALL' && f.family !== factorFamily.value) return false
          if (!q) return true
          return (
            (f.id || '').toLowerCase().includes(q) ||
            (f.name || '').toLowerCase().includes(q) ||
            (f.category || '').toLowerCase().includes(q) ||
            (f.formula || '').toLowerCase().includes(q)
          )
        })
        .map((f) => {
          const lb = leaderboardMap[f.id] || null
          return {
            ...f,
            tested: !!lb,
            ic_1d: lb ? lb.ic_1d : null,
            ic_mean: lb ? lb.ic_mean : null,
            icir: lb ? lb.icir : null,
            abs_icir: lb ? Math.abs(lb.icir || 0) : -1,
            ic_win_rate: lb ? lb.ic_win_rate : null,
            ls_spread_bps: lb ? lb.ls_spread_bps : null,
            turnover_pct: lb ? lb.turnover_pct : null,
          }
        })
      const key = factorSortKey.value
      const dir = factorSortDir.value === 'asc' ? 1 : -1
      rows.sort((a, b) => {
        const va = a[key] == null ? -999999 : Number(a[key])
        const vb = b[key] == null ? -999999 : Number(b[key])
        if (va === vb) return a.id.localeCompare(b.id)
        return (va - vb) * dir
      })
      return rows
    })
    function toggleFactorSort(key) {
      if (factorSortKey.value === key) factorSortDir.value = factorSortDir.value === 'desc' ? 'asc' : 'desc'
      else { factorSortKey.value = key; factorSortDir.value = 'desc' }
    }
    const filteredStoreSymbols = computed(() => {
      const q = (symbolSearch.value || '').trim().toLowerCase()
      return storeSymbols.value.filter((s) => {
        if (symbolMarketFilter.value !== 'ALL' && s.market !== symbolMarketFilter.value) return false
        if (!q) return true
        return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.industry.toLowerCase().includes(q)
      })
    })

    // Charts
    const rollingChartOpt = computed(() => {
      const r = btResult.value
      if (!r || !r.series || !r.series.dates) return {}
      return {
        tooltip: { trigger: 'axis' },
        legend: { top: 2, left: 6 },
        grid: { left: 44, right: 44, top: 28, bottom: 24 },
        xAxis: { type: 'category', data: r.series.dates, boundaryGap: false },
        yAxis: [{ type: 'value', name: 'Sharpe', splitNumber: 3 }, { type: 'value', name: 'Beta', splitLine: { show: false }, splitNumber: 3 }],
        series: [
          { name: '60日滚动夏普', type: 'line', data: r.series.rolling_sharpe || [], showSymbol: false, lineStyle: { width: 1.8, color: '#3b82f6' } },
          { name: '60日滚动Beta', type: 'line', yAxisIndex: 1, data: r.series.rolling_beta || [], showSymbol: false, lineStyle: { width: 1.4, type: 'dashed', color: '#f59e0b' } },
        ],
      }
    })
    const retHistOpt = computed(() => {
      const h = btResult.value && btResult.value.return_hist
      if (!h || !h.bins || !h.bins.length) return {}
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 16, top: 20, bottom: 26 },
        xAxis: { type: 'category', data: h.bins.map((b) => `${b}%`) },
        yAxis: { type: 'value', splitNumber: 3 },
        series: [{ name: '交易日频次', type: 'bar', data: h.counts, itemStyle: { color: (p) => (Number(h.bins[p.dataIndex]) >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(239,68,68,0.75)') } }],
      }
    })
    const importanceChartOpt = computed(() => {
      const list = (btResult.value && btResult.value.feature_importance) || []
      if (!list.length) return {}
      const rev = [...list].reverse()
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 160, right: 24, top: 8, bottom: 20 },
        xAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
        yAxis: { type: 'category', data: rev.map((x) => x.name || x.factor_id), axisLabel: { fontSize: 10.5 } },
        series: [{ name: '贡献占比', type: 'bar', data: rev.map((x) => x.importance_pct), itemStyle: { color: '#3b82f6', borderRadius: [0, 2, 2, 0] }, barMaxWidth: 13 }],
      }
    })
    const sweepHeatmapOpt = computed(() => {
      const sr = sweepResult.value
      if (!sr) return {}
      const raw = sweepMetric.value === 'return' ? sr.return_grid : (sweepMetric.value === 'maxdd' ? sr.maxdd_grid : sr.sharpe_grid)
      const vals = raw.map((x) => x[2]).filter((v) => v != null)
      const minV = vals.length ? Math.min(...vals) : -1
      const maxV = vals.length ? Math.max(...vals) : 1
      return {
        tooltip: {
          position: 'top',
          formatter: (p) => {
            const [xi, yi, val] = p.value
            if (val == null) return '无效参数组合'
            const suf = sweepMetric.value === 'sharpe' ? '' : '%'
            return `<b>${sr.x_label}: ${sr.x_vals[xi]} · ${sr.y_label}: ${sr.y_vals[yi]}</b><br/>数值: <b>${val}${suf}</b><br/><span style="opacity:.7">点击格子一键回填</span>`
          },
        },
        grid: { left: 68, right: 64, top: 20, bottom: 42 },
        xAxis: { type: 'category', name: sr.x_label, nameLocation: 'middle', nameGap: 24, data: sr.x_vals.map(String), splitArea: { show: true } },
        yAxis: { type: 'category', name: sr.y_label, data: sr.y_vals.map(String), splitArea: { show: true } },
        visualMap: { min: minV, max: maxV === minV ? minV + 1 : maxV, calculable: true, orient: 'vertical', right: 6, top: 'center', inRange: { color: ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#10b981'] } },
        series: [{ name: sweepMetric.value, type: 'heatmap', data: raw, label: { show: true, fontSize: 10, formatter: (p) => (p.value[2] == null ? '' : String(p.value[2])) } }],
      }
    })
    const evalIcDecayOpt = computed(() => {
      const s = (evalResult.value && evalResult.value.summary) || []
      if (!s.length) return {}
      return {
        tooltip: { trigger: 'axis' }, legend: { top: 2, left: 6 }, grid: { left: 46, right: 44, top: 28, bottom: 24 },
        xAxis: { type: 'category', data: s.map((x) => x.period) },
        yAxis: [{ type: 'value', name: 'RankIC', splitNumber: 3 }, { type: 'value', name: 'ICIR', splitLine: { show: false }, splitNumber: 3 }],
        series: [
          { name: 'RankIC均值', type: 'bar', barMaxWidth: 26, data: s.map((x) => x.ic_mean), itemStyle: { color: (p) => (Number(p.value) >= 0 ? '#10b981' : '#ef4444') } },
          { name: 'ICIR', type: 'line', yAxisIndex: 1, data: s.map((x) => x.icir), lineStyle: { width: 2, color: '#3b82f6' } },
        ],
      }
    })
    const evalQuantileNavOpt = computed(() => {
      const r = evalResult.value
      if (!r || !r.quantile_nav || !r.quantile_nav.dates || !r.quantile_nav.dates.length) return {}
      const palette = ['#ef4444', '#f97316', '#94a3b8', '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899']
      const keys = Object.keys(r.quantile_nav.curves || {})
      const series = keys.map((k, idx) => ({ name: k, type: 'line', data: r.quantile_nav.curves[k], showSymbol: false, lineStyle: { width: idx === 0 || idx === keys.length - 1 ? 2.1 : 1.2, color: palette[idx % palette.length] } }))
      if (r.quantile_nav.long_short && r.quantile_nav.long_short.length) {
        series.push({ name: '多空(Top-Bot)', type: 'line', data: r.quantile_nav.long_short, showSymbol: false, lineStyle: { width: 2, type: 'dashed', color: '#f59e0b' } })
      }
      return {
        tooltip: { trigger: 'axis' }, legend: { top: 2, left: 6 }, grid: { left: 46, right: 16, top: 28, bottom: 24 },
        xAxis: { type: 'category', data: r.quantile_nav.dates, boundaryGap: false }, yAxis: { type: 'value', scale: true }, series,
      }
    })
    const evalIcSeriesOpt = computed(() => {
      const r = evalResult.value
      if (!r || !r.ic_series || !r.ic_series.dates) return {}
      return {
        tooltip: { trigger: 'axis' }, legend: { top: 2, left: 6 }, grid: { left: 44, right: 44, top: 28, bottom: 24 },
        xAxis: { type: 'category', data: r.ic_series.dates },
        yAxis: [{ type: 'value', splitNumber: 3 }, { type: 'value', splitLine: { show: false }, splitNumber: 3 }],
        series: [
          { name: '日IC', type: 'bar', data: r.ic_series.ic, itemStyle: { color: (p) => (Number(p.value) >= 0 ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)') } },
          { name: '20D均值', type: 'line', data: r.ic_series.ma20, showSymbol: false, lineStyle: { width: 1.5, color: '#3b82f6' } },
          { name: '累计IC', type: 'line', yAxisIndex: 1, data: r.ic_series.cum, showSymbol: false, lineStyle: { width: 1.8, color: '#f59e0b' } },
        ],
      }
    })
    const corrHeatmapOpt = computed(() => {
      const c = corrResult.value
      if (!c || !c.names || !c.names.length) return {}
      return {
        tooltip: { formatter: (p) => `${c.names[p.value[0]]} × ${c.names[p.value[1]]}: <b>${p.value[2]}</b>` },
        grid: { left: 96, right: 46, top: 14, bottom: 72 },
        xAxis: { type: 'category', data: c.names, axisLabel: { rotate: 35, fontSize: 10 } },
        yAxis: { type: 'category', data: c.names, axisLabel: { fontSize: 10 } },
        visualMap: { min: -1, max: 1, right: 4, top: 'center', inRange: { color: ['#ef4444', '#f8fafc', '#3b82f6'] } },
        series: [{ type: 'heatmap', data: c.matrix, label: { show: true, fontSize: 10 } }],
      }
    })

    watch(() => evalForm.universe, () => loadLeaderboard())
    watch(mode, (m) => {
      if (m === 'data' && !storeSymbols.value.length) loadStoreSymbols()
      if (m === 'factors') loadLeaderboard()
    })

    let offSyncEv = null
    onMounted(() => {
      hydrateActiveSync(true)
      loadStatus()
      loadFactors()
      loadLeaderboard()
      loadJobs()
      offSyncEv = onQuantSyncEvent(() => {
        loadStatus(true)
        loadStoreSymbols()
        loadJobs()
      })
    })
    onBeforeUnmount(() => {
      if (pollTimer) clearInterval(pollTimer)
      if (offSyncEv) offSyncEv()
    })

    return {
      mode, showRunsRail, showRightRail, rightRailMode, showBottomDock, dockHeight,
      mainView, dockTab, tradeFilter, focusedTrade, equityLogScale, equityRange, sweepMetric, cfgOpen, openAccKeys,
      envLoading, envStatus, storeSymbols, symbolSearch, symbolMarketFilter, filteredStoreSymbols,
      jobs, btJobs, runsFilter, compareIds, compareRuns, activeBtJob, activeSweepJob, activeEvalJob, activeBatchJob, activeSyncJob, resumableSync,
      btForm, btResult, sweepResult, evalResult, vectorbtTemplates, isSingleAssetStrategy, universeOptions, filteredTrades,
      isBtRunning, isSweepRunning, isBatchRunning, isEvalRunning, isSyncRunning,
      factors, factorFamily, factorSearch, factorSortKey, factorSortDir, factorBasket, selectedFactorId, customFactorExpr, useCustomExpr,
      evalForm, familyCounts, sortedLeaderboardRows, corrModalOpen, corrLoading, corrResult,
      syncForm,
      STRATEGY_PRESETS, QUICK_SYMBOLS, SYNC_POOL_OPTIONS, FACTOR_SETS, FORMULA_OPS, FORMULA_EXAMPLES,
      rollingChartOpt, retHistOpt, importanceChartOpt, sweepHeatmapOpt,
      evalIcDecayOpt, evalQuantileNavOpt, evalIcSeriesOpt, corrHeatmapOpt,
      loadStatus, loadJobs, loadStoreSymbols, openJobDetail, setQuickDateRange, applyPreset, selectEngine, onStrategyChange, onPickSymbol,
      runBacktest, runParamSweep, applySweepCell, runFactorEval, runFactorBatch, toggleBasket, toggleFactorSort,
      openFactorCorrModal, sendBasketToQlib, sendSingleFactorToTiming, toggleCompare, deleteJob, onClickTradeRow,
      toggleSyncScope, importWatchlistToSync, runSync, stopSync, jumpBacktestSymbol, askAiReviewBacktest, startDockResize,
      fmtSigned, clsVal,
    }
  },
  template: `
<div class="bt-shell">
  <!-- 顶栏：干净、绝不溢出裁剪 -->
  <div class="bt-topbar">
    <div class="bt-tb-left">
      <span class="ft-brand-pill"><span>QUANT</span></span>
      <aui-highlight class="aui-hl-card-surface" mode="parent" container-class-name="bt-mode-strip"
                     role="tablist" :model-value="mode" :controlled-items="true" :click="false">
        <aui-highlight-item value="workbench" as-child>
          <button type="button" :class="['bt-mt', mode === 'workbench' ? 'on' : '']" @click="mode = 'workbench'">回测工作台</button>
        </aui-highlight-item>
        <aui-highlight-item value="factors" as-child>
          <button type="button" :class="['bt-mt', mode === 'factors' ? 'on' : '']" @click="mode = 'factors'">因子投研台 ({{ factors.length }})</button>
        </aui-highlight-item>
        <aui-highlight-item value="data" as-child>
          <button type="button" :class="['bt-mt', mode === 'data' ? 'on' : '']" @click="mode = 'data'">数据仓 &amp; 引擎</button>
        </aui-highlight-item>
      </aui-highlight>
      <template v-if="mode === 'workbench'">
        <span class="ft-sep"></span>
        <button type="button" :class="['bt-tbtn', showRunsRail ? 'on' : '']" @click="showRunsRail = !showRunsRail">实验栏</button>
        <button type="button" :class="['bt-tbtn', showRightRail ? 'on' : '']" @click="showRightRail = !showRightRail">配置/指标</button>
        <button type="button" :class="['bt-tbtn', showBottomDock ? 'on' : '']" @click="showBottomDock = !showBottomDock">底部明细</button>
      </template>
    </div>

    <div class="bt-tb-right ft-mono">
      <a-button v-if="mode === 'workbench'" type="primary" size="small"
                :loading="isBtRunning"
                @click="runBacktest">▶ 运行回测</a-button>
      <button type="button" class="bt-tbtn" :disabled="envLoading" @click="loadStatus(true); loadJobs()">刷新</button>
    </div>
  </div>

  <!-- ==================== 模式 1: 回测工作台 ==================== -->
  <div v-if="mode === 'workbench'" class="bt-ide">
    <!-- 左栏：实验历史 Rail -->
    <aside v-if="showRunsRail" class="bt-rail-left">
      <div class="bt-rail-head">
        <span class="bt-rh-title">实验记录 ({{ btJobs.length }})</span>
        <aui-highlight class="aui-hl-pill-surface" mode="parent" container-class-name="bt-seg"
                       :model-value="runsFilter" :controlled-items="true" :click="false">
          <aui-highlight-item v-for="rf in [{k:'all',l:'全'},{k:'vectorbt',l:'VBT'},{k:'qlib',l:'QL'}]" :key="rf.k" :value="rf.k" as-child>
            <button type="button"
                    :class="['bt-seg-btn', runsFilter === rf.k ? 'on' : '']" @click="runsFilter = rf.k">{{ rf.l }}</button>
          </aui-highlight-item>
        </aui-highlight>
      </div>
      <div v-if="compareIds.length" class="bt-cmp-banner">
        <span>对比已选 <b>{{ compareIds.length }}</b> 条</span>
        <button type="button" class="bt-link-btn" @click="compareIds = []">清空</button>
      </div>
      <div class="bt-runs-scroll">
        <div v-if="!btJobs.length" class="bt-rail-empty">暂无实验记录，右侧点击运行</div>
        <div v-for="j in btJobs" :key="j.id"
             :class="['bt-run-row', activeBtJob && activeBtJob.id === j.id ? 'on' : '']"
             @click="openJobDetail(j.id, false)">
          <div class="bt-run-top">
            <input v-if="j.status === 'done'" type="checkbox" class="bt-chk"
                   :checked="compareIds.includes(j.id)" @click.stop="toggleCompare(j)" title="勾选叠加对比净值" />
            <span class="bt-run-title" :title="j.title">{{ j.title }}</span>
            <button type="button" class="bt-run-del" title="删除" @click.stop="deleteJob(j.id)">×</button>
          </div>
          <div class="bt-run-bot ft-mono">
            <span class="bt-eng-mini">{{ (j.engine || '').toUpperCase().slice(0, 4) }}</span>
            <template v-if="j.status === 'done' && j.summary && j.summary.total_return != null">
              <span :class="clsVal(j.summary.total_return)">{{ fmtSigned(j.summary.total_return, '%', 1) }}</span>
              <span class="hint">SR {{ j.summary.sharpe }}</span>
              <span class="bt-down">{{ j.summary.max_drawdown }}%</span>
            </template>
            <span v-else-if="j.status === 'failed'" class="bt-down">失败</span>
            <span v-else class="bt-up">{{ j.progress }}%</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- 中央主工作区 -->
    <section class="bt-center">
      <!-- 进度/错误条 -->
      <div v-if="(activeBtJob && (activeBtJob.status === 'pending' || activeBtJob.status === 'running')) || (activeSweepJob && (activeSweepJob.status === 'pending' || activeSweepJob.status === 'running'))"
           class="bt-run-bar">
        <span class="ft-sync-dot"></span>
        <span>{{ (activeBtJob && activeBtJob.status !== 'done' ? activeBtJob.stage : activeSweepJob.stage) || '正在计算...' }}</span>
        <a-progress :percent="(activeBtJob && activeBtJob.status !== 'done' ? activeBtJob.progress : activeSweepJob.progress)" size="small" :show-info="false" style="width:150px;margin:0 6px" />
        <span class="ft-mono">{{ (activeBtJob && activeBtJob.status !== 'done' ? activeBtJob.progress : activeSweepJob.progress) }}%</span>
      </div>
      <div v-else-if="activeBtJob && activeBtJob.status === 'failed'" class="bt-run-bar err">
        <span>回测失败：{{ activeBtJob.error }}</span>
      </div>

      <!-- 聚宽风格：顶部外露报告标题与回测起止时间 + 自适应不溢出 Tearsheet Ribbon -->
      <div v-if="btResult" class="bt-rep-banner">
        <div class="bt-rb-top">
          <strong class="bt-rb-name" :title="btResult.meta.strategy_label">{{ btResult.meta.strategy_label || activeBtJob.title }}</strong>
          <span class="bt-rb-dates ft-mono">
            回测区间: <b>{{ btResult.series.dates[0] }}</b> ~ <b>{{ btResult.series.dates[btResult.series.dates.length - 1] }}</b> ({{ btResult.series.dates.length }} 交易日) · 引擎: {{ btResult.engine }}
          </span>
        </div>
        <div class="bt-ribbon ft-mono">
          <div class="bt-rb-cell"><span>累计收益</span><strong :class="clsVal(btResult.kpis.total_return)"><aui-metric-number :value="btResult.kpis.total_return" :decimals="2" signed suffix="%" :fallback="fmtSigned(btResult.kpis.total_return)" /></strong></div>
          <div class="bt-rb-cell"><span>策略年化</span><strong :class="clsVal(btResult.kpis.annual_return)"><aui-metric-number :value="btResult.kpis.annual_return" :decimals="2" signed suffix="%" :fallback="fmtSigned(btResult.kpis.annual_return)" /></strong></div>
          <div class="bt-rb-cell"><span>基准收益</span><strong><aui-metric-number :value="btResult.kpis.benchmark_return" :decimals="2" signed suffix="%" :fallback="fmtSigned(btResult.kpis.benchmark_return)" /></strong></div>
          <div class="bt-rb-cell"><span>超额收益</span><strong :class="clsVal(btResult.kpis.excess_return)"><aui-metric-number :value="btResult.kpis.excess_return" :decimals="2" signed suffix="%" :fallback="fmtSigned(btResult.kpis.excess_return)" /></strong></div>
          <div class="bt-rb-cell"><span>夏普 Sharpe</span><strong :class="btResult.kpis.sharpe >= 1 ? 'bt-up' : ''"><aui-metric-number :value="btResult.kpis.sharpe" :decimals="2" /></strong></div>
          <div class="bt-rb-cell"><span>最大回撤</span><strong class="bt-down"><aui-metric-number :value="btResult.kpis.max_drawdown" :decimals="2" suffix="%" /></strong></div>
          <div class="bt-rb-cell"><span>胜率 / 盈亏比</span><strong><aui-metric-number :value="btResult.kpis.win_rate" :decimals="1" suffix="%" /> / <aui-metric-number :value="btResult.kpis.profit_factor" :decimals="2" /></strong></div>
          <div class="bt-rb-cell">
            <span>{{ btResult.meta.oos_rank_ic != null ? '样本外 IC' : '交易笔数' }}</span>
            <strong>
              <aui-metric-number v-if="btResult.meta.oos_rank_ic != null" :value="btResult.meta.oos_rank_ic" :decimals="4" signed />
              <aui-metric-number v-else :value="btResult.kpis.total_trades" :decimals="0" suffix=" 笔" />
            </strong>
          </div>
        </div>
      </div>

      <!-- 主图画布 -->
      <div class="bt-canvas-panel">
        <div class="bt-panel-bar">
          <aui-highlight class="aui-hl-card-surface" mode="parent" container-class-name="bt-view-tabs"
                         :model-value="mainView" :controlled-items="true" :click="false">
            <aui-highlight-item value="equity" as-child>
              <button type="button" :class="['bt-vtab', mainView === 'equity' ? 'on' : '']" @click="mainView = 'equity'">净值 &amp; 回撤联动</button>
            </aui-highlight-item>
            <aui-highlight-item value="kline" as-child>
              <button type="button" :class="['bt-vtab', mainView === 'kline' ? 'on' : '']"
                      :disabled="!(btResult && btResult.kline_replay)"
                      @click="mainView = 'kline'">K 线买卖点复盘</button>
            </aui-highlight-item>
            <aui-highlight-item value="risk" as-child>
              <button type="button" :class="['bt-vtab', mainView === 'risk' ? 'on' : '']" @click="mainView = 'risk'">风险归因 &amp; 分布</button>
            </aui-highlight-item>
            <aui-highlight-item value="sweep" as-child>
              <button type="button" :class="['bt-vtab', mainView === 'sweep' ? 'on' : '']" @click="mainView = 'sweep'">参数敏感性热力图</button>
            </aui-highlight-item>
          </aui-highlight>
          <div class="bt-view-tools">
            <template v-if="mainView === 'equity' && btResult">
              <aui-highlight class="aui-hl-pill-surface" mode="parent" container-class-name="bt-seg"
                             :model-value="equityRange" :controlled-items="true" :click="false">
                <aui-highlight-item v-for="rk in ['1M','3M','6M','1Y','ALL']" :key="rk" :value="rk" as-child>
                  <button type="button"
                          :class="['bt-seg-btn', equityRange === rk ? 'on' : '']" @click="equityRange = rk">{{ rk }}</button>
                </aui-highlight-item>
              </aui-highlight>
              <button type="button" :class="['bt-tbtn', equityLogScale ? 'on' : '']" @click="equityLogScale = !equityLogScale">对数</button>
            </template>
            <template v-else-if="mainView === 'sweep'">
              <aui-highlight class="aui-hl-pill-surface" mode="parent" container-class-name="bt-seg"
                             :model-value="sweepMetric" :controlled-items="true" :click="false">
                <aui-highlight-item value="sharpe" as-child>
                  <button type="button" :class="['bt-seg-btn', sweepMetric === 'sharpe' ? 'on' : '']" @click="sweepMetric = 'sharpe'">夏普</button>
                </aui-highlight-item>
                <aui-highlight-item value="return" as-child>
                  <button type="button" :class="['bt-seg-btn', sweepMetric === 'return' ? 'on' : '']" @click="sweepMetric = 'return'">年化%</button>
                </aui-highlight-item>
                <aui-highlight-item value="maxdd" as-child>
                  <button type="button" :class="['bt-seg-btn', sweepMetric === 'maxdd' ? 'on' : '']" @click="sweepMetric = 'maxdd'">回撤%</button>
                </aui-highlight-item>
              </aui-highlight>
              <button type="button" class="bt-tbtn on" @click="runParamSweep">扫描当前策略</button>
            </template>
            <button v-if="btResult" type="button" class="bt-tbtn" @click="askAiReviewBacktest">AI 诊断</button>
          </div>
        </div>

        <div class="bt-canvas-body">
          <div v-if="!btResult && mainView !== 'sweep'" class="bt-empty-box">
            <div class="bt-empty-h">量化回测实验室</div>
            <div class="hint">从右侧选策略预设、指定回测起止时间，一键运行 VectorBT 或 Qlib/LightGBM 回测。</div>
          </div>

          <quant-stats-synced-chart
            v-else-if="mainView === 'equity' && btResult"
            :result="btResult" :compare-runs="compareRuns" :dark="dark"
            :log-scale="equityLogScale" :range-key="equityRange"
          />

          <trade-kline-replay
            v-else-if="mainView === 'kline' && btResult && btResult.kline_replay"
            :replay="btResult.kline_replay" :dark="dark" :focus-trade="focusedTrade"
          />

          <div v-else-if="mainView === 'risk' && btResult" class="bt-risk-scroll">
            <div class="bt-risk-grid">
              <div class="bt-subpanel">
                <div class="bt-subhead"><span>月度收益矩阵 (%)</span></div>
                <div class="bt-subbody bt-scroll">
                  <table class="bt-tbl bt-mheat">
                    <thead><tr><th>年</th><th v-for="m in 12" :key="m">{{ m }}月</th><th>全年</th></tr></thead>
                    <tbody>
                      <tr v-for="row in (btResult.monthly_returns || [])" :key="row.year">
                        <td class="ft-mono"><b>{{ row.year }}</b></td>
                        <td v-for="(v, i) in row.months" :key="i" class="ft-mono"
                            :style="v == null ? '' : { background: v >= 0 ? ('rgba(16,185,129,' + Math.min(0.45, Math.abs(v)/16 + 0.08) + ')') : ('rgba(239,68,68,' + Math.min(0.45, Math.abs(v)/16 + 0.08) + ')') }">
                          {{ v == null ? '-' : v.toFixed(1) }}
                        </td>
                        <td class="ft-mono" :class="clsVal(row.ytd)"><b>{{ fmtSigned(row.ytd, '%', 1) }}</b></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="bt-subpanel">
                <div class="bt-subhead"><span>Top 5 最差回撤期</span></div>
                <div class="bt-subbody bt-scroll">
                  <table class="bt-tbl">
                    <thead><tr><th>#</th><th>起跌日</th><th>谷底日</th><th>修复日</th><th>深度</th><th>历时</th></tr></thead>
                    <tbody>
                      <tr v-for="wd in (btResult.worst_drawdowns || [])" :key="wd.rank">
                        <td class="ft-mono">{{ wd.rank }}</td>
                        <td class="ft-mono">{{ wd.start }}</td>
                        <td class="ft-mono">{{ wd.valley }}</td>
                        <td class="ft-mono">{{ wd.recovery }}</td>
                        <td class="ft-mono bt-down"><b>{{ wd.depth_pct }}%</b></td>
                        <td class="ft-mono">{{ wd.duration_days }}天</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="bt-subpanel">
                <div class="bt-subhead"><span>60日滚动夏普 &amp; Beta</span></div>
                <div class="bt-subbody"><o2-echarts :option="rollingChartOpt" :theme="dark ? 'dark' : 'light'" /></div>
              </div>

              <div class="bt-subpanel">
                <div class="bt-subhead">
                  <span>日收益率分布</span>
                  <span class="ft-mono hint">VaR95 {{ btResult.kpis.var_95 }}% · CVaR95 {{ btResult.kpis.cvar_95 }}%</span>
                </div>
                <div class="bt-subbody"><o2-echarts :option="retHistOpt" :theme="dark ? 'dark' : 'light'" /></div>
              </div>
            </div>
          </div>

          <div v-else-if="mainView === 'sweep'" class="bt-sweep-box">
            <div v-if="!sweepResult" class="bt-empty-box">
              <div class="bt-empty-h">VectorBT 2D 参数敏感性热力扫描</div>
              <div class="hint" style="margin-bottom:10px">网格扫描当前策略核心双参数，识别稳健参数高原，点击格子直接回填。</div>
              <a-button type="primary" size="small" @click="runParamSweep">立即扫描当前策略</a-button>
            </div>
            <template v-else>
              <div class="bt-sweep-info ft-mono">
                <span>标的: <b>{{ sweepResult.target }}</b></span>
                <span v-if="sweepResult.best">
                  最优: <b class="bt-up">{{ sweepResult.x_label }}={{ sweepResult.best.x }}, {{ sweepResult.y_label }}={{ sweepResult.best.y }}</b>
                  (夏普 {{ sweepResult.best.sharpe }} · 年化 {{ fmtSigned(sweepResult.best.annual_return) }})
                </span>
              </div>
              <div style="flex:1;min-height:0">
                <o2-echarts :option="sweepHeatmapOpt" :theme="dark ? 'dark' : 'light'" @chart-click="applySweepCell" />
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 底部 Dock：含聚宽同款「交易详情 / 每日持仓与收益 / 最新持仓 / 特征重要度 / 运行日志 / 实验对比」（无结果时同样常驻可开关） -->
      <div v-if="showBottomDock" class="bt-dock" :style="{ height: dockHeight + 'px' }">
        <div class="bt-dock-handle" title="上下拖动调整高度" @pointerdown="startDockResize"></div>
        <div class="bt-panel-bar">
          <div class="bt-view-tabs">
            <button type="button" :class="['bt-vtab', dockTab === 'trades' ? 'on' : '']" @click="dockTab = 'trades'">交易详情 ({{ (btResult && btResult.trades || []).length }})</button>
            <button type="button" :class="['bt-vtab', dockTab === 'positions' ? 'on' : '']" @click="dockTab = 'positions'">每日持仓 &amp; 收益 ({{ (btResult && btResult.daily_positions || []).length }})</button>
            <button v-if="btResult && btResult.latest_holdings && btResult.latest_holdings.length" type="button"
                    :class="['bt-vtab', dockTab === 'holdings' ? 'on' : '']" @click="dockTab = 'holdings'">最新持仓信号 ({{ btResult.latest_holdings.length }})</button>
            <button v-if="btResult && btResult.feature_importance && btResult.feature_importance.length" type="button"
                    :class="['bt-vtab', dockTab === 'importance' ? 'on' : '']" @click="dockTab = 'importance'">因子贡献度</button>
            <button type="button" :class="['bt-vtab', dockTab === 'logs' ? 'on' : '']" @click="dockTab = 'logs'">运行日志 ({{ (btResult && btResult.run_logs || []).length }})</button>
            <button v-if="btResult && compareRuns.length" type="button" :class="['bt-vtab', dockTab === 'compare' ? 'on' : '']" @click="dockTab = 'compare'">实验对比 ({{ compareRuns.length + 1 }})</button>
          </div>
          <div v-if="btResult && dockTab === 'trades'" class="bt-view-tools">
            <span v-if="btResult.kline_replay" class="hint" style="font-size:11px">点击行定位 K 线</span>
            <div class="bt-seg">
              <button type="button" :class="['bt-seg-btn', tradeFilter === 'all' ? 'on' : '']" @click="tradeFilter = 'all'">全</button>
              <button type="button" :class="['bt-seg-btn', tradeFilter === 'win' ? 'on' : '']" @click="tradeFilter = 'win'">盈</button>
              <button type="button" :class="['bt-seg-btn', tradeFilter === 'loss' ? 'on' : '']" @click="tradeFilter = 'loss'">亏</button>
            </div>
          </div>
        </div>

        <div class="bt-dock-body">
          <div v-if="!btResult" class="bt-rail-empty" style="padding:28px 16px">
            暂无回测明细 — 点击右上角或右下角「▶ 运行回测」后，此处将展示逐笔交易详情、每日持仓与收益、最新持仓信号与引擎运行日志。
          </div>
          <table v-else-if="dockTab === 'trades'" class="bt-tbl">
            <thead><tr><th>标的</th><th>买入日</th><th>卖出日</th><th>买价</th><th>卖价</th><th>数量</th><th>盈亏</th><th>收益率</th><th>费用</th><th>持仓</th></tr></thead>
            <tbody>
              <tr v-if="!filteredTrades.length"><td colspan="10" style="text-align:center;color:var(--muted-foreground);padding:16px">无匹配成交记录</td></tr>
              <tr v-for="(tr, i) in filteredTrades" :key="i" :class="{ clickable: !!(btResult && btResult.kline_replay) }" @click="onClickTradeRow(tr)">
                <td><b>{{ tr.name }}</b> <span class="hint ft-mono">{{ tr.symbol }}</span></td>
                <td class="ft-mono">{{ tr.entry_date }}</td><td class="ft-mono">{{ tr.exit_date }}</td>
                <td class="ft-mono">{{ tr.entry_price }}</td><td class="ft-mono">{{ tr.exit_price }}</td>
                <td class="ft-mono">{{ tr.size }}</td>
                <td class="ft-mono" :class="clsVal(tr.pnl)">{{ fmtSigned(tr.pnl, '', 1) }}</td>
                <td class="ft-mono" :class="clsVal(tr.return_pct)"><b>{{ fmtSigned(tr.return_pct) }}</b></td>
                <td class="ft-mono">{{ tr.fees }}</td><td class="ft-mono">{{ tr.holding_days }}d</td>
              </tr>
            </tbody>
          </table>

          <table v-else-if="dockTab === 'positions'" class="bt-tbl">
            <thead><tr><th>日期</th><th>总权益</th><th>持仓市值</th><th>可用现金</th><th>仓位占比</th><th>当日涨跌</th><th>当日持仓组合</th></tr></thead>
            <tbody>
              <tr v-if="!(btResult.daily_positions && btResult.daily_positions.length)">
                <td colspan="7" style="text-align:center;color:var(--muted-foreground);padding:16px">重新运行一次回测即可生成每日持仓与收益明细</td>
              </tr>
              <tr v-for="dp in (btResult.daily_positions || [])" :key="dp.date">
                <td class="ft-mono"><b>{{ dp.date }}</b></td>
                <td class="ft-mono">{{ Number(dp.equity).toLocaleString() }}</td>
                <td class="ft-mono">{{ Number(dp.pos_value).toLocaleString() }}</td>
                <td class="ft-mono">{{ Number(dp.cash).toLocaleString() }}</td>
                <td class="ft-mono">{{ dp.pos_pct }}%</td>
                <td class="ft-mono" :class="clsVal(dp.day_ret)"><b>{{ fmtSigned(dp.day_ret) }}</b></td>
                <td>{{ dp.summary }}</td>
              </tr>
            </tbody>
          </table>

          <table v-else-if="dockTab === 'holdings'" class="bt-tbl">
            <thead><tr><th>#</th><th>代码</th><th>名称</th><th>行业</th><th>最新价</th><th>打分</th><th>目标权重</th></tr></thead>
            <tbody>
              <tr v-for="(h, i) in (btResult.latest_holdings || [])" :key="h.symbol">
                <td class="ft-mono">{{ i + 1 }}</td><td class="ft-mono">{{ h.symbol }}</td><td><b>{{ h.name }}</b></td>
                <td>{{ h.industry || '-' }}</td><td class="ft-mono">{{ h.price != null ? h.price : '-' }}</td>
                <td class="ft-mono">{{ h.score != null ? h.score : '-' }}</td><td class="ft-mono">{{ h.weight != null ? (h.weight + '%') : '-' }}</td>
              </tr>
            </tbody>
          </table>

          <div v-else-if="dockTab === 'importance'" style="height:100%;width:100%">
            <o2-echarts :option="importanceChartOpt" :theme="dark ? 'dark' : 'light'" />
          </div>

          <div v-else-if="dockTab === 'logs'" class="bt-log-box ft-mono">
            <div v-if="!(btResult.run_logs && btResult.run_logs.length)" class="hint">重新运行一次回测即可查看引擎日志</div>
            <div v-for="(ln, idx) in (btResult.run_logs || [])" :key="idx" class="bt-log-line">{{ ln }}</div>
          </div>

          <table v-else-if="dockTab === 'compare'" class="bt-tbl">
            <thead><tr><th>实验</th><th>引擎</th><th>累计收益</th><th>年化</th><th>超额</th><th>夏普</th><th>索提诺</th><th>最大回撤</th><th>胜率</th></tr></thead>
            <tbody>
              <tr v-for="cj in [activeBtJob, ...compareRuns]" :key="cj.id">
                <td><b>{{ cj.title }}</b></td><td class="ft-mono">{{ cj.result.engine }}</td>
                <td class="ft-mono" :class="clsVal(cj.result.kpis.total_return)">{{ fmtSigned(cj.result.kpis.total_return) }}</td>
                <td class="ft-mono" :class="clsVal(cj.result.kpis.annual_return)">{{ fmtSigned(cj.result.kpis.annual_return) }}</td>
                <td class="ft-mono" :class="clsVal(cj.result.kpis.excess_return)">{{ fmtSigned(cj.result.kpis.excess_return) }}</td>
                <td class="ft-mono">{{ cj.result.kpis.sharpe }}</td><td class="ft-mono">{{ cj.result.kpis.sortino }}</td>
                <td class="ft-mono bt-down">{{ cj.result.kpis.max_drawdown }}%</td><td class="ft-mono">{{ cj.result.kpis.win_rate }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 右栏：策略配置 / 机构指标表（加宽至 324px，零溢出） -->
    <aside v-if="showRightRail" class="bt-rail-right">
      <div class="bt-rail-head">
        <div class="bt-seg" style="width:100%">
          <button type="button" :class="['bt-seg-btn', rightRailMode === 'config' ? 'on' : '']" style="flex:1" @click="rightRailMode = 'config'">策略配置</button>
          <button type="button" :class="['bt-seg-btn', rightRailMode === 'metrics' ? 'on' : '']" style="flex:1" @click="rightRailMode = 'metrics'">机构指标表</button>
        </div>
      </div>

      <div v-if="rightRailMode === 'config'" class="bt-cfg-scroll">
        <!-- 一键实战预设（含美股预设） -->
        <div class="bt-preset-grid">
          <button v-for="p in STRATEGY_PRESETS" :key="p.id" type="button" class="bt-preset-card" @click="applyPreset(p)">
            <div class="bt-pc-top"><span class="bt-pc-b">{{ p.badge }}</span><span class="bt-pc-t">{{ p.title }}</span></div>
            <div class="bt-pc-s">{{ p.sub }}</div>
          </button>
        </div>

        <!-- 聚宽风格：回测起止时间置顶外露（永不折叠） -->
        <div class="bt-time-card">
          <div class="bt-tc-head">
            <span>回测时间区间</span>
            <div class="bt-chip-row" style="margin:0">
              <button v-for="rk in ['6M','1Y','2Y','3Y','5Y','ALL']" :key="rk" type="button" class="bt-chip" @click="setQuickDateRange(rk)">{{ rk }}</button>
            </div>
          </div>
          <div class="bt-g2">
            <div class="bt-fg">
              <label>开始日期</label>
              <input v-model="btForm.start_date" type="date" class="bt-date-input ft-mono" />
            </div>
            <div class="bt-fg">
              <label>结束日期</label>
              <input v-model="btForm.end_date" type="date" class="bt-date-input ft-mono" />
            </div>
          </div>
        </div>

        <!-- Animate UI Reka Accordion (键盘导航 + 底部边缘防截断遮罩 + 轻模糊清焦) -->
        <aui-accordion type="multiple" v-model="openAccKeys" class="aui-acc-root">
        <!-- 1. 引擎 · 策略 · 标的 -->
        <aui-accordion-item value="strategy" class="bt-acc">
          <aui-accordion-header class="aui-acc-header">
            <aui-accordion-trigger class="aui-acc-trigger">
              <span>1. 引擎 · 策略 · 标的</span>
              <span class="bt-acc-chev" aria-hidden="true">▸</span>
            </aui-accordion-trigger>
          </aui-accordion-header>
          <aui-accordion-content>
            <div class="bt-acc-b">
            <aui-highlight class="aui-hl-pill-surface" mode="parent" container-class-name="bt-seg" style="width:100%"
                           :model-value="btForm.engine" :controlled-items="true" :click="false">
              <aui-highlight-item value="vectorbt" as-child>
                <button type="button" :class="['bt-seg-btn', btForm.engine === 'vectorbt' ? 'on' : '']" style="flex:1" @click="selectEngine('vectorbt')">VectorBT 择时/轮动</button>
              </aui-highlight-item>
              <aui-highlight-item value="qlib" as-child>
                <button type="button" :class="['bt-seg-btn', btForm.engine === 'qlib' ? 'on' : '']" style="flex:1" @click="selectEngine('qlib')">Qlib 多因子选股</button>
              </aui-highlight-item>
            </aui-highlight>

            <div v-if="btForm.engine === 'vectorbt'" class="bt-fg">
              <label>策略模板</label>
              <a-select :value="btForm.strategy" size="small" style="width:100%" @change="onStrategyChange">
                <a-select-option v-for="t in vectorbtTemplates" :key="t.id" :value="t.id">{{ t.name }}</a-select-option>
              </a-select>
            </div>

            <div v-if="isSingleAssetStrategy" class="bt-fg">
              <label>回测标的</label>
              <div style="display:flex;gap:4px">
                <a-input v-model:value="btForm.symbol" size="small" placeholder="510300.SH / NVDA / 0700.HK" />
                <symbol-picker mode="add" compact width="96px" :watchlist="watchlist" placeholder="搜标的" @pick="onPickSymbol" />
              </div>
              <div class="bt-chip-row">
                <button v-for="qs in QUICK_SYMBOLS" :key="qs.code" type="button"
                        :class="['bt-chip', btForm.symbol === qs.code ? 'on' : '']" @click="btForm.symbol = qs.code">{{ qs.label }}</button>
              </div>
            </div>
            <div v-else class="bt-fg">
              <label>股票 / 资产池</label>
              <a-select v-model:value="btForm.universe" size="small" style="width:100%">
                <a-select-option v-for="u in universeOptions" :key="u.value" :value="u.value">{{ u.label }}</a-select-option>
              </a-select>
            </div>

            <!-- 策略参数 -->
            <div v-if="btForm.strategy === 'dual_ma'" class="bt-g2">
              <div class="bt-fg"><label>快线周期</label><a-input-number v-model:value="btForm.sp.fast" :min="2" :max="120" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>慢线周期</label><a-input-number v-model:value="btForm.sp.slow" :min="5" :max="250" size="small" style="width:100%" /></div>
              <div class="bt-sw-row" style="grid-column:span 2"><span>使用指数加权 EMA</span><aui-switch v-model:checked="btForm.sp.ema" size="small" /></div>
            </div>
            <div v-else-if="btForm.strategy === 'macd_trend'" class="bt-g2">
              <div class="bt-fg"><label>快线</label><a-input-number v-model:value="btForm.sp.fast" :min="4" :max="50" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>慢线</label><a-input-number v-model:value="btForm.sp.slow" :min="10" :max="100" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>信号线</label><a-input-number v-model:value="btForm.sp.signal" :min="3" :max="30" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>趋势均线过滤</label><a-input-number v-model:value="btForm.sp.ma_filter" :min="0" :max="250" size="small" style="width:100%" /></div>
            </div>
            <div v-else-if="btForm.strategy === 'rsi_boll_reversion'" class="bt-g2">
              <div class="bt-fg"><label>RSI周期</label><a-input-number v-model:value="btForm.sp.rsi_window" :min="4" :max="30" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>布林周期</label><a-input-number v-model:value="btForm.sp.boll_window" :min="10" :max="60" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>超卖买线</label><a-input-number v-model:value="btForm.sp.rsi_low" :min="10" :max="50" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>超买卖线</label><a-input-number v-model:value="btForm.sp.rsi_high" :min="50" :max="90" size="small" style="width:100%" /></div>
            </div>
            <div v-else-if="btForm.strategy === 'turtle_breakout'" class="bt-g2">
              <div class="bt-fg"><label>突破窗(日)</label><a-input-number v-model:value="btForm.sp.entry_window" :min="5" :max="120" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>离场窗(日)</label><a-input-number v-model:value="btForm.sp.exit_window" :min="3" :max="60" size="small" style="width:100%" /></div>
            </div>
            <div v-else-if="btForm.strategy === 'etf_momentum_rotation'" class="bt-g2">
              <div class="bt-fg"><label>动量回看(日)</label><a-input-number v-model:value="btForm.sp.lookback" :min="5" :max="120" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>调仓周期(日)</label><a-input-number v-model:value="btForm.sp.rebalance_days" :min="1" :max="60" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>持仓 Top-K</label><a-input-number v-model:value="btForm.sp.top_k" :min="1" :max="15" size="small" style="width:100%" /></div>
              <div class="bt-sw-row" style="padding-top:16px"><span>空仓避险</span><aui-switch v-model:checked="btForm.sp.abs_momentum_filter" size="small" /></div>
              <div class="bt-sw-row" style="grid-column:span 2"><span>波动率风险调整 (动量/波动)</span><aui-switch v-model:checked="btForm.sp.risk_adjusted" size="small" /></div>
            </div>
            <div v-else-if="btForm.strategy === 'factor_timing'" class="bt-g2">
              <div class="bt-fg" style="grid-column:span 2">
                <label>信号因子</label>
                <a-select v-model:value="btForm.sp.factor_id" size="small" show-search style="width:100%">
                  <a-select-option v-for="f in factors" :key="f.id" :value="f.id">[{{ f.family }}] {{ f.name }}</a-select-option>
                </a-select>
              </div>
              <div class="bt-fg"><label>买入分位</label><a-input-number v-model:value="btForm.sp.buy_quantile" :min="0.05" :max="0.98" :step="0.05" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>卖出分位</label><a-input-number v-model:value="btForm.sp.sell_quantile" :min="0.02" :max="0.95" :step="0.05" size="small" style="width:100%" /></div>
            </div>
            <div v-else-if="btForm.strategy === 'custom_code'" class="bt-fg">
              <label>策略名称</label>
              <a-input v-model:value="btForm.sp.code_name" size="small" style="margin-bottom:4px" />
              <label>Python 策略代码 (输出 entries / exits / overlays)</label>
              <textarea v-model="btForm.sp.code" rows="9" class="bt-code-editor ft-mono"></textarea>
            </div>
            <div v-else-if="btForm.engine === 'qlib'" class="bt-g2">
              <div class="bt-fg" style="grid-column:span 2">
                <label>合成模型</label>
                <a-select v-model:value="btForm.sp.model_type" size="small" style="width:100%">
                  <a-select-option value="lightgbm">LightGBM 梯度提升树</a-select-option>
                  <a-select-option value="linear_ic">训练集 RankIC 加权合成</a-select-option>
                </a-select>
              </div>
              <div v-if="btForm.custom_factor_ids.length" class="bt-basket-pill" style="grid-column:span 2">
                <span>已载入篮子：<b>{{ btForm.custom_factor_ids.length }}</b> 因子</span>
                <button type="button" class="bt-link-btn" @click="btForm.custom_factor_ids = []">还原</button>
              </div>
              <div v-else class="bt-fg" style="grid-column:span 2">
                <label>因子特征集</label>
                <a-select v-model:value="btForm.sp.factor_set" size="small" style="width:100%">
                  <a-select-option v-for="fs in FACTOR_SETS" :key="fs.id" :value="fs.id">{{ fs.label }}</a-select-option>
                </a-select>
              </div>
              <div class="bt-fg"><label>持仓 TopK</label><a-input-number v-model:value="btForm.sp.topk" :min="3" :max="50" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>每次换出 DropN</label><a-input-number v-model:value="btForm.sp.n_drop" :min="1" :max="20" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>调仓间隔(日)</label><a-input-number v-model:value="btForm.sp.rebalance_days" :min="1" :max="30" size="small" style="width:100%" /></div>
              <div class="bt-fg"><label>预测周期(日)</label><a-input-number v-model:value="btForm.sp.label_horizon" :min="1" :max="20" size="small" style="width:100%" /></div>
            </div>
            </div>
          </aui-accordion-content>
        </aui-accordion-item>

        <!-- 2. 交易 -->
        <aui-accordion-item value="cost" class="bt-acc">
          <aui-accordion-header class="aui-acc-header">
            <aui-accordion-trigger class="aui-acc-trigger">
              <span>2. 交易</span>
              <span class="bt-acc-chev" aria-hidden="true">▸</span>
            </aui-accordion-trigger>
          </aui-accordion-header>
          <aui-accordion-content>
            <div class="bt-acc-b bt-g2">
            <div class="bt-fg"><label>初始资金</label><a-input-number v-model:value="btForm.init_cash" :min="10000" :step="100000" size="small" style="width:100%" /></div>
            <div class="bt-fg">
              <label>对比基准 (支持A/美/港)</label>
              <a-select v-model:value="btForm.benchmark" size="small" style="width:100%">
                <a-select-option value="000300.SH">沪深300</a-select-option>
                <a-select-option value="000905.SH">中证500</a-select-option>
                <a-select-option value="000001.SH">上证指数</a-select-option>
                <a-select-option value="^GSPC">标普500 (美股)</a-select-option>
                <a-select-option value="^NDX">纳斯达克100 (美股)</a-select-option>
                <a-select-option value="^HSI">恒生指数 (港股)</a-select-option>
                <a-select-option v-if="isSingleAssetStrategy" value="self">标的买入持有</a-select-option>
              </a-select>
            </div>
            <div class="bt-fg"><label>佣金 (万分之)</label><a-input-number v-model:value="btForm.fees_bps" :min="0" :max="50" :step="0.5" size="small" style="width:100%" /></div>
            <div class="bt-fg"><label>滑点 (万分之)</label><a-input-number v-model:value="btForm.slippage_bps" :min="0" :max="50" :step="1" size="small" style="width:100%" /></div>
            </div>
          </aui-accordion-content>
        </aui-accordion-item>

        <!-- 3. 止盈止损 -->
        <aui-accordion-item v-if="isSingleAssetStrategy" value="risk" class="bt-acc">
          <aui-accordion-header class="aui-acc-header">
            <aui-accordion-trigger class="aui-acc-trigger">
              <span>3. 止盈止损风控</span>
              <span class="bt-acc-chev" aria-hidden="true">▸</span>
            </aui-accordion-trigger>
          </aui-accordion-header>
          <aui-accordion-content>
            <div class="bt-acc-b bt-g2">
            <div class="bt-fg"><label>固定止损 % (0=关)</label><a-input-number v-model:value="btForm.stop_loss_pct" :min="0" :max="50" size="small" style="width:100%" /></div>
            <div class="bt-fg"><label>固定止盈 % (0=关)</label><a-input-number v-model:value="btForm.take_profit_pct" :min="0" :max="200" size="small" style="width:100%" /></div>
            </div>
          </aui-accordion-content>
        </aui-accordion-item>
        </aui-accordion>
      </div>

      <!-- 机构指标表 -->
      <div v-else class="bt-cfg-scroll">
        <div v-if="!btResult" class="bt-rail-empty">运行回测后展示完整指标明细</div>
        <template v-else>
          <div class="bt-metric-grp">
            <div class="bt-mg-h">收益表现 (Returns)</div>
            <div class="bt-mg-row"><span>期末总权益</span><b class="ft-mono">{{ Number(btResult.kpis.final_equity).toLocaleString() }}</b></div>
            <div class="bt-mg-row"><span>累计收益率</span><b class="ft-mono" :class="clsVal(btResult.kpis.total_return)">{{ fmtSigned(btResult.kpis.total_return) }}</b></div>
            <div class="bt-mg-row"><span>年化收益 CAGR</span><b class="ft-mono" :class="clsVal(btResult.kpis.annual_return)">{{ fmtSigned(btResult.kpis.annual_return) }}</b></div>
            <div class="bt-mg-row"><span>基准年化收益</span><b class="ft-mono">{{ fmtSigned(btResult.kpis.benchmark_annual) }}</b></div>
            <div class="bt-mg-row"><span>超额年化收益</span><b class="ft-mono" :class="clsVal(btResult.kpis.excess_annual)">{{ fmtSigned(btResult.kpis.excess_annual) }}</b></div>
            <div class="bt-mg-row"><span>CAPM Alpha / Beta</span><b class="ft-mono">{{ fmtSigned(btResult.kpis.alpha) }} / {{ btResult.kpis.beta }}</b></div>
          </div>
          <div class="bt-metric-grp">
            <div class="bt-mg-h">风险调整比率 (Ratios)</div>
            <div class="bt-mg-row"><span>夏普比率 Sharpe</span><b class="ft-mono">{{ btResult.kpis.sharpe }}</b></div>
            <div class="bt-mg-row"><span>索提诺 Sortino</span><b class="ft-mono">{{ btResult.kpis.sortino }}</b></div>
            <div class="bt-mg-row"><span>卡玛比率 Calmar</span><b class="ft-mono">{{ btResult.kpis.calmar }}</b></div>
            <div class="bt-mg-row"><span>信息比率 Info Ratio</span><b class="ft-mono">{{ btResult.kpis.info_ratio }}</b></div>
          </div>
          <div class="bt-metric-grp">
            <div class="bt-mg-h">波动与尾部风险 (Risk)</div>
            <div class="bt-mg-row"><span>最大回撤 MaxDD</span><b class="ft-mono bt-down">{{ btResult.kpis.max_drawdown }}%</b></div>
            <div class="bt-mg-row"><span>最长回撤历时</span><b class="ft-mono">{{ btResult.kpis.max_dd_days }} 交易日</b></div>
            <div class="bt-mg-row"><span>策略 / 基准波动率</span><b class="ft-mono">{{ btResult.kpis.volatility }}% / {{ btResult.kpis.benchmark_vol != null ? btResult.kpis.benchmark_vol + '%' : '-' }}</b></div>
            <div class="bt-mg-row"><span>日度 VaR / CVaR (95%)</span><b class="ft-mono bt-down">{{ btResult.kpis.var_95 }}% / {{ btResult.kpis.cvar_95 }}%</b></div>
            <div class="bt-mg-row"><span>偏度 / 峰度</span><b class="ft-mono">{{ btResult.kpis.skew }} / {{ btResult.kpis.kurtosis }}</b></div>
          </div>
          <div class="bt-metric-grp">
            <div class="bt-mg-h">交易统计 (Trades)</div>
            <div class="bt-mg-row"><span>总成交笔数</span><b class="ft-mono">{{ btResult.kpis.total_trades }}</b></div>
            <div class="bt-mg-row"><span>交易胜率 / 日胜率</span><b class="ft-mono">{{ btResult.kpis.win_rate }}% / {{ btResult.kpis.pos_days_pct }}%</b></div>
            <div class="bt-mg-row"><span>盈亏比 / 单笔期望</span><b class="ft-mono">{{ btResult.kpis.profit_factor }} / {{ fmtSigned(btResult.kpis.expectancy) }}</b></div>
            <div class="bt-mg-row"><span>最佳 / 最差单日</span><b class="ft-mono">{{ fmtSigned(btResult.kpis.best_day) }} / {{ fmtSigned(btResult.kpis.worst_day) }}</b></div>
            <div class="bt-mg-row"><span>平均持仓天数</span><b class="ft-mono">{{ btResult.kpis.avg_holding_days }} 天</b></div>
          </div>
        </template>
      </div>

      <!-- 永久吸底操作栏：不随配置滚动消失，切换指标表也可见 -->
      <div class="bt-cfg-foot">
        <a-button type="primary" block size="small"
                  :loading="isBtRunning"
                  @click="runBacktest">▶ 运行回测</a-button>
        <a-button v-if="btForm.engine === 'vectorbt' && !['factor_timing','custom_code'].includes(btForm.strategy)" block size="small" style="margin-top:6px"
                  :loading="isSweepRunning"
                  @click="runParamSweep">2D 参数敏感性热力扫描</a-button>
      </div>
    </aside>
  </div>

  <!-- ==================== 模式 2: 因子投研台 ==================== -->
  <div v-else-if="mode === 'factors'" class="bt-fac-scroll-page">
    <div class="bt-fac-toolbar">
      <div class="bt-seg">
        <button v-for="fam in ['ALL','Alpha158','Alpha101','Alpha191','TA-Lib','Fundamental']" :key="fam" type="button"
                :class="['bt-seg-btn', factorFamily === fam ? 'on' : '']" @click="factorFamily = fam">
          {{ fam === 'ALL' ? '全部' : fam }} ({{ familyCounts[fam] || 0 }})
        </button>
      </div>
      <a-input v-model:value="factorSearch" size="small" allow-clear placeholder="搜因子名/公式..." style="width:160px" />
      <a-select v-model:value="evalForm.universe" size="small" style="width:168px">
        <a-select-option v-for="u in universeOptions" :key="u.value" :value="u.value">{{ u.label }}</a-select-option>
      </a-select>
      <a-button type="primary" size="small"
                :loading="isBatchRunning"
                @click="runFactorBatch">批量体检当前家族</a-button>

      <span class="spacer"></span>

      <div class="bt-basket-bar">
        <span>因子篮子 <b class="ft-mono">{{ factorBasket.length }}</b></span>
        <button type="button" class="bt-tbtn" :disabled="factorBasket.length < 2" @click="openFactorCorrModal">相关性矩阵</button>
        <button type="button" class="bt-tbtn on" :disabled="!factorBasket.length" @click="sendBasketToQlib">送入 Qlib 回测</button>
        <button v-if="factorBasket.length" type="button" class="bt-link-btn" @click="factorBasket = []">清空</button>
      </div>
    </div>

    <div v-if="activeBatchJob && (activeBatchJob.status === 'pending' || activeBatchJob.status === 'running')" class="bt-run-bar">
      <span class="ft-sync-dot"></span>
      <span>{{ activeBatchJob.stage }}</span>
      <a-progress :percent="activeBatchJob.progress" size="small" :show-info="false" style="width:160px;margin:0 8px" />
      <span class="ft-mono">{{ activeBatchJob.progress }}%</span>
    </div>

    <!-- 因子排行榜 Matrix（固定充裕高度 + 顺滑滚动） -->
    <div class="bt-lb-box">
      <table class="bt-tbl">
        <thead>
          <tr>
            <th style="width:36px">入篮</th><th>因子名称</th><th>家族</th><th>类别</th><th>公式</th>
            <th class="sortable" @click="toggleFactorSort('ic_1d')">1D IC {{ factorSortKey==='ic_1d'?(factorSortDir==='desc'?'↓':'↑'):'' }}</th>
            <th class="sortable" @click="toggleFactorSort('ic_mean')">5D RankIC {{ factorSortKey==='ic_mean'?(factorSortDir==='desc'?'↓':'↑'):'' }}</th>
            <th class="sortable" @click="toggleFactorSort('abs_icir')">ICIR {{ factorSortKey==='abs_icir'?(factorSortDir==='desc'?'↓':'↑'):'' }}</th>
            <th class="sortable" @click="toggleFactorSort('ic_win_rate')">胜率 {{ factorSortKey==='ic_win_rate'?(factorSortDir==='desc'?'↓':'↑'):'' }}</th>
            <th class="sortable" @click="toggleFactorSort('ls_spread_bps')">多空(bps) {{ factorSortKey==='ls_spread_bps'?(factorSortDir==='desc'?'↓':'↑'):'' }}</th>
            <th class="sortable" @click="toggleFactorSort('turnover_pct')">换手 {{ factorSortKey==='turnover_pct'?(factorSortDir==='desc'?'↓':'↑'):'' }}</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sortedLeaderboardRows" :key="row.id"
              :class="{ on: !useCustomExpr && selectedFactorId === row.id }"
              @click="selectedFactorId = row.id; useCustomExpr = false">
            <td @click.stop><input type="checkbox" class="bt-chk" :checked="factorBasket.includes(row.id)" @change="toggleBasket(row.id)" /></td>
            <td><b>{{ row.name }}</b></td>
            <td><span class="bt-eng-mini">{{ row.family }}</span></td>
            <td class="hint">{{ row.category }}</td>
            <td class="ft-mono bt-formula-cell" :title="row.formula">{{ row.formula }}</td>
            <td class="ft-mono" :class="clsVal(row.ic_1d)">{{ row.ic_1d == null ? '-' : fmtSigned(row.ic_1d, '', 4) }}</td>
            <td class="ft-mono" :class="clsVal(row.ic_mean)"><b>{{ row.ic_mean == null ? '-' : fmtSigned(row.ic_mean, '', 4) }}</b></td>
            <td class="ft-mono" :class="row.icir != null && Math.abs(row.icir) >= 0.25 ? 'bt-up' : ''">{{ row.icir == null ? '-' : fmtSigned(row.icir, '', 3) }}</td>
            <td class="ft-mono">{{ row.ic_win_rate == null ? '-' : (row.ic_win_rate + '%') }}</td>
            <td class="ft-mono" :class="clsVal(row.ls_spread_bps)">{{ row.ls_spread_bps == null ? '-' : fmtSigned(row.ls_spread_bps, '', 1) }}</td>
            <td class="ft-mono">{{ row.turnover_pct == null ? '-' : (row.turnover_pct + '%') }}</td>
            <td @click.stop>
              <div style="display:flex;gap:4px">
                <button type="button" class="bt-tbtn on" @click="runFactorEval(row.id)">Alphalens</button>
                <button type="button" class="bt-tbtn" @click="sendSingleFactorToTiming(row.id)">择时</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 自定义公式条 -->
    <div class="bt-formula-bar">
      <span class="bt-eng-mini">自定义公式</span>
      <a-input v-model:value="customFactorExpr" size="small" style="flex:1;min-width:240px"
               placeholder="输入向量化因子公式，如 -ts_corr(open, volume, 10) 或 Ref($close,0)/Ref($close,20)-1"
               @focus="useCustomExpr = true" />
      <div class="bt-chip-row" style="margin:0">
        <button v-for="op in FORMULA_OPS" :key="op.lbl" type="button" class="bt-chip"
                @click="customFactorExpr = (customFactorExpr ? customFactorExpr + ' ' : '') + op.insert; useCustomExpr = true">{{ op.lbl }}</button>
        <button v-for="ex in FORMULA_EXAMPLES" :key="ex.label" type="button" class="bt-chip on"
                @click="customFactorExpr = ex.expr; useCustomExpr = true">{{ ex.label }}</button>
      </div>
      <a-checkbox v-model:checked="evalForm.flip_sign" style="font-size:12px">反向</a-checkbox>
      <a-button type="primary" size="small"
                :loading="isEvalRunning"
                @click="runFactorEval()">{{ useCustomExpr ? '体检自定义公式' : 'Alphalens 体检' }}</a-button>
    </div>

    <!-- Alphalens 2x2 深度面板（宽敞无挤压） -->
    <div class="bt-fac-charts">
      <div v-if="!evalResult" class="bt-empty-box">
        <div class="hint">点击上方任意因子的「Alphalens」按钮，展开完整多周期 IC 衰减、五分层净值与最新截面选股排行</div>
      </div>
      <div v-else class="bt-risk-grid bt-risk-grid-tall">
        <div class="bt-subpanel">
          <div class="bt-subhead">
            <span>五分层累计净值 · {{ evalResult.factor_name }}</span>
            <span class="ft-mono hint">{{ evalResult.symbol_count }}标的 · {{ evalResult.date_range[0] }}~{{ evalResult.date_range[1] }}</span>
          </div>
          <div class="bt-subbody"><o2-echarts :option="evalQuantileNavOpt" :theme="dark ? 'dark' : 'light'" /></div>
        </div>
        <div class="bt-subpanel">
          <div class="bt-subhead"><span>多周期 IC / ICIR 衰减对比 (1D / 5D / 10D / 20D)</span></div>
          <div class="bt-subbody"><o2-echarts :option="evalIcDecayOpt" :theme="dark ? 'dark' : 'light'" /></div>
        </div>
        <div class="bt-subpanel">
          <div class="bt-subhead"><span>RankIC 时序与累计 IC ({{ evalResult.primary_period }})</span></div>
          <div class="bt-subbody"><o2-echarts :option="evalIcSeriesOpt" :theme="dark ? 'dark' : 'light'" /></div>
        </div>
        <div class="bt-subpanel">
          <div class="bt-subhead"><span>最新截面 Top 10 / Bottom 10 ({{ evalResult.latest_date }})</span></div>
          <div class="bt-subbody bt-scroll" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px">
            <table class="bt-tbl">
              <thead><tr><th>Top</th><th>名称</th><th>值</th></tr></thead>
              <tbody>
                <tr v-for="(s, i) in (evalResult.top_stocks || []).slice(0, 10)" :key="s.symbol">
                  <td class="ft-mono">{{ i + 1 }}</td><td>{{ s.name }}</td><td class="ft-mono bt-up">{{ fmtSigned(s.factor_val, '', 2) }}</td>
                </tr>
              </tbody>
            </table>
            <table class="bt-tbl">
              <thead><tr><th>Bot</th><th>名称</th><th>值</th></tr></thead>
              <tbody>
                <tr v-for="(s, i) in (evalResult.bottom_stocks || []).slice(0, 10)" :key="s.symbol">
                  <td class="ft-mono">{{ i + 1 }}</td><td>{{ s.name }}</td><td class="ft-mono bt-down">{{ fmtSigned(s.factor_val, '', 2) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <aui-dialog v-model:open="corrModalOpen" title="因子篮子横截面秩相关性矩阵 (Spearman)" :footer="null" width="680px">
      <div v-if="corrLoading" style="text-align:center;padding:40px"><a-spin tip="正在计算相关性矩阵..." /></div>
      <template v-else-if="corrResult">
        <div v-if="corrResult.high_pairs && corrResult.high_pairs.length" class="bt-corr-warn">
          高共线性因子对 (|r| ≥ 0.70，建议去重)：
          <span v-for="hp in corrResult.high_pairs" :key="hp.a + hp.b" class="ft-mono" style="margin-right:8px">{{ hp.a }} × {{ hp.b }} (<b>{{ hp.corr }}</b>)</span>
        </div>
        <div style="height:360px"><o2-echarts :option="corrHeatmapOpt" :theme="dark ? 'dark' : 'light'" /></div>
      </template>
    </aui-dialog>
  </div>

  <!-- ==================== 模式 3: 数据同步 ==================== -->
  <div v-else class="bt-data-wrap">
    <div class="bt-data-top">
      <!-- 左：标的池与同步控制 -->
      <div class="bt-subpanel" style="width:410px;flex:none">
        <div class="bt-subhead">
          <span>数据同步</span>
        </div>
        <div class="bt-subbody bt-scroll" style="padding:10px;gap:10px">
          <div>
            <div class="bt-lbl-sm">1. 自由多选标的池（可任意组合，含美股与港股）</div>
            <div class="bt-pool-grid">
              <label v-for="opt in SYNC_POOL_OPTIONS" :key="opt.id"
                     :class="['bt-pool-item', syncForm.scopes.includes(opt.id) ? 'on' : '']">
                <input type="checkbox" class="bt-chk" :checked="syncForm.scopes.includes(opt.id)" @change="toggleSyncScope(opt.id)" />
                <div class="bt-pool-txt">
                  <div class="bt-pool-t">{{ opt.label }}</div>
                </div>
              </label>
            </div>
          </div>

          <div class="bt-g2">
            <div v-if="syncForm.scopes.includes('hs300')" class="bt-fg">
              <label>沪深300成分数 (10~300)</label>
              <a-input-number v-model:value="syncForm.hs300_limit" :min="10" :max="300" :step="10" size="small" style="width:100%" />
            </div>
            <div v-if="syncForm.scopes.includes('zz500')" class="bt-fg">
              <label>中证500成分数 (10~500)</label>
              <a-input-number v-model:value="syncForm.zz500_limit" :min="10" :max="500" :step="10" size="small" style="width:100%" />
            </div>
          </div>

          <div>
            <div class="bt-tc-head" style="margin-bottom:5px">
              <span class="bt-lbl-sm" style="margin:0">2. 同步时间跨度（自由输入年限或起止日期）</span>
              <div class="bt-seg">
                <button type="button" :class="['bt-seg-btn', syncForm.rangeMode === 'years' ? 'on' : '']" @click="syncForm.rangeMode = 'years'">按年限</button>
                <button type="button" :class="['bt-seg-btn', syncForm.rangeMode === 'custom_dates' ? 'on' : '']" @click="syncForm.rangeMode = 'custom_dates'">起止日期</button>
              </div>
            </div>
            <div v-if="syncForm.rangeMode === 'years'" style="display:flex;align-items:center;gap:8px">
              <a-input-number v-model:value="syncForm.years" :min="0.5" :max="20" :step="0.5" size="small" style="width:110px" />
              <span class="hint" style="font-size:11.5px">年 (支持 0.5 ~ 20 年自由输入)</span>
            </div>
            <div v-else class="bt-g2">
              <div class="bt-fg"><label>开始日期</label><input v-model="syncForm.start_date" type="date" class="bt-date-input ft-mono" /></div>
              <div class="bt-fg"><label>结束日期</label><input v-model="syncForm.end_date" type="date" class="bt-date-input ft-mono" /></div>
            </div>
          </div>

          <div class="bt-fg">
            <div class="bt-tc-head">
              <label style="margin:0">3. 追加自定义标的（A股/美股/港股/ETF/加密任意代码）</label>
              <button type="button" class="bt-link-btn" @click="importWatchlistToSync">+ 导入自选股</button>
            </div>
            <a-textarea v-model:value="syncForm.custom_symbols_text" :rows="2" size="small"
                        placeholder="逗号或空格分隔，如: TSLA, PLTR, SMH, 600519.SH, 0700.HK, BTC-USD" />
          </div>

          <div style="display:flex;gap:6px">
            <a-button type="primary" size="small" style="flex:1"
                      :loading="isSyncRunning"
                      @click="runSync()">开始同步</a-button>
            <a-button v-if="isSyncRunning" size="small" danger @click="stopSync">暂停</a-button>
          </div>

          <div v-if="!isSyncRunning && resumableSync" class="bt-resume-bar">
            <span class="ft-mono">
              断点 {{ resumableSync.done_symbols }}/{{ resumableSync.total_symbols }}<template v-if="resumableSync.failed_symbols"> · 失败 {{ resumableSync.failed_symbols }}</template>
            </span>
            <button type="button" class="bt-tbtn on" @click="runSync(resumableSync)">继续同步</button>
          </div>

          <div v-if="activeSyncJob" class="bt-sync-term ft-mono">
            <div>[{{ activeSyncJob.status.toUpperCase() }}] {{ activeSyncJob.progress }}% — {{ activeSyncJob.stage }}</div>
            <div v-if="activeSyncJob.error" class="bt-down">{{ activeSyncJob.error }}</div>
          </div>
        </div>
      </div>

      <!-- 右：已同步标的覆盖明细表（支持按美股/港股/A股/ETF/全球筛选） -->
      <div class="bt-subpanel" style="flex:1;min-width:0">
        <div class="bt-subhead">
          <span>本地数据仓标的明细 ({{ filteredStoreSymbols.length }} / {{ storeSymbols.length }})</span>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <div class="bt-seg">
              <button v-for="mk in [{k:'ALL',l:'全'},{k:'US_STOCK',l:'美股'},{k:'US_ETF',l:'美ETF'},{k:'CN_STOCK',l:'A股'},{k:'CN_ETF',l:'A-ETF'},{k:'HK_STOCK',l:'港股'},{k:'GLOBAL',l:'全球'}]"
                      :key="mk.k" type="button" :class="['bt-seg-btn', symbolMarketFilter === mk.k ? 'on' : '']"
                      @click="symbolMarketFilter = mk.k">{{ mk.l }}</button>
            </div>
            <a-input v-model:value="symbolSearch" size="small" allow-clear placeholder="搜代码/名称/行业" style="width:140px" />
            <button type="button" class="bt-tbtn" @click="loadStoreSymbols">刷新</button>
          </div>
        </div>
        <div class="bt-subbody bt-scroll">
          <table class="bt-tbl">
            <thead><tr><th>代码</th><th>名称</th><th>市场</th><th>行业</th><th>日线数</th><th>起止日期</th><th>基本面</th><th>涨跌停</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="s in filteredStoreSymbols" :key="s.symbol">
                <td class="ft-mono"><b>{{ s.symbol }}</b></td>
                <td>{{ s.name }}</td>
                <td><span class="bt-eng-mini">{{ s.market }}</span></td>
                <td class="hint">{{ s.industry }}</td>
                <td class="ft-mono">{{ s.rows }}</td>
                <td class="ft-mono">{{ s.min_date }} ~ {{ s.max_date }}</td>
                <td class="ft-mono" :class="s.has_basic ? 'bt-up' : 'hint'">{{ s.has_basic ? '✓' : '-' }}</td>
                <td class="ft-mono" :class="s.has_limit ? 'bt-up' : 'hint'">{{ s.has_limit ? '✓' : '-' }}</td>
                <td><button type="button" class="bt-tbtn on" @click="jumpBacktestSymbol(s.symbol, s.market)">去回测</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>
  `,
}
