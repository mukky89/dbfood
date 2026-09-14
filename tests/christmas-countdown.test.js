const test = require('node:test');
const assert = require('node:assert/strict');
const remaining = require('../public/christmas-countdown.js');

test('counts to Slovak Christmas Eve, including the autumn clock change', () => {
  assert.deepEqual(remaining(new Date('2026-09-14T12:00:00Z')),
    { festive: false, days: 100, hours: 11, minutes: 0, seconds: 0 });
  assert.deepEqual(remaining(new Date('2026-12-23T22:59:59Z')),
    { festive: false, days: 0, hours: 0, minutes: 0, seconds: 1 });
});
test('shows Christmas greeting from December 24 through 26 in Slovakia', () => {
  for (const instant of ['2026-12-23T23:00:00Z', '2026-12-26T22:59:59Z']) {
    assert.deepEqual(remaining(new Date(instant)),
      { festive: true, days: 0, hours: 0, minutes: 0, seconds: 0 });
  }
});
test('rolls over to next Christmas after the holidays without negative values', () => {
  assert.equal(remaining(new Date('2026-12-26T23:00:00Z')).days, 362);
  assert.equal(remaining(new Date('2027-01-01T00:00:00+01:00')).days, 357);
  assert.equal(remaining(new Date('2028-01-01T00:00:00+01:00')).days, 358);
});
