import test from 'node:test';
import assert from 'node:assert/strict';
import { dayAt, shiftDay, validDay, metrics } from '../server/domain.js';

test('streak survives until the end of today and resets after a missed day',()=>{
  const cs=['2026-03-07','2026-03-08','2026-03-09'].map(day=>({day}));
  assert.equal(metrics(cs,'2026-03-10').streak,3);
  assert.equal(metrics(cs,'2026-03-11').streak,0);
  assert.equal(metrics(cs,'2026-03-11').best,3);
});
test('many tasks give XP but only one streak day',()=>{
  assert.deepEqual(metrics([{day:'2026-11-23'},{day:'2026-11-23'}],'2026-11-23'),{streak:1,best:1,xp:20,level:1,activeDays:1});
});
test('timezone and date arithmetic handle midnight, leap days and DST',()=>{
  assert.equal(dayAt('America/Los_Angeles',new Date('2026-11-24T02:00:00Z')),'2026-11-23');
  assert.equal(shiftDay('2026-03-08',1),'2026-03-09');
  assert.equal(shiftDay('2024-02-28',1),'2024-02-29');
  assert.equal(validDay('2026-02-30'),false);
  assert.equal(validDay('2024-02-29'),true);
});
