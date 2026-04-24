const RADIUS_M = 12874; // 8 miles

const form        = document.getElementById('search-form');
const input       = document.getElementById('address-input');
const typeSelect  = document.getElementById('type-select');
const statusEl    = document.getElementById('status');
const content     = document.getElementById('content');
const placesList  = document.getElementById('places-list');
const panelTitle  = document.getElementById('panel-title');
const mapDiv      = document.getElementById('map');

const TYPE_LABELS = {
  all:       'Top Sightseeing',
  museum:    'Top Museums',
  park:      'Top Parks',
  historic:  'Top Historic Sites',
  gallery:   'Top Art Galleries',
  zoo:       'Top Zoos & Aquariums',
  viewpoint: 'Top Viewpoints',
};

const TYPE_QUERIES = {
  all: `(
    node["tourism"~"^(attraction|museum|zoo|aquarium|theme_park|viewpoint|gallery|artwork)$"](around:${RADIUS_M},LAT,LNG);
    way["tourism"~"^(attraction|museum|zoo|aquarium|theme_park|viewpoint|gallery|artwork)$"](around:${RADIUS_M},LAT,LNG);
    node["historic"]["name"](around:${RADIUS_M},LAT,LNG);
    way["historic"]["name"](around:${RADIUS_M},LAT,LNG);
  );`,
  museum: `(
    node["tourism"="museum"]["name"](around:${RADIUS_M},LAT,LNG);
    way["tourism"="museum"]["name"](around:${RADIUS_M},LAT,LNG);
  );`,
  park: `(
    node["leisure"="park"]["name"](around:${RADIUS_M},LAT,LNG);
    way["leisure"="park"]["name"](around:${RADIUS_M},LAT,LNG);
  );`,
  historic: `(
    node["historic"]["name"](around:${RADIUS_M},LAT,LNG);
    way["historic"]["name"](around:${RADIUS_M},LAT,LNG);
  );`,
  gallery: `(
    node["tourism"="gallery"]["name"](around:${RADIUS_M},LAT,LNG);
    way["tourism"="gallery"]["name"](around:${RADIUS_M},LAT,LNG);
  );`,
  zoo: `(
    node["tourism"~"^(zoo|aquarium)$"]["name"](around:${RADIUS_M},LAT,LNG);
    way["tourism"~"^(zoo|aquarium)$"]["name"](around:${RADIUS_M},LAT,LNG);
  );`,
  viewpoint: `(
    node["tourism"="viewpoint"]["name"](around:${RADIUS_M},LAT,LNG);
    way["tourism"="viewpoint"]["name"](around:${RADIUS_M},LAT,LNG);
  );`,
};

let leafletMap = null;
let markers    = [];

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = input.value.trim();
  const type    = typeSelect.value;
  if (!address) return;

  setStatus('Locating address...');
  content.classList.remove('visible');
  form.querySelector('button').disabled = true;

  try {
    const { lat, lng } = await geocode(address);
    setStatus('Finding nearby places...');
    const places = await fetchPlaces(lat, lng, type);

    if (places.length === 0) {
      setStatus(`No ${TYPE_LABELS[type].toLowerCase()} found within 8 miles. Try a different address or type.`, true);
      return;
    }

    const top5 = rankPlaces(places).slice(0, 5);
    const maxScore = top5[0]._score;

    setStatus('');
    panelTitle.textContent = TYPE_LABELS[type];
    renderPlaces(top5, maxScore);
    content.classList.add('visible');
    renderMap(lat, lng, top5);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    form.querySelector('button').disabled = false;
  }
});

async function geocode(address) {
  const url  = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address);
  const res  = await fetch(url);
  const data = await res.json();
  if (!data.length) throw new Error('Address not found. Please try a different address.');
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function fetchPlaces(lat, lng, type) {
  const body  = TYPE_QUERIES[type].replace(/LAT/g, lat).replace(/LNG/g, lng);
  const query = `[out:json][timeout:25];\n${body}\nout center 80;`;
  const res   = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body:   'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error('Failed to fetch places. Please try again.');
  const data  = await res.json();
  return data.elements.filter(el => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    return el.tags?.name && lat && lng;
  });
}

function rankPlaces(places) {
  return places
    .map(p => ({ ...p, _score: computeScore(p) }))
    .sort((a, b) => b._score - a._score);
}

function computeScore(p) {
  const tags = p.tags;
  let s = 0;
  if (tags.wikipedia || tags.wikidata) s += 10;
  const t = tags.tourism;
  if (['attraction', 'museum', 'zoo', 'aquarium', 'theme_park'].includes(t)) s += 5;
  else if (['viewpoint', 'gallery', 'artwork'].includes(t)) s += 3;
  if (tags.historic) s += 4;
  if (tags.website || tags['contact:website']) s += 2;
  if (tags.phone || tags['contact:phone']) s += 1;
  s += Math.min(Object.keys(tags).length, 20) * 0.2;
  return s;
}

function renderPlaces(places, maxScore) {
  placesList.innerHTML = places.map((p, i) => {
    const badge   = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const stars   = renderStars((p._score / maxScore) * 5);
    const score   = ((p._score / maxScore) * 5).toFixed(1);
    const lat     = p.lat ?? p.center.lat;
    const lng     = p.lon ?? p.center.lon;
    const type    = formatType(p.tags);
    const addr    = p.tags['addr:street']
      ? `${p.tags['addr:housenumber'] || ''} ${p.tags['addr:street']}`.trim()
      : '';
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const wikiUrl = p.tags.wikipedia
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.tags.wikipedia.replace(/^en:/, ''))}`
      : null;

    return `<div class="place-card" data-index="${i}">
      <div class="place-info">
        <div class="card-top">
          <div class="rank-badge ${badge}">${i + 1}</div>
          <div class="place-name">${escHtml(p.tags.name)}</div>
        </div>
        <div class="place-type">${escHtml(type)}</div>
        <div class="place-rating">
          <span class="stars">${stars}</span>
          <span class="rating-num">${score}</span>
        </div>
        ${addr ? `<div class="place-address">${escHtml(addr)}</div>` : ''}
        <div class="place-links">
          <a class="place-link" href="${mapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Google Maps</a>
          ${wikiUrl ? `<a class="place-link" href="${wikiUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Wikipedia</a>` : ''}
        </div>
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
    const lat = p.lat ?? p.center.lat;
    const lng = p.lon ?? p.center.lon;
    const marker = L.marker([lat, lng])
      .addTo(leafletMap)
      .bindPopup(`<strong>${escHtml(p.tags.name)}</strong><br><small>${escHtml(formatType(p.tags))}</small>`);
    marker.on('click', () => {
      placesList.querySelectorAll('.place-card').forEach((c, j) => c.classList.toggle('active', j === i));
    });
    markers.push(marker);
  });

  const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
  leafletMap.fitBounds(bounds, { padding: [40, 40] });
  setTimeout(() => leafletMap.invalidateSize(), 50);
}

function formatType(tags) {
  const raw = tags.tourism || tags.historic || tags.leisure || 'attraction';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function renderStars(rating) {
  const clamped = Math.min(5, Math.max(0, rating));
  const full    = Math.floor(clamped);
  const half    = (clamped - full) >= 0.5 ? 1 : 0;
  const empty   = 5 - full - half;
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
