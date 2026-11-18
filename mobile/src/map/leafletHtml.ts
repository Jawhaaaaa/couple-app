import type { ColorTokens } from '@/theme/tokens';

import { boundsOf, CLUSTER_RADIUS_PX, type MapPoint, OSM_ATTRIBUTION, OSM_TILE_URL } from './cluster';

const LEAFLET_VERSION = '1.9.4';

function escapeJson(value: unknown): string {
  // `</script>`-ыг таслахгүйн тулд `<`-ийг escape хийнэ
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Native-д WebView доторх Leaflet (§8.4): `cluster.ts`-тэй ижил greedy cluster-ыг хуудсан дотор
 * zoom бүрд тооцно; товшилтыг `ReactNativeWebView.postMessage({ ids })`-ээр буцаана.
 */
export function leafletHtml(points: MapPoint[], colors: Pick<ColorTokens, 'primary' | 'onPrimary' | 'surface' | 'bg' | 'glow'>): string {
  const bounds = boundsOf(points);
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;height:100%;background:${colors.bg}}
.m{border-radius:50%;background:${colors.primary};color:${colors.onPrimary};border:2px solid ${colors.surface};display:flex;align-items:center;justify-content:center;font:700 13px sans-serif;box-shadow:0 0 12px ${colors.glow}}</style>
</head><body><div id="map"></div><script>
var points = ${escapeJson(points)};
var R = ${CLUSTER_RADIUS_PX};
var map = L.map('map', { zoomControl: true });
L.tileLayer(${escapeJson(OSM_TILE_URL)}, { attribution: ${escapeJson(OSM_ATTRIBUTION)}, maxZoom: 18 }).addTo(map);
var layer = L.layerGroup().addTo(map);
function draw() {
  layer.clearLayers();
  var z = map.getZoom();
  var sorted = points.slice().sort(function (a, b) { return b.count - a.count; });
  var clusters = [];
  sorted.forEach(function (p) {
    var px = map.project([p.lat, p.lon], z);
    var hit = clusters.find(function (c) { return c.px.distanceTo(px) <= R; });
    if (hit) hit.points.push(p); else clusters.push({ px: px, points: [p] });
  });
  clusters.forEach(function (c) {
    var count = c.points.reduce(function (n, p) { return n + p.count; }, 0);
    var lat = c.points.reduce(function (n, p) { return n + p.lat * p.count; }, 0) / count;
    var lon = c.points.reduce(function (n, p) { return n + p.lon * p.count; }, 0) / count;
    var size = c.points.length > 1 ? 40 : 32;
    var icon = L.divIcon({ className: '', iconSize: [size, size], html: '<div class="m" style="width:' + size + 'px;height:' + size + 'px">' + count + '</div>' });
    L.marker([lat, lon], { icon: icon, title: c.points.map(function (p) { return p.label; }).join(', ') })
      .on('click', function () { window.ReactNativeWebView.postMessage(JSON.stringify({ ids: c.points.map(function (p) { return p.id; }) })); })
      .addTo(layer);
  });
}
map.on('zoomend', draw);
map.fitBounds(${escapeJson(bounds)}, { padding: [40, 40], maxZoom: 13 });
draw();
</script></body></html>`;
}
