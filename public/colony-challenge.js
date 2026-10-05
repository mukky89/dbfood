(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./anthill-engine'));
  else root.ColonyChallenge = factory(root.Anthill);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Anthill) {
  'use strict';
  const STEP = .1, DURATION = 180, TOTAL_STEPS = DURATION / STEP;
  const FOOD_BUDGET = 6, MAX_ACTIONS = 120, TARGET_DELIVERED = 40, MISSION_BONUS = 250;
  const FOODS = ['bread', 'fruit', 'seed', 'water'];
  const ROOMS = ['store', 'nursery', 'rest', 'water', 'tunnel'];
  const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  function keys(value, expected) {
    return plain(value) && Object.keys(value).length === expected.length && expected.every(k => Object.hasOwn(value, k));
  }
  function randomFor(seed) {
    let state = seed;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function actionData(action, recorded = false) {
    if (!plain(action)) throw new Error('Neplatný herný zásah.');
    const prefix = recorded ? ['frame'] : [];
    if (recorded && !integer(action.frame, 0, TOTAL_STEPS - 1)) throw new Error('Neplatný čas zásahu.');
    if (action.type === 'food') {
      if (!keys(action, [...prefix, 'type', 'food', 'x']) || !FOODS.includes(action.food) || !finite(action.x, 55, 1145)) throw new Error('Neplatná porcia jedla.');
      return { type: 'food', food: action.food, x: action.x };
    }
    if (action.type === 'build') {
      if (!keys(action, [...prefix, 'type', 'room', 'slot']) || !ROOMS.includes(action.room) || !integer(action.slot, 4, 9)) throw new Error('Neplatná stavba.');
      return { type: 'build', room: action.room, slot: action.slot };
    }
    if (action.type === 'guide') {
      if (!keys(action, [...prefix, 'type', 'points']) || !Array.isArray(action.points) || action.points.length < 2 || action.points.length > 32 || !Array.from(action.points).every(p => keys(p, ['x', 'y']) && finite(p.x, 40, 1160) && finite(p.y, 115, 190))) throw new Error('Stopa potrebuje 2 až 32 bodov na povrchu.');
      return { type: 'guide', points: action.points.map(p => ({ x: p.x, y: p.y })) };
    }
    throw new Error('Neznámy herný zásah.');
  }
  class Challenge {
    constructor(seed) {
      if (!integer(seed, 0, 0xFFFFFFFF)) throw new Error('Seed musí byť celé 32-bitové nezáporné číslo.');
      this.seed = seed;
      const random = randomFor(seed);
      // The clock is fixed too, so complete state agrees in the browser and server.
      this.game = new Anthill.Game(null, random, () => 0);
      // Choices change the workers' random draws, but may never reroll the
      // day's weather or event source. Events have an independent seeded stream.
      const eventRandom = randomFor((seed ^ 0x9E3779B9) >>> 0);
      const triggerEvent = this.game.triggerEvent.bind(this.game);
      this.game.triggerEvent = () => triggerEvent(eventRandom);
      this.frame = 0;
      this.actions = [];
      this.budget = FOOD_BUDGET;
      const sources = [['bread', 500 + Math.floor(random() * 51)], ['fruit', 650 + Math.floor(random() * 51)], ['seed', 190 + Math.floor(random() * 91)]];
      sources.forEach(([food, x], index) => {
        this.game.s.cooldown = 0;
        this.game.addFood(food, x);
        this.game.s.foods[index].discovered = index < 2;
        this.game.s.foods[index].trail = index < 2 ? .5 : 0;
      });
      this.game.s.cooldown = 0;
      this.game.s.tasks.placed = false;
    }
    get finished() { return this.frame >= TOTAL_STEPS; }
    get missionComplete() { return this.game.s.delivered >= TARGET_DELIVERED; }
    get score() { return Math.floor(this.game.s.delivered * 10 + this.game.s.deliveredWater * 5) + (this.missionComplete ? MISSION_BONUS : 0); }
    step(count = 1) {
      if (!integer(count, 0, TOTAL_STEPS)) throw new Error('Neplatný počet krokov.');
      const end = Math.min(TOTAL_STEPS, this.frame + count);
      while (this.frame < end) {
        // Workers assign their own roles; the ambient game may not grant free
        // upgrades or build rooms in a competitive run.
        this.game.tick(STEP, false);
        this.frame++;
      }
      return this;
    }
    dispatch(action) {
      if (this.finished) return 'Denná výzva sa skončila.';
      if (this.actions.length >= MAX_ACTIONS) return 'Dosiahol si limit herných zásahov.';
      let data;
      try { data = actionData(action); } catch (error) { return error.message; }
      let error;
      if (data.type === 'food') {
        if (this.budget === 0) return 'Minul si všetkých 6 porcií tejto výzvy.';
        error = this.game.addFood(data.food, data.x);
        if (!error) this.budget--;
      } else if (data.type === 'build') error = this.game.build(data.room, data.slot);
      else error = this.game.setGuide(data.points);
      if (error) return error;
      this.actions.push({ frame: this.frame, ...data });
      return null;
    }
  }
  function replay(seed, actions) {
    if (!Array.isArray(actions) || actions.length > MAX_ACTIONS) throw new Error('Neplatný alebo príliš dlhý záznam hry.');
    // Validate and copy the complete log before running any expensive simulation.
    let lastFrame = 0;
    const log = actions.map(action => {
      const data = actionData(action, true);
      if (action.frame < lastFrame) throw new Error('Zásahy musia byť zoradené podľa času.');
      lastFrame = action.frame;
      return { frame: action.frame, data };
    });
    const challenge = new Challenge(seed);
    for (const action of log) {
      challenge.step(action.frame - challenge.frame);
      const error = challenge.dispatch(action.data);
      if (error) throw new Error('Neplatný záznam hry: ' + error);
    }
    challenge.step(TOTAL_STEPS - challenge.frame);
    const s = challenge.game.s;
    return { score: challenge.score, delivered: s.delivered, deliveredWater: s.deliveredWater, missionComplete: challenge.missionComplete, frames: challenge.frame, population: s.ants.length, food: s.food, water: s.water };
  }
  return { Challenge, replay, STEP, DURATION, TOTAL_STEPS, FOOD_BUDGET, MAX_ACTIONS, TARGET_DELIVERED, MISSION_BONUS };
});
