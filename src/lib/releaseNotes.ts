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
        version: '0.33.0',
        date: '2026-11-24',
        notes: [
            'Graphs: speed axes now have a line for every knot (labels every knot where there is room), instead of every 5 kn.',
            'New version out? A green "Update" button now appears in the header next to the ⓘ: one click installs it (where Windy allows; otherwise the steps are shown). The plugin now looks for a new version once a day instead of every 30 days.',
            '"What\'s new" after an update now lists every version since the one you last opened, each with its number and date.',
        ],
    },
    {
        version: '0.32.0',
        date: '2026-11-24',
        notes: [
            'A fixed ETA (ETD + ETA, or a 📌 time at a waypoint) is now kept the way ships are run: one steady speed in calm water, so one RPM, for each leg, worked out so the ship still arrives on time. The speed over ground now rises and falls with the weather and current. Before, the plugin held the speed over ground steady and changed the RPM every half hour, which no one does at sea (your report). The planned speeds of the legs keep their proportions (e.g. slower in port areas).',
        ],
    },
    {
        version: '0.31.0',
        date: '2026-11-24',
        notes: [
            'Speeds corrected (your report: SOG was the same as SiCW and the weather loss was 0). The weather loss is now worked out from the forecast wind and waves by default (Kwon method, a rough estimate for a typical hull; Settings → Speed, RPM and fuel → Weather loss, where you can still type your own allowance per leg). It needs LBP, breadth and drafts in Ship particulars, and says so if they are missing.',
            'Ocean currents are now in the speed over ground and the ETA by default: they come with the downloaded forecast (Open-Meteo marine, about 8 days ahead), so nothing needs pressing. Before, only currents read from Windy\'s map were used, and that reading is off by default. Windy\'s map values still take over where they are read. Model currents can be wrong near coasts and in tidal streams: check them against the log and GPS.',
            'With a present position entered, the part of the leg already sailed was missing from the time under way: it showed as "stops" in Compare and made the average SOG too high. Fixed. Compare and the route optimisation now use the same weather loss and currents as the Route tab.',
            'Slip: where it cannot be worked out, the graph and Compare now say "needs the propeller pitch (Ship particulars)" instead of a bare "—".',
        ],
    },
    {
        version: '0.30.0',
        date: '2026-11-24',
        notes: [
            'All eleven designs for the weather on the ship symbols can now be chosen (Settings → Map display → "Drawn as"): 1 one ring (default), 0 the rings used before 0.29, 2 flags side by side, 3 wave rose, 4 data card beside the ship, 5 biggest wave big, 6 wave fronts, 7 station plot, 8 bars, 9 quiet (numbers when you point at the ship), 10 darts. The card and bar designs need more room, so fewer ships carry weather on the map.',
        ],
    },
    {
        version: '0.29.0',
        date: '2026-11-23',
        notes: [
            'New weather symbol on the ship ("one ring", your choice from the 10 designs): one thin ring round the ship, a short coloured arrow head for SWH, sea, swell 1 and swell 2 pointing in from where each comes, height / period in a small box outside the ring (always the right way up), and the wind barb fixed to the ship inside the ring. About half the size, no stray arrow. The old rings are still a choice: Settings → Map display → "Drawn as".',
            'Long voyages: beyond the end of the forecast (about 10–15 days) the weather table and the ETA now use the usual weather of that month (climate averages from ERA5, ECMWF / Copernicus, 2006–2025, 2° squares) instead of a calm sea. Those rows are grey and marked C, show the chance of a gale and of seas over 4 / 6 m, and never raise a warning: they are an average of past years, not a forecast. Downloaded once, kept in the browser. Switch: Settings → Weather reading.',
            'Undo and redo for the route: Ctrl+Z (⌘Z on a Mac) takes back the last change (a waypoint dragged on the map, added, deleted, a speed, a time…) as many times as you like; Ctrl+Y (⌘⇧Z) puts it back. A whole drag is one step. Also Undo / Redo buttons in Route → Waypoints.',
            'Min and max RPM (Settings → Speed, RPM and fuel), and "auxiliary blower cut-in / cut-out" among the barred RPM reasons (add as many barred ranges as you need). The plugin never advises an RPM in a barred range or outside the min / max: Speed & fuel shows the RPM advised instead (⛔ / ▲ / ▼ → RPM) and says why, e.g. "63 RPM is inside the barred range 60–65 (auxiliary blower): run at 66 RPM, a little faster, or 59 RPM, a little slower" or "above your max RPM: run at the max, the ETA will be later". The safe speed and course plan and the route optimisation keep to them too.',
            'Weather for an area: bigger boxes, up to about 110° × 110° (a whole ocean): the grid gets coarser (up to 6° apart, at most 400 points) and the time to download is shown.',
        ],
    },
    {
        version: '0.28.0',
        date: '2026-11-22',
        notes: [
            'Sea areas and limits on the map (Settings → Nautical charts and places): emission control areas for sulphur (SECA, 0.10 % fuel) and NOx (Tier III), including the Canadian Arctic and Norwegian Sea ECAs and the adopted North-East Atlantic ECA (in force 1 Sep 2027, 0.10 % sulphur from 1 Sep 2028); MARPOL special areas by annex (I oil, II noxious liquids, IV sewage, V garbage); lines at 3, 50 and 200 nm from land, the 12 nm territorial sea, 24 nm contiguous zone and EEZ limits; ballast water exchange distances. Point at an area\'s name on the map for its rule and source. Drawn from the official IMO texts; the distance lines are approximate. Downloaded once, then kept in the browser (also with no internet). Planning aid only: check the current rules and official charts.',
            'Roll and pitch no longer go missing in stretches of the graph: where Windy\'s wave forecast failed for a point, it is asked for again by itself, and meanwhile the waves come from the next forecast point (within 100 nm) or the free Open-Meteo wave forecast. The line under the graph no longer says "no wave data" when only the first point (e.g. a berth) has none.',
            'Ports on the map: the button in Route → Distances now shows and hides the ports and canals; port names sit beside their dots on a dark label, and names or dots that would fall on top of each other are left out until you zoom in.',
        ],
    },
    {
        version: '0.27.0',
        date: '2026-11-22',
        notes: [
            'Weather after a route change at once: move or add a waypoint, change a speed, and the weather table, graphs and polar show the new route straight away from the forecast already downloaded. Only a new part of the route more than 25 nm from any downloaded forecast is fetched, by itself. Nothing is downloaded again unless you press "Get latest forecast" or Windy has a newer forecast run (checked every hour).',
        ],
    },
    {
        version: '0.26.0',
        date: '2026-11-13',
        notes: [
            'Safe speed and course plan (Optimise → Speed & course): besides slowing down, speeding up and stopping, the plan can now alter course for a while (20°, 40° or 60° to port or starboard, for 3 to 12 hours) and then come back to the track, where that keeps the ship out of the weather you chose to avoid (e.g. a beam sea taken on the bow instead). Each part says the course to steer and why. Switch, largest alteration and furthest distance off the track: Settings → Safe speed and course plan.',
            'Port weather (Weather → Port weather): click any place on the map, or type a port name, for the weather there every hour for 7 days: wind and gusts with arrows, SWH, sea, swell 1 and swell 2 (height, period, arrow), wave power, air temperature and feels like, sea temperature, current with an arrow, rain, weather in words (cloudy, rain, windy…), the tide with high and low water, sunrise / sunset and moonrise / moonset. Name and lat / lon shown. Save it as a PDF.',
            'Tides (Weather → Tides): for any place, a tide graph, the high and low waters with times and heights, and the height every hour; PDF too. The tide is a model sea level (Open-Meteo marine, Météo-France) above mean sea level, not chart datum: a guide, not the official tide tables.',
            'New look: a small gear beside each function opens its settings right there (the Settings tab still has them all, now with a search box and "Used in" links). A voyage strip under the title shows the next step, the worst weather ahead and how old the forecast is. Weather has four views: Along route, Port weather, Tides and Map charts (the wave, roll and nautical charts, was "On the map"). "Polar settings", "Optimisation settings" and "Change" are now gears; the Voyage card is under the waypoints.',
            'Map: while a click does something (add waypoints, pick a place) a note shows at the top of the map; Esc stops it. Right-click on open water: Port weather here, Tides here, Add waypoint here.',
            'Weather by itself: change a waypoint and the weather follows in a couple of seconds (only the changed legs are downloaded again); it is also fetched again every 3 hours while the plugin is open. Sea, currents and visibility now come downloaded with the forecast (Open-Meteo, free), so changing tab or minimising the browser no longer stops it. Reading Windy\'s own map is still there as an extra (Settings → Weather reading), and its values are used when read.',
            'Weather for an area (Weather → Along route): type the north and south latitude and the west and east longitude (or take the map view or the route), press Get weather: the forecast over the whole box, drawn on the map, fetched again every 3 hours. Try different tracks inside it without waiting for downloads.',
            'Phones: a Back button at the top of every full-screen window (graphs, full-size tables, Help, settings), nothing hidden under the phone\'s clock and battery bar, the section buttons stay at the top while you scroll, everything fits narrow phones (320 px), touching a graph reads it, and a phone held sideways keeps the phone layout.',
            'Every floating window (ship window, graphs, weather bar under the cursor, wave / roll / nautical chart keys, full-size tables) can be moved by its title bar, resized by its edges or corner, minimised (–), put back to its original size and place (↺) and closed (✕). Settings → Map display: show closed windows again, or put all windows back to their original size.',
        ],
    },
    {
        version: '0.25.0',
        date: '2026-11-07',
        notes: [
            'Weather under the cursor: a bar at the top of the map shows the weather where the mouse rests, at the map time: position, wind and gust (Beaufort), SWH, sea, swell 1 and swell 2 with periods and directions, wave power, rain / thunder / fog, visibility and current (when Windy shows that layer), pressure, air and sea temperature, humidity. Minimise or close it; Settings → Map display.',
            'Range rings: three rings around the ship at the map time; their spacing follows the map scale (e.g. 10 / 20 / 30 nm up to 200 / 400 / 600 nm). Settings → Map display.',
            'Live polar (Motion → Live (GPS)): the position from the phone\'s or computer\'s GPS, the forecast there now, your heading and speed (GPS or typed in): IMO warnings, roll and pitch live as the ship moves.',
        ],
    },
    {
        version: '0.24.2',
        date: '2026-11-07',
        notes: [
            "A new picture for Windy's plugin list, taken in real Windy. Nothing else changed.",
        ],
    },
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
    }
    // 0.22.0 and older: RELEASE-HISTORY.md (kept out of the plugin to stay under Windy's upload size limit, 2026-11-23)
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
