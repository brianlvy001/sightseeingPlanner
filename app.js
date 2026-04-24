const RADIUS_M = 12874; // 8 miles

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
    setStatus(`Geocoded: ${lat.toFixed(4)}, ${lng.toFixed(4)} — fetching Wikipedia places...`);
    const raw = await fetchWikiPlaces(lat, lng);
    setStatus(`Wikipedia returned ${raw.length} places — rendering...`);
    const places = raw;

    if (places.length === 0) {
      setStatus('No notable sightseeing places found within 8 miles. Try a different address.', true);
      return;
    }

    const top5 = places.slice(0, 5);
    setStatus('');
    renderPlaces(top5, places[0].size);
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

async function fetchWikiPlaces(lat, lng) {
  // Step 1: find notable places near location via Wikipedia GeoSearch
  const geoUrl = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch` +
    `&gscoord=${lat}|${lng}&gsradius=10000&gslimit=50&format=json&origin=*`;
  const geoRes  = await fetch(geoUrl);
  const geoData = await geoRes.json();
  const hits    = geoData.query?.geosearch || [];
  if (!hits.length) return [];

  // Step 2: fetch article sizes + thumbnails in one batch call
  const ids      = hits.map(p => p.pageid).slice(0, 50).join('|');
  const detUrl   = `https://en.wikipedia.org/w/api.php?action=query&pageids=${ids}` +
    `&prop=revisions|pageimages&rvprop=size&pithumbsize=120&format=json&origin=*`;
  const detRes   = await fetch(detUrl);
  const detData  = await detRes.json();
  const pages    = detData.query?.pages || {};

  // Combine and sort by article size (proxy for notability)
  return hits
    .map(p => {
      const page  = pages[p.pageid] || {};
      const size  = page.revisions?.[0]?.size || 0;
      const thumb = page.thumbnail?.source || null;
      return { ...p, size, thumb };
    })
    .filter(p => p.size > 0)
    .sort((a, b) => b.size - a.size);
}

function renderPlaces(places, maxSize) {
  placesList.innerHTML = places.map((p, i) => {
    const badge    = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const stars    = sizeToStars(p.size, maxSize);
    const starStr  = renderStars(stars);
    const distMi   = (p.dist / 1609.34).toFixed(1);
    const wikiUrl  = `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)}`;
    const mapsUrl  = `https://www.google.com/maps?q=${p.lat},${p.lon}`;
    const photoEl  = p.thumb
      ? `<img class="place-photo" src="${p.thumb}" alt="${escHtml(p.title)}" />`
      : `<div class="place-photo-placeholder">🏛️</div>`;

    return `<div class="place-card" data-index="${i}">
      ${photoEl}
      <div class="place-info">
        <div class="rank-badge ${badge}">${i + 1}</div>
        <div class="place-name">${escHtml(p.title)}</div>
        <div class="place-rating">
          <span class="stars">${starStr}</span>
          <span class="rating-num">${stars.toFixed(1)}</span>
        </div>
        <div class="place-dist">${distMi} mi away</div>
        <div class="place-links">
          <a class="place-link" href="${wikiUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Wikipedia</a>
          <a class="place-link" href="${mapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Google Maps</a>
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
    const marker = L.marker([p.lat, p.lon])
      .addTo(leafletMap)
      .bindPopup(`<strong>${escHtml(p.title)}</strong>`);
    marker.on('click', () => {
      placesList.querySelectorAll('.place-card').forEach((c, j) => c.classList.toggle('active', j === i));
    });
    markers.push(marker);
  });

  const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
  leafletMap.fitBounds(bounds, { padding: [40, 40] });
  setTimeout(() => leafletMap.invalidateSize(), 50);
}

function sizeToStars(size, maxSize) {
  return Math.max(1, Math.min(5, (size / maxSize) * 5));
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
