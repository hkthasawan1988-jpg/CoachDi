'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../booking-server-client-core.js');

test('request tracker reuses an unfinished request and rotates after completion', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const first = Core.tracker(storage), id = first.get('athlete_1', 'create:coach:date:9');
  assert.equal(first.get('athlete_1', 'create:coach:date:9'), id);
  assert.equal(Core.tracker(storage).get('athlete_1', 'create:coach:date:9'), id);
  first.complete('athlete_1', 'create:coach:date:9');
  assert.notEqual(first.get('athlete_1', 'create:coach:date:9'), id);
});

test('proof accepts only supported images within the configured size', () => {
  assert.deepEqual(Core.proof({ name: 'สลิป final.png', type: 'image/png', size: 1024 }, 2048), { name: '_____final.png', contentType: 'image/png', size: 1024 });
  assert.throws(() => Core.proof({ name: 'proof.pdf', type: 'application/pdf', size: 10 }, 2048), /JPG/);
  assert.throws(() => Core.proof({ name: 'large.jpg', type: 'image/jpeg', size: 3000 }, 2048), /0 MB/);
});

test('callable errors prefer the server detail code and produce Thai guidance', () => {
  assert.equal(Core.errorCode({ code: 'functions/failed-precondition', details: { code: 'SLOT_ALREADY_LOCKED' } }), 'SLOT_ALREADY_LOCKED');
  assert.match(Core.errorText({ details: { code: 'REFUND_ACCOUNT_REQUIRED' } }), /บัญชีรับเงินคืน/);
  assert.match(Core.errorText({ code: 'functions/unauthenticated' }), /เข้าสู่ระบบ/);
});

test('Group Class server errors have clear Thai recovery messages',()=>{
  for(const code of ['INVALID_GROUP_CLASS','INVALID_GROUP_SCHEDULE','INVALID_GROUP_STATE','GROUP_CLASS_UNAVAILABLE','GROUP_REQUEST_EXISTS']) assert.notEqual(Core.errorText({details:{code}}),code);
});

