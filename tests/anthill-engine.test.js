const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, SLOTS } = require('../public/anthill-engine');
function colony() {
  let seed = 17;
  return new Game(null, () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646);
}
function advance(g, seconds) { for (let i = 0; i < seconds * 10; i++) g.tick(.1); }
test('food only increases after a physical delivery; discovery recruits collectors', () => {
  const g = colony();
  assert.equal(g.addFood('bread', 550), null);
  assert.equal(g.s.food, 25);
  advance(g, 5);
  assert.equal(g.s.food, 25);
  advance(g, 65);
  assert.ok(g.s.tasks.discovered);
  assert.ok(g.s.delivered > 0);
  assert.equal(g.s.food, 25 + g.s.delivered);
});
test('one carrier cannot collect pizza; two collect it and deliver without creating food', () => {
  const g = colony(); g.addFood('pizza', 550);
  const food = g.s.foods[0]; food.discovered = true;
  g.s.auto = false; g.s.allocation = { gather: 1, scout: 0, dig: 0, care: 0 };
  const a = g.s.ants[0]; Object.assign(a, { x: 550, y: 170, target: food.id, state: 'gather', role: 'gather' });
  g.tick(.1); assert.equal(food.amount, 32); assert.equal(a.state, 'waiting');
  const b = g.s.ants[1]; g.s.allocation.gather = 2;
  Object.assign(b, { x: 550, y: 170, target: food.id, state: 'gather', role: 'gather', route: [] });
  g.tick(.1); assert.equal(food.amount, 30); assert.ok(a.cargo); assert.ok(b.cargo);
  advance(g, 35); assert.ok(g.s.tasks.pizza); assert.ok(g.s.delivered >= 4);
});
test('construction needs workers; pause halts work; cancellation refunds half exactly once', () => {
  const g = colony(); g.s.auto = false; g.s.allocation = { gather: 0, scout: 0, dig: 0, care: 0 };
  assert.equal(g.build('store', 4), null); assert.equal(g.s.food, 10);
  advance(g, 20); assert.equal(g.s.rooms[4].progress, 0);
  g.s.allocation.dig = 3; advance(g, 30); assert.ok(g.s.rooms[4].progress > 0);
  g.s.rooms[4].paused = true; const progress = g.s.rooms[4].progress;
  advance(g, 30); assert.equal(g.s.rooms[4].progress, progress);
  g.cancelBuild(4); assert.equal(g.s.food, 17); assert.equal(g.s.rooms.length, 4);
  g.cancelBuild(4); assert.equal(g.s.food, 17);
});
test('finished nursery enables growth with food and water costs and a population cap', () => {
  const g = colony(); g.triggerEvent = () => {}; g.s.food = 80; g.build('nursery', 4);
  advance(g, 240);
  assert.equal(g.s.rooms[4].progress, 100);
  assert.ok(g.s.ants.length > 12);
  assert.ok(g.s.ants.length <= g.populationCapacity);
  assert.ok(g.s.water < 12);
  assert.ok(g.s.ants.every(a => a.energy >= 0 && a.energy <= 100));
});
test('reassignment completes existing cargo before changing roles', () => {
  const g = colony(); g.s.auto = false; g.s.allocation = { gather: 0, scout: 0, dig: 0, care: 12 };
  const a = g.s.ants[0]; a.role = 'gather'; a.cargo = { type: 'bread', amount: 1 };
  g.go(a, SLOTS[0], 'deliver'); advance(g, 3); assert.equal(a.role, 'gather');
  advance(g, 10); assert.equal(a.cargo, null); assert.equal(a.role, 'care'); assert.equal(g.s.delivered, 1);
});
test('invalid placement and unavailable resources do not spend food', () => {
  const g = colony(); const initial = g.s.food;
  assert.ok(g.build('store', 0)); assert.ok(g.build('bad', 4)); assert.ok(g.addFood('bread', 770));
  assert.ok(g.addFood('bad', 100)); assert.ok(g.addFood('bread', NaN)); assert.equal(g.s.food, initial);
  g.s.food = 0; assert.ok(g.upgrade('carry')); assert.equal(g.s.upgrades.carry, 0);
});
test('leaf bridge changes routes and guidance cannot cross soil or obstacles', () => {
  const g = colony(), a = { x: 650, y: 170 }, b = { x: 900, y: 170 };
  const around = g.surfaceRoute(a, b); assert.ok(around.some(p => p.y === 130));
  g.s.bridge = true; assert.ok(g.surfaceRoute(a, b).every(p => p.y === 170));
  assert.ok(g.setGuide([{x:500,y:300},{x:600,y:300}]));
  assert.ok(g.setGuide([{x:50,y:170},{x:650,y:170}]));
  assert.equal(g.setGuide([{x:500,y:160},{x:600,y:160}]), null);
  assert.ok(g.setGuide([{x:500,y:160},{x:600,y:160}]));
  advance(g, 26); assert.equal(g.s.guide, null);
});
test('saved names, builds, upgrades and in-flight cargo survive reload without duplication', () => {
  const g = colony(); g.s.ants[0].name = '<b>Mimi</b>'; g.s.ants[0].favorite = true;
  g.s.ants[0].cargo = { type: 'fruit', amount: 1 }; g.go(g.s.ants[0], SLOTS[0], 'deliver');
  g.build('store', 4); g.s.settings.sound = true;
  const restored = new Game(g.serialize());
  assert.equal(restored.s.ants[0].name, '<b>Mimi</b>'); assert.equal(restored.s.ants[0].favorite, true);
  assert.equal(restored.s.rooms.length, 5); assert.equal(restored.s.settings.sound, true);
  advance(restored, 10); assert.equal(restored.s.ants[0].cargo, null); assert.equal(restored.s.delivered, 1);
});
test('corrupt saves are rejected safely, including malicious room graphs and unlimited populations', () => {
  const g = colony();
  for (const data of ['bad', '{}', '{"version":99}', 'null']) assert.equal(new Game(data).s.ants.length, 12);
  for (const mutate of [s => {s.rooms[0].slot=999;},s => {s.rooms.push({id:4,slot:4,type:'queen',progress:0,level:1,paused:false});},s => {s.ants=Array(100).fill(s.ants[0]);},s => {s.upgrades.carry=-3;},s => {s.ants[0].cargo={type:'poison',amount:4};}]) {
    const s=JSON.parse(g.serialize());mutate(s);assert.equal(g.restore(s),false);assert.equal(g.s.food,25);
  }
});
test('long simulation remains finite and bounded, including event obstacles and capacity saturation', () => {
  const g = colony(); g.build('store', 4); advance(g, 1200);
  assert.ok(g.s.food <= g.capacity); assert.ok(g.s.water <= g.waterCapacity); assert.ok(g.s.foods.length <= 10);
  assert.ok(g.s.ants.every(a => Number.isFinite(a.x) && Number.isFinite(a.y) && a.energy >= 0));
  assert.equal(new Game(g.serialize()).s.time, g.s.time);
});
