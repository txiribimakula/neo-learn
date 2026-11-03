(function () {
  'use strict';
  const M = window.AtlasModel;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const storageKey = 'atlas-system-map-v1';
  let model = M.validate(clone(M.example));
  let storageWarning = '';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) model = M.validate(JSON.parse(saved));
  } catch (error) { storageWarning = 'No se pudo recuperar el modelo local. Se ha abierto el ejemplo; puedes importar tu JSON.'; }
  let flowId = model.flows[0]?.id;
  let selection = null;
  let index = -1, elapsed = 0, playing = false, finished = false, frame = 0, lastTime = 0;
  let camera = { x: 0, y: 0, scale: 1 }, detail = false;
  let submitEditor = null, toastTimer = null;
  const viewport = $('viewport'), world = $('world'), svg = $('connections');
  const getNode = id => model.nodes.find(n => n.id === id);
  const getEdge = id => model.edges.find(e => e.id === id);
  const getFlow = () => model.flows.find(f => f.id === flowId);
  const steps = () => (getFlow()?.steps || []).map(getEdge);
  const activeEdge = () => index >= 0 ? steps()[index] : null;
  const nodeHeight = () => detail ? 160 : 100;
  const displayDuration = edge => Math.min(2300, Math.max(950, edge.duration * 3));
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500); }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(model)); $('save-status').textContent = '✓ Guardado en este navegador'; }
    catch (error) { $('save-status').textContent = 'Sin guardado local'; toast('El navegador no permite guardar. Exporta el JSON para conservar tus cambios.'); }
  }
  function commit(next, message) {
    model = M.validate(next);
    reset(false);
    if (!model.flows.some(f => f.id === flowId)) flowId = model.flows[0]?.id;
    if (selection && !(selection.type === 'node' ? getNode(selection.id) : getEdge(selection.id))) selection = null;
    save(); renderAll(); if (message) toast(message);
  }
  function renderAll() {
    $('project-name').textContent = model.name;
    $('project-description').textContent = model.description;
    $('example-badge').hidden = !model.example;
    document.querySelector('.canvas-note').innerHTML = `<span class="live-dot"></span>${model.example ? 'Modelo de ejemplo' : 'Modelo local'} · sin conexión a infraestructura`;
    $('transport-select').value = model.transport;
    $('component-count').textContent = `${model.nodes.length} componentes`;
    $('transport-note').classList.add('transport-note');
    $('transport-note').textContent = model.transport === 'kafka'
      ? 'Kafka · Dos topics, entrada y respuesta. Los mensajes se conservan según la retención; cada grupo mantiene sus offsets. Particiones, commits y reintentos no se simulan aquí.'
      : 'Azure Service Bus · Dos colas, entrada y respuesta, con consumidores en competencia. Peek-lock, Complete y reintentos no se simulan aquí. Una suscripción por cliente requeriría topics y subscriptions.';
    $('flow-select').innerHTML = model.flows.length ? model.flows.map(f => `<option value="${escape(f.id)}">${escape(f.name)}</option>`).join('') : '<option>Sin recorridos</option>';
    $('flow-select').value = flowId || '';
    $('flow-select').disabled = !model.flows.length;
    $('edit-flow').disabled = !model.flows.length;
    renderNodes(); renderEdges(); renderFlow(); renderInspector(); setCamera();
  }
  function renderNodes() {
    $('zones').innerHTML = model.example ? [
      [15, 224, '01 / CLIENTES', 'Fuera del sistema'], [273, 225, '02 / MENSAJERÍA', model.transport === 'kafka' ? 'Peticiones y respuestas · topics' : 'Peticiones y respuestas · colas'],
      [548, 229, '03 / SERVICIOS', 'Llamadas internas · REST'], [892, 229, '04 / DATOS', 'Configuración y persistencia']
    ].map(([x, width, title, subtitle]) => `<div class="zone" style="left:${x}px;width:${width}px"><span class="zone-label">${title}</span><small>${subtitle}</small></div>`).join('') : '';
    $('nodes').innerHTML = model.nodes.map(n => `<button class="node" id="node-${n.id}" data-node="${n.id}" data-type="${n.type}" style="left:${n.x}px;top:${n.y}px" aria-label="${escape(n.name)}, ${M.TYPES[n.type]}. Ver detalles" aria-pressed="false"><div class="node-head"><span class="node-icon" aria-hidden="true">${M.ICONS[n.type]}</span><span class="node-type">${M.TYPES[n.type]}</span></div><strong>${escape(n.name)}</strong><div class="node-technology node-detail">${escape(n.technology)}</div><div class="node-deployment node-detail"><span>${escape(n.deployment)}</span>${n.type === 'service' ? `<span>${n.replicas} réplicas</span>` : ''}</div></button>`).join('');
    world.classList.toggle('show-detail', detail);
    applyHighlight();
  }
  // Curves connect card boundaries; parallel operations get separate lanes.
  function curve(edge) {
    const a = getNode(edge.source), b = getNode(edge.target);
    const ah = $('node-' + a.id)?.offsetHeight || nodeHeight();
    const bh = $('node-' + b.id)?.offsetHeight || nodeHeight();
    const ax = a.x + 92, ay = a.y + ah / 2, bx = b.x + 92, by = b.y + bh / 2;
    const peers = model.edges.filter(e => [e.source, e.target].sort().join('|') === [edge.source, edge.target].sort().join('|'));
    const lane = (peers.indexOf(edge) - (peers.length - 1) / 2) * 24;
    const horizontal = Math.abs(bx - ax) > Math.abs(by - ay) * .8;
    let sx, sy, tx, ty, d;
    if (horizontal) {
      const sign = bx > ax ? 1 : -1;
      sx = ax + sign * 94; sy = ay + lane; tx = bx - sign * 97; ty = by + lane;
      const bend = Math.max(45, Math.abs(tx - sx) * .48);
      d = `M${sx},${sy} C${sx + sign * bend},${sy} ${tx - sign * bend},${ty} ${tx},${ty}`;
    } else {
      const sign = by > ay ? 1 : -1;
      sx = ax + lane; sy = ay + sign * (ah / 2 + 2); tx = bx + lane; ty = by - sign * (bh / 2 + 5);
      const bend = Math.max(40, Math.abs(ty - sy) * .5);
      d = `M${sx},${sy} C${sx},${sy + sign * bend} ${tx},${ty - sign * bend} ${tx},${ty}`;
    }
    return d;
  }
  function renderEdges() {
    svg.innerHTML = `<defs>${[['http', '#8fa4d4'], ['async', '#b59bd3'], ['storage', '#96bbb5'], ['active', '#4264de']].map(([id, color]) => `<marker id="arrow-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill="${color}"/></marker>`).join('')}</defs>` + model.edges.map(e => `<g data-connection="${e.id}"><path id="edge-${e.id}" class="edge ${M.category(e)}" d="${curve(e)}" marker-end="url(#arrow-${M.category(e)})"/><path class="edge-hit" data-edge="${e.id}" d="${curve(e)}"><title>${escape(e.label)} · ${escape(e.protocol)} · ${escape(e.resource)}</title></path></g>`).join('') + '<circle id="particle" class="particle" r="6" visibility="hidden"/>';
    applyHighlight();
  }
  function applyHighlight() {
    const current = activeEdge();
    const focus = selection?.type === 'edge' ? getEdge(selection.id) : current;
    const focusNode = selection?.type === 'node' ? selection.id : null;
    const term = $('search').value.trim().toLowerCase();
    for (const n of model.nodes) {
      const el = $('node-' + n.id); if (!el) continue;
      const match = term && `${n.name} ${n.technology} ${n.deployment} ${M.TYPES[n.type]}`.toLowerCase().includes(term);
      el.classList.toggle('selected', focusNode === n.id);
      el.setAttribute('aria-pressed', String(focusNode === n.id));
      el.classList.toggle('in-flight', !!current && [current.source, current.target].includes(n.id));
      el.classList.toggle('matched', !!match);
      const neighbors = focusNode && (focusNode === n.id || model.edges.some(e => [e.source, e.target].includes(focusNode) && [e.source, e.target].includes(n.id)));
      el.classList.toggle('dim', term ? !match : focusNode ? !neighbors : focus ? ![focus.source, focus.target].includes(n.id) : false);
    }
    const completed = new Set((getFlow()?.steps || []).slice(0, finished ? index + 1 : Math.max(0, index)));
    for (const e of model.edges) {
      const el = $('edge-' + e.id); if (!el) continue;
      const active = focus?.id === e.id;
      const related = focusNode ? [e.source, e.target].includes(focusNode) : active;
      el.classList.toggle('active', active);
      el.classList.toggle('done', !focusNode && !focus && completed.has(e.id));
      el.classList.toggle('dim', !!(focus || focusNode) && !related);
      el.setAttribute('marker-end', `url(#arrow-${active ? 'active' : M.category(e)})`);
    }
    // Keep the focused route above other paths.
    const focused = focus && $('edge-' + focus.id)?.parentElement;
    if (focused) svg.appendChild(focused);
    if ($('particle')) svg.appendChild($('particle'));
    updateParticle();
  }
  function renderFlow() {
    const flow = getFlow(), allSteps = steps();
    $('flow-description').textContent = flow ? (flow.id === 'request' && model.example ? `Del cliente a ${model.transport === 'kafka' ? 'Kafka' : 'Service Bus'}, una llamada REST interna y vuelta por ${model.transport === 'kafka' ? 'el topic' : 'la cola'} de respuestas.` : flow.description) : 'Crea un recorrido desde Editar modelo: una lista ordenada de conexiones.';
    $('step-count').textContent = allSteps.length;
    $('duration-count').textContent = `${(allSteps.reduce((total, e) => total + e.duration, 0) / 1000).toLocaleString('es', { maximumFractionDigits: 2 })} s`;
    $('play-button').disabled = $('step-button').disabled = !allSteps.length;
    $('play-button').textContent = playing ? 'Ⅱ Pausar' : finished ? '↻ Repetir' : index >= 0 ? '▶ Continuar' : '▶ Reproducir';
    $('play-state').textContent = finished ? 'Recorrido completado' : index < 0 ? 'Listo para explorar' : `${playing ? 'En curso' : 'En pausa'} · ${index + 1}/${allSteps.length}`;
    $('timeline').innerHTML = allSteps.map((e, i) => `<button class="step ${i === index && !finished ? 'active' : i < index || finished ? 'done' : ''}" data-step="${i}" ${i === index ? 'aria-current="step"' : ''}><span class="step-number">${i < index || finished ? '✓' : String(i + 1).padStart(2, '0')}</span><span><strong>${escape(e.label)}</strong><small>${escape(getNode(e.source).name)} → ${escape(getNode(e.target).name)}</small>${i === index ? `<small class="step-resource">${escape(e.resource)}<br>${escape(e.protocol)} · ${e.duration} ms ilustrativos</small><small>${escape(e.description)}</small><span class="step-detail-link" data-inspect-edge="${e.id}">Ver conexión ↗</span>` : ''}</span></button>`).join('');
    updateProgress(); applyHighlight();
  }
  function updateProgress() {
    const length = steps().length;
    const part = activeEdge() ? Math.min(1, elapsed / displayDuration(activeEdge())) : 0;
    $('progress').style.width = `${finished ? 100 : length ? (Math.max(0, index) + part) / length * 100 : 0}%`;
  }
  function updateParticle() {
    const particle = $('particle'), edge = activeEdge();
    if (!particle) return;
    if (!edge || finished || matchMedia('(prefers-reduced-motion: reduce)').matches) { particle.setAttribute('visibility', 'hidden'); return; }
    const path = $('edge-' + edge.id); if (!path) return;
    const pos = path.getPointAtLength(path.getTotalLength() * Math.min(1, elapsed / displayDuration(edge)));
    particle.setAttribute('cx', pos.x); particle.setAttribute('cy', pos.y); particle.setAttribute('visibility', 'visible');
  }
  function pause() { playing = false; cancelAnimationFrame(frame); frame = 0; renderFlow(); }
  function reset(render = true) { playing = false; cancelAnimationFrame(frame); frame = 0; index = -1; elapsed = 0; finished = false; if (render) renderFlow(); }
  function tick(now) {
    if (!playing) return;
    elapsed += Math.min(100, now - lastTime) * Number($('speed-select').value); lastTime = now;
    if (elapsed >= displayDuration(activeEdge())) {
      elapsed = 0;
      if (index + 1 >= steps().length) { finished = true; playing = false; elapsed = displayDuration(activeEdge()); renderFlow(); return; }
      index++; renderFlow();
      document.querySelector('.step.active')?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
    updateParticle(); updateProgress(); frame = requestAnimationFrame(tick);
  }
  function play() {
    if (playing) { pause(); return; }
    if (!steps().length) return;
    if (index < 0 || finished) { index = 0; elapsed = 0; finished = false; }
    selection = null; playing = true; lastTime = performance.now(); showTab('flow'); renderFlow(); renderInspector(); frame = requestAnimationFrame(tick);
  }
  function step() {
    pause(); selection = null;
    if (finished) { index = -1; finished = false; }
    if (index + 1 >= steps().length) { finished = true; elapsed = displayDuration(activeEdge()); }
    else { index++; elapsed = 0; }
    renderFlow(); renderInspector();
  }
  function showTab(tab) {
    $('flow-panel').hidden = tab !== 'flow'; $('inspect-panel').hidden = tab !== 'inspect';
    $('flow-tab').setAttribute('aria-selected', String(tab === 'flow')); $('inspect-tab').setAttribute('aria-selected', String(tab === 'inspect'));
  }
  function select(type, id) { pause(); selection = { type, id }; renderInspector(); applyHighlight(); showTab('inspect'); }
  const property = (title, value) => `<div><dt>${title}</dt><dd>${escape(value || '—')}</dd></div>`;
  function renderInspector() {
    $('inspect-dot').style.background = selection ? 'var(--blue)' : '';
    const panel = $('inspect-panel');
    if (!selection) { panel.innerHTML = '<div class="empty-state"><span class="eyebrow">CADA DEPENDENCIA CUENTA</span><h2>Explora una pieza del sistema</h2><p>Selecciona un componente o una conexión del mapa para ver sus accesos, protocolos y recursos.</p><p>Puedes renombrar servicios, cambiar despliegues y añadir conexiones desde aquí.</p></div>'; return; }
    if (selection.type === 'node') {
      const n = getNode(selection.id); if (!n) return;
      const edges = model.edges.filter(e => e.source === n.id || e.target === n.id);
      panel.innerHTML = `<span class="eyebrow">${M.TYPES[n.type]}</span><div class="inspector-icon">${M.ICONS[n.type]}</div><h2 class="inspector-title">${escape(n.name)}</h2><p class="inspector-description">${escape(n.description)}</p><dl class="properties">${property('Tecnología', n.technology)}${property('Despliegue / montaje', n.deployment)}${n.type === 'service' ? property('Réplicas declaradas', n.replicas) : ''}${property('ID', n.id)}</dl><div class="inspector-actions"><button data-action="edit-node">Editar</button><button data-action="add-edge">＋ Conectar</button><button class="danger" data-action="delete-node">Eliminar</button></div><span class="eyebrow">${edges.length} ACCESOS Y CONEXIONES</span>${edges.map(e => `<button class="dependency" data-inspect-edge="${e.id}">${escape(e.label)}<small>${escape(getNode(e.source).name)} → ${escape(getNode(e.target).name)}<br>${escape(e.protocol)} · ${escape(e.resource)}</small></button>`).join('') || '<p class="inspector-description">Todavía no tiene conexiones.</p>'}`;
    } else {
      const e = getEdge(selection.id); if (!e) return;
      const from = getNode(e.source), to = getNode(e.target);
      panel.innerHTML = `<span class="eyebrow">${M.KINDS[e.kind]}</span><h2 class="inspector-title">${escape(e.label)}</h2><p class="inspector-description">${escape(e.description)}</p><div class="resource-block">${escape(e.resource || 'Sin recurso especificado')}</div><dl class="properties">${property('Datos desde', from.name)}${property('Datos hacia', to.name)}${property('Protocolo', e.protocol)}${property('Tiempo ilustrativo', e.duration + ' ms')}${property('ID', e.id)}</dl><div class="inspector-actions"><button data-action="edit-edge">Editar conexión</button><button class="danger" data-action="delete-edge">Eliminar</button></div><span class="eyebrow">COMPONENTES</span><button class="dependency" data-inspect-node="${from.id}">${escape(from.name)} →</button><button class="dependency" data-inspect-node="${to.id}">${escape(to.name)} →</button><div class="panel-note">${['read', 'download'].includes(e.kind) ? 'La lectura la solicita el destino. La flecha muestra el movimiento de los datos de vuelta desde el almacén.' : 'La flecha muestra el sentido del mensaje o de los datos.'}</div>`;
    }
  }
  function setCamera() {
    world.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
    $('zoom-label').textContent = `${Math.round(camera.scale * 100)}%`;
  }
  function zoom(scale, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
    const next = Math.min(2.4, Math.max(.15, scale));
    camera.x = x - (x - camera.x) / camera.scale * next;
    camera.y = y - (y - camera.y) / camera.scale * next;
    camera.scale = next; setCamera();
  }
  function fit() {
    if (!model.nodes.length) { camera = { x: 0, y: 0, scale: 1 }; setCamera(); return; }
    const left = Math.min(...model.nodes.map(n => n.x)) - 24, top = Math.min(...model.nodes.map(n => n.y), model.example ? 75 : Infinity) - 75;
    const right = Math.max(...model.nodes.map(n => n.x + 184)) + 24;
    const bottom = Math.max(...model.nodes.map(n => n.y + ($('node-' + n.id)?.offsetHeight || nodeHeight())), model.example ? 695 : -Infinity) + 25;
    const scale = Math.max(.15, Math.min(1.2, (viewport.clientWidth - 42) / (right - left), (viewport.clientHeight - 95) / (bottom - top)));
    camera = { scale, x: (viewport.clientWidth - (right - left) * scale) / 2 - left * scale, y: 45 + (viewport.clientHeight - 95 - (bottom - top) * scale) / 2 - top * scale };
    setCamera();
  }
  function setDetail(value) {
    detail = value; $('overview-button').classList.toggle('selected', !value); $('detail-button').classList.toggle('selected', value);
    world.classList.toggle('show-detail', detail); renderEdges(); fit();
  }
  const input = (label, name, value, extra = '') => `<label>${label}<input name="${name}" value="${escape(value)}" ${extra}></label>`;
  const textarea = (label, name, value) => `<label class="wide">${label}<textarea name="${name}" maxlength="3000">${escape(value)}</textarea></label>`;
  const selectField = (label, name, value, choices) => `<label>${label}<select name="${name}">${Object.entries(choices).map(([id, name]) => `<option value="${escape(id)}" ${id === value ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select></label>`;
  function openEditor(title, html, submit, kicker = 'EDITAR ARQUITECTURA') {
    if (playing) pause();
    $('editor-title').textContent = title; $('editor-kicker').textContent = kicker; $('editor-fields').innerHTML = html; $('editor-error').textContent = ''; submitEditor = submit; $('editor-dialog').showModal();
  }
  function newId(prefix, items) { let i = 1; while (items.some(item => item.id === `${prefix}-${i}`)) i++; return `${prefix}-${i}`; }
  function editNode(id) {
    const existing = id && getNode(id);
    const n = existing || { id: newId('service', model.nodes), name: 'Nuevo servicio', type: 'service', technology: '', deployment: '', description: '', replicas: 1, x: Math.round((viewport.clientWidth / 2 - camera.x) / camera.scale - 92), y: Math.round((viewport.clientHeight / 2 - camera.y) / camera.scale - 50) };
    openEditor(existing ? 'Editar componente' : 'Añadir componente', `<div class="form-grid">${input('Nombre', 'name', n.name, 'required maxlength="80"')}${selectField('Tipo', 'type', n.type, M.TYPES)}${input('Tecnología', 'technology', n.technology, 'maxlength="120"')}${input('Despliegue o montaje', 'deployment', n.deployment, 'maxlength="160"')}${input('Réplicas (para servicios)', 'replicas', n.replicas, 'type="number" required min="1" max="10000" step="1"')}${input('Identificador estable', 'id', n.id, 'readonly')}${textarea('Responsabilidad y notas', 'description', n.description)}</div>`, data => {
      const next = clone(model), node = { ...n, ...Object.fromEntries(data), replicas: Number(data.get('replicas')) };
      if (existing) next.nodes[next.nodes.findIndex(item => item.id === id)] = node; else next.nodes.push(node);
      selection = { type: 'node', id: node.id }; commit(next, 'Componente guardado'); showTab('inspect');
    });
  }
  function editEdge(id, sourceId) {
    if (model.nodes.length < 2) { toast('Añade al menos dos componentes para conectarlos.'); return; }
    const existing = id && getEdge(id);
    const e = existing || { id: newId('connection', model.edges), source: sourceId || model.nodes[0].id, target: model.nodes.find(n => n.id !== sourceId && n.id !== (sourceId || model.nodes[0].id)).id, label: 'Nueva operación', kind: 'http', protocol: 'HTTPS', resource: '', description: '', duration: 100 };
    const choices = Object.fromEntries(model.nodes.map(n => [n.id, n.name]));
    openEditor(existing ? 'Editar conexión' : 'Conectar componentes', `<p>El origen y el destino siguen los datos. En lecturas y descargas, el origen es el almacén y el destino es el servicio que solicita el contenido.</p><div class="form-grid">${input('Nombre de la operación', 'label', e.label, 'required maxlength="120"')}${selectField('Operación', 'kind', e.kind, M.KINDS)}${selectField('Datos desde', 'source', e.source, choices)}${selectField('Datos hacia', 'target', e.target, choices)}${input('Protocolo', 'protocol', e.protocol, 'maxlength="80"')}${input('Tiempo ilustrativo (ms)', 'duration', e.duration, 'type="number" min="1" max="600000" required')}${input('Recurso, fichero o endpoint', 'resource', e.resource, 'maxlength="500"')}${input('Identificador estable', 'id', e.id, 'readonly')}${textarea('Descripción', 'description', e.description)}</div><p>Después puedes añadir esta conexión desde «Editar recorrido».</p>`, data => {
      const next = clone(model), edge = { ...e, ...Object.fromEntries(data), duration: Number(data.get('duration')) };
      if (existing) next.edges[next.edges.findIndex(item => item.id === id)] = edge; else next.edges.push(edge);
      M.validate(next); selection = { type: 'edge', id: edge.id }; commit(next, 'Conexión guardada'); showTab('inspect');
    });
  }
  function editFlow(create = false) {
    if (!model.edges.length) { toast('Conecta dos componentes antes de crear un recorrido.'); return; }
    const existing = !create && getFlow();
    const f = existing || { id: newId('flow', model.flows), name: 'Nuevo recorrido', description: '', steps: [model.edges[0].id] };
    const row = (edgeId, i) => `<div class="flow-row"><span class="row-number">${i + 1}</span><select name="step" aria-label="Operación del paso ${i + 1}">${model.edges.map(e => `<option value="${e.id}" ${e.id === edgeId ? 'selected' : ''}>${escape(e.label)} · ${escape(getNode(e.source).name)} → ${escape(getNode(e.target).name)}</option>`).join('')}</select><button type="button" data-row-action="up" aria-label="Subir paso ${i + 1}">↑</button><button type="button" data-row-action="down" aria-label="Bajar paso ${i + 1}">↓</button><button type="button" data-row-action="remove" aria-label="Quitar paso ${i + 1}">×</button></div>`;
    openEditor(existing ? 'Editar recorrido' : 'Crear recorrido', `<div class="form-grid">${input('Nombre', 'name', f.name, 'required maxlength="120"')}${input('Identificador', 'id', f.id, 'readonly')}${textarea('Descripción del recorrido', 'description', f.description)}</div><p>Ordena las operaciones de la petición. Puedes repetir una conexión si se utiliza más de una vez.</p><div id="flow-rows">${f.steps.map(row).join('')}</div><button type="button" id="add-flow-row">＋ Añadir paso</button>`, data => {
      const next = clone(model), flow = { id: f.id, name: data.get('name'), description: data.get('description'), steps: data.getAll('step') };
      if (existing) next.flows[next.flows.findIndex(item => item.id === f.id)] = flow; else next.flows.push(flow);
      M.validate(next); flowId = flow.id; selection = null; commit(next, 'Recorrido guardado'); showTab('flow');
    });
    const refreshRows = ids => { $('flow-rows').innerHTML = ids.map(row).join(''); };
    const rowIds = () => Array.from($('flow-rows').querySelectorAll('select'), el => el.value);
    $('add-flow-row').addEventListener('click', () => { const ids = rowIds(); if (ids.length >= 250) { $('editor-error').textContent = 'Máximo de 250 pasos.'; return; } ids.push(model.edges[0].id); refreshRows(ids); });
    $('flow-rows').addEventListener('click', event => {
      const action = event.target.closest('[data-row-action]'); if (!action) return;
      const i = Array.from($('flow-rows').children).indexOf(action.closest('.flow-row')), ids = rowIds();
      if (action.dataset.rowAction === 'remove') ids.splice(i, 1);
      else { const other = i + (action.dataset.rowAction === 'up' ? -1 : 1); if (other < 0 || other >= ids.length) return; [ids[i], ids[other]] = [ids[other], ids[i]]; }
      refreshRows(ids);
    });
  }
  function confirmDelete(type, id) {
    const item = type === 'node' ? getNode(id) : getEdge(id);
    openEditor('Eliminar ' + (item.name || item.label), '<p>Se eliminará del modelo local. También se quitarán las conexiones afectadas y sus pasos en los recorridos. Los recorridos que queden vacíos se eliminarán.</p>', () => {
      const next = clone(model); if (type === 'node') M.removeNode(next, id); else M.removeEdge(next, id);
      selection = null; commit(next, 'Elemento eliminado');
    }, 'ELIMINAR ELEMENTO');
    $('editor-form').querySelector('[type="submit"]').textContent = 'Eliminar';
  }
  $('editor-dialog').addEventListener('close', () => { $('editor-form').querySelector('[type="submit"]').textContent = 'Guardar cambios'; });
  document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => $('editor-dialog').close()));
  $('editor-form').addEventListener('submit', event => { event.preventDefault(); try { submitEditor(new FormData(event.target)); $('editor-dialog').close(); } catch (error) { $('editor-error').textContent = error.message; } });
  $('model-button').addEventListener('click', () => openEditor('Editar el modelo completo', '<p>Personaliza componentes, conexiones y recorridos. Cada <code>steps</code> contiene identificadores de conexiones en orden. Cambia <code>example</code> a <code>false</code> para quitar la marca de ejemplo. Exporta una copia antes de hacer cambios grandes.</p><label for="json-model">Modelo JSON</label><textarea id="json-model" name="model" class="json-editor" spellcheck="false"></textarea>', data => { const next = M.validate(JSON.parse(data.get('model'))); selection = null; commit(next, 'Modelo actualizado'); fit(); }));
  $('model-button').addEventListener('click', () => { $('json-model').value = JSON.stringify(model, null, 2); });
  $('add-node').addEventListener('click', () => editNode());
  $('edit-flow').addEventListener('click', () => editFlow());
  $('add-flow').addEventListener('click', () => editFlow(true));
  $('transport-select').addEventListener('change', event => { const next = clone(model); M.setTransport(next, event.target.value); commit(next, event.target.value === 'kafka' ? 'Transporte cambiado a Kafka: topics y offsets' : 'Transporte cambiado a Service Bus: dos colas con peek-lock'); });
  $('export-button').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(model, null, 2) + '\n'], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'atlas-architecture.json'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Modelo exportado como JSON');
  });
  $('import-button').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('El archivo supera el límite de 2 MB.');
      const next = M.validate(JSON.parse(await file.text()));
      openEditor('Importar ' + next.name, `<p>El archivo contiene <b>${next.nodes.length} componentes</b>, <b>${next.edges.length} conexiones</b> y <b>${next.flows.length} recorridos</b>. Sustituirá el modelo de este navegador. Puedes cancelar y exportar el modelo actual para conservarlo.</p>`, () => { selection = null; commit(next, 'Modelo importado'); fit(); }, 'ARCHIVO VALIDADO');
    } catch (error) { toast('No se ha importado: ' + error.message); }
  });
  $('flow-select').addEventListener('change', event => { flowId = event.target.value; selection = null; reset(); renderInspector(); });
  $('flow-tab').addEventListener('click', () => { selection = null; showTab('flow'); applyHighlight(); });
  $('inspect-tab').addEventListener('click', () => showTab('inspect'));
  $('play-button').addEventListener('click', play); $('step-button').addEventListener('click', step);
  $('reset-button').addEventListener('click', () => { selection = null; reset(); renderInspector(); });
  $('timeline').addEventListener('click', event => {
    const inspect = event.target.closest('[data-inspect-edge]'); if (inspect) { select('edge', inspect.dataset.inspectEdge); return; }
    const button = event.target.closest('[data-step]'); if (!button) return;
    pause(); selection = null; index = Number(button.dataset.step); elapsed = 0; finished = false; renderFlow(); renderInspector();
  });
  $('inspect-panel').addEventListener('click', event => {
    const edge = event.target.closest('[data-inspect-edge]'), node = event.target.closest('[data-inspect-node]');
    if (edge) { select('edge', edge.dataset.inspectEdge); return; } if (node) { select('node', node.dataset.inspectNode); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'edit-node') editNode(selection.id); if (action === 'edit-edge') editEdge(selection.id);
    if (action === 'add-edge') editEdge(null, selection.id);
    if (action === 'delete-node') confirmDelete('node', selection.id); if (action === 'delete-edge') confirmDelete('edge', selection.id);
  });
  $('search').addEventListener('input', () => {
    applyHighlight();
    const count = document.querySelectorAll('.node.matched').length;
    $('component-count').textContent = $('search').value.trim() ? `${count} coincidencias` : `${model.nodes.length} componentes`;
  });
  $('search').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return; const match = document.querySelector('.node.matched'); if (!match) return;
    const n = getNode(match.dataset.node); camera.x = viewport.clientWidth / 2 - (n.x + 92) * camera.scale; camera.y = viewport.clientHeight / 2 - (n.y + 50) * camera.scale; setCamera(); select('node', n.id);
  });
  $('overview-button').addEventListener('click', () => setDetail(false)); $('detail-button').addEventListener('click', () => setDetail(true));
  $('zoom-in').addEventListener('click', () => zoom(camera.scale * 1.2)); $('zoom-out').addEventListener('click', () => zoom(camera.scale / 1.2)); $('fit-button').addEventListener('click', fit);
  viewport.addEventListener('wheel', event => { event.preventDefault(); const rect = viewport.getBoundingClientRect(); zoom(camera.scale * Math.exp(-event.deltaY * .002), event.clientX - rect.left, event.clientY - rect.top); }, { passive: false });
  let drag = null, suppressClick = false;
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.zoom-controls') || event.target.closest('[data-edge]')) return;
    const node = event.target.closest('[data-node]');
    drag = { id: node?.dataset.node, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    drag.moved = true;
    if (drag.id) {
      const n = getNode(drag.id); n.x = Math.max(-10000, Math.min(10000, n.x + dx / camera.scale)); n.y = Math.max(-10000, Math.min(10000, n.y + dy / camera.scale));
      const el = $('node-' + n.id); el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; renderEdges();
    } else { camera.x += dx; camera.y += dy; setCamera(); }
    drag.x = event.clientX; drag.y = event.clientY;
  });
  function endDrag(event) {
    if (!drag) return;
    suppressClick = drag.moved;
    if (drag.moved && drag.id) save();
    if (!drag.moved && drag.id && event.type !== 'pointercancel') select('node', drag.id);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    drag = null; setTimeout(() => { suppressClick = false; }, 0);
  }
  viewport.addEventListener('pointerup', endDrag); viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('click', event => {
    if (suppressClick) return;
    const edge = event.target.closest('[data-edge]'); if (edge) select('edge', edge.dataset.edge);
    const node = event.target.closest('[data-node]'); if (node && event.detail === 0) select('node', node.dataset.node);
  });
  viewport.addEventListener('keydown', event => {
    if (event.target !== viewport) return;
    if (event.key === '+' || event.key === '=') zoom(camera.scale * 1.2);
    else if (event.key === '-') zoom(camera.scale / 1.2);
    else if (event.key === '0') fit();
    else if (event.key === 'Escape') { selection = null; applyHighlight(); renderInspector(); }
    else if (event.key.startsWith('Arrow')) { camera.x += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0; camera.y += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0; setCamera(); }
    else return; event.preventDefault();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause(); });
  let resizeTimer; new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fit, 80); }).observe(viewport);
  renderAll(); fit();
  if (storageWarning) { $('save-status').textContent = 'Revisa el guardado local'; toast(storageWarning); }
})();
