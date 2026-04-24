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
    setStatus('Fetching nearby attractions...');
    const places = await nearbySearch(lat, lng);

    if (places.length === 0) {
      setStatus('No rated attractions found within 8 miles. Try a different address.', true);
      return;
    }

    const top5 = places
      .filter(p => p.rating != null)
      .sort((a, b) => b.rating - a.rating || (b.user_ratings_total || 0) - (a.user_ratings_total || 0))
      .slice(0, 5);

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

function geocode(address) {
  return new Promise((resolve, reject) => {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK') {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        reject(new Error('Address not found. Please try a different address.'));
      }
    });
  });
}

function nearbySearch(lat, lng) {
  return new Promise((resolve, reject) => {
    const service = new google.maps.places.PlacesService(document.getElementById('attr'));
    service.nearbySearch(
      { location: { lat, lng }, radius: RADIUS_M, type: 'tourist_attraction' },
      (places, status) => {
        const S = google.maps.places.PlacesServiceStatus;
        if (status === S.REQUEST_DENIED) {
          reject(new Error('Google Places API denied — please enable billing on your Google Cloud project at console.cloud.google.com/billing'));
        } else if (status === S.OK) {
          resolve(places);
        } else {
          resolve([]);
        }
      }
    );
  });
}

function renderPlaces(places) {
  placesList.innerHTML = places.map((p, i) => {
    const badge    = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const stars    = renderStars(p.rating);
    const count    = p.user_ratings_total ? `(${p.user_ratings_total.toLocaleString()})` : '';
    const mapsUrl  = `https://www.google.com/maps/place/?q=place_id:${p.place_id}`;

    return `<div class="place-card" data-index="${i}">
      <div class="rank-badge ${badge}">${i + 1}</div>
      <div class="place-info">
        <div class="place-name">${escHtml(p.name)}</div>
        <div class="place-rating">
          <span class="stars">${stars}</span>
          <span class="rating-num">${p.rating.toFixed(1)}</span>
          <span class="rating-count">${count}</span>
        </div>
        ${p.vicinity ? `<div class="place-address">${escHtml(p.vicinity)}</div>` : ''}
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
    const lat = p.geometry.location.lat();
    const lng = p.geometry.location.lng();
    const marker = L.marker([lat, lng])
      .addTo(leafletMap)
      .bindPopup(`<strong>${escHtml(p.name)}</strong><br>⭐ ${p.rating}`);
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
