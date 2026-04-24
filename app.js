const RADIUS_M = 12874; // 8 miles

const form        = document.getElementById('search-form');
const input       = document.getElementById('address-input');
const typeSelect  = document.getElementById('type-select');
const mapSource   = document.getElementById('map-source');
const statusEl    = document.getElementById('status');
const content     = document.getElementById('content');
const placesList  = document.getElementById('places-list');
const panelTitle  = document.getElementById('panel-title');
const mapDiv      = document.getElementById('map');
const gmapFrame   = document.getElementById('gmap');

const TYPE_LABELS = {
  tourist_attraction: 'Top Sightseeing',
  museum:             'Top Museums',
  park:               'Top Parks',
  art_gallery:        'Top Art Galleries',
  zoo:                'Top Zoos',
  aquarium:           'Top Aquariums',
  amusement_park:     'Top Amusement Parks',
};

let leafletMap = null;
let markers    = [];
let lastPlaces = [];
let lastCenter = null;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = input.value.trim();
  const type    = typeSelect.value;
  if (!address) return;

  setStatus('Locating address...');
  content.classList.remove('visible');
  form.querySelector('button').disabled = true;

  try {
    const center = await geocode(address);
    setStatus('Fetching nearby places...');
    const places = await nearbySearch(center, type);

    if (places.length === 0) {
      setStatus(`No ${TYPE_LABELS[type].toLowerCase()} found within 8 miles. Try a different address.`, true);
      return;
    }

    const top5 = places
      .filter(p => p.rating != null)
      .sort((a, b) => b.rating - a.rating || (b.user_ratings_total || 0) - (a.user_ratings_total || 0))
      .slice(0, 5);

    if (top5.length === 0) {
      setStatus('Places found but none have ratings yet. Try a different type or address.', true);
      return;
    }

    lastPlaces = top5;
    lastCenter = center;

    setStatus('');
    panelTitle.textContent = TYPE_LABELS[type];
    renderPlaces(top5);
    content.classList.add('visible');
    renderMap(center, top5, mapSource.value);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    form.querySelector('button').disabled = false;
  }
});

// Switch map source without re-searching
mapSource.addEventListener('change', () => {
  if (lastPlaces.length && lastCenter) {
    renderMap(lastCenter, lastPlaces, mapSource.value);
  }
});

function geocode(address) {
  return new Promise((resolve, reject) => {
    new google.maps.Geocoder().geocode({ address }, (results, status) => {
      if (status === 'OK') {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        reject(new Error('Address not found. Please try a different address.'));
      }
    });
  });
}

function nearbySearch(center, type) {
  return new Promise((resolve, reject) => {
    const service = new google.maps.places.PlacesService(document.getElementById('attr'));
    service.nearbySearch(
      { location: center, radius: RADIUS_M, type },
      (places, status) => {
        const S = google.maps.places.PlacesServiceStatus;
        if (status === S.REQUEST_DENIED) {
          reject(new Error('Google Places API denied — please enable billing at console.cloud.google.com/billing (free $200/month credit applies).'));
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

  placesList.querySelectorAll('.place-card').forEach(card => {
    card.addEventListener('click', () => {
      const i = parseInt(card.dataset.index);
      placesList.querySelectorAll('.place-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      if (markers[i]) { markers[i].openPopup(); leafletMap?.panTo(markers[i].getLatLng()); }
    });
  });
}

function renderMap(center, places, source) {
  if (source === 'osm') {
    gmapFrame.style.display = 'none';
    mapDiv.style.display    = 'block';
    renderLeaflet(center, places);
  } else {
    mapDiv.style.display    = 'none';
    gmapFrame.style.display = 'block';
    if (leafletMap) { leafletMap.remove(); leafletMap = null; markers = []; }
    const q   = places.map(p => p.name).join(' OR ');
    const url = `https://www.google.com/maps?q=${encodeURIComponent(q)}&ll=${center.lat},${center.lng}&z=13&output=embed`;
    gmapFrame.src = url;
  }
}

function renderLeaflet(center, places) {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  markers = [];

  leafletMap = L.map(mapDiv).setView([center.lat, center.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(leafletMap);

  places.forEach((p, i) => {
    const lat    = p.geometry.location.lat();
    const lng    = p.geometry.location.lng();
    const marker = L.marker([lat, lng])
      .addTo(leafletMap)
      .bindPopup(`<strong>${escHtml(p.name)}</strong><br>⭐ ${p.rating}`);
    marker.on('click', () => {
      placesList.querySelectorAll('.place-card').forEach((c, j) => c.classList.toggle('active', j === i));
    });
    markers.push(marker);
  });

  // Wait for the grid to finish painting before measuring dimensions
  setTimeout(() => {
    leafletMap.invalidateSize();
    const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
    leafletMap.fitBounds(bounds, { padding: [40, 40] });
  }, 200);
}

function renderStars(rating) {
  const full  = Math.floor(rating);
  const half  = (rating - full) >= 0.5 ? 1 : 0;
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
