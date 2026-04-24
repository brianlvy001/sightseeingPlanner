const RADIUS_METERS = 12874; // 8 miles
const TYPES = ['tourist_attraction', 'museum', 'art_gallery', 'landmark', 'natural_feature', 'park', 'zoo', 'amusement_park', 'aquarium'];

const btn    = document.getElementById('find-btn');
const status = document.getElementById('status');
const results = document.getElementById('results');

btn.addEventListener('click', locate);

function locate() {
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by your browser.');
    return;
  }
  setStatus('Detecting your location...');
  btn.disabled = true;
  results.innerHTML = '';

  navigator.geolocation.getCurrentPosition(
    pos => search(pos.coords.latitude, pos.coords.longitude),
    err => {
      showError('Could not get your location: ' + err.message);
      btn.disabled = false;
    },
    { timeout: 15000, enableHighAccuracy: false, maximumAge: 60000 }
  );
}

function search(lat, lng) {
  setStatus('Searching for sightseeing places nearby...');
  const service = new google.maps.places.PlacesService(document.getElementById('attr'));

  const allPlaces = [];
  const statuses = new Set();
  let pending = TYPES.length;

  TYPES.forEach(type => {
    service.nearbySearch(
      { location: { lat, lng }, radius: RADIUS_METERS, type },
      (places, searchStatus) => {
        statuses.add(searchStatus);
        if (searchStatus === google.maps.places.PlacesServiceStatus.OK && places) {
          places.forEach(p => {
            if (!allPlaces.find(x => x.place_id === p.place_id)) allPlaces.push(p);
          });
        }
        pending--;
        if (pending === 0) renderResults(allPlaces, statuses);
      }
    );
  });
}

function renderResults(places, statuses) {
  btn.disabled = false;

  if (statuses.has(google.maps.places.PlacesServiceStatus.REQUEST_DENIED)) {
    showError('API request denied — check that the Places API is enabled and billing is active on your Google Cloud project.');
    return;
  }

  const rated = places
    .filter(p => p.rating != null)
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return (b.user_ratings_total || 0) - (a.user_ratings_total || 0);
    });

  if (rated.length === 0) {
    setStatus('No rated sightseeing places found within 8 miles.');
    return;
  }

  setStatus(`Found ${rated.length} place${rated.length > 1 ? 's' : ''} — sorted by rating`);

  results.innerHTML = rated.map((p, i) => cardHTML(p, i)).join('');
}

function cardHTML(place, index) {
  const rank = index + 1;
  const badgeClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

  const photoURL = place.photos && place.photos.length
    ? place.photos[0].getUrl({ maxWidth: 180, maxHeight: 180 })
    : null;

  const photoEl = photoURL
    ? `<img class="place-photo" src="${photoURL}" alt="${escHtml(place.name)}" loading="lazy" />`
    : `<div class="place-photo-placeholder">🏛️</div>`;

  const stars = renderStars(place.rating);
  const ratingCount = place.user_ratings_total
    ? `(${place.user_ratings_total.toLocaleString()})`
    : '';

  const openNow = place.opening_hours
    ? place.opening_hours.isOpen()
      ? '<span class="place-status open">Open now</span>'
      : '<span class="place-status closed">Closed</span>'
    : '';

  const mapsURL = `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;

  return `
    <div class="place-card">
      ${photoEl}
      <div class="place-info">
        <div class="place-name" title="${escHtml(place.name)}">${escHtml(place.name)}</div>
        <div class="place-rating">
          <span class="stars">${stars}</span>
          <span>${place.rating.toFixed(1)}</span>
          <span class="rating-count">${ratingCount}</span>
        </div>
        ${place.vicinity ? `<div class="place-address">${escHtml(place.vicinity)}</div>` : ''}
        ${openNow}
        <a class="place-link" href="${mapsURL}" target="_blank" rel="noopener">View on Google Maps &rarr;</a>
      </div>
      <div class="rank-badge ${badgeClass}">${rank}</div>
    </div>`;
}

function renderStars(rating) {
  const full  = Math.floor(rating);
  const half  = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function setStatus(msg) {
  status.textContent = msg;
  status.className = '';
}

function showError(msg) {
  status.textContent = msg;
  status.className = 'error';
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
