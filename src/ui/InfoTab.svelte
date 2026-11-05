<!-- Short explanations for mariners: weather models, which to use, data age, words used. -->
<script lang="ts">
    import { RELEASE_NOTES } from '../lib/releaseNotes';
    let q = '';
    let box: HTMLDivElement;
    // filter the chapters by the search words (open the ones that match)
    $: if (box) {
        const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
        for (const d of Array.from(box.querySelectorAll('details.gd')) as HTMLDetailsElement[]) {
            const t = (d.textContent ?? '').toLowerCase();
            const hit = words.every(w => t.includes(w));
            d.style.display = hit ? '' : 'none';
            if (words.length) d.open = hit;
        }
    }
</script>
<div class="gd-top">
    <div class="g-status g-status--warn">Planning aid only. "No warning" does not mean safe. The master decides.</div>
    <input class="gd-search" type="search" placeholder="Search the guide" bind:value={q} aria-label="Search the guide" />
</div>
<div bind:this={box}>


<details class="gd"><summary>Weather models (Windy's model menu: ECMWF, GFS, ICON …)</summary><div class="gd__b"><p class="pp-note">A weather model is a computer forecast made by a national weather service. Windy shows several; they can disagree. Grid sizes are those Windy shows in its menu; forecast ranges are approximate (checked 2026-10-26) and can change.</p>
<table class="tbl">
    <tr><th>Model</th><th>Who</th><th>Covers</th><th>Grid</th><th>Range</th><th>Use</th></tr>
    <tr class="use"><td><b>ECMWF</b></td><td>European Centre (ECMWF)</td><td>Whole world</td><td>9 km</td><td>~10 days</td><td><b>Best general choice for ocean passages.</b> This plugin always uses it.</td></tr>
    <tr><td><b>GFS</b></td><td>US weather service (NOAA)</td><td>Whole world</td><td>22 km</td><td>~16 days</td><td>Second opinion; the only one past 10 days (trends only).</td></tr>
    <tr><td><b>ICON</b></td><td>German weather service (DWD)</td><td>Whole world</td><td>13 km</td><td>~7 days</td><td>Another good cross-check.</td></tr>
    <tr><td><b>AROME, ICON-EU, UKV …</b></td><td>National services</td><td>One region only</td><td>1–7 km</td><td>~1–3 days</td><td>Near the coast and port approaches: local winds, sea breezes, squalls.</td></tr>
    <tr><td><b>ECMWF-WAM</b></td><td>European Centre</td><td>Oceans</td><td></td><td>~10 days</td><td>Waves and swell. This plugin uses it.</td></tr>
    <tr><td><b>CMEMS</b></td><td>Copernicus Marine (EU)</td><td>Oceans</td><td></td><td>a few days</td><td>Windy's currents layer, read by "Read currents".</td></tr>
</table></div></details>
<details class="gd"><summary>Which one should a mariner use?</summary><div class="gd__b"><ul>
    <li><b>Ocean passage: ECMWF.</b> Then look at <b>GFS</b> for the same days: if they agree, more confidence; if they disagree a lot, the forecast is uncertain: keep bigger margins.</li>
    <li><b>Near the coast within 2 days:</b> also look at the regional model (e.g. AROME) for local effects.</li>
    <li><b>More than about 5 days ahead:</b> use it for trends (a low coming, a gale on day 6), not exact values.</li>
    <li>Windy's model menu only changes <b>Windy's map colours</b>. The plugin's numbers are always ECMWF / ECMWF-WAM; the Weather tab warns when the map shows another model.</li>
</ul></div></details>
<details class="gd"><summary>How old is the weather?</summary><div class="gd__b"><ul>
    <li>Models run a few times a day. The Weather tab and the ship window show <b>"Weather data: ECMWF run … UTC"</b> (when the model ran) and <b>when it was fetched</b>.</li>
    <li>Press <b>Get latest forecast</b> (Weather tab) to fetch again. After a position update the plugin does this by itself.</li>
</ul></div></details>
<details class="gd"><summary>Wave energy (wave power, kW/m)</summary><div class="gd__b"><ul>
    <li><b>What it is:</b> the energy the waves carry, per metre of wave front, in kilowatts per metre. It grows with the
        <b>square of the wave height</b> and with the <b>wave period</b>: double the height = about 4 times the energy;
        same height but longer period = more energy. Rough rule (deep water): power ≈ 0.49 × SWH² × period.
        Example: SWH 4 m, 10 s ≈ 78 kW/m; SWH 4 m, 6 s ≈ 47 kW/m.</li>
    <li><b>Why it is useful:</b> two seas with the same wave height can feel very different. Long, powerful swell hits
        harder: more slamming and green water, more stress on hull and container lashings, more speed lost, bigger
        ship motions. Wave power shows <b>how heavy the sea really is</b> better than height alone.</li>
    <li><b>How to use it:</b>
        <ul>
            <li>Look along the route (Weather tab, "Power" column) for where it <b>jumps up</b> (purple / dark colours): that
                is where the passage will be hardest.</li>
            <li>Compare routes and departure times: lower power on the way usually means less speed loss and less
                stress.</li>
            <li>With high power, think about speed, heading to the waves (head and bow seas are worst for slamming;
                beam and quarter for rolling: see the Polar tab), or waiting it out.</li>
            <li>Colour bands (under 10, 10–30, 30–60, 60–100, over 100 kW/m) are the plugin's own, <b>not official
                limits</b>. Note the values when your own ship starts to labour: that is your best limit.</li>
        </ul>
    </li>
    <li>Value from Windy's wave model (ECMWF-WAM) when it sends it; otherwise worked out from SWH and period (marked *).</li>
</ul></div></details>
<details class="gd"><summary>Reading the polar diagram (danger sectors)</summary><div class="gd__b"><ul>
    <li>Rings = ship speed (5–25 kn), spokes = heading, north up. The <b>yellow arrow</b> is your heading and speed.</li>
    <li>Coloured sectors = headings / speeds where the IMO MSC.1/Circ.1228 checks warn with the waves now, <b>one colour
        per warning</b>: <span style="color:#ff6b66">parametric roll red</span>, <span style="color:#d17be6">synchronous roll
        purple</span>, <span style="color:#4fd07a">successive high waves green</span>, <span style="color:#8c9bff">surf-riding /
        broaching indigo</span> (the same colours as the warnings in the weather table). <b>Striped</b> = two at the same
        heading and speed. The darker middle of a band is closer to the exact condition.</li>
    <li>Flags outside the circle: <b>SWH, Sea, Swell 1 and Swell 2</b> (your colours, ⚙ Settings → Map display), each
        pointing in from where it comes, with height and period written in it. Wind barb and current inside the circle.
        The sectors come from Sea, Swell 1 and Swell 2 (SWH stands in for Sea until the sea is read): SWH is sea and swell
        together, so it is shown for reference.</li>
    <li>The key under the diagram (Polar tab) gives each wave's height, period, direction and <b>encounter period</b> at the
        heading and speed set there; the ship window lists the same. The legend names the waves causing each warning. Switches for each warning, and pale zones
        "if the waves were higher": ⚙ Settings → Polar diagram.</li>
    <li>If the arrow tip sits in a dark sector, a change of course or speed that moves it out is worth considering.
        Guidance only: it does not replace your ship's stability information.</li>
</ul></div></details>
<details class="gd"><summary>🛟 Safe speed plan (keep the track, change the speed)</summary><div class="gd__b"><ul>
    <li>Avoids the weather <b>you</b> chose (⚙ Settings → Safe speed plan) using your own limits, by slowing down,
        speeding up or stopping and drifting in open water. Speeds from your RPM table only, never a barred RPM.</li>
    <li>It tries every allowed speed (and stop) every few hours along the voyage and keeps, at each time and place,
        the cheapest way of getting there without meeting that weather (dynamic programming; no "AI"). Then it picks:
        arrive by the wanted time with the least fuel, else as early as is safe.</li>
    <li>Each change comes with its reason: what you would meet at your planned speed, when and where.</li>
    <li>Not included: currents, drift while stopped (an estimate is shown), depths, traffic, shelter. Weather: the
        forecast fetched in the Weather tab, which gets less certain further ahead. <b>Decision support only.</b></li>
</ul></div></details>
<details class="gd"><summary>⚡ Route optimisation</summary><div class="gd__b"><ul>
    <li><b>What it does:</b> tries a fan of tracks either side of the great circle between two waypoints, and every RPM step
        from your table on each leg, with the forecast at the time the ship would be there. It keeps the one that
        <b>arrives on time with the least fuel</b> and stays out of your red weather limits (and, if ticked, the IMO
        warnings).</li>
    <li><b>The method:</b> dynamic programming on a grid, a standard and fully explainable method used in weather
        routing; there is <b>no "AI" guessing</b>. The same inputs always give the same answer, and every leg's numbers are shown.</li>
    <li><b>GC, RL and composite</b> (each leg keeps your own RL / GC choice for that part of the route) versions of the optimised track are shown side by side with your own route: distance,
        ETA, fuel, hours inside limits, IMO hours, roll / pitch and highest latitude. "Use" puts one into the route (the
        waypoints before and after the stretch stay); "Compare" sends it to the Compare tab.</li>
    <li><b>Not included:</b> currents, depths, traffic separation schemes, ECAs, piracy areas, ice. Land is checked on a coarse
        world map (Natural Earth, about 6 nm squares). <b>Always check an optimised route on ECDIS.</b></li>
    <li>When the weather is bad everywhere, no route can keep out of the limits: the optimiser then says so and shows the
        least exposed route, which may burn more fuel.</li>
    <li>Settings: ⚙ Settings → Route optimisation.</li>
</ul></div></details>
<details class="gd"><summary>🌊 Wave chart</summary><div class="gd__b"><ul>
    <li>Windy's wave (SWH), wind-sea and swell layers can be shown in <b>your colours</b>: light for low, dark for high,
        <b>white below your minimum</b>, in steps of 0.5 or 1 m (⚙ Settings → Wave chart).</li>
    <li><b>Lines of equal height</b> are drawn by the plugin from ECMWF-WAM forecast points over the map you see, like
        isobars for waves. They are coarser than Windy's colours (one point every 0.5–6°, shown in the settings).</li>
</ul></div></details>
<details class="gd"><summary>🌊 Roll and pitch estimate</summary><div class="gd__b"><ul>
    <li>From the forecast waves (wind sea, swell 1, swell 2), your heading and speed, and your ship (LBP, breadth, draft, GM,
        roll period, bilge keels): each wave system is turned into a wave spectrum and passed through a simple model of how
        the ship rolls and pitches. Shown as <b>significant</b> roll / pitch (to one side) and the <b>likely largest in 3 hours</b>.</li>
    <li><b>Bilge keels</b> add roll damping; enter each section (⚙ Settings → Roll and pitch estimate). Speed also damps roll.</li>
    <li><b>An estimate:</b> roughly ±30–50 % for roll (more near resonance), ±25 % for pitch. Trust the trend along the route
        more than the exact degree. <b>Parametric roll is not predicted</b>: see the IMO warnings.</li>
    <li>Later it can be <b>tuned to your ship</b> from rolls you observe (a planned feature: the plugin would adjust the
        damping to match).</li>
</ul></div></details>
<details class="gd"><summary>Making the roll estimate fit your ship (optional)</summary><div class="gd__b"><ul>
    <li>The plugin works out the roll by itself (above). Two things make it fit <b>your</b> ship better: a
        <b>measured roll period</b> (⚙ Settings → Roll and pitch, with a stopwatch) and, if you like, a log of the rolls
        you actually see (ship window → 📝 Log roll, which also has a stopwatch to time the roll period at sea, kept with
        heading, speed and UTC time; most reliable in beam or bow seas).</li>
    <li>From 5 or more observations it works out two small corrections, roll damping and roll period, by trying
        many combinations and keeping the one closest to what you saw (it ignores a few odd entries). Used only when
        you switch them on; the plugin's own estimate stays the main figure.</li>
    <li>Compare like with like: "biggest roll in the last 10–20 minutes" is about 1.4 × the significant roll, and the
        plugin allows for that. A pendulum clinometer can overshoot; an electronic inclinometer reads truer.</li>
</ul></div></details>
<details class="gd"><summary>🔴 Roll chart</summary><div class="gd__b"><ul>
    <li>The roll estimate worked out at forecast points over the map you see, then joined into lines of equal roll (2°,
        4°, 6°…, light to dark red), like isobars. Your roll mark is the thick dashed line.</li>
    <li>Roll depends on heading and speed. Choose in ⚙ Settings → Roll and pitch: the <b>planned course</b> of the nearest
        leg ("what would I roll here on my plan"), the <b>worst heading</b> ("the most I could roll here, whatever I
        steer": pale = safe at any course) or <b>a course you choose</b>. Speed: the planned speed of the nearest leg.</li>
    <li>Filled bands and "only the roll on the map" (Windy's colours, particles and pressure lines off while shown; put
        back afterwards). With the blank map the sea is read from Windy's wind-wave layer for the chart time.</li>
    <li>🔵 The same for <b>pitch</b> (Weather tab → Pitch lines for this view), in blues.</li>
    <li>The route optimiser can keep out of places where the roll is above your mark: it checks the route it found,
        leaves those places out and searches again (up to 3 times).</li>
    <li>Data: ECMWF-WAM point forecasts (the run is in the key), the sea worked out from SWH and the swells. Parametric
        roll not included. A guide only.</li>
</ul></div></details>
<details class="gd"><summary>Wind drift when stopped</summary><div class="gd__b"><ul>
    <li>Worked out from your ship: wind on the area above water (LOA × windage height) against water on the area
        below (LBP × draft). High-sided ships and ships in ballast drift more. Typical result 2–6 % of the wind
        speed.</li>
    <li>Windage height and Cb have typical values per ship type; enter your own in ⚙ Settings → Ship particulars.</li>
    <li>Not included: wave drift (roughly 0.3–1 % of the wind speed more in a big sea). The current comes from
        Windy's currents layer.</li>
</ul></div></details>
<details class="gd"><summary>🧊 Cold weather, ice and spray icing</summary><div class="gd__b"><ul>
    <li><b>Windy has no sea-ice data</b> (no ice edge, concentration or thickness; Windy's "icing" layer is icing for
        aircraft). For ice use the official ice services: e.g. Canadian Ice Service (St Lawrence, Montreal), the
        Finnish and Swedish ice services (Baltic), and the ice reports in your navigational warnings.</li>
    <li>What the plugin does with Windy's data: <b>air and sea temperature</b> alerts / limits (a sea at or below about
        0 °C may freeze or have ice nearby) and a <b>spray-icing</b> warning worked out from wind, air and sea
        temperature (Overland method used by the US Ocean Prediction Center): light under 0.7 cm/h, moderate 0.7–2,
        heavy 2–4, extreme over 4 cm/h.</li>
    <li>The icing method was made for fishing-vessel sized ships; large ships usually ice less, mostly forward. A
        guide only. Settings: ⚙ Settings → Weather limits → Cold and ice.</li>
</ul></div></details>
<details class="gd"><summary>🕒 Now and 📈 graphs</summary><div class="gd__b"><ul>
    <li><b>🕒 Now</b> sets Windy's time to your computer's present time (UTC) and puts the ship in the middle of the
        map (before departure: the first waypoint; after arrival: the last).</li>
    <li><b>📈 Graphs</b>: time (UTC) along the bottom, values up the side. Values with the same unit share an axis
        (left: first unit, right: second; a third unit's range is written in the legend). Directions are dots.
        Current along the track is + when it helps, − when against. RPM, power, slip and fuel come from your speed
        table; roll and pitch are estimates. Weather values are from the forecast run shown under the graphs.</li>
</ul></div></details>
<details class="gd"><summary>What's new (release notes)</summary><div class="gd__b"><ul>
    {#each RELEASE_NOTES as r}
        <li><b>{r.version}</b> ({r.date}): {r.notes.join(' ')}</li>
    {/each}
</ul>
<p class="pp-note">Updates: ⚙ Settings → Updates (check now, or by itself every 30 days).</p></div></details>
<details class="gd"><summary>Words used in the plugin</summary><div class="gd__b"><table class="tbl words">
    <tr><td><b>SWH</b></td><td>Significant wave height: the whole sea state, sea and swell together.</td></tr>
    <tr><td><b>Sea</b></td><td>Wind sea: waves made by the local wind. From Windy's <b>wind waves</b> layer (height, direction, period), read along the route after the forecast; until then worked out from SWH and the swells, direction from the wind.</td></tr>
    <tr><td><b>Swell 1</b></td><td>The main swell: waves from distant weather (ECMWF-WAM).</td></tr>
    <tr><td><b>Swell 2</b></td><td>A second swell from another direction, if there is one.</td></tr>
    <tr><td><b>Period</b></td><td>Time between wave crests at a fixed point, seconds (from the forecast).</td></tr>
    <tr><td><b>Encounter period (Te)</b></td><td>Time between crests as the moving ship meets them, at its heading and speed through the water (IMO MSC.1/Circ.1228 para 1.6). Shorter in head seas, longer in following seas; ∞ = the waves never pass. Compared with the roll period for the rolling warnings.</td></tr>
    <tr><td><b>From</b></td><td>Wind, SWH, sea and swells: the direction they come from (°T); on the map and in the polar diagram the barb and flags point in from there.</td></tr>
    <tr><td><b>Current</b></td><td>Speed and the direction it sets towards (°T), the usual marine convention.</td></tr>
    <tr><td><b>SiCW</b></td><td>Speed in calm water (what the engine gives in still water).</td></tr>
    <tr><td><b>WxF / CuF</b></td><td>Weather factor (speed lost to weather) and current factor (+ helping, − against).</td></tr>
    <tr><td><b>Wave power</b></td><td>Energy the waves carry, kW per metre of wave front (see above).</td></tr>
    <tr><td><b>SOG</b></td><td>Speed over ground = SiCW + WxF + CuF.</td></tr>
    <tr><td><b>Fixed ETA 📌</b></td><td>A time you fixed at a waypoint: the speeds before it are scaled to arrive then.</td></tr>
    <tr><td><b>UTC</b></td><td>All times in this plugin are UTC.</td></tr>
</table>

<p class="pp-note"><b>Planning aid only.</b> It does not replace ECDIS, official charts or official weather routing. "No warning" does not mean safe.</p></div></details>
<details class="gd"><summary>Past weather and the free forecast (no Windy subscription)</summary><div class="gd__b"><p class="pp-note">Windy's point forecast starts at its latest model run, so earlier times used to vanish. The plugin now <b>keeps every forecast it fetches in this browser</b> (45 days): past times along the voyage show the forecast as it was made then (marked <b>E</b> in the weather table). These are forecasts, not observations.</p>
<p class="pp-note">Windy gives each user what their plan allows. Checked in Windy's plugin files (2026-11-02): without Premium about <b>5 days in 3-hour steps</b> (Windy pads the long view with sample days, which the plugin leaves out); with Premium 1-hour steps and a longer range. Where Windy has nothing (past times not kept here, or days beyond your plan) the plugin fills in from <b>Open-Meteo</b>, a free service (marked <b>OM</b>): ECMWF IFS 0.25° for wind and pressure, GFS Wave 0.25° for sea, swell 1 and swell 2, up to about 15–16 days ahead and up to 92 days back. Data CC BY 4.0. Switch: Settings → Weather reading. Not tested from this build environment (the service was not reachable here): if it does not answer, those rows simply stay empty.</p></div></details>
<details class="gd"><summary>Nautical charts, ports and distances</summary><div class="gd__b"><p class="pp-note"><b>Seamarks</b>: OpenSeaMap tiles over the map (lights, buoys, traffic separation, pilot boarding and anchorages where volunteers have mapped them), from zoom 9. © OpenSeaMap contributors (CC BY-SA), data © OpenStreetMap (ODbL). <b>Not official charts.</b> Depth shading (GEBCO) is experimental.</p>
<p class="pp-note"><b>Distances</b> (Route → Distances): great circle, rhumb line and along the shipping lanes (Eurostat SeaRoute / MARNET network, EUPL-1.2), with the canals and straits passed, and the ports, canals and straits near your route with distance to go and ETA. Ports: open "sea-ports" list (MIT), about 1,600 ports, approximate positions. All approximate, for planning and orientation, not for navigation.</p></div></details>
</div>
<style lang="less">
    .gd-top {
        position: sticky;
        top: 52px;
        z-index: 2;
        background: var(--g-bg-0);
        padding-bottom: 8px;
    }
    .gd-search {
        width: 100%;
    }
    .gd {
        border: 1px solid var(--g-border);
        border-radius: 8px;
        background: var(--g-bg-1);
        margin: 0 0 6px;
        summary {
            padding: 9px 12px;
            font-weight: 650;
            cursor: pointer;
            color: var(--g-text-1);
        }
        &[open] summary {
            border-bottom: 1px solid var(--g-border);
        }
    }
    .gd__b {
        padding: 6px 12px 10px;
    }
    .tbl {
        border-collapse: collapse;
        font-size: 11px;
        width: 100%;
        th,
        td {
            padding: 3px 4px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            text-align: left;
            vertical-align: top;
        }
        th {
            background: #333;
        }
        tr.use td {
            background: rgba(46, 204, 113, 0.15);
        }
    }
    .words td:first-child {
        white-space: nowrap;
        width: 80px;
    }
    ul {
        margin: 4px 0;
        ul {
            margin-top: 2px;
        }
        padding-left: 18px;
        font-size: 12px;
    }
    li {
        margin-bottom: 3px;
    }
</style>
