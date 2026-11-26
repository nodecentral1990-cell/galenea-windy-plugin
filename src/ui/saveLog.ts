import { buildLogFile, logEntries, logEvent, logFileName } from '../lib/activityLog';
import { IS_APP } from '../lib/appMode';
import config from '../pluginConfig';
import { logHeader } from '../logHooks';
import { downloadFile } from './download';

/** Where reports go (the same address as in the Feedback tab and Windy's description; owner, 2026-11-12) */
const DEV_EMAIL = 'nodecentral1990@gmail.com';

/**
 * Save the activity log and offer to send it to the developer (owner, 2026-11-26: "when being saved - it shall show the
 * location also so that it can be sent to the developer, or it shall open the gmail for sending or host of options for
 * sending like whatsapp, email, gmail"). Phones with a share menu get it with the file attached (WhatsApp, Gmail, email
 * …); the Galenea app saves it on the phone and opens Android's share menu. Elsewhere the file is saved to the browser's
 * downloads and a small window says where it went and offers Email, Gmail and WhatsApp with a short summary written in
 * (links cannot carry a file: the user attaches it).
 */
export function saveLog(hidePositions = false): void {
    logEvent('log', `Activity log saved${hidePositions ? ' (positions hidden)' : ''}`);
    const text = buildLogFile(logHeader(), { hidePositions });
    const name = logFileName();
    if (IS_APP) {
        downloadFile(text, 'application/json', name);
        return;
    }
    void shareOrSave(text, name);
}

async function shareOrSave(text: string, name: string): Promise<void> {
    try {
        const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
        const file = new File([text], name, { type: 'application/json' });
        if (nav.share && nav.canShare?.({ files: [file] })) {
            await nav.share({ files: [file], title: `${shortName()} activity log`, text: summary(8) });
            logEvent('log', 'Activity log sent through the share menu');
            return;
        }
    } catch (e) {
        // the user closed the share menu: nothing more to do
        if ((e as Error)?.name === 'AbortError') return;
    }
    downloadFile(text, 'application/json', name);
    showSendWindow(name);
}

const shortName = () => config.title.split(' – ')[0];

/** The last entries in plain words, for the body of a message */
function summary(n: number): string {
    const last = logEntries().slice(-n);
    return last.map(e => `${new Date(e.t).toISOString().slice(5, 16).replace('T', ' ')}Z ${e.kind}: ${e.msg}`).join('\n');
}

function showSendWindow(name: string): void {
    try {
        document.querySelector('.pp-sendlog')?.remove();
        const subject = `${shortName()} activity log (${config.version})`;
        const body = `Hello,\n\nThe activity log of ${shortName()} ${config.version} is attached (file ${name}, from my Downloads folder).\nWhat happened:\n\n\nLast entries:\n${summary(25)}\n`;
        const mailto = `mailto:${DEV_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(DEV_EMAIL)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        const wa = `https://wa.me/?text=${encodeURIComponent(`${subject}\n(the file ${name} is in my Downloads folder; I will attach it)\n\nLast entries:\n${summary(10)}`)}`;
        const el = document.createElement('div');
        el.className = 'pp-sendlog';
        el.setAttribute('role', 'dialog');
        el.innerHTML = `<div class="pp-sendlog__box">
<b>Activity log saved</b>
<p>File <code></code> is in your <b>Downloads</b> folder. Send it to the developer (attach the file):</p>
<div class="pp-sendlog__row">
<a class="pp-sendlog__btn" target="_blank" rel="noopener" data-k="email">Email</a>
<a class="pp-sendlog__btn" target="_blank" rel="noopener" data-k="gmail">Gmail</a>
<a class="pp-sendlog__btn" target="_blank" rel="noopener" data-k="whatsapp">WhatsApp</a>
</div>
<button type="button" class="pp-sendlog__x">Close</button>
</div>`;
        (el.querySelector('code') as HTMLElement).textContent = name;
        const links: Record<string, string> = { email: mailto, gmail, whatsapp: wa };
        el.querySelectorAll<HTMLAnchorElement>('.pp-sendlog__btn').forEach(a => {
            const k = a.dataset.k as string;
            a.href = links[k];
            a.addEventListener('click', () => logEvent('log', `Activity log: send by ${k}`));
        });
        el.querySelector('.pp-sendlog__x')?.addEventListener('click', () => el.remove());
        el.addEventListener('click', e => e.target === el && el.remove());
        if (!document.getElementById('pp-sendlog-css')) {
            const st = document.createElement('style');
            st.id = 'pp-sendlog-css';
            st.textContent = SEND_CSS;
            document.head.appendChild(st);
        }
        document.body.appendChild(el);
    } catch {
        /* the file is saved anyway */
    }
}

const SEND_CSS = `
.pp-sendlog{position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.pp-sendlog__box{background:#16222f;color:#fff;border:1px solid #4aa3ff;border-radius:10px;padding:14px 16px;max-width:420px;width:100%;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.pp-sendlog__box p{margin:8px 0 10px}
.pp-sendlog__box code{font-size:12px;word-break:break-all;color:#cfe6ff}
.pp-sendlog__row{display:flex;gap:8px;flex-wrap:wrap}
.pp-sendlog__btn{flex:1 1 90px;min-height:40px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:#1f6fd1;color:#fff !important;text-decoration:none;font-weight:600}
.pp-sendlog__x{margin-top:10px;min-height:40px;width:100%;border-radius:8px;border:1px solid #2c3e52;background:none;color:#cfd8e3;font:inherit;cursor:pointer}
`;
