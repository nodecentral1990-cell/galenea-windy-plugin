// Starts and stops the map part (src/MapKeeper.svelte): one copy only, kept in a hidden box of its own outside the panel,
// so it lives on when Windy closes the panel on a phone (owner's report, 2026-11-26).

import MapKeeper from '../MapKeeper.svelte';

let inst: MapKeeper | null = null;
let host: HTMLElement | null = null;

/** Start the map part (nothing happens when it is already running) */
export function startMapKeeper(): void {
    if (inst) return;
    try {
        host = document.createElement('div');
        host.className = 'pp-mapkeeper';
        host.style.display = 'none';
        document.body.appendChild(host);
        inst = new MapKeeper({ target: host });
    } catch (e) {
        console.error('[galenea] map part failed to start', e);
    }
}

/** Stop the map part: the route, ships and charts leave the map */
export function stopMapKeeper(): void {
    try {
        inst?.$destroy();
    } catch {
        /* gone */
    }
    inst = null;
    try {
        host?.remove();
    } catch {
        /* gone */
    }
    host = null;
}

export const mapKeeperRunning = (): boolean => inst != null;
