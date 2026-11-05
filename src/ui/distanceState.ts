// Rows of the Distances table (kept while the plugin is open)
import { writable } from 'svelte/store';
import type { DistanceRow } from '../lib/seaNet';

export interface DistEntry {
    row: DistanceRow;
    a: { lat: number; lon: number; name: string };
    b: { lat: number; lon: number; name: string };
}
export const DIST_ROWS = writable<DistEntry[]>([]);
