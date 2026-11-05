// What changed in each version, shown after an update ("What's new") and in the Info tab.
// Newest first. Add an entry with every release.

export interface ReleaseNote {
    version: string;
    /** UTC date of the release */
    date: string;
    notes: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
    {
        version: '0.24.1',
        date: '2026-11-04',
        notes: [
            "For Windy's review: a screenshot for Windy's plugin list and a link to the plugin's public code. Nothing else changed.",
        ],
    },
    {
        version: '0.24.0',
        date: '2026-11-02',
        notes: [
            'Galenea is now offered as a public plugin: once Windy has reviewed and approved it, every Windy user can find it in Windy\'s plugin list, also in the Windy app on phones. Free, as before.',
        ],
    },
    {
        version: '0.23.4',
        date: '2026-11-02',
        notes: [
            'Phones (Windy app or phone browser): every section fits the screen; bigger buttons and boxes; boxes no longer make the phone zoom in. Windy shows plugins full screen on a phone, so the ship window is not shown there (Motion has the same diagram) and the graph window opens full screen from the graph button, with a close button.',
            'Motion: buttons to step the map time (◀ 3 h, 3 h ▶, Now, ETD), so you can look along the voyage without Windy\'s time slider (needed on a phone, handy on a computer).',
            'Graph window: the scales now follow the window size (after resizing or maximising, the lines and numbers could be drawn for the old size).',
        ],
    },
    {
        version: '0.23.3',
        date: '2026-11-02',
        notes: [
            'Fix: the panel did not scroll in 0.23.2, so a long "What\'s new" could not be closed. The panel scrolls again; "What\'s new" has an "OK, close" button at the top and its own small scroll bar; Help opens in place of the section.',
        ],
    },
    {
        version: '0.23.2',
        date: '2026-11-02',
        notes: [
            'Fix: 0.23.1 did not open in Windy. Ports, canals and distance lines are now drawn with the same map building blocks as the route (which always worked), and each part of the plugin starts on its own, so one failing feature can no longer stop the panel opening (it is noted in the activity log instead). Canals on the map are now off until you switch them on.',
        ],
    },
    {
        version: '0.23.1',
        date: '2026-11-02',
        notes: [
            'Check for updates now looks much further ahead, so a newer version is found even when some version numbers were skipped (0.17.0 could not see 0.23.0).',
        ],
    },
    {
        version: '0.23.0',
        date: '2026-11-02',
        notes: [
            'New name: Galenea – Made for seafarers, by a seafarer. Heavy weather and ship motion first, fuel second. Includes everything built since 0.17.0: roll period stopwatch and optional observed-roll log (0.18), roll chart on the map (0.19–0.20), pitch chart and optimiser keeping out of roll above your mark (0.21), roll estimate correction and clinometer height (0.22).',
            'New look: 5 sections (Route, Weather, Motion, Optimise, Settings) instead of 9 tabs; the explanations sit behind ⓘ buttons; cards, clear main buttons, icons; Help (ⓘ at the top): guide with search, usage, feedback, updates; Settings has an index of its groups; "Dim" for night use (Settings → Map display).',
            'Past weather: every forecast fetched is kept in this browser, so earlier times along the voyage stay visible (marked E: the forecast as it was then, not observations).',
            'No Windy subscription? Windy\'s sample days are left out, and the free Open-Meteo forecast fills the times Windy does not cover (marked OM; up to about 15–16 days ahead and 92 days back). Switch: Settings → Weather reading.',
            'Nautical charts: OpenSeaMap seamarks (lights, buoys, traffic separation, pilot boarding where mapped) over the map; not official charts. Weather → On the map → Seamarks, or Settings → Nautical charts and places.',
            'Distances (Route → Distances): port to port by great circle, rhumb line and along the shipping lanes, with the canals and straits passed; ports, canals and straits along your route with distance to go and ETA; ports and canals on the map. Approximate, not for navigation.',
            'Container ship symbol: containers fore and aft. Faster: roll estimates about 1.8 × quicker, forecasts kept for 3 hours, more fetched at once.',
        ],
    },
    {
        version: '0.22.0',
        date: '2026-11-02',
        notes: [
            'Roll estimate corrected after an independent review: waves from the bow or quarter (not exactly on the beam) were worked out wrongly in part of the calculation; now checked against an exact calculation at every angle. Quartering and bow-sea roll figures change (some up, some down).',
            'Observed rolls: enter the height of your clinometer above the waterline: a pendulum clinometer high up shows more roll than there is (e.g. about 1.35 × at 25 m with a 17 s roll); the comparison and fine-tuning allow for it. New choice "gyro / motion sensor".',
            'Pitch: for waves shorter than about 1.2 ship lengths the pitch estimate is probably too low (a limit of the simple method); said so on screen.',
        ],
    },
    {
        version: '0.21.0',
        date: '2026-11-01',
        notes: [
            "Roll chart: with \"only the roll on the map\", the sea (wind waves) is read from Windy's own wind-wave layer for the chart time, instead of being worked out from SWH and the swells; the key says which.",
            '🔵 Pitch chart: Weather tab → Pitch lines for this view: lines of equal pitch at 1°, 2°, 3°… in blues, your pitch mark as a thick dashed line; same heading choices and options as the roll chart.',
            'Route optimisation: with a roll mark set, the optimiser checks the roll on the route it found, leaves out the places above your mark and searches again (up to 3 times); the notes say how it went. Switch: ⚙ Settings → Route optimisation.',
        ],
    },
    {
        version: '0.20.0',
        date: '2026-11-01',
        notes: [
            'Roll chart: filled bands between the roll lines, light red to dark red.',
            "Roll chart: \"Only the roll on the map\": Windy's colours, particles and pressure lines are switched off while the chart is shown and put back when you hide it or close the plugin. If you pick another Windy layer meanwhile, it steps aside.",
            'Roll chart: choose the heading assumed: the planned course (default), the worst heading (the most roll at any course: pale = small roll whatever you steer), or a course you choose. ⚙ Settings → Roll and pitch.',
        ],
    },
    {
        version: '0.19.0',
        date: '2026-11-01',
        notes: [
            '🔴 Roll chart (Weather tab → Roll lines for this view): lines of equal roll at 2°, 4°, 6°, 8°, 10°, 12° and 15°, light red to dark red, over the map you see, for Windy\'s slider time; your roll mark as a thick dashed line; a key on the map. The ship is assumed on the planned course of the nearest leg at its planned speed. Choose significant roll or likely biggest in 3 h in ⚙ Settings → Roll and pitch.',
        ],
    },
    {
        version: '0.18.0',
        date: '2026-11-01',
        notes: [
            'Roll estimate groundwork: the roll period (the number that matters most) now has its own box in ⚙ Settings → Roll and pitch, with how to measure it, the date it was entered, and a stopwatch (count 10 full rolls).',
            'Optional: log the rolls you actually see (ship window → 📝 Log roll; the forecast of that moment is kept with it). After 5 or more, the plugin can work out two small corrections (roll damping and roll period) so its estimate matches your ship. Used only if you switch them on: the plugin\'s own estimate stays the main figure.',
            'Stopwatch in the ship window (📝 Log roll → ⏱ Time the roll): Start / Stop at the computer, enter the rolls counted; the roll period is kept with heading, speed and UTC time and also helps the fine-tuning.',
            'Setting for how the forecast wave periods are read (mean period by default).',
        ],
    },
    {
        version: '0.17.0',
        date: '2026-10-30',
        notes: [
            'The same wave names everywhere: SWH, Sea, Swell 1, Swell 2, each with its period, in the weather table, Excel, graphs, ship window, polar diagram, limits and warnings.',
            'Encounter period (Te) for SWH, Sea, Swell 1 and Swell 2 at the planned heading and speed: weather table, Excel, graphs, ship window and the Polar tab (at the heading and speed you try).',
            'Polar diagram and map symbols show all four waves (SWH, Sea, Swell 1, Swell 2) and the wind barb; longer flags with height and period; a colour of your choice for each of the four (⚙ Settings → Map display).',
            'Ship window: drag its right edge, bottom edge or corner to resize it; the diagram grows with it, the rest scrolls. Size and place are remembered.',
            "Polar tab: the key under the diagram was hidden by one of Windy's own styles; it is a readable table now.",
        ],
    },
    {
        version: '0.16.1',
        date: '2026-10-30',
        notes: [
            "Updating from inside the plugin: the Install button works only once, and after installing it offers to reload Windy so the new version starts cleanly (installing over the open plugin had jumbled Windy's side panel until a reload).",
            'If an older copy of the plugin is still running in the page, a red note says so with a Reload button.',
            'Activity log records much more: every button pressed and setting changed in the plugin, Windy panes and layers opening / changing, the tab being hidden, window and panel sizes, and errors.',
        ],
    },
    {
        version: '0.16.0',
        date: '2026-10-30',
        notes: [
            "New name: Ship Master's Voyage Planner (by Capt. Node Central). The install link stays the same.",
            '🛟 Safe speed plan (⚡ Optimise tab → Speed only): keeps your track and avoids the weather you choose (waves, swell, wind, IMO warnings, cold, roll / pitch) by slowing down, speeding up or stopping and drifting in open water, with the reason for each change. One click puts it into your route (a copy of the old route goes to Compare).',
            'Barred RPM ranges (critical range, shaft generator / boiler cut-in and cut-out…) in ⚙ Settings → Speed, RPM and fuel: never suggested, and marked ⛔ in the Speed tab.',
            'Graph window: on / off switches in the list boxes, one per graph, and one per value in each legend to hide it for a moment.',
            "The Speed tab's own speed graph is gone (the graph window does it).",
        ],
    },
    {
        version: '0.15.0',
        date: '2026-10-29',
        notes: [
            '🕒 Now button (top of the plugin, ship window and graph window): sets the map and the plugin to the present time (computer clock, UTC) with the ship in the middle.',
            '📈 Graph window at the bottom of the map: up to 3 graphs, each with its own list box (speeds, RPM, slip, engine power, fuel, wind, sea, swells, SWH, wave power, current along the track +/−, roll, pitch, temperatures, icing, pressure, visibility). Drag the top or right edge to resize, the title bar to move; minimise, maximise, close. Hover to read values, click to set the map time.',
            'Engine power (kW) column in ⚙ Settings → Speed, RPM and fuel (optional; used in the graphs).',
            'Cold and ice: air and sea temperature alerts / limits and a spray-icing warning (light / moderate / heavy / extreme) in ⚙ Settings → Weather limits, an icing column in the weather table and in the ship window. Windy has no sea-ice data: use the official ice services for ice.',
        ],
    },
    {
        version: '0.14.0',
        date: '2026-10-28',
        notes: [
            "Sea, swell 1 and swell 2 now all come from Windy: the sea is Windy's wind-wave layer (height, direction and period), read along the route after the forecast (button: Weather tab → Read sea).",
            'The IMO checks and the polar diagram use sea, swell 1 and swell 2 (no more double SWH / swell sectors); the sea gets its own sectors.',
            'Weather table: the sea has its period; values still worked out from SWH are in grey italics until the sea is read.',
        ],
    },
    {
        version: '0.13.0',
        date: '2026-10-28',
        notes: [
            'Check for updates: button in ⚙ Settings → Updates, and an automatic check every 30 days; a note appears when a newer version is out, with one-click install where Windy allows it.',
            'Reading currents / visibility pauses safely while the Windy tab is hidden or minimised and carries on by itself when you come back (browsers stop drawing hidden pages).',
            'Polar diagram keeps the same size all the time.',
            'Yellow heading / speed arrow redrawn as one clean shape; its tip sits exactly on your speed, and the heading and speed are written under the diagram.',
            'Ship symbols on the map show all three wave systems, as in the diagram: swell 1, swell 2, sea (and the wind barb outside).',
        ],
    },
    {
        version: '0.12.1',
        date: '2026-10-28',
        notes: [
            'Polar diagram: one colour per warning, stripes where two apply, smooth edges, only real warnings by default; switches in ⚙ Settings → Polar diagram.',
            'Wave lines smooth and round, a switch per wave type, and a legend on the map.',
        ],
    },
    { version: '0.12.0', date: '2026-10-28', notes: ['Wave chart in your own colours (white below your minimum, 0.5 / 1 m steps) with lines of equal height.'] },
    { version: '0.11.1', date: '2026-10-28', notes: ['After a position update the track goes on from your position.', 'Optimiser "composite" keeps your own RL / GC choice per leg.'] },
    { version: '0.11.0', date: '2026-10-27', notes: ['Route optimisation for least fuel within your limits (GC, RL, composite).', 'Roll and pitch estimate with bilge keel sections.', 'Activity log and Usage tab.'] },
];

/** -1 / 0 / 1 for semantic versions "a.b.c" */
export function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(n => parseInt(n, 10) || 0);
    const pb = b.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
    return 0;
}

/** Versions to try after `v` when looking for a newer one: the next patch, minor and major numbers */
export function nextCandidates(v: string): string[] {
    const [a, b, c] = v.split('.').map(n => parseInt(n, 10) || 0);
    // Wide on purpose (owner's report 2026-11-02: 0.17.0 never found 0.23.0 because 0.18–0.22 were not published):
    // the next 3 patch numbers, the next 12 minor numbers (x.y.0 and x.y.1) and the next major.
    const out = [1, 2, 3].map(d => `${a}.${b}.${c + d}`);
    for (let d = 1; d <= 12; d++) out.push(`${a}.${b + d}.0`, `${a}.${b + d}.1`);
    out.push(`${a + 1}.0.0`, `${a + 1}.1.0`);
    return out;
}

/** Notes of the versions after `from` up to and including `to` (newest first) */
export function notesBetween(from: string | null, to: string): ReleaseNote[] {
    return RELEASE_NOTES.filter(n => compareVersions(n.version, to) <= 0 && (from == null || compareVersions(n.version, from) > 0));
}
