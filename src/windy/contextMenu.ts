// A small right-click menu drawn by the plugin (fixed position at the mouse).

export interface MenuItem {
    label: string;
    action: () => void;
    danger?: boolean;
}

let current: HTMLElement | null = null;
let cleanup: (() => void) | null = null;

export function closeMenu(): void {
    cleanup?.();
    cleanup = null;
    current?.remove();
    current = null;
}

export function openMenu(x: number, y: number, title: string, items: MenuItem[]): void {
    closeMenu();
    const el = document.createElement('div');
    el.className = 'pp-menu';
    el.setAttribute('role', 'menu');
    const head = document.createElement('div');
    head.className = 'pp-menu__title';
    head.textContent = title;
    el.appendChild(head);
    for (const it of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pp-menu__item' + (it.danger ? ' pp-menu__item--danger' : '');
        b.textContent = it.label;
        b.addEventListener('click', ev => {
            ev.stopPropagation();
            closeMenu();
            it.action();
        });
        el.appendChild(b);
    }
    document.body.appendChild(el);
    // Keep it on screen
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
    el.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
    current = el;

    const onDown = (ev: MouseEvent) => {
        if (!el.contains(ev.target as Node)) closeMenu();
    };
    const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') closeMenu();
    };
    // Delay so the opening right-click does not close it at once
    const t = setTimeout(() => {
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
    }, 0);
    cleanup = () => {
        clearTimeout(t);
        document.removeEventListener('mousedown', onDown, true);
        document.removeEventListener('keydown', onKey, true);
    };
}
