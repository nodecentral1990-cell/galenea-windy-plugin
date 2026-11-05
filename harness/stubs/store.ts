// Test stand-in for Windy's store.
import { Evented } from './evented';
import bcast from './broadcast';
const H = 3600e3;
const now = Math.floor(Date.now() / H) * H;
class Store extends Evented {
    data: Record<string, any> = { timestamp: now, overlay: 'wind', level: 'surface', calendar: { start: now - 6 * H, end: now + 10 * 24 * H }, product: 'ecmwf' };
    get(k: string) { return this.data[k]; }
    set(k: string, v: any) {
        if (this.data[k] === v) return;
        this.data[k] = v;
        this.emit(k, v);
        (window as any).__harnessLog?.push(`store.set ${k}=${v}`);
        setTimeout(() => bcast.emit('redrawFinished', null), 30);
    }
}
const store = new Store();
// Windy steps the forecast time with the left / right arrow keys
window.addEventListener('keydown', e => {
    // like Windy (owner's report): no check for text boxes, so the plugin must stop the keys itself
    if (e.key === 'ArrowRight') store.set('timestamp', store.get('timestamp') + H);
    if (e.key === 'ArrowLeft') store.set('timestamp', store.get('timestamp') - H);
});
(window as any).__store = store;
export default store;
