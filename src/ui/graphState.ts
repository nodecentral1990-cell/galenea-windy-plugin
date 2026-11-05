// Where the graph window sits and what it shows (kept in this browser only, like the other settings).

import { writable } from 'svelte/store';

export type GraphMode = 'normal' | 'min' | 'max';
export interface GraphState {
    open: boolean;
    mode: GraphMode;
    /** Distance from the left / bottom of the screen, px */
    left: number;
    bottom: number;
    /** null = as wide as the map (up to the plugin panel) */
    width: number | null;
    height: number;
    /** What each of the 3 graphs shows (series ids, see lib/graphSeries) */
    slots: string[][];
    /** Values switched off for a moment in each graph (still in the list box) (owner, 2026-10-30) */
    hidden: string[][];
    /** Graphs switched off (their list box kept) */
    off: boolean[];
}

const KEY = 'windy-plugin-passage-plan:graphs';
export const defaultGraphState = (): GraphState => ({
    open: true,
    mode: 'normal',
    left: 10,
    bottom: 90,
    width: null,
    height: 300,
    slots: [['sog', 'sicw'], ['windKn', 'hs', 'seaHs', 'sw1', 'sw2'], []],
    hidden: [[], [], []],
    off: [false, false, false],
});

function load(): GraphState {
    const d = defaultGraphState();
    try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
        if (!s || typeof s !== 'object') return d;
        const slots = Array.isArray(s.slots) ? [0, 1, 2].map(i => (Array.isArray(s.slots[i]) ? s.slots[i].filter((x: unknown) => typeof x === 'string') : [])) : d.slots;
        const strs = (a: unknown) => (Array.isArray(a) ? a.filter((x: unknown) => typeof x === 'string') : []);
        const hidden = [0, 1, 2].map(i => strs(Array.isArray(s.hidden) ? s.hidden[i] : null));
        const off = [0, 1, 2].map(i => (Array.isArray(s.off) ? s.off[i] === true : false));
        return { ...d, ...s, slots, hidden, off };
    } catch {
        return d;
    }
}

export const graphState = writable<GraphState>(load());
graphState.subscribe(s => {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
        /* storage off: the window still works, it just isn't remembered */
    }
});

/** On a phone the graph window opens only when asked, full screen over the panel (not remembered) */
export const phoneGraphOpen = writable(false);
export const toggleGraphs = () => graphState.update(s => ({ ...s, open: !s.open, mode: s.open ? s.mode : s.mode === 'min' ? 'normal' : s.mode }));
