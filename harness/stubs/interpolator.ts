// Test stand-in: returns a made-up current / visibility / 100 m wind / wave value.
// Like the real Windy (type files 3.0.5), the interpolator answers with a Promise.
// Wave layers: ASSUMED format [height × sin(to), height × cos(to), period], "to" = where the waves go
// (the plugin works the real format out by comparing Windy's SWH layer with the point forecast).
// Heights, directions and periods match the fake point forecast in fetch.ts.
import store from './store';
const H = 3600e3;
export async function getLatLonInterpolator() {
    return async ({ lat, lon }: { lat: number; lon: number }) => {
        const o = store.get('overlay');
        if (o === 'currents') return [0.3, 0.2 + lat / 200, 0];
        if (o === 'visibility') return [Math.max(800, 20000 * (0.5 + 0.5 * Math.sin(lon / 3))), 0];
        if (o === 'wind') return [-8 - lon / 20, -6, 0];
        const k = (store.get('timestamp') - store.get('calendar').start) / (24 * H);
        const wave = 2 + 2.5 * (1 + Math.sin(k * 1.3 + lat / 9));
        const sw1 = 0.75 * wave;
        const sea = Math.sqrt(Math.max(0, wave * wave - sw1 * sw1 - 0.64));
        const w: Record<string, [number, number, number]> = {
            waves: [wave, (250 + 30 * Math.sin(k)) % 360, 9 + 2 * Math.sin(k)],
            wwaves: [sea, (240 + 40 * Math.sin(k)) % 360, 6],
            swell1: [sw1, 300, 11 + 3 * Math.cos(k + lon / 20)],
            swell2: [0.8, 200, 7],
        };
        const v = w[o];
        if (!v) return null;
        const to = ((v[1] + 180) * Math.PI) / 180;
        return [v[0] * Math.sin(to), v[0] * Math.cos(to), v[2]];
    };
}
