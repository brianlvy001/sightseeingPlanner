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

const Q = (tag, val) =>
  `(node["${tag}"="${val}"]["name"](around:${RADIUS_M},LAT,LNG); way["${tag}"="${val}"]["name"](around:${RADIUS_M},LAT,LNG););`;

const OVERPASS_QUERIES = {
  // Sightseeing
  museum:           Q('tourism', 'museum'),
  park:             Q('leisure', 'park'),
  art_gallery:      Q('tourism', 'gallery'),
  zoo:              Q('tourism', 'zoo'),
  aquarium:         Q('tourism', 'aquarium'),
  amusement_park:   Q('tourism', 'theme_park'),
  tourist_attraction: `(node["tourism"="attraction"]["name"](around:${RADIUS_M},LAT,LNG); way["tourism"="attraction"]["name"](around:${RADIUS_M},LAT,LNG); node["historic"]["name"](around:${RADIUS_M},LAT,LNG); way["historic"]["name"](around:${RADIUS_M},LAT,LNG););`,
  // Food & Drink
  restaurant:       Q('amenity', 'restaurant'),
  cafe:             Q('amenity', 'cafe'),
  bar:              Q('amenity', 'bar'),
  bakery:           Q('amenity', 'bakery'),
  // Entertainment
  movie_theater:    Q('amenity', 'cinema'),
  night_club:       Q('amenity', 'nightclub'),
  bowling_alley:    Q('amenity', 'bowling_alley'),
  // Shopping
  shopping_mall:    Q('shop', 'mall'),
  supermarket:      Q('shop', 'supermarket'),
  clothing_store:   Q('shop', 'clothes'),
  book_store:       Q('shop', 'books'),
  // Health & Wellness
  hospital:         Q('amenity', 'hospital'),
  pharmacy:         Q('amenity', 'pharmacy'),
  gym:              Q('leisure', 'fitness_centre'),
  spa:              Q('leisure', 'spa'),
  // Travel
  lodging:          Q('tourism', 'hotel'),
  gas_station:      Q('amenity', 'fuel'),
  car_rental:       Q('amenity', 'car_rental'),
  // Finance
  bank:             Q('amenity', 'bank'),
  atm:              Q('amenity', 'atm'),
};

let leafletMap = null;
let lastCenter = null;
let lastPlaces   = [];
let lastSource   = null;
let markers      = [];

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
      tourist_attraction: 'Top Attractions',
      restaurant: 'Top Restaurants', cafe: 'Top Cafes', bar: 'Top Bars', bakery: 'Top Bakeries',
      movie_theater: 'Top Movie Theaters', night_club: 'Top Night Clubs', bowling_alley: 'Top Bowling Alleys',
      shopping_mall: 'Top Shopping Malls', supermarket: 'Top Supermarkets',
      clothing_store: 'Top Clothing Stores', book_store: 'Top Book Stores',
      hospital: 'Nearby Hospitals', pharmacy: 'Nearby Pharmacies', gym: 'Top Gyms', spa: 'Top Spas',
      lodging: 'Top Hotels', gas_station: 'Nearby Gas Stations', car_rental: 'Top Car Rentals',
      bank: 'Nearby Banks', atm: 'Nearby ATMs',
    };
    panelTitle.textContent = TYPE_LABELS[type] || 'Top Places';
    setStatus(`Found ${places.length} place${places.length > 1 ? 's' : ''}`);
    source === 'google' ? renderGoogleCards(places, type) : renderOsmCards(places);
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

// ── Google Places (New HTTP API) ──────────────────────────────────────────────
const GAPI_KEY = 'AIzaSyBvQza0NnKLqOXtNvYOs1-lcPXT6ghWCXM';

async function fetchGooglePlaces(center, type) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GAPI_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.googleMapsUri,places.photos.name',
    },
    body: JSON.stringify({
      includedTypes: [type],
      maxResultCount: 20,
      locationRestriction: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius: RADIUS_M },
      },
      rankPreference: 'POPULARITY',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || res.statusText;
    throw new Error(`Google Places error (${res.status}): ${msg}`);
  }
  const data = await res.json();
  return (data.places || []).filter(p => p.rating != null).sort((a, b) => b.rating - a.rating).slice(0, 10);
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
  if (['attraction','museum','zoo','aquarium','theme_park','hotel'].includes(t.tourism)) s += 5;
  else if (['viewpoint','gallery','artwork'].includes(t.tourism)) s += 3;
  if (t.historic) s += 4;
  if (t.amenity) s += 3;
  if (t.shop) s += 3;
  if (t.leisure) s += 3;
  if (t.website || t['contact:website']) s += 2;
  if (t.phone || t['contact:phone']) s += 1;
  if (t['addr:street']) s += 1;
  if (t.opening_hours) s += 2;
  s += Math.min(Object.keys(t).length, 20) * 0.2;
  return s;
}

// ── Card renderers ────────────────────────────────────────────────────────────
const FOOD_TYPES = new Set(['restaurant', 'cafe', 'bar', 'bakery']);

function renderGoogleCards(places, type) {
  placesList.innerHTML = places.map((p, i) => {
    const badge    = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const stars    = renderStars(p.rating);
    const name     = p.displayName?.text || '';
    const count    = p.userRatingCount ? `(${p.userRatingCount.toLocaleString()})` : '';
    const mapsUrl  = p.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
    const photoIndex = FOOD_TYPES.has(type) ? 1 : 0;
    const photoRef = (p.photos?.[photoIndex] ?? p.photos?.[0])?.name;
    const photoUrl = photoRef ? `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=400&key=${GAPI_KEY}` : '';
    return `<div class="place-card" data-index="${i}">
      ${photoUrl ? `<div class="card-photo-wrap"><img class="card-photo" src="${photoUrl}" alt="${escHtml(name)}" loading="lazy" onerror="this.parentElement.remove()"><div class="rank-badge ${badge} badge-over">${i + 1}</div></div>` : `<div class="card-top"><div class="rank-badge ${badge}">${i + 1}</div><div class="place-name">${escHtml(name)}</div></div>`}
      ${photoUrl ? `<div class="card-body"><div class="place-name">${escHtml(name)}</div>` : '<div class="card-body">'}
      <div class="place-rating">
        <span class="stars">${stars}</span>
        <span class="rating-num">${p.rating.toFixed(1)}</span>
        <span class="rating-count">${count}</span>
      </div>
      ${p.formattedAddress ? `<div class="place-address">${escHtml(p.formattedAddress)}</div>` : ''}
      <div class="place-links">
        <a class="place-link" href="${mapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Google Maps &rarr;</a>
      </div>
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
    const lat  = p.location ? p.location.latitude  : (p.lat ?? p.center?.lat);
    const lng  = p.location ? p.location.longitude : (p.lon ?? p.center?.lon);
    const name = p.displayName?.text || p.tags?.name || '';
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
  const q = places.map(p => p.displayName?.text || p.tags?.name).join(' OR ');
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
function renderStars(rating) {
  const v     = Math.min(5, Math.max(0, rating));
  const full  = Math.floor(v);
  const half  = (v - full) >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className   = isError ? 'error' : '';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
