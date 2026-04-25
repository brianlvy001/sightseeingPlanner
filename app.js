const RADIUS_M = 12874; // 8 miles

const form          = document.getElementById('search-form');
const input         = document.getElementById('address-input');
const typeSelect    = document.getElementById('type-select');
const mapSource     = document.getElementById('map-source');
const statusEl      = document.getElementById('status');
const mapDiv        = document.getElementById('map');
const gmapFrame     = document.getElementById('gmap');
const mapContainer  = document.getElementById('map-container');
const phLoading     = document.getElementById('ph-loading');
const phError       = document.getElementById('ph-error');
const phMsg         = document.getElementById('ph-msg');
const carouselWrap  = document.getElementById('carousel-wrap');
const carouselTrack = document.getElementById('carousel-track');
const carouselPrev  = document.getElementById('carousel-prev');
const carouselNext  = document.getElementById('carousel-next');
const carouselCount = document.getElementById('carousel-counter');
const placesList    = document.getElementById('places-list');
const panelTitle    = document.getElementById('panel-title');
const activeInfo    = document.getElementById('active-info');
const activeName    = document.getElementById('active-name');
const activeFill    = document.getElementById('active-fill');
const activeNum     = document.getElementById('active-num');
const activeCount   = document.getElementById('active-count');
const activeLinks   = document.getElementById('active-links');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const scrubberTrack = document.getElementById('scrubber-track');
const scrubberThumb = document.getElementById('scrubber-thumb');
const scrPrev       = document.getElementById('scr-prev');
const scrNext       = document.getElementById('scr-next');
const locateBtn     = document.getElementById('locate-btn');

// OSM: query restaurants filtered by cuisine tag
const CQ = (cuisine) =>
  `(node["amenity"="restaurant"]["cuisine"="${cuisine}"]["name"](around:${RADIUS_M},LAT,LNG);` +
  ` way["amenity"="restaurant"]["cuisine"="${cuisine}"]["name"](around:${RADIUS_M},LAT,LNG););`;

const OVERPASS_QUERIES = {
  asian_restaurant:      CQ('asian'),
  chinese_restaurant:    CQ('chinese'),
  thai_restaurant:       CQ('thai'),
  japanese_restaurant:   CQ('japanese'),
  vietnamese_restaurant: CQ('vietnamese'),
  korean_restaurant:     CQ('korean'),
};

const TYPE_LABELS = {
  asian_restaurant:      'Top Asian Restaurants',
  chinese_restaurant:    'Top Chinese Restaurants',
  thai_restaurant:       'Top Thai Restaurants',
  japanese_restaurant:   'Top Japanese Restaurants',
  vietnamese_restaurant: 'Top Vietnamese Restaurants',
  korean_restaurant:     'Top Korean Restaurants',
};

let leafletMap  = null;
let lastCenter  = null;
let lastPlaces  = [];
let lastSource  = null;
let markers     = [];
let carouselIdx = 0;

// ── Cover Flow carousel ───────────────────────────────────────────────────────

function cardW() {
  const c = placesList.querySelector('.place-card');
  return c ? c.offsetWidth : 200;
}

function updateCarousel(instant = false) {
  const cards = Array.from(placesList.querySelectorAll('.place-card'));
  if (!cards.length) return;

  const total = cards.length;
  const cw    = cardW();

  // Cover-Flow geometry (all in px, relative to the shared left:50% anchor):
  //   Active  → translateX(0)  rotateY(0deg)   translateZ(0)
  //   Left-N  → translateX(-X) rotateY(+60deg) translateZ(-200px)
  //   Right-N → translateX(+X) rotateY(-60deg) translateZ(-200px)
  // X grows with each step so that cards tightly overlap behind the active card.
  const SIDE_ANGLE  = 60;   // rotateY degrees for all inactive cards
  const SIDE_TZ     = -200; // depth pushed back (px)
  const FIRST_STEP  = cw * 0.65; // offset of the direct neighbours from center
  const EXTRA_STEP  = cw * 0.28; // additional offset per card further out

  cards.forEach((card, i) => {
    const dist    = i - carouselIdx;
    const absDist = Math.abs(dist);
    const sign    = dist > 0 ? 1 : dist < 0 ? -1 : 0;

    let tx, rotY, tz, opacity, zIndex;

    if (dist === 0) {
      // Active: flat, facing viewer, no depth
      tx      = 0;
      rotY    = 0;
      tz      = 0;
      opacity = 1;
      zIndex  = 100;
    } else {
      // Left (sign=-1): rotateY(+60deg) — faces right, showing left art to viewer
      // Right (sign=+1): rotateY(-60deg) — faces left
      rotY    = sign * -SIDE_ANGLE;
      tz      = SIDE_TZ;
      // Each card is offset more than the previous so they stack tightly
      tx      = sign * (FIRST_STEP + (absDist - 1) * EXTRA_STEP);
      opacity = absDist === 1 ? 0.88 : absDist === 2 ? 0.6 : 0.28;
      // Further cards have lower z-index → render behind closer ones
      zIndex  = Math.max(0, 100 - absDist * 15);
    }

    if (instant) card.style.transition = 'none';

    card.style.transform = `translate3d(${tx}px, 0, 0) rotateY(${rotY}deg) translateZ(${tz}px)`;
    card.style.opacity   = String(opacity);
    card.style.zIndex    = String(zIndex);

    if (instant) {
      card.offsetHeight; // force reflow before re-enabling transition
      card.style.transition = '';
    }

    card.classList.toggle('is-active',   dist === 0);
    card.classList.toggle('is-adjacent', absDist === 1);
    card.classList.toggle('is-far',      absDist >= 2);
  });

  carouselPrev.disabled = carouselIdx === 0;
  carouselNext.disabled = carouselIdx >= total - 1;
  carouselCount.textContent = `${carouselIdx + 1} of ${total}`;
  updateActiveInfo(carouselIdx);
  updateScrubber();
}

function updateScrubber() {
  const total  = placesList.querySelectorAll('.place-card').length;
  const thumbW = scrubberThumb.offsetWidth;
  const travel = scrubberTrack.offsetWidth - thumbW;

  scrubberThumb.style.left = total > 1
    ? (carouselIdx / (total - 1)) * travel + 'px'
    : '0px';

  scrPrev.disabled = carouselIdx === 0;
  scrNext.disabled = carouselIdx >= total - 1;
}

function updateActiveInfo(idx) {
  if (!lastPlaces.length || idx >= lastPlaces.length) return;
  const p = lastPlaces[idx];

  if (lastSource === 'google') {
    const name   = p.displayName?.text || '';
    const rating = p.rating || 0;
    const count  = p.userRatingCount ? `(${p.userRatingCount.toLocaleString()})` : '';
    const url    = p.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
    activeName.textContent      = name;
    activeFill.style.width      = (rating / 5 * 100).toFixed(0) + '%';
    activeNum.textContent       = rating.toFixed(1);
    activeCount.textContent     = count;
    activeLinks.innerHTML       = `<a class="place-link" href="${url}" target="_blank" rel="noopener">Google Maps &rarr;</a>`;
  } else {
    const name     = p.tags?.name || '';
    const maxScore = lastPlaces[0]._score || 1;
    const score    = (p._score / maxScore) * 5;
    const lat      = p.lat ?? p.center?.lat;
    const lng      = p.lon ?? p.center?.lon;
    const mapsUrl  = `https://www.google.com/maps?q=${lat},${lng}`;
    const wikiUrl  = p.tags?.wikipedia
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.tags.wikipedia.replace(/^en:/, ''))}`
      : null;
    activeName.textContent  = name;
    activeFill.style.width  = (score / 5 * 100).toFixed(0) + '%';
    activeNum.textContent   = score.toFixed(1);
    activeCount.textContent = '';
    activeLinks.innerHTML   = `<a class="place-link" href="${mapsUrl}" target="_blank" rel="noopener">Google Maps</a>`
      + (wikiUrl ? `<a class="place-link" href="${wikiUrl}" target="_blank" rel="noopener">Wikipedia</a>` : '');
  }
}

carouselPrev.addEventListener('click', () => { carouselIdx = Math.max(0, carouselIdx - 1); updateCarousel(); });
carouselNext.addEventListener('click', () => {
  const cards = placesList.querySelectorAll('.place-card');
  carouselIdx = Math.min(cards.length - 1, carouselIdx + 1);
  updateCarousel();
});
window.addEventListener('resize', () => updateCarousel());

// ── Mouse drag (snap-on-release) ──────────────────────────────────────────────
let isDragging = false;
let dragStartX = 0;
let dragMoved  = false;

carouselTrack.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  isDragging = true;
  dragMoved  = false;
  dragStartX = e.clientX;
  carouselTrack.style.cursor = 'grabbing';
  e.preventDefault();
});

window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  if (Math.abs(e.clientX - dragStartX) > 6) dragMoved = true;
});

window.addEventListener('mouseup', e => {
  if (!isDragging) return;
  isDragging = false;
  carouselTrack.style.cursor = 'grab';
  if (dragMoved) {
    const dx    = e.clientX - dragStartX;
    const skip  = Math.max(1, Math.round(Math.abs(dx) / (cardW() * 0.5)));
    const cards = placesList.querySelectorAll('.place-card');
    if (dx < 0) carouselIdx = Math.min(cards.length - 1, carouselIdx + skip);
    else        carouselIdx = Math.max(0, carouselIdx - skip);
    updateCarousel();
  }
});

// ── Touch swipe ───────────────────────────────────────────────────────────────
let touchStartX = 0;
carouselTrack.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
carouselTrack.addEventListener('touchend', e => {
  const dx    = e.changedTouches[0].clientX - touchStartX;
  const cards = placesList.querySelectorAll('.place-card');
  if (Math.abs(dx) > 40) {
    if (dx < 0 && carouselIdx < cards.length - 1) carouselIdx++;
    else if (dx > 0 && carouselIdx > 0) carouselIdx--;
    updateCarousel();
  }
}, { passive: true });

// ── Scrubber arrows ───────────────────────────────────────────────────────────
scrPrev.addEventListener('click', () => {
  carouselIdx = Math.max(0, carouselIdx - 1);
  updateCarousel();
});
scrNext.addEventListener('click', () => {
  const total = placesList.querySelectorAll('.place-card').length;
  carouselIdx = Math.min(total - 1, carouselIdx + 1);
  updateCarousel();
});

// ── Scrubber thumb drag ───────────────────────────────────────────────────────
let scrDragging  = false;
let scrStartX    = 0;
let scrStartIdx  = 0;
let scrRafId     = 0;
let scrPendingIdx = -1;

scrubberThumb.addEventListener('mousedown', e => {
  scrDragging = true;
  scrStartX   = e.clientX;
  scrStartIdx = carouselIdx;
  scrubberThumb.classList.add('dragging');
  placesList.classList.add('is-scrubbing');
  e.preventDefault();
  e.stopPropagation();
});

window.addEventListener('mousemove', e => {
  if (!scrDragging) return;
  const total  = placesList.querySelectorAll('.place-card').length;
  if (total <= 1) return;
  const travel     = scrubberTrack.offsetWidth - scrubberThumb.offsetWidth;
  const pxPerStep  = travel / (total - 1);
  const newIdx     = Math.round(
    Math.max(0, Math.min(total - 1, scrStartIdx + (e.clientX - scrStartX) / pxPerStep))
  );
  if (newIdx !== scrPendingIdx) {
    scrPendingIdx = newIdx;
    cancelAnimationFrame(scrRafId);
    scrRafId = requestAnimationFrame(() => {
      if (scrPendingIdx !== carouselIdx) {
        carouselIdx = scrPendingIdx;
        updateCarousel();
      }
    });
  }
});

window.addEventListener('mouseup', () => {
  if (!scrDragging) return;
  scrDragging = false;
  cancelAnimationFrame(scrRafId);
  placesList.classList.remove('is-scrubbing');
  scrubberThumb.classList.remove('dragging');
  updateScrubber();
});

// ── Scrubber track click (jump to position) ───────────────────────────────────
scrubberTrack.addEventListener('click', e => {
  if (scrDragging) return;
  const total  = placesList.querySelectorAll('.place-card').length;
  if (total <= 1) return;
  const rect   = scrubberTrack.getBoundingClientRect();
  const thumbW = scrubberThumb.offsetWidth;
  const travel = rect.width - thumbW;
  const pct    = Math.max(0, Math.min(1, (e.clientX - rect.left - thumbW / 2) / travel));
  carouselIdx  = Math.round(pct * (total - 1));
  updateCarousel();
});

// ── Scrubber touch support ────────────────────────────────────────────────────
scrubberThumb.addEventListener('touchstart', e => {
  scrDragging = true;
  scrStartX   = e.touches[0].clientX;
  scrStartIdx = carouselIdx;
  scrubberThumb.classList.add('dragging');
  placesList.classList.add('is-scrubbing');
}, { passive: true });

scrubberThumb.addEventListener('touchmove', e => {
  if (!scrDragging) return;
  const total = placesList.querySelectorAll('.place-card').length;
  if (total <= 1) return;
  const travel    = scrubberTrack.offsetWidth - scrubberThumb.offsetWidth;
  const pxPerStep = travel / (total - 1);
  const newIdx    = Math.round(
    Math.max(0, Math.min(total - 1, scrStartIdx + (e.touches[0].clientX - scrStartX) / pxPerStep))
  );
  if (newIdx !== scrPendingIdx) {
    scrPendingIdx = newIdx;
    cancelAnimationFrame(scrRafId);
    scrRafId = requestAnimationFrame(() => {
      if (scrPendingIdx !== carouselIdx) {
        carouselIdx = scrPendingIdx;
        updateCarousel();
      }
    });
  }
}, { passive: true });

scrubberThumb.addEventListener('touchend', () => {
  scrDragging = false;
  cancelAnimationFrame(scrRafId);
  placesList.classList.remove('is-scrubbing');
  scrubberThumb.classList.remove('dragging');
  updateScrubber();
});

// ── Fullscreen toggle ─────────────────────────────────────────────────────────
fullscreenBtn.addEventListener('click', () => {
  const isFs = carouselWrap.classList.toggle('is-fullscreen');
  fullscreenBtn.innerHTML   = isFs ? '&#x2715;' : '&#x2922;';
  fullscreenBtn.title       = isFs ? 'Exit full screen' : 'Full screen';
  document.body.style.overflow = isFs ? 'hidden' : '';
  setTimeout(() => updateCarousel(), 60);
});

// ── Current location button ───────────────────────────────────────────────────
locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  locateBtn.classList.add('loading');
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      try {
        const { latitude: lat, longitude: lon } = coords;
        const res  = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
        );
        const data = await res.json();
        const a    = data.address || {};
        const label = [
          a.neighbourhood || a.suburb,
          a.city || a.town || a.village || a.county,
          a.state,
        ].filter(Boolean).join(', ');
        input.value = label || data.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        input.focus();
      } catch {
        input.value = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
      } finally {
        locateBtn.classList.remove('loading');
        locateBtn.disabled = false;
      }
    },
    (err) => {
      locateBtn.classList.remove('loading');
      locateBtn.disabled = false;
      const msgs = {
        1: 'Location access denied. Please allow location permission and try again.',
        2: 'Your position could not be determined.',
        3: 'Location request timed out.',
      };
      alert(msgs[err.code] || 'Could not get your location.');
    },
    { timeout: 10000 }
  );
});

// ── Form submit ───────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = input.value.trim();
  const type    = typeSelect.value;
  const source  = mapSource.value;
  if (!address) return;

  setStatus('Locating address...');
  carouselWrap.classList.add('hidden');
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

    panelTitle.textContent = TYPE_LABELS[type] || 'Top Places';
    setStatus(`Found ${places.length} place${places.length > 1 ? 's' : ''}`);
    source === 'google' ? renderGoogleCards(places, type) : renderOsmCards(places);

    carouselIdx = 0;
    carouselWrap.classList.remove('hidden');
    // Position instantly on first load, then re-enable transitions
    setTimeout(() => updateCarousel(true), 30);

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

// ── Ranking ───────────────────────────────────────────────────────────────────
// Composite score: rewards high rating AND high review count.
// A 5.0 with 3 reviews scores lower than a 4.5 with 500 reviews.
// log(reviewCount + 1) grows quickly at first then levels off, so
// going from 0→100 reviews matters a lot; 1000→2000 matters less.
function placeScore(p) {
  return p.rating * Math.log(p.userRatingCount + 1);
}

// ── Google Places (New HTTP API) ──────────────────────────────────────────────
const GAPI_KEY = 'AIzaSyBvQza0NnKLqOXtNvYOs1-lcPXT6ghWCXM';
const FOOD_TYPES = new Set([
  'asian_restaurant', 'chinese_restaurant', 'thai_restaurant',
  'japanese_restaurant', 'vietnamese_restaurant', 'korean_restaurant',
]);

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
  return (data.places || [])
    .filter(p => p.rating != null && p.userRatingCount != null)
    .sort((a, b) => placeScore(b) - placeScore(a))
    .slice(0, 10);
}

// ── OSM / Overpass ────────────────────────────────────────────────────────────
async function fetchOsmPlaces(center, type) {
  const body = OVERPASS_QUERIES[type].replace(/LAT/g, center.lat).replace(/LNG/g, center.lng);
  const res  = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body:   'data=' + encodeURIComponent(`[out:json][timeout:25];\n${body}\nout center 80;`),
  });
  if (!res.ok) throw new Error('Failed to fetch places. Please try again.');
  const data = await res.json();
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
function renderGoogleCards(places, type) {
  placesList.innerHTML = places.map((p, i) => {
    const badge      = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const name       = p.displayName?.text || '';
    const photoIndex = FOOD_TYPES.has(type) ? 1 : 0;
    const photoRef   = (p.photos?.[photoIndex] ?? p.photos?.[0])?.name;
    const photoUrl   = photoRef
      ? `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=400&key=${GAPI_KEY}`
      : '';
    return `<div class="place-card" data-index="${i}">
      <div class="card-cover-wrap">
        ${photoUrl
          ? `<img class="card-cover" src="${photoUrl}" alt="${escHtml(name)}" loading="lazy" onerror="this.style.display='none'">`
          : `<div class="card-cover-placeholder"><span class="card-place-icon">📍</span></div>`}
        <div class="rank-badge ${badge} badge-over">${i + 1}</div>
      </div>
    </div>`;
  }).join('');
  attachCardClicks();
}

function renderOsmCards(places) {
  placesList.innerHTML = places.map((p, i) => {
    const badge = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const type  = (p.tags.tourism || p.tags.historic || p.tags.leisure || '').replace(/_/g, ' ');
    return `<div class="place-card" data-index="${i}">
      <div class="card-cover-wrap">
        <div class="card-cover-placeholder">
          ${type ? `<div class="card-place-type">${escHtml(type)}</div>` : ''}
          <span class="card-place-icon">📍</span>
        </div>
        <div class="rank-badge ${badge} badge-over">${i + 1}</div>
      </div>
    </div>`;
  }).join('');
  attachCardClicks();
}

function attachCardClicks() {
  placesList.querySelectorAll('.place-card').forEach((card, i) => {
    card.addEventListener('click', () => {
      if (dragMoved) return;
      carouselIdx = i;
      updateCarousel();
      placesList.querySelectorAll('.place-card').forEach(c => c.classList.remove('map-selected'));
      card.classList.add('map-selected');
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
      carouselIdx = i;
      updateCarousel();
      placesList.querySelectorAll('.place-card').forEach((c, j) => c.classList.toggle('map-selected', j === i));
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
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className   = isError ? 'error' : '';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
