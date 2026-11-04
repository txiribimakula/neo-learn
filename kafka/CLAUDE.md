# Messaging Simulator — `kafka.html`

Simulador educativo **single-file** para enseñar visualmente cómo funcionan los
message brokers. Empezó como simulador de Kafka; ahora cubre también **Azure
Service Bus Queues** y la idea es seguir añadiendo modelos. Hermano de
`../kubernetes/scheduler.html` y `../graphics/camera.html` (mismo estilo).

## Hermano: `tapper.html` (Kafka en el bar)

Comparativa Kafka vs Azure Service Bus que imita la pantalla del arcade Tapper; de
momento solo está Kafka. Es otra página de un solo HTML y no comparte código ni
estética con `kafka.html`.

- **Pantalla:** la escena ocupa toda la ventana. Controles y explicación son dos paneles
  laterales (`.drawer`) que salen por encima con una pestaña, y se cierran con Escape.
- **Sin textos en la escena:** Pablo quiere probar si se entiende sola, así que no hay
  marcador, rótulos, números ni carteles; esos datos están en los paneles. La única excepción es
  el letrero «QUEUER» de la pared del fondo, que es el nombre del restaurante. La clave de cada
  mensaje es el color del comensal (en el código sigue siendo una letra, y `KEY_NAMES` la
  traduce en el panel).
- **Aspecto:** paleta sacada de la pantalla original (`PAL`), figuras a 2x con contorno
  negro y cocinas con fuego en lugar de barriles. No uses el logotipo de la cerveza del
  original.
- **Escena de izquierda a derecha:** comedor con 3 mesas de color liso,
  hilos y cocineros. De arriba abajo: hilo de comandas partición 0, mostrador de platos,
  hilo de comandas partición 1. Los dos hilos miden lo mismo y no tienen barra debajo. Las
  cocinas están contra la pared derecha.
- **Solo las comandas son Kafka:** cuelgan con pinzas del hilo y siguen ahí tras leerlas.
  El mostrador central es una cola normal: el plato desaparece al recogerlo.
- **Analogía:** camarero con bloc = producer; color del comensal = clave del mensaje, que
  fija siempre el hilo; comanda = mensaje con un solo plato; 2 hilos = particiones de
  `comandas`; cocineros = grupo `cocina`.
- **Un color es un comensal:** no puede estar dos veces en el comedor, y las 6 personas se
  turnan en las 3 mesas, así que para entrar hace falta una libre. Cada visita es un
  menú de 1 a 4 mensajes, uno por plato y siempre en orden: primero, segundo, postre y
  café. La cabecera de la comanda y el propio plato son del color del comensal, sin más números que
  el offset bajo la comanda. Cada color conserva su orden dentro de su hilo, así que
  el postre nunca llega antes que el primero.
- **Recorrido:** el comensal entra y se sienta; un camarero con bloc le toma nota en la
  mesa, va al borde izquierdo del hilo de ese color, manda las comandas y vuelve. Uno
  con bandeja va hasta el plato, pone la bandeja debajo (el mostrador tiene su misma altura)
  y se lo lleva, de uno en uno.
  El comensal los come por orden de llegada,
  con su menú en iconos sobre la cabeza que se apagan al comer, y solo entonces se va.
- **Plantilla fija:** 1 camarero con bloc y 1 con bandeja, siempre visibles y siempre con
  ese objeto en la mano. Nunca aparecen de la nada: esperan en su sitio y, si están
  ocupados, el comensal espera.
- **El cocinero se mueve por cada mensaje:** se pone justo debajo de la comanda, de espaldas
  a nosotros y mirando hacia arriba, para leerla; vuelve a la cocina, cocina, va a la barra del
  medio para dejar el plato y vuelve (cada cambio de fila copia las capturas de Tapper que pasó
  Pablo: piernas cruzadas como en el original, inclinado y con brazos de corredor, sale casi al instante y deja unas
  volutas claras donde estaba) y regresa al mismo sitio para confirmar (commit): levanta un sello, da un saltito y lo
  aprieta contra la comanda en lo más alto, con un brazo de codo y largo fijo. La marca se
  queda en la comanda. Sin textos en la escena para estas acciones. Si sale del grupo entre
  el plato y el commit, otro la recocina y sobra un plato: es at-least-once. Fuera del
  grupo sigue visible al lado de su sitio. `BASE_SPEED` fija la velocidad de x1.
- **Cocina:** al cocinar solo se enciende el fuego de arriba; el horno nunca se ilumina, para
  que no parezca que lo que hay dentro se está asando.
- **Guiño a Tapper:** un cocinero que lleva un rato parado (1,5-14 s de simulación seguidos,
  tras un margen de 1,5 s) se toma una caña y se limpia el bigote; volver a trabajar reinicia
  la espera. Si sigue parado, la siguiente tarda 18-40 s. Nunca los dos a la vez, y entre una
  y otra pasan al menos 5 s.
- **El horno:** a veces, en vez de la caña (`OVEN_CHANCE`), un cocinero parado ve temblar la
  puerta un instante, la abre, salen tentáculos cortos de golpe o una pata de gato que intenta arañarle (`CAT_CHANCE`), fuera lo que duran 3 zarpazos (arriba, abajo, arriba), retrocede lo bastante para que
  no le toquen y la cierra. Cerrar es lo inverso de abrir: se acerca, coge la puerta y avanza
  con ella en la mano (`ovenBodyOffset`). No significa nada en Kafka: es
  un chiste, y comparte las reglas de la caña para no solaparse con ella.
  Solo ocurren de forma natural: no hay manera de pedirlos desde el panel.
- **Comensal impaciente:** tras `IMPATIENT_S` sin comida tiene brotes de unos segundos
  (`FIT_S`, separados por `CALM_S`) en los que se pone rojo y da puñetazos en la mesa, con el
  codo apoyado, en recuerdo de los clientes del original. Es el coste del lag visto desde la mesa:
  debe ser raro con el ritmo normal y frecuente con un cocinero lento.
- **Parados pero vivos:** cada persona respira, parpadea y, cocineros y comensales, mira de
  reojo, con un ritmo propio (`breathLift`, `isBlinking`, `isGlancing`) para que no se muevan
  a la vez. Va con el tiempo de simulación, así que se detiene en pausa.
- **Lo que no hay que perder:** leer no borra (la comanda se apaga y solo cae por
  retención), cada hilo tiene un solo dueño y el triángulo marca el offset
  confirmado, que sobrevive al rebalance.
- **Población cerrada:** con 3 mesas, el lag total no pasa de 12, así que la retención (20)
  no llega a borrar nada sin leer. Por simplicidad, además, solo borra lo ya confirmado.
  Para enseñar esa pérdida haría falta otra fuente de mensajes.
- **Código:** el modelo va antes del marcador `// initial`, sin DOM, y lo prueba
  `node --test tapper.test.cjs`. Detrás van el dibujo (canvas de 730×420 ampliado
  sin suavizado) y el panel.
- **Simplificaciones:** retención por número de mensajes (20 por hilo), hash de la
  clave simplificado y una comanda en curso por partición.
- **Verificar:** con la pestaña oculta el `requestAnimationFrame` va a ~1 fps y la
  simulación casi no avanza. Sustituye `requestAnimationFrame` y `performance.now`
  antes de cargar el script para avanzar el reloj a mano. Si reescribes la página con
  `document.write`, el script anterior sigue vivo y también actualiza el panel: fíate solo
  del canvas, y comprueba el panel en una carga limpia.

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
