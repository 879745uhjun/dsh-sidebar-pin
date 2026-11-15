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
