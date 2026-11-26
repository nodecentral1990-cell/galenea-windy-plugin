// What the map part (src/MapKeeper.svelte) shares with the panel (plugin.svelte). The map part keeps running on a phone
// after Windy closes the panel (owner's report, 2026-11-26: "the route on the screen which i was editing with half screen -
// disappeared"), so the panel reads these instead of owning the map layer itself.

import { writable } from 'svelte/store';

import type { ShipPosition } from '../lib/model';
import type { ShipGlyph } from '../lib/shipGlyph';
import type { RouteLayer } from './mapLayer';

/** The route on the map (null while the map part is not running) */
export const mapLayer = writable<RouteLayer | null>(null);
/** The ship on the plan at the map time (null outside the voyage) */
export const shipNow = writable<ShipPosition | null>(null);
/** Weather symbol for a ship position (only when the forecast belongs to the current plan) */
export const shipGlyphFn = writable<(p: ShipPosition) => ShipGlyph | null>(() => null);
