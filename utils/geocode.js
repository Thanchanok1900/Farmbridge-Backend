const fetch = require('node-fetch');

/**
 * แปลง address → latitude, longitude
 * @param {string} address
 * @returns {Promise<{lat:number, lng:number}|null>}
 */
async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'FarmBridgeApp/1.0' } });
    const data = await res.json();
    if (!data || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (err) {
    console.error('Geocode failed', err);
    return null;
  }
}

module.exports = { geocodeAddress };
