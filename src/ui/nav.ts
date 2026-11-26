// Going from one part of the pane to another without handing callbacks down through every component
// (UI reimagine, owner 2026-11-13). plugin.svelte registers the handler when it opens.

import bcast from '@windy/broadcast';
import { writable } from 'svelte/store';

import config from '../pluginConfig';

export interface NavTarget {
    tab: string;
    seg?: string;
    /** Settings group to open and scroll to (tab 'settings') */
    settings?: string;
}

let handler: ((t: NavTarget) => void) | null = null;

/** Which section is open, and whether Help covers it (the Galenea app's own bar and its Back key read this) */
export const screenNow = writable<{ tab: string; help: boolean }>({ tab: 'route', help: false });

export function setNavHandler(f: ((t: NavTarget) => void) | null): void {
    handler = f;
}

export function goScreen(t: NavTarget): void {
    try {
        handler?.(t);
    } catch {
        /* the pane is closing */
    }
}

/** The Settings tab with this group open and in view ("All settings" in a fold-out) */
export function goSettings(id: string): void {
    goScreen({ tab: 'settings', settings: id });
}

/** A jump asked for while the panel was closed (phones: the map part keeps running); the panel takes it when it opens */
let pending: NavTarget | null = null;
export function takePendingNav(): NavTarget | null {
    const t = pending;
    pending = null;
    return t;
}

/** Jump inside the panel; when the panel is closed (phone, panel pulled down), open it first and jump when it is open */
export function goScreenOrOpen(t: NavTarget): void {
    if (handler) return goScreen(t);
    pending = t;
    try {
        bcast.emit('rqstOpen' as never, config.name as never);
    } catch {
        /* Windy refused: the jump waits for the next opening */
    }
}
