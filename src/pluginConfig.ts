import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-passage-plan',
    version: '0.25.0',
    icon: '🚢',
    // Name and tagline (owner, 2026-11-02): Galenea (Greek goddess of calm seas) – made for seafarers, by a seafarer.
    // Windy allows titles under 50 characters; the author shows in Windy's own author field.
    title: 'Galenea – Made for seafarers, by a seafarer',
    description:
        "Made for seafarers, by a seafarer. Galenea shows where the heavy weather is and how YOUR ship will move in it, so you can pick the heading and speed that keep her easy: weather along the route against your own limits, roll and pitch estimates and roll / pitch charts, IMO MSC.1/Circ.1228 warnings (parametric and synchronous rolling, broaching, high wave groups) in a polar diagram, and a safe speed plan that slows down, speeds up or waits for the weather to pass. Fuel-saving route optimisation for owners comes second. Loads routes from ECDIS (RTZ, Transas RT3, BVS, GPX, Excel, CSV). Planning aid only: it does not replace ECDIS, official charts or official weather routing. Free. Feedback: nodecentral1990@gmail.com",
    author: 'Capt. Node Central',
    // Public copy of the plugin code (Windy's reviewers ask for it, 2026-11-04)
    repository: 'https://github.com/nodecentral1990-cell/galenea-windy-plugin',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    desktopWidth: 520,
    routerPath: '/passage-plan',
    // Public (owner, 2026-11-02: "lets push to make it public"): offered to all Windy users once Windy approves it
    private: false,
};

export default config;
