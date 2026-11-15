/**
 * dsh-sidebar-pin — browser half.
 *
 * Keeps the sidebar's global panel rows (Plugins, Token usage, Todos, …) at the
 * top of the sidebar viewport while the workspace/session list scrolls beneath
 * them, and adds a pin toggle above Settings that switches the behaviour on and
 * off. The preference lives in localStorage and is applied as one attribute on
 * <html>, so toggling re-renders nothing and survives reloads.
 *
 * The pinned element is the navigation the sidebar shell renders as the only
 * <nav> inside its viewport marker ([data-sidebar-scrollport]); the shell's own
 * slot contract keeps that row group stable for integrations.
 */
window.__ModuleLoader__.load({
  id: 'dsh-sidebar-pin',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useState } = React

    const NS = 'sidebar-pin'
    /** localStorage key holding the on/off preference ("1" on, "0" off). */
    const STORAGE_KEY = 'dsh-sidebar-pin:enabled'
    /** Root marker the stylesheet keys on; absent means "not pinned". */
    const ROOT_ATTR = 'data-dsh-sidebar-pin'

    const EN = {
      'action.label': 'Pin panel rows',
      'action.pinned': 'Panel rows pinned',
      'action.unpinned': 'Panel rows scroll',
      'action.tip.pinned': 'Panel rows stay at the top — click to let them scroll',
      'action.tip.unpinned': 'Panel rows scroll with the list — click to pin them to the top',
    }
    const ZH = {
      'action.label': '固定面板行',
      'action.pinned': '面板已固定顶部',
      'action.unpinned': '面板随列表滚动',
      'action.tip.pinned': '插件 / Token 用量 / 待办等面板入口固定在顶部，点击后恢复随列表滚动',
      'action.tip.unpinned': '面板入口现在随列表滚动，点击固定到侧栏顶部',
    }
    /** Dictionaries registered with the Client locale service. */
    const LOCALES = { en: EN, zh: ZH }

    const CSS = [
      '/* Panel rows pinned above a list that owns its own scrolling. */',
      'html[data-dsh-sidebar-pin] [data-sidebar-scrollport] {',
      '  /* The last row takes exactly the height the panel rows leave, so the',
      '     viewport has nothing left to scroll and the wheel only moves the list. */',
      '  grid-template-rows: 8px max-content 2px 1fr;',
      '  overflow-y: hidden;',
      '}',
      'html[data-dsh-sidebar-pin] [data-sidebar-scrollport] > nav {',
      '  position: sticky;',
      '  top: 0;',
      '  z-index: 20;',
      '  /* The nav keeps its 8px gap, painted instead of laid out, so the list',
      '     cannot peek through it under the pinned rows. */',
      '  margin-bottom: 0;',
      '  padding-bottom: 8px;',
      '  background: var(--dsw-specific-sidebar-fill);',
      '  /* A hairline is the only edge: it reads as a header under the rows. */',
      '  box-shadow: inset 0 -1px 0 0 color-mix(in srgb, currentColor 12%, transparent);',
      '}',
      'html[data-dsh-sidebar-pin] [data-sidebar-scrollport] > div {',
      '  grid-column: 2;',
      '  grid-row: 4;',
      '  min-height: 0;',
      '  /* The workspace section sizes its own scroller against this box (100cqh)',
      '     and falls back to the full column, so the box becomes the container. */',
      '  container-type: size;',
      '}',
      '',
      '/* macOS paints the sidebar tint on the layout column; the pinned rows keep',
      '   that vibrancy instead of covering it with a solid fill. */',
      "html[data-platform='darwin'][data-dsh-sidebar-pin] [data-sidebar-scrollport] > nav {",
      '  background: transparent;',
      '  -webkit-backdrop-filter: blur(14px) saturate(1.3);',
      '  backdrop-filter: blur(14px) saturate(1.3);',
      '}',
      '',
      '/* Pin toggle in the sidebar foot, aligned with the Settings row. */',
      '.dsh-sidebar-pin-toggle {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: var(--dsh-sidebar-label-gap, 6px);',
      '  width: 100%;',
      '  min-height: 32px;',
      '  box-sizing: border-box;',
      '  margin: 0;',
      '  padding: 5px calc(var(--dsh-sidebar-row-padding, 12px) - var(--dsh-sidebar-paint-inset, 3px));',
      '  border: none;',
      '  border-inline: var(--dsh-sidebar-paint-inset, 3px) solid transparent;',
      '  border-radius: var(--dsw-radius-md, 8px);',
      '  background: transparent;',
      '  background-clip: padding-box;',
      '  color: inherit;',
      '  font: inherit;',
      '  font-size: 14px;',
      '  line-height: 20px;',
      '  text-align: start;',
      '  cursor: pointer;',
      '}',
      '.dsh-sidebar-pin-toggle:hover {',
      '  background-color: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));',
      '}',
      '.dsh-sidebar-pin-toggle:focus-visible {',
      '  outline: 2px solid currentColor;',
      '  outline-offset: 1px;',
      '}',
      ".dsh-sidebar-pin-toggle[data-active='false'] {",
      '  opacity: 0.72;',
      '}',
      '.dsh-sidebar-pin-toggle--rail {',
      '  justify-content: center;',
      '  width: 36px;',
      '  height: 36px;',
      '  min-height: 36px;',
      '  padding: 0;',
      '  margin-inline: auto;',
      '  border-inline: 0;',
      '}',
      '.dsh-sidebar-pin-label {',
      '  flex: 1;',
      '  min-width: 0;',
      '  overflow: hidden;',
      '  white-space: nowrap;',
      '  text-overflow: ellipsis;',
      '}',
    ].join('\n')

    /** Language fallback used before the locale service resolves a dictionary. */
    function fallbackDict() {
      const lang = String(document.documentElement.getAttribute('lang') || navigator.language || 'en').toLowerCase()
      return lang.startsWith('zh') ? ZH : EN
    }

    /** Read the stored preference; a missing or unreadable value means pinned. */
    function readPref() {
      try {
        return window.localStorage.getItem(STORAGE_KEY) !== '0'
      } catch {
        return true
      }
    }

    /** Persist the preference; storage failures leave the session usable. */
    function writePref(on) {
      try {
        window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
      } catch {
        /* private mode or a full quota: keep the in-memory state */
      }
    }

    /** Apply the preference to the document root; CSS does the rest. */
    function applyPref(on) {
      if (on) document.documentElement.setAttribute(ROOT_ATTR, '')
      else document.documentElement.removeAttribute(ROOT_ATTR)
    }

    /** Pushpin glyph; filled while the rows are pinned. */
    function PinGlyph({ size = 16, filled = false }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        style: { display: 'block', flex: 'none' },
      }, h('path', {
        d: 'M6.1 1.6h3.8v1.1h-.8l.3 3.3 2.6 2.1v1.1H8.5v4.6h-1v-4.6H4v-1.1l2.6-2.1.3-3.3h-.8V1.6z',
        fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor',
        strokeWidth: filled ? 0 : 1.2,
        strokeLinejoin: 'round',
      }))
    }

    /** Footer action: one pin/unpin toggle for every window. */
    function PinToggle({ wide, t }) {
      const [pinned, setPinned] = useState(readPref)
      const dict = fallbackDict()
      const tr = (key) => {
        const resolved = typeof t === 'function' ? t(key) : undefined
        if (typeof resolved === 'string' && resolved !== key) return resolved
        return dict[key] || EN[key] || key
      }
      useEffect(() => {
        applyPref(pinned)
      }, [pinned])
      useEffect(() => {
        const onStorage = (event) => {
          if (event.key === STORAGE_KEY) setPinned(event.newValue !== '0')
        }
        window.addEventListener('storage', onStorage)
        return () => { window.removeEventListener('storage', onStorage) }
      }, [])
      const toggle = useCallback(() => {
        setPinned((previous) => {
          const next = !previous
          writePref(next)
          applyPref(next)
          return next
        })
      }, [])
      const tip = tr(pinned ? 'action.tip.pinned' : 'action.tip.unpinned')
      return h('button', {
        type: 'button',
        className: 'dsh-sidebar-pin-toggle' + (wide ? '' : ' dsh-sidebar-pin-toggle--rail'),
        'data-active': pinned ? 'true' : 'false',
        'aria-pressed': pinned,
        'aria-label': tip,
        title: tip,
        onClick: toggle,
      },
      h(PinGlyph, { size: wide ? 16 : 18, filled: pinned }),
      wide ? h('span', { className: 'dsh-sidebar-pin-label' }, tr(pinned ? 'action.pinned' : 'action.unpinned')) : null)
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-plugin-css', 'dsh-sidebar-pin/sidebar-pin.css')
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'sidebar-pin: styles')

        ctx.effect(() => ctx.locale.register(NS, LOCALES), 'sidebar-pin: dictionaries')

        ctx.effect(() => {
          applyPref(readPref())
          return () => { document.documentElement.removeAttribute(ROOT_ATTR) }
        }, 'sidebar-pin: preference')

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'sidebar-pin',
          order: 20,
          locale: NS,
        }, PinToggle))
      },
    }
  },
})
