// Going from one part of the pane to another without handing callbacks down through every component
// (UI reimagine, owner 2026-11-13). plugin.svelte registers the handler when it opens.

export interface NavTarget {
    tab: string;
    seg?: string;
    /** Settings group to open and scroll to (tab 'settings') */
    settings?: string;
}

let handler: ((t: NavTarget) => void) | null = null;

export function setNavHandler(f: ((t: NavTarget) => void) | null): void {
    handler = f;
}

export function goScreen(t: NavTarget): void {
    try {
        handler?.(t);
    } catch {
        /* the pane is closing */
    }
}

/** The Settings tab with this group open and in view ("All settings" in a fold-out) */
export function goSettings(id: string): void {
    goScreen({ tab: 'settings', settings: id });
}
