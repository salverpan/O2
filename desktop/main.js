const { app, BrowserWindow, WebContentsView, ipcMain, session } = require('electron')
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')

const ROOT_DIR = path.resolve(__dirname, '..')
const DATA_ROOT = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'O2')
const PROFILE_DIR = path.join(DATA_ROOT, 'browser-profile')
const TABS_FILE = path.join(PROFILE_DIR, 'tabs-session.json')
const ERR_LOG = path.join(DATA_ROOT, 'electron-err.log')
const PARTITION = 'persist:o2-browser'
const DEFAULT_HOME = 'https://www.bing.com'
let ARIA_INJECT_SCRIPT = ''
try {
  ARIA_INJECT_SCRIPT = fs.readFileSync(path.join(__dirname, 'aria-inject.js'), 'utf8')
} catch (_e) {}

fs.mkdirSync(PROFILE_DIR, { recursive: true })
process.on('uncaughtException', (err) => {
  try { fs.appendFileSync(ERR_LOG, `[uncaught] ${err && err.stack || err}\n`) } catch (_e) {}
})
process.on('unhandledRejection', (err) => {
  try { fs.appendFileSync(ERR_LOG, `[rejection] ${err && err.stack || err}\n`) } catch (_e) {}
})
app.setPath('userData', PROFILE_DIR)

app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

function parseArg(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : ''
}

let appUrl = parseArg('--app-url=')
let pyProc = null
let mainWindow = null
let browserSession = null
let cleanUserAgent = ''
let ctlServer = null
let ctlPort = 0
const ctlToken = crypto.randomBytes(16).toString('hex')

const tabs = new Map()
const tabOrder = []
let activeTabId = ''
let nextTabSeq = 1
let aiBusyCount = 0
let saveTabsTimer = null

const downloads = []
const viewport = {
  visible: false,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  inline: false,
  animating: false,
}
let zoomSettleTimer = null
let zoomResyncTimer = null
let zoomResyncTimer2 = null

const BASE_INLINE_W = 1280
const BASE_INLINE_H = 720
const INLINE_PAGE_ZOOM = 0.5

const coPanel = {
  open: false,
  openSource: '', // 'user' | 'ai' | ''
  userDismissedAt: 0,
  sessionStartAt: 0,
  aiActive: false,
  aiActionLabel: '',
  waitingHuman: false,
  humanReason: '',
  humanSignal: '', // '' | 'manual_done' | 'user_closed'
  lastHumanInputAt: 0,
}
let autoCloseTimer = null

function buildCleanUA(raw) {
  return String(raw || '')
    .replace(/\s+o2-desktop\/[^\s]+/gi, '')
    .replace(/\s+O2\/[^\s]+/gi, '')
    .replace(/\s+Electron\/[^\s]+/gi, '')
    .trim()
}

function normalizeInputUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return DEFAULT_HOME
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return s
  if (/^(localhost|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(s)) {
    return 'http://' + s
  }
  if (!/\s/.test(s) && /\.[a-zA-Z]{2,}(?:[/:?#]|$)/.test(s)) {
    return 'https://' + s
  }
  return 'https://www.bing.com/search?q=' + encodeURIComponent(s)
}

function pushRing(arr, item, max = 200) {
  arr.push(item)
  if (arr.length > max) arr.splice(0, arr.length - max)
}

function serializeTab(t) {
  const wc = t.view.webContents
  const destroyed = wc.isDestroyed()
  return {
    id: t.id,
    title: t.title || (!destroyed && wc.getTitle()) || '新标签页',
    url: t.url || (!destroyed && wc.getURL()) || '',
    favicon: t.favicon || '',
    loading: !destroyed && wc.isLoading(),
    canGoBack: !destroyed && wc.navigationHistory.canGoBack(),
    canGoForward: !destroyed && wc.navigationHistory.canGoForward(),
    active: t.id === activeTabId,
  }
}

function getPublicState() {
  const list = tabOrder.map((id) => tabs.get(id)).filter(Boolean).map(serializeTab)
  return {
    ok: true,
    ready: true,
    activeTabId,
    tabs: list,
    downloads: downloads.slice(-30).reverse(),
    coPanel: {
      open: !!coPanel.open,
      openSource: coPanel.openSource || '',
      aiActive: !!(coPanel.aiActive || aiBusyCount > 0),
      aiActionLabel: coPanel.aiActionLabel || '',
      waitingHuman: !!coPanel.waitingHuman,
      humanReason: coPanel.humanReason || '',
      lastHumanInputAt: coPanel.lastHumanInputAt || 0,
    },
  }
}

function updateCoPanel(patch = {}) {
  if (!patch || typeof patch !== 'object') return getPublicState()
  clearTimeout(autoCloseTimer)
  if (patch.sessionStart) {
    coPanel.sessionStartAt = Date.now()
    coPanel.userDismissedAt = 0
  }
  if (typeof patch.open === 'boolean') {
    const prevOpen = coPanel.open
    coPanel.open = patch.open
    if (patch.open) {
      if (patch.openSource) coPanel.openSource = patch.openSource
      else if (!coPanel.openSource) coPanel.openSource = 'user'
      if (coPanel.openSource === 'user') {
        coPanel.userDismissedAt = 0
      }
    } else {
      if (patch.byUser) {
        coPanel.userDismissedAt = Date.now()
        if (coPanel.waitingHuman) {
          coPanel.humanSignal = 'user_closed'
          coPanel.waitingHuman = false
          coPanel.humanReason = ''
        }
      }
      if (!prevOpen || patch.byUser || patch.resetSource) {
        coPanel.openSource = ''
      }
    }
  } else if (patch.openSource) {
    coPanel.openSource = patch.openSource
  }
  if (typeof patch.aiActive === 'boolean') {
    coPanel.aiActive = patch.aiActive
    if (!patch.aiActive && !coPanel.waitingHuman) {
      coPanel.aiActionLabel = ''
    }
  }
  if (typeof patch.aiActionLabel === 'string') {
    coPanel.aiActionLabel = patch.aiActionLabel
  }
  if (typeof patch.waitingHuman === 'boolean') {
    coPanel.waitingHuman = patch.waitingHuman
    if (!patch.waitingHuman) {
      coPanel.humanReason = ''
    }
  }
  if (typeof patch.humanReason === 'string') {
    coPanel.humanReason = patch.humanReason
  }
  if (typeof patch.humanSignal === 'string' && patch.humanSignal) {
    coPanel.humanSignal = patch.humanSignal
    if (patch.humanSignal === 'manual_done') {
      coPanel.waitingHuman = false
      coPanel.humanReason = ''
    } else if (patch.humanSignal === 'user_closed') {
      coPanel.waitingHuman = false
      coPanel.humanReason = ''
      coPanel.open = false
      coPanel.userDismissedAt = Date.now()
    }
  }
  if (patch.sessionEnd) {
    coPanel.aiActive = false
    coPanel.aiActionLabel = ''
    const activeTab = tabs.get(activeTabId)
    if (activeTab) hideAiCursor(activeTab).catch(() => {})
    if (coPanel.open && coPanel.openSource === 'ai' && !coPanel.waitingHuman) {
      const delay = typeof patch.autoCloseDelayMs === 'number' ? patch.autoCloseDelayMs : 850
      if (delay <= 0) {
        coPanel.open = false
        coPanel.openSource = ''
      } else {
        autoCloseTimer = setTimeout(() => {
          if (coPanel.open && coPanel.openSource === 'ai' && !coPanel.waitingHuman && aiBusyCount === 0) {
            coPanel.open = false
            coPanel.openSource = ''
            broadcastState()
          }
        }, delay)
      }
    }
  }
  broadcastState()
  return getPublicState()
}

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('o2-browser:state', getPublicState())
  }
  scheduleSaveTabs()
}

function scheduleSaveTabs() {
  clearTimeout(saveTabsTimer)
  saveTabsTimer = setTimeout(() => {
    try {
      const urls = tabOrder
        .map((id) => tabs.get(id))
        .filter(Boolean)
        .map((t) => ({ id: t.id, url: t.url || '' }))
        .filter((x) => x.url && !x.url.startsWith('devtools:'))
      fs.writeFileSync(
        TABS_FILE,
        JSON.stringify({ activeTabId, tabs: urls }, null, 2),
        'utf-8'
      )
    } catch (_e) {}
  }, 400)
}

function loadSavedTabs() {
  try {
    if (!fs.existsSync(TABS_FILE)) return null
    const data = JSON.parse(fs.readFileSync(TABS_FILE, 'utf-8'))
    if (data && Array.isArray(data.tabs) && data.tabs.length) return data
  } catch (_e) {}
  return null
}

function currentStageSize() {
  const hasRect = viewport.width > 10 && viewport.height > 10
  if (hasRect) {
    return {
      w: Math.max(100, Math.round(viewport.width)),
      h: Math.max(100, Math.round(viewport.height)),
    }
  }
  const winBounds = mainWindow && !mainWindow.isDestroyed()
    ? mainWindow.getContentBounds()
    : { width: 1440, height: 860 }
  return {
    w: Math.max(800, (winBounds.width || 1440) - 256),
    h: Math.max(500, (winBounds.height || 860) - 82),
  }
}

function isTabShownOnScreen(t) {
  return !!(viewport.visible && viewport.width > 10 && viewport.height > 10 && t && t.id === activeTabId)
}

function readZoomFactor(wc) {
  try {
    const z = wc.getZoomFactor()
    return (typeof z === 'number' && z > 0) ? z : null
  } catch (_e) {
    return null
  }
}

function pageZoomFor() {
  return viewport.inline ? INLINE_PAGE_ZOOM : 1
}

function setTabZoom(t) {
  const wc = t && t.view && t.view.webContents
  if (!wc || wc.isDestroyed()) return false
  const next = pageZoomFor()
  const actual = readZoomFactor(wc)
  if (actual != null && Math.abs(actual - next) < 0.008) {
    t._appliedZoom = next
    return false
  }
  try { wc.setZoomFactor(next) } catch (_e) {}
  t._appliedZoom = next
  return true
}

function resyncTabZoom(t) {
  if (!t) return
  setTabZoom(t)
}

function scheduleInlineZoomResync() {
  const run = () => {
    if (!viewport.visible) return
    const t = tabs.get(activeTabId)
    if (!t) return
    setTabZoom(t)
  }
  clearTimeout(zoomResyncTimer)
  clearTimeout(zoomResyncTimer2)
  zoomResyncTimer = setTimeout(run, 32)
  zoomResyncTimer2 = setTimeout(run, 200)
}

async function ensureTabMetrics(t) {
  const wc = t.view.webContents
  if (wc.isDestroyed() || !wc.debugger.isAttached()) return
  if (isTabShownOnScreen(t)) {
    if (t._metricsEmulated) {
      t._metricsEmulated = false
      await wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => {})
      resyncTabZoom(t)
    }
    return
  }
  const w = viewport.inline ? BASE_INLINE_W : currentStageSize().w
  const h = viewport.inline ? BASE_INLINE_H : currentStageSize().h
  const key = `${w}x${h}`
  if (t._metricsEmulated !== key) {
    t._metricsEmulated = key
    await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: false,
    }).catch(() => {})
  }
}

function applyViewport() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { w, h } = currentStageSize()
  const hasRect = viewport.width > 10 && viewport.height > 10
  const show = !!(viewport.visible && hasRect)
  const onScreen = {
    x: hasRect ? Math.max(0, Math.round(viewport.x || 0)) : 256,
    y: hasRect ? Math.max(0, Math.round(viewport.y || 0)) : 82,
    width: w,
    height: h,
  }
  const offW = viewport.inline ? BASE_INLINE_W : w
  const offH = viewport.inline ? BASE_INLINE_H : h
  const offScreen = {
    x: -20000,
    y: 0,
    width: offW,
    height: offH,
  }
  clearTimeout(zoomSettleTimer)
  let resyncAfterShow = false
  for (const [id, t] of tabs) {
    const wc = t.view.webContents
    if (wc.isDestroyed()) continue
    t.view.setVisible(true)
    if (show && id === activeTabId) {
      const modeChanged = t._lastInlineMode !== !!viewport.inline
      const hadMetrics = !!t._metricsEmulated
      const prevZoom = t._appliedZoom
      t._lastInlineMode = !!viewport.inline
      const onKey = `1:${onScreen.x},${onScreen.y},${onScreen.width},${onScreen.height}`
      if (t._boundsKey !== onKey) {
        t._boundsKey = onKey
        t.view.setBounds(onScreen)
      }

      const finishZoom = () => {
        if (!wc.isDestroyed()) setTabZoom(t)
      }

      if (hadMetrics && wc.debugger.isAttached()) {
        t._metricsEmulated = false
        wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride')
          .catch(() => {})
          .finally(finishZoom)
      } else {
        finishZoom()
      }
      if (!viewport.animating && viewport.inline && (
        modeChanged || hadMetrics || prevZoom == null || prevZoom === 1
      )) {
        resyncAfterShow = true
      }
    } else {
      const offKey = `0:${offW},${offH}`
      if (t._boundsKey !== offKey) {
        t._boundsKey = offKey
        t.view.setBounds(offScreen)
      }
      t._lastInlineMode = !!viewport.inline
      setTabZoom(t)
    }
  }
  if (resyncAfterShow) {
    scheduleInlineZoomResync()
  }
}

async function settleLayout(t) {
  if (!t || !t.view || t.view.webContents.isDestroyed()) return
  applyViewport()
  const wc = t.view.webContents
  if (t._metricsEmulated && wc.debugger.isAttached()) {
    t._metricsEmulated = false
    await wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => {})
  }
  setTabZoom(t)
  try {
    await evalInTab(
      t,
      `new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
      })`
    )
  } catch (_e) {}
}

function configureBrowserSession() {
  browserSession = session.fromPartition(PARTITION)
  cleanUserAgent = buildCleanUA(browserSession.getUserAgent())
  app.userAgentFallback = cleanUserAgent
  browserSession.setUserAgent(cleanUserAgent)

  browserSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(true)
  })
  browserSession.setPermissionCheckHandler(() => true)
  if (typeof browserSession.setDevicePermissionHandler === 'function') {
    browserSession.setDevicePermissionHandler(() => true)
  }

  browserSession.on('will-download', (_event, item) => {
    const dlDir = app.getPath('downloads')
    const baseName = item.getFilename() || ('download-' + Date.now())
    let target = path.join(dlDir, baseName)
    if (fs.existsSync(target)) {
      const ext = path.extname(baseName)
      const stem = path.basename(baseName, ext)
      target = path.join(dlDir, `${stem}-${Date.now()}${ext}`)
    }
    item.setSavePath(target)
    const rec = {
      id: 'dl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      filename: path.basename(target),
      url: item.getURL(),
      savePath: target,
      state: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      ts: Date.now(),
    }
    pushRing(downloads, rec, 100)
    broadcastState()

    item.on('updated', (_ev, state) => {
      rec.state = state
      rec.receivedBytes = item.getReceivedBytes()
      rec.totalBytes = item.getTotalBytes()
    })
    item.once('done', (_ev, state) => {
      rec.state = state
      rec.receivedBytes = item.getReceivedBytes()
      rec.totalBytes = item.getTotalBytes()
      broadcastState()
    })
  })
}

const AI_CURSOR_INIT_SCRIPT = `
(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  } catch (_) {}

  if (!window.__o2HumanListenerBound) {
    window.__o2HumanListenerBound = true;
    let lastReport = 0;
    const report = (kind) => {
      const now = Date.now();
      if (kind === 'mousemove' && now - lastReport < 260) return;
      lastReport = now;
      try {
        if (typeof window.__o2ReportHumanActivity === 'function') {
          window.__o2ReportHumanActivity(JSON.stringify({ kind, ts: now, url: location.href }));
        }
      } catch (_) {}
    };
    window.addEventListener('mousedown', (e) => { if (e.isTrusted) report('mousedown'); }, { capture: true, passive: true });
    window.addEventListener('wheel', (e) => { if (e.isTrusted) report('wheel'); }, { capture: true, passive: true });
    window.addEventListener('keydown', (e) => { if (e.isTrusted) report('keydown'); }, { capture: true, passive: true });
    window.addEventListener('touchstart', (e) => { if (e.isTrusted) report('touchstart'); }, { capture: true, passive: true });
  }

  function ensureCursorOverlay() {
    if (window.__o2AiCursor && document.documentElement && document.documentElement.contains(window.__o2AiCursor.host)) {
      return window.__o2AiCursor;
    }
    if (!document.documentElement) return null;
    const old = document.getElementById('__o2_ai_cursor_host__');
    if (old) old.remove();

    const host = document.createElement('div');
    host.id = '__o2_ai_cursor_host__';
    host.setAttribute('data-o2-ignore', '1');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;pointer-events:none!important;z-index:2147483647!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = \`
      :host { all: initial; pointer-events: none !important; }
      .stage {
        position: fixed; inset: 0; pointer-events: none; overflow: hidden;
        font-family: "PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .tbox {
        position: fixed; left: 0; top: 0; width: 0; height: 0;
        border: 2px solid rgba(37, 99, 235, 0.88);
        background: rgba(59, 130, 246, 0.08);
        border-radius: 7px;
        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.16), 0 6px 18px rgba(29, 78, 216, 0.16);
        opacity: 0;
        transform: translate3d(-9999px, -9999px, 0);
        transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1),
                    width 0.24s cubic-bezier(0.22, 1, 0.36, 1),
                    height 0.24s cubic-bezier(0.22, 1, 0.36, 1),
                    opacity 0.2s ease;
        pointer-events: none;
      }
      .tbox.on { opacity: 1; }
      .tbox.typing {
        border-color: #2563eb;
        animation: box-pulse 1.1s ease-in-out infinite;
      }
      @keyframes box-pulse {
        0%, 100% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18); }
        50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.32); }
      }
      .trail-dot {
        position: fixed; left: 0; top: 0;
        width: 7px; height: 7px; margin-left: -3.5px; margin-top: -3.5px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(96, 165, 250, 0.95) 0%, rgba(37, 99, 235, 0.45) 70%, transparent 100%);
        pointer-events: none;
        animation: trail-fade 0.44s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
      @keyframes trail-fade {
        0% { opacity: 0.88; transform: translate3d(var(--tx), var(--ty), 0) scale(1); }
        100% { opacity: 0; transform: translate3d(var(--tx), var(--ty), 0) scale(0.2); }
      }
      .ripple {
        position: fixed; left: 0; top: 0;
        width: 34px; height: 34px; margin-left: -17px; margin-top: -17px;
        border-radius: 50%;
        border: 2.2px solid #2563eb;
        background: rgba(59, 130, 246, 0.22);
        pointer-events: none;
        animation: ripple-expand 0.56s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .ripple::after {
        content: ""; position: absolute; inset: -6px;
        border-radius: 50%; border: 1.5px solid rgba(96, 165, 250, 0.65);
        animation: ripple-outer 0.56s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes ripple-expand {
        0% { opacity: 0.95; transform: translate3d(var(--rx), var(--ry), 0) scale(0.25); }
        100% { opacity: 0; transform: translate3d(var(--rx), var(--ry), 0) scale(1.85); }
      }
      @keyframes ripple-outer {
        0% { opacity: 0.8; transform: scale(0.5); }
        100% { opacity: 0; transform: scale(1.35); }
      }
      .cursor {
        position: fixed; left: 0; top: 0;
        pointer-events: none;
        opacity: 0;
        transform: translate3d(200px, 160px, 0);
        transition: opacity 0.22s ease;
        will-change: transform, opacity;
      }
      .cursor.on { opacity: 1; }
      .cursor-inner {
        position: relative;
        transform-origin: 3px 3px;
        transition: transform 0.11s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .cursor.pressing .cursor-inner {
        transform: scale(0.84);
      }
      .cursor-svg {
        width: 24px; height: 24px; display: block;
        filter: drop-shadow(0 4px 10px rgba(29, 78, 216, 0.45)) drop-shadow(0 1px 2px rgba(15, 23, 42, 0.35));
      }
    \`;

    const stage = document.createElement('div');
    stage.className = 'stage';
    const tbox = document.createElement('div');
    tbox.className = 'tbox';
    const trails = document.createElement('div');
    const ripples = document.createElement('div');
    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    cursor.innerHTML = \`
      <div class="cursor-inner">
        <svg class="cursor-svg" viewBox="0 0 24 24" fill="none">
          <path d="M3.2 2.4L20.4 10.1C21.3 10.5 21.2 11.8 20.3 12.1L13.1 14.3L9.9 21.1C9.5 22.0 8.2 21.9 7.9 21.0L2.1 3.7C1.8 2.8 2.4 2.0 3.2 2.4Z"
                fill="#2563EB" stroke="#FFFFFF" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M4.8 4.9L17.4 10.6L12.1 12.2L9.5 17.7L4.8 4.9Z"
                fill="rgba(147, 197, 253, 0.32)"/>
        </svg>
      </div>
    \`;
    stage.appendChild(tbox);
    stage.appendChild(trails);
    stage.appendChild(ripples);
    stage.appendChild(cursor);
    shadow.appendChild(style);
    shadow.appendChild(stage);
    document.documentElement.appendChild(host);

    const ctrl = {
      host,
      x: Math.round((window.innerWidth || 1280) * 0.48),
      y: Math.round((window.innerHeight || 720) * 0.42),
      visible: false,
      raf: 0,
      hideTimer: 0,
      setPos(x, y) {
        this.x = x;
        this.y = y;
        cursor.style.transform = \`translate3d(\${Math.round(x)}px, \${Math.round(y)}px, 0)\`;
      },
      spawnTrail(_x, _y) {},
      spawnRipple(x, y) {
        const r = document.createElement('div');
        r.className = 'ripple';
        r.style.setProperty('--rx', Math.round(x) + 'px');
        r.style.setProperty('--ry', Math.round(y) + 'px');
        ripples.appendChild(r);
        setTimeout(() => r.remove(), 600);
      },
      setBox(rect, typing = false) {
        if (!rect || !(rect.w > 0 && rect.h > 0)) {
          tbox.classList.remove('on', 'typing');
          return;
        }
        const pad = 4;
        const bx = Math.round(rect.x - rect.w / 2 - pad);
        const by = Math.round(rect.y - rect.h / 2 - pad);
        tbox.style.width = Math.round(rect.w + pad * 2) + 'px';
        tbox.style.height = Math.round(rect.h + pad * 2) + 'px';
        tbox.style.transform = \`translate3d(\${bx}px, \${by}px, 0)\`;
        tbox.classList.add('on');
        tbox.classList.toggle('typing', !!typing);
      },
      moveTo(opts = {}) {
        clearTimeout(this.hideTimer);
        cancelAnimationFrame(this.raf);
        const tx = typeof opts.x === 'number' ? opts.x : this.x;
        const ty = typeof opts.y === 'number' ? opts.y : this.y;
        cursor.classList.add('on');
        this.setBox(opts.rect || null, opts.mode === 'fill');

        if (!this.visible) {
          this.visible = true;
          this.setPos(this.x, this.y);
        }
        const sx = this.x;
        const sy = this.y;
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.hypot(dx, dy);
        const dur = Math.min(340, Math.max(120, Number(opts.duration) || Math.round(130 + dist * 0.22)));
        if (dist < 4) {
          this.setPos(tx, ty);
          this.scheduleAutoHide(opts.holdMs || 4500);
          return Promise.resolve();
        }
        // Quadratic Bezier control point with subtle perpendicular arc
        const bend = Math.min(64, dist * 0.18) * (sx < tx ? 1 : -1);
        const cx = (sx + tx) / 2 - (dy / (dist || 1)) * bend * 0.55;
        const cy = (sy + ty) / 2 + (dx / (dist || 1)) * bend * 0.35 - Math.min(28, dist * 0.08);
        let lastTrail = 0;

        return new Promise((resolve) => {
          const t0 = performance.now();
          const step = (now) => {
            const p = Math.min(1, (now - t0) / dur);
            // cubic-Out easing
            const e = 1 - Math.pow(1 - p, 3);
            const inv = 1 - e;
            const nx = inv * inv * sx + 2 * inv * e * cx + e * e * tx;
            const ny = inv * inv * sy + 2 * inv * e * cy + e * e * ty;
            this.setPos(nx, ny);
            if (now - lastTrail > 34 && p < 0.94) {
              lastTrail = now;
              this.spawnTrail(nx, ny);
            }
            if (p < 1) {
              this.raf = requestAnimationFrame(step);
            } else {
              this.setPos(tx, ty);
              this.scheduleAutoHide(opts.holdMs || 4500);
              resolve();
            }
          };
          this.raf = requestAnimationFrame(step);
        });
      },
      async clickAt(opts = {}) {
        await this.moveTo(opts);
        cursor.classList.add('pressing');
        this.spawnRipple(this.x, this.y);
        await new Promise((r) => setTimeout(r, 95));
        cursor.classList.remove('pressing');
      },
      scheduleAutoHide(ms = 4500) {
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => this.hide(), ms);
      },
      hide() {
        clearTimeout(this.hideTimer);
        cancelAnimationFrame(this.raf);
        cursor.classList.remove('on', 'pressing');
        tbox.classList.remove('on', 'typing');
        this.visible = false;
      },
    };
    window.__o2AiCursor = ctrl;
    return ctrl;
  }

  window.__o2EnsureAiCursor = ensureCursorOverlay;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ensureCursorOverlay(), { once: true });
  } else {
    ensureCursorOverlay();
  }
})();
`

async function ensureDebugger(t) {
  const wc = t.view.webContents
  if (wc.isDestroyed()) return false
  if (!wc.debugger.isAttached()) {
    try {
      wc.debugger.attach('1.3')
    } catch (_e) {
      return wc.debugger.isAttached()
    }
  }
  if (!t._cdpInitPromise) {
    t._cdpInitPromise = (async () => {
      try {
        await wc.debugger.sendCommand('Page.enable')
        await wc.debugger.sendCommand('Runtime.enable')
        await wc.debugger.sendCommand('Runtime.addBinding', { name: '__o2ReportHumanActivity' }).catch(() => {})
        await wc.debugger.sendCommand('Network.enable', { maxPostDataSize: 65536 })
        if (cleanUserAgent) {
          await wc.debugger.sendCommand('Network.setUserAgentOverride', {
            userAgent: cleanUserAgent,
            platform: 'Win32',
          })
        }
        await wc.debugger.sendCommand('DOM.enable')
        await wc.debugger.sendCommand('Log.enable')
        if (ARIA_INJECT_SCRIPT) {
          await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
            source: ARIA_INJECT_SCRIPT,
          })
        }
        await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
          source: AI_CURSOR_INIT_SCRIPT,
        })
      } catch (_e) {}

    wc.debugger.on('message', (_event, method, params) => {
      if (method === 'Runtime.bindingCalled' && params && params.name === '__o2ReportHumanActivity') {
        const now = Date.now()
        if (now > (t._aiSyntheticUntil || 0)) {
          coPanel.lastHumanInputAt = now
          hideAiCursor(t).catch(() => {})
        }
        return
      }
      if (method === 'Runtime.consoleAPICalled') {
        const text = (params.args || [])
          .map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type || '')))
          .join(' ')
        pushRing(t.consoleLogs, {
          level: params.type || 'log',
          text: text.slice(0, 2000),
          ts: Date.now(),
        })
      } else if (method === 'Runtime.exceptionThrown') {
        const d = params.exceptionDetails || {}
        const desc = (d.exception && d.exception.description) || d.text || 'Exception'
        pushRing(t.consoleLogs, {
          level: 'error',
          text: String(desc).slice(0, 2000),
          url: d.url || '',
          line: d.lineNumber,
          ts: Date.now(),
        })
      } else if (method === 'Log.entryAdded') {
        const e = params.entry || {}
        pushRing(t.consoleLogs, {
          level: e.level || 'info',
          text: String(e.text || '').slice(0, 2000),
          url: e.url || '',
          ts: Date.now(),
        })
      } else if (method === 'Network.requestWillBeSent') {
        const req = params.request || {}
        const rec = {
          requestId: params.requestId,
          method: req.method || 'GET',
          url: req.url || '',
          type: params.type || 'Other',
          postData: req.postData ? String(req.postData).slice(0, 1000) : '',
          status: null,
          mimeType: '',
          errorText: '',
          ts: Date.now(),
        }
        t.networkById.set(params.requestId, rec)
        pushRing(t.networkLogs, rec, 300)
        if (t.networkById.size > 400) {
          const firstKey = t.networkById.keys().next().value
          t.networkById.delete(firstKey)
        }
      } else if (method === 'Network.responseReceived') {
        const res = params.response || {}
        const rec = t.networkById.get(params.requestId)
        if (rec) {
          rec.status = res.status
          rec.mimeType = res.mimeType || ''
        }
      } else if (method === 'Network.loadingFailed') {
        const rec = t.networkById.get(params.requestId)
        if (rec) {
          rec.errorText = params.errorText || 'failed'
        }
      } else if (method === 'Page.javascriptDialogOpening') {
        pushRing(t.dialogs, {
          type: params.type,
          message: params.message,
          url: params.url,
          ts: Date.now(),
        }, 50)
        if (aiBusyCount > 0) {
          wc.debugger.sendCommand('Page.handleJavaScriptDialog', {
            accept: true,
            promptText: params.defaultPrompt || '',
          }).catch(() => {})
        }
      }
    })
    })()
  }
  await t._cdpInitPromise
  return true
}

function createTab(initialUrl = DEFAULT_HOME, makeActive = true, skipAutoLoad = false) {
  if (!browserSession) configureBrowserSession()
  const id = 't' + (nextTabSeq++)
  const view = new WebContentsView({
    webPreferences: {
      session: browserSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      plugins: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })
  const wc = view.webContents
  wc.setUserAgent(cleanUserAgent)
  view.setVisible(false)
  try { wc.setVisualZoomLevelLimits(1, 1) } catch (_e) {}

  const tab = {
    id,
    view,
    title: '新标签页',
    url: '',
    favicon: '',
    consoleLogs: [],
    networkLogs: [],
    networkById: new Map(),
    dialogs: [],
    _cdpInitialized: false,
  }

  tabs.set(id, tab)
  tabOrder.push(id)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.contentView.addChildView(view)
  }

  wc.setWindowOpenHandler(({ url }) => {
    if (url && !url.startsWith('javascript:')) {
      createTab(url, true)
    }
    return { action: 'deny' }
  })

  wc.on('certificate-error', (event, _url, _error, _cert, callback) => {
    event.preventDefault()
    callback(true)
  })

  wc.on('will-prevent-unload', (event) => {
    if (aiBusyCount > 0) event.preventDefault()
  })

  const syncMeta = () => {
    if (wc.isDestroyed()) return
    tab.url = wc.getURL() || tab.url
    tab.title = wc.getTitle() || tab.title || tab.url || '新标签页'
    broadcastState()
  }

  const keepLayoutZoom = () => {
    if (wc.isDestroyed() || tab._zoomSyncing) return
    tab._zoomSyncing = true
    try {
      resyncTabZoom(tab, { force: true })
    } finally {
      setImmediate(() => { tab._zoomSyncing = false })
    }
  }
  wc.on('did-start-loading', syncMeta)
  wc.on('did-stop-loading', () => {
    syncMeta()
    keepLayoutZoom()
  })
  wc.on('did-navigate', () => {
    syncMeta()
    keepLayoutZoom()
  })
  wc.on('did-navigate-in-page', syncMeta)
  wc.on('dom-ready', keepLayoutZoom)
  wc.on('did-finish-load', keepLayoutZoom)
  wc.on('did-frame-finish-load', (_ev, isMain) => {
    if (isMain) keepLayoutZoom()
  })
  if (typeof wc.on === 'function') {
    wc.on('zoom-changed', () => {
      setImmediate(keepLayoutZoom)
    })
  }
  wc.on('page-title-updated', (_ev, title) => {
    tab.title = title || tab.title
    broadcastState()
  })
  wc.on('page-favicon-updated', (_ev, favicons) => {
    if (Array.isArray(favicons) && favicons[0]) {
      tab.favicon = favicons[0]
      broadcastState()
    }
  })

  wc.once('did-start-loading', () => {
    ensureDebugger(tab).catch(() => {})
  })

  if (makeActive || !activeTabId) {
    activeTabId = id
  }
  applyViewport()

  const targetUrl = normalizeInputUrl(initialUrl)
  tab.url = targetUrl
  if (!skipAutoLoad) {
    wc.loadURL(targetUrl).catch(() => {})
  }
  broadcastState()
  return tab
}

function resolveTab(tabId) {
  if (tabId) {
    if (tabs.has(tabId)) return tabs.get(tabId)
    const idx = Number(tabId)
    if (Number.isInteger(idx) && idx >= 1 && idx <= tabOrder.length) {
      return tabs.get(tabOrder[idx - 1])
    }
  }
  if (activeTabId && tabs.has(activeTabId)) return tabs.get(activeTabId)
  if (tabOrder.length) {
    activeTabId = tabOrder[0]
    return tabs.get(activeTabId)
  }
  return createTab(DEFAULT_HOME, true)
}

function switchTab(tabId) {
  const t = resolveTab(tabId)
  if (!t) return null
  activeTabId = t.id
  applyViewport()
  broadcastState()
  return t
}

function closeTab(tabId) {
  const targetId = tabId || activeTabId
  const t = tabs.get(targetId)
  if (!t) return getPublicState()
  const idx = tabOrder.indexOf(targetId)
  if (idx >= 0) tabOrder.splice(idx, 1)
  tabs.delete(targetId)
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.contentView.removeChildView(t.view)
    }
  } catch (_e) {}
  try {
    if (!t.view.webContents.isDestroyed()) {
      if (t.view.webContents.debugger.isAttached()) {
        t.view.webContents.debugger.detach()
      }
      t.view.webContents.close()
    }
  } catch (_e) {}

  if (!tabOrder.length) {
    createTab(DEFAULT_HOME, true)
  } else if (activeTabId === targetId) {
    const pick = tabOrder[Math.min(idx, tabOrder.length - 1)]
    activeTabId = pick
  }
  applyViewport()
  broadcastState()
  return getPublicState()
}

function waitForLoad(wc, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (wc.isDestroyed() || !wc.isLoading()) {
      resolve()
      return
    }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      wc.removeListener('did-stop-loading', finish)
      wc.removeListener('did-fail-load', finish)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    wc.once('did-stop-loading', finish)
    wc.once('did-fail-load', finish)
  })
}

async function evalInTab(t, expression, awaitPromise = true) {
  await ensureDebugger(t)
  const wc = t.view.webContents
  const res = await wc.debugger.sendCommand('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  })
  if (res && res.exceptionDetails) {
    const d = res.exceptionDetails
    const msg = (d.exception && d.exception.description) || d.text || 'JS evaluation failed'
    throw new Error(msg)
  }
  return res && res.result ? res.result.value : undefined
}

async function ensureAriaInTab(t) {
  if (!ARIA_INJECT_SCRIPT) return false
  try {
    const has = await evalInTab(t, 'typeof window.__o2EnsureAria === "function"', false)
    if (!has) await evalInTab(t, ARIA_INJECT_SCRIPT, false)
    return true
  } catch (_e) {
    return false
  }
}

async function captureSnapshot(t, maxChars = 8000, timeoutMs = 3500) {
  if (!t || !t.view || t.view.webContents.isDestroyed()) return null
  await settleLayout(t)
  await ensureAriaInTab(t)
  const limit = Math.min(20000, Math.max(500, Number(maxChars) || 8000))
  const snap = await Promise.race([
    evalInTab(t, `(${SNAPSHOT_SCRIPT})(${limit})`),
    new Promise((r) => setTimeout(() => r(null), timeoutMs)),
  ]).catch(() => null)
  if (snap && !snap.aria) {
    const fallback = await evalInTab(t, `(${SNAPSHOT_FALLBACK_SCRIPT})(${Math.min(4000, limit)})`).catch(() => null)
    if (fallback && Array.isArray(fallback.elements)) {
      snap.elements = fallback.elements
      snap.textExcerpt = fallback.textExcerpt
      if (!snap.humanVerification && fallback.humanVerification) {
        snap.humanVerification = fallback.humanVerification
      }
    }
  }
  return snap
}

const FIND_CONTEXT_LINES = 3

function indentOfAriaLine(line) {
  return String(line).length - String(line).trimStart().length
}

function ancestorAriaIndices(lines, indents, index) {
  const result = []
  let indent = indents[index]
  for (let i = index - 1; i >= 0 && indent > 0; i--) {
    if (!lines[i].trim()) continue
    if (indents[i] < indent) {
      result.push(i)
      indent = indents[i]
    }
  }
  return result.reverse()
}

function compileFindRegex(source) {
  const literal = /^\/(.*)\/([a-z]*)$/.exec(String(source || ''))
  const pattern = literal ? literal[1] : String(source || '')
  const flags = literal ? String(literal[2] || '').replace(/g/g, '') : ''
  return new RegExp(pattern, flags)
}

function snapshotSearchText(snap) {
  if (snap && snap.aria) return String(snap.aria)
  const els = (snap && snap.elements) || []
  return els.map((el) => {
    const tag = el.tag || 'el'
    const role = el.role ? `[role=${el.role}]` : ''
    return `  [${el.ref}] <${tag}${role}> ${el.text || ''}`
  }).join('\n')
}

function findInAriaSnapshot(yaml, opts = {}) {
  const text = opts.text != null ? String(opts.text) : ''
  const regexSrc = opts.regex != null ? String(opts.regex) : ''
  if (!text && !regexSrc) {
    return { ok: false, error: 'Provide either "text" or "regex" to search for.' }
  }
  if (text && regexSrc) {
    return { ok: false, error: 'Provide only one of "text" or "regex", not both.' }
  }
  let maxResults = opts.maxResults
  if (maxResults !== undefined && maxResults !== null && maxResults !== '') {
    maxResults = Number(maxResults)
    if (!Number.isInteger(maxResults) || maxResults <= 0) {
      return { ok: false, error: '"maxResults" must be a positive integer.' }
    }
  } else {
    maxResults = undefined
  }

  let query
  let lineMatches
  if (regexSrc) {
    let re
    try {
      re = compileFindRegex(regexSrc)
    } catch (_e) {
      return { ok: false, error: 'Invalid regular expression' }
    }
    query = String(re)
    lineMatches = (line) => {
      re.lastIndex = 0
      return re.test(line)
    }
  } else {
    query = `"${text}"`
    const needle = text.toLowerCase()
    lineMatches = (line) => String(line).toLowerCase().includes(needle)
  }

  const lines = String(yaml || '').split('\n')
  const indents = lines.map(indentOfAriaLine)
  const matchedLines = []
  for (let i = 0; i < lines.length; i++) {
    if (lineMatches(lines[i])) matchedLines.push(i)
  }

  if (!matchedLines.length) {
    return {
      ok: true,
      query,
      total: 0,
      shown: 0,
      header: `No matches found for ${query}.`,
      snippets: '',
    }
  }

  const totalMatches = matchedLines.length
  const matchesToRender = (maxResults !== undefined && maxResults < totalMatches)
    ? matchedLines.slice(0, maxResults)
    : matchedLines

  const windows = []
  for (const line of matchesToRender) {
    const start = Math.max(0, line - FIND_CONTEXT_LINES)
    const end = Math.min(lines.length - 1, line + FIND_CONTEXT_LINES)
    const last = windows[windows.length - 1]
    if (last && start <= last.end + 1) last.end = Math.max(last.end, end)
    else windows.push({ start, end })
  }

  const path = new Set()
  for (const match of matchesToRender) {
    path.add(match)
    for (const ancestor of ancestorAriaIndices(lines, indents, match)) path.add(ancestor)
  }

  const snippets = windows.map((window) => {
    const indices = ancestorAriaIndices(lines, indents, window.start)
    for (let i = window.start; i <= window.end; i++) indices.push(i)
    const out = []
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i]
      if (i > 0 && index > indices[i - 1] + 1 && !path.has(index) && !path.has(indices[i - 1])) {
        out.push(' '.repeat(indents[index]) + '...')
      }
      out.push(lines[index])
    }
    return out.join('\n')
  })

  const matchWord = totalMatches === 1 ? 'match' : 'matches'
  const header = matchesToRender.length < totalMatches
    ? `Found ${totalMatches} ${matchWord} for ${query} (showing first ${matchesToRender.length}):`
    : `Found ${totalMatches} ${matchWord} for ${query}:`

  return {
    ok: true,
    query,
    total: totalMatches,
    shown: matchesToRender.length,
    header,
    snippets: snippets.join('\n\n----\n\n'),
  }
}

async function finishAction(t, extra = {}, opts = {}) {
  const wc = t && t.view && t.view.webContents
  if (opts.waitMs) await new Promise((r) => setTimeout(r, opts.waitMs))
  if (wc && !wc.isDestroyed() && wc.isLoading()) {
    await waitForLoad(wc, opts.loadTimeout || 6000)
  }
  broadcastState()
  const current = resolveTab((t && t.id) || '')
  const out = { ok: true, tab: serializeTab(current), ...extra }
  const snap = await captureSnapshot(current, opts.maxChars || 8000).catch(() => null)
  if (snap) out.snapshot = snap
  return out
}

async function ensureAiCursorInTab(t) {
  try {
    const has = await evalInTab(t, 'typeof window.__o2EnsureAiCursor === "function"', false)
    if (!has) {
      await evalInTab(t, AI_CURSOR_INIT_SCRIPT, false)
    }
  } catch (_e) {}
}

async function animateAiCursor(t, opts = {}, isClick = false) {
  if (!t || t.view.webContents.isDestroyed()) return
  await ensureAiCursorInTab(t)
  const payload = JSON.stringify(opts)
  const fn = isClick ? 'clickAt' : 'moveTo'
  await Promise.race([
    evalInTab(
      t,
      `(() => {
        const c = typeof window.__o2EnsureAiCursor === 'function' ? window.__o2EnsureAiCursor() : window.__o2AiCursor;
        if (!c) return null;
        return c.${fn}(${payload});
      })()`,
      true
    ),
    new Promise((r) => setTimeout(r, 550)),
  ]).catch(() => {})
}

async function hideAiCursor(t) {
  if (!t || t.view.webContents.isDestroyed()) return
  await evalInTab(
    t,
    `(() => {
      if (window.__o2AiCursor && typeof window.__o2AiCursor.hide === 'function') {
        window.__o2AiCursor.hide();
      }
    })()`,
    false
  ).catch(() => {})
}

async function waitIfHumanActive(t) {
  const since = Date.now() - (coPanel.lastHumanInputAt || 0)
  if (since >= 2200) return false
  hideAiCursor(t).catch(() => {})
  const deadline = Date.now() + 2600
  while (Date.now() < deadline) {
    if (Date.now() - (coPanel.lastHumanInputAt || 0) >= 1500) break
    await new Promise((r) => setTimeout(r, 200))
  }
  return true
}

const VERIFICATION_PROBE_SCRIPT = `(() => {
  const title = (document.title || '').trim();
  const url = location.href || '';
  const bodyText = (document.body ? document.body.innerText : '').slice(0, 3500);
  const isVis = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.height < 12) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0;
  };
  const captchaSels = [
    '#cf-turnstile', '.cf-turnstile', 'iframe[src*="challenges.cloudflare.com"]',
    '#challenge-running', '#challenge-form', '#challenge-stage',
    'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', '.g-recaptcha', '.h-captcha',
    '.geetest_panel', '.geetest_holder', '.geetest_wind', '#nc_1_wrapper', '.nc-container',
    '#tcaptcha_transform', 'iframe[src*="tcaptcha"]', '.secsdk-captcha-drag-icon',
    '.yidun_panel', '.yidun_modal', '.bili-mini-mask', '.verify-wrap', '.captcha-modal'
  ];
  let hasCaptcha = false;
  let captchaReason = '';
  for (const sel of captchaSels) {
    const el = document.querySelector(sel);
    if (isVis(el)) {
      hasCaptcha = true;
      captchaReason = '检测到页面人机验证组件';
      break;
    }
  }
  if (!hasCaptcha) {
    if (/Just a moment|Attention Required! \\| Cloudflare|请完成人机验证|安全验证|访问验证|行为验证/i.test(title)) {
      hasCaptcha = true;
      captchaReason = '当前处于安全验证拦截页（' + title.slice(0, 30) + '）';
    } else if (bodyText.length < 700 && /请拖动滑块|点击完成验证|完成下方验证|请完成安全验证|Verify you are human|Checking your browser/i.test(bodyText)) {
      hasCaptcha = true;
      captchaReason = '页面提示需完成人机验证';
    }
  }

  let hasAuthForm = false;
  let authReason = '';
  const pwdInput = [...document.querySelectorAll('input[type="password"]')].find(isVis);
  const smsInput = [...document.querySelectorAll('input:not([type="hidden"])')].find((el) => {
    if (!isVis(el)) return false;
    const ph = (el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').toLowerCase();
    return /验证码|短信码|动态码|verification code|otp|2fa/i.test(ph);
  });
  const isAuthUrl = /(?:^|[/.?&=_])(login|signin|passport|auth|verify|captcha|sso)(?:$|[/.?&=_])/i.test(url);
  const modalAuth = [...document.querySelectorAll('[role="dialog"],.modal,.login-modal,.auth-modal,.passport-modal,.ant-modal-content,.el-dialog')].find((m) => {
    if (!isVis(m)) return false;
    const txt = (m.innerText || '').slice(0, 600);
    return /扫码登录|密码登录|短信登录|请先登录|登录后继续|安全验证|身份验证|获取验证码/i.test(txt);
  });

  if (modalAuth) {
    hasAuthForm = true;
    authReason = '检测到登录/验证弹窗';
  } else if (isAuthUrl && (pwdInput || smsInput || /扫码登录|二维码登录|账号登录|短信登录/i.test(bodyText))) {
    hasAuthForm = true;
    authReason = '当前处于登录或身份验证页面';
  } else if (smsInput && bodyText.length < 1500) {
    hasAuthForm = true;
    authReason = '页面要求输入验证码';
  }

  const ae = document.activeElement;
  const activeInputFocused = !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable));
  let hash = 0;
  const sample = title + '|' + url + '|' + bodyText.slice(0, 1200);
  for (let i = 0; i < sample.length; i++) {
    hash = ((hash << 5) - hash + sample.charCodeAt(i)) | 0;
  }

  const detected = hasCaptcha || hasAuthForm;
  const kind = hasCaptcha ? 'captcha' : (hasAuthForm ? 'login' : '');
  const reason = captchaReason || authReason || '';
  return {
    detected,
    kind,
    reason,
    hasCaptcha,
    hasAuthForm,
    activeInputFocused,
    textHash: hash,
    url,
    title,
  };
})()`

const SNAPSHOT_FALLBACK_SCRIPT = `(maxText) => {
  const INTERACTIVE = 'a[href],button,input,textarea,select,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="option"],[role="checkbox"],[role="radio"],[role="switch"],[role="combobox"],[role="textbox"],[contenteditable="true"],[onclick]';
  document.querySelectorAll('[data-o2-ref]').forEach((el) => el.removeAttribute('data-o2-ref'));
  const seen = new Set();
  const candidates = [...document.querySelectorAll(INTERACTIVE)];
  for (const el of document.querySelectorAll('div,span,li,label')) {
    if (candidates.length > 260) break;
    if (seen.has(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.cursor === 'pointer' && el.children.length <= 4) candidates.push(el);
  }
  const elements = [];
  let seq = 1;
  for (const el of candidates) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (el.id === '__o2_ai_cursor_host__' || el.closest('#__o2_ai_cursor_host__,[data-o2-ignore]')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 3 || rect.height < 3) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    if (rect.bottom < -80 || rect.top > window.innerHeight + 240) continue;
    if (rect.right < 0 || rect.left > window.innerWidth + 80) continue;
    const ref = 'e' + (seq++);
    el.setAttribute('data-o2-ref', ref);
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || '';
    const type = el.getAttribute('type') || '';
    const rawText = (
      el.innerText ||
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      el.getAttribute('alt') ||
      el.value ||
      ''
    ).replace(/\\s+/g, ' ').trim().slice(0, 90);
    const item = {
      ref,
      tag,
      role: role || undefined,
      type: type || undefined,
      text: rawText,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };
    if (tag === 'a' && el.href) item.href = el.href.slice(0, 200);
    if ('value' in el && typeof el.value === 'string' && el.value && tag !== 'button') {
      item.value = el.value.slice(0, 120);
    }
    if (el.checked === true) item.checked = true;
    if (el.disabled === true) item.disabled = true;
    elements.push(item);
    if (elements.length >= 120) break;
  }
  const bodyText = (document.body ? document.body.innerText : '')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim()
    .slice(0, maxText || 4000);
  const probe = ${VERIFICATION_PROBE_SCRIPT};
  return {
    title: document.title || '',
    url: location.href,
    scrollY: Math.round(window.scrollY || 0),
    scrollHeight: Math.round(document.documentElement ? document.documentElement.scrollHeight : 0),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    elements,
    textExcerpt: bodyText,
    humanVerification: probe && probe.detected ? {
      detected: true,
      kind: probe.kind,
      reason: probe.reason,
    } : undefined,
  };
}`

const SNAPSHOT_SCRIPT = `(maxChars) => {
  const host = document.getElementById('__o2_ai_cursor_host__');
  if (host) {
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('data-o2-ignore', '1');
  }
  const limit = maxChars || 8000;
  let yaml = '';
  try {
    if (typeof window.__o2EnsureAria === 'function') {
      const injected = window.__o2EnsureAria();
      const root = document.body || document.documentElement;
      if (injected && root) yaml = String(injected.ariaSnapshot(root, { mode: 'ai' }) || '');
    }
  } catch (_e) {}
  if (yaml.length > limit) yaml = yaml.slice(0, limit) + '\\n...[truncated]';
  const probe = ${VERIFICATION_PROBE_SCRIPT};
  return {
    title: document.title || '',
    url: location.href,
    scrollY: Math.round(window.scrollY || 0),
    scrollHeight: Math.round(document.documentElement ? document.documentElement.scrollHeight : 0),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    aria: yaml,
    humanVerification: probe && probe.detected ? {
      detected: true,
      kind: probe.kind,
      reason: probe.reason,
    } : undefined,
  };
}`

const RESOLVE_REF_SRC = `
function __o2WalkAll(root, fn) {
  if (!root) return false;
  const list = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (fn(el)) return true;
    if (el.shadowRoot && __o2WalkAll(el.shadowRoot, fn)) return true;
  }
  return false;
}
function __o2ResolveRef(ref) {
  if (!ref) return null;
  const want = String(ref).replace(/^\\[?ref=/, '').replace(/\\]$/, '').trim();
  if (!want) return null;
  let found = document.querySelector('[data-o2-ref="' + want.replace(/"/g, '') + '"]');
  if (found) return found;
  __o2WalkAll(document, function (el) {
    const ar = el._ariaRef;
    if (ar && String(ar.ref) === want) { found = el; return true; }
    return false;
  });
  return found;
}
`

async function locateTarget(t, spec) {
  await settleLayout(t)
  await ensureAriaInTab(t)
  const payload = JSON.stringify({
    ref: spec.ref || '',
    selector: spec.selector || '',
    text: spec.text || '',
  })
  return evalInTab(
    t,
    `(() => {
      ${RESOLVE_REF_SRC}
      const s = ${payload};
      let el = null;
      if (s.ref) el = __o2ResolveRef(s.ref);
      if (!el && s.selector) el = document.querySelector(s.selector);
      if (!el && s.text) {
        const want = s.text.trim();
        const pool = [...document.querySelectorAll('a,button,input,textarea,select,label,[role="button"],[role="link"],[role="tab"],[role="menuitem"],span,div,li')];
        el = pool.find((n) => ((n.innerText || n.value || n.getAttribute('aria-label') || '').trim() === want))
          || pool.find((n) => ((n.innerText || n.value || n.getAttribute('aria-label') || '').includes(want)));
      }
      if (!el) return { found: false };
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const read = () => {
        const r = el.getBoundingClientRect();
        return {
          found: true,
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      };
      const same = (a, b) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1
        && Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1;
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          const first = read();
          requestAnimationFrame(() => {
            const second = read();
            if (!same(first, second)) requestAnimationFrame(() => resolve(read()));
            else resolve(second);
          });
        });
      });
    })()`
  )
}

const KEY_DEFS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  Delete: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  PageUp: { key: 'PageUp', code: 'PageUp', windowsVirtualKeyCode: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 },
  Home: { key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 },
  End: { key: 'End', code: 'End', windowsVirtualKeyCode: 35 },
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
}

async function dispatchComboKey(wc, combo) {
  const parts = String(combo || 'Enter').split('+').map((p) => p.trim()).filter(Boolean)
  let modifiers = 0
  let main = 'Enter'
  for (const p of parts) {
    const low = p.toLowerCase()
    if (low === 'alt') modifiers |= 1
    else if (low === 'control' || low === 'ctrl') modifiers |= 2
    else if (low === 'meta' || low === 'cmd' || low === 'command') modifiers |= 4
    else if (low === 'shift') modifiers |= 8
    else main = p
  }
  const def = KEY_DEFS[main] || {
    key: main,
    code: main.length === 1 ? ('Key' + main.toUpperCase()) : main,
    windowsVirtualKeyCode: main.length === 1 ? main.toUpperCase().charCodeAt(0) : 0,
    text: modifiers === 0 && main.length === 1 ? main : undefined,
  }
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', {
    type: def.text && modifiers === 0 ? 'keyDown' : 'rawKeyDown',
    modifiers,
    key: def.key,
    code: def.code,
    windowsVirtualKeyCode: def.windowsVirtualKeyCode,
    text: modifiers === 0 ? def.text : undefined,
  })
  await wc.debugger.sendCommand('Input.dispatchKeyEvent', {
    type: 'keyUp',
    modifiers,
    key: def.key,
    code: def.code,
    windowsVirtualKeyCode: def.windowsVirtualKeyCode,
  })
}

function describeAiAction(action, body = {}) {
  if (action === 'open' || action === 'navigate') return '打开 ' + String(body.url || '').slice(0, 26)
  if (action === 'click') return '点击 ' + String(body.text || body.ref || body.selector || '目标').slice(0, 18)
  if (action === 'hover') return '悬停 ' + String(body.text || body.ref || body.selector || '目标').slice(0, 18)
  if (action === 'fill' || action === 'type') return '输入 ' + String(body.value || body.text || '文本').slice(0, 16)
  if (action === 'select') return '选择 ' + String(body.label || body.value || '选项').slice(0, 16)
  if (action === 'press') return '按键 ' + String(body.key || 'Enter')
  if (action === 'scroll') return '滚动页面'
  if (action === 'snapshot') return '扫描页面结构'
  if (action === 'find') return '查找 ' + String(body.text || body.query || body.regex || '元素').slice(0, 18)
  if (action === 'read') return '读取页面内容'
  if (action === 'screenshot') return '截取画面'
  if (action === 'wait_for_human') return String(body.reason || '等待人工操作')
  return '操作浏览器'
}

async function handleControlAction(body) {
  const action = String((body && body.action) || 'status').trim()
  if (action === 'co_panel') {
    return updateCoPanel(body)
  }
  if (action === 'status' || action === 'tabs') {
    if (!tabOrder.length) createTab(DEFAULT_HOME, true)
    return getPublicState()
  }

  aiBusyCount += 1
  clearTimeout(autoCloseTimer)
  const isSilentMeta = ['console', 'network', 'cookies', 'storage', 'downloads'].includes(action)
  if (!isSilentMeta) {
    coPanel.aiActive = true
    coPanel.aiActionLabel = describeAiAction(action, body)
    if (!coPanel.open && (action === 'wait_for_human' || !coPanel.userDismissedAt)) {
      coPanel.open = true
      if (!coPanel.openSource) coPanel.openSource = 'ai'
    }
    broadcastState()
  }

  try {
    if (action === 'open' || action === 'navigate') {
      const rawUrl = String(body.url || '').trim()
      if (!rawUrl) throw new Error('missing url')
      const url = normalizeInputUrl(rawUrl)
      const timeoutMs = Number(body.timeout_ms || 9000)
      let loadPromise
      let t
      if (body.new_tab || body.newTab) {
        t = createTab(url, true, true)
        loadPromise = t.view.webContents.loadURL(url).catch(() => {})
      } else {
        t = resolveTab(body.tab_id || body.tabId)
        activeTabId = t.id
        applyViewport()
        t.url = url
        loadPromise = t.view.webContents.loadURL(url).catch(() => {})
      }
      await Promise.race([
        loadPromise,
        new Promise((r) => setTimeout(r, timeoutMs)),
      ])
      await new Promise((r) => setTimeout(r, 200))
      await Promise.race([
        (async () => {
          await ensureDebugger(t)
          await ensureTabMetrics(t)
        })(),
        new Promise((r) => setTimeout(r, 2500)),
      ])
      broadcastState()
      const snap = await captureSnapshot(t, 8000, 3000)
      if (snap && snap.viewportWidth) {
        animateAiCursor(t, {
          x: Math.round(snap.viewportWidth * 0.5),
          y: Math.round(snap.viewportHeight * 0.36),
          label: '已打开页面',
          duration: 200,
        }, false).catch(() => {})
      }
      return {
        ok: true,
        tab: serializeTab(t),
        snapshot: snap,
      }
    }

    if (action === 'switch_tab') {
      const t = switchTab(body.tab_id || body.tabId)
      if (!t) throw new Error('tab not found')
      return { ok: true, tab: serializeTab(t), tabs: getPublicState().tabs }
    }

    if (action === 'close_tab') {
      return closeTab(body.tab_id || body.tabId)
    }

    const t = resolveTab(body.tab_id || body.tabId)
    const wc = t.view.webContents
    await ensureDebugger(t)
    await ensureTabMetrics(t)

    if (action === 'wait_for_human') {
      const reason = String(body.reason || '需要您完成页面人机验证或登录操作，完成后将自动继续').trim()
      const timeoutMs = Math.min(300000, Math.max(5000, Number(body.timeout_ms || 180000)))
      const waitStart = Date.now()
      coPanel.open = true
      if (!coPanel.openSource) coPanel.openSource = 'ai'
      coPanel.waitingHuman = true
      coPanel.humanReason = reason
      coPanel.humanSignal = ''
      coPanel.aiActionLabel = reason
      await hideAiCursor(t)
      broadcastState()

      const initialUrl = wc.getURL() || ''
      const initCookies = await browserSession.cookies.get(initialUrl.startsWith('http') ? { url: initialUrl } : {}).catch(() => [])
      const initialCookieCount = Array.isArray(initCookies) ? initCookies.length : 0
      const initProbe = await evalInTab(t, VERIFICATION_PROBE_SCRIPT).catch(() => ({
        hasCaptcha: false,
        hasAuthForm: false,
        textHash: 0,
        url: initialUrl,
      })) || {}

      let navCount = 0
      const onNav = () => { navCount += 1 }
      wc.on('did-navigate', onNav)
      wc.on('did-navigate-in-page', onNav)

      let status = 'timeout'
      let consecutivePass = 0
      try {
        while (Date.now() - waitStart < timeoutMs) {
          if (coPanel.humanSignal === 'manual_done') {
            status = 'manual_confirmed'
            break
          }
          if (coPanel.humanSignal === 'user_closed') {
            status = 'user_closed'
            break
          }
          await new Promise((r) => setTimeout(r, 380))
          if (wc.isDestroyed()) {
            status = 'tab_closed'
            break
          }
          if (wc.isLoading()) {
            consecutivePass = 0
            continue
          }
          const humanTouched = coPanel.lastHumanInputAt >= waitStart || navCount > 0
          const idleMs = coPanel.lastHumanInputAt >= waitStart
            ? (Date.now() - coPanel.lastHumanInputAt)
            : (Date.now() - waitStart)
          if (idleMs < 1800) {
            consecutivePass = 0
            continue
          }
          const curUrl = wc.getURL() || ''
          const probe = await evalInTab(t, VERIFICATION_PROBE_SCRIPT).catch(() => null)
          if (!probe) continue
          if (probe.activeInputFocused) {
            consecutivePass = 0
            continue
          }

          let resolved = false
          // Signal 1: Captcha existed initially and is now gone
          if (initProbe.hasCaptcha && !probe.hasCaptcha && !probe.hasAuthForm) {
            resolved = true
          }
          // Signal 2: Auth form/modal existed initially and is now gone after human interaction
          if (!resolved && humanTouched && initProbe.hasAuthForm && !probe.hasAuthForm && !probe.hasCaptcha) {
            resolved = true
          }
          // Signal 3: Navigated to a different URL that has no captcha or auth form
          if (!resolved && curUrl && curUrl !== initialUrl && !probe.hasCaptcha && !probe.hasAuthForm) {
            resolved = true
          }
          // Signal 4: Human interacted, new auth cookies set, and page content changed with no captcha/auth wall
          if (!resolved && humanTouched && !probe.hasCaptcha && !probe.hasAuthForm && probe.textHash !== initProbe.textHash) {
            const nowCookies = await browserSession.cookies.get(curUrl.startsWith('http') ? { url: curUrl } : {}).catch(() => [])
            if (Array.isArray(nowCookies) && nowCookies.length > initialCookieCount) {
              resolved = true
            }
          }

          if (resolved) {
            consecutivePass += 1
            if (consecutivePass >= 2) {
              status = 'auto_detected'
              break
            }
          } else {
            consecutivePass = 0
          }
        }
      } finally {
        wc.removeListener('did-navigate', onNav)
        wc.removeListener('did-navigate-in-page', onNav)
        coPanel.waitingHuman = false
        coPanel.humanReason = ''
        coPanel.humanSignal = ''
        broadcastState()
      }

      const snap = await captureSnapshot(t, 8000).catch(() => null)
      return {
        ok: true,
        humanStatus: status,
        tab: serializeTab(t),
        snapshot: snap,
      }
    }

    if (action === 'back') {
      if (wc.navigationHistory.canGoBack()) {
        wc.navigationHistory.goBack()
        await waitForLoad(wc, 6000)
      }
      return finishAction(t)
    }

    if (action === 'forward') {
      if (wc.navigationHistory.canGoForward()) {
        wc.navigationHistory.goForward()
        await waitForLoad(wc, 6000)
      }
      return finishAction(t)
    }

    if (action === 'reload') {
      wc.reload()
      await waitForLoad(wc, 8000)
      return finishAction(t)
    }

    if (action === 'snapshot') {
      const maxChars = Math.min(20000, Math.max(500, Number(body.max_chars || 8000)))
      const snap = await captureSnapshot(t, maxChars, 8000)
      return { ok: true, tab: serializeTab(t), ...(snap || {}) }
    }

    if (action === 'find') {
      const text = String(body.text || body.query || '').trim()
      const regex = String(body.regex || '').trim()
      const snap = await captureSnapshot(t, 20000, 8000)
      const found = findInAriaSnapshot(snapshotSearchText(snap), {
        text: regex ? '' : text,
        regex,
        maxResults: body.max_results != null ? body.max_results : body.maxResults,
      })
      if (!found.ok) throw new Error(found.error)
      return {
        ok: true,
        tab: serializeTab(t),
        title: (snap && snap.title) || '',
        url: (snap && snap.url) || '',
        humanVerification: snap && snap.humanVerification,
        query: found.query,
        total: found.total,
        shown: found.shown,
        header: found.header,
        snippets: found.snippets,
      }
    }

    if (action === 'read') {
      const maxChars = Math.min(100000, Math.max(500, Number(body.max_chars || 20000)))
      const sel = JSON.stringify(String(body.selector || ''))
      const fmt = JSON.stringify(String(body.format || 'text'))
      const data = await evalInTab(
        t,
        `(() => {
          const sel = ${sel};
          const fmt = ${fmt};
          const root = sel ? document.querySelector(sel) : document.body;
          if (!root) return { found: false, title: document.title, url: location.href, content: '' };
          if (fmt === 'html') {
            return { found: true, title: document.title, url: location.href, content: root.outerHTML.slice(0, ${maxChars}) };
          }
          let text = (root.innerText || root.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim();
          if (!sel) {
            for (const f of document.querySelectorAll('iframe')) {
              try {
                const sub = f.contentDocument && f.contentDocument.body && f.contentDocument.body.innerText;
                if (sub && sub.trim()) text += '\\n\\n[iframe]\\n' + sub.trim();
              } catch (_) {}
            }
          }
          const links = [...root.querySelectorAll('a[href]')].slice(0, 60).map((a) => ({
            text: (a.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
            href: a.href,
          })).filter((x) => x.text && x.href);
          return {
            found: true,
            title: document.title || '',
            url: location.href,
            content: text.slice(0, ${maxChars}),
            links,
          };
        })()`
      )
      return { ok: true, tab: serializeTab(t), ...data }
    }

    if (action === 'click') {
      await waitIfHumanActive(t)
      const wantsLive = !!(body.ref || body.selector || body.text)
      let x = (!wantsLive && typeof body.x === 'number') ? body.x : null
      let y = (!wantsLive && typeof body.y === 'number') ? body.y : null
      let hit = null
      if (wantsLive || x === null || y === null) {
        hit = await locateTarget(t, body)
        if (!hit || !hit.found) {
          throw new Error('target element not found; call snapshot first to refresh element refs')
        }
        x = hit.x
        y = hit.y
      } else {
        await settleLayout(t)
      }
      const clickLabel = '点击 ' + String((hit && hit.text) || body.text || body.ref || body.selector || `(${x},${y})`).slice(0, 18)
      await animateAiCursor(t, {
        x,
        y,
        label: clickLabel,
        mode: 'click',
        rect: hit ? { x: hit.x, y: hit.y, w: hit.w, h: hit.h } : { x, y, w: 28, h: 28 },
      }, true)

      const button = body.button === 'right' ? 'right' : body.button === 'middle' ? 'middle' : 'left'
      const clicks = body.double ? 2 : 1
      const cdpX = Math.round(x)
      const cdpY = Math.round(y)
      t._aiSyntheticUntil = Date.now() + 420

      await evalInTab(
        t,
        `(() => {
          window.__o2LastClickHit = false;
          const onHit = () => { window.__o2LastClickHit = true; };
          window.addEventListener('mousedown', onHit, { capture: true, once: true });
        })()`,
        false
      ).catch(() => {})

      await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: cdpX, y: cdpY, button: 'none',
      })
      for (let i = 1; i <= clicks; i++) {
        await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mousePressed', x: cdpX, y: cdpY, button, clickCount: i,
        })
        await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: cdpX, y: cdpY, button, clickCount: i,
        })
      }

      if (button === 'left') {
        await evalInTab(
          t,
          `(() => {
            const el = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)});
            if (!el) return;
            if (!window.__o2LastClickHit) {
              el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: ${Math.round(x)}, clientY: ${Math.round(y)} }));
              el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: ${Math.round(x)}, clientY: ${Math.round(y)} }));
              if (typeof el.click === 'function') el.click();
            }
          })()`,
          false
        ).catch(() => {})
      }

      return finishAction(resolveTab() || t, { clicked: hit || { x, y } }, { waitMs: 350 })
    }

    if (action === 'hover') {
      await waitIfHumanActive(t)
      const wantsLive = !!(body.ref || body.selector || body.text)
      let x = (!wantsLive && typeof body.x === 'number') ? body.x : null
      let y = (!wantsLive && typeof body.y === 'number') ? body.y : null
      let hit = null
      if (wantsLive || x === null || y === null) {
        hit = await locateTarget(t, body)
        if (!hit || !hit.found) throw new Error('target element not found')
        x = hit.x
        y = hit.y
      } else {
        await settleLayout(t)
      }
      await animateAiCursor(t, {
        x,
        y,
        label: '悬停 ' + String((hit && hit.text) || body.ref || body.selector || '').slice(0, 18),
        mode: 'hover',
        rect: hit ? { x: hit.x, y: hit.y, w: hit.w, h: hit.h } : null,
      }, false)
      t._aiSyntheticUntil = Date.now() + 260
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none',
      })
      return finishAction(t, { hovered: hit || { x, y } })
    }

    if (action === 'fill' || action === 'type') {
      await waitIfHumanActive(t)
      const value = String(body.value !== undefined ? body.value : (body.text || ''))
      const clear = body.clear !== undefined ? !!body.clear : (action === 'fill')
      const spec = JSON.stringify({
        ref: body.ref || '',
        selector: body.selector || '',
        clear,
      })
      const prep = await evalInTab(
        t,
        `(() => {
          ${RESOLVE_REF_SRC}
          const s = ${spec};
          let el = null;
          if (s.ref) el = __o2ResolveRef(s.ref);
          if (!el && s.selector) el = document.querySelector(s.selector);
          if (!el && !s.ref && !s.selector) el = document.activeElement;
          if (!el || el === document.body) return { found: false };
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          const r = el.getBoundingClientRect();
          return {
            found: true,
            tag: el.tagName.toLowerCase(),
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        })()`
      )
      if (!prep || !prep.found) {
        throw new Error('input element not found; specify ref or selector')
      }
      await animateAiCursor(t, {
        x: prep.x,
        y: prep.y,
        label: '输入「' + value.slice(0, 14) + (value.length > 14 ? '…' : '') + '」',
        mode: 'fill',
        rect: { x: prep.x, y: prep.y, w: prep.w, h: prep.h },
      }, true)
      t._aiSyntheticUntil = Date.now() + 500
      await evalInTab(
        t,
        `(() => {
          ${RESOLVE_REF_SRC}
          const s = ${spec};
          let el = null;
          if (s.ref) el = __o2ResolveRef(s.ref);
          if (!el && s.selector) el = document.querySelector(s.selector);
          if (!el && !s.ref && !s.selector) el = document.activeElement;
          if (!el) return;
          el.focus();
          if (s.clear) {
            if ('value' in el) {
              const proto = el.tagName === 'TEXTAREA'
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
              const desc = Object.getOwnPropertyDescriptor(proto, 'value');
              if (desc && desc.set) desc.set.call(el, '');
              else el.value = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (el.isContentEditable) {
              el.textContent = '';
            }
          }
        })()`
      )
      if (value) {
        t._aiSyntheticUntil = Date.now() + 500
        await wc.debugger.sendCommand('Input.insertText', { text: value })
        await evalInTab(
          t,
          `(() => {
            const el = document.activeElement;
            if (el) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()`
        ).catch(() => {})
      }
      if (body.press_enter || body.pressEnter) {
        t._aiSyntheticUntil = Date.now() + 450
        await dispatchComboKey(wc, 'Enter')
        return finishAction(t, {}, { waitMs: 350 })
      }
      return finishAction(t)
    }

    if (action === 'select') {
      await waitIfHumanActive(t)
      const spec = JSON.stringify({
        ref: body.ref || '',
        selector: body.selector || '',
        value: body.value !== undefined ? String(body.value) : '',
        label: body.label !== undefined ? String(body.label) : '',
      })
      const hit = await locateTarget(t, body).catch(() => null)
      if (hit && hit.found) {
        await animateAiCursor(t, {
          x: hit.x,
          y: hit.y,
          label: '选择「' + String(body.label || body.value || '').slice(0, 14) + '」',
          mode: 'click',
          rect: { x: hit.x, y: hit.y, w: hit.w, h: hit.h },
        }, true)
      }
      t._aiSyntheticUntil = Date.now() + 320
      const out = await evalInTab(
        t,
        `(() => {
          ${RESOLVE_REF_SRC}
          const s = ${spec};
          let el = s.ref ? __o2ResolveRef(s.ref) : null;
          if (!el && s.selector) el = document.querySelector(s.selector);
          if (!el || el.tagName !== 'SELECT') return { ok: false, error: 'select element not found' };
          const opts = [...el.options];
          const hit = opts.find((o) => (s.value && o.value === s.value) || (s.label && o.text.trim() === s.label.trim()))
            || opts.find((o) => s.label && o.text.includes(s.label));
          if (!hit) return { ok: false, error: 'option not found' };
          el.value = hit.value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, value: hit.value, label: hit.text };
        })()`
      )
      if (!out || !out.ok) throw new Error((out && out.error) || 'select failed')
      return finishAction(t, { selected: out })
    }

    if (action === 'press') {
      await waitIfHumanActive(t)
      t._aiSyntheticUntil = Date.now() + 350
      await dispatchComboKey(wc, body.key || 'Enter')
      return finishAction(t, {}, { waitMs: 200, loadTimeout: 5000 })
    }

    if (action === 'scroll') {
      await waitIfHumanActive(t)
      if (body.ref || body.selector) {
        const hit = await locateTarget(t, body)
        if (!hit || !hit.found) throw new Error('target element not found')
        await animateAiCursor(t, {
          x: hit.x,
          y: hit.y,
          label: '滚动到目标',
          mode: 'scroll',
          rect: { x: hit.x, y: hit.y, w: hit.w, h: hit.h },
        }, false)
        return finishAction(t, { scrolledTo: hit })
      }
      const dir = String(body.direction || 'down').toLowerCase()
      const amount = Number(body.amount || 650)
      t._aiSyntheticUntil = Date.now() + 350
      const pos = await evalInTab(
        t,
        `(() => {
          const dir = ${JSON.stringify(dir)};
          const amt = ${amount};
          if (dir === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
          else if (dir === 'bottom') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
          else if (dir === 'up') window.scrollBy({ top: -amt, behavior: 'smooth' });
          else window.scrollBy({ top: amt, behavior: 'smooth' });
          return { scrollY: Math.round(window.scrollY), scrollHeight: Math.round(document.documentElement.scrollHeight), innerHeight: window.innerHeight, innerWidth: window.innerWidth };
        })()`
      )
      await animateAiCursor(t, {
        x: Math.round((pos.innerWidth || 1280) * 0.52),
        y: Math.round((pos.innerHeight || 720) * (dir === 'up' || dir === 'top' ? 0.35 : 0.65)),
        label: dir === 'up' || dir === 'top' ? '向上滚动' : '向下滚动',
        mode: 'scroll',
      }, false)
      await new Promise((r) => setTimeout(r, 240))
      return finishAction(t, pos)
    }

    if (action === 'wait') {
      const timeoutMs = Math.min(30000, Math.max(100, Number(body.timeout_ms || body.ms || 2000)))
      if (!body.selector && !body.text) {
        await new Promise((r) => setTimeout(r, timeoutMs))
        return finishAction(t, { waitedMs: timeoutMs })
      }
      const deadline = Date.now() + timeoutMs
      const sel = JSON.stringify(String(body.selector || ''))
      const txt = JSON.stringify(String(body.text || ''))
      while (Date.now() < deadline) {
        const matched = await evalInTab(
          t,
          `(() => {
            const s = ${sel};
            const tx = ${txt};
            if (s && document.querySelector(s)) return true;
            if (tx && document.body && document.body.innerText.includes(tx)) return true;
            return false;
          })()`
        ).catch(() => false)
        if (matched) return finishAction(t, { matched: true })
        await new Promise((r) => setTimeout(r, 250))
      }
      return finishAction(t, { matched: false, timedOut: true })
    }

    if (action === 'eval') {
      const expr = String(body.expression || body.code || '').trim()
      if (!expr) throw new Error('missing expression')
      const result = await evalInTab(t, expr, true)
      broadcastState()
      return { ok: true, result, tab: serializeTab(t) }
    }

    if (action === 'screenshot') {
      let b64 = ''
      const mime = 'image/jpeg'
      try {
        const shot = await Promise.race([
          wc.debugger.sendCommand('Page.captureScreenshot', {
            format: 'jpeg',
            quality: 80,
            captureBeyondViewport: !!body.full_page,
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('screenshot timeout')), 4000)),
        ])
        b64 = (shot && shot.data) || ''
      } catch (_e) {}
      if (!b64) {
        const img = await Promise.race([
          wc.capturePage(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('capturePage timeout')), 3000)),
        ])
        if (img && !img.isEmpty()) {
          b64 = img.toJPEG(80).toString('base64')
        }
      }
      if (!b64) throw new Error('failed to capture screenshot')
      const dir = path.join(os.tmpdir(), 'o2-browser-shots')
      fs.mkdirSync(dir, { recursive: true })
      const filePath = path.join(dir, `shot-${Date.now()}.jpg`)
      fs.writeFileSync(filePath, Buffer.from(b64, 'base64'))
      return {
        ok: true,
        path: filePath,
        mime,
        data: b64,
        tab: serializeTab(t),
      }
    }

    if (action === 'console') {
      const limit = Math.min(200, Math.max(1, Number(body.limit || 60)))
      const items = t.consoleLogs.slice(-limit)
      if (body.clear) t.consoleLogs.length = 0
      return { ok: true, items, tab: serializeTab(t) }
    }

    if (action === 'network') {
      if (body.request_id || body.requestId) {
        const rid = String(body.request_id || body.requestId)
        const res = await wc.debugger.sendCommand('Network.getResponseBody', { requestId: rid })
        const rec = t.networkById.get(rid) || {}
        let content = res.body || ''
        if (!res.base64Encoded && content.length > 50000) {
          content = content.slice(0, 50000) + '\n...[truncated]'
        }
        return {
          ok: true,
          requestId: rid,
          url: rec.url || '',
          status: rec.status,
          mimeType: rec.mimeType || '',
          base64Encoded: !!res.base64Encoded,
          body: content,
        }
      }
      const filter = String(body.url_filter || body.filter || '').toLowerCase()
      const limit = Math.min(200, Math.max(1, Number(body.limit || 60)))
      let items = t.networkLogs
      if (filter) items = items.filter((r) => (r.url || '').toLowerCase().includes(filter))
      const out = items.slice(-limit)
      if (body.clear) {
        t.networkLogs.length = 0
        t.networkById.clear()
      }
      return { ok: true, items: out, tab: serializeTab(t) }
    }

    if (action === 'cookies') {
      const op = String(body.op || 'get').toLowerCase()
      if (op === 'set' && body.cookie) {
        const c = { ...body.cookie }
        if (!c.url) c.url = wc.getURL() || DEFAULT_HOME
        await browserSession.cookies.set(c)
        return { ok: true }
      }
      if (op === 'clear') {
        await browserSession.clearStorageData({ storages: ['cookies'] })
        return { ok: true }
      }
      const filter = {}
      if (body.url) filter.url = String(body.url)
      else if (body.domain) filter.domain = String(body.domain)
      else if (!body.all && wc.getURL().startsWith('http')) filter.url = wc.getURL()
      const list = await browserSession.cookies.get(filter)
      return { ok: true, cookies: list.slice(0, 200), total: list.length }
    }

    if (action === 'storage') {
      const op = String(body.op || 'get').toLowerCase()
      const kind = body.kind === 'session' ? 'sessionStorage' : 'localStorage'
      const key = JSON.stringify(body.key !== undefined ? String(body.key) : '')
      const val = JSON.stringify(body.value !== undefined ? String(body.value) : '')
      const res = await evalInTab(
        t,
        `(() => {
          const store = window[${JSON.stringify(kind)}];
          const op = ${JSON.stringify(op)};
          const k = ${key};
          if (op === 'set' && k) { store.setItem(k, ${val}); return { ok: true }; }
          if (op === 'remove' && k) { store.removeItem(k); return { ok: true }; }
          if (op === 'clear') { store.clear(); return { ok: true }; }
          if (k) return { key: k, value: store.getItem(k) };
          const all = {};
          for (let i = 0; i < store.length; i++) {
            const name = store.key(i);
            const raw = store.getItem(name) || '';
            all[name] = raw.length > 1000 ? raw.slice(0, 1000) + '...' : raw;
          }
          return { entries: all, count: store.length };
        })()`
      )
      return { ok: true, ...res, tab: serializeTab(t) }
    }

    if (action === 'downloads') {
      return { ok: true, downloads: downloads.slice(-50).reverse() }
    }

    if (action === 'cdp') {
      const method = String(body.method || '').trim()
      if (!method) throw new Error('missing CDP method')
      const res = await wc.debugger.sendCommand(method, body.params || {})
      return { ok: true, result: res, tab: serializeTab(t) }
    }

    throw new Error(`unknown browser action: ${action}`)
  } finally {
    aiBusyCount = Math.max(0, aiBusyCount - 1)
    if (aiBusyCount === 0 && !coPanel.waitingHuman) {
      broadcastState()
    }
  }
}

function startControlServer() {
  return new Promise((resolve, reject) => {
    ctlServer = http.createServer((req, res) => {
      if (req.headers['x-o2-token'] !== ctlToken) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: 'forbidden' }))
        return
      }
      let raw = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        raw += chunk
        if (raw.length > 4 * 1024 * 1024) req.destroy()
      })
      req.on('end', async () => {
        let body = {}
        if (raw.trim()) {
          try {
            body = JSON.parse(raw)
          } catch (_e) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ ok: false, error: 'invalid json' }))
            return
          }
        }
        try {
          const out = await handleControlAction(body)
          const payload = Buffer.from(JSON.stringify(out), 'utf-8')
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': payload.length,
          })
          res.end(payload)
        } catch (err) {
          const payload = Buffer.from(
            JSON.stringify({ ok: false, error: String((err && err.message) || err) }),
            'utf-8'
          )
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': payload.length,
          })
          res.end(payload)
        }
      })
    })
    ctlServer.on('error', reject)
    ctlServer.listen(0, '127.0.0.1', () => {
      ctlPort = ctlServer.address().port
      resolve(ctlPort)
    })
  })
}

function postJson(targetUrl, obj) {
  return new Promise((resolve) => {
    try {
      const u = new URL(targetUrl)
      const data = Buffer.from(JSON.stringify(obj), 'utf-8')
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
          },
          timeout: 2500,
        },
        (res) => {
          res.resume()
          resolve(res.statusCode === 200)
        }
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
      req.write(data)
      req.end()
    } catch (_e) {
      resolve(false)
    }
  })
}

async function registerBridgeWithBackend() {
  if (!appUrl || !ctlPort) return
  const regUrl = new URL('/api/browser/register', appUrl).toString()
  for (let i = 0; i < 15; i++) {
    const ok = await postJson(regUrl, {
      ctl_url: `http://127.0.0.1:${ctlPort}`,
      token: ctlToken,
    })
    if (ok) return
    await new Promise((r) => setTimeout(r, 300))
  }
}

function waitHttpUp(url, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve(true)
      })
      req.on('error', () => {
        if (Date.now() >= deadline) resolve(false)
        else setTimeout(check, 150)
      })
    }
    check()
  })
}

async function ensureBackendServer() {
  if (appUrl) return appUrl
  const fallbackUrl = 'http://127.0.0.1:8765/'
  if (await waitHttpUp(fallbackUrl, 600)) {
    appUrl = fallbackUrl
    return appUrl
  }
  const venvPyw = path.join(ROOT_DIR, '.venv', 'Scripts', 'pythonw.exe')
  const venvPy = path.join(ROOT_DIR, '.venv', 'Scripts', 'python.exe')
  const pyBin = fs.existsSync(venvPyw) ? venvPyw : (fs.existsSync(venvPy) ? venvPy : 'pythonw')
  const serverScript = path.join(ROOT_DIR, 'src', 'server.py')
  pyProc = spawn(pyBin, [serverScript, '8765', '--no-gui'], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: false,
  })
  await waitHttpUp(fallbackUrl, 12000)
  appUrl = fallbackUrl
  return appUrl
}

function setupIpc() {
  ipcMain.handle('o2-browser:get-state', () => {
    if (!tabOrder.length) createTab(DEFAULT_HOME, true)
    return getPublicState()
  })

  function updateViewportRect(rect) {
    if (!rect || typeof rect !== 'object') return
    viewport.visible = !!rect.visible
    if (typeof rect.inline === 'boolean') viewport.inline = rect.inline
    viewport.animating = !!rect.animating
    if (typeof rect.x === 'number') viewport.x = rect.x
    if (typeof rect.y === 'number') viewport.y = rect.y
    if (typeof rect.width === 'number') viewport.width = rect.width
    if (typeof rect.height === 'number') viewport.height = rect.height
    if (viewport.visible && !tabOrder.length) {
      createTab(DEFAULT_HOME, true)
    }
    applyViewport()
  }

  ipcMain.on('o2-browser:viewport-fast', (_ev, rect) => {
    updateViewportRect(rect)
  })

  ipcMain.handle('o2-browser:set-viewport', (_ev, rect) => {
    updateViewportRect(rect)
    return getPublicState()
  })

  ipcMain.handle('o2-browser:set-co-panel', (_ev, patch) => {
    return updateCoPanel(patch || {})
  })

  ipcMain.handle('o2-browser:new-tab', (_ev, url) => {
    createTab(url || DEFAULT_HOME, true)
    return getPublicState()
  })

  ipcMain.handle('o2-browser:switch-tab', (_ev, tabId) => {
    switchTab(tabId)
    return getPublicState()
  })

  ipcMain.handle('o2-browser:close-tab', (_ev, tabId) => closeTab(tabId))

  ipcMain.handle('o2-browser:navigate', (_ev, payload) => {
    const url = normalizeInputUrl(payload && payload.url)
    const t = resolveTab(payload && payload.tabId)
    t.url = url
    t.view.webContents.loadURL(url).catch(() => {})
    broadcastState()
    return getPublicState()
  })

  ipcMain.handle('o2-browser:back', () => {
    const t = resolveTab()
    if (t && t.view.webContents.navigationHistory.canGoBack()) {
      t.view.webContents.navigationHistory.goBack()
    }
    return getPublicState()
  })

  ipcMain.handle('o2-browser:forward', () => {
    const t = resolveTab()
    if (t && t.view.webContents.navigationHistory.canGoForward()) {
      t.view.webContents.navigationHistory.goForward()
    }
    return getPublicState()
  })

  ipcMain.handle('o2-browser:reload', () => {
    const t = resolveTab()
    if (t) t.view.webContents.reload()
    return getPublicState()
  })

  ipcMain.handle('o2-browser:stop', () => {
    const t = resolveTab()
    if (t) t.view.webContents.stop()
    return getPublicState()
  })

  ipcMain.handle('o2-browser:devtools', () => {
    const t = resolveTab()
    if (t && !t.view.webContents.isDestroyed()) {
      if (t.view.webContents.isDevToolsOpened()) {
        t.view.webContents.closeDevTools()
      } else {
        t.view.webContents.openDevTools({ mode: 'detach' })
      }
    }
    return { ok: true }
  })

  ipcMain.handle('o2-browser:capture-preview', async () => {
    const t = tabs.get(activeTabId)
    if (!t || t.view.webContents.isDestroyed()) return { dataUrl: '' }
    try {
      const img = await t.view.webContents.capturePage()
      if (img.isEmpty()) return { dataUrl: '' }
      return { dataUrl: 'data:image/jpeg;base64,' + img.toJPEG(78).toString('base64') }
    } catch (_e) {
      return { dataUrl: '' }
    }
  })
}

async function createMainWindow() {
  configureBrowserSession()
  await startControlServer()
  const targetUrl = await ensureBackendServer()

  const startHidden = process.argv.includes('--hidden')
  const iconPath = path.join(ROOT_DIR, 'assets', 'app.ico')
  mainWindow = new BrowserWindow({
    title: 'O2',
    show: !startHidden,
    width: 1440,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#fafafa',
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow.setMenuBarVisibility(false)

  const saved = loadSavedTabs()
  if (saved && saved.tabs && saved.tabs.length) {
    let preferredIndex = 0
    saved.tabs.slice(0, 8).forEach((item, idx) => {
      if (item.id === saved.activeTabId) preferredIndex = idx
      createTab(item.url || DEFAULT_HOME, false)
    })
    if (tabOrder[preferredIndex]) {
      activeTabId = tabOrder[preferredIndex]
    }
  } else {
    createTab(DEFAULT_HOME, true)
  }

  await registerBridgeWithBackend()
  setInterval(() => {
    registerBridgeWithBackend().catch(() => {})
  }, 15000).unref()

  mainWindow.loadURL(targetUrl)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
  app.whenReady().then(async () => {
    setupIpc()
    await createMainWindow()
  })
}

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  if (ctlServer) {
    try { ctlServer.close() } catch (_e) {}
  }
  if (pyProc) {
    try { pyProc.kill() } catch (_e) {}
  }
})
