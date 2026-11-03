# Fontanería — Cómo funciona un inodoro — `inodoro.html`

Explicador interactivo **single-file**: corte lateral de un inodoro (cisterna +
taza) con una simulación física simplificada del llenado, la descarga y el sifón.
Mismo ADN que `../layout/widths.html` o `../graphics/camera.html`.

## Filosofía (no romper)

- **Un solo HTML**, vanilla JS en IIFE `'use strict'`. Sin build ni dependencias.
- **UI/contenido en español, comentarios de código en inglés.**
- Estética cream/blue. Agua siempre `--water`/`--water-deep`; cerámica
  `--ceramic`; plásticos `--plastic`; flotadores `--float`.
- Guiado por pasos (antes → durante → después) y cada paso explica la física de
  por qué se para o hasta dónde llega; los experimentos van al final.

## Cómo correr / verificar

- Servidor: config `fontaneria` en `../.claude/launch.json` (puerto 8131).
  URL: `/inodoro.html`.
- Se abre también con doble clic (`file://`): no carga nada externo.
- `window.inodoroSim` expone `{state, step, REC, goStep, seek}` solo para depurar
  (`seek(t)` coloca la reproducción en el instante `t` de la grabación): con la
  simulación en pausa se puede llamar `step(1/240)` en bucle y comprobar fases
  sin depender de `requestAnimationFrame` (que se ralentiza en pestañas ocultas).

## Dibujo — dos vistas a la misma escala de alturas

Dos SVG lado a lado dentro de `.views` (apilados en móvil): `#svgSide` (corte
lateral por el centro, viewBox x 20–720) y `#svgFront` (corte frontal, x 0–540).
**Comparten la coordenada y** (como un plano técnico): los niveles del modelo
(`tankY`, `bowlY`, `SEAL_Y`…) se pintan tal cual en ambas, sin conversión.

- La válvula de llenado está a un lado de la cisterna, fuera del plano del corte
  lateral: en `#svgSide` se dibuja como `.ghost` (gris y discontinua).
- La boya es un **flotador deslizante** sobre el cuerpo de la válvula (el modelo
  habitual en España). Su recorrido va de `setY` (tope superior: la altura de
  cierre ES su techo, porque la válvula cerrada frena la varilla) a
  `floatLow(setY)` (cuelga hasta `setY + FLOAT_DOWN`, sin pasar del fondo). En la
  vista frontal se dibujan la guía (`#railL/#railR`) y los topes
  (`#stopTop/#stopBot`), que se mueven con el ajuste; en reposo la boya se ve
  apoyada en el tope superior.
- Piezas: cualquier elemento con `class="part" data-part="x"` (puede haber uno
  por vista). Resaltado en dos niveles: `.on` (piezas del paso, suave) y
  `.hover` (término o pieza bajo el ratón, fuerte y pulsante). Las piezas que
  son huecos o rectángulos sin relleno llevan un `.hl-outline` para que el
  resaltado se vea.
- Etiquetas `LABELS` y marcas de nivel `MARKS` indican su vista (`S`/`F`);
  `crest`/`inlet` se dibujan en las dos (`crestF`/`inletF`).

## Layout — guía paso a paso

`| .viz (sticky): barra + SVG + fases + lecturas | .guide (sticky): pista de pasos + tarjeta + reproductor + Anterior/Siguiente |`
En ≤980px `.viz` y `.guide` pasan a `display:contents` y sus hijos se
reordenan con `order` (título → dibujo → pasos → lecturas); Anterior/Siguiente
quedan fijos abajo. Flechas ← → del teclado cambian de paso.

- **`STEPS`** (en el JS): 16 pasos agrupados por `ph`: `antes` (2), `durante` (5),
  `durante` incluye «¿por qué aguanta arriba?»; `despues` (5) y `extra` (4 experimentos). Cada paso tiene `title`, `html`,
  `phys {q, a}` (bloque «La física»: por qué se para algo o hasta dónde se
  vacía), `look` (qué mirar), `parts` (piezas resaltadas) y `marks` (líneas de
  nivel: `over`, `set`, `closeHalf`, `closeFull`, `crest`, `inlet`).
- **Modo `replay`** (antes/durante/después): al cargar se simula UNA descarga
  completa (`REC`, un fotograma por cada 1/240 s, y eventos `ev.press/prime/
  siphon/brk/closeStart/closed/fillEnd/end`). Cada paso reproduce un tramo
  `seg(ev)` a su `rate` (cámara lenta o acelerado) y lo repite en bucle, o
  congela un instante con `hold(ev)`. Los tramos se definen por eventos, no por
  segundos fijos: si cambias la física, se recolocan solos.
- **Modo `live`** (experimentos): simulación en vivo con `step()`; los botones
  `data-action` solo actúan en este modo. En replay, clicar el pulsador del
  dibujo salta al paso «Pulsas».

## Pestañas — pieza a pieza

Fila `#tabs` en la columna derecha: «Ciclo completo» (la guía `STEPS`, modos
`replay`/`live`) + una pestaña por pieza o concepto (`PARTS`, modo `part`):
llave de paso, boya y válvula, rebosadero, pulsador y obturador, media descarga,
borde, sifón, caudal y cebado, rellenado y sello, fuga.

- Cada `PARTS[i]` tiene `what`, `init`/`fin` (estado inicial y final), `phys`,
  `look`, `parts`, `marks`, `forces`, `zoom` y `variants`. Una variante es
  `{src | rec, seg(m), rate, label?, init?, fin?}`: `src: MAIN` reutiliza la
  grabación del ciclo; `rec` graba un escenario propio con
  `recordScenario({events:[[t, fn]], until, maxT, every})` (perezoso, se cachea
  en `v.cache`; marca `m.up/closed/siphon/brk/fillEnd/end`).
- Reproductor `#pplayer`: ⏮ estado inicial · ▶ reproducir · estado final ⏭ +
  barra. Al abrir muestra el estado inicial 1,3 s, reproduce una vez y se
  queda en el final. Las cajas `#stInit/#stFinal` se iluminan según la posición.
- `zoom: {S|F: [cx, cy, factor]}` → `setZoom` fija un viewBox objetivo con la
  misma proporción que el base y `stepZoom` lo suaviza cada frame. En modo pieza
  `.stage.focus-mode` atenúa las piezas que no son de la pestaña.
- En móvil, el reproductor va justo debajo del dibujo.

## Modelo físico (`step(dt)`, litros y segundos, substeps de 1/240 s)

Coordenadas SVG (y hacia abajo). Niveles en px; volúmenes con `A_T` (cisterna,
área constante) y `areaBowl(y)` (taza, tabla interpolada).

- **Válvula de llenado**: la boya flota en la superficie, entre sus topes
  (`setY` … `floatLow(setY)`). Cierra cuando la boya llega a `S.setY`; reabre con
  histéresis `HYST` (esto produce la «descarga fantasma» con fuga). Un
  `REFILL_FRAC` del caudal va a la taza por el tubo de rellenado.
- **Obturador** (campana con cámara de aire `CH_TOP..CH_BOT`): el pulsador pone
  `flushing` y lo despega despacio el primer 10 % (`lift<0.1`, se vence la presión);
  luego **flota**: su objetivo es la altura en la que empuje = peso
  (`FLOAT_EQ`), así que se queda contra el tope y, cuando el nivel alcanza la
  cámara, baja con el agua. Cerca del asiento (`target<0.25`) se cierra de golpe
  (succión de Bernoulli). La cámara está colocada para que se cierre en
  `FULL_CLOSE`. Media descarga: el flotador de ½ va enganchado con una varilla
  rígida y lo arrastra en cuanto el nivel pasa `closeAt` (`setY + 3 L`).
  `bellForces()` calcula presión/peso/empuje/tirón para el panel `#forces` y las
  flechas `#forceArrows` (pasos con `forces: true`). Caudal `K_FLUSH·√(altura+60)`.
- **Rebosadero** en `OVER_Y`: si la boya cierra por encima, rebosa sin parar.
- **Sifón**: sin cebar, la taza vierte por la cresta (`SEAL_Y`) como vertedero
  `CW·dh^1.5`. `S.prime` sube si ese caudal supera `Q_FREE` (lo que el tramo de
  bajada traga con aire) y se llena con `V_TRAP`; al llegar a 1 → sifón activo a
  `Q_SIPHON`. Se rompe cuando el nivel llega a `INLET_TOP` (gorgoteo, vuelve
  `FALLBACK` L a la taza). Sello = `INLET_TOP − nivel`, `PX_TO_CM` para mostrarlo.
- **Escala del dibujo (real)**: 7 px = 1 cm, suelo en y 660 (h cm → y = 660 − 7h),
  `PX_TO_CM = 1/7`. Medidas de un inodoro de tanque bajo típico: borde de la taza
  a 40 cm (y 380), tapa de la cisterna a ~76 cm, 66 cm de fondo (pared en x 700
  de la vista lateral), taza de 36 cm de ancho, hueco interior ~30 cm, cisterna
  37 × 16 cm por fuera. Cisterna: fondo interior `TANK_BOT` 345, rebose `OVER_Y`
  215, lleno `SET_DEFAULT` 229, cierre del obturador `FULL_CLOSE` 320 (6 L
  útiles, ~1,6 L de fondo muerto). Taza: agua en reposo `SEAL_Y` 500 (~23 cm del
  suelo, ~15 cm bajo el borde), sello de 5 cm (`INLET_TOP` 535). La tabla `AREA`
  se ajustó con la cresta en 469 y la boca en 543; `toOld()` remapea los niveles
  por tramos conservando el volumen de cada tramo, así que mover
  `SEAL_Y`/`INLET_TOP` no cambia el comportamiento (actualiza también
  `RISE_D`/`DESC_D`/`BOWL_D` y el SVG).
- **Fidelidad**: el modelo es un inodoro **sifónico** (Norteamérica); en Europa
  predominan los de **arrastre**. El paso «Sifón» lo aclara en una nota.

Constantes ajustadas para que: descarga completa y media ceben; un cubo de 5 L
de golpe cebe y despacio no; con < ~2,5 L en la cisterna ya no ceba; tras la
media descarga el tubo de rellenado devuelve la taza a la cresta. Si tocas
constantes, vuelve a comprobar esos escenarios.
