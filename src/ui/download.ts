/** Offer data to the user as a file download. */
export function downloadFile(data: string | Uint8Array, mime: string, name: string): void {
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

/** Ask the user for a file and return its name and bytes. */
export function pickFile(accept: string): Promise<{ name: string; data: Uint8Array } | null> {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.onchange = async () => {
            const f = input.files?.[0];
            resolve(f ? { name: f.name, data: new Uint8Array(await f.arrayBuffer()) } : null);
        };
        input.click();
    });
}
