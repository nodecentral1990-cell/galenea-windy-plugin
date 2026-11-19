// Phone check (owner, 2026-11-02): every section at phone size, in Windy's "fullscreen" phone layout.
// Phone audit (owner's report, 2026-11-19: "the user cant go back"): the same walk at 320, 360, 390 and 430 px wide and
// a short one with the phone held sideways (730 x 325), with checks that there is always a way back that can be seen
// and pressed, nothing sits above Windy's own phone header (where the phone's status bar is), nothing is wider than the
// screen, every button is a 38 px touch target and every text box uses 16 px text.
// Usage: node harness/phone.cjs <out-dir>                  all sizes (screenshots of each in its own folder)
//        node harness/phone.cjs <out-dir> <width> <height> one size
const path = require('path');
const { chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'));
const out = process.argv[2] || 'harness/phone';
const SIZES = process.argv[3] ? [[Number(process.argv[3]), Number(process.argv[4] || 844)]] : [[390, 844], [320, 700], [360, 740], [430, 932], [730, 325]];
const fixture = path.join(__dirname, '../test/fixtures/made-up-furuno-style.rtz');
const log = [];
let tag = '';
const ok = (c, m) => log.push((c ? 'PASS ' : 'FAIL ') + tag + m);

// ---- phone audit helpers (run inside the page) ----
/** Buttons, links, boxes and switches on screen that are smaller than a 38 px touch target, and text boxes under 16 px */
const scanPage = () => {
    const vis = e => { const st = getComputedStyle(e); const b = e.getBoundingClientRect(); return st.visibility !== 'hidden' && st.display !== 'none' && b.width > 0 && b.height > 0; };
    const name = e => (e.tagName.toLowerCase() + '.' + String(e.className && e.className.baseVal === undefined ? e.className : '').trim().split(/\s+/).filter(c => !/^svelte-/.test(c)).slice(0, 2).join('.') + ' "' + (e.innerText || e.getAttribute('aria-label') || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 20) + '"');
    const small = [];
    const tiny = [];
    for (const e of document.querySelectorAll('.pp button, .pp select, .pp summary, .pp input, .pp textarea, .pp label.switch, .pp label.gp__sw, .g-pop button')) {
        if (!vis(e) || e.disabled) continue;
        const b = e.getBoundingClientRect();
        let h = b.height;
        let w = b.width;
        const box = e.tagName === 'INPUT' && (e.type === 'checkbox' || e.type === 'radio');
        if (box) {
            // a tick box counts with the room kept around it, or with its label
            const st = getComputedStyle(e);
            h += parseFloat(st.marginTop) + parseFloat(st.marginBottom);
            w = 38;
            const l = e.closest('label');
            if (l) h = Math.max(h, l.getBoundingClientRect().height);
        }
        if (e.tagName === 'INPUT' && e.type === 'file') continue;
        // the route name in the voyage strip is a second way to the Route section (the section bar is the first)
        if (e.classList.contains('g-voy__name')) continue;
        if (h < 37.5 || (w < 37.5 && !/st-used__link|gd-link|lnk/.test(e.className))) small.push(`${Math.round(w)}x${Math.round(h)} ${name(e)}`);
        if ((e.tagName === 'INPUT' && !/checkbox|radio|range|color|file/.test(e.type)) || e.tagName === 'SELECT' || e.tagName === 'TEXTAREA') {
            const fs = parseFloat(getComputedStyle(e).fontSize);
            if (fs < 16) tiny.push(`${fs}px ${name(e)}`);
        }
    }
    return { small: [...new Set(small)], tiny: [...new Set(tiny)] };
};

async function run(browser, W, H, out) {
    tag = `[${W}x${H}] `;
    require('fs').mkdirSync(out, { recursive: true });
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, geolocation: { latitude: 20.4, longitude: -38.6, accuracy: 15 }, permissions: ['geolocation'] });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route(/open-meteo\.com|openseamap|gebco/, r => r.fulfill({ status: 200, body: '{}' }));
    await page.goto('file://' + path.join(__dirname, 'dist/index.html'));
    await page.waitForTimeout(600);
    const noSideScroll = async name => {
        const r = await page.evaluate(() => { const el = document.querySelector('.plugin__content'); return { sw: el.scrollWidth, cw: el.clientWidth }; });
        ok(r.sw <= r.cw + 1, `${name}: fits the width, no sideways scrolling of the panel (${r.sw} / ${r.cw} px)`);
    };
    const shot = async name => page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
    // ---- phone audit (2026-11-19) ----
    /** Bottom of Windy's own phone header: the plugin must keep everything below it (the phone's status bar is above) */
    const safeTop = async () => page.evaluate(() => { const h = document.querySelector('.plugin__mobile-header'); return h && h.offsetHeight ? Math.round(h.getBoundingClientRect().bottom) : 0; });
    const scan = async name => {
        const r = await page.evaluate(scanPage);
        ok(r.small.length === 0, `${name}: every button, box and switch is a 38 px touch target` + (r.small.length ? ': too small: ' + r.small.slice(0, 6).join(' | ') : ''));
        ok(r.tiny.length === 0, `${name}: every text box uses 16 px text (no phone zoom)` + (r.tiny.length ? ': ' + r.tiny.slice(0, 6).join(' | ') : ''));
    };
    /** A control that takes the user back: on screen, below Windy's header, a 38 px target, and really on top (pressable) */
    const reachable = async (loc, what) => {
        const top = await safeTop();
        const b = await loc.boundingBox().catch(() => null);
        const onTop = b ? await page.evaluate(([x, y, sel]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest(sel)); }, [b.x + b.width / 2, b.y + b.height / 2, 'button']) : false;
        ok(!!b && b.x >= 0 && b.x + b.width <= W + 1 && b.y >= top - 1 && b.y + b.height <= H + 1 && b.height >= 37.5 && b.width >= 37.5 && onTop,
            `${what}: on the screen, below Windy's header (the phone's status bar), a 38 px target and pressable (${b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}` : 'not found'}; header ends at ${top} px)`);
    };
    const panelScroll = async y => page.evaluate(v => { const el = document.querySelector('.plugin__content'); el.scrollTop = v === 'end' ? el.scrollHeight : v; return el.scrollTop; }, y);
    /** The section bar stays on screen however far the panel is scrolled, and a press shows the section from its start */
    const navStays = async (name, target, firstThing) => {
        const sc = await panelScroll('end');
        await page.waitForTimeout(150);
        const top = await safeTop();
        const nb = await page.locator('nav.g-nav').boundingBox();
        ok(sc > 50 && nb && nb.y >= top - 1 && nb.y < top + 12 && nb.y + nb.height <= H, `${name}: scrolled to the end (${sc} px), the section bar is still at the top of the panel (y ${Math.round(nb?.y ?? -1)}, header ends at ${top})`);
        await reachable(page.locator('nav.g-nav button', { hasText: target }), `${name}, scrolled to the end: "${target}" in the section bar`);
        await page.locator('nav.g-nav button', { hasText: target }).click();
        await page.waitForTimeout(250);
        const fb = await page.locator(firstThing).first().boundingBox().catch(() => null);
        const nb2 = await page.locator('nav.g-nav').boundingBox();
        ok(fb && nb2 && fb.y >= nb2.y + nb2.height - 2 && fb.y < H * 0.6, `${name} → ${target} from the section bar: ${target} is shown from its start, under the bar (first thing at y ${Math.round(fb?.y ?? -1)})`);
    };
    ok((await page.locator('.gp').count()) === 0, 'graph window not opened by itself on a phone (it would cover the panel)');
    ok((await page.locator('.sb').count()) === 0, 'ship window not shown over the panel on a phone');
    ok((await page.locator('.cb').count()) === 0, 'cursor weather bar not shown on a phone (no cursor, map hidden)');
    // the header's own buttons (Now, graphs, Help) must all be on the screen: at 320 px Help was off the edge
    for (const [sel, what] of [['.g-head .g-now', 'Now'], ['.g-head button[aria-label="Graph window"]', 'graph button'], ['.g-head .g-help-btn', 'Help button']]) await reachable(page.locator(sel), `header: ${what}`);
    await scan('Start (no route)');
    const navBox = await page.locator('nav.g-nav').boundingBox();
    ok(navBox && navBox.width <= W, `section bar fits the screen (${Math.round(navBox?.width ?? 0)} px)`);
    // UI reimagine (owner, 2026-11-13): voyage strip and the aid line on the phone too
    ok(/Planning aid only/.test(await page.locator('.g-aid').innerText()), '"Planning aid only" line visible on the phone');
    ok((await page.locator('.g-voy[data-state="empty"] button', { hasText: 'Open a route file' }).count()) === 1, 'voyage strip on the phone, no route: "Open a route file"');
    const stripBtn = await page.locator('.g-voy button').first().boundingBox();
    ok(stripBtn && stripBtn.height >= 34 && stripBtn.width > W * 0.7, `voyage strip button is a full-width touch target (${Math.round(stripBtn?.width ?? 0)} × ${Math.round(stripBtn?.height ?? 0)} px)`);
    await page.setInputFiles('input[type=file]', fixture);
    await page.waitForTimeout(400);
    // ETD = now (date box → Now → OK)
    await page.locator('.g-card', { hasText: 'Times (UTC)' }).locator('.dtf__value').first().click();
    await page.waitForTimeout(150);
    const dp = await page.locator('.dtf__pop').boundingBox();
    ok(dp && dp.x >= 0 && dp.x + dp.width <= W + 1 && (await page.locator('.dtf__pop button', { hasText: /^Cancel$/ }).count()) === 1, `date / time editor fits the phone and has OK and Cancel (${Math.round(dp?.x ?? -1)}–${Math.round((dp?.x ?? 0) + (dp?.width ?? 0))} px)`);
    await scan('Date / time editor');
    await shot('p00-datetime');
    await page.locator('.dtf__pop button', { hasText: /^Now$/ }).click();
    await page.locator('.dtf__pop button', { hasText: /^OK$/ }).click();
    await page.waitForTimeout(300);
    await shot('p01-route'); await noSideScroll('Route'); await scan('Route');
    // full-size waypoint table: over the whole screen, with Back at the top left, below Windy's header
    await page.locator('.g-card', { hasText: 'Waypoints' }).locator('button', { hasText: 'Full-size table' }).first().click();
    await page.waitForTimeout(250);
    {
        const top = await safeTop();
        const ob = await page.locator('.pp-overlay').boundingBox();
        ok(ob && ob.y >= top - 1 && ob.x >= -1 && ob.x + ob.width <= W + 1 && ob.y + ob.height <= H + 1, `full-size waypoint table: the whole screen below Windy's header, nothing under the phone's status bar (top ${Math.round(ob?.y ?? -1)}, header ends at ${top})`);
        await reachable(page.locator('.pp-overlay .g-back'), 'full-size waypoint table: Back');
        ok((await page.locator('.pp-overlay .g-fw__btns:visible').count()) === 0, 'full-size waypoint table: no minimise button on the phone (it would leave an empty screen)');
        await scan('Full-size waypoint table');
        await shot('p01b-waypoints-full');
        await page.locator('.pp-overlay .g-back').click();
        await page.waitForTimeout(150);
        ok((await page.locator('.pp-overlay').count()) === 0 && (await page.locator('.g-card__title', { hasText: /^Waypoints/ }).count()) === 1, 'full-size waypoint table: Back closes it and the Route section is there again');
    }
    const nav = n => page.locator('nav.g-nav button', { hasText: n }).click();
    const seg = n => page.locator('.g-shell > .g-seg button', { hasText: n }).click();
    await seg('Speed & fuel'); await page.waitForTimeout(200); await shot('p02-speed'); await noSideScroll('Speed & fuel'); await scan('Speed & fuel');
    await seg('Distances'); await page.waitForTimeout(200); await shot('p03-distances'); await noSideScroll('Distances'); await scan('Distances');
    await nav('Weather'); await page.waitForTimeout(200);
    // Weather's four views in a 2 × 2 grid
    const segs = await page.locator('.g-shell > .g-seg button').evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height) }; }));
    ok(segs.length === 4 && segs[0].y === segs[1].y && segs[2].y === segs[3].y && segs[2].y > segs[0].y && segs.every(g => g.h >= 38), 'Weather: four views in a 2 × 2 grid of touch-size buttons');
    await seg('Port weather'); await page.waitForTimeout(200);
    ok((await page.locator('button', { hasText: 'Pick on the map' }).count()) === 0 && (await page.locator('.pc').count()) === 1, 'Port weather on the phone: no "Pick on the map" (Windy hides the map), port name and own position instead');
    await shot('p04c-port-weather'); await noSideScroll('Port weather'); await scan('Port weather');
    // Port weather and Tides with data (own position; tide, current and sea temperature from a stand-in for Open-Meteo)
    {
        const HR = 3600;
        const t0 = Math.floor(Date.now() / 86400e3) * 86400 - 86400;
        const time = Array.from({ length: 9 * 24 }, (_, i) => t0 + i * HR);
        const marine = {
            hourly_units: { ocean_current_velocity: 'km/h', sea_level_height_msl: 'm' },
            hourly: {
                time,
                sea_level_height_msl: time.map(t => 2.6 * Math.cos((2 * Math.PI * (t - t0 - 3 * HR)) / (12.42 * HR))),
                ocean_current_velocity: time.map((t, i) => 1.5 + Math.sin(i / 3)),
                ocean_current_direction: time.map((t, i) => (i * 7) % 360),
                sea_surface_temperature: time.map(() => 13.4),
                wind_wave_height: time.map((t, i) => 1 + 0.5 * Math.sin(i / 6)),
                wind_wave_period: time.map(() => 5),
                wind_wave_direction: time.map(() => 250),
            },
        };
        const marineFake = route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(marine) });
        await page.route(/marine-api\.open-meteo\.com/, marineFake);
        await page.locator('.pc button', { hasText: 'My position' }).click();
        const got = await page.waitForSelector('.pw__day', { timeout: 60000 }).then(() => true).catch(() => false);
        await page.waitForTimeout(400);
        ok(got, 'Port weather on the phone: "My position" brings the 7 days up');
        if (got) {
            await shot('p04g-port-weather-data'); await noSideScroll('Port weather with data'); await scan('Port weather with data');
            await page.locator('.g-card__actions button', { hasText: 'Full size' }).click(); await page.waitForTimeout(300);
            const top = await safeTop();
            const ob = await page.locator('.pp-overlay').boundingBox();
            ok(ob && ob.y >= top - 1 && ob.x + ob.width <= W + 1, `Port weather full size: starts below Windy's header (top ${Math.round(ob?.y ?? -1)}, header ends at ${top})`);
            await reachable(page.locator('.pp-overlay .g-back'), 'Port weather full size: Back');
            await scan('Port weather full size');
            await shot('p04h-port-weather-full');
            await page.locator('.pp-overlay .g-back').click(); await page.waitForTimeout(150);
            ok((await page.locator('.pp-overlay').count()) === 0, 'Port weather full size: Back closes it');
        }
        await seg('Tides');
        const gotT = await page.waitForSelector('.tp__tbl', { timeout: 30000 }).then(() => true).catch(() => false);
        await page.waitForTimeout(300);
        ok(gotT, 'Tides on the phone: the graph and the high / low waters for the same place');
        if (gotT) {
            await noSideScroll('Tides with data'); await scan('Tides with data');
            const tg = await page.locator('svg[aria-label="Tide graph"]').first();
            await tg.scrollIntoViewIfNeeded();
            const tb = await tg.boundingBox();
            ok(tb && tb.x >= 0 && tb.x + tb.width <= W + 1, `Tides: the graph fits the phone width (${Math.round(tb?.width ?? 0)} px)`);
            await page.touchscreen.tap(tb.x + tb.width * 0.5, tb.y + tb.height * 0.5);
            await page.waitForTimeout(200);
            ok(/UTC · -?\d+\.\d\d m/.test((await page.locator('.tg__hov').textContent().catch(() => '')) || ''), 'Tides: a touch on the graph reads the time and height there (no pointer to hover with)');
            await shot('p04i-tides-data');
        }
        await page.unroute(/marine-api\.open-meteo\.com/, marineFake);
        await page.locator('.plugin__content').evaluate(el => (el.scrollTop = 0));
    }
    await seg('Tides'); await page.waitForTimeout(200); await noSideScroll('Tides'); await scan('Tides');
    await seg('Map charts'); await page.waitForTimeout(200); await shot('p04d-map-charts'); await noSideScroll('Map charts'); await scan('Map charts');
    ok(/map is hidden/.test(await page.locator('.g-phone-note:visible').first().innerText().catch(() => '')), 'Map charts on the phone: a line says these need the map, which Windy hides behind the plugin on a phone');
    await seg('Along route'); await page.waitForTimeout(200);
    await page.locator('button', { hasText: /Get (latest )?forecast along route/ }).click();
    // the progress window: its card fits the screen and Stop can be pressed, below Windy's header
    {
        const seen = await page.waitForSelector('.wo__card', { timeout: 5000 }).then(() => true).catch(() => false);
        const cb = seen ? await page.locator('.wo__card').boundingBox().catch(() => null) : null;
        const sb = seen ? await page.locator('.wo__card button', { hasText: 'Stop' }).boundingBox().catch(() => null) : null;
        const top = await safeTop();
        ok(!!cb && cb.x >= 0 && cb.x + cb.width <= W + 1 && cb.y >= top && !!sb && sb.height >= 37.5 && sb.y + sb.height <= H, `progress window: fits the phone, below Windy's header, with Stop on screen (${cb ? `${Math.round(cb.x)}–${Math.round(cb.x + cb.width)} px, top ${Math.round(cb.y)}` : 'not seen'})`);
        if (seen) await shot('p04a-progress');
    }
    await page.waitForSelector('.wo', { state: 'detached', timeout: 180000 }).catch(() => {});
    await page.waitForTimeout(300);
    await shot('p04-weather'); await noSideScroll('Weather'); await scan('Weather');
    // progress window (it was open a moment ago): narrower than the screen
    // full-size weather table: Back at the top left, below Windy's header
    await page.locator('.g-card', { hasText: 'Weather table' }).locator('button', { hasText: 'Full-size' }).first().click();
    await page.waitForTimeout(250);
    {
        const top = await safeTop();
        const ob = await page.locator('.pp-overlay').boundingBox();
        ok(ob && ob.y >= top - 1 && ob.x + ob.width <= W + 1, `full-size weather table: starts below Windy's header (top ${Math.round(ob?.y ?? -1)}, header ends at ${top})`);
        await reachable(page.locator('.pp-overlay .g-back'), 'full-size weather table: Back');
        const tb = await page.locator('.pp-overlay table').first().boundingBox();
        ok(tb && tb.y < H * 0.5, `full-size weather table: the table starts in the upper half of the phone screen (y ${Math.round(tb?.y ?? -1)})`);
        await scan('Full-size weather table');
        await shot('p04f-weather-full');
        await page.locator('.pp-overlay .g-back').click();
        await page.waitForTimeout(150);
        ok((await page.locator('.pp-overlay').count()) === 0, 'full-size weather table: Back closes it');
    }
    const strip = await page.locator('.g-voy').boundingBox();
    ok(strip && strip.height <= (W < 380 ? 122 : 100) && /Worst ahead/.test(await page.locator('.g-voy').innerText()) && /fetched/.test(await page.locator('.g-voy').innerText()), `voyage strip on the phone: worst ahead and the forecast run, in ${W < 380 ? '5 lines at most on the narrowest phones' : '4 lines at most'} (${Math.round(strip?.height ?? 0)} px)`);
    ok((await page.locator('.pp-maptool').count()) === 0 && (await page.locator('.g-setwin').count()) === 0, 'no map note and no floating settings window on the phone');
    // gear beside the weather table: the same fold-out, full width, Done at the top and at the bottom
    const tcard = page.locator('.g-card', { hasText: 'Weather table' });
    const tgear = tcard.locator('.g-card__head [data-g="gear"]');
    const tg = await tgear.boundingBox();
    ok(tg && tg.width >= 38 && tg.height >= 38, `gear is a 38 px touch target on the phone (${Math.round(tg?.width ?? 0)} px)`);
    await tgear.click(); await page.waitForTimeout(300);
    const fold = tcard.locator('.g-fold');
    const fb = await fold.boundingBox();
    ok(fb && fb.x >= 0 && fb.x + fb.width <= W + 1 && (await fold.locator('.g-fold__done').count()) === 2, `settings fold-out fits the phone width, with Done at the top and at the bottom (${Math.round(fb?.x ?? -1)}–${Math.round((fb?.x ?? 0) + (fb?.width ?? 0))} px)`);
    ok(fb && fb.y >= -2 && fb.y < 130, `opening the gear brings the fold-out to the top of the phone screen (${Math.round(fb?.y ?? -1)} px)`);
    await reachable(fold.locator('.g-fold__done').first(), 'settings fold-out: Done at its top (not hidden under the section bar)');
    await scan('Weather with a settings fold-out open');
    await shot('p04e-gear-fold'); await noSideScroll('Weather with a settings fold-out open');
    const sc = await page.evaluate(() => { const el = document.querySelector('.plugin__content'); const a = el.scrollTop; el.scrollTop = a + 300; const b = el.scrollTop; el.scrollTop = a; return b - a; });
    ok(sc > 0, `the panel scrolls with the fold-out open on the phone (${sc} px)`);
    const fin = await fold.locator('input[type=number]').first().evaluate(e => parseFloat(getComputedStyle(e).fontSize));
    ok(fin >= 16, `boxes in the fold-out use 16 px text (no phone zoom): ${fin} px`);
    await fold.locator('.g-fold__done').last().click();
    ok((await page.locator('.g-fold').count()) === 0, 'Done at the bottom closes the fold-out');
    await page.locator('.g-card', { hasText: 'Weather table' }).scrollIntoViewIfNeeded().catch(() => {});
    await shot('p04b-weather-table');
    await page.locator('.g-card', { hasText: 'Forecast along the route' }).locator('.g-hint').first().click();
    await page.waitForTimeout(200);
    const pop = await page.locator('.g-pop').boundingBox();
    ok(pop && pop.x >= 0 && pop.x + pop.width <= W + 1, `ⓘ explanation fits the phone screen (${Math.round(pop?.x ?? -1)}–${Math.round((pop?.x ?? 0) + (pop?.width ?? 0))})`);
    await shot('p05-hint');
    // the explanation closes with its own ✕ (a phone has no Esc key)
    await reachable(page.locator('.g-pop .g-pop__x'), 'ⓘ explanation: its ✕');
    await page.locator('.g-pop .g-pop__x').click();
    await page.waitForTimeout(100);
    ok((await page.locator('.g-pop').count()) === 0, 'ⓘ explanation: ✕ closes it');
    // far down a long section: the section bar is still there, and takes the user to another section's start
    await navStays('Weather', 'Route', '.g-shell > .g-seg');
    await shot('p05b-back-to-route');
    await nav('Weather'); await page.waitForTimeout(200);
    await nav('Motion'); await page.waitForTimeout(300);
    await page.locator('.mt button', { hasText: /^ETD$/ }).click();
    await page.locator('.mt button', { hasText: '3 h ▶' }).click();
    await page.waitForTimeout(400);
    ok((await page.locator('.g-shell .rp').count()) === 1, 'Motion: the time buttons bring the ship and the diagram up without Windy\'s slider');
    await shot('p06-motion'); await noSideScroll('Motion'); await scan('Motion');
    const rp = await page.locator('.g-shell .rp svg').first().boundingBox().catch(() => null);
    ok(!rp || rp.width <= W, `polar diagram fits the phone width (${Math.round(rp?.width ?? 0)} px)`);
    // live polar from the phone's GPS
    await seg('Live (GPS)');
    await page.locator('button', { hasText: 'Start live (GPS)' }).click();
    await page.waitForTimeout(2500);
    const lvTxt = await page.locator('.lv').innerText();
    ok(/20°24\.\d+'N/.test(lvTxt) && (await page.locator('.lv .rp').count()) === 1, 'live polar: GPS position read and the diagram drawn with the weather there: ' + lvTxt.replace(/\s+/g, ' ').slice(0, 120));
    await page.locator('.lv input[type=number]').first().fill('210');
    await page.locator('.lv input[type=number]').first().dispatchEvent('change');
    await page.waitForTimeout(300);
    ok(/210°/.test(await page.locator('.lv__head').innerText()), 'live polar: heading typed in is used');
    await shot('p06b-live');
    await noSideScroll('Motion live'); await scan('Motion live');
    await page.locator('button', { hasText: 'Stop' }).first().click();
    await seg('At the map time');
    await page.locator('.g-card__head [data-gear="polar"]').click(); await page.waitForTimeout(250);
    ok((await page.locator('.g-fold label.switch').count()) === 5, 'Motion gear on the phone: the polar switches in place');
    await shot('p06c-motion-gear'); await noSideScroll('Motion with the gear open');
    await page.locator('.g-fold .g-fold__done').first().click();
    await nav('Optimise'); await page.waitForTimeout(200); await shot('p07-optimise'); await noSideScroll('Optimise'); await scan('Optimise');
    await seg('Change the track'); await page.waitForTimeout(200); await shot('p08-track'); await noSideScroll('Change the track'); await scan('Change the track');
    await seg('Compare'); await page.waitForTimeout(200); await shot('p09-compare'); await noSideScroll('Compare'); await scan('Compare');
    await nav('Settings'); await page.waitForTimeout(200); await shot('p10-settings'); await noSideScroll('Settings'); await scan('Settings');
    ok((await page.locator('details > summary .st-title').count()) === 14 && (await page.locator('.st-search__in').count()) === 1, 'Settings on the phone: search box and all 14 groups');
    await page.locator('details summary', { hasText: 'Ship particulars' }).click();
    await page.waitForTimeout(200); await shot('p11-ship'); await noSideScroll('Settings → Ship particulars');
    // every settings group open: no sideways scrolling, touch targets, 16 px boxes; then the way out of this long list
    for (const g of await page.locator('details:not([open]) > summary .st-title').allInnerTexts()) await page.locator('details > summary', { hasText: g }).first().click();
    await page.waitForTimeout(300);
    await noSideScroll('Settings, every group open'); await scan('Settings, every group open');
    await navStays('Settings (every group open)', 'Motion', '.g-shell > .g-seg');
    await shot('p11b-settings-to-motion');
    await nav('Settings'); await page.waitForTimeout(200);
    await page.locator('.g-help-btn').click(); await page.waitForTimeout(300); await shot('p12-help'); await noSideScroll('Help'); await scan('Help');
    // Help: Back at its top left, the four views on screen, and Back returns to the section that was open
    await reachable(page.locator('.g-drawer .g-back'), 'Help: Back');
    await reachable(page.locator('.g-drawer .g-drawer__x'), 'Help: ✕');
    for (const h of ['Guide', 'Usage', 'Feedback', 'About']) await reachable(page.locator('.g-drawer__seg button', { hasText: h }), `Help: "${h}"`);
    for (const h of ['Usage', 'Feedback', 'About', 'Guide']) {
        await page.locator('.g-drawer__seg button', { hasText: h }).click(); await page.waitForTimeout(200);
        await noSideScroll(`Help → ${h}`); await scan(`Help → ${h}`);
    }
    // far down the long guide, Back is still on the screen
    await panelScroll('end'); await page.waitForTimeout(150);
    await reachable(page.locator('.g-drawer .g-back'), 'Help, scrolled to the end of the guide: Back');
    await shot('p12b-help-end');
    await page.locator('.g-drawer .g-back').click(); await page.waitForTimeout(250);
    ok((await page.locator('.g-drawer').count()) === 0 && (await page.locator('.st-search__in').count()) === 1, 'Help: Back closes it and shows the section that was open (Settings)');
    {
        const sb = await page.locator('.st-search__in').boundingBox();
        ok(sb && sb.y > 0 && sb.y < H * 0.6, `Help: after Back the section is shown from its start (search box at y ${Math.round(sb?.y ?? -1)})`);
    }
    // graph window opened by hand: full screen over the panel, with a close button
    await page.locator('.g-head button[aria-label="Graph window"]').click();
    await page.waitForTimeout(1500);
    const gp = await page.locator('.gp').boundingBox().catch(() => null);
    ok(gp && gp.width <= W + 1 && gp.x >= -1, `graph window fits the phone when opened (${Math.round(gp?.width ?? 0)} px wide)`);
    await shot('p13-graphs');
    // owner's report, 2026-11-19: the graph window's buttons sat under the phone's status bar and could not be pressed
    {
        const top = await safeTop();
        ok(gp && gp.y >= top - 1 && gp.y + gp.height <= H + 1, `graph window: starts below Windy's header, not at the very top of the screen (top ${Math.round(gp?.y ?? -1)}, header ends at ${top})`);
        await reachable(page.locator('.gp .gp__back'), 'graph window: Back');
        await reachable(page.locator('.gp .gp__x'), 'graph window: ✕');
        ok((await page.locator('.gp__head button[title="Minimise"], .gp__head button[title="Maximise"]').count()) === 0, 'graph window: no minimise / maximise on the phone (always the whole screen)');
        await scan('Graph window');
        // a touch on a graph reads the values there and sets the map time (there is no pointer to hover with)
        const pl = await page.locator('.gp__plots').boundingBox();
        const before = await page.locator('.gp__foot b').first().innerText();
        await page.touchscreen.tap(pl.x + pl.width * 0.6, pl.y + pl.height * 0.3);
        await page.waitForTimeout(300);
        const after = await page.locator('.gp__foot b').first().innerText();
        ok(before !== after && /UTC/.test(after), `graph window: a touch on a graph reads it and sets the map time (${before} → ${after})`);
        // list box: a sheet with Done
        await page.locator('.gp__pick').first().click(); await page.waitForTimeout(200);
        const pp = await page.locator('.gp__pop').boundingBox();
        ok(pp && pp.x >= 0 && pp.x + pp.width <= W + 1 && pp.y >= top && pp.y + pp.height <= H + 1, `graph list box: fits the phone screen (${Math.round(pp?.x ?? -1)}–${Math.round((pp?.x ?? 0) + (pp?.width ?? 0))} px)`);
        await reachable(page.locator('.gp__pop .gp__done'), 'graph list box: Done');
        await scan('Graph list box');
        await shot('p13b-graph-list');
        await page.locator('.gp__pop .gp__done').click(); await page.waitForTimeout(150);
        ok((await page.locator('.gp__pop').count()) === 0, 'graph list box: Done closes it');
        await page.locator('.gp .gp__back').click(); await page.waitForTimeout(200);
        ok((await page.locator('.gp').count()) === 0 && (await page.locator('nav.g-nav').count()) === 1, 'graph window: Back closes it and the plugin is there again');
        // with no route (as in the owner's screenshot) the window still has its way back
        await page.locator('.g-head button[aria-label="Graph window"]').click(); await page.waitForTimeout(300);
        await page.locator('.gp .gp__x').click(); await page.waitForTimeout(150);
        ok((await page.locator('.gp').count()) === 0, 'graph window: ✕ closes it too');
    }
    // after an update: "What's new" at the top with its close button on screen, the panel still scrolls
    await page.evaluate(() => {
        const k = 'windy-plugin-passage-plan:updates';
        localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), seen: '0.12.1', latest: null }));
    });
    await page.reload();
    await page.waitForTimeout(800);
    if ((await page.locator('.ub.ok').count()) === 1) {
        await reachable(page.locator('.ub.ok .ub__ok'), `"What's new" after an update: "OK, close"`);
        await noSideScroll(`"What's new"`); await scan(`"What's new"`);
        const sc2 = await panelScroll('end');
        ok(sc2 > 50, `"What's new": the panel still scrolls under it (${sc2} px)`);
        await panelScroll(0);
        await shot('p14-whats-new');
        await page.locator('.ub.ok .ub__ok').click(); await page.waitForTimeout(150);
        ok((await page.locator('.ub.ok').count()) === 0, `"What's new": "OK, close" closes it`);
    } else ok(false, `"What's new" not shown after an update`);
    const docW = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(docW <= W + 1, `the page itself is never wider than the screen (${docW} px)`);
    ok(errors.length === 0, 'no page errors: ' + errors.join(' / ').slice(0, 300));
    await page.close();
}

// Phone held sideways (730 x 325): still the phone layout (no floating windows over the panel), the ways back on screen
async function runSideways(browser, W, H, out) {
    tag = `[${W}x${H} sideways] `;
    require('fs').mkdirSync(out, { recursive: true });
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route(/open-meteo\.com|openseamap|gebco/, r => r.fulfill({ status: 200, body: '{}' }));
    await page.goto('file://' + path.join(__dirname, 'dist/index.html'));
    await page.waitForTimeout(600);
    const shot = async name => page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
    const inScreen = async (loc, what) => {
        const b = await loc.boundingBox().catch(() => null);
        ok(!!b && b.x >= 0 && b.x + b.width <= W + 1 && b.y >= 0 && b.y + b.height <= H + 1 && b.height >= 37.5, `${what}: on the screen, a 38 px target (${b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}` : 'not found'})`);
    };
    ok((await page.locator('.sb').count()) === 0 && (await page.locator('.cb').count()) === 0 && (await page.locator('.gp').count()) === 0, 'phone layout is used (no ship window, weather bar or graph window opened over the panel by themselves)');
    await page.setInputFiles('input[type=file]', fixture);
    await page.waitForTimeout(400);
    await shot('s01-route');
    await page.locator('nav.g-nav button', { hasText: 'Settings' }).click(); await page.waitForTimeout(200);
    const sc = await page.evaluate(() => { const el = document.querySelector('.plugin__content'); el.scrollTop = el.scrollHeight; return el.scrollTop; });
    await page.waitForTimeout(150);
    const nb = await page.locator('nav.g-nav').boundingBox();
    ok(sc > 50 && nb && nb.y >= 0 && nb.y + nb.height <= H && nb.height <= 60, `Settings scrolled to the end (${sc} px): the section bar is still on the screen, and low (${Math.round(nb?.height ?? 0)} px high)`);
    await inScreen(page.locator('nav.g-nav button', { hasText: 'Route' }), 'section bar: Route');
    await shot('s02-settings-end');
    await page.locator('.plugin__content').evaluate(el => (el.scrollTop = 0));
    await page.locator('.g-help-btn').click(); await page.waitForTimeout(300);
    await inScreen(page.locator('.g-drawer .g-back'), 'Help: Back');
    await shot('s03-help');
    await page.locator('.g-drawer .g-back').click(); await page.waitForTimeout(200);
    ok((await page.locator('.g-drawer').count()) === 0, 'Help: Back closes it');
    await page.locator('.plugin__content').evaluate(el => (el.scrollTop = 0));
    await page.locator('.g-head button[aria-label="Graph window"]').click(); await page.waitForTimeout(600);
    await inScreen(page.locator('.gp .gp__back'), 'graph window: Back');
    const gp = await page.locator('.gp').boundingBox();
    ok(gp && gp.x >= -1 && gp.x + gp.width <= W + 1 && gp.y >= 0 && gp.y + gp.height <= H + 1, `graph window: the whole screen, nothing off it (${Math.round(gp?.width ?? 0)} x ${Math.round(gp?.height ?? 0)})`);
    await shot('s04-graphs');
    await page.locator('.gp .gp__back').click(); await page.waitForTimeout(200);
    ok((await page.locator('.gp').count()) === 0, 'graph window: Back closes it');
    const r = await page.evaluate(() => { const el = document.querySelector('.plugin__content'); return { sw: el.scrollWidth, cw: el.clientWidth, dw: document.documentElement.scrollWidth }; });
    ok(r.sw <= r.cw + 1 && r.dw <= W + 1, `no sideways scrolling (${r.sw} / ${r.cw} px; page ${r.dw} px)`);
    ok(errors.length === 0, 'no page errors: ' + errors.join(' / ').slice(0, 300));
    await page.close();
}

(async () => {
    const browser = await chromium.launch();
    for (const [W, H] of SIZES) {
        // the 390 px walk keeps its place (harness/phone-shots); the other sizes go in folders of their own
        const dir = SIZES.length === 1 || (W === 390 && H === 844) ? out : `${out}/${W}x${H}`;
        try {
            if (H <= 500 && W > H) await runSideways(browser, W, H, dir);
            else await run(browser, W, H, dir);
        } catch (e) {
            ok(false, 'the walk stopped: ' + String(e).split('\n')[0]);
        }
    }
    await browser.close();
    console.log(log.join('\n'));
    const fails = log.filter(l => l.startsWith('FAIL')).length;
    console.log(`\n${log.length - fails} PASS, ${fails} FAIL`);
})().catch(e => { console.log(log.join('\n')); console.error(e); process.exit(1); });
