const RADIUS_M = 12874; // 8 miles

const form        = document.getElementById('search-form');
const input       = document.getElementById('address-input');
const typeSelect  = document.getElementById('type-select');
const mapSource   = document.getElementById('map-source');
const statusEl    = document.getElementById('status');
const content     = document.getElementById('content');
const placesList  = document.getElementById('places-list');
const panelTitle  = document.getElementById('panel-title');
const mapDiv        = document.getElementById('map');
const gmapFrame     = document.getElementById('gmap');
const mapPlaceholder = document.getElementById('map-placeholder');
const phMsg         = document.getElementById('ph-msg');

const TYPE_LABELS = {
  tourist_attraction: 'Top Sightseeing',
  museum:             'Top Museums',
  park:               'Top Parks',
  art_gallery:        'Top Art Galleries',
  zoo:                'Top Zoos',
  aquarium:           'Top Aquariums',
  amusement_park:     'Top Amusement Parks',
};

// Overpass queries used when map source = OSM
const OVERPASS_QUERIES = {
  tourist_attraction: `(
    node["tourism"~"^(attraction|museum|zoo|aquarium|theme_park|viewpoint|gallery)$"]["name"](around:${RADIUS_M},LAT,LNG);
    way["tourism"~"^(attraction|museum|zoo|aquarium|theme_park|viewpoint|gallery)$"]["name"](around:${RADIUS_M},LAT,LNG);
    node["historic"]["name"](around:${RADIUS_M},LAT,LNG);
    way["historic"]["name"](around:${RADIUS_M},LAT,LNG);
  );`,
  museum:      `(node["tourism"="museum"]["name"](around:${RADIUS_M},LAT,LNG); way["tourism"="museum"]["name"](around:${RADIUS_M},LAT,LNG););`,
  park:        `(node["leisure"="park"]["name"](around:${RADIUS_M},LAT,LNG); way["leisure"="park"]["name"](around:${RADIUS_M},LAT,LNG););`,
  art_gallery: `(node["tourism"="gallery"]["name"](around:${RADIUS_M},LAT,LNG); way["tourism"="gallery"]["name"](around:${RADIUS_M},LAT,LNG););`,
  zoo:         `(node["tourism"="zoo"]["name"](around:${RADIUS_M},LAT,LNG); way["tourism"="zoo"]["name"](around:${RADIUS_M},LAT,LNG););`,
  aquarium:    `(node["tourism"="aquarium"]["name"](around:${RADIUS_M},LAT,LNG); way["tourism"="aquarium"]["name"](around:${RADIUS_M},LAT,LNG););`,
  amusement_park: `(node["tourism"="theme_park"]["name"](around:${RADIUS_M},LAT,LNG); way["tourism"="theme_park"]["name"](around:${RADIUS_M},LAT,LNG););`,
};

let leafletMap = null;
let markers    = [];
let lastPlaces = [];
let lastCenter = null;
let lastSource = null;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = input.value.trim();
  const type    = typeSelect.value;
  const source  = mapSource.value;
  if (!address) return;

  setStatus('Locating address...');
  content.classList.remove('has-results');
  showPlaceholder('🔭 Deploying map engineers to your location...');
  form.querySelector('button').disabled = true;

  try {
    const center = await geocodeNominatim(address);
    setStatus('Fetching nearby places...');

    let top5;
    if (source === 'google') {
      top5 = await fetchGooglePlaces(center, type);
    } else {
      top5 = await fetchOsmPlaces(center, type);
    }

    if (top5.length === 0) {
      setStatus(`No ${TYPE_LABELS[type].toLowerCase()} found within 8 miles. Try a different address or type.`, true);
      return;
    }

    lastPlaces = top5;
    lastCenter = center;
    lastSource = source;

    setStatus('');
    panelTitle.textContent = TYPE_LABELS[type];
    source === 'google' ? renderGoogleCards(top5) : renderOsmCards(top5);
    content.classList.add('has-results');
    source === 'google' ? renderGoogleMap(center, top5) : renderLeaflet(center, top5);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    form.querySelector('button').disabled = false;
  }
});

mapSource.addEventListener('change', () => {
  if (!lastPlaces.length || !lastCenter) return;
  const source = mapSource.value;
  if (source === lastSource) return;
  // Re-render map only if same source type data is compatible
  if (source === 'osm' && lastSource === 'google') renderGoogleMap(lastCenter, lastPlaces);
  if (source === 'google' && lastSource === 'osm')  renderLeaflet(lastCenter, lastPlaces);
  lastSource = source;
});

// ── Geocoding (Nominatim — free, no billing) ────────────────────────────────
async function geocodeNominatim(address) {
  const url  = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address);
  const res  = await fetch(url);
  const data = await res.json();
  if (!data.length) throw new Error('Address not found. Please try a different address.');
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// ── Google Places (real ratings, requires billing) ───────────────────────────
function fetchGooglePlaces(center, type) {
  return new Promise((resolve, reject) => {
    const service = new google.maps.places.PlacesService(document.getElementById('attr'));
    service.nearbySearch(
      { location: center, radius: RADIUS_M, type },
      (places, status) => {
        const S = google.maps.places.PlacesServiceStatus;
        if (status === S.REQUEST_DENIED) {
          showPlaceholder('🚨 Google Maps needs billing enabled.\nSwitch to OpenStreetMap — it works for free right now!');
          reject(new Error('Google Places requires billing — enable it at console.cloud.google.com/billing. Or switch to OpenStreetMap mode above.'));
        } else if (status === S.OK) {
          resolve(
            places
              .filter(p => p.rating != null)
              .sort((a, b) => b.rating - a.rating || (b.user_ratings_total || 0) - (a.user_ratings_total || 0))
              .slice(0, 5)
          );
        } else {
          resolve([]);
        }
      }
    );
  });
}

// ── OSM / Overpass places (fully free, no billing) ──────────────────────────
async function fetchOsmPlaces(center, type) {
  const body  = OVERPASS_QUERIES[type]
    .replace(/LAT/g, center.lat)
    .replace(/LNG/g, center.lng);
  const query = `[out:json][timeout:25];\n${body}\nout center 80;`;
  const res   = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body:   'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error('Failed to fetch places. Please try again.');
  const data  = await res.json();

  const places = data.elements.filter(el => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    return el.tags?.name && lat && lng;
  });

  return places
    .map(p => ({ ...p, _score: osmScore(p) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
}

function osmScore(p) {
  const tags = p.tags;
  let s = 0;
  if (tags.wikipedia || tags.wikidata) s += 10;
  const t = tags.tourism;
  if (['attraction', 'museum', 'zoo', 'aquarium', 'theme_park'].includes(t)) s += 5;
  else if (['viewpoint', 'gallery', 'artwork'].includes(t)) s += 3;
  if (tags.historic) s += 4;
  if (tags.website || tags['contact:website']) s += 2;
  s += Math.min(Object.keys(tags).length, 20) * 0.2;
  return s;
}

// ── Card renderers ───────────────────────────────────────────────────────────
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
    const type    = (p.tags.tourism || p.tags.historic || p.tags.leisure || 'attraction').replace(/_/g, ' ');
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    return `<div class="place-card" data-index="${i}">
      <div class="card-top">
        <div class="rank-badge ${badge}">${i + 1}</div>
        <div class="place-name">${escHtml(p.tags.name)}</div>
      </div>
      <div class="place-type">${escHtml(type)}</div>
      <div class="place-rating">
        <span class="stars">${stars}</span>
        <span class="rating-num">${score.toFixed(1)}</span>
      </div>
      <div class="place-links">
        <a class="place-link" href="${mapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Google Maps &rarr;</a>
        ${p.tags.wikipedia ? `<a class="place-link" href="https://en.wikipedia.org/wiki/${encodeURIComponent(p.tags.wikipedia.replace(/^en:/, ''))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Wikipedia</a>` : ''}
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
      if (markers[i]) { markers[i].openPopup(); leafletMap?.panTo(markers[i].getLatLng()); }
    });
  });
}

// ── Map renderers ─────────────────────────────────────────────────────────────
function showPlaceholder(msg) {
  mapDiv.style.display        = 'none';
  gmapFrame.style.display     = 'none';
  mapPlaceholder.classList.remove('hidden');
  phMsg.textContent = msg;
}

function hidePlaceholder() {
  mapPlaceholder.classList.add('hidden');
}

function renderLeaflet(center, places) {
  hidePlaceholder();
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
    const marker = L.marker([lat, lng])
      .addTo(leafletMap)
      .bindPopup(`<strong>${escHtml(name)}</strong>`);
    marker.on('click', () => {
      placesList.querySelectorAll('.place-card').forEach((c, j) => c.classList.toggle('active', j === i));
    });
    markers.push(marker);
  });

  setTimeout(() => {
    leafletMap.invalidateSize();
    const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
    leafletMap.fitBounds(bounds, { padding: [40, 40] });
  }, 200);
}

function renderGoogleMap(center, places) {
  hidePlaceholder();
  mapDiv.style.display    = 'none';
  gmapFrame.style.display = 'block';
  if (leafletMap) { leafletMap.remove(); leafletMap = null; markers = []; }
  const q   = places.map(p => p.name || p.tags?.name).join(' OR ');
  gmapFrame.src = `https://www.google.com/maps?q=${encodeURIComponent(q)}&ll=${center.lat},${center.lng}&z=13&output=embed`;
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
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
