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

// Everything the page touches in the DOM answers with a callable no-op, so the whole script runs.
function stubDom(){
  const stub = () => new Proxy(function(){}, {
    get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'width' || key === 'height' ? 8 : stub()),
    set: () => true,
    apply: () => stub()
  });
  let pending = null;
  return {
    context:{document:stub(), performance:{now:() => 0}, requestAnimationFrame:callback => { pending = callback; }},
    frame:now => { const callback = pending; callback(now); }
  };
}

test('the whole scene draws without errors through every state', () => {
  const html = fs.readFileSync(path.join(__dirname, 'tapper.html'), 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = stubDom();
  vm.createContext(dom.context);
  vm.runInContext(source, dom.context);
  for(let i = 0; i < 300 * 30; i++) dom.frame(i * 100);
});

test('a cook counts as idle only while it has nothing to do', () => {
  const S = manualSim();
  const cook = S.cooks[0];
  run(S, 5);
  assert.ok(cook.idleFor > 4);
  api.addCustomer(S, 'A', 1);
  for(let i = 0; i < 60 * 30 && !cook.job; i++) api.stepSim(S, 1 / 60);
  assert.equal(cook.idleFor, 0);
});

test('beers are spaced out and never coincide, nor follow each other right away', () => {
  const S = manualSim();
  const intervals = [];
  const before = S.cooks.map(() => null);
  const open = S.cooks.map(() => null);
  for(let i = 0; i < 20 * 60 * 60; i++){
    api.stepSim(S, 1 / 60);
    assert.ok(S.cooks.filter(c => c.beer !== null).length <= 1, 'never at the same time');
    S.cooks.forEach((c, n) => {
      if(before[n] === null && c.beer !== null) open[n] = S.time;
      if(before[n] !== null && c.beer === null) intervals.push({cook:n, start:open[n], end:S.time});
      before[n] = c.beer;
    });
  }
  assert.ok(intervals.length >= 20, `beers ${intervals.length}`);
  intervals.forEach((beer, i) => {
    if(i === 0) return;
    assert.ok(beer.start - intervals[i - 1].end >= 4.99, 'a gap between any two beers');
  });
  assert.ok(new Set(intervals.map(beer => beer.cook)).size === 2, 'both cooks get one');
});

test('a cook left standing for a while is very likely to do something funny', () => {
  let drank = 0, runs = 0;
  for(let seed = 1; seed <= 40; seed++){
    const S = api.createSim(seed);
    S.rate = 0;
    let saw = false;
    for(let i = 0; i < 20 * 60; i++){
      api.stepSim(S, 1 / 60);
      if(S.cooks.some(c => c.beer !== null || c.oven !== null)) saw = true;
    }
    runs++;
    if(saw) drank++;
  }
  assert.equal(drank, runs, 'within 20 seconds of simulation');
});

test('going back to work starts the wait for a beer again', () => {
  const S = manualSim();
  const cook = S.cooks[0];
  run(S, 4);
  assert.notEqual(cook.beerIn, null);
  api.addCustomer(S, 'A', 1);
  for(let i = 0; i < 60 * 30 && !cook.job; i++) api.stepSim(S, 1 / 60);
  api.stepSim(S, 1 / 60);
  assert.equal(cook.beerIn, null);
});

test('the oven gag is rarer than a beer and never overlaps with another gag', () => {
  const S = manualSim();
  let ovens = 0, beers = 0;
  const before = S.cooks.map(() => ({beer:null, oven:null}));
  for(let i = 0; i < 60 * 60 * 60; i++){
    api.stepSim(S, 1 / 60);
    assert.ok(S.cooks.filter(c => c.beer !== null || c.oven !== null).length <= 1);
    S.cooks.forEach((c, n) => {
      if(before[n].oven === null && c.oven !== null) ovens++;
      if(before[n].beer === null && c.beer !== null) beers++;
      before[n] = {beer:c.beer, oven:c.oven};
    });
  }
  assert.ok(ovens >= 3, `${ovens} ovens`);
  assert.ok(beers > ovens, `${beers} beers, ${ovens} ovens`);
});

test('the oven holds either tentacles or a cat, the tentacles more often', () => {
  const kinds = {tentacles:0, cat:0};
  for(let seed = 1; seed <= 12; seed++){
    const S = api.createSim(seed);
    S.rate = 0;
    const before = S.cooks.map(() => null);
    for(let i = 0; i < 40 * 60 * 60; i++){
      api.stepSim(S, 1 / 60);
      S.cooks.forEach((c, n) => {
        if(before[n] === null && c.oven !== null) kinds[c.ovenKind]++;
        before[n] = c.oven;
      });
    }
  }
  assert.ok(kinds.cat > 0, `cats ${kinds.cat}`);
  assert.ok(kinds.tentacles > kinds.cat, `tentacles ${kinds.tentacles}, cats ${kinds.cat}`);
});

test('work interrupts the oven gag', () => {
  const S = manualSim();
  const cook = S.cooks[0];
  for(let i = 0; i < 60 * 60 * 30 && cook.oven === null; i++) api.stepSim(S, 1 / 60);
  assert.notEqual(cook.oven, null);
  api.addCustomer(S, 'A', 1);
  for(let i = 0; i < 60 * 30 && !cook.job; i++) api.stepSim(S, 1 / 60);
  assert.equal(cook.oven, null);
});

test('a beer stops as soon as there is work to do', () => {
  const S = manualSim();
  const cook = S.cooks[0];
  for(let i = 0; i < 60 * 200 && cook.beer === null; i++) api.stepSim(S, 1 / 60);
  assert.notEqual(cook.beer, null);
  api.addCustomer(S, 'A', 1);
  for(let i = 0; i < 60 * 30 && !cook.job; i++) api.stepSim(S, 1 / 60);
  assert.equal(cook.beer, null);
});

test('a diner with no food for a while gets impatient, and calms down when served', () => {
  const S = manualSim();
  [0, 1].forEach(id => api.setCookActive(S, id, false));
  const customer = api.addCustomer(S, 'A', 1);
  run(S, 3);
  assert.ok(customer.waited < 20);
  run(S, 21);
  assert.ok(customer.waited >= 20, 'nothing arrives without cooks');
  [0, 1].forEach(id => api.setCookActive(S, id, true));
  for(let i = 0; i < 60 * 30 && !customer.eating; i++) api.stepSim(S, 1 / 60);
  assert.ok(customer.eating);
  assert.equal(customer.waited, 0);
});

test('anger comes in short fits, not all the time', () => {
  const S = manualSim();
  [0, 1].forEach(id => api.setCookActive(S, id, false));
  const customer = api.addCustomer(S, 'A', 1);
  run(S, 20);
  const fits = [];
  let current = 0, angryFrames = 0;
  const frames = 120 * 60;
  for(let i = 0; i < frames; i++){
    api.stepSim(S, 1 / 60);
    if(customer.fit > 0){
      current++;
      angryFrames++;
    } else if(current){
      fits.push(current / 60);
      current = 0;
    }
  }
  assert.ok(fits.length >= 8, `${fits.length} fits`);
  fits.forEach(length => assert.ok(length < 2.5, `a fit of ${length}s`));
  assert.ok(angryFrames / frames < 0.4, 'calm most of the time');
});

test('impatience is much more common with a slow cook than without one', () => {
  // Share of the diners on the wire of the slow cook: fewer of them get through when it is slow.
  const impatientShare = slow => {
    const visits = new Set(), impatient = new Set();
    for(const seed of [1, 2, 3, 4, 5, 6, 7, 8]){
      const S = api.createSim(seed);
      if(slow) api.setCookSlow(S, 1, true);
      for(let i = 0; i < 400 * 60; i++){
        api.stepSim(S, 1 / 60);
        S.customers.forEach(c => {
          if(c.partition !== 1) return;
          visits.add(`${seed}-${c.visit}`);
          if(c.waited >= 20) impatient.add(`${seed}-${c.visit}`);
        });
      }
    }
    return impatient.size / visits.size;
  };
  const normal = impatientShare(false), slowed = impatientShare(true);
  assert.ok(normal < 0.25, `normal ${normal}`);
  assert.ok(slowed > normal * 2, `impatient share: ${normal} normal, ${slowed} with a slow cook`);
});

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

test('two keys on one wire each keep their own sequence', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 4);
  api.addCustomer(S, 'C', 4);
  run(S, 50);
  const log = tags(S.comandas[0].log);
  assert.equal(log.length, 8);
  assert.deepEqual(log.filter(tag => tag[0] === 'A'), ['A1', 'A2', 'A3', 'A4']);
  assert.deepEqual(log.filter(tag => tag[0] === 'C'), ['C1', 'C2', 'C3', 'C4']);
});

test('six diners take turns at three tables', () => {
  const S = manualSim();
  assert.ok(api.addCustomer(S, 'A', 1));
  assert.ok(api.addCustomer(S, 'B', 1));
  assert.ok(api.addCustomer(S, 'C', 1));
  assert.equal(api.addCustomer(S, 'D', 1), null, 'no free table');
  const tablesOf = {};
  const live = api.createSim(4);
  live.rate = 40;
  for(let i = 0; i < 180 * 60; i++){
    api.stepSim(live, 1 / 60);
    const seated = live.customers.filter(c => c.state !== 'leave');
    assert.ok(seated.length <= 3);
    assert.equal(new Set(seated.map(c => c.table)).size, seated.length, 'one diner per table');
    seated.forEach(c => { (tablesOf[c.letter] ||= new Set()).add(c.table); });
  }
  assert.equal(Object.keys(tablesOf).length, 6, 'all six people come');
  assert.ok(Object.values(tablesOf).some(tables => tables.size > 1), 'a person does not own a table');
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
  assert.equal(S.barWaiters.length, 1);
  assert.equal(S.trayWaiters.length, 1);
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

test('with the waiter busy a diner keeps waiting until it is free', () => {
  const S = manualSim();
  S.barWaiters[0].state = 'busyForTest';
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

test('the waiter walks up to the plate and takes it with the tray right under it', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 1);
  const w = S.trayWaiters[0];
  let plateX = null, checked = false;
  for(let i = 0; i < 60 * 30 && !checked; i++){
    if(S.counter.length) plateX = S.counter[0].x;
    api.stepSim(S, 1 / 60);
    if(w.plate){
      assert.equal(w.x + 14, plateX, 'tray in line with the plate');
      assert.equal(w.y, w.home.y);
      assert.equal(w.y - 30, 238, 'tray at the height of the counter');
      checked = true;
    }
  }
  assert.ok(checked);
});

test('the tray waiter carries one plate at a time and it leaves the counter when taken', () => {
  const S = manualSim();
  for(const letter of 'ABC') api.addCustomer(S, letter, 2);
  for(let i = 0; i < 60 * 70; i++){
    const waiting = S.counter.length;
    const carrying = S.trayWaiters[0].plate;
    api.stepSim(S, 1 / 60);
    if(!carrying && S.trayWaiters[0].plate) assert.ok(S.counter.length <= waiting, 'taken off the counter');
  }
  assert.equal(S.counter.length, 0);
  assert.equal(S.stats.served, 6);
  assert.ok(S.trayWaiters.every(w => w.state === 'idle'));
});

test('a diner gets the courses in order', () => {
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

test('the cook walks to the order, back to cook, and to the order again to commit', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 1);
  const cook = S.cooks[0], bar = S.comandas[0];
  const phases = [];
  let platesWhenCommitted = null, xWhenRead = null, xWhenCooking = null, xWhenCommitting = null;
  for(let i = 0; i < 60 * 30 && bar.committed === 0; i++){
    api.stepSim(S, 1 / 60);
    const phase = cook.job?.phase;
    if(phase && phases.at(-1) !== phase) phases.push(phase);
    if(phase === 'read') xWhenRead = cook.x;
    if(phase === 'cook') xWhenCooking = cook.x;
    if(phase === 'commit') xWhenCommitting = cook.x;
    if(bar.committed === 1) platesWhenCommitted = S.plates.length + S.counter.length + S.trayWaiters.filter(w => w.plate).length + S.stats.served;
  }
  assert.deepEqual(phases, ['toTicket', 'read', 'toStove', 'cook', 'plate', 'toCounter', 'drop', 'fromCounter', 'toCommit', 'commit']);
  assert.ok(xWhenRead < xWhenCooking, 'reads at the wire, cooks at the stove');
  assert.equal(xWhenCommitting, xWhenRead, 'reads and stamps from the same spot, under the order');
  assert.equal(platesWhenCommitted, 1, 'the plate left before the commit');
});

test('one dash is a single, uninterrupted move', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 1);
  const cook = S.cooks[0];
  const dashStarts = [];
  let wasDashing = false, lastPos = cook.pos;
  for(let i = 0; i < 60 * 30 && cook.job?.phase !== 'drop'; i++){
    api.stepSim(S, 1 / 60);
    const moved = cook.pos !== lastPos;
    if(moved && !wasDashing) dashStarts.push(i);
    wasDashing = moved;
    lastPos = cook.pos;
  }
  assert.equal(dashStarts.length, 1);
});

test('a dash between rows starts with a wind-up standing still', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 1);
  const cook = S.cooks[0];
  let windupFrames = 0;
  for(let i = 0; i < 60 * 30 && cook.job?.phase !== 'drop'; i++){
    const before = cook.pos;
    api.stepSim(S, 1 / 60);
    if(cook.job?.phase === 'toCounter' && cook.pos === before) windupFrames++;
  }
  assert.ok(windupFrames >= 10, `still for ${windupFrames} frames before dashing`);
});

test('the cook jumps to the counter to leave the plate and jumps back to its row', () => {
  const S = manualSim();
  api.addCustomer(S, 'B', 1);
  const cook = S.cooks[1];
  let framesBetweenRows = 0, posAtDrop = null, platesBeforeDrop = null;
  for(let i = 0; i < 60 * 30 && cook.job?.phase !== 'toCommit'; i++){
    const before = cook.pos;
    api.stepSim(S, 1 / 60);
    if(cook.pos !== before) framesBetweenRows++;
    if(cook.job?.phase === 'drop'){
      posAtDrop = cook.pos;
      platesBeforeDrop = S.plates.length + S.counter.length;
    }
  }
  assert.equal(posAtDrop, 1, 'at the middle row');
  assert.equal(platesBeforeDrop, 0, 'the plate reaches the counter from the hand');
  assert.equal(cook.job.phase, 'toCommit');
  assert.equal(cook.pos, 2, 'back to its own row');
  assert.ok(framesBetweenRows <= 24, `moving ${framesBetweenRows} frames there and back`);
});

test('a cook does not wait for the other one at the counter', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 1);
  const cook = S.cooks[0];
  for(let i = 0; i < 60 * 30 && cook.job?.phase !== 'toCounter'; i++) api.stepSim(S, 1 / 60);
  // The other cook is busy leaving a plate at that very moment.
  S.cooks[1].job = {part:1, offset:0, order:cook.job.order, stale:true, phase:'drop', timer:-100, dur:0};
  run(S, 0.5);
  assert.equal(cook.job.phase, 'drop', 'reached the counter all the same');
});

test('leaving after the plate but before the commit makes the order get cooked twice', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 1);
  const cook = S.cooks[0];
  for(let i = 0; i < 60 * 30 && cook.job?.phase !== 'toCommit'; i++) api.stepSim(S, 1 / 60);
  assert.equal(cook.job.phase, 'toCommit');
  assert.equal(S.comandas[0].committed, 0);
  api.setCookActive(S, 0, false);
  run(S, 25);
  assert.equal(S.comandas[0].committed, 1);
  assert.equal(S.stats.served, 1);
  assert.equal(S.stats.duplicates, 1);
});

test('a cook out of the group stays visible nearby and comes back walking', () => {
  const S = manualSim();
  const cook = S.cooks[0];
  api.setCookActive(S, 0, false);
  run(S, 3);
  assert.equal(cook.pos, 0);
  assert.equal(cook.x, 636, 'on its break spot');
  api.setCookActive(S, 0, true);
  run(S, 3);
  assert.equal(cook.x, 670, 'back at its stove');
});

test('a slow cook keeps more lag on its own wire than the other', () => {
  // Averaged over several runs at the default pace, since one run depends on who walks in.
  const total = [0, 0];
  for(const seed of [1, 2, 3, 4, 5]){
    const S = api.createSim(seed);
    api.setCookSlow(S, 1, true);
    for(let i = 0; i < 180 * 60; i++){
      api.stepSim(S, 1 / 60);
      S.comandas.forEach((p, part) => { total[part] += api.lagOf(p); });
    }
  }
  assert.ok(total[1] > total[0] * 1.3, `lag over time ${total}`);
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
  assert.equal(bar.log.length, 20);
  assert.equal(bar.earliest, 4);
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
  const {ordered, served} = S.stats;
  assert.ok(ordered > 25, `ordered ${ordered}`);
  assert.equal(served, ordered);
  assert.equal(S.customers.length, 0);
  assert.ok(S.barWaiters.every(w => w.state === 'idle'));
  assert.equal(S.counter.length, 0);
  for(const p of S.comandas){
    const offsets = [...p.log].map(entry => entry.offset);
    assert.deepEqual(offsets, offsets.map((_, i) => p.earliest + i));
    assert.equal(api.lagOf(p), 0);
  }
});
