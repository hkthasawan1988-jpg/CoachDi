'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('Firebase deploy config isolates the new mobile callable codebase', () => {
  const config = JSON.parse(readFileSync(join(__dirname, '../firebase.json'), 'utf8'));
  assert.deepEqual(config.functions, [{
    source: 'functions-mobile',
    codebase: 'mobile',
    ignore: ['node_modules', '.git', 'firebase-debug.log', 'firebase-debug.*.log'],
  }]);
  assert.equal(config.storage.rules, 'storage.rules');
  assert.equal(config.database.rules, 'database.rules.json');
});
