// Ship types with rough typical values used when the owner has not entered the real figure:
// block coefficient (for the weather speed-loss estimate) and average windage height above the
// waterline (for the wind drift when stopped). These are TYPICAL VALUES, not data for a given ship:
// windage heights from an independent review (2026-10-27, estimates from typical freeboards and
// profiles, not a published table); block coefficients are common textbook ranges.

import type { Vessel } from './model';

export type ShipTypeId =
    | 'container'
    | 'feeder'
    | 'tanker'
    | 'bulk'
    | 'lng'
    | 'lpg'
    | 'cargo'
    | 'pctc'
    | 'roro'
    | 'passenger'
    | 'reefer'
    | 'offshore'
    | 'yacht'
    | 'other';

export interface ShipTypeInfo {
    id: ShipTypeId;
    label: string;
    /** Kwon's form coefficient family: his paper has one formula for container ships, one for all others */
    kwon: 'container' | 'other';
    /** Typical block coefficient */
    cb: number;
    /** Typical average height of the ship's side above the waterline, incl. deck cargo / superstructure, m */
    windH: { laden: number; ballast: number };
}

export const SHIP_TYPES: ShipTypeInfo[] = [
    { id: 'container', label: 'Container ship (deep-sea)', kwon: 'container', cb: 0.65, windH: { laden: 25, ballast: 18 } },
    { id: 'feeder', label: 'Container feeder', kwon: 'container', cb: 0.68, windH: { laden: 15, ballast: 12 } },
    { id: 'tanker', label: 'Oil / chemical tanker', kwon: 'other', cb: 0.82, windH: { laden: 9, ballast: 17 } },
    { id: 'bulk', label: 'Bulk carrier', kwon: 'other', cb: 0.83, windH: { laden: 9, ballast: 16 } },
    { id: 'lng', label: 'LNG carrier', kwon: 'other', cb: 0.75, windH: { laden: 17, ballast: 19 } },
    { id: 'lpg', label: 'LPG carrier', kwon: 'other', cb: 0.75, windH: { laden: 14, ballast: 17 } },
    { id: 'cargo', label: 'General cargo / multipurpose', kwon: 'other', cb: 0.72, windH: { laden: 8, ballast: 11 } },
    { id: 'pctc', label: 'Car carrier (PCTC)', kwon: 'other', cb: 0.6, windH: { laden: 28, ballast: 29 } },
    { id: 'roro', label: 'Ro-Ro', kwon: 'other', cb: 0.62, windH: { laden: 19, ballast: 20 } },
    { id: 'passenger', label: 'Passenger / cruise', kwon: 'other', cb: 0.65, windH: { laden: 40, ballast: 40 } },
    { id: 'reefer', label: 'Reefer', kwon: 'other', cb: 0.6, windH: { laden: 12, ballast: 14 } },
    { id: 'offshore', label: 'Offshore supply (PSV / AHTS)', kwon: 'other', cb: 0.7, windH: { laden: 8, ballast: 8 } },
    { id: 'yacht', label: 'Motor yacht', kwon: 'other', cb: 0.45, windH: { laden: 8, ballast: 8 } },
];

/** Type info; old saved value 'other' is read as general cargo */
export function shipTypeOf(id: string | undefined | null): ShipTypeInfo {
    return SHIP_TYPES.find(t => t.id === id) ?? (id === 'other' ? SHIP_TYPES.find(t => t.id === 'cargo')! : SHIP_TYPES[0]);
}

export interface LeewayEstimate {
    /** Wind drift as % of the wind speed */
    pct: number;
    /** Plain-language note on how it was worked out */
    how: string;
    /** True when worked out from the ship's data (false = the 3 % fallback) */
    estimated: boolean;
}

/**
 * Wind drift (leeway) of a stopped ship, % of wind speed: wind force on the area above water
 * balanced against water drag on the area below water (drag-coefficient ratio taken as 1):
 *   r = √(ρair·A_air / (ρwater·A_water)),  leeway = r / (1 + r)
 * A_water = LBP × mean draft, A_air = LOA × windage height (your value or the typical one for the
 * ship type and condition). Not included: wind is higher up than 10 m (a little more drift) and
 * wave drift (roughly another 0.3–1 % of the wind speed in a developed sea).
 */
export function estimateLeeway(v: Vessel): LeewayEstimate {
    const draft = v.draftFwd != null && v.draftAft != null ? (v.draftFwd + v.draftAft) / 2 : (v.draftFwd ?? v.draftAft);
    if (!v.lbp || !draft) return { pct: 3, how: 'rule of thumb 3 % (enter LBP and drafts for an estimate)', estimated: false };
    const t = shipTypeOf(v.shipType);
    const cond = v.condition === 'ballast' ? 'ballast' : 'laden';
    const h = v.windageHeight ?? t.windH[cond];
    const loa = v.loa ?? v.lbp * 1.04;
    const r = Math.sqrt(((1.225 / 1025) * (loa * h)) / (v.lbp * draft));
    const pct = (100 * r) / (1 + r);
    const hTxt = v.windageHeight != null ? `your windage height ${h} m` : `typical windage height ${h} m for a ${cond} ${t.label.toLowerCase()}`;
    return { pct, how: `estimated from LBP ${v.lbp} m, mean draft ${draft.toFixed(1)} m and ${hTxt}`, estimated: true };
}
