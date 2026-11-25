import { IS_APP } from '../lib/appMode';

type AppSave = (data: string | Uint8Array, mime: string, name: string) => Promise<string>;

/** A short note at the bottom of the screen (app only: says where a saved file went) */
function notice(text: string, bad = false): void {
    try {
        const el = document.createElement('div');
        el.setAttribute('role', 'status');
        el.textContent = text;
        el.style.cssText =
            'position:fixed;left:12px;right:12px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:100000;padding:12px 14px;border-radius:8px;' +
            `font:15px/1.35 sans-serif;color:#fff;background:${bad ? '#8a1f1f' : '#1f4f7a'};box-shadow:0 4px 16px rgba(0,0,0,.4)`;
        el.onclick = () => el.remove();
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 7000);
    } catch {
        /* nothing to show it on */
    }
}

/** Offer data to the user as a file download. In the Galenea app: saved on the phone and offered to share. */
export function downloadFile(data: string | Uint8Array, mime: string, name: string): void {
    const appSave = IS_APP ? (window as unknown as { __GALENEA_SAVE__?: AppSave }).__GALENEA_SAVE__ : undefined;
    if (appSave) {
        appSave(data, mime, name).then(
            where => notice(where),
            e => notice(`${name} could not be saved (${(e as Error)?.message ?? e}).`, true),
        );
        return;
    }
    const blob = new Blob([data as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Ask the user for a file and return its name and bytes.
 * In the app the file type filter is left out: Android's file picker knows no type for .rtz / .rt3 / .bvs and would grey
 * those files out. The plugin checks the file itself after it is picked.
 */
export function pickFile(accept: string): Promise<{ name: string; data: Uint8Array } | null> {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        if (!IS_APP) input.accept = accept;
        input.onchange = async () => {
            const f = input.files?.[0];
            resolve(f ? { name: f.name, data: new Uint8Array(await f.arrayBuffer()) } : null);
        };
        input.click();
    });
}
