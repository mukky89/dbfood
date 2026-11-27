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
function chartElement(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function showLunchCharts(data) {
  const months = data.months || [];
  const monthChart = document.getElementById('monthly-chart');
  const monthBars = document.getElementById('month-bars');
  const monthName = new Intl.DateTimeFormat('sk-SK', { month: 'short', timeZone: 'UTC' });
  function drawMonths(metric) {
    const byPrice = metric === 'cents';
    const peak = Math.max(1, ...months.map(row => row[metric]));
    monthBars.setAttribute('aria-label', byPrice ? 'Odhadovaná hodnota objednávok podľa mesiaca v eurách' : 'Počet objednávok podľa mesiaca');
    monthBars.classList.toggle('is-price', byPrice);
    monthBars.replaceChildren(...months.map((row, i) => {
      const date = new Date(row.month + '-01T12:00:00Z');
      const item = chartElement('li', 'chart-month');
      const plot = chartElement('div', 'month-plot');
      const bar = chartElement('div', 'month-bar');
      bar.style.height = (row[metric] / peak * 100) + '%';
      bar.style.setProperty('--delay', Math.min(i, 12) * 35 + 'ms');
      const value = byPrice ? (row.pricedOrders ? euro(row.cents) : '—') : statNumber.format(row.orders);
      const label = chartElement('time', 'month-label', monthName.format(date));
      label.dateTime = row.month;
      label.append(chartElement('small', 'month-year', String(date.getUTCFullYear())));
      const number = chartElement('span', 'bar-number', value);
      number.style.bottom = bar.style.height;
      plot.append(bar, number);
      item.append(label, plot);
      return item;
    }));
    monthChart.querySelectorAll('[data-metric]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.metric === metric));
    });
  }
  if (months.length) {
    monthChart.hidden = false;
    drawMonths('orders');
    monthChart.querySelectorAll('[data-metric]').forEach(button => {
      button.onclick = () => drawMonths(button.dataset.metric);
    });
  }
  const dishes = data.topDishes || [];
  const dishChart = document.getElementById('dishes-chart');
  if (dishes.length) {
    dishChart.hidden = false;
    document.getElementById('dish-bars').replaceChildren(...dishes.map((dish, i) => {
      const item = chartElement('li', 'dish-row');
      const name = chartElement('span', 'dish-name', dish.name);
      const value = chartElement('strong', 'dish-value', statNumber.format(dish.value));
      const track = chartElement('div', 'dish-track');
      const bar = chartElement('div', 'dish-bar');
      bar.style.width = (100 * dish.value / dishes[0].value) + '%';
      bar.style.setProperty('--delay', i * 65 + 'ms');
      track.append(bar);
      item.append(name, value, track);
      return item;
    }));
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    }, { threshold: .12 });
    [monthChart, dishChart].filter(chart => !chart.hidden).forEach(chart => observer.observe(chart));
  }
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
    showLunchCharts(data);
  } catch {
    status.textContent = 'Históriu sa nepodarilo načítať. ';
    const retry = document.createElement('button');
    retry.textContent = 'Skúsiť znova';
    retry.addEventListener('click', () => { status.textContent = 'Načítavam…'; loadLunchStatistics(); }, { once: true });
    status.append(retry);
  }
}
loadLunchStatistics();
