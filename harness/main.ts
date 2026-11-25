import Plugin from '../src/plugin.svelte';
const target = document.getElementById('pane') as HTMLElement;
const app = new Plugin({ target });
(window as any).__plugin = app;
(window as any).__PluginClass = Plugin;
import { sim } from '../src/state';
sim.subscribe(v => ((window as any).__sim = v));
