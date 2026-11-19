// One map tool at a time, and a visible note on the map while a click on the map does something
// (UI reimagine, owner 2026-11-13; windy/notes/ui-reimagine-2026-11.md §2.6). Before this, "Add waypoints by
// clicking the map" was a tick box in the pane with nothing on the map to show it was on.
// The tool is worked out from the two existing switches (addMode and the place pick), so the old code keeps working.
// The note is a plain element put on the page only while a tool is on; every step guarded (the plugin must always open).

import { derived, get, type Readable } from 'svelte/store';

import { logEvent } from '../lib/activityLog';
import { toolFor, toolNote, type MapTool } from '../lib/mapTool';
import { addMode, phone } from '../state';
import { cancelPick, picking } from './placeJob';

/** What a click on the map does now */
export const mapTool: Readable<MapTool> = derived([addMode, picking], ([$a, $p]) => toolFor($a, $p));

let el: HTMLDivElement | null = null;
let stop: (() => void) | null = null;

function endTool(): void {
    const t = get(mapTool);
    if (t === 'place') cancelPick();
    else if (t === 'waypoint') addMode.set(false);
    logEvent('click', `Map tool ended: ${t}`);
}

function show(tool: MapTool): void {
    try {
        const text = get(phone) ? '' : toolNote(tool);
        if (!text) {
            el?.remove();
            el = null;
            return;
        }
        if (!el) {
            el = document.createElement('div');
            el.className = 'pp-maptool';
            el.setAttribute('role', 'status');
            const span = document.createElement('span');
            const b = document.createElement('button');
            b.type = 'button';
            b.addEventListener('click', e => {
                e.stopPropagation();
                endTool();
            });
            el.appendChild(span);
            el.appendChild(b);
            document.body.appendChild(el);
        }
        (el.firstChild as HTMLElement).textContent = `${text} · Esc to stop`;
        const b = el.lastChild as HTMLButtonElement;
        b.textContent = tool === 'place' ? 'Cancel' : 'Done';
        b.title = tool === 'place' ? 'Stop picking a place' : 'Stop adding waypoints';
        el.dataset.tool = tool;
    } catch {
        /* the tool still works without its note */
    }
}

const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || get(mapTool) === 'off') return;
    const t = e.target as HTMLElement | null;
    // Esc in a box, a pop-up or a window of the plugin belongs to that
    if (t?.closest?.('input:not([type=checkbox]):not([type=radio]), textarea, select, .g-pop, .dtf__pop, .g-fold, .g-setwin, .pp-overlay, .pp-menu')) return;
    endTool();
};

export function startMapToolNote(): void {
    stopMapToolNote();
    const un = mapTool.subscribe(show);
    const unPhone = phone.subscribe(() => show(get(mapTool)));
    window.addEventListener('keydown', onKey, true); // capture: the key guard of the pane stops keys typed in its boxes
    stop = () => {
        un();
        unPhone();
        window.removeEventListener('keydown', onKey, true);
    };
}

export function stopMapToolNote(): void {
    try {
        stop?.();
        el?.remove();
    } catch {
        /* gone */
    }
    stop = null;
    el = null;
}
