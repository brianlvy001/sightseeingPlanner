const RADIUS_M = 12874; // 8 miles

const form       = document.getElementById('search-form');
const input      = document.getElementById('address-input');
const statusEl   = document.getElementById('status');
const content    = document.getElementById('content');
const placesList = document.getElementById('places-list');
const mapDiv     = document.getElementById('map');

let leafletMap = null;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = input.value.trim();
  if (!address) return;

  setStatus('Locating address...');
  content.classList.remove('visible');
  form.querySelector('button').disabled = true;

  try {
    const { lat, lng } = await geocode(address);
    setStatus('Finding sightseeing places...');
    const places = await fetchPlaces(lat, lng);

    if (places.length === 0) {
      setStatus('No sightseeing places found within 8 miles. Try a different address.', true);
      return;
    }

    const top5 = rankPlaces(places).slice(0, 5);
    setStatus('');
    renderPlaces(top5);
    renderMap(lat, lng, top5);
    content.classList.add('visible');
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
  const query = `
    [out:json][timeout:25];
    (
      node["tourism"~"^(attraction|museum|zoo|aquarium|theme_park|viewpoint|gallery|artwork)$"](around:${RADIUS_M},${lat},${lng});
      way["tourism"~"^(attraction|museum|zoo|aquarium|theme_park|viewpoint|gallery|artwork)$"](around:${RADIUS_M},${lat},${lng});
      node["historic"~"^(castle|monument|memorial|ruins|archaeological_site|building)$"](around:${RADIUS_M},${lat},${lng});
      way["historic"~"^(castle|monument|memorial|ruins|archaeological_site|building)$"](around:${RADIUS_M},${lat},${lng});
    );
    out center 60;
  `;
  const res  = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
  });
  const data = await res.json();
  return data.elements.filter(el => {
    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    return el.tags?.name && elLat && elLng;
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
  const tourism = tags.tourism;
  if (['attraction', 'museum', 'zoo', 'aquarium', 'theme_park'].includes(tourism)) s += 5;
  else if (['viewpoint', 'gallery', 'artwork'].includes(tourism)) s += 3;
  if (tags.historic) s += 4;
  if (tags.website || tags['contact:website']) s += 2;
  s += Math.min(Object.keys(tags).length, 15) * 0.2;
  return s;
}

let markers = [];

function renderPlaces(places) {
  placesList.innerHTML = places.map((p, i) => {
    const name   = p.tags.name;
    const type   = formatType(p.tags);
    const lat    = p.lat ?? p.center.lat;
    const lng    = p.lon ?? p.center.lon;
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const badge  = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';

    return `<div class="place-card" data-index="${i}">
      <div class="rank-badge ${badge}">${i + 1}</div>
      <div class="place-info">
        <div class="place-name">${escHtml(name)}</div>
        <div class="place-type">${escHtml(type)}</div>
        <a class="place-link" href="${mapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Google Maps &rarr;</a>
      </div>
    </div>`;
  }).join('');

  placesList.querySelectorAll('.place-card').forEach(card => {
    card.addEventListener('click', () => {
      const i = parseInt(card.dataset.index);
      placesList.querySelectorAll('.place-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      markers[i].openPopup();
      leafletMap.panTo(markers[i].getLatLng());
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
    const lat  = p.lat ?? p.center.lat;
    const lng  = p.lon ?? p.center.lon;
    const name = p.tags.name;
    const type = formatType(p.tags);
    const marker = L.marker([lat, lng])
      .addTo(leafletMap)
      .bindPopup(`<strong>${escHtml(name)}</strong><br><small>${escHtml(type)}</small>`);
    marker.on('click', () => {
      placesList.querySelectorAll('.place-card').forEach((c, j) => {
        c.classList.toggle('active', j === i);
      });
    });
    markers.push(marker);
  });

  const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
  leafletMap.fitBounds(bounds, { padding: [40, 40] });
}

function formatType(tags) {
  const raw = tags.tourism || tags.historic || 'attraction';
  return raw.replace(/_/g, ' ');
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
