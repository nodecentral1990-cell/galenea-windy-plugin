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
const localStoragePlace = raw => { try { const p = JSON.parse(raw); return `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`; } catch { return ''; } };
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
        case 'Polar': case 'Motion': await closeHelp(); await nav('Motion'); return seg('At the map time');
        case 'Weather': await closeHelp(); await nav('Weather'); return seg('Along route');
        case 'Map charts': await closeHelp(); await nav('Weather'); return seg('Map charts');
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
    // the sea-area data (public code page on GitHub) from this folder: the test computer cannot reach GitHub's raw files
    const seaDir = path.join(__dirname, '..', 'data', 'seaareas');
    const dataDir = path.join(__dirname, '..', 'data');
    const seaHits = [];
    await page.route(/raw\.githubusercontent\.com\/.*\/data\/(seaareas|climate|seanet)\//, route => {
        const rel = route.request().url().split('/data/seaareas/')[1] ?? '';
        if (rel) seaHits.push(rel);
        const f = path.join(dataDir, route.request().url().split('/data/')[1]);
        if (!f.startsWith(dataDir) || !fs.existsSync(f)) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'not found' });
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    });
    page.on('requestfailed', r => log.push('NOTE request failed: ' + r.url().slice(0, 120)));
    // The checks below were written for "press Get forecast, then Windy's map is read": start with that (the weather
    // by itself, 2026-11-19, is switched on and checked near the end)
    await page.addInitScript(() => {
        if (!localStorage.getItem('windy-plugin-passage-plan:wxauto')) localStorage.setItem('windy-plugin-passage-plan:wxauto', JSON.stringify({ followRoute: false, every3h: false, extras: false, readMap: true }));
    });
    await page.goto(page_url);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/01-empty.png` });
    // voyage strip (UI reimagine, owner 2026-11-13): with no route it says how to start
    ok((await page.locator('.g-voy[data-state="empty"] button', { hasText: 'Open a route file' }).count()) === 1, 'voyage strip, no route: "Open a route file" is the next step');
    ok(await page.evaluate(() => ['static', 'relative'].includes(getComputedStyle(document.querySelector('.g-voy')).position)), 'voyage strip is in the normal flow of the panel (not fixed or sticky)');
    ok(/Planning aid only/.test(await page.locator('.g-aid').innerText()), '"Planning aid only" line visible at the top of the panel');
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
    ok((await page.locator('.g-voy[data-state="etd"] button', { hasText: 'Set the ETD' }).count()) === 1, 'voyage strip, route without ETD: "Set the ETD" is the next step');

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
        const below = await page.locator('.g-card__title', { hasText: 'Waypoints' }).boundingBox(); // the card under Times (the Voyage card is now one line below the waypoints)
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
    ok((await page.locator('.g-voy[data-state="forecast"] [data-g="strip-forecast"]').count()) === 1 && /1657 nm/.test(await page.locator('.g-voy').innerText()), 'voyage strip, route + ETD: route, times, distance and "Get forecast" as the next step');
    // "Add waypoints by clicking the map" now shows a note on the map; Esc ends it
    await page.locator('label.check', { hasText: 'Add waypoints by clicking the map' }).locator('input').check();
    ok(/Click the map to add waypoints/.test(await page.locator('.pp-maptool').innerText().catch(() => '')), 'map tool: a note on the map says clicks add waypoints');
    await page.locator('#map').hover();
    await page.keyboard.press('Escape');
    ok((await page.locator('.pp-maptool').count()) === 0 && !(await page.locator('label.check', { hasText: 'Add waypoints by clicking the map' }).locator('input').isChecked()), 'map tool: Esc ends "add waypoints" and the note goes');
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
    // Ctrl+Z / Ctrl+Y (owner, 2026-11-23): the whole drag is one step, no limit
    {
        const latOf = () => page.locator('.tablewrap tbody tr').nth(1).locator('input.pos').first().inputValue();
        await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(200);
        ok((await latOf()) === lat0, `Ctrl+Z puts WP2 back where it was before the drag (${await latOf()})`);
        await page.keyboard.press('Control+y');
        await page.waitForTimeout(200);
        ok((await latOf()) === lat1, 'Ctrl+Y moves it again (redo)');
        // a second drag, then two undos: back to the start; then two redos
        const b2 = await page.locator('.pp-wp', { hasText: /^2$/ }).boundingBox();
        await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
        await page.mouse.down();
        await page.mouse.move(b2.x + 60, b2.y + 40, { steps: 12 });
        await page.waitForTimeout(800); // a pause in the middle of the drag stays in the same step
        await page.mouse.move(b2.x + 70, b2.y + 50, { steps: 3 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        const lat2 = await latOf();
        await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(150);
        const afterOne = await latOf();
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(150);
        ok(lat2 !== lat1 && afterOne === lat1 && (await latOf()) === lat0, `two drags, two Ctrl+Z: one step each, back to the start (${lat2} → ${afterOne} → ${await latOf()})`);
        await page.locator('.rt-redo').click();
        await page.locator('.rt-redo').click();
        await page.waitForTimeout(150);
        ok((await latOf()) === lat2 && (await page.locator('.rt-redo').isDisabled()), 'the Redo button goes forward the same steps');
        // leave the route as the checks below expect it (WP2 after the first drag)
        await page.locator('.rt-undo').click();
        await page.waitForTimeout(150);
        ok((await latOf()) === lat1, 'the Undo button goes back one step');
    }

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
    // floating window (owner, 2026-11-13): minimise, move, resize, original size
    await page.locator('.pp-overlay .g-fw__min').click();
    ok((await page.locator('.pp-overlay .pp-overlay__body').isVisible()) === false, 'full-size window minimises to its title bar');
    await page.locator('.pp-overlay .g-fw__min').click();
    // resize first (the corner is on the screen), then move
    const ovc = await page.locator('.pp-overlay .g-fw__grip--c').boundingBox();
    await page.mouse.move(ovc.x + 5, ovc.y + 5);
    await page.mouse.down();
    await page.mouse.move(ovc.x - 195, ovc.y - 145, { steps: 5 });
    await page.mouse.up();
    const ovSized = await page.locator('.pp-overlay').boundingBox();
    const ovh = await page.locator('.pp-overlay .pp-overlay__head').boundingBox();
    await page.mouse.move(ovh.x + 200, ovh.y + ovh.height / 2);
    await page.mouse.down();
    await page.mouse.move(ovh.x + 260, ovh.y + 90, { steps: 5 });
    await page.mouse.up();
    const ovMoved = await page.locator('.pp-overlay').boundingBox();
    ok(ovSized.width < ov.width - 150 && ovSized.height < ov.height - 100 && Math.abs(ovMoved.x - ovSized.x - 60) < 6 && Math.abs(ovMoved.y - ovSized.y - 70) < 25, `full-size window resizes and moves (${Math.round(ov.width)}×${Math.round(ov.height)} → ${Math.round(ovSized.width)}×${Math.round(ovSized.height)}; ${Math.round(ovSized.x)},${Math.round(ovSized.y)} → ${Math.round(ovMoved.x)},${Math.round(ovMoved.y)})`);
    await page.locator('.pp-overlay .g-fw__reset').click();
    const ovBack = await page.locator('.pp-overlay').boundingBox();
    ok(Math.abs(ovBack.x - ov.x) < 2 && Math.abs(ovBack.width - ov.width) < 2 && Math.abs(ovBack.height - ov.height) < 2, 'full-size window back to its original size and place with ↺');
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

    // ---------- UI reimagine (owner, 2026-11-13): weather table first, voyage strip, gear beside the function ----------
    {
        const scrollTop = v => page.evaluate(x => { const el = document.querySelector('.plugin__content'); if (x != null) el.scrollTop = x; return el.scrollTop; }, v);
        await scrollTop(0);
        const tblCard = page.locator('.g-card', { hasText: 'Weather table' });
        const tblTop = (await tblCard.boundingBox()).y;
        ok(tblTop < 950, `weather table starts inside the first screen after the forecast, straight under the forecast card (top at ${Math.round(tblTop)} px)`);
        ok((await page.locator('.g-shell > .g-seg button').count()) === 4 && (await page.locator('.g-shell > .g-seg button.is-on').innerText()).includes('Along route'), 'Weather has four views: Along route, Port weather, Tides, Map charts');
        // voyage strip: worst ahead = largest SWH in the table rows ahead; provenance shown
        const stripTxt = (await page.locator('.g-voy').innerText()).replace(/\s+/g, ' ');
        const swhCol = await page.locator('#pane .tablewrap table').first().evaluate(tbl => {
            const heads = [...tbl.querySelectorAll('thead tr:last-child th')].map(th => th.textContent.trim());
            const idx = heads.indexOf('m'); // the first "m" column is the SWH height
            return [...tbl.querySelectorAll('tbody tr')].filter(tr => !tr.classList.contains('past') && tr.children.length === heads.length).map(tr => Number(tr.children[idx].textContent)).filter(v => isFinite(v));
        });
        const worstTbl = Math.max(...swhCol);
        const worstStrip = Number((stripTxt.match(/SWH ([\d.]+) m/) || [])[1]);
        ok(Math.abs(worstStrip - worstTbl) < 0.051, `voyage strip: "Worst ahead" SWH ${worstStrip} m = the largest SWH in the weather table rows ahead (${worstTbl})`);
        ok(/in this forecast/.test(stripTxt) && /Weather data: Windy ECMWF run .* UTC · fetched .* UTC \(\d+ min ago\)/.test(stripTxt), 'voyage strip: says which forecast run and when it was fetched: ' + stripTxt.slice(-110));
        ok(!/getting old/.test(stripTxt), 'voyage strip: a fresh forecast is not called old');
        const tsBefore = await page.evaluate(() => window.__store.get('timestamp'));
        await page.locator('[data-g="strip-worst"]').click();
        await page.waitForTimeout(300);
        const tsAfter = await page.evaluate(() => window.__store.get('timestamp'));
        ok(tsAfter !== tsBefore && (await page.locator('nav.g-nav button.is-on').innerText()).includes('Motion'), 'voyage strip: clicking the worst sets the map time to it and opens Motion');
        ok((await page.locator('.g-aid').count()) === 1 && (await page.locator('.g-voy').count()) === 1, 'aid line and voyage strip stay on every section');
        await page.evaluate(t => window.__store.set('timestamp', t), tsBefore);
        await go(page, 'Weather');

        // gear beside the weather table: its settings open in place, the table stays
        const gear = tblCard.locator('.g-card__head [data-g="gear"]');
        ok((await gear.count()) === 1 && /Settings: Weather limits/.test(await gear.getAttribute('title')), 'weather table card has one gear (Weather limits)');
        const gearCol = await gear.evaluate(e => getComputedStyle(e).color);
        await gear.click();
        await page.waitForTimeout(200);
        const foldBox = tblCard.locator('.g-fold');
        ok((await foldBox.count()) === 1 && (await page.locator('nav.g-nav button.is-on').innerText()).includes('Weather') && (await page.locator('#pane .tablewrap tbody tr').count()) > 20, 'gear opens the settings in place: still in Weather, the table still there');
        ok(await foldBox.evaluate(e => ['static', 'relative'].includes(getComputedStyle(e).position)), 'the fold-out is an ordinary block in the panel (nothing floats)');
        ok((await foldBox.locator('.g-fold__chip').count()) >= 3 && (await foldBox.locator('table tbody tr').count()) === 5, 'fold-out shows the limits by sector, with chips for the other groups this table uses');
        ok(await foldBox.evaluate(e => e.contains(document.activeElement)), 'keyboard focus moves into the fold-out');
        const noWarnCol = c => !/rgb\(244, 182, 63\)|rgb\(255, 92, 92\)/.test(c);
        ok(noWarnCol(gearCol) && noWarnCol(await gear.evaluate(e => getComputedStyle(e).color)) && noWarnCol(await foldBox.evaluate(e => getComputedStyle(e).borderLeftColor)), 'gear and fold-out never use the warning colours (amber / red)');
        // change a limit through the gear (SWH limit raised out of reach): the table's red cells change while it is on screen
        const red0 = await page.locator('#pane .tablewrap td.lv2').count();
        const windLimit = foldBox.locator('.hs input').nth(1);
        const wind0 = await windLimit.inputValue();
        await windLimit.fill('99'); await windLimit.dispatchEvent('change');
        await page.waitForTimeout(300);
        const red1 = await page.locator('#pane .tablewrap td.lv2').count();
        const tblVisible = await page.locator('#pane .tablewrap').first().evaluate(e => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
        ok(red0 > 0 && red1 < red0 && tblVisible, `a limit changed through the gear recolours the table at once, table still on screen (red cells ${red0} → ${red1})`);
        await page.screenshot({ path: `${out}/40-gear-weather-table.png` });
        await windLimit.fill(wind0); await windLimit.dispatchEvent('change');
        await page.waitForTimeout(200);
        ok((await page.locator('#pane .tablewrap td.lv2').count()) === red0, 'limit put back: the table is as before');
        // the panel still scrolls with a fold-out open
        await scrollTop(0);
        ok((await scrollTop(300)) > 0, 'the panel still scrolls with a fold-out open');
        // one at a time
        await scrollTop(0);
        await page.locator('.g-card', { hasText: 'Forecast along the route' }).locator('.g-card__head [data-g="gear"]').click();
        await page.waitForTimeout(200);
        ok((await page.locator('#pane .g-fold').count()) === 1 && /Weather reading/.test(await page.locator('#pane .g-fold__title').innerText()), 'only one fold-out open at a time (opening another gear closes the first)');
        ok((await page.locator('#pane .g-fold input[type=checkbox]').count()) === 6, 'forecast card gear: the Weather reading switches (by itself after route changes, newer run, downloads, Windy map, free fill, climate beyond the forecast)');
        // Esc closes, focus back on the gear
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        ok((await page.locator('#pane .g-fold').count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute('data-gear'))) === 'weather', 'Esc closes the fold-out and the keyboard focus is back on its gear');
        // line gear on the echo line opens the same group
        await page.locator('.wx-echo [data-g="gear"]').click();
        await page.waitForTimeout(150);
        ok(/Weather reading/.test(await page.locator('#pane .g-fold__title').innerText().catch(() => '')), 'the small gear at the end of the "currents and visibility … free fill" line opens the same settings');
        await page.locator('#pane .g-fold .g-fold__done').first().click();
        ok((await page.locator('#pane .g-fold').count()) === 0, 'Done closes the fold-out');
        // "All settings": the Settings tab, that group open and in view (the old buttons opened it without scrolling to it)
        await gear.click();
        await tblCard.locator('.g-fold__chip', { hasText: 'Roll and pitch marks' }).click();
        await page.waitForTimeout(150);
        ok(/Mark roll above/.test(await tblCard.locator('.g-fold').innerText()) && !/Bilge keels \(one side/.test(await tblCard.locator('.g-fold').innerText()), 'a chip shows only the part needed here (roll and pitch marks, not the whole group)');
        await tblCard.locator('.g-fold button', { hasText: 'More in Roll and pitch estimate' }).click();
        await page.waitForTimeout(150);
        ok(/Bilge keels \(one side/.test(await tblCard.locator('.g-fold').innerText()), '"More in …" shows the whole group in the same fold-out');
        await tblCard.locator('.g-fold button', { hasText: 'All settings' }).click();
        await page.waitForTimeout(400);
        const motD = page.locator('details#st-motion');
        const motBox = await motD.locator('summary').boundingBox();
        const paneBox = await page.locator('.plugin__content').boundingBox();
        ok((await page.locator('nav.g-nav button.is-on').innerText()).includes('Settings') && (await motD.evaluate(e => e.open)) && motBox && motBox.y >= paneBox.y - 2 && motBox.y < paneBox.y + paneBox.height - 40, `"All settings" goes to Settings with that group open and in view (its title at ${Math.round(motBox?.y ?? -1)} px)`);
        ok((await page.locator('details[open]').count()) === 1, '"All settings" closes the other groups, so the one asked for is not lost among them');
        // Settings tab still lists every group, with search and "Used in"
        const titles = await page.locator('details > summary .st-title').allInnerTexts();
        ok(titles.length === 14 && ['Ship particulars', 'Roll and pitch estimate', 'Speed, RPM and fuel', 'Weather limits', 'Polar diagram', 'Map display', 'Route editing', 'Weather reading', 'Nautical charts and places', 'Wave chart (your colours)', 'Route optimisation', 'Safe speed and course plan', 'Updates', 'Activity log and usage'].every(t => titles.includes(t)), 'the Settings tab still lists every group (14)');
        await page.locator('.st-search__in').fill('barred');
        await page.waitForTimeout(200);
        const found = await page.locator('details > summary .st-title').allInnerTexts();
        ok(found.length === 1 && found[0] === 'Speed, RPM and fuel' && (await page.locator('details#st-speed').evaluate(e => e.open)), 'Settings search: "barred" leaves only Speed, RPM and fuel, opened');
        await page.screenshot({ path: `${out}/41-settings-search.png` });
        await page.locator('button[aria-label="Clear the search"]').click();
        await page.waitForTimeout(150);
        ok((await page.locator('details > summary .st-title').count()) === 14, 'clearing the search brings all 14 groups back');
        await page.locator('details#st-motion .st-used__link', { hasText: 'Weather → Map charts' }).click();
        await page.waitForTimeout(200);
        ok((await page.locator('nav.g-nav button.is-on').innerText()).includes('Weather') && (await page.locator('.g-shell > .g-seg button.is-on').innerText()).includes('Map charts'), '"Used in" link under a settings group goes to that screen');
        // restore the Settings tab as the later tests expect it (Ship particulars open)
        await go(page, 'Settings');
        if (!(await page.locator('details#st-ship').evaluate(e => e.open))) await page.locator('details#st-ship summary').click();
        if (await page.locator('details#st-motion').evaluate(e => e.open)) await page.locator('details#st-motion summary').click();
        await go(page, 'Weather');
    }
    // Full-size weather table
    await page.locator('button', { hasText: 'Full-size table' }).click();
    const ovRows = await page.locator('.pp-overlay tbody tr').count();
    const wxRows0 = await page.locator('#pane .tablewrap tbody tr').count();
    ok(ovRows === wxRows0 && ovRows > 20, `full-size weather table shows all ${ovRows} rows`);
    await page.screenshot({ path: `${out}/08f-weather-full.png` });
    // gear in the full-size table's title bar (UI reimagine): the limits in the floating settings window, over the table
    await page.locator('.pp-overlay [data-g="gear"]').click();
    await page.waitForTimeout(250);
    ok((await page.locator('.g-setwin').count()) === 1 && /Weather limits/.test(await page.locator('.g-setwin__title').innerText()) && (await page.locator('.g-setwin table tbody tr').count()) === 5, 'full-size weather table gear: the weather limits in the floating settings window');
    const zs = await page.evaluate(() => [Number(getComputedStyle(document.querySelector('.g-setwin')).zIndex), Number(getComputedStyle(document.querySelector('.pp-overlay')).zIndex)]);
    ok(zs[0] > zs[1], 'the settings window sits above the full-size table');
    await page.screenshot({ path: `${out}/44-gear-full-table.png` });
    await page.locator('.pp-overlay tbody tr').first().hover();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    ok((await page.locator('.g-setwin').count()) === 0 && (await page.locator('.pp-overlay').count()) === 1, 'Esc closes the settings window first; the full-size table stays');
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
    // one ring (owner's choice, 2026-11-23): arrow heads on one ring, height/period boxes outside, barb on the ship
    {
        const ringTxt = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-glyph--ring text')).map(t => t.textContent).slice(0, 8));
        ok((await page.locator('.pp-glyph--ring').count()) === glyphsZoomed && ringTxt.some(t => /^\d+\.\d\/\d+s$/.test(t)), `ship weather drawn as one ring, heights with periods: ${ringTxt.slice(0, 4).join(', ')}`);
        const md = await settings('Map display');
        await md.locator('[data-g="glyph-style"] select').selectOption('rings');
        await page.waitForTimeout(400);
        ok((await page.locator('.pp-glyph--ring').count()) === 0 && (await page.locator('.pp-glyph').count()) > 0, 'the old rings can still be chosen (Settings → Map display → Drawn as)');
        // every one of the 11 designs can be chosen and draws (owner, 2026-11-23)
        const ids = await md.locator('[data-g="glyph-style"] select option').evaluateAll(os => os.map(o => o.value));
        const bad = [];
        for (const id of ids) {
            await md.locator('[data-g="glyph-style"] select').selectOption(id);
            await page.waitForTimeout(250);
            const st = await page.evaluate(() => { const g = [...document.querySelectorAll('.pp-glyph')]; return { n: g.length, nan: g.some(x => /NaN|undefined/.test(x.innerHTML)) }; });
            if (!st.n || st.nan) bad.push(`${id}: ${st.n} symbols${st.nan ? ', NaN' : ''}`);
            await page.screenshot({ path: `${out}/08e-style-${id}.png`, clip: { x: 380, y: 140, width: 560, height: 560 } });
        }
        ok(ids.length === 11 && bad.length === 0, `all 11 ship weather designs selectable and drawn (${ids.join(', ')})${bad.length ? ': ' + bad.join('; ') : ''}`);
        await md.locator('[data-g="glyph-style"] select').selectOption('ring');
        await page.waitForTimeout(400);
        await go(page, 'Weather');
        await page.evaluate(() => window.__map.setView([24.5, -34.5], 6, { animate: false }));
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${out}/08d-one-ring.png` });
    }
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
    await page.locator('.sb [data-g="gear"]').click();
    await page.waitForTimeout(250);
    ok((await page.locator('.g-setwin').count()) === 1 && /Map display/.test(await page.locator('.g-setwin__title').innerText()) && /Ship symbol/.test(await page.locator('.g-setwin').innerText()), 'ship window gear opens the Map display settings in a floating settings window beside it');
    ok((await page.locator('nav.g-nav button.is-on').innerText()).includes('Route') && (await page.locator('.tablewrap tbody tr').count()) > 0, 'the gear does not leave the screen being worked on (still Route → Waypoints)');
    await page.screenshot({ path: `${out}/16-settings.png` });
    // it is a floating window like the others: moves, minimises; a chip switches to the polar switches
    const sw0 = await page.locator('.g-setwin').boundingBox();
    await page.mouse.move(sw0.x + 120, sw0.y + 16); await page.mouse.down(); await page.mouse.move(sw0.x + 180, sw0.y + 56, { steps: 4 }); await page.mouse.up();
    const sw1 = await page.locator('.g-setwin').boundingBox();
    ok(Math.abs(sw1.x - sw0.x - 60) < 4 && Math.abs(sw1.y - sw0.y - 40) < 4, 'settings window moves by its title bar');
    await page.locator('.g-setwin .g-fw__min').click();
    ok((await page.locator('.g-setwin.g-fw--min').count()) === 1, 'settings window minimises');
    await page.locator('.g-setwin .g-fw__min').click();
    await page.locator('.g-setwin .g-fw__reset').click();
    await page.locator('.g-setwin .g-fold__chip', { hasText: 'Polar diagram' }).click();
    ok((await page.locator('.g-setwin label.switch').count()) === 5, 'settings window: the Polar diagram chip shows the same five switches as the Settings tab');
    await page.locator('#map').hover();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    ok((await page.locator('.g-setwin').count()) === 0, 'Esc closes the settings window');
    // the Settings tab still has the group, and going there by hand works as before
    ok(await (await settings('Map display')).evaluate(e => e.open), 'Settings → Map display still there in the Settings tab');
    await go(page, 'Route');

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
    await go(page, 'Map charts');
    const tRoll = Date.now();
    await page.locator('button', { hasText: 'Roll lines for this view' }).click();
    await page.waitForFunction(() => { const l = document.querySelector('.pp-roll-legend'); return l && /Roll chart/.test(l.textContent) && !/Working out/.test(l.textContent); }, null, { timeout: 120000 });
    const rk = await page.locator('.pp-roll-legend').innerText();
    ok((await page.locator('.pp-roll-legend .g-fw__min').count()) === 1 && (await page.locator('.pp-roll-legend .g-fw__reset').count()) === 1 && (await page.locator('.pp-roll-legend .g-fw__close').count()) === 1, 'roll chart key: minimise, original size, close');
    // gear on the map key (UI reimagine): the roll chart settings in the floating settings window
    await page.locator('.pp-roll-legend .g-fw__gear').click();
    await page.waitForTimeout(250);
    ok((await page.locator('.g-setwin').count()) === 1 && /The lines show/.test(await page.locator('.g-setwin').innerText()) && !/Bilge keels \(one side/.test(await page.locator('.g-setwin').innerText()), 'roll chart key gear: the roll chart settings (only that part) in the settings window');
    ok((await page.locator('.g-shell > .g-seg button.is-on').innerText()).includes('Map charts'), 'the key\'s gear does not change the screen in the panel');
    await page.locator('.g-setwin .g-fw__close').click();
    ok((await page.locator('.g-setwin').count()) === 0, 'settings window closes with its close button');
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
    await go(page, 'Map charts');
    await page.locator('button', { hasText: 'Pitch lines for this view' }).click();
    await settled();
    const pk = await page.locator('.pp-roll-legend').innerText();
    const blueLines = await page.locator('.leaflet-overlay-pane path').evaluateAll(ps => ps.filter(p => ['#9ecbff', '#6aaeff', '#3c8ef0', '#1f6fd0', '#0f4fa8', '#082f80'].includes(p.getAttribute('stroke'))).length);
    ok(/Pitch chart/.test(pk) && /Significant pitch/.test(pk) && (blueLines > 0 || /stays under 1°/.test(pk)), `pitch chart in blues (${blueLines} lines): ` + (pk.match(/largest [\d.]+°/) || [''])[0]);
    await page.screenshot({ path: `${out}/29-pitch-chart.png` });
    await page.locator('button', { hasText: 'Roll lines for this view' }).click();
    await settled();
    await go(page, 'Map charts');
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
    ok((await page.locator('.gp .gp__edge--corner').count()) === 1, 'graph window has a corner to resize it');
    await page.locator('.gp__btn[title^="Original size"]').click();
    await page.waitForTimeout(200);
    ok(Math.abs((await page.locator('.gp').boundingBox()).height - 300) < 3, 'graph window back to its original size with ↺');
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
    await go(page, 'Map charts');
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
    // the map key is a floating window too (owner, 2026-11-13)
    ok((await page.locator('.pp-wave-legend .g-fw__min').count()) === 1 && (await page.locator('.pp-wave-legend .g-fw__reset').count()) === 1 && (await page.locator('.pp-wave-legend .g-fw__close').count()) === 1 && (await page.locator('.pp-wave-legend .g-fw__grip--c').count()) === 1, 'wave chart key: minimise, original size, close, and resize');
    await page.locator('.sb .sb__btn[title="Minimise"]').click(); // the ship window can sit over the key
    const wk0 = await page.locator('.pp-wave-legend').boundingBox();
    const wkh = await page.locator('.pp-wave-legend .g-fw__head').boundingBox();
    await page.mouse.move(wkh.x + 20, wkh.y + wkh.height / 2);
    await page.mouse.down();
    await page.mouse.move(wkh.x + 470, wkh.y - 60, { steps: 5 }); // to the right of the ship window
    await page.mouse.up();
    const wk1 = await page.locator('.pp-wave-legend').boundingBox();
    ok(Math.abs(wk1.x - wk0.x - 450) < 6 && wk1.y < wk0.y - 25, `wave chart key moves by its title bar (${Math.round(wk0.x)},${Math.round(wk0.y)} → ${Math.round(wk1.x)},${Math.round(wk1.y)})`);
    await page.locator('.pp-wave-legend .g-fw__min').click();
    ok((await page.locator('.pp-wave-legend').boundingBox()).height < 40, 'wave chart key minimises to its title bar');
    await page.locator('.pp-wave-legend .g-fw__reset').click();
    const wk2 = await page.locator('.pp-wave-legend').boundingBox();
    const wkStyle = await page.evaluate(() => document.querySelector('.pp-wave-legend').getAttribute('style') || '');
    ok(Math.abs(wk2.x - wk0.x) < 2 && !/top:/.test(wkStyle) && (await page.locator('.pp-wave-legend.g-fw--placed').count()) === 0, 'wave chart key back in its original place with ↺');
    // gears (UI reimagine): on the key → the floating settings window; a second gear re-uses the same window; in the Waves row → in place
    await page.locator('.pp-wave-legend .g-fw__gear').click();
    await page.waitForTimeout(250);
    ok(/Wave chart \(your colours\)/.test(await page.locator('.g-setwin__title').innerText().catch(() => '')), 'wave chart key gear opens the wave chart settings in the settings window');
    await page.locator('.sb [data-g="gear"]').click();
    await page.waitForTimeout(250);
    ok((await page.locator('.g-setwin').count()) === 1 && /Map display/.test(await page.locator('.g-setwin__title').innerText()), 'a second gear re-uses the same settings window (never two)');
    await page.locator('.g-setwin .g-fw__close').click();
    await go(page, 'Map charts');
    await page.locator('.wavechart [data-gear="wavechart"]').click();
    await page.waitForTimeout(250);
    const wcFold = page.locator('#pane .g-fold');
    await wcFold.locator('label', { hasText: 'Blues' }).click();
    await page.waitForTimeout(500);
    const gradBlue = JSON.stringify(await page.evaluate(() => window.__colors.waves.custom));
    ok(gradBlue !== JSON.stringify(grad) && (await page.locator('.g-shell > .g-seg button.is-on').innerText()).includes('Map charts'), 'wave palette changed through the gear in the Waves row: the map colours change, without leaving Map charts');
    await page.screenshot({ path: `${out}/42-gear-wave-chart.png` });
    await wcFold.locator('label', { hasText: 'Multicolour' }).click();
    await page.waitForTimeout(400);
    await wcFold.locator('.g-fold__done').first().click();
    await page.locator('.pp-wave-legend .g-fw__close').click();
    ok(!(await page.locator('.pp-wave-legend').isVisible()), 'wave chart key closes');
    await page.locator('.sb .sb__btn[title^="Show it again"]').click();
    const mdW = await settings('Map display');
    await mdW.locator('button', { hasText: 'Show closed windows again' }).click();
    ok(await page.locator('.pp-wave-legend').isVisible(), 'closed windows come back from Settings → Map display');
    if (await page.locator('.gp').count()) await page.locator('.gp__btn[title^="Close"]').click(); // (it brings the graphs back too)
    await page.evaluate(() => window.__store.set('overlay', 'wwaves'));
    await page.waitForTimeout(400);
    ok((await page.evaluate(() => window.__colors.waves.custom))[2][0] === 1.5, 'sea layer uses the sea minimum (1.5 m)');
    await page.evaluate(() => window.__store.set('overlay', 'wind'));
    await page.waitForTimeout(400);
    ok((await page.evaluate(() => window.__colors.waves.custom)) === null, "Windy's own wave colours back when another layer is shown");

    // Polar diagram switches: hidden warnings not drawn, still listed
    await go(page, 'Polar');
    await page.locator('.g-card__head [data-gear="polar"]').click();
    await page.waitForTimeout(300);
    const limSec = page.locator('#pane .g-fold');
    ok((await limSec.locator('label.switch').count()) === 5 && (await page.locator('nav.g-nav button.is-on').innerText()).includes('Motion'), 'Motion card gear opens the polar diagram switches in place (the diagram stays on screen)');
    ok((await limSec.locator('.g-fold__chip').count()) === 4, 'Motion gear: one gear, four chips (Polar diagram, Weather limits, Roll & pitch, Ship particulars)');
    await limSec.locator('label.switch', { hasText: 'Parametric rolling' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/43-gear-motion.png` });
    await page.keyboard.press('Escape');
    const polTxt = await page.locator('#pane').innerText();
    ok(/Switched off here: Parametric roll/.test(polTxt), 'polar: parametric rolling switched off is not drawn (and says so)' + (/Switched off here: Parametric roll/.test(polTxt) ? '' : ': ' + polTxt.slice(0, 1500).replace(/\s+/g, ' ')));
    const limSec2 = await settings('Polar diagram');
    await limSec2.locator('label.switch', { hasText: 'Parametric rolling' }).click();

    // Safe speed plan: keep the track, avoid the chosen weather by speed / stops; barred RPM never used
    const spB = await settings('Speed, RPM and fuel');
    await spB.locator('button', { hasText: 'Add a barred range' }).click();
    const brow = spB.locator('table.barred tbody tr').last();
    for (const [k, v] of [[0, '64'], [1, '67'], [2, 'critical: vibration']]) { const inp = brow.locator('input').nth(k); await inp.fill(v); await inp.dispatchEvent('change'); }
    const spSet = await settings('Safe speed and course plan');
    ok((await spSet.locator('label.switch').count()) === 8, 'safe speed and course plan settings: what to avoid (6 switches), stops and course alterations');
    ok((await spSet.locator('select').count()) >= 3, 'settings: largest course alteration');
    await go(page, 'Optimise');
    await page.locator('.g-shell > .g-seg button', { hasText: 'Speed & course' }).click();
    const tSp = Date.now();
    await page.locator('button', { hasText: 'Work out a safe speed and course plan' }).click();
    await page.waitForSelector('table.segs tbody tr', { timeout: 120000 });
    const splTxt = await page.locator('#pane').innerText();
    ok(/Done/.test(splTxt) && (await page.locator('table.cmp tbody tr').count()) === 2, `safe speed plan worked out and compared with your speeds (${((Date.now() - tSp) / 1000).toFixed(1)} s): ` + (splTxt.match(/Done[^\n]*/) || [''])[0]);
    const spRpms = (await page.locator('table.segs tbody tr.seg').evaluateAll(rs => rs.map(r => Number(r.children[4].textContent)))).filter(x => x > 0);
    ok(spRpms.length > 0 && spRpms.every(x => x < 64 || x > 67), 'no barred RPM in the plan: ' + spRpms.join(', '));
    const whys = await page.locator('table.segs td.why').allInnerTexts();
    ok(whys.length > 0 && whys.every(w => w.trim().length > 10), 'each change has a reason: ' + whys[0].slice(0, 120));
    ok((await page.locator('.strip span').count()) === whys.length, 'time strip shows the speed along the voyage');
    const courses = await page.locator('table.segs tbody tr.seg').evaluateAll(rs => rs.map(r => r.children[5].textContent.trim()));
    ok(courses.length > 0 && courses.every(c => /^(\d{3}°|—)/.test(c)), 'course to steer shown for each part: ' + courses.slice(0, 6).join(', '));
    await page.screenshot({ path: `${out}/23-speed-plan.png`, fullPage: false });
    const wpsBeforeSp = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).route.waypoints.length);
    await page.locator('button', { hasText: 'Use this plan' }).click();
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
    // RPM advice (owner, 2026-11-23): never barred (e.g. aux blower cut-in / cut-out), never above max / below min, and why
    {
        await go(page, 'Speed');
        await page.waitForTimeout(300);
        const r0 = Number((await page.locator('table.legs tbody tr').first().locator('td').nth(3).innerText()).match(/\d+/)?.[0]);
        const spC = await settings('Speed, RPM and fuel');
        ok((await spC.locator('[data-g="rpm-limits"] input').count()) === 2 && /Auxiliary blower cut-in/.test(await spC.locator('#pp-barred-why').innerHTML()), 'Settings → Speed, RPM and fuel: min and max RPM boxes; "auxiliary blower cut-in / cut-out" among the barred reasons');
        const maxIn = spC.locator('[data-g="rpm-limits"] input').nth(1);
        await maxIn.fill(String(r0 - 3));
        await maxIn.dispatchEvent('change');
        await go(page, 'Speed');
        await page.waitForTimeout(400);
        const st1 = await page.locator('#pane').innerText();
        const cell = await page.locator('table.legs tbody tr').first().locator('td').nth(3).innerText();
        ok(r0 > 0 && new RegExp(`above your max RPM ${r0 - 3}: run at \\d+ RPM`).test(st1) && /▲ → \d+/.test(cell), `planned ${r0} RPM above a max of ${r0 - 3}: max advised, warning says the ETA will be later (${cell.replace(/\s+/g, ' ')})`);
        const spD = await settings('Speed, RPM and fuel');
        await spD.locator('[data-g="rpm-limits"] input').nth(1).fill('');
        await spD.locator('[data-g="rpm-limits"] input').nth(1).dispatchEvent('change');
        await spD.locator('button', { hasText: 'Add a barred range' }).click();
        const br2 = spD.locator('table.barred tbody tr').last();
        for (const [k, v] of [[0, String(r0 - 1)], [1, String(r0 + 1)], [2, 'Auxiliary blower cut-in / cut-out (scavenge air pressure)']]) { const inp = br2.locator('input').nth(k); await inp.fill(v); await inp.dispatchEvent('change'); }
        await go(page, 'Speed');
        await page.waitForTimeout(400);
        const st2 = await page.locator('#pane').innerText();
        ok(new RegExp(`inside the barred range ${r0 - 1}–${r0 + 1} \\(Auxiliary blower`).test(st2) && /a little (faster|slower), or \d+ RPM/.test(st2), 'planned RPM in the aux blower range: the nearest allowed RPM above and below advised, with the reason');
        await page.screenshot({ path: `${out}/23b-rpm-advice.png` });
        const spE = await settings('Speed, RPM and fuel');
        await spE.locator('table.barred tbody tr').last().locator('button[title="Remove"]').click();
    }
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
    const [logDl] = await Promise.all([page.waitForEvent('download'), page.locator('#pane button', { hasText: 'Save and send activity log' }).first().click()]);
    // saved: a window says where the file went and offers Email / Gmail / WhatsApp to the developer (owner, 2026-11-26)
    await page.waitForSelector('.pp-sendlog', { timeout: 3000 }).catch(() => {});
    const sendTxt = await page.locator('.pp-sendlog').innerText().catch(() => '');
    const sendHrefs = await page.$$eval('.pp-sendlog .pp-sendlog__btn', as => as.map(a => a.getAttribute('href') || ''));
    ok(/Downloads/.test(sendTxt) && /passage-plan-log-\d{8}-\d{4}Z\.json/.test(sendTxt) && sendHrefs.length === 3 && sendHrefs[0].startsWith('mailto:') && /mail\.google\.com/.test(sendHrefs[1]) && /wa\.me/.test(sendHrefs[2]),
        'activity log saved: says where it went (Downloads, file name) and offers Email, Gmail and WhatsApp to the developer');
    await page.locator('.pp-sendlog .pp-sendlog__x').click().catch(() => {});
    const logPath = path.join(out, 'activity-log.json');
    await logDl.saveAs(logPath);
    const logJson = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    const kinds = new Set(logJson.entries.map(e => e.kind));
    ok(/^passage-plan-log-\d{8}-\d{4}Z\.json$/.test(logDl.suggestedFilename()), 'log file name with UTC time: ' + logDl.suggestedFilename());
    ok(kinds.has('open') && kinds.has('weather') && kinds.has('route') && kinds.has('layer'), 'log has open, route, weather and layer entries: ' + [...kinds].join(','));
    ok(kinds.has('click') && kinds.has('change') && kinds.has('screen') && kinds.has('windy'), 'log records buttons pressed, settings changed, window / panel sizes and Windy layer changes');
    ok(logJson.entries.some(e => e.kind === 'click' && /Work out a safe speed and course plan/.test(e.msg)) && logJson.entries.some(e => e.kind === 'change' && /→/.test(e.msg)), 'log entries say which button and which setting');
    ok(logJson.plugin && logJson.route && Array.isArray(logJson.route.legs) && logJson.ship, 'log header has plugin, route, legs and ship');
    await go(page, 'Feedback');
    ok((await page.locator('.fb button', { hasText: 'Save and send activity log' }).count()) === 1, 'Save and send activity log button in Help → Feedback');

    // Reading currents pauses while the tab is hidden, carries on by itself when visible again
    await go(page, 'Weather');
    await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hidden }));
    {
        // The route opened last is the BVS test file, whose dates are fixed (early November 2026). Once the calendar has
        // passed them the forecast has nothing for it, "Read currents" has no rows to read and this check stopped the
        // whole run (found 2026-11-13). So: the made-up route again, ETD = now, and its forecast.
        await go(page, 'Route');
        await page.setInputFiles('input[type=file]', fixture);
        await page.waitForTimeout(300);
        await page.locator('.g-card', { hasText: 'Times (UTC)' }).locator('.dtf__value').first().click();
        await page.locator('.dtf__pop button', { hasText: /^Now$/ }).click();
        await page.locator('.dtf__pop button', { hasText: /^OK$/ }).click();
        await page.waitForTimeout(300);
        await go(page, 'Weather');
        await page.locator('button', { hasText: /Get (latest )?forecast along route/ }).click();
        await page.waitForSelector('.wo', { timeout: 5000 }).catch(() => {});
        await page.waitForSelector('.wo', { state: 'detached', timeout: 180000 });
        await page.waitForTimeout(300);
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
    await go(page, 'Map charts');
    await page.locator('.wavechart button', { hasText: 'Seamarks' }).click();
    await page.evaluate(() => window.__map.setView([51.9, 4.0], 10, { animate: false }));
    await page.waitForTimeout(800);
    const chartLegTxt = await page.locator(".pp-chart-legend").innerText().catch(() => '');
    ok(/OpenSeaMap/.test(chartLegTxt) && /Not for navigation/i.test(chartLegTxt), 'seamark overlay on, with source and "not for navigation" on the map: ' + chartLegTxt.replace(/\s+/g, ' ').slice(0, 90));
    ok((await page.locator('img[src*="openseamap"]').count()) > 0, 'seamark tiles requested');
    ok((await page.locator('.pp-chart-legend .g-fw__gear').count()) === 1 && /not official charts/i.test(await page.locator('#pane').innerText()), 'nautical chart key has a gear; "not official charts" stays visible beside the chart buttons');
    await page.locator('.pp-chart-legend .g-fw__close').click();
    ok((await page.locator('.pp-chart-legend.g-fw--min').count()) === 1 && /Nautical chart/.test(await page.locator('.pp-chart-legend').innerText()), 'nautical chart key: ✕ only makes it small (credit and "not for navigation" stay while the chart is shown)');
    await page.locator('.pp-chart-legend .g-fw__min').click();
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
    // ports and canals: one button shows them and hides them again (owner, 2026-11-22)
    {
        const pcBtn = page.locator('.ds-actions button', { hasText: /ports and canals/ }).first();
        if (/Hide ports/.test(await pcBtn.innerText())) {
            await pcBtn.click(); // an earlier check left them on
            await page.waitForTimeout(300);
        }
        ok(/Show ports and canals/.test(await pcBtn.innerText()), 'Distances: the button says "Show ports and canals" while they are hidden');
        await pcBtn.click();
        await page.evaluate(() => window.__map.setView([50.6, 1.0], 7, { animate: false }));
        await page.waitForTimeout(600);
        ok(/Hide ports and canals/.test(await pcBtn.innerText()) && (await page.locator('.pp-place-dot--port').count()) > 0, 'after a click: ports on the map and the same button says "Hide ports and canals"');
        // port names beside their dots, never on top of a dot or another name (owner's report: "port names and dot … overlapping")
        const ov = await page.evaluate(() => {
            const els = [...document.querySelectorAll('.pp-place-label, .pp-place-dot')];
            const r = els.map(e => e.getBoundingClientRect());
            const what = e => (e.className.includes('label') ? e.textContent : (e.getAttribute('title') || e.className).split(',')[0]);
            let n = 0;
            const pairs = [];
            for (let i = 0; i < r.length; i++)
                for (let j = i + 1; j < r.length; j++) {
                    const a = r[i], b = r[j];
                    if (els[i].parentElement === els[j].parentElement) continue; // a dot and its own name
                    const isPort = e => !!e.parentElement.querySelector('.pp-place-dot--port');
                    if (!isPort(els[i]) && !isPort(els[j])) continue; // only port dots and names are thinned out
                    if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) {
                        n++;
                        pairs.push(what(els[i]) + ' / ' + what(els[j]));
                    }
                }
            return { n, labels: document.querySelectorAll('.pp-place-label').length, pairs: pairs.slice(0, 4).join('; ') };
        });
        ok(ov.labels > 0 && ov.n === 0, `port names beside the dots, none over a dot or another name (${ov.labels} names, ${ov.n} overlaps${ov.pairs ? ': ' + ov.pairs : ''})`);
        await page.screenshot({ path: `${out}/30b-ports.png` });
        await pcBtn.click();
        await page.waitForTimeout(300);
        ok(/Show ports and canals/.test(await pcBtn.innerText()) && (await page.locator('.pp-place-dot--port').count()) === 0, 'a second click hides the ports and canals again');
    }
    // sea areas and limits (owner, 2026-11-22): ECA / SECA, MARPOL special areas by annex, ballast water, 3 / 12 / 24 / 50 / 200 nm
    {
        await go(page, 'Settings');
        const ch = page.locator('details#st-charts');
        if (!(await ch.evaluate(e => e.open))) await ch.locator('summary').click();
        await page.waitForTimeout(200);
        const box = ch.locator('[data-g="sea-areas"]');
        ok((await box.locator('input[type=checkbox]').count()) >= 13 && /SOx ECAs \(SECA\)/.test(await box.innerText()) && /Annex V: garbage/.test(await box.innerText()) && /12 nm: territorial sea/.test(await box.innerText()) && /Ballast water exchange/.test(await box.innerText()), 'Settings → Nautical charts and places: switches for SOx / NOx ECAs, MARPOL Annex I / II / IV / V, 3 / 12 / 24 / 50 / 200 nm, EEZ and ballast water');
        await page.evaluate(() => window.__map.setView([52, -4], 4, { animate: false }));
        await box.locator('label', { hasText: 'SOx ECAs (SECA)' }).locator('input').check();
        await page.waitForTimeout(1200);
        const ecaPaths = await page.locator('path.pp-sea--eca').count();
        const labs = await page.locator('.pp-sea-label').allInnerTexts();
        ok(ecaPaths >= 5 && labs.some(t => /North Sea ECA/.test(t)) && seaHits.includes('imo.json'), `SOx ECAs drawn from the downloaded data (${ecaPaths} lines; names: ${labs.slice(0, 4).join(', ')})`);
        const tip = await page.locator('.pp-sea-label', { hasText: 'North Sea ECA' }).first().getAttribute('title').catch(() => '');
        ok(/0\.10 % sulphur/.test(tip || '') && /Source: MARPOL Annex VI/.test(tip || ''), 'pointing at an area name gives its rule and source: ' + (tip || '').slice(0, 110));
        ok(/IMO area/.test(await box.locator('.g-status').innerText().catch(() => '')) && /What the lines on the map are/.test(await box.innerText()), 'status line and the list of what the lines are');
        await box.locator('label', { hasText: 'Annex V: garbage' }).locator('input').check();
        await page.waitForTimeout(500);
        ok((await page.locator('path.pp-sea--a5').count()) >= 3, 'Annex V special areas drawn (' + (await page.locator('path.pp-sea--a5').count()) + ' lines)');
        await box.locator('label', { hasText: 'Also adopted, not yet in force' }).locator('input').uncheck();
        await page.waitForTimeout(500);
        const labs2 = await page.locator('.pp-sea-label').allInnerTexts();
        ok(!labs2.some(t => /North-East Atlantic/.test(t)) && labs.some(t => /North-East Atlantic/.test(t)), 'the adopted North-East Atlantic ECA (not yet in force) can be left out');
        await page.screenshot({ path: `${out}/30c-sea-areas.png` });
        // distance lines (tiles fetched for the view only, from zoom 5 for the 12 nm line)
        const zIdx = fs.existsSync(path.join(seaDir, 'zones', 'index.json'));
        await box.locator('label', { hasText: '12 nm: territorial sea limit' }).locator('input').check();
        await page.evaluate(() => window.__map.setView([50.2, -3.5], 4, { animate: false }));
        await page.waitForTimeout(900);
        if (zIdx) {
            ok(/zoom in to see: 12 nm/.test(await box.locator('.g-status').innerText()), 'zoomed out: "zoom in to see" the 12 nm line');
            await page.evaluate(() => window.__map.setView([50.2, -3.5], 6, { animate: false }));
            await page.waitForTimeout(1500);
            ok((await page.locator('path.pp-zone--ts12').count()) > 0 && seaHits.some(h => /^zones\/ts12\//.test(h)), '12 nm territorial sea line drawn from its map pieces (' + (await page.locator('path.pp-zone--ts12').count()) + ' lines)');
            await page.screenshot({ path: `${out}/30d-12nm.png` });
        } else ok(false, 'distance-line data (data/seaareas/zones) missing');
        for (const t of ['SOx ECAs (SECA)', 'Annex V: garbage', '12 nm: territorial sea limit']) await box.locator('label', { hasText: t }).locator('input').uncheck();
        await box.locator('label', { hasText: 'Also adopted, not yet in force' }).locator('input').check();
        await page.waitForTimeout(400);
        ok((await page.locator('path.pp-sea, path.pp-zone, .pp-sea-label').count()) === 0, 'all switched off: nothing left on the map');
        await go(page, 'Weather');
    }
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
    // floating window (owner, 2026-11-13): drag to move, corner to resize, ↺ original size and place
    await page.waitForTimeout(900);
    const cb0 = await page.locator('.cb').boundingBox();
    await page.mouse.move(cb0.x + 25, cb0.y + 9);
    await page.mouse.down();
    await page.mouse.move(cb0.x + 125, cb0.y + 209, { steps: 6 });
    await page.mouse.up();
    const cb1 = await page.locator('.cb').boundingBox();
    ok(Math.abs(cb1.x - cb0.x - 100) < 6 && Math.abs(cb1.y - cb0.y - 200) < 6, `cursor bar moves by dragging (${Math.round(cb0.x)},${Math.round(cb0.y)} → ${Math.round(cb1.x)},${Math.round(cb1.y)})`);
    const cbc = await page.locator('.cb .g-fw__grip--c').boundingBox();
    await page.mouse.move(cbc.x + 5, cbc.y + 5);
    await page.mouse.down();
    // (made wider, not narrower: with the mouse on the bar and not on the map the bar is short, already near its
    // smallest width of 260 px, so dragging it 200 px narrower could never pass; found 2026-11-13)
    await page.mouse.move(cbc.x + 200, cbc.y + 60, { steps: 6 });
    await page.mouse.up();
    const cb2 = await page.locator('.cb').boundingBox();
    ok(cb2.width > cb1.width + 150, `cursor bar resizes (${Math.round(cb1.width)} → ${Math.round(cb2.width)} px wide)`);
    await page.locator('.cb button[aria-label="Original size and place"]').click();
    await page.waitForTimeout(1000);
    const cb3 = await page.locator('.cb').boundingBox();
    ok(Math.abs(cb3.y - cb0.y) < 3 && Math.abs(cb3.x - cb0.x) < 3, 'cursor bar back to its original size and place with ↺');
    // ship window: moved, then ↺ puts it back
    const sbh = await page.locator('.sb .sb__head').boundingBox();
    const sb0 = await page.locator('.sb').boundingBox();
    await page.mouse.move(sbh.x + 30, sbh.y + 6);
    await page.mouse.down();
    await page.mouse.move(sbh.x + 230, sbh.y + 106, { steps: 5 });
    await page.mouse.up();
    const sb1 = await page.locator('.sb').boundingBox();
    await page.locator('.sb .sb__btn[title^="Original size"]').click();
    const sb2 = await page.locator('.sb').boundingBox();
    ok(Math.abs(sb1.x - sb0.x - 200) < 6 && Math.abs(sb2.x - 12) < 2 && Math.abs(sb2.y - 70) < 2, `ship window moves, and ↺ puts it back to its original size and place (${Math.round(sb1.x)} → ${Math.round(sb2.x)})`);

    // Port weather and tides (owner, 2026-11-13): pick a place on the map → 7 days every hour, tide, sun / moon, PDF
    {
        const H = 3600;
        const t0 = Math.floor(Date.now() / 86400e3) * 86400 - 86400;
        const time = Array.from({ length: 9 * 24 }, (_, i) => t0 + i * H);
        const marine = {
            hourly_units: { ocean_current_velocity: 'km/h', sea_level_height_msl: 'm' },
            hourly: {
                time,
                sea_level_height_msl: time.map(t => 2.6 * Math.cos((2 * Math.PI * (t - t0 - 3 * H)) / (12.42 * H))),
                ocean_current_velocity: time.map((t, i) => 1.5 + Math.sin(i / 3)),
                ocean_current_direction: time.map((t, i) => (i * 7) % 360),
                sea_surface_temperature: time.map(() => 13.4),
                wind_wave_height: time.map((t, i) => 1 + 0.5 * Math.sin(i / 6)),
                wind_wave_period: time.map(() => 5),
                wind_wave_direction: time.map(() => 250),
            },
        };
        const marineUrls = [];
        const onReq = r => /marine-api\.open-meteo\.com/.test(r.url()) && marineUrls.push(r.url());
        page.on('request', onReq);
        const marineFake = route => {
            return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(marine) });
        };
        await page.route(/marine-api\.open-meteo\.com/, marineFake);
        await go(page, 'Weather');
        await page.locator('.g-seg__opt', { hasText: 'Port weather' }).click();
        await page.locator('button', { hasText: 'Pick on the map' }).click();
        const wpsBeforePick = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).route.waypoints.length);
        ok(/Click the place on the map/.test(await page.locator('.pp-maptool').innerText().catch(() => '')) && /does not add a waypoint/.test(await page.locator('.pp-maptool').innerText().catch(() => '')), 'map tool: a note on the map says the next click picks the place');
        const pm = await page.locator('#map').boundingBox();
        await page.mouse.click(pm.x + pm.width * 0.55, pm.y + pm.height * 0.62);
        await page.waitForSelector('.pw__day', { timeout: 60000 });
        await page.waitForTimeout(500);
        ok((await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).route.waypoints.length)) === wpsBeforePick, 'picking a place on the map does not add a waypoint');
        ok((await page.locator('.pp-maptool').count()) === 0, 'map tool: the note goes after the one pick');
        ok((await page.locator('.pp-pick-dot').count()) === 1, 'the chosen place is marked on the map');
        const marineAsked = decodeURIComponent(marineUrls.join(' '));
        ok(/sea_level_height_msl/.test(marineAsked) && /ocean_current_velocity/.test(marineAsked) && /sea_surface_temperature/.test(marineAsked), 'tide, current and sea temperature asked from Open-Meteo marine' + (marineAsked ? '' : ` [requests seen: ${marineUrls.length}]`));
        ok((await page.locator('.pw__day').count()) === 7, 'port weather: 7 days');
        const pwTxt = await page.locator('#pane').innerText();
        ok(/Sunrise \d\d:\d\d · sunset \d\d:\d\d/.test(pwTxt) && /Moonrise (\d\d:\d\d|—) · moonset/.test(pwTxt), 'sunrise, sunset, moonrise and moonset (UTC)');
        ok(/HW \d\d:\d\d [\d.-]+ m/.test(pwTxt) && /LW \d\d:\d\d/.test(pwTxt) && /not chart datum/.test(pwTxt), 'tide with high and low water, and the datum warning');
        ok(/Open-Meteo marine/.test(pwTxt) && /fetched/.test(pwTxt), 'says where the data come from and when fetched');
        const phRows = await page.locator('table.ph tbody tr:not(.ph__day)').count();
        ok(phRows === 24, `every hour of the day in the table (${phRows} rows)`);
        const phHead = await page.locator('table.ph thead').innerText();
        ok(['Wind', 'Gust', 'SWH', 'Sea', 'Swell 1', 'Swell 2', 'kW/m', 'Air', 'Feels', 'Sea °C', 'Current', 'Rain', 'Tide'].every(w => phHead.includes(w)), 'hourly columns: wind, gust, SWH, sea, swell 1 and 2, power, air, feels like, sea temperature, current, rain, tide');
        ok((await page.locator('table.ph tbody svg.g-dir').count()) > 50, 'arrows for wind, waves and current');
        await page.screenshot({ path: `${out}/35-port-weather.png` });
        const [pwDl] = await Promise.all([page.waitForEvent('download'), page.locator('.g-card__actions button', { hasText: 'PDF' }).first().click()]);
        const pwPath = `${out}/port-weather.pdf`;
        await pwDl.saveAs(pwPath);
        const pwPdf = fs.readFileSync(pwPath).toString('latin1');
        ok(pwPdf.startsWith('%PDF') && Number((pwPdf.match(/\/Count (\d+)/) || [0, 0])[1]) >= 4, `port weather PDF (${pwDl.suggestedFilename()}, ${(pwPdf.length / 1024).toFixed(0)} KB)`);
        await page.locator('button', { hasText: 'Full size' }).click();
        ok((await page.locator('.pp-overlay table.ph tbody tr:not(.ph__day)').count()) === 7 * 24, 'full size: all 7 days, every hour');
        await page.locator('.pp-overlay button', { hasText: 'Close' }).click();
        await page.locator('.g-seg__opt', { hasText: 'Tides' }).click();
        await page.waitForTimeout(300);
        ok((await page.locator('.tg svg path').count()) >= 2 && (await page.locator('.tg svg circle').count()) >= 6, 'tide graph with high and low waters');
        ok((await page.locator('.tp__grid tbody tr').count()) === 24, 'hourly tide heights: 24 hours × the days');
        await page.screenshot({ path: `${out}/36-tides.png` });
        const [tdDl] = await Promise.all([page.waitForEvent('download'), page.locator('.g-card__actions button', { hasText: 'PDF' }).first().click()]);
        const tdPath = `${out}/tides.pdf`;
        await tdDl.saveAs(tdPath);
        ok(fs.readFileSync(tdPath).toString('latin1').startsWith('%PDF'), `tide PDF (${tdDl.suggestedFilename()})`);
        // a pick wins over "click on a course line inserts a waypoint": pick exactly on the course line
        await page.locator('.g-seg__opt', { hasText: 'Port weather' }).click();
        const wpsNow = await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).route.waypoints);
        await page.evaluate(w => window.__map.fitBounds(w.map(p => [p.lat, p.lon]), { animate: false }), wpsNow);
        await page.waitForTimeout(500);
        // a point on a course line, and a point on open water, that are on the bare map (not under a floating window or a symbol)
        const freeAt = (pts) => page.evaluate(ps => {
            const r = document.getElementById('map').getBoundingClientRect();
            for (const p of ps) {
                const x = p.x + r.left, y = p.y + r.top;
                const e = document.elementFromPoint(x, y);
                if (e && e.closest('#map') && !e.closest('.leaflet-marker-pane, .leaflet-control')) return { x, y };
            }
            return null;
        }, pts);
        const legPts = await page.evaluate(w => { const m = window.__map; const out = []; for (let i = 0; i + 1 < w.length; i++) for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) { const a = m.latLngToContainerPoint([w[i].lat, w[i].lon]); const b = m.latLngToContainerPoint([w[i + 1].lat, w[i + 1].lon]); out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }); } return out; }, wpsNow);
        const legMid = await freeAt(legPts.reverse()); // RL legs are straight on the map
        const water = await freeAt(legPts.flatMap(p => [{ x: p.x + 90, y: p.y + 110 }, { x: p.x - 90, y: p.y + 110 }, { x: p.x + 90, y: p.y - 110 }]));
        ok(!!legMid && !!water, 'test points found on the bare map (a course line, open water)');
        const placeBefore = localStoragePlace(await page.evaluate(() => localStorage.getItem('windy-plugin-passage-plan:place')));
        await page.locator('button', { hasText: 'Pick on the map' }).click();
        await page.mouse.click(legMid.x, legMid.y);
        await page.waitForTimeout(600);
        const placeAfter = localStoragePlace(await page.evaluate(() => localStorage.getItem('windy-plugin-passage-plan:place')));
        ok((await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).route.waypoints.length)) === wpsNow.length && placeAfter !== placeBefore, 'a pick on a course line picks the place and does not insert a waypoint (the pick wins)');
        // right-click on open water: the plugin's own short menu
        await page.mouse.click(water.x, water.y, { button: 'right' });
        await page.waitForTimeout(200);
        const menuItems = await page.locator('.pp-menu__item').allInnerTexts();
        ok(menuItems.length === 3 && /Port weather here/.test(menuItems[0]) && /Tides here/.test(menuItems[1]) && /Add waypoint here/.test(menuItems[2]), 'right-click on open water: Port weather here · Tides here · Add waypoint here');
        await page.locator('.pp-menu__item', { hasText: 'Tides here' }).click();
        await page.waitForTimeout(800);
        ok((await page.locator('.g-shell > .g-seg button.is-on').innerText()).includes('Tides') && localStoragePlace(await page.evaluate(() => localStorage.getItem('windy-plugin-passage-plan:place'))) !== placeAfter && (await page.evaluate(() => JSON.parse(localStorage.getItem('windy-plugin-passage-plan:v1')).route.waypoints.length)) === wpsNow.length, '"Tides here" opens Weather → Tides for that point, route unchanged');
        await page.locator('.g-seg__opt', { hasText: 'Along route' }).click();
        await page.unroute(/marine-api\.open-meteo\.com/, marineFake);
        page.off('request', onReq);
    }

    // Weather by itself (owner, 2026-11-19): downloads that work with the tab hidden, after route changes, the area box
    {
        const H = 3600;
        const t0 = Math.floor(Date.now() / 86400e3) * 86400 - 2 * 86400;
        const time = Array.from({ length: 12 * 24 }, (_, i) => t0 + i * H);
        const counts = { marine: 0, vis: 0 };
        const mFake = r => {
            counts.marine++;
            return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hourly_units: { ocean_current_velocity: 'km/h' }, hourly: { time, wind_wave_height: time.map((t, i) => 1 + Math.sin(i / 8)), wind_wave_direction: time.map(() => 250), wind_wave_period: time.map(() => 5), ocean_current_velocity: time.map(() => 1.852), ocean_current_direction: time.map(() => 120) } }) });
        };
        const vFake = r => {
            counts.vis++;
            return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hourly: { time, visibility: time.map(() => 9000) } }) });
        };
        await page.route(/marine-api\.open-meteo\.com/, mFake);
        await page.route(/api\.open-meteo\.com\/v1\/forecast/, vFake);
        const wr = await settings('Weather reading');
        for (const [txt, want] of [['After a change of the route: show the weather at once', true], ['Get the new forecast by itself when Windy has a newer run', true], ['Download sea, currents and visibility', true], ["Also read Windy's own map", false]]) {
            const cb = wr.locator('label', { hasText: txt }).locator('input');
            if ((await cb.isChecked()) !== want) await cb.click();
        }
        ok((await wr.locator('label', { hasText: 'After a change of the route: show the weather at once' }).count()) === 1 && (await wr.locator('label', { hasText: 'when Windy has a newer run' }).count()) === 1 && (await wr.locator('label', { hasText: 'Download sea, currents and visibility' }).count()) === 1, 'Settings → Weather reading: route changes at once, new run by itself, downloads that work with the tab hidden, Windy map optional');
        // the forecast with the tab hidden: it must finish (nothing is read from Windy's drawn map any more)
        await go(page, 'Weather');
        await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
        await page.locator('button', { hasText: /Get (latest )?forecast along route/ }).click();
        await page.waitForSelector('.wo', { state: 'detached', timeout: 120000 });
        await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
        const hidTxt = await page.locator('#pane').innerText();
        ok(/Done at \d\d:\d\d UTC: \d+ forecast points/.test(hidTxt) && counts.marine > 0 && counts.vis > 0, `forecast finishes with the tab hidden, sea / currents / visibility downloaded (${counts.marine} marine, ${counts.vis} visibility requests)`);
        ok(/Sea, currents: Open-Meteo marine/.test(hidTxt), 'the weather data line says where sea, currents and visibility come from');
        // a route change: the weather follows by itself, only the changed legs are fetched
        const before = counts.marine;
        await go(page, 'Route');
        const lastLat = page.locator('.tablewrap tbody tr').last().locator('input.pos').first();
        const oldLat = await lastLat.inputValue();
        await lastLat.fill(oldLat.replace(/^(\d+)/, m => String(Math.min(80, Number(m) + 1)).padStart(m.length, '0')));
        await lastLat.press('Enter');
        await lastLat.blur();
        // at once (before any download): the weather screens use the forecast already downloaded
        await page.waitForTimeout(300);
        await go(page, 'Weather');
        const quickTxt = await page.locator('#pane').innerText();
        ok(!/The route changed after the forecast/.test(quickTxt) && (await page.locator('.wt tbody tr, table.wxt tbody tr, .tablewrap tbody tr').count()) > 0, 'after a waypoint is moved the weather is shown at once from the forecast already downloaded (no waiting, no button)');
        await page.waitForFunction(() => /Updated at \d\d:\d\d UTC: \d+ new forecast point/.test(document.querySelector('#pane')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
        const autoTxt = await page.locator('#pane').innerText();
        const fetched = counts.marine - before;
        ok(/Updated at \d\d:\d\d UTC: \d+ new forecast point/.test(autoTxt), 'then only the new part of the route is downloaded, by itself');
        ok(fetched > 0 && fetched < before, `only the changed legs are fetched again (${fetched} new points, first time ${before})`);
        ok(/By itself: route changes shown at once \(only new parts downloaded\) · a newer Windy run fetched when it is out/.test(autoTxt), 'the forecast card says what happens by itself');
        // a small nudge of a waypoint: nothing is downloaded at all
        const before2 = counts.marine;
        await go(page, 'Route');
        const lastLon = page.locator('.tablewrap tbody tr').last().locator('input.pos').nth(1);
        const oldLon = await lastLon.inputValue();
        await lastLon.fill(oldLon.replace(/(\d+)\.(\d)/, (m, a, b) => `${a}.${(Number(b) + 3) % 10}`));
        await lastLon.press('Enter');
        await lastLon.blur();
        await page.waitForTimeout(2500);
        await go(page, 'Weather');
        const nudgeTxt = await page.locator('#pane').innerText();
        ok(counts.marine === before2 && /nothing new to download/.test(nudgeTxt), `a small change of a waypoint downloads nothing (${counts.marine - before2} requests): ` + (nudgeTxt.match(/Weather shown from[^\n]*/) || [''])[0].slice(0, 110));
        // the area box
        const aw = page.locator('[data-g=wx-area]');
        await aw.locator('button', { hasText: 'Round the route' }).click();
        const awTxt = await aw.innerText();
        ok(/\d+ points, every (0\.5|1|2|3|4|5|6)°/.test(awTxt), 'area from the route: grid size shown');
        await aw.locator('button', { hasText: 'Get weather' }).click();
        await page.waitForSelector('.wo', { state: 'detached', timeout: 180000 });
        await page.waitForTimeout(500);
        ok(/Done at \d\d:\d\d UTC: \d+ of \d+ points/.test(await aw.innerText()) && /Fetched again by itself when Windy has a newer run/.test(await aw.innerText()), 'area weather downloaded; fetched again by itself when Windy has a newer run');
        ok((await page.locator('path.pp-wx-area').count()) === 1, 'the area is drawn on the map');
        await page.screenshot({ path: `${out}/37-area-weather.png` });
        await aw.locator('label.switch input').click();
        ok((await page.locator('path.pp-wx-area').count()) === 0, 'area switched off: box gone from the map');
        // back to the old way for anything after this
        const wr2 = await settings('Weather reading');
        for (const txt of ['After a change of the route: show the weather at once', 'Get the new forecast by itself when Windy has a newer run']) {
            const cb = wr2.locator('label', { hasText: txt }).locator('input');
            if (await cb.isChecked()) await cb.click();
        }
        await page.unroute(/marine-api\.open-meteo\.com/, mFake);
        await page.unroute(/api\.open-meteo\.com\/v1\/forecast/, vFake);
    }

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
    // a clear green button next to the ⓘ in the header (owner, 2026-11-24)
    const upd = page.locator('.g-head .g-upd');
    ok((await upd.count()) === 1 && (await upd.innerText()).includes(newer), `header shows an Update v${newer} button next to the ⓘ`);
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
    // set while the page starts (not before the reload: the running plugin's own update check could save over it)
    await page.addInitScript(() => {
        if (sessionStorage.getItem('__seenOnce')) return;
        sessionStorage.setItem('__seenOnce', '1');
        const k = 'windy-plugin-passage-plan:updates';
        localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), seen: '0.12.1', latest: null }));
    });
    await page.reload();
    const tWn = Date.now();
    await page.locator('.ub.ok').waitFor({ timeout: 10000 }).catch(() => {});
    log.push(`INFO what's new appeared after ${Date.now() - tWn} ms`);
    const wn = await page.locator('.ub.ok').innerText().catch(() => '');
    if (!wn) {
        await page.screenshot({ path: `${out}/21-whats-new-missing.png` });
        log.push('INFO after reload: ' + (await page.locator('#pane').innerText().catch(() => 'no panel')).replace(/\s+/g, ' ').slice(0, 300) + ' | errors: ' + errors.slice(-3).join(' / '));
    }
    ok(/Updated to version \d+\.\d+\.\d+/.test(wn) && /What's new/.test(wn), "after an update: what's new shown");
    ok((await page.locator('.ub.ok .ub__ver').count()) >= 3 && /Version \d+\.\d+\.\d+ · \d+ \w{3} \d{4}/.test(wn), `what's new lists every version since the last one opened, with its date (${await page.locator('.ub.ok .ub__ver').count()} versions)`);
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
