// Test stand-in for Windy's point forecast. FAKE, MADE-UP WEATHER for testing the screens only.
import store from './store';
const H = 3600e3;
export async function getPointForecastData(model: string, { lat, lon, step = 3 }: { lat: number; lon: number; step?: number }) {
    (window as any).__fetchCount = ((window as any).__fetchCount || 0) + 1;
    await new Promise(r => setTimeout(r, 20));
    const start = store.get('calendar').start;
    const end = store.get('calendar').end;
    const ts: number[] = [];
    // window.__windyFree: like a user without Windy Premium: 3-hour steps, 5 real days, then FAKE promotional days
    const free = !!(window as any).__windyFree;
    const st = free ? 3 : step;
    for (let t = start; t <= end; t += st * H) ts.push(t);
    const realN = free ? ts.filter(t => t < start + 5 * 24 * H).length : ts.length;
    const summary = free ? { d1: { index: 0, segments: realN }, d2: { index: realN, segments: ts.length - realN, isFake: true } } : undefined;
    const k = (t: number) => (t - start) / (24 * H);
    const wave = (t: number) => 2 + 2.5 * (1 + Math.sin(k(t) * 1.3 + lat / 9)) ;
    if (model.endsWith('Waves')) {
        return { data: { summary, header: { refTime: '2026-10-26T00:00:00Z', model, sst: 273.15 + 26 - lat / 4 }, data: {
            ts, waves: ts.map(wave), wavesDir: ts.map(t => (250 + 30 * Math.sin(k(t))) % 360), wavesPeriod: ts.map(t => 9 + 2 * Math.sin(k(t))),
            swell1: ts.map(t => 0.75 * wave(t)), swell1Dir: ts.map(() => 300), swell1Period: ts.map(t => 11 + 3 * Math.cos(k(t) + lon / 20)),
            swell2: ts.map(() => 0.8), swell2Dir: ts.map(() => 200), swell2Period: ts.map(() => 7),
        } } };
    }
    return { data: { summary, header: { refTime: '2026-10-26T00:00:00Z', model }, data: {
        ts, wind: ts.map(t => 7 + 7 * (1 + Math.sin(k(t) * 1.3 + lat / 9))), windGust: ts.map(t => 10 + 9 * (1 + Math.sin(k(t) * 1.3 + lat / 9))),
        windDir: ts.map(t => (240 + 40 * Math.sin(k(t))) % 360), pressure: ts.map(t => 101300 - 900 * Math.sin(k(t))),
        temperature: ts.map(t => 273.15 + 24 - lat / 5 + 2 * Math.sin(k(t) * 6)),
        precipAmount: ts.map(t => Math.max(0, Math.sin(k(t) * 3)) * 2), icon: ts.map(t => (Math.floor(k(t) * 4) % 7 === 3 ? 17 : 3)),
    } } };
}

// FAKE elevation for the test page: "land" north of 35.5°N.
export async function getElevation(lat: number, _lon: number) {
    return { data: lat > 35.5 ? 120 : -3000 };
}
