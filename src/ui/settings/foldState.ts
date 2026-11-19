// Which settings fold-out is open in the pane, and the one floating settings window for gears on the map windows
// (UI reimagine, owner 2026-11-13; windy/notes/ui-reimagine-2026-11.md §3.4). Plain stores: no map, no DOM at start-up.
import { get, writable } from 'svelte/store';

import { logEvent } from '../../lib/activityLog';
import { groupInfo } from './registry';

/** One settings group (or one part of it) a gear can show */
export interface Chip {
    id: string;
    part?: string;
    /** Name on the chip when the gear offers several groups */
    label?: string;
}

export interface FoldState {
    /** Name of the place in the pane where it is open (one fold-out per place) */
    host: string;
    chips: Chip[];
    idx: number;
    /** Show the whole group although a part was asked for ("More in …") */
    whole: boolean;
    /** The gear that opened it (the keyboard focus goes back there) */
    from: HTMLElement | null;
}

export const fold = writable<FoldState | null>(null);

const nameOf = (c: Chip | undefined) => (c ? (groupInfo(c.id)?.title ?? c.id) : '');

/** Gear pressed: open its fold-out, or close it when it is the one open. Only one is open at a time. */
export function toggleFold(host: string, chips: Chip[], from: HTMLElement | null = null): void {
    const cur = get(fold);
    if (cur && cur.host === host && cur.chips[0]?.id === chips[0]?.id && cur.chips[0]?.part === chips[0]?.part) return closeFold();
    fold.set({ host, chips, idx: 0, whole: false, from });
    logEvent('click', `Settings opened here: ${nameOf(chips[0])} (${host})`);
}

export function closeFold(refocus = true): void {
    const cur = get(fold);
    if (!cur) return;
    fold.set(null);
    if (!refocus) return;
    try {
        cur.from?.focus({ preventScroll: true });
        cur.from?.scrollIntoView({ block: 'nearest' });
    } catch {
        /* the gear is gone */
    }
}

export interface SetWinState {
    chips: Chip[];
    idx: number;
    whole: boolean;
    /** Where to open (beside the window whose gear was pressed) */
    x: number;
    y: number;
}

/** The floating settings window (computer only); never two */
export const setWin = writable<SetWinState | null>(null);

export function openSetWin(chips: Chip[], anchor: Element | null = null): void {
    let x = 380;
    let y = 90;
    try {
        const r = anchor?.getBoundingClientRect();
        if (r) {
            const W = 400;
            const room = window.innerWidth - 540; // the pane is at the right
            x = r.right + 8 + W < room ? r.right + 8 : r.left - W - 8 > 0 ? r.left - W - 8 : Math.max(8, Math.min(r.left, room - W));
            y = Math.max(8, Math.min(r.top, window.innerHeight - 360));
        }
    } catch {
        /* default place */
    }
    setWin.set({ chips, idx: 0, whole: false, x, y });
    logEvent('click', `Settings window opened: ${nameOf(chips[0])}`);
}

export function closeSetWin(): void {
    setWin.set(null);
}
