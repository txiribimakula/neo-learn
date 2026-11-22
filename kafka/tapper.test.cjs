'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the Kafka model of the single-file page without a DOM.
function harness(page = 'tapper.html'){
  const html = fs.readFileSync(path.join(__dirname, page), 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new Function(source);
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf('// initial\n')) + `
    globalThis.api = { createSim, stepSim, createMaterialDemo, sendMaterialEvent, stepMaterialDemo, createNestingDemo, stepNestingDemo, addCustomer, setCookActive, setCookSlow, seekToEarliest, lagOf, poisonCook, consumerAction, UPGRADES, FIRST_SCENE, BOSS_SPOT, COOK_X, ...(typeof stepBossOil === 'function' ? {stepBossOil, bossOilPose, OIL_HIT_AT, OIL_RETURN_S, OIL_GAG_S} : {}), ...(typeof chickenAt === 'function' ? {chickenAt} : {}), ITEMS, COURSES };
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
  let pending = null, frameId = 0;
  const keyHandlers = [];
  const cover = {hidden:false, addEventListener(type, listener){ if(type === 'click') this.click = listener; }};
  const ending = {hidden:true, focus(){}}, nodes = {cover, ending, slides:{hidden:true, querySelectorAll:() => [], addEventListener(){}}};
  const document = new Proxy(stub(), {
    get(target, key){
      if(key === 'getElementById') return id => nodes[id] || stub();
      if(key === 'addEventListener') return (type, listener) => { if(type === 'keydown') keyHandlers.push(listener); };
      return Reflect.get(target, key);
    }
  });
  return {
    context:{document, structuredClone, setInterval(){}, performance:{now:() => 0}, requestAnimationFrame:callback => { pending = callback; return ++frameId; }},
    enterBar:() => { assert.equal(pending, null); cover.click(); assert.ok(cover.hidden); },
    press:key => keyHandlers.forEach(listener => listener({key, target:{closest:() => null}, preventDefault(){}})),
    frame:now => { const callback = pending; callback(now); }
  };
}

const pageScript = () => fs.readFileSync(path.join(__dirname, 'tapper.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function runScene(source, frames){
  const dom = stubDom();
  vm.createContext(dom.context);
  vm.runInContext(source, dom.context);
  dom.enterBar();
  for(let i = 0; i < frames; i++) dom.frame(i * 100);
}
// The page has no hooks for tests: a scene starts in another state by editing one line of its source.
function withLine(source, line, replacement){
  assert.ok(source.includes(line), `the page still has: ${line}`);
  return source.replace(line, replacement);
}

test('the whole scene draws without errors through every state', () => {
  runScene(pageScript(), 300 * 30);
});

test('the Kafka view draws at every stage, while dissolving both ways and under the tutorial', () => {
  const source = pageScript();
  const kafka = step => withLine(source, 'let kafkaStep = 0;', `let kafkaStep = ${step};`);
  for(let step = 1; step <= 5; step++) runScene(kafka(step), 1200);
  // Fully Kafka on the first frame, with the step back at the bar: everything dissolves back at once.
  runScene(withLine(source, 'const kafkaMix = KAFKA_STAGES.map(() => 0);', 'const kafkaMix = KAFKA_STAGES.map(() => 1);'), 1200);
  for(let step = 1; step <= 5; step++) runScene(withLine(kafka(5), 'let tutorialStep = 0;', `let tutorialStep = ${step};`), 300);
  // A consumer that crashes and comes back, drawn as a box.
  runScene(withLine(kafka(4), 'let speed = 1;', 'let speed = 1; poisonCook(S);'), 600);
});

test('every step from a queue to Kafka draws while it happens, in the bar and in the Kafka view', () => {
  const source = withLine(pageScript(), '    updateView(real);', '    if(!S.build && UPGRADES[S.upgrades]) UPGRADES[S.upgrades].start(S);\n    updateView(real);');
  runScene(source, 6000);
  runScene(withLine(source, 'let kafkaStep = 0;', 'let kafkaStep = 5;'), 6000);
  runScene(withLine(source, 'let tutorialStep = 0;', 'let tutorialStep = 3;'), 3000);
});

test('the advance button queues Kafka real after the last scene and reveals one stage per click', () => {
  const dom = stubDom();
  const source = withLine(pageScript(), '\n})();', `
    globalThis.revealTrace = [];
    tutorialDone = true;
    S.upgrades = UPGRADES.length - 1;
    S.build = {};
    nextStep();
    startPendingStep();
    revealTrace.push([kafkaStep, pendingStep]);
    S.upgrades++;
    S.build = null;
    startPendingStep();
    revealTrace.push([kafkaStep, pendingStep]);
    for(let i = 0; i < KAFKA_STAGES.length; i++){
      nextStep();
      revealTrace.push(kafkaStep);
    }
    updateView(1);
    revealTrace.push(!!S.materialDemo);
    nextStep();
    revealTrace.push(S.materialDemo.phase, S.materialDemo.current);
  })();`);
  vm.runInNewContext(source, dom.context);
  assert.deepEqual(JSON.parse(JSON.stringify(dom.context.revealTrace)), [[0, true], [1, false], 2, 3, 4, 5, 5, false, 'intro', null]);
});

test('material events update the projection in order and keep their records after deletion', () => {
  const S = api.createMaterialDemo(), demo = S.materialDemo;
  const tick = () => api.stepMaterialDemo(S, 0.1);
  const until = phase => {
    for(let i = 0; i < 100 && demo.phase !== phase; i++) tick();
    assert.equal(demo.phase, phase);
  };
  const expected = [
    {referencia:'AL-104', densidad:'2,68', acabado:'BRUTO'},
    {referencia:'AL-104', densidad:'2,70', acabado:'BRUTO'},
    {referencia:'AL-104', densidad:'2,70', acabado:'ANODIZADO'},
    null
  ];
  assert.ok(S.comandas.every(p => p.log.length === 0));
  until('send');
  for(let i = 0; i < expected.length; i++){
    if(i) api.sendMaterialEvent(S);
    until('apply');
    const p = S.comandas[demo.flight.part];
    assert.equal(p.log.length, i + 1);
    assert.equal(p.committed, i);
    assert.deepEqual(JSON.parse(JSON.stringify(demo.current)), expected[i - 1] ?? null);
    until('ready');
    assert.deepEqual(JSON.parse(JSON.stringify(demo.current)), expected[i]);
    assert.equal(p.committed, i + 1);
    tick();
    assert.equal(demo.flight, null, 'waits for the next click');
  }
  assert.deepEqual([...S.comandas[0].log].map(({offset, order}) => [offset, order.key, order.materialOp]), [
    [0, 'MAT-104', 'CREATE'], [1, 'MAT-104', 'UPDATE'], [2, 'MAT-104', 'UPDATE'], [3, 'MAT-104', 'DELETE']
  ]);
  assert.equal(S.comandas[1].end, 0);
});

test('pirate material groups commit independently and build different projections from one log', () => {
  const {createMaterialDemo, sendMaterialEvent, stepMaterialDemo} = harness('tapper-pirata.html');
  const S = createMaterialDemo(), demo = S.materialDemo;
  const until = predicate => {
    for(let i = 0; i < 500 && !predicate(); i++) stepMaterialDemo(S, 1 / 60);
    assert.ok(predicate());
  };
  for(let i = 0; i < 4; i++){
    if(i) sendMaterialEvent(S);
    until(() => demo.reader === 1);
    assert.equal(S.comandas[0].committed, i + 1);
    assert.equal(demo.reference.offsets[0], i, 'the reference group has its own commit');
    assert.equal(S.comandas[0].log.length, i + 1, 'both groups read the same published record');
    assert.equal(demo.current?.densidad ?? null, ['2,68', '2,70', '2,70', null][i]);
    until(() => demo.phase === 'ready');
    assert.equal(demo.reference.value, i === 3 ? null : 'AL-104');
    assert.deepEqual(Array.from(demo.reference.offsets), [i + 1, 0]);
  }
});

test('two partitions let the consumer reject an UPDATE before the earlier CREATE', () => {
  const S = api.createMaterialDemo(true), demo = S.materialDemo;
  const consumed = [];
  let previous;
  for(let i = 0; i < 300 && demo.phase !== 'ready'; i++){
    api.stepMaterialDemo(S, 0.05);
    if(demo.phase !== 'commit' || demo.flight === previous) continue;
    previous = demo.flight;
    consumed.push([previous.part, previous.order.materialOp]);
    if(previous.order.materialOp === 'UPDATE'){
      assert.ok(S.comandas[0].log[0].at < S.comandas[1].log[0].at, 'the CREATE was published first');
      assert.equal(S.comandas[0].committed, 0, 'P0 has not consumed the CREATE yet');
      assert.equal(demo.current, null);
      assert.equal(demo.updateRejected, true);
    }
  }
  assert.equal(demo.phase, 'ready');
  assert.deepEqual(consumed, [[1, 'UPDATE'], [0, 'CREATE']]);
  assert.equal(demo.current.densidad, '2,68');
  assert.deepEqual([...S.comandas].map(p => p.committed), [1, 1]);
});

test('the material demo renders every operation with the diagram in place', () => {
  let source = withLine(pageScript(), 'let S = createSim(Math.floor(Math.random() * 1e6), FIRST_SCENE);', 'let S = createMaterialDemo();');
  source = withLine(source, 'const kafkaMix = KAFKA_STAGES.map(() => 0);', 'const kafkaMix = KAFKA_STAGES.map(() => 1);');
  source = withLine(source, 'let kafkaStep = 0;', 'let kafkaStep = KAFKA_STAGES.length;');
  source = withLine(source, '    updateView(real);', "    if(S.materialDemo.phase === 'ready') sendMaterialEvent(S);\n    updateView(real);");
  runScene(source, 500);
  runScene(withLine(source, 'let S = createMaterialDemo();', 'let S = createMaterialDemo(true);'), 300);
});

test('nesting exposes idle capacity in Kafka and uses it with the same jobs in Service Bus', () => {
  const kafka = api.createNestingDemo('kafka');
  const bus = api.createNestingDemo('bus');
  const workload = demo => [...demo.jobs].map(j => [j.id, j.kind, j.duration]);
  assert.deepEqual(workload(kafka), workload(bus));
  for(const demo of [kafka, bus]){
    for(let i = 0; i < 2000 && demo.phase !== 'done'; i++){
      api.stepNestingDemo(demo, 1 / 60);
      if(demo.phase !== 'running') continue;
      if(demo.mode === 'bus') assert.ok(demo.workers.every(w => w.job), 'both receivers busy for this batch');
      if(demo.mode === 'kafka') assert.ok(demo.workers.every(w => !w.job || w.job.part === w.id));
    }
    assert.equal(demo.phase, 'done');
    assert.equal(demo.completed, demo.jobs.length);
    assert.ok(demo.jobs.every(job => job.status === 'done'));
  }
  assert.equal(kafka.elapsed, 12);
  assert.equal(kafka.elapsed - kafka.workers[1].busy, 9);
  assert.equal(bus.elapsed, 7.5);
  assert.ok(bus.workers.every(w => w.busy === bus.elapsed));
});

test('advance takes the completed material comparison into Kafka nesting and then Service Bus', () => {
  const dom = stubDom();
  const source = withLine(pageScript(), '\n})();', `
    tutorialDone = true;
    S = createMaterialDemo(true);
    S.materialDemo.phase = 'ready';
    nextStep();
    globalThis.modeTrace = [nestingDemo.mode];
    nextStep();
    modeTrace.push(nestingDemo.mode);
    for(let i = 0; i < 300 && nestingDemo.phase !== 'done'; i++) stepNestingDemo(nestingDemo, 0.1);
    draw();
    nextStep();
    modeTrace.push(nestingDemo.mode);
    draw();
    for(let i = 0; i < 300 && nestingDemo.phase !== 'done'; i++){
      stepNestingDemo(nestingDemo, 0.1);
      draw();
    }
    modeTrace.push(nestingDemo.phase, nestingDemo.kafkaResult, nestingDemo.elapsed, $('ending').hidden);
    nextStep();
    modeTrace.push($('ending').hidden);
  })();`);
  vm.runInNewContext(source, dom.context);
  assert.deepEqual([...dom.context.modeTrace], ['kafka', 'kafka', 'bus', 'done', 12, 7.5, true, false]);
});

test('in the Kafka view a consumer fetches an offset and then commits the next one', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 1);
  const cook = S.cooks[0];
  const seen = new Set();
  for(let i = 0; i < 60 * 60 && S.comandas[0].committed === 0; i++){
    api.stepSim(S, 1 / 60);
    seen.add(api.consumerAction(S, cook));
  }
  assert.equal(S.comandas[0].committed, 1);
  assert.deepEqual([...seen].filter(label => /^(FETCH|COMMIT)/.test(label)), ['FETCH 0', 'COMMIT 1']);
  assert.ok(seen.has('PROCESS') && seen.has('OUTPUT'), [...seen].join(', '));
  assert.equal(api.consumerAction(S, cook), 'POLL');
});

test('in the Kafka view the labels name leaving, rebalancing and crashing', () => {
  const S = manualSim();
  api.setCookActive(S, 0, false);
  assert.equal(api.consumerAction(S, S.cooks[0]), 'LEFT GROUP');
  assert.equal(api.consumerAction(S, S.cooks[1]), 'REBALANCE');
  run(S, 3);
  assert.equal(api.consumerAction(S, S.cooks[1]), 'POLL');
  api.setCookActive(S, 0, true);
  run(S, 3);
  const cook = api.poisonCook(S);
  run(S, 1);
  assert.equal(api.consumerAction(S, cook), 'FAILING');
  run(S, 1);
  assert.equal(api.consumerAction(S, cook), 'CRASHED');
  run(S, 7.5);
  assert.equal(api.consumerAction(S, cook), 'RESTART');
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

test('a busy kitchen upsets nobody: diners only bang the table when something went wrong', () => {
  const S = manualSim();
  [0, 1].forEach(id => api.setCookActive(S, id, false));
  const customer = api.addCustomer(S, 'A', 1);
  let angry = false;
  for(let i = 0; i < 60 * 60; i++){ api.stepSim(S, 1 / 60); angry ||= customer.upset > 0; }
  assert.equal(angry, false, 'a minute with no food, and no fits');
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

test('automatic diners fill both wires without changing the partition of any color', () => {
  for(let seed = 0; seed < 12; seed++){
    const S = api.createSim(seed);
    const diners = Array.from({length:3}, () => api.addCustomer(S));
    assert.notEqual(diners[0].partition, diners[1].partition);
    for(const diner of diners){
      const part = 'ABCDEF'.indexOf(diner.letter) % 2;
      assert.equal(diner.partition, part);
      assert.ok(diner.messages.every(message => message.partition === part));
    }

    const singleTable = api.createSim(seed);
    for(let i = 0; i < 6; i++){
      api.addCustomer(singleTable, null, 2);
      singleTable.customers = [];
    }
    assert.deepEqual([...singleTable.demandByPartition], [6, 6]);
  }
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

test('a pirate cook serves the plate, then jumps under its wire and pushes the rubber chicken on', () => {
  const pirates = harness('tapper-pirata.html');
  const S = pirates.createSim(11);
  S.rate = 0;
  pirates.addCustomer(S, 'A', 1);
  const phases = [], marks = [];
  let cook = null, part = null, rowWhenPushing = null;
  for(let i = 0; i < 60 * 30 && !(part !== null && S.comandas[part].committed === 1); i++){
    pirates.stepSim(S, 1 / 60);
    cook ??= S.cooks.find(c => c.job);
    if(!cook?.job) continue;
    part = cook.job.part;
    if(phases.at(-1) !== cook.job.phase) phases.push(cook.job.phase);
    if(cook.job.phase === 'commit'){
      rowWhenPushing = cook.pos;
      marks.push(pirates.chickenAt(S, part));
    }
  }
  assert.deepEqual(phases.slice(-4), ['toCounter', 'drop', 'toCommit', 'commit']);
  assert.equal(S.comandas[part].committed, 1);
  assert.equal(rowWhenPushing, S.rows[part], 'pushes it from under its own wire');
  assert.equal(marks[0], 0, 'the chicken waits for the push');
  assert.ok(marks.every((at, i) => i === 0 || (at >= marks[i - 1] && at - marks[i - 1] < 0.1)), 'then rolls forward without jumps');
  assert.ok(marks.at(-1) > 0.95);
});

test('pirate cooks walk along the aisle to the counter and back to each wire', () => {
  const pirates = harness('tapper-pirata.html');
  for(const [id, letter] of ['A', 'B'].entries()){
    const S = pirates.createSim(11);
    S.rate = 0;
    pirates.addCustomer(S, letter, 1);
    const cook = S.cooks[id], dt = 1 / 60;
    for(let i = 0; i < 1800 && cook.job?.phase !== 'toCounter'; i++) pirates.stepSim(S, dt);
    assert.equal(cook.job?.phase, 'toCounter');
    assert.equal(cook.pos, id * 2);
    let steps = 0;
    for(let i = 0; i < 180 && cook.job?.phase === 'toCounter'; i++){
      const before = cook.pos;
      pirates.stepSim(S, dt);
      assert.equal(cook.windup, 0);
      if(before === 1) continue;
      assert.ok(cook.walking && Math.abs(cook.pos - before) <= 0.03);
      assert.ok(Math.abs(cook.pos - 1) < Math.abs(before - 1));
      assert.equal(cook.x, pirates.COOK_X, 'changes rows in the aisle next to the stoves');
      steps++;
    }
    assert.ok(steps > 30);
    assert.equal(cook.job?.phase, 'drop');
    assert.equal(cook.pos, 1);
    assert.ok(cook.x < pirates.COOK_X, 'turns towards the counter after reaching its row');
    for(let i = 0; i < 180 && cook.job?.phase === 'drop'; i++) pirates.stepSim(S, dt);
    assert.equal(cook.job?.phase, 'toCommit');
    steps = 0;
    for(let i = 0; i < 180 && cook.job?.phase === 'toCommit'; i++){
      const before = cook.pos;
      pirates.stepSim(S, dt);
      assert.equal(cook.windup, 0);
      if(cook.pos === before) continue;
      assert.equal(cook.x, pirates.COOK_X);
      assert.ok(cook.walking && Math.abs(cook.pos - before) <= 0.03);
      steps++;
    }
    assert.ok(steps > 30);
    assert.equal(cook.pos, id * 2);
    assert.equal(cook.job?.phase, 'commit');
  }
});

test('pirate commit markers start at the current offset when each chicken lands', () => {
  const filename = path.join(__dirname, 'tapper-pirata.html');
  const source = fs.readFileSync(filename, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const dom = stubDom();
  vm.runInNewContext(withLine(source, '\n})();', `
    S = createSim(7);
    S.features.commit = false;
    S.comandas.forEach((p, part) => Object.assign(p, {end:12 + part, position:8 + part}));
    updateView(1 / 60);
    S.features.commit = true;
    S.comandas.forEach(p => Object.assign(p, {committed:p.position, chickenIn:false}));
    for(let frame = 0; frame < 120; frame++) updateView(1 / 60);
    globalThis.firstOffsets = S.comandas.map((p, part) => {
      p.chickenIn = true;
      updateView(1 / 60);
      return view.chickens[part].at;
    });
  })();`), dom.context);
  assert.deepEqual(Array.from(dom.context.firstOffsets), [8, 9]);
});

test('the pirate tavern introduces the three captains and then both duellists', () => {
  const pirates = harness('tapper-pirata.html');
  const S = pirates.createSim(4, pirates.FIRST_SCENE);
  S.rate = 40;
  const visits = new Map();
  for(let i = 0; i < 180 * 60; i++){
    pirates.stepSim(S, 1 / 60);
    for(const c of S.customers) visits.set(c.visit, c.letter);
    assert.equal(new Set(S.customers.map(c => c.letter)).size, S.customers.length);
  }
  const cast = [...visits.values()];
  assert.deepEqual(cast.slice(0, 5), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(new Set(cast).size, 5);
  assert.ok(cast.length > 5, 'service continues after all five have arrived');
});

test('the pirate tavern shows each fix working in a step of its own', () => {
  const pirates = harness('tapper-pirata.html');
  const S = pirates.createSim(5, pirates.FIRST_SCENE);
  const tick = () => pirates.stepSim(S, 1 / 60);
  for(let i = 0; i < 20 * 60; i++) tick();
  const seen = {};
  while(S.upgrades < pirates.UPGRADES.length){
    const step = pirates.UPGRADES[S.upgrades], before = {...S.stats};
    for(let i = 0; i < 120 * 60 && !step.start(S); i++) tick();
    assert.ok(S.build, `${step.name} starts`);
    let takeover = null, tired = null, crowd = 0, firstPlate = null, marker = null, landings = [], busyThrow = false, bossLines = [];
    const recountStart = step.start.name === 'startRecount' ? S.comandas.map(p => p.earliest) : null;
    if(recountStart) assert.deepEqual(S.cashCount.map(marker => marker.offset), recountStart);
    for(let i = 0; i < 300 * 60 && S.build; i++){
      const build = S.build, who = S.cooks[build.who];
      if(build.customer && step.start.name === 'startMenus'){
        crowd = Math.max(crowd, S.customers.length);
        firstPlate ??= build.customer.plates[0]?.items[0];
      }
      if(build.phase === 'markCatch' && !marker) marker = S.comandas.map(p => [p.committed, p.position, p.chickenIn]);
      if(build.phase === 'markThrow'){
        const inNow = S.comandas.map(p => !!p.chickenIn).join();
        if(landings.at(-1) !== inNow) landings.push(inNow);
        busyThrow ||= S.cooks.some(k => k.job);
      }
      if(build.phase === 'markSay' && S.boss.say) bossLines = [...S.boss.say.lines];
      if(build.phase === 'signWrite'){
        assert.ok(S.boss.entering);
        assert.equal(S.barWaiters[0].state, 'idle');
      }
      if(build.phase === 'restEmpty' && !tired) tired = {id:who.id, hurt:!!(who.crutches || who.charred || who.grog), bottom:who.row === Math.max(...S.cooks.map(k => k.row)), table:S.closedTable};
      if(build.phase === 'restBoss') tired.emptied = !S.customers.some(c => c.table === tired.table);
      if(build.phase === 'restCover' && !takeover){
        const other = S.cooks.find(k => k.active && k.job && build.parts.includes(k.job.part));
        if(other) takeover = {offset:other.job.offset, mark:build.mark[other.job.part], wires:other.partitions.length, resting:!who.active};
      }
      tick();
    }
    assert.equal(S.build, null, `${step.name} finishes`);
    if(step.start.name === 'startRecount'){
      assert.deepEqual(Array.from(S.cashCount, (marker, part) => marker.offset - recountStart[part]), [2, 3]);
      assert.ok(S.cashCount.every((marker, part) => marker.marked && marker.offset < S.comandas[part].end));
    }
    seen[step.start.name] = {stats:Object.fromEntries(Object.keys(before).map(k => [k, S.stats[k] - before[k]])), marker, takeover, tired, crowd, firstPlate, landings, busyThrow, bossLines,
      partitions:S.cooks.map(k => [...k.partitions])};
    for(let i = 0; i < 3 * 60; i++) tick();
    if(step.start.name === 'startRest') seen.startRest.after = {active:S.cooks[tired.id].active, table:S.closedTable};

  }
  // Peek-lock: the forgotten order waits out its hourglass and is cooked, not lost.
  assert.equal(seen.startPeekFumes.stats.lapsed, 1);
  assert.equal(seen.startPeekFumes.stats.lost, 0);
  // Menus: a single diner, alone in the room, gets the flan before the paella.
  assert.equal(seen.startMenus.crowd, 1, 'the set-menu diner is the only one in the room');
  assert.equal(seen.startMenus.stats.outOfOrder, 1);
  assert.equal(seen.startMenus.firstPlate, 'flan');
  // A wire per color: the same set menu now arrives in order.
  assert.equal(seen.startOrderedMenu.stats.outOfOrder, 0);
  assert.ok(seen.startCommits.marker.every(([committed, read]) => committed === read));
  assert.ok(seen.startCommits.marker.some(([committed]) => committed > 1));
  // The boss brings the commits: he says it, with no chicken in the words, and throws one chicken
  // per wire, the top one first, while the cooks wait.
  assert.deepEqual(seen.startCommits.bossLines, ['¡Chavales!', 'COMMIT where', 'you are!']);
  assert.deepEqual(seen.startCommits.landings, ['false,false', 'true,false', 'true,true']);
  assert.ok(seen.startCommits.marker.every(([, , landed]) => landed));
  assert.equal(seen.startCommits.busyThrow, false);
  assert.equal(pirates.UPGRADES[10].start.name, 'startRecount');
  assert.equal(pirates.UPGRADES[11].start.name, 'startRest');
  assert.equal(pirates.UPGRADES[12].start.name, 'startLoss');
  // A rest: a table is left empty, and only then is the bottom cook, unhurt, sent for a rest. It
  // leaves cleanly, the other takes both wires from the stamps, and it stays that way: one
  // rebalance, nothing repeated, and the table stays empty but for the resting cook on it.
  const rest = seen.startRest;
  assert.equal(rest.tired.hurt, false, 'the cook sent for a rest has been through nothing');
  assert.equal(rest.tired.bottom, true, 'it is the cook of the bottom row');
  assert.equal(rest.tired.table, 2, 'the table left empty is the bottom one, level with its row');
  const resting = S.cooks[rest.tired.id].rest;
  assert.equal(resting.table, rest.tired.table);
  assert.equal(resting.sips, 3, 'until the beer is gone');
  assert.equal(resting.said, true, 'then it says it wants to be a pirate');
  assert.equal(resting.phase, 'doze', 'and falls asleep on the table');
  assert.equal(rest.tired.emptied, true);
  assert.deepEqual(rest.takeover && [rest.takeover.offset, rest.takeover.wires, rest.takeover.resting], [rest.takeover?.mark, 2, true]);
  assert.equal(rest.stats.rebalances, 1);
  assert.equal(rest.stats.duplicates, 0);
  assert.equal(rest.stats.lost, 0);
  assert.deepEqual(rest.after, {active:false, table:rest.tired.table});
  assert.ok(!S.customers.some(c => c.table === rest.tired.table), 'nobody sits at the closed table again');
});

test('the cat steals a ticket on its way to the top wire and the waiter retries when an ack is missing', () => {
  const pirates = harness('tapper-pirata.html');
  for(const boss of [false, true]){
    const S = pirates.createSim(5, {boss});
    S.rate = 0;
    assert.ok(pirates.UPGRADES.findLast(step => step.start.name === 'startLoss').start(S));
    // The cat lies above the top wire: orders for the bottom one go past it.
    const below = pirates.addCustomer(S, 'B', 2), bottom = S.comandas[below.partition];
    assert.ok(S.rows[below.partition] > Math.min(...S.rows));
    for(let i = 0; i < 1800 && bottom.end < 2; i++){
      pirates.stepSim(S, 1 / 60);
      assert.ok(!S.tickets.some(ticket => ticket.snatch));
    }
    assert.equal(bottom.end, 2);
    assert.equal(S.loseNext, 1);
    for(let i = 0; i < 3600 && S.customers.includes(below); i++) pirates.stepSim(S, 1 / 60);
    assert.equal(S.payments, 1, 'the first diner finishes and pays');

    const customer = pirates.addCustomer(S, 'A', 2);
    const stolen = customer.messages[1], partition = S.comandas[customer.partition];
    assert.equal(S.rows[customer.partition], Math.min(...S.rows));
    for(let i = 0; i < 1800 && !S.tickets.some(ticket => ticket.snatch); i++) pirates.stepSim(S, 1 / 60);
    assert.equal(S.tickets.find(ticket => ticket.snatch)?.order, stolen);
    assert.equal(S.stats.lost, 0);
    for(let i = 0; i < 120 && !S.stolen.length; i++) pirates.stepSim(S, 1 / 60);
    assert.equal(S.stolen[0]?.order, stolen);
    assert.equal(S.catStash.length, 0, 'the cat is still carrying the slip');
    assert.ok(stolen.lost);
    assert.equal(S.stats.lost, 1);
    assert.equal(partition.end, 1, 'the stolen ticket has no offset');
    assert.equal(stolen.ackAt, boss ? null : undefined);

    for(let i = 0; i < 3600; i++) pirates.stepSim(S, 1 / 60);
    assert.equal(S.stolen.length, 0, 'the cat is back on its board');
    assert.deepEqual([...S.catStash], [stolen], 'the original slip stays under its paws');
    assert.equal(S.stats.lost, 1);
    assert.equal(S.stats.resent, Number(boss));
    assert.equal(S.stats.gaveUp, Number(!boss));
    assert.equal(partition.end, boss ? 2 : 1);
    assert.equal(S.stats.served, boss ? 4 : 3);
    assert.equal(customer.eaten, boss ? 2 : 1);
    assert.equal(S.payments, boss ? 2 : 1, 'Bizum only pulses after a complete meal');
  }
});

test('every pirate mishap falls on the top cook, who climbs to the back wall for its crutches', () => {
  const pirates = harness('tapper-pirata.html');
  const S = pirates.createSim(5, pirates.FIRST_SCENE);
  const tick = () => pirates.stepSim(S, 1 / 60);
  for(let i = 0; i < 20 * 60; i++) tick();
  const hit = new Map();
  let maxUp = 0, upX = null;
  while(S.upgrades < pirates.UPGRADES.length && pirates.UPGRADES[S.upgrades].start.name !== 'startRest'){
    const step = pirates.UPGRADES[S.upgrades];
    for(let i = 0; i < 120 * 60 && !step.start(S); i++) tick();
    for(let i = 0; i < 300 * 60 && S.build; i++){
      tick();
      for(const c of S.cooks){
        if(c.faint && ['blast', 'fumes', 'slip'].includes(c.faint.phase)) hit.set(c.faint.phase, c.row);
        if(c.faint?.phase === 'crutches' && c.faint.up > maxUp){ maxUp = c.faint.up; upX = c.x; }
      }
    }
    assert.equal(S.build, null, `${step.name} finishes`);
  }
  assert.deepEqual(Object.fromEntries(hit), {blast:0, fumes:0, slip:0});
  assert.equal(maxUp, 58, 'it goes all the way up the floor to the back wall (CRUTCH_UP)');
  assert.equal(upX, pirates.COOK_X, 'straight up from its spot beside the stove');
  assert.equal(JSON.stringify(S.cooks.map(c => [c.row, !!c.crutches])), '[[0,true],[2,false]]');
  assert.equal(S.cooks[0].faint, null);
});

test('pirate Bizum shows two close payments in separate pulses and drops them when rewinding', () => {
  const dom = stubDom();
  const html = fs.readFileSync(path.join(__dirname, 'tapper-pirata.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const source = withLine(script, '\n})();', `
    enterBar();
    globalThis.pay = count => { S.payments += count; };
    globalThis.pulse = dt => {
      updateView(dt);
      return [view.paymentsShown, view.paymentAge];
    };
  })();`);
  vm.runInNewContext(source, dom.context);
  dom.press('ArrowRight');
  const {pay, pulse} = dom.context;
  pay(2);
  assert.deepEqual([...pulse(0)], [1, 0]);
  assert.deepEqual([...pulse(.1)], [1, .1]);
  assert.deepEqual([...pulse(.38)], [2, 0]);
  const [shown, age] = pulse(.5);
  assert.equal(shown, 2);
  assert.ok(age > 0);
  dom.press('ArrowLeft');
  assert.deepEqual([...pulse(0)], [0, age]);
});

test('pirate arrow keys restore completed scenes and Space can play them again', () => {
  const dom = stubDom();
  const html = fs.readFileSync(path.join(__dirname, 'tapper-pirata.html'), 'utf8');
  let source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  source = withLine(source, 'Math.floor(Math.random() * 1e6)', '5');
  source = withLine(source, '\n})();', `
    islandShown = true;
    globalThis.onCover = () => !$('cover').hidden;
    globalThis.scene = () => captureStep();
    globalThis.status = () => ({pendingStep, speed, kafkaMix:[...kafkaMix], ends:[...view.ends]});
  })();`);
  vm.runInNewContext(source, dom.context);
  const {onCover, scene, status} = dom.context;
  const right = () => dom.press('ArrowRight');
  const left = () => dom.press('ArrowLeft');
  const space = () => dom.press(' ');
  assert.ok(onCover());
  dom.press('3');
  assert.equal(status().speed, 1);
  left();
  assert.ok(onCover());
  right();
  assert.ok(!onCover());
  for(const [key, expected] of [['2', 2], ['3', 3], ['9', 9], ['0', 10], ['1', 1]]){
    dom.press(key);
    assert.equal(status().speed, expected);
  }
  assert.equal(scene().tutorialStep, 0);
  const initial = scene();
  left();
  assert.deepEqual(scene(), initial);
  right();
  assert.equal(scene().tutorialStep, 1);
  left();
  assert.deepEqual(scene(), initial);
  for(let i = 0; i < 6; i++) space();
  const tutorial = scene();
  assert.equal(tutorial.tutorialDone, true);
  space();
  assert.equal(scene().S.build.phase, 'arrive');
  left();
  assert.deepEqual(scene(), tutorial);
  space();
  space();
  assert.equal(status().pendingStep, true);
  right();
  const afterArrival = scene();
  assert.equal(afterArrival.S.upgrades, 1);
  assert.equal(afterArrival.S.build, null);
  assert.equal(status().pendingStep, false);
  left();
  assert.deepEqual(scene(), tutorial);
  right();
  assert.deepEqual(scene(), afterArrival);

  for(let i = 1; i < 15; i++) right();
  const bar = scene();
  assert.ok(bar.S.features.keys && bar.S.features.commit && bar.S.boss.present);
  assert.equal(bar.S.stats.resent, 1);
  assert.ok(bar.S.cashCount.every(marker => marker.marked), 'cash leaves a receipt on each wire');
  assert.ok(bar.S.cashCount.every((marker, part) => marker.total >= 2 + part), 'cash counts dishes from retained orders');
  assert.ok(status().ends.every(Number.isFinite));
  space();
  assert.ok(status().kafkaMix.every(mix => mix === 0));
  right();
  assert.equal(scene().kafkaStep, 1);
  assert.deepEqual([...status().kafkaMix], [1, 0, 0, 0, 0]);
  left();
  assert.deepEqual(scene(), bar);
  assert.ok(status().kafkaMix.every(mix => mix === 0));
  for(let i = 0; i < 5; i++) right();

  dom.press('3');
  space();
  assert.equal(scene().S.materialDemo.phase, 'intro');
  assert.equal(status().speed, 3);
  right();
  assert.equal(scene().S.materialDemo.index, 1);
  assert.equal(scene().S.materialDemo.phase, 'ready');
  for(let i = 0; i < 4; i++) right();
  const split = scene();
  assert.ok(split.S.materialDemo.split && split.S.materialDemo.updateRejected);
  assert.deepEqual(split.S.comandas.map(p => p.committed), [1, 1]);
  assert.deepEqual(split.S.materialDemo.reference.offsets, [1, 1]);
  right();
  assert.equal(scene().nestingDemo.elapsed, 12);
  assert.equal(status().speed, 3);
  right();
  assert.equal(scene().nestingDemo.elapsed, 7.5);
  right();
  assert.equal(scene().ending, true);
  dom.frame(100);
  left();
  assert.equal(scene().ending, false);
  assert.equal(scene().nestingDemo.mode, 'bus');
  dom.frame(200);
  space();
  assert.equal(scene().ending, true);
});

test('a returning pirate cook slips on first contact with the landed peel', () => {
  const pirates = harness('tapper-pirata.html');
  const S = pirates.createSim(4);
  const cook = S.cooks[1], peelX = pirates.COOK_X - 19;
  S.rate = 0;
  S.build = {phase:'peelWait', who:cook.id, t:0};
  S.peel = {at:S.time, row:cook.row, stepAt:null};
  cook.x = peelX - 15;
  for(let i = 0; i < 60; i++) pirates.stepSim(S, 1 / 60);
  assert.equal(cook.x, pirates.COOK_X);
  assert.equal(S.peel.stepAt, null, 'walking under the flying peel is harmless');

  cook.x = peelX - 20;
  pirates.stepSim(S, 1 / 60);
  assert.equal(S.peel.stepAt, null, 'the shoes are still clear of the peel');
  pirates.stepSim(S, 1 / 60);
  assert.equal(cook.x, peelX - 10);
  assert.equal(cook.faint.phase, 'slip');
  assert.equal(S.peel.stepAt, S.time);
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

for(const loseLast of [false, true]){
  test(`every arrival gets one ack, including a retry: lost last ticket = ${loseLast}`, () => {
    const S = manualSim(), customer = api.addCustomer(S, 'A', 3);
    S.loseNext = loseLast ? 1 : 0;
    const calls = [];
    let leftAt = null;
    for(let i = 0; i < 3000 && leftAt === null; i++){
      const before = S.comandas[0].end, lastSaid = S.boss.saidAt;
      api.stepSim(S, 1 / 60);
      if(S.comandas[0].end > before){
        const message = S.comandas[0].log.at(-1).order;
        assert.equal(S.boss.lastAck, message);
        assert.equal(message.ackAt, S.time);
        calls.push(message.seq);
      } else assert.equal(S.boss.saidAt, lastSaid);
      if(S.barWaiters[0].state === 'back') leftAt = S.time;
    }
    assert.deepEqual(calls, [1, 2, 3]);
    assert.equal(S.stats.resent, loseLast ? 1 : 0);
    assert.equal(!!customer.messages[2].resent, loseLast);
    assert.ok(leftAt - customer.messages[2].ackAt >= 0.49);
  });
}

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
  assert.deepEqual(phases, ['toTicket', 'read', 'toStove', 'cook', 'plate', 'toCounter', 'drop', 'toCommit', 'commit']);
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
  let xLeavingCounter = null;
  for(let i = 0; i < 60 * 30 && cook.job?.phase !== 'commit'; i++){
    const before = cook.pos;
    api.stepSim(S, 1 / 60);
    if(cook.pos !== before) framesBetweenRows++;
    if(cook.pos !== before && before === 1) xLeavingCounter ??= cook.x;
    if(cook.job?.phase === 'drop'){
      posAtDrop = cook.pos;
      platesBeforeDrop = S.plates.length + S.counter.length;
    }
  }
  assert.equal(posAtDrop, 1, 'at the middle row');
  assert.equal(platesBeforeDrop, 0, 'the plate reaches the counter from the hand');
  assert.equal(cook.job.phase, 'commit');
  assert.equal(cook.pos, 2, 'back to its own row to stamp the order');
  assert.ok(xLeavingCounter < api.COOK_X, 'straight from the counter, without going back to the stove first');
  assert.ok(framesBetweenRows <= 24, `moving ${framesBetweenRows} frames there and back`);
});

test('fumes knock a cook out: two rebalances, and the other one covers both wires meanwhile', () => {
  const S = manualSim();
  const cook = api.poisonCook(S);
  const other = S.cooks.find(c => c !== cook);
  assert.ok(cook);
  assert.equal(api.poisonCook(S), null, 'one at a time');
  run(S, 1);
  assert.equal(cook.faint.phase, 'fumes');
  run(S, 1);
  assert.equal(cook.faint.phase, 'fainted');
  assert.equal(cook.active, false);
  assert.equal(S.stats.rebalances, 1);
  run(S, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(other.partitions)), [0, 1], 'the other cook takes both wires');
  const x = cook.x;
  run(S, 5);
  assert.equal(cook.x, x, 'lies where it fell');
  assert.equal(cook.beer, null);
  run(S, 2.5);
  assert.equal(cook.faint.phase, 'waking');
  assert.equal(cook.active, false, 'still out while asking its question');
  run(S, 1.5);
  assert.equal(cook.faint, null, 'back to work right after the question');
  assert.equal(cook.active, true);
  assert.equal(S.stats.rebalances, 2);
  run(S, 3);
  assert.deepEqual(assignment(S), [[0], [1]], 'back to its own wire');
});

test('the fumes only catch a cook at its stove, and drop what it was doing', () => {
  const S = manualSim();
  api.addCustomer(S, 'A', 1);
  const cook = S.cooks[0];
  for(let i = 0; i < 60 * 30 && cook.job?.phase !== 'toTicket'; i++) api.stepSim(S, 1 / 60);
  S.random = () => 0;
  api.poisonCook(S);
  api.stepSim(S, 1 / 60);
  assert.equal(cook.faint.phase, 'waiting', 'walking along the wire, out of reach of the fumes');
  for(let i = 0; i < 60 * 30 && cook.faint.phase === 'waiting'; i++) api.stepSim(S, 1 / 60);
  assert.equal(cook.faint.phase, 'fumes');
  run(S, 2);
  assert.equal(cook.job, null);
  assert.equal(S.comandas[0].committed, 0, 'what it was cooking was never confirmed');
  run(S, 30);
  assert.equal(S.stats.served, 1);
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


test('the oil drum reverses its travel and spin at the boss kick, then leaves the screen', () => {
  const S = manualSim(), b = S.boss;
  const at = time => { b.oil = time; return api.bossOilPose(b); };
  const early = at(0.2), late = at(api.OIL_HIT_AT - 0.1), hit = at(api.OIL_HIT_AT);
  const returning = at(api.OIL_HIT_AT + 0.3);
  assert.ok(early.x > late.x && late.x > hit.x);
  assert.ok(early.angle > late.angle && late.angle > hit.angle);
  assert.equal(hit.leg, 'kick');
  assert.equal(hit.impact, true);
  assert.ok(returning.x > hit.x && returning.angle > hit.angle);
  assert.equal(at(api.OIL_HIT_AT + api.OIL_RETURN_S).visible, false);
  b.oil = api.OIL_GAG_S;
  api.stepBossOil(S, 1 / 60);
  assert.equal(b.oil, null);
  assert.ok(b.oilIn >= 30 && b.oilIn <= 55);
});

test('the boss gag waits for the ack and uses no Kafka randomness', () => {
  const S = manualSim(), other = manualSim();
  S.boss.oilIn = 0;
  S.boss.saidAt = S.time;
  api.stepBossOil(S, 0.1);
  assert.equal(S.boss.oil, null);
  S.time = 2;
  S.barWaiters[0].state = 'awaitAck';
  api.stepBossOil(S, 0.1);
  assert.equal(S.boss.oil, null);
  S.barWaiters[0].state = 'idle';
  api.stepBossOil(S, 0.1);
  assert.equal(S.boss.oil, 0);
  api.stepBossOil(S, api.OIL_GAG_S);
  assert.equal(S.random(), other.random());
  assert.equal(S.boss.saidAt, 0);
});

// Runs one step of the way from a queue to Kafka until it is over.
function upgrade(S, seconds = 120){
  assert.ok(api.UPGRADES[S.upgrades].start(S), `step ${S.upgrades + 1} starts`);
  for(let i = 0; i < seconds * 60 && S.build; i++) api.stepSim(S, 1 / 60);
  assert.equal(S.build, null, 'and finishes');
}

test('the first scene is a plain queue of tapas: one wire, one cook, and cooked orders go in the bin', () => {
  const S = api.createSim(3, api.FIRST_SCENE);
  S.rate = 0;
  assert.equal(S.comandas.length, 1);
  assert.equal(S.cooks.length, 1);
  assert.equal(S.boss.present, false);
  const customer = api.addCustomer(S, 'B', 3);
  assert.equal(customer.partition, 0);
  assert.ok(customer.messages.every(m => ['jamon', 'croquetas', 'tortilla', 'gazpacho'].includes(m.items[0])), 'tapas, not a menu');
  assert.equal(customer.menu, false);
  const words = new Set();
  const cook = S.cooks[0];
  let binned = false, detour = false, cookedFromMemory = true;
  for(let i = 0; i < 60 * 60; i++){
    const wasBinning = cook.job?.phase === 'bin';
    api.stepSim(S, 1 / 60);
    words.add(api.consumerAction(S, cook));
    if(wasBinning && cook.job?.phase !== 'bin') binned = true;
    if(binned && cook.x === api.COOK_X && cook.job?.phase === 'toTicket') detour = true;
    if(cook.job?.phase === 'read') binned = false;
    if(cook.job?.phase === 'cook') cookedFromMemory &&= !S.comandas[0].log.includes(cook.job.entry) && cook.job.entry.taken;
  }
  assert.ok(cookedFromMemory, 'read, then straight in the bin: it cooks from memory');
  assert.equal(detour, false, 'from the bin straight to the next order, not via the stove');
  assert.equal(S.stats.served, 3);
  assert.equal(S.comandas[0].log.length, 0, 'nothing stays on the wire');
  assert.ok(S.bin.thrown >= 3, 'they went in the bin');
  assert.ok(words.has('RECV+DELETE') && !words.has('COMPLETE') && ![...words].some(w => w.startsWith('COMMIT')), 'receive and delete: nothing to complete, no commits');
});

test('from a queue to Kafka: each step brings its problem or the feature that solves it', () => {
  const S = api.createSim(12, api.FIRST_SCENE);
  S.rate = 20;
  run(S, 20);

  // 1. Another cook: both take from the same wire.
  upgrade(S);
  run(S, 5);
  assert.deepEqual(assignment(S), [[0], [0]], 'competing consumers on one queue');
  assert.equal(S.cooks[0].row, 0, 'the first cook cooks in the top row, as from the start');
  assert.deepEqual([...S.rows], [1], 'the wire is still in the middle');

  // 2. Receive and delete: fumes knock a cook out with an order only in its head, and nobody can cook it.
  upgrade(S, 300);
  assert.equal(S.stats.faints, 1, 'the fumes knock it out');
  assert.equal(S.stats.lost, 1, 'the order was only in its head');
  assert.equal(S.stats.gaveUp, 1, 'and its diner, after banging the table and complaining, goes without it');
  assert.equal(S.stats.rebalances, 0, 'a plain queue has no group to rebalance');
  assert.ok(S.cooks.every(c => c.active && !c.faint), 'back on its feet');

  // 3. Peek-lock: orders stay on the wire, locked, until cooked; the same fumes lose nothing.
  assert.equal(S.stats.protested, 0, 'ordinary waits and lost orders do not trigger the hourglass protest');
  assert.ok(api.UPGRADES[S.upgrades].start(S));
  const protests = new Set();
  let heardInstruction = false, cooksReplied = false, sawHourglass = false;
  for(let i = 0; i < 300 * 60 && S.build; i++){
    api.stepSim(S, 1 / 60);
    if(S.boss.entering && !heardInstruction){
      assert.ok(S.cooks.every(c => !c.job && c.pos === c.row && c.x === api.COOK_X));
      if(!S.boss.say && S.build.phase === 'peekBoss' && S.build.t > 0) assert.ok(S.boss.walking);
    }
    if(S.boss.say){
      assert.equal(S.boss.say.lines.join(' '), 'Chavales... peek and lock!');
      assert.ok(S.boss.entering && S.cooks.every(c => !c.job && c.pos === c.row && c.x === api.COOK_X));
      assert.equal(S.features.peekLock, false);
      heardInstruction = true;
    }
    if(S.cooks.some(c => c.say)){
      assert.ok(heardInstruction && !S.boss.say);
      assert.ok(S.cooks.every(c => c.say?.lines.join(' ') === 'Sí, jefe'));
      cooksReplied = true;
    }
    if(S.features.peekLock) assert.ok(cooksReplied);
    if(S.cooks.some(c => c.job?.phase === 'hang')){
      assert.ok(heardInstruction && !S.boss.say);
      sawHourglass = true;
    }
    for(const diner of S.customers){
      const speech = diner.say;
      if(!speech?.dishComplaint || protests.has(speech)) continue;
      protests.add(speech);
      const locked = S.comandas[diner.partition].log.find(entry =>
        entry.order.visit === diner.visit && entry.lockAbandonedByFaint && entry.lockUntil > S.time);
      assert.ok(locked, 'the protest starts while the exact order still has its abandoned hourglass');
      assert.ok(speech.lines.length, 'it has a dish-specific line to display');
    }
  }
  assert.equal(S.build, null);
  assert.equal(protests.size, 1);
  assert.ok(sawHourglass && !S.boss.entering);
  assert.equal(S.features.peekLock, true);
  assert.equal(S.stats.faints, 2);
  assert.equal(S.stats.rebalances, 0);
  assert.equal(S.stats.lapsed, 1, 'the lock stayed on until its time was up');
  assert.equal(S.stats.protested, 1, 'its diner protests once while waiting for the delayed dish');
  assert.equal(S.stats.gaveUp, 1, 'but stays: only the lost dish of the step before made anyone leave');
  assert.equal(S.stats.lost, 1, 'the lock lapsed and the other cook cooked it');

  // Menus: the dessert overtakes the starter, then ordinary menus can also arrive out of order.
  assert.equal(S.stats.outOfOrder, 0);
  upgrade(S, 300);
  assert.equal(S.features.menus, true);
  assert.equal(S.stats.outOfOrder, 1);
  assert.ok(S.events.some(event => event.text.includes('flan antes que paella: el orden se ha roto')));
  run(S, 200);
  assert.ok(S.stats.outOfOrder > 1, 'other menus can still arrive out of order on the shared wire');

  // 3. One wire per color: the first wire moves up, a second one is built, one cook each.
  assert.ok(api.UPGRADES[S.upgrades].start(S));
  let builtAway = false;
  for(let i = 0; i < 120 * 60 && S.build; i++){
    api.stepSim(S, 1 / 60);
    if(S.wire && S.cooks[1].pos !== 2) builtAway = true;
  }
  assert.equal(S.build, null);
  assert.equal(builtAway, false, 'the second cook builds its wire in its own row, by its stove');
  assert.deepEqual([...S.rows], [0, 2]);
  assert.equal(S.features.keys, true);
  const broken = S.stats.outOfOrder;
  run(S, 60);
  assert.deepEqual(assignment(S), [[0], [1]]);
  run(S, 400);
  assert.equal(S.stats.outOfOrder, broken, 'no more courses out of order');

  // 4. Cashing up: nothing to count, all in the bin. He kicks the bin out and tells the cooks
  // that orders are kept from now on.
  upgrade(S, 300);
  assert.ok(S.events.some(event => event.text.includes('no puede: la cola las borra')));
  assert.equal(S.bin, null, 'kicked out');
  assert.equal(S.features.retain, true);
  assert.equal(S.features.commit, false, 'nobody marks anything yet');
  assert.equal(S.boss.present, false);
  assert.ok(S.events.some(event => event.text.includes('las comandas se quedan en el hilo')));

  // 6. The fumes again: the cook forgets which order it was on, and with nothing marked it reads
  // its wire again from the start.
  const duplicatesBefore = S.stats.duplicates, faintsBefore = S.stats.faints, rebalancesBefore = S.stats.rebalances;
  upgrade(S, 600);
  assert.equal(S.stats.faints, faintsBefore + 1);
  assert.equal(S.stats.rebalances, rebalancesBefore, 'it never left the group');
  assert.equal(S.stats.rereads, 1, 'read again from the start');
  assert.ok(S.stats.duplicates > duplicatesBefore, 'plates nobody asked for');

  // 7. Commits: the cooks finish marking their progress without another incident.
  upgrade(S, 600);
  assert.equal(S.features.commit, true);
  assert.equal(S.stats.faints, faintsBefore + 1, 'no second fainting scene');
  assert.ok(S.comandas.every(p => p.committed === p.position), 'both cooks finish marking their progress');
  assert.ok(S.comandas.some(p => p.committed > p.earliest), 'cooks commit how far they got');
  const duplicatesAfter = S.stats.duplicates;
  run(S, 200);
  assert.equal(S.stats.duplicates, duplicatesAfter, 'no more plates nobody asked for');

  // 8. An order falls off the wire, nobody notices, and its diner leaves without it.
  upgrade(S, 300);
  assert.equal(S.stats.lost, 2);
  assert.equal(S.stats.resent, 0);
  assert.ok(S.stats.gaveUp >= 1, 'its diner leaves without it');

  // The boss addresses the order waiter and acknowledges each ticket as it arrives.
  assert.ok(api.UPGRADES[S.upgrades].start(S));
  const dialogue = new Set();
  for(let i = 0; i < 300 * 60 && S.build; i++){
    api.stepSim(S, 1 / 60);
    const waiter = S.barWaiters[0];
    if(S.boss.say) dialogue.add(S.boss.say.lines.join(' '));
    if(waiter.say){
      assert.equal(waiter.state, 'listening');
      assert.ok(S.cooks.every(c => !c.say));
      dialogue.add(waiter.say.lines.join(' '));
    }
    if(S.boss.lastAck){
      assert.ok(!S.boss.lastAck.resent);
      dialogue.add('ack');
    }
  }
  assert.equal(S.build, null);
  assert.deepEqual([...dialogue], ['¡Un poco de orden, chaval!', 'Sí, jefe', 'ack']);
  assert.equal(S.boss.present, true);
  assert.deepEqual([S.boss.x, S.boss.y], [api.BOSS_SPOT.x, api.BOSS_SPOT.y]);
  run(S, 60);
  assert.equal(S.stats.lost, 2, 'waiting here never triggers the next loss');
  assert.equal(S.stats.resent, 0);

  // The next click loses a ticket. It finishes once the resent order has been acknowledged.
  const lastGoodAck = S.boss.saidAt;
  upgrade(S, 300);
  assert.ok(S.boss.saidAt > lastGoodAck);
  assert.equal(S.stats.lost, 3);
  assert.ok(S.stats.resent >= 1, 'the waiter sends it again');
  assert.equal(S.upgrades, api.UPGRADES.length);
  const states = new Set();
  for(let i = 0; i < 60 * 60; i++){ api.stepSim(S, 1 / 60); states.add(S.barWaiters[0].state); }
  assert.ok(states.has('awaitAck'), 'the waiter now waits for «¡Oído cocina!»');
  assert.equal(S.stats.outOfOrder, broken, 'no course ever came out of order again');
});


test('with nothing to read, each cook waits at its own stove, not under the wire', () => {
  const S = api.createSim(5, api.FIRST_SCENE);
  S.rate = 0;
  upgrade(S);
  api.addCustomer(S, 'B', 3);
  run(S, 60);
  assert.equal(S.customers.length, 0, 'everything served');
  assert.deepEqual([...S.rows], [1], 'the wire hangs in the middle row');
  S.cooks.forEach(c => {
    assert.equal(c.pos, c.row, `${c.name} back in its stove's row`);
    assert.equal(c.x, api.COOK_X, `${c.name} at its stove`);
  });
});

test('peek-lock: the cook ties an hourglass under the order, and the lock lasts as long as its sand', () => {
  const S = api.createSim(4, {...api.FIRST_SCENE, features:{menus:false, keys:false, retain:false, commit:false, peekLock:true}});
  S.rate = 0;
  api.addCustomer(S, 'B', 1);
  const cook = S.cooks[0];
  let lockedBeforeHanging = false;
  for(let i = 0; i < 60 * 30 && cook.job?.phase !== 'toStove'; i++){
    api.stepSim(S, 1 / 60);
    const entry = cook.job?.entry;
    if(entry && ['toTicket', 'read'].includes(cook.job.phase)){
      assert.equal(entry.lockFrom, undefined, 'no hourglass until the cook ties it');
      lockedBeforeHanging ||= entry.lockedBy === cook.id;
    }
  }
  const entry = cook.job.entry;
  assert.ok(lockedBeforeHanging, 'nobody else can take it on the way');
  assert.ok(entry.lockFrom !== undefined && entry.lockUntil > entry.lockFrom, 'hung, with its sand running');

  // The sand runs out while it is still cooking: it loses the order, which is free again.
  entry.lockUntil = S.time + 0.05;
  run(S, 0.2);
  assert.equal(entry.lockedBy, null);
  assert.equal(cook.job.lockLost, true);
  assert.equal(S.stats.lapsed, 1);
  run(S, 30);
  assert.equal(S.stats.served, 1);
  assert.equal(S.stats.duplicates, 1, 'free on the wire again, it is cooked a second time');
  assert.equal(S.comandas[0].log.length, 0, 'and that time it is taken off and binned');
});

test('pirate articulated arms keep both limb lengths while reaching in every direction', () => {
  const html = fs.readFileSync(path.join(__dirname, 'tapper-pirata.html'), 'utf8');
  const source = html.match(/function cookArmPose\([\s\S]*?\n  }/)[0];
  const pose = vm.runInNewContext(`(${source})`);
  for(const distance of [0, 0.5, 10, 23, 40]){
    for(let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8){
      const x = 100, y = 80, tx = x + Math.cos(angle) * distance, ty = y + Math.sin(angle) * distance;
      const arm = pose(x, y, tx, ty);
      assert.ok(Math.abs(Math.hypot(arm.elbowX - x, arm.elbowY - y) - 12) < 1e-9, 'upper arm keeps its length');
      assert.ok(Math.abs(Math.hypot(arm.handX - arm.elbowX, arm.handY - arm.elbowY) - 12) < 1e-9, 'forearm keeps its length');
      assert.ok(Math.abs(Math.hypot(arm.handX - x, arm.handY - y) - Math.min(distance, 23)) < 1e-9, 'hand reaches the target or stops at full extension');
    }
  }
  const shoulder = {x:100, y:80};
  for(const [x, y] of [[91, 84], [89, 78], [83, 69], [79, 68]]){
    const arm = pose(shoulder.x, shoulder.y, x, y, -1);
    assert.ok(arm.elbowY > arm.handY, 'the elbow stays below the hand while the character raises it');
  }
  const down = pose(shoulder.x, shoulder.y, 79, 95, -1);
  const turn = (down.handX - shoulder.x) * (down.elbowY - shoulder.y) -
    (down.handY - shoulder.y) * (down.elbowX - shoulder.x);
  assert.ok(turn < 0, 'the same elbow bend is used when pointing down');
});

test('pirate padlocks release the order on expiry and finish falling independently of the next lock', () => {
  const pirates = harness('tapper-pirata.html');
  const S = pirates.createSim(4, {...pirates.FIRST_SCENE, features:{...pirates.FIRST_SCENE.features, peekLock:true}});
  S.rate = 0;
  pirates.addCustomer(S, 'B', 1);
  const cook = S.cooks[0];
  for(let i = 0; i < 60 * 30 && cook.job?.phase !== 'toStove'; i++) pirates.stepSim(S, 1 / 60);
  assert.equal(cook.job.phase, 'toStove');
  const entry = cook.job.entry;
  entry.lockUntil = S.time + 0.05;
  for(let i = 0; i < 6; i++) pirates.stepSim(S, 1 / 60);
  assert.equal(entry.lockedBy, null, 'the paper is available again');
  assert.equal(cook.job.lockLost, true, 'the previous cook cannot complete the expired lock');
  assert.equal(S.lockDrops.length, 1, 'the released padlock remains visible while falling');
  assert.equal(S.stats.lapsed, 1);
  for(let i = 0; i < 60; i++) pirates.stepSim(S, 1 / 60);
  assert.equal(S.lockDrops.length, 0, 'the falling padlock disappears without repeating');
  for(let i = 0; i < 60 * 30; i++) pirates.stepSim(S, 1 / 60);
  assert.equal(S.stats.served, 1, 'the released order can be fetched and completed again');
  assert.equal(S.comandas[0].log.length, 0);
});

test('the first oil drum brings the three-headed monkey, and only the first', () => {
  const S = api.createSim(9);
  S.boss.oilIn = 0;
  let firstWithMonkey = null;
  for(let i = 0; i < 60 * 60 && firstWithMonkey === null; i++){
    api.stepSim(S, 1 / 60);
    if(S.boss.oil !== null) firstWithMonkey = !!S.boss.monkey;
  }
  assert.equal(firstWithMonkey, true, 'it comes, for sure, the first time');
  for(let i = 0; i < 60 * 10 && S.boss.oil !== null; i++) api.stepSim(S, 1 / 60);
  S.boss.oilIn = 0;
  let secondWithMonkey = null;
  for(let i = 0; i < 60 * 60 && secondWithMonkey === null; i++){
    api.stepSim(S, 1 / 60);
    if(S.boss.oil !== null) secondWithMonkey = !!S.boss.monkey;
  }
  assert.equal(secondWithMonkey, false, 'and never again');
});
