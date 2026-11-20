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
}

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
  }
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

async function ensureTabMetrics(t) {
  const wc = t.view.webContents
  if (wc.isDestroyed() || !wc.debugger.isAttached()) return
  if (isTabShownOnScreen(t)) {
    if (t._metricsEmulated) {
      t._metricsEmulated = false
      await wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => {})
    }
    return
  }
  const { w, h } = currentStageSize()
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
  const offScreen = { x: -20000, y: 0, width: w, height: h }
  for (const [id, t] of tabs) {
    if (t.view.webContents.isDestroyed()) continue
    t.view.setVisible(true)
    if (show && id === activeTabId) {
      t.view.setBounds(onScreen)
      if (t._metricsEmulated && t.view.webContents.debugger.isAttached()) {
        t._metricsEmulated = false
        t.view.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => {})
      }
    } else {
      t.view.setBounds(offScreen)
    }
  }
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
        await wc.debugger.sendCommand('Network.enable', { maxPostDataSize: 65536 })
        if (cleanUserAgent) {
          await wc.debugger.sendCommand('Network.setUserAgentOverride', {
            userAgent: cleanUserAgent,
            platform: 'Win32',
          })
        }
        await wc.debugger.sendCommand('DOM.enable')
        await wc.debugger.sendCommand('Log.enable')
        await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
          source: `
            try {
              Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            } catch (_) {}
          `,
        })
      } catch (_e) {}

    wc.debugger.on('message', (_event, method, params) => {
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

  wc.on('did-start-loading', syncMeta)
  wc.on('did-stop-loading', syncMeta)
  wc.on('did-navigate', syncMeta)
  wc.on('did-navigate-in-page', syncMeta)
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

const SNAPSHOT_SCRIPT = `(maxText) => {
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
  return {
    title: document.title || '',
    url: location.href,
    scrollY: Math.round(window.scrollY || 0),
    scrollHeight: Math.round(document.documentElement ? document.documentElement.scrollHeight : 0),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    elements,
    textExcerpt: bodyText,
  };
}`

async function locateTarget(t, spec) {
  const payload = JSON.stringify({
    ref: spec.ref || '',
    selector: spec.selector || '',
    text: spec.text || '',
  })
  return evalInTab(
    t,
    `(() => {
      const s = ${payload};
      let el = null;
      if (s.ref) el = document.querySelector('[data-o2-ref="' + s.ref.replace(/"/g, '') + '"]');
      if (!el && s.selector) el = document.querySelector(s.selector);
      if (!el && s.text) {
        const want = s.text.trim();
        const pool = [...document.querySelectorAll('a,button,input,textarea,select,label,[role="button"],[role="link"],[role="tab"],[role="menuitem"],span,div,li')];
        el = pool.find((n) => ((n.innerText || n.value || n.getAttribute('aria-label') || '').trim() === want))
          || pool.find((n) => ((n.innerText || n.value || n.getAttribute('aria-label') || '').includes(want)));
      }
      if (!el) return { found: false };
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
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

async function handleControlAction(body) {
  const action = String((body && body.action) || 'status').trim()
  aiBusyCount += 1
  try {
    if (action === 'status' || action === 'tabs') {
      if (!tabOrder.length) createTab(DEFAULT_HOME, true)
      return getPublicState()
    }

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
      const snap = await Promise.race([
        evalInTab(t, `(${SNAPSHOT_SCRIPT})(2500)`),
        new Promise((r) => setTimeout(() => r(null), 3000)),
      ]).catch(() => null)
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

    if (action === 'back') {
      if (wc.navigationHistory.canGoBack()) {
        wc.navigationHistory.goBack()
        await waitForLoad(wc, 6000)
      }
      broadcastState()
      return { ok: true, tab: serializeTab(t) }
    }

    if (action === 'forward') {
      if (wc.navigationHistory.canGoForward()) {
        wc.navigationHistory.goForward()
        await waitForLoad(wc, 6000)
      }
      broadcastState()
      return { ok: true, tab: serializeTab(t) }
    }

    if (action === 'reload') {
      wc.reload()
      await waitForLoad(wc, 8000)
      broadcastState()
      return { ok: true, tab: serializeTab(t) }
    }

    if (action === 'snapshot') {
      const maxChars = Math.min(20000, Math.max(500, Number(body.max_chars || 4000)))
      const snap = await evalInTab(t, `(${SNAPSHOT_SCRIPT})(${maxChars})`)
      return { ok: true, tab: serializeTab(t), ...snap }
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
      let x = typeof body.x === 'number' ? body.x : null
      let y = typeof body.y === 'number' ? body.y : null
      let hit = null
      if (x === null || y === null) {
        hit = await locateTarget(t, body)
        if (!hit || !hit.found) {
          throw new Error('target element not found; call snapshot first to refresh element refs')
        }
        x = hit.x
        y = hit.y
      }
      const button = body.button === 'right' ? 'right' : body.button === 'middle' ? 'middle' : 'left'
      const clicks = body.double ? 2 : 1
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x, y, button: 'none',
      })
      for (let i = 1; i <= clicks; i++) {
        await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mousePressed', x, y, button, clickCount: i,
        })
        await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseReleased', x, y, button, clickCount: i,
        })
      }
      await new Promise((r) => setTimeout(r, 350))
      if (wc.isLoading()) await waitForLoad(wc, 6000)
      broadcastState()
      const current = resolveTab()
      return {
        ok: true,
        clicked: hit || { x, y },
        tab: serializeTab(current),
      }
    }

    if (action === 'hover') {
      let x = typeof body.x === 'number' ? body.x : null
      let y = typeof body.y === 'number' ? body.y : null
      let hit = null
      if (x === null || y === null) {
        hit = await locateTarget(t, body)
        if (!hit || !hit.found) throw new Error('target element not found')
        x = hit.x
        y = hit.y
      }
      await wc.debugger.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x, y, button: 'none',
      })
      return { ok: true, hovered: hit || { x, y }, tab: serializeTab(t) }
    }

    if (action === 'fill' || action === 'type') {
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
          const s = ${spec};
          let el = null;
          if (s.ref) el = document.querySelector('[data-o2-ref="' + s.ref.replace(/"/g, '') + '"]');
          if (!el && s.selector) el = document.querySelector(s.selector);
          if (!el) el = document.activeElement;
          if (!el || el === document.body) return { found: false };
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
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
          const r = el.getBoundingClientRect();
          return { found: true, tag: el.tagName.toLowerCase(), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`
      )
      if (!prep || !prep.found) {
        throw new Error('input element not found; specify ref or selector')
      }
      if (value) {
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
        await dispatchComboKey(wc, 'Enter')
        await new Promise((r) => setTimeout(r, 350))
        if (wc.isLoading()) await waitForLoad(wc, 6000)
      }
      broadcastState()
      return { ok: true, tab: serializeTab(t) }
    }

    if (action === 'select') {
      const spec = JSON.stringify({
        ref: body.ref || '',
        selector: body.selector || '',
        value: body.value !== undefined ? String(body.value) : '',
        label: body.label !== undefined ? String(body.label) : '',
      })
      const out = await evalInTab(
        t,
        `(() => {
          const s = ${spec};
          let el = s.ref ? document.querySelector('[data-o2-ref="' + s.ref.replace(/"/g, '') + '"]') : null;
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
      return { ok: true, selected: out, tab: serializeTab(t) }
    }

    if (action === 'press') {
      await dispatchComboKey(wc, body.key || 'Enter')
      await new Promise((r) => setTimeout(r, 200))
      if (wc.isLoading()) await waitForLoad(wc, 5000)
      broadcastState()
      return { ok: true, tab: serializeTab(t) }
    }

    if (action === 'scroll') {
      if (body.ref || body.selector) {
        const hit = await locateTarget(t, body)
        if (!hit || !hit.found) throw new Error('target element not found')
        return { ok: true, scrolledTo: hit, tab: serializeTab(t) }
      }
      const dir = String(body.direction || 'down').toLowerCase()
      const amount = Number(body.amount || 650)
      const pos = await evalInTab(
        t,
        `(() => {
          const dir = ${JSON.stringify(dir)};
          const amt = ${amount};
          if (dir === 'top') window.scrollTo(0, 0);
          else if (dir === 'bottom') window.scrollTo(0, document.documentElement.scrollHeight);
          else if (dir === 'up') window.scrollBy(0, -amt);
          else window.scrollBy(0, amt);
          return { scrollY: Math.round(window.scrollY), scrollHeight: Math.round(document.documentElement.scrollHeight), innerHeight: window.innerHeight };
        })()`
      )
      return { ok: true, ...pos, tab: serializeTab(t) }
    }

    if (action === 'wait') {
      const timeoutMs = Math.min(30000, Math.max(100, Number(body.timeout_ms || body.ms || 2000)))
      if (!body.selector && !body.text) {
        await new Promise((r) => setTimeout(r, timeoutMs))
        return { ok: true, waitedMs: timeoutMs, tab: serializeTab(t) }
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
        if (matched) return { ok: true, matched: true, tab: serializeTab(t) }
        await new Promise((r) => setTimeout(r, 250))
      }
      return { ok: true, matched: false, timedOut: true, tab: serializeTab(t) }
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
  const venvPy = path.join(ROOT_DIR, '.venv', 'Scripts', 'python.exe')
  const pyBin = fs.existsSync(venvPy) ? venvPy : 'python'
  const serverScript = path.join(ROOT_DIR, 'src', 'server.py')
  pyProc = spawn(pyBin, [serverScript, '8765', '--no-gui'], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    windowsHide: true,
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

  ipcMain.handle('o2-browser:set-viewport', (_ev, rect) => {
    if (rect && typeof rect === 'object') {
      viewport.visible = !!rect.visible
      if (typeof rect.x === 'number') viewport.x = rect.x
      if (typeof rect.y === 'number') viewport.y = rect.y
      if (typeof rect.width === 'number') viewport.width = rect.width
      if (typeof rect.height === 'number') viewport.height = rect.height
      if (viewport.visible && !tabOrder.length) {
        createTab(DEFAULT_HOME, true)
      }
      applyViewport()
    }
    return getPublicState()
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
