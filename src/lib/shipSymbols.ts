// Ship symbols for the map, seen from above, bow up (the map rotates them to the course).
// The owner chooses one in the Route tab. Each ship type has its own colours; any symbol turns
// red when an IMO MSC.1/Circ.1228 check warns at that position.

export type ShipStyle = 'classic' | 'dot' | 'ring' | 'container' | 'tanker' | 'bulk' | 'lng' | 'cargo' | 'roro' | 'passenger' | 'yacht';

export const SHIP_STYLES: { id: ShipStyle; label: string }[] = [
    { id: 'classic', label: 'Original ship' },
    { id: 'dot', label: 'Dot' },
    { id: 'ring', label: 'Ringed dot (as in your example)' },
    { id: 'container', label: 'Container ship' },
    { id: 'tanker', label: 'Tanker' },
    { id: 'bulk', label: 'Bulk carrier' },
    { id: 'lng', label: 'LNG carrier' },
    { id: 'cargo', label: 'General cargo' },
    { id: 'roro', label: 'Car carrier / Ro-Ro' },
    { id: 'passenger', label: 'Passenger / cruise' },
    { id: 'yacht', label: 'Yacht' },
];

const IMO_RED = '#ff3030';
const NOW_YELLOW = '#ffd400';

/** Screen size (px) of the symbol: normal and the larger one at the slider time. */
export function shipSymbolSize(style: ShipStyle, now = false): number {
    if (style === 'dot' || style === 'ring') return now ? 18 : 12;
    if (style === 'classic') return now ? 28 : 18;
    return now ? 42 : 30;
}

// Hull outlines in a 40 × 40 box, bow at the top.
const HULL_SHIP = 'M20 2 C24 6 26 10 26 14 L26 36 Q26 38 24 38 L16 38 Q14 38 14 36 L14 14 C14 10 16 6 20 2 Z';
const HULL_BOXY = 'M20 2.5 C24 3 26 5 26 9 L26 36.5 Q26 38 24.5 38 L15.5 38 Q14 38 14 36.5 L14 9 C14 5 16 3 20 2.5 Z';
const HULL_YACHT = 'M20 6 C23.5 10 24.5 15 24.5 20 L24.5 31 Q24.5 34 20 34 Q15.5 34 15.5 31 L15.5 20 C15.5 15 16.5 10 20 6 Z';

const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0.4) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="#000" stroke-width="0.4"/>`;
const accommodation = (y: number) => rect(15.5, y, 9, 4.5, '#f4f4f4') + rect(18.5, y + 4.6, 3, 1.6, '#222', 0.3);

/** Deck details and hull colour for each ship type (normal colours). */
function design(style: ShipStyle): { hull: string; path: string; deck: string } {
    switch (style) {
        case 'container': {
            // containers are stowed fore and aft (owner's correction, 2026-11-02): each box long along the ship,
            // narrow across, in rows side by side; 40-ft bays forward of the bridge, a 20-ft bay aft
            const colors = ['#e74c3c', '#f1c40f', '#2ecc71', '#ecf0f1', '#e67e22', '#9b59b6', '#3498db'];
            let deck = '';
            let k = 0;
            const rows = 5;
            const x0 = 15.1;
            const w = (24.9 - x0 - (rows - 1) * 0.25) / rows;
            const bay = (y: number, len: number) => {
                for (let r = 0; r < rows; r++) deck += rect(x0 + r * (w + 0.25), y, w, len, colors[(k++ * 3) % colors.length], 0.15);
            };
            for (const y of [9.2, 15.2, 21.2]) bay(y, 5.6);
            deck += rect(15, 27.6, 10, 3.4, '#f4f4f4');
            bay(31.6, 4.2);
            return { hull: '#2f6fd6', path: HULL_SHIP, deck };
        }
        case 'tanker':
            return {
                hull: '#263238',
                path: HULL_SHIP,
                deck:
                    `<path d="M20 5 C23 8 24.5 11 24.5 14 L24.5 31 L15.5 31 L15.5 14 C15.5 11 17 8 20 5 Z" fill="#5f8a3a" stroke="#000" stroke-width="0.4"/>` +
                    `<line x1="20" y1="7" x2="20" y2="30" stroke="#f0f0f0" stroke-width="1"/>` +
                    `<line x1="15.8" y1="19" x2="24.2" y2="19" stroke="#f0f0f0" stroke-width="1.2"/>` +
                    accommodation(31.2),
            };
        case 'bulk': {
            let deck = '';
            for (let y = 8; y < 30; y += 3.7) deck += rect(15.8, y, 8.4, 2.9, '#5d6d7e', 0.3);
            return { hull: '#c0782e', path: HULL_SHIP, deck: deck + accommodation(31) };
        }
        case 'lng': {
            let deck = '';
            for (const y of [9.5, 16.5, 23.5]) deck += `<circle cx="20" cy="${y}" r="3.6" fill="#f5f5f5" stroke="#000" stroke-width="0.5"/><circle cx="20" cy="${y}" r="1.6" fill="#f39c12"/>`;
            return { hull: '#1f8a70', path: HULL_SHIP, deck: deck + accommodation(30.5) };
        }
        case 'cargo':
            return {
                hull: '#8e44ad',
                path: HULL_SHIP,
                deck:
                    rect(16, 9, 8, 6, '#5d6d7e', 0.3) +
                    rect(16, 18, 8, 6, '#5d6d7e', 0.3) +
                    `<line x1="15" y1="16.5" x2="25" y2="16.5" stroke="#f1c40f" stroke-width="1.2"/><line x1="15" y1="25.5" x2="25" y2="25.5" stroke="#f1c40f" stroke-width="1.2"/>` +
                    accommodation(29.5),
            };
        case 'roro':
            return {
                hull: '#d4a017',
                path: HULL_BOXY,
                deck: rect(15.2, 4.5, 9.6, 3, '#f4f4f4') + rect(15.5, 9, 9, 27, '#f0e2b6', 0.6) + `<line x1="20" y1="10" x2="20" y2="35" stroke="#b08a10" stroke-width="0.6"/>` + rect(18, 31, 4, 2.4, '#222', 0.3),
            };
        case 'passenger':
            return {
                hull: '#2e86de',
                path: HULL_SHIP,
                deck:
                    `<path d="M20 6 C22.8 9 24.5 12 24.5 15 L24.5 35 L15.5 35 L15.5 15 C15.5 12 17.2 9 20 6 Z" fill="#fafafa" stroke="#000" stroke-width="0.4"/>` +
                    rect(18.2, 13, 3.6, 3, '#2e86de', 0.3) +
                    rect(18.2, 24, 3.6, 3, '#2e86de', 0.3) +
                    `<circle cx="20" cy="31" r="1.6" fill="#5dade2" stroke="#000" stroke-width="0.4"/>`,
            };
        case 'yacht':
            return {
                hull: '#fdfdfd',
                path: HULL_YACHT,
                deck:
                    `<path d="M20 13 C21.8 15 22.6 17.5 22.6 20 L22.6 25 L17.4 25 L17.4 20 C17.4 17.5 18.2 15 20 13 Z" fill="#1b3a5c" stroke="#000" stroke-width="0.4"/>` +
                    rect(16.6, 26, 6.8, 6, '#b8864b', 0.8),
            };
        default:
            return { hull: '#ffffff', path: HULL_SHIP, deck: '' };
    }
}

/**
 * SVG of the ship symbol, bow up. `imo` paints it red (IMO warning); `now` marks the ship at
 * Windy's slider time (yellow).
 */
export function shipSymbolSvg(style: ShipStyle, size: number, imo = false, now = false): string {
    const open = (vb: string) => `<svg width="${size}" height="${size}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">`;
    if (style === 'classic') {
        const color = imo ? IMO_RED : now ? NOW_YELLOW : '#ffffff';
        return (
            open('0 0 20 20') +
            `<path d="M10 1 L14 7 L14 18 Q10 19.5 6 18 L6 7 Z" fill="${color}" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/>` +
            `<line x1="10" y1="5" x2="10" y2="12" stroke="#000" stroke-width="1"/></svg>`
        );
    }
    if (style === 'dot') {
        const color = imo ? IMO_RED : now ? NOW_YELLOW : '#ffffff';
        return open('0 0 20 20') + `<circle cx="10" cy="10" r="7.5" fill="${color}" stroke="#000" stroke-width="2"/></svg>`;
    }
    if (style === 'ring') {
        const ring = imo ? IMO_RED : now ? NOW_YELLOW : '#1450e0';
        return open('0 0 20 20') + `<circle cx="10" cy="10" r="7.5" fill="#ffffff" stroke="${ring}" stroke-width="3.5"/><circle cx="10" cy="10" r="9.3" fill="none" stroke="#000" stroke-width="0.8"/></svg>`;
    }
    const d = design(style);
    const glow = now ? `<path d="${d.path}" fill="none" stroke="${NOW_YELLOW}" stroke-width="4" stroke-linejoin="round"/>` : '';
    const warn = imo ? `<path d="${d.path}" fill="${IMO_RED}" fill-opacity="0.78" stroke="${IMO_RED}" stroke-width="2.2" stroke-linejoin="round"/>` : '';
    return (
        open('0 0 40 40') +
        glow +
        `<path d="${d.path}" fill="${d.hull}" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/>` +
        d.deck +
        warn +
        `</svg>`
    );
}
