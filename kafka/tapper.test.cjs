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
function manualSim(){
  const S = api.createSim(11);
  S.rate = 0;
  return S;
}
// Round-trip through JSON: arrays built inside the vm context fail deepEqual here.
const assignment = S => JSON.parse(JSON.stringify(S.cooks.map(c => c.partitions)));

test('a letter is a key: all its orders land on the same bar', () => {
  const S = manualSim();
  for(const letter of 'ABCDEF'){
    const first = api.addCustomer(S, letter).partition;
    assert.equal(api.addCustomer(S, letter).partition, first);
  }
  assert.equal(api.addCustomer(S, 'A').partition, api.addCustomer(S, 'D').partition);
  assert.notEqual(api.addCustomer(S, 'A').partition, api.addCustomer(S, 'B').partition);
});

test('random traffic never sends a letter to another bar', () => {
  const S = api.createSim(5);
  S.rate = 90;
  const barsOf = {};
  run(S, 30);
  for(const p of S.comandas){
    for(const entry of p.log) (barsOf[entry.order.letter] ||= new Set()).add(entry.order.partition);
  }
  assert.ok(Object.keys(barsOf).length >= 3);
  for(const bars of Object.values(barsOf)) assert.equal(bars.size, 1);
});

test('orders of a key enter the log and come out as plates in sequence', () => {
  const S = manualSim();
  const ids = [];
  for(let i = 0; i < 5; i++) ids.push(api.addCustomer(S, 'A').id);
  run(S, 40);
  const inLog = S.comandas[0].log.map(entry => entry.order.id);
  const inPlates = S.platos.log.map(entry => entry.order.id);
  assert.equal(JSON.stringify(inLog), JSON.stringify(ids));
  assert.equal(JSON.stringify(inPlates), JSON.stringify(ids));
  assert.equal(S.stats.served, 5);
});

test('customers order at their bar, then wait and eat at the dining table', () => {
  const S = manualSim();
  const order = api.addCustomer(S, 'A');
  const customer = S.customers[0];
  const states = new Set();
  let rowWhileOrdering, rowWhileEating;
  for(let i = 0; i < 1500 && S.customers.length; i++){
    api.stepSim(S, 1 / 60);
    states.add(customer.state);
    if(customer.state === 'order') rowWhileOrdering = customer.row;
    if(customer.state === 'eat') rowWhileEating = customer.row;
  }
  assert.equal(order.partition, 0);
  assert.equal(rowWhileOrdering, 0);
  assert.equal(rowWhileEating, 3);
  assert.ok(states.has('eat'));
  assert.equal(S.customers.length, 0);
  assert.ok(S.seats.every(seat => seat === null), 'the seat is free again');
});

test('a full table keeps latecomers at the door until a seat frees up', () => {
  const S = manualSim();
  [0, 1, 2].forEach(id => api.setCookActive(S, id, false));
  run(S, 3);
  for(let i = 0; i < 22; i++){
    api.addCustomer(S, 'ABC'[i % 3]);
    run(S, 1);
  }
  run(S, 6);
  assert.ok(S.seats.every(seat => seat !== null));
  assert.ok(S.customers.filter(c => c.state === 'queue').length >= 1);
  [0, 1, 2].forEach(id => api.setCookActive(S, id, true));
  run(S, 90);
  assert.equal(S.customers.length, 0);
  assert.equal(S.stats.served + S.stats.lost, S.stats.ordered);
});

test('reading commits the offset but keeps the order in the log', () => {
  const S = manualSim();
  api.addCustomer(S, 'A');
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
  api.addCustomer(S, 'A');
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
  api.addCustomer(S, 'A');
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
  const S = manualSim();
  [0, 1, 2].forEach(id => api.setCookActive(S, id, false));
  run(S, 3);
  for(let i = 0; i < 16; i++){
    api.addCustomer(S, 'A');
    run(S, 2);
  }
  run(S, 6);
  const bar = S.comandas[0];
  assert.equal(bar.end, 16);
  assert.equal(bar.log.length, 14);
  assert.equal(bar.earliest, 2);
  assert.equal(bar.committed, 2);
  assert.equal(S.stats.lost, 2);
  assert.equal(S.customers.length, 14);
  assert.equal(S.customers.filter(c => c.state === 'wait').length, 14);
});

test('rewinding re-reads retained orders and produces surplus plates', () => {
  const S = manualSim();
  for(const letter of 'ABC') api.addCustomer(S, letter);
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
