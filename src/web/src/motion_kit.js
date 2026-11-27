import { computed, defineComponent, h } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { AnimateUIProvider } from '@animate-ui/vue/provider'
import {
  blur,
  ease,
  ReducedMotionConfig,
  scale,
  scaleTransition,
  shift,
  spring,
  toCssTiming,
  transition as motionTransition,
  useMotionTokens,
  useShouldReduceMotion,
  useTempoTransition,
} from '@animate-ui/vue/utils/motion'
import { SlidingNumber } from '@animate-ui/vue/primitives/texts/sliding-number'

export {
  AnimatePresence,
  AnimateUIProvider,
  blur,
  ease,
  motion,
  motionTransition,
  ReducedMotionConfig,
  scale,
  scaleTransition,
  shift,
  SlidingNumber,
  spring,
  toCssTiming,
  useMotionTokens,
  useShouldReduceMotion,
  useTempoTransition,
}

const CSS_TOKEN_ENTRIES = [
  ['--aui-spring-press', spring.press],
  ['--aui-spring-selection', spring.selection],
  ['--aui-spring-highlight', spring.highlight],
  ['--aui-spring-pop', spring.pop],
  ['--aui-spring-thumb', spring.thumb],
  ['--aui-spring-dialog', spring.dialog],
  ['--aui-spring-slide', spring.slide],
  ['--aui-menu', motionTransition.menu],
  ['--aui-overlay', motionTransition.overlay],
  ['--aui-disclosure', motionTransition.disclosure],
  ['--aui-sheet', motionTransition.sheet],
  ['--aui-dismiss', motionTransition.dismiss],
  ['--aui-panel-in', motionTransition.panelIn],
  ['--aui-panel-out', motionTransition.panelOut],
  ['--aui-swap', motionTransition.swap],
  ['--aui-spin', motionTransition.spin],
  ['--aui-color', motionTransition.color],
  ['--aui-fade', motionTransition.fade],
  ['--aui-reveal', motionTransition.reveal],
]

export function clampTempo(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 1
  return Math.max(0.5, Math.min(2, Math.round(n * 100) / 100))
}

export function syncMotionCssVars(tempo = 1) {
  if (typeof document === 'undefined') return
  const t = clampTempo(tempo)
  const rootStyle = document.documentElement.style
  rootStyle.setProperty('--aui-tempo', String(t))
  for (const [varName, token] of CSS_TOKEN_ENTRIES) {
    const paced = t === 1 ? token : scaleTransition(token, t)
    const { duration, easing } = toCssTiming(paced)
    rootStyle.setProperty(varName, `${duration}ms ${easing}`)
  }
}

const THEME_WIPE_TYPE = 'animate-ui-theme'

export function triggerThemeWipe(updateFn, tempo = 1, direction = 'ltr') {
  if (typeof document === 'undefined') {
    updateFn()
    return
  }
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || typeof document.startViewTransition !== 'function') {
    updateFn()
    return
  }
  let vt
  try {
    vt = document.startViewTransition({
      update: updateFn,
      types: [THEME_WIPE_TYPE],
    })
  } catch {
    try {
      vt = document.startViewTransition(updateFn)
    } catch {
      updateFn()
      return
    }
  }
  const clipFrames =
    direction === 'rtl'
      ? ['inset(0 0 0 100%)', 'inset(0 0 0 0)']
      : direction === 'ttb'
        ? ['inset(0 0 100% 0)', 'inset(0 0 0 0)']
        : direction === 'btt'
          ? ['inset(100% 0 0 0)', 'inset(0 0 0 0)']
          : ['inset(0 100% 0 0)', 'inset(0 0 0 0)']
  const dur = Math.round(520 * clampTempo(tempo))
  vt.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: clipFrames },
        {
          duration: dur,
          easing: 'cubic-bezier(0.77, 0, 0.175, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    })
    .catch(() => {})
}

/**
 * Menu / dropdown popover following Animate UI Menu recipe:
 * grows from trigger origin at scale.menu (0.9) on transition.menu (220ms ease.soft).
 */
export const AuiMenuPop = defineComponent({
  name: 'AuiMenuPop',
  props: {
    open: { type: Boolean, default: false },
    origin: { type: String, default: 'top left' },
    panelClass: { type: [String, Array, Object], default: '' },
    panelStyle: { type: Object, default: () => ({}) },
    slideX: { type: Number, default: 0 },
    stopClick: { type: Boolean, default: false },
    stopPointerdown: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    const reduce = useShouldReduceMotion()
    const menuTrans = useTempoTransition(() => motionTransition.menu)
    return () =>
      h(
        AnimatePresence,
        null,
        {
          default: () =>
            props.open
              ? h(
                  motion.div,
                  {
                    key: 'aui-menu-pop',
                    class: props.panelClass,
                    style: {
                      transformOrigin: props.origin,
                      ...props.panelStyle,
                    },
                    initial: {
                      opacity: 0,
                      scale: reduce.value ? 1 : scale.menu,
                      x: reduce.value ? 0 : props.slideX,
                      filter: blur.icon,
                    },
                    animate: {
                      opacity: 1,
                      scale: 1,
                      x: 0,
                      filter: 'blur(0px)',
                      transition: menuTrans.value,
                      transitionEnd: { filter: 'none' },
                    },
                    exit: {
                      opacity: 0,
                      scale: reduce.value ? 1 : scale.menu,
                      x: reduce.value ? 0 : props.slideX,
                      filter: blur.icon,
                      transition: menuTrans.value,
                    },
                    onClick: props.stopClick ? (e) => e.stopPropagation() : undefined,
                    onPointerdown: props.stopPointerdown ? (e) => e.stopPropagation() : undefined,
                  },
                  slots.default,
                )
              : null,
        },
      )
  },
})

/**
 * Popover / floating tooltip card following Animate UI Overlay recipe:
 * springs from scale.popover (0.8) or scale.tooltip (0.7) on spring.pop.
 */
export const AuiPopover = defineComponent({
  name: 'AuiPopover',
  props: {
    open: { type: Boolean, default: false },
    origin: { type: String, default: 'top left' },
    kind: { type: String, default: 'popover' },
    popClass: { type: [String, Array, Object], default: '' },
    popStyle: { type: Object, default: () => ({}) },
  },
  setup(props, { slots }) {
    const reduce = useShouldReduceMotion()
    const enter = useTempoTransition(() => spring.pop)
    const leave = useTempoTransition(() => motionTransition.popOut)
    return () => {
      const fromScale = props.kind === 'tooltip' ? scale.tooltip : scale.popover
      const hidden = {
        opacity: 0,
        scale: reduce.value ? 1 : fromScale,
        filter: blur.icon,
      }
      return h(
        AnimatePresence,
        null,
        {
          default: () =>
            props.open
              ? h(
                  motion.div,
                  {
                    key: 'aui-popover',
                    class: props.popClass,
                    style: {
                      transformOrigin: props.origin,
                      ...props.popStyle,
                    },
                    initial: hidden,
                    animate: {
                      opacity: 1,
                      scale: 1,
                      filter: 'blur(0px)',
                      transition: enter.value,
                      transitionEnd: { filter: 'none' },
                    },
                    exit: {
                      ...hidden,
                      transition: leave.value,
                    },
                  },
                  slots.default,
                )
              : null,
        },
      )
    }
  },
})

/**
 * Edge sheet / floating dock panel following Animate UI Sheet recipe:
 * slides from edge on transition.sheet (400ms ease.soft), exits on transition.dismiss (200ms ease.away).
 */
export const AuiSheet = defineComponent({
  name: 'AuiSheet',
  props: {
    open: { type: Boolean, default: false },
    side: { type: String, default: 'right' },
    floating: { type: Boolean, default: false },
    sheetClass: { type: [String, Array, Object], default: '' },
    sheetStyle: { type: Object, default: null },
  },
  setup(props, { slots }) {
    const reduce = useShouldReduceMotion()
    const sheetEnter = useTempoTransition(() => motionTransition.sheet)
    const popEnter = useTempoTransition(() => spring.pop)
    const leave = useTempoTransition(() => motionTransition.dismiss)
    const offscreenMap = {
      right: 'translateX(100%)',
      left: 'translateX(-100%)',
      top: 'translateY(-100%)',
      bottom: 'translateY(100%)',
    }
    return () => {
      const isHoriz = props.side === 'left' || props.side === 'right'
      const shownTransform = isHoriz ? 'translateX(0%)' : 'translateY(0%)'
      const hidden = props.floating
        ? {
            opacity: 0,
            transform: reduce.value ? 'scale(1)' : `scale(${scale.popover})`,
            filter: blur.surface,
          }
        : {
            opacity: 0,
            transform: reduce.value ? shownTransform : (offscreenMap[props.side] || 'translateX(100%)'),
          }
      const shown = props.floating
        ? {
            opacity: 1,
            transform: 'scale(1)',
            filter: 'blur(0px)',
            transition: popEnter.value,
            transitionEnd: { transform: 'none', filter: 'none' },
          }
        : {
            opacity: 1,
            transform: shownTransform,
            transition: sheetEnter.value,
            transitionEnd: { transform: 'none' },
          }
      return h(
        AnimatePresence,
        null,
        {
          default: () =>
            props.open
              ? h(
                  motion.div,
                  {
                    key: 'aui-sheet',
                    class: props.sheetClass,
                    style: props.sheetStyle || undefined,
                    initial: hidden,
                    animate: shown,
                    exit: {
                      ...hidden,
                      transition: leave.value,
                    },
                  },
                  slots.default,
                )
              : null,
        },
      )
    }
  },
})

/**
 * Disclosure / accordion panel following Animate UI Disclosure recipe:
 * animates height 0 -> auto with blur.disclosure (2px) on transition.disclosure (350ms ease.soft).
 * Under reduced motion, height jumps immediately while opacity & blur still play.
 */
export const AuiDisclosure = defineComponent({
  name: 'AuiDisclosure',
  props: {
    open: { type: Boolean, default: false },
    bodyClass: { type: [String, Array, Object], default: '' },
    initialAnim: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    const reduce = useShouldReduceMotion()
    const discTrans = useTempoTransition(() => motionTransition.disclosure)
    const fadeTrans = useTempoTransition(() => motionTransition.fade)
    return () => {
      const collapsed = reduce.value
        ? { opacity: 0, filter: blur.disclosure }
        : { height: 0, opacity: 0, filter: blur.disclosure }
      const expanded = reduce.value
        ? {
            opacity: 1,
            filter: 'blur(0px)',
            transition: fadeTrans.value,
            transitionEnd: { filter: 'none' },
          }
        : {
            height: 'auto',
            opacity: 1,
            filter: 'blur(0px)',
            transition: discTrans.value,
            transitionEnd: { filter: 'none' },
          }
      const leaving = {
        ...collapsed,
        transition: reduce.value ? fadeTrans.value : discTrans.value,
      }
      return h(
        AnimatePresence,
        { initial: props.initialAnim },
        {
          default: () =>
            props.open
              ? h(
                  motion.div,
                  {
                    key: 'aui-disclosure',
                    style: { overflow: 'hidden' },
                    initial: collapsed,
                    animate: expanded,
                    exit: leaving,
                  },
                  () => (props.bodyClass ? h('div', { class: props.bodyClass }, slots.default ? slots.default() : []) : (slots.default ? slots.default() : [])),
                )
              : null,
        },
      )
    }
  },
})

/**
 * Backdrop overlay following Animate UI Modal recipe (B7):
 * animates backgroundColor and backdropFilter directly from transparent/none (never opacity over blur).
 */
export const AuiBackdrop = defineComponent({
  name: 'AuiBackdrop',
  props: {
    open: { type: Boolean, default: false },
    backdropClass: { type: [String, Array, Object], default: 'fg-max-backdrop' },
  },
  emits: ['click'],
  setup(props, { emit }) {
    const overlayTrans = useTempoTransition(() => motionTransition.overlay)
    return () =>
      h(
        AnimatePresence,
        null,
        {
          default: () =>
            props.open
              ? h(motion.div, {
                  key: 'aui-backdrop',
                  class: props.backdropClass,
                  initial: {
                    backgroundColor: 'rgba(2, 6, 23, 0)',
                    backdropFilter: 'blur(0px)',
                  },
                  animate: {
                    backgroundColor: 'rgba(2, 6, 23, 0.56)',
                    backdropFilter: 'blur(2px)',
                    transition: overlayTrans.value,
                  },
                  exit: {
                    backgroundColor: 'rgba(2, 6, 23, 0)',
                    backdropFilter: 'blur(0px)',
                    transition: overlayTrans.value,
                  },
                  onClick: (e) => emit('click', e),
                })
              : null,
        },
      )
  },
})

/**
 * Icon swapper following Animate UI Swap recipe:
 * bridges two icons in place through blur.icon (2px) & scale.icon (0.5), optionally rotating 90deg (transition.spin).
 */
export const AuiIconSwap = defineComponent({
  name: 'AuiIconSwap',
  props: {
    iconKey: { type: String, required: true },
    html: { type: String, default: '' },
    spin: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    const reduce = useShouldReduceMotion()
    const swapTrans = useTempoTransition(() =>
      props.spin ? motionTransition.spin : motionTransition.swap,
    )
    return () => {
      const deg = props.spin && !reduce.value ? 90 : 0
      const sc = reduce.value ? 1 : scale.icon
      return h(
        'span',
        { class: 'aui-icon-swap' },
        [
          h(
            AnimatePresence,
            { mode: 'popLayout', initial: false },
            {
              default: () =>
                h(
                  motion.span,
                  {
                    key: props.iconKey,
                    class: 'aui-icon-swap-item',
                    initial: {
                      opacity: 0,
                      scale: sc,
                      rotate: -deg,
                      filter: blur.icon,
                    },
                    animate: {
                      opacity: 1,
                      scale: 1,
                      rotate: 0,
                      filter: 'blur(0px)',
                      transition: swapTrans.value,
                      transitionEnd: { filter: 'none' },
                    },
                    exit: {
                      opacity: 0,
                      scale: sc,
                      rotate: deg,
                      filter: blur.icon,
                      transition: swapTrans.value,
                    },
                    innerHTML: props.html || undefined,
                  },
                  props.html ? undefined : slots.default,
                ),
            },
          ),
        ],
      )
    }
  },
})

/**
 * Step flow transition following Animate UI Steps recipe:
 * slides by shift.step (24px) through blur.panel (5px) on panelOut (150ms) -> panelIn (300ms).
 */
export const AuiStepSwap = defineComponent({
  name: 'AuiStepSwap',
  props: {
    stepKey: { type: [String, Number], required: true },
    direction: { type: Number, default: 1 },
  },
  setup(props, { slots }) {
    const reduce = useShouldReduceMotion()
    const outTrans = useTempoTransition(() => motionTransition.panelOut)
    const inTrans = useTempoTransition(() => motionTransition.panelIn)
    return () => {
      const dx = reduce.value ? 0 : shift.step * (props.direction >= 0 ? 1 : -1)
      return h(
        AnimatePresence,
        { mode: 'wait', initial: false },
        {
          default: () =>
            h(
              motion.div,
              {
                key: String(props.stepKey),
                initial: { opacity: 0, x: dx, filter: blur.panel },
                animate: {
                  opacity: 1,
                  x: 0,
                  filter: 'blur(0px)',
                  transition: inTrans.value,
                  transitionEnd: { filter: 'none' },
                },
                exit: {
                  opacity: 0,
                  x: -dx,
                  filter: blur.panel,
                  transition: outTrans.value,
                },
              },
              slots.default,
            ),
        },
      )
    }
  },
})

/**
 * Safe numeric odometer wrapper around Animate UI SlidingNumber for financial KPIs & backtest metrics.
 */
export const AuiMetricNumber = defineComponent({
  name: 'AuiMetricNumber',
  props: {
    value: { type: [Number, String], default: null },
    decimals: { type: Number, default: 2 },
    signed: { type: Boolean, default: false },
    suffix: { type: String, default: '' },
    prefix: { type: String, default: '' },
    fallback: { type: String, default: '--' },
    thousandSeparator: { type: String, default: '' },
  },
  setup(props) {
    const num = computed(() => {
      if (props.value === null || props.value === undefined || props.value === '') return NaN
      const n = Number(props.value)
      return Number.isFinite(n) ? n : NaN
    })
    return () => {
      if (!Number.isFinite(num.value)) {
        return h('span', { class: 'aui-metric-num' }, props.fallback)
      }
      const absVal = Math.abs(num.value)
      const signStr = num.value < 0 ? '-' : (props.signed && num.value > 0 ? '+' : '')
      return h('span', { class: 'aui-metric-num' }, [
        props.prefix || null,
        signStr || null,
        h(SlidingNumber, {
          number: absVal,
          decimalPlaces: props.decimals,
          thousandSeparator: props.thousandSeparator || undefined,
          initiallyStable: true,
        }),
        props.suffix || null,
      ])
    }
  },
})
