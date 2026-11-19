// Every settings group in one list (UI reimagine, owner 2026-11-13; windy/notes/ui-reimagine-2026-11.md §3.2).
// The Settings tab draws all of them; a gear beside a function shows the same group (or one part of it) in place.
// One form per group (ui/settings/SettingsGroup.svelte picks the component), so the two doors never drift apart.
// Plain data only: no components here, so it can be unit-tested.

export interface Screen {
    /** Section of the pane: route, weather, snapshot (Motion), optimise, settings, help */
    tab: string;
    /** View inside the section */
    seg?: string;
    label: string;
}

export interface SettingsGroupInfo {
    id: string;
    icon: string;
    /** Short name (index chips, chips in a fold-out) */
    short: string;
    title: string;
    hint: string;
    /** Extra words the search box finds this group by */
    words: string;
    /** Pieces a gear can show on their own */
    parts: Record<string, string>;
    /** Screens that have a gear for this group */
    usedIn: Screen[];
}

const S = {
    wp: { tab: 'route', seg: 'waypoints', label: 'Route → Waypoints' },
    speed: { tab: 'route', seg: 'speed', label: 'Route → Speed & fuel' },
    dist: { tab: 'route', seg: 'distances', label: 'Route → Distances' },
    wx: { tab: 'weather', seg: 'route', label: 'Weather → Along route' },
    charts: { tab: 'weather', seg: 'charts', label: 'Weather → Map charts' },
    motion: { tab: 'snapshot', label: 'Motion' },
    plan: { tab: 'optimise', seg: 'speed', label: 'Optimise → Speed & course' },
    track: { tab: 'optimise', seg: 'route', label: 'Optimise → Change the track' },
    about: { tab: 'help', seg: 'about', label: 'Help → About' },
    usage: { tab: 'help', seg: 'usage', label: 'Help → Usage' },
} satisfies Record<string, Screen>;

export const SETTINGS_GROUPS: SettingsGroupInfo[] = [
    {
        id: 'ship',
        icon: 'ship',
        short: 'Ship',
        title: 'Ship particulars',
        hint: 'LBP, breadth, drafts, GM, roll period, pitch',
        words: 'name loa length beam draught draft gm cb block coefficient propeller pitch slip condition ballast laden ship type windage drift leeway profile file clear',
        parts: { particulars: 'Particulars', profile: 'Ship profile file' },
        usedIn: [S.motion, S.speed, S.plan],
    },
    {
        id: 'motion',
        icon: 'motion',
        short: 'Roll & pitch',
        title: 'Roll and pitch estimate',
        hint: 'bilge keels (sections), KG, damping',
        words: 'roll period stopwatch bilge keel kg damping mark roll pitch chart lines bands observed fine-tuning wave period',
        parts: { period: 'Roll period', keels: 'Bilge keels', marks: 'Damping and marks', chart: 'Roll chart', observed: 'Observed rolls' },
        usedIn: [S.motion, S.charts, S.track, S.plan],
    },
    {
        id: 'speed',
        icon: 'ruler',
        short: 'Speed & fuel',
        title: 'Speed, RPM and fuel',
        hint: 'your table, weather loss, currents',
        words: 'rpm speed fuel power kw table barred critical vibration shaft generator weather loss kwon allowance currents consumption',
        parts: { table: 'RPM / speed / fuel table', barred: 'Barred RPM', loss: 'Weather loss and currents' },
        usedIn: [S.speed, S.wp, S.wx, S.plan],
    },
    {
        id: 'limits',
        icon: 'warn',
        short: 'Limits',
        title: 'Weather limits',
        hint: 'alert / limit by sector, IMO warning heights',
        words: 'alert limit amber red sector wind sea swell swh threshold imo parametric synchronous broaching resonance tolerance cold ice icing temperature',
        parts: { thresholds: 'Alert and limit', imo: 'IMO warning heights', ice: 'Cold and ice' },
        usedIn: [S.wx, S.motion, S.plan, S.track],
    },
    {
        id: 'polar',
        icon: 'sparkle',
        short: 'Polar',
        title: 'Polar diagram',
        hint: 'which IMO warnings are shown (on / off switches)',
        words: 'polar diagram sectors parametric synchronous high waves broaching surf pale zones warnings switches',
        parts: {},
        usedIn: [S.motion],
    },
    {
        id: 'map',
        icon: 'map',
        short: 'Map',
        title: 'Map display',
        hint: 'ship symbols, colours, ship window, follow ship',
        words: 'ship symbol positions every weather rings flag colour color track sailed ship window cursor bar range rings isobars pressure follow centre night dim windows closed original size',
        parts: { ships: 'Ship symbols and colours', windows: 'Windows and overlays' },
        usedIn: [S.wp, S.charts],
    },
    {
        id: 'route',
        icon: 'route',
        short: 'Route',
        title: 'Route editing',
        hint: 'new legs, clicking on the course line',
        words: 'rhumb line great circle rl gc legs click course line insert waypoint',
        parts: {},
        usedIn: [S.wp],
    },
    {
        id: 'weather',
        icon: 'weather',
        short: 'Weather',
        title: 'Weather reading',
        hint: 'weather by itself, every 3 h, sea / currents / visibility downloads, Windy map reading, free fill',
        words: 'currents visibility open-meteo free forecast fill missing times past windy plan subscription premium',
        parts: {},
        usedIn: [S.wx],
    },
    {
        id: 'charts',
        icon: 'anchor',
        short: 'Charts',
        title: 'Nautical charts and places',
        hint: 'OpenSeaMap seamarks, depth, ports and canals on the map',
        words: 'openseamap seamarks lights buoys traffic separation depth gebco ports pilot canals straits strength',
        parts: {},
        usedIn: [S.charts, S.dist],
    },
    {
        id: 'wavechart',
        icon: 'layers',
        short: 'Wave chart',
        title: 'Wave chart (your colours)',
        hint: 'SWH / sea / swell colours, white below, steps, lines',
        words: 'wave chart palette colour color white below minimum steps lines equal height swh sea swell legend key',
        parts: {},
        usedIn: [S.charts],
    },
    {
        id: 'optimise',
        icon: 'bolt',
        short: 'Optimiser',
        title: 'Route optimisation',
        hint: 'search width, detail, limits',
        words: 'optimiser optimise search width detail arrival late red limits never enter imo roll mark least fuel',
        parts: {},
        usedIn: [S.track],
    },
    {
        id: 'speedplan',
        icon: 'lifebuoy',
        short: 'Speed & course',
        title: 'Safe speed and course plan',
        hint: 'what to avoid, stops, course alterations, how often the speed changes',
        words: 'safe speed plan avoid keep out stop drift land alter course alteration off track fuel when stopped',
        parts: {},
        usedIn: [S.plan],
    },
    {
        id: 'updates',
        icon: 'refresh',
        short: 'Updates',
        title: 'Updates',
        hint: 'check for a newer version, every 30 days by itself',
        words: 'update version check install reload new',
        parts: {},
        usedIn: [S.about],
    },
    {
        id: 'log',
        icon: 'log',
        short: 'Log',
        title: 'Activity log and usage',
        hint: 'recording on / off',
        words: 'activity log usage statistics record heat map',
        parts: {},
        usedIn: [S.usage],
    },
];

export const groupInfo = (id: string): SettingsGroupInfo | undefined => SETTINGS_GROUPS.find(g => g.id === id);

/** Groups matching what was typed in the search box (every word, anywhere in the title, hint, parts or search words) */
export function searchGroups(text: string): SettingsGroupInfo[] {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return SETTINGS_GROUPS;
    return SETTINGS_GROUPS.filter(g => {
        const hay = `${g.title} ${g.short} ${g.hint} ${g.words} ${Object.values(g.parts).join(' ')}`.toLowerCase();
        return words.every(w => hay.includes(w));
    });
}
