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
@media (max-width: 600px) { .g-pop { left: 8px !important; right: 8px; bottom: 8px; top: auto !important; width: auto !important; max-width: none; max-height: 55vh; } }

/* ---------- phones (owner, 2026-11-02): Windy shows the plugin full screen; bigger touch targets, one column ---------- */
@media (max-width: 600px) {
  .pp { font-size: 14px; }
  .pp .grid { grid-template-columns: 1fr 1fr !important; }
  .pp .grid > *, .pp label, .pp .g-row > * { min-width: 0; }
  .pp input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), .pp select, .pp textarea {
    max-width: 100%; min-height: 38px; font-size: 16px; /* 16 px stops the phone zooming in on every box */
  }
  .pp input[type=checkbox], .pp input[type=radio] { width: 20px; height: 20px; }
  .pp button.pp-btn, .pp .g-btn { min-height: 38px; }
  .pp button.pp-btn.small, .pp .g-btn--s { min-height: 34px; }
  .pp .g-ibtn { width: 38px; height: 38px; }
  .pp .g-hint { width: 32px; height: 32px; }
  .pp .g-card { padding: 10px; margin-bottom: 10px; }
  .pp .g-card__head { flex-wrap: wrap; }
  .pp .g-seg__opt { font-size: 12.5px; padding: 0 4px; min-height: 38px; }
  .pp table { font-size: 12.5px; }
  .pp .rp svg { max-width: 100%; height: auto; }
  .pp-overlay { inset: 0 !important; border-radius: 0 !important; }
}
@media (max-width: 380px) {
  .pp .grid { grid-template-columns: 1fr !important; }
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
