// Test stand-in for Windy's map: plain Leaflet 1.9 with a lat/lon grid (no tiles).
declare const L: any;
export const map = L.map('map', { worldCopyJump: true, zoomSnap: 0.25, keyboard: false }).setView([30, -35], 3);
for (let lat = -80; lat <= 80; lat += 10) L.polyline([[lat, -540], [lat, 540]], { color: '#4a6a8a', weight: 1, interactive: false }).addTo(map);
for (let lon = -540; lon <= 540; lon += 10) L.polyline([[-85, lon], [85, lon]], { color: '#4a6a8a', weight: 1, interactive: false }).addTo(map);
(window as any).__map = map;
export const markers = {};
