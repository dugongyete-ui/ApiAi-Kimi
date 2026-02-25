import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE = path.join(process.cwd(), 'agent-workspace');

function ensureWorkspace() {
    if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
}

export interface GeoResult {
    success: boolean;
    data?: any;
    error?: string;
    message?: string;
}

// ─── Places Search (OpenStreetMap Nominatim, free, no key needed) ──────────────

export async function placesSearch(
    query: string,
    location?: string,
    category?: string,
    limit = 10
): Promise<GeoResult> {
    const searchQuery = location ? `${query} ${location}` : query;

    try {
        const resp = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: searchQuery,
                format: 'json',
                limit: Math.min(limit, 20),
                addressdetails: 1,
                extratags: 1,
                namedetails: 1,
            },
            headers: { 'User-Agent': 'KimiAgent/1.0 (agent@kimi.ai)' },
            timeout: 10000,
        });

        const results = (resp.data as any[]).map(r => ({
            name: r.namedetails?.name || r.display_name?.split(',')[0] || 'Unknown',
            display_name: r.display_name,
            category: r.category,
            type: r.type,
            address: r.address,
            lat: parseFloat(r.lat),
            lon: parseFloat(r.lon),
            importance: r.importance,
            tags: r.extratags || {},
        }));

        if (results.length === 0) {
            return { success: true, data: [], message: `No places found for "${searchQuery}"` };
        }

        return {
            success: true,
            data: results,
            message: `Found ${results.length} places for "${query}"${location ? ` near ${location}` : ''}`,
        };
    } catch (e: any) {
        return { success: false, error: `Places search failed: ${e.message}` };
    }
}

// ─── Places Map Display (HTML with Leaflet.js) ────────────────────────────────

export async function placesMapDisplay(
    places: Array<{
        name: string;
        lat: number;
        lon: number;
        description?: string;
        category?: string;
    }>,
    options: {
        title?: string;
        filePath?: string;
        center?: { lat: number; lon: number };
        zoom?: number;
        itinerary?: string[];
    } = {}
): Promise<GeoResult> {
    ensureWorkspace();
    const out = path.join(WORKSPACE, options.filePath || `map_${Date.now()}.html`);
    const title = options.title || 'Map & Places';
    const zoom = options.zoom || 13;

    const center = options.center || (places.length > 0
        ? { lat: places[0].lat, lon: places[0].lon }
        : { lat: -6.2088, lon: 106.8456 });

    const markers = places.map((p, i) => `
        var marker${i} = L.marker([${p.lat}, ${p.lon}]).addTo(map);
        marker${i}.bindPopup('<b>${p.name.replace(/'/g, "\\'")}</b>${p.category ? `<br/><i>${p.category}</i>` : ''}${p.description ? `<br/>${p.description.replace(/'/g, "\\'")}` : ''}');
    `).join('\n');

    const itineraryHtml = options.itinerary
        ? `<div class="itinerary"><h3>Itinerary</h3><ol>${options.itinerary.map(s => `<li>${s}</li>`).join('')}</ol></div>`
        : '';

    const placesList = places.map((p, i) => `
        <div class="place-card" onclick="map.setView([${p.lat},${p.lon}],15)">
            <span class="num">${i + 1}</span>
            <div>
                <b>${p.name}</b>
                ${p.category ? `<span class="tag">${p.category}</span>` : ''}
                ${p.description ? `<p>${p.description}</p>` : ''}
                <small>📍 ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</small>
            </div>
        </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;display:flex;flex-direction:column;height:100vh;background:#f5f5f5}
h1{background:#2E75B6;color:#fff;margin:0;padding:12px 20px;font-size:1.2rem}
.container{display:flex;flex:1;overflow:hidden}
#map{flex:2;min-height:400px}
.sidebar{flex:1;overflow-y:auto;padding:12px;max-width:340px;background:#fff;border-left:1px solid #ddd}
.place-card{display:flex;gap:10px;align-items:flex-start;padding:10px;margin-bottom:8px;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;transition:background .2s}
.place-card:hover{background:#f0f7ff}
.num{background:#2E75B6;color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;flex-shrink:0}
.tag{background:#e8f0fe;color:#1a73e8;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:6px}
p{margin:4px 0;font-size:13px;color:#555}
small{color:#999;font-size:11px}
.itinerary{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-top:12px}
.itinerary h3{margin:0 0 8px;font-size:14px;color:#333}
.itinerary ol{margin:0;padding-left:18px;font-size:13px;color:#444}
.itinerary li{margin-bottom:4px}
</style>
</head>
<body>
<h1>📍 ${title}</h1>
<div class="container">
  <div id="map"></div>
  <div class="sidebar">
    <h3 style="margin-top:0">Places (${places.length})</h3>
    ${placesList}
    ${itineraryHtml}
  </div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map('map').setView([${center.lat}, ${center.lon}], ${zoom});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19
}).addTo(map);
${markers}
${places.length > 1 ? `var group = new L.featureGroup([${places.map((_, i) => `marker${i}`).join(',')}]); map.fitBounds(group.getBounds().pad(0.1));` : ''}
</script>
</body>
</html>`;

    fs.writeFileSync(out, html, 'utf8');
    return { success: true, data: { path: out, places_count: places.length }, message: `Map saved: ${out} (${places.length} markers)` };
}

// ─── Weather (Open-Meteo, completely free, no API key needed) ─────────────────

const WMO_CODES: Record<number, string> = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
    77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Heavy thunderstorm with hail',
};

export async function weatherFetch(
    location: string,
    days = 3
): Promise<GeoResult> {
    try {
        const geoResp = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
            params: { name: location, count: 1, language: 'en', format: 'json' },
            timeout: 8000,
        });

        const results = (geoResp.data as any).results;
        if (!results || results.length === 0) {
            return { success: false, error: `Location not found: "${location}"` };
        }

        const loc = results[0];
        const { latitude, longitude, name, country, timezone } = loc;

        const weatherResp = await axios.get('https://api.open-meteo.com/v1/forecast', {
            params: {
                latitude,
                longitude,
                current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weathercode,windspeed_10m,precipitation',
                daily: 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,sunrise,sunset',
                timezone: timezone || 'auto',
                forecast_days: Math.min(days, 7),
            },
            timeout: 8000,
        });

        const d = weatherResp.data as any;
        const curr = d.current;
        const daily = d.daily;

        const current = {
            location: `${name}, ${country}`,
            coordinates: { lat: latitude, lon: longitude },
            timezone,
            temperature_c: curr.temperature_2m,
            feels_like_c: curr.apparent_temperature,
            humidity_pct: curr.relative_humidity_2m,
            wind_kmh: curr.windspeed_10m,
            precipitation_mm: curr.precipitation,
            condition: WMO_CODES[curr.weathercode] || `Code ${curr.weathercode}`,
        };

        const forecast = daily.time.map((date: string, i: number) => ({
            date,
            condition: WMO_CODES[daily.weathercode[i]] || `Code ${daily.weathercode[i]}`,
            temp_max_c: daily.temperature_2m_max[i],
            temp_min_c: daily.temperature_2m_min[i],
            precipitation_mm: daily.precipitation_sum[i],
            wind_max_kmh: daily.windspeed_10m_max[i],
            sunrise: daily.sunrise[i],
            sunset: daily.sunset[i],
        }));

        return {
            success: true,
            data: { current, forecast },
            message: `Weather for ${name}, ${country}: ${curr.temperature_2m}°C, ${WMO_CODES[curr.weathercode] || 'Unknown'}`,
        };
    } catch (e: any) {
        return { success: false, error: `Weather fetch failed: ${e.message}` };
    }
}
