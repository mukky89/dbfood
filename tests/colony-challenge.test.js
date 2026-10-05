const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Game, SLOTS } = require('../public/anthill-engine');
const { Challenge, replay, TOTAL_STEPS, FOOD_BUDGET, MAX_ACTIONS, MISSION_BONUS } = require('../public/colony-challenge');

function outcome(challenge) {
  const s = challenge.game.s;
  return { score: challenge.score, delivered: s.delivered, deliveredWater: s.deliveredWater, missionComplete: challenge.missionComplete, frames: challenge.frame, population: s.ants.length, food: s.food, water: s.water };
}

test('daily challenge has a deterministic initial state and frame batching does not change results', () => {
  const a = new Challenge(98765), b = new Challenge(98765);
  assert.deepEqual(a.game.s, b.game.s);
  assert.equal(a.budget, FOOD_BUDGET);
  assert.equal(a.game.s.foods.length, 3);
  assert.equal(a.game.s.savedAt, 0);
  a.step(TOTAL_STEPS);
  for (let i = 0; i < TOTAL_STEPS; i++) b.step();
  assert.deepEqual(a.game.s, b.game.s);
  assert.deepEqual(outcome(a), replay(98765, []));
  assert.ok(a.game.s.delivered > 0);
});

test('placement never awards points, invalid actions spend neither budget nor resources', () => {
  const c = new Challenge(41), before = c.game.s.food;
  assert.equal(c.dispatch({ type: 'food', food: 'fruit', x: 900 }), null);
  assert.equal(c.score, 0);
  assert.equal(c.game.s.food, before);
  assert.equal(c.budget, FOOD_BUDGET - 1);
  const snapshot = JSON.stringify(c.game.s);
  for (const action of [null, { type: 'food', food: 'pizza', x: 50 }, { type: 'food', food: 'bread', x: 1010 }, { type: 'build', room: 'queen', slot: 4 }, { type: 'build', room: 'store', slot: 0 }, { type: 'score', value: 9999 }]) assert.equal(typeof c.dispatch(action), 'string');
  assert.equal(JSON.stringify(c.game.s), snapshot);
  assert.equal(c.actions.length, 1);
  assert.equal(c.budget, FOOD_BUDGET - 1);
  c.step(10);
  assert.equal(c.score, 0, 'workers must physically return with their load');
});

test('six extra portions are available and rejected portions are not logged', () => {
  const c = new Challenge(0);
  for (const x of [80, 125, 310, 460, 890, 1020]) {
    const score = c.score;
    assert.equal(c.dispatch({ type: 'food', food: 'bread', x }), null);
    assert.equal(c.score, score);
    c.step(31);
  }
  assert.equal(c.budget, 0);
  assert.equal(typeof c.dispatch({ type: 'food', food: 'bread', x: 1100 }), 'string');
  assert.equal(c.actions.length, 6);
  c.step(TOTAL_STEPS - c.frame);
  assert.deepEqual(replay(0, c.actions), outcome(c));
});

test('replay validates order, action schemas, placement cooldowns and available construction resources', () => {
  const food = { frame: 0, type: 'food', food: 'bread', x: 80 };
  for (const actions of [
    null,
    Array(MAX_ACTIONS + 1).fill(food),
    [{ ...food, frame: -1 }], [{ ...food, frame: TOTAL_STEPS }], [{ ...food, frame: .5 }],
    [{ ...food, x: NaN }], [{ ...food, x: Infinity }], [{ ...food, score: 100000 }],
    [{ ...food, frame: 50 }, { ...food, frame: 49, x: 120 }],
    [food, { ...food, x: 120 }],
    [{ frame: 0, type: 'build', room: 'store', slot: 4 }, { frame: 0, type: 'build', room: 'store', slot: 5 }],
    [{ frame: 0, type: 'guide', points: Array(33).fill({ x: 600, y: 170 }) }],
    [{ frame: 0, type: 'guide', points: [{ x: 650, y: 170 }, { x: 850, y: 170 }] }]
  ]) assert.throws(() => replay(0, actions));
  for (const seed of [-1, .4, NaN, 4294967296, '123']) assert.throws(() => replay(seed, []));
  const seventh = [80, 125, 310, 460, 890, 1020, 1100].map((x, i) => ({ frame: i * 31, type: 'food', food: 'bread', x }));
  assert.throws(() => replay(0, seventh), /6 porcií/);
});

test('client and server execute the same action log without reading time or unseeded randomness', () => {
  const c = new Challenge(123);
  assert.equal(c.dispatch({ type: 'build', room: 'nursery', slot: 4 }), null);
  assert.equal(c.dispatch({ type: 'guide', points: [{ x: 550, y: 165 }, { x: 630, y: 170 }] }), null);
  c.step(40);
  assert.equal(c.dispatch({ type: 'food', food: 'fruit', x: 930 }), null);
  c.step(TOTAL_STEPS - c.frame);
  const context = vm.createContext({ input: JSON.stringify(c.actions) });
  vm.runInContext('Date.now = () => { throw new Error("wall clock read"); }; Math.random = () => { throw new Error("unseeded random"); };', context);
  for (const file of ['anthill-engine.js', 'colony-challenge.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', file), 'utf8'), context);
  const browserResult = JSON.parse(vm.runInContext('JSON.stringify(ColonyChallenge.replay(123, JSON.parse(input)))', context));
  assert.deepEqual(browserResult, outcome(c));
  assert.deepEqual(replay(123, c.actions), outcome(c));
});

test('a finished run cannot advance or accept actions, and a restart is isolated', () => {
  const c = new Challenge(9);
  c.step(TOTAL_STEPS);
  assert.equal(c.finished, true);
  const snapshot = JSON.stringify(c.game.s);
  c.step(100);
  assert.equal(c.frame, TOTAL_STEPS);
  assert.equal(typeof c.dispatch({ type: 'food', food: 'bread', x: 80 }), 'string');
  assert.equal(JSON.stringify(c.game.s), snapshot);
  const fresh = new Challenge(9);
  fresh.dispatch({ type: 'food', food: 'bread', x: 80 });
  assert.equal(fresh.frame, 0);
  assert.equal(fresh.score, 0);
  assert.equal(c.actions.length, 0);
  assert.notEqual(fresh.game.s.ants, c.game.s.ants);
});

test('guidance log owns copies of its coordinates', () => {
  const c = new Challenge(4), points = [{ x: 500, y: 165 }, { x: 600, y: 170 }];
  assert.equal(c.dispatch({ type: 'guide', points }), null);
  points[0].x = 1000;
  assert.equal(c.actions[0].points[0].x, 500);
  assert.equal(c.game.s.guide.points[0].x, 500);
});

test('daily event type and source location do not depend on player choices', () => {
  for (const seed of [0, 1, 42, 999]) {
    const observeEvent = challenge => {
      const events = [], original = challenge.game.triggerEvent;
      challenge.game.triggerEvent = () => {
        const addFood = challenge.game.addFood;
        challenge.game.addFood = function (food, x) { events.push({ food, x }); return addFood.call(this, food, x); };
        original();
        challenge.game.addFood = addFood;
        events.push({ type: challenge.game.s.event.type });
      };
      return events;
    };
    const a = new Challenge(seed), b = new Challenge(seed), eventsA = observeEvent(a), eventsB = observeEvent(b);
    assert.equal(b.dispatch({ type: 'build', room: 'nursery', slot: 4 }), null);
    assert.equal(b.dispatch({ type: 'food', food: 'fruit', x: 930 }), null);
    a.step(1010); b.step(1010);
    assert.notEqual(a.game.s.rooms.length, b.game.s.rooms.length);
    assert.ok(eventsA.length);
    assert.deepEqual(eventsA, eventsB);
  }
});

test('scores count only accepted physical deliveries and a mission bonus once', () => {
  const c = new Challenge(3), s = c.game.s;
  const a = s.ants[0];
  Object.assign(a, { state: 'deliver', route: [], wait: 0, cargo: { type: 'water', amount: 1 } });
  s.water = c.game.waterCapacity;
  c.step();
  assert.equal(c.score, 0, 'a full water chamber earns no points');
  Object.assign(a, { state: 'deliver', route: [], wait: 0, cargo: { type: 'water', amount: 1 } });
  s.water -= 2;
  c.step();
  assert.equal(c.score, 10);
  c.step(TOTAL_STEPS - c.frame);
  assert.equal(c.score, s.delivered * 10 + s.deliveredWater * 5 + (c.missionComplete ? MISSION_BONUS : 0));
});

test('organic underground navigation follows the same polylines exposed to the renderer', () => {
  const g = new Game(null, () => .5, () => 0);
  g.build('store', 4);
  const tunnels = g.tunnels();
  assert.ok(tunnels.some(t => t.slot === 4 && t.progress === 0));
  assert.ok(!tunnels.some(t => t.slot === 5));
  const segments = tunnels.flatMap(t => t.points.slice(1).map((p, i) => [t.points[i], p]));
  const distanceToTunnel = p => Math.min(...segments.map(([a, b]) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
  }));
  const route = g.route(SLOTS[1], SLOTS[4]);
  assert.deepEqual(route.at(-1), SLOTS[4]);
  assert.ok(route.some(p => p.x !== 600 && p.y > 350 && p.y < 510));
  route.forEach((p, i) => {
    assert.ok(distanceToTunnel(p) < .001);
    if (i) assert.ok(distanceToTunnel({ x: (p.x + route[i - 1].x) / 2, y: (p.y + route[i - 1].y) / 2 }) < .001);
  });
});

test('old ambient saves receive the new delivery statistic and keep their workers', () => {
  const g = new Game(null, () => .5, () => 0), old = JSON.parse(g.serialize());
  delete old.deliveredWater;
  const restored = new Game(old);
  assert.equal(restored.s.deliveredWater, 0);
  assert.equal(restored.s.ants.length, 12);
  restored.s.deliveredWater = 7;
  assert.equal(new Game(restored.serialize()).s.deliveredWater, 7);
});

test('excavators stop at the visible tunnel frontier and advance it with construction', () => {
  const g = new Game(null, () => .5, () => 0);
  g.build('store', 4);
  g.s.auto = false; g.s.allocation = { gather:0,scout:0,dig:12,care:0 };
  const room = g.s.rooms.find(r => r.slot === 4), first = g.excavationPoint(room);
  g.tick(.1);
  assert.deepEqual(g.s.ants[0].route.at(-1), first);
  assert.ok(Math.hypot(first.x-SLOTS[4].x, first.y-SLOTS[4].y)>300,'first dig is at the branch mouth');
  room.progress=35;
  const halfway = g.excavationPoint(room);
  assert.ok(Math.hypot(halfway.x-SLOTS[4].x, halfway.y-SLOTS[4].y)<Math.hypot(first.x-SLOTS[4].x, first.y-SLOTS[4].y));
  room.progress=70;
  assert.ok(Math.hypot(g.excavationPoint(room).x-SLOTS[4].x,g.excavationPoint(room).y-SLOTS[4].y)<.0001);
});
