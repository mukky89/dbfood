(function () {
  'use strict';
  function weatherInfo(code) {
    const map = {
      0:  ['☀️','Jasno'],
      1:  ['🌤️','Prevažne jasno'],
      2:  ['⛅','Polojasno'],
      3:  ['☁️','Zamračené'],
      45: ['🌫️','Hmla'],
      48: ['🌫️','Mrznúca hmla'],
      51: ['🌦️','Mrholenie'],
      53: ['🌦️','Mrholenie'],
      55: ['🌦️','Silné mrholenie'],
      56: ['🌧️','Mrznúce mrholenie'],
      57: ['🌧️','Mrznúce mrholenie'],
      61: ['🌧️','Slabý dážď'],
      63: ['🌧️','Dážď'],
      65: ['🌧️','Silný dážď'],
      66: ['🌧️','Mrznúci dážď'],
      67: ['🌧️','Mrznúci dážď'],
      71: ['🌨️','Slabé sneženie'],
      73: ['🌨️','Sneženie'],
      75: ['🌨️','Silné sneženie'],
      77: ['🌨️','Snehové zrná'],
      80: ['🌦️','Prehánky'],
      81: ['🌦️','Prehánky'],
      82: ['🌧️','Silné prehánky'],
      85: ['🌨️','Snehové prehánky'],
      86: ['🌨️','Snehové prehánky'],
      95: ['⛈️','Búrka'],
      96: ['⛈️','Búrka s krupobitím'],
      99: ['⛈️','Búrka s krupobitím'],
    };
    return map[code] || ['🌡️','—'];
  }

  const URL = 'https://api.open-meteo.com/v1/forecast?latitude=48.155&longitude=17.155'
    + '&current=temperature_2m,weather_code&timezone=Europe/Bratislava';
  const REFRESH_MS = 15 * 60 * 1000, RETRY_MS = 60 * 1000, TIMEOUT_MS = 8000;
  let pending = false, timer = null, lastReading = null;
  let widget, icon, temperature, description;

  async function loadWeather() {
    if (pending) return;
    clearTimeout(timer);
    pending = true;
    widget.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let next = REFRESH_MS;
    try {
      const response = await fetch(URL, { signal: controller.signal });
      if (!response.ok) throw new Error('Weather HTTP ' + response.status);
      const data = await response.json(), current = data && data.current;
      if (!current || !Number.isFinite(current.temperature_2m) || !Number.isInteger(current.weather_code)) {
        throw new Error('Invalid weather response');
      }
      const [emoji, text] = weatherInfo(current.weather_code);
      const value = Math.round(current.temperature_2m) + '°C';
      icon.textContent = emoji;
      temperature.textContent = value;
      if (description) description.textContent = text;
      lastReading = { value, text, at: new Date().toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' }) };
      widget.dataset.weatherState = 'ready';
      widget.title = `Bratislava Ružinov: ${value}, ${text}. Aktualizované o ${lastReading.at}. Kliknutím obnoviť.`;
      widget.setAttribute('aria-label', widget.title);
    } catch (_) {
      next = RETRY_MS;
      widget.dataset.weatherState = lastReading ? 'stale' : 'unavailable';
      if (lastReading) {
        if (description) description.textContent = 'Neaktuálne';
        widget.title = `Počasie sa nepodarilo obnoviť. Posledný údaj: ${lastReading.value}, ${lastReading.text}, načítané o ${lastReading.at}. Kliknutím skúsiť znova.`;
      } else {
        icon.textContent = '🌡️';
        temperature.textContent = '–°C';
        if (description) description.textContent = 'Nedostupné';
        widget.title = 'Počasie pre Bratislavu Ružinov je dočasne nedostupné. Kliknutím skúsiť znova.';
      }
      widget.setAttribute('aria-label', widget.title);
    } finally {
      clearTimeout(timeout);
      pending = false;
      widget.setAttribute('aria-busy', 'false');
      timer = setTimeout(loadWeather, next);
    }
  }

  function init() {
    widget = document.getElementById('hdr-weather');
    icon = document.getElementById('hw-icon');
    temperature = document.getElementById('hw-temp');
    description = document.getElementById('hw-desc');
    if (!widget || !icon || !temperature) return;
    widget.addEventListener('click', loadWeather);
    window.addEventListener('online', loadWeather);
    loadWeather();
  }
  // Independent of login, menu, database calls and the admin early return.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
