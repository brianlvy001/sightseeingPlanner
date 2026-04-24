const FOURSQUARE_API_KEY = 'X0IKXG35XLWK2IYB031NRHXY1BJPZIP1AGVWEXHZMPGYKMUG';
const RADIUS_M = 12874; // 8 miles
// Foursquare category IDs: Arts & Entertainment + Landmarks & Outdoors
const CATEGORIES = '10000,16000';

const form       = document.getElementById('search-form');
const input      = document.getElementById('address-input');
const statusEl   = document.getElementById('status');
const content    = document.getElementById('content');
const placesList = document.getElementById('places-list');
const mapDiv     = document.getElementById('map');

let leafletMap = null;
let markers    = [];

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = input.value.trim();
  if (!address) return;

  setStatus('Locating address...');
  content.classList.remove('visible');
  form.querySelector('button').disabled = true;

  try {
    const { lat, lng } = await geocode(address);
    setStatus('Fetching nearby attractions...');
    const places = await fetchPlaces(lat, lng);

    if (places.length === 0) {
      setStatus('No rated attractions found within 8 miles. Try a different address.', true);
      return;
    }

    const top5 = places
      .filter(p => p.rating != null)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5);

    if (top5.length === 0) {
      setStatus('No ratings available for nearby attractions. Try a different address.', true);
      return;
    }

    setStatus('');
    renderPlaces(top5);
    content.classList.add('visible');
    renderMap(lat, lng, top5);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    form.querySelector('button').disabled = false;
  }
});

async function geocode(address) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address);
  const res  = await fetch(url);
  const data = await res.json();
  if (!data.length) throw new Error('Address not found. Please try a different address.');
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function fetchPlaces(lat, lng) {
  const params = new URLSearchParams({
    ll: `${lat},${lng}`,
    radius: RADIUS_M,
    categories: CATEGORIES,
    limit: 50,
    sort: 'RATING',
    fields: 'name,rating,location,geocodes,categories',
  });
  const res = await fetch(`https://api.foursquare.com/v3/places/search?${params}`, {
    headers: { Authorization: FOURSQUARE_API_KEY },
  });
  if (!res.ok) throw new Error(`Foursquare API error (${res.status}) — check your API key.`);
  const data = await res.json();
  return data.results || [];
}

function renderPlaces(places) {
  placesList.innerHTML = places.map((p, i) => {
    const badge   = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    // Foursquare ratings are 0–10; convert to 0–5 for star display
    const stars5  = p.rating / 2;
    const stars   = renderStars(stars5);
    const addr    = [p.location?.address, p.location?.locality].filter(Boolean).join(', ');
    const cat     = p.categories?.[0]?.name || 'Attraction';
    const lat     = p.geocodes?.main?.latitude;
    const lng     = p.geocodes?.main?.longitude;
    const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(p.name)}+${lat},${lng}`;

    return `<div class="place-card" data-index="${i}">
      <div class="rank-badge ${badge}">${i + 1}</div>
      <div class="place-info">
        <div class="place-name">${escHtml(p.name)}</div>
        <div class="place-rating">
          <span class="stars">${stars}</span>
          <span class="rating-num">${p.rating.toFixed(1)}<span class="rating-scale">/10</span></span>
        </div>
        <div class="place-type">${escHtml(cat)}</div>
        ${addr ? `<div class="place-address">${escHtml(addr)}</div>` : ''}
        <a class="place-link" href="${mapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Google Maps &rarr;</a>
      </div>
    </div>`;
  }).join('');

  placesList.querySelectorAll('.place-card').forEach(card => {
    card.addEventListener('click', () => {
      const i = parseInt(card.dataset.index);
      placesList.querySelectorAll('.place-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      if (markers[i]) { markers[i].openPopup(); leafletMap.panTo(markers[i].getLatLng()); }
    });
  });
}

function renderMap(centerLat, centerLng, places) {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  markers = [];

  leafletMap = L.map(mapDiv).setView([centerLat, centerLng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(leafletMap);

  places.forEach((p, i) => {
    const lat = p.geocodes.main.latitude;
    const lng = p.geocodes.main.longitude;
    const marker = L.marker([lat, lng])
      .addTo(leafletMap)
      .bindPopup(`<strong>${escHtml(p.name)}</strong><br>⭐ ${p.rating}/10`);
    marker.on('click', () => {
      placesList.querySelectorAll('.place-card').forEach((c, j) => c.classList.toggle('active', j === i));
    });
    markers.push(marker);
  });

  const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
  leafletMap.fitBounds(bounds, { padding: [40, 40] });
  setTimeout(() => leafletMap.invalidateSize(), 50);
}

function renderStars(rating) {
  const full  = Math.floor(rating);
  const half  = (rating - full) >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? 'error' : '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
