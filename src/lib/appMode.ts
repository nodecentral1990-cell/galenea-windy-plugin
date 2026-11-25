// True when this code runs inside the Galenea Android app (galenea-app/), false inside Windy. The app sets
// window.__GALENEA_APP__ before the plugin code loads. Use it only where the app must behave differently (data from
// Open-Meteo, files bundled in the app, no Windy plugin updates); everything else stays the same code for both.
export const IS_APP: boolean = typeof window !== 'undefined' && !!(window as unknown as { __GALENEA_APP__?: boolean }).__GALENEA_APP__;
