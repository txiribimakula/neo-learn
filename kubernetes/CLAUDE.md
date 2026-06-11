# Kubernetes Scheduler Simulator — `scheduler.html`

Simulador educativo **single-file** del scheduler de Kubernetes: cómo se colocan
pods en nodos según **taints/tolerations**, **capacidad / bin-packing**, y cómo
**KEDA** autoescala (incluido scale-to-zero) a lo largo de una semana horaria,
con **reporte de coste** y **escenarios** guardables. Hermano de
`../kafka/kafka.html` y `../graphics/camera.html`.

## Filosofía (no romper)

- **Un solo HTML**, vanilla JS, sin build ni dependencias. Doble clic o
  `python -m http.server`.
- Estética cream/blue (`:root` con `--bg`, `--card`, `--accent`…), tipografía
  system-ui, fondo con radial-gradients.
- **UI en español, comentarios de código en inglés.**
- Educational-first y fiel al comportamiento real del kube-scheduler.

## Cómo correr / verificar

- Servidor: config en `.claude/launch.json` (`python -m http.server`).
- Verificar con `preview_*`. El estado global vive en `S` (objeto `initialState()`).

## Modelo de dominio

- **Pod types** (`S.podTypes`): plantilla con `request` (CPU), tolerations, color,
  y un **perfil horario** de réplicas deseadas (`buildHourly`, editor por día/hora).
  KEDA = `desiredReplicas(t, day, hour)`; `SCALE_TO_ZERO_MS` para bajar a 0.
- **Nodos** (`S.nodes`): `capacity` (CPU por instancia), `maxReplicas` (instancias
  del nodepool), `taints[]`. Arrancan/paran con `NODE_BOOT_MS`/boot timers.
- **Pods** (`S.pods`): instancia con `typeId`, `location` (nodo), fase
  (`Pending/ContainerCreating/Running/Terminating`), timers de arranque/parada.
- **Reloj** semanal: `S.day` (0–6) × `S.hour` (0–23) = 168 slots. `weekSlot()`.

## Pipeline del scheduler (fiel a kube-scheduler)

1. **Filtros** (`passesFilters` / `nodeFits`): taints vs tolerations
   (`tolerates`, `tolerationMatchesTaint`), capacidad disponible
   (`fitsInReadyInstances`, bin-packing en instancias ready vía `packNode`).
2. **Scoring** (`scoreNodeResources`, `MAX_NODE_SCORE = 100`): reparte/llena según
   recursos. El nodo ganador recibe el pod.
3. **Binding** + animación FLIP (`capturePodRects` → `placePods` → `playFlip`).
- `evictForTaints` desaloja pods que dejan de tolerar; `enforceNodeCapacity`
  corrige sobre-asignación.

## Coste y escenarios

- `computeWeekCost` / `planInstancesAt` / `costForConfig`: coste semanal según
  instancias activas hora a hora. `CURRENCY = '€'`. Reporte en modal (`openCostReport`).
- **Escenarios**: snapshot de config (`snapshotConfig`/`applyConfig`) guardado en
  `localStorage` (`SCENARIOS_KEY`). Guardar/cargar/borrar/comparar/export-import JSON.

## Bucle de simulación

- `startSim`/`stopSim`/`togglePlay`, velocidades en `SIM_SPEEDS`.
- `simAdvance` → avanza el slot horario; `simSettleThenNext` deja "asentar" la
  colocación antes del siguiente tick (`isSettling`/`setSettling`).
- `reconcile()` = re-evalúa colocaciones; `fullRender`/`renderAll` repintan.

## Render

- `renderPodTypes`, `renderNodes`, `makePodEl`/`refreshPodEl`, `makeHourlyEditor`
  (editor del perfil KEDA), `buildDaySelector`, `renderSubtitle`.
- Drag&drop de pods a la cola (`setupQueueDrop`). Animaciones FLIP con `#flyLayer`.
- Helpers UI: `makeNum` (steppers), `money`, `escapeHtml`/`escapeAttr`, `uid`.

## Constantes a conocer

`CPU_UNIT`, `DEFAULT_MAX_REPLICAS`, `POD_START_MS`, `NODE_BOOT_MS`,
`POD_TERMINATE_MS`, `SCALE_TO_ZERO_MS`, `HOURS_PER_WEEK = 168`,
`WEEKS_PER_MONTH ≈ 4.333`, `COLORS`.

## Convenciones al editar

- Estado en `S` (no closures dispersos). IDs con `uid(prefix)`.
- Mantén la fidelidad al pipeline real (filtro→score→bind) al tocar scheduling.
- Tras cambios, verifica en preview sin errores de consola.
