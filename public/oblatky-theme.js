// Pri návrate z obchodu skontroluj, či administrátor medzičasom nezmenil režim.
window.addEventListener('pageshow', event => {
  if (event.persisted && ['/', '/index.html'].includes(location.pathname)) location.reload();
});

const statNumber = new Intl.NumberFormat('sk-SK');
const statMoney = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });
const euro = cents => statMoney.format(cents / 100);
function showLeader(id, leader, format) {
  const target = document.getElementById('stat-' + id);
  if (!leader) { target.textContent = 'Bez údajov'; return; }
  const extra = leader.count - leader.names.length;
  const names = leader.names.join(', ') + (extra ? ' a ďalší (' + extra + ')' : '');
  target.textContent = names + ' · ' + format(leader.value);
}
async function loadLunchStatistics() {
  const status = document.getElementById('stats-status');
  try {
    const response = await fetch('/api/lunch-statistics');
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (!data.orders) {
      status.textContent = 'V histórii zatiaľ nie sú žiadne obedové objednávky.';
      return;
    }
    document.getElementById('stat-orders').textContent = statNumber.format(data.orders);
    document.getElementById('stat-portions').textContent = statNumber.format(data.portions);
    document.getElementById('stat-cents').textContent = data.pricedOrders ? euro(data.cents) : 'Bez údajov';
    document.getElementById('stat-average').textContent = data.pricedPortions ? euro(data.cents / data.pricedPortions) : 'Bez údajov';
    const portions = n => n + (n === 1 ? ' porcia' : n < 5 ? ' porcie' : ' porcií');
    showLeader('favourite', data.favourite, portions);
    showLeader('buyer', data.buyer, portions);
    showLeader('regular', data.regular, n => n + (n === 1 ? ' objednávka' : n < 5 ? ' objednávky' : ' objednávok'));
    showLeader('spender', data.spender, euro);
    status.textContent = 'Počet dní s uloženými objednávkami: ' + data.days;
    document.getElementById('stats-note').textContent =
      '* Odhad podľa uložených jedálnych lístkov a základného cenníka Fantozzi. ' +
      'Cenu sme vedeli vyčísliť pri ' + data.pricedOrders + ' z ' + data.orders +
      ' objednávok. Skutočné platby história neeviduje.';
    document.getElementById('stats-results').hidden = false;
  } catch {
    status.textContent = 'Históriu sa nepodarilo načítať. ';
    const retry = document.createElement('button');
    retry.textContent = 'Skúsiť znova';
    retry.addEventListener('click', () => { status.textContent = 'Načítavam…'; loadLunchStatistics(); }, { once: true });
    status.append(retry);
  }
}
loadLunchStatistics();
