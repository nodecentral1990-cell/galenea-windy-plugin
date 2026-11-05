type Fn = (...a: any[]) => void;
export class Evented {
    private h: Record<string, Fn[]> = {};
    on(n: string, f: Fn) { (this.h[n] ||= []).push(f); return this; }
    off(n: string, f: Fn) { this.h[n] = (this.h[n] || []).filter(x => x !== f); return this; }
    once(n: string, f: Fn) { const w = (...a: any[]) => { this.off(n, w); f(...a); }; return this.on(n, w); }
    emit(n: string, ...a: any[]) { (this.h[n] || []).slice().forEach(f => f(...a)); }
    fire(n: string, ...a: any[]) { this.emit(n, ...a); }
}
