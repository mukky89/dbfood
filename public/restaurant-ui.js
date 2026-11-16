let restaurantContext = null;
function applyRestaurant(data) {
  const changed = restaurantContext?.key !== data.key;
  restaurantContext = data;
  const r = data.restaurant;
  document.title = r.name + ' · Objednávky obedov';
  document.querySelectorAll('[data-restaurant-name], .hdr-brand, .phone-btn-label').forEach(el => { el.textContent = r.name; });
  document.getElementById('restaurant-today').textContent = 'Dnes sa objednáva z: ' + r.name;
  document.getElementById('phone-dropdown').innerHTML = '<div class="phone-drop-title">📞 ' + esc(r.name) + '</div>' +
    r.phones.map(p => '<a class="phone-item" href="tel:' + p.replace(/[^+0-9]/g, '') + '">📱 ' + esc(p) + '</a>').join('') +
    '<div class="phone-drop-addr">' + esc(r.address) + '</div><a class="phone-item" target="_blank" rel="noopener" href="' + esc(r.url) + '">Otvoriť web jedálne ↗</a>';
  const select = document.getElementById('restaurant-select');
  if (!select.options.length) select.innerHTML = data.restaurants.map(item => '<option value="' + item.id + '">' + esc(item.name) + '</option>').join('');
  if (changed) select.value = r.id;
  document.getElementById('restaurant-source').href = r.url;
  document.getElementById('restaurant-source').textContent = 'Menu a kontakty: ' + r.name;
}
async function loadRestaurant(refreshMenu = false) {
  try {
    const response = await fetch('/api/restaurant', { cache: 'no-store' }), data = await response.json();
    if (!data.ok) return;
    const changed = restaurantContext && restaurantContext.key !== data.key;
    applyRestaurant(data);
    if (changed && refreshMenu) {
      menuData = null; currentQROrder = null; isEditMode = false;
      document.getElementById('menu-content').innerHTML = '';
      document.getElementById('price-calculator').style.display = 'none';
      await loadMenu();
      showToast('Jedáleň sa zmenila. Vyber si z aktuálneho menu.', 'info');
    }
  } catch (_) { /* Pri výpadku nič neprepíname; server overí menuKey pri objednávke. */ }
}
async function saveRestaurant() {
  const button = document.getElementById('restaurant-save'); button.disabled = true;
  try {
    const response = await fetch('/api/admin/restaurant', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPass: adminPassword, restaurantId: document.getElementById('restaurant-select').value }) });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Jedáleň sa nepodarilo uložiť');
    applyRestaurant(data); menuData = null; await loadMenu();
    showToast('Jedáleň uložená: ' + data.restaurant.name, 'success');
  } catch (e) { showToast(e.message, 'error'); await loadRestaurant(); }
  finally { button.disabled = false; }
}
async function importRestaurantHtml(input) {
  try {
    const file = input.files[0]; if (!file) return;
    if (file.size > 550000) throw new Error('HTML súbor je príliš veľký (max. 550 kB)');
    const response = await fetch('/api/admin/menu-import', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPass: adminPassword, html: await file.text() }) });
    const data = await response.json(); if (!data.ok) throw new Error(data.error);
    await loadMenu(); showToast('Dnešné menu bolo importované', 'success');
  } catch (e) { showToast(e.message, 'error'); }
  finally { input.value = ''; }
}
async function diagnoseRestaurant() {
  const output = document.getElementById('restaurant-diagnostic'); output.textContent = 'Overujem zdroj...';
  try {
    const response = await fetch('/api/admin/menu-debug?adminPass=' + encodeURIComponent(adminPassword));
    const data = await response.json();
    output.textContent = data.ok ? 'Menu je dostupné. Dátumy v zdroji: ' + (data.availableDates || []).join(', ')
      : 'Menu sa nepodarilo automaticky načítať. HTTP ' + (data.httpStatus || '—') + '. ' + (data.error || 'Dnešný dátum sa v menu nenašiel.');
  } catch (_) { output.textContent = 'Zdroj sa nepodarilo overiť.'; }
}
