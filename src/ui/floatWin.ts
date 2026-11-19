// Floating windows (owner, 2026-11-13): every floating window can be moved (drag its title bar), resized (drag
// the right or bottom edge or the corner), minimised to its title bar, put back to its original design size and
// place, and closed. Used for the map keys (wave chart, roll / pitch chart, nautical chart), the weather bar under
// the cursor and the full-size windows; the ship window and the graph window have the same buttons of their own.
// Place and size are remembered per window; "Original size" forgets them, so the window's own design applies
// again. Plain DOM, every step guarded: a window that cannot float still shows (the plugin must always open).

import { isPhoneScreen } from './phoneSafe';

const KEY = 'windy-plugin-passage-plan:win:';

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number | null;
}

export interface FloatOpts {
    /** Remembered under this name */
    key: string;
    /** Title shown in the bar (when the window has no bar of its own) */
    title?: string;
    /** The window's own title bar; a bar is added when missing */
    head?: HTMLElement | null;
    /** Buttons to add to the bar (default: all three) */
    buttons?: { min?: boolean; reset?: boolean; close?: boolean };
    /** Resizing (default on) and the smallest size */
    resize?: boolean;
    minW?: number;
    minH?: number;
    /** Close does this (default: hide the window until it is shown again) */
    onClose?: () => void;
    /** Tooltip of the close button */
    closeTitle?: string;
    /** Keep the window's height when it is moved (big windows); otherwise it fits its content */
    fixedHeight?: boolean;
    /** Called after any move / resize / minimise / original size */
    onChange?: () => void;
    /** A gear in the bar (before minimise): opens the settings of what this window shows */
    gear?: { title: string; onClick: (win: HTMLElement) => void };
}

export interface FloatWin {
    /** Where the window's own content goes (the window itself when it had a bar) */
    body: HTMLElement;
    head: HTMLElement;
    reset(): void;
    toggleMin(force?: boolean): void;
    isMin(): boolean;
    /** True when the user has moved or resized it (its design place no longer applies) */
    placed(): boolean;
    destroy(): void;
}

// windows closed this session (shown again from Settings → Map display, or when the plugin opens again)
const closed = new Set<string>();
const listeners = new Set<() => void>();
export const isClosed = (key: string): boolean => closed.has(key);
export function closeWin(key: string): void {
    closed.add(key);
}
export function reopenWindows(): void {
    closed.clear();
    listeners.forEach(f => {
        try {
            f();
        } catch {
            /* ignore */
        }
    });
}
/** Called when closed windows are shown again */
export function onReopen(f: () => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
}
/** Forget every window's place and size (Settings → Map display) */
export function resetAllWindows(): void {
    try {
        for (const k of Object.keys(localStorage)) if (k.startsWith(KEY)) localStorage.removeItem(k);
    } catch {
        /* storage off */
    }
    resetters.forEach(f => {
        try {
            f();
        } catch {
            /* ignore */
        }
    });
}
const resetters = new Set<() => void>();
/** Windows with their own controls (ship window, graph window) join "put all windows back" */
export function onResetAll(f: () => void): () => void {
    resetters.add(f);
    return () => resetters.delete(f);
}

interface Saved {
    r?: Rect | null;
    min?: boolean;
}
function load(key: string): Saved {
    try {
        return JSON.parse(localStorage.getItem(KEY + key) ?? '{}') as Saved;
    } catch {
        return {};
    }
}
function save(key: string, s: Saved): void {
    try {
        if (!s.r && !s.min) localStorage.removeItem(KEY + key);
        else localStorage.setItem(KEY + key, JSON.stringify(s));
    } catch {
        /* not remembered */
    }
}

// the same gear as ui/base/Icon.svelte, for windows built without Svelte
const GEAR_SVG =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>' +
    '</svg>';

function button(txt: string, title: string, cls: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `g-fw__btn ${cls}`;
    b.textContent = txt;
    b.title = title;
    b.setAttribute('aria-label', title);
    return b;
}

/** Make an element (position: fixed or absolute) a floating window. */
export function floatWin(el: HTMLElement, o: FloatOpts): FloatWin {
    const minW = o.minW ?? 160;
    const minH = o.minH ?? 60;
    let saved = load(o.key);
    el.classList.add('g-fw');
    // the bar
    let head = o.head ?? null;
    let body: HTMLElement = el;
    const made: HTMLElement[] = [];
    if (!head) {
        head = document.createElement('div');
        head.className = 'g-fw__head';
        const t = document.createElement('span');
        t.className = 'g-fw__title';
        t.textContent = o.title ?? '';
        head.appendChild(t);
        body = document.createElement('div');
        body.className = 'g-fw__body';
        while (el.firstChild) body.appendChild(el.firstChild);
        el.appendChild(head);
        el.appendChild(body);
        made.push(head, body);
    }
    head.classList.add('g-fw__bar');
    const want = { min: true, reset: true, close: true, ...(o.buttons ?? {}) };
    const btns = document.createElement('span');
    btns.className = 'g-fw__btns';
    const bMin = button('–', 'Minimise', 'g-fw__min');
    const bReset = button('↺', 'Original size and place', 'g-fw__reset');
    const bClose = button('✕', o.closeTitle ?? 'Close (show it again: Settings → Map display → Show closed windows again)', 'g-fw__close');
    if (o.gear) {
        const g = o.gear;
        const bGear = button('', g.title, 'g-fw__gear');
        bGear.dataset.g = 'gear';
        bGear.innerHTML = GEAR_SVG;
        bGear.addEventListener('click', e => {
            e.stopPropagation();
            try {
                g.onClick(el);
            } catch {
                /* the window still works without its gear */
            }
        });
        btns.appendChild(bGear);
    }
    if (want.min) btns.appendChild(bMin);
    if (want.reset) btns.appendChild(bReset);
    if (want.close) btns.appendChild(bClose);
    if (btns.childNodes.length) {
        // before the window's own end button (e.g. "Close ✕"), else at the end of the bar
        const end = head.querySelector(':scope > .g-fw__end');
        if (end) head.insertBefore(btns, end);
        else head.appendChild(btns);
        made.push(btns);
    }
    // resize grips
    const grips: HTMLElement[] = [];
    if (o.resize !== false) {
        for (const g of ['r', 'b', 'c'] as const) {
            const d = document.createElement('div');
            d.className = `g-fw__grip g-fw__grip--${g}`;
            d.title = g === 'c' ? 'Drag to resize' : g === 'r' ? 'Drag to make it wider or narrower' : 'Drag to make it taller or shorter';
            el.appendChild(d);
            grips.push(d);
        }
    }

    const apply = () => {
        const r = saved.r;
        if (r) {
            el.style.left = `${r.left}px`;
            el.style.top = `${r.top}px`;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.transform = 'none';
            el.style.width = `${r.width}px`;
            el.style.maxWidth = 'none';
            el.style.maxHeight = 'none';
            el.style.height = r.height != null && !saved.min ? `${r.height}px` : '';
            el.style.inset = 'auto';
            el.style.left = `${r.left}px`;
            el.style.top = `${r.top}px`;
        } else {
            for (const p of ['left', 'top', 'right', 'bottom', 'transform', 'width', 'height', 'max-width', 'max-height', 'inset']) el.style.removeProperty(p);
        }
        el.classList.toggle('g-fw--min', !!saved.min);
        el.classList.toggle('g-fw--placed', !!r);
        bMin.textContent = saved.min ? '▢' : '–';
        bMin.title = saved.min ? 'Show it again (size before minimising)' : 'Minimise';
        o.onChange?.();
    };
    const rectNow = (): Rect => {
        const b = el.getBoundingClientRect();
        return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: saved.r?.height ?? (o.fixedHeight && !saved.min ? Math.round(b.height) : null) };
    };
    const clamp = (r: Rect): Rect => {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const width = Math.max(minW, Math.min(W - 10, r.width));
        return { ...r, width, left: Math.max(0, Math.min(W - 60, r.left)), top: Math.max(0, Math.min(H - 30, r.top)), height: r.height != null ? Math.max(minH, Math.min(H - 10, r.height)) : null };
    };
    const drag = (e: PointerEvent, f: (dx: number, dy: number) => void) => {
        e.preventDefault();
        e.stopPropagation();
        const sx = e.clientX;
        const sy = e.clientY;
        const move = (ev: PointerEvent) => f(ev.clientX - sx, ev.clientY - sy);
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            save(o.key, saved);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };
    // phones: windows are shown full screen or in place, never dragged about (a stray drag would lose them)
    const onHead = (e: PointerEvent) => {
        if (isPhoneScreen()) return;
        if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, label, a, .g-hint')) return;
        const r0 = rectNow();
        drag(e, (dx, dy) => {
            saved = { ...saved, r: clamp({ ...r0, left: r0.left + dx, top: r0.top + dy }) };
            apply();
        });
    };
    const onGrip = (kind: 'r' | 'b' | 'c') => (e: PointerEvent) => {
        if (e.button !== 0) return;
        const b = el.getBoundingClientRect();
        const r0 = { ...rectNow(), height: saved.min ? saved.r?.height ?? null : Math.round(b.height) };
        if (saved.min) saved = { ...saved, min: false };
        drag(e, (dx, dy) => {
            saved = { ...saved, r: clamp({ ...r0, width: kind === 'b' ? r0.width : r0.width + dx, height: kind === 'r' ? r0.height : (r0.height ?? b.height) + dy }) };
            apply();
        });
    };
    const gripFns = grips.map((g, i) => {
        const f = onGrip((['r', 'b', 'c'] as const)[i]);
        g.addEventListener('pointerdown', f);
        return f;
    });
    head.addEventListener('pointerdown', onHead);
    const api: FloatWin = {
        body,
        head,
        reset() {
            saved = {};
            save(o.key, saved);
            apply();
        },
        toggleMin(force?: boolean) {
            saved = { ...saved, min: force ?? !saved.min };
            save(o.key, saved);
            apply();
        },
        isMin: () => !!saved.min,
        placed: () => !!saved.r,
        destroy() {
            head?.removeEventListener('pointerdown', onHead);
            grips.forEach((g, i) => {
                g.removeEventListener('pointerdown', gripFns[i]);
                g.remove();
            });
            btns.remove();
            resetters.delete(api.reset);
        },
    };
    bMin.addEventListener('click', e => {
        e.stopPropagation();
        api.toggleMin();
    });
    bReset.addEventListener('click', e => {
        e.stopPropagation();
        api.reset();
    });
    bClose.addEventListener('click', e => {
        e.stopPropagation();
        if (o.onClose) o.onClose();
        else {
            closeWin(o.key);
            el.style.display = 'none';
        }
    });
    resetters.add(api.reset);
    if (closed.has(o.key) && !o.onClose) el.style.display = 'none';
    apply();
    return api;
}

/** Svelte action: `use:floating={{ key, head, ... }}` (head: a selector inside the node) */
export function floating(node: HTMLElement, o: Omit<FloatOpts, 'head'> & { head?: string }) {
    let w: FloatWin | null = null;
    try {
        w = floatWin(node, { ...o, head: o.head ? (node.querySelector(o.head) as HTMLElement | null) : null });
    } catch {
        /* the window still shows, it just does not float */
    }
    return {
        destroy() {
            w?.destroy();
        },
    };
}

export interface MapKey {
    el: HTMLDivElement;
    win: FloatWin | null;
    /** Title (in the bar) and content; plain text / markup made by the plugin itself */
    set(title: string, html: string): void;
    remove(): void;
}

/** A key / legend window on the map (wave chart, roll chart, nautical chart): floats like the other windows. */
export function mapKey(key: string, className: string, opts: Partial<FloatOpts> = {}): MapKey {
    const el = document.createElement('div');
    el.className = className;
    document.body.appendChild(el);
    let w: FloatWin | null = null;
    try {
        w = floatWin(el, { key, title: '', minW: 180, minH: 50, ...opts });
    } catch {
        /* still shown, just not floating */
    }
    const body = w?.body ?? el;
    const titleEl = w?.head.querySelector('.g-fw__title') as HTMLElement | null;
    const unReopen = onReopen(() => {
        el.style.display = '';
    });
    return {
        el,
        win: w,
        set(title: string, html: string) {
            if (titleEl) {
                titleEl.innerHTML = title;
                body.innerHTML = html;
            } else body.innerHTML = `<div>${title}</div>${html}`;
        },
        remove() {
            unReopen();
            w?.destroy();
            el.remove();
        },
    };
}
