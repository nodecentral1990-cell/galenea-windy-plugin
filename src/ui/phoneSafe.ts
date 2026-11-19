// Phones (owner's report, 2026-11-19): the Windy app can draw the page from the very top of the screen, under the
// phone's own status bar (clock, battery). Windy keeps its own plugin header clear of it, so everything the plugin
// shows over the whole screen (graph window, full-size tables, progress) starts where Windy's panel starts, never at
// the very top. The measured place is given to the stylesheet as --g-safe-top on <body>; the stylesheet also uses the
// phone's own safe-area figures (env(safe-area-inset-*)) where the app reports them.
import { PHONE_SCREEN } from '../state';

export function isPhoneScreen(): boolean {
    try {
        return window.matchMedia(PHONE_SCREEN).matches;
    } catch {
        return false;
    }
}

/** Top of the plugin's own area on the screen, px: under Windy's phone header when it is shown, else the panel's top */
export function measureSafeTop(): number {
    try {
        const shell = document.querySelector('section.g-shell') as HTMLElement | null;
        if (!shell) return 0;
        const head = shell.previousElementSibling as HTMLElement | null;
        let top = 0;
        if (head && head.classList.contains('plugin__mobile-header') && head.offsetHeight > 0) top = head.getBoundingClientRect().bottom;
        else {
            // the box that scrolls (Windy's section, or a box around it) stays put while the content moves
            let box: HTMLElement = shell;
            for (let p: HTMLElement | null = shell; p && p !== document.body; p = p.parentElement) {
                const o = getComputedStyle(p).overflowY;
                if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) {
                    box = p;
                    break;
                }
            }
            top = box.getBoundingClientRect().top;
        }
        return Math.round(Math.max(0, Math.min(top, window.innerHeight / 3)));
    } catch {
        return 0;
    }
}

/** The box that scrolls an element of the panel (Windy's own section, or a box around it); null when none does */
function scrollBoxOf(el: HTMLElement): HTMLElement | null {
    for (let p: HTMLElement | null = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;
}

/**
 * Scroll the panel so that an element sits at its top, under whatever bar stays there (the room for the bar is the
 * element's scroll-margin-top in the stylesheet). Only the panel's own scroll position is changed: unlike
 * scrollIntoView this can never shift Windy's page around the panel. False when the panel does not scroll here.
 */
export function bringToTop(el: HTMLElement | null): boolean {
    try {
        if (!el) return false;
        const box = scrollBoxOf(el);
        if (!box) return false;
        const gap = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
        box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - gap;
        return true;
    } catch {
        return false;
    }
}

/** Measure again and tell the stylesheet (phones only; on a computer the figure is taken away) */
export function updateSafeTop(): void {
    try {
        if (isPhoneScreen()) document.body.style.setProperty('--g-safe-top', `${measureSafeTop()}px`);
        else document.body.style.removeProperty('--g-safe-top');
    } catch {
        /* the windows then start at the phone's own safe area, or the top */
    }
}

/** Keep the figure current while the plugin is open; returns the function that stops it */
export function watchSafeTop(): () => void {
    const on = () => updateSafeTop();
    try {
        updateSafeTop();
        window.addEventListener('resize', on);
        window.addEventListener('orientationchange', on);
    } catch {
        /* optional */
    }
    return () => {
        try {
            window.removeEventListener('resize', on);
            window.removeEventListener('orientationchange', on);
            document.body.style.removeProperty('--g-safe-top');
        } catch {
            /* ignore */
        }
    };
}
