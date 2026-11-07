// Drives the test page in headless Chromium and saves screenshots. Usage: node harness/run.cjs <outdir>
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'));

const out = process.argv[2] || 'shots';
fs.mkdirSync(out, { recursive: true });
const page_url = 'file://' + path.join(__dirname, 'dist/index.html');
const fixture = path.join(__dirname, '../test/fixtures/made-up-furuno-style.rtz');
const log = [];
const ok = (cond, msg) => { log.push((cond ? 'PASS ' : 'FAIL ') + msg); };
// New navigation (UI overhaul 2026-11-02): 5 sections + sub-views + Help drawer. Old tab names map onto it.
async function go(page, name) {
    const nav = n => page.locator('nav.g-nav button', { hasText: n }).click();
    const seg = n => page.locator('.g-shell > .g-seg button', { hasText: n }).click();
    const closeHelp = async () => { if (await page.locator('.g-drawer').count()) await page.locator('.g-drawer button[aria-label="Close help"]').click(); };
    const help = async n => { if (!(await page.locator('.g-drawer').count())) await page.locator('.g-help-btn').click(); await page.locator('.g-drawer__seg button', { hasText: n }).click(); };
    switch (name) {
        case 'Route': await closeHelp(); await nav('Route'); return seg('Waypoints');
        case 'Speed': await closeHelp(); await nav('Route'); return seg('Speed & fuel');
        case 'Distances': await closeHelp(); await nav('Route'); return seg('Distances');
        case 'Polar': case 'Motion': await closeHelp(); return nav('Motion');
        case 'Compare': await closeHelp(); await nav('Optimise'); return seg('Compare');
        case 'Optimise': await closeHelp(); return nav('Optimise');
        case 'Info': case 'Guide': return help('Guide');
        case 'Usage': return help('Usage');
        case 'Feedback': return help('Feedback');
        default: await closeHelp(); return nav(name);
    }
}


(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    // a "not found" from the stand-in plugin server below is expected (no newer version yet)
    page.on('console', m => m.type() === 'error' && !(m.location().url || '').includes('windy-plugins.com') && errors.push('console: ' + m.text()));
    let dismissDialogs = false;
    page.on('dialog', d => (dismissDialogs ? d.dismiss() : d.accept()));
    // Stand-in for Windy's plugin server: versions in `published` exist, others are not found
    const published = new Set();
    await page.route('https://windy-plugins.com/**', route => {
        const m = route.request().url().match(/\/(\d+\.\d+\.\d+)\/plugin\.json$/);
        if (m && published.has(m[1])) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ version: m[1], builtReadable: '2026-11-02T10:00:00Z' }) });
        return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'not found' });
    });
    // outside services the test computer cannot reach: stand-ins (no data), so nothing fails in the page
    await page.route(/open-meteo\.com/, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
    await page.route(/tiles\.openseamap\.org|wms\.gebco\.net/, route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
    page.on('requestfailed', r => log.push('NOTE request failed: ' + r.url().slice(0, 120)));
    await page.goto(page_url);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/01-empty.png` });
    // Graph window open at the bottom of the map on first use; closed for the map tests, tested later
    ok((await page.locator('.gp').count()) === 1, 'graph window shown at the bottom of the map');
    // the panel must keep Windy's own positioning so it scrolls (owner's report 0.23.2: "its not scrolling")
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.plugin__content')).position === 'absolute'), 'panel keeps Windy\'s positioning (scrolls)');
    ok((await page.locator('.g-head .g-now').count()) === 1 && /Now\s+\d\d:\d\d UTC/.test(await page.locator(".g-head .g-now").innerText()), 'Now button in the header with the present time in UTC');
    await page.locator('.gp__btn[title^="Close"]').click();
    ok((await page.locator('.gp').count()) === 0, 'graph window closes with ✕');

    // Open the made-up route
    await page.setInputFiles('input[type=file]', fixture);
    await page.waitForSelector('text=Opened');
    const rows = await page.locator('.tablewrap tbody tr').count();
    ok(rows === 4, `route opened with ${rows} waypoints`);

    // Settings tab: open one folding group and return it
    const settings = async title => {
        await go(page, 'Settings');
        const d = page.locator('details', { has: page.locator('summary', { hasText: title }) });
        if (!(await d.evaluate(e => e.open))) await d.locator('summary').click();
        return d;
    };

    // ETD
    const etdMs = Math.ceil(Date.now() / 3600e3) * 3600e3;
    const etd = new Date(etdMs).toISOString().slice(0, 16);
    const setEtd = async () => {
        await page.locator('.dtf__value').first().click();
        const pop = page.locator('.dtf__pop');
        ok((await pop.locator('button', { hasText: /^OK$/ }).count()) === 1, 'date/time box has an OK button');
        const hourOpts = await pop.locator('select.dtf-hour option').allInnerTexts();
        ok(hourOpts.length === 24 && hourOpts[23] === '23' && !(await pop.innerText()).match(/AM|PM/), '24-hour clock, no AM/PM');
        await page.screenshot({ path: `${out}/02b-etd-editor.png` });
        const d = new Date(etdMs);
        await pop.locator('select.dtf-year').selectOption(String(d.getUTCFullYear()));
        await pop.locator('select.dtf-mon').selectOption(String(d.getUTCMonth()));
        await pop.locator('select.dtf-day').selectOption(String(d.getUTCDate()));
        await pop.locator('select.dtf-hour').selectOption(String(d.getUTCHours()));
        await pop.locator('select.dtf-min').selectOption(String(d.getUTCMinutes()));
        ok((await pop.locator('.dtf__preview').innerText()).includes(etd.slice(11, 16)), 'editor shows what will be set');
        // the editor opens in place: it must not cover the setting below it
        const popBox = await pop.boundingBox();
        const below = await page.locator('.g-card__title', { hasText: 'Voyage' }).boundingBox();
        ok(popBox && below && (below.y >= popBox.y + popBox.height - 1 || below.x >= popBox.x + popBox.width - 1), 'date editor does not cover other settings');
        await pop.locator('button', { hasText: /^OK$/ }).click();
        await page.waitForTimeout(200);
    };
    await setEtd();
    const etdShown = await page.locator('.dtf__value').first().innerText();
    ok(/\d\d [A-Z][a-z]{2} \d{4} \d\d:\d\d UTC/.test(etdShown), 'ETD shown in 24-hour UTC: ' + etdShown);
    await page.waitForTimeout(300);
    const summary = await page.locator('.summary').innerText();
    ok(/1657\.4 nm/.test(summary), 'summary total 1657.4 nm: ' + summary.replace(/\s+/g, ' '));
    await page.screenshot({ path: `${out}/02-route.png` });
    const labels = await page.locator('.pp-label').allInnerTexts();
    ok(labels.length === 3, 'distance labels on the map: ' + labels.join(' | '));
    const ships = await page.locator('.pp-ship').count();
    ok(ships > 10, `ship symbols on the map: ${ships}`);

    // Drag waypoint 2 and look for the live position readout
    const wp2 = page.locator('.pp-wp', { hasText: /^2$/ });
    const b = await wp2.boundingBox();
    const lat0 = await page.locator('.tablewrap tbody tr').nth(1).locator('input.pos').first().inputValue();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 40, b.y - 30, { steps: 8 });
    await page.waitForTimeout(150);
    const readout = await page.locator('.pp-readout').innerText().catch(() => '');
    ok(/°.*'[NS][\s\S]*°.*'[EW]/.test(readout), 'live position readout while dragging: ' + readout.replace(/\n/g, ' '));
    await page.screenshot({ path: `${out}/03-dragging.png` });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const lat1 = await page.locator('.tablewrap tbody tr').nth(1).locator('input.pos').first().inputValue();
    ok(lat0 !== lat1, `WP2 latitude changed after drag: ${lat0} -> ${lat1}`);
    ok((await page.locator('.pp-readout').count()) === 0, 'readout hidden after drag');

    // Helper: screen point of a lat/lon on the map
    const scr = (lat, lon) => page.evaluate(([la, lo]) => {
        const m = window.__map;
        const p = m.latLngToContainerPoint([la, lo]);
        const r = document.getElementById('map').getBoundingClientRect();
        return { x: p.x + r.left, y: p.y + r.top };
    }, [lat, lon]);
    const rowCount = () => page.locator('.tablewrap tbody tr').count();
    // Midpoint of leg 1-2 on screen (an RL leg is straight on the map)
    const p1 = await page.evaluate(() => { const m = window.__map; const r = document.getElementById('map').getBoundingClientRect();
        const els = Array.from(document.querySelectorAll('.pp-wp')).map(e => e.getBoundingClientRect());
        return els.map(b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })); });
    const mid12 = { x: (p1[0].x + p1[1].x) / 2, y: (p1[0].y + p1[1].y) / 2 };

    // Plain click on a course line inserts a waypoint (found by distance, not by line events)
    await page.mouse.click(mid12.x, mid12.y);
    await page.waitForTimeout(300);
    ok((await rowCount()) === 5, `click on a course line inserted a waypoint (${await rowCount()} rows)`);
    await page.screenshot({ path: `${out}/04-inserted.png` });

    // Right-click on the new waypoint (WP2) -> menu -> Delete waypoint 2
    const wpNew = await page.locator('.pp-wp', { hasText: /^2$/ }).boundingBox();
    await page.mouse.click(wpNew.x + wpNew.width / 2, wpNew.y + wpNew.height / 2, { button: 'right' });
    await page.waitForTimeout(200);
    const menuTxt = await page.locator('.pp-menu').innerText().catch(() => '');
    ok(/Delete waypoint 2/.test(menuTxt), 'right-click on a waypoint shows a menu: ' + menuTxt.replace(/\n/g, ' | '));
    await page.screenshot({ path: `${out}/04b-right-click.png` });
    await page.locator('.pp-menu button', { hasText: 'Delete waypoint 2' }).click();
    await page.waitForTimeout(200);
    ok((await rowCount()) === 4, 'menu deleted the waypoint');

    // Right-click on a course line -> Insert waypoint here
    await page.mouse.click(mid12.x, mid12.y, { button: 'right' });
    await page.waitForTimeout(200);
    const legMenu = await page.locator('.pp-menu').innerText().catch(() => '');
    ok(/Insert waypoint here/.test(legMenu), 'right-click on a course line offers insert: ' + legMenu.replace(/\n/g, ' | '));
    await page.locator('.pp-menu button', { hasText: 'Insert waypoint here' }).click();
    await page.waitForTimeout(200);
    ok((await rowCount()) === 5, 'inserted from the course-line menu');

    // Ctrl-click two waypoints on the map, then delete both with the button
    // plain click selects WP2 only, Ctrl-click adds WP3
    const bA = await page.locator('.pp-wp', { hasText: /^2$/ }).boundingBox();
    await page.mouse.click(bA.x + bA.width / 2, bA.y + bA.height / 2);
    await page.waitForTimeout(100);
    const bB = await page.locator('.pp-wp', { hasText: /^3$/ }).boundingBox();
    await page.keyboard.down('Control');
    await page.mouse.click(bB.x + bB.width / 2, bB.y + bB.height / 2);
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${out}/04d-multi-select.png` });
    const selTxt = await page.locator('button', { hasText: 'Delete selected' }).innerText();
    ok(/\(2\)/.test(selTxt), 'Ctrl-click selected two waypoints: ' + selTxt);
    await page.locator('button', { hasText: 'Delete selected' }).click();
    await page.waitForTimeout(200);
    ok((await rowCount()) === 3, `deleted the two selected waypoints (${await rowCount()} rows)`);

    // Tick boxes: reopen the route, tick two rows, delete
    await page.setInputFiles('input[type=file]', fixture);
    await page.waitForTimeout(300);
    await page.locator('.tablewrap tbody tr').nth(1).locator('input[title=Select]').click();
    await page.locator('.tablewrap tbody tr').nth(2).locator('input[title=Select]').click();
    await page.locator('button', { hasText: 'Delete selected (2)' }).click();
    await page.waitForTimeout(200);
    ok((await rowCount()) === 2, 'tick boxes + Delete selected removed two waypoints');
    await page.setInputFiles('input[type=file]', fixture);
    await page.waitForTimeout(300);

    // Full-size table
    await page.locator('button', { hasText: 'Full-size table' }).click();
    await page.waitForTimeout(200);
    const ov = await page.locator('.pp-overlay').boundingBox();
    const ovTable = await page.locator('.pp-overlay table').boundingBox();
    ok(ov && ovTable && ovTable.width <= ov.width, `full-size table shows every column without scrolling (table ${Math.round(ovTable.width)} px in ${Math.round(ov.width)} px)`);
    await page.screenshot({ path: `${out}/04c-full-table.png` });
    await page.locator('.pp-overlay button', { hasText: 'Close' }).click();
    ok((await page.locator('.pp-overlay').count()) === 0, 'full-size table closes');

    // Zoom in on the middle of the long GC leg: waypoints off screen, label must stay
    await page.evaluate(() => window.__map.setView([28.5, -29.2], 8, { animate: false }));
    await page.waitForTimeout(400);
    const vis = await page.locator('.pp-label').allInnerTexts();
    ok(vis.length >= 1 && vis.some(t => /GC/.test(t)), 'zoomed in, label still shown: ' + vis.join(' | '));
    await page.screenshot({ path: `${out}/05-zoomed-label.png` });
    await page.locator('button', { hasText: 'Show on map' }).click();
    await page.waitForTimeout(400);

    // Land warning (test page: 'land' north of 35.5°N -> TEST BRAVO at 36°N)
    await page.waitForTimeout(1200);
    const landLabels = await page.locator('.pp-land').count();
    ok(landLabels >= 1, `land warning shown on the map: ${landLabels}`);
    const landRow = await page.locator('.tablewrap tbody tr').nth(3).innerText();
    ok(/land\?/.test(landRow), 'land warning shown in the table');
    await go(page, 'Feedback');
    ok((await page.locator('.fb').innerText()).includes('nodecentral1990@gmail.com'), 'feedback email shown (Help → Feedback)');
    ok(/valuable to mariners worldwide/.test(await page.locator('.fb').innerText()), 'feedback invitation line shown');
    await page.locator('.fb button', { hasText: 'Report a problem' }).click();
    await page.locator('.fb textarea').fill('Test problem text');
    const href = await page.locator('.fb a', { hasText: 'Open in my email' }).getAttribute('href');
    ok(href.startsWith('mailto:nodecentral1990@gmail.com?subject=') && decodeURIComponent(href).includes('Test problem text') && decodeURIComponent(href).includes('problem report'), 'report opens a ready email');
    await page.screenshot({ path: `${out}/06b-feedback.png` });
    await page.locator('.fb button', { hasText: 'Cancel' }).click();
    await go(page, 'Route');

    // Delay at WP2: tick the box (6 h default)
    const sum0 = await page.locator('.summary').innerText();
    await page.locator('.tablewrap tbody tr').nth(1).locator('input[title="Stop (drift) at this waypoint"]').check();
    await page.waitForTimeout(300);
    const sum1 = await page.locator('.summary').innerText();
    ok(/steaming \+ 06h 00m stopped/.test(sum1), 'delay adds stopped time: ' + sum1.replace(/\s+/g, ' '));

    // Click a waypoint: Windy time goes to its ETA
    const wp3 = await page.locator('.pp-wp', { hasText: /^3$/ }).boundingBox();
    await page.mouse.click(wp3.x + wp3.width / 2, wp3.y + wp3.height / 2);
    await page.waitForTimeout(200);
    const tsWp = await page.evaluate(() => window.__store.get('timestamp'));
    const etaWp3 = await page.locator('.tablewrap tbody tr').nth(2).locator('td').nth(13).innerText();
    ok(new Date(tsWp).toISOString().slice(11, 16) === etaWp3.slice(-5), `waypoint click sets the time to its ETA (${etaWp3})`);

    // Click a ship symbol: Windy time goes to that ship's time
    const shipEl = page.locator('.pp-ship-icon').nth(5);
    const shipTime = await shipEl.locator('.pp-ship-time').innerText();
    await shipEl.locator('.pp-ship').click({ force: true });
    await page.waitForTimeout(200);
    const tsShip = await page.evaluate(() => window.__store.get('timestamp'));
    const d = new Date(tsShip);
    const label = String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC';
    ok(label === shipTime, `ship click sets the time (${shipTime} -> ${label})`);

    // Settings: ship particulars
    const shipSec = await settings('Ship particulars');
    ok((await page.locator('nav.g-nav button').allInnerTexts()).join('|').match(/Settings/) && !(await page.locator('nav.g-nav button').allInnerTexts()).includes('Limits'), 'Ship and Limits tabs merged into Settings');
    const set = async (label, v) => {
        const inp = shipSec.locator('label', { hasText: label }).locator('input');
        await inp.fill(String(v));
        await inp.dispatchEvent('change');
    };
    await set('LBP', 230); await set('Breadth', 32.2); await set('Draft fwd', 12.6); await set('Draft aft', 13.0); await set('GM', 1.6);
    await page.waitForTimeout(200);
    const est = await shipSec.locator('.box').innerText();
    ok(/estimated from GM/.test(est), 'roll period estimated from GM: ' + est.split('\n')[0]);
    await page.screenshot({ path: `${out}/06-ship.png` });

    await set('Block coefficient', 0.65);

    const leeTxt = await shipSec.innerText();
    ok(/Wind drift used:\s*\d+\.\d % of the wind speed/.test(leeTxt) && /typical windage height/.test(leeTxt), 'wind drift estimated by the plugin: ' + (leeTxt.match(/Wind drift used:[^)]+\)/) || [''])[0]);
    ok((await shipSec.locator('select').nth(1).locator('option').count()) >= 12, 'more ship types offered');

    // Settings: roll and pitch estimate, bilge keel in 3 sections
    const motSec = await settings('Roll and pitch estimate');
    for (let i = 0; i < 3; i++) await motSec.locator('button', { hasText: 'Add section' }).click();
    const keelInputs = motSec.locator('table.bk tbody input[type=number]');
    for (const [i, v] of [[0, 30], [1, 0.4], [2, 25], [3, 0.4], [4, 30], [5, 0.45]]) {
        await keelInputs.nth(i).fill(String(v));
        await keelInputs.nth(i).dispatchEvent('change');
    }
    await page.waitForTimeout(200);
    ok(/Total 85\.0 m per side/.test(await motSec.innerText()), 'bilge keel in 3 sections entered (85 m per side)');
    await motSec.locator('table.bk tbody tr').nth(2).locator('td').nth(1).click({ modifiers: ['Control'] });
    await motSec.locator('table.bk tbody tr').nth(0).locator('td').nth(1).click({ modifiers: ['Control'] });
    ok(/Delete selected \(2\)/.test(await motSec.innerText()), 'bilge keel sections: Ctrl-click selects several');
    await motSec.locator('table.bk tbody tr').nth(0).locator('td').nth(1).click();

    // Settings: owner's table; Speed tab: per-leg advice
    const spSec = await settings('Speed, RPM and fuel');
    for (const r of [[60, 12, 40], [70, 14, 55], [80, 16, 75]]) {
        await spSec.locator('button', { hasText: 'Add a row' }).click();
        const row = spSec.locator('.speedtable tbody tr').last();
        for (let k = 0; k < 3; k++) {
            const inp = row.locator('input').nth(k);
            await inp.fill(String(r[k]));
            await inp.dispatchEvent('change');
        }
    }
    await page.waitForTimeout(200);
    await go(page, 'Speed');
    const legsTxt = await page.locator('.tbl.legs').innerText();
    ok(/WP1→2/.test(legsTxt) && /\b60\b/.test(legsTxt), 'per-leg RPM from the table (12 kn -> 60 rpm)');
    ok(/Total/.test(legsTxt) && /stops/.test(legsTxt), 'totals include stops');
    ok((await page.locator('#pane .chart').count()) === 0, 'no speed graph in the Speed tab (it is in the graph window)');
    await page.screenshot({ path: `${out}/06b-speed.png` });

    // Settings: limits
    await settings('Weather limits');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/07-limits.png`, fullPage: false });

    // Weather tab
    await go(page, 'Weather');
    await page.locator('select').first().selectOption('6');
    await page.locator('button', { hasText: 'Get forecast along route' }).click();
    await page.waitForSelector('.wo', { timeout: 5000 });
    await page.waitForTimeout(200);
    const woTxt = await page.locator('.wo').innerText();
    ok(/\d+ %/.test(woTxt) && /Ocean currents/.test(woTxt) && /Visibility/.test(woTxt) && /don't click on the map/.test(woTxt), 'progress window with percentages while reading: ' + woTxt.split('\n').slice(0, 4).join(' | '));
    await page.screenshot({ path: `${out}/07b-progress.png` }).catch(() => {});
    await page.waitForSelector('text=/Visibility: read at \\d+/', { timeout: 90000 });
    await page.waitForSelector('.wo', { state: 'detached', timeout: 10000 }); // currents + visibility read automatically
    await page.waitForTimeout(300);
    const curVals = await page.locator('.tablewrap tbody td', { hasText: /\d\.\d → \d{3}°/ }).count();
    ok(curVals > 5, `currents read automatically after the forecast: ${curVals} cells`);
    // Windy's sea (wind waves) read along the route: the format worked out from the SWH layer
    ok(/Sea \(wind waves\): read at \d+ of \d+ times/.test(await page.locator('#pane').innerText()), "Windy's sea (wind waves) read along the route");
    const seaRow = await page.locator('.tablewrap tbody tr').nth(1).locator('td').allInnerTexts();
    const seaCells = seaRow.slice(20, 23).join(' | ');
    ok(/^\d+\.\d \| 6 \| \d{3}°/.test(seaCells), "sea from Windy: height, period 6 s and direction in the table: " + seaCells);
    const seaLog = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:log') || '[]').length);
    void seaLog;
    const heads = await page.locator('.tablewrap thead').innerText();
    ok(/SWH/.test(heads) && /Sea/.test(heads) && /Swell/.test(heads) && /Date \/ time \(UTC\)/.test(heads), 'grouped columns: date/time, SWH, sea, swell');
    ok((await page.locator('#pane .tablewrap thead tr.groups th').count()) >= 10, 'column groups with dividers');
    ok(/SiCW/.test(heads) && /Wx loss/.test(heads) && /SOG/.test(heads) && /Temp °C/.test(heads) && /Air/.test(heads) && /Vis nm/.test(heads), 'SiCW, weather loss, current, SOG, air/sea temperature and visibility columns');
    const visTxt = await page.locator('.tablewrap tbody').innerText();
    ok(/>7/.test(visTxt), 'visibility over 7 nm shown as >7');
    ok(/Power kW\/m/.test(heads) && (await page.locator('#pane td.pw').count()) > 5, 'wave power column, coloured');
    ok(/always uses ECMWF/.test(await page.locator('#pane').innerText()), 'model used by the plugin stated');
    const useCur = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1') || '{}').route?.useCurrents);
    ok(useCur === true, 'currents switched on for the SOG once read');
    // Full-size weather table
    await page.locator('button', { hasText: 'Full-size table' }).click();
    const ovRows = await page.locator('.pp-overlay tbody tr').count();
    const wxRows0 = await page.locator('#pane .tablewrap tbody tr').count();
    ok(ovRows === wxRows0 && ovRows > 20, `full-size weather table shows all ${ovRows} rows`);
    await page.screenshot({ path: `${out}/08f-weather-full.png` });
    await page.locator('.pp-overlay button', { hasText: 'Close' }).click();
    const wxRows = await page.locator('.tablewrap tbody tr').count();
    const fetches = await page.evaluate(() => window.__fetchCount);
    ok(wxRows > 20, `weather table rows: ${wxRows}, forecast requests: ${fetches}`);
    const red = await page.locator('td.lv2').count();
    const chips = await page.locator('td.warn .chip').count();
    ok(red > 0 && chips > 0, `limit cells red: ${red}, IMO warning chips: ${chips}`);
    await page.screenshot({ path: `${out}/08-weather.png` });
    const stoppedRows = await page.locator('.chip.stop').count();
    ok(stoppedRows >= 1, `weather table shows the stop: ${stoppedRows} rows`);
    const driftCol = await page.locator('th', { hasText: 'Drift' }).count();
    ok(driftCol === 1, 'drift column shown during the stop');
    const imoShips = await page.locator('.pp-ship--imo').count();
    ok(imoShips >= 1, `ships turn red on an IMO warning: ${imoShips}`);
    // Kwon estimate on: ETA changes with the weather
    const spSec2 = await settings('Speed, RPM and fuel');
    await spSec2.locator('select').filter({ hasText: 'My allowance' }).selectOption('kwon');
    await page.waitForTimeout(300);
    ok(/rough/.test(await page.locator('#pane').innerText()), 'Kwon estimate flagged as rough (Settings)');
    await go(page, 'Speed');
    const legs2 = await page.locator('.tbl.legs').innerText();
    ok(/rough/.test(await page.locator('#pane').innerText()), 'Kwon estimate flagged as rough');
    await page.locator('.g-head button[aria-label="Graph window"]').click();
    await page.waitForTimeout(400);
    const sogDistinct = await page.evaluate(() => { const p = document.querySelector('.gp path.gp__line'); return new Set(((p && p.getAttribute('d')) || '').match(/,([\d.]+)/g)).size; });
    ok(sogDistinct > 5, `SOG graph (graph window) follows the weather (${sogDistinct} different values)`);
    await page.locator('.gp__btn[title^="Close"]').click();
    await page.screenshot({ path: `${out}/08c-speed-weather.png` });
    await go(page, 'Weather');
    const glyphs = await page.locator('.pp-glyph').count();
    ok(glyphs >= 3, `weather drawn on ship symbols (decluttered): ${glyphs}`);
    const anyRed = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-glyph')).some(g => g.innerHTML.includes('#ff3030')));
    ok(anyRed, 'some ship arrows/barbs are red where limits are broken');
    await page.evaluate(() => window.__map.setView([24.5, -34.5], 6, { animate: false }));
    await page.waitForTimeout(400);
    const glyphsZoomed = await page.locator('.pp-glyph').count();
    ok(glyphsZoomed >= 3, `zoomed in: weather on ${glyphsZoomed} ships in view`);
    await page.screenshot({ path: `${out}/08b-ship-weather.png` });
    // Other ship symbols
    const mapSec = await settings('Map display');
    const symSel = mapSec.locator('select', { has: page.locator('option[value=container]') });
    ok((await symSel.locator('option').count()) >= 10, 'ship symbol choices offered');
    await symSel.selectOption('container');
    await page.waitForTimeout(300);
    const boxes = await page.locator('.pp-ship svg[viewBox="0 0 40 40"]').count();
    ok(boxes >= 10, `container ship symbols drawn: ${boxes}`);
    ok((await page.locator('.pp-ship--imo').count()) >= 1, 'IMO warning still shown with the container symbol');
    await page.screenshot({ path: `${out}/08d-container-symbols.png` });
    await symSel.selectOption('ring');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/08e-ring-symbols.png` });
    await symSel.selectOption('classic');
    await go(page, 'Weather');
    await page.locator('button', { hasText: 'Show on map' }).click().catch(() => {});
    await page.locator('.tablewrap tbody tr').nth(8).click();
    await page.waitForTimeout(200);
    const ts = await page.evaluate(() => window.__store.get('timestamp'));
    const rowTxt = await page.locator('.tablewrap tbody tr').nth(8).innerText();
    const shown = new Date(ts).toISOString().slice(8, 16).replace('T', ' ');
    ok(rowTxt.includes(shown.slice(0, 2)) && rowTxt.includes(shown.slice(3)), `row click moved the time slider to the row time (${rowTxt} / ${shown})`);
    await page.screenshot({ path: `${out}/09-row-click.png` });

    // Currents sweep (stub)
    await page.locator('button', { hasText: 'Read currents' }).click();
    await page.waitForSelector('.wo', { timeout: 5000 }).catch(() => {});
    await page.waitForSelector('.wo', { state: 'detached', timeout: 60000 });
    const curCells = await page.locator('th', { hasText: 'Current' }).count();
    ok(curCells === 1, 'currents column shown');
    const overlayBack = await page.evaluate(() => window.__store.get('overlay'));
    ok(overlayBack === 'wind', 'user layer restored after sweep: ' + overlayBack);

    // Snapshot at a time with an IMO warning in the table
    const warnRow = page.locator('.tablewrap tbody tr', { has: page.locator('td.warn .chip') }).first();
    await warnRow.click();
    await go(page, 'Polar');
    await page.waitForTimeout(400);
    const cells = await page.locator('#pane .rp svg path.zone').count();
    ok(cells > 0, `polar diagram shaded cells at a warning time: ${cells}`);
    const atHdg = await page.locator('#pane').innerText();
    ok(/Parametric|Synchronous|Successive|Surf/.test(atHdg), 'snapshot lists the warning at the planned heading');
    await page.screenshot({ path: `${out}/10-snapshot.png` });

    // Fix the ETA at WP3 six hours later: later ETAs move, weather follows without a new fetch
    await go(page, 'Route');
    const row3 = page.locator('.tablewrap tbody tr').nth(2);
    const etaSum0 = await page.locator('.summary').innerText();
    await row3.locator('.dtf__value').click();
    const pop3 = row3.locator('.dtf__pop');
    const pv = async (c) => Number(await pop3.locator('select.' + c).inputValue());
    const t3 = Date.UTC(await pv('dtf-year'), await pv('dtf-mon'), await pv('dtf-day'), await pv('dtf-hour'), await pv('dtf-min')) + 6 * 3600e3;
    const t3s = new Date(t3).toISOString();
    for (let k = 0; k < 6; k++) await pop3.locator('button', { hasText: /^\+1 h$/ }).click();
    await pop3.locator('button', { hasText: /^OK$/ }).click();
    await page.waitForTimeout(300);
    const cell3 = await row3.locator('td').nth(13).innerText();
    ok(cell3.includes('📌') && cell3.includes(t3s.slice(11, 16)), `ETA at WP3 fixed: ${cell3}`);
    const speed2 = await page.locator('.tablewrap tbody tr').nth(1).locator('td').nth(8).innerText();
    ok(/→\d/.test(speed2), 'speed before the fixed ETA is worked out: ' + speed2);
    const etaSum1 = await page.locator('.summary').innerText();
    ok(etaSum1 !== etaSum0 && !/must be after/.test(etaSum1), 'final ETA moved on: ' + etaSum1.replace(/\s+/g, ' ').slice(-40));
    await page.screenshot({ path: `${out}/11-fixed-eta.png` });
    await go(page, 'Weather');
    const staleMsg = await page.locator('text=The route changed after the forecast').count();
    const wxRows3 = await page.locator('.tablewrap tbody tr').count();
    ok(staleMsg === 0 && wxRows3 > 5, `weather follows the new times without a new fetch (${wxRows3} rows)`);
    const wp3Row = await page.locator('.tablewrap tbody tr', { hasText: t3s.slice(11, 16) }).count();
    ok(wp3Row >= 1, 'weather table has a row at the fixed WP3 time');
    await go(page, 'Route');
    // Unfix again
    await row3.locator('.dtf__value').click();
    await row3.locator('.dtf__pop button', { hasText: 'Unfix' }).click();
    await page.waitForTimeout(200);
    ok(!(await row3.locator('td').nth(13).innerText()).includes('📌'), 'ETA at WP3 unfixed');

    // Version, ship info window, arrow keys with "keep the ship centred"
    ok(/v\d+\.\d+\.\d+/.test(await page.locator('.g-head__ver').innerText()), 'plugin version shown: ' + (await page.locator('.g-head__ver').innerText()));
    await page.evaluate(() => window.__store.set('timestamp', window.__store.get('timestamp')));
    const sbTxt = await page.locator('.sb').innerText();
    ok(/TEST ALPHA to TEST BRAVO/.test(sbTxt) && /Map time .* UTC/.test(sbTxt) && /Now .* UTC/.test(sbTxt), 'ship window shows route name and times in UTC');
    ok(/Wind/.test(sbTxt) && /Swell/.test(sbTxt) && /Current/.test(sbTxt) && /Sea/.test(sbTxt), 'ship window lists wind, sea, swell and current');
    ok(/Wave power\s+\d+\*? kW\/m/.test(sbTxt), 'ship window shows wave power');
    ok((await page.locator('.sb polygon').count()) >= 3, 'ship window draws the arrows');
    await (await settings('Map display')).locator('label', { hasText: 'Keep the ship centred' }).locator('input').check();
    await page.locator('body').click({ position: { x: 5, y: 940 } }).catch(() => {});
    for (let k = 0; k < 6; k++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120); }
    await page.waitForTimeout(600);
    const shipBox = await page.locator('.pp-ship--now').boundingBox();
    const mapBox = await page.locator('#map').boundingBox();
    const off = shipBox && mapBox ? Math.hypot(shipBox.x + shipBox.width / 2 - (mapBox.x + mapBox.width / 2), shipBox.y + shipBox.height / 2 - (mapBox.y + mapBox.height / 2)) : 999;
    ok(off < 30, `arrow keys move the time and the map keeps the ship centred (${off.toFixed(0)} px off centre)`);
    await page.screenshot({ path: `${out}/12-ship-window.png` });
    await (await settings('Map display')).locator('label', { hasText: 'Keep the ship centred' }).locator('input').uncheck();
    // Name, polar in the ship window
    ok(/Capt\. Node Central/.test(await page.locator('.g-tagline').innerText()), 'tagline shows Capt. Node Central');
    await go(page, 'Polar');
    await page.locator('.pp-ship-icon').nth(4).locator('.pp-ship').click({ force: true });
    await page.waitForTimeout(300);
    ok((await page.locator('.sb .rp').count()) === 1 && ((await page.locator('.sb .rp svg path.zone').count()) >= 1 || /No IMO warning at any heading/.test(await page.locator('.sb').innerText())), 'one merged diagram in the ship window (sectors, or a clear "no warning" line)');
    ok((await page.locator('.sb').evaluate(el => [...el.querySelectorAll('svg')].filter(s => !s.parentElement.closest('svg') && !s.classList.contains('g-icon')).length)) === 1, 'only one diagram in the ship window');
    ok((await page.locator('.sb polygon').count()) >= 2, 'ship window: sea / swell flags drawn');
    await page.screenshot({ path: `${out}/14-polar-window.png` });


    // Route comparison: current route, a changed copy, and a route file
    await go(page, 'Compare');
    await page.locator('button', { hasText: 'Add the route from the Route tab' }).click();
    await go(page, 'Route');
    const lat3 = page.locator('.tablewrap tbody tr').nth(2).locator('input.pos').first();
    await lat3.fill("31°00.000'N");
    await lat3.press('Enter');
    await lat3.blur();
    await page.waitForTimeout(200);
    await go(page, 'Compare');
    await page.locator('button', { hasText: 'Add the route from the Route tab' }).click();
    const names = page.locator('.tbl input.name');
    await names.nth(1).fill('Southern option');
    await names.nth(1).press('Enter');
    await names.nth(1).blur();
    await page.setInputFiles('input[type=file][multiple]', fixture);
    await page.waitForTimeout(300);
    ok((await page.locator('.tbl tbody tr').count()) === 4, 'Route tab route (live) + three kept routes in the comparison');
    ok(/Route tab, live/.test(await page.locator('.tbl').innerText()), 'current route always included');
    ok((await page.locator('.pp-cmp-label').count()) === 3, 'compared routes drawn on the map in their colours');
    await page.locator('button', { hasText: 'Get forecast for all routes' }).click();
    await page.waitForSelector('text=/Done: forecast for 4 routes/', { timeout: 60000 });
    const cmpTxt = await page.locator('#pane').innerText();
    ok(/Wind >34 kn/.test(cmpTxt) && /Wave limit/.test(cmpTxt) && /Wind limit/.test(cmpTxt) && /CuF/.test(cmpTxt) && /WxF/.test(cmpTxt) && /Slip %/.test(cmpTxt) && /Fuel t/.test(cmpTxt), 'comparison columns shown (track-list style)');
    ok((await page.locator('#pane .wrap tbody tr').count()) === 4, 'one row per route in the comparison');
    ok(/\dD \d\dH/.test(cmpTxt), 'durations in days and hours');
    const best = await page.locator('#pane td.best').count();
    const worst = await page.locator('#pane td.worst').count();
    ok(best > 3 && worst > 3, `best (green) and worst (red) marked: ${best} / ${worst}`);
    ok(/Southern option/.test(await page.locator('#pane .wrap tbody').innerText()), 'renamed route shown in the comparison');
    await page.screenshot({ path: `${out}/13-compare.png` });
    await page.locator('#pane button', { hasText: 'Full-size table' }).click();
    await page.screenshot({ path: `${out}/13b-compare-full.png` });
    await page.locator('.pp-overlay button', { hasText: 'Close' }).click();

    // Voyage: track colour, start, present position
    await go(page, 'Route');
    await page.locator('button', { hasText: 'Start voyage on this route' }).click();
    ok(/Voyage running/.test(await page.locator('#pane').innerText()), 'voyage started');
    const etd0 = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1') || '{}').route?.etd);
    await page.locator('button', { hasText: 'Input current position' }).click();
    const fixBox = page.locator('.fixform');
    const degs = fixBox.locator('input.deg');
    const mins = fixBox.locator('input.min');
    // arrow keys inside the boxes must not move Windy's time
    const tsK0 = await page.evaluate(() => window.__store.get('timestamp'));
    await mins.first().click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    const tsK1 = await page.evaluate(() => window.__store.get('timestamp'));
    ok(tsK0 === tsK1, 'arrow keys while typing a position do not move the time slider');
    await degs.nth(0).fill('21');
    await mins.nth(0).fill('0');
    await fixBox.locator('select').nth(0).selectOption('N');
    await degs.nth(1).fill('37');
    await mins.nth(1).fill('30');
    await fixBox.locator('select').nth(1).selectOption('W');
    await mins.nth(1).blur();
    await fixBox.locator('.dtf__value').click();
    const fixT = new Date(etd0 + 30 * 3600e3);
    await fixBox.locator('select.dtf-year').selectOption(String(fixT.getUTCFullYear()));
    await fixBox.locator('select.dtf-mon').selectOption(String(fixT.getUTCMonth()));
    await fixBox.locator('select.dtf-day').selectOption(String(fixT.getUTCDate()));
    await fixBox.locator('select.dtf-hour').selectOption(String(fixT.getUTCHours()));
    await fixBox.locator('.dtf__pop button', { hasText: /^OK$/ }).click();
    await page.locator('button', { hasText: 'Update position' }).click();
    await page.waitForSelector('.wo', { timeout: 5000 });
    ok(/re-checking the weather/.test(await page.locator('.wo').innerText({ timeout: 2000 }).catch(() => '')), 'weather re-checked after the position update');
    await page.waitForSelector('.wo', { state: 'detached', timeout: 120000 });
    const vTxt = await page.locator('#pane').innerText();
    ok(/Distance to go/.test(vTxt) && /off the track/.test(vTxt), 'present position placed on the track: ' + (vTxt.match(/Sailed[^.]+\./) || [''])[0]);
    ok((await page.locator('.pp-fix').count()) === 1, 'present position marked on the map');
    const grey = await page.evaluate(() => Array.from(document.querySelectorAll('path.leaflet-interactive, svg path')).filter(p => p.getAttribute('stroke') === '#9e9e9e').length);
    ok(grey >= 1, `sailed part drawn in its own colour (${grey} pieces)`);
    ok((await page.locator('.leaflet-overlay-pane path[stroke-dasharray="2 5"]').count()) === 1, 'planned leg kept as a thin dotted line after the position update');
    ok(/nm from PP/.test(await page.locator('.leaflet-marker-pane').innerText()), 'leg label gives the distance from the present position');
    await go(page, 'Route');
    await page.evaluate(() => window.__map.setView([22, -36], 5, { animate: false }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/15-voyage.png` });
    await page.locator('button', { hasText: 'End voyage' }).click();
    ok(!/Voyage running/.test(await page.locator('#pane').innerText()), 'voyage ended');

    // Route tab clean; ⚙ on the ship window opens the display settings
    await go(page, 'Route');
    const routeTxt = await page.locator('#pane').innerText();
    ok(!/Ship symbols every/.test(routeTxt) && !/Keep the ship centred/.test(routeTxt) && !/Track colour/.test(routeTxt), 'Route tab has no display settings');
    await page.locator('.sb button', { hasText: '⚙' }).click();
    ok(await page.locator('details', { has: page.locator('summary', { hasText: 'Map display' }) }).evaluate(e => e.open), 'ship window ⚙ opens Settings → Map display');
    await page.screenshot({ path: `${out}/16-settings.png` });

    // Info tab, weather data time, flag colours
    await go(page, 'Info');
    const infoTxt = await page.locator('#pane').innerText();
    ok(/ECMWF/.test(infoTxt) && /GFS/.test(infoTxt) && /ICON/.test(infoTxt) && /Which one should a mariner use/.test(infoTxt), 'Info tab explains the weather models');
    await go(page, 'Weather');
    ok(/Weather data: Windy ECMWF run \d\d \w{3} \d{4} \d\d:\d\d UTC .* fetched \d\d \w{3} \d{4} \d\d:\d\d UTC/.test(await page.locator('#pane').innerText()), 'weather data run time and fetch time shown in UTC');
    await settings('Map display');
    ok((await page.locator('.swatches .sw').count()) >= 16, 'sea / swell flag colour choices');
    const offered = await page.locator('.swatches .sw').evaluateAll(els => els.map(e => e.getAttribute('title')));
    ok(!offered.includes('#ff3030') && !offered.includes('#ffd400'), 'warning colours not offered for the flags');

    // Roll / pitch estimate shown in the weather table, the ship window and the Polar tab
    await go(page, 'Weather');
    await page.waitForTimeout(300);
    const wxHead = await page.locator('.tablewrap thead').first().innerText();
    ok(/Roll \/ pitch \(est\.\)/.test(wxHead) && /Roll°/.test(wxHead), 'weather table has the roll / pitch estimate');
    const rollCells = await page.locator('.tablewrap tbody tr').first().innerText();
    ok(/\d+ \(\d+\)/.test(rollCells), 'roll estimate values in the table');
    ok(/Roll \/ pitch\s+\d+° \/ \d+\.\d°/.test(await page.locator('.sb').innerText()), 'ship window shows roll / pitch estimate');
    await go(page, 'Polar');
    await page.waitForTimeout(300);
    ok(/Roll \/ pitch estimate: roll \d+\.\d°/.test(await page.locator('#pane').innerText()), 'Polar tab shows roll / pitch at the chosen heading and speed');
    // Same wave names everywhere, with periods and encounter periods; four flags; the key is readable
    const keyTxt = await page.locator('#pane .rp-key').innerText();
    ok(['SWH', 'Sea', 'Swell 1', 'Swell 2'].every(k => keyTxt.includes(k)) && /Encounter/.test(keyTxt) && /\d+\.\d s/.test(keyTxt), 'Polar tab key: SWH, Sea, Swell 1, Swell 2 with period and encounter period');
    ok(await page.locator('#pane .rp-key').evaluate(el => getComputedStyle(el).color !== getComputedStyle(el).backgroundColor), 'polar key text is visible (not the same colour as its background)');
    ok((await page.locator('#pane .rp svg polygon').count()) >= 5, 'polar diagram: four wave flags and the ship arrow');
    await page.locator('#pane .rp-key').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/25-polar-tab-key.png` });
    const sbTxt2 = await page.locator('.sb').innerText();
    ok(['SWH', 'Sea', 'Swell 1', 'Swell 2'].every(k => sbTxt2.includes(k)) && /\bTe\b/.test(sbTxt2) && /\d+\.\d s/.test(sbTxt2), 'ship window lists SWH, Sea, Swell 1, Swell 2 with encounter periods');
    const wxHead2 = await go(page, 'Weather').then(() => page.locator('.tablewrap thead').first().innerText());
    ok(/Swell 1/.test(wxHead2) && /Swell 2/.test(wxHead2) && (wxHead2.match(/Te/g) || []).length >= 4, 'weather table: SWH, Sea, Swell 1, Swell 2 each with an encounter period column');
    // ship window: drag the corner to resize; the diagram grows with it
    const sbBox = await page.locator('.sb').boundingBox();
    const svgW0 = (await page.locator('.sb .rp > svg').boundingBox()).width;
    const corner = await page.locator('.sb .sb__edge--c').boundingBox();
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
    await page.mouse.down();
    await page.mouse.move(corner.x + 80, corner.y - 150, { steps: 6 });
    await page.mouse.up();
    const sbBox2 = await page.locator('.sb').boundingBox();
    const svgW1 = (await page.locator('.sb .rp > svg').boundingBox()).width;
    ok(sbBox2.width > sbBox.width + 60 && svgW1 > svgW0 + 60, `ship window resized by dragging its corner (${sbBox.width.toFixed(0)} → ${sbBox2.width.toFixed(0)} px), the diagram grows with it`);
    ok(sbBox2.height < sbBox.height, 'and made shorter: the rest scrolls inside it');
    await page.screenshot({ path: `${out}/24-ship-window-resized.png` });

    // Roll step 1: roll period box with stopwatch; optional observed-roll log and fine-tuning (off by default)
    const motSec2 = await settings('Roll and pitch estimate');
    ok(/Roll period: the most important number/.test(await motSec2.innerText()), 'roll period box at the top of Roll and pitch settings');
    await motSec2.locator('button', { hasText: 'Start (at the end of a roll)' }).click();
    for (let i = 0; i < 4; i++) { await page.waitForTimeout(250); await motSec2.locator('button', { hasText: '+1 full roll' }).click(); }
    await motSec2.locator('button', { hasText: /^Stop$/ }).click();
    ok(/4 rolls in \d+\.\d s/.test(await motSec2.innerText()), 'stopwatch counts the rolls and works out the period');
    const rpBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).vessel.rollPeriod);
    await motSec2.locator('button', { hasText: /^Use \d/ }).click();
    await page.waitForTimeout(1500); // settings are saved to the browser a moment after the last change
    const vAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).vessel);
    ok(vAfter.rollPeriod > 0 && vAfter.rollPeriod < 1 && vAfter.rollPeriodDate > 0, `stopwatch result used as the roll period (${rpBefore} → ${vAfter.rollPeriod} s, date kept)`);
    // put a sensible measured period back (the test stopwatch ran for ~1 s)
    const rpIn = motSec2.locator('.rp-in input');
    await rpIn.fill('16.5'); await rpIn.dispatchEvent('change');
    // log 7 rolls from the ship window, each 1.6 × the plugin's estimate, at different map times
    for (let i = 0; i < 7; i++) {
        await page.locator('.sb button', { hasText: 'Log roll' }).click();
        const estTxt = await page.locator('.sb .ro__est').innerText();
        const est = Number((estTxt.match(/estimate now: ([\d.]+)°/) || [0, 2])[1]);
        await page.locator('.sb .ro .ro__grid input[type=number]').fill(String(Math.max(3, Math.round(est * 1.6 * 10) / 10)));
        await page.locator('.sb .ro button', { hasText: 'Save' }).click();
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(150);
    }
    // stopwatch in the Log roll box: time the roll period only (no angle), saved with heading, speed and UTC
    await page.locator('.sb button', { hasText: 'Log roll' }).click();
    await page.locator('.sb .ro button', { hasText: /^Start$/ }).click();
    await page.waitForTimeout(800);
    await page.locator('.sb .ro button', { hasText: /^Stop$/ }).click();
    ok(/= [\d.]+ s per roll/.test(await page.locator('.sb .ro').innerText()), 'ship window stopwatch works out the roll period');
    ok(await page.locator('.sb .ro button', { hasText: 'Save' }).isEnabled(), 'a timing can be saved without a roll angle');
    await page.locator('.sb .ro button', { hasText: 'Save' }).click();
    await page.waitForTimeout(1500);
    const nObs = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).vessel.rollObs.length);
    ok(nObs === 8, `observed rolls logged from the ship window with the forecast of the moment (${nObs})`);
    const lastObs = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).vessel.rollObs.slice(-1)[0]);
    ok(lastObs.periodS > 0 && lastObs.observedDeg === 0 && lastObs.headingDeg >= 0 && lastObs.t > 0, 'timed roll period saved with heading, speed and UTC time');
    const motSec3 = await settings('Roll and pitch estimate');
    ok((await motSec3.locator('table.obs tbody tr').count()) === 8, 'observations listed in Settings with the plugin estimate beside each');
    const fitBtn = motSec3.locator('button', { hasText: 'Work out the corrections' });
    if (await fitBtn.isEnabled()) {
        const tFit = Date.now();
        await fitBtn.click();
        await page.waitForSelector('.cal', { timeout: 120000 });
        const calTxt = await motSec3.locator('.cal').innerText();
        ok(/roll damping × [\d.]+/.test(calTxt) && /plugin alone ±\d+ %, fine-tuned ±\d+ %/.test(calTxt), `corrections worked out (${((Date.now() - tFit) / 1000).toFixed(1)} s): ` + calTxt.split('\n')[0]);
        ok(!(await motSec3.locator('.cal input[type=checkbox]').isChecked()), 'corrections NOT used until switched on (plugin estimate stays the main figure)');
        ok(!/fine-tuned/.test(await page.locator('.sb').innerText()), 'ship window shows the plugin estimate (not fine-tuned) by default');
        await motSec3.locator('.cal label.switch').click();
        await page.waitForTimeout(400);
        ok(/estimate \(fine-tuned\)/.test(await page.locator('.sb').innerText()), 'switched on: the ship window says the estimate is fine-tuned');
        await motSec3.locator('.cal label.switch').click();
    } else {
        ok(false, 'enough usable observations to work out the corrections: ' + (await motSec3.innerText()).match(/\d+ usable of \d+/));
    }
    await page.screenshot({ path: `${out}/26-roll-observations.png` });

    // Roll step 2: roll lines over the normal map (2°, 4°, 6°… light → dark red), follows the time slider
    await go(page, 'Weather');
    const tRoll = Date.now();
    await page.locator('button', { hasText: 'Roll lines for this view' }).click();
    await page.waitForFunction(() => { const l = document.querySelector('.pp-roll-legend'); return l && /Roll chart/.test(l.textContent) && !/Working out/.test(l.textContent); }, null, { timeout: 120000 });
    const rk = await page.locator('.pp-roll-legend').innerText();
    ok(/Significant roll/.test(rk) && /planned course of the nearest leg/.test(rk) && /2°/.test(rk) && /15°/.test(rk), `roll chart key on the map (${((Date.now() - tRoll) / 1000).toFixed(1)} s): ` + rk.split('\n').slice(0, 1).join(' '));
    const redLines = await page.locator('.leaflet-overlay-pane path').evaluateAll(ps => ps.filter(p => ['#ff9e9e', '#ff6b6b', '#f03c3c', '#d01f1f', '#a80f0f', '#800808', '#5a0000'].includes(p.getAttribute('stroke'))).length);
    ok(redLines > 0 || /No line: the roll stays under 2°/.test(rk), `roll lines drawn in reds (${redLines} lines) or the key says the roll stays under 2°`);
    const rkTime0 = (rk.match(/Roll chart · ([^\n]+)/) || [])[1];
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600);
    await page.waitForFunction(t0 => { const l = document.querySelector('.pp-roll-legend'); return l && !/Working out/.test(l.textContent) && !(l.textContent || '').includes(t0); }, rkTime0, { timeout: 60000 }).catch(() => {});
    const rk2 = await page.locator('.pp-roll-legend').innerText();
    ok(!rk2.includes(rkTime0), 'roll chart follows the time slider: ' + (rk2.match(/Roll chart · ([^\n]+)/) || [])[1]);
    await page.screenshot({ path: `${out}/27-roll-chart.png` });
    ok((await page.locator('.leaflet-ppRollBands-pane img').count()) === 1 || /No line/.test(rk), 'filled red bands drawn under the lines (one image)');
    const settled = async () => { await page.waitForTimeout(500); await page.waitForFunction(() => { const l = document.querySelector('.pp-roll-legend'); return l && !/Working out/.test(l.textContent); }, null, { timeout: 180000 }); };
    const maxOfKey = async () => Number(((await page.locator('.pp-roll-legend').innerText()).match(/largest ([\d.]+)°/) || [0, 0])[1]);
    const routeMax = await maxOfKey();
    // Step 3: worst heading, chosen course, only the roll on the map
    const rcSec = await settings('Roll and pitch estimate');
    await rcSec.locator('select').filter({ hasText: 'worst heading' }).selectOption('worst');
    const tWorst = Date.now();
    await settled();
    const worstMax = await maxOfKey();
    ok(/most roll at any heading/.test(await page.locator('.pp-roll-legend').innerText()) && worstMax >= routeMax - 0.05, `worst-heading chart (${((Date.now() - tWorst) / 1000).toFixed(1)} s): largest ${worstMax}° ≥ planned-course ${routeMax}°`);
    await rcSec.locator('select').filter({ hasText: 'worst heading' }).selectOption('fixed');
    await rcSec.locator('label', { hasText: 'Course (°T)' }).locator('input').fill('45');
    await rcSec.locator('label', { hasText: 'Course (°T)' }).locator('input').dispatchEvent('input');
    await settled();
    ok(/steers <?b?>?045°|steers 045°/.test(await page.locator('.pp-roll-legend').innerText()), 'chosen-course chart: the key says 045°');
    await rcSec.locator('select').filter({ hasText: 'worst heading' }).selectOption('route');
    await page.evaluate(() => window.__store.set('overlay', 'wind'));
    await rcSec.locator('label.rc-check', { hasText: 'Only the roll on the map' }).locator('input').check();
    await settled();
    const blankState = await page.evaluate(() => ({ overlay: window.__store.get('overlay'), particles: window.__store.get('particlesAnim'), iso: window.__store.get('isolinesOn'), white: JSON.stringify(window.__colors.waves.custom) }));
    ok(blankState.overlay === 'wwaves' && blankState.particles === 'off' && blankState.iso === false && /246,248,250/.test(blankState.white), "only the roll on the map: Windy's wind-wave layer painted white, particles and pressure lines off");
    ok(/sea read from Windy's wind-wave layer \(\d+ of \d+ points\)/.test(await page.locator('.pp-roll-legend').innerText()), 'with the blank map, the sea is read from Windy\'s wind-wave layer for the chart');
    // pitch chart in blues
    await go(page, 'Weather');
    await page.locator('button', { hasText: 'Pitch lines for this view' }).click();
    await settled();
    const pk = await page.locator('.pp-roll-legend').innerText();
    const blueLines = await page.locator('.leaflet-overlay-pane path').evaluateAll(ps => ps.filter(p => ['#9ecbff', '#6aaeff', '#3c8ef0', '#1f6fd0', '#0f4fa8', '#082f80'].includes(p.getAttribute('stroke'))).length);
    ok(/Pitch chart/.test(pk) && /Significant pitch/.test(pk) && (blueLines > 0 || /stays under 1°/.test(pk)), `pitch chart in blues (${blueLines} lines): ` + (pk.match(/largest [\d.]+°/) || [''])[0]);
    await page.screenshot({ path: `${out}/29-pitch-chart.png` });
    await page.locator('button', { hasText: 'Roll lines for this view' }).click();
    await settled();
    await go(page, 'Weather');
    await page.screenshot({ path: `${out}/28-roll-chart-blank.png` });
    await page.locator('button', { hasText: 'Hide lines' }).click();
    ok((await page.locator('.pp-roll-legend').count()) === 0, 'roll lines can be hidden');
    const restored = await page.evaluate(() => ({ overlay: window.__store.get('overlay'), white: window.__colors.waves.custom }));
    ok(restored.overlay === 'wind' && !/246,248,250/.test(JSON.stringify(restored.white)), 'hiding puts Windy back as it was (layer and colours)');
    // picking another Windy layer while the map is blank: the blank map steps aside
    await page.locator('button', { hasText: 'Roll lines for this view' }).click();
    await settled();
    await page.evaluate(() => window.__store.set('overlay', 'wind'));
    await page.waitForTimeout(400);
    ok(/switched off: you picked another Windy layer/.test(await page.locator('#pane').innerText()) && (await page.evaluate(() => window.__store.get('overlay'))) === 'wind', 'choosing another Windy layer switches the blank map off (no fight with Windy)');
    await page.locator('button', { hasText: 'Hide lines' }).click();

    // Cold / ice: limits in Settings, icing column in the weather table
    const limTxt = await (await settings('Weather limits')).innerText();
    ok(/Cold and ice/.test(limTxt) && /no sea-ice/i.test(limTxt), 'cold and ice limits in Settings, with the note that Windy has no sea-ice data');
    await go(page, 'Weather');
    ok(/Icing/.test(await page.locator('.tablewrap thead').first().innerText()), 'weather table has a spray icing column');
    const spTxt = await (await settings('Speed, RPM and fuel')).innerText();
    ok(/Power kW/.test(spTxt), 'engine power column in the speed table');

    // Graph window: 3 list boxes, hover / click, resize, minimise, maximise, close; Now button
    await page.locator('.g-head button[aria-label="Graph window"]').click();
    await page.waitForTimeout(400);
    ok((await page.locator('.gp__pick').count()) === 3, 'graph window has three list boxes');
    ok((await page.locator('.gp path.gp__line').count()) === 7, `two graphs drawn by default (${await page.locator('.gp path.gp__line').count()} lines)`);
    await page.locator('.gp__pick').nth(2).click();
    await page.locator('.gp__pop label', { hasText: 'Roll (estimate' }).click();
    await page.locator('.gp__pop label', { hasText: 'Air temperature' }).click();
    await page.locator('.gp__pop label', { hasText: 'Wind direction' }).click();
    await page.mouse.click(5, 5);
    await page.waitForTimeout(300);
    ok((await page.locator('.gp__pop').count()) === 0, 'list box closes when clicking elsewhere');
    ok((await page.locator('.gp__legend').count()) === 3, 'third graph added from list box 3');
    const g3 = await page.locator('.gp__legend').nth(2).innerText();
    ok(/Roll/.test(g3) && /Air temperature/.test(g3) && /no axis/.test(g3), 'one graph carries several values (third unit scale given in the legend): ' + g3.replace(/\s+/g, ' '));
    ok((await page.locator('.gp circle.gp__dot').count()) > 3, 'directions drawn as dots');
    ok((await page.locator('.gp__pop').count()) === 0 && (await page.locator('.gp__lb .gp__sw').count()) === 3, 'an on / off switch next to each list box');
    const lines0 = await page.locator('.gp path.gp__line').count();
    await page.locator('.gp__legend').first().locator('label.gp__li').first().click();
    await page.waitForTimeout(200);
    ok((await page.locator('.gp path.gp__line').count()) === lines0 - 1 && (await page.locator('.gp__li.off').count()) === 1, 'legend switch hides one value for a moment (kept in the list)');
    await page.locator('.gp__legend').first().locator('label.gp__li').first().click();
    await page.waitForTimeout(200);
    ok((await page.locator('.gp path.gp__line').count()) === lines0, 'and shows it again');
    await page.locator('.gp__lb .gp__sw').nth(1).click();
    await page.waitForTimeout(200);
    ok((await page.locator('.gp__legend').count()) === 2, 'graph 2 switched off with its switch');
    await page.locator('.gp__lb .gp__sw').nth(1).click();
    await page.waitForTimeout(200);
    ok((await page.locator('.gp__legend').count()) === 3, 'and back on');
    const box = await page.locator('.gp__plots').boundingBox();
    await page.mouse.move(box.x + box.width * 0.6, box.y + 30);
    ok(/At pointer/.test(await page.locator('.gp__foot').innerText()), 'hovering reads the values at the pointer');
    const tsG0 = await page.evaluate(() => window.__store.get('timestamp'));
    await page.mouse.click(box.x + box.width * 0.6, box.y + 30);
    const tsG1 = await page.evaluate(() => window.__store.get('timestamp'));
    ok(tsG1 !== tsG0, 'click on the graph sets the map time');
    await page.screenshot({ path: `${out}/22-graphs.png` });
    const h0 = (await page.locator('.gp').boundingBox()).height;
    const edge = await page.locator('.gp__edge--top').boundingBox();
    const ex = edge.x + edge.width * 0.7; // clear of the ship window
    await page.mouse.move(ex, edge.y + 4);
    await page.mouse.down();
    await page.mouse.move(ex, edge.y - 96, { steps: 5 });
    await page.mouse.up();
    const h1 = (await page.locator('.gp').boundingBox()).height;
    ok(h1 > h0 + 80, `graph window resized by dragging its top edge (${h0.toFixed(0)} → ${h1.toFixed(0)} px)`);
    await page.locator('.gp__btn[title="Minimise"]').click();
    ok((await page.locator('.gp__body').count()) === 0, 'graph window minimises');
    await page.locator('.gp__btn[title="Restore"]').click();
    await page.locator('.gp__btn[title="Maximise"]').click();
    await page.waitForTimeout(300);
    ok((await page.locator('.gp').boundingBox()).height > 600, 'graph window maximises');
    await page.screenshot({ path: `${out}/22b-graphs-max.png` });
    await page.locator('.gp__btn[title="Restore size"]').click();
    await page.evaluate(() => { window.__store.set('timestamp', Date.now() + 40 * 3600e3); window.__map.setView([0, 0], 4); });
    await page.locator('.g-head .g-now').click();
    await page.waitForTimeout(700);
    const nowTs = await page.evaluate(() => window.__store.get('timestamp'));
    const c = await page.evaluate(() => window.__map.getCenter());
    ok(Math.abs(nowTs - Date.now()) < 60e3, 'Now sets the map time to the present');
    ok(Math.abs(c.lat - 0) > 1 || Math.abs(c.lng - 0) > 1, `Now puts the ship in the middle of the map (centre ${c.lat.toFixed(1)}, ${c.lng.toFixed(1)})`);
    ok((await page.locator('.sb .sb__nowbtn').count()) === 1, 'Now button also in the ship window');
    await page.evaluate(t => window.__store.set('timestamp', t), tsG1); // back into the voyage for the tests below
    await page.locator('.gp__btn[title^="Close"]').click();

    // Wave chart: your colours on Windy's wave layers, white below the minimum, lines of equal height
    await go(page, 'Weather');
    await page.locator('.wavechart button', { hasText: /^SWH$/ }).click();
    await page.waitForTimeout(400);
    const grad = await page.evaluate(() => window.__colors.waves.custom);
    ok(grad && grad[0][1].join() === '255,255,255,255' && grad[2][0] === 2, 'SWH layer in your colours: white below 2 m, bands from 2 m');
    const wcSec = await settings('Wave chart (your colours)');
    const minBox = wcSec.locator('label', { hasText: 'SWH white below' }).locator('input');
    await minBox.fill('3');
    await minBox.dispatchEvent('change');
    await wcSec.locator('select').selectOption('0.5');
    await wcSec.locator('label.pal', { hasText: 'Blues' }).click();
    await page.waitForTimeout(400);
    const grad2 = await page.evaluate(() => window.__colors.waves.custom);
    ok(grad2[2][0] === 3 && Math.abs(grad2[3][0] - 3.5) < 0.01, 'minimum 3 m and 0.5 m steps applied to Windy\'s colours');
    ok(grad2[2][1][2] > grad2[2][1][0], 'Blues palette chosen');
    await page.evaluate(() => window.__map.setView([22, -36], 5, { animate: false }));
    await wcSec.locator('button', { hasText: 'Load lines for this map view' }).click();
    await page.waitForSelector('.wo', { state: 'detached', timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(600);
    const isoN = await page.locator('.pp-iso-label').count();
    ok(isoN > 0, `lines of equal height drawn with labels (${isoN} labels)`);
    const legendTxt = await page.locator('.pp-wave-legend').innerText();
    ok(/Colours: SWH \(waves\) height/.test(legendTxt) && /white below 3 m/.test(legendTxt) && /SWH.*from Windy's map \(fine\)/.test(legendTxt), 'map legend says what is shown: ' + legendTxt.replace(/\n/g, ' | ').slice(0, 160));
    await wcSec.locator('label.switch', { hasText: 'Swell 1' }).click();
    await page.waitForTimeout(800);
    ok(/Swell 1.*forecast points every/.test(await page.locator('.pp-wave-legend').innerText()), 'swell 1 lines switched on separately (from forecast points)');
    await wcSec.locator('label.switch', { hasText: 'Swell 1' }).click();
    await page.screenshot({ path: `${out}/19-wave-chart.png` });
    await page.evaluate(() => window.__store.set('overlay', 'wwaves'));
    await page.waitForTimeout(400);
    ok((await page.evaluate(() => window.__colors.waves.custom))[2][0] === 1.5, 'sea layer uses the sea minimum (1.5 m)');
    await page.evaluate(() => window.__store.set('overlay', 'wind'));
    await page.waitForTimeout(400);
    ok((await page.evaluate(() => window.__colors.waves.custom)) === null, "Windy's own wave colours back when another layer is shown");

    // Polar diagram switches: hidden warnings not drawn, still listed
    await go(page, 'Polar');
    await page.locator('button', { hasText: 'Polar settings' }).click();
    await page.waitForTimeout(300);
    const limSec = page.locator('details[open]', { has: page.locator('summary', { hasText: 'Polar diagram' }) }).first();
    ok((await limSec.locator('label.switch').count()) === 5, 'Polar tab button opens the polar diagram switches');
    await limSec.locator('label.switch', { hasText: 'Parametric rolling' }).click();
    await go(page, 'Polar');
    await page.waitForTimeout(400);
    const polTxt = await page.locator('#pane').innerText();
    ok(/Switched off here: Parametric roll/.test(polTxt), 'polar: parametric rolling switched off is not drawn (and says so)' + (/Switched off here: Parametric roll/.test(polTxt) ? '' : ': ' + polTxt.slice(0, 1500).replace(/\s+/g, ' ')));
    const limSec2 = await settings('Polar diagram');
    await limSec2.locator('label.switch', { hasText: 'Parametric rolling' }).click();

    // Safe speed plan: keep the track, avoid the chosen weather by speed / stops; barred RPM never used
    const spB = await settings('Speed, RPM and fuel');
    await spB.locator('button', { hasText: 'Add a barred range' }).click();
    const brow = spB.locator('table.barred tbody tr').last();
    for (const [k, v] of [[0, '64'], [1, '67'], [2, 'critical: vibration']]) { const inp = brow.locator('input').nth(k); await inp.fill(v); await inp.dispatchEvent('change'); }
    const spSet = await settings('Safe speed plan');
    ok((await spSet.locator('label.switch').count()) === 7, 'safe speed plan settings: what to avoid (6 switches) and stops');
    await go(page, 'Optimise');
    await page.locator('.g-shell > .g-seg button', { hasText: 'Speed only' }).click();
    const tSp = Date.now();
    await page.locator('button', { hasText: 'Work out a safe speed plan' }).click();
    await page.waitForSelector('table.segs tbody tr', { timeout: 120000 });
    const splTxt = await page.locator('#pane').innerText();
    ok(/Done/.test(splTxt) && (await page.locator('table.cmp tbody tr').count()) === 2, `safe speed plan worked out and compared with your speeds (${((Date.now() - tSp) / 1000).toFixed(1)} s): ` + (splTxt.match(/Done[^\n]*/) || [''])[0]);
    const spRpms = (await page.locator('table.segs tbody tr.seg').evaluateAll(rs => rs.map(r => Number(r.children[4].textContent)))).filter(x => x > 0);
    ok(spRpms.length > 0 && spRpms.every(x => x < 64 || x > 67), 'no barred RPM in the plan: ' + spRpms.join(', '));
    const whys = await page.locator('table.segs td.why').allInnerTexts();
    ok(whys.length > 0 && whys.every(w => w.trim().length > 10), 'each change has a reason: ' + whys[0].slice(0, 120));
    ok((await page.locator('.strip span').count()) === whys.length, 'time strip shows the speed along the voyage');
    await page.screenshot({ path: `${out}/23-speed-plan.png`, fullPage: false });
    const wpsBeforeSp = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).route.waypoints.length);
    await page.locator('button', { hasText: 'Use this speed plan' }).click();
    await page.waitForTimeout(500);
    const wpsAfterSp = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).route.waypoints.length);
    ok(/Speed plan taken/.test(await page.locator('#pane').innerText()) && wpsAfterSp >= wpsBeforeSp, `speed plan taken into the route (${wpsBeforeSp} → ${wpsAfterSp} waypoints), copy kept in Compare`);
    // the route as it was is in the Compare tab: put it back for the tests below
    await go(page, 'Compare');
    const cmpRows = page.locator('tr:has(input.name)');
    const bIdx = await cmpRows.evaluateAll(rs => rs.findIndex(r => r.querySelector('input.name').value.includes('before safe speed plan')));
    ok(bIdx >= 0, 'route as it was kept in the Compare tab');
    const beforeRow = cmpRows.nth(bIdx);
    await beforeRow.locator('button', { hasText: 'Open' }).click();
    await page.waitForTimeout(500);
    ok((await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).route.waypoints.length)) === wpsBeforeSp, 'and can be opened again in the Route tab');
    await go(page, 'Optimise');
    await page.locator('.g-shell > .g-seg button', { hasText: 'Change the track' }).click();

    // roll mark for the optimiser's roll check (step 4)
    const markIn = (await settings('Roll and pitch estimate')).locator('label', { hasText: 'Mark roll above' }).locator('input');
    await markIn.fill('3'); await markIn.dispatchEvent('change');
    // Route optimisation: versions compared in a track list, one taken into the route
    await go(page, 'Optimise');
    const wpBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).route.waypoints.length);
    const tOpt = Date.now();
    await page.locator('button', { hasText: 'Optimise route' }).click();
    await page.waitForSelector('#pane table tbody tr:nth-child(5)', { timeout: 120000 });
    const optRows = await page.locator('#pane table tbody tr').allInnerTexts();
    ok(optRows.length === 5 && /Your route/.test(optRows[0]) && /great circles/.test(optRows[2]) && /rhumb lines/.test(optRows[3]) && /composite/.test(optRows[4]), `optimiser: your route + optimised, GC, RL, composite versions (${((Date.now() - tOpt) / 1000).toFixed(1)} s)`);
    const optTxt = await page.locator('#pane').innerText();
    ok(/Roll estimate stays under your mark \(3°\)|were avoided|remains in \d+ place|Keeping out of every place with roll above/.test(optTxt), 'optimiser checks the roll against your mark: ' + ((optTxt.match(/(Roll estimate stays[^.]*|Places with roll above[^.]*|Roll above your mark[^.]*|Keeping out of every place[^.]*)\./) || [''])[0]));
    ok(/Weather data: .*forecast points over the search area/.test(optTxt), 'optimiser shows the forecast run and fetch time');
    ok((await page.locator('.leaflet-overlay-pane path[stroke-dasharray]').count()) >= 3, 'optimised versions drawn on the map (dashed)');
    ok(/\d+ \/ \d+\.\d/.test(optRows[1]), 'optimiser shows the largest roll / pitch estimate per version');
    await page.locator('button', { hasText: 'Full-size table' }).click();
    ok((await page.locator('.pp-overlay table tbody tr').count()) === 5, 'optimiser full-size table');
    await page.screenshot({ path: `${out}/18b-optimise-full.png` });
    await page.locator('.pp-overlay button', { hasText: 'Close' }).click();
    await page.screenshot({ path: `${out}/18-optimise.png` });
    await page.locator('#pane table tbody tr').nth(1).locator('button', { hasText: 'Use' }).click();
    await page.waitForTimeout(800);
    const wpAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).route.waypoints.length);
    ok(wpAfter !== wpBefore || /taken/.test(await page.locator('#pane table tbody tr').nth(1).getAttribute('class')), `optimised route taken into the route (${wpBefore} → ${wpAfter} waypoints)`);

    // Exports
    await go(page, 'Route');
    for (const f of ['rtz', 'rt3', 'bvs', 'gpx', 'xlsx', 'csv', 'txt']) {
        await page.locator('select[title="File type to save"]').selectOption(f);
        const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('select[title="File type to save"] + button').click()]);
        const p = path.join(out, dl.suggestedFilename());
        await dl.saveAs(p);
        ok(fs.statSync(p).size > 100, `download ${dl.suggestedFilename()} (${fs.statSync(p).size} bytes)`);
    }

    // Open a made-up BVS file: ship particulars offered (dialog accepted), fixed time kept
    await page.setInputFiles('input[type=file]', path.join(__dirname, '../test/fixtures/made-up-bvs.bvs'));
    await page.waitForSelector('text=Opened');
    const bvsMsg = await page.locator('#pane').innerText();
    ok(/6 waypoints/.test(bvsMsg) && /particulars .*copied/.test(bvsMsg), 'BVS file opened, ship particulars copied');
    const pinned = await page.locator('.tablewrap tbody tr').nth(3).locator('td').nth(13).innerText();
    ok(pinned.includes('📌') && pinned.includes('03 Nov 00:00'), 'BVS fixed time shown as a fixed ETA: ' + pinned);
    const shipSec2 = await settings('Ship particulars');
    const gmVal = await shipSec2.locator('input').evaluateAll(els => els.map(e => e.value));
    ok(gmVal.includes('TEST SHIP') && gmVal.includes('3'), 'Ship tab filled from the BVS file');
    await go(page, 'Route');

    // Isobars switched on when the plugin opened
    ok(await page.evaluate(() => window.__store.get('isolinesOn') === true && window.__store.get('isolinesType') === 'pressure'), 'isobars (pressure lines) on by default');

    // Usage tab: totals, heat map, activity log saved as a file
    await go(page, 'Usage');
    await page.waitForTimeout(300);
    const usageTxt = await page.locator('#pane').innerText();
    ok(/routes planned/.test(usageTxt) && /fuel saved/.test(usageTxt) && /hours open/.test(usageTxt), 'Usage tab shows the totals');
    const planned = Number((usageTxt.match(/(\d+)\s*routes planned/) || [])[1] || 0);
    ok(planned >= 1, `routes planned counted: ${planned}`);
    ok(/1\s*optimisations \(1 taken\)|optimisations \(1 taken\)/.test(usageTxt), 'usage counts the optimisation taken: ' + (usageTxt.match(/\d+\s*optimisations[^\n]*/) || [''])[0]);
    await page.locator('button', { hasText: 'Show usage map' }).click();
    await page.waitForTimeout(300);
    const heat = await page.locator('.leaflet-overlay-pane path.leaflet-interactive, .leaflet-overlay-pane path').count();
    ok(heat > 0, `usage heat map drawn (${heat} shapes on the map)`);
    await page.screenshot({ path: `${out}/17-usage.png` });
    await page.locator('button', { hasText: 'Hide usage map' }).click();
    const [logDl] = await Promise.all([page.waitForEvent('download'), page.locator('#pane button', { hasText: 'Save activity log' }).first().click()]);
    const logPath = path.join(out, 'activity-log.json');
    await logDl.saveAs(logPath);
    const logJson = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    const kinds = new Set(logJson.entries.map(e => e.kind));
    ok(/^passage-plan-log-\d{8}-\d{4}Z\.json$/.test(logDl.suggestedFilename()), 'log file name with UTC time: ' + logDl.suggestedFilename());
    ok(kinds.has('open') && kinds.has('weather') && kinds.has('route') && kinds.has('layer'), 'log has open, route, weather and layer entries: ' + [...kinds].join(','));
    ok(kinds.has('click') && kinds.has('change') && kinds.has('screen') && kinds.has('windy'), 'log records buttons pressed, settings changed, window / panel sizes and Windy layer changes');
    ok(logJson.entries.some(e => e.kind === 'click' && /Work out a safe speed plan/.test(e.msg)) && logJson.entries.some(e => e.kind === 'change' && /→/.test(e.msg)), 'log entries say which button and which setting');
    ok(logJson.plugin && logJson.route && Array.isArray(logJson.route.legs) && logJson.ship, 'log header has plugin, route, legs and ship');
    await go(page, 'Feedback');
    ok((await page.locator('.fb button', { hasText: 'Save activity log' }).count()) === 1, 'Save activity log button in Help → Feedback');

    // Reading currents pauses while the tab is hidden, carries on by itself when visible again
    await go(page, 'Weather');
    await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hidden }));
    if (!(await page.locator('button', { hasText: 'Read currents (exp.)' }).count())) {
        // the route opened last has no forecast yet
        await page.locator('button', { hasText: /Get (latest )?forecast along route/ }).click();
        await page.waitForSelector('.wo', { state: 'detached', timeout: 180000 });
    }
    await page.locator('button', { hasText: 'Read currents (exp.)' }).click();
    await page.waitForSelector('.wo', { timeout: 5000 });
    await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    // the step under way finishes first, then it pauses (wait for the message rather than a fixed time)
    await page.waitForFunction(() => /Paused: this Windy tab is hidden/.test((document.querySelector('.wo') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => {});
    const pausedTxt = await page.locator('.wo').innerText().catch(() => '');
    ok(/Paused: this Windy tab is hidden/.test(pausedTxt), 'currents reading pauses while the tab is hidden (and says why)' + (/Paused/.test(pausedTxt) ? '' : ' [saw: ' + pausedTxt.replace(/\s+/g, ' ').slice(0, 160) + ']'));
    const prog1 = await page.locator('.wo').innerText().catch(() => '');
    await page.waitForTimeout(1500);
    ok(prog1 === (await page.locator('.wo').innerText().catch(() => '')), 'no progress while hidden (no readings from an undrawn map)');
    await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForSelector('.wo', { state: 'detached', timeout: 180000 });
    ok(/Ocean currents: read at \d+ of \d+ times/.test(await page.locator('#pane').innerText()), 'reading carried on by itself and finished when visible again');


    // ---------- 0.23.0 (owner, 2026-11-02): ⓘ hints, Distances, seamarks, free forecast fill, past weather ----------
    await go(page, 'Weather');
    await page.locator('.g-card', { hasText: 'Forecast along the route' }).locator('.g-hint').first().click();
    await page.waitForTimeout(150);
    ok((await page.locator('.g-pop').count()) === 1 && /ECMWF/.test(await page.locator('.g-pop').innerText()), 'ⓘ opens a small explanation (Weather → where the weather comes from)');
    await page.screenshot({ path: `${out}/31-hint.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    ok((await page.locator('.g-pop').count()) === 0, 'Esc closes the explanation');
    // nautical charts: OpenSeaMap tiles (the real server is not reachable from the test computer: a stand-in transparent tile)
    const png1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.route(/tiles\.openseamap\.org/, route => route.fulfill({ status: 200, contentType: 'image/png', body: png1 }));
    await page.locator('.wavechart button', { hasText: 'Seamarks' }).click();
    await page.evaluate(() => window.__map.setView([51.9, 4.0], 10, { animate: false }));
    await page.waitForTimeout(800);
    const chartLegTxt = await page.locator(".pp-chart-legend").innerText().catch(() => '');
    ok(/OpenSeaMap/.test(chartLegTxt) && /Not for navigation/i.test(chartLegTxt), 'seamark overlay on, with source and "not for navigation" on the map: ' + chartLegTxt.replace(/\s+/g, ' ').slice(0, 90));
    ok((await page.locator('img[src*="openseamap"]').count()) > 0, 'seamark tiles requested');
    await page.screenshot({ path: `${out}/32-seamarks.png` });
    await page.locator('.wavechart button', { hasText: 'Seamarks' }).click();
    ok((await page.locator('.pp-chart-legend').count()) === 0, 'seamark overlay off again');
    // Distances
    await go(page, 'Distances');
    await page.locator('.pk input').nth(0).fill('Rotterdam');
    await page.locator('.pk__opt', { hasText: 'Rotterdam' }).first().click();
    await page.locator('.pk input').nth(1).fill('Singapore');
    await page.locator('.pk__opt', { hasText: 'Singapore' }).first().click();
    await page.locator('button', { hasText: /^\s*Add\s*$/ }).click();
    await page.waitForTimeout(1500);
    const dRow = await page.locator('.ds-tbl tbody tr').first().innerText().catch(() => '');
    const seaNm = Number((dRow.match(/\t(\d{4,5})\t/g) || []).map(x => x.trim()).slice(-1)[0] || 0);
    ok(/Suez Canal/.test(dRow) && /Gibraltar/.test(dRow), 'Rotterdam → Singapore along the sea lanes via Gibraltar and Suez: ' + dRow.replace(/\s+/g, ' '));
    ok((await page.locator('path.pp-dist').count()) >= 3, 'distance lines on the map (GC, RL, sea lanes)');
    await page.screenshot({ path: `${out}/30-distances.png` });
    ok(/Along my route/.test(await page.locator('#pane').innerText()), 'places along my route listed');
    // free forecast (Open-Meteo) for times beyond a free Windy plan: stand-in answers, made-up numbers
    const omHits = [];
    const omFake = route => {
        const u = new URL(route.request().url());
        omHits.push(u.hostname);
        const t0 = Math.floor(Date.now() / 3600e3) * 3600 - 24 * 3600 * Number(u.searchParams.get('past_days') || 0);
        const time = Array.from({ length: 24 * 17 }, (_, i) => t0 + i * 3600);
        const hourly = u.hostname.startsWith('marine')
            ? { time, wave_height: time.map(() => 3.3), wave_direction: time.map(() => 250), wave_period: time.map(() => 10), wind_wave_height: time.map(() => 1.4), wind_wave_direction: time.map(() => 240), wind_wave_period: time.map(() => 5), swell_wave_height: time.map(() => 2.9), swell_wave_direction: time.map(() => 260), swell_wave_period: time.map(() => 12), secondary_swell_wave_height: time.map(() => 0.6), secondary_swell_wave_direction: time.map(() => 180), secondary_swell_wave_period: time.map(() => 8) }
            : { time, wind_speed_10m: time.map(() => 9), wind_direction_10m: time.map(() => 250), wind_gusts_10m: time.map(() => 12), pressure_msl: time.map(() => 1012), temperature_2m: time.map(() => 22), precipitation: time.map(() => 0), weather_code: time.map(() => 2), visibility: time.map(() => 20000) };
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hourly }) });
    };
    await page.route(/open-meteo\.com/, omFake);
    await page.evaluate(() => (window.__windyFree = true));
    await go(page, 'Route');
    await page.setInputFiles('input[type=file]', fixture);
    await page.waitForTimeout(300);
    await go(page, 'Weather');
    await page.locator('button', { hasText: /Get (latest )?forecast along route/ }).click();
    await page.waitForSelector('.wo', { state: 'detached', timeout: 180000 });
    await page.waitForTimeout(300);
    const wxPane = await page.locator('#pane').innerText();
    ok(omHits.length > 0, `Open-Meteo asked where the (free) Windy forecast ends (${omHits.length} requests)`);
    ok(/Your Windy plan gives 3-hour steps/.test(wxPane) && /sample days/.test(wxPane), 'free Windy plan recognised (3-hour steps, sample days left out)');
    ok(/Open-Meteo \(free\)/.test(wxPane), 'weather data line names Open-Meteo and the times it covers');
    ok((await page.locator('.tablewrap .srcmk.om').count()) > 0, 'rows filled from Open-Meteo marked OM in the weather table');
    await page.screenshot({ path: `${out}/33-free-forecast.png` });
    await page.evaluate(() => (window.__windyFree = false));
    await page.unroute(/open-meteo\.com/, omFake);


    // ---------- 0.25 (owner, 2026-11-02): weather under the cursor, range rings ----------
    await go(page, 'Route');
    await page.evaluate(() => window.__store.set('timestamp', Math.round(Date.now() / 3600e3) * 3600e3 + 6 * 3600e3));
    await page.locator('button', { hasText: 'Show on map' }).first().click();
    await page.waitForTimeout(800);
    ok((await page.locator('.cb').count()) === 1, 'weather-under-the-cursor bar shown at the top of the map by default');
    const cbMap = await page.locator('#map').boundingBox();
    await page.mouse.move(cbMap.x + cbMap.width * 0.5, cbMap.y + cbMap.height * 0.55);
    await page.waitForTimeout(1500);
    const cbTxt = await page.locator('.cb').innerText();
    ok(/\d+°\d+\.\d'[NS]/.test(cbTxt) && /Wind\s+\d+ kn/.test(cbTxt) && /SWH\s+\d+\.\d m/.test(cbTxt) && /Swell 1/.test(cbTxt) && /hPa/.test(cbTxt) && /Sea temp/.test(cbTxt), 'cursor bar shows position, wind, waves, pressure and temperatures: ' + cbTxt.replace(/\s+/g, ' ').slice(0, 160));
    await page.screenshot({ path: `${out}/34-cursor-bar-rings.png` });
    const rings = await page.locator('path.pp-ring').count();
    ok(rings === 3, `three range rings around the ship at the map time (${rings})`);
    const lbl1 = await page.locator('.pp-ring-label').allInnerTexts();
    await page.evaluate(() => window.__map.setZoom(window.__map.getZoom() + 2, { animate: false }));
    await page.waitForTimeout(600);
    const lbl2 = await page.locator('.pp-ring-label').allInnerTexts();
    ok(lbl1.length === 3 && lbl2.length === 3 && lbl1[0] !== lbl2[0], `ring spacing follows the map scale (${lbl1.join('/')} → ${lbl2.join('/')})`);
    await page.locator('.cb button[aria-label="Minimise"]').click();
    ok((await page.locator('.cb.cb--min').count()) === 1, 'cursor bar minimises');
    await page.locator('.cb button[aria-label="Show everything"]').click();
    await page.locator('.cb button[aria-label="Close"]').click();
    ok((await page.locator('.cb').count()) === 0, 'cursor bar closes (Settings → Map display brings it back)');
    const mdSec = await settings('Map display');
    await mdSec.locator('label', { hasText: 'Weather under the cursor' }).locator('input').check();
    ok((await page.locator('.cb').count()) === 1, 'cursor bar switched on again from Settings');

    // Updates: newer version found, one-click install through Windy, or the manual steps
    // two newer versions than this one: the plugin must find the newest
    const [ma, mi, pa] = require('../package.json').version.split('.').map(Number);
    const newer = `${ma}.${mi + 1}.0`;
    published.add(`${ma}.${mi}.${pa + 1}`);
    published.add(newer);
    await go(page, 'Feedback');
    await page.locator('.fb button', { hasText: 'Check for updates' }).click();
    await go(page, 'Route');
    await page.waitForSelector('.ub.new', { timeout: 10000 });
    ok(new RegExp(`Version ${newer.replace(/\./g, '\\.')} is available`).test(await page.locator('.ub.new').innerText()), `update check finds the newest published version (${newer})`);
    await page.locator('.ub.new button', { hasText: 'Install update' }).click();
    await page.waitForTimeout(300);
    ok((await page.locator('.ub.new ol.steps li').count()) === 7 && (await page.locator('.ub.new').innerText()).includes(`${newer}/plugin.min.js`), 'no one-click install here: the 7 steps with the new link are shown');
    await page.evaluate(() => (window.W = { externalPlugins: { installExternalPlugin: async url => { window.__installs = (window.__installs || 0) + 1; window.__installed = url; } } }));
    dismissDialogs = true; // answer "not now" to "Reload now?"
    await page.locator('.ub.new button', { hasText: 'Install update' }).click();
    await page.waitForTimeout(300);
    ok((await page.evaluate(() => window.__installed)) === `https://windy-plugins.com/7865207/windy-plugin-passage-plan/${newer}/plugin.min.js` && /installed\. Windy must reload the page/.test(await page.locator('.ub.new').innerText()), 'one-click install through Windy when it allows it');
    ok((await page.locator('.ub.new button', { hasText: 'Install update' }).count()) === 0 && (await page.locator('.ub.new button', { hasText: 'Reload Windy now' }).count()) === 1, 'after installing: no second install, a "Reload Windy now" button instead');
    await page.screenshot({ path: `${out}/20-update.png` });
    dismissDialogs = false;
    await page.evaluate(() => (window.__beforeReload = 1));
    await page.locator('.ub.new button', { hasText: 'Reload Windy now' }).click();
    await page.waitForTimeout(1500);
    ok((await page.evaluate(() => window.__beforeReload)) === undefined, 'Reload Windy now reloads the page (new version starts cleanly)');

    ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' / ') : ''));

    // After an update: "What's new" at the top, once
    await page.evaluate(() => {
        const k = 'windy-plugin-passage-plan:updates';
        localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), seen: '0.12.1', latest: null }));
    });
    await page.reload();
    await page.waitForTimeout(800);
    const wn = await page.locator('.ub.ok').innerText().catch(() => '');
    ok(/Updated to version \d+\.\d+\.\d+/.test(wn) && /What's new/.test(wn), "after an update: what's new shown");
    await page.screenshot({ path: `${out}/21-whats-new.png` });
    // a long "What's new" must not block the panel: close button at the top, the list scrolls on its own, the panel scrolls
    const ubBox = await page.locator('.ub.ok').boundingBox();
    ok(ubBox && ubBox.height < 600, `what's new stays compact (${Math.round(ubBox?.height ?? 0)} px)`);
    const scrolled = await page.evaluate(() => { const el = document.querySelector('.plugin__content'); el.scrollTop = 400; return el.scrollTop; });
    ok(scrolled > 0, `the panel scrolls with the what's new note open (${scrolled} px)`);
    await page.evaluate(() => (document.querySelector('.plugin__content').scrollTop = 0));
    await page.locator('.ub.ok button', { hasText: 'OK, close' }).click();
    ok((await page.locator('.ub.ok').count()) === 0, "what's new closes from the button at its top");
    await browser.close();
    console.log(log.join('\n'));
})().catch(e => { console.log(log.join('\n')); console.error(e); process.exit(1); });
