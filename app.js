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
  window.location.href = url;
});
