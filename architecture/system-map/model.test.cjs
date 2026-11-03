const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./model.js');
const fresh = () => JSON.parse(JSON.stringify(M.example));

test('JSON round-trip retains the complete example architecture', () => {
  assert.deepEqual(M.validate(JSON.parse(JSON.stringify(M.validate(fresh())))), fresh());
});

test('transport migration preserves topology, REST and storage operations', () => {
  const model = fresh(), before = fresh();
  M.setTransport(model, 'servicebus');
  const migrated = M.validate(model);
  assert.equal(migrated.nodes.filter(n => n.type === 'queue').length, 2);
  assert.equal(migrated.nodes.filter(n => n.type === 'topic').length, 0);
  assert.deepEqual(migrated.flows, before.flows);
  for (const e of migrated.edges) {
    if (['publish', 'consume'].includes(e.kind)) assert.equal(e.protocol, 'AMQP');
    else assert.deepEqual(e, before.edges.find(other => other.id === e.id));
  }
  M.setTransport(model, 'kafka');
  assert.deepEqual(M.validate(model), before);
});

test('deleting the shared mount removes its accesses and the empty configuration flow', () => {
  const model = fresh();
  M.removeNode(model, 'share');
  assert.doesNotThrow(() => M.validate(model));
  assert.equal(model.flows.some(f => f.id === 'config'), false);
  assert.equal(model.edges.some(e => e.source === 'share' || e.target === 'share'), false);
  assert.equal(model.flows.find(f => f.id === 'request').steps.length, 8);
});

test('deleting a connection removes every repeated occurrence from flows', () => {
  const model = fresh();
  model.flows[0].steps.push('rest-request');
  M.removeEdge(model, 'rest-request');
  assert.doesNotThrow(() => M.validate(model));
  assert.equal(model.flows.some(f => f.steps.includes('rest-request')), false);
});

test('invalid imports reject dangling references and duplicate identifiers', () => {
  const cases = [
    m => { m.edges[0].target = 'missing'; },
    m => { m.flows[0].steps.push('missing'); },
    m => { m.nodes[1].id = m.nodes[0].id; },
    m => { m.edges[1].id = m.edges[0].id; },
    m => { m.flows[1].id = m.flows[0].id; },
    m => { m.edges[0].target = m.edges[0].source; },
  ];
  for (const mutate of cases) { const model = fresh(); mutate(model); assert.throws(() => M.validate(model)); }
});

test('invalid model values cannot enter the renderer or simulation', () => {
  const cases = [
    m => { m.nodes[0].x = Infinity; },
    m => { m.nodes[0].replicas = 1.5; },
    m => { m.nodes[0].type = '__proto__'; },
    m => { m.nodes[0].id = '<script>'; },
    m => { m.edges[0].duration = 0; },
    m => { m.edges[0].kind = 'constructor'; },
    m => { m.flows[0].steps = []; },
    m => { m.version = 2; },
    m => { m.transport = 'unknown'; },
    m => { m.example = 'false'; },
  ];
  for (const mutate of cases) { const model = fresh(); mutate(model); assert.throws(() => M.validate(model)); }
});

test('validation is non-mutating and an empty workspace remains a valid model', () => {
  const model = fresh(), original = fresh();
  const result = M.validate(model); result.nodes[0].name = 'Changed';
  assert.deepEqual(model, original);
  assert.doesNotThrow(() => M.validate({ ...fresh(), nodes: [], edges: [], flows: [] }));
});
