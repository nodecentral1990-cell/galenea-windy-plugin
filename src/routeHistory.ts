// Undo / redo of route changes (owner, 2026-11-23: "a function ctrl+Z, for when we shift a way point on the map but we
// dont want that ... and in same manner Ctrl+Y ... these should not have a limit"). Every change of the route (a waypoint
// dragged, added, deleted, typed in, a speed, an imported route, "take into route" …) is one step; a drag on the map or
// quick typing in one box counts as one step, not hundreds. No limit on the number of steps while the plugin is open
// (the steps are not kept after a reload).

import { get, writable } from 'svelte/store';

import { route } from './state';
import type { Route } from './lib/model';

const past: string[] = [];
const future: string[] = [];
let last = JSON.stringify(get(route));
let applying = false;
/** Changes coming quickly after each other (typing, a drag) join the step already open */
let merging = false;
let dragging = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const QUIET_MS = 700;

/** How many steps can be undone / redone (for the buttons) */
export const historyCount = writable({ undo: 0, redo: 0 });
const tell = () => historyCount.set({ undo: past.length, redo: future.length });

route.subscribe(r => {
    const s = JSON.stringify(r);
    if (s === last) return;
    if (applying) {
        last = s;
        return;
    }
    if (!merging) {
        past.push(last);
        future.length = 0;
    }
    merging = true;
    if (timer) clearTimeout(timer);
    if (!dragging) timer = setTimeout(() => (merging = false), QUIET_MS);
    last = s;
    tell();
});

/** A waypoint drag on the map is going on (all its moves are one step) */
export function dragMove(final: boolean): void {
    dragging = !final;
    if (final) {
        if (timer) clearTimeout(timer);
        merging = false;
    }
}

function apply(s: string): void {
    applying = true;
    try {
        route.set(JSON.parse(s) as Route);
    } finally {
        applying = false;
    }
    merging = false;
    if (timer) clearTimeout(timer);
}

/** Back one step; false when there is nothing to undo */
export function undo(): boolean {
    const prev = past.pop();
    if (prev == null) return false;
    future.push(last);
    apply(prev);
    tell();
    return true;
}

/** Forward one step again; false when there is nothing to redo */
export function redo(): boolean {
    const next = future.pop();
    if (next == null) return false;
    past.push(last);
    apply(next);
    tell();
    return true;
}

/** Ctrl+Z / ⌘Z = undo; Ctrl+Y, Ctrl+Shift+Z, ⌘⇧Z = redo. Not while typing in a box (the box keeps its own undo). */
export function onUndoKey(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    const isRedo = k === 'y' || (k === 'z' && e.shiftKey);
    const done = isRedo ? redo() : undo();
    if (done) {
        e.preventDefault();
        e.stopPropagation();
    }
}
