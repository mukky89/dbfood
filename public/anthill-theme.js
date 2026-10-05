(function () {
  "use strict";
  if (!window.Anthill || !window.ColonyRenderer || !window.ColonyChallenge)
    return;
  const { Game, FOODS, ROOMS, ROLES, SLOTS, dist, clamp } = Anthill;
  const { Challenge, STEP, DURATION, TOTAL_STEPS, TARGET_DELIVERED } =
    ColonyChallenge;
  const KEY = "fob_anthill_v1",
    RUN_KEY = "fob_colony_run_v1";
  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };
  const saved = read(KEY),
    sandbox = new Game(saved),
    reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!saved) {
    sandbox.s.ants.forEach((a, i) =>
      Object.assign(a, {
        x: SLOTS[i % 4].x + (Math.floor(i / 4) - 1) * 18,
        y: SLOTS[i % 4].y + ((i % 3) - 1) * 8,
      }),
    );
    for (const [type, x] of [
      ["fruit", 550],
      ["seed", 240],
      ["water", 880],
    ]) {
      sandbox.s.cooldown = 0;
      sandbox.addFood(type, x);
    }
    sandbox.s.cooldown = 0;
  }
  if (sandbox.s.settings.static) {
    sandbox.s.settings.paused = true;
    sandbox.s.settings.static = false;
  }
  let mode = "sandbox",
    challenge = null,
    run = null,
    runClaimed = false,
    submitted = false,
    dailyPaused = false,
    finishing = false;
  let active = false,
    ambient = false,
    raf = 0,
    last = 0,
    lastDraw = 0,
    accumulator = 0,
    uiTime = 0,
    saveTime = 0;
  let zoom = 1,
    pan = { x: 0, y: 0 },
    transform = { x: 0, y: 0, scale: 1 },
    pointer = null,
    hover = null,
    guide = [];
  let tool = "observe",
    selected = { kind: "room", id: 3 },
    speed = 1,
    originFocus = null,
    period = "day",
    requestId = 0,
    starting = false,
    submitting = false;
  let lastMessage = "",
    oldTheme = document.documentElement.classList.contains("theme-anthill");
  const bg = document.createElement("canvas");
  bg.id = "ant-background";
  bg.setAttribute("aria-hidden", "true");
  bg.hidden = true;
  const dock = document.createElement("details");
  dock.id = "ant-dock";
  dock.innerHTML =
    '<summary>🐜 Mravenisko</summary><p>Malý svet pod povrchom.</p><span id="ant-dock-stats"></span><div class="ant-dock-actions"><button type="button" data-action="open">Otvoriť kolóniu</button><button type="button" data-action="pause">Pauza</button><button type="button" data-action="hide">Skryť</button></div>';
  const dialog = document.createElement("dialog");
  dialog.id = "ant-game";
  dialog.className = "ant-terrarium";
  dialog.setAttribute("aria-labelledby", "ant-title");
  dialog.innerHTML = `
  <div class="ant-top"><div class="ant-brand"><span aria-hidden="true">❧</span> dbfood <span class="ant-divider">/</span> mravenisko</div><div class="ant-mode" aria-label="Herný režim"><button type="button" data-mode="sandbox" aria-pressed="true">Moja kolónia</button><button type="button" data-mode="daily" aria-pressed="false">Denná výzva</button></div><button type="button" data-action="close" autofocus>Späť k obedom ↗</button></div>
  <div class="ant-heading"><div><h2 id="ant-title">Tvoja kolónia</h2><p id="ant-subtitle">Malý svet pod povrchom.</p></div><div id="ant-metrics" class="ant-metrics"><span>Mravce <b id="ant-population"></b></span><span>Potrava <b id="ant-food-count"></b></span><span>Voda <b id="ant-water-count"></b></span><span id="ant-time-label">Deň <b id="ant-day"></b></span></div><button type="button" data-action="scoreboard" class="ant-mobile-board" aria-expanded="false">Rebríček ↓</button></div>
  <div class="ant-layout"><div class="ant-playarea"><div class="ant-world"><canvas id="ant-canvas" tabindex="0" aria-label="Živé pieskové mravenisko s kráľovnou, potravou a robotnicami" aria-describedby="ant-help"></canvas><div class="ant-scene-label">ŽIVÉ TERÁRIUM <span id="ant-world-state">SANDBOX</span></div><div class="ant-camera"><button type="button" data-action="zoom-out" aria-label="Oddialiť">−</button><span id="ant-zoom">100 %</span><button type="button" data-action="zoom-in" aria-label="Priblížiť">+</button><button type="button" data-action="center">Celý svet</button></div><div id="ant-daily-intro" class="ant-overlay" hidden><div><span class="ant-eyebrow">ROVNAKÝ SVET PRE VŠETKÝCH</span><h3>Tri minúty pre kolóniu</h3><p>Doruč 40 zásob. Máš šesť porcií potravy či vody navyše a rovnakú štartovaciu kolóniu ako ostatní.</p><p class="ant-note">Jedlo: 10 bodov · voda: 5 bodov · misia: +250. Body pribudnú až po doručení.</p><button type="button" data-action="start-daily" class="ant-primary">Spustiť dennú výzvu</button><p id="ant-start-status" role="status"></p></div></div></div>
  <div class="ant-toolbar" aria-label="Nástroje kolónie"><button type="button" data-tool="food" aria-pressed="false">◒ Pridať jedlo</button><button type="button" data-tool="water" aria-pressed="false">♧ Kvapka vody</button><button type="button" data-tool="build" aria-pressed="false">⌁ Kopať komoru</button><button type="button" data-tool="observe" aria-pressed="true">⌕ Pozorovať</button><button type="button" data-tool="guide" aria-pressed="false">∿ Stopa</button><button type="button" data-action="pause" aria-pressed="false">Pauza</button><label class="ant-speed"><span class="ant-sr-only">Rýchlosť</span><select id="ant-speed"><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option></select></label></div>
  <div id="ant-tool-options" class="ant-tool-options" hidden><label id="ant-food-option">Druh potravy <select id="ant-food-type"><option value="fruit">Kúsok ovocia</option><option value="bread">Omrvinky</option><option value="seed">Semienka</option></select></label><label id="ant-room-option" hidden>Nová komora <select id="ant-room-type"></select></label><span id="ant-tool-instruction"></span><button type="button" data-action="place" id="ant-place">Položiť na označené miesto</button></div>
  <div class="ant-play-footer"><p id="ant-status" role="status" aria-live="polite">Polož na povrch jedlo a sleduj zberačky.</p><label><input type="checkbox" id="ant-paths"> Zobraziť stopy</label></div><details class="ant-help"><summary>Ovládanie a pravidlá</summary><p id="ant-help">Jedlo a vodu polož na povrch. Kopanie začni na označenom voľnom mieste. V režime Pozorovať klikni na mravca alebo komoru; potiahnutím posunieš pohľad. Koliesko alebo + a − približuje. Šípky na mape posúvajú pohľad alebo miesto nástroja, Enter nástroj použije a Escape ho zruší. Pri odchode z karty sa hra pozastaví.</p><p>Denná výzva trvá 3 minúty. Do rebríčka patrí najlepší výsledok za deň, týždeň sčíta denné maximá. Sandbox sa do rebríčka nezapisuje.</p></details></div>
  <aside class="ant-sidebar" aria-label="Rebríček a stav kolónie"><section class="ant-scoreboard"><div class="ant-section-title"><h3>Scoreboard</h3><span aria-hidden="true">♜</span></div><p class="ant-note">Najlepšie výpravy kolónie</p><div class="ant-period" aria-label="Obdobie rebríčka"><button type="button" data-period="day" aria-pressed="true">Dnes</button><button type="button" data-period="week" aria-pressed="false">Týždeň</button></div><ol id="ant-ranks"></ol><p id="ant-board-status" role="status">Načítavam výsledky…</p><p id="ant-best" class="ant-note"></p><button type="button" data-action="refresh-board" class="ant-text-button">Obnoviť výsledky</button></section>
  <section class="ant-queen-card"><div class="ant-section-title"><h3>Kráľovná</h3><button type="button" data-action="queen" aria-label="Priblížiť kráľovnú">⌕</button></div><canvas id="ant-queen-portrait" width="500" height="200" role="img" aria-label="Detail kráľovnej"></canvas><p id="ant-queen-state"></p></section>
  <section class="ant-objective"><h3>Nakŕm kolóniu</h3><div class="ant-objective-total"><strong id="ant-delivered">0</strong><span>/ 40 zásob</span></div><progress id="ant-progress" max="40" value="0" aria-label="Doručené zásoby"></progress><p id="ant-objective-note" class="ant-note"></p><div id="ant-run-result" hidden><p id="ant-result-message" role="status"></p><button type="button" data-action="submit" class="ant-primary">Uložiť výsledok</button><button type="button" data-action="new-run">Nový pokus</button></div></section>
  <section class="ant-detail"><h3 id="ant-detail-title">Pod lupou</h3><p id="ant-detail-body"></p><label for="ant-inspect">Vybrať komoru</label><select id="ant-inspect"></select><button type="button" data-action="inspect">Priblížiť výber</button></section></aside></div><div class="ant-bottom"><span>Malé bytosti, veľké príbehy.</span><span id="ant-save-note">Kolónia sa ukladá na tomto zariadení.</span></div>`;
  document.body.append(bg, dock, dialog);
  const $ = (id) => document.getElementById("ant-" + id),
    canvas = $("canvas"),
    ctx = canvas.getContext("2d"),
    bgctx = bg.getContext("2d");
  if (!ctx || !bgctx) {
    bg.remove();
    dock.remove();
    dialog.remove();
    return;
  }
  for (const [key, r] of Object.entries(ROOMS)) {
    const o = new Option(r.name + " · " + r.cost + " jedla", key);
    $("room-type").append(o);
  }
  const current = () =>
    mode === "daily" && challenge ? challenge.game : sandbox;
  const fmt = (n) => Math.floor(n).toLocaleString("sk-SK");
  const clock = (n) =>
    String(Math.floor(n / 60)).padStart(2, "0") +
    ":" +
    String(Math.floor(n % 60)).padStart(2, "0");
  function message(text) {
    if (text !== lastMessage) {
      $("status").textContent = text;
      lastMessage = text;
    }
  }
  function storedRun(storage) {
    try {
      return JSON.parse(window[storage].getItem(RUN_KEY));
    } catch (_) {
      return null;
    }
  }
  function clearRunCheckpoint(id) {
    if (!id) return;
    for (const storage of ["sessionStorage", "localStorage"]) {
      try {
        if (storedRun(storage)?.run?.id === id)
          window[storage].removeItem(RUN_KEY);
      } catch (_) {}
    }
  }
  function persist({ replaceGlobal = false } = {}) {
    try {
      localStorage.setItem(KEY, sandbox.serialize());
    } catch (_) {
      $("save-note").textContent =
        "Úložisko nie je dostupné. Kolónia žije do zatvorenia stránky.";
    }
    // A lunch/admin tab may read the latest run, but owns no checkpoint until
    // its user actually enters the challenge. Each playing tab keeps its run.
    if (!run || !challenge || !runClaimed) return;
    const checkpoint = {
      version: 1,
      run,
      frame: challenge.frame,
      actions: challenge.actions,
      submitted,
    };
    const encoded = JSON.stringify(checkpoint);
    try {
      sessionStorage.setItem(RUN_KEY, encoded);
    } catch (_) {
      $("save-note").textContent = "Obnovu pokusu v tejto karte sa nepodarilo uložiť.";
    }
    try {
      const previous = storedRun("localStorage");
      const advances =
        previous?.run?.id === run.id &&
        previous.frame <= checkpoint.frame &&
        (!previous.submitted || checkpoint.submitted) &&
        Array.isArray(previous.actions) &&
        previous.actions.length <= checkpoint.actions.length &&
        previous.actions.every(
          (entry, i) => JSON.stringify(entry) === JSON.stringify(checkpoint.actions[i]),
        );
      // Only a successful explicit start may replace another run (or a cleared
      // checkpoint). Older tabs cannot resurrect a discarded global run.
      if (replaceGlobal || advances) localStorage.setItem(RUN_KEY, encoded);
    } catch (_) {
      $("save-note").textContent = "Pokus sa ukladá iba v tejto karte.";
    }
  }
  function restoreRun() {
    for (const storage of ["sessionStorage", "localStorage"]) {
      try {
        const data = storedRun(storage);
        if (data?.run?.expiresAt < Date.now()) {
          clearRunCheckpoint(data.run.id);
          continue;
        }
        if (
          !data ||
          data.version !== 1 ||
          !Number.isInteger(data.frame) ||
          data.frame < 0 ||
          data.frame > TOTAL_STEPS ||
          !Array.isArray(data.actions) ||
          data.actions.length > 120 ||
          !Number.isInteger(data.run?.seed) ||
          typeof data.run.id !== "string" ||
          !/^[a-zA-Z0-9-]{16,100}$/.test(data.run.id) ||
          !Number.isFinite(data.run.expiresAt) ||
          data.run.expiresAt < Date.now()
        )
          continue;
        const restored = new Challenge(data.run.seed);
        for (const entry of data.actions) {
          if (
            !Number.isInteger(entry.frame) ||
            entry.frame < restored.frame ||
            entry.frame > data.frame
          )
            throw new Error("Invalid saved action frame");
          restored.step(entry.frame - restored.frame);
          const { frame, ...command } = entry;
          if (restored.dispatch(command)) throw new Error("Invalid saved action");
        }
        restored.step(data.frame - restored.frame);
        challenge = restored;
        run = data.run;
        runClaimed = storage === "sessionStorage";
        submitted = data.submitted === true;
        return;
      } catch (_) {
        /* Try the shared fallback when this tab's checkpoint is invalid. */
      }
    }
  }
  restoreRun();
  async function request(url, options = {}) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...options.headers },
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const error = new Error(data.error || "Server nie je dostupný.");
        error.data = data;
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }
  async function leaderboard() {
    const id = ++requestId;
    $("board-status").textContent = "Načítavam výsledky…";
    try {
      const data = await request("/api/colony?period=" + period);
      if (id !== requestId) return;
      $("ranks").replaceChildren();
      for (const row of data.entries || []) {
        const li = document.createElement("li");
        if (row.isMe) li.className = "ant-me";
        for (const [cls, text] of [
          ["ant-rank", row.rank],
          ["ant-player", row.name + (row.isMe ? " · ty" : "")],
          ["ant-score", fmt(row.score)],
        ]) {
          const span = document.createElement("span");
          span.className = cls;
          span.textContent = text;
          li.append(span);
        }
        $("ranks").append(li);
      }
      $("board-status").textContent = data.entries?.length
        ? ""
        : "Zatiaľ žiadny výsledok. Zahraj si prvú dennú výzvu.";
      $("best").textContent = data.me
        ? "Tvoje poradie: " +
          data.me.rank +
          ". · " +
          fmt(data.me.score) +
          " bodov"
        : "Do poradia sa počíta najlepší denný výsledok.";
    } catch (_) {
      if (id === requestId) {
        $("ranks").replaceChildren();
        $("best").textContent = "";
        $("board-status").textContent =
          "Rebríček sa nepodarilo načítať. Sandbox môžeš hrať ďalej.";
      }
    }
  }
  async function startDaily() {
    if (starting) return;
    starting = true;
    $("start-status").textContent = "Pripravujem spoločnú mapu…";
    update();
    try {
      const name =
        (read("fantozzi_user") || "Pozorovateľ").trim().slice(0, 30) ||
        "Pozorovateľ";
      const data = await request("/api/colony/runs", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      run = data;
      runClaimed = true;
      challenge = new Challenge(data.seed);
      submitted = false;
      finishing = false;
      dailyPaused = false;
      accumulator = 0;
      $("start-status").textContent = "";
      if (mode === "daily" && dialog.open) {
        setTool("observe");
        resetCamera();
        message("Výzva začala. Zásoby sa počítajú až po doručení.");
      }
      persist({ replaceGlobal: true });
    } catch (error) {
      $("start-status").textContent =
        error.data?.error || "Výzvu sa nepodarilo spustiť. Skús to znova.";
    } finally {
      starting = false;
      update();
      start();
    }
  }
  async function submit() {
    if (!challenge?.finished || !run || submitting || submitted) return;
    submitting = true;
    $("result-message").textContent = "Overujem výpravu a ukladám výsledok…";
    update();
    try {
      const data = await request(
        "/api/colony/runs/" + encodeURIComponent(run.id) + "/finish",
        {
          method: "POST",
          body: JSON.stringify({ actions: challenge.actions }),
        },
      );
      submitted = true;
      $("result-message").textContent =
        "Uložené: " +
        fmt(data.score) +
        " bodov." +
        (data.improved
          ? " Nový denný rekord!"
          : " Tvoj lepší výsledok zostáva.");
      persist();
      leaderboard();
    } catch (error) {
      if (error.data?.code === "RUN_FINISHED") {
        submitted = true;
        $("result-message").textContent = "Výsledok je už uložený v rebríčku.";
        persist();
        leaderboard();
      } else
        $("result-message").textContent =
          error.data?.code === "RUN_TOO_EARLY"
            ? "Uloženie skús o " +
              Math.max(1, Math.ceil((error.data.remainingMs || 1000) / 1000)) +
              " s. Čas výzvy sa ešte overuje."
            : "Výsledok zatiaľ nie je uložený. " +
              (error.data?.error || "Skontroluj pripojenie a skús znova.");
    } finally {
      submitting = false;
      update();
    }
  }
  function detail() {
    const s = current().s;
    if (selected?.kind === "ant") {
      const a = s.ants.find((a) => a.id === selected.id);
      $("detail-title").textContent = a?.name || "Mravec";
      $("detail-body").textContent = a
        ? (ROLES[a.role] || "Odpočinok") +
          " · energia " +
          Math.round(a.energy) +
          " %" +
          (a.cargo
            ? " · nesie " + FOODS[a.cargo.type].name.toLowerCase()
            : " · bez nákladu")
        : "";
    } else if (selected?.kind === "food") {
      const f = s.foods.find((f) => f.id === selected.id);
      $("detail-title").textContent = f
        ? FOODS[f.type].name
        : "Potrava pozbieraná";
      $("detail-body").textContent = f
        ? f.amount +
          " porcií · " +
          (f.discovered ? "zberačky poznajú cestu" : "čaká na objavenie")
        : "Zberačky odniesli celý zdroj.";
    } else {
      const r = s.rooms.find((r) => r.id === selected?.id);
      $("detail-title").textContent = r
        ? r.type === "queen"
          ? "Komora kráľovnej"
          : ROOMS[r.type].name
        : "Pod lupou";
      $("detail-body").textContent = r
        ? r.type === "queen"
          ? "Rast kolónie potrebuje potravu, vodu a miesto v liahni."
          : r.progress < 100
            ? "Kopáči vynášajú piesok. Dokončené " +
              Math.floor(r.progress) +
              " %."
            : "Úroveň " + r.level + " · " + ROOMS[r.type].benefit
        : "Klikni na mravca alebo komoru.";
    }
    const key = s.rooms.map((r) => r.id + ":" + r.type).join(",");
    if ($("inspect").dataset.rooms !== key) {
      const old = $("inspect").value;
      $("inspect").replaceChildren(
        ...s.rooms.map(
          (r) =>
            new Option(
              r.type === "queen" ? "Kráľovná" : ROOMS[r.type].name,
              r.id,
            ),
        ),
      );
      $("inspect").value = s.rooms.some((r) => String(r.id) === old)
        ? old
        : "3";
      $("inspect").dataset.rooms = key;
    }
  }
  function update() {
    if (run && !submitted && !submitting && run.expiresAt < Date.now()) {
      clearRunCheckpoint(run.id);
      run = null;
      runClaimed = false;
      challenge = null;
      finishing = false;
      $("start-status").textContent =
        "Predchádzajúci pokus vypršal. Spusti novú výzvu.";
    }
    const g = current(),
      s = g.s,
      daily = mode === "daily";
    $("population").textContent = s.ants.length;
    $("food-count").textContent = fmt(s.food);
    $("water-count").textContent = fmt(s.water);
    $("time-label").firstChild.textContent = daily ? "Zostáva " : "Deň ";
    $("day").textContent = daily
      ? clock(
          challenge ? Math.max(0, DURATION - challenge.frame * STEP) : DURATION,
        )
      : 1 + Math.floor(s.time / 180);
    $("title").textContent = daily ? "Denná výzva" : "Tvoja kolónia";
    $("subtitle").textContent = daily
      ? challenge
        ? fmt(challenge.score) +
          " bodov · " +
          challenge.budget +
          " porcií navyše"
        : "Rovnaký štart. Tvoja stratégia."
      : "Malý svet pod povrchom.";
    $("world-state").textContent = daily ? "DENNÁ VÝZVA" : "SANDBOX";
    for (const b of dialog.querySelectorAll("[data-mode]"))
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    for (const b of dialog.querySelectorAll("[data-tool]")) {
      b.setAttribute("aria-pressed", String(b.dataset.tool === tool));
      b.disabled = daily && (!challenge || challenge.finished);
    }
    for (const b of dialog.querySelectorAll("[data-period]"))
      b.setAttribute("aria-pressed", String(b.dataset.period === period));
    for (const b of document.querySelectorAll(
      "#ant-game [data-action=pause], #ant-dock [data-action=pause]",
    )) {
      const paused = b.closest("#ant-dock")
        ? sandbox.s.settings.paused
        : daily
          ? dailyPaused
          : s.settings.paused;
      b.textContent = paused ? "Pokračovať" : "Pauza";
      b.setAttribute("aria-pressed", String(paused));
      b.disabled = !!(
        b.closest("#ant-game") &&
        daily &&
        (!challenge || challenge.finished)
      );
    }
    dock.querySelector("[data-action=hide]").textContent = sandbox.s.settings
      .hidden
      ? "Zobraziť"
      : "Skryť";
    $("dock-stats").textContent =
      sandbox.s.ants.length +
      " mravcov · " +
      sandbox.s.rooms.filter((r) => r.progress === 100).length +
      " komôr";
    $("daily-intro").hidden = !daily || !!challenge;
    dialog.querySelector("[data-action=start-daily]").disabled = starting;
    $("speed").disabled = daily;
    $("speed").value = daily ? "1" : String(speed);
    $("paths").checked = !!s.settings.paths;
    $("queen-state").textContent =
      s.food < 8
        ? "◉ Kolónia potrebuje potravu"
        : s.water < 2
          ? "◉ Kolónia potrebuje vodu"
          : "● V bezpečí · starostlivosť o liaheň";
    $("delivered").textContent = fmt(s.delivered);
    $("progress").value = Math.min(TARGET_DELIVERED, s.delivered);
    $("objective-note").textContent =
      s.delivered >= TARGET_DELIVERED
        ? "Misia splnená. Pokračuj v zbieraní zásob."
        : "Robotnice musia zásoby priniesť do hniezda.";
    $("run-result").hidden = !daily || !challenge?.finished;
    const submitButton = dialog.querySelector("[data-action=submit]");
    submitButton.disabled = submitting || submitted;
    submitButton.textContent = submitted
      ? "Výsledok uložený"
      : submitting
        ? "Ukladám…"
        : "Uložiť výsledok";
    $("tool-options").hidden =
      tool === "observe" || (daily && (!challenge || challenge.finished));
    $("food-option").hidden = tool !== "food";
    $("room-option").hidden = tool !== "build";
    $("place").hidden = tool === "guide";
    $("place").textContent =
      tool === "build"
        ? "Začať kopať označenú komoru"
        : "Položiť na označené miesto";
    $("tool-instruction").textContent =
      {
        food: "Klikni na voľný povrch.",
        water: "Klikni na voľný povrch.",
        build: "Vyber označené miesto pod zemou.",
        guide: "Potiahni krátku stopu po povrchu. Šípky + Enter fungujú tiež.",
      }[tool] || "";
    detail();
    if (daily && challenge?.finished && !finishing) {
      finishing = true;
      message("Výprava dokončená: " + fmt(challenge.score) + " bodov.");
      $("result-message").textContent = submitted
        ? "Tento výsledok je už uložený."
        : "Výprava dokončená.";
      persist();
      if (!submitted) submit();
    }
  }
  function command(data) {
    if (mode === "daily" && (!challenge || challenge.finished))
      return "Najprv spusti dennú výzvu.";
    const g = current();
    const error =
      mode === "daily"
        ? challenge.dispatch(data)
        : data.type === "food"
          ? g.addFood(data.food, data.x)
          : data.type === "build"
            ? g.build(data.room, data.slot)
            : g.setGuide(data.points);
    if (!error) {
      persist();
      update();
      draw();
    }
    return error;
  }
  function useTool(p) {
    const g = current();
    if (tool === "food" || tool === "water") {
      const error =
        p.y < 90 || p.y > 210
          ? "Jedlo a vodu polož na povrch."
          : command({
              type: "food",
              food: tool === "water" ? "water" : $("food-type").value,
              x: Math.round(p.x),
            });
      message(
        error ||
          "Zdroj je na povrchu. Prieskumníci ho objavia a zberačky odnesú zásoby.",
      );
    } else if (tool === "build") {
      const slot = SLOTS.findIndex((s, i) => i >= 4 && dist(s, p) < 85);
      message(
        command({ type: "build", room: $("room-type").value, slot }) ||
          "Kopáči začali pracovať. Sleduj, ako vynášajú piesok.",
      );
    } else if (tool === "observe") {
      const radius = Math.max(16, 14 / transform.scale),
        a = g.s.ants.find((a) => dist(a, p) < radius),
        f = g.s.foods.find((f) => dist(f, p) < radius + 10),
        r = g.s.rooms.find((r) => dist(SLOTS[r.slot], p) < 80);
      selected = a
        ? { kind: "ant", id: a.id }
        : f
          ? { kind: "food", id: f.id }
          : r
            ? { kind: "room", id: r.id }
            : null;
      detail();
      draw();
    }
  }
  function setTool(value) {
    tool = value;
    guide = [];
    hover =
      value === "build"
        ? SLOTS.find(
            (p, i) => i >= 4 && !current().s.rooms.some((r) => r.slot === i),
          )
        : { x: 480, y: 170 };
    hover = hover ? { ...hover } : null;
    update();
    draw();
  }
  function resetCamera() {
    const size = fit(canvas);
    zoom =
      innerWidth <= 760 && size.w
        ? Math.min(2.6, Math.max(1, size.h / 780 / (size.w / 1200)))
        : 1;
    pan = { x: 0, y: 0 };
  }
  function setMode(value) {
    if (value === mode) return;
    mode = value;
    if (mode === "daily" && run && challenge) {
      runClaimed = true;
      persist();
    }
    accumulator = 0;
    last = 0;
    selected = { kind: "room", id: 3 };
    resetCamera();
    setTool("observe");
    start();
    message(
      mode === "daily"
        ? challenge
          ? "Pokračuješ v dennej výzve."
          : "Výzva čaká na spustenie."
        : "Tvoja uložená kolónia pokračuje.",
    );
  }
  function inspectRoom(id) {
    const r = current().s.rooms.find((r) => r.id === id);
    if (!r) return;
    selected = { kind: "room", id };
    zoom = 2;
    const size = fit(canvas),
      scale = Math.min(size.w / 1200, size.h / 780) * zoom;
    pan = {
      x: (600 - SLOTS[r.slot].x) * scale,
      y: (390 - SLOTS[r.slot].y) * scale,
    };
    setTool("observe");
  }
  function action(name, fromDock = false) {
    if (name === "open" && !dialog.open) {
      originFocus = document.activeElement;
      dialog.showModal();
      document.body.classList.add("colony-open");
      dock.open = false;
      resetCamera();
      sync();
      leaderboard();
      ColonyRenderer.portrait($("queen-portrait"));
    }
    if (name === "close") dialog.close();
    if (name === "pause") {
      if (mode === "daily" && !fromDock) dailyPaused = !dailyPaused;
      else sandbox.s.settings.paused = !sandbox.s.settings.paused;
      start();
    }
    if (name === "hide") {
      sandbox.s.settings.hidden = !sandbox.s.settings.hidden;
      sync();
    }
    if (name === "zoom-in") zoom = Math.min(3, zoom * 1.2);
    if (name === "zoom-out") zoom = Math.max(0.75, zoom / 1.2);
    if (name === "center") {
      zoom = 1;
      pan = { x: 0, y: 0 };
    }
    if (name === "place" && hover) useTool(hover);
    if (name === "queen") inspectRoom(3);
    if (name === "inspect") inspectRoom(Number($("inspect").value));
    if (name === "start-daily") startDaily();
    if (name === "submit") submit();
    if (name === "refresh-board") leaderboard();
    if (name === "new-run" && challenge?.finished && !submitting) {
      clearRunCheckpoint(run?.id);
      challenge = null;
      run = null;
      runClaimed = false;
      submitted = false;
      finishing = false;
      update();
    }
    if (name === "scoreboard") {
      const visible = dialog.classList.toggle("ant-show-sidebar");
      dialog
        .querySelector("[data-action=scoreboard]")
        .setAttribute("aria-expanded", String(visible));
      if (visible)
        dialog
          .querySelector(".ant-sidebar")
          .scrollIntoView({
            behavior: reduced.matches ? "instant" : "smooth",
            block: "start",
          });
    }
    update();
    persist();
    draw();
  }
  for (const container of [dock, dialog])
    container.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.action) action(b.dataset.action, container === dock);
      if (b.dataset.mode) setMode(b.dataset.mode);
      if (b.dataset.tool) setTool(b.dataset.tool);
      if (b.dataset.period) {
        period = b.dataset.period;
        update();
        leaderboard();
      }
    });
  document
    .getElementById("colony-open")
    ?.addEventListener("click", () => action("open"));
  $("speed").addEventListener("change", () => {
    speed = [1, 2, 3].includes(Number($("speed").value))
      ? Number($("speed").value)
      : 1;
  });
  $("paths").addEventListener("change", () => {
    current().s.settings.paths = $("paths").checked;
    persist();
    draw();
  });
  $("food-type").addEventListener("change", draw);
  $("room-type").addEventListener("change", draw);
  dialog.addEventListener("close", () => {
    document.body.classList.remove("colony-open");
    pointer = null;
    guide = [];
    accumulator = 0;
    persist();
    sync();
    if (originFocus?.isConnected) originFocus.focus();
  });
  dialog.addEventListener("cancel", (e) => {
    if (tool !== "observe") {
      e.preventDefault();
      setTool("observe");
    }
  });
  function world(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - transform.x) / transform.scale,
      y: (e.clientY - r.top - transform.y) / transform.scale,
    };
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    pointer = { x: e.clientX, y: e.clientY, pan: { ...pan }, moved: false };
    hover = world(e);
    if (tool === "guide") guide = [hover];
  });
  canvas.addEventListener("pointermove", (e) => {
    hover = world(e);
    if (pointer) {
      if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 5)
        pointer.moved = true;
      if (tool === "observe")
        pan = {
          x: pointer.pan.x + e.clientX - pointer.x,
          y: pointer.pan.y + e.clientY - pointer.y,
        };
      if (
        tool === "guide" &&
        guide.length < 32 &&
        dist(guide[guide.length - 1], hover) > 8
      )
        guide.push({ x: Math.round(hover.x), y: Math.round(hover.y) });
    }
    draw();
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!pointer) return;
    if (tool === "guide")
      message(
        command({
          type: "guide",
          points: guide.map((p) => ({
            x: Math.round(p.x),
            y: Math.round(p.y),
          })),
        }) || "Stopa je položená.",
      );
    else if (!pointer.moved) useTool(world(e));
    pointer = null;
    guide = [];
    draw();
  });
  canvas.addEventListener("pointercancel", () => {
    pointer = null;
    guide = [];
    draw();
  });
  canvas.addEventListener("pointerleave", () => {
    if (!pointer && tool === "observe") {
      hover = null;
      draw();
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      action(e.deltaY < 0 ? "zoom-in" : "zoom-out");
    },
    { passive: false },
  );
  canvas.addEventListener("keydown", (e) => {
    const delta = {
      ArrowLeft: [-18, 0],
      ArrowRight: [18, 0],
      ArrowUp: [0, -18],
      ArrowDown: [0, 18],
    }[e.key];
    if (delta) {
      e.preventDefault();
      if (tool === "observe") {
        pan.x -= delta[0] * 2;
        pan.y -= delta[1] * 2;
      } else if (tool === "build") {
        const slots = SLOTS.filter(
            (p, i) => i >= 4 && !current().s.rooms.some((r) => r.slot === i),
          ),
          i = Math.max(
            0,
            slots.findIndex((p) => hover && dist(p, hover) < 1),
          );
        hover = slots.length
          ? {
              ...slots[
                (i + (delta[0] + delta[1] > 0 ? 1 : slots.length - 1)) %
                  slots.length
              ],
            }
          : null;
      } else {
        hover = { x: clamp((hover?.x || 480) + delta[0], 55, 1145), y: 170 };
      }
      draw();
    }
    if (["+", "=", "-"].includes(e.key)) {
      e.preventDefault();
      action(e.key === "-" ? "zoom-out" : "zoom-in");
    }
    if (e.key === "Enter" && hover) {
      e.preventDefault();
      if (tool === "guide")
        message(
          command({
            type: "guide",
            points: [
              { x: 480, y: 170 },
              { x: Math.round(hover.x), y: 170 },
            ],
          }) || "Stopa je položená.",
        );
      else useTool(hover);
    }
  });
  function fit(c) {
    const r = c.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    if (
      c.width !== Math.round(r.width * dpr) ||
      c.height !== Math.round(r.height * dpr)
    ) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    return { w: r.width, h: r.height, dpr };
  }
  function draw() {
    if (!active) return;
    const target = dialog.open ? canvas : bg,
      context = dialog.open ? ctx : bgctx;
    if (!dialog.open && (!ambient || sandbox.s.settings.hidden)) return;
    const { w, h, dpr } = fit(target);
    if (!w || !h) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, w, h);
    context.fillStyle = "#d6b785";
    context.fillRect(0, 0, w, h);
    const scale = dialog.open
      ? Math.min(w / 1200, h / 780) * zoom
      : Math.max(w / 1200, h / 780);
    if (dialog.open) {
      pan.x = clamp(pan.x, -w, w);
      pan.y = clamp(pan.y, -h, h);
    }
    const x = (w - 1200 * scale) / 2 + (dialog.open ? pan.x : 0),
      y = (h - 780 * scale) / 2 + (dialog.open ? pan.y : 0);
    if (dialog.open) transform = { x, y, scale };
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    ColonyRenderer.draw(context, dialog.open ? current() : sandbox, {
      selected: dialog.open ? selected : null,
      tool: dialog.open
        ? tool === "food"
          ? "food:" + $("food-type").value
          : tool === "water"
            ? "food:water"
            : tool === "build"
              ? "build:" + $("room-type").value
              : tool
        : null,
      hover: dialog.open ? hover : null,
      paths: dialog.open && current().s.settings.paths,
    });
    if (dialog.open && guide.length) {
      context.beginPath();
      guide.forEach((p, i) =>
        i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y),
      );
      context.strokeStyle = "#89984c";
      context.lineWidth = 3;
      context.stroke();
    }
    context.restore();
    if (dialog.open) $("zoom").textContent = Math.round(zoom * 100) + " %";
  }
  function shouldRun() {
    if (!active || document.hidden) return false;
    if (dialog.open)
      return mode === "daily"
        ? !!challenge && !challenge.finished && !dailyPaused
        : !sandbox.s.settings.paused;
    return (
      ambient &&
      !sandbox.s.settings.paused &&
      !sandbox.s.settings.hidden &&
      !reduced.matches
    );
  }
  function frame(now) {
    raf = 0;
    if (!active || document.hidden) return;
    const dt = last ? Math.min((now - last) / 1000, 0.25) : 0;
    last = now;
    if (shouldRun()) {
      accumulator += dt * (dialog.open && mode === "sandbox" ? speed : 1);
      while (accumulator >= STEP) {
        if (dialog.open && mode === "daily") challenge.step();
        else sandbox.tick(STEP, !dialog.open);
        accumulator -= STEP;
      }
      saveTime += dt;
      uiTime += dt;
      if (saveTime >= 5) {
        persist();
        saveTime = 0;
      }
      if (
        uiTime >= 0.5 ||
        (mode === "daily" && challenge?.finished && !finishing)
      ) {
        const g = dialog.open ? current() : sandbox,
          notice = g.events
            .filter((e) => !e.message.startsWith("Náklad doručený"))
            .pop();
        if (notice && dialog.open) message(notice.message);
        g.events.length = 0;
        update();
        uiTime = 0;
      }
    }
    if (now - lastDraw >= 1000 / 30) {
      draw();
      lastDraw = now;
    }
    if (shouldRun()) raf = requestAnimationFrame(frame);
  }
  function start() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    if (shouldRun()) raf = requestAnimationFrame(frame);
    else draw();
  }
  function sync() {
    const theme = document.documentElement.classList.contains("theme-anthill");
    if (oldTheme && !theme && dialog.open) dialog.close();
    oldTheme = theme;
    ambient = theme;
    active = ambient || dialog.open;
    bg.hidden = !ambient || sandbox.s.settings.hidden || dialog.open;
    dock.hidden = !ambient || dialog.open;
    update();
    persist();
    start();
  }
  new ResizeObserver(draw).observe(dialog.querySelector(".ant-world"));
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  window.addEventListener("resize", draw);
  window.addEventListener("colony-renderer-ready", () => {
    draw();
    ColonyRenderer.portrait($("queen-portrait"));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) persist();
    accumulator = 0;
    start();
  });
  window.addEventListener("pagehide", persist);
  reduced.addEventListener("change", sync);
  sync();
  if (new URLSearchParams(location.search).get("colony") === "1")
    action("open");
})();
