// Cold weather and ice (owner, 2026-10-29: "ice limits for ships in ice regions like Montreal, the
// Baltic"). What Windy gives (type files 3.0.5, checked 2026-10-29): NO sea-ice concentration,
// thickness or ice-edge data; its "icing" layer is in-flight icing for aircraft. It does give air
// temperature, sea surface temperature and wind, which is what the vessel SPRAY-ICING predictor needs:
//
//   Overland method (Overland et al. 1986, Overland 1990, Weather and Forecasting 5:62–77; used by the
//   US NWS Ocean Prediction Center):  PPR = Va (Tf − Ta) / (1 + 0.3 (Tw − Tf))
//   Va wind speed m/s, Ta air °C, Tw sea surface °C, Tf freezing point of sea water (−1.8 °C here).
//   PPR < 0 none · 0–22.4 light (< 0.7 cm/h) · 22.4–53.3 moderate (0.7–2 cm/h) · 53.3–83 heavy
//   (2–4 cm/h) · > 83 extreme (> 4 cm/h).
//
// Checked 2026-10-29 from secondary sources only (the bands and the 0.3 coefficient come from a
// spreadsheet citing Overland 1990; one NWS slide shows 0.4): treat the classes as a guide. It is a
// generic predictor for fishing-vessel sized ships; large ships ice less, mainly on the forecastle.

export type IcingClass = 'none' | 'light' | 'moderate' | 'heavy' | 'extreme';
export const ICING_CLASSES: IcingClass[] = ['none', 'light', 'moderate', 'heavy', 'extreme'];
export const ICING_LABEL: Record<IcingClass, string> = { none: 'none', light: 'light', moderate: 'moderate', heavy: 'heavy', extreme: 'extreme' };
export const ICING_RATE: Record<IcingClass, string> = { none: '0', light: 'under 0.7 cm/h', moderate: '0.7–2 cm/h', heavy: '2–4 cm/h', extreme: 'over 4 cm/h' };

const TF = -1.8;
const KN_TO_MS = 0.514444;

export interface Icing {
    /** Overland icing predictor, m·°C/s (null = not enough data) */
    ppr: number;
    cls: IcingClass;
}

/** Spray icing class from wind (kn), air temperature and sea surface temperature (°C). */
export function sprayIcing(windKn: number | null | undefined, airC: number | null | undefined, seaC: number | null | undefined): Icing | null {
    if (windKn == null || airC == null || seaC == null || !isFinite(windKn) || !isFinite(airC) || !isFinite(seaC)) return null;
    // no spray icing above freezing air, or with the sea warmer than about 12 °C (outside the method's range)
    if (airC >= TF || seaC > 12) return { ppr: 0, cls: 'none' };
    const va = windKn * KN_TO_MS;
    const ppr = (va * (TF - airC)) / (1 + 0.3 * (Math.max(TF, seaC) - TF));
    const cls: IcingClass = ppr <= 0 ? 'none' : ppr < 22.4 ? 'light' : ppr < 53.3 ? 'moderate' : ppr < 83 ? 'heavy' : 'extreme';
    return { ppr, cls };
}

export const icingRank = (c: IcingClass | null | undefined): number => (c ? ICING_CLASSES.indexOf(c) : 0);

/** Cold-weather limits (⚙ Settings → Weather limits → Cold and ice). Empty = off. */
export interface ColdLimits {
    airAlertC: number | null;
    airLimitC: number | null;
    seaAlertC: number | null;
    seaLimitC: number | null;
    icingAlert: IcingClass | null;
    icingLimit: IcingClass | null;
}

/** Defaults: a sea at or below 0 °C may freeze / have ice nearby; spray icing moderate = alert, heavy = limit */
export const defaultCold = (): ColdLimits => ({ airAlertC: -5, airLimitC: null, seaAlertC: 0, seaLimitC: -1, icingAlert: 'moderate', icingLimit: 'heavy' });
