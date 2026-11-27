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
function showPeopleChart(chart, people) {
  if (!people.length) return;
  chart.hidden = false;
  const list = document.getElementById('people-list');
  const expand = document.getElementById('people-expand');
  const buttons = chart.querySelectorAll('[data-sort]');
  const visibleLimit = 5;
  const entries = new Map();
  let metric = 'portions';
  let expanded = false;

  function draw() {
    const byPrice = metric === 'cents';
    const sorted = people.filter(person => person[metric] !== null)
      .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name, 'sk'));
    const previous = new Map();
    for (const [person, el] of entries) previous.set(person, el.getBoundingClientRect().top);
    entries.clear();
    const visible = expanded ? sorted : sorted.slice(0, visibleLimit);
    let rank = 0;
    list.replaceChildren(...visible.map((person, i) => {
      if (!i || sorted[i - 1][metric] !== person[metric]) rank = i + 1;
      const row = chartElement('li', 'person-row');
      const place = chartElement('span', 'person-place', rank + '.');
      const name = chartElement('span', 'person-name', person.name);
      const amount = person[metric];
      const quantity = amount === 1 ? ' porcia' : amount < 5 ? ' porcie' : ' porcií';
      const value = chartElement('strong', 'person-value', byPrice ? euro(amount) : statNumber.format(amount) + quantity);
      const track = chartElement('div', 'dish-track');
      const bar = chartElement('div', 'dish-bar');
      bar.style.width = 100 * amount / sorted[0][metric] + '%';
      bar.style.setProperty('--delay', Math.min(i, 5) * 40 + 'ms');
      track.append(bar);
      row.append(place, name, value, track);
      entries.set(person, row);
      return row;
    }));
    list.setAttribute('aria-label', byPrice ? 'Poradie podľa odhadovanej útraty' : 'Poradie podľa počtu porcií');
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sort === metric)));
    document.getElementById('people-empty').hidden = sorted.length > 0;
    expand.hidden = sorted.length <= visibleLimit;
    expand.setAttribute('aria-expanded', String(expanded));
    expand.textContent = expanded ? 'Zobraziť prvých päť' : 'Zobraziť celý rebríček (' + sorted.length + ')';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [person, row] of entries) {
      if (!previous.has(person)) continue;
      const offset = previous.get(person) - row.getBoundingClientRect().top;
      if (offset) row.animate([{ transform: 'translateY(' + offset + 'px)' }, { transform: 'translateY(0)' }],
        { duration: 400, easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
  }
  buttons.forEach(button => {
    button.onclick = () => {
      if (button.dataset.sort === metric) return;
      metric = button.dataset.sort;
      draw();
    };
  });
  expand.onclick = () => { expanded = !expanded; draw(); };
  draw();
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
  const peopleChart = document.getElementById('rebricek');
  showPeopleChart(peopleChart, data.people || []);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    }, { threshold: .12 });
    [monthChart, dishChart, peopleChart].filter(chart => !chart.hidden).forEach(chart => observer.observe(chart));
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
    document.getElementById('runner-trips').textContent = statNumber.format(data.days);
    document.getElementById('runner-payments').textContent = statNumber.format(data.days);
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
