'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the Kafka model of the single-file page without a DOM.
function harness(){
  const html = fs.readFileSync(path.join(__dirname, 'tapper.html'), 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new Function(source);
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf('// initial\n')) + `
    globalThis.api = { createSim, stepSim, addCustomer, setCookActive, setCookSlow, seekToEarliest, lagOf };
  })();`, context);
  return context.api;
}
const api = harness();
function run(S, seconds){
  for(let i = 0; i < seconds * 60; i++) api.stepSim(S, 1 / 60);
}
function manualSim(mode = 'rr'){
  const S = api.createSim(11);
  S.rate = 0;
  S.mode = mode;
  return S;
}
// Round-trip through JSON: arrays built inside the vm context fail deepEqual here.
const assignment = S => JSON.parse(JSON.stringify(S.cooks.map(c => c.partitions)));

test('without a key orders take turns across the three bars', () => {
  const S = manualSim();
  const partitions = Array.from({length:6}, () => api.addCustomer(S).partition);
  assert.deepEqual(partitions, [0, 1, 2, 0, 1, 2]);
});

test('with a key every order of a customer lands on the same bar', () => {
  const S = manualSim('key');
  for(const letter of 'ABCDEF'){
    const first = api.addCustomer(S, letter).partition;
    assert.equal(api.addCustomer(S, letter).partition, first);
  }
  assert.equal(api.addCustomer(S, 'A').partition, api.addCustomer(S, 'D').partition);
});

test('reading commits the offset but keeps the order in the log', () => {
  const S = manualSim();
  api.addCustomer(S);
  run(S, 15);
  const bar = S.comandas[0];
  assert.equal(bar.log.length, 1);
  assert.equal(bar.committed, 1);
  assert.equal(api.lagOf(bar), 0);
  assert.equal(S.platos.end, 1);
  assert.equal(S.stats.served, 1);
  assert.equal(S.customers.length, 0);
});

test('a slow cook only builds lag on its own bar', () => {
  const S = api.createSim(3);
  S.rate = 50;
  api.setCookSlow(S, 1, true);
  run(S, 45);
  assert.ok(api.lagOf(S.comandas[1]) >= 3, `lag ${api.lagOf(S.comandas[1])}`);
  assert.ok(api.lagOf(S.comandas[0]) <= 2);
  assert.ok(api.lagOf(S.comandas[2]) <= 2);
});

test('a cook leaving triggers a rebalance and its unfinished order is re-read once', () => {
  const S = manualSim();
  api.addCustomer(S);
  for(let i = 0; i < 600 && S.cooks[0].job?.phase !== 'cook'; i++) api.stepSim(S, 1 / 60);
  assert.equal(S.cooks[0].job.phase, 'cook');

  api.setCookActive(S, 0, false);
  assert.ok(S.rebalance);
  assert.equal(S.comandas[0].committed, 0);
  run(S, 0.5);
  assert.ok(S.cooks.every(c => !c.job), 'nobody fetches during the rebalance');

  run(S, 2);
  assert.equal(S.rebalance, null);
  assert.equal(S.generation, 2);
  assert.deepEqual(assignment(S), [[], [0, 1], [2]]);

  run(S, 12);
  assert.equal(S.stats.served, 1);
  assert.equal(S.stats.duplicates, 0);
});

test('the rebalance waits for a member still holding work', () => {
  const S = manualSim();
  api.addCustomer(S);
  api.setCookSlow(S, 0, true);
  for(let i = 0; i < 600 && S.cooks[0].job?.phase !== 'cook'; i++) api.stepSim(S, 1 / 60);
  api.setCookActive(S, 2, false);
  run(S, 2);
  assert.ok(S.cooks[0].job, 'precondition: the slow cook is still cooking');
  assert.ok(S.rebalance);
  run(S, 25);
  assert.equal(S.rebalance, null);
  assert.equal(S.stats.served, 1);
});

test('a returning cook gets its share back', () => {
  const S = manualSim();
  api.setCookActive(S, 0, false);
  run(S, 3);
  api.setCookActive(S, 0, true);
  run(S, 3);
  assert.deepEqual(assignment(S), [[0], [1], [2]]);
  assert.equal(S.generation, 3);
});

test('retention deletes unread orders and their customers leave angry', () => {
  const S = manualSim('key');
  [0, 1, 2].forEach(id => api.setCookActive(S, id, false));
  run(S, 3);
  for(let i = 0; i < 16; i++){
    api.addCustomer(S, 'A');
    run(S, 2);
  }
  run(S, 2);
  const bar = S.comandas[0];
  assert.equal(bar.end, 16);
  assert.equal(bar.log.length, 14);
  assert.equal(bar.earliest, 2);
  assert.equal(bar.committed, 2);
  assert.equal(S.stats.lost, 2);
  assert.equal(S.customers.filter(c => c.state === 'wait').length, 14);
});

test('rewinding re-reads retained orders and produces surplus plates', () => {
  const S = manualSim();
  for(let i = 0; i < 3; i++) api.addCustomer(S);
  run(S, 15);
  assert.equal(S.stats.served, 3);
  api.seekToEarliest(S, 0);
  assert.equal(api.lagOf(S.comandas[0]), 1);
  run(S, 12);
  assert.equal(api.lagOf(S.comandas[0]), 0);
  assert.equal(S.stats.served, 3);
  assert.equal(S.stats.duplicates, 1);
});

test('every order is accounted for in a long mixed run', () => {
  const S = api.createSim(21);
  S.rate = 60;
  run(S, 30);
  api.setCookSlow(S, 0, true);
  api.setCookActive(S, 1, false);
  run(S, 40);
  S.mode = 'key';
  api.setCookActive(S, 1, true);
  api.setCookSlow(S, 0, false);
  run(S, 40);
  S.rate = 0;
  run(S, 60);
  const {ordered, served, lost, duplicates} = S.stats;
  assert.ok(ordered > 80);
  assert.equal(served + lost, ordered);
  assert.equal(duplicates, 0);
  for(const p of S.comandas){
    const offsets = p.log.map(entry => entry.offset);
    assert.deepEqual(offsets, offsets.map((_, i) => p.earliest + i));
    assert.equal(api.lagOf(p), 0);
  }
});
