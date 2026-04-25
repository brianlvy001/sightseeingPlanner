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
const routeModal    = document.getElementById('route-modal');
const routeFrame    = document.getElementById('route-frame');
const routeMapEl    = document.getElementById('route-map');
const routeInfoBar  = document.getElementById('route-info-bar');
const routeClose    = document.getElementById('route-close');
const routeDestName = document.getElementById('route-dest-name');
const modeBtns      = document.querySelectorAll('.mode-btn');
const viewTabs      = document.querySelectorAll('.view-tab');
const mapSourceGroup = document.getElementById('map-source-group');
const foodieWrap    = document.getElementById('foodie-wrap');
const foodieList    = document.getElementById('foodie-list');
const foodieTitle   = document.getElementById('foodie-title');
const foodieCount   = document.getElementById('foodie-count');
const foodiePullBar  = document.getElementById('foodie-pull-bar');
const foodiePullIcon = document.getElementById('foodie-pull-icon');
const foodiePullText = document.getElementById('foodie-pull-text');
const postModal      = document.getElementById('post-modal');
const postBack       = document.getElementById('post-back');
const postTopbarName = document.getElementById('post-topbar-name');
const postMapsLink   = document.getElementById('post-maps-link');
const postGallery    = document.getElementById('post-gallery');
const postScroll     = document.getElementById('post-scroll');
const postAuthorRow  = document.getElementById('post-author-row');
const postFullText   = document.getElementById('post-full-text');
const postCommentsCount = document.getElementById('post-comments-count');
const postCommentsList  = document.getElementById('post-comments-list');

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

let currentView       = 'map-route';
let lastFoodiePlaces  = [];
let lastFoodiePosts   = [];
let leafletMap   = null;
let lastCenter   = null;
let lastPlaces   = [];
let lastSource   = null;
let markers      = [];
let carouselIdx  = 0;
let mapPanTimer  = null;
let gMapUpdTimer = null;

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
  highlightMapMarker(carouselIdx);
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
    const lat    = p.location?.latitude;
    const lng    = p.location?.longitude;
    activeName.textContent  = name;
    activeFill.style.width  = (rating / 5 * 100).toFixed(0) + '%';
    activeNum.textContent   = rating.toFixed(1);
    activeCount.textContent = count;
    activeLinks.innerHTML   = `<a class="place-link" href="${url}" target="_blank" rel="noopener">Google Maps &rarr;</a>`;
    if (lat && lng) {
      activeLinks.innerHTML += `<button class="route-btn" data-lat="${lat}" data-lng="${lng}" data-name="${escHtml(name)}">🗺️ Route</button>`;
    }
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
      + (wikiUrl ? `<a class="place-link" href="${wikiUrl}" target="_blank" rel="noopener">Wikipedia</a>` : '')
      + (lat && lng ? `<button class="route-btn" data-lat="${lat}" data-lng="${lng}" data-name="${escHtml(name)}">🗺️ Route</button>` : '');
  }

  // Wire up the route button injected above
  const routeBtn = activeLinks.querySelector('.route-btn');
  if (routeBtn) {
    routeBtn.addEventListener('click', () => {
      openRouteModal(+routeBtn.dataset.lat, +routeBtn.dataset.lng, routeBtn.dataset.name);
    });
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
  highlightMapMarker(carouselIdx);
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
  highlightMapMarker(carouselIdx);
});

// ── Fullscreen toggle ─────────────────────────────────────────────────────────
fullscreenBtn.addEventListener('click', () => {
  const isFs = carouselWrap.classList.toggle('is-fullscreen');
  fullscreenBtn.innerHTML   = isFs ? '&#x2715;' : '&#x2922;';
  fullscreenBtn.title       = isFs ? 'Exit full screen' : 'Full screen';
  document.body.style.overflow = isFs ? 'hidden' : '';
  setTimeout(() => updateCarousel(), 60);
});

// ── Route modal ───────────────────────────────────────────────────────────────
let routeMode     = 'driving';
let routeDestLat  = null;
let routeDestLng  = null;
let routeDestText = '';
let routeLeaflet  = null;
let routePolyline = null;
let routeOriginMk = null;
let routeDestMk   = null;

// OSRM profile per travel mode (transit falls back to driving)
const OSRM_PROFILE = { driving: 'driving', walking: 'foot', transit: 'driving' };

async function fetchAndDrawRoute() {
  if (!lastCenter || routeDestLat == null) return;
  routeInfoBar.textContent = 'Calculating route…';

  const profile = OSRM_PROFILE[routeMode];
  const url = `https://router.project-osrm.org/route/v1/${profile}/` +
    `${lastCenter.lng},${lastCenter.lat};${routeDestLng},${routeDestLat}` +
    `?overview=full&geometries=geojson`;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes.length) throw new Error('No route found');

    const coords   = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const routeMeta = data.routes[0];
    const distKm   = (routeMeta.distance / 1000).toFixed(1);
    const totalMin = Math.round(routeMeta.duration / 60);
    const timeStr  = totalMin >= 60
      ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
      : `${totalMin} min`;

    // Draw / redraw polyline
    if (routePolyline) routeLeaflet.removeLayer(routePolyline);
    routePolyline = L.polyline(coords, { color: '#e94560', weight: 5, opacity: 0.85 }).addTo(routeLeaflet);

    // Origin marker (A)
    if (routeOriginMk) routeLeaflet.removeLayer(routeOriginMk);
    routeOriginMk = L.marker([lastCenter.lat, lastCenter.lng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="background:#0f3460;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4)">A</div>',
        iconSize: [28, 28], iconAnchor: [14, 14],
      }),
    }).addTo(routeLeaflet).bindPopup('Your location');

    // Destination marker (B)
    if (routeDestMk) routeLeaflet.removeLayer(routeDestMk);
    routeDestMk = L.marker([routeDestLat, routeDestLng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="background:#e94560;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4)">B</div>',
        iconSize: [28, 28], iconAnchor: [14, 14],
      }),
    }).addTo(routeLeaflet).bindPopup(routeDestText).openPopup();

    routeLeaflet.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });

    const gmUrl = `https://www.google.com/maps/dir/${lastCenter.lat},${lastCenter.lng}/${routeDestLat},${routeDestLng}`;
    const modeNote = routeMode === 'transit' ? ' (driving — transit via ' : '';
    routeInfoBar.innerHTML = `📍 ${distKm} km · ⏱ ${timeStr}` +
      (routeMode === 'transit'
        ? ` &nbsp;·&nbsp; <a href="${gmUrl}" target="_blank" rel="noopener">Transit in Google Maps ↗</a>`
        : ` &nbsp;·&nbsp; <a href="${gmUrl}" target="_blank" rel="noopener">Open in Google Maps ↗</a>`);
  } catch {
    routeInfoBar.textContent = 'Could not calculate route. Try a different mode.';
  }
}

// dirflg codes for the no-key Google Maps iframe URL
const GMAP_DIRFLG = { driving: 'd', walking: 'w', transit: 'r' };

function routeZoomForDistance(lat1, lng1, lat2, lng2) {
  const km = haversineKm(lat1, lng1, lat2, lng2);
  if (km < 1)  return 15;
  if (km < 3)  return 14;
  if (km < 7)  return 13;
  if (km < 15) return 12;
  if (km < 30) return 11;
  return 10;
}

function loadGoogleRouteFrame() {
  const dirflg = GMAP_DIRFLG[routeMode] || 'd';
  const zoom   = routeZoomForDistance(lastCenter.lat, lastCenter.lng, routeDestLat, routeDestLng);
  const gmUrl  = `https://www.google.com/maps/dir/${lastCenter.lat},${lastCenter.lng}/${routeDestLat},${routeDestLng}`;
  routeFrame.src =
    `https://maps.google.com/maps?saddr=${lastCenter.lat},${lastCenter.lng}` +
    `&daddr=${routeDestLat},${routeDestLng}` +
    `&dirflg=${dirflg}&z=${zoom}&output=embed`;
  routeInfoBar.innerHTML =
    `<a href="${gmUrl}" target="_blank" rel="noopener">Open in Google Maps ↗</a>`;
}

function openRouteModal(destLat, destLng, destName) {
  routeDestLat  = destLat;
  routeDestLng  = destLng;
  routeDestText = destName;
  routeDestName.textContent = `Route to ${destName}`;
  routeModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (lastSource === 'google') {
    routeMapEl.style.display  = 'none';
    routeFrame.style.display  = 'block';
    loadGoogleRouteFrame();
  } else {
    routeFrame.style.display = 'none';
    routeMapEl.style.display = 'block';
    // Defer Leaflet init until the browser has laid out the modal container.
    setTimeout(() => {
      if (!routeLeaflet) {
        routeLeaflet = L.map(routeMapEl, { zoomControl: true })
          .setView([lastCenter.lat, lastCenter.lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(routeLeaflet);
      } else {
        routeLeaflet.invalidateSize();
      }
      fetchAndDrawRoute();
    }, 150);
  }
}

function closeRouteModal() {
  routeModal.classList.add('hidden');
  document.body.style.overflow = '';
}

routeClose.addEventListener('click', closeRouteModal);
routeModal.addEventListener('click', e => { if (e.target === routeModal) closeRouteModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRouteModal(); });

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    routeMode = btn.dataset.mode;
    modeBtns.forEach(b => b.classList.toggle('active', b === btn));
    if (lastSource === 'google') {
      loadGoogleRouteFrame();
    } else {
      fetchAndDrawRoute();
    }
  });
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
        const streetNumber = [a.house_number, a.road].filter(Boolean).join(' ');
        const label = [
          streetNumber || a.neighbourhood || a.suburb,
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
    { timeout: 30000, maximumAge: 60000, enableHighAccuracy: true }
  );
});

// ── View switcher ─────────────────────────────────────────────────────────────
viewTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    currentView = tab.dataset.view;
    viewTabs.forEach(t => t.classList.toggle('active', t === tab));
    const isMapRoute = currentView === 'map-route';
    mapSourceGroup.style.display = isMapRoute ? '' : 'none';
    // Reset results
    carouselWrap.classList.add('hidden');
    mapContainer.classList.add('hidden');
    foodieWrap.classList.add('hidden');
    setStatus('');
  });
});

// ── Foodie / RedNote renderer ─────────────────────────────────────────────────

function buildFoodiePosts(places) {
  const now  = Date.now();
  const posts = [];
  places.forEach(place => {
    const reviews = place.reviews || [];
    const photos  = place.photos  || [];
    reviews.forEach((review, ri) => {
      if (!review.text?.text) return;
      const photoRef = (photos[ri % Math.max(photos.length, 1)])?.name;
      const photoUrl = photoRef
        ? `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=400&key=${GAPI_KEY}`
        : '';
      const ts = new Date(review.publishTime || 0).getTime();
      // Mix popular (60%) and recent (40%): recency decays over ~12 months
      const ageMonths    = (now - ts) / (1000 * 60 * 60 * 24 * 30);
      const recencyScore = Math.max(0, 1 - ageMonths / 12);
      const score        = (review.rating || 0) / 5 * 0.6 + recencyScore * 0.4;
      posts.push({ place, review, photoUrl, ts, score });
    });
  });
  posts.sort((a, b) => b.score - a.score);
  return posts;
}

function rnStars(rating) {
  return '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
}

function renderFoodieCards(places, type, source) {
  lastFoodiePlaces = places;
  foodieTitle.textContent = TYPE_LABELS[type] || 'Top Places';

  if (source !== 'google') {
    foodieCount.textContent = `${places.length} place${places.length !== 1 ? 's' : ''}`;
    foodieList.innerHTML = places.map((p, i) => {
      const t       = p.tags;
      const name    = t.name || '';
      const cuisine = (t.cuisine || '').replace(/;/g, ' · ').replace(/_/g, ' ');
      const destLat = p.lat ?? p.center?.lat;
      const destLng = p.lon ?? p.center?.lon;
      return `<div class="rn-card rn-osm">
        <div class="rn-osm-rank">${i + 1}</div>
        <div class="rn-osm-body">
          <div class="rn-osm-name">${escHtml(name)}</div>
          ${cuisine ? `<div class="rn-osm-cuisine">${escHtml(cuisine)}</div>` : ''}
        </div>
        ${lastCenter ? `<button class="rn-route-btn" data-lat="${destLat}" data-lng="${destLng}" data-name="${escHtml(name)}">🗺️</button>` : ''}
      </div>`;
    }).join('');
    wireRouteButtons();
    foodieWrap.classList.remove('hidden');
    return;
  }

  lastFoodiePosts = buildFoodiePosts(places);
  renderPostCards(lastFoodiePosts);
  foodieWrap.classList.remove('hidden');
}

function renderPostCards(posts) {
  foodieList._posts = posts;   // store for click handler lookup
  foodieCount.textContent = `${posts.length} post${posts.length !== 1 ? 's' : ''}`;

  if (posts.length === 0) {
    foodieList.innerHTML = '<p class="rn-empty">No reviews with text found. Try a different area.</p>';
    wireRouteButtons();
    return;
  }

  foodieList.innerHTML = posts.map(({ place, review, photoUrl }) => {
    const name      = place.displayName?.text || '';
    const author    = review.authorAttribution?.displayName || 'Anonymous';
    const avatarUrl = review.authorAttribution?.photoUri || '';
    const rating    = review.rating || 0;
    const timeAgo   = review.relativePublishTimeDescription || '';
    const text      = review.text?.text || '';
    const destLat   = place.location.latitude;
    const destLng   = place.location.longitude;

    return `<div class="rn-card">
      <div class="rn-photo-wrap">
        ${photoUrl
          ? `<img class="rn-photo" src="${photoUrl}" alt="${escHtml(name)}" loading="lazy" onerror="this.closest('.rn-photo-wrap').classList.add('rn-no-photo')">`
          : ''}
        <div class="rn-photo-gradient"></div>
        <div class="rn-place-badge">${escHtml(name)}</div>
        ${lastCenter ? `<button class="rn-route-btn" data-lat="${destLat}" data-lng="${destLng}" data-name="${escHtml(name)}">🗺️ Route</button>` : ''}
      </div>
      <div class="rn-body">
        <p class="rn-text">${escHtml(text)}</p>
        <div class="rn-author-row">
          ${avatarUrl
            ? `<img class="rn-avatar" src="${avatarUrl}" alt="${escHtml(author)}" referrerpolicy="no-referrer">`
            : `<div class="rn-avatar rn-avatar-fallback">${escHtml(author[0] || '?')}</div>`}
          <span class="rn-author-name">${escHtml(author)}</span>
          <span class="rn-time">${escHtml(timeAgo)}</span>
          <span class="rn-rating" title="${rating} stars">${rnStars(rating)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  wireRouteButtons();
}

function wireRouteButtons() {
  foodieList.querySelectorAll('.rn-route-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openRouteModal(parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lng), btn.dataset.name);
    });
  });
}

// ── Post detail modal ─────────────────────────────────────────────────────────
function openPostModal(post) {
  const { place, review } = post;
  const name      = place.displayName?.text || '';
  const gmapsUrl  = place.googleMapsUri || '';
  const author    = review.authorAttribution?.displayName || 'Anonymous';
  const avatarUrl = review.authorAttribution?.photoUri   || '';
  const reviewerUri = review.authorAttribution?.uri      || '';
  const rating    = review.rating || 0;
  const timeAgo   = review.relativePublishTimeDescription || '';
  const text      = review.text?.text || '';

  // Header
  postTopbarName.textContent = name;
  postMapsLink.href = gmapsUrl;
  postMapsLink.style.display = gmapsUrl ? '' : 'none';

  // Photo gallery — reviewer's photos first, then the rest
  const allPhotos = place.photos || [];
  const reviewerPhotos = allPhotos.filter(ph =>
    ph.authorAttributions?.some(a => a.uri && reviewerUri && a.uri === reviewerUri)
  );
  const otherPhotos = allPhotos.filter(ph => !reviewerPhotos.includes(ph));
  const orderedPhotos = [...reviewerPhotos, ...otherPhotos];

  if (orderedPhotos.length === 0) {
    postGallery.innerHTML = `<div class="post-gallery-placeholder">🍽️</div>`;
  } else {
    postGallery.innerHTML = orderedPhotos.map((ph, i) => {
      const url = `https://places.googleapis.com/v1/${ph.name}/media?maxWidthPx=800&key=${GAPI_KEY}`;
      const photoAuthor = ph.authorAttributions?.[0]?.displayName || '';
      const isReviewer  = reviewerPhotos.includes(ph);
      return `<img class="post-gallery-photo" src="${url}" loading="${i < 3 ? 'eager' : 'lazy'}"
               alt="${escHtml(name)}" onerror="this.style.display='none'">`
           + (isReviewer && photoAuthor ? `<div class="post-gallery-author">📷 ${escHtml(photoAuthor)}</div>` : '');
    }).join('');
  }

  // Author row
  const avatarHtml = avatarUrl
    ? `<img class="post-avatar" src="${avatarUrl}" alt="${escHtml(author)}" referrerpolicy="no-referrer">`
    : `<div class="post-avatar-fallback">${escHtml(author[0] || '?')}</div>`;
  postAuthorRow.innerHTML = `
    ${avatarHtml}
    <div class="post-author-info">
      <div class="post-author-name">${escHtml(author)}</div>
      <div class="post-author-meta">
        <span class="post-author-stars">${rnStars(rating)}</span>
        &nbsp;·&nbsp; ${escHtml(timeAgo)}
      </div>
    </div>`;

  // Full review text
  postFullText.textContent = text;

  // Comments — all other reviews of the same place
  const comments = (place.reviews || []).filter(r =>
    r.authorAttribution?.displayName !== author ||
    r.relativePublishTimeDescription !== timeAgo
  );
  postCommentsCount.textContent = `Comments (${comments.length})`;

  if (comments.length === 0) {
    postCommentsList.innerHTML = '<p class="post-no-comments">No other reviews yet.</p>';
  } else {
    postCommentsList.innerHTML = comments.map(c => {
      const cAuthor  = c.authorAttribution?.displayName || 'Anonymous';
      const cAvatar  = c.authorAttribution?.photoUri    || '';
      const cRating  = c.rating || 0;
      const cTime    = c.relativePublishTimeDescription || '';
      const cText    = c.text?.text || '';
      const cAvHtml  = cAvatar
        ? `<img class="post-comment-avatar" src="${cAvatar}" alt="${escHtml(cAuthor)}" referrerpolicy="no-referrer">`
        : `<div class="post-comment-avatar-fallback">${escHtml(cAuthor[0] || '?')}</div>`;
      return `<div class="post-comment">
        ${cAvHtml}
        <div class="post-comment-body">
          <div class="post-comment-header">
            <span class="post-comment-name">${escHtml(cAuthor)}</span>
            <span class="post-comment-stars">${rnStars(cRating)}</span>
            <span class="post-comment-time">${escHtml(cTime)}</span>
          </div>
          ${cText ? `<div class="post-comment-text">${escHtml(cText)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  postScroll.scrollTop  = 0;
  postGallery.scrollLeft = 0;
  postModal.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closePostModal() {
  postModal.classList.remove('is-open');
  document.body.style.overflow = '';
}

postBack.addEventListener('click', closePostModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && postModal.classList.contains('is-open')) closePostModal();
});

// Card click — open post detail
document.addEventListener('click', e => {
  const card = e.target.closest('.rn-card:not(.rn-osm)');
  if (!card || e.target.closest('.rn-route-btn')) return;
  const idx  = [...foodieList.querySelectorAll('.rn-card:not(.rn-osm)')].indexOf(card);
  if (idx < 0) return;
  const renderedPosts = foodieList._posts;
  if (renderedPosts?.[idx]) openPostModal(renderedPosts[idx]);
});

// ── Pull-to-refresh at bottom (Foodie mode only) ──────────────────────────────
function isAtPageBottom() {
  return window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
}

function setPullState(state) {
  foodiePullBar.dataset.state = state;
  if (state === 'pulling') {
    foodiePullIcon.textContent = '↑';
    foodiePullText.textContent = 'Release to refresh';
  } else if (state === 'refreshing') {
    foodiePullIcon.textContent = '↻';
    foodiePullText.textContent = 'Loading new posts…';
  } else {
    foodiePullIcon.textContent = '↑';
    foodiePullText.textContent = 'Scroll up to refresh';
  }
}

let foodieRefreshRank = 'DISTANCE'; // alternate each refresh to vary results

async function doFoodieRefresh() {
  if (!lastCenter || foodiePullBar.dataset.state === 'refreshing') return;
  setPullState('refreshing');
  try {
    // Alternate DISTANCE / POPULARITY so each refresh hits a different ranking order
    const rank   = foodieRefreshRank;
    foodieRefreshRank = rank === 'DISTANCE' ? 'POPULARITY' : 'DISTANCE';

    const places = await fetchGooglePlaces(lastCenter, typeSelect.value, true, rank);
    lastFoodiePlaces = places;
    lastFoodiePosts  = buildFoodiePosts(places);
    renderPostCards(lastFoodiePosts);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    // keep existing posts on failure
  } finally {
    setPullState('idle');
  }
}

// Touch — fires on any scroll surface
let pullTouchY   = 0;
let pullWasAtBot = false;

document.addEventListener('touchstart', e => {
  if (currentView !== 'foodie') return;
  pullWasAtBot = isAtPageBottom();
  pullTouchY   = pullWasAtBot ? e.touches[0].clientY : 0;
}, { passive: true });

document.addEventListener('touchmove', e => {
  if (currentView !== 'foodie' || !pullWasAtBot) return;
  const dy = e.touches[0].clientY - pullTouchY; // negative = swiping up
  setPullState(dy < -20 ? 'pulling' : 'idle');
}, { passive: true });

document.addEventListener('touchend', e => {
  if (currentView !== 'foodie' || !pullWasAtBot) return;
  const dy = e.changedTouches[0].clientY - pullTouchY;
  pullWasAtBot = false;
  if (dy <= -80) { // swiped up 80px past the bottom
    doFoodieRefresh();
  } else {
    setPullState('idle');
  }
});

// Mouse wheel — accumulate overscroll at the bottom
let wheelAccum = 0;
let wheelTimer = null;
document.addEventListener('wheel', e => {
  if (currentView !== 'foodie' || !lastCenter || foodiePullBar.dataset.state === 'refreshing') {
    wheelAccum = 0;
    return;
  }
  if (!isAtPageBottom() || e.deltaY >= 0) { wheelAccum = 0; return; }
  wheelAccum += Math.abs(e.deltaY);
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { wheelAccum = 0; setPullState('idle'); }, 600);
  setPullState(wheelAccum > 40 ? 'pulling' : 'idle');
  if (wheelAccum >= 300) {
    wheelAccum = 0;
    doFoodieRefresh();
  }
}, { passive: true });

// ── Form submit ───────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = input.value.trim();
  const type    = typeSelect.value;
  const source  = mapSource.value;
  if (!address) return;

  setStatus('Locating address...');
  carouselWrap.classList.add('hidden');
  foodieWrap.classList.add('hidden');
  showLoading();
  form.querySelector('[type="submit"]').disabled = true;

  try {
    const center = await geocodeNominatim(address);
    setStatus('Fetching nearby places...');

    const places = source === 'google'
      ? await fetchGooglePlaces(center, type, currentView === 'foodie')
      : await fetchOsmPlaces(center, type);

    if (places.length === 0) {
      showError('😕 No places found nearby.\nTry a different address or type!');
      setStatus('No places found within 8 miles. Try a different address or type.', true);
      return;
    }

    lastCenter = center;
    lastPlaces = places;
    lastSource = source;

    setStatus(`Found ${places.length} place${places.length > 1 ? 's' : ''}`);

    if (currentView === 'foodie') {
      mapContainer.classList.add('hidden');
      renderFoodieCards(places, type, source);
    } else {
      panelTitle.textContent = TYPE_LABELS[type] || 'Top Places';
      source === 'google' ? renderGoogleCards(places, type) : renderOsmCards(places);
      carouselIdx = 0;
      carouselWrap.classList.remove('hidden');
      setTimeout(() => updateCarousel(true), 30);
      source === 'google' ? renderGoogleMap(center, places) : renderLeaflet(center, places);
    }
  } catch (err) {
    showError(err.message);
    setStatus(err.message, true);
  } finally {
    form.querySelector('[type="submit"]').disabled = false;
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

function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
             * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Strip location qualifiers like "Name - City" or "Name (Downtown)" to get the brand name.
function brandKey(name) {
  return name
    .replace(/\s*[-–—]\s*.+$/, '')   // "Foo - Santa Clara" → "Foo"
    .replace(/\s*\([^)]*\)\s*$/, '')  // "Foo (Downtown)" → "Foo"
    .toLowerCase()
    .trim();
}

// Among places with the same brand name, keep the one closest to center.
function deduplicateByName(places, getName, getLat, getLng, center) {
  const seen = new Map();
  for (const p of places) {
    const key = brandKey(getName(p));
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, p);
    } else {
      const prev = seen.get(key);
      const dPrev = haversineKm(center.lat, center.lng, getLat(prev), getLng(prev));
      const dCurr = haversineKm(center.lat, center.lng, getLat(p),    getLng(p));
      if (dCurr < dPrev) seen.set(key, p);
    }
  }
  return [...seen.values()];
}

// ── Google Places (New HTTP API) ──────────────────────────────────────────────
const GAPI_KEY = 'AIzaSyBvQza0NnKLqOXtNvYOs1-lcPXT6ghWCXM';
const FOOD_TYPES = new Set([
  'asian_restaurant', 'chinese_restaurant', 'thai_restaurant',
  'japanese_restaurant', 'vietnamese_restaurant', 'korean_restaurant',
]);

async function fetchGooglePlaces(center, type, withReviews = false, rankPreference = 'POPULARITY') {
  const baseFields = 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.googleMapsUri,places.photos.name,places.photos.authorAttributions';
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GAPI_KEY,
      'X-Goog-FieldMask': withReviews ? baseFields + ',places.reviews' : baseFields,
    },
    body: JSON.stringify({
      includedTypes: [type],
      maxResultCount: 20,
      locationRestriction: {
        circle: { center: { latitude: center.lat, longitude: center.lng }, radius: RADIUS_M },
      },
      rankPreference,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || res.statusText;
    throw new Error(`Google Places error (${res.status}): ${msg}`);
  }
  const data = await res.json();
  const sorted = (data.places || [])
    .filter(p => p.rating != null && p.userRatingCount != null)
    .sort((a, b) => placeScore(b) - placeScore(a));
  return deduplicateByName(
    sorted,
    p => p.displayName?.text || '',
    p => p.location.latitude,
    p => p.location.longitude,
    center,
  );
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
  const sorted = data.elements
    .filter(el => el.tags?.name && (el.lat ?? el.center?.lat))
    .map(p => ({ ...p, _score: osmScore(p) }))
    .sort((a, b) => b._score - a._score);
  return deduplicateByName(
    sorted,
    p => p.tags.name,
    p => p.lat ?? p.center?.lat,
    p => p.lon ?? p.center?.lon,
    center,
  );
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
      highlightMapMarker(i);
    });
  });
}

// ── Map marker helpers ────────────────────────────────────────────────────────
function makeMarkerIcon(rank, isActive) {
  const bg   = isActive ? '#e94560' : '#1a1a2e';
  const size = isActive ? 34 : 26;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${bg};color:#fff;border-radius:50%;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:${isActive ? 12 : 10}px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.45)">${rank}</div>`,
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

function highlightMapMarker(idx) {
  if (leafletMap && markers.length) {
    markers.forEach((m, i) => m.setIcon(makeMarkerIcon(i + 1, i === idx)));
    clearTimeout(mapPanTimer);
    mapPanTimer = setTimeout(() => {
      const active = markers[idx];
      if (active) {
        leafletMap.panTo(active.getLatLng(), { animate: true, duration: 0.4 });
        active.openPopup();
      }
    }, 150);
    return;
  }
  if (lastSource === 'google' && lastPlaces.length) {
    clearTimeout(gMapUpdTimer);
    const isScrubbing = placesList.classList.contains('is-scrubbing');
    const delay = isScrubbing ? 400 : 0;
    gMapUpdTimer = setTimeout(() => {
      const p   = lastPlaces[idx];
      if (!p) return;
      const lat  = p.location?.latitude  ?? p.lat ?? p.center?.lat;
      const lng  = p.location?.longitude ?? p.lon ?? p.center?.lon;
      const name = p.displayName?.text || p.tags?.name || '';
      if (lat && lng) {
        gmapFrame.src = `https://www.google.com/maps?q=${encodeURIComponent(name)}&ll=${lat},${lng}&z=16&output=embed`;
      }
    }, delay);
  }
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
    const marker = L.marker([lat, lng], { icon: makeMarkerIcon(i + 1, false) }).addTo(leafletMap)
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
