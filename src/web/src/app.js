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
}

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
          <h2>智能搜索</h2>
          <p class="lead">支持按标题、编号与正文关键词检索本地文档。</p>
          <div class="search-row">
            <a-input
              v-model:value="q"
              size="large"
              allow-clear
              placeholder="输入关键词、文档标题或编号"
              @pressEnter="doSearch" />
            <a-button type="primary" size="large" :loading="loading" @click="doSearch">搜索</a-button>
          </div>
          <div class="filters">
            <a-select v-model:value="filters.dept" placeholder="全部分类" allow-clear
                      size="large" class="w-dept" @change="doSearch">
              <a-select-option v-for="d in facets.depts" :key="d" :value="d">{{ d }}</a-select-option>
            </a-select>
            <a-select v-model:value="filters.status" placeholder="全部状态" allow-clear
                      size="large" class="w-status" @change="doSearch">
              <a-select-option v-for="s in facets.statuses" :key="s" :value="s">{{ s }}</a-select-option>
            </a-select>
            <a-select v-model:value="filters.category" placeholder="全部类型" allow-clear
                      size="large" class="w-type" @change="doSearch">
              <a-select-option v-for="c in facets.categories" :key="c" :value="c">{{ c }}</a-select-option>
            </a-select>
            <span class="spacer"></span>
            <span class="hint" v-if="results.length">{{ results.length }} 条结果</span>
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
                  <a-tag>{{ r.dept }}</a-tag>
                  <span class="docno" v-if="r.doc_no">{{ r.doc_no }}</span>
                  <a-tag v-if="r.status !== '现行'" color="orange">{{ r.status }}</a-tag>
                </div>
                <span class="loc">
                  <span v-if="r.article">{{ r.article }}</span>
                  <span v-if="r.page_start"> · 第 {{ r.page_start }} 页</span>
                </span>
              </div>
              <div class="hit-title">{{ r.title }}</div>
              <div class="hit-body" v-html="r.snippet"></div>
              <div class="hit-open">打开原文</div>
            </div>
            <a-empty v-if="!loading && searched && !results.length" description="没有找到匹配内容" />
          </div>
        </a-spin>
      </template>

      <template v-else-if="tab === 'ask'">
        <div class="chatwrap">
          <div class="chatlog" ref="chatlog">
            <div v-if="!messages.length" class="chat-empty">
              <h2>有什么可以帮你？</h2>
              <p>支持对话问答、本机命令执行、附件与图片解析及本地文档检索。</p>
              <div class="ask-chips">
                <button class="ask-chip" v-for="ex in askExamples" :key="ex" @click="askExample(ex)">{{ ex }}</button>
              </div>
            </div>

            <div v-for="(m, i) in messages" :key="m.id || ('i' + i)" :class="['msg', m.role]" :style="blockDelay(i)">
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
                <button type="button" class="attach-btn" :disabled="asking" @click="pickAttach">
                  <span class="icon-svg" v-html="ICO.plus"></span>
                </button>
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
      </template>

      <template v-else-if="tab === 'browser'">
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
            <img v-if="hasNativeBrowser && browserOccluded && browserPreviewUrl"
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

      <template v-else-if="tab === 'catalog'">
        <div class="filters mb">
          <a-select v-model:value="catDept" placeholder="全部分类" allow-clear
                    size="large" class="w-cat-dept" @change="loadDocs">
            <a-select-option v-for="d in facets.depts" :key="d" :value="d">{{ d }}</a-select-option>
          </a-select>
          <span class="hint">{{ docs.length }} 份</span>
          <span class="spacer"></span>
          <a-tooltip title="新增文件">
            <a-button type="primary" class="icon-btn" @click="openIngest()">
              <template #icon><span class="icon-svg" v-html="ICO.plus"></span></template>
            </a-button>
          </a-tooltip>
        </div>
        <div class="table-card" ref="tableCard">
          <a-table :data-source="docs" :columns="columns" row-key="id" size="middle"
                   :scroll="{ x: 960, y: tableY }"
                   :pagination="{ pageSize: 30, showSizeChanger: false, position: ['bottomCenter'] }"
                   :custom-row="rowClick">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'title'">
                <a class="doc-title" :title="record.title || record.rel_path">{{ record.title || record.rel_path }}</a>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag v-if="record.status !== '现行'" color="orange">{{ record.status }}</a-tag>
                <a-tag v-else>{{ record.status }}</a-tag>
              </template>
              <template v-else-if="column.key === 'n_chunks'">{{ record.n_chunks }}</template>
              <template v-else-if="column.key === 'op'">
                <div class="doc-op" @click.stop>
                  <a-dropdown :trigger="['click']">
                    <a class="op-link" @click.prevent>操作</a>
                    <template #overlay>
                      <a-menu @click="(e) => onDocOp(e, record)">
                        <a-menu-item v-if="record.status !== '现行'" key="现行">现行</a-menu-item>
                        <a-menu-item v-if="record.status !== '试行'" key="试行">试行</a-menu-item>
                        <a-menu-item v-if="record.status !== '已废止'" key="已废止">废止</a-menu-item>
                        <a-menu-item key="update">更新</a-menu-item>
                      </a-menu>
                    </template>
                  </a-dropdown>
                </div>
              </template>
            </template>
          </a-table>
        </div>
      </template>

      <template v-else-if="tab === 'settings'">
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
      <a-button @click="openFile">打开原文件</a-button>
    </template>
    <div class="docmeta" v-if="doc.title">
      <a-tag>{{ doc.dept }}</a-tag>
      <span v-if="doc.doc_no" class="docno">{{ doc.doc_no }}</span>
      <span v-if="doc.issued_date">{{ doc.issued_date }}</span>
      <span v-if="doc.handler">经办人 {{ doc.handler }}</span>
      <a-tag v-if="doc.status !== '现行'" color="orange">{{ doc.status }}</a-tag>
      <span class="loc">{{ doc.n_pages }} 页</span>
    </div>

    <div class="docview-bar">
      <span class="seg">
        <span :class="['seg-item', docView === 'pdf' ? 'on' : '']" @click="setDocView('pdf')">原文</span>
        <span :class="['seg-item', docView === 'text' ? 'on' : '']" @click="setDocView('text')">正文</span>
      </span>
      <template v-if="docView === 'pdf' && canPdf">
        <span class="pager-num">第 {{ originPage || 1 }} / {{ doc.n_pages || 1 }} 页</span>
        <a class="pager" v-if="hitPage && originPage !== hitPage" @click="jumpToHit">回到命中处</a>
        <span class="hint" v-if="activeChunk && activeChunk.article">命中 {{ activeChunk.article }}</span>
      </template>
      <span class="spacer"></span>
      <span class="hint" v-if="!canPdf">该文件为 Word 文档，无原页图像</span>
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
      <div v-if="!canPdf" class="img-fail">Word 文档没有 PDF 原页，请切到「正文」查看。</div>
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
                 @error="onPageImgError($event)" alt="PDF 原页" />
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
          <div class="chunk-head" v-if="c.article">
            <span class="art">{{ c.article }}</span>
            <span class="pg" v-if="c.page_start">第 {{ c.page_start }} 页</span>
          </div>
          <div class="chunk-text">{{ c.text }}</div>
        </div>
      </div>
    </a-spin>
  </a-drawer>

  <a-modal v-model:open="ingest.open" :title="ingest.doc_id ? '更新文件' : '新增文件'"
           :confirm-loading="ingest.saving" ok-text="确认入库"
           :ok-button-props="{ disabled: ingest.parsing || !ingest.tmp_id }"
           @ok="onIngestOk" @cancel="resetIngest">
    <a-upload-dragger
      :before-upload="onIngestFile"
      :max-count="1"
      accept=".pdf,.doc,.docx"
      :show-upload-list="false"
      :disabled="ingest.parsing">
      <p class="ingest-title">{{ ingest.filename || '点击或拖拽文件到此处' }}</p>
      <p class="ingest-hint">支持 PDF / Word。将自动识别文本并提取分类、标题、编号和日期。</p>
    </a-upload-dragger>
    <div v-if="ingest.parsing" class="ingest-progress">
      <a-progress :percent="ingest.percent" status="active" :show-info="true" />
      <div class="ingest-status">{{ ingest.progressText || '正在识别…' }}</div>
    </div>
    <a-form v-if="ingest.tmp_id" layout="vertical" class="ingest-form">
      <a-form-item label="分类">
        <a-auto-complete v-model:value="ingest.dept" :options="deptOptions" size="large"
                         placeholder="选择或输入分类目录" />
      </a-form-item>
      <a-form-item label="文件名称">
        <a-input v-model:value="ingest.title" size="large" />
      </a-form-item>
      <a-form-item label="编号">
        <a-input v-model:value="ingest.doc_no" size="large" placeholder="可选" />
      </a-form-item>
      <a-form-item label="日期">
        <a-input v-model:value="ingest.issued_date" size="large" placeholder="YYYY-MM-DD" />
      </a-form-item>
      <a-form-item label="状态">
        <a-select v-model:value="ingest.status" size="large">
          <a-select-option value="现行">现行</a-select-option>
          <a-select-option value="试行">试行</a-select-option>
          <a-select-option value="已废止">已废止</a-select-option>
        </a-select>
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
    const filters = reactive({ dept: undefined, status: undefined, category: undefined })
    const facets = reactive({ depts: [], statuses: [], categories: [] })
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
    function liveOf(c) {
      if (!c) return []
      if (!c._live) c._live = reactive(cloneMsgs(c.messages || []))
      return c._live
    }
    function chatHasBody(c) {
      return (c && c.messages || []).some((m) => (
        m.role === 'user' && ((m.content || '').trim() || (m.packed || '').trim() || (m.files || []).length)
      ))
    }
    function loadStoredChats() {
      try {
        const raw = JSON.parse(localStorage.getItem(CHATS_KEY) || localStorage.getItem('zdk-chats') || '[]')
        if (!Array.isArray(raw)) return []
        return raw.filter((c) => c && c.id).map((c) => ({
          id: c.id,
          title: c.title || '新对话',
          titleReady: !!c.titleReady,
          createdAt: c.createdAt || Date.now(),
          updatedAt: c.updatedAt || c.createdAt || Date.now(),
          activeAt: c.activeAt || c.createdAt || c.updatedAt || Date.now(),
          pinned: !!c.pinned,
          pinnedAt: c.pinnedAt || 0,
          messages: cloneMsgs(c.messages || []),
        }))
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

    function persistConversations() {
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
      const next = dumpChat(src)
      if (convStamp(next) !== convStamp(c.messages)) {
        c.activeAt = Date.now()
        c.updatedAt = c.activeAt
      }
      c.messages = next
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
      if (t.kind === 'shell' || t.kind === 'browser') {
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

    function allChatSources() {
      return collectSources(messages.value)
    }

    function findSource(n, m) {
      const key = String(n)
      const pools = [(m && m.sources) || [], allChatSources()]
      for (const pool of pools) {
        const s = pool.find((x) => String(x.n) === key)
        if (s) return s
      }
      return null
    }

    function sourcesCitedIn(text, pool) {
      const allowed = new Map((pool || allChatSources()).map((s) => [String(s.n), s]))
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
      const own = (m && m.sources) || []
      const cited = sourcesCitedIn(m && m.content, allChatSources())
      const map = new Map()
      for (const s of cited.concat(own)) {
        const n = Number(s && s.n)
        if (!n || map.has(n)) continue
        map.set(n, s)
      }
      return [...map.values()].sort((a, b) => Number(a.n) - Number(b.n))
    }

    function toggleSrc(m) {
      if (m) m.showSrc = !m.showSrc
    }

    function attachCitedSources(m) {
      if (!m) return
      const own = m.sources || (m.sources = [])
      for (const s of sourcesCitedIn(m.content, allChatSources())) {
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
      const allowed = new Set(allChatSources().map((s) => String(s.n)))
      for (const s of (m && m.sources) || []) allowed.add(String(s.n))
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

    function makeChar(ch, animate) {
      const span = document.createElement('span')
      span.className = 'ch'
      span.textContent = ch
      if (animate) {
        span.classList.add('ch-in')
        span.addEventListener('animationend', () => span.classList.remove('ch-in'), { once: true })
      }
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
      for (const ch of Array.from(text || '')) el.appendChild(makeChar(ch, animate))
    }

    function patchRunText(el, prevText, nextText, animate) {
      const prevChars = Array.from(prevText || '')
      const nextChars = Array.from(nextText || '')
      const nodes = [...el.childNodes]
      let i = 0
      while (i < nodes.length && i < nextChars.length && nodes[i].textContent === nextChars[i]) i++
      for (let j = nodes.length - 1; j >= i; j--) nodes[j].remove()
      for (let j = i; j < nextChars.length; j++) {
        el.appendChild(makeChar(nextChars[j], animate && j >= prevChars.length))
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
      const wrap = document.createElement('div')
      patchBlocks(wrap, [], lex(stripThink(text)), false, citeAllowed(m))
      return wrap.innerHTML
    }

    const answerHosts = new Map()
    const answerDirty = new Set()
    let answerRaf = 0

    function paintAnswer(m) {
      const st = answerHosts.get(m)
      if (!st || !st.el || !st.el.isConnected) return
      const el = st.el
      const live = !!(m.streaming && !m.ask)
      const next = lex(stripThink(m.content || ''))
      patchBlocks(el, st.tokens || [], next, !!(st.ready && live), citeAllowed(m))
      let caret = el.querySelector('.caret')
      if (live) {
        if (!caret) {
          caret = document.createElement('span')
          caret.className = 'caret'
        }
        caretHost(el).appendChild(caret)
      } else if (caret) {
        caret.remove()
      }
      st.tokens = next
      st.ready = true
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
        scheduleAnswer(m)
        return
      }
      answerHosts.set(m, { el, tokens: [], ready: false })
      paintAnswer(m)
    }

    function blockDelay(i) {
      const n = Math.min(Number(i) || 0, 12)
      return { animationDelay: (n * 40) + 'ms' }
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
              : 'search'
        cur.tools.push({
          kind,
          query: (kind === 'shell' || kind === 'browser')
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
    const tableCard = ref(null)
    const tableY = ref(420)
    const columns = [
      { title: '分类', dataIndex: 'dept', key: 'dept', width: 110, ellipsis: true, fixed: 'left' },
      { title: '文件名称', key: 'title', ellipsis: true, width: 280 },
      { title: '编号', dataIndex: 'doc_no', key: 'doc_no', width: 180, ellipsis: true },
      { title: '日期', dataIndex: 'issued_date', key: 'issued_date', width: 120 },
      { title: '状态', key: 'status', width: 80 },
      { title: '分段数', key: 'n_chunks', width: 72 },
      { title: '操作', key: 'op', width: 72, fixed: 'right' },
    ]
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
    watch(tab, (t) => { if (t === 'catalog') bindTableMeasure() })
    watch(docs, () => { if (tab.value === 'catalog') nextTick(measureTable) })
    onMounted(() => {
      syncDrawerWidth()
      window.addEventListener('resize', syncDrawerWidth)
      if (tab.value === 'catalog') bindTableMeasure()
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
      const t = doc.text_source || ''
      return t === 'paddleocr-vl' || t === 'pdf-layer'
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
        const asPdf = (doc.text_source === 'paddleocr-vl' || doc.text_source === 'pdf-layer')
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
      Object.assign(facets, await api.get('/api/facets'))
    }
    async function loadDocs() {
      const qs = catDept.value ? '?dept=' + encodeURIComponent(catDept.value) : ''
      docs.value = await api.get('/api/docs' + qs)
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
    const settingsPrimary = [
      { key: 'llm', label: '智能问答' },
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
    function placeNavPill() {
      if (['ask', 'browser', 'search', 'catalog'].includes(tab.value)) navSlide.schedule(tab.value)
      else navSlide.hide()
    }
    const navPillStyle = navSlide.style
    const llmPillStyle = llmSlide.style
    const embedPillStyle = embedSlide.style
    watch(tab, placeNavPill)
    watch(settingsPid, (id) => { if (id) llmSlide.schedule(id) })
    watch(settingsEmbedPid, (id) => { if (id) embedSlide.schedule(id) })
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
    const currentProvider = computed(() => (
      (cfg.providers || []).find((p) => p.id === settingsPid.value) || null
    ))
    const currentEmbedProvider = computed(() => (
      (cfg.embed_providers || []).find((p) => p.id === settingsEmbedPid.value) || null
    ))
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
      if (c.protocols && c.protocols.length) protocols.value = c.protocols
      if (c.embed_protocols && c.embed_protocols.length) embedProtocols.value = c.embed_protocols
      Object.assign(cfg, c)
      cfg.api_key = ''
      cfg.paddle_token = ''
      cfg.providers = providers
      cfg.embed_providers = embedProviders
      cfg.embed_use = !!c.embed_use
      cfg.embed_running = !!c.embed_running
      if (!settingsPid.value || !providers.some((p) => p.id === settingsPid.value)) {
        settingsPid.value = cfg.provider_id || (providers[0] && providers[0].id) || ''
      }
      if (!settingsEmbedPid.value || !embedProviders.some((p) => p.id === settingsEmbedPid.value)) {
        settingsEmbedPid.value = cfg.embed_provider_id || (embedProviders[0] && embedProviders[0].id) || ''
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
    ], scheduleSave)

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
        onClick: (e) => {
          if (e.target.closest('.doc-op, .ant-dropdown, .ant-dropdown-menu')) return
          openDoc(record.id, null)
        },
      }
    }

    const ingest = reactive({
      open: false, doc_id: null, file: null, filename: '', tmp_id: '',
      parsing: false, saving: false, percent: 0, progressText: '',
      dept: '', title: '', doc_no: '', issued_date: '', status: '现行',
    })
    let ingestAbort = null
    const deptOptions = computed(() => (facets.depts || []).map((d) => ({ value: d })))

    function goToSettings(section) {
      tab.value = 'settings'
      if (section) settingsSection.value = section
    }
    function needIngestKeys() {
      if (cfg.api_key_set && cfg.paddle_token_set) return true
      message.warning('新增或更新文件前，请先在设置中填入 API Key 和 PaddleOCR Token')
      goToSettings(!cfg.api_key_set ? 'llm' : 'ocr')
      return false
    }

    function resetIngest() {
      if (ingestAbort) {
        ingestAbort.abort()
        ingestAbort = null
      }
      ingest.open = false
      ingest.doc_id = null
      ingest.file = null
      ingest.filename = ''
      ingest.tmp_id = ''
      ingest.parsing = false
      ingest.saving = false
      ingest.percent = 0
      ingest.progressText = ''
      ingest.dept = ''
      ingest.title = ''
      ingest.doc_no = ''
      ingest.issued_date = ''
      ingest.status = '现行'
    }

    function openIngest(docId) {
      if (!needIngestKeys()) return
      resetIngest()
      ingest.doc_id = docId || null
      ingest.open = true
    }

    function onIngestFile(file) {
      ingest.file = file
      ingest.filename = file.name
      ingest.tmp_id = ''
      parseIngest(file)
      return false
    }

    function applyIngestMeta(j, file) {
      ingest.tmp_id = j.tmp_id
      ingest.dept = j.dept || ''
      ingest.title = j.title || ''
      ingest.doc_no = j.doc_no || ''
      ingest.issued_date = j.issued_date || ''
      ingest.status = j.status || '现行'
      ingest.filename = j.filename || (file && file.name) || ingest.filename
    }

    async function parseIngest(file) {
      if (ingestAbort) ingestAbort.abort()
      ingestAbort = new AbortController()
      ingest.parsing = true
      ingest.tmp_id = ''
      ingest.percent = 2
      ingest.progressText = '正在上传…'
      try {
        const fd = new FormData()
        fd.append('file', file)
        const r = await fetch('/api/docs/parse', {
          method: 'POST',
          body: fd,
          signal: ingestAbort.signal,
        })
        const ctype = r.headers.get('content-type') || ''
        if (!ctype.includes('event-stream')) {
          const j = await r.json().catch(() => ({}))
          if (!j.ok) {
            message.error(j.error || '识别失败')
            return
          }
          applyIngestMeta(j, file)
          ingest.percent = 100
          ingest.progressText = '识别完成'
          message.success('已识别，请核对后入库')
          return
        }
        let done = false
        await readSse(r, (ev) => {
          if (ev.type === 'progress') {
            ingest.percent = ev.percent || 0
            ingest.progressText = ev.message || ingest.progressText
          } else if (ev.type === 'done') {
            done = true
            applyIngestMeta(ev, file)
            ingest.percent = 100
            ingest.progressText = '识别完成'
            message.success('已识别，请核对后入库')
          } else if (ev.type === 'error') {
            message.error(ev.error || '识别失败')
          }
        })
        if (!done && !ingest.tmp_id) message.error('识别中断')
      } catch (e) {
        if (e && e.name === 'AbortError') return
        message.error(String(e))
      } finally {
        ingest.parsing = false
        ingestAbort = null
      }
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
      if (ingest.parsing) return Promise.reject()
      if (!ingest.tmp_id) {
        message.warning('请先上传文件')
        return Promise.reject()
      }
      ingest.saving = true
      try {
        const body = {
          tmp_id: ingest.tmp_id,
          dept: ingest.dept,
          title: ingest.title,
          doc_no: ingest.doc_no,
          issued_date: ingest.issued_date,
          status: ingest.status,
        }
        if (ingest.doc_id) body.doc_id = ingest.doc_id
        const j = await api.post('/api/docs/commit', body)
        if (!j.ok) {
          message.error(j.error || '入库失败')
          return Promise.reject()
        }
        message.success(ingest.doc_id ? '已更新' : '已新增')
        resetIngest()
        await loadDocs()
        await loadFacets()
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
      if (key === 'update') {
        openIngest(record.id)
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
    const browserState = reactive({
      ready: !!nativeBw,
      activeTabId: '',
      tabs: [],
      downloads: [],
    })
    const browserUrlInput = ref('')
    const browserUrlFocused = ref(false)
    const browserPreviewUrl = ref('')

    const activeBrowserTab = computed(() => (
      browserState.tabs.find((t) => t.id === browserState.activeTabId) || browserState.tabs[0] || null
    ))
    const browserOccluded = computed(() => !!(
      drawerOpen.value || ingest.open || addProvider.open || addEmbedProvider.open || addModel.open || histMode.value
    ))

    function applyBrowserState(st) {
      if (!st || typeof st !== 'object') return
      browserState.ready = st.ready !== false
      browserState.activeTabId = st.activeTabId || ''
      browserState.tabs = Array.isArray(st.tabs) ? st.tabs : []
      browserState.downloads = Array.isArray(st.downloads) ? st.downloads : []
      if (!browserUrlFocused.value) {
        const cur = activeBrowserTab.value
        browserUrlInput.value = (cur && cur.url) || ''
      }
    }

    function syncBrowserViewport() {
      if (!nativeBw) return
      const el = browserStage.value
      const rect = el ? el.getBoundingClientRect() : null
      const visible = !!(
        tab.value === 'browser' &&
        !browserOccluded.value &&
        rect &&
        rect.width > 10 &&
        rect.height > 10
      )
      nativeBw.setViewport({
        visible,
        x: rect ? rect.left : 0,
        y: rect ? rect.top : 0,
        width: rect ? rect.width : 0,
        height: rect ? rect.height : 0,
      }).then(applyBrowserState).catch(() => {})
    }

    let browserRo = null
    let unbindBrowserState = null

    watch(browserStage, (el) => {
      if (browserRo) {
        browserRo.disconnect()
        browserRo = null
      }
      if (el && typeof ResizeObserver !== 'undefined') {
        browserRo = new ResizeObserver(() => syncBrowserViewport())
        browserRo.observe(el)
      }
      nextTick(syncBrowserViewport)
    })

    watch(tab, () => {
      nextTick(syncBrowserViewport)
      if (tab.value === 'browser' && !nativeBw) {
        api.get('/api/browser/state').then(applyBrowserState).catch(() => {})
      }
    })

    watch(browserOccluded, async (occ) => {
      if (!nativeBw || tab.value !== 'browser') return
      if (occ) {
        try {
          const shot = await nativeBw.capturePreview()
          browserPreviewUrl.value = (shot && shot.dataUrl) || ''
        } catch (e) {
          browserPreviewUrl.value = ''
        }
        syncBrowserViewport()
      } else {
        browserPreviewUrl.value = ''
        nextTick(syncBrowserViewport)
      }
    })

    watch(activeBrowserTab, (cur) => {
      if (!browserUrlFocused.value) {
        browserUrlInput.value = (cur && cur.url) || ''
      }
    })

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
      if (unbindBrowserState) unbindBrowserState()
      if (browserRo) browserRo.disconnect()
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
      hasNativeBrowser, browserStage, browserState, browserUrlInput, browserPreviewUrl,
      activeBrowserTab, browserOccluded, onBrowserUrlFocus, onBrowserUrlBlur, submitBrowserUrl,
      newBrowserTab, switchBrowserTab, closeBrowserTab, browserBack, browserForward, browserReloadOrStop, browserDevTools,
      doSearch, pageUrl,
      messages, question, asking, chatlog, turns, send, stopAsk, newChat, clearChat, onEnter,
      chatId, histMode, histPicked, histGroups, histPickCount, histPaneTitle, histPinLabel, runningIds,
      openHistManage, openHistBrowse, closeHistManage, openHistChat, onHistRow, togglePick, pinPicked, deletePicked,
      renderAnswer, onAnswerClick, displaySources, toggleSrc, bindAnswer, scheduleAnswer, blockDelay,
      toolDotClass, toolLabel, toolMeta, sbfWindowH, sbfOffset, sbfItemClass,
      attachments, attachInput, attachOver, pickAttach, onAttachPicked,
      onAttachEnter, onAttachLeave, onAttachDrop, removeAttach,
      menuOpen, menuPanel, modelWrap, modelQuery, modelPill, modelLabel, channelLabel, modelHasVision, effortLabel,
      effortOptions, contextLabel, contextOptions, groupedModels, filteredModels,
      toggleModelMenu, openPanel, setEffort, setContext, setChatModel,
      settingsPid, settingsEmbedPid, settingsPrimary, settingsSection, settingsPillStyle, bindSettingsNav,
      navPillStyle, llmPillStyle, embedPillStyle, bindMainNav, bindLlmProvider, bindEmbedProvider,
      currentProvider, currentEmbedProvider, addProvider, addEmbedProvider, addModel,
      urlPlaceholder, embedUrlPlaceholder, embedProtocols, embedStatusText,
      openAddProvider, confirmAddProvider, removeProvider,
      saveProviderKey, clearProviderKey, openAddModel, confirmAddModel,
      removeProviderModel, syncProviderModels,
      selectEmbedChannel, openAddEmbedProvider, confirmAddEmbedProvider, removeEmbedProvider,
      saveEmbedKey, clearEmbedKey, openAddEmbedModel, removeEmbedModel, syncEmbedModels,
      startEmbed, stopEmbed, toggleEmbedRun,
      askPicked, askOtherOn, canSubmitAsk, toggleAskOpt, pickAskOther, submitAsk,
      askCurrentQs, askLastStep, askStepDone, prevAsk, nextAsk,
      docs, catDept, columns, tableCard, tableY, loadDocs, rowClick,
      drawerOpen, drawerWidth, doc, docLoading, activeSeq, currentDocId,
      docView, canPdf, originPage, activeChunk, pageScroll, pageList,
      hitPage, activeChunkId, pageReady, pageShown, onImgMount, onPageScroll, onPageImgError, onPageLoaded, jumpToHit,
      pdfScale, pdfPanning, zoomLabel, zoomIn, zoomOut, onZoomPreset, resetPdfZoom,
      onPdfDown, onPdfMove, onPdfUp,
      setDocView, openDoc, openFile,
      cfg, cfgSaveHint, saveApiKey, savePaddle, clearKey, clearPaddle, rebuild,
      ingest, deptOptions, openIngest, onIngestFile, onIngestOk, resetIngest, onDocOp,
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
