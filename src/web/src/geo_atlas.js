import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue/dist/vue.esm-bundler.js'
import { geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import worldAtlas from 'world-atlas/countries-110m.json'

// Pre-decode TopoJSON once at module load (100% offline, ~105KB bundled)
const _rawCountries = feature(worldAtlas, worldAtlas.objects.countries)
const WORLD_COUNTRIES = {
  type: 'FeatureCollection',
  features: _rawCountries.features
    .filter((f) => String(f.id) !== '010') // exclude Antarctica for clean editorial framing
    .map((f) => ({
      ...f,
      iso: String(f.id || '').padStart(3, '0'),
    })),
}

// Country borders mesh (excluding Antarctica & treating China 156 + 158 as unified)
const WORLD_BORDERS = mesh(worldAtlas, worldAtlas.objects.countries, (a, b) => {
  if (a === b) return false
  const ia = String(a.id || '').padStart(3, '0')
  const ib = String(b.id || '').padStart(3, '0')
  if (ia === '010' || ib === '010') return false
  if ((ia === '156' && ib === '158') || (ia === '158' && ib === '156')) return false
  return true
})

const GRATICULE = geoGraticule10()
const SPHERE = { type: 'Sphere' }

// Editorial conflict ramp (Financial Times / Economist restrained light palette)
const CONFLICT_FILL_LIGHT = [
  '#e7edf4', // 0: neutral land
  '#fef3c7', // 1: watch (soft cream)
  '#fde68a', // 2: friction (warm sand)
  '#fdba74', // 3: sanction / tariff (terracotta)
  '#f87171', // 4: escalation (muted crimson)
  '#dc2626', // 5: active conflict (editorial vermilion)
]

const CONFLICT_FILL_DARK = [
  '#1c2636', // 0: neutral slate
  '#3b3421', // 1
  '#52411f', // 2
  '#7c3f1c', // 3
  '#8c2626', // 4
  '#b91c1c', // 5
]

function effectiveIso(iso) {
  const s = String(iso || '').padStart(3, '0')
  return s === '158' ? '156' : s
}

function stanceColor(ns, dark = false) {
  const v = Number(ns) || 0
  if (v > 0.08) return dark ? '#34d399' : '#059669'
  if (v < -0.08) return dark ? '#f87171' : '#dc2626'
  return dark ? '#60a5fa' : '#2563eb'
}

function conflictColor(level, dark = false) {
  const lv = Math.max(0, Math.min(5, Number(level) || 0))
  if (lv >= 5) return dark ? '#ef4444' : '#b91c1c'
  if (lv === 4) return dark ? '#f87171' : '#dc2626'
  if (lv === 3) return dark ? '#fb923c' : '#d97706'
  if (lv === 2) return dark ? '#fbbf24' : '#ca8a04'
  return dark ? '#60a5fa' : '#3b82f6'
}

function conflictTierText(lv) {
  return ['平稳常态', '轻度关注', '风险扰动', '制裁摩擦', '烈度升级', '高危冲突'][Math.max(0, Math.min(5, Number(lv) || 0))]
}

function relTypeLabel(rel) {
  if (rel === 'conflict') return '冲突对抗'
  if (rel === 'sanction') return '制裁/关税'
  if (rel === 'trade') return '经贸/合作'
  return '情报共现'
}

function fmtRelTime(ts) {
  const n = Number(ts) || 0
  if (!n) return ''
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - n))
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h前`
  return `${Math.floor(diff / 86400)}d前`
}

export const EntityGeoAtlas = {
  props: {
    nodes: { type: Array, default: () => [] },
    edges: { type: Array, default: () => [] },
    countries: { type: Array, default: () => [] },
    events: { type: Array, default: () => [] },
    assets: { type: Array, default: () => [] },
    theme: { type: String, default: 'light' },
    highlightId: { type: [Number, String], default: null },
    refreshTick: { type: Number, default: 0 },
    isMaximized: { type: Boolean, default: false },
  },
  emits: ['pick', 'hover'],
  setup(props, { emit }) {
    const wrapRef = ref(null)
    const dockRef = ref(null)
    const assetElMap = new Map()

    const width = ref(640)
    const height = ref(340)
    const viewMode = ref('map') // 'map' | 'flow'

    // Map layer toggles
    const showArcs = ref(true)
    const showEvents = ref(true)
    const showEntities = ref(true)

    // Pan & Zoom state (transform around map center)
    const zoom = ref(1)
    const panX = ref(0)
    const panY = ref(0)
    const dragging = ref(false)
    let dragStart = null

    // Hover & Tooltip state
    const hoveredCountryIso = ref('')
    const hoveredEntityId = ref(null)
    const hoveredAssetId = ref(null)
    const hoveredEventId = ref(null)
    const hoveredArcKey = ref('')
    const hoveredFlowNodeId = ref(null)

    const tooltip = ref(null) // { x, y, kind, data }
    const dockVersion = ref(0)

    let ro = null
    let rafId = 0

    function setAssetEl(id, el) {
      if (el) assetElMap.set(Number(id), el)
      else assetElMap.delete(Number(id))
    }

    const isDark = computed(() => props.theme === 'dark')

    // Country lookup map by ISO-3 numeric
    const countryByIso = computed(() => {
      const m = new Map()
      for (const c of props.countries || []) {
        if (c && c.iso) m.set(effectiveIso(c.iso), c)
      }
      return m
    })

    const nodeById = computed(() => {
      const m = new Map()
      for (const n of props.nodes || []) {
        if (n && n.id != null) m.set(Number(n.id), n)
      }
      return m
    })

    const assetById = computed(() => {
      const m = new Map()
      for (const a of props.assets || []) {
        if (a && a.id != null) m.set(Number(a.id), a)
      }
      return m
    })

    // Visible assets in the bottom dock
    const visibleAssets = computed(() => {
      const maxCount = props.isMaximized ? 12 : (width.value < 420 ? 5 : 8)
      return (props.assets || []).slice(0, maxCount)
    })

    const hasDock = computed(() => viewMode.value === 'map' && visibleAssets.value.length > 0)

    // D3 Natural Earth projection fitted cleanly to canvas (leaving space for bottom asset dock)
    const projection = computed(() => {
      const w = Math.max(240, width.value)
      const h = Math.max(150, height.value)
      const padX = Math.max(8, Math.round(w * 0.02))
      const padTop = props.isMaximized ? 26 : 18
      const padBot = hasDock.value ? (props.isMaximized ? 56 : 46) : 14
      return geoNaturalEarth1().fitExtent(
        [[padX, padTop], [w - padX, Math.max(padTop + 90, h - padBot)]],
        WORLD_COUNTRIES,
      )
    })

    const pathGen = computed(() => geoPath(projection.value))

    const spherePath = computed(() => pathGen.value(SPHERE) || '')
    const graticulePath = computed(() => pathGen.value(GRATICULE) || '')
    const bordersPath = computed(() => pathGen.value(WORLD_BORDERS) || '')

    const countryPaths = computed(() => {
      const pg = pathGen.value
      const cmap = countryByIso.value
      return WORLD_COUNTRIES.features.map((f) => {
        const eff = effectiveIso(f.iso)
        const stat = cmap.get(eff) || null
        return {
          key: f.iso + '-' + (f.properties && f.properties.name ? f.properties.name : ''),
          iso: eff,
          rawIso: f.iso,
          engName: (f.properties && f.properties.name) || '',
          d: pg(f) || '',
          stat,
        }
      })
    })

    // Project lon/lat to SVG base coordinates (before pan/zoom group transform)
    function projectPt(lon, lat) {
      if (lon == null || lat == null) return null
      const p = projection.value([Number(lon), Number(lat)])
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null
      return p
    }

    // Apply current pan/zoom transform to base SVG point -> viewport container coordinates
    function toScreenPt(pt) {
      if (!pt) return null
      const cx = width.value / 2
      const cy = height.value / 2
      return [
        (pt[0] - cx) * zoom.value + cx + panX.value,
        (pt[1] - cy) * zoom.value + cy + panY.value,
      ]
    }

    const mapGroupTransform = computed(() => {
      const cx = width.value / 2
      const cy = height.value / 2
      return `translate(${(cx + panX.value).toFixed(2)}, ${(cy + panY.value).toFixed(2)}) scale(${zoom.value.toFixed(4)}) translate(${(-cx).toFixed(2)}, ${(-cy).toFixed(2)})`
    })

    const invScale = computed(() => 1 / Math.pow(Math.max(0.7, zoom.value), 0.58))

    // Geo-anchored entities with greedy screen-space label de-overlap
    const geoEntities = computed(() => {
      const list = (props.nodes || []).filter((n) => !n.is_media && n.lon != null && n.lat != null && n.entity_type !== 'ASSET')
      if (!list.length) return []
      const maxM = Math.max(1, ...list.map((n) => Number(n.mentions) || 1))
      const compact = !props.isMaximized && width.value < 440
      const maxVisible = props.isMaximized ? 30 : (compact ? 14 : 22)

      const projected = []
      for (const n of list.slice(0, maxVisible)) {
        const pt = projectPt(n.lon, n.lat)
        if (!pt) continue
        const ratio = Math.sqrt((Number(n.mentions) || 1) / maxM)
        const r = (compact ? 3.2 : 3.8) + ratio * (compact ? 4.4 : 5.8)
        projected.push({
          ...n,
          id: Number(n.id),
          effIso: effectiveIso(n.iso),
          x: pt[0],
          y: pt[1],
          r,
          col: stanceColor(n.net_sentiment, isDark.value),
          cCol: conflictColor(n.conflict_level, isDark.value),
          shortName: String(n.canonical_name || '').slice(0, compact ? 5 : 7),
          showLabel: false,
          labelDx: 0,
          labelDy: -(r + 5),
        })
      }

      // Greedy label placement so text NEVER overlaps
      const placedBoxes = []
      const sc = invScale.value
      const maxLabels = props.isMaximized ? 18 : (compact ? 8 : 13)
      let labeled = 0

      // Sort priority: high mentions + high conflict + LOC first
      const order = projected
        .map((item, i) => ({ item, i, pri: (Number(item.mentions) || 0) + (Number(item.conflict_level) || 0) * 14 + (item.entity_type === 'LOC' ? 18 : 0) }))
        .sort((a, b) => b.pri - a.pri)

      const candidates = [
        (it) => [0, -(it.r * sc + 7 * sc)],
        (it) => [0, it.r * sc + 12 * sc],
        (it) => [it.r * sc + 6 * sc, 3 * sc],
        (it) => [-(it.r * sc + 6 * sc), 3 * sc],
      ]

      for (const { item } of order) {
        if (labeled >= maxLabels) break
        const wBox = Math.max(24, item.shortName.length * 9.2) * sc
        const hBox = 12 * sc
        for (const fn of candidates) {
          const [dx, dy] = fn(item)
          const bx = item.x + dx
          const by = item.y + dy
          const rect = {
            x1: bx - wBox / 2 - 2,
            y1: by - hBox / 2 - 1,
            x2: bx + wBox / 2 + 2,
            y2: by + hBox / 2 + 1,
          }
          const hit = placedBoxes.some((b) => !(rect.x2 < b.x1 || rect.x1 > b.x2 || rect.y2 < b.y1 || rect.y1 > b.y2))
          if (!hit) {
            placedBoxes.push(rect)
            item.showLabel = true
            item.labelDx = dx
            item.labelDy = dy
            labeled += 1
            break
          }
        }
      }
      return projected
    })

    const geoEntityById = computed(() => {
      const m = new Map()
      for (const g of geoEntities.value) m.set(g.id, g)
      return m
    })

    // Hotspot conflict events (pulsing radar beacons on map)
    const geoEvents = computed(() => {
      const maxEv = props.isMaximized ? 12 : (width.value < 440 ? 5 : 8)
      const out = []
      const usedPts = []
      for (const ev of (props.events || []).slice(0, maxEv * 2)) {
        const pt = projectPt(ev.lon, ev.lat)
        if (!pt) continue
        // Avoid stacking pulses right on top of each other (< 14px apart)
        if (usedPts.some((u) => Math.hypot(u[0] - pt[0], u[1] - pt[1]) < 14)) continue
        usedPts.push(pt)
        out.push({
          ...ev,
          effIso: effectiveIso(ev.iso),
          x: pt[0],
          y: pt[1],
          col: conflictColor(ev.conflict_level, isDark.value),
        })
        if (out.length >= maxEv) break
      }
      return out
    })

    // Semantic Geo Arcs between geo-anchored entities
    const geoArcs = computed(() => {
      const emap = geoEntityById.value
      const maxArcs = props.isMaximized ? 24 : (width.value < 440 ? 10 : 15)
      const raw = []
      const seenIsoPair = new Set()

      for (const ed of props.edges || []) {
        const a = emap.get(Number(ed.source))
        const b = emap.get(Number(ed.target))
        if (!a || !b) continue
        const dist = Math.hypot(b.x - a.x, b.y - a.y)
        if (dist < 22) continue
        // Limit duplicate country-to-country arcs to keep map crisp
        const pairKey = a.effIso && b.effIso
          ? (a.effIso < b.effIso ? `${a.effIso}-${b.effIso}` : `${b.effIso}-${a.effIso}`)
          : `${a.id}-${b.id}`
        if (seenIsoPair.has(pairKey) && raw.length >= 8) continue
        seenIsoPair.add(pairKey)

        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const dx = b.x - a.x
        const dy = b.y - a.y
        // Curve gracefully northward (editorial flight-arc style)
        const lift = Math.min(72, Math.max(16, dist * 0.24))
        let nx = -dy / dist
        let ny = dx / dist
        if (ny > 0) { nx = -nx; ny = -ny }
        const cx = mx + nx * lift * 0.45
        const cy = my + ny * lift

        const rel = ed.rel_type || 'cooccur'
        const isConflict = rel === 'conflict' || rel === 'sanction'
        raw.push({
          key: `${a.id}-${b.id}`,
          sourceId: a.id,
          targetId: b.id,
          sourceName: a.canonical_name,
          targetName: b.canonical_name,
          sourceIso: a.effIso,
          targetIso: b.effIso,
          weight: Number(ed.weight) || 1,
          rel_type: rel,
          conflict_level: Number(ed.conflict_level) || 0,
          net_sentiment: Number(ed.net_sentiment) || 0,
          sample_title: ed.sample_title || '',
          d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
          midX: (a.x + 2 * cx + b.x) / 4,
          midY: (a.y + 2 * cy + b.y) / 4,
          isConflict,
          stroke: rel === 'conflict'
            ? (isDark.value ? '#f87171' : '#dc2626')
            : (rel === 'sanction'
              ? (isDark.value ? '#fb923c' : '#d97706')
              : (rel === 'trade'
                ? (isDark.value ? '#34d399' : '#059669')
                : (isDark.value ? '#64748b' : '#475569'))),
        })
        if (raw.length >= maxArcs) break
      }
      return raw
    })

    // Unified active focus context (from external table hover, map hover, country hover, or asset dock hover)
    const activeFocus = computed(() => {
      const extId = props.highlightId != null ? Number(props.highlightId) : null
      const entId = hoveredEntityId.value != null ? Number(hoveredEntityId.value) : extId
      if (hoveredAssetId.value != null) {
        const a = assetById.value.get(Number(hoveredAssetId.value))
        if (a) {
          return {
            kind: 'asset',
            assetId: a.id,
            isos: new Set((a.linked_isos || []).map(effectiveIso)),
            entityIds: new Set((a.linked_entity_ids || []).map(Number)),
          }
        }
      }
      if (hoveredCountryIso.value) {
        const iso = effectiveIso(hoveredCountryIso.value)
        const c = countryByIso.value.get(iso)
        const assetIds = new Set(((c && c.linked_assets) || []).map((x) => Number(x.id)))
        return {
          kind: 'country',
          iso,
          isos: new Set([iso]),
          entityIds: new Set(geoEntities.value.filter((g) => g.effIso === iso).map((g) => g.id)),
          assetIds,
        }
      }
      if (entId != null) {
        const n = nodeById.value.get(entId)
        const linkedEnts = new Set([entId])
        const linkedIsos = new Set()
        if (n && n.iso) linkedIsos.add(effectiveIso(n.iso))
        for (const ed of props.edges || []) {
          if (Number(ed.source) === entId) linkedEnts.add(Number(ed.target))
          else if (Number(ed.target) === entId) linkedEnts.add(Number(ed.source))
        }
        const linkedAssets = new Set()
        for (const a of visibleAssets.value) {
          if ((a.linked_entity_ids || []).some((id) => Number(id) === entId) || (n && n.iso && (a.linked_isos || []).map(effectiveIso).includes(effectiveIso(n.iso)))) {
            linkedAssets.add(Number(a.id))
          }
        }
        return {
          kind: 'entity',
          entityId: entId,
          isos: linkedIsos,
          entityIds: linkedEnts,
          assetIds: linkedAssets,
        }
      }
      return null
    })

    // Dynamic Bezier transmission curves linking map hotspots <-> bottom Asset Impact Dock pills
    const transmissionLines = computed(() => {
      void dockVersion.value // reactive trigger when layout/zoom updates
      const focus = activeFocus.value
      if (!focus || !wrapRef.value || !hasDock.value) return []
      const wrapRect = wrapRef.value.getBoundingClientRect()
      if (!wrapRect.width || !wrapRect.height) return []

      const lines = []
      const addLine = (lon, lat, assetObj) => {
        const el = assetElMap.get(Number(assetObj.id))
        if (!el) return
        const pt = toScreenPt(projectPt(lon, lat))
        if (!pt) return
        const r = el.getBoundingClientRect()
        const tx = r.left - wrapRect.left + r.width / 2
        const ty = r.top - wrapRect.top + 2
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) return
        const sx = pt[0]
        const sy = pt[1]
        const dy = Math.max(24, ty - sy)
        const c1x = sx
        const c1y = sy + dy * 0.52
        const c2x = tx
        const c2y = ty - dy * 0.38
        const col = assetObj.stance === 'bullish'
          ? (isDark.value ? '#34d399' : '#059669')
          : (assetObj.stance === 'bearish'
            ? (isDark.value ? '#f87171' : '#dc2626')
            : (isDark.value ? '#60a5fa' : '#3b82f6'))
        lines.push({
          key: `${assetObj.id}-${sx.toFixed(0)}-${sy.toFixed(0)}`,
          d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}`,
          sx,
          sy,
          tx,
          ty,
          col,
          stance: assetObj.stance,
        })
      }

      if (focus.kind === 'asset') {
        const a = assetById.value.get(focus.assetId)
        if (!a) return []
        const drawnIsos = new Set()
        for (const iso of a.linked_isos || []) {
          const eff = effectiveIso(iso)
          if (drawnIsos.has(eff)) continue
          const c = countryByIso.value.get(eff)
          if (c) {
            drawnIsos.add(eff)
            addLine(c.lon, c.lat, a)
          }
        }
        if (!lines.length) {
          for (const eid of a.linked_entity_ids || []) {
            const g = geoEntityById.value.get(Number(eid))
            if (g) addLine(g.lon, g.lat, a)
            if (lines.length >= 4) break
          }
        }
      } else if (focus.kind === 'country') {
        const c = countryByIso.value.get(focus.iso)
        if (c && c.linked_assets) {
          for (const la of c.linked_assets) {
            const a = assetById.value.get(Number(la.id))
            if (a) addLine(c.lon, c.lat, a)
          }
        }
      } else if (focus.kind === 'entity') {
        const g = geoEntityById.value.get(focus.entityId)
        if (g && focus.assetIds) {
          for (const aid of focus.assetIds) {
            const a = assetById.value.get(aid)
            if (a) addLine(g.lon, g.lat, a)
            if (lines.length >= 4) break
          }
        }
      }
      return lines
    })

    // Country fill color helper
    function countryFill(cp) {
      const dark = isDark.value
      const palette = dark ? CONFLICT_FILL_DARK : CONFLICT_FILL_LIGHT
      if (!cp.stat) return palette[0]
      const lv = Math.max(0, Math.min(5, Number(cp.stat.conflict_level) || 0))
      if (lv > 0) return palette[lv]
      return dark ? '#24344d' : '#dce8f6' // active non-conflict economy
    }

    function countryOpacity(cp) {
      const f = activeFocus.value
      if (!f) return cp.stat && cp.stat.conflict_level >= 5 ? 0.88 : 1
      if (f.isos && f.isos.has(cp.iso)) return 1
      return cp.stat ? 0.42 : 0.72
    }

    function arcOpacity(arc) {
      const f = activeFocus.value
      if (hoveredArcKey.value) return hoveredArcKey.value === arc.key ? 0.96 : 0.08
      if (!f) return arc.isConflict ? 0.72 : 0.34
      if (f.kind === 'country') {
        return (arc.sourceIso === f.iso || arc.targetIso === f.iso) ? 0.92 : 0.06
      }
      if (f.entityIds && (f.entityIds.has(arc.sourceId) && f.entityIds.has(arc.targetId))) return 0.94
      if (f.kind === 'entity' && (arc.sourceId === f.entityId || arc.targetId === f.entityId)) return 0.94
      return 0.06
    }

    function entityOpacity(g) {
      const f = activeFocus.value
      if (!f) return 1
      if (f.kind === 'entity' && g.id === f.entityId) return 1
      if (f.entityIds && f.entityIds.has(g.id)) return 1
      if (f.isos && f.isos.has(g.effIso)) return 0.95
      return 0.22
    }

    function assetChipHighlighted(a) {
      const f = activeFocus.value
      if (!f) return false
      if (f.kind === 'asset') return f.assetId === a.id
      if (f.assetIds) return f.assetIds.has(a.id)
      return false
    }

    function assetChipDimmed(a) {
      const f = activeFocus.value
      if (!f) return false
      return !assetChipHighlighted(a)
    }

    // -----------------------------------------------------------------------
    // View 2: 3-Column Editorial Causal Flow (Regions/Events -> Actors -> Bullish/Bearish Assets)
    // -----------------------------------------------------------------------
    const flowLayout = computed(() => {
      if (viewMode.value !== 'flow') return { cols: [[], [], []], links: [] }
      const w = Math.max(300, width.value)
      const h = Math.max(170, height.value)
      const padTop = 34
      const padBot = 14
      const usableH = Math.max(100, h - padTop - padBot)
      const maxPerCol = props.isMaximized ? 10 : (h < 220 ? 5 : 7)

      const allNodes = (props.nodes || []).filter((n) => !n.is_media)
      const leftRaw = allNodes.filter((n) => n.entity_type === 'LOC' || n.entity_type === 'EVENT').slice(0, maxPerCol)
      const midRaw = allNodes.filter((n) => n.entity_type === 'ORG' || n.entity_type === 'PER').slice(0, maxPerCol)
      const rightRaw = (props.assets || []).slice(0, maxPerCol)

      const colW = Math.min(138, Math.max(84, Math.floor((w - 56) / 4.2)))
      const x0 = 14
      const x1 = Math.round((w - colW) / 2)
      const x2 = Math.max(x1 + colW + 24, w - colW - 14)

      const buildCol = (arr, x, colIdx) => {
        const count = arr.length
        if (!count) return []
        const slot = usableH / count
        const boxH = Math.min(28, Math.max(20, slot - 6))
        return arr.map((item, i) => {
          const y = padTop + i * slot + (slot - boxH) / 2
          const ns = Number(item.net_sentiment) || 0
          return {
            id: Number(item.id),
            name: String(item.canonical_name || ''),
            shortName: String(item.canonical_name || '').slice(0, colW < 105 ? 6 : 9),
            type: item.entity_type || (colIdx === 2 ? 'ASSET' : 'ORG'),
            mentions: Number(item.mentions) || 0,
            net_sentiment: ns,
            conflict_level: Number(item.conflict_level) || 0,
            stance: item.stance || (ns > 0.08 ? 'bullish' : (ns < -0.08 ? 'bearish' : 'neutral')),
            colIdx,
            x,
            y,
            w: colW,
            h: boxH,
            cy: y + boxH / 2,
            col: stanceColor(ns, isDark.value),
            raw: item,
          }
        })
      }

      const c0 = buildCol(leftRaw, x0, 0)
      const c1 = buildCol(midRaw, x1, 1)
      const c2 = buildCol(rightRaw, x2, 2)

      const byId = new Map()
      for (const n of [...c0, ...c1, ...c2]) byId.set(n.id, n)

      const links = []
      const seen = new Set()

      // Left <-> Mid links from co-occurrence edges
      for (const ed of props.edges || []) {
        const a = byId.get(Number(ed.source))
        const b = byId.get(Number(ed.target))
        if (!a || !b || a.colIdx === b.colIdx) continue
        const left = a.colIdx < b.colIdx ? a : b
        const right = a.colIdx < b.colIdx ? b : a
        const k = `${left.id}-${right.id}`
        if (seen.has(k)) continue
        seen.add(k)
        const sx = left.x + left.w
        const sy = left.cy
        const tx = right.x
        const ty = right.cy
        const midX = (sx + tx) / 2
        const rel = ed.rel_type || 'cooccur'
        const stroke = rel === 'conflict'
          ? (isDark.value ? '#f87171' : '#dc2626')
          : (rel === 'sanction'
            ? (isDark.value ? '#fb923c' : '#d97706')
            : (right.colIdx === 2 ? right.col : (isDark.value ? '#64748b' : '#94a3b8')))
        links.push({
          key: k,
          sourceId: left.id,
          targetId: right.id,
          weight: Number(ed.weight) || 1,
          rel_type: rel,
          stroke,
          d: `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`,
        })
      }

      // Also connect Mid/Left -> Assets via asset.linked_entity_ids & linked_isos
      for (const aNode of c2) {
        const rawA = aNode.raw
        const targets = new Set((rawA.linked_entity_ids || []).map(Number))
        const isoSet = new Set((rawA.linked_isos || []).map(effectiveIso))
        for (const src of [...c1, ...c0]) {
          const hit = targets.has(src.id) || (src.raw && src.raw.iso && isoSet.has(effectiveIso(src.raw.iso)))
          if (!hit) continue
          const k = `${src.id}-${aNode.id}`
          if (seen.has(k)) continue
          seen.add(k)
          const sx = src.x + src.w
          const sy = src.cy
          const tx = aNode.x
          const ty = aNode.cy
          const midX = (sx + tx) / 2
          links.push({
            key: k,
            sourceId: src.id,
            targetId: aNode.id,
            weight: 2,
            rel_type: aNode.stance,
            stroke: aNode.col,
            d: `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`,
          })
        }
      }

      return { cols: [c0, c1, c2], links, colXs: [x0, x1, x2], colW }
    })

    // -----------------------------------------------------------------------
    // Pointer interactions: pan, zoom, hover, click
    // -----------------------------------------------------------------------
    function clampPan(nx, ny, z) {
      const maxPx = width.value * 0.55 * Math.max(0.4, z - 0.6)
      const maxPy = height.value * 0.55 * Math.max(0.4, z - 0.6)
      return [
        Math.max(-maxPx, Math.min(maxPx, nx)),
        Math.max(-maxPy, Math.min(maxPy, ny)),
      ]
    }

    function onWheel(e) {
      if (viewMode.value !== 'map') return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18
      const nextZ = Math.max(0.9, Math.min(5.2, zoom.value * factor))
      if (Math.abs(nextZ - zoom.value) < 0.001) return
      const rect = wrapRef.value.getBoundingClientRect()
      const mx = e.clientX - rect.left - width.value / 2
      const my = e.clientY - rect.top - height.value / 2
      const ratio = nextZ / zoom.value
      const [nx, ny] = clampPan(mx - (mx - panX.value) * ratio, my - (my - panY.value) * ratio, nextZ)
      zoom.value = nextZ
      panX.value = nx
      panY.value = ny
      dockVersion.value += 1
    }

    function onPointerDown(e) {
      if (viewMode.value !== 'map' || e.button !== 0) return
      if (e.target && e.target.closest('button, .ga-dock, .ga-ctrl-bar')) return
      dragging.value = true
      dragStart = { x: e.clientX, y: e.clientY, px: panX.value, py: panY.value }
    }

    function onPointerMove(e) {
      if (dragging.value && dragStart) {
        const [nx, ny] = clampPan(dragStart.px + (e.clientX - dragStart.x), dragStart.py + (e.clientY - dragStart.y), zoom.value)
        panX.value = nx
        panY.value = ny
        dockVersion.value += 1
        return
      }
      if (tooltip.value && wrapRef.value) {
        const rect = wrapRef.value.getBoundingClientRect()
        tooltip.value = {
          ...tooltip.value,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        }
      }
    }

    function onPointerUp() {
      dragging.value = false
      dragStart = null
    }

    function zoomStep(mult) {
      const nextZ = Math.max(0.9, Math.min(5.2, zoom.value * mult))
      const [nx, ny] = clampPan(panX.value * (nextZ / zoom.value), panY.value * (nextZ / zoom.value), nextZ)
      zoom.value = nextZ
      panX.value = nx
      panY.value = ny
      dockVersion.value += 1
    }

    function resetView() {
      zoom.value = 1
      panX.value = 0
      panY.value = 0
      dockVersion.value += 1
    }

    function showTip(e, kind, data) {
      if (!wrapRef.value) return
      const rect = wrapRef.value.getBoundingClientRect()
      tooltip.value = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        kind,
        data,
      }
    }

    function clearHover() {
      hoveredCountryIso.value = ''
      hoveredEntityId.value = null
      hoveredAssetId.value = null
      hoveredEventId.value = null
      hoveredArcKey.value = ''
      hoveredFlowNodeId.value = null
      tooltip.value = null
      emit('hover', null)
    }

    const tooltipStyle = computed(() => {
      if (!tooltip.value) return { display: 'none' }
      const tipW = 248
      const tipH = 148
      const pad = 10
      let lx = tooltip.value.x + 14
      let ty = tooltip.value.y - 12
      if (lx + tipW > width.value - pad) lx = Math.max(pad, tooltip.value.x - tipW - 14)
      if (ty + tipH > height.value - (hasDock.value ? 46 : 10)) ty = Math.max(pad, height.value - (hasDock.value ? 50 : 12) - tipH)
      if (ty < pad) ty = pad
      return {
        left: lx + 'px',
        top: ty + 'px',
      }
    })

    // Country hover / click
    function onCountryEnter(cp, e) {
      if (!cp.stat) return
      hoveredCountryIso.value = cp.iso
      showTip(e, 'country', cp.stat)
    }
    function onCountryClick(cp) {
      if (cp.stat && cp.stat.name_zh) emit('pick', cp.stat.name_zh)
    }

    // Entity marker hover / click
    function onEntityEnter(g, e) {
      hoveredEntityId.value = g.id
      emit('hover', g.id)
      showTip(e, 'entity', g)
    }
    function onEntityClick(g) {
      emit('pick', g.canonical_name)
    }

    // Event beacon hover / click
    function onEventEnter(ev, e) {
      hoveredEventId.value = ev.id
      hoveredCountryIso.value = ev.effIso
      showTip(e, 'event', ev)
    }

    // Arc hover
    function onArcEnter(arc, e) {
      hoveredArcKey.value = arc.key
      showTip(e, 'arc', arc)
    }

    // Asset dock hover / click
    function onAssetEnter(a, e) {
      hoveredAssetId.value = a.id
      emit('hover', a.id)
      dockVersion.value += 1
      showTip(e, 'asset', a)
    }
    function onAssetClick(a) {
      emit('pick', a.canonical_name)
    }

    // Summary KPIs for editorial header
    const mapSummary = computed(() => {
      const cs = props.countries || []
      const highConflict = cs.filter((c) => Number(c.conflict_level) >= 4).length
      const bullishAssets = (props.assets || []).filter((a) => a.stance === 'bullish').length
      const bearishAssets = (props.assets || []).filter((a) => a.stance === 'bearish').length
      return {
        countries: cs.length,
        highConflict,
        events: (props.events || []).length,
        bullishAssets,
        bearishAssets,
      }
    })

    function syncSize() {
      const el = wrapRef.value
      if (!el) return
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 40 && h > 40) {
        width.value = w
        height.value = h
        dockVersion.value += 1
      }
    }

    onMounted(() => {
      nextTick(() => {
        syncSize()
        if (wrapRef.value && typeof ResizeObserver !== 'undefined') {
          ro = new ResizeObserver(() => {
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => {
              rafId = 0
              syncSize()
            })
          })
          ro.observe(wrapRef.value)
        }
      })
      window.addEventListener('pointerup', onPointerUp)
    })

    watch(() => [props.nodes, props.countries, props.assets, props.isMaximized, props.refreshTick, viewMode.value], () => {
      nextTick(() => {
        syncSize()
        dockVersion.value += 1
      })
    })

    onBeforeUnmount(() => {
      if (rafId) cancelAnimationFrame(rafId)
      if (ro) ro.disconnect()
      window.removeEventListener('pointerup', onPointerUp)
    })

    return {
      wrapRef, dockRef, setAssetEl,
      width, height, isDark, viewMode,
      showArcs, showEvents, showEntities,
      zoom, dragging, hasDock, visibleAssets,
      spherePath, graticulePath, bordersPath, countryPaths,
      mapGroupTransform, invScale,
      geoEntities, geoEvents, geoArcs, transmissionLines,
      flowLayout, hoveredFlowNodeId,
      hoveredArcKey, tooltip, tooltipStyle, mapSummary,
      countryFill, countryOpacity, arcOpacity, entityOpacity,
      assetChipHighlighted, assetChipDimmed,
      onWheel, onPointerDown, onPointerMove, onPointerUp,
      zoomStep, resetView, showTip, clearHover,
      onCountryEnter, onCountryClick,
      onEntityEnter, onEntityClick,
      onEventEnter, onArcEnter,
      onAssetEnter, onAssetClick,
      conflictTierText, conflictColor, relTypeLabel, fmtRelTime,
    }
  },
  template: `
    <div ref="wrapRef"
         :class="['ga-root', isDark ? 'is-dark' : 'is-light', { 'is-drag': dragging, 'is-narrow': width < 430 }]"
         @wheel="onWheel"
         @pointerdown="onPointerDown"
         @pointermove="onPointerMove"
         @mouseleave="clearHover">

      <!-- Top-left editorial control bar: View Mode + Layer Toggles -->
      <div class="ga-ctrl-bar ga-ctrl-left">
        <div class="ga-seg">
          <button type="button" :class="['ga-seg-btn', viewMode === 'map' ? 'on' : '']" @click.stop="viewMode = 'map'">全球态势</button>
          <button type="button" :class="['ga-seg-btn', viewMode === 'flow' ? 'on' : '']" @click.stop="viewMode = 'flow'">因果传导</button>
        </div>
        <template v-if="viewMode === 'map'">
          <button type="button" :class="['ga-layer-chip', showEvents ? 'on' : '']" @click.stop="showEvents = !showEvents" title="显示/隐藏高危冲突事件脉冲">
            <span class="ga-chip-dot" style="background:#dc2626"></span>事件
          </button>
          <button type="button" :class="['ga-layer-chip', showArcs ? 'on' : '']" @click.stop="showArcs = !showArcs" title="显示/隐藏冲突与关联弧线">
            <span class="ga-chip-line"></span>弧线
          </button>
          <button type="button" :class="['ga-layer-chip', showEntities ? 'on' : '']" @click.stop="showEntities = !showEntities" title="显示/隐藏实体锚点">
            <span class="ga-chip-dot" style="background:#2563eb"></span>实体
          </button>
        </template>
      </div>

      <!-- Top-right editorial legend & zoom controls -->
      <div class="ga-ctrl-bar ga-ctrl-right">
        <div v-if="viewMode === 'map'" class="ga-conflict-scale" title="国家底色代表地缘冲突与风险烈度（Lv.1~Lv.5）">
          <span class="ga-scale-lbl">冲突</span>
          <span class="ga-scale-swatch" :style="{ background: isDark ? '#52411f' : '#fde68a' }"></span>
          <span class="ga-scale-swatch" :style="{ background: isDark ? '#7c3f1c' : '#fdba74' }"></span>
          <span class="ga-scale-swatch" :style="{ background: isDark ? '#8c2626' : '#f87171' }"></span>
          <span class="ga-scale-swatch" :style="{ background: isDark ? '#b91c1c' : '#dc2626' }"></span>
          <span v-if="mapSummary.highConflict" class="ga-scale-badge">{{ mapSummary.highConflict }}高危</span>
        </div>
        <div v-if="viewMode === 'map'" class="ga-zoom-grp">
          <button type="button" class="ga-zbtn" @click.stop="zoomStep(1.32)" title="放大">+</button>
          <button type="button" class="ga-zbtn" @click.stop="zoomStep(1 / 1.32)" title="缩小">−</button>
          <button v-if="zoom !== 1" type="button" class="ga-zbtn ga-zbtn-rst" @click.stop="resetView" title="重置视角">1:1</button>
        </div>
      </div>

      <!-- ==================== VIEW 1: D3-GEO EDITORIAL WORLD ATLAS ==================== -->
      <svg v-if="viewMode === 'map'" class="ga-svg" :viewBox="'0 0 ' + width + ' ' + height" :width="width" :height="height">
        <defs>
          <radialGradient id="ga-ocean-light" cx="50%" cy="46%" r="65%">
            <stop offset="0%" stop-color="#fafcfe" />
            <stop offset="100%" stop-color="#eef3f9" />
          </radialGradient>
          <radialGradient id="ga-ocean-dark" cx="50%" cy="46%" r="65%">
            <stop offset="0%" stop-color="#0f172a" />
            <stop offset="100%" stop-color="#090e1a" />
          </radialGradient>
        </defs>

        <g :transform="mapGroupTransform">
          <!-- Sphere ocean background & subtle graticule -->
          <path :d="spherePath" :fill="isDark ? 'url(#ga-ocean-dark)' : 'url(#ga-ocean-light)'"
                :stroke="isDark ? 'rgba(148,163,184,0.18)' : 'rgba(148,163,184,0.42)'"
                :stroke-width="0.7 * invScale" />
          <path :d="graticulePath" fill="none"
                :stroke="isDark ? 'rgba(148,163,184,0.09)' : 'rgba(148,163,184,0.22)'"
                :stroke-width="0.45 * invScale" />

          <!-- Country Choropleth Layer -->
          <g class="ga-countries">
            <path v-for="cp in countryPaths" :key="cp.key"
                  :d="cp.d"
                  :fill="countryFill(cp)"
                  :fill-opacity="countryOpacity(cp)"
                  :class="['ga-country', { 'is-active': !!cp.stat }]"
                  @mouseenter="onCountryEnter(cp, $event)"
                  @mouseleave="clearHover"
                  @click.stop="onCountryClick(cp)" />
          </g>

          <!-- Crisp Country Borders Mesh -->
          <path :d="bordersPath" fill="none"
                :stroke="isDark ? 'rgba(15,23,42,0.75)' : '#ffffff'"
                :stroke-width="0.65 * invScale"
                pointer-events="none" />

          <!-- Semantic Relationship & Conflict Arcs -->
          <g v-if="showArcs" class="ga-arcs">
            <path v-for="arc in geoArcs" :key="arc.key"
                  :d="arc.d"
                  fill="none"
                  :stroke="arc.stroke"
                  :stroke-width="Math.min(2.6, 0.9 + Math.log1p(arc.weight) * 0.52) * invScale"
                  :stroke-opacity="arcOpacity(arc)"
                  :stroke-dasharray="arc.rel_type === 'conflict' ? (4.5 * invScale + ' ' + 3 * invScale) : (arc.rel_type === 'sanction' ? (2.5 * invScale + ' ' + 2.5 * invScale) : 'none')"
                  :class="['ga-arc', { 'is-conflict-flow': arc.isConflict && (hoveredArcKey === arc.key || arc.conflict_level >= 4) }]"
                  stroke-linecap="round"
                  @mouseenter="onArcEnter(arc, $event)"
                  @mouseleave="clearHover" />
          </g>

          <!-- High-Conflict Hotspot Event Beacons -->
          <g v-if="showEvents" class="ga-events">
            <g v-for="ev in geoEvents" :key="'ev-' + ev.id"
               :transform="'translate(' + ev.x.toFixed(1) + ',' + ev.y.toFixed(1) + ')'"
               class="ga-event-beacon"
               @mouseenter="onEventEnter(ev, $event)"
               @mouseleave="clearHover">
              <circle :r="(ev.conflict_level >= 5 ? 11 : 8) * invScale"
                      fill="none" :stroke="ev.col" :stroke-width="1.2 * invScale"
                      class="ga-pulse-ring" />
              <circle :r="(ev.conflict_level >= 5 ? 4.2 : 3.2) * invScale"
                      :fill="ev.col" fill-opacity="0.22"
                      :stroke="ev.col" :stroke-width="1.1 * invScale" />
              <circle :r="1.8 * invScale" :fill="ev.col" />
            </g>
          </g>

          <!-- Geo-Anchored Entity Markers & De-overlapped Editorial Labels -->
          <g v-if="showEntities" class="ga-entities">
            <g v-for="g in geoEntities" :key="'ge-' + g.id"
               :transform="'translate(' + g.x.toFixed(1) + ',' + g.y.toFixed(1) + ')'"
               :opacity="entityOpacity(g)"
               class="ga-entity-node"
               @mouseenter="onEntityEnter(g, $event)"
               @mouseleave="clearHover"
               @click.stop="onEntityClick(g)">
              <!-- ORG: crisp diamond badge -->
              <rect v-if="g.entity_type === 'ORG'"
                    :x="-g.r * 0.72 * invScale" :y="-g.r * 0.72 * invScale"
                    :width="g.r * 1.44 * invScale" :height="g.r * 1.44 * invScale"
                    :rx="1.5 * invScale"
                    transform="rotate(45)"
                    :fill="g.col" :fill-opacity="isDark ? 0.88 : 0.86"
                    :stroke="isDark ? '#0f172a' : '#ffffff'" :stroke-width="1.3 * invScale" />
              <!-- PER: double-ring marker -->
              <g v-else-if="g.entity_type === 'PER'">
                <circle :r="g.r * 0.86 * invScale" :fill="isDark ? '#0f172a' : '#ffffff'"
                        :stroke="g.col" :stroke-width="1.6 * invScale" />
                <circle :r="g.r * 0.42 * invScale" :fill="g.col" />
              </g>
              <!-- LOC / EVENT: editorial circle with sentiment halo -->
              <g v-else>
                <circle :r="(g.r + 1.8) * invScale" :fill="g.col" fill-opacity="0.18" />
                <circle :r="g.r * 0.82 * invScale"
                        :fill="g.col" :fill-opacity="0.9"
                        :stroke="isDark ? '#0f172a' : '#ffffff'" :stroke-width="1.35 * invScale" />
              </g>

              <text v-if="g.showLabel"
                    :x="g.labelDx"
                    :y="g.labelDy"
                    text-anchor="middle"
                    :font-size="10.2 * invScale"
                    :font-weight="g.conflict_level >= 4 || g.mentions >= 40 ? 700 : 600"
                    :fill="isDark ? '#e2e8f0' : '#0f172a'"
                    :stroke="isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)'"
                    :stroke-width="2.8 * invScale"
                    paint-order="stroke"
                    class="ga-label">{{ g.shortName }}</text>
            </g>
          </g>
        </g>

        <!-- Screen-space Dynamic Bezier Transmission Curves (Map Hotspot <-> Bottom Asset Impact Dock) -->
        <g v-if="transmissionLines.length" class="ga-tx-layer" pointer-events="none">
          <g v-for="tl in transmissionLines" :key="tl.key">
            <path :d="tl.d" fill="none" :stroke="tl.col" stroke-width="2.1" stroke-opacity="0.82"
                  stroke-dasharray="5 3" class="ga-tx-curve" />
            <circle :cx="tl.sx" :cy="tl.sy" r="4" :fill="tl.col" :stroke="isDark ? '#0f172a' : '#ffffff'" stroke-width="1.5" />
            <circle :cx="tl.tx" :cy="tl.ty" r="3.2" :fill="tl.col" />
          </g>
        </g>
      </svg>

      <!-- ==================== VIEW 2: 3-COLUMN EDITORIAL CAUSAL FLOW ==================== -->
      <svg v-else class="ga-svg" :viewBox="'0 0 ' + width + ' ' + height" :width="width" :height="height">
        <!-- Column Headers -->
        <g v-if="flowLayout.colXs">
          <text :x="flowLayout.colXs[0] + flowLayout.colW / 2" y="25" text-anchor="middle" class="ga-flow-hdr">地缘地区 / 热点事件</text>
          <text :x="flowLayout.colXs[1] + flowLayout.colW / 2" y="25" text-anchor="middle" class="ga-flow-hdr">核心机构 / 关键人物</text>
          <text :x="flowLayout.colXs[2] + flowLayout.colW / 2" y="25" text-anchor="middle" class="ga-flow-hdr">资产传导（利多 / 利空）</text>
        </g>

        <!-- Smooth Causal Ribbons -->
        <g>
          <path v-for="lk in flowLayout.links" :key="lk.key"
                :d="lk.d"
                fill="none"
                :stroke="lk.stroke"
                :stroke-width="Math.min(3, 1 + Math.log1p(lk.weight) * 0.65)"
                :stroke-opacity="hoveredFlowNodeId == null ? 0.36 : ((lk.sourceId === hoveredFlowNodeId || lk.targetId === hoveredFlowNodeId) ? 0.92 : 0.06)"
                stroke-linecap="round" />
        </g>

        <!-- Column Cards -->
        <g v-for="(col, ci) in flowLayout.cols" :key="'fc-' + ci">
          <g v-for="nd in col" :key="'fn-' + nd.id"
             class="ga-flow-card"
             :opacity="hoveredFlowNodeId == null || hoveredFlowNodeId === nd.id || flowLayout.links.some((l) => (l.sourceId === hoveredFlowNodeId && l.targetId === nd.id) || (l.targetId === hoveredFlowNodeId && l.sourceId === nd.id)) ? 1 : 0.28"
             @mouseenter="hoveredFlowNodeId = nd.id; showTip($event, ci === 2 ? 'asset' : 'entity', nd.raw)"
             @mouseleave="clearHover"
             @click.stop="$emit('pick', nd.name)">
            <rect :x="nd.x" :y="nd.y" :width="nd.w" :height="nd.h" rx="4"
                  :fill="isDark ? '#1e293b' : '#ffffff'"
                  :stroke="hoveredFlowNodeId === nd.id ? nd.col : (isDark ? '#334155' : '#cbd5e1')"
                  :stroke-width="hoveredFlowNodeId === nd.id ? 1.5 : 1" />
            <rect :x="nd.x" :y="nd.y" width="3.5" :height="nd.h" rx="1.5" :fill="nd.col" />
            <text :x="nd.x + 9" :y="nd.cy + 3.5" font-size="10.5" font-weight="600"
                  :fill="isDark ? '#e2e8f0' : '#0f172a'">{{ nd.shortName }}</text>
            <text :x="nd.x + nd.w - 6" :y="nd.cy + 3.2" text-anchor="end" font-size="9.5" font-weight="700"
                  :fill="nd.col" class="ft-mono">
              {{ ci === 2 ? (nd.stance === 'bullish' ? '▲多' : (nd.stance === 'bearish' ? '▼空' : '●平')) : nd.mentions }}
            </text>
          </g>
        </g>
      </svg>

      <!-- Bottom Floating Frosted-Glass Financial Asset Impact Dock (利多 / 利空) -->
      <div v-if="hasDock" ref="dockRef" class="ga-dock">
        <span class="ga-dock-title" title="悬停资产可追踪地图驱动源，点击查看详情档案">利多/利空传导</span>
        <div class="ga-dock-pills">
          <button v-for="a in visibleAssets" :key="'ad-' + a.id"
                  :ref="(el) => setAssetEl(a.id, el)"
                  type="button"
                  :class="['ga-asset-chip', a.stance, { 'is-hl': assetChipHighlighted(a), 'is-dim': assetChipDimmed(a) }]"
                  @mouseenter="onAssetEnter(a, $event)"
                  @mouseleave="clearHover"
                  @click.stop="onAssetClick(a)">
            <span class="ga-asset-arrow">{{ a.stance === 'bullish' ? '▲' : (a.stance === 'bearish' ? '▼' : '●') }}</span>
            <span class="ga-asset-name">{{ a.canonical_name }}</span>
            <span class="ga-asset-score ft-mono">{{ a.net_sentiment > 0 ? '+' : '' }}{{ Number(a.net_sentiment || 0).toFixed(2) }}</span>
          </button>
        </div>
      </div>

      <!-- Editorial Floating Hover Dossier Card -->
      <div v-if="tooltip" class="ga-tooltip" :style="tooltipStyle">
        <!-- Country Tooltip -->
        <template v-if="tooltip.kind === 'country'">
          <div class="ga-tip-head">
            <span class="ga-tip-title">{{ tooltip.data.name_zh }}</span>
            <span class="ga-tip-badge" :style="{ background: conflictColor(tooltip.data.conflict_level, isDark) + '22', color: conflictColor(tooltip.data.conflict_level, isDark) }">
              Lv.{{ tooltip.data.conflict_level }} {{ tooltip.data.conflict_tier }}
            </span>
          </div>
          <div class="ga-tip-meta">
            <span>情报 <b>{{ tooltip.data.mentions }}</b> 条</span>
            <span>净情绪 <b :style="{ color: tooltip.data.net_sentiment > 0.08 ? '#10b981' : (tooltip.data.net_sentiment < -0.08 ? '#ef4444' : '#3b82f6') }">{{ tooltip.data.net_sentiment > 0 ? '+' : '' }}{{ Number(tooltip.data.net_sentiment || 0).toFixed(2) }}</b></span>
          </div>
          <div v-if="tooltip.data.linked_assets && tooltip.data.linked_assets.length" class="ga-tip-assets">
            <span v-for="la in tooltip.data.linked_assets.slice(0, 3)" :key="la.id" :class="['ga-tip-ac', la.stance]">
              {{ la.stance === 'bullish' ? '▲' : (la.stance === 'bearish' ? '▼' : '●') }} {{ la.name }}
            </span>
          </div>
          <div v-if="tooltip.data.headlines && tooltip.data.headlines.length" class="ga-tip-news">
            <div v-for="hl in tooltip.data.headlines.slice(0, 2)" :key="hl.id" class="ga-tip-hl">· {{ hl.title }}</div>
          </div>
        </template>

        <!-- Entity Tooltip -->
        <template v-else-if="tooltip.kind === 'entity'">
          <div class="ga-tip-head">
            <span class="ga-tip-title">{{ tooltip.data.canonical_name }}</span>
            <span class="ga-tip-badge">{{ tooltip.data.entity_type }}</span>
          </div>
          <div class="ga-tip-meta">
            <span v-if="tooltip.data.geo_label">{{ tooltip.data.geo_label }}</span>
            <span>提及 <b>{{ tooltip.data.mentions }}</b></span>
            <span v-if="tooltip.data.conflict_level">冲突 <b>Lv.{{ tooltip.data.conflict_level }}</b></span>
          </div>
          <div class="ga-tip-meta">
            <span>多 {{ tooltip.data.bullish || 0 }} / 中 {{ tooltip.data.neutral || 0 }} / 空 {{ tooltip.data.bearish || 0 }}</span>
            <b :style="{ color: tooltip.data.net_sentiment > 0.08 ? '#10b981' : (tooltip.data.net_sentiment < -0.08 ? '#ef4444' : '#3b82f6') }">
              {{ tooltip.data.net_sentiment > 0 ? '+' : '' }}{{ Number(tooltip.data.net_sentiment || 0).toFixed(2) }}
            </b>
          </div>
          <div class="ga-tip-foot">点击查看实体完整情报档案</div>
        </template>

        <!-- Event Beacon Tooltip -->
        <template v-else-if="tooltip.kind === 'event'">
          <div class="ga-tip-head">
            <span class="ga-tip-title">{{ tooltip.data.region }}</span>
            <span class="ga-tip-badge" :style="{ background: conflictColor(tooltip.data.conflict_level, isDark) + '22', color: conflictColor(tooltip.data.conflict_level, isDark) }">
              Lv.{{ tooltip.data.conflict_level }} {{ tooltip.data.conflict_tier }}
            </span>
          </div>
          <div class="ga-tip-hl" style="margin-top:4px;font-weight:600">{{ tooltip.data.title }}</div>
          <div class="ga-tip-meta" style="margin-top:4px">
            <span>{{ tooltip.data.feed_name }}</span>
            <span>{{ fmtRelTime(tooltip.data.published_at) }}</span>
          </div>
        </template>

        <!-- Arc Tooltip -->
        <template v-else-if="tooltip.kind === 'arc'">
          <div class="ga-tip-head">
            <span class="ga-tip-title">{{ tooltip.data.sourceName }} ↔ {{ tooltip.data.targetName }}</span>
            <span class="ga-tip-badge" :style="{ background: tooltip.data.stroke + '22', color: tooltip.data.stroke }">
              {{ relTypeLabel(tooltip.data.rel_type) }}
            </span>
          </div>
          <div class="ga-tip-meta">
            <span>共现 <b>{{ tooltip.data.weight }}</b> 篇</span>
            <span>冲突均级 <b>Lv.{{ tooltip.data.conflict_level }}</b></span>
          </div>
          <div v-if="tooltip.data.sample_title" class="ga-tip-hl" style="margin-top:3px">· {{ tooltip.data.sample_title }}</div>
        </template>

        <!-- Asset Dock Tooltip -->
        <template v-else-if="tooltip.kind === 'asset'">
          <div class="ga-tip-head">
            <span class="ga-tip-title">{{ tooltip.data.canonical_name }}</span>
            <span :class="['ga-tip-ac', tooltip.data.stance]">
              {{ tooltip.data.stance === 'bullish' ? '▲ 偏利多' : (tooltip.data.stance === 'bearish' ? '▼ 偏利空' : '● 中性') }}
            </span>
          </div>
          <div class="ga-tip-meta">
            <span>提及 <b>{{ tooltip.data.mentions }}</b></span>
            <span>多 {{ tooltip.data.bullish }} / 中 {{ tooltip.data.neutral }} / 空 {{ tooltip.data.bearish }}</span>
          </div>
          <div v-if="tooltip.data.sample_title" class="ga-tip-hl" style="margin-top:3px">· {{ tooltip.data.sample_title }}</div>
          <div class="ga-tip-foot">虚线指向当前地图主要驱动地区 · 点击看档案</div>
        </template>
      </div>
    </div>
  `,
}
