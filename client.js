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
 * <nav> inside its viewport marker ([data-sidebar-scrollport]); the shell owns
 * that row group, so the rules below are a contract with it. The same plugin
 * ships a self-test section for its Plugins detail page: four read-only checks,
 * run only when the button is pressed, each with a 2s ceiling.
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
    /** Marker the sidebar shell puts on its scroll viewport while expanded. */
    const SCROLLPORT_ATTR = 'data-sidebar-scrollport'
    /** Stylesheet marker, so the self-test can find the sheet this bundle injected. */
    const STYLE_MARKER = 'dsh-sidebar-pin/sidebar-pin.css'
    /** Per-check ceiling: a slow or hung check fails instead of freezing the section. */
    const SELFTEST_TIMEOUT_MS = 2000

    const EN = {
      'action.label': 'Pin panel rows',
      'action.pinned': 'Panel rows pinned',
      'action.unpinned': 'Panel rows scroll',
      'action.tip.pinned': 'Panel rows stay at the top — click to let them scroll',
      'action.tip.unpinned': 'Panel rows scroll with the list — click to pin them to the top',
      'selftest.title': 'Self-test',
      'selftest.run': 'Run self-test',
      'selftest.rerun': 'Run again',
      'selftest.copy': 'Copy result',
      'selftest.copied': 'Copied',
      'selftest.summary': '{pass} passed · {fail} failed',
      'selftest.idle': 'Not run',
      'selftest.running': 'Running',
      'selftest.pass': 'Pass',
      'selftest.fail': 'Fail',
      'selftest.failSep': ': ',
      'selftest.item.style': 'Stylesheet injected',
      'selftest.item.pref': 'Preference readable',
      'selftest.item.pinned': 'Pin state',
      'selftest.item.host': 'Host contract',
      'selftest.detail.styleMissing': 'No <style data-plugin-css="dsh-sidebar-pin/sidebar-pin.css"> in the document',
      'selftest.detail.styleNoRule': 'The stylesheet has no [data-sidebar-scrollport] rule',
      'selftest.detail.styleOk': 'Stylesheet injected ({n} chars)',
      'selftest.detail.prefUnset': 'Not set; the default (pinned) applies',
      'selftest.detail.prefValue': 'Stored value: {v}',
      'selftest.detail.prefInvalid': 'Unrecognized value: {v}',
      'selftest.detail.prefError': 'localStorage read failed: {e}',
      'selftest.detail.pinnedOn': 'Pinned (the html root attribute is present)',
      'selftest.detail.pinnedOff': 'Not pinned',
      'selftest.detail.pinnedMismatch': 'Root attribute and preference disagree: attribute {a}, preference {b} (1 = pinned)',
      'selftest.detail.hostMissing': 'No [data-sidebar-scrollport] > nav; the host structure may have changed (or the sidebar is collapsed)',
      'selftest.detail.hostNotSticky': 'The panel rows are not sticky; the pinned styles did not apply',
      'selftest.detail.hostOk': 'Panel rows: {n}, pinned',
      'selftest.detail.timeout': 'Timed out after {ms}ms',
      'selftest.detail.error': 'Check threw: {e}',
    }
    const ZH = {
      'action.label': '固定面板行',
      'action.pinned': '面板已固定顶部',
      'action.unpinned': '面板随列表滚动',
      'action.tip.pinned': '插件 / Token 用量 / 待办等面板入口固定在顶部，点击后恢复随列表滚动',
      'action.tip.unpinned': '面板入口现在随列表滚动，点击固定到侧栏顶部',
      'selftest.title': '自检',
      'selftest.run': '运行自检',
      'selftest.rerun': '重新运行',
      'selftest.copy': '复制结果',
      'selftest.copied': '已复制',
      'selftest.summary': '{pass} 通过 · {fail} 失败',
      'selftest.idle': '未运行',
      'selftest.running': '运行中',
      'selftest.pass': '通过',
      'selftest.fail': '失败',
      'selftest.failSep': '：',
      'selftest.item.style': '样式已注入',
      'selftest.item.pref': '偏好可读',
      'selftest.item.pinned': '固定状态',
      'selftest.item.host': '宿主契约',
      'selftest.detail.styleMissing': '文档里找不到 <style data-plugin-css="dsh-sidebar-pin/sidebar-pin.css">',
      'selftest.detail.styleNoRule': '样式表里没有 [data-sidebar-scrollport] 规则',
      'selftest.detail.styleOk': '样式已注入（{n} 字符）',
      'selftest.detail.prefUnset': '未设置，使用默认（已固定）',
      'selftest.detail.prefValue': '已存值：{v}',
      'selftest.detail.prefInvalid': '不可识别的值：{v}',
      'selftest.detail.prefError': '读取 localStorage 失败：{e}',
      'selftest.detail.pinnedOn': '当前已固定（html 根属性存在）',
      'selftest.detail.pinnedOff': '当前未固定',
      'selftest.detail.pinnedMismatch': '根属性与偏好不一致：属性 {a}，偏好 {b}（1 = 已固定）',
      'selftest.detail.hostMissing': '找不到 [data-sidebar-scrollport] > nav，宿主结构可能已变（或侧栏处于收起状态）',
      'selftest.detail.hostNotSticky': '面板行不是 sticky，固定样式没有生效',
      'selftest.detail.hostOk': '面板行 {n} 行，固定生效',
      'selftest.detail.timeout': '超时（{ms}ms）',
      'selftest.detail.error': '检查抛错：{e}',
    }
    /** Dictionaries registered with the Client locale service. */
    const LOCALES = { zh: ZH, en: EN, ja: EN, es: EN, fr: EN, de: EN, ru: EN, pt: EN }

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
      '',
      '/* Plugin-detail self-test section. */',
      '.dsh-sidebar-pin-selftest {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 10px;',
      '  margin-top: 16px;',
      '  padding: 12px 14px;',
      '  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);',
      '  border-radius: 12px;',
      '}',
      '.dsh-sidebar-pin-selftest__head {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  flex-wrap: wrap;',
      '}',
      '.dsh-sidebar-pin-selftest__title { font-weight: 600; }',
      '.dsh-sidebar-pin-selftest__summary {',
      '  margin-right: auto;',
      '  font-size: 12px;',
      '  color: color-mix(in srgb, currentColor 62%, transparent);',
      '}',
      '.dsh-sidebar-pin-selftest__button {',
      '  font: inherit;',
      '  font-size: 12px;',
      '  line-height: 18px;',
      '  padding: 3px 10px;',
      '  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);',
      '  border-radius: 6px;',
      '  background: transparent;',
      '  color: inherit;',
      '  cursor: pointer;',
      '}',
      '.dsh-sidebar-pin-selftest__button.is-primary {',
      '  background: color-mix(in srgb, currentColor 10%, transparent);',
      '  border-color: transparent;',
      '}',
      '.dsh-sidebar-pin-selftest__button:disabled { opacity: 0.5; cursor: default; }',
      '.dsh-sidebar-pin-selftest__rows { display: flex; flex-direction: column; gap: 6px; }',
      '.dsh-sidebar-pin-selftest__row {',
      '  display: grid;',
      '  grid-template-columns: minmax(0, 1fr) auto;',
      '  gap: 2px 12px;',
      '  align-items: center;',
      '  font-size: 13px;',
      '}',
      '.dsh-sidebar-pin-selftest__badge {',
      '  font-size: 12px;',
      '  padding: 1px 8px;',
      '  border-radius: 999px;',
      '  border: 1px solid transparent;',
      '  white-space: nowrap;',
      '}',
      '.dsh-sidebar-pin-selftest__badge.is-pass { color: #22a06b; background: rgba(34, 160, 107, 0.14); }',
      '.dsh-sidebar-pin-selftest__badge.is-fail { color: #d84a4a; background: rgba(216, 74, 74, 0.14); }',
      '.dsh-sidebar-pin-selftest__badge.is-idle { color: color-mix(in srgb, currentColor 60%, transparent); }',
      '.dsh-sidebar-pin-selftest__detail {',
      '  grid-column: 1 / -1;',
      '  font-size: 12px;',
      '  color: color-mix(in srgb, currentColor 56%, transparent);',
      '}',
    ].join('\n')

    /** Language fallback used before the locale service resolves a dictionary. */
    function fallbackDict() {
      const lang = String(document.documentElement.getAttribute('lang') || navigator.language || 'en').toLowerCase()
      return lang.startsWith('zh') ? ZH : EN
    }

    /** Fill {name} placeholders the way the locale service does. */
    function interpolate(template, vars) {
      if (vars === undefined) return template
      return String(template).replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole))
    }

    /** Human-readable message for anything thrown by a check. */
    function messageOf(error) {
      if (error === null || error === undefined) return 'unknown error'
      return String(error.message ?? error)
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

    /* ------------------------------------------------------------------ *
     * Self-test: four read-only checks, run only when the button is pressed
     * ------------------------------------------------------------------ */

    /** 1. The bundle's stylesheet is in the document and still targets the viewport. */
    function checkStyle() {
      const style = document.querySelector('style[data-plugin-css="' + STYLE_MARKER + '"]')
      if (style === null) return { ok: false, key: 'selftest.detail.styleMissing' }
      const css = String(style.textContent ?? '')
      if (!css.includes('[' + SCROLLPORT_ATTR + ']')) return { ok: false, key: 'selftest.detail.styleNoRule' }
      return { ok: true, key: 'selftest.detail.styleOk', vars: { n: css.length } }
    }

    /** 2. The stored preference is readable and holds a value this bundle understands. */
    function checkPref() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return { ok: true, key: 'selftest.detail.prefUnset' }
        if (raw !== '0' && raw !== '1') return { ok: false, key: 'selftest.detail.prefInvalid', vars: { v: raw } }
        return { ok: true, key: 'selftest.detail.prefValue', vars: { v: raw } }
      } catch (error) {
        return { ok: false, key: 'selftest.detail.prefError', vars: { e: messageOf(error) } }
      }
    }

    /** 3. The root attribute agrees with the stored preference. */
    function checkPinned() {
      const applied = document.documentElement.hasAttribute(ROOT_ATTR)
      let expected
      try {
        expected = window.localStorage.getItem(STORAGE_KEY) !== '0'
      } catch {
        expected = true
      }
      if (applied !== expected) {
        return { ok: false, key: 'selftest.detail.pinnedMismatch', vars: { a: applied ? '1' : '0', b: expected ? '1' : '0' } }
      }
      return { ok: true, key: applied ? 'selftest.detail.pinnedOn' : 'selftest.detail.pinnedOff' }
    }

    /** 4. The host still renders the panel rows as the viewport's direct <nav>. */
    function checkHost() {
      const nav = document.querySelector('[' + SCROLLPORT_ATTR + '] > nav')
      if (nav === null) return { ok: false, key: 'selftest.detail.hostMissing' }
      try {
        const position = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(nav).position : undefined
        if (position !== undefined && position !== 'sticky') return { ok: false, key: 'selftest.detail.hostNotSticky' }
      } catch {
        /* a document without computed styles still proves the structure */
      }
      return { ok: true, key: 'selftest.detail.hostOk', vars: { n: nav.children.length } }
    }

    /** Checks in display order; label keys resolve through the locale service. */
    const SELFTEST_CHECKS = [
      { id: 'style', labelKey: 'selftest.item.style', run: checkStyle },
      { id: 'pref', labelKey: 'selftest.item.pref', run: checkPref },
      { id: 'pinned', labelKey: 'selftest.item.pinned', run: checkPinned },
      { id: 'host', labelKey: 'selftest.item.host', run: checkHost },
    ]

    /** Resolve a check, turning a hang into a failure at the timeout. */
    function withTimeout(produce, timeoutMs) {
      return new Promise((resolve) => {
        let settled = false
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          resolve({ ok: false, key: 'selftest.detail.timeout', vars: { ms: timeoutMs } })
        }, timeoutMs)
        const finish = (result) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (result !== null && typeof result === 'object' && result.ok === true) {
            resolve({ ok: true, key: result.key, vars: result.vars })
          } else {
            resolve({ ok: false, key: result?.key ?? 'selftest.detail.error', vars: result?.vars })
          }
        }
        Promise.resolve().then(produce).then(finish, (error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve({ ok: false, key: 'selftest.detail.error', vars: { e: messageOf(error) } })
        })
      })
    }

    /**
     * Run the checks in parallel, each bounded by timeoutMs.
     * @returns one row per check: { id, labelKey, ok, key, vars }.
     */
    async function runChecks({ checks = SELFTEST_CHECKS, timeoutMs = SELFTEST_TIMEOUT_MS } = {}) {
      return Promise.all(checks.map(async (check) => {
        const result = await withTimeout(() => check.run(), timeoutMs)
        return { id: check.id, labelKey: check.labelKey, ok: result.ok, key: result.key, vars: result.vars }
      }))
    }

    /** Markdown for the copy button: "- [x] label — pass" / "- [ ] label — fail: detail". */
    function toMarkdown(rows, t) {
      return rows.map((row) => (row.ok
        ? '- [x] ' + row.label + ' — ' + t('selftest.pass')
        : '- [ ] ' + row.label + ' — ' + t('selftest.fail') + t('selftest.failSep') + row.detail)).join('\n')
    }

    /** Plugin-detail section: renders only on this plugin's own detail page. */
    function SelfTestSection({ subject, t }) {
      const [state, setState] = useState({ running: false, rows: null, copied: false })
      const pluginName = subject?.kind === 'bundle' ? subject.pkg?.name : undefined
      const dict = fallbackDict()
      const tr = (key, vars) => {
        const resolved = typeof t === 'function' ? t(key, vars) : undefined
        const text = typeof resolved === 'string' && resolved !== key ? resolved : (dict[key] ?? EN[key] ?? key)
        return interpolate(text, vars)
      }
      if (pluginName !== 'dsh-sidebar-pin') return null

      const idleRows = SELFTEST_CHECKS.map((check) => ({ id: check.id, label: tr(check.labelKey), ok: null, detail: '' }))
      const rows = state.rows ?? idleRows
      const pass = rows.filter((row) => row.ok === true).length
      const fail = rows.filter((row) => row.ok === false).length
      const summary = state.running
        ? tr('selftest.running')
        : state.rows === null
          ? tr('selftest.idle')
          : tr('selftest.summary', { pass: String(pass), fail: String(fail) })

      async function run() {
        setState({ running: true, rows: null, copied: false })
        const results = await runChecks()
        setState({
          running: false,
          copied: false,
          rows: results.map((result) => ({
            id: result.id,
            label: tr(result.labelKey),
            ok: result.ok,
            detail: result.ok ? '' : tr(result.key, result.vars),
          })),
        })
      }

      async function copy() {
        if (state.rows === null || state.running) return
        const markdown = toMarkdown(state.rows, tr)
        try {
          await navigator.clipboard.writeText(markdown)
          setState({ ...state, copied: true })
        } catch {
          /* clipboard denied; the result stays on screen */
        }
      }

      return h('section', { className: 'dsh-sidebar-pin-selftest' },
        h('div', { className: 'dsh-sidebar-pin-selftest__head' },
          h('span', { className: 'dsh-sidebar-pin-selftest__title' }, tr('selftest.title')),
          h('span', { className: 'dsh-sidebar-pin-selftest__summary' }, summary),
          h('button', {
            type: 'button',
            className: 'dsh-sidebar-pin-selftest__button is-primary',
            disabled: state.running,
            onClick: () => void run(),
          }, state.running ? tr('selftest.running') : (state.rows === null ? tr('selftest.run') : tr('selftest.rerun'))),
          h('button', {
            type: 'button',
            className: 'dsh-sidebar-pin-selftest__button',
            disabled: state.rows === null || state.running,
            onClick: () => void copy(),
          }, state.copied ? tr('selftest.copied') : tr('selftest.copy')),
        ),
        h('div', { className: 'dsh-sidebar-pin-selftest__rows' }, rows.map((row) => h('div', { key: row.id, className: 'dsh-sidebar-pin-selftest__row' },
          h('span', { className: 'dsh-sidebar-pin-selftest__label' }, row.label),
          h('span', {
            className: 'dsh-sidebar-pin-selftest__badge' + (row.ok === null ? ' is-idle' : row.ok ? ' is-pass' : ' is-fail'),
          }, row.ok === null ? tr('selftest.idle') : row.ok ? tr('selftest.pass') : tr('selftest.fail')),
          row.detail === '' ? null : h('div', { className: 'dsh-sidebar-pin-selftest__detail' }, row.detail),
        ))),
      )
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
          style.setAttribute('data-plugin-css', STYLE_MARKER)
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'sidebar-pin: styles')

        ctx.effect(() => ctx.locale.register(NS, LOCALES), 'sidebar-pin: dictionaries')

        ctx.effect(() => {
          applyPref(readPref())
          return () => { document.documentElement.removeAttribute(ROOT_ATTR) }
        }, 'sidebar-pin: preference')

        // Read-only test surface: the self-test and the suite share one implementation,
        // and the suite gets a handle without rendering React.
        ctx.effect(() => {
          window.__dshSidebarPinSelftest = {
            version: 1,
            timeoutMs: SELFTEST_TIMEOUT_MS,
            checks: SELFTEST_CHECKS.map((check) => check.id),
            runChecks,
            toMarkdown,
          }
          return () => { delete window.__dshSidebarPinSelftest }
        }, 'sidebar-pin: self-test surface')

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'sidebar-pin',
          order: 20,
          locale: NS,
        }, PinToggle))

        ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({
          name: 'plugins.detail.section',
          id: 'dsh-sidebar-pin.selftest',
          order: 90,
          locale: NS,
        }, SelfTestSection))
      },
    }
  },
})
