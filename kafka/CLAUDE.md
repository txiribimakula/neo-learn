# Messaging Simulator — `kafka.html`

Simulador educativo **single-file** para enseñar visualmente cómo funcionan los
message brokers. Empezó como simulador de Kafka; ahora cubre también **Azure
Service Bus Queues** y la idea es seguir añadiendo modelos. Hermano de
`../kubernetes/scheduler.html` y `../graphics/camera.html` (mismo estilo).

## Filosofía (no romper)

- **Un solo HTML**, vanilla JS dentro de un IIFE en `'use strict'`. Sin build, sin
  framework, sin dependencias. Se abre con doble clic o `python -m http.server`.
- Estética cream/blue (`--bg`, `--card`, `--accent`… en `:root`).
- **UI en español, comentarios de código en inglés.**
- Educational-first: cada decisión visual existe para que se entienda qué pasa.
  Fidelidad al comportamiento real del broker por encima de la comodidad de
  implementación (los walkthroughs explican internals con precisión).

## Cómo correr / verificar

- Servidor: config `kafka` en `.claude/launch.json` (`python -m http.server 8123`).
- Verificar con las tools `preview_*`. **Nota del entorno:** la pestaña de preview
  suele estar oculta → Chromium *throttlea* `requestAnimationFrame`, así que las
  bolitas (`flyAlong`) y el `loop()` no avanzan. Verifica el DOM estático y la
  lógica con `preview_eval`; los screenshots de animación pueden no capturar
  estados en vuelo. `state` vive en un closure (no es global) — no es accesible
  desde `preview_eval`; condúcelo por la UI (clicks/inputs).

## Layout

`<main class="grid">` con cuatro columnas + capa SVG de conectores (`#links`,
con `pointer-events:none`) + `#flyLayer` (bolitas) + `#walkLayer` (paneles de
paso a paso flotantes).

```
| Producers | Brokers (topics/queues) | Consumer Groups | REST APIs |
```

El header dice **"Producers · Brokers · Consumers"** y la columna central
**"Brokers"** (genérico para Kafka topics + ASB queues).

## Modelos

### Kafka
- **Topic** con N **particiones** (`{messages, nextOffset, earliestOffset, flashUntil}`).
- **Producer**: modos `rr`/`random`/`sticky`/`key`. Partitioner decide en cliente
  at-send-time. Puede **fan-out a varias colas/topics**: `producer.topicIds` es un
  **array** — el mismo mensaje se publica a todos los destinos (una bolita por destino).
- **Consumer Group**: N consumers, asignación `range`, rebalance al añadir/quitar.
- Ciclo: `fetch → process → commit`. Offset committed por (group, partición).
- **Vaciar partición**: botón papelera por partición = `DeleteRecords` (borra
  mensajes, sube `earliestOffset` a `nextOffset`; offsets monótonos, no se
  reinician; consumers rezagados se fast-forwardean = pérdida de datos, fiel).

### Azure Service Bus Queue (`topic.kind === 'sb-queue'`)
- **Queue** = lane lineal (`topic.messages`), sin particiones.
- **Competing consumers** con **peek-lock** (`m.lockedBy`, `m.lockedUntil`,
  `m.deliveryCount`). Al hacer Complete el mensaje se **elimina** (vs Kafka).
- Conexión modelada como AMQP persistente y silenciosa en reposo (vs Kafka =
  TCP persistente + poll-loop continuo). Esto está en los tooltips de conectores.
- `dlq` preparado pero no se llena. Lock timeout no se enforce. Sin sessions.

**Kafka y SB NO comparten campos en la UI** (es un principio): consumer row,
group meta, topic card, producer card, walkthrough… todo se bifurca por `kind`.
SB usa "Receiver / peek-lock / seq / entrega #N"; Kafka usa "partición / offset /
lag / rebalance".

## Tiempos de procesamiento (sistema clave)

- **Producer estampa** `msgProcessingMs` en cada mensaje que produce (`m.processingMs`),
  visible como chip dentro del cuadrado del mensaje.
- **Consumer**: el tiempo de proceso local vive **a nivel de GRUPO** (`g.processingMs`,
  `g.followMsgTime`), no por consumer. Toggle `⏱ msg`: si ON, el grupo tarda lo que
  diga `m.processingMs`; el stepper de tiempo fijo **desaparece** cuando está ON.
- **REST API**: tiempo + `⏱ msg` viven en el API y aplican a **todos los callers por
  igual** (`api.processingMs`, `api.followMsgTime`).
- **Pin de réplica por (api, grupo)**: se edita en la **acción REST del grupo** (el
  caller), no en el API. Se guarda en `api.groupOverrides[groupId].replicaIdx`
  (`null` = auto/k8s-random). `pickReplica(api, g, c, action)` lo respeta; clamp a
  auto si la réplica deja de existir.
- **Override REST por consumer** (encima de las acciones del grupo): el grupo define
  la **lista ordenada** de acciones REST; cada consumer puede redirigir una llamada
  concreta a **otra API** y/o **fijar réplica**, guardado en
  `c.restOverrides[actionId] = {apiId?, replicaIdx?}` (campos ausentes/`null` =
  heredan del grupo). Se edita en la fila del consumer (bloque `.consumer-routing`,
  una línea por acción REST del grupo). Resolución: `resolveActionApi(c, action)` (qué
  API llama de verdad) y `pickReplica` con prioridad consumer-pin → group-pin (solo si
  NO redirige; redirigir resetea a auto) → aleatorio. Limpieza: `pruneConsumerOverrides(g)`
  al quitar acción/API; clamp de pins al reducir réplicas.
- Resolución de tiempos: `effectiveConsumerLocalMs(c,g)` y `effectiveApiMs(api,c,g)`
  centralizan "follow-msg-time o valor fijo", con fallback si el mensaje no estaba
  estampado.

## REST APIs + réplicas

- N réplicas por API (`api.replicas`, `api._replicaState[i].inflightCount`).
- `pickReplica` aleatorio (estilo kube-proxy) salvo pin por grupo o por consumer.
- **Penalización de concurrencia super-lineal** (thrashing): `slowdown = N^1.35`
  (`concurrencySlowdown(n)`, `CONCURRENCY_EXPONENT`). Con N reqs en una réplica
  cada una avanza a `1/N^1.35` → concurrente es **peor** que secuencial (N=2 ≈ +27%,
  N=3 ≈ +47%). El status de la réplica muestra el factor.
- El conector consumer→API **no es permanente**: solo línea discontinua mientras
  hay una request en vuelo (HTTP stateless). Sin lista de "quién llama".

## Paso a paso (walkthrough)

- Modo educativo (toggle "Paso a paso"). Producers y consumers explican cada fase
  con pasos y un botón ✓ para avanzar.
- Kafka: `poll → FetchRequest → FetchResponse → process → OffsetCommit → ack`.
- SB: `Receive → peek-lock/transfer-frame → process → Complete → settle`
  (funciones `computeSbReceiverDecision`, `beginSbReceiverWalkthrough`,
  `finalizeSbComplete`).
- Los paneles de log **flotan fuera del card** en `#walkLayer` (top-level, sobre
  todo el resto). `ensureWalkPanel(key, anchorEl)` los crea/posiciona; `renderLive`
  los recoloca cada frame (a la derecha del row, o debajo si se sale; cascada
  anti-solape; no cruzan la columna de APIs). Click-to-front por z-index.

## Conectores (`updateLinks`)

- Producer→partición (sólido, solo sticky) / →queue (discontinuo in-flight).
- Partición→consumer y queue→receiver: **sólidos** (la conexión TCP/AMQP siempre
  viva). Tooltip al hover explica el modelo de conexión (path transparente ancho
  de 16px encima para captar el hover pese a `pointer-events:none` del SVG).
- Consumer→API: discontinuo solo durante la request.

## Persistencia

- `localStorage`, debounce ~600ms (`scheduleSave`). `STORAGE_KEY`. Export/Import JSON.
- Hidratación tolerante con migraciones: `producer.topicId`→`topicIds`,
  tiempo de consumer per-consumer→per-grupo, tiempo de acción REST→`api.groupOverrides`,
  `api.groupOverrides` ahora solo guarda `replicaIdx`. `c.restOverrides` se persiste y
  rehidrata por consumer (default `{}`).

## Convenciones al editar

- Mantén el split Kafka/SB: si tocas algo de consumer/topic/producer, pregúntate
  si aplica a un solo `kind` y bifurca.
- IDs numéricos (`newId()`). Colores de `PALETTE`.
- Tras cambios, verifica en preview que no hay errores de consola y que el DOM
  esperado existe (recuerda el throttling de RAF en pestaña oculta).
