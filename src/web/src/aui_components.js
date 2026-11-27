import { computed, defineComponent, h, ref } from 'vue'
import { Highlight, HighlightItem } from '@animate-ui/vue/primitives/effects/highlight'
import { ThemeToggler } from '@animate-ui/vue/primitives/effects/theme-toggler'
import { ScrollFade } from '@animate-ui/vue/primitives/effects/scroll-fade'
import {
  ScrollProgress,
  ScrollProgressContainer,
  ScrollProgressProvider,
} from '@animate-ui/vue/primitives/scroll-progress'
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from '@animate-ui/vue/primitives/tabs'
import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@animate-ui/vue/primitives/tooltip'
import { MotionGrid, MotionGridCells } from '@animate-ui/vue/primitives/motion-grid'
import {
  PinnedList,
  PinnedListItem,
  PinnedListItems,
  PinnedListLabel,
  PinnedListPinned,
  PinnedListTrigger,
  PinnedListUnpinned,
} from '@animate-ui/vue/primitives/pinned-list'
import { IconButton, IconButtonParticles } from '@animate-ui/vue/primitives/buttons/icon'
import { CopyButton, CopyButtonIcon } from '@animate-ui/vue/primitives/buttons/copy'
import { ShimmeringText } from '@animate-ui/vue/primitives/texts/shimmering'
import { MorphingText } from '@animate-ui/vue/primitives/texts/morphing'
import { CountingNumber } from '@animate-ui/vue/primitives/texts/counting-number'
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from '@animate-ui/vue/primitives/reka-ui/dialog'
import {
  DrawerClose,
  DrawerContent,
  DrawerHandle,
  DrawerOverlay,
  DrawerPortal,
  DrawerRoot,
  DrawerTitle,
} from '@animate-ui/vue/primitives/reka-ui/drawer'
import { SwitchRoot, SwitchThumb } from '@animate-ui/vue/primitives/reka-ui/switch'
import {
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
} from '@animate-ui/vue/primitives/reka-ui/accordion'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@animate-ui/vue/primitives/reka-ui/dropdown-menu'
import {
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from '@animate-ui/vue/primitives/reka-ui/popover'
import {
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
  createToastManager,
  useToastManager,
} from '@animate-ui/vue/primitives/reka-ui/toast'

export {
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionRoot,
  AccordionTrigger,
  CopyButton,
  CopyButtonIcon,
  CountingNumber,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Highlight,
  HighlightItem,
  IconButton,
  IconButtonParticles,
  MorphingText,
  MotionGrid,
  MotionGridCells,
  PinnedList,
  PinnedListItem,
  PinnedListItems,
  PinnedListLabel,
  PinnedListPinned,
  PinnedListTrigger,
  PinnedListUnpinned,
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  ScrollFade,
  ScrollProgress,
  ScrollProgressContainer,
  ScrollProgressProvider,
  ShimmeringText,
  Tabs,
  TabsContent,
  TabsContents,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
  ThemeToggler,
  TooltipProvider,
}

const CLOSE_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>'
const COPY_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M3.5 10.5H3a1.5 1.5 0 0 1-1.5-1.5V3A1.5 1.5 0 0 1 3 1.5h6A1.5 1.5 0 0 1 10.5 3v.5"/></svg>'
const CHECK_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 8.5l3.2 3.2L13 5"/></svg>'

function isFloatingPortalTarget(target) {
  if (!target || typeof target.closest !== 'function') return false
  return Boolean(
    target.closest(
      '.ant-select-dropdown, .ant-picker-dropdown, .ant-dropdown, .ant-popover, .ant-tooltip, .sp-popover, [data-reka-popper-content-wrapper]',
    ),
  )
}

function normWidth(w, fallback = '520px') {
  if (w === undefined || w === null || w === '') return fallback
  return typeof w === 'number' ? `${w}px` : String(w)
}

/**
 * Shared gliding Animate UI Tooltip (replaces <a-tooltip>).
 * Must sit inside <aui-tooltip-provider> at the app root.
 */
export const AuiTooltip = defineComponent({
  name: 'AuiTooltip',
  props: {
    title: { type: [String, Number], default: '' },
    side: { type: String, default: 'top' },
    sideOffset: { type: Number, default: 8 },
    align: { type: String, default: 'center' },
  },
  setup(props, { slots }) {
    return () => {
      const label = props.title !== undefined && props.title !== null ? String(props.title) : ''
      if (!label) return slots.default ? slots.default() : null
      return h(
        Tooltip,
        {
          side: props.side,
          sideOffset: props.sideOffset,
          align: props.align,
        },
        {
          default: () => [
            h(TooltipTrigger, { asChild: true }, { default: () => slots.default?.() }),
            h(TooltipContent, { class: 'aui-tooltip-content' }, {
              default: () => [
                h('span', null, label),
                h(TooltipArrow, { class: 'aui-tooltip-arrow' }),
              ],
            }),
          ],
        },
      )
    }
  },
})

/**
 * Animate UI MotionGrid 3x3 diagonal pulse loader (replaces Canvas <matrix-loader>).
 */
const MATRIX_FRAMES = [
  [[0, 0]],
  [[0, 1], [1, 0]],
  [[0, 2], [1, 1], [2, 0]],
  [[1, 2], [2, 1]],
  [[2, 2]],
  [[1, 2], [2, 1]],
  [[0, 2], [1, 1], [2, 0]],
  [[0, 1], [1, 0]],
]

export const AuiMotionLoader = defineComponent({
  name: 'AuiMotionLoader',
  props: {
    size: { type: Number, default: 14 },
    duration: { type: Number, default: 135 },
  },
  setup(props) {
    return () =>
      h(
        MotionGrid,
        {
          gridSize: [3, 3],
          frames: MATRIX_FRAMES,
          duration: props.duration,
          class: 'aui-motion-loader',
          style: { width: `${props.size}px`, height: `${props.size}px` },
          'aria-hidden': 'true',
          title: '生成中',
        },
        {
          default: () =>
            h(MotionGridCells, {
              activeProps: { class: 'aui-mg-cell on' },
              inactiveProps: { class: 'aui-mg-cell' },
            }),
        },
      )
  },
})

/**
 * Animate UI Particle Star Button (wraps IconButton + IconButtonParticles).
 */
export const AuiStarButton = defineComponent({
  name: 'AuiStarButton',
  props: {
    active: { type: Boolean, default: false },
    title: { type: String, default: '' },
    btnClass: { type: [String, Array, Object], default: '' },
    particleSize: { type: Number, default: 4 },
  },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        IconButton,
        {
          type: 'button',
          class: [props.btnClass, { on: props.active }],
          title: props.title || undefined,
          'aria-pressed': props.active,
          onClick: (e) => {
            e.stopPropagation()
            emit('click', e)
          },
        },
        {
          default: () => [
            slots.default ? slots.default() : null,
            props.active
              ? h(IconButtonParticles, {
                  size: props.particleSize,
                  class: 'aui-star-particle',
                })
              : null,
          ],
        },
      )
  },
})

/**
 * Animate UI Copy Button with smooth icon blur-swap to checkmark.
 */
export const AuiCopyButton = defineComponent({
  name: 'AuiCopyButton',
  props: {
    content: { type: String, required: true },
    delay: { type: Number, default: 2000 },
    title: { type: String, default: '复制' },
    btnClass: { type: [String, Array, Object], default: 'aui-copy-btn' },
  },
  setup(props) {
    return () =>
      h(
        CopyButton,
        {
          type: 'button',
          content: props.content,
          delay: props.delay,
          class: props.btnClass,
          title: props.title,
          'aria-label': props.title,
        },
        {
          default: () =>
            h(CopyButtonIcon, null, {
              icon: () => h('span', { class: 'aui-copy-ico', innerHTML: COPY_SVG }),
              'copied-icon': () => h('span', { class: 'aui-copy-ico copied', innerHTML: CHECK_SVG }),
            }),
        },
      )
  },
})

/**
 * Animate UI Dialog (reka-ui/dialog) drop-in adapter for <a-modal>.
 * Signature 3D tilt entrance (perspective 500px rotateX -20deg -> 0) + spring.dialog + backdrop fade.
 */
export const AuiDialog = defineComponent({
  name: 'AuiDialog',
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, default: '' },
    width: { type: [Number, String], default: 520 },
    okText: { type: String, default: '确定' },
    cancelText: { type: String, default: '取消' },
    confirmLoading: { type: Boolean, default: false },
    okButtonProps: { type: Object, default: () => ({}) },
    footer: { type: [Object, Boolean, String], default: undefined },
    wrapClassName: { type: String, default: '' },
    maskClosable: { type: Boolean, default: true },
  },
  emits: ['update:open', 'ok', 'cancel'],
  setup(props, { emit, slots }) {
    const close = () => {
      emit('cancel')
      emit('update:open', false)
    }
    const onOpenChange = (val) => {
      if (!val) close()
      else emit('update:open', true)
    }
    const preventSelectDismiss = (e) => {
      const orig = e?.detail?.originalEvent?.target || e?.target
      if (!props.maskClosable || isFloatingPortalTarget(orig)) {
        e.preventDefault()
      }
    }
    return () =>
      h(
        DialogRoot,
        {
          open: props.open,
          'onUpdate:open': onOpenChange,
        },
        {
          default: () =>
            h(DialogPortal, null, {
              default: () => [
                h(DialogOverlay, { class: 'aui-dialog-overlay' }),
                h(
                  DialogContent,
                  {
                    class: ['aui-dialog-content', props.wrapClassName],
                    style: { width: normWidth(props.width, '520px') },
                    onPointerDownOutside: preventSelectDismiss,
                    onInteractOutside: preventSelectDismiss,
                  },
                  {
                    default: () => [
                      h('div', { class: 'aui-dialog-header' }, [
                        h(DialogTitle, { class: 'aui-dialog-title' }, { default: () => props.title }),
                        h(
                          DialogClose,
                          {
                            type: 'button',
                            class: 'aui-dialog-close',
                            'aria-label': '关闭',
                          },
                          { default: () => h('span', { innerHTML: CLOSE_SVG }) },
                        ),
                      ]),
                      h('div', { class: 'aui-dialog-body' }, slots.default?.()),
                      props.footer === null
                        ? null
                        : h(
                            'div',
                            { class: 'aui-dialog-footer' },
                            slots.footer
                              ? slots.footer()
                              : [
                                  h(
                                    'button',
                                    {
                                      type: 'button',
                                      class: 'ant-btn ant-btn-default',
                                      onClick: close,
                                    },
                                    [h('span', null, props.cancelText)],
                                  ),
                                  h(
                                    'button',
                                    {
                                      type: 'button',
                                      class: [
                                        'ant-btn ant-btn-primary',
                                        props.confirmLoading ? 'ant-btn-loading' : '',
                                      ],
                                      disabled:
                                        props.confirmLoading || Boolean(props.okButtonProps?.disabled),
                                      onClick: () => emit('ok'),
                                    },
                                    [
                                      props.confirmLoading
                                        ? h('span', { class: 'aui-btn-spinner', 'aria-hidden': 'true' })
                                        : null,
                                      h('span', null, props.okText),
                                    ],
                                  ),
                                ],
                          ),
                    ],
                  },
                ),
              ],
            }),
        },
      )
  },
})

/**
 * Animate UI Drawer (reka-ui/drawer) drop-in adapter for <a-drawer>.
 * Real velocity-driven swipe-to-dismiss + scrubbed backdrop + spring/drawer curve.
 */
export const AuiDrawer = defineComponent({
  name: 'AuiDrawer',
  inheritAttrs: false,
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, default: '' },
    width: { type: [Number, String], default: 420 },
    placement: { type: String, default: 'right' },
    bodyStyle: { type: Object, default: () => ({}) },
  },
  emits: ['update:open', 'close'],
  setup(props, { emit, slots, attrs }) {
    const swipeDir = computed(() => {
      if (props.placement === 'left') return 'left'
      if (props.placement === 'top') return 'up'
      if (props.placement === 'bottom') return 'down'
      return 'right'
    })
    const onOpenChange = (val) => {
      emit('update:open', val)
      if (!val) emit('close')
    }
    const preventSelectDismiss = (e) => {
      const orig = e?.detail?.originalEvent?.target || e?.target
      if (isFloatingPortalTarget(orig)) e.preventDefault()
    }
    return () =>
      h(
        DrawerRoot,
        {
          open: props.open,
          swipeDirection: swipeDir.value,
          'onUpdate:open': onOpenChange,
        },
        {
          default: () =>
            h(DrawerPortal, null, {
              default: () => [
                h(DrawerOverlay, { class: 'aui-drawer-overlay' }),
                h(
                  DrawerContent,
                  {
                    class: ['aui-drawer-content', `aui-drawer-${props.placement}`, attrs.class],
                    style:
                      props.placement === 'left' || props.placement === 'right'
                        ? { width: normWidth(props.width, '420px'), maxWidth: '96vw' }
                        : undefined,
                    onPointerDownOutside: preventSelectDismiss,
                    onInteractOutside: preventSelectDismiss,
                  },
                  {
                    default: () => [
                      h(DrawerHandle, { class: 'aui-drawer-handle', 'aria-hidden': 'true' }),
                      h('div', { class: 'aui-drawer-header' }, [
                        h('div', { class: 'aui-drawer-head-left' }, [
                          h(
                            DrawerClose,
                            {
                              type: 'button',
                              class: 'aui-dialog-close',
                              'aria-label': '关闭',
                            },
                            { default: () => h('span', { innerHTML: CLOSE_SVG }) },
                          ),
                          h(
                            DrawerTitle,
                            { class: 'aui-drawer-title', title: props.title },
                            { default: () => props.title },
                          ),
                        ]),
                        slots.extra ? h('div', { class: 'aui-drawer-extra' }, slots.extra()) : null,
                      ]),
                      h(
                        'div',
                        { class: 'aui-drawer-body', style: props.bodyStyle },
                        slots.default?.(),
                      ),
                    ],
                  },
                ),
              ],
            }),
        },
      )
  },
})

/**
 * Animate UI Switch (reka-ui/switch) drop-in adapter for <a-switch> & .tree-kb.
 * Stretches thumb toward track center while pressed + spring.thumb glide.
 */
export const AuiSwitch = defineComponent({
  name: 'AuiSwitch',
  props: {
    checked: { type: Boolean, default: false },
    size: { type: String, default: 'default' },
    disabled: { type: Boolean, default: false },
    ariaLabel: { type: String, default: '' },
  },
  emits: ['update:checked', 'change'],
  setup(props, { emit }) {
    const onChange = (val) => {
      const next = Boolean(val)
      emit('update:checked', next)
      emit('change', next)
    }
    return () =>
      h(
        SwitchRoot,
        {
          modelValue: Boolean(props.checked),
          disabled: props.disabled,
          'aria-label': props.ariaLabel || undefined,
          class: ['aui-switch', props.size === 'small' ? 'is-sm' : props.size === 'xs' ? 'is-xs' : ''],
          'onUpdate:modelValue': onChange,
        },
        {
          default: () => h(SwitchThumb, { class: 'aui-switch-thumb' }),
        },
      )
  },
})

/**
 * Animate UI DropdownMenu (reka-ui/dropdown-menu) adapter for <a-dropdown>.
 * Includes gliding highlight, staggered entrance rows, trigger origin, and focus return.
 */
export const AuiDropdown = defineComponent({
  name: 'AuiDropdown',
  props: {
    items: { type: Array, default: () => [] },
    align: { type: String, default: 'end' },
    side: { type: String, default: 'bottom' },
    sideOffset: { type: Number, default: 6 },
  },
  emits: ['select'],
  setup(props, { emit, slots }) {
    return () =>
      h(DropdownMenuRoot, null, {
        default: () => [
          h(DropdownMenuTrigger, { asChild: true }, { default: () => slots.default?.() }),
          h(DropdownMenuPortal, null, {
            default: () =>
              h(
                DropdownMenuContent,
                {
                  class: 'aui-dropdown-content',
                  align: props.align,
                  side: props.side,
                  sideOffset: props.sideOffset,
                },
                {
                  default: () =>
                    props.items.map((it, idx) =>
                      it.type === 'divider'
                        ? h(DropdownMenuSeparator, { key: 'sep-' + idx, class: 'aui-dd-sep' })
                        : h(
                            DropdownMenuItem,
                            {
                              key: it.key ?? idx,
                              disabled: Boolean(it.disabled),
                              class: ['aui-dd-item', it.danger ? 'is-danger' : '', it.active ? 'is-active' : ''],
                              onSelect: () => emit('select', { key: it.key, item: it }),
                            },
                            { default: () => it.label },
                          ),
                    ),
                },
              ),
          }),
        ],
      })
  },
})

/**
 * Global Animate UI Status Capsule Manager (reka-ui/toast) drop-in replacement for Ant Design `message.*`.
 * Industry-standard top-center Dynamic Capsule: compact floating pill, status glyph, swipe-up dismiss, zero bottom-right obstruction.
 */
export const auiToastManager = createToastManager()

const CAPSULE_ICONS = {
  success:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-6.5"/></svg>',
  error:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  warning:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 4.2v4.3"/><circle cx="8" cy="11.6" r="0.8" fill="currentColor" stroke="none"/></svg>',
  info:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="4.6" r="0.8" fill="currentColor" stroke="none"/><path d="M8 7.2v4.6"/></svg>',
  loading:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 2.5a5.5 5.5 0 1 1-4.8 2.8"/></svg>',
}

function pushToast(status, content, duration) {
  const text = typeof content === 'string' ? content : content?.content || String(content || '')
  if (!text) return
  const defaultMs = status === 'error' ? 4000 : status === 'warning' ? 3000 : 2300
  const opts = {
    description: text,
    status,
    duration: typeof duration === 'number' ? Math.round(duration * 1000) : defaultMs,
  }
  return auiToastManager.add(opts)
}

export const auiMessage = {
  success: (content, duration) => pushToast('success', content, duration),
  error: (content, duration) => pushToast('error', content, duration),
  warning: (content, duration) => pushToast('warning', content, duration),
  info: (content, duration) => pushToast('info', content, duration),
  loading: (content, duration) => pushToast('loading', content, duration),
  open: (cfg) => pushToast(cfg?.type || 'info', cfg?.content || '', cfg?.duration),
  destroy: () => {
    try {
      auiToastManager.close?.()
    } catch {}
  },
}

const AuiToastList = defineComponent({
  name: 'AuiToastList',
  setup() {
    const { toasts } = useToastManager()
    return () =>
      h(ToastPortal, null, {
        default: () =>
          h(
            ToastViewport,
            { class: 'aui-toast-viewport' },
            {
              default: () =>
                (toasts.value || []).map((t) => {
                  const st = t.status || 'info'
                  return h(
                    ToastRoot,
                    {
                      key: t.id,
                      toast: t,
                      class: ['aui-toast-root', `is-${st}`],
                    },
                    {
                      default: () =>
                        h(
                          ToastContent,
                          { class: 'aui-toast-content' },
                          {
                            default: () => [
                              h('span', {
                                class: ['aui-capsule-ico', `is-${st}`],
                                'aria-hidden': 'true',
                                innerHTML: CAPSULE_ICONS[st] || CAPSULE_ICONS.info,
                              }),
                              h(
                                ToastDescription,
                                { class: 'aui-toast-desc' },
                                { default: () => t.description || t.title || '' },
                              ),
                              st === 'error'
                                ? h(
                                    ToastClose,
                                    {
                                      type: 'button',
                                      class: 'aui-toast-close',
                                      'aria-label': '关闭提示',
                                    },
                                    { default: () => h('span', { innerHTML: CLOSE_SVG }) },
                                  )
                                : null,
                            ],
                          },
                        ),
                    },
                  )
                }),
            },
          ),
      })
  },
})

export const AuiToaster = defineComponent({
  name: 'AuiToaster',
  setup() {
    return () =>
      h(
        ToastProvider,
        {
          toastManager: auiToastManager,
          duration: 2300,
          limit: 2,
          swipeDirection: ['up'],
          progressBar: false,
        },
        {
          default: () => h(AuiToastList),
        },
      )
  },
})

/**
 * Installs all Animate UI native & adapter components globally on the Vue app.
 */
export function registerAuiComponents(app) {
  app.component('aui-tooltip-provider', TooltipProvider)
  app.component('aui-tooltip', AuiTooltip)
  app.component('aui-highlight', Highlight)
  app.component('aui-highlight-item', HighlightItem)
  app.component('aui-tabs', Tabs)
  app.component('aui-tabs-list', TabsList)
  app.component('aui-tabs-highlight', TabsHighlight)
  app.component('aui-tabs-highlight-item', TabsHighlightItem)
  app.component('aui-tabs-trigger', TabsTrigger)
  app.component('aui-tabs-contents', TabsContents)
  app.component('aui-tabs-content', TabsContent)
  app.component('aui-motion-loader', AuiMotionLoader)
  app.component('aui-star-button', AuiStarButton)
  app.component('aui-copy-button', AuiCopyButton)
  app.component('aui-pinned-list', PinnedList)
  app.component('aui-pinned-group', PinnedListPinned)
  app.component('aui-unpinned-group', PinnedListUnpinned)
  app.component('aui-pinned-label', PinnedListLabel)
  app.component('aui-pinned-items', PinnedListItems)
  app.component('aui-pinned-item', PinnedListItem)
  app.component('aui-pinned-trigger', PinnedListTrigger)
  app.component('aui-scroll-fade', ScrollFade)
  app.component('aui-scroll-progress-provider', ScrollProgressProvider)
  app.component('aui-scroll-progress', ScrollProgress)
  app.component('aui-scroll-progress-container', ScrollProgressContainer)
  app.component('aui-theme-toggler', ThemeToggler)
  app.component('aui-shimmering-text', ShimmeringText)
  app.component('aui-morphing-text', MorphingText)
  app.component('aui-counting-number', CountingNumber)
  app.component('aui-dialog', AuiDialog)
  app.component('aui-drawer', AuiDrawer)
  app.component('aui-switch', AuiSwitch)
  app.component('aui-accordion', AccordionRoot)
  app.component('aui-accordion-item', AccordionItem)
  app.component('aui-accordion-header', AccordionHeader)
  app.component('aui-accordion-trigger', AccordionTrigger)
  app.component('aui-accordion-content', AccordionContent)
  app.component('aui-dropdown', AuiDropdown)
  app.component('aui-popover-root', PopoverRoot)
  app.component('aui-popover-trigger', PopoverTrigger)
  app.component('aui-popover-anchor', PopoverAnchor)
  app.component('aui-popover-portal', PopoverPortal)
  app.component('aui-popover-content', PopoverContent)
  app.component('aui-toaster', AuiToaster)
}
