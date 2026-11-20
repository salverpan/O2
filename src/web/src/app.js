import { createApp, reactive, ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue/dist/vue.esm-bundler.js'
import Antd, { message, Modal } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { Marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import katex from 'katex'

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
const ATTACH_EXT = ['.xlsx', '.csv', '.pdf', '.doc', '.docx', '.md', '.markdown', '.json', '.txt', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.svg', '.webp', '.heif', '.heic']
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.svg', '.webp', '.heif', '.heic']

const App = {
  template: `
<a-config-provider :theme="theme" :locale="zhCN">
<div class="shell">
  <aside class="sider" :class="{ 'sider-hist': histMode }">
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
        <a-empty v-if="!histGroups.length" description="还没有历史对话" />
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
    <nav v-else class="nav">
      <div class="nav-switch">
        <span class="slide-pill" :style="navPillStyle"></span>
        <button v-for="n in navs" :key="n.key"
                :ref="(el) => bindMainNav(n.key, el)"
                :class="['nav-item', tab === n.key ? 'on' : '']"
                @click="tab = n.key">
          <span class="nav-ico" v-html="n.icon"></span>
          <span>{{ n.label }}</span>
        </button>
      </div>
      <button type="button" class="nav-item nav-history" @click="openHistBrowse">
        <span class="nav-ico" v-html="ICO.history"></span>
        <span>历史</span>
      </button>
      <section class="hist">
        <div class="hist-head">
          <span class="hist-head-label">历史对话</span>
          <span class="hist-head-actions">
            <a-tooltip title="新对话">
              <button type="button" class="hist-tool" @click="newChat">
                <span class="nav-ico" v-html="ICO.plus"></span>
              </button>
            </a-tooltip>
            <a-tooltip title="管理">
              <button type="button" class="hist-tool" :disabled="!histGroups.length" @click="openHistManage">
                <span class="nav-ico" v-html="ICO.manage"></span>
              </button>
            </a-tooltip>
          </span>
        </div>
        <div class="hist-scroll">
          <div v-if="!histGroups.length" class="hist-empty">暂无历史对话</div>
          <template v-for="g in histGroups" :key="g.key">
            <div class="hist-label">{{ g.label }}</div>
            <button type="button" v-for="c in g.items" :key="c.id"
                    :class="['hist-item', c.id === chatId ? 'on' : '']"
                    :title="c.title" @click="openHistChat(c)">
              <span v-if="c.pinned" class="hist-pin" v-html="ICO.pin"></span>
              <span class="hist-title">{{ c.title || '新对话' }}</span>
              <matrix-loader v-if="runningIds[c.id]" />
            </button>
          </template>
        </div>
      </section>
      <button type="button" :class="['nav-item', 'nav-settings', tab === 'settings' ? 'on' : '']"
              @click="tab = 'settings'">
        <span class="nav-ico" v-html="ICO.settings"></span>
        <span>设置</span>
      </button>
    </nav>
  </aside>

  <div class="main">
    <header v-if="tab === 'settings'" class="topbar">
      <h1>{{ pageTitle }}</h1>
      <span v-if="cfgSaveHint" class="settings-save-hint">{{ cfgSaveHint }}</span>
    </header>

    <div class="content" :class="['pane-' + tab, paneOn ? 'switching' : '']">
      <div class="pane-stage">
      <template v-if="tab === 'search'">
        <div class="hero">
          <h2>多模态智能检索</h2>
          <p class="lead">支持跨项目检索制度条文、财报指标、合同要素、结构化表格与图纸视觉索引。</p>
          <div class="search-row">
            <a-input
              v-model:value="q"
              size="large"
              allow-clear
              placeholder="输入关键词、文档标题、文号、公司主体、合同方或表头字段…"
              @pressEnter="doSearch" />
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
              <a-select-option value="text">正文与条文</a-select-option>
              <a-select-option value="table">数据表格切片</a-select-option>
              <a-select-option value="image">图片与图表索引</a-select-option>
            </a-select>
            <a-select v-model:value="filters.dept" placeholder="全部目录/部门" allow-clear
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
            <div v-for="(r, i) in results" :key="r.chunk_id" class="hit" :style="blockDelay(i)" @click="openDoc(r.doc_id, r.chunk_id)">
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
            <a-empty v-if="!loading && searched && !results.length" description="没有找到匹配内容" />
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
                    <div v-if="browserState.coPanel.waitingHuman || browserState.coPanel.aiActive"
                         :class="['ask-bw-badge', browserState.coPanel.waitingHuman ? 'human' : '']"
                         :title="browserState.coPanel.waitingHuman ? (browserState.coPanel.humanReason || '等待人工操作') : (browserState.coPanel.aiActionLabel || 'O2 正在操作浏览器')">
                      <span class="ask-bw-badge-dot"></span>
                      <span class="ask-bw-badge-txt">{{ browserState.coPanel.waitingHuman ? '等待您操作' : (browserState.coPanel.aiActionLabel || 'O2 操作中') }}</span>
                    </div>
                    <div class="ask-bw-zoom" title="固定 16:9 比例中心缩放（也可直接拖动四周边框或按住 Ctrl 滚轮缩放）">
                      <button type="button" class="ask-bw-zoom-btn" :disabled="askBwScale <= 0.65" @click="stepAskBwScale(-0.1)">−</button>
                      <button type="button" class="ask-bw-zoom-val" @click="resetAskBwScale">{{ Math.round(askBwScale * 100) }}%</button>
                      <button type="button" class="ask-bw-zoom-btn" :disabled="askBwScale >= 1.35" @click="stepAskBwScale(0.1)">+</button>
                    </div>
                    <button type="button" class="bw-btn" title="收起浏览器窗口"
                            @click="closeAskBrowserByUser" v-html="ICO.close"></button>
                  </div>
                  <div v-if="browserState.coPanel.waitingHuman" class="ask-bw-human-bar">
                    <div class="ask-bw-human-info">
                      <span class="ask-bw-human-pulse"></span>
                      <span class="ask-bw-human-text">{{ browserState.coPanel.humanReason || '需要您完成页面人机验证或登录，完成后将自动继续下一步' }}</span>
                    </div>
                    <button type="button" class="ask-bw-human-btn" @click="confirmHumanBrowserDone">我已完成，继续</button>
                  </div>
                  <div class="ask-bw-frame">
                    <div class="ask-bw-stage" ref="askBrowserStage">
                      <img v-if="hasNativeBrowser && (browserOccluded || askBwTransitioning) && browserPreviewUrl"
                           :src="browserPreviewUrl" class="bw-freeze" alt="" />
                      <div v-else-if="!hasNativeBrowser" class="bw-fallback">
                        <div class="bw-fallback-card">
                          <h3>在 O2 桌面窗口中使用协同浏览器</h3>
                          <p>通过 O2 桌面端启动后，此窗口将挂载固定 16:9 比例居中缩放的原生 Chromium 视图，支持 AI 模拟鼠标与人机同屏协同操作。</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="chatlog" ref="chatlog" @scroll.passive="onChatlogScroll">
            <div v-if="!messages.length" class="chat-empty">
              <h2>有什么可以帮你？</h2>
              <p>支持对话问答、本机命令执行、附件与图片解析及本地文档检索。</p>
              <div class="ask-chips">
                <button class="ask-chip" v-for="ex in askExamples" :key="ex" @click="askExample(ex)">{{ ex }}</button>
              </div>
            </div>

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
                <div v-if="m.role === 'assistant' && (m.content || (m.streaming && !m.ask))"
                     class="answer-text"
                     :ref="(el) => bindAnswer(m, el)"
                     @click="onAnswerClick($event, m)"></div>
                <div v-else-if="m.content" class="answer-text" v-html="renderAnswer(m.content, m)"
                     @click="onAnswerClick($event, m)"></div>
                <div v-else-if="m.stopped && !m.streaming && !m.ask" class="hint">已停止</div>
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
                  <div class="srcs-head" @click="toggleSrc(m)">
                    依据 {{ displaySources(m).length }} 条
                    <span class="hint">{{ m.showSrc ? '收起' : '展开' }}</span>
                  </div>
                  <div v-if="m.showSrc">
                    <div v-for="s in displaySources(m)" :key="s.n" class="src" @click="openDoc(s.doc_id, s.chunk_id)">
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

          <div class="composer">
            <div class="composer-box" :class="{ over: attachOver }"
                 @dragenter.prevent="onAttachEnter"
                 @dragover.prevent="onAttachEnter"
                 @dragleave.prevent="onAttachLeave"
                 @drop.prevent="onAttachDrop">
              <div v-if="attachments.length" class="attach-row">
                <div v-for="a in attachments" :key="a.id" :class="['attach-chip', a.state]" :title="a.error || a.name">
                  <span class="attach-name">{{ a.name }}</span>
                  <span v-if="a.state === 'parsing'" class="attach-pct">{{ a.percent || 0 }}%</span>
                  <button type="button" class="attach-x" @click="removeAttach(a.id)">×</button>
                </div>
              </div>
              <a-textarea v-model:value="question" :auto-size="{ minRows: 3, maxRows: 6 }"
                placeholder="输入问题，Enter 发送，Shift+Enter 换行"
                @pressEnter="onEnter" />
              <div class="composer-bar">
                <a-tooltip title="上传附件或图片">
                  <button type="button" class="attach-btn" :disabled="asking" @click="pickAttach">
                    <span class="icon-svg" v-html="ICO.plus"></span>
                  </button>
                </a-tooltip>
                <a-tooltip :title="askBrowserBtnTooltip">
                  <button type="button"
                          :class="[
                            'attach-btn',
                            'bw-toggle-btn',
                            askBrowserOpen ? 'on' : '',
                            browserState.coPanel.waitingHuman ? 'waiting-human' : (browserState.coPanel.aiActive ? 'ai-busy' : '')
                          ]"
                          @click="toggleAskBrowserByUser">
                    <span class="icon-svg" v-html="ICO.globe"></span>
                    <span v-if="browserState.coPanel.waitingHuman || browserState.coPanel.aiActive" class="bw-toggle-dot"></span>
                  </button>
                </a-tooltip>
                <input ref="attachInput" class="attach-input" type="file" multiple
                       accept=".xlsx,.csv,.pdf,.doc,.docx,.md,.markdown,.json,.txt,.jpg,.jpeg,.png,.tif,.tiff,.svg,.webp,.heif,.heic" @change="onAttachPicked" />
                <span class="spacer"></span>
                <div class="model-wrap" ref="modelWrap">
                  <button type="button" class="model-pill" :class="{ busy: asking }" @click.stop="toggleModelMenu">
                    <span v-if="channelLabel" class="model-pill-chan">{{ channelLabel }}</span>
                    <span v-if="channelLabel" class="model-pill-sep"></span>
                    <span class="model-pill-text" :data-label="modelLabel">{{ modelLabel }}</span>
                    <span class="model-caret" v-html="ICO.caret"></span>
                  </button>
                  <div v-if="menuOpen" class="model-pop" @click.stop>
                    <button v-if="effortOptions.length" type="button"
                            :class="['mp-row', menuPanel === 'effort' ? 'on' : '']"
                            @click="openPanel('effort')">
                      <span>思考程度</span>
                      <span class="mp-val">{{ effortLabel }}<span class="mp-chev" v-html="ICO.chevron"></span></span>
                    </button>
                    <button v-if="contextLabel" type="button"
                            :class="['mp-row', menuPanel === 'context' ? 'on' : '']"
                            @click="contextOptions.length > 1 && openPanel('context')">
                      <span>Context</span>
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
                <a-tooltip title="清空">
                  <a-button type="text" class="icon-btn" :disabled="asking" @click="clearChat">
                    <template #icon><span class="icon-svg" v-html="ICO.trash"></span></template>
                  </a-button>
                </a-tooltip>
                <a-tooltip :title="asking ? '停止' : '发送'">
                  <a-button type="primary" class="icon-btn send-btn" @click="asking ? stopAsk() : send()">
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
              <button type="button" class="bw-tab-x" title="关闭标签页"
                      @click.stop="closeBrowserTab(bt.id)" v-html="ICO.close"></button>
            </div>
            <button type="button" class="bw-new" title="新建标签页"
                    @click="newBrowserTab()" v-html="ICO.plus"></button>
          </div>
          <div class="bw-bar">
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
            <input class="bw-url"
                   v-model="browserUrlInput"
                   placeholder="输入网址或搜索词，按 Enter 访问"
                   @focus="onBrowserUrlFocus($event)"
                   @blur="onBrowserUrlBlur"
                   @keydown.enter.prevent="submitBrowserUrl" />
            <button v-if="hasNativeBrowser" type="button" class="bw-btn" title="开发者工具"
                    @click="browserDevTools" v-html="ICO.code"></button>
          </div>
          <div class="bw-stage" ref="browserStage">
            <img v-if="hasNativeBrowser && (browserOccluded || askBwTransitioning) && browserPreviewUrl"
                 :src="browserPreviewUrl" class="bw-freeze" alt="" />
            <div v-else-if="!hasNativeBrowser" class="bw-fallback">
              <div class="bw-fallback-card">
                <h3>在 O2 桌面窗口中使用内置浏览器</h3>
                <p>当前页面正运行在外部普通网页中。通过 O2 桌面端启动窗口后，此区域将挂载原生 Chromium 视图（持久化登录态、全权限开放、支持你与 O2 同屏同步操作）。</p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-if="catalogAlive" v-show="tab === 'catalog'" class="cat-workspace">
          <!-- 左侧：Cursor 风格项目与多级文件树（支持下钻到文件与拖拽移动） -->
          <aside class="cat-tree-pane">
            <div class="cat-tree-head">
              <div class="cat-tree-head-left" @click="selectTreeScope('', '')" title="点击回到全部项目">
                <span class="tree-chev open" v-html="ICO.chevron"></span>
                <span class="cat-tree-head-title">{{ catProject || '知识库资源管理器' }}</span>
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
                <span v-else :class="['tree-file-dot', extBadgeClass(row.doc.file_ext)]">{{ extBadgeText(row.doc.file_ext) }}</span>

                <span class="tree-node-name" :title="row.tooltip">{{ row.name }}</span>
                <span v-if="row.kind !== 'file'" class="tree-node-cnt">{{ row.count }}</span>

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
              <a-tooltip v-if="catProject" title="由 AI 自动分析当前项目下的杂项文件，按主题与性质归入子文件夹">
                <a-button :loading="organizing" @click="organizeCurrentProject">
                  AI 智能归档
                </a-button>
              </a-tooltip>
              <input ref="folderUploadInput" type="file" webkitdirectory directory multiple
                     style="display:none" @change="onFolderInputPicked" />
              <a-button class="cat-action-btn" @click="triggerFolderUpload">导入整个文件夹</a-button>
              <a-button class="cat-action-btn" type="primary" @click="openIngest()">+ 新增 / 批量导入</a-button>
            </div>

            <!-- 文件性质透视胶囊：混合视图使用多态属性列，选中单一性质时展开专属分列 -->
            <div class="type-capsules">
              <button type="button" :class="['type-cap', !catDocType ? 'on' : '']"
                      @click="setCatDocType('')">
                <span>全部性质 (混合多态视图)</span>
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
              <a-table :data-source="filteredDocs" :columns="dynamicColumns" row-key="id" size="middle"
                       :scroll="{ x: 980, y: tableY }"
                       :pagination="{ pageSize: 30, showSizeChanger: false, position: ['bottomCenter'] }"
                       :custom-row="rowClick">
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'title'">
                    <div class="doc-cell-main">
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
          <div class="settings-body" :class="{ switching: settingsOn }">
          <nav class="settings-nav">
            <span class="settings-nav-pill" :style="settingsPillStyle"></span>
            <button type="button" v-for="s in settingsPrimary"
                    :key="s.key"
                    :ref="(el) => bindSettingsNav(s.key, el)"
                    :class="['settings-nav-item', settingsSection === s.key ? 'on' : '']"
                    @click="settingsSection = s.key">{{ s.label }}</button>
          </nav>
          <section v-if="settingsSection === 'llm'" class="settings-card settings-llm">
            <div class="settings-card-head">
              <h3>智能问答</h3>
              <p>配置渠道与模型后即可提问。</p>
            </div>
            <div class="provider-layout">
              <div class="provider-nav">
                <div class="provider-list">
                  <span class="slide-pill" :style="llmPillStyle"></span>
                  <button type="button" v-for="p in cfg.providers" :key="p.id"
                          :ref="(el) => bindLlmProvider(p.id, el)"
                          :class="['provider-item', settingsPid === p.id ? 'on' : '']"
                          @click="settingsPid = p.id">
                    <span class="provider-item-name">{{ p.name }}</span>
                    <span class="provider-item-state">{{ p.api_key_set ? '已启用' : '未配置' }}</span>
                  </button>
                  <a-button class="provider-add" block @click="openAddProvider">添加渠道</a-button>
                </div>
              </div>
              <div class="provider-form" v-if="currentProvider">
                <a-form layout="vertical">
                  <a-form-item label="Base URL">
                    <a-input v-model:value="currentProvider.base_url" size="large"
                             :placeholder="urlPlaceholder(currentProvider)" />
                  </a-form-item>
                  <a-form-item label="API 格式">
                    <a-select v-model:value="currentProvider.protocol" size="large">
                      <a-select-option v-for="o in protocols" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
                    </a-select>
                  </a-form-item>
                  <a-form-item label="API Key">
                    <div class="field-with-action">
                      <a-input-password v-model:value="currentProvider.api_key" size="large"
                        :placeholder="currentProvider.api_key_set ? '已保存，留空则不修改' : '输入 API Key'"
                        @blur="saveProviderKey(currentProvider)" @pressEnter="saveProviderKey(currentProvider)" />
                      <a-button v-if="currentProvider.api_key_set" danger @click="clearProviderKey(currentProvider)">清除</a-button>
                    </div>
                  </a-form-item>
                  <a-form-item>
                    <div class="model-list-head">
                      <span>模型列表</span>
                      <div class="model-list-actions">
                        <a-button v-if="currentProvider.api_key_set" @click="syncProviderModels(currentProvider)">从接口同步</a-button>
                        <a-button type="primary" @click="openAddModel">+ 添加模型</a-button>
                      </div>
                    </div>
                    <div v-if="!(currentProvider.models && currentProvider.models.length)" class="model-empty">
                      <span class="model-empty-ico" v-html="ICO.info"></span>
                      <span>当前没有配置模型，添加模型后可在聊天中使用。</span>
                    </div>
                    <div v-else class="model-rows">
                      <div v-for="m in currentProvider.models" :key="m.id" class="model-row">
                        <div class="model-row-main">
                          <b>{{ m.label || m.id }}</b>
                          <span v-if="m.label && m.label !== m.id" class="hint">{{ m.id }}</span>
                        </div>
                        <button type="button" class="model-row-del" @click="removeProviderModel(currentProvider, m.id)">删除</button>
                      </div>
                    </div>
                  </a-form-item>
                </a-form>
                <a-button class="provider-del" danger @click="removeProvider(currentProvider)">删除渠道</a-button>
              </div>
            </div>
          </section>

          <section v-else-if="settingsSection === 'api'" class="settings-card settings-llm">
            <div class="settings-card-head">
              <h3>外部 API 连接库</h3>
              <p>添加连接后，对话中可按说明调用；密钥运行时注入。</p>
            </div>
            <div class="provider-layout">
              <div class="provider-nav">
                <div class="provider-list">
                  <span class="slide-pill" :style="apiPillStyle"></span>
                  <button type="button" v-for="c in cfg.api_connectors" :key="c.id"
                          :ref="(el) => bindApiConnector(c.id, el)"
                          :class="['provider-item', settingsApiId === c.id ? 'on' : '']"
                          @click="settingsApiId = c.id">
                    <span class="provider-item-name">{{ c.name }}</span>
                    <span class="provider-item-state">{{ apiConnectorStateText(c) }}</span>
                  </button>
                  <a-button class="provider-add" block @click="openAddApiConnector">添加连接</a-button>
                </div>
              </div>
              <div class="provider-form" v-if="currentApiConnector">
                <a-form layout="vertical">
                  <div class="form-grid-2">
                    <a-form-item label="连接名称">
                      <a-input v-model:value="currentApiConnector.name" size="large" placeholder="如 FRED、高德天气、企业ERP" />
                    </a-form-item>
                    <a-form-item label="API 协议">
                      <a-select v-model:value="currentApiConnector.protocol" size="large">
                        <a-select-option v-for="o in apiProtocols" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
                      </a-select>
                    </a-form-item>
                  </div>
                  <a-form-item label="Base URL">
                    <div class="field-with-action">
                      <a-input v-model:value="currentApiConnector.base_url" size="large"
                               placeholder="https://api.example.com" />
                      <a-button :loading="apiDiscovering" @click="discoverIntoConnector(currentApiConnector)">解析 OpenAPI</a-button>
                    </div>
                  </a-form-item>
                  <div class="form-grid-2">
                    <a-form-item label="鉴权方式">
                      <a-select v-model:value="currentApiConnector.auth_type" size="large">
                        <a-select-option v-for="o in apiAuthTypes" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
                      </a-select>
                    </a-form-item>
                    <a-form-item v-if="currentApiConnector.auth_type === 'bearer'" label="Authorization 前缀">
                      <a-input v-model:value="currentApiConnector.auth_prefix" size="large" placeholder="Bearer" />
                    </a-form-item>
                    <a-form-item v-else-if="currentApiConnector.auth_type === 'header' || currentApiConnector.auth_type === 'hmac_sha256'" label="密钥 Header 名">
                      <a-input v-model:value="currentApiConnector.header_name" size="large" placeholder="X-Api-Key" />
                    </a-form-item>
                    <a-form-item v-else-if="currentApiConnector.auth_type === 'query'" label="密钥 Query 参数名">
                      <a-input v-model:value="currentApiConnector.query_name" size="large" placeholder="api_key" />
                    </a-form-item>
                    <a-form-item v-else-if="currentApiConnector.auth_type === 'oauth2_client_credentials'" label="OAuth2 Token URL">
                      <a-input v-model:value="currentApiConnector.token_url" size="large" placeholder="https://example.com/oauth/token" />
                    </a-form-item>
                  </div>
                  <a-form-item v-if="currentApiConnector.auth_type !== 'none'" :label="apiKeyLabel(currentApiConnector.auth_type)">
                    <div class="field-with-action">
                      <a-input-password v-model:value="currentApiConnector.api_key" size="large"
                        :placeholder="currentApiConnector.api_key_set ? '已保存，留空保持不变' : '填入密钥（运行时自动注入，不回显给模型）'"
                        @blur="saveApiConnectorKey(currentApiConnector)" @pressEnter="saveApiConnectorKey(currentApiConnector)" />
                      <a-button v-if="currentApiConnector.api_key_set" danger @click="clearApiConnectorKey(currentApiConnector)">清除</a-button>
                    </div>
                  </a-form-item>
                  <a-form-item v-if="needsApiSecret(currentApiConnector.auth_type)" :label="apiSecretLabel(currentApiConnector.auth_type)">
                    <div class="field-with-action">
                      <a-input-password v-model:value="currentApiConnector.api_secret" size="large"
                        :placeholder="currentApiConnector.api_secret_set ? '已保存，留空保持不变' : '填入 Secret / 密码'"
                        @blur="saveApiConnectorSecret(currentApiConnector)" @pressEnter="saveApiConnectorSecret(currentApiConnector)" />
                      <a-button v-if="currentApiConnector.api_secret_set" danger @click="clearApiConnectorSecret(currentApiConnector)">清除</a-button>
                    </div>
                  </a-form-item>
                  <div v-if="currentApiConnector.auth_type === 'hmac_sha256'" class="form-grid-2">
                    <a-form-item label="签名参数 / 头名称">
                      <a-input v-model:value="currentApiConnector.signature_param" size="large" placeholder="signature" />
                    </a-form-item>
                    <a-form-item label="签名位置与编码">
                      <a-input-group compact>
                        <a-select v-model:value="currentApiConnector.signature_in" size="large" style="width: 50%">
                          <a-select-option value="query">Query 参数</a-select-option>
                          <a-select-option value="header">HTTP Header</a-select-option>
                        </a-select>
                        <a-select v-model:value="currentApiConnector.signature_encoding" size="large" style="width: 50%">
                          <a-select-option value="hex">Hex</a-select-option>
                          <a-select-option value="base64">Base64</a-select-option>
                        </a-select>
                      </a-input-group>
                    </a-form-item>
                  </div>
                  <a-form-item>
                    <label class="embed-switch">
                      <span>允许写入操作（POST / PUT / PATCH / DELETE / GraphQL mutation）</span>
                      <a-switch v-model:checked="currentApiConnector.allow_write" />
                    </label>
                  </a-form-item>
                  <a-form-item label="给 AI 的使用说明（常用路径、参数、返回结构与调用示例）">
                    <a-textarea v-model:value="currentApiConnector.notes" :auto-size="{ minRows: 4, maxRows: 10 }"
                      placeholder="写明接口用途、路径、必填/选填参数及示例。免费公开接口也请写清，方便 AI 在对话中自动识别并调用。" />
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
                  <span>暂无连接，点击左侧「添加连接」开始。</span>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="settingsSection === 'embed'" class="settings-card settings-llm">
            <div class="settings-card-head">
              <h3>Embedding 向量化</h3>
              <p>按语义找得更准，但更慢、更费额度。</p>
            </div>
            <div class="embed-actions">
              <label class="embed-switch">
                <span>在搜索和回答中使用</span>
                <a-switch v-model:checked="cfg.embed_use" />
              </label>
              <label class="embed-switch">
                <span>运行向量化</span>
                <a-switch :checked="cfg.embed_running" @change="toggleEmbedRun" />
              </label>
            </div>
            <div class="provider-layout">
              <div class="provider-nav">
                <div class="provider-list">
                  <span class="slide-pill" :style="embedPillStyle"></span>
                  <button type="button" v-for="p in cfg.embed_providers" :key="p.id"
                          :ref="(el) => bindEmbedProvider(p.id, el)"
                          :class="['provider-item', settingsEmbedPid === p.id ? 'on' : '']"
                          @click="selectEmbedChannel(p)">
                    <span class="provider-item-name">{{ p.name }}</span>
                    <span class="provider-item-state">{{ p.api_key_set ? '已启用' : '未配置' }}</span>
                  </button>
                  <a-button class="provider-add" block @click="openAddEmbedProvider">添加渠道</a-button>
                </div>
              </div>
              <div class="provider-form" v-if="currentEmbedProvider">
                <a-form layout="vertical">
                  <a-form-item label="Base URL">
                    <a-input v-model:value="currentEmbedProvider.base_url" size="large"
                             :placeholder="embedUrlPlaceholder(currentEmbedProvider)" />
                  </a-form-item>
                  <a-form-item label="API 格式">
                    <a-select v-model:value="currentEmbedProvider.protocol" size="large">
                      <a-select-option v-for="o in embedProtocols" :key="o.id" :value="o.id">{{ o.label }}</a-select-option>
                    </a-select>
                  </a-form-item>
                  <a-form-item label="API Key">
                    <div class="field-with-action">
                      <a-input-password v-model:value="currentEmbedProvider.api_key" size="large"
                        :placeholder="currentEmbedProvider.api_key_set ? '已保存，留空则不修改' : '输入 API Key'"
                        @blur="saveEmbedKey(currentEmbedProvider)" @pressEnter="saveEmbedKey(currentEmbedProvider)" />
                      <a-button v-if="currentEmbedProvider.api_key_set" danger @click="clearEmbedKey(currentEmbedProvider)">清除</a-button>
                    </div>
                  </a-form-item>
                  <a-form-item v-if="currentEmbedProvider.models && currentEmbedProvider.models.length" label="当前模型">
                    <a-select v-model:value="cfg.embed_model" size="large"
                              @change="cfg.embed_provider_id = currentEmbedProvider.id">
                      <a-select-option v-for="m in currentEmbedProvider.models" :key="m.id" :value="m.id">
                        {{ m.label || m.id }}
                      </a-select-option>
                    </a-select>
                  </a-form-item>
                  <a-form-item>
                    <div class="model-list-head">
                      <span>模型列表</span>
                      <div class="model-list-actions">
                        <a-button v-if="currentEmbedProvider.api_key_set" @click="syncEmbedModels(currentEmbedProvider)">从接口同步</a-button>
                        <a-button type="primary" @click="openAddEmbedModel">+ 添加模型</a-button>
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
                        <button type="button" class="model-row-del" @click.stop="removeEmbedModel(currentEmbedProvider, m.id)">删除</button>
                      </div>
                    </div>
                  </a-form-item>
                </a-form>
                <a-button class="provider-del" danger @click="removeEmbedProvider(currentEmbedProvider)">删除渠道</a-button>
              </div>
            </div>
            <div class="embed-run">
              <span class="hint">{{ embedStatusText }}</span>
            </div>
          </section>

          <section v-else-if="settingsSection === 'ocr'" class="settings-card">
            <div class="settings-card-head">
              <h3>文字识别</h3>
              <p>PaddleOCR-VL。新增或更新文件时用于识别扫描件。</p>
            </div>
            <a-form layout="vertical">
              <a-form-item label="PaddleOCR Token">
                <div class="field-with-action">
                  <a-input-password v-model:value="cfg.paddle_token" size="large"
                    :placeholder="cfg.paddle_token_set ? '已保存，留空则不修改' : '填入后用于新增和更新文件'"
                    @blur="savePaddle" @pressEnter="savePaddle" />
                  <a-button v-if="cfg.paddle_token_set" danger @click="clearPaddle">清除</a-button>
                </div>
              </a-form-item>
            </a-form>
          </section>

          <section v-else-if="settingsSection === 'index'" class="settings-card">
            <div class="settings-card-head">
              <h3>文件索引</h3>
              <p>指定源文件夹后重建索引。</p>
            </div>
            <a-form layout="vertical">
              <a-form-item label="文件源文件夹">
                <a-input v-model:value="cfg.src_root" size="large" />
              </a-form-item>
              <a-form-item label="当前索引">
                <div class="index-row">
                  <span class="hint">{{ stats.docs }} 份文件 · {{ stats.chunks }} 条</span>
                  <a-button :loading="stats.rebuilding" @click="rebuild">重建索引</a-button>
                </div>
              </a-form-item>
            </a-form>
          </section>
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
      <span v-for="(p, pi) in recordPills(doc)" :key="pi" class="poly-pill">
        <span class="poly-pill-k">{{ p.k }}:</span>
        <span class="poly-pill-v">{{ p.v }}</span>
      </span>
      <span class="loc">{{ doc.n_pages }} 页 · {{ chunkProfileLabel(doc.chunk_profile) }}</span>
    </div>

    <div class="docview-bar">
      <span class="seg">
        <span :class="['seg-item', docView === 'pdf' ? 'on' : '']" @click="setDocView('pdf')">原文视图</span>
        <span :class="['seg-item', docView === 'text' ? 'on' : '']" @click="setDocView('text')">结构化切片 ({{ (doc.chunks || []).length }})</span>
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
           :ok-text="ingest.batchMode ? (ingest.batchRunning ? '正在批量入库…' : '完成') : '确认入库'"
           :ok-button-props="{ disabled: ingest.parsing || ingest.batchRunning || (!ingest.batchMode && !ingest.tmp_id) }"
           @ok="onIngestOk" @cancel="resetIngest">
    <div class="ingest-dest">
      <a-form-item label="项目">
        <a-auto-complete v-model:value="ingest.project" :options="projectOptions"
                         placeholder="如：集团制度库" />
      </a-form-item>
      <a-form-item label="文件夹">
        <a-auto-complete v-model:value="ingest.folder" :options="folderOptions"
                         placeholder="留空则由 AI 归类" />
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
          <p class="ingest-hint">{{ ingest.doc_id ? '替换当前文件，入库前可以改字段。' : '可多选。单个文件会先核对，再入库。' }}</p>
        </div>
      </div>
      <div v-if="!ingest.filename" class="ingest-chips">
        <span>PDF</span><span>Word</span><span>Excel</span><span>PPT</span><span>图片</span><span>文本</span>
      </div>
    </a-upload-dragger>

    <div v-if="ingest.parsing || ingest.batchRunning" class="ingest-progress">
      <a-progress :percent="ingest.percent" status="active" :show-info="true" />
      <div class="ingest-status">{{ ingest.progressText || '正在识别…' }}</div>
    </div>

    <!-- 批量队列展示 -->
    <div v-if="ingest.batchMode && ingest.batchItems.length" class="batch-queue">
      <div v-for="(bi, idx) in ingest.batchItems" :key="idx" class="batch-row">
        <span class="batch-row-name" :title="bi.name">{{ bi.name }}</span>
        <a-tag v-if="bi.doc_type" :color="docTypeColor(bi.doc_type)">{{ docTypeLabel(bi.doc_type) }}</a-tag>
        <span class="batch-row-meta">{{ bi.folder || '' }}</span>
        <a-tag :color="bi.state === 'done' ? 'green' : (bi.state === 'error' ? 'red' : (bi.state === 'running' ? 'blue' : 'default'))">
          {{ bi.statusText }}
        </a-tag>
      </div>
    </div>

    <!-- 单文件精修表单 -->
    <a-form v-if="!ingest.batchMode && ingest.tmp_id" layout="vertical" class="ingest-form">
      <div class="form-grid-3">
        <a-form-item label="文件性质（AI 智能判定）">
          <a-select v-model:value="ingest.doc_type" @change="onIngestTypeChange">
            <a-select-option v-for="t in DOC_TYPE_SPECS" :key="t.id" :value="t.id">{{ t.label }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="切分与索引策略">
          <a-select v-model:value="ingest.chunk_profile">
            <a-select-option value="auto">智能自动路由</a-select-option>
            <a-select-option value="laws">条文切分 (章/节/条)</a-select-option>
            <a-select-option value="report">层级章节切分 (标题树)</a-select-option>
            <a-select-option value="table">表格结构化切分 (带表头)</a-select-option>
            <a-select-option value="image">视觉与OCR双轨索引</a-select-option>
            <a-select-option value="one">整篇不切分</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="发布/归档日期">
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
          <a-input v-model:value="ingest.doc_no" placeholder="如：南物流发〔2025〕142号" />
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
          <a-input v-model:value="ingest.meta.entity" placeholder="如：物流集团本部" />
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
                         placeholder="选择已有项目或输入新项目名（如：南宁冷链物流园项目）" />
      </a-form-item>
      <a-form-item :label="folderModal.mode === 'rename' ? '新的文件夹路径（多级用 / 分隔，也可修改所属项目）' : '子文件夹路径（可选，多级目录用 / 分隔）'">
        <a-input v-model:value="folderModal.path" size="large"
                 placeholder="如：01-立项与批复 或 02-合同协议/采购合同（留空则仅创建项目）" />
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
      <a-form-item label="Base URL（或 OpenAPI JSON 地址）">
        <div class="field-with-action">
          <a-input v-model:value="addApiConnector.base_url" size="large" placeholder="https://api.example.com" />
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
    const theme = {
      token: {
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
    const navs = [
      { key: 'ask', label: '问答', icon: ICO.ask },
      { key: 'browser', label: '浏览器', icon: ICO.globe },
      { key: 'search', label: '检索', icon: ICO.search },
      { key: 'catalog', label: '文件', icon: ICO.catalog },
    ]
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
      { search: '检索', ask: '问答', browser: '浏览器', catalog: '文件', settings: '设置' }[tab.value] || 'O2'
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
        m && m.role === 'user' && ((m.content || '').trim() || (m.packed || '').trim() || (m.files || []).length)
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
      if (c._live) return computeHasBody(c._live)
      if (typeof c._hasBody === 'boolean') return c._hasBody
      c._hasBody = computeHasBody(c.messages)
      return c._hasBody
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
    let opened = seeded.find((c) => c.id === storedId)
    if (!opened && migrated) opened = seeded[0]
    const chatId = ref(opened ? opened.id : '')
    const messages = ref(opened ? liveOf(opened) : [])
    const histMode = ref('')
    const histPicked = reactive({})

    let persistTimer = 0
    let persistIdleId = 0
    let persistPending = false

    function flushPersistConversations() {
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
      const data = conversations.value.map((c) => ({
        id: c.id,
        title: c.title || '新对话',
        titleReady: !!c.titleReady,
        createdAt: c.createdAt || 0,
        updatedAt: c.updatedAt || 0,
        activeAt: c.activeAt || c.createdAt || 0,
        pinned: !!c.pinned,
        pinnedAt: c.pinnedAt || 0,
        messages: c.messages || [],
      }))
      try {
        localStorage.setItem(CHATS_KEY, JSON.stringify(data))
      } catch (e) {
        const slim = data.map((c) => ({
          ...c,
          messages: (c.messages || []).map((m) => ({
            role: m.role, content: m.content || '', files: m.files || [],
            sources: [], tools: [], showSrc: false, stopped: !!m.stopped,
            error: m.error || '', ask: m.ask || null,
          })),
        }))
        try { localStorage.setItem(CHATS_KEY, JSON.stringify(slim)) } catch (e2) { /* 配额满则忽略 */ }
      }
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
      return '检索「' + (t.query || '') + '」'
    }
    function toolMeta(t) {
      if (!t || t.kind === 'think') return ''
      if (t.kind === 'api') {
        if (t.state !== 'done') return '调用中…'
        return t.note || '完成'
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
      if (!st || !st.el || !st.el.isConnected) return
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
      chatId.value = ''
      messages.value = []
      question.value = ''
      attachments.value = []
      asking.value = false
      try { localStorage.removeItem(CHAT_ID_KEY) } catch (e) { /* ignore */ }
      tab.value = 'ask'
    }

    function clearChat() {
      const id = chatId.value
      stopRun(id)
      delete runningIds[id]
      chatId.value = ''
      if (id) {
        conversations.value = conversations.value.filter((c) => c.id !== id)
        delete histPicked[id]
        persistConversations()
      }
      messages.value = []
      question.value = ''
      attachments.value = []
      asking.value = false
      try {
        localStorage.removeItem(CHAT_ID_KEY)
        sessionStorage.removeItem(CHAT_KEY)
        sessionStorage.removeItem(CHAT_DRAFT_KEY)
      } catch (e) { /* ignore */ }
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
        c = {
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
        conversations.value.unshift(c)
        chatId.value = c.id
      } else if (!c.titleReady && (!c.title || c.title === '新对话')) {
        const t = fallbackTitle(text)
        if (t) c.title = t
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
      const homeId = chatId.value
      if (homeId && runs.has(homeId)) return
      arming = true
      let convId = ''
      let cur = null
      let ctrl = null
      let hist = null
      let priorSources = null
      try {
      if (attachments.value.some((a) => a.state === 'parsing')) return
      const vision = modelHasVision.value
      for (const a of attachments.value) {
        if (a.state !== 'ready' || a.kind !== 'image' || vision || !a.file) continue
        a.state = 'parsing'
        a.percent = 2
        a.kind = 'text'
        a.data = ''
        await parseAttach(a.file, a, false)
      }
      if (chatId.value !== homeId) return
      if (attachments.value.some((a) => a.state === 'parsing')) return
      if (attachments.value.some((a) => a.state === 'error')) {
        message.warning('有附件未能处理')
        return
      }
      const ready = attachments.value.filter((a) => a.state === 'ready' && ((a.text || '').trim() || a.kind === 'image'))
      const text = (typeof preset === 'string' ? preset : (question.value || '')).trim()
      if (!text && !ready.length) return
      question.value = ''
      const textFiles = ready.filter((a) => a.kind !== 'image')
      const images = ready.filter((a) => a.kind === 'image').slice(0, 4).map((a) => ({
        name: a.name, mime: a.mime || 'image/jpeg', data: a.data,
      }))
      const files = ready.map((a) => ({ name: a.name, source: a.source || '', text: a.text || '', kind: a.kind || 'text' }))
      attachments.value = []
      ensureChat(text || (files[0] && files[0].name) || '')
      convId = chatId.value
      const conv = conversations.value.find((x) => x.id === convId)
      if (conv) {
        if (!conv._live) conv._live = messages.value
        else if (messages.value !== conv._live) messages.value = conv._live
      }
      messages.value.push({
        id: newChatId(),
        role: 'user',
        content: text,
        files: files.map((f) => ({ name: f.name, source: f.source })),
        images,
        packed: packUser(text, textFiles),
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
        cur.streaming = false
        scheduleAnswer(cur)
        runs.delete(convId)
        delete runningIds[convId]
        const own = conversations.value.find((x) => x.id === convId)
        attachCitedSources(cur, collectSources((own && own._live) || []))
        saveConv(convId)
        scheduleTitle(convId)
        if (chatId.value === convId) {
          asking.value = false
          scrollChat()
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
        cur.content = ''
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
          }
          if (!parentPath) {
            for (const d of rootFiles) pushFile(d, 1)
          }
        }
        walk('')
      }
      return rows
    })

    function toggleTreeNodeExpand(row) {
      if (!row || row.kind === 'file' || !row.hasChildren) return
      treeExpanded[row.key] = !row.open
    }
    function onTreeRowClick(row) {
      if (!row) return
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
      providers: [],
      embed_providers: [],
      embed_provider_id: '',
      embed_model: '',
      embed_use: false,
      embed_running: false,
      api_connectors: [],
      api_key_set: false, paddle_token: '', paddle_token_set: false,
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
      { id: 'oauth2_client_credentials', label: 'OAuth2 / 企业令牌 (自动换取 access_token)' },
      { id: 'cookie', label: 'Cookie 凭证' },
    ])
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
    const settingsPrimary = [
      { key: 'llm', label: '智能问答' },
      { key: 'api', label: '外部 API' },
      { key: 'embed', label: 'Embedding' },
      { key: 'ocr', label: '文字识别' },
      { key: 'index', label: '高级' },
    ]
    const settingsSection = ref('llm')
    watch(settingsSection, pulseSettings)
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
        const nr = el.parentElement.getBoundingClientRect()
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
        return `正在嵌入 ${p.done || 0} / ${p.total || tot}`
      }
      if (cfg.embed_running) return `已启动 · 已嵌入 ${done} / ${tot}`
      return `已停止 · 已嵌入 ${done} / ${tot}`
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
      (cfg.providers || []).map((p) => [p.id, p.name, p.protocol, p.base_url, JSON.stringify(p.models)]),
      cfg.embed_use, cfg.embed_provider_id, cfg.embed_model,
      (cfg.embed_providers || []).map((p) => [p.id, p.name, p.protocol, p.base_url, JSON.stringify(p.models)]),
      (cfg.api_connectors || []).map((c) => [
        c.id, c.name, c.protocol, c.base_url, c.auth_type, c.auth_prefix,
        c.header_name, c.query_name, c.signature_param, c.signature_in,
        c.signature_encoding, c.token_url, c.allow_write, c.notes,
        JSON.stringify(c.endpoints || []),
      ]),
    ], scheduleSave)

    function apiConnectorStateText(c) {
      if (!c) return ''
      const proto = String(c.protocol || 'rest').toUpperCase()
      const auth = c.auth_type === 'none' ? '免费' : (c.api_key_set || c.api_secret_set ? '已配密钥' : '待配密钥')
      return `${proto} · ${auth}${c.allow_write ? ' · 可写' : ''}`
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
        message.success(`已解析 ${res.endpoints ? res.endpoints.length : 0} 个端点并填入使用说明`)
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
      ingest.folder = j.folder || ingest.folder || ''
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

    async function parseSingleFileUpload(file, relPath, onProg) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('project', ingest.project || '')
      fd.append('folder', ingest.folder || '')
      if (relPath) fd.append('rel_path', relPath)
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

    async function runBatchIngest(files) {
      if (ingestAbort) ingestAbort.abort()
      ingestAbort = new AbortController()
      ingest.batchMode = true
      ingest.batchRunning = true
      ingest.filename = `已选择 ${files.length} 个文件批量入库`
      ingest.batchItems = files.map((f) => ({
        file: f,
        name: f.webkitRelativePath || f.name,
        doc_type: '',
        folder: '',
        state: 'pending',
        statusText: '等待中',
      }))
      let okCount = 0
      for (let i = 0; i < ingest.batchItems.length; i++) {
        const item = ingest.batchItems[i]
        item.state = 'running'
        item.statusText = '解析中…'
        ingest.percent = Math.round((i / ingest.batchItems.length) * 100)
        ingest.progressText = `正在处理 (${i + 1}/${ingest.batchItems.length})：${item.file.name}`
        try {
          const parsed = await parseSingleFileUpload(item.file, item.file.webkitRelativePath || '', (ev) => {
            item.statusText = ev.message || '识别中…'
          })
          item.doc_type = parsed.doc_type || 'general'
          item.folder = parsed.folder || ingest.folder || ''
          item.statusText = '正在入库…'
          const committed = await api.post('/api/docs/commit', {
            tmp_id: parsed.tmp_id,
            project: parsed.project || ingest.project || '集团制度库',
            folder: parsed.folder || ingest.folder || '',
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
          item.state = 'done'
          item.statusText = '已入库'
          okCount++
        } catch (e) {
          if (e && e.name === 'AbortError') break
          item.state = 'error'
          item.statusText = (e && e.message) ? e.message.slice(0, 26) : '失败'
        }
      }
      ingest.percent = 100
      ingest.progressText = `批量处理完成：成功 ${okCount} / ${ingest.batchItems.length} 份`
      ingest.batchRunning = false
      ingestAbort = null
      await loadFacets()
      await loadDocs()
      await loadStats()
      if (okCount > 0) message.success(`成功导入 ${okCount} 份文件`)
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

    loadStats()
    loadFacets()
    loadDocs()
    loadConfig()
    loadModels()

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
      messages, question, asking, chatlog, turns, send, stopAsk, newChat, clearChat, onEnter,
      chatId, histMode, histPicked, histGroups, histPickCount, histPaneTitle, histPinLabel, runningIds,
      openHistManage, openHistBrowse, closeHistManage, openHistChat, onHistRow, togglePick, pinPicked, deletePicked,
      renderAnswer, onAnswerClick, displaySources, toggleSrc, bindAnswer, scheduleAnswer, blockDelay, msgDelay,
      toolDotClass, toolLabel, toolMeta, sbfWindowH, sbfOffset, sbfItemClass,
      attachments, attachInput, attachOver, pickAttach, onAttachPicked,
      onAttachEnter, onAttachLeave, onAttachDrop, removeAttach,
      menuOpen, menuPanel, modelWrap, modelQuery, modelPill, modelLabel, channelLabel, modelHasVision, effortLabel,
      effortOptions, contextLabel, contextOptions, groupedModels, filteredModels,
      toggleModelMenu, openPanel, setEffort, setContext, setChatModel,
      settingsPid, settingsEmbedPid, settingsApiId, settingsPrimary, settingsSection, settingsPillStyle, bindSettingsNav,
      navPillStyle, llmPillStyle, embedPillStyle, apiPillStyle, bindMainNav, bindLlmProvider, bindEmbedProvider, bindApiConnector,
      currentProvider, currentEmbedProvider, currentApiConnector, addProvider, addEmbedProvider, addModel, addApiConnector,
      urlPlaceholder, embedUrlPlaceholder, embedProtocols, embedStatusText,
      apiProtocols, apiAuthTypes, apiPresets, apiTesting, apiTestHint, apiDiscovering,
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
      scopeTotalCount, scopeDocTypeCapsules, filteredDocs, dynamicColumns, columns,
      docTypeLabel, docTypeColor, chunkProfileLabel, extBadgeText, extBadgeClass,
      recordMetaVal, recordPills, recordSummary, renderChunkTable,
      catalogAlive,
      isProjExpanded, selectTreeScope, setCatDocType,
      cursorTreeRows, dropTargetKey, activeTreeDocId,
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
      openIngest, onIngestFile, onIngestOk, resetIngest, onDocOp,
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

const app = createApp(App)
app.use(Antd)
app.component('matrix-loader', MatrixLoader)
app.mount('#app')
