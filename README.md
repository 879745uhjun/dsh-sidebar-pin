# dsh-sidebar-pin

Pin the sidebar panel rows to the top of the sidebar.

The sidebar keeps its global panels — **Plugins**, **Token usage**, **Todos**, and any
panel a later plugin adds — in one row group above the Workspace/Session list. That
row group scrolls away with the list. This bundle makes it sticky at the top of the
sidebar viewport, so the panel entries stay reachable while a long session list
scrolls beneath them.

A pin button above **Settings** switches the behaviour off and on; the choice is
stored in `localStorage` and applies to every window of the profile.

## Use

1. Pinned (the default): the panel rows stay in place, the session list scrolls under them.
2. Click the pin above Settings to let the rows scroll with the list again; click it once more to pin them back.

The bundle is a pure Client decoration: no Host route, no model-facing tool, no data
leaves the page.

## Install

**Plugins** → **Add plugin** → paste this package directory.

## Compatibility

Requires a sidebar that renders its global panel rows inside `[data-sidebar-scrollport]`
(the shipped `@deepseek-ai/dsh-client-ui-sidebar` does). The toggle needs the
`sidebar.footer.action` slot; on a shell without it the pin still works but has no
button.

## Host contract

The pinned block is a stylesheet over the sidebar shell's own DOM, so four facts are
load-bearing. `test/client.test.mjs` asserts the bundle side of each one:

| Assumption | If the host changes it |
|---|---|
| `[data-sidebar-scrollport]` marks the scroll viewport | Selectors stop matching: the rows scroll away again, no crash |
| The panel rows are that viewport's only direct `<nav>` | Sticky row, fill and hairline are lost |
| The list region is the viewport's direct `<div>` in grid row 4 | `container-type` misses, the section keeps a full-column height and the last rows can be clipped |
| Host baseline rows are `8px max-content 2px max-content` | The pinned `... 1fr` template desyncs by a few pixels: a jump or an empty band |

When the shell is on disk, check the host side too:
`DSH_SIDEBAR_DIR=<path to @deepseek-ai/dsh-client-ui-sidebar> npm test`.

## Tests

`npm test` (node:test, no dependencies). The suite loads `client.js` in a `vm` sandbox
with a fake `window.__ModuleLoader__` and `document`, then asserts the module surface:
the injected services, the registered `sidebar.footer.action` row, the stylesheet
selectors and grid template, the root flag, both locale dictionaries, and that disposal
removes the style element and the flag. It does not render React and never touches the
real sidebar DOM.

With the shell source unpacked on disk, the host side is checked too (unpacked into the
workspace on this machine):

```bash
cd "D:/Deepseek work/workplace/dsh-sidebar-pin"
DSH_SIDEBAR_DIR="D:/Deepseek work/workplace/sidebar-src/dsh/node_modules/@deepseek-ai/dsh-client-ui-sidebar" npm test
```

- with `DSH_SIDEBAR_DIR`: 8 pass / 0 fail / 0 skipped — grid template, scrollport marker and the
  `> nav` / `> div` structure all match the real source;
- without it: 12 pass / 0 fail / 1 skipped (that case skips itself and says why).

## Self-test

**Plugins** → select this plugin to open its detail page: a **Self-test** section runs
four read-only checks, and only when **Run self-test** is pressed.

| Check | Passes when | Fails with |
|---|---|---|
| Stylesheet injected | the bundle's `<style data-plugin-css="dsh-sidebar-pin/sidebar-pin.css">` is in the document and carries the `[data-sidebar-scrollport]` rule | missing style, or a sheet without that rule |
| Preference readable | `localStorage['dsh-sidebar-pin:enabled']` is absent (the default applies) or holds `1`/`0` | unreadable storage, or an unrecognized value |
| Pin state | the `<html data-dsh-sidebar-pin>` flag agrees with the stored preference | flag and preference disagree |
| Host contract | `[data-sidebar-scrollport] > nav` exists and the rows compute to `position: sticky` | "the host structure may have changed (or the sidebar is collapsed)" |

Each check has a 2 s ceiling, so a hung check fails instead of freezing the section.
Results live in the section's memory only; **Copy result** puts a Markdown list on the
clipboard (`- [x] label — Pass` / `- [ ] label — Fail: reason`). Nothing runs on mount
and no data leaves the page.

## Install from GitHub

```sh
dsh plugin --profile desktop add github:879745uhjun/dsh-sidebar-pin
```

Reload the Web UI page after installing.
