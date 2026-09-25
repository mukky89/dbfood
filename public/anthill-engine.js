(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Anthill = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FOODS = {
    bread: { name: 'Omrvinka', icon: '🍞', amount: 18, value: 1, water: 0, speed: 1 },
    fruit: { name: 'Ovocie', icon: '🍓', amount: 14, value: 1, water: 1, speed: .9 },
    cheese: { name: 'Syr', icon: '🧀', amount: 12, value: 2, water: 0, speed: .7 },
    seed: { name: 'Semienko', icon: '🌰', amount: 20, value: 1, water: 0, speed: .85 },
    pizza: { name: 'Pizza', icon: '🍕', amount: 32, value: 2, water: 0, speed: .6 },
    water: { name: 'Voda', icon: '💧', amount: 18, value: 0, water: 2, speed: .9 }
  };
  const ROOMS = {
    store: { name: 'Zásobáreň', cost: 15, benefit: '+50 miesta na jedlo' },
    nursery: { name: 'Liaheň', cost: 22, benefit: '+6 miest pre robotnice' },
    rest: { name: 'Odpočiváreň', cost: 18, benefit: '+30 % obnova energie' },
    water: { name: 'Vodná komora', cost: 15, benefit: '+40 miesta na vodu' },
    tunnel: { name: 'Dopravný tunel', cost: 20, benefit: 'Priame spojenie susedných komôr' }
  };
  const UPGRADES = {
    carry: { name: 'Silnejší nosiči', effect: '+1 jednotka v náklade', cost: 18 },
    speed: { name: 'Lepšie chodníčky', effect: '+15 % rýchlosť', cost: 20 },
    scout: { name: 'Prieskumníci', effect: '+35 dosah objavenia', cost: 14 },
    storage: { name: 'Väčšie zásobárne', effect: '+40 kapacita jedla', cost: 20 },
    rest: { name: 'Pohodlný odpočinok', effect: '+30 % obnova energie', cost: 16 },
    traffic: { name: 'Organizovaná doprava', effect: '+10 % rýchlosť, kratšie zastavenia', cost: 22 }
  };
  const ROLES = { gather: 'Zber', scout: 'Prieskum', dig: 'Kopanie', care: 'Starostlivosť' };
  const SLOTS = [
    { x: 340, y: 340 }, { x: 850, y: 340 }, { x: 420, y: 530 }, { x: 780, y: 530 },
    { x: 200, y: 510 }, { x: 990, y: 510 }, { x: 260, y: 690 }, { x: 540, y: 690 }, { x: 820, y: 690 }, { x: 1040, y: 690 }
  ];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const point = (x, y) => ({ x, y });
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const number = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  class Game {
    constructor(saved, random = Math.random) {
      this.random = random;
      this.s = this.fresh();
      if (saved) this.restore(saved);
      this.events = [];
    }
    fresh() {
      return { version: 1, time: 0, food: 25, water: 12, delivered: 0, nextId: 30,
        foods: [], ants: Array.from({ length: 12 }, (_, i) => this.ant(i)),
        rooms: ['store', 'nursery', 'rest', 'queen'].map((type, slot) => ({ id: slot, slot, type, progress: 100, level: 1, paused: false })),
        upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])),
        allocation: { gather: 6, scout: 2, dig: 2, care: 2 }, auto: true,
        cooldown: 0, guideCooldown: 0, guide: null, brood: 0, eventClock: 0, event: null,
        ecology: { forage: 18, plan: 20, upkeep: 0 },
        rock: 390, bridge: false, tasks: {}, composition: {}, settings: { sound: false, hidden: false, paused: false, paths: false, static: false }, savedAt: Date.now() };
    }
    ant(id) {
      return { id, name: 'Mravec ' + (id + 1), favorite: false, x: 600, y: 350, angle: 0,
        energy: 90, role: 'gather', state: 'idle', route: [], cargo: null, target: null, wait: 0 };
    }
    get capacity() { return 30 + this.s.rooms.filter(r => r.type === 'store' && r.progress === 100).reduce((n, r) => n + 50 * r.level, 0) + this.s.upgrades.storage * 40; }
    get waterCapacity() { return 20 + this.s.rooms.filter(r => r.type === 'water' && r.progress === 100).reduce((n, r) => n + 40 * r.level, 0); }
    get populationCapacity() { return Math.min(40, 6 + this.s.rooms.filter(r => r.type === 'nursery' && r.progress === 100).reduce((n, r) => n + 6 * r.level, 0)); }
    get level() { return 1 + this.s.rooms.filter(r => r.progress === 100 && r.id >= 4).length + Math.floor(this.s.delivered / 100); }
    say(message, sound = false) { this.events.push({ message, sound }); }
    roomPoint(r) { return SLOTS[r.slot]; }
    // Routes always travel through the entrance and tunnel junctions. Surface
    // obstacles insert a real detour; the leaf bridge removes the pond detour.
    surfaceRoute(a, b) {
      const nodes = [point(a.x, 170)];
      const obstacles = [{ x: this.s.rock, size: 25 }];
      if (!this.s.bridge) obstacles.push({ x: 770, size: 45 });
      if (this.s.event?.type === 'branch') obstacles.push({ x: 930, size: 35 });
      const forward = b.x >= a.x;
      obstacles.sort((u, v) => forward ? u.x - v.x : v.x - u.x);
      for (const o of obstacles) if (o.x > Math.min(a.x, b.x) && o.x < Math.max(a.x, b.x)) {
        const d = forward ? 1 : -1;
        nodes.push(point(o.x - d * (o.size + 12), 170), point(o.x - d * o.size, 130), point(o.x + d * o.size, 130), point(o.x + d * (o.size + 12), 170));
      }
      nodes.push(point(b.x, 170), { ...b });
      return nodes;
    }
    route(a, b) {
      const nodes = [];
      if (a.y < 220) nodes.push(...this.surfaceRoute(a, point(600, 170)));
      else nodes.push(point(600, a.y), point(600, 350));
      if (b.y < 220) nodes.push(point(600, 170), ...this.surfaceRoute(point(600, 170), b));
      else {
        // Completed cross tunnels connect the same row directly.
        const direct = this.s.rooms.some(r => r.type === 'tunnel' && r.progress === 100 && Math.abs(SLOTS[r.slot].y - b.y) < 5);
        if (direct && Math.abs(a.y - b.y) < 5) return [{ ...b }];
        nodes.push(point(600, b.y), { ...b });
      }
      return nodes.filter((p, i) => i === 0 || dist(p, nodes[i - 1]) > 1);
    }
    go(a, destination, state) { a.route = this.route(a, destination); a.state = state; }
    foodError(type, x) {
      if (!Object.hasOwn(FOODS, type) || !number(x, 55, 1145)) return 'Polož potravu na povrch medzi okrajmi lúky.';
      if (Math.abs(x - this.s.rock) < 35 || Math.abs(x - 770) < 55 || (this.s.event?.type === 'branch' && Math.abs(x - 930) < 45)) return 'Tu je prekážka. Vyber voľné miesto na povrchu.';
      if (this.s.cooldown > 0) return 'Ďalšia porcia bude pripravená o ' + Math.ceil(this.s.cooldown) + ' s.';
      if (this.s.foods.length >= 10) return 'Na lúke je už 10 porcií. Počkaj na zber alebo niektorú odstráň.';
      if (this.s.foods.some(f => Math.abs(f.x - x) < 28)) return 'Porcie potrebujú trochu viac miesta.';
      return null;
    }
    addFood(type, x) {
      const error = this.foodError(type, x);
      if (error) return error;
      this.s.foods.push({ id: this.s.nextId++, type, x, y: 170, amount: FOODS[type].amount, discovered: false, trail: 0 });
      this.s.cooldown = 3; this.s.tasks.placed = true;
      return null;
    }
    removeFood(id) {
      this.s.foods = this.s.foods.filter(f => f.id !== id);
      for (const a of this.s.ants) if (a.target === id && !a.cargo) { a.target = null; this.go(a, point(600, 350), 'return'); }
    }
    build(type, slot) {
      if (!Object.hasOwn(ROOMS, type) || !integer(slot, 4, SLOTS.length - 1)) return 'Vyber označené stavebné miesto.';
      if (this.s.rooms.some(r => r.slot === slot)) return 'Na tomto mieste už stojí komora alebo prebieha stavba.';
      if (this.s.food < ROOMS[type].cost) return 'Na stavbu treba ' + ROOMS[type].cost + ' jednotiek jedla.';
      this.s.food -= ROOMS[type].cost;
      this.s.rooms.push({ id: slot, slot, type, progress: 0, level: 1, paused: false });
      this.say('Plán je pripravený. Kopáči vybudujú prístup aj komoru.');
      return null;
    }
    cancelBuild(id) {
      const r = this.s.rooms.find(r => r.id === id && r.progress < 100);
      if (!r) return;
      this.s.food = Math.min(this.capacity, this.s.food + Math.floor(ROOMS[r.type].cost / 2));
      this.s.rooms = this.s.rooms.filter(room => room.id !== id);
      for (const a of this.s.ants) if (a.target === 'room:' + id) { a.target = null; this.go(a, point(600, 350), 'return'); }
    }
    upgrade(type) {
      if (!Object.hasOwn(UPGRADES, type)) return 'Neznáme vylepšenie.';
      const level = this.s.upgrades[type], price = UPGRADES[type].cost * (level + 1);
      if (level >= 3) return 'Dosiahnutá maximálna úroveň.';
      if (this.s.food < price) return 'Potrebuješ ' + price + ' jednotiek jedla.';
      this.s.food -= price; this.s.upgrades[type]++;
      this.say('Vylepšenie dokončené: ' + UPGRADES[type].name, true); return null;
    }
    upgradeRoom(id) {
      const r = this.s.rooms.find(r => r.id === id);
      if (!r || !ROOMS[r.type] || r.type === 'tunnel' || r.progress < 100 || r.level >= 3) return 'Táto komora sa teraz nedá vylepšiť.';
      const price = ROOMS[r.type].cost * r.level;
      if (this.s.food < price) return 'Potrebuješ ' + price + ' jednotiek jedla.';
      this.s.food -= price; r.level++; this.say('Komora je vylepšená.', true); return null;
    }
    allocate(role, delta) {
      if (!Object.hasOwn(ROLES, role) || ![-1, 1].includes(delta)) return;
      if (this.s.auto) { this.s.allocation = this.desired(); this.s.auto = false; }
      const used = Object.values(this.s.allocation).reduce((a, b) => a + b, 0);
      if (delta < 0 && this.s.allocation[role] > 0) this.s.allocation[role]--;
      if (delta > 0 && used < this.s.ants.length) this.s.allocation[role]++;
    }
    desired() {
      if (!this.s.auto) return { ...this.s.allocation };
      const n = this.s.ants.length, dig = this.s.rooms.some(r => r.progress < 100 && !r.paused) || this.s.event?.type === 'branch' ? 3 : 0;
      const care = n < this.populationCapacity && this.s.food >= 8 && this.s.water >= 2 ? 2 : 1;
      return { gather: n - 2 - dig - care, scout: 2, dig, care };
    }
    setGuide(points) {
      if (this.s.guideCooldown > 0) return 'Stopu môžeš obnoviť o ' + Math.ceil(this.s.guideCooldown) + ' s.';
      if (!Array.isArray(points) || points.length < 2) return 'Nakresli krátku stopu po povrchu.';
      let length = 0;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!number(p.x, 40, 1160) || !number(p.y, 115, 190) || Math.abs(p.x - this.s.rock) < 30 || (!this.s.bridge && Math.abs(p.x - 770) < 50) || (this.s.event?.type === 'branch' && Math.abs(p.x - 930) < 40)) return 'Stopa musí viesť po priechodnom povrchu.';
        if (i) {
          length += dist(p, points[i - 1]);
          const low = Math.min(p.x, points[i - 1].x), high = Math.max(p.x, points[i - 1].x);
          const obstacles = [this.s.rock];
          if (!this.s.bridge) obstacles.push(770);
          if (this.s.event?.type === 'branch') obstacles.push(930);
          if (obstacles.some(x => x > low && x < high)) return 'Stopa nesmie prechádzať cez prekážku.';
        }
      }
      if (length > 240) return 'Stopa môže mať najviac 240 bodov dĺžky.';
      this.s.guide = { points: points.map(p => ({ ...p })), life: 25 }; this.s.guideCooldown = 15; return null;
    }
    live(dt) {
      const s = this.s, e = s.ecology;
      s.auto = true;
      for (const room of s.rooms) if (room.progress < 100) room.paused = false;
      e.forage += dt; e.plan += dt; e.upkeep += dt;
      // The environment supplies sources, never credits the stockpile directly.
      if (e.forage >= 18) {
        e.forage = 0;
        if (s.foods.length < 4) {
          const types = ['bread', 'fruit', 'seed', 'cheese', 'pizza'];
          const type = s.water < 8 && !s.foods.some(f => FOODS[f.type].water) ? 'water' : types[Math.floor(this.random() * types.length)];
          const positions = [110, 230, 310, 480, 550, 650, 870, 1020, 1110];
          const start = Math.floor(this.random() * positions.length);
          const placed = s.tasks.placed, cooldown = s.cooldown;
          s.cooldown = 0;
          for (let i = 0; i < positions.length; i++) if (!this.addFood(type, positions[(start + i) % positions.length])) break;
          s.tasks.placed = placed; s.cooldown = cooldown;
        }
      }
      // Feeding the colony keeps foraging meaningful after the nest is full.
      // A shortage slows growth; it never kills the colony or subtracts offline.
      if (e.upkeep >= 10) {
        e.upkeep = 0;
        s.food = Math.max(0, s.food - s.ants.length * .05);
        s.water = Math.max(0, s.water - s.ants.length * .015);
      }
      if (e.plan < 25) return;
      e.plan = 0;
      if (s.rooms.some(r => r.progress < 100)) return;
      const slot = SLOTS.findIndex((_, i) => i >= 4 && !s.rooms.some(r => r.slot === i));
      const plan = ['nursery', 'store', 'water', 'rest', 'nursery', 'tunnel'];
      if (slot >= 4) {
        const type = plan[slot - 4];
        if (s.food >= ROOMS[type].cost + 8) this.build(type, slot);
        return;
      }
      const grow = s.rooms.find(r => r.type === 'nursery' && r.level < 3 && s.ants.length >= this.populationCapacity && this.populationCapacity < 40);
      if (grow && s.food >= ROOMS.nursery.cost * grow.level + 12) { this.upgradeRoom(grow.id); return; }
      const upgrade = Object.keys(UPGRADES).sort((a, b) => s.upgrades[a] - s.upgrades[b]).find(k => s.upgrades[k] < 3 && s.food >= UPGRADES[k].cost * (s.upgrades[k] + 1) + 12);
      if (upgrade) this.upgrade(upgrade);
    }
    tick(dt, autonomous = false) {
      if (!number(dt, 0, 1)) return;
      const s = this.s; s.time += dt;
      if (autonomous) this.live(dt);
      s.cooldown = Math.max(0, s.cooldown - dt); s.guideCooldown = Math.max(0, s.guideCooldown - dt);
      if (s.guide && (s.guide.life -= dt) <= 0) s.guide = null;
      for (const f of s.foods) f.trail = Math.max(0, f.trail - dt * .012);
      const roles = Object.entries(this.desired()).flatMap(([role, count]) => Array(count).fill(role));
      s.ants.forEach((a, i) => {
        // Assignment changes wait until an ant reaches a safe idle state.
        if (a.state === 'idle') a.role = roles[i] || 'rest';
        if (a.route.length) {
          let budget = dt * (55 + s.upgrades.speed * 8 + s.upgrades.traffic * 5) * (a.cargo ? FOODS[a.cargo.type].speed : 1);
          if (a.state === 'dirt') budget *= .8;
          while (a.route.length && budget > 0) {
            const p = a.route[0], d = dist(a, p); a.angle = Math.atan2(p.y - a.y, p.x - a.x);
            if (d <= budget) { a.x = p.x; a.y = p.y; a.route.shift(); budget -= d; }
            else { a.x += (p.x - a.x) / d * budget; a.y += (p.y - a.y) / d * budget; budget = 0; }
          }
          a.energy = Math.max(0, a.energy - dt * .45);
          if (a.role === 'scout' && a.y < 220) for (const f of s.foods) if (!f.discovered && dist(a, f) < 95 + s.upgrades.scout * 35) {
            f.discovered = true; s.tasks.discovered = true; a.target = f.id;
            this.go(a, point(600, 350), 'report'); this.say('Prieskumník objavil: ' + FOODS[f.type].name); break;
          }
          if (a.state === 'report') { const f = s.foods.find(f => f.id === a.target); if (f) f.trail = Math.min(1, f.trail + dt * .25); }
          return;
        }
        if (a.wait > 0) { a.wait -= dt; return; }
        if (a.state === 'deliver') {
          if (a.cargo) {
            const c = a.cargo, spec = FOODS[c.type];
            const received = Math.min(this.capacity - s.food, c.amount * spec.value);
            s.food += received; s.water = Math.min(this.waterCapacity, s.water + c.amount * spec.water);
            s.delivered += received; s.composition[c.type] = (s.composition[c.type] || 0) + received;
            if (c.type === 'pizza') s.tasks.pizza = true;
            a.cargo = null; this.say('Náklad doručený do zásobárne.', true);
          }
          a.state = 'idle'; a.target = null;
        } else if (a.state === 'gather' || a.state === 'waiting') {
          if (a.state === 'waiting' && (roles[i] !== a.role || s.food >= this.capacity)) { a.target = null; this.go(a, point(600, 350), 'return'); return; }
          const f = s.foods.find(f => f.id === a.target && f.amount > 0);
          if (!f) { a.state = 'idle'; return; }
          if (f.type === 'pizza') {
            const team = s.ants.filter(b => b.target === f.id && ['waiting', 'gather'].includes(b.state) && !b.route.length);
            a.state = 'waiting';
            if (team.length < 2) return;
            for (const b of team.slice(0, 2)) this.pickup(b, f);
          } else this.pickup(a, f);
        } else if (a.state === 'dig') {
          const room = s.rooms.find(r => 'room:' + r.id === a.target && r.progress < 100 && !r.paused);
          if (room) {
            room.progress = Math.min(100, room.progress + 7);
            if (room.progress === 100) { s.tasks.built = true; this.say('Dokončená stavba: ' + ROOMS[room.type].name, true); }
            this.go(a, point(600, 170), 'dirt'); a.wait = 1;
          } else a.state = 'idle';
        } else if (a.state === 'care') {
          if (s.food >= 8 && s.water >= 2 && s.ants.length < this.populationCapacity) s.brood += dt * 1.5;
          a.energy = Math.max(0, a.energy - dt * .2);
          if (s.brood >= 30) { s.brood = 0; s.food -= 8; s.water -= 2; s.ants.push(this.ant(s.nextId++)); this.say('V liahni pribudla nová robotnica.', true); }
          if (a.energy < 30 || roles[i] !== a.role) a.state = 'idle';
        } else if (a.state === 'rest') {
          const rooms = s.rooms.filter(r => r.type === 'rest' && r.progress === 100).reduce((n, r) => n + r.level, 0);
          a.energy = Math.min(100, a.energy + dt * 6 * (1 + (rooms + s.upgrades.rest) * .3));
          if (a.energy >= 99 && roles[i] !== 'rest') a.state = 'idle';
        } else if (a.state === 'clear') {
          if (s.event?.type === 'branch') { s.event.work += dt * 5; if (s.event.work >= 100) { s.event = null; this.say('Vetvička je odstránená. Cesta je opäť voľná.', true); } }
          else a.state = 'idle';
        } else if (a.state !== 'idle') { a.state = 'idle'; a.wait = this.random() * .6 / (1 + s.upgrades.traffic); }
        if (a.state !== 'idle') return;
        a.role = roles[i] || 'rest';
        if (a.energy < 25 || a.role === 'rest') { const room = s.rooms.find(r => r.type === 'rest' && r.progress === 100); this.go(a, room ? SLOTS[room.slot] : point(600, 350), 'rest'); return; }
        if (a.role === 'dig') {
          const room = s.rooms.find(r => r.progress < 100 && !r.paused);
          if (room) { a.target = 'room:' + room.id; this.go(a, SLOTS[room.slot], 'dig'); return; }
          if (s.event?.type === 'branch') { this.go(a, point(900, 170), 'clear'); return; }
        }
        if (a.role === 'care') { const r = s.rooms.find(r => r.type === 'nursery' && r.progress === 100); if (r) { this.go(a, SLOTS[r.slot], 'care'); return; } }
        if (a.role === 'gather') {
          const targets = s.foods.filter(f => f.discovered && f.amount > 0 && (FOODS[f.type].value && s.food < this.capacity || FOODS[f.type].water && s.water < this.waterCapacity));
          targets.sort((a, b) => b.trail - a.trail || a.id - b.id);
          const f = targets.length && targets[Math.floor(this.random() * Math.min(2, targets.length))];
          if (f) { a.target = f.id; this.go(a, f, 'gather'); a.wait = f.type === 'seed' ? 2 : .4; f.trail = Math.min(1, f.trail + .12); return; }
        }
        if (a.role === 'scout' || a.role === 'gather') {
          const p = s.guide && this.random() < .8 ? s.guide.points[s.guide.points.length - 1] : point(65 + this.random() * 1070, 170);
          // Idle collectors explore too, so manual allocation cannot deadlock discovery.
          this.go(a, p, 'explore');
          if (a.role === 'gather') for (const f of s.foods) if (dist(a, f) < 95) { f.discovered = true; f.trail = .5; s.tasks.discovered = true; }
        } else { this.go(a, point(600, 350), 'return'); a.wait = 2; }
      });
      s.foods = s.foods.filter(f => f.amount > 0 || s.ants.some(a => a.target === f.id && !a.cargo));
      s.eventClock += dt;
      if (s.event) { s.event.life -= dt; if (s.event.life <= 0) s.event = null; }
      if (s.eventClock > 100) { s.eventClock = 0; this.triggerEvent(); }
      // Ambient food is collected through exactly the same transport pipeline.
      if (!s.foods.length && s.cooldown === 0) { const placed = s.tasks.placed; this.addFood('bread', 550); s.tasks.placed = placed; s.cooldown = 0; }
      if (s.delivered >= 10) s.tasks.delivered = true;
    }
    pickup(a, f) {
      const amount = Math.min(f.amount, 1 + this.s.upgrades.carry);
      if (!amount) { a.state = 'idle'; return; }
      f.amount -= amount; a.cargo = { type: f.type, amount };
      const r = this.s.rooms.find(r => r.type === (f.type === 'water' ? 'water' : 'store') && r.progress === 100) || this.s.rooms[0];
      this.go(a, SLOTS[r.slot], 'deliver');
    }
    triggerEvent() {
      const types = ['picnic', 'rain', 'branch', 'harvest'], type = types[Math.floor(this.random() * types.length)];
      const names = { picnic: 'Piknik: na lúke zostala pizza.', rain: 'Jemný dážď: zbieraj čerstvú vodu.', branch: 'Spadnutá vetvička: kopáči môžu uvoľniť cestu.', harvest: 'Bohatá úroda: nové semienka na lúke.' };
      this.s.event = { type, life: 45, work: 0 }; this.say(names[type]);
      if (type !== 'branch') { const placed = this.s.tasks.placed; this.s.cooldown = 0; this.addFood({ picnic: 'pizza', rain: 'water', harvest: 'seed' }[type], 100 + this.random() * 180); this.s.tasks.placed = placed; }
    }
    serialize() { this.s.savedAt = Date.now(); return JSON.stringify(this.s); }
    restore(raw) {
      // Saves are untrusted input. Validate the complete graph before adopting it;
      // corrupt/old saves fall back to a new colony, never poison the animation loop.
      try {
        const s = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
        if (!s || s.version !== 1 || !number(s.time, 0, 1e10) || !number(s.food, 0, 1e6) || !number(s.water, 0, 1e6) || !number(s.delivered, 0, 1e10) || !integer(s.nextId, 12, 1e9)) return false;
        if (!Array.isArray(s.rooms) || s.rooms.length < 4 || s.rooms.length > 10 || new Set(s.rooms.map(r => r.slot)).size !== s.rooms.length) return false;
        if (!s.rooms.every(r => integer(r.slot, 0, 9) && r.id === r.slot && (r.type === 'queen' && r.slot === 3 || Object.hasOwn(ROOMS, r.type)) && number(r.progress, 0, 100) && integer(r.level, 1, 3) && typeof r.paused === 'boolean')) return false;
        if (!['store', 'nursery', 'rest', 'queen'].every((type, i) => s.rooms.some(r => r.slot === i && r.type === type && r.progress === 100))) return false;
        if (!Array.isArray(s.ants) || s.ants.length < 12 || s.ants.length > 40 || new Set(s.ants.map(a => a.id)).size !== s.ants.length) return false;
        if (!s.ants.every(a => integer(a.id, 0, 1e9) && typeof a.name === 'string' && a.name.length <= 32 && number(a.energy, 0, 100) && (!a.cargo || Object.hasOwn(FOODS, a.cargo.type) && integer(a.cargo.amount, 1, 4)))) return false;
        if (!Array.isArray(s.foods) || s.foods.length > 10 || !s.foods.every(f => integer(f.id, 0, 1e9) && Object.hasOwn(FOODS, f.type) && number(f.x, 55, 1145) && f.y === 170 && number(f.amount, 0, 32) && number(f.trail, 0, 1) && typeof f.discovered === 'boolean')) return false;
        if (!s.upgrades || !Object.keys(UPGRADES).every(k => integer(s.upgrades[k], 0, 3))) return false;
        if (!s.allocation || !Object.keys(ROLES).every(k => integer(s.allocation[k], 0, 40)) || Object.values(s.allocation).reduce((a, b) => a + b, 0) > s.ants.length) return false;
        const fresh = this.fresh();
        this.s = { ...fresh, time: s.time, food: s.food, water: s.water, delivered: s.delivered, nextId: Math.max(s.nextId, ...s.ants.map(a => a.id + 1), ...s.foods.map(f => f.id + 1)), rooms: s.rooms,
          foods: s.foods, upgrades: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, s.upgrades[k]])), allocation: Object.fromEntries(Object.keys(ROLES).map(k => [k, s.allocation[k]])), auto: s.auto !== false,
          ants: s.ants.map(a => ({ ...this.ant(a.id), name: a.name, favorite: !!a.favorite, energy: a.energy, cargo: a.cargo || null })),
          rock: number(s.rock, 320, 450) ? s.rock : 390, bridge: !!s.bridge,
          tasks: Object.fromEntries(['placed', 'discovered', 'delivered', 'paths', 'built', 'named', 'pizza'].map(k => [k, s.tasks?.[k] === true])),
          settings: Object.fromEntries(Object.keys(fresh.settings).map(k => [k, s.settings?.[k] === true])),
          composition: Object.fromEntries(Object.keys(FOODS).map(k => [k, number(s.composition?.[k], 0, 1e10) ? s.composition[k] : 0])) };
        this.s.ecology = Object.fromEntries(['forage', 'plan', 'upkeep'].map(k => [k, number(s.ecology?.[k], 0, 25) ? s.ecology[k] : fresh.ecology[k]]));
        this.s.food = Math.min(this.capacity, this.s.food); this.s.water = Math.min(this.waterCapacity, this.s.water);
        for (const a of this.s.ants) if (a.cargo) this.go(a, SLOTS[0], 'deliver');
        return true;
      } catch (_) { return false; }
    }
  }
  return { Game, FOODS, ROOMS, ROLES, UPGRADES, SLOTS, dist, clamp };
});
