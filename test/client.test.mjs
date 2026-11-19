import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

/** Host contract this bundle renders against; keep in sync with the sidebar shell. */
const HOST = {
  scrollportAttr: 'data-sidebar-scrollport',
  navSelector: '> nav',
  regionSelector: '> div',
  baseRows: '8px max-content 2px max-content',
  pinnedRows: '8px max-content 2px 1fr',
}

function createDocument(options = {}) {
  const head = {
    children: [],
    appendChild(node) { this.children.push(node); return node },
    removeChild(node) { this.children = this.children.filter((child) => child !== node) },
  }
  const documentElement = {
    attrs: {},
    style: { setProperty() {}, removeProperty() {} },
    setAttribute(name, value) { this.attrs[name] = String(value) },
    getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null },
    removeAttribute(name) { delete this.attrs[name] },
    hasAttribute(name) { return Object.hasOwn(this.attrs, name) },
  }
  const nav = options.nav === false ? null : { children: [{}, {}, {}], parentElement: {} }
  return {
    head,
    documentElement,
    nav,
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        attrs: {},
        textContent: '',
        setAttribute(name, value) { this.attrs[name] = String(value) },
        getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null },
        remove() { head.removeChild(this) },
      }
    },
    querySelector(selector) {
      if (selector.includes('data-plugin-css')) return head.children.find((node) => node.tagName === 'STYLE') ?? null
      if (selector.includes('> nav')) return nav
      return null
    },
  }
}

/** React stand-in: the factory only builds elements lazily, nothing renders here. */
const fakeReact = {
  createElement: () => null,
  useCallback: (fn) => fn,
  useEffect: () => {},
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
}

/** Evaluate client.js the way the browser module table does, then return its module. */
function loadClient(options = {}) {
  const loaded = []
  const document = createDocument(options)
  const store = new Map()
  if (options.stored !== undefined) store.set('dsh-sidebar-pin:enabled', options.stored)
  const window = {
    __ModuleLoader__: { load: (module) => { loaded.push(module) } },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    },
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ position: options.position ?? 'sticky' }),
  }
  const context = vm.createContext({ window, document, navigator: { language: 'zh-CN' }, console, setTimeout, clearTimeout })
  vm.runInContext(source, context, { filename: 'client.js' })
  assert.equal(loaded.length, 1, 'client.js must register exactly one module')
  const module = loaded[0]
  const plugin = module.factory((specifier) => {
    assert.equal(specifier, 'react', 'only React is required by this bundle')
    return fakeReact
  })
  return { module, plugin, document, store, window }
}

function createContext() {
  const effects = []
  const registrations = []
  const injected = []
  const dictionaries = []
  const ctx = {
    effect(register, label) {
      const dispose = register()
      effects.push({ label, dispose: typeof dispose === 'function' ? dispose : undefined })
      return dispose
    },
    locale: {
      register(namespace, dicts) {
        dictionaries.push({ namespace, dicts })
        return () => { dictionaries.pop() }
      },
    },
    slots: {
      inject(name, register) { injected.push(name); return register() },
      register(options, component) { registrations.push({ options, component }); return () => {} },
    },
  }
  return { ctx, effects, registrations, injected, dictionaries }
}

test('registers no agent tool and asks only for the slots and locale services', () => {
  const { module, plugin } = loadClient()
  assert.equal(module.id, 'dsh-sidebar-pin')
  assert.deepEqual([...plugin.inject], ['slots', 'locale'], 'only the slots and locale services are injected')
  assert.equal(typeof plugin.apply, 'function')
  assert.equal(plugin.tools, undefined, 'a Client-only bundle must not declare tools')
})

test('injects a stylesheet whose selectors still match the host contract', () => {
  const { plugin, document } = loadClient()
  const { ctx } = createContext()
  plugin.apply(ctx)

  const style = document.head.children.find((node) => node.attrs['data-plugin-css'] === 'dsh-sidebar-pin/sidebar-pin.css')
  assert.ok(style, 'the bundle must append its stylesheet to <head>')
  const css = style.textContent
  assert.ok(css.includes('[' + HOST.scrollportAttr + ']'), 'CSS must key on the sidebar scroll viewport marker')
  assert.ok(css.includes(HOST.navSelector + ' {'), "the pinned rows must still be the viewport's direct <nav>")
  assert.ok(css.includes(HOST.regionSelector + ' {'), "the list region must still be the viewport's direct <div>")
  assert.ok(css.includes('grid-template-rows: ' + HOST.pinnedRows), 'pinned grid template must be the frozen-viewport one')
  assert.ok(css.includes('grid-column: 2') && css.includes('grid-row: 4'), 'the region must keep the host grid placement')
  assert.ok(css.includes('container-type: size'), 'the region must become the size container for the list scroller')
  assert.ok(css.includes('position: sticky'), 'the rows stay sticky as a belt-and-braces guard')
  assert.ok(css.includes('overflow-y: hidden'), 'the viewport must not keep a scroll range of its own')
  assert.ok(css.includes('--dsw-specific-sidebar-fill'), 'the pinned block must paint the sidebar fill')
  assert.ok(css.includes('.dsh-sidebar-pin-toggle'), 'the toggle styles must ship with the same bundle')
  assert.ok(css.includes('.dsh-sidebar-pin-selftest'), 'the self-test styles must ship with the same bundle')
  assert.equal((css.match(/{/g) ?? []).length, (css.match(/}/g) ?? []).length, 'the stylesheet must be balanced')
})

test('the root flag in CSS is the same attribute the runtime sets on <html>', () => {
  const { plugin, document } = loadClient()
  const { ctx } = createContext()
  plugin.apply(ctx)

  const css = document.head.children[0].textContent
  const selectorFlag = /html\[([a-z0-9-]+)\]/.exec(css)?.[1]
  assert.equal(selectorFlag, 'data-dsh-sidebar-pin', 'CSS must scope on html[data-dsh-sidebar-pin]')
  assert.ok(document.documentElement.hasAttribute('data-dsh-sidebar-pin'), 'pinning is on by default')
})

test('registers the footer toggle and one plugin-detail section', () => {
  const { plugin } = loadClient()
  const { ctx, registrations, injected } = createContext()
  plugin.apply(ctx)

  assert.deepEqual([...injected].sort(), ['plugins.detail.section', 'sidebar.footer.action'])
  assert.equal(registrations.length, 2)

  const footer = registrations.find((entry) => entry.options.name === 'sidebar.footer.action')
  assert.ok(footer, 'the pin toggle must stay registered')
  assert.equal(footer.options.id, 'sidebar-pin')
  assert.equal(footer.options.order, 20)

  const section = registrations.find((entry) => entry.options.name === 'plugins.detail.section')
  assert.ok(section, 'the detail page must get a self-test section')
  assert.equal(section.options.id, 'dsh-sidebar-pin.selftest')
  assert.equal(section.options.order, 90)
  assert.equal(section.options.locale, 'sidebar-pin')
  assert.equal(typeof section.component, 'function', 'the slot needs a component, not a plain node')
})

test('registers matched dictionaries (zh/en) for the toggle and the self-test', () => {
  const { plugin } = loadClient()
  const { ctx, dictionaries } = createContext()
  plugin.apply(ctx)

  assert.equal(dictionaries.length, 1)
  const { namespace, dicts } = dictionaries[0]
  assert.equal(namespace, 'sidebar-pin')
  assert.deepEqual(Object.keys(dicts).sort(), ['de', 'en', 'es', 'fr', 'ja', 'pt', 'ru', 'zh'])
  assert.deepEqual(Object.keys(dicts.en).sort(), Object.keys(dicts.zh).sort(), 'both locales must cover the same keys')
  assert.equal(dicts.ja, dicts.en, 'other locales fall back to English')
  for (const key of ['action.label', 'action.pinned', 'action.unpinned', 'action.tip.pinned', 'action.tip.unpinned']) {
    assert.equal(typeof dicts.en[key], 'string')
    assert.equal(typeof dicts.zh[key], 'string')
  }
  for (const key of ['selftest.title', 'selftest.item.style', 'selftest.item.pref', 'selftest.item.pinned', 'selftest.item.host']) {
    assert.equal(typeof dicts.zh[key], 'string')
    assert.equal(typeof dicts.en[key], 'string')
  }
  assert.ok(dicts.zh['selftest.detail.hostMissing'].includes('宿主结构可能已变'), 'the locale must carry the host-drift wording')
})

test('disposal removes the stylesheet, the root flag and the test surface', () => {
  const { plugin, document, window } = loadClient()
  const { ctx, effects } = createContext()
  plugin.apply(ctx)

  assert.equal(document.head.children.length, 1)
  assert.ok(document.documentElement.hasAttribute('data-dsh-sidebar-pin'))
  assert.equal(window.__dshSidebarPinSelftest?.version, 1)
  for (const effect of effects) effect.dispose?.()
  assert.equal(document.head.children.length, 0, 'the stylesheet must not outlive the plugin')
  assert.equal(document.documentElement.hasAttribute('data-dsh-sidebar-pin'), false, 'the flag must not outlive the plugin')
  assert.equal(window.__dshSidebarPinSelftest, undefined, 'the test surface must not outlive the plugin')
})

test('stored preference "0" keeps the rows unpinned on load', () => {
  const { plugin, document, store } = loadClient({ stored: '0' })
  const { ctx } = createContext()
  plugin.apply(ctx)

  assert.equal(document.documentElement.hasAttribute('data-dsh-sidebar-pin'), false)
  assert.equal(store.get('dsh-sidebar-pin:enabled'), '0', 'applying must not rewrite the stored choice')
})

test('self-test: every check passes on a healthy page', async () => {
  const { plugin, window } = loadClient()
  const { ctx } = createContext()
  plugin.apply(ctx)

  const rows = await window.__dshSidebarPinSelftest.runChecks()
  assert.deepEqual([...rows.map((row) => row.id)], ['style', 'pref', 'pinned', 'host'])
  assert.deepEqual([...rows.map((row) => row.ok)], [true, true, true, true])
})

test('self-test: a missing host nav fails only the host check', async () => {
  const { plugin, window } = loadClient({ nav: false })
  const { ctx } = createContext()
  plugin.apply(ctx)

  const rows = await window.__dshSidebarPinSelftest.runChecks()
  const host = rows.find((row) => row.id === 'host')
  assert.equal(host.ok, false)
  assert.equal(host.key, 'selftest.detail.hostMissing')
  assert.deepEqual([...rows.filter((row) => row.id !== 'host').map((row) => row.ok)], [true, true, true], 'other checks stay green')
})

test('self-test: a hung check times out at the ceiling and does not block the others', async () => {
  const { plugin, window } = loadClient()
  const { ctx } = createContext()
  plugin.apply(ctx)

  const slow = { id: 'slow', labelKey: 'selftest.item.style', run: () => new Promise(() => {}) }
  const fast = { id: 'fast', labelKey: 'selftest.item.host', run: () => ({ ok: true, key: 'selftest.detail.hostOk', vars: { n: 1 } }) }
  const rows = await window.__dshSidebarPinSelftest.runChecks({ checks: [slow, fast], timeoutMs: 30 })
  const timedOut = rows.find((row) => row.id === 'slow')
  assert.equal(timedOut.ok, false)
  assert.equal(timedOut.key, 'selftest.detail.timeout')
  assert.equal(timedOut.vars.ms, 30)
  assert.equal(rows.find((row) => row.id === 'fast').ok, true)
})

test('self-test: a root flag that disagrees with the preference fails the pin check', async () => {
  const { plugin, window, document } = loadClient({ stored: '0' })
  const { ctx } = createContext()
  plugin.apply(ctx)
  // Simulate a stale flag left behind by a reload race.
  document.documentElement.setAttribute('data-dsh-sidebar-pin', '')

  const rows = await window.__dshSidebarPinSelftest.runChecks()
  const pinned = rows.find((row) => row.id === 'pinned')
  assert.equal(pinned.ok, false)
  assert.equal(pinned.key, 'selftest.detail.pinnedMismatch')
})

test('self-test: the copied Markdown keeps the - [x] / - [ ] shape', () => {
  const { plugin, window } = loadClient()
  const { ctx, dictionaries } = createContext()
  plugin.apply(ctx)
  const zh = dictionaries[0].dicts.zh
  const t = (key, vars) => {
    const raw = zh[key] ?? key
    return vars === undefined ? raw : String(raw).replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole))
  }
  const rows = [
    { id: 'style', label: '样式已注入', ok: true, detail: '' },
    { id: 'host', label: '宿主契约', ok: false, detail: '找不到 nav' },
  ]
  const markdown = window.__dshSidebarPinSelftest.toMarkdown(rows, t)
  assert.equal(markdown, '- [x] 样式已注入 — 通过\n- [ ] 宿主契约 — 失败：找不到 nav')
})

test('host contract check (optional): sidebar shell source still matches', (t) => {
  const dir = process.env.DSH_SIDEBAR_DIR
  if (dir === undefined || dir === '') {
    t.skip('set DSH_SIDEBAR_DIR to the @deepseek-ai/dsh-client-ui-sidebar package (source checkout) to run')
    return
  }
  const tsx = readFileSync(join(dir, 'src', 'client', 'SidebarRoot.tsx'), 'utf8')
  const css = readFileSync(join(dir, 'src', 'client', 'SidebarRoot.module.css'), 'utf8')
  assert.ok(tsx.includes(HOST.scrollportAttr), 'the shell must still mark its viewport with ' + HOST.scrollportAttr)
  assert.ok(tsx.includes('<nav'), 'the shell must still render the panel rows as a <nav> child of the viewport')
  assert.ok(css.includes('grid-template-rows: ' + HOST.baseRows), 'the host grid baseline changed: re-derive the pinned template')
  assert.ok(css.includes('grid-row: 4'), 'the workspace section must still sit in grid row 4')
})
