const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
let lastGeocodeAt = 0;

export function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(miles) {
  if (miles == null || Number.isNaN(miles)) return '';
  if (miles < 0.1) return '< 0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

async function rateLimitGeocode() {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastGeocodeAt));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastGeocodeAt = Date.now();
}

export async function geocodeLead(lead) {
  if (lead.lat != null && lead.lng != null) {
    return { lat: lead.lat, lng: lead.lng };
  }
  const parts = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean);
  if (!parts.length) return null;

  await rateLimitGeocode();
  const q = parts.join(', ');
  const params = new URLSearchParams({ q, format: 'json', limit: '1', countrycodes: 'us' });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

export function sortLeadsByDistance(leads, userLat, userLng) {
  return leads
    .map((lead) => {
      const miles =
        lead.lat != null && lead.lng != null
          ? haversineMiles(userLat, userLng, lead.lat, lead.lng)
          : null;
      return { ...lead, distanceMiles: miles };
    })
    .sort((a, b) => {
      if (a.distanceMiles == null && b.distanceMiles == null) return 0;
      if (a.distanceMiles == null) return 1;
      if (b.distanceMiles == null) return -1;
      return a.distanceMiles - b.distanceMiles;
    });
}

export function filterLeadsByCity(leads, cityQuery) {
  const q = cityQuery.trim().toLowerCase();
  if (!q) return [];
  return leads.filter((l) => (l.city || '').toLowerCase().includes(q));
}

export function getUniqueCities(leads) {
  const cities = new Set();
  for (const l of leads) {
    if (l.city) cities.add(l.city.trim());
  }
  return [...cities].sort((a, b) => a.localeCompare(b));
}

export function mapsUrl(lead) {
  const parts = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean);
  if (!parts.length && lead.lat != null && lead.lng != null) {
    return `https://maps.google.com/?q=${lead.lat},${lead.lng}`;
  }
  return `https://maps.google.com/?q=${encodeURIComponent(parts.join(', '))}`;
}
