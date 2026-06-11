# Graphics — Cámaras, Viewports y Coordenadas — `camera.html`

Explicador interactivo **single-file** de gráficos: cómo un punto viaja del
**espacio de mundo** → **espacio de cámara** → **espacio de pantalla (viewport)**,
en formato **scrollytelling**. Hermano de `../kafka/kafka.html` y
`../kubernetes/scheduler.html` (mismo ADN: single HTML, vanilla JS, español).

## Filosofía (no romper)

- **Un solo HTML**, vanilla JS en IIFE `'use strict'`. Sin build ni dependencias.
- **UI/contenido en español, comentarios de código en inglés.**
- Estética cream/blue. Code-color de espacios consistente en TODA la página:
  **verde = mundo, ámbar = cámara, azul = pantalla** (`--world`/`--camera`/`--screen`).
- Muy visual e intuitivo: se entiende mirando, no leyendo.

## Cómo correr / verificar

- Servidor: config `graphics` en `../kafka/.claude/launch.json`
  (`python -m http.server 8124 --directory ../graphics`). URL: `/camera.html`.
- `state` vive en closure (no global). Condúcelo por la UI desde `preview_eval`.

## Layout — scrollytelling

```
| .viz (sticky, 2/3) | .narrative (scroll, 1/3) |
```

- **Izquierda `.viz`** (`position:sticky; height:100vh`): se queda fija. Contiene
  arriba el **lienzo de mundo** (`#worldCanvas`, vista de dios), abajo el **lienzo
  de pantalla** (`#screenCanvas`, lo que se renderiza), y un `#overlay` para los
  conectores cámara→pantalla. Arriba, **miniaturas de escena** + controles
  (viewport, zoom, ajuste).
- **Derecha `.narrative`**: secciones altas (`section.step`, ~88vh). Un
  `IntersectionObserver` (banda central) marca el `activeStep`.

## Cómo funciona la transición por scroll

- Cada step tiene un objetivo de parámetros de animación en `STEP` (objeto
  `A` = `{camOp, conn, screenFill, sub, origin, bars, autozoom}`). En `tick()` se
  **interpolan suavemente** hacia el step activo cada frame → al hacer scroll se
  ve aparecer la cámara, los conectores de proyección, el origen, etc.
- Steps: `intro · world · camera · camtransform · screen · aspect · zoom · summary
  · multi`. Los bloques `.tech` muestran **fórmulas con números vivos**
  (`updateReadouts` rellena los ids `wWx`, `tCam`, `sScreen`, `fWorld`…).

## Escenas y cámaras (concepto clave)

- `SCENES` = mapa de escenas dibujadas proceduralmente (`pueblo` ancha, `torre`
  alta, `isla` cuadrada) — **tamaños de mundo distintos** a propósito.
- **Cada escena tiene su PROPIA cámara** (`SCENES[k].cam`, lazy vía `ensureCam`).
  No hay cámara global. La escena activa = `state.sceneKey` (1ª seleccionada).
- Geometría parametrizada: `camH(cam)`, `camLeft(cam)`, `camTop(cam)`,
  `clampCamera(S,cam)`, `godFitRect(S,x,y,w,h,fill)`, `viewTransformFor(cam,vw,vh,fit)`.

## Selección de escenas + grid de pantallitas

- 3 **miniaturas** clicables arriba (`.scene-thumb`, mini-render real de cada escena).
- **Clic** = selecciona una (single, pipeline completo). **Ctrl/Shift+clic** = añade
  varias → **modo grid** (`state.selected` Set, `multiMode()`).
- En modo grid: el mundo y la pantalla se dividen en celdas; **cada celda es un
  sistema independiente** (su mundo + su cámara + su viewport — "varias pantallitas
  dentro de la pantalla"). `renderWorldGrid` / `renderScreenGrid` + `worldCells`/
  `screenCells` para hit-testing. Arrastrar/zoom en una celda **no afecta** a las demás.
- Sección `08 · multi` de la narrativa explica el concepto (split-screen, minimapa,
  cámaras de seguridad, editor con varias vistas).

## Interacción

- Arrastrar cámara/ancla en cualquiera de los dos lienzos; panear desde pantalla
  (transformación inversa); rueda = zoom. Todo enrutado por celda en modo grid
  (`worldTargetAt`/`screenTargetAt`). Selectores de viewport, zoom, ajuste
  (letterbox/estirar/cover).

## Convenciones al editar

- Respeta el code-color de espacios (verde/ámbar/azul) en cualquier elemento nuevo.
- Geometría siempre parametrizada por `(S, cam)` — nunca reintroducir cámara global.
- Canvas con DPR (`setupCanvas`); `layout()` redimensiona en `ResizeObserver`.
- El proyecto está en evolución iterativa con revisión del usuario: propón y espera
  feedback antes de grandes añadidos.
