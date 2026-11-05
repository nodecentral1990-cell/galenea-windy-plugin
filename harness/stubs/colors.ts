// Test stand-in for Windy's colour scales: records the custom gradient set by the plugin.
class Color {
    ident: string;
    custom: [number, number[]][] | null = null;
    constructor(ident: string) {
        this.ident = ident;
    }
    hasCustomColor() {
        return !!this.custom;
    }
    getColorGradient() {
        return this.custom ?? [[0, [0, 0, 255, 255]], [10, [255, 0, 0, 255]]];
    }
    async setCustomColor(g: [number, number[]][]) {
        this.custom = g;
        (window as any).__colorLog = [...((window as any).__colorLog ?? []), `${this.ident}:${g.length}`];
    }
    async removeCustomColor() {
        this.custom = null;
        (window as any).__colorLog = [...((window as any).__colorLog ?? []), `${this.ident}:removed`];
    }
}
const colors: Record<string, Color> = { waves: new Color('waves'), wind: new Color('wind') };
(window as any).__colors = colors;
export default colors;
