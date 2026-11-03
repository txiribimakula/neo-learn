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
    globalThis.api = { createSim, stepSim, addCustomer, setCookActive, setCookSlow, seekToEarliest, lagOf, ITEMS, COURSES };
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
const tags = entries => [...entries].map(entry => `${entry.order.letter}${entry.order.seq}`);

test('a letter is one person: it cannot be in the dining room twice', () => {
  const S = manualSim();
  assert.ok(api.addCustomer(S, 'A', 1));
  assert.equal(api.addCustomer(S, 'A', 1), null);
  assert.equal(S.customers.length, 1);
  run(S, 25);
  assert.equal(S.customers.length, 0);
  assert.ok(api.addCustomer(S, 'A', 1), 'it can come back once it has left');
});

test('random traffic never repeats a letter nor moves it to another bar', () => {
  const S = api.createSim(5);
  S.rate = 40;
  const barsOf = {};
  for(let i = 0; i < 90 * 60; i++){
    api.stepSim(S, 1 / 60);
    const letters = S.customers.map(c => c.letter);
    assert.equal(new Set(letters).size, letters.length);
  }
  for(const p of S.comandas){
    for(const entry of p.log) (barsOf[entry.order.letter] ||= new Set()).add(entry.order.partition);
  }
  assert.ok(Object.keys(barsOf).length >= 3);
  for(const bars of Object.values(barsOf)) assert.equal(bars.size, 1);
});

test('a menu always follows the course order and coffee only comes after dessert', () => {
  const S = manualSim();
  const sizes = new Set();
  for(let i = 0; i < 300; i++){
    const customer = api.addCustomer(S);
    const courses = [...customer.messages].map(m => api.ITEMS[m.items[0]].course);
    assert.deepEqual(courses, [...api.COURSES].slice(0, courses.length));
    sizes.add(courses.length);
    S.customers = S.customers.filter(c => c !== customer);
  }
  assert.deepEqual([...sizes].sort(), [1, 2, 3, 4], 'only a starter, no dessert, dessert and coffee all happen');
});

test('courses are marked as finished one by one while being eaten', () => {
  const S = manualSim();
  const customer = api.addCustomer(S, 'A', 4);
  const finishedOrder = [];
  for(let i = 0; i < 3000 && S.customers.length; i++){
    api.stepSim(S, 1 / 60);
    for(const message of customer.messages){
      if(message.finished && !finishedOrder.includes(message.seq)) finishedOrder.push(message.seq);
    }
  }
  assert.deepEqual(finishedOrder, [1, 2, 3, 4]);
});

test('one visit produces several messages with the same key, in sequence', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 3);
  run(S, 25);
  assert.deepEqual(tags(S.comandas[0].log), ['A1', 'A2', 'A3']);
  assert.equal(S.stats.ordered, 3);
  assert.equal(S.stats.served, 3);
});

test('two keys on one bar can interleave but each keeps its own sequence', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 4);
  api.addCustomer(S, 'C', 4);
  run(S, 40);
  const log = tags(S.comandas[0].log);
  assert.equal(log.length, 8);
  assert.deepEqual(log.filter(tag => tag[0] === 'A'), ['A1', 'A2', 'A3', 'A4']);
  assert.deepEqual(log.filter(tag => tag[0] === 'C'), ['C1', 'C2', 'C3', 'C4']);
  assert.notEqual(log.join(), [...log.filter(tag => tag[0] === 'A'), ...log.filter(tag => tag[0] === 'C')].join(), 'the keys mix on the bar');
});

test('a waiter takes the order at the table and sends it from the bar of the key', () => {
  const S = manualSim();
  const customer = api.addCustomer(S, 'B', 2);
  const seen = new Set();
  let messagesBeforeAsking = 0;
  for(let i = 0; i < 3000 && (S.customers.length || S.barWaiters.some(w => w.state !== 'idle')); i++){
    api.stepSim(S, 1 / 60);
    S.barWaiters.forEach(w => seen.add(`${w.state}@${w.row}`));
    if(customer.state === 'waitingWaiter') messagesBeforeAsking += S.tickets.length;
  }
  assert.equal(messagesBeforeAsking, 0, 'nothing is sent before the waiter reaches the table');
  assert.ok(seen.has('atTable@2'), 'B belongs to partition 1, the bottom bar');
  assert.ok(seen.has('order@2'));
  assert.ok(S.barWaiters.every(w => w.state === 'idle' && w.x === w.home.x && w.y === w.home.y), 'the waiter is back at its spot');
  assert.equal(S.stats.served, 2);
});

test('the staff is fixed and no waiter ever jumps from one place to another', () => {
  const S = api.createSim(9);
  S.rate = 40;
  const staff = [...S.barWaiters, ...S.trayWaiters];
  assert.equal(S.barWaiters.length, 2);
  assert.equal(S.trayWaiters.length, 2);
  const maxStep = 240 / 60 + 0.001;
  let previous = staff.map(w => [w.x, w.y]);
  for(let i = 0; i < 90 * 60; i++){
    api.stepSim(S, 1 / 60);
    const current = staff.map(w => [w.x, w.y]);
    current.forEach(([x, y], n) => {
      assert.ok(Math.hypot(x - previous[n][0], y - previous[n][1]) <= maxStep, `waiter ${n} jumped at step ${i}`);
    });
    previous = current;
  }
});

test('with all waiters busy a diner keeps waiting until one is free', () => {
  const S = manualSim();
  S.barWaiters.forEach(w => { w.state = 'busyForTest'; });
  const customer = api.addCustomer(S, 'A', 1);
  run(S, 5);
  assert.equal(customer.state, 'waitingWaiter');
  S.barWaiters[0].state = 'idle';
  run(S, 25);
  assert.equal(S.stats.served, 1);
});

test('the diner stays at the table until everything is eaten, in order of arrival', () => {
  const S = manualSim();
  const customer = api.addCustomer(S, 'A', 3);
  const eaten = [];
  let leftWith;
  for(let i = 0; i < 3000 && S.customers.length; i++){
    const before = customer.eating;
    const state = customer.state;
    api.stepSim(S, 1 / 60);
    if(customer.eating && customer.eating !== before) eaten.push(customer.eating.seq);
    if(customer.state === 'leave' && state !== 'leave') leftWith = customer.eaten;
  }
  assert.deepEqual(eaten, [1, 2, 3]);
  assert.equal(leftWith, 3);
});

test('two tray waiters carry one plate each and a plate leaves the counter when taken', () => {
  const S = manualSim();
  for(const letter of 'ABCDEF') api.addCustomer(S, letter, 2);
  let bothCarrying = false;
  for(let i = 0; i < 60 * 70; i++){
    api.stepSim(S, 1 / 60);
    const carrying = S.trayWaiters.filter(w => w.plate);
    if(carrying.length === 2){
      bothCarrying = true;
      assert.notEqual(carrying[0].plate.letter, carrying[1].plate.letter, 'never two plates for one diner at once');
    }
  }
  assert.ok(bothCarrying, 'both waiters work at the same time');
  assert.equal(S.counter.length, 0);
  assert.equal(S.stats.served, 12);
  assert.ok(S.trayWaiters.every(w => w.state === 'idle'));
});

test('a diner gets the courses in order even with two tray waiters', () => {
  const S = manualSim();
  const customer = api.addCustomer(S, 'A', 4);
  const received = [];
  for(let i = 0; i < 60 * 60; i++){
    const before = customer.plates.length + customer.eaten + (customer.eating ? 1 : 0);
    api.stepSim(S, 1 / 60);
    const after = customer.plates.length + customer.eaten + (customer.eating ? 1 : 0);
    if(after > before) received.push(customer.plates.at(-1)?.seq ?? customer.eating?.seq);
  }
  assert.deepEqual(received, [1, 2, 3, 4]);
});

test('reading commits the offset but keeps the message in the log', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 1);
  run(S, 15);
  const bar = S.comandas[0];
  assert.equal(bar.log.length, 1);
  assert.equal(bar.committed, 1);
  assert.equal(api.lagOf(bar), 0);
  assert.equal(S.stats.served, 1);
});

test('a slow cook keeps more lag on its own bar than the other', () => {
  const S = api.createSim(3);
  S.rate = 40;
  api.setCookSlow(S, 1, true);
  const total = [0, 0];
  for(let i = 0; i < 90 * 60; i++){
    api.stepSim(S, 1 / 60);
    S.comandas.forEach((p, part) => { total[part] += api.lagOf(p); });
  }
  assert.ok(total[1] > total[0] * 1.5, `lag over time ${total}`);
});

test('a cook leaving triggers a rebalance and its unfinished message is re-read once', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 1);
  for(let i = 0; i < 1200 && S.cooks[0].job?.phase !== 'cook'; i++) api.stepSim(S, 1 / 60);
  assert.equal(S.cooks[0].job.phase, 'cook');

  api.setCookActive(S, 0, false);
  assert.ok(S.rebalance);
  assert.equal(S.comandas[0].committed, 0);
  run(S, 0.5);
  assert.ok(S.cooks.every(c => !c.job), 'nobody fetches during the rebalance');

  run(S, 2);
  assert.equal(S.rebalance, null);
  assert.equal(S.generation, 2);
  assert.deepEqual(assignment(S), [[], [0, 1]]);

  run(S, 15);
  assert.equal(S.stats.served, 1);
  assert.equal(S.stats.duplicates, 0);
});

test('the rebalance waits for a member still holding work', () => {
  const S = manualSim();
  api.addCustomer(S, 'B', 1);
  api.setCookSlow(S, 1, true);
  for(let i = 0; i < 1200 && S.cooks[1].job?.phase !== 'cook'; i++) api.stepSim(S, 1 / 60);
  api.setCookActive(S, 0, false);
  run(S, 1.7);
  if(!S.cooks[1].job) assert.fail('precondition: the slow cook is still cooking');
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
  assert.deepEqual(assignment(S), [[0], [1]]);
  assert.equal(S.generation, 3);
});

test('retention only drops messages already read', () => {
  const S = manualSim();
  for(let visit = 0; visit < 6; visit++){
    api.addCustomer(S, 'A', 4);
    run(S, 30);
  }
  const bar = S.comandas[0];
  assert.equal(bar.end, 24);
  assert.equal(bar.log.length, 18);
  assert.equal(bar.earliest, 6);
  assert.equal(bar.committed, 24);
  assert.equal(S.stats.served, 24);
});

test('without cooks the guests wait: nothing is lost, it just builds lag', () => {
  const S = manualSim();
  [0, 1].forEach(id => api.setCookActive(S, id, false));
  run(S, 3);
  api.addCustomer(S, 'A', 4);
  api.addCustomer(S, 'C', 4);
  run(S, 20);
  const bar = S.comandas[0];
  assert.equal(api.lagOf(bar), 8);
  assert.equal(S.customers.filter(c => c.state === 'seated').length, 2);
  [0, 1].forEach(id => api.setCookActive(S, id, true));
  run(S, 50);
  assert.equal(S.stats.served, 8);
  assert.equal(S.customers.length, 0);
});

test('rewinding re-reads retained messages and produces surplus plates', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 2);
  api.addCustomer(S, 'B', 1);
  run(S, 30);
  assert.equal(S.stats.served, 3);
  api.seekToEarliest(S, 0);
  assert.equal(api.lagOf(S.comandas[0]), 2);
  run(S, 20);
  assert.equal(api.lagOf(S.comandas[0]), 0);
  assert.equal(S.stats.served, 3);
  assert.equal(S.stats.duplicates, 2);
});

test('every message is accounted for in a long mixed run', () => {
  const S = api.createSim(21);
  S.rate = 40;
  run(S, 30);
  api.setCookSlow(S, 1, true);
  api.setCookActive(S, 0, false);
  run(S, 40);
  api.setCookActive(S, 0, true);
  api.setCookSlow(S, 1, false);
  run(S, 40);
  S.rate = 0;
  run(S, 90);
  const {ordered, served, duplicates} = S.stats;
  assert.ok(ordered > 40, `ordered ${ordered}`);
  assert.equal(served, ordered);
  assert.equal(duplicates, 0);
  assert.equal(S.customers.length, 0);
  assert.ok(S.barWaiters.every(w => w.state === 'idle'));
  assert.equal(S.counter.length, 0);
  for(const p of S.comandas){
    const offsets = [...p.log].map(entry => entry.offset);
    assert.deepEqual(offsets, offsets.map((_, i) => p.earliest + i));
    assert.equal(api.lagOf(p), 0);
  }
});
