// The sea-lane network for Route → Distances (Eurostat SeaRoute / MARNET, EUPL-1.2), not in the plugin since 0.29.0 (Windy's
// ~3 MB upload limit): downloaded from the plugin's public code page on first use, kept in this browser for a year (also
// used with no internet).

import { idbGet, idbSet } from '../lib/idbCache';
import { seaNetReady, setSeaNetData, type SeaNetData } from '../lib/seaNet';

export const SEANET_URL = 'https://raw.githubusercontent.com/nodecentral1990-cell/galenea-windy-plugin/main/data/seanet/seanet.json';
const KEY = 'sn:seanet.json';
const KEEP_MS = 365 * 86400e3;
let loading: Promise<void> | null = null;

export function ensureSeaNet(): Promise<void> {
    if (seaNetReady()) return Promise.resolve();
    if (!loading)
        loading = (async () => {
            const kept = await idbGet<{ at: number; data: SeaNetData }>(KEY).catch(() => undefined);
            if (kept && Date.now() - kept.at < KEEP_MS) return setSeaNetData(kept.data);
            try {
                const r = await fetch(SEANET_URL);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const d = (await r.json()) as SeaNetData;
                if (!(d && d.nodes > 0 && typeof d.b64 === 'string')) throw new Error('not the sea-lane file');
                idbSet(KEY, { at: Date.now(), data: d }).catch(() => {});
                setSeaNetData(d);
            } catch (e) {
                if (kept) return setSeaNetData(kept.data);
                throw e;
            }
        })().finally(() => {
            if (!seaNetReady()) loading = null;
        });
    return loading;
}
