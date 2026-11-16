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
  /** Stable marker the sidebar puts on its scroll viewport while expanded. */
  scrollportAttr: 'data-sidebar-scrollport',
  /** The pinned rows are the viewport's only direct <nav> child. */
  navSelector: '> nav',
  /** The workspace section is the viewport's direct <div> child (grid row 4). */
  regionSelector: '> div',
  /** Host baseline: grid-template-rows: 8px max-content 2px max-content. */
  baseRows: '8px max-content 2px max-content',
  /** Pinned: the last row takes the leftover height instead of a full viewport. */
  pinnedRows: '8px max-content 2px 1fr',
}

function createDocument() {
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
  return {
    head,
    documentElement,
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
function loadClient() {
  const loaded = []
  const document = createDocument()
  const store = new Map()
  const window = {
    __ModuleLoader__: { load: (module) => { loaded.push(module) } },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    },
    addEventListener() {},
    removeEventListener() {},
  }
  const context = vm.createContext({ window, document, navigator: { language: 'zh-CN' }, console })
  vm.runInContext(source, context, { filename: 'client.js' })
  assert.equal(loaded.length, 1, 'client.js must register exactly one module')
  const module = loaded[0]
  const plugin = module.factory((specifier) => {
    assert.equal(specifier, 'react', 'only React is required by this bundle')
    return fakeReact
  })
  return { module, plugin, document, store }
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
  assert.ok(css.includes(HOST.pinnedRows), 'the list row must take the leftover height (1fr)')
  assert.ok(css.includes('grid-template-rows: ' + HOST.pinnedRows), 'pinned grid template must be the frozen-viewport one')
  assert.ok(css.includes('grid-column: 2') && css.includes('grid-row: 4'), 'the region must keep the host grid placement')
  assert.ok(css.includes('container-type: size'), 'the region must become the size container for the list scroller')
  assert.ok(css.includes('position: sticky'), 'the rows stay sticky as a belt-and-braces guard')
  assert.ok(css.includes('overflow-y: hidden'), 'the viewport must not keep a scroll range of its own')
  assert.ok(css.includes('--dsw-specific-sidebar-fill'), 'the pinned block must paint the sidebar fill')
  assert.ok(css.includes('.dsh-sidebar-pin-toggle'), 'the toggle styles must ship with the same bundle')
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

test('registers exactly one footer action and no panel row', () => {
  const { plugin } = loadClient()
  const { ctx, registrations, injected } = createContext()
  plugin.apply(ctx)

  assert.deepEqual(injected, ['sidebar.footer.action'])
  assert.equal(registrations.length, 1)
  const { options, component } = registrations[0]
  assert.equal(options.name, 'sidebar.footer.action')
  assert.equal(options.id, 'sidebar-pin')
  assert.equal(options.order, 20)
  assert.equal(options.locale, 'sidebar-pin')
  assert.equal(typeof component, 'function', 'the slot needs a component, not a plain node')
})

test('registers matched en/zh dictionaries for the toggle copy', () => {
  const { plugin } = loadClient()
  const { ctx, dictionaries } = createContext()
  plugin.apply(ctx)

  assert.equal(dictionaries.length, 1)
  const { namespace, dicts } = dictionaries[0]
  assert.equal(namespace, 'sidebar-pin')
  assert.deepEqual(Object.keys(dicts).sort(), ['en', 'zh'])
  assert.deepEqual(Object.keys(dicts.en).sort(), Object.keys(dicts.zh).sort(), 'both locales must cover the same keys')
  for (const key of ['action.label', 'action.pinned', 'action.unpinned', 'action.tip.pinned', 'action.tip.unpinned']) {
    assert.equal(typeof dicts.en[key], 'string')
    assert.equal(typeof dicts.zh[key], 'string')
  }
})

test('disposal removes the stylesheet and the root flag', () => {
  const { plugin, document } = loadClient()
  const { ctx, effects } = createContext()
  plugin.apply(ctx)

  assert.equal(document.head.children.length, 1)
  assert.ok(document.documentElement.hasAttribute('data-dsh-sidebar-pin'))
  for (const effect of effects) effect.dispose?.()
  assert.equal(document.head.children.length, 0, 'the stylesheet must not outlive the plugin')
  assert.equal(document.documentElement.hasAttribute('data-dsh-sidebar-pin'), false, 'the flag must not outlive the plugin')
})

test('stored preference "0" keeps the rows unpinned on load', () => {
  const { plugin, document, store } = loadClient()
  store.set('dsh-sidebar-pin:enabled', '0')
  const { ctx } = createContext()
  plugin.apply(ctx)

  assert.equal(document.documentElement.hasAttribute('data-dsh-sidebar-pin'), false)
  assert.equal(store.get('dsh-sidebar-pin:enabled'), '0', 'applying must not rewrite the stored choice')
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
