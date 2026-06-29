# Layout — Reparto de anchos — `widths.html`

Explicador interactivo **single-file** de cómo los controles de una UI deciden
cuánto ancho ocupan. Hermano de `../graphics/camera.html`, `../kafka/kafka.html`
y `../kubernetes/scheduler.html` (mismo ADN: single HTML, vanilla JS, español).

## Filosofía (no romper)

- **Un solo HTML**, vanilla JS en IIFE `'use strict'`. Sin build ni dependencias.
- **UI/contenido en español, comentarios de código en inglés.**
- **Contenido y UI en INGLÉS** (cambio del usuario); comentarios de código en inglés.
- Estética cream/blue. Code-color por **modo de ancho**, consistente en TODA la
  página: **morado = Max, ámbar = Fixed, azul = Percent, verde = Remaining**
  (`--full`/`--fixed`/`--percent`/`--remain`). (`mode` interno = `full`/`fixed`/
  `percent`/`remain`.)
- Muy visual: se entiende jugando, no leyendo.

## Idea pedagógica central

Los cuatro modos **son flexbox**. Cada modo = una receta de la propiedad `flex`
(grow shrink basis):

| Modo (UI) | `mode`    | `flex`        | Significado                       |
|-----------|-----------|---------------|-----------------------------------|
| Max       | `full`    | `0 0 100%`    | fila entera para él solo          |
| Fixed     | `fixed`   | `0 0 {px}px`  | píxeles exactos, no escala        |
| Percent   | `percent` | `0 0 {pct}%`  | fracción del contenedor, escala   |
| Remaining | `remain`  | `1 1 0`       | se queda el hueco libre           |

El panel de código (izquierda) revela **en vivo** el `flex` de cada control,
agrupado por fila, para copiarlo tal cual a un formulario real.

## Empaquetado de filas — NO es flex-wrap automático

`computeRows()` empaqueta las filas a mano (no usamos `flex-wrap`) para poder
imponer reglas que flexbox solo no permite. Cada fila se renderiza como su propio
`.row` (`display:flex`). Reglas:

- **Max** siempre va solo en su fila.
- **Remaining** es SIEMPRE el último elemento de su fila y **la cierra**: nada puede
  ir detrás. Solo formas válidas: `[remain]` o `[fixed, remain]` (un único fixed
  delante). Un percent, un 2º fixed o un 2º remaining → fila nueva. En
  `computeRows()`: `if(hasRemain) join=false` (sella la fila) + tope de un fixed
  antes del remaining (`hasPercent || fixedCount>1`).
- **Fixed/Percent** se empaquetan de izq. a der. mientras quepan
  (`basis + gaps ≤ ancho interior`); si no, hacen wrap.

Regla del remaining, por petición iterativa del usuario: «un remaining solo puede
estar al final; si hay un remaining esa fila queda completa».

## Cómo correr / verificar

- Servidor: config `layout` en `../.claude/launch.json`
  (`python -m http.server 8125 --directory layout`). URL: `/widths.html`.
- `state` vive en closure (no global): `{items, selId, containerW, gap, seq}`.
  Cada item = `{id, name, mode, px, pct}`. Condúcelo por la UI desde `preview_eval`.

## Layout — sticky viz + narrativa

```
| .viz (sticky, 2/3): banco de pruebas | .narrative (scroll, 1/3): 6 steps |
```

- **Izquierda `.viz`**: toolbar (añadir / vaciar / presets / sliders de
  contenedor y separación) → `.frame-wrap`/`.container` redimensionable (el ancho que
  repartimos) → `.inspector` y `.code`, ambos en **paneles colapsables** (`.panel`
  con `.panel-head`; clic alterna `.collapsed`) para liberar alto y ver más
  controles. El slider **«contenedor»** es clave: enseña que Fijo no se mueve,
  Porcentaje escala y Restante absorbe el cambio.
- **Cadena de alturas**: `.viz` y `.viz-inner` usan `height:100vh` (NO `100%` en
  viz-inner: el `%` no resolvía contra el grid item sticky y la cadena flex
  `stage → frame-wrap` no crecía). Con altura definida, al colapsar los paneles el
  `.frame-wrap` (flex:1) absorbe el espacio. Nota: el iframe de preview resuelve mal
  `vh` (sale ~342 con innerHeight 730) → verifica forzando `viz-inner.style.height
  = innerHeight`.
- **Derecha `.narrative`**: 6 `section.step` (máximo → fijo → porcentaje →
  restante → reparto en fila → "esto es flexbox"). Botones `.try[data-preset]`
  cargan ejemplos en el banco.

## Detalles que importan al editar

- **`measure()`** lee el ancho real renderizado (`getBoundingClientRect`) y rellena
  los badges `{px · %}`. El `.container` tiene `transition: width` → tras mover el
  slider de contenedor hay que **re-medir en `transitionend`** (ya está cableado);
  si quitas la transición, quita también ese listener.
- Las filas (`.container` en `flex-direction:column`) llevan **gap vertical fijo de
  26px** para que el badge `.wb` (cuelga `bottom:-9px`) **no se solape** con la
  fila siguiente. El slider «gap» es solo horizontal (separación entre campos de
  una fila). Si tocas el tamaño del badge, revisa esa holgura.
- `gap` (horizontal) se resta del espacio disponible en `computeRows()` → con gap > 0,
  dos al 50% ya no caben en una fila y bajan. Es comportamiento real, no un bug;
  por defecto `gap=0` para que «50/50» llene exacto.
- Presets en `PRESETS` (`5050`, `labelfield`, `search`, `form`, `full3`). Arranca
  en `labelfield` (etiqueta fija + campo restante), el ejemplo más ilustrativo.
- Respeta el code-color por modo en cualquier elemento nuevo.
- Proyecto en evolución iterativa con revisión del usuario: propón y espera
  feedback antes de grandes añadidos.
