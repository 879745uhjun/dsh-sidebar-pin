/**
 * dsh-sidebar-pin — Host half.
 *
 * The browser half owns everything this bundle does: it keeps the sidebar's
 * global panel rows pinned to the top of the sidebar viewport and adds the pin
 * toggle above Settings. No Host service, route, or model-facing tool is
 * needed, so the row only exists to load the Client module.
 */

/** Cordis plugin name. */
export const name = 'dsh-sidebar-pin'

/** No Host half: the bundle is a pure Client decoration. */
export function apply() {}
