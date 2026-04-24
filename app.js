const form   = document.getElementById('search-form');
const input  = document.getElementById('address-input');
const status = document.getElementById('status');

form.addEventListener('submit', function (e) {
  e.preventDefault();
  const address = input.value.trim();
  if (!address) {
    status.textContent = 'Please enter an address.';
    return;
  }
  status.textContent = '';
  const query = 'tourist attractions near ' + address;
  const url   = 'https://www.google.com/maps/search/' + encodeURIComponent(query);
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    status.textContent = 'Popup was blocked — please allow popups for this site.';
  }
});
