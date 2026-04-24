const form      = document.getElementById('search-form');
const input     = document.getElementById('address-input');
const status    = document.getElementById('status');
const mapContainer = document.getElementById('map-container');
const mapFrame  = document.getElementById('map-frame');

form.addEventListener('submit', function (e) {
  e.preventDefault();
  const address = input.value.trim();
  if (!address) {
    status.textContent = 'Please enter an address.';
    return;
  }
  status.textContent = '';
  const query = 'tourist attractions near ' + address;
  const url = 'https://www.google.com/maps?q=' + encodeURIComponent(query) + '&output=embed';
  mapFrame.src = url;
  mapContainer.classList.add('visible');
  mapContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
