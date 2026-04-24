const RADIUS_M = 12874; // 8 miles

const form           = document.getElementById('search-form');
const input          = document.getElementById('address-input');
const typeSelect     = document.getElementById('type-select');
const mapSource      = document.getElementById('map-source');
const statusEl       = document.getElementById('status');
const mapDiv       = document.getElementById('map');
const gmapFrame    = document.getElementById('gmap');
const mapContainer = document.getElementById('map-container');
const phLoading    = document.getElementById('ph-loading');
const phError      = document.getElementById('ph-error');
const phMsg        = document.getElementById('ph-msg');
const content      = document.getElementById('content');
const placesPanel  = document.getElementById('places-panel');
const placesList   = document.getElementById('places-list');
const panelTitle   = document.getElementById('panel-title');

const OVERPASS_QUERIES = {
  museum:         `(node["tourism"="museum"]["name"](around:${RADIUS_M},LAT,LNG); way["tourism"="museum"]["name"](around:${RADIUS_M},LAT,LNG););`,
  park:           `(node["leisure"="park"]["name"](around:${RADIUS_M},LAT,LNG); way["leisure"="park"]["name"](around:${RADIUS_M},LAT,LNG););`,
  art_gallery:    `(node["tourism"="gallery"]["name"](around:${RADIUS_M},LAT,LNG); way["tourism"="gallery"]["name"](around:${RADIUS_M},LAT,LNG););`,
  zoo:            `(node["tourism"="zoo"]["name"](around:${RADIUS_M},LAT,LNG); way["tourism"="zoo"]["name"](around:${RADIUS_M},LAT,LNG););`,
  aquarium:       `(node["tourism"="aquarium"]["name"](around:${RADIUS_M},LAT,LNG); way["tourism"="aquarium"]["name"](around:${RADIUS_M},LAT,LNG););`,
  amusement_park: `(node["tourism"="theme_park"]["name"](around:${RADIUS_M},LAT,LNG); way["tourism"="theme_park"]["name"](around:${RADIUS_M},LAT,LNG););`,
};

let leafletMap = null;
let lastCenter = null;
let lastPlaces = [];
let lastSource = null;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = input.value.trim();
  const type    = typeSelect.value;
  const source  = mapSource.value;
  if (!address) return;

  setStatus('Locating address...');
  content.classList.remove('has-results');
  placesPanel.classList.add('hidden');
  showLoading();
  form.querySelector('button').disabled = true;

  try {
    const center = await geocodeNominatim(address);
    setStatus('Fetching nearby places...');

    const places = source === 'google'
      ? await fetchGooglePlaces(center, type)
      : await fetchOsmPlaces(center, type);

    if (places.length === 0) {
      showError('😕 No places found nearby.\nTry a different address or type!');
      setStatus('No places found within 8 miles. Try a different address or type.', true);
      return;
    }

    lastCenter = center;
    lastPlaces = places;
    lastSource = source;

    const TYPE_LABELS = {
      museum: 'Top Museums', park: 'Top Parks', art_gallery: 'Top Art Galleries',
      zoo: 'Top Zoos', aquarium: 'Top Aquariums', amusement_park: 'Top Amusement Parks',
    };
    panelTitle.textContent = TYPE_LABELS[type] || 'Top Sightseeing';
    setStatus(`Found ${places.length} place${places.length > 1 ? 's' : ''}`);
    source === 'google' ? renderGoogleCards(places) : renderOsmCards(places);
    placesPanel.classList.remove('hidden');
    content.classList.add('has-results');
    source === 'google' ? renderGoogleMap(center, places) : renderLeaflet(center, places);
  } catch (err) {
    showError(err.message);
    setStatus(err.message, true);
  } finally {
    form.querySelector('button').disabled = false;
  }
});

mapSource.addEventListener('change', () => {
  if (!lastPlaces.length || !lastCenter) return;
  const source = mapSource.value;
  if (source === lastSource) return;
  lastSource = source;
  source === 'google' ? renderGoogleMap(lastCenter, lastPlaces) : renderLeaflet(lastCenter, lastPlaces);
});

// ── Geocoding ─────────────────────────────────────────────────────────────────
async function geocodeNominatim(address) {
  const res  = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address));
  const data = await res.json();
  if (!data.length) throw new Error('Address not found. Please try a different address.');
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// ── Google Places ─────────────────────────────────────────────────────────────
function fetchGooglePlaces(center, type) {
  return new Promise((resolve, reject) => {
    const service = new google.maps.places.PlacesService(document.getElementById('attr'));
    service.nearbySearch({ location: center, radius: RADIUS_M, type }, (places, status) => {
      const S = google.maps.places.PlacesServiceStatus;
      if (status === S.REQUEST_DENIED) {
        reject(new Error('Google Places requires billing — enable it at console.cloud.google.com/billing, or switch to OpenStreetMap.'));
      } else if (status === S.OK) {
        resolve(places.filter(p => p.rating != null).sort((a, b) => b.rating - a.rating).slice(0, 10));
      } else {
        resolve([]);
      }
    });
  });
}

// ── OSM / Overpass ────────────────────────────────────────────────────────────
async function fetchOsmPlaces(center, type) {
  const body  = OVERPASS_QUERIES[type].replace(/LAT/g, center.lat).replace(/LNG/g, center.lng);
  const res   = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body:   'data=' + encodeURIComponent(`[out:json][timeout:25];\n${body}\nout center 80;`),
  });
  if (!res.ok) throw new Error('Failed to fetch places. Please try again.');
  const data  = await res.json();
  return data.elements
    .filter(el => el.tags?.name && (el.lat ?? el.center?.lat))
    .map(p => ({ ...p, _score: osmScore(p) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 10);
}

function osmScore(p) {
  const t = p.tags;
  let s = 0;
  if (t.wikipedia || t.wikidata) s += 10;
  if (['attraction','museum','zoo','aquarium','theme_park'].includes(t.tourism)) s += 5;
  else if (['viewpoint','gallery','artwork'].includes(t.tourism)) s += 3;
  if (t.historic) s += 4;
  if (t.website || t['contact:website']) s += 2;
  s += Math.min(Object.keys(t).length, 20) * 0.2;
  return s;
}

// ── Card renderers ────────────────────────────────────────────────────────────
function renderGoogleCards(places) {
  placesList.innerHTML = places.map((p, i) => {
    const badge   = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const stars   = renderStars(p.rating);
    const count   = p.user_ratings_total ? `(${p.user_ratings_total.toLocaleString()})` : '';
    const mapsUrl = `https://www.google.com/maps/place/?q=place_id:${p.place_id}`;
    return `<div class="place-card" data-index="${i}">
      <div class="card-top">
        <div class="rank-badge ${badge}">${i + 1}</div>
        <div class="place-name">${escHtml(p.name)}</div>
      </div>
      <div class="place-rating">
        <span class="stars">${stars}</span>
        <span class="rating-num">${p.rating.toFixed(1)}</span>
        <span class="rating-count">${count}</span>
      </div>
      ${p.vicinity ? `<div class="place-address">${escHtml(p.vicinity)}</div>` : ''}
      <div class="place-links">
        <a class="place-link" href="${mapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Google Maps &rarr;</a>
      </div>
    </div>`;
  }).join('');
  attachCardClicks();
}

function renderOsmCards(places) {
  const maxScore = places[0]._score || 1;
  placesList.innerHTML = places.map((p, i) => {
    const badge   = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const score   = (p._score / maxScore) * 5;
    const stars   = renderStars(score);
    const lat     = p.lat ?? p.center.lat;
    const lng     = p.lon ?? p.center.lon;
    const type    = (p.tags.tourism || p.tags.historic || p.tags.leisure || '').replace(/_/g, ' ');
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const wikiUrl = p.tags.wikipedia
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.tags.wikipedia.replace(/^en:/, ''))}`
      : null;
    return `<div class="place-card" data-index="${i}">
      <div class="card-top">
        <div class="rank-badge ${badge}">${i + 1}</div>
        <div class="place-name">${escHtml(p.tags.name)}</div>
      </div>
      ${type ? `<div class="place-type">${escHtml(type)}</div>` : ''}
      <div class="place-rating">
        <span class="stars">${stars}</span>
        <span class="rating-num">${score.toFixed(1)}</span>
      </div>
      <div class="place-links">
        <a class="place-link" href="${mapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Google Maps</a>
        ${wikiUrl ? `<a class="place-link" href="${wikiUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Wikipedia</a>` : ''}
      </div>
    </div>`;
  }).join('');
  attachCardClicks();
}

function attachCardClicks() {
  placesList.querySelectorAll('.place-card').forEach(card => {
    card.addEventListener('click', () => {
      const i = parseInt(card.dataset.index);
      placesList.querySelectorAll('.place-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      if (leafletMap && markers[i]) { markers[i].openPopup(); leafletMap.panTo(markers[i].getLatLng()); }
    });
  });
}

let markers = [];

// ── Map renderers ─────────────────────────────────────────────────────────────
function renderLeaflet(center, places) {
  hidePlaceholders();
  gmapFrame.style.display = 'none';
  mapDiv.style.display    = 'block';

  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  markers = [];

  leafletMap = L.map(mapDiv).setView([center.lat, center.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(leafletMap);

  places.forEach((p, i) => {
    const lat  = p.geometry ? p.geometry.location.lat() : (p.lat ?? p.center.lat);
    const lng  = p.geometry ? p.geometry.location.lng() : (p.lon ?? p.center.lon);
    const name = p.name || p.tags?.name || '';
    const extra = p.rating ? `<br>⭐ ${p.rating}` : '';
    const marker = L.marker([lat, lng]).addTo(leafletMap)
      .bindPopup(`<strong>${escHtml(name)}</strong>${extra}`);
    marker.on('click', () => {
      placesList.querySelectorAll('.place-card').forEach((c, j) => c.classList.toggle('active', j === i));
    });
    markers.push(marker);
  });

  setTimeout(() => {
    leafletMap.invalidateSize();
    leafletMap.fitBounds(L.latLngBounds(markers.map(m => m.getLatLng())), { padding: [40, 40] });
  }, 200);
}

function renderGoogleMap(center, places) {
  hidePlaceholders();
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  mapDiv.style.display    = 'none';
  gmapFrame.style.display = 'block';
  const q = places.map(p => p.name || p.tags?.name).join(' OR ');
  gmapFrame.src = `https://www.google.com/maps?q=${encodeURIComponent(q)}&ll=${center.lat},${center.lng}&z=13&output=embed`;
}

// ── Placeholder states ────────────────────────────────────────────────────────
function showLoading() {
  mapContainer.classList.remove('hidden');
  mapDiv.style.display    = 'none';
  gmapFrame.style.display = 'none';
  phLoading.classList.remove('hidden');
  phError.classList.add('hidden');
}

function showError(msg) {
  mapContainer.classList.remove('hidden');
  mapDiv.style.display    = 'none';
  gmapFrame.style.display = 'none';
  phMsg.textContent       = msg;
  phError.classList.remove('hidden');
  phLoading.classList.add('hidden');
}

function hidePlaceholders() {
  phLoading.classList.add('hidden');
  phError.classList.add('hidden');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className   = isError ? 'error' : '';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
