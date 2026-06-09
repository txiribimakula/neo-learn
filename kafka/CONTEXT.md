# Messaging Simulator — Project Context

## Qué es

Simulador educativo single-file (`kafka.html`) para enseñar visualmente cómo
funcionan los message brokers. Empezó como simulador de Kafka, ahora está
evolucionando para cubrir más alternativas (primer paso: Azure Service Bus
Queues). Vive junto al hermano `../kubernetes/scheduler.html` (mismo estilo
visual / vanilla JS).

**Filosofía:**
- Single HTML file, vanilla JS dentro de un IIFE en strict mode. Sin build, sin
  framework. Se abre con doble click o `python3 -m http.server`.
- Estética cream/blue del scheduler.html del proyecto vecino (`--bg`, `--card`,
  `--accent`, etc. en `:root`).
- UI en español, comentarios en código en inglés.
- Educational-first: cada decisión visual está pensada para que un viewer
  entienda qué está pasando.

## Layout

Cuatro columnas en `<main class="grid">`:

```
| Producers (280) | Topics minmax(360,1fr) | Consumer Groups (320) | REST APIs (280) |
```

Más capa SVG superpuesta (`#links`) para conectores curvos entre cards, y un
`#flyLayer` z-index 9999 para las bolitas animadas.

## Modelos soportados

### Kafka (maduro, todas las features)

- **Topic** con N **particiones**, cada una un log de mensajes con `nextOffset`.
- **Producer** con modos `rr` / `random` / `sticky` / `key (pool)`. El partitioner
  decide en cliente AT SEND TIME (cache de metadata, no roundtrip por mensaje).
- **Consumer Group** con N consumers, asignación de particiones via algoritmo
  `range`. Rebalance al añadir/quitar consumers o particiones.
- Ciclo del consumer: `fetch → process → commit` (3 fases, cada una con bolita
  ida/vuelta para fetch y commit, barra de progreso para process).
- Offset committed por (group, partición). Marcadores de offset visibles como
  triángulos abajo de cada partición.

### Azure Service Bus Queue (v1, inicial)

- **Queue** = lane lineal de mensajes (`topic.kind === 'sb-queue'`).
- Sin particiones expuestas. Producer ignora `mode` y simplemente appendea.
- **Competing consumers**: cualquier consumer (de cualquier group apuntado a la
  queue) compite por el siguiente mensaje no bloqueado.
- **Peek-lock**: el consumer toma el mensaje → `m.lockedBy = c.id`,
  `m.lockedUntil = now + 30s`. Tras procesar y commitear, el mensaje se ELIMINA
  de la queue (diferencia clave vs Kafka).
- Mensaje SB: `{id, seq, key, color, producerId, deliveryCount, lockedBy, lockedUntil}`.
- `dlq: []` está preparado pero vacío (no se llena en v1).

**v1 limitaciones intencionales:**
- Lock timeout NO se enforce (lockedUntil persistido pero no se chequea expiración).
- No DLQ por `maxDeliveryCount`.
- Sin sessions (no hay garantía de orden).
- Sin walkthrough step-by-step para SB consumers.
- Sin Topics+Subscriptions de ASB (solo Queues por ahora).

## Elementos del simulador

### Producers (columna 1)
- Color, nombre, sent counter, modo de partitioner, rate, toggle Auto.
- Botón ▶ (icono paper-plane SVG) + input N para enviar N mensajes manuales.
- Colapsables a nivel de SECCIÓN (un botón global ▼/▲ en el header), no per-card.
- Si N=1 + walkthroughMode=ON + topic kafka → walkthrough paso a paso.

### Topics (columna 2)
- Dos botones de creación: `+ Kafka topic` y `+ ASB queue`.
- Badge `K` o `Q` en el header de cada topic card.
- Kafka topic: layout horizontal con N filas de partición (label, log, next offset).
- SB queue: una sola lane "Queue" con los mensajes en cola.
- Mensajes con `data-msg-id` y `data-offset`, ring `.in-flight` cuando un consumer
  los tiene pillados.

### Consumer Groups (columna 3)
- Cada group lee de UN topic (Kafka o SB). Múltiples groups → cada uno con sus
  propios offsets (Kafka) o compitiendo en la pool (SB).
- Consumers dentro del group: nombre, dot color, badges de particiones asignadas
  (o "Queue" si es SB), lag count, processingMs stepper, proc-bar con phase.
- Drag-and-drop para reordenar consumers DENTRO del group.
- Toggle ▲/▼ para colapsar el group entero a vista lectora.
- Section "Acciones del grupo": lista de actions, botones `+ REST` y `+ Publish`.

### REST APIs (columna 4)
- Endpoint con nombre, color, processingMs, **réplicas** (stepper).
- Por cada réplica: panel con header + status text + cola de mini progress bars
  (una por request en curso, color del caller).
- Load balancer: random uniforme (fiel a kube-proxy iptables mode).
- **Penalización por contención**: si N requests caen en la misma réplica,
  cada una avanza a 1/N velocidad. Visible como bars lentas + texto "N× más lento".

## Acciones del consumer group

Cada group puede tener una lista `g.actions = []` que se aplica a TODOS sus consumers.

Tipos:
- **`{type:'rest', apiId}`** — durante la fase `process`, secuencialmente. Cada REST
  añade `2·LATENCY + api.processingMs` a la duración del process. Bolita request
  va consumer → api (color del consumer), bar de la api se llena durante la fase
  remote (color del api), bolita response vuelve.
- **`{type:'publish', topicId}`** — al confirmar commit, tras delay de
  `POST_COMMIT_PUBLISH_DELAY_MS` (280ms), cada consumer dispara UNA bolita desde
  SU card hacia la partición/queue destino. Conexión NO persistente — solo línea
  dashed efímera durante el vuelo (el consumer actúa como producer).

## Walkthrough mode

Toggle global "Paso a paso: ON/OFF" en la toolbar principal (`state.walkthroughMode`).

**Cuando ON:**
- Producer manual ▶ con N=1 sobre Kafka topic → walkthrough paso a paso explicando
  la decisión del partitioner. Notas pequeñas debajo de cada paso aclaran qué es
  cada valor (`counter(27) mod nº particiones(2) = índice(1)` + nota).
- Consumer de Kafka group → cada cycle se pausa step by step: poll, round-robin,
  last offset, FetchRequest, FetchResponse, Procesando, OffsetCommitRequest,
  OffsetCommitResponse. ✓ ancla arriba-derecha del log para clicks rápidos.
- Conector dashed marching-ants aparece cuando el partitioner decide la partición
  (producer) o desde el primer step (consumer).
- Step de ack final usa estilo verde para diferenciarlo.

**Cuando OFF:**
- Producer manual N=1 envía directamente.
- Consumer corre sin pausas (fetch ball → bar → commit ball → free → siguiente).
- Conectores estáticos solidos + dashed durante in-flight (mismo patrón visual).

**Para SB consumers el walkthrough se salta siempre** (no aplica el modelo Kafka).

## Estado en `state`

```js
state = {
  running: true, speed: 1,
  topics: [...],      // mix de kafka y sb-queue
  producers: [...],
  groups: [...],
  apis: [...],
  producersCollapsed: false,
  walkthroughMode: true,
};
```

Persistido en localStorage con clave `kafka-sim-v1`. Schema versionado en `serializeState`.
`hydrateFromParsed` tiene shims de back-compat (ej: `parsed.consumerWalkthrough`
se promueve a `walkthroughMode`; `c.action` legacy de consumer se promueve a
`g.actions` legacy).

Export/Import JSON via botones en toolbar.

## Funciones clave del runtime

- **`tick(dt)`** + **`renderLive()`** en cada RAF frame.
- **`produceMessage(p)`** → branchea por kind, llama a `deliverMessage` o `deliverSbMessage`.
- **`consumeForGroup(g, dt)`** → branchea por kind, llama a `consumeSbQueueForGroup`
  o ejecuta el loop Kafka (fetch/process/commit + gates de walkthrough + REST
  sub-phase crossings).
- **`phaseDuration(c, phase, g)`** → calcula duración total de la fase teniendo en
  cuenta REST actions del group.
- **`consumerSubPhase(c, g)`** → `{kind, actionIdx, api}` para saber en qué micro-fase
  está dentro del process (local / requesting / remote / responding / done).
- **`finalizeCommit(g, c)`** → avanza offset (o quita mensaje SB), limpia processing,
  agenda publish actions con setTimeout(POST_COMMIT_PUBLISH_DELAY_MS).
- **`reassign(g)`** → recomputa asignaciones (no-op para SB queue), diff con las
  anteriores → `c.rebalancedAt`, `c.rebalanceLog`, pill amber 4s.
- **`updateLinks()`** corre cada frame, repinta todo el SVG. Líneas estáticas sólidas
  + dashed marching-ants (`.walk-link`) para in-flight / walkthrough / rebalance.
- **`pickReplica(api)`**, **`releaseReplica(api, idx)`** → load balancer random uniforme.
- **`clearConsumerProcessing(c)`** → safety net: si tenía replica pillada, la libera.

## Animaciones

- **`flyAlong(p0, p3, color, durationMs, onArrival)`** — Bézier cúbica con
  control points horizontales (dx con signo). RAF loop con easing ease-out.
- **`spawnFly`** (producer→partition), **`spawnFetchFly`** (partition→consumer),
  **`spawnCommitFly`** (consumer→partition), **`spawnApiRequestFly`**, **`spawnApiResponseFly`**,
  **`spawnConsumerPublishFly`** (consumer→partition para publish), **`spawnConsumerPublishFlySb`**
  (consumer→queue), **`spawnSbFetchFly`**, **`spawnSbSettleFly`** (consumer→queue para complete),
  **`deliverSbMessage`** (producer→queue).
- Todas las duraciones escalan con `scaled(ms) = ms / state.speed`.

## Convenciones visuales

- **Sólida** = relación estable/configurada (Kafka producer sticky, Kafka
  partition→consumer assignment).
- **Dashed marching ants** (`.walk-link` + `@keyframes walk-march`) = conversación
  efímera o en curso (in-flight ball, walkthrough connector, rebalance ~2.5s).
- **Anillo `.in-flight`** en mensajes = consumer está procesando ESE mensaje
  (Kafka: offset reservado pero no comiteado; SB: peek-lock activo).
- **Badge K/Q** en topic header indica tipo.

## Archivos

- `kafka.html` — el simulador.
- `kafka-sim-*.json` — exports (.gitignore o no, lo decide el usuario).
- `CONTEXT.md` — este archivo.

## Estado actual y deudas técnicas

**Funciona bien:**
- Todo el flujo Kafka completo (producer, partitioner, consumer group, rebalance,
  offsets, REST actions, contention, replicas, publish actions, walkthrough).
- SB Queue básico (producer, consume con competing consumers, peek-lock visual,
  Complete elimina el mensaje, publish actions hacia SB también).

**Pendiente / sería el siguiente paso natural:**
- Enforce de lock timeout en SB (lockedUntil expira → mensaje vuelve a estar visible,
  deliveryCount++). Cuando > maxDeliveryCount → DLQ.
- Visualizar la DLQ.
- Sessions opcionales en SB (`SessionId` en el mensaje + un consumer por session).
- SB Topics + Subscriptions (pub-sub con filtros).
- Walkthrough específico para SB consumers (Receive + Complete, no commit-de-offset).
- Posible refactor a B (multi-file: kafka.html + .css + .js) o C (ES modules)
  cuando el monolito moleste más. Por ahora aguanta.

## Conversación con el usuario

- Habla en español.
- Prefiere respuestas concisas, "información clave y relevante, sin enrollarse".
- Si hay dudas de diseño, exponer trade-offs y dejar que decida.
- Para cambios grandes: explicar plan antes, esperar OK.
- No usar emojis salvo que los pida.
- No crear MD ni docs salvo que los pida explícitamente.
