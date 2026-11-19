// Galenea design system (UI overhaul, owner 2026-11-02; spec: windy/notes/ui-redesign-spec.md §3).
// One stylesheet put into the page while the plugin is open, so it also reaches the floating windows (ship window,
// graph window, progress) and pop-ups that live outside Windy's pane. Every rule is under `.pp` (the plugin's root
// class on the pane and on each floating window) or a `g-` class, so Windy's own styles are not touched.

const CSS = String.raw`
.pp {
  --g-bg-0: #101316; --g-bg-1: #181c21; --g-bg-2: #21272e; --g-bg-3: #2a313a;
  --g-border: #333b45; --g-border-strong: #4a5563;
  --g-text-1: #f3f5f7; --g-text-2: #c3cad2; --g-text-3: #8d97a3;
  --g-accent: #4d9cff; --g-accent-hover: #6aaeff; --g-accent-soft: rgba(77,156,255,.16); --g-on-accent: #0b1220;
  --g-warn: #f4b63f; --g-danger: #ff5c5c; --g-ok: #3ecf8e; --g-info: #7fb6ff;
  --g-r-s: 4px; --g-r-m: 8px; --g-r-l: 12px;
  --g-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 1px var(--g-border-strong);
  --g-font: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --g-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-family: var(--g-font);
  font-size: 13px; line-height: 1.4; color: var(--g-text-1);
}
.pp[data-g-dim] { --g-text-1: #d6dbe0; --g-text-2: #a7afb8; --g-accent: #3f82d6; --g-bg-1: #14171b; --g-bg-2: #1c2127; }
.pp *, .pp *::before, .pp *::after { box-sizing: border-box; }
.pp :focus-visible { outline: 2px solid #fff; outline-offset: 1px; box-shadow: 0 0 0 4px var(--g-accent-soft); }
.pp table, .pp .mono, .pp input[type=number] { font-variant-numeric: tabular-nums; }

/* ---------- buttons (the old .pp-btn become the new secondary / ghost buttons) ---------- */
.pp button.pp-btn, .pp .g-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 30px; padding: 0 12px; margin: 2px 4px 2px 0;
  background: var(--g-bg-2); color: var(--g-text-1);
  border: 1px solid var(--g-border); border-radius: var(--g-r-m);
  font: 500 13px/1 var(--g-font); cursor: pointer; white-space: nowrap;
  transition: background .12s, border-color .12s, color .12s;
}
.pp button.pp-btn:hover:not(:disabled), .pp .g-btn:hover:not(:disabled) { background: var(--g-bg-3); border-color: var(--g-border-strong); }
.pp button.pp-btn.small, .pp .g-btn--s { min-height: 26px; padding: 0 9px; font-size: 12px; border-radius: 6px; }
.pp button.pp-btn--ghost, .pp .g-btn--ghost { background: transparent; border-color: transparent; color: var(--g-text-2); }
.pp button.pp-btn--ghost:hover:not(:disabled), .pp .g-btn--ghost:hover:not(:disabled) { background: var(--g-bg-2); color: var(--g-text-1); border-color: var(--g-border); }
.pp button.pp-btn.g-btn--primary, .pp .g-btn--primary {
  background: var(--g-accent); border-color: var(--g-accent); color: var(--g-on-accent); font-weight: 650;
}
.pp button.pp-btn.g-btn--primary:hover:not(:disabled), .pp .g-btn--primary:hover:not(:disabled) { background: var(--g-accent-hover); border-color: var(--g-accent-hover); }
.pp .g-btn--danger, .pp button.pp-btn.g-btn--danger { background: transparent; border-color: transparent; color: var(--g-danger); }
.pp .g-btn--danger:hover:not(:disabled) { background: rgba(255,92,92,.16) !important; }
.pp button.pp-btn:disabled, .pp .g-btn:disabled { opacity: .45; cursor: default; }
.pp button.pp-btn.pp-on, .pp .g-btn.is-on { background: var(--g-accent-soft); border-color: var(--g-accent); color: var(--g-accent-hover); }
.pp .g-ibtn {
  display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0;
  background: transparent; border: 1px solid transparent; border-radius: var(--g-r-m); color: var(--g-text-2); cursor: pointer;
}
.pp .g-ibtn:hover { background: var(--g-bg-2); color: var(--g-text-1); }
.pp .g-ibtn.is-on { background: var(--g-accent-soft); color: var(--g-accent-hover); }
.pp .g-ibtn--s { width: 26px; height: 26px; border-radius: 6px; }
/* Back: phones only (full-screen windows and Help) */
.pp .g-back { display: none; }
/* a line shown on phones only (things that need the map, which Windy hides behind the plugin on a phone) */
.pp .g-phone-note { display: none; }

/* Floating windows (owner, 2026-11-13): move by the title bar, resize by the right / bottom edge and the corner,
   minimise, original size, close (ui/floatWin.ts). */
.g-fw { box-sizing: border-box; }
/* Port weather / tides: the chosen place on the map (owner, 2026-11-13) */
.pp-pick-dot span { display: block; width: 12px; height: 12px; margin: 3px; border-radius: 50%; background: #ffd400;
  border: 2px solid #1b1b1b; box-shadow: 0 0 0 3px rgba(255,212,0,.45); }
.pp-chart-legend { position: fixed; left: 8px; bottom: 64px; z-index: 500; max-width: 300px; padding: 4px 8px; border-radius: 6px;
  background: rgba(14,20,30,.82); color: #e8edf4; font: 11px/1.35 system-ui, sans-serif; pointer-events: auto; }
.g-fw.g-fw--placed { overflow: hidden; display: flex; flex-direction: column; }
.g-fw.g-fw--placed > .g-fw__body { flex: 1; min-height: 0; overflow: auto; }
.g-fw__bar { cursor: move; user-select: none; touch-action: none; }
.g-fw__head { display: flex; align-items: center; gap: 6px; margin: -2px -4px 3px 0; min-height: 20px; }
.g-fw__title { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-fw__btns { display: inline-flex; gap: 2px; margin-left: auto; flex: none; }
.g-fw__btn { width: 22px; height: 20px; padding: 0; border: 0; border-radius: 5px; background: rgba(255,255,255,0.08);
  color: inherit; font: 12px/20px system-ui, sans-serif; cursor: pointer; }
.g-fw__btn:hover { background: rgba(255,255,255,0.22); }
.g-fw--min > :not(.g-fw__bar):not(.g-fw__head) { display: none !important; }
.g-fw--min { height: auto !important; }
.g-fw__grip { position: absolute; z-index: 3; }
.g-fw__grip--r { top: 0; right: -3px; width: 7px; height: 100%; cursor: ew-resize; }
.g-fw__grip--b { left: 0; bottom: -3px; height: 7px; width: 100%; cursor: ns-resize; }
.g-fw__grip--c { right: -3px; bottom: -3px; width: 14px; height: 14px; cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.35) 50%); border-bottom-right-radius: 4px; }

/* ---------- form controls ---------- */
.pp input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), .pp select, .pp textarea {
  background: var(--g-bg-2); color: var(--g-text-1);
  border: 1px solid var(--g-border); border-radius: var(--g-r-s);
  min-height: 28px; padding: 3px 7px; font: 13px var(--g-font);
}
.pp input:not([type=checkbox]):not([type=radio]):hover, .pp select:hover { border-color: var(--g-border-strong); }
.pp input:focus, .pp select:focus, .pp textarea:focus { border-color: var(--g-accent); outline: none; box-shadow: 0 0 0 3px var(--g-accent-soft); }
.pp input[type=number] { -moz-appearance: textfield; }
.pp input[type=number]::-webkit-inner-spin-button, .pp input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.pp input[type=checkbox], .pp input[type=radio] { accent-color: var(--g-accent); width: 15px; height: 15px; vertical-align: -2px; }
.pp input[type=range] { accent-color: var(--g-accent); }
.pp select {
  -webkit-appearance: none; appearance: none; padding-right: 24px; cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238d97a3' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 7px center;
}
.pp label { color: var(--g-text-2); }

/* ---------- text ---------- */
.pp .pp-note { color: var(--g-text-3); font-size: 12px; opacity: 1; }
.pp .pp-err, .pp .pp-note.pp-err { color: var(--g-danger); }
.pp h4 { font-size: 14px; font-weight: 650; margin: 14px 0 6px; color: var(--g-text-1); }
.pp h5 { font-size: 13px; font-weight: 650; color: var(--g-text-1); }
.pp a { color: var(--g-accent-hover); }
.pp b, .pp strong { color: var(--g-text-1); font-weight: 650; }

/* ---------- tables ---------- */
.pp table { border-collapse: collapse; font-size: 12px; }
.pp table th { background: var(--g-bg-2); color: var(--g-text-2); font-weight: 600; }
.pp table td, .pp table th { border-bottom: 1px solid rgba(255,255,255,.06); }
.pp table tbody tr:hover td { background: rgba(255,255,255,.035); }

/* ---------- folded groups (details) ---------- */
.pp details > summary { cursor: pointer; }

/* ---------- scrollbars: visible when needed, absent when it all fits ---------- */
.pp .pp-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.28); border-radius: 6px; }

/* ---------- new components ---------- */
.pp .g-card { background: var(--g-bg-1); border: 1px solid var(--g-border); border-radius: var(--g-r-m); padding: 12px; margin: 0 0 12px; }
.pp .g-card__head { display: flex; align-items: center; gap: 6px; margin: -2px 0 8px; min-height: 28px; }
.pp .g-card__title { font-size: 14px; font-weight: 650; color: var(--g-text-1); margin: 0; }
.pp .g-card__actions { margin-left: auto; display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.pp .g-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pp .g-seg { display: flex; background: var(--g-bg-2); border-radius: var(--g-r-m); padding: 3px; gap: 3px; margin: 0 0 12px; }
.pp .g-seg__opt {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px;
  border: 0; border-radius: 6px; background: transparent; color: var(--g-text-2); font: 500 13px var(--g-font); cursor: pointer;
}
.pp .g-seg__opt:hover { color: var(--g-text-1); background: rgba(255,255,255,.04); }
.pp .g-seg__opt.is-on { background: var(--g-bg-3); color: var(--g-text-1); box-shadow: inset 0 -2px 0 var(--g-accent); }
.pp .g-chip { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px; border-radius: var(--g-r-s);
  font: 650 11px/1 var(--g-font); letter-spacing: .02em; background: var(--g-bg-3); color: var(--g-text-2); white-space: nowrap; }
.pp .g-chip--ok { background: rgba(62,207,142,.16); color: var(--g-ok); }
.pp .g-chip--warn { background: rgba(244,182,63,.16); color: var(--g-warn); }
.pp .g-chip--danger { background: rgba(255,92,92,.16); color: var(--g-danger); }
.pp .g-chip--info { background: var(--g-accent-soft); color: var(--g-info); }
.pp .g-status { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; color: var(--g-text-2); margin: 6px 0; }
.pp .g-status--ok { color: var(--g-ok); }
.pp .g-status--warn { color: var(--g-warn); }
.pp .g-status--err { color: var(--g-danger); }
.pp .g-prov { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; color: var(--g-text-3); margin: 6px 0; }
.pp .g-prov b { color: var(--g-text-2); font-weight: 600; }
.pp .g-empty { text-align: center; padding: 18px 8px; color: var(--g-text-2); }
.pp .g-empty p { margin: 6px 0 10px; }
.pp .g-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; color: var(--g-text-2); }
.pp .g-kv { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.pp .g-kv > div { background: var(--g-bg-2); border-radius: var(--g-r-s); padding: 6px 8px; }
.pp .g-kv small { display: block; color: var(--g-text-3); font-size: 11px; }
.pp .g-kv b { font-size: 15px; }

/* ---------- settings forms shared by the Settings tab and the gears (UI reimagine, owner 2026-11-13) ---------- */
.pp .gs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; }
.pp .gs-grid label { display: flex; flex-direction: column; font-size: 11px; min-width: 0; }
.pp .gs-check { display: flex; gap: 4px; align-items: center; margin: 4px 0; }
.pp .gs-check input { flex: none; }
.pp .gs-toggles { display: flex; flex-wrap: wrap; gap: 6px 16px; }
.pp .gs-toggles--col { flex-direction: column; margin-bottom: 6px; }
.pp .gs-urow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
.pp .gs-switch { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.pp .gs-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.pp .gs-knob { position: relative; flex: none; width: 30px; height: 16px; border-radius: 8px; background: #666; transition: background .15s; }
.pp .gs-knob::after { content: ''; position: absolute; left: 2px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: left .15s; }
.pp .gs-switch input:checked + .gs-knob { background: #2e9e4f; }
.pp .gs-switch input:checked + .gs-knob::after { left: 16px; }
.pp .gs-switch input:focus-visible + .gs-knob { outline: 2px solid #9fd3ff; }

/* a gear at the end of a row of buttons */
.pp .wavechart { position: relative; padding-right: 30px; }
.pp .wx-gear { position: absolute; right: 0; top: 2px; display: inline-flex; }
.pp .wx-empty { padding: 10px 8px 4px; }
/* ---------- the gear beside a function, and its fold-out in place ---------- */
.pp .g-gear { color: var(--g-text-2); flex: none; }
.pp .g-gear--line { width: 22px; height: 22px; vertical-align: middle; }
.pp .g-fold { margin: 8px 0; padding: 10px; background: var(--g-bg-2); border-left: 3px solid var(--g-accent); border-radius: var(--g-r-m);
  scroll-margin-top: 46px; }
.pp .g-fold__head { display: flex; align-items: center; gap: 6px; margin: -2px 0 8px; color: var(--g-text-2); }
.pp .g-fold__title { flex: 1; min-width: 0; font-size: 13px; }
.pp .g-fold__tools { display: inline-flex; gap: 2px; align-items: center; flex: none; }
.pp .g-fold__tools .g-btn { margin: 0; }
.pp .g-fold__chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 8px; }
.pp .g-fold__chip { height: 24px; padding: 0 9px; border-radius: 12px; border: 1px solid var(--g-border); background: var(--g-bg-1);
  color: var(--g-text-2); font: 500 12px var(--g-font); cursor: pointer; }
.pp .g-fold__chip:hover { border-color: var(--g-border-strong); color: var(--g-text-1); }
.pp .g-fold__chip.is-on { border-color: var(--g-accent); background: var(--g-accent-soft); color: var(--g-text-1); }
.pp .g-fold__body { max-height: 40vh; overflow: auto; padding-right: 2px; }
.pp .g-fold__body input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), .pp .g-fold__body select { background: var(--g-bg-1); }
.pp .g-fold__more { margin-top: 6px; }
.pp .g-fold__foot { display: flex; justify-content: flex-end; margin-top: 8px; }
.g-setwin { position: fixed; left: var(--sw-x, 380px); top: var(--sw-y, 90px); z-index: 100000; width: 400px; max-width: calc(100vw - 16px);
  max-height: calc(100vh - 24px); display: flex; flex-direction: column; padding: 8px 10px 10px; border-radius: 10px;
  background: var(--g-bg-1); box-shadow: var(--g-shadow); }
.g-setwin__head { display: flex; align-items: center; gap: 6px; min-height: 26px; margin-bottom: 6px; color: var(--g-text-2); }
.g-setwin__title { color: var(--g-text-1); }
.g-setwin__body { flex: 1; min-height: 0; overflow: auto; max-height: 70vh; }
.g-setwin.g-fw--placed .g-setwin__body { max-height: none; }
.g-setwin__foot { display: flex; gap: 4px; justify-content: flex-end; margin-top: 8px; }
.g-fw__btn.g-fw__gear { display: inline-flex; align-items: center; justify-content: center; }

/* ---------- voyage strip under the header: the state of the voyage and the next step ---------- */
.pp .g-voy { background: var(--g-bg-1); border: 1px solid var(--g-border); border-radius: var(--g-r-m); padding: 6px 10px; margin: 0 0 8px; font-size: 12.5px; }
.pp .g-voy__l1 { display: flex; flex-wrap: wrap; gap: 0 6px; align-items: baseline; color: var(--g-text-2); }
.pp .g-voy__name { border: 0; background: none; padding: 0; font: 650 13px var(--g-font); color: var(--g-text-1); cursor: pointer; text-align: left; }
.pp .g-voy__name:hover { color: var(--g-accent-hover); }
.pp .g-voy__l2 { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; margin-top: 3px; color: var(--g-text-2); }
.pp .g-voy__l2 .g-btn { margin: 0; }
.pp .g-voy__worst { border: 0; background: none; padding: 0; font: inherit; color: var(--g-text-1); cursor: pointer; text-align: left; text-decoration: underline dotted; text-underline-offset: 3px; }
.pp .g-voy__worst:hover { color: var(--g-accent-hover); }
.pp .g-voy__worst.is-warn { color: var(--g-warn); }
.pp .g-voy__worst.is-danger { color: var(--g-danger); }
.pp .g-voy__prov { color: var(--g-text-3); font-size: 12px; flex-basis: 100%; }
.pp .g-voy__old { color: var(--g-warn); }

/* ---------- note on the map while a click on the map does something (waypoints, pick a place) ---------- */
.pp-maptool { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 9000; display: flex; align-items: center; gap: 10px;
  padding: 6px 8px 6px 12px; border-radius: 18px; background: rgba(16,19,22,.92); color: #f3f5f7; box-shadow: 0 4px 14px rgba(0,0,0,.5), 0 0 0 1px #4a5563;
  font: 13px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.pp-maptool button { border: 1px solid #4a5563; border-radius: 12px; background: #21272e; color: #f3f5f7; font: 600 12px system-ui, sans-serif; padding: 3px 10px; cursor: pointer; }
.pp-maptool button:hover { background: #2a313a; }

/* map markers for ports, canals, distance ends (outside the panel) */
.pp-place-icon { background: none; border: 0; }
.pp-place-dot { width: 10px; height: 10px; margin: 1px; border-radius: 50%; border: 2px solid #fff; background: #0b3d91; box-shadow: 0 0 2px #000; }
.pp-place-dot--port { width: 8px; height: 8px; margin: 2px; border-width: 1px; border-color: #0b3d91; background: #7fb2ff; }
.pp-place-dot--pass { border-color: #00b3a4; background: #fff; }
.pp-place-label { position: absolute; left: 14px; top: -3px; white-space: nowrap; font: 600 11px system-ui, sans-serif; color: #fff; text-shadow: 0 0 3px #000, 0 0 2px #000; pointer-events: none; }

/* range rings labels (on the map) */
.pp-ring-icon { background: none; border: 0; }
.pp-ring-label { display: inline-block; padding: 0 5px; border-radius: 8px; background: rgba(10,24,48,.75); color: #cfefff; font: 600 11px/16px system-ui, sans-serif; white-space: nowrap; }

/* one-line caption with its ⓘ */
.pp .g-hl { display: flex; align-items: center; gap: 2px 6px; flex-wrap: wrap; margin: 4px 0; }

/* ⓘ hint trigger and pop-over */
.pp .g-hint {
  display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; margin: 0 0 0 2px;
  border: 0; border-radius: 50%; background: transparent; color: var(--g-text-3); cursor: pointer; vertical-align: middle; flex: none;
}
.pp .g-hint:hover, .pp .g-hint.is-open { color: var(--g-accent-hover); background: var(--g-accent-soft); }
.g-pop {
  --g-bg-1: #181c21; --g-text-1: #f3f5f7; --g-text-2: #c3cad2; --g-text-3: #8d97a3; --g-accent-hover: #6aaeff; --g-border-strong: #4a5563;
  position: fixed; z-index: 100002; max-width: min(380px, calc(100vw - 24px)); max-height: 60vh; overflow: auto;
  background: var(--g-bg-1); color: var(--g-text-2); border-radius: 12px; padding: 10px 12px 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,.5), 0 0 0 1px var(--g-border-strong);
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.g-pop__head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.g-pop__title { font-weight: 650; color: var(--g-text-1); flex: 1; }
.g-pop__x { border: 0; background: transparent; color: var(--g-text-3); cursor: pointer; width: 24px; height: 24px; border-radius: 6px; font-size: 14px; }
.g-pop__x:hover { background: rgba(255,255,255,.08); color: var(--g-text-1); }
.g-pop p { margin: 4px 0; }
.g-pop b { color: var(--g-text-1); }
.g-pop ul { margin: 4px 0; padding-left: 18px; }
@media (max-width: 600px), (max-height: 500px) and (pointer: coarse) {
  .g-pop { left: 8px !important; right: 8px; bottom: max(8px, env(safe-area-inset-bottom, 0px)); top: auto !important; width: auto !important; max-width: none; max-height: 55vh; }
  .g-pop__x { width: 38px; height: 38px; font-size: 18px; margin: -6px -6px -6px 0; }
}

/* ---------- phones (owner, 2026-11-02): Windy shows the plugin full screen; bigger touch targets, one column ---------- */
@media (max-width: 600px), (max-height: 500px) and (pointer: coarse) {
  .pp { font-size: 14px; }
  .pp .grid { grid-template-columns: 1fr 1fr !important; }
  .pp .grid > *, .pp label, .pp .g-row > * { min-width: 0; }
  .pp input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), .pp select, .pp textarea {
    max-width: 100%; min-height: 38px; font-size: 16px; /* 16 px stops the phone zooming in on every box */
  }
  .pp button.pp-btn, .pp .g-btn { min-height: 38px; }
  .pp button.pp-btn.small, .pp .g-btn--s { min-height: 38px; min-width: 38px; }
  .pp .g-ibtn { width: 38px; height: 38px; }
  .pp .g-hint { width: 38px; height: 38px; }
  .pp .g-gear { width: 38px; height: 38px; }
  .pp .g-gear--line, .pp .g-ibtn--s.g-gear { width: 38px; height: 38px; }
  .pp .wavechart { padding-right: 38px; }
  .pp .gs-grid { grid-template-columns: 1fr 1fr; }
  .pp .gs-check, .pp .gs-switch, .pp label.switch { min-height: 38px; }
  .pp .g-fold { padding: 8px; scroll-margin-top: 64px; }
  .pp .g-drawer .g-fold { scroll-margin-top: 110px; }
  .pp .g-fold__body { max-height: none; overflow: visible; }
  .pp .g-set { overflow-x: auto; }
  .pp .g-fold__chip { height: 38px; padding: 0 12px; }
  .pp .g-voy .g-btn { width: 100%; }
  .pp .g-voy { padding: 5px 8px; font-size: 12.5px; }
  .pp .g-voy__wide { display: none !important; }
  .pp .g-voy__l1 { flex-wrap: nowrap; white-space: nowrap; overflow: hidden; }
  .pp .g-voy__name { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .pp .g-voy__prov { font-size: 11.5px; }
  .pp .g-card { padding: 10px; margin-bottom: 10px; }
  .pp .g-card__head { flex-wrap: wrap; }
  .pp .g-seg__opt { font-size: 12.5px; padding: 0 4px; min-height: 38px; }
  .pp .g-seg--4 { flex-wrap: wrap; }
  .pp .g-seg--4 .g-seg__opt { flex: 1 1 calc(50% - 3px); }
  .pp table { font-size: 12.5px; }
  .pp .rp svg { max-width: 100%; height: auto; }
  .g-fw__grip, .g-fw__reset { display: none !important; }

  /* ---- phone audit (owner's report, 2026-11-19): a way back everywhere, nothing under the phone's status bar ---- */
  /* anything over the whole screen starts where Windy's panel starts (--g-safe-top, ui/phoneSafe.ts) or at the phone's
     own safe area, whichever is lower, and ends above the home bar */
  .pp-overlay { inset: 0 !important; top: max(env(safe-area-inset-top, 0px), var(--g-safe-top, 0px)) !important; border-radius: 0 !important; width: auto !important; height: auto !important;
    max-width: none !important; max-height: none !important; transform: none !important;
    padding: 8px 8px max(8px, env(safe-area-inset-bottom, 0px)) !important; }
  .gp.gp--phone { left: 0 !important; right: 0 !important; bottom: 0 !important; top: max(env(safe-area-inset-top, 0px), var(--g-safe-top, 0px)) !important; width: auto !important; height: auto !important;
    padding-bottom: env(safe-area-inset-bottom, 0px); }
  .wo { padding-top: calc(max(env(safe-area-inset-top, 0px), var(--g-safe-top, 0px)) + 16px) !important; }
  /* the Back button (first thing in every full-screen window and in Help) */
  .pp .g-back { display: inline-flex; flex: none; min-height: 40px; padding: 0 14px 0 8px; margin: 0; gap: 2px;
    background: var(--g-accent); border-color: var(--g-accent); color: var(--g-on-accent); font-size: 15px; font-weight: 650; }
  .pp-overlay .pp-overlay__head { align-items: flex-start; gap: 8px; cursor: default; }
  .pp-overlay .pp-overlay__title { display: block !important; flex: 1; min-width: 0; font-size: 12.5px; line-height: 1.35; }
  .pp-overlay .pp-overlay__head .g-fw__end, .pp-overlay .g-fw__btns { display: none !important; }
  /* a full-screen window cannot be minimised on a phone: always show its content */
  .pp-overlay.g-fw--min > .pp-overlay__body { display: flex !important; }
  .pp-overlay.g-fw--min { height: auto !important; }
  /* the section bar stays at the top of the panel while it scrolls (not while Help is open: Help has its own bar) */
  .pp.g-shell .g-nav { position: sticky; top: 0; z-index: 6; background: var(--g-bg-0); border-radius: 0 0 8px 8px;
    box-shadow: 0 6px 10px -4px rgba(0,0,0,.55); margin-bottom: 10px; }
  .pp.g-shell .g-nav.g-nav--away { position: static; box-shadow: none; }
  .pp.g-shell .g-start { height: 0; scroll-margin-top: 60px; }
  .pp.g-shell .g-nav--away + .g-start { scroll-margin-top: 0; }
  .pp.g-shell .g-drawer__head { top: 0; z-index: 6; }
  .pp.g-shell .g-drawer__head b { flex: 1; }
  /* header: everything fits 320 px (the Help button was off the edge) */
  .pp.g-shell .g-head { gap: 4px; min-width: 0; }
  .pp.g-shell .g-head__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pp.g-shell .g-head__tools { flex: none; }
  .pp.g-shell .g-now { margin: 0 2px 0 0; }
  /* touch targets of 38 px */
  .pp .dtf .dtf__value { min-height: 38px; }
  .pp .dtf.inline .dtf__value { min-height: 38px; padding: 0 8px; font-size: 12.5px; }
  .pp .dtf .dtf__row select { font-size: 16px; min-height: 38px; }
  .pp .dtf .dtf__steps button { min-height: 38px; padding: 0 10px; font-size: 13px; }
  .pp .dtf.inline .dtf__pop { width: min(270px, calc(100vw - 40px)); }
  .pp.g-shell .st-chip { min-height: 38px; }
  .pp .st-used__link, .pp .gd-link, .pp button.lnk { display: inline-flex; align-items: center; min-height: 38px; padding: 0 3px; }
  .pp .swrow { flex-wrap: wrap; }
  .pp button.sw { width: 38px !important; height: 38px !important; flex: none; }
  .pp table button.icon { min-width: 38px !important; min-height: 38px !important; font-size: 16px; }
  /* tick boxes: 24 px, with room above and below so the row (and its label) is a 38 px target */
  .pp input[type=checkbox], .pp input[type=radio] { width: 24px; height: 24px; margin-top: 7px; margin-bottom: 7px; vertical-align: middle; }
  /* "Worst ahead": a 38 px touch target that takes no more room (it reaches over the plain text under it) */
  .pp .g-phone-note { display: block; margin: 4px 0 8px; padding: 6px 8px; border-left: 3px solid var(--g-info); background: rgba(127,182,255,.08); border-radius: 0 6px 6px 0; color: var(--g-text-2); font-size: 12.5px; }
  .pp .g-voy__worst { padding: 4px 0 16px; margin: -4px 0 -16px; position: relative; z-index: 1; }
  .pp .dtf.inline .dtf__value { min-width: 38px; }
  .pp .g-drawer table.tbl { display: block; max-width: 100%; overflow-x: auto; }
  .pp input[type=color] { min-width: 60px; min-height: 38px; }
  .pp input[type=range] { min-height: 38px; }
}
/* phone held upright: Help's bar wraps (Back, title and close; then the four views in a row of their own) */
@media (max-width: 600px) {
  .pp.g-shell .g-drawer__head { flex-wrap: wrap; }
  .pp.g-shell .g-drawer__seg { order: 3; flex: 1 1 100%; }
}
/* phone held sideways: the screen is short, so the bars that stay at the top are kept low */
@media (max-height: 500px) and (pointer: coarse) {
  .pp.g-shell .g-nav__item { flex-direction: row; justify-content: center; gap: 6px; min-height: 38px; padding: 4px 2px; }
}
@media (max-width: 400px) {
  .pp.g-shell .g-head__ver { display: none; }
}
@media (max-width: 380px) {
  .pp .grid { grid-template-columns: 1fr !important; }
  .pp .gs-grid { grid-template-columns: 1fr; }
}
`;

let el: HTMLStyleElement | null = null;
let users = 0;

/** Put the stylesheet into the page (counted, so several plugin parts can ask for it) */
export function installTheme(): () => void {
    users++;
    if (!el && typeof document !== 'undefined') {
        el = document.createElement('style');
        el.id = 'galenea-theme';
        el.textContent = CSS;
        document.head.appendChild(el);
    }
    return () => {
        users--;
        if (users <= 0 && el) {
            el.remove();
            el = null;
            users = 0;
        }
    };
}
